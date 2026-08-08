import { cn } from "@/lib/utils"

export type ConfidenceLevel = "alta" | "media" | "baixa" | "vedado"

const LEVELS: Record<ConfidenceLevel, { label: string; bg: string; text: string; dot: string }> = {
  alta: { label: "Alta", bg: "bg-conf-alta-bg", text: "text-conf-alta-text", dot: "bg-conf-alta-dot" },
  media: { label: "Média", bg: "bg-conf-media-bg", text: "text-conf-media-text", dot: "bg-conf-media-dot" },
  baixa: { label: "Baixa", bg: "bg-conf-baixa-bg", text: "text-conf-baixa-text", dot: "bg-conf-baixa-dot" },
  vedado: { label: "Vedado", bg: "bg-conf-vedado-bg", text: "text-conf-vedado-text", dot: "bg-conf-vedado-dot" },
}

const OUTLINE_RING: Record<ConfidenceLevel, string> = {
  alta: "ring-conf-alta-dot/30",
  media: "ring-conf-media-dot/30",
  baixa: "ring-conf-baixa-dot/30",
  vedado: "ring-conf-vedado-dot/30",
}

interface ConfidenceBadgeProps {
  level: ConfidenceLevel
  /** `solid` for detail headers, `outline` for tables */
  variant?: "solid" | "outline"
  className?: string
}

/** Pill h-6, radius 999, mono 11px uppercase + 6px dot (Confidence System). */
export default function ConfidenceBadge({ level, variant = "solid", className }: ConfidenceBadgeProps) {
  const c = LEVELS[level]
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.04em]",
        variant === "solid" && cn(c.bg, c.text),
        variant === "outline" && cn("bg-transparent ring-1 ring-inset", c.text, OUTLINE_RING[level]),
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
      {c.label}
    </span>
  )
}
