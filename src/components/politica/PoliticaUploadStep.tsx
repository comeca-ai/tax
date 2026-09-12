import { useCallback } from "react"
import { useDropzone, type FileRejection } from "react-dropzone"
import { motion } from "framer-motion"
import { Check, FileText, ScanLine, TriangleAlert, UploadCloud } from "lucide-react"
import { toast } from "sonner"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { formatTamanho } from "@/components/despesas/arquivo"

const TAMANHO_MAX = 10 * 1024 * 1024 // 10 MB

export interface PoliticaUploadItem {
  nome: string
  tamanho: number
  status: "pronto" | "enviando" | "extraindo" | "concluido" | "falha"
  erro?: string
}

interface PoliticaUploadStepProps {
  item: PoliticaUploadItem | null
  onArquivo: (arquivo: File) => void
  onAnalisar: () => void
  onRemover: () => void
  processando: boolean
}

const STATUS_LABEL: Record<PoliticaUploadItem["status"], string> = {
  pronto: "Pronto para analisar",
  enviando: "Enviando…",
  extraindo: "Extraindo regras…",
  concluido: "Concluído",
  falha: "Falha na leitura",
}

/** Passo 1 do wizard de política: upload do documento (PDF/imagem/TXT/MD). */
export default function PoliticaUploadStep({ item, onArquivo, onAnalisar, onRemover, processando }: PoliticaUploadStepProps) {
  const onDrop = useCallback(
    (aceitos: File[], rejeitados: FileRejection[]) => {
      if (rejeitados.length > 0) {
        toast.error("Arquivo não suportado", {
          description: "Envie PDF, imagem (JPG/PNG), TXT ou Markdown de até 10 MB.",
        })
      }
      const primeiro = aceitos[0]
      if (primeiro) onArquivo(primeiro)
    },
    [onArquivo],
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
      "text/plain": [".txt"],
      "text/markdown": [".md"],
    },
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Dropzone */}
      <div
        {...getRootProps({
          className: cn(
            "flex h-[320px] w-full flex-col items-center justify-center gap-3 rounded-[14px] border-2 border-dashed bg-surface px-6 text-center transition-colors",
            isDragActive ? "border-brand-500 bg-brand-500/5" : "border-line",
          ),
        })}
      >
        <input {...getInputProps()} />
        {!item && <>
          <motion.img
            src="/ocr-scan.svg"
            alt=""
            animate={{ scale: isDragActive ? 1.04 : 1, y: isDragActive ? 0 : [0, -6, 0] }}
            transition={isDragActive ? { duration: 0.2 } : { duration: 4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            className="h-[160px] w-auto"
          />
          <h3 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
            {isDragActive ? "Solte para selecionar" : "Arraste o documento da política aqui"}
          </h3>
        </>}
        {!isDragActive && !item && (
          <>
            <span className="text-[13px] text-text-500">ou</span>
            <button
              type="button"
              onClick={open}
              disabled={processando}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-4 text-[13px] font-semibold text-text-900 transition hover:bg-paper",
                processando && "cursor-not-allowed opacity-50",
              )}
            >
              <UploadCloud className="h-4 w-4 text-text-500" />
              Escolher arquivo
            </button>
            <span className="font-mono text-[11px] tracking-[0.02em] text-text-500">
              PDF · JPG · PNG · TXT · MD · até 10 MB
            </span>
            <span className="max-w-md text-[12px] leading-relaxed text-text-500">
              O agente lê o documento e extrai limites por categoria, exigências e tetos de
              aprovação — você confere tudo antes de ativar.
            </span>
          </>
        )}
        {item && (
          <div className="flex max-w-lg flex-col items-center gap-3 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E6F2F0] text-[#0B7A75]"><FileText className="h-5 w-5" /></span>
            <div><p className="text-[14px] font-semibold text-text-900">{item.nome}</p><p className="mt-1 font-mono text-[11px] text-text-500">{formatTamanho(item.tamanho)} · {STATUS_LABEL[item.status]}</p></div>
            {!processando && item.status !== "concluido" && <div className="flex flex-wrap justify-center gap-2"><button type="button" onClick={onRemover} className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-[13px] font-semibold text-text-500 transition hover:bg-paper">Remover</button><button type="button" onClick={onAnalisar} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-500 px-4 text-[13px] font-semibold text-white transition hover:bg-brand-500/90"><ScanLine className="h-4 w-4" />{item.status === "falha" ? "Tentar novamente" : "Analisar política"}</button></div>}
          </div>
        )}
      </div>

      {/* Status do upload */}
      {item && item.status !== "pronto" && (
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
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              item.status === "falha"
                ? "bg-conf-vedado-bg text-conf-vedado-text"
                : "bg-brand-500/10 text-brand-500",
            )}
          >
            {item.status === "concluido" ? (
              <Check className="h-4 w-4" />
            ) : item.status === "falha" ? (
              <TriangleAlert className="h-4 w-4" />
            ) : item.status === "extraindo" ? (
              <ScanLine className="h-4 w-4 animate-pulse" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-[13px] font-medium text-text-900">{item.nome}</span>
            <span className="font-mono text-[11px] text-text-500">
              {formatTamanho(item.tamanho)} · {STATUS_LABEL[item.status]}
              {item.erro ? ` — ${item.erro}` : ""}
            </span>
            {(item.status === "enviando" || item.status === "extraindo") && (
              <Progress
                value={item.status === "enviando" ? 40 : 75}
                className="h-1.5 bg-paper [&_[data-slot=progress-indicator]]:bg-brand-500"
              />
            )}
          </div>
        </motion.div>
      )}
      {processando && (
        <span className="text-center font-mono text-[11px] tracking-[0.02em] text-text-500">
          A revisão das regras extraídas abre assim que a leitura terminar.
        </span>
      )}
    </div>
  )
}
