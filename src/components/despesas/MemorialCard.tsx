import { motion } from "framer-motion"
import { Scale } from "lucide-react"
import type { TipoBeneficio, Tributo } from "@contracts/types"
import { TRIBUTO_LABEL } from "./meta"
import { formatBRL } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface MemorialLinha {
  tributo: Tributo
  tipoBeneficio: TipoBeneficio
  valor: number
  formula: string
  baseLegal: string | null
  regraVersao: string
}

interface MemorialCardProps {
  linhas: MemorialLinha[]
  /** Contexto do cabeçalho, ex. `regra v1.1 · vigente na data do fato 12/03/2026` */
  contexto?: string
  className?: string
}

function Trilha({
  titulo,
  linhas,
  delayBase,
}: {
  titulo: string
  linhas: MemorialLinha[]
  delayBase: number
}) {
  const total = linhas.reduce((acc, l) => acc + l.valor, 0)
  return (
    <div className="flex flex-col gap-2.5">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-text-dark-400">
        {titulo}
      </span>
      {linhas.length === 0 && (
        <span className="font-mono text-[12px] text-text-dark-400/70">Sem linhas nesta trilha.</span>
      )}
      {linhas.map((linha, i) => (
        <motion.div
          key={`${linha.tributo}-${i}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: delayBase + i * 0.06, ease: "easeOut" }}
          className="flex flex-col gap-1"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[12px] leading-relaxed text-text-dark-100">
              <span className="font-semibold">{TRIBUTO_LABEL[linha.tributo]}</span>
              <span className="text-text-dark-400"> · {linha.formula}</span>
            </span>
            <span className="shrink-0 font-mono text-[13px] font-semibold tabular text-brand-400">
              {formatBRL(linha.valor)}
            </span>
          </div>
          {(linha.baseLegal || linha.regraVersao) && (
            <span className="font-mono text-[10px] tracking-[0.02em] text-text-dark-400/80">
              {linha.baseLegal ?? "Base legal não informada"} · regra v{linha.regraVersao}
            </span>
          )}
        </motion.div>
      ))}
      {linhas.length > 1 && (
        <div className="flex items-baseline justify-between border-t border-dashed border-line-dark pt-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-dark-400">
            Subtotal {titulo.toLowerCase()}
          </span>
          <span className="font-mono text-[13px] font-semibold tabular text-brand-400">
            {formatBRL(total)}
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Memorial de cálculo (RF-03): card escuro estilo recibo, mono, separadores
 * tracejados. Créditos (Trilha A) e dedutibilidade (Trilha B) são trilhas
 * paralelas — NUNCA somadas entre si.
 */
export default function MemorialCard({ linhas, contexto, className }: MemorialCardProps) {
  const creditos = linhas.filter((l) => l.tipoBeneficio === "credito")
  const dedutibilidade = linhas.filter((l) => l.tipoBeneficio === "dedutibilidade")

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-line-dark bg-ink-900 p-5 shadow-card",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Scale className="h-3.5 w-3.5 text-brand-400" />
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-dark-400">
          Memorial{contexto ? ` · ${contexto}` : ""}
        </span>
      </div>

      <Trilha titulo="Trilha A — Créditos" linhas={creditos} delayBase={0.05} />

      <div className="border-t border-dashed border-line-dark" />

      <Trilha titulo="Trilha B — Dedutibilidade" linhas={dedutibilidade} delayBase={0.2} />

      <div className="border-t border-dashed border-line-dark" />

      <p className="font-mono text-[11px] leading-relaxed tracking-[0.02em] text-conf-media-dot">
        Créditos e dedutibilidade são trilhas paralelas — nunca somados.
      </p>
    </div>
  )
}
