import { useRef, useState } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { SplitText } from "gsap/SplitText"
import { useGSAP } from "@gsap/react"
import { AnimatePresence, motion } from "framer-motion"
import { Link } from "react-router"
import { TriangleAlert } from "lucide-react"
import ConfidenceBadge, { type ConfidenceLevel } from "@/components/app/ConfidenceBadge"
import { cn } from "@/lib/utils"

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP)

const CATEGORIES = ["Combustível", "Alimentação", "Hospedagem", "Pedágio", "Uber", "Táxi"] as const

const LEGAL_BASE: Record<string, string> = {
  Combustível: "IN RFB 2.121/2024",
  Alimentação: "IN RFB 2.121/2024",
  Hospedagem: "IN RFB 2.121/2024",
  Pedágio: "Convênio ICMS",
  Uber: "IN RFB 2.121/2024",
  Táxi: "IN RFB 2.121/2024",
}

interface MatrixRow {
  cnae: string
  setor: string
  cells: ConfidenceLevel[]
}

const ROWS: MatrixRow[] = [
  { cnae: "49.30-2", setor: "Transporte de cargas", cells: ["alta", "media", "media", "alta", "baixa", "baixa"] },
  { cnae: "47.31-8", setor: "Revenda de combustível", cells: ["vedado", "baixa", "baixa", "baixa", "baixa", "baixa"] },
  { cnae: "41.x–43.x", setor: "Construção civil", cells: ["alta", "media", "media", "media", "baixa", "baixa"] },
  { cnae: "69.11-7", setor: "Advocacia", cells: ["baixa", "baixa", "baixa", "baixa", "baixa", "baixa"] },
  { cnae: "86.x", setor: "Saúde domiciliar", cells: ["alta", "media", "media", "media", "baixa", "baixa"] },
  { cnae: "80.1x", setor: "Segurança privada", cells: ["alta", "baixa", "baixa", "media", "baixa", "baixa"] },
  { cnae: "46.x/47.x", setor: "Comércio c/ entrega própria", cells: ["media", "baixa", "baixa", "media", "baixa", "baixa"] },
]

const DOT: Record<ConfidenceLevel, string> = {
  alta: "bg-conf-alta-dot",
  media: "bg-conf-media-dot",
  baixa: "bg-conf-baixa-dot",
  vedado: "bg-conf-vedado-dot",
}

const LABEL: Record<ConfidenceLevel, string> = {
  alta: "Alta confiança",
  media: "Média confiança",
  baixa: "Baixa confiança",
  vedado: "Vedado",
}

export default function Matriz() {
  const root = useRef<HTMLElement>(null)
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(null)

  useGSAP(
    () => {
      const split = new SplitText(".matriz-h2", { type: "words" })
      gsap.fromTo(
        split.words,
        { y: 24, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.5,
          stagger: 0.04,
          ease: "power3.out",
          scrollTrigger: { trigger: root.current, start: "top 80%" },
        },
      )
      gsap.fromTo(
        ".matriz-row",
        { y: 16, opacity: 0, scale: 0.98 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.45,
          stagger: 0.06,
          ease: "power3.out",
          scrollTrigger: { trigger: ".matriz-table", start: "top 75%" },
        },
      )
      return () => split.revert()
    },
    { scope: root },
  )

  return (
    <section id="matriz" ref={root} className="bg-ink-950 py-24">
      <div className="mx-auto max-w-[1200px] px-6">
        <h2 className="matriz-h2 max-w-2xl font-display text-[clamp(30px,4vw,48px)] font-semibold leading-[1.08] tracking-[-0.02em] text-text-dark-100">
          A matriz CNAE × categoria, transparente.
        </h2>
        <p className="mt-4 max-w-xl text-[15px] leading-[1.6] text-text-dark-400">
          Nada de caixa-preta: toda classificação mostra a regra, a base legal e a vigência. Esta é uma amostra da
          matriz real do motor.
        </p>

        <div className="matriz-table mt-12 overflow-x-auto rounded-2xl border border-line-dark bg-ink-800 p-6">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {(["alta", "media", "baixa", "vedado"] as const).map((level) => (
              <ConfidenceBadge key={level} level={level} />
            ))}
          </div>
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <th className="pb-3 pr-4 text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-text-dark-400">
                  CNAE
                </th>
                {CATEGORIES.map((cat) => (
                  <th
                    key={cat}
                    className="pb-3 text-center font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-text-dark-400"
                  >
                    {cat}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, ri) => (
                <tr key={row.cnae} className="matriz-row border-t border-line-dark transition-colors hover:bg-ink-950/60">
                  <td className="py-3 pr-4">
                    <span className="block font-mono text-[13px] tabular text-text-dark-100">{row.cnae}</span>
                    <span className="block text-[12px] text-text-dark-400">{row.setor}</span>
                  </td>
                  {row.cells.map((level, ci) => (
                    <td key={ci} className="relative py-3 text-center">
                      <button
                        type="button"
                        aria-label={`${row.cnae} · ${CATEGORIES[ci]} → ${LABEL[level]}`}
                        onMouseEnter={() => setHovered({ row: ri, col: ci })}
                        onMouseLeave={() => setHovered(null)}
                        onFocus={() => setHovered({ row: ri, col: ci })}
                        onBlur={() => setHovered(null)}
                        className={cn(
                          "inline-flex h-9 w-9 items-center justify-center rounded-lg transition",
                          level === "vedado" && "bg-stripes-vedado",
                        )}
                      >
                        <span
                          className={cn(
                            "h-3 w-3 rounded-full transition-transform duration-200",
                            DOT[level],
                            hovered?.row === ri && hovered?.col === ci && "scale-[1.3]",
                          )}
                        />
                      </button>
                      <AnimatePresence>
                        {hovered?.row === ri && hovered?.col === ci && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 4 }}
                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                            className="pointer-events-none absolute left-1/2 top-full z-20 w-64 -translate-x-1/2 rounded-lg border border-line-dark bg-ink-950 p-3 text-left shadow-xl"
                          >
                            <p className="font-mono text-[11px] leading-relaxed tracking-[0.02em] text-text-dark-100">
                              CNAE {row.cnae} · {CATEGORIES[ci]} → {LABEL[level]}
                            </p>
                            <p className="mt-1 font-mono text-[10px] leading-relaxed text-text-dark-400">
                              base: {LEGAL_BASE[CATEGORIES[ci]]} · vigente desde 01/2024
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-xl border border-conf-media-dot/25 bg-conf-media-bg/10 px-4 py-3 sm:flex-row sm:items-center">
            <p className="flex items-start gap-2 text-[13px] leading-relaxed text-conf-media-text">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Classificações de média confiança devem ser validadas por um advogado tributarista. reembolsa.ia não
              presta aconselhamento jurídico.
            </p>
            <Link
              to="/cadastro"
              className="whitespace-nowrap text-[13px] font-semibold text-brand-400 transition hover:underline"
            >
              Ver a matriz completa →
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
