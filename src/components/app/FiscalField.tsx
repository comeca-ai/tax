import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface FiscalFieldProps {
  label: string
  value: string
  /** OCR confidence 0–100. Green ≥90, amber 70–89, red <70 (click to correct). */
  confidence?: number
  mono?: boolean
  onCorrect?: () => void
  className?: string
}

function confidenceColor(c: number): string {
  if (c >= 90) return "bg-conf-alta-dot"
  if (c >= 70) return "bg-conf-media-dot"
  return "bg-conf-vedado-dot"
}

/** Labeled value display: small uppercase caption + mono value + optional OCR confidence dot. */
export default function FiscalField({ label, value, confidence, mono = true, onCorrect, className }: FiscalFieldProps) {
  const lowConfidence = confidence !== undefined && confidence < 90
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-500">{label}</span>
      <span className="flex items-center gap-2">
        <span className={cn("text-[15px] text-text-900", mono && "font-mono font-medium tabular")}>{value}</span>
        {confidence !== undefined && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Confiança OCR ${confidence}%${lowConfidence ? " — clique para corrigir" : ""}`}
                  onClick={lowConfidence ? onCorrect : undefined}
                  className={cn(
                    "h-2 w-2 rounded-full",
                    confidenceColor(confidence),
                    lowConfidence && "cursor-pointer ring-2 ring-transparent transition hover:ring-brand-500/30",
                  )}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-mono text-xs">
                  OCR {confidence}%{lowConfidence ? " · confira o campo" : ""}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </span>
    </div>
  )
}
