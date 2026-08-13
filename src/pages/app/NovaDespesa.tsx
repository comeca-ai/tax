import { useCallback, useRef, useState } from "react"
import { Link } from "react-router"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, Building2, Check } from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/providers/trpc"
import { useActiveCompany } from "@/hooks/useActiveCompany"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { fileParaBase64 } from "@/components/despesas/arquivo"
import StepUpload from "@/components/despesas/wizard/StepUpload"
import StepVeredito, { type Veredito } from "@/components/despesas/wizard/StepVeredito"
import type { FilaItem } from "@/components/despesas/wizard/types"

const PASSOS = [
  { numero: 1, rotulo: "Enviar nota" },
  { numero: 2, rotulo: "Veredito" },
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

/**
 * Nova despesa (v1.7.0 — D-013/D-014): foto entra → extrai → veredito.
 * Aprova, nega ou manda para revisão manual. Ninguém confere nem preenche
 * campo nenhum — o que a evidência não mostrou, ninguém digita.
 */
export default function NovaDespesa() {
  const { activeCompany, isLoading: empresaLoading } = useActiveCompany()
  const utils = trpc.useUtils()

  const [step, setStep] = useState<1 | 2>(1)
  const [fila, setFila] = useState<FilaItem[]>([])
  const [veredito, setVeredito] = useState<Veredito | null>(null)
  const processandoRef = useRef(false)

  const empresaId = activeCompany?.id ?? 0

  const uploadNota = trpc.despesas.uploadNota.useMutation()
  const processarAutomatica = trpc.despesas.processarAutomatica.useMutation()

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
          const up = await uploadNota.mutateAsync({
            empresaId,
            arquivoNome: arquivo.name,
            arquivoMime: arquivo.type || "application/octet-stream",
            arquivoBase64: base64,
          })
          // Decisão imediata: aprova / nega / revisão manual (D-013/D-014)
          const res = await processarAutomatica.mutateAsync({
            empresaId,
            notaFiscalId: up.notaFiscalId,
          })
          setFila((prev) => prev.map((i) => (i.key === key ? { ...i, status: "concluido" } : i)))
          if (!processandoRef.current) {
            processandoRef.current = true
            setVeredito({
              despesaId: res.despesaId,
              decisao: res.decisao,
              motivos: res.motivos,
              regrasAplicadas: res.regrasAplicadas,
              politicaVersao: res.politicaVersao,
              categoria: res.categoria,
              valor: res.valor,
              dataFatoGerador: res.dataFatoGerador,
              cnpjEmitente: res.cnpjEmitente,
            })
            setStep(2)
          }
        } catch (erro) {
          const mensagem = erro instanceof Error ? erro.message : "Falha ao processar a nota."
          setFila((prev) =>
            prev.map((i) => (i.key === key ? { ...i, status: "falha", erro: mensagem } : i)),
          )
          toast.error("Não foi possível processar a nota", { description: mensagem })
        }
      }
      await utils.despesas.list.invalidate()
    },
    [empresaId, uploadNota, processarAutomatica, utils],
  )

  function reiniciar() {
    setFila([])
    setVeredito(null)
    processandoRef.current = false
    setStep(1)
  }

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
        <p className="text-[13px] text-text-500">
          Envie a foto da nota — o agente extrai e decide sozinho: aprova, nega citando
          a regra, ou encaminha para revisão do gestor.
        </p>
      </div>

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
            A empresa define a política de reembolso e o regime tributário usados nas decisões.
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

          {step === 2 && veredito && (
            <motion.div
              key="passo-2"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <StepVeredito veredito={veredito} onReiniciar={reiniciar} />
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  )
}
