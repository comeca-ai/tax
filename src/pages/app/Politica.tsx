import { useCallback, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Bot,
  Building2,
  Check,
  CirclePlus,
  FileText,
  History,
  PencilLine,
  Power,
  PowerOff,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react"
import { Link } from "react-router"
import { toast } from "sonner"
import { trpc } from "@/providers/trpc"
import { useActiveCompany } from "@/hooks/useActiveCompany"
import { useAuth } from "@/hooks/useAuth"
import {
  regrasPoliticaSchema,
  STATUS_POLITICA_LABELS,
  type PolicyExtracao,
  type RegrasPolitica,
  type StatusPolitica,
} from "@contracts/types"
import { Skeleton } from "@/components/ui/skeleton"
import { fileParaBase64 } from "@/components/despesas/arquivo"
import { formatDataHora } from "@/components/despesas/meta"
import PoliticaUploadStep, {
  type PoliticaUploadItem,
} from "@/components/politica/PoliticaUploadStep"
import PoliticaRegrasStep from "@/components/politica/PoliticaRegrasStep"
import PoliticaResumo from "@/components/politica/PoliticaResumo"
import SimuladorPolitica from "@/components/politica/SimuladorPolitica"
import {
  formFromRegras,
  regrasFromForm,
  type RegrasForm,
} from "@/components/politica/regrasForm"
import { semAutorizacaoDeAprovacao } from "@/components/politica/regrasExtraidas"
import { cn } from "@/lib/utils"

const PASSOS = [
  { numero: 1, rotulo: "Enviar documento" },
  { numero: 2, rotulo: "Revisar regras" },
  { numero: 3, rotulo: "Simular e ativar" },
] as const

function StepIndicator({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {PASSOS.map((passo, i) => (
        <li key={passo.numero} className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full font-mono text-[12px] font-semibold tabular transition-colors",
              step > passo.numero
                ? "bg-brand-500 text-white"
                : step === passo.numero
                  ? "bg-brand-500/10 text-brand-500 ring-1 ring-brand-500/40"
                  : "bg-paper text-text-500 ring-1 ring-line",
            )}
          >
            {step > passo.numero ? <Check className="h-3.5 w-3.5" /> : passo.numero}
          </span>
          <span
            className={cn(
              "text-[13px] font-medium",
              step === passo.numero ? "text-text-900" : "text-text-500",
            )}
          >
            {passo.rotulo}
          </span>
          {i < PASSOS.length - 1 && <span className="mx-1 h-px w-8 bg-line" />}
        </li>
      ))}
    </ol>
  )
}

/** Espelho de `assertAdminDaEmpresa` (P-4): sem isso o não-admin editava 70 regras e levava 403 no fim. */
const AVISO_SEM_PERMISSAO =
  "Só o administrador da empresa — quem criou a conta — pode alterar as regras e ativar ou desativar a política. Você pode consultar a política ativa e usar o simulador."

const STATUS_CHIP: Record<StatusPolitica, string> = {
  ativa: "bg-conf-alta-bg text-conf-alta-text",
  rascunho: "bg-conf-media-bg text-conf-media-text",
  inativa: "bg-paper text-text-500 ring-1 ring-line",
}

export default function Politica() {
  const { activeCompany, isLoading: empresaLoading } = useActiveCompany()
  const { user } = useAuth()
  const utils = trpc.useUtils()
  const empresaId = activeCompany?.id ?? 0
  // Mesmo critério do servidor: admin da plataforma (suporte) ou dono da empresa.
  const podeDecidir =
    user !== null &&
    activeCompany !== null &&
    (user.perfil === "admin" || activeCompany.usuarioId === user.id)

  const [modo, setModo] = useState<"status" | "wizard">("status")
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [upload, setUpload] = useState<PoliticaUploadItem | null>(null)
  const [politicaId, setPoliticaId] = useState<number | null>(null)
  const [extracao, setExtracao] = useState<PolicyExtracao | null>(null)
  const [form, setForm] = useState<RegrasForm | null>(null)
  /** Regras consolidadas pelo servidor no último save — é o que o agente vai usar (passo 3). */
  const [regrasSalvas, setRegrasSalvas] = useState<RegrasPolitica | null>(null)
  const [editados, setEditados] = useState<Set<string>>(new Set())

  const ativaQuery = trpc.politica.ativa.useQuery(
    { empresaId },
    { enabled: empresaId > 0, retry: false },
  )
  const listQuery = trpc.politica.list.useQuery(
    { empresaId },
    { enabled: empresaId > 0, retry: false },
  )

  const uploadMut = trpc.politica.upload.useMutation()
  const duplicar = trpc.politica.duplicar.useMutation()
  const updateRegras = trpc.politica.updateRegras.useMutation()
  const ativar = trpc.politica.ativar.useMutation()
  const desativar = trpc.politica.desativar.useMutation()

  function onEditou(campo: string) {
    setEditados((prev) => {
      if (prev.has(campo)) return prev
      const next = new Set(prev)
      next.add(campo)
      return next
    })
  }

  function abrirWizard() {
    setUpload(null)
    setPoliticaId(null)
    setExtracao(null)
    setForm(null)
    setRegrasSalvas(null)
    setEditados(new Set())
    setStep(1)
    setModo("wizard")
  }

  const processarArquivo = useCallback(
    async (arquivo: File) => {
      setUpload({ nome: arquivo.name, tamanho: arquivo.size, status: "enviando" })
      try {
        const base64 = await fileParaBase64(arquivo)
        setUpload((prev) => (prev ? { ...prev, status: "extraindo" } : prev))
        const res = await uploadMut.mutateAsync({
          empresaId,
          arquivoNome: arquivo.name,
          arquivoMime: arquivo.type || "application/octet-stream",
          arquivoBase64: base64,
        })
        setUpload((prev) => (prev ? { ...prev, status: "concluido" } : prev))
        setPoliticaId(res.politicaId)
        setExtracao(res.extracao)
        setForm(formFromRegras(res.extracao.regras))
        setEditados(new Set())
        setStep(2)
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : "Falha ao ler o documento."
        setUpload((prev) => (prev ? { ...prev, status: "falha", erro: mensagem } : prev))
        toast.error("Não foi possível ler a política", { description: mensagem })
      }
    },
    [empresaId, uploadMut],
  )

  async function salvarRegras() {
    if (!politicaId || !form) return
    try {
      const res = await updateRegras.mutateAsync({ id: politicaId, regras: regrasFromForm(form) })
      setRegrasSalvas(res.regras)
      toast.success("Regras salvas no rascunho", {
        description:
          "Elas só passam a valer quando você ativar a política. Simule o agente abaixo antes.",
      })
      setStep(3)
    } catch (erro) {
      toast.error("Falha ao salvar as regras", {
        description: erro instanceof Error ? erro.message : undefined,
      })
    }
  }

  async function ativarPolitica(id: number) {
    try {
      const res = await ativar.mutateAsync({ id })
      toast.success("Política ativada", {
        description: `Versão ${res.versao} — o agente já avalia as novas despesas.`,
      })
      await Promise.all([
        utils.politica.ativa.invalidate({ empresaId }),
        utils.politica.list.invalidate({ empresaId }),
      ])
      setModo("status")
      setStep(1)
      setUpload(null)
      setPoliticaId(null)
      setExtracao(null)
      setForm(null)
      setRegrasSalvas(null)
    } catch (erro) {
      toast.error("Falha ao ativar a política", {
        description: erro instanceof Error ? erro.message : undefined,
      })
    }
  }

  async function desativarPolitica(id: number) {
    try {
      await desativar.mutateAsync({ id })
      toast.success("Política desativada", {
        description: "Avaliação automática de despesas suspensa.",
      })
      await Promise.all([
        utils.politica.ativa.invalidate({ empresaId }),
        utils.politica.list.invalidate({ empresaId }),
      ])
    } catch (erro) {
      toast.error("Falha ao desativar a política", {
        description: erro instanceof Error ? erro.message : undefined,
      })
    }
  }

  /**
   * Política em vigor é imutável (RF-07): editar cria uma CÓPIA rascunho e é ela que o
   * wizard abre. A versão ativa continua decidindo as despesas até o "Ativar política".
   */
  async function novaVersaoDaAtiva(id: number) {
    try {
      const res = await duplicar.mutateAsync({ id })
      await utils.politica.list.invalidate({ empresaId })
      await revisarPolitica(res.politicaId)
    } catch (erro) {
      toast.error("Não foi possível criar a nova versão", {
        description: erro instanceof Error ? erro.message : undefined,
      })
    }
  }

  /** Rascunho → reabre no passo 2 para revisão/edição das regras. */
  async function revisarPolitica(id: number) {
    try {
      const politica = await utils.politica.get.fetch({ id })
      const regras = regrasPoliticaSchema.parse(politica.regras ?? {})
      setPoliticaId(politica.id)
      setExtracao({
        textoExtraido: politica.textoExtraido ?? null,
        regras,
        confiancaExtracao: politica.confiancaExtracao ?? "baixa",
        camposPendentes: (politica.camposPendentes as string[] | null) ?? [],
        provedor: "salvo",
        avisos: [],
      })
      setForm(formFromRegras(regras))
      setRegrasSalvas(null)
      setEditados(new Set())
      setUpload({
        nome: politica.arquivoNome,
        tamanho: 0,
        status: "concluido",
      })
      setStep(2)
      setModo("wizard")
    } catch (erro) {
      toast.error("Não foi possível abrir o rascunho", {
        description: erro instanceof Error ? erro.message : undefined,
      })
    }
  }

  const ativa = ativaQuery.data ?? null
  const versoes = listQuery.data ?? []
  const carregandoListas = ativaQuery.isLoading || listQuery.isLoading
  const regrasAtivas = ativa ? regrasPoliticaSchema.parse(ativa.regras ?? {}) : null

  // ── Estados de carregamento / sem empresa ─────────────────────────────────
  if (empresaLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-[320px] w-full rounded-[14px]" />
        <Skeleton className="h-12 w-2/3 rounded-xl" />
      </div>
    )
  }

  if (!activeCompany) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-8 py-16 text-center shadow-card">
        <Building2 className="h-8 w-8 text-text-500" />
        <h3 className="font-display text-lg font-medium text-text-900">
          Cadastre uma empresa para configurar a política
        </h3>
        <p className="max-w-sm text-sm text-text-500">
          A política de reembolso é configurada por empresa — o agente avalia cada despesa contra
          as regras dela.
        </p>
        <Link
          to="/app/empresas"
          className="mt-1 inline-flex h-10 items-center rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
        >
          Cadastrar empresa
        </Link>
      </div>
    )
  }

  // ── Wizard (nova versão) ──────────────────────────────────────────────────
  if (modo === "wizard") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="mx-auto flex w-full max-w-[960px] flex-col gap-6"
      >
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setModo("status")}
            className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-text-500 transition hover:text-text-900"
          >
            ← Voltar para a política
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-text-900">
              Nova versão da política
            </h1>
            <StepIndicator step={step} />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="politica-passo-1"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <PoliticaUploadStep
                item={upload}
                onArquivo={(arquivo) => void processarArquivo(arquivo)}
                processando={
                  upload?.status === "enviando" || upload?.status === "extraindo"
                }
              />
            </motion.div>
          )}

          {step === 2 && form && extracao && (
            <motion.div
              key="politica-passo-2"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <PoliticaRegrasStep
                form={form}
                onChange={setForm}
                camposPendentes={extracao.camposPendentes}
                editados={editados}
                onEditou={onEditou}
                confiancaExtracao={extracao.confiancaExtracao}
                provedor={extracao.provedor}
                avisos={extracao.avisos}
                textoExtraido={extracao.textoExtraido}
                salvando={updateRegras.isPending}
                onVoltar={() => setStep(1)}
                onSalvar={() => void salvarRegras()}
              />
            </motion.div>
          )}

          {step === 3 && politicaId !== null && (
            <motion.div
              key="politica-passo-3"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-card">
                <h3 className="font-display text-[15px] font-semibold text-text-900">
                  Regras que serão ativadas
                </h3>
                {form && <PoliticaResumo regras={regrasSalvas ?? regrasFromForm(form)} />}
              </div>
              <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <p className="mb-4 text-[13px] leading-relaxed text-text-500">
                  Teste o agente antes de ativar: ajuste categoria, valor e contexto e veja o
                  veredito ao vivo.
                </p>
                <SimuladorPolitica
                  empresaId={empresaId}
                  nota={
                    ativa
                      ? `A simulação usa a política ativa atual (v${ativa.versao}). Ao ativar, a nova versão passa a valer imediatamente.`
                      : undefined
                  }
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex h-11 items-center gap-2 rounded-[10px] px-4 text-[13px] font-semibold text-text-500 transition hover:bg-paper hover:text-text-900"
                >
                  ← Voltar às regras
                </button>
                <button
                  type="button"
                  onClick={() => void ativarPolitica(politicaId)}
                  disabled={ativar.isPending}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 rounded-[10px] bg-brand-500 px-5 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90",
                    ativar.isPending && "cursor-not-allowed opacity-50 hover:translate-y-0",
                  )}
                >
                  <ShieldCheck className="h-4 w-4" />
                  {ativar.isPending ? "Ativando…" : "Ativar política"}
                </button>
              </div>
              <p className="text-center font-mono text-[11px] leading-relaxed tracking-[0.02em] text-text-500">
                O agente aplica a política como auxílio à decisão — casos de exceção sempre podem
                ir à revisão humana.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    )
  }

  // ── Modo status (política ativa / histórico / empty) ──────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mx-auto flex w-full max-w-[960px] flex-col gap-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-text-900">
            Política de reembolso
          </h1>
          <p className="text-[13px] text-text-500">
            O agente avalia cada nova despesa contra as regras da política ativa.
          </p>
        </div>
        {versoes.length > 0 && podeDecidir && (
          <button
            type="button"
            onClick={abrirWizard}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-brand-500 px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
          >
            <CirclePlus className="h-4 w-4" />
            Nova versão
          </button>
        )}
      </div>

      {/* P-4: o gate existe no servidor desde a v1.8 — a tela precisa dizer antes, não no 403. */}
      {!podeDecidir && !carregandoListas && (
        <p className="rounded-xl border border-line bg-paper px-4 py-3 text-[12px] leading-relaxed text-text-500">
          {AVISO_SEM_PERMISSAO}
        </p>
      )}

      {carregandoListas ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-[280px] w-full rounded-xl" />
        </div>
      ) : versoes.length === 0 ? (
        /* Empty state — nunca houve política */
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface px-8 py-16 text-center shadow-card">
          <img src="/empty-revisao.svg" alt="" className="h-auto w-56" />
          <div className="flex max-w-md flex-col gap-1.5">
            <h3 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
              Nenhuma política de reembolso ainda
            </h3>
            <p className="text-sm leading-relaxed text-text-500">
              Envie o documento da política da empresa (PDF, imagem ou texto) e o agente extrai
              as regras do documento — você confere e ajusta antes de ativar.
            </p>
          </div>
          {/* O motivo já aparece na faixa acima quando o usuário não é admin da empresa. */}
          {podeDecidir && (
            <button
              type="button"
              onClick={abrirWizard}
              className="mt-1 inline-flex h-10 items-center gap-2 rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
            >
              <CirclePlus className="h-4 w-4" />
              Enviar política de reembolso
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Política ativa que não autoriza NENHUMA aprovação automática: o silêncio
              parecia funcionamento normal — a faixa diz o que está acontecendo e o que fazer. */}
          {ativa && regrasAtivas && semAutorizacaoDeAprovacao(regrasAtivas) && (
            <div className="flex flex-col gap-3 rounded-xl border border-conf-media-dot/25 bg-conf-media-bg px-4 py-3.5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <TriangleAlert
                  className="mt-0.5 h-4 w-4 shrink-0 text-conf-media-text"
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-[13px] font-semibold text-conf-media-text">
                    Sua política não define quando o agente pode aprovar sozinho
                  </p>
                  <p className="text-[12px] leading-relaxed text-conf-media-text">
                    Enquanto isso, toda despesa vai para a sua revisão.{" "}
                    {podeDecidir
                      ? `Crie uma nova versão a partir da v${ativa.versao}, marque as regras que autorizam o agente a aprovar sozinho e ative — a v${ativa.versao} continua valendo até lá.`
                      : "Peça ao administrador da empresa para revisar as regras da política."}
                  </p>
                </div>
              </div>
              {podeDecidir && (
                <button
                  type="button"
                  onClick={() => void novaVersaoDaAtiva(ativa.id)}
                  disabled={duplicar.isPending}
                  className={cn(
                    "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-conf-media-text px-3 text-[12px] font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-conf-media-dot/40 sm:h-9",
                    duplicar.isPending && "cursor-not-allowed opacity-50",
                  )}
                >
                  <PencilLine className="h-3.5 w-3.5" />
                  {duplicar.isPending ? "Criando…" : "Criar nova versão"}
                </button>
              )}
            </div>
          )}

          {/* Card de status */}
          {ativa && regrasAtivas ? (
            <div className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5 shadow-card">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-ink-900 text-brand-400">
                  <Bot className="h-5 w-5" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-900">
                      Política ativa · v{ativa.versao}
                    </span>
                    <span className="inline-flex h-5 items-center rounded-full bg-conf-alta-bg px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-conf-alta-text">
                      {STATUS_POLITICA_LABELS.ativa}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.02em] text-text-500">
                    <FileText className="h-3 w-3" />
                    {ativa.arquivoNome} · importada em {formatDataHora(ativa.createdAt)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void desativarPolitica(ativa.id)}
                  disabled={desativar.isPending || !podeDecidir}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 text-[12px] font-semibold text-text-500 transition hover:border-conf-vedado-dot/30 hover:text-conf-vedado-text",
                    (desativar.isPending || !podeDecidir) && "cursor-not-allowed opacity-50",
                  )}
                >
                  <PowerOff className="h-3.5 w-3.5" />
                  Desativar
                </button>
              </div>

              <div className="border-t border-dashed border-line" />
              <PoliticaResumo regras={regrasAtivas} />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-conf-media-dot/25 bg-conf-media-bg px-4 py-3.5">
              <Power className="h-4 w-4 shrink-0 text-conf-media-text" />
              <p className="flex-1 text-[13px] font-medium text-conf-media-text">
                Nenhuma política ativa — o agente está pausado e as despesas seguem apenas o motor
                tributário.
              </p>
              {podeDecidir && (
                <button
                  type="button"
                  onClick={abrirWizard}
                  className="inline-flex h-8 items-center rounded-lg bg-conf-media-text px-3 text-[12px] font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-conf-media-dot/40"
                >
                  Enviar nova versão
                </button>
              )}
            </div>
          )}

          {/* Playground */}
          <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <SimuladorPolitica empresaId={empresaId} />
          </div>

          {/* Histórico de versões */}
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-card">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-text-500" />
              <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-text-900">
                Histórico de versões
              </h3>
            </div>
            <ul className="flex flex-col">
              {versoes.map((versao) => (
                <li
                  key={versao.id}
                  className="flex flex-wrap items-center gap-3 border-b border-line/60 py-3 last:border-b-0"
                >
                  <span className="inline-flex h-7 min-w-14 items-center justify-center rounded-md border border-line bg-paper px-2 font-mono text-[11px] font-semibold tabular text-text-900">
                    v{versao.versao}
                  </span>
                  <span
                    className={cn(
                      "inline-flex h-5 items-center rounded-full px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.04em]",
                      STATUS_CHIP[versao.status as StatusPolitica],
                    )}
                  >
                    {STATUS_POLITICA_LABELS[versao.status as StatusPolitica]}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium text-text-900">
                      {versao.arquivoNome}
                    </span>
                    <span className="font-mono text-[11px] tracking-[0.02em] text-text-500">
                      {formatDataHora(versao.createdAt)}
                    </span>
                  </div>
                  {versao.status === "rascunho" && podeDecidir && (
                    <button
                      type="button"
                      onClick={() => void revisarPolitica(versao.id)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[12px] font-semibold text-text-900 transition hover:bg-paper"
                    >
                      <PencilLine className="h-3.5 w-3.5" />
                      Revisar regras
                    </button>
                  )}
                  {versao.status !== "ativa" && podeDecidir && (
                    <button
                      type="button"
                      onClick={() => void ativarPolitica(versao.id)}
                      disabled={ativar.isPending}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[12px] font-semibold text-brand-500 transition hover:bg-paper",
                        ativar.isPending && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Power className="h-3.5 w-3.5" />
                      Ativar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <p className="border-t border-line pt-3 font-mono text-[11px] leading-relaxed tracking-[0.02em] text-text-500">
        O agente aplica a política como auxílio à decisão — casos de exceção sempre podem ir à
        revisão humana.
      </p>
    </motion.div>
  )
}
