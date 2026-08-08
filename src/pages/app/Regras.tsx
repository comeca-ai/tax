import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { History, Info, LayoutGrid, Search, TriangleAlert } from "lucide-react"
import type { RegimeTributario, TipoBeneficio, Tributo } from "@contracts/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { trpc } from "@/providers/trpc"
import { useActiveCompany } from "@/hooks/useActiveCompany"
import { cn } from "@/lib/utils"
import MatrizElegibilidade from "@/components/regras/MatrizElegibilidade"
import RegraDetalheModal from "@/components/regras/RegraDetalheModal"
import type { CelulaSelecionada } from "@/components/regras/RegraDetalheModal"
import LinhaDoTempo from "@/components/regras/LinhaDoTempo"
import AuditoriaTimeline from "@/components/regras/AuditoriaTimeline"
import { REGIME_ROTULO, TRIBUTO_ROTULO } from "@/components/regras/labels"
import type { RegraRow } from "@/components/regras/labels"

type Visao = "matriz" | "timeline"

function compararVersao(a: string, b: string): number {
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export default function Regras() {
  const { activeCompany } = useActiveCompany()
  const matriz = trpc.regras.matriz.useQuery(undefined, { retry: false })

  const regras = useMemo(() => (matriz.data ?? []) as RegraRow[], [matriz.data])

  const versoes = useMemo(() => {
    const set = new Set(regras.map((r) => r.versao))
    set.add("1.1")
    set.add("1.0")
    return [...set].sort(compararVersao)
  }, [regras])
  const versaoAtual = versoes[versoes.length - 1] ?? "1.1"

  const [visao, setVisao] = useState<Visao>("matriz")
  const [versaoSel, setVersaoSel] = useState<string | null>(null)
  const versao = versaoSel ?? versaoAtual
  const historica = versao !== versaoAtual

  const [regime, setRegime] = useState<RegimeTributario>("lucro_real")
  const [tributo, setTributo] = useState<Tributo | "todos">("todos")
  const [tipoBeneficio, setTipoBeneficio] = useState<TipoBeneficio | "todos">("todos")
  const [busca, setBusca] = useState("")
  const [selecao, setSelecao] = useState<CelulaSelecionada | null>(null)

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-text-900">
            Regras &amp; matriz de elegibilidade
          </h1>
          <p className="mt-1 max-w-[620px] text-[14px] text-text-500">
            Toda classificação do motor sai desta matriz — com base legal, versão e vigência. Nada é
            caixa-preta.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-[10px] border border-line bg-surface p-0.5">
            {(
              [
                { id: "matriz", rotulo: "Matriz", Icon: LayoutGrid },
                { id: "timeline", rotulo: "Linha do tempo", Icon: History },
              ] as const
            ).map(({ id, rotulo, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setVisao(id)}
                className={cn(
                  "flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
                  visao === id
                    ? "bg-ink-900 text-text-dark-100"
                    : "text-text-500 hover:text-text-900",
                )}
              >
                <Icon className="h-4 w-4" />
                {rotulo}
              </button>
            ))}
          </div>
          <Select value={versao} onValueChange={(v) => setVersaoSel(v)}>
            <SelectTrigger className="h-10 w-[190px] rounded-[10px] border-line bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...versoes].reverse().map((v) => (
                <SelectItem key={v} value={v}>
                  {`Versão das regras: v${v}${v === versaoAtual ? " (atual)" : ""}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Info strip RF-07 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, delay: 0.08 }}
        className="flex items-start gap-3 rounded-[12px] border border-blue-500/20 bg-blue-500/5 px-4 py-3"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p className="text-[13px] leading-relaxed text-text-900">
          A regra aplicada a cada despesa é a vigente na{" "}
          <strong>data do fato gerador</strong> (RF-07). Mudanças regulatórias — como a MP
          1.340/2026 — criam novas versões sem alterar o histórico.
        </p>
      </motion.div>

      {historica && (
        <div className="flex items-center gap-2 rounded-[10px] border border-conf-media-dot/25 bg-conf-media-bg px-4 py-2.5">
          <TriangleAlert className="h-4 w-4 shrink-0 text-conf-media-text" />
          <p className="font-mono text-[12px] tracking-[0.02em] text-conf-media-text">
            visualizando versão histórica v{versao} — apenas consulta
          </p>
        </div>
      )}

      {/* Views */}
      <AnimatePresence mode="wait" initial={false}>
        {visao === "matriz" ? (
          <motion.div
            key="matriz"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-4"
          >
            {/* Filters row */}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={regime} onValueChange={(v) => setRegime(v as RegimeTributario)}>
                <SelectTrigger className="h-11 w-[190px] rounded-[10px] border-line bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(REGIME_ROTULO) as RegimeTributario[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {REGIME_ROTULO[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={tributo} onValueChange={(v) => setTributo(v as Tributo | "todos")}>
                <SelectTrigger className="h-11 w-[170px] rounded-[10px] border-line bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tributos</SelectItem>
                  {(Object.keys(TRIBUTO_ROTULO) as Tributo[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TRIBUTO_ROTULO[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={tipoBeneficio}
                onValueChange={(v) => setTipoBeneficio(v as TipoBeneficio | "todos")}
              >
                <SelectTrigger className="h-11 w-[180px] rounded-[10px] border-line bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Crédito + dedutibilidade</SelectItem>
                  <SelectItem value="credito">Tipo: crédito</SelectItem>
                  <SelectItem value="dedutibilidade">Tipo: dedutibilidade</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-500" />
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Filtrar CNAE ou setor…"
                  className="h-11 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-[13px] text-text-900 outline-none transition placeholder:text-text-500 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/[0.18]"
                />
              </div>
            </div>
            {regime !== "lucro_real" && (
              <p className="font-mono text-[11px] tracking-[0.02em] text-conf-media-text">
                * {REGIME_ROTULO[regime]}: células marcadas mudam — Simples Nacional recolhe
                PIS/COFINS unificado (sem crédito) e Lucro Presumido usa regime cumulativo.
              </p>
            )}

            {matriz.isLoading && (
              <div className="rounded-[14px] border border-line-dark bg-ink-900 p-5">
                <Skeleton className="mb-4 h-6 w-64 bg-ink-800" />
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="mb-3 h-11 w-full bg-ink-800" />
                ))}
              </div>
            )}
            {matriz.isError && (
              <div className="rounded-[14px] border border-line bg-surface px-5 py-10 text-center shadow-card">
                <p className="text-[13px] text-red-500">
                  Não foi possível carregar a matriz de elegibilidade.
                </p>
              </div>
            )}
            {matriz.data && (
              <MatrizElegibilidade
                regras={regras}
                versao={versao}
                regime={regime}
                tributo={tributo}
                tipoBeneficio={tipoBeneficio}
                busca={busca}
                cnaeEmpresa={activeCompany?.cnaePrincipal ?? null}
                onCellClick={setSelecao}
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="timeline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <LinhaDoTempo />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trilha de auditoria (RF-04) — sempre visível */}
      <AuditoriaTimeline empresaId={activeCompany?.id ?? null} />

      {/* Disclaimer da página */}
      <div className="flex items-start gap-3 rounded-[12px] border border-conf-media-dot/25 bg-conf-media-bg px-4 py-3">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-conf-media-text" />
        <p className="text-[13px] leading-relaxed text-conf-media-text">
          Classificações de média confiança devem ser validadas por um advogado tributarista. A
          matriz é informativa e reflete as versões de regra cadastradas — não é aconselhamento
          jurídico.
        </p>
      </div>

      <RegraDetalheModal selecao={selecao} onClose={() => setSelecao(null)} />
    </div>
  )
}
