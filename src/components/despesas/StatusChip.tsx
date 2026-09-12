import type { StatusDespesa } from "@contracts/types"
import { cn } from "@/lib/utils"

const STATUS_META: Record<StatusDespesa, { label: string; classes: string }> = {
  aprovada: { label: "Liberada", classes: "bg-conf-alta-bg text-conf-alta-text" },
  em_revisao: { label: "Em revisão", classes: "bg-conf-media-bg text-conf-media-text" },
  rejeitada: { label: "Rejeitada", classes: "bg-conf-vedado-bg text-conf-vedado-text" },
  pendente: { label: "Rascunho", classes: "bg-paper text-text-500 ring-1 ring-inset ring-line" },
}

/** Chip de status da despesa (Liberada / Em revisão / Rejeitada / Rascunho). */
export default function StatusChip({ status, className }: { status: StatusDespesa; className?: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.pendente
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.04em]",
        meta.classes,
        className,
      )}
    >
      {meta.label}
    </span>
  )
}
