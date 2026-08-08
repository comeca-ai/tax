import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { CalendarClock, CircleAlert } from "lucide-react"
import type { CategoriaDespesa, NivelConfianca } from "@contracts/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { trpc } from "@/providers/trpc"
import { cn } from "@/lib/utils"
import {
  CATEGORIA_ROTULO,
  CATEGORIAS_ORDEM,
  DATA_CORTE_MP_1340,
  formatDateBr,
} from "./labels"

interface Marco {
  data: string
  titulo: string
  impacto: string
  tributos: string[]
  bases: string[]
  status: "base" | "vigente" | "futuro" | "monitorado"
}

const MARCOS: Marco[] = [
  {
    data: "01/2024",
    titulo: "v1.0 — matriz inicial",
    impacto: "10 linhas CNAE × 6 categorias + dedutibilidade IRPJ/CSLL.",
    tributos: ["PIS/COFINS", "ICMS", "IRPJ/CSLL"],
    bases: ["Lei 10.637/2002", "Lei 10.833/2003", "RIR/2018"],
    status: "base",
  },
  {
    data: "11/03/2026",
    titulo: "v1.1 — MP 1.340/2026",
    impacto:
      "PIS/COFINS diesel/GLP zerado; fator 90% “a confirmar” (LC 224/2025).",
    tributos: ["PIS/COFINS"],
    bases: ["MP 1.340/2026", "LC 224/2025"],
    status: "vigente",
  },
  {
    data: "01/2027",
    titulo: "v2.0 (previsto) — CBS/IBS regime pleno",
    impacto: "Crédito pelo valor destacado na nota; obrigatoriedade plena da reforma.",
    tributos: ["CBS", "IBS"],
    bases: ["EC 132/2023", "LC 214/2025"],
    status: "futuro",
  },
  {
    data: "2029–2033",
    titulo: "Transição da reforma tributária",
    impacto: "Redução gradual PIS/COFINS/ICMS → CBS/IBS até o fim da transição em 2033.",
    tributos: ["PIS/COFINS", "ICMS", "CBS", "IBS"],
    bases: ["EC 132/2023", "LC 227/2026"],
    status: "monitorado",
  },
]

const DOT_ESTILO: Record<Marco["status"], string> = {
  base: "bg-brand-500",
  vigente: "bg-amber-500",
  futuro: "bg-blue-500",
  monitorado: "bg-text-500/60",
}

const TAG_ESTILO: Record<Marco["status"], string> = {
  base: "border-brand-500/30 bg-brand-500/10 text-brand-500",
  vigente: "border-conf-media-dot/30 bg-conf-media-bg text-conf-media-text",
  futuro: "border-blue-500/30 bg-blue-500/10 text-blue-500",
  monitorado: "border-line bg-paper text-text-500",
}

const TAG_ROTULO: Record<Marco["status"], string> = {
  base: "v1.0",
  vigente: "vigente",
  futuro: "futuro",
  monitorado: "monitorado",
}

function hojeISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** View 2 — Linha do tempo regulatória (RF-07) + seletor "viajar no tempo". */
export default function LinhaDoTempo() {
  const [data, setData] = useState<string>(hojeISO())
  const [categoria, setCategoria] = useState<CategoriaDespesa | "todas">("todas")

  const vigentes = trpc.regras.vigentes.useQuery(
    { data, categoria: categoria === "todas" ? undefined : categoria },
    { retry: false, enabled: /^\d{4}-\d{2}-\d{2}$/.test(data) },
  )

  const resumo = useMemo(() => {
    const contagem: Record<NivelConfianca, number> = { alta: 0, media: 0, baixa: 0, vedado: 0 }
    for (const r of vigentes.data ?? []) contagem[r.confianca as NivelConfianca] += 1
    return contagem
  }, [vigentes.data])

  const depoisDaMP = data >= DATA_CORTE_MP_1340

  return (
    <div className="flex flex-col gap-8">
      {/* RF-07 — viajar no tempo */}
      <section className="rounded-[14px] border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-500/10 text-brand-500">
            <CalendarClock className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[16px] font-medium tracking-[-0.01em] text-text-900">
              Viajar no tempo — regra vigente na data do fato (RF-07)
            </h2>
            <p className="text-[13px] text-text-500">
              Escolha a data do fato gerador e veja quais regras valiam naquele dia.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="h-11 rounded-[10px] border border-line bg-surface px-3 font-mono text-[13px] tabular text-text-900 outline-none transition focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/[0.18]"
            />
            <Select
              value={categoria}
              onValueChange={(v) => setCategoria(v as CategoriaDespesa | "todas")}
            >
              <SelectTrigger className="h-11 w-[170px] rounded-[10px] border-line">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {CATEGORIAS_ORDEM.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORIA_ROTULO[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {vigentes.isLoading && (
            <span className="text-[13px] text-text-500">Consultando regras vigentes…</span>
          )}
          {vigentes.isError && (
            <span className="text-[13px] text-red-500">
              Não foi possível consultar as regras vigentes.
            </span>
          )}
          {vigentes.data && (
            <>
              <span className="font-mono text-[12px] tabular text-text-900">
                {vigentes.data.length} regras vigentes em {formatDateBr(data)}
                {categoria !== "todas" && ` · ${CATEGORIA_ROTULO[categoria]}`}
              </span>
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-conf-alta-bg px-2.5 font-mono text-[11px] uppercase tracking-[0.04em] text-conf-alta-text">
                Alta {resumo.alta}
              </span>
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-conf-media-bg px-2.5 font-mono text-[11px] uppercase tracking-[0.04em] text-conf-media-text">
                Média {resumo.media}
              </span>
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-conf-baixa-bg px-2.5 font-mono text-[11px] uppercase tracking-[0.04em] text-conf-baixa-text">
                Baixa {resumo.baixa}
              </span>
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-conf-vedado-bg px-2.5 font-mono text-[11px] uppercase tracking-[0.04em] text-conf-vedado-text">
                Vedado {resumo.vedado}
              </span>
            </>
          )}
        </div>

        <div
          className={cn(
            "mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12px] leading-relaxed",
            depoisDaMP
              ? "border-conf-media-dot/25 bg-conf-media-bg text-conf-media-text"
              : "border-blue-500/20 bg-blue-500/5 text-blue-500",
          )}
        >
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {depoisDaMP ? (
            <span>
              MP 1.340/2026 em vigor: PIS/COFINS sobre diesel/GLP <strong>zerado</strong> para fatos
              geradores a partir de 11/03/2026. O motor aplica alíquota 0% nesse período.
            </span>
          ) : (
            <span>
              Antes de 11/03/2026: PIS/COFINS diesel/GLP a 9,25% sobre a base elegível, com fator
              90% (LC 224/2025) <strong>a confirmar</strong>. ICMS monofásico ad rem por UF segue
              normal.
            </span>
          )}
        </div>
      </section>

      {/* Timeline 2024 → 2033 */}
      <section>
        <h2 className="mb-6 font-display text-[18px] font-medium tracking-[-0.01em] text-text-900">
          Versionamento regulatório · 2024 → 2033
        </h2>
        <div className="relative">
          {/* spine */}
          <motion.div
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="absolute left-[7px] top-1 h-full w-px origin-top bg-line md:left-1/2"
          />
          <div className="flex flex-col gap-6">
            {MARCOS.map((marco, i) => {
              const esquerda = i % 2 === 0
              const futuro = marco.status === "futuro" || marco.status === "monitorado"
              return (
                <motion.div
                  key={marco.data}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.15 + 0.08 * i, ease: "easeOut" }}
                  className={cn(
                    "relative pl-8 md:w-1/2 md:pl-0",
                    esquerda ? "md:pr-10" : "md:ml-auto md:pl-10",
                  )}
                >
                  {/* node dot */}
                  <span
                    className={cn(
                      "absolute left-0 top-4 h-[15px] w-[15px] rounded-full border-[3px] border-surface md:top-5",
                      DOT_ESTILO[marco.status],
                      esquerda
                        ? "md:left-auto md:-right-[7.5px]"
                        : "md:-left-[7.5px]",
                      marco.status === "vigente" && "animate-pulse",
                    )}
                  />
                  <div
                    className={cn(
                      "rounded-[12px] border bg-surface p-4 shadow-card",
                      futuro ? "border-dashed border-line opacity-60" : "border-line",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12px] tabular tracking-[0.02em] text-text-500">
                        {marco.data}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]",
                          TAG_ESTILO[marco.status],
                        )}
                      >
                        {TAG_ROTULO[marco.status]}
                      </span>
                    </div>
                    <h3 className="mt-1.5 font-display text-[15px] font-medium tracking-[-0.01em] text-text-900">
                      {marco.titulo}
                    </h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-text-500">{marco.impacto}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {marco.tributos.map((t) => (
                        <span
                          key={t}
                          className="inline-flex h-5 items-center rounded-full bg-brand-500/10 px-2 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-brand-500"
                        >
                          {t}
                        </span>
                      ))}
                      {marco.bases.map((b) => (
                        <span
                          key={b}
                          className="inline-flex h-5 items-center rounded-md border border-line bg-paper px-1.5 font-mono text-[10px] tracking-[0.02em] text-text-500"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
        <p className="mt-8 rounded-[10px] border border-line bg-surface px-4 py-3 font-mono text-[11px] leading-relaxed tracking-[0.02em] text-text-500">
          O motor aplica automaticamente cada versão pela data do fato gerador — notas antigas usam
          a regra antiga, sem retrabalho.
        </p>
      </section>
    </div>
  )
}
