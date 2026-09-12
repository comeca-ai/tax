import { useState } from "react"
import { Download } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export type ExportFormat = "csv" | "pdf"

interface ExportButtonsProps {
  /** Called with the chosen format. Should trigger the actual file download (wired to real data in a later phase). */
  onExport?: (format: ExportFormat) => void
  disabled?: boolean
  className?: string
}

/** Segmented CSV | PDF export button; click → toast "Relatório gerado" + download. */
export default function ExportButtons({ onExport, disabled, className }: ExportButtonsProps) {
  const [active, setActive] = useState<ExportFormat>("csv")

  const handle = (format: ExportFormat) => {
    setActive(format)
    onExport?.(format)
    toast.success("Relatório gerado", {
      description: `Exportação ${format.toUpperCase()} iniciada.`,
    })
  }

  return (
    <div
      className={cn(
        "inline-flex h-9 items-center overflow-hidden rounded-[10px] border border-line bg-surface",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {(["csv", "pdf"] as const).map((format) => (
        <button
          key={format}
          type="button"
          disabled={disabled}
          onClick={() => handle(format)}
          className={cn(
            "inline-flex h-full items-center gap-1.5 px-3.5 text-[13px] font-semibold uppercase tracking-[0.01em] transition-colors",
            active === format ? "bg-brand-500 text-white" : "text-text-500 hover:bg-paper hover:text-text-900",
            format === "pdf" && "border-l border-line",
            disabled && "cursor-not-allowed",
          )}
        >
          <Download className="h-3.5 w-3.5" />
          {format}
        </button>
      ))}
    </div>
  )
}
