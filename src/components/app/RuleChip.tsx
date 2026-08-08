import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

interface RuleChipProps {
  /** e.g. `IN RFB 2.121/2024 · art. 372` */
  label: string
  /** Opens the rule detail modal (base legal, vigência, versão). */
  onOpen?: () => void
  className?: string
}

/** Mono legal-reference chip with ExternalLink icon → opens rule detail modal. */
export default function RuleChip({ label, onOpen, className }: RuleChipProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md border border-line bg-paper px-2 font-mono text-[11px] tracking-[0.02em] text-text-500 transition-colors hover:border-brand-500/40 hover:text-brand-500",
        className,
      )}
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </button>
  )
}
