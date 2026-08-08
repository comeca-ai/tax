import type { ReactNode } from "react"
import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export interface DataTableColumn<T> {
  key: string
  header: ReactNode
  /** Numeric columns render mono, tabular, right-aligned. */
  numeric?: boolean
  render: (row: T) => ReactNode
  className?: string
}

interface DataTableEmptyState {
  /** Illustration path, e.g. `/empty-despesas.svg` */
  image: string
  title: string
  description?: string
  ctaLabel?: string
  onCta?: () => void
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** Row click opens the detail drawer (wired by the page). */
  onRowClick?: (row: T) => void
  pageSize?: number
  emptyState?: DataTableEmptyState
  className?: string
}

/** Sticky-header table: 44px rows, hairline borders, hover paper bg, pagination footer, empty state. */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  pageSize = 12,
  emptyState,
  className,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const visible = useMemo(
    () => rows.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [rows, safePage, pageSize],
  )

  if (rows.length === 0 && emptyState) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface px-8 py-16 text-center", className)}>
        <img src={emptyState.image} alt="" className="h-auto w-56" />
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">{emptyState.title}</h3>
          {emptyState.description && <p className="max-w-sm text-sm text-text-500">{emptyState.description}</p>}
        </div>
        {emptyState.ctaLabel && (
          <button
            type="button"
            onClick={emptyState.onCta}
            className="mt-1 inline-flex h-10 items-center rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
          >
            {emptyState.ctaLabel}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border border-line bg-surface shadow-card", className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-line bg-surface">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500",
                    col.numeric && "text-right",
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "h-11 border-b border-line last:border-b-0 transition-colors hover:bg-paper",
                  onRowClick && "cursor-pointer",
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-4 text-sm text-text-900",
                      col.numeric && "text-right font-mono font-medium tabular",
                      col.className,
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex h-11 items-center justify-between border-t border-line bg-surface px-4">
        <span className="font-mono text-[11px] tabular text-text-500">
          {rows.length.toLocaleString("pt-BR")} {rows.length === 1 ? "registro" : "registros"}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Página anterior"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-500 transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 font-mono text-[11px] tabular text-text-500">
            {safePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            aria-label="Próxima página"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-500 transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
