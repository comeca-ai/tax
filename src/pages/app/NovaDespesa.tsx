import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, Building2, Check, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/providers/trpc"
import { useActiveCompany } from "@/hooks/useActiveCompany"
import type { RegimeTributario, ResultadoMotor, ResultadoPolitica } from "@contracts/types"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { fileParaBase64 } from "@/components/despesas/arquivo"
import StepUpload from "@/components/despesas/wizard/StepUpload"
import StepRevisao from "@/components/despesas/wizard/StepRevisao"
import StepResultado from "@/components/despesas/wizard/StepResultado"
import {
  formFromExtracao,
  parseNumeroPt,
  type FilaItem,
  type FormState,
  type NotaProcessada,
} from "@/components/despesas/wizard/types"

const REGIME_ROTULO: Record<RegimeTributario, string> = {
  lucro_real: "Lucro Real",
  lucro_presumido: "Lucro Presumido",
  simples_nacional: "Simples Nacional",
}

const PASSOS = [
  { numero: 1, rotulo: "Enviar nota" },
  { numero: 2, rotulo: "Conferir dados" },
  { numero: 3, rotulo: "Resultado" },
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

export default function NovaDespesa() {
  const { activeCompany, isLoading: empresaLoading } = useActiveCompany()
  const utils = trpc.useUtils()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [fila, setFila] = useState<FilaItem[]>([])
  const [processadas, setProcessadas] = useState<NotaProcessada[]>([])
  const [indiceAtual, setIndiceAtual] = useState(0)
  const [form, setForm] = useState<FormState | null>(null)
  const [editados, setEditados] = useState<Set<string>>(new Set())
  const [assistido, setAssistido] = useState(false)
  const [erroRf00, setErroRf00] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{
    despesaId: number
    resultado: ResultadoMotor
    politica: (ResultadoPolitica & { versao: number | null }) | null
  } | null>(null)

  const revisaoIniciadaRef = useRef(false)
  const stepRef = useRef(step)
  useEffect(() => {
    stepRef.current = step
  }, [step])

  const empresaId = activeCompany?.id ?? 0
  const cadastroIncompleto = activeCompany?.cadastroCompleto === false

  const uploadNota = trpc.despesas.uploadNota.useMutation()
  const create = trpc.despesas.create.useMutation()

  const iniciarRevisao = useCallback((nota: NotaProcessada, indice: number) => {
    setIndiceAtual(indice)
    setForm(formFromExtracao(nota.extracao))
    setEditados(new Set())
    setAssistido(
      nota.extracao.confiancaExtracao === "baixa" || nota.extracao.camposPendentes.length >= 5,
    )
    setErroRf00(null)
    setResultado(null)
    setStep(2)
  }, [])

  const processarArquivos = useCallback(
    async (arquivos: File[]) => {
      for (const arquivo of arquivos) {
        const key = `${Date.now()}-${arquivo.name}`
        setFila((prev) => [
          ...prev,
          { key, nome: arquivo.name, tamanho: arquivo.size, status: "enviando" },
        ])
        try {
          const base64 = await fileParaBase64(arquivo)
          setFila((prev) => prev.map((i) => (i.key === key ? { ...i, status: "ocr" } : i)))
          const res = await uploadNota.mutateAsync({
            empresaId,
            arquivoNome: arquivo.name,
            arquivoMime: arquivo.type || "application/octet-stream",
            arquivoBase64: base64,
          })
          const nota: NotaProcessada = {
            notaFiscalId: res.notaFiscalId,
            arquivoNome: arquivo.name,
            arquivoMime: arquivo.type || "application/octet-stream",
            arquivoBase64: base64,
            extracao: res.extracao,
          }
          setFila((prev) => prev.map((i) => (i.key === key ? { ...i, status: "concluido" } : i)))
          setProcessadas((prev) => {
            const proximoIndice = prev.length
            if (!revisaoIniciadaRef.current && stepRef.current === 1) {
              revisaoIniciadaRef.current = true
              iniciarRevisao(nota, proximoIndice)
            }
            return [...prev, nota]
          })
        } catch (erro) {
          const mensagem = erro instanceof Error ? erro.message : "Falha ao processar a nota."
          setFila((prev) =>
            prev.map((i) => (i.key === key ? { ...i, status: "falha", erro: mensagem } : i)),
          )
        }
      }
    },
    [empresaId, uploadNota, iniciarRevisao],
  )

  function onEditou(campo: string) {
    setEditados((prev) => {
      if (prev.has(campo)) return prev
      const next = new Set(prev)
      next.add(campo)
      return next
    })
  }

  async function processar() {
    const nota = processadas[indiceAtual]
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
        // RF-00: cadastro incompleto — mensagem PT-BR + link para completar
        setErroRf00(mensagem)
      } else {
        toast.error("Não foi possível processar o crédito", { description: mensagem })
      }
    }
  }

  function reiniciar() {
    setFila([])
    setProcessadas([])
    setIndiceAtual(0)
    setForm(null)
    setEditados(new Set())
    setAssistido(false)
    setErroRf00(null)
    setResultado(null)
    revisaoIniciadaRef.current = false
    setStep(1)
  }

  function proximaNota() {
    const proxima = processadas[indiceAtual + 1]
    if (proxima) iniciarRevisao(proxima, indiceAtual + 1)
  }

  const notaAtual = processadas[indiceAtual] ?? null
  const restantes = processadas.length - (indiceAtual + 1)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mx-auto flex w-full max-w-[960px] flex-col gap-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link
          to="/app/despesas"
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-text-500 transition hover:text-text-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para despesas
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-text-900">
            Nova despesa
          </h1>
          <StepIndicator step={step} />
        </div>
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
          <Skeleton className="h-[320px] w-full rounded-[14px]" />
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
            className="mt-1 inline-flex h-10 items-center rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
          >
            Cadastrar empresa
          </Link>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="passo-1"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <StepUpload
                fila={fila}
                onArquivos={(arquivos) => void processarArquivos(arquivos)}
                processando={fila.some((i) => i.status === "enviando" || i.status === "ocr")}
              />
            </motion.div>
          )}

          {step === 2 && notaAtual && form && (
            <motion.div
              key={`passo-2-${notaAtual.notaFiscalId}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <StepRevisao
                nota={notaAtual}
                empresaId={empresaId}
                form={form}
                onChange={setForm}
                editados={editados}
                onEditou={onEditou}
                assistido={assistido}
                cadastroIncompleto={cadastroIncompleto}
                processando={create.isPending}
                onVoltar={() => setStep(1)}
                onProcessar={() => void processar()}
              />
            </motion.div>
          )}

          {step === 3 && resultado && (
            <motion.div
              key="passo-3"
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
                cnaeEmpresa={activeCompany.cnaePrincipal ?? "—"}
                regimeEmpresa={
                  REGIME_ROTULO[activeCompany.regimeTributario as RegimeTributario] ??
                  activeCompany.regimeTributario ??
                  "—"
                }
                restantes={restantes}
                onProximaNota={proximaNota}
                onReiniciar={reiniciar}
              />
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  )
}
