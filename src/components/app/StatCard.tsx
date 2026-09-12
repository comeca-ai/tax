import type { ReactNode } from "react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { Area, AreaChart, ResponsiveContainer } from "recharts"
import { cn } from "@/lib/utils"

interface StatCardProps {
  caption: string
  /** Big KPI — pass a <MoneyValue/> or any formatted node. */
  value: ReactNode
  /** Delta vs período anterior, em %. Positive renders ↑ brand, negative ↓ red. */
  delta?: number
  /** Mini sparkline points (chronological). */
  spark?: number[]
  className?: string
}

/** White card: caption, big mono KPI, delta chip, mini sparkline. Hover: subtle lift. */
export default function StatCard({ caption, value, delta, spark, className }: StatCardProps) {
  const data = spark?.map((v, i) => ({ i, v }))
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">{caption}</span>
          <div className="font-mono text-[30px] font-semibold tabular tracking-[-0.01em] text-text-900">{value}</div>
          {delta !== undefined && (
            <span
              className={cn(
                "mt-0.5 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium tabular",
                delta >= 0 ? "bg-conf-alta-bg text-conf-alta-text" : "bg-conf-vedado-bg text-conf-vedado-text",
              )}
            >
              {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {delta >= 0 ? "+" : ""}
              {delta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs período anterior
            </span>
          )}
        </div>
        {data && data.length > 1 && (
          <div className="h-12 w-28 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#0EA968"
                  strokeWidth={2}
                  fill="#0EA968"
                  fillOpacity={0.12}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
