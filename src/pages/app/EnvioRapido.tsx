import { useCallback, useRef, useState } from "react"
import { Link } from "react-router"
import { AnimatePresence, motion } from "framer-motion"
import { useDropzone, type FileRejection } from "react-dropzone"
import {
  Building2,
  Camera,
  FileText,
  ScanLine,
  TriangleAlert,
  UploadCloud,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/providers/trpc"
import { useActiveCompany } from "@/hooks/useActiveCompany"
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
import StepVeredito, { type Veredito } from "@/components/despesas/wizard/StepVeredito"

const TAMANHO_MAX = 10 * 1024 * 1024 // 10 MB

const PASSOS = ["Foto", "Veredito"] as const

type StatusEnvio = "enviando" | "ocr" | "falha"

interface EnvioItem {
  nome: string
  tamanho: number
  status: StatusEnvio
  erro?: string
}

/** Indicador compacto de progresso (mobile-first): 1/2. */
function ProgressoRapido({ step }: { step: 1 | 2 }) {
  return (
    <ol className="flex items-center gap-2" aria-label={`Passo ${step} de 2 — ${PASSOS[step - 1]}`}>
      {PASSOS.map((rotulo, i) => {
        const numero = i + 1
        return (
          <li key={rotulo} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-semibold tabular",
                step > numero
                  ? "bg-brand-500 text-white"
                  : step === numero
                    ? "bg-brand-500/10 text-brand-500 ring-1 ring-brand-500/40"
                    : "bg-paper text-text-500 ring-1 ring-line",
              )}
            >
              {numero}
            </span>
            <span
              className={cn(
                "text-[12px] font-medium",
                step === numero ? "text-text-900" : "text-text-500",
              )}
            >
              {rotulo}
            </span>
            {i < PASSOS.length - 1 && <span className="mx-0.5 h-px w-6 bg-line" />}
          </li>
        )
      })}
    </ol>
  )
}

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
          {item.status === "enviando"
            ? "Enviando…"
            : item.status === "ocr"
              ? "Extraindo e decidindo…"
              : "Falha na leitura"}
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

/**
 * Envio rápido (v1.7.0 — D-013/D-014): foto → extrai → veredito.
 * Aprova, nega citando a regra, ou manda para revisão manual do gestor.
 * Ninguém confere nem preenche campo — o que a evidência não mostrou,
 * ninguém digita.
 */
export default function EnvioRapido() {
  const { activeCompany, companies, isLoading: empresaLoading } = useActiveCompany()
  const utils = trpc.useUtils()

  const [step, setStep] = useState<1 | 2>(1)
  const [empresaEscolhida, setEmpresaEscolhida] = useState<number | null>(null)
  const [envio, setEnvio] = useState<EnvioItem | null>(null)
  const [veredito, setVeredito] = useState<Veredito | null>(null)

  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Empresa padrão = empresa ativa do shell; só muda se o usuário tiver várias.
  const empresaId = empresaEscolhida ?? activeCompany?.id ?? 0
  const empresa = companies.find((c) => c.id === empresaId) ?? activeCompany

  const uploadNota = trpc.despesas.uploadNota.useMutation()
  const processarAutomatica = trpc.despesas.processarAutomatica.useMutation()

  const processarArquivo = useCallback(
    async (arquivo: File) => {
      if (empresaId === 0) return
      setEnvio({ nome: arquivo.name, tamanho: arquivo.size, status: "enviando" })
      try {
        const base64 = await fileParaBase64(arquivo)
        setEnvio({ nome: arquivo.name, tamanho: arquivo.size, status: "ocr" })
        const up = await uploadNota.mutateAsync({
          empresaId,
          arquivoNome: arquivo.name,
          arquivoMime: arquivo.type || "application/octet-stream",
          arquivoBase64: base64,
        })
        // Decisão imediata: aprova / nega / revisão manual
        const res = await processarAutomatica.mutateAsync({
          empresaId,
          notaFiscalId: up.notaFiscalId,
        })
        setVeredito({
          despesaId: res.despesaId,
          decisao: res.decisao,
          motivos: [...res.motivos, ...res.ressalvas.map((r) => `Ressalva: ${r}`)],
          regrasAplicadas: res.regrasAplicadas,
          politicaVersao: res.politicaVersao,
          categoria: res.categoria,
          valor: res.valor,
          dataFatoGerador: res.dataFatoGerador,
          cnpjEmitente: res.cnpjEmitente,
        })
        setEnvio(null)
        setStep(2)
        await utils.despesas.list.invalidate()
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : "Falha ao processar a nota."
        setEnvio({ nome: arquivo.name, tamanho: arquivo.size, status: "falha", erro: mensagem })
        toast.error("Não foi possível processar a nota", { description: mensagem })
      }
    },
    [empresaId, uploadNota, processarAutomatica, utils],
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

  function reiniciar() {
    setEnvio(null)
    setVeredito(null)
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

      <p className="text-[13px] text-text-500">
        Tire a foto — o agente extrai e decide sozinho: aprova, nega citando a regra,
        ou encaminha para revisão do gestor.
      </p>

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
            A empresa define a política de reembolso usada nas decisões.
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

          {step === 2 && veredito && (
            <motion.div
              key="rapido-2"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
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
              <StepVeredito veredito={veredito} onReiniciar={reiniciar} />
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
