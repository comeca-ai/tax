import { useCallback, useRef, useState } from "react"
import { Link } from "react-router"
import { AnimatePresence, motion } from "framer-motion"
import { useDropzone, type FileRejection } from "react-dropzone"
import {
  Building2,
  Camera,
  Check,
  FileText,
  ScanLine,
  TriangleAlert,
  UploadCloud,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/providers/trpc"
import { useActiveCompany } from "@/hooks/useActiveCompany"
import type { ResultadoMotor, ResultadoPolitica } from "@contracts/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { fileParaBase64, formatTamanho } from "@/components/despesas/arquivo"
import { REGIME_ROTULO } from "@/components/ops/rotulos"
import StepRevisao from "@/components/despesas/wizard/StepRevisao"
import StepResultado from "@/components/despesas/wizard/StepResultado"
import {
  formFromExtracao,
  parseNumeroPt,
  type FormState,
  type NotaProcessada,
} from "@/components/despesas/wizard/types"

const TAMANHO_MAX = 10 * 1024 * 1024 // 10 MB

const PASSOS = ["Foto", "Confirma", "Veredito"] as const

type StatusEnvio = "enviando" | "ocr" | "falha"

interface EnvioItem {
  nome: string
  tamanho: number
  status: StatusEnvio
  erro?: string
}

/** Indicador compacto de progresso (mobile-first): 1/2/3. */
function ProgressoRapido({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center gap-2" aria-label={`Passo ${step} de 3 — ${PASSOS[step - 1]}`}>
      {PASSOS.map((rotulo, i) => {
        const numero = i + 1
        return (
          <li key={rotulo} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full font-mono text-[13px] font-semibold tabular transition-colors",
                step > numero
                  ? "bg-brand-500 text-white"
                  : step === numero
                    ? "bg-brand-500/10 text-brand-500 ring-1 ring-brand-500/40"
                    : "bg-paper text-text-500 ring-1 ring-line",
              )}
            >
              {step > numero ? <Check className="h-4 w-4" /> : numero}
            </span>
            <span
              className={cn(
                "hidden text-[13px] font-medium sm:inline",
                step === numero ? "text-text-900" : "text-text-500",
              )}
            >
              {rotulo}
            </span>
            {numero < 3 && <span className="h-px w-5 bg-line sm:w-8" />}
          </li>
        )
      })}
    </ol>
  )
}

/** Estado do envio em andamento (envio + OCR). */
function StatusEnvioCard({ item }: { item: EnvioItem }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-surface px-4 py-3",
        item.status === "falha" ? "border-conf-vedado-dot/30" : "border-line",
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          item.status === "falha" ? "bg-conf-vedado-bg text-conf-vedado-text" : "bg-brand-500/10 text-brand-500",
        )}
      >
        {item.status === "falha" ? (
          <TriangleAlert className="h-4 w-4" />
        ) : item.status === "ocr" ? (
          <ScanLine className="h-4 w-4 animate-pulse" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[13px] font-medium text-text-900">{item.nome}</span>
        <span className="font-mono text-[11px] text-text-500">
          {formatTamanho(item.tamanho)} ·{" "}
          {item.status === "enviando" ? "Enviando…" : item.status === "ocr" ? "Processando OCR…" : "Falha na leitura"}
          {item.erro ? ` — ${item.erro}` : ""}
        </span>
        {item.status !== "falha" && (
          <Progress
            value={item.status === "enviando" ? 40 : 75}
            className="h-1.5 bg-paper [&_[data-slot=progress-indicator]]:bg-brand-500"
          />
        )}
      </div>
    </motion.div>
  )
}

export default function EnvioRapido() {
  const { activeCompany, companies, isLoading: empresaLoading } = useActiveCompany()
  const utils = trpc.useUtils()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [empresaEscolhida, setEmpresaEscolhida] = useState<number | null>(null)
  const [envio, setEnvio] = useState<EnvioItem | null>(null)
  const [nota, setNota] = useState<NotaProcessada | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [editados, setEditados] = useState<Set<string>>(new Set())
  const [erroRf00, setErroRf00] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{
    despesaId: number
    resultado: ResultadoMotor
    politica: (ResultadoPolitica & { versao: number | null }) | null
  } | null>(null)

  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Empresa padrão = empresa ativa do shell; só muda se o usuário tiver várias.
  const empresaId = empresaEscolhida ?? activeCompany?.id ?? 0
  const empresa = companies.find((c) => c.id === empresaId) ?? activeCompany
  const cadastroIncompleto = empresa?.cadastroCompleto === false

  const uploadNota = trpc.despesas.uploadNota.useMutation()
  const create = trpc.despesas.create.useMutation()

  const processarArquivo = useCallback(
    async (arquivo: File) => {
      if (empresaId === 0) return
      setEnvio({ nome: arquivo.name, tamanho: arquivo.size, status: "enviando" })
      try {
        const base64 = await fileParaBase64(arquivo)
        setEnvio({ nome: arquivo.name, tamanho: arquivo.size, status: "ocr" })
        const res = await uploadNota.mutateAsync({
          empresaId,
          arquivoNome: arquivo.name,
          arquivoMime: arquivo.type || "application/octet-stream",
          arquivoBase64: base64,
        })
        setNota({
          notaFiscalId: res.notaFiscalId,
          arquivoNome: arquivo.name,
          arquivoMime: arquivo.type || "application/octet-stream",
          arquivoBase64: base64,
          extracao: res.extracao,
        })
        setForm(formFromExtracao(res.extracao))
        setEditados(new Set())
        setErroRf00(null)
        setResultado(null)
        setEnvio(null)
        setStep(2)
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : "Falha ao processar a nota."
        setEnvio({ nome: arquivo.name, tamanho: arquivo.size, status: "falha", erro: mensagem })
      }
    },
    [empresaId, uploadNota],
  )

  const onDrop = useCallback(
    (aceitos: File[], rejeitados: FileRejection[]) => {
      if (rejeitados.length > 0) {
        toast.error("Arquivo não suportado", {
          description: "Envie imagens (JPG/PNG), PDF ou XML de até 10 MB.",
        })
      }
      if (aceitos.length > 0) void processarArquivo(aceitos[0])
    },
    [processarArquivo],
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    maxSize: TAMANHO_MAX,
    multiple: false,
    accept: {
      "image/*": [".jpg", ".jpeg", ".png", ".webp"],
      "application/pdf": [".pdf"],
      "text/xml": [".xml"],
      "application/xml": [".xml"],
    },
  })

  function onEditou(campo: string) {
    setEditados((prev) => {
      if (prev.has(campo)) return prev
      const next = new Set(prev)
      next.add(campo)
      return next
    })
  }

  async function processar() {
    if (!nota || !form) return
    setErroRf00(null)
    try {
      const res = await create.mutateAsync({
        empresaId,
        notaFiscalId: nota.notaFiscalId,
        veiculoId: form.veiculoId ? Number(form.veiculoId) : undefined,
        categoria: form.categoria as Exclude<FormState["categoria"], "">,
        colaborador: form.colaborador.trim() || undefined,
        centroCusto: form.centroCusto.trim() || undefined,
        motivoDeslocamento: form.motivo.trim() || undefined,
        kmComercial: parseNumeroPt(form.kmComercial),
        kmNaoComercial: parseNumeroPt(form.kmNaoComercial),
        litros: form.litros.trim() ? parseNumeroPt(form.litros) : undefined,
        valorNota: parseNumeroPt(form.valorNota),
        dataFatoGerador: form.dataFatoGerador,
        cnpjEmitente: form.cnpjEmitente.trim() || undefined,
        cfop: form.cfop.trim() || undefined,
        ncm: form.ncm.trim() || undefined,
        cst: form.cst.trim() || undefined,
      })
      setResultado(res)
      setStep(3)
      await utils.despesas.list.invalidate()
    } catch (erro) {
      const code = (erro as { data?: { code?: string } }).data?.code
      const mensagem = erro instanceof Error ? erro.message : "Falha ao processar a despesa."
      if (code === "PRECONDITION_FAILED" || code === "BAD_REQUEST") {
        setErroRf00(mensagem)
      } else {
        toast.error("Não foi possível processar o crédito", { description: mensagem })
      }
    }
  }

  function reiniciar() {
    setEnvio(null)
    setNota(null)
    setForm(null)
    setEditados(new Set())
    setErroRf00(null)
    setResultado(null)
    setStep(1)
  }

  const enviando = envio !== null && envio.status !== "falha"

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mx-auto flex w-full max-w-[960px] flex-col gap-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-500/10 text-brand-500">
            <Zap className="h-4 w-4" />
          </span>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-text-900">
            Envio rápido
          </h1>
        </div>
        <ProgressoRapido step={step} />
      </div>

      {/* RF-00 — cadastro incompleto */}
      {erroRf00 && (
        <div className="flex items-start gap-3 rounded-xl border border-conf-media-dot/25 bg-conf-media-bg px-4 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-conf-media-text" />
          <div className="flex flex-col gap-1">
            <p className="text-[13px] font-medium text-conf-media-text">{erroRf00}</p>
            <Link to="/app/empresas" className="text-[13px] font-semibold text-conf-media-text underline">
              Completar cadastro da empresa
            </Link>
          </div>
        </div>
      )}

      {empresaLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-[280px] w-full rounded-[14px]" />
          <Skeleton className="h-12 w-2/3 rounded-xl" />
        </div>
      ) : !activeCompany ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-8 py-16 text-center shadow-card">
          <Building2 className="h-8 w-8 text-text-500" />
          <h3 className="font-display text-lg font-medium text-text-900">
            Cadastre uma empresa para começar
          </h3>
          <p className="max-w-sm text-sm text-text-500">
            O motor tributário precisa do CNAE, regime tributário e UF da empresa para classificar
            as despesas.
          </p>
          <Link
            to="/app/empresas"
            className="mt-1 inline-flex h-11 items-center rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
          >
            Cadastrar empresa
          </Link>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="rapido-1"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="flex flex-col gap-4"
            >
              {/* Empresa (somente quando o usuário tem várias) */}
              {companies.length > 1 && (
                <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-4 shadow-card">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-500">
                    Empresa da despesa
                  </label>
                  <Select value={String(empresaId)} onValueChange={(v) => setEmpresaEscolhida(Number(v))}>
                    <SelectTrigger className="h-12 w-full border-line text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.razaoSocial}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Botão câmera (mobile) — touch target 56px */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const arquivo = e.target.files?.[0]
                  if (arquivo) void processarArquivo(arquivo)
                  e.target.value = ""
                }}
              />
              <button
                type="button"
                disabled={enviando}
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-[12px] bg-brand-500 text-[15px] font-semibold text-white shadow-card transition hover:-translate-y-px hover:bg-brand-500/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Camera className="h-5 w-5" />
                Tirar foto da nota
              </button>

              {/* Dropzone (imagem, PDF ou XML) */}
              <div
                {...getRootProps({
                  className: cn(
                    "flex min-h-[220px] w-full flex-col items-center justify-center gap-3 rounded-[14px] border-2 border-dashed bg-surface px-6 py-8 text-center transition-colors",
                    isDragActive ? "border-brand-500 bg-brand-500/5" : "border-line",
                  ),
                })}
              >
                <input {...getInputProps()} />
                <UploadCloud className={cn("h-8 w-8", isDragActive ? "text-brand-500" : "text-text-500")} />
                <h3 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
                  {isDragActive ? "Solte para enviar" : "Ou arraste o arquivo aqui"}
                </h3>
                {!isDragActive && (
                  <>
                    <button
                      type="button"
                      onClick={open}
                      className="inline-flex h-12 items-center gap-2 rounded-[10px] border border-line bg-surface px-5 text-[13px] font-semibold text-text-900 transition hover:bg-paper"
                    >
                      Escolher arquivo
                    </button>
                    <span className="font-mono text-[11px] tracking-[0.02em] text-text-500">
                      JPG · PNG · PDF · XML · até 10 MB
                    </span>
                  </>
                )}
              </div>

              {envio && <StatusEnvioCard item={envio} />}
            </motion.div>
          )}

          {step === 2 && nota && form && (
            <motion.div
              key={`rapido-2-${nota.notaFiscalId}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {/* Empresa da nota (vinculada no envio — não pode mudar na confirmação) */}
              {companies.length > 1 && empresa && (
                <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
                  <Building2 className="h-4 w-4 shrink-0 text-text-500" />
                  <span className="flex-1 truncate text-[13px] font-medium text-text-900">
                    {empresa.razaoSocial}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-text-500">
                    empresa da nota
                  </span>
                </div>
              )}
              <StepRevisao
                nota={nota}
                empresaId={empresaId}
                form={form}
                onChange={setForm}
                editados={editados}
                onEditou={onEditou}
                assistido={
                  nota.extracao.confiancaExtracao === "baixa" ||
                  nota.extracao.camposPendentes.length >= 5
                }
                cadastroIncompleto={cadastroIncompleto}
                processando={create.isPending}
                onVoltar={reiniciar}
                onProcessar={() => void processar()}
              />
            </motion.div>
          )}

          {step === 3 && resultado && empresa && (
            <motion.div
              key="rapido-3"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <StepResultado
                despesaId={resultado.despesaId}
                resultado={resultado.resultado}
                politica={resultado.politica}
                categoria={form?.categoria ?? ""}
                cnaeEmpresa={empresa.cnaePrincipal ?? "—"}
                regimeEmpresa={
                  REGIME_ROTULO[empresa.regimeTributario as keyof typeof REGIME_ROTULO] ??
                  empresa.regimeTributario ??
                  "—"
                }
                restantes={0}
                onProximaNota={reiniciar}
                onReiniciar={reiniciar}
              />
              <div className="mt-4 flex justify-center">
                <Link
                  to="/app/despesas"
                  className="text-[13px] font-semibold text-brand-500 transition hover:underline"
                >
                  Ver todas em Despesas →
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  )
}
