import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router"
import { motion } from "framer-motion"
import { toast } from "sonner"
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  CirclePlus,
  Clock,
  FileWarning,
  Info,
  Receipt,
  ScanLine,
} from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { endOfDay, format, subDays, subMonths } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { DateRange } from "react-day-picker"

import { trpc } from "@/providers/trpc"
import { useActiveCompany } from "@/hooks/useActiveCompany"
import MoneyValue from "@/components/app/MoneyValue"
import ConfidenceBadge from "@/components/app/ConfidenceBadge"
import OnboardingChecklist from "@/components/app/OnboardingChecklist"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { CategoriaDespesa, NivelConfianca } from "@contracts/types"
import {
  CATEGORIA_COR,
  CATEGORIA_ICON,
  CATEGORIA_LABEL,
  CONFIANCA_COR,
  CONFIANCA_LABEL,
  CONFIANCA_ORDER,
  REGIME_LABEL,
  STATUS_DESPESA_CLASSES,
  STATUS_DESPESA_LABEL,
  formatDataPtBR,
  parseDataLocal,
  toISODate,
} from "@/components/painel/fiscal"
// ─────────────────────────────────────────────────────────────────────────────
// Período (filtro client-side — a API de resumo é global por empresa)
// ─────────────────────────────────────────────────────────────────────────────

type PeriodoKey = "30d" | "90d" | "12m" | "ano" | "custom"

interface PeriodoFaixa {
  inicio: Date
  fim: Date
  rotulo: string
}

const PERIODOS_FIXOS: { key: Exclude<PeriodoKey, "custom">; rotulo: string }[] = [
  { key: "30d", rotulo: "30d" },
  { key: "90d", rotulo: "90d" },
  { key: "12m", rotulo: "12m" },
  { key: "ano", rotulo: String(new Date().getFullYear()) },
]

function faixaDoPeriodo(key: PeriodoKey, custom: DateRange | undefined): PeriodoFaixa {
  const agora = new Date()
  const fim = endOfDay(agora)
  switch (key) {
    case "30d":
      return { inicio: subDays(agora, 29), fim, rotulo: "últimos 30 dias" }
    case "90d":
      return { inicio: subDays(agora, 89), fim, rotulo: "últimos 90 dias" }
    case "12m":
      return { inicio: subMonths(agora, 12), fim, rotulo: "últimos 12 meses" }
    case "ano":
      return { inicio: new Date(agora.getFullYear(), 0, 1), fim, rotulo: `ano de ${agora.getFullYear()}` }
    case "custom": {
      const inicio = custom?.from ?? subDays(agora, 89)
      const fimCustom = custom?.to ? endOfDay(custom.to) : fim
      return {
        inicio,
        fim: fimCustom,
        rotulo: `${format(inicio, "dd/MM")} – ${format(fimCustom, "dd/MM/yyyy")}`,
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes locais
// ─────────────────────────────────────────────────────────────────────────────

const KPI_CORES = {
  neutral: "text-text-900",
  positive: "text-brand-500",
  amber: "text-amber-500",
} as const

interface KpiCardProps {
  caption: string
  tooltip: string
  value: number
  cor: keyof typeof KPI_CORES
  icone?: React.ReactNode
  rodape: React.ReactNode
  spark?: number[]
}

/** StatCard do RF-08 com ícone, tooltip conceitual e rodapé mono. */
function KpiCard({ caption, tooltip, value, cor, icone, rodape, spark }: KpiCardProps) {
  const sparkData = spark?.map((v, i) => ({ i, v }))
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">
            {caption}
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label={`Sobre ${caption}`} className="text-text-500/70 transition-colors hover:text-text-900">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 text-[12px]">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </span>
          <span className={cn("flex items-center gap-2 font-mono text-[30px] font-semibold tabular tracking-[-0.01em]", KPI_CORES[cor])}>
            <MoneyValue value={value} size="xl" color="neutral" animate className={cn("!text-[30px]", KPI_CORES[cor])} />
            {icone}
          </span>
        </div>
        {sparkData && sparkData.length > 1 && (
          <div className="h-12 w-28 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={cor === "amber" ? "#D97706" : "#0EA968"}
                  strokeWidth={2}
                  fill={cor === "amber" ? "#D97706" : "#0EA968"}
                  fillOpacity={0.12}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="border-t border-dashed border-line pt-2.5 font-mono text-[11px] tracking-[0.02em] text-text-500">
        {rodape}
      </div>
    </div>
  )
}

interface EvolucaoTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ dataKey?: string | number; value?: number | string }>
  label?: string | number
  categorias: CategoriaDespesa[]
}

function EvolucaoTooltip({ active, payload, label, categorias }: EvolucaoTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const total = payload.reduce((s, p) => s + (typeof p.value === "number" ? p.value : 0), 0)
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-3 shadow-card">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.04em] text-text-500">{label}</p>
      <div className="flex flex-col gap-1.5">
        {categorias.map((cat) => {
          const ponto = payload.find((p) => p.dataKey === cat)
          const valor = typeof ponto?.value === "number" ? ponto.value : 0
          if (valor === 0) return null
          return (
            <span key={cat} className="flex items-center gap-2 text-[12px]">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORIA_COR[cat] }} />
              <span className="flex-1 text-text-500">{CATEGORIA_LABEL[cat]}</span>
              <MoneyValue value={valor} size="sm" />
            </span>
          )
        })}
        <span className="mt-1 flex items-center justify-between gap-6 border-t border-line pt-1.5 text-[12px] font-semibold">
          <span className="text-text-900">Total</span>
          <MoneyValue value={total} size="sm" />
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const { activeCompany, isLoading: carregandoEmpresa } = useActiveCompany()
  const empresaId = activeCompany?.id

  const [periodo, setPeriodo] = useState<PeriodoKey>("90d")
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined)
  const [tempRange, setTempRange] = useState<DateRange | undefined>(undefined)
  const [customAberto, setCustomAberto] = useState(false)
  const [serie, setSerie] = useState<"identificado" | "capturavel">("identificado")

  const resumo = trpc.dashboard.resumo.useQuery(
    { empresaId: empresaId ?? 0 },
    { enabled: empresaId !== undefined, retry: false },
  )
  const despesasQ = trpc.despesas.list.useQuery(
    { empresaId: empresaId ?? 0 },
    { enabled: empresaId !== undefined, retry: false },
  )

  useEffect(() => {
    if (resumo.error) toast.error("Não foi possível carregar o resumo do dashboard.")
  }, [resumo.error])
  useEffect(() => {
    if (despesasQ.error) toast.error("Não foi possível carregar as despesas.")
  }, [despesasQ.error])

  // Count-up dos KPIs na primeira visualização (0 → valor real).
  const [animReady, setAnimReady] = useState(false)
  useEffect(() => {
    if (resumo.data && !animReady) {
      const raf = requestAnimationFrame(() => setAnimReady(true))
      return () => cancelAnimationFrame(raf)
    }
  }, [resumo.data, animReady])
  const k = (valor: number | undefined) => (animReady ? (valor ?? 0) : 0)

  const faixa = useMemo(() => faixaDoPeriodo(periodo, customRange), [periodo, customRange])

  const despesas = useMemo(() => despesasQ.data ?? [], [despesasQ.data])

  const filtradas = useMemo(
    () =>
      despesas.filter((d) => {
        const data = d.dataFatoGerador ? parseDataLocal(d.dataFatoGerador) : new Date(d.createdAt)
        return data >= faixa.inicio && data <= faixa.fim
      }),
    [despesas, faixa],
  )

  // Buckets adaptativos: diário até 60 dias, mensal acima.
  const granularidadeDia = useMemo(
    () => faixa.fim.getTime() - faixa.inicio.getTime() <= 60 * 24 * 60 * 60 * 1000,
    [faixa],
  )

  const bucketInfo = useMemo(() => {
    const mapa = new Map<string, { rotulo: string; ordem: number }>()
    for (const d of filtradas) {
      const data = d.dataFatoGerador ? parseDataLocal(d.dataFatoGerador) : new Date(d.createdAt)
      const chave = granularidadeDia ? toISODate(data) : toISODate(data).slice(0, 7)
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          rotulo: granularidadeDia
            ? format(data, "dd/MM")
            : format(data, "MMM yy", { locale: ptBR }),
          ordem: data.getTime(),
        })
      }
    }
    return [...mapa.entries()]
      .sort((a, b) => a[1].ordem - b[1].ordem)
      .map(([chave, info]) => ({ chave, rotulo: info.rotulo }))
  }, [filtradas, granularidadeDia])

  const categoriasPresentes = useMemo(() => {
    const set = new Set<CategoriaDespesa>()
    for (const d of filtradas) if (d.categoria) set.add(d.categoria)
    return (Object.keys(CATEGORIA_LABEL) as CategoriaDespesa[]).filter((c) => set.has(c))
  }, [filtradas])

  const chartData = useMemo(
    () =>
      bucketInfo.map(({ chave, rotulo }) => {
        const ponto: Record<string, string | number> = { bucket: rotulo }
        for (const cat of categoriasPresentes) {
          ponto[cat] = filtradas
            .filter((d) => {
              const data = d.dataFatoGerador ? parseDataLocal(d.dataFatoGerador) : new Date(d.createdAt)
              const chaveD = granularidadeDia ? toISODate(data) : toISODate(data).slice(0, 7)
              return chaveD === chave && d.categoria === cat && (serie === "identificado" || d.confianca === "alta")
            })
            .reduce((s, d) => s + d.valorFiscal, 0)
        }
        return ponto
      }),
    [bucketInfo, categoriasPresentes, filtradas, granularidadeDia, serie],
  )

  const donut = useMemo(() => {
    const porNivel = new Map<NivelConfianca, { count: number; total: number }>()
    for (const d of filtradas) {
      const atual = porNivel.get(d.confianca) ?? { count: 0, total: 0 }
      atual.count += 1
      atual.total += d.valorFiscal
      porNivel.set(d.confianca, atual)
    }
    return CONFIANCA_ORDER.map((nivel) => ({
      nivel,
      count: porNivel.get(nivel)?.count ?? 0,
      total: porNivel.get(nivel)?.total ?? 0,
    }))
  }, [filtradas])

  const donutTotal = donut.reduce((s, d) => s + d.count, 0)
  const donutData = donut.filter((d) => d.count > 0)

  // Sparklines mensais (12m) por KPI, sempre sobre a base completa.
  const sparks = useMemo(() => {
    const base = new Map<string, { identificado: number; capturavel: number; revisao: number }>()
    for (let i = 11; i >= 0; i--) {
      const data = subMonths(new Date(), i)
      base.set(toISODate(data).slice(0, 7), { identificado: 0, capturavel: 0, revisao: 0 })
    }
    for (const d of despesas) {
      const iso = d.dataFatoGerador ?? toISODate(new Date(d.createdAt))
      const chave = iso.slice(0, 7)
      const bucket = base.get(chave)
      if (!bucket) continue
      bucket.identificado += d.valorFiscal
      if (d.confianca === "alta") bucket.capturavel += d.valorFiscal
      if (d.status === "em_revisao") bucket.revisao += d.valorFiscal
    }
    const valores = [...base.values()]
    return {
      identificado: valores.map((v) => v.identificado),
      capturavel: valores.map((v) => v.capturavel),
      revisao: valores.map((v) => v.revisao),
    }
  }, [despesas])

  const recentes = useMemo(() => despesas.slice(0, 5), [despesas])

  const countAlta = useMemo(() => despesas.filter((d) => d.confianca === "alta").length, [despesas])

  const pendencias = useMemo(() => {
    const itens: {
      icone: React.ReactNode
      texto: string
      cta: string
      to: string
      destaque: "red" | "amber"
    }[] = []
    if (activeCompany && activeCompany.cadastroCompleto === false) {
      itens.push({
        icone: <Building2 className="h-4 w-4" />,
        texto: "Cadastro da empresa incompleto",
        cta: "Completar",
        to: "/app/empresas",
        destaque: "red",
      })
    }
    const semEvidencia = resumo.data?.despesasSemEvidencia ?? 0
    if (semEvidencia > 0) {
      itens.push({
        icone: <FileWarning className="h-4 w-4" />,
        texto: `${semEvidencia} ${semEvidencia === 1 ? "despesa aguardando" : "despesas aguardando"} evidência documental`,
        cta: "Enviar",
        to: "/app/revisao",
        destaque: "amber",
      })
    }
    const emRevisao = resumo.data?.pendenciasRevisao ?? 0
    if (emRevisao > 0) {
      itens.push({
        icone: <ScanLine className="h-4 w-4" />,
        texto: `${emRevisao} ${emRevisao === 1 ? "despesa aguardando" : "despesas aguardando"} revisão humana`,
        cta: "Revisar",
        to: "/app/revisao",
        destaque: "amber",
      })
    }
    return itens
  }, [activeCompany, resumo.data])

  const semDados = resumo.data !== undefined && resumo.data.totalDespesas === 0

  // ── Estados de carregamento / sem empresa ──────────────────────────────────
  if (carregandoEmpresa || (empresaId !== undefined && resumo.isLoading && despesasQ.isLoading)) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!carregandoEmpresa && !activeCompany) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="flex flex-col gap-6"
      >
        <OnboardingChecklist />
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface px-8 py-16 text-center">
          <img src="/empty-despesas.svg" alt="" className="h-auto w-56" />
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
              Nenhuma empresa cadastrada
            </h1>
            <p className="max-w-sm text-sm text-text-500">
              Cadastre uma empresa para começar a identificar créditos tributários sobre as despesas.
            </p>
          </div>
          <Link
            to="/app/empresas?nova=1"
            className="mt-1 inline-flex h-10 items-center gap-2 rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
          >
            <CirclePlus className="h-4 w-4" /> Cadastrar empresa
          </Link>
        </div>
      </motion.div>
    )
  }

  const subtitulo = activeCompany
    ? `${activeCompany.razaoSocial} · ${REGIME_LABEL[activeCompany.regimeTributario]} · ${activeCompany.uf} · ${faixa.rotulo}`
    : ""

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      {/* ── Onboarding (v1.2.0) ───────────────────────────────────────────── */}
      <OnboardingChecklist />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-text-900">
            Dashboard
          </h1>
          <p className="font-mono text-[12px] tracking-[0.02em] text-text-500">{subtitulo}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-9 items-center gap-0.5 rounded-[10px] border border-line bg-surface p-0.5">
            {PERIODOS_FIXOS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriodo(p.key)}
                className={cn(
                  "h-8 rounded-lg px-3 text-[13px] font-semibold transition-colors",
                  periodo === p.key ? "bg-brand-500 text-white" : "text-text-500 hover:bg-paper hover:text-text-900",
                )}
              >
                {p.rotulo}
              </button>
            ))}
            <Popover open={customAberto} onOpenChange={setCustomAberto}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors",
                    periodo === "custom" ? "bg-brand-500 text-white" : "text-text-500 hover:bg-paper hover:text-text-900",
                  )}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  {periodo === "custom" ? faixa.rotulo : "Personalizado"}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  locale={ptBR}
                  selected={tempRange}
                  onSelect={setTempRange}
                  defaultMonth={tempRange?.from ?? subMonths(new Date(), 1)}
                />
                <div className="flex items-center justify-end gap-2 border-t border-line p-3">
                  <button
                    type="button"
                    onClick={() => setCustomAberto(false)}
                    className="h-9 rounded-[10px] border border-line px-3.5 text-[13px] font-semibold text-text-500 transition-colors hover:bg-paper"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!tempRange?.from}
                    onClick={() => {
                      setCustomRange(tempRange)
                      setPeriodo("custom")
                      setCustomAberto(false)
                    }}
                    className="h-9 rounded-[10px] bg-brand-500 px-3.5 text-[13px] font-semibold text-white transition hover:bg-brand-500/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Aplicar
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <Link
            to="/app/despesas/nova"
            className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-brand-500 px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
          >
            <CirclePlus className="h-4 w-4" /> Nova despesa
          </Link>
        </div>
      </motion.div>

      {/* ── Row 1: KPIs (RF-08) ────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        {(
          [
            {
              caption: "Identificado",
              tooltip: "Soma do potencial de crédito + dedutibilidade detectado, antes de qualquer validação.",
              valor: resumo.data?.valorIdentificado ?? 0,
              cor: "neutral" as const,
              icone: undefined,
              rodape: `${resumo.data?.totalDespesas ?? 0} notas processadas`,
              spark: sparks.identificado,
            },
            {
              caption: "Capturável",
              tooltip: "Créditos de alta confiança, apurados e prontos para recuperar.",
              valor: resumo.data?.valorCapturavel ?? 0,
              cor: "positive" as const,
              icone: <Check className="h-5 w-5 text-brand-500" />,
              rodape: `${countAlta} ${countAlta === 1 ? "despesa" : "despesas"} em alta confiança`,
              spark: sparks.capturavel,
            },
            {
              caption: "Em revisão",
              tooltip: "Classificações de média confiança aguardando validação humana antes de efetivar créditos.",
              valor: resumo.data?.valorEmRevisao ?? 0,
              cor: "amber" as const,
              icone: <Clock className="h-5 w-5 text-amber-500" />,
              rodape: (
                <span className="flex items-center justify-between gap-2">
                  <span>
                    {resumo.data?.pendenciasRevisao ?? 0}{" "}
                    {(resumo.data?.pendenciasRevisao ?? 0) === 1 ? "despesa" : "despesas"}
                  </span>
                  <Link
                    to="/app/revisao"
                    className="group inline-flex items-center gap-1 font-semibold text-amber-500 transition-colors hover:text-conf-media-text"
                  >
                    Ir para a fila
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </span>
              ),
              spark: sparks.revisao,
            },
          ]
        ).map((card, i) => (
          <motion.div
            key={card.caption}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut", delay: 0.08 * i }}
          >
            <KpiCard
              caption={card.caption}
              tooltip={card.tooltip}
              value={k(card.valor)}
              cor={card.cor}
              icone={card.icone}
              rodape={card.rodape}
              spark={card.spark}
            />
          </motion.div>
        ))}
      </div>

      {semDados ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface px-8 py-16 text-center">
          <img src="/empty-despesas.svg" alt="" className="h-auto w-56" />
          <div className="flex flex-col gap-1">
            <h3 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
              Nenhuma despesa processada ainda
            </h3>
            <p className="max-w-sm text-sm text-text-500">
              Envie a primeira nota fiscal para o motor classificar créditos e dedutibilidade.
            </p>
          </div>
          <Link
            to="/app/despesas/nova"
            className="mt-1 inline-flex h-10 items-center gap-2 rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
          >
            <CirclePlus className="h-4 w-4" /> Nova despesa
          </Link>
        </div>
      ) : (
        <>
          {/* ── Row 2: evolução por categoria + donut de confiança ─────────── */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-line bg-surface p-5 shadow-card lg:col-span-2">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <h2 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
                    Evolução por categoria
                  </h2>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {categoriasPresentes.map((cat) => (
                      <span key={cat} className="flex items-center gap-1.5 text-[12px] text-text-500">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORIA_COR[cat] }} />
                        {CATEGORIA_LABEL[cat]}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="inline-flex h-8 items-center gap-0.5 rounded-[10px] border border-line p-0.5">
                  {(
                    [
                      { key: "identificado", rotulo: "Identificado" },
                      { key: "capturavel", rotulo: "Capturável" },
                    ] as const
                  ).map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setSerie(s.key)}
                      className={cn(
                        "h-7 rounded-lg px-3 text-[12px] font-semibold transition-colors",
                        serie === s.key ? "bg-brand-500 text-white" : "text-text-500 hover:bg-paper hover:text-text-900",
                      )}
                    >
                      {s.rotulo}
                    </button>
                  ))}
                </div>
              </div>
              {chartData.length === 0 ? (
                <div className="flex h-64 items-center justify-center font-mono text-[11px] uppercase tracking-[0.06em] text-text-500">
                  Sem dados no período selecionado
                </div>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E3E8E2" vertical={false} />
                      <XAxis
                        dataKey="bucket"
                        tick={{ fontSize: 12, fill: "#5B6762" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        width={56}
                        tick={{ fontSize: 11, fill: "#5B6762", fontFamily: '"JetBrains Mono", monospace' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) =>
                          v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k` : String(v)
                        }
                      />
                      <RechartsTooltip
                        content={<EvolucaoTooltip categorias={categoriasPresentes} />}
                        cursor={{ stroke: "#E3E8E2" }}
                      />
                      {categoriasPresentes.map((cat, i) => (
                        <Area
                          key={`${serie}-${cat}`}
                          type="monotone"
                          dataKey={cat}
                          stackId="1"
                          stroke={CATEGORIA_COR[cat]}
                          fill={CATEGORIA_COR[cat]}
                          fillOpacity={0.45}
                          strokeWidth={2}
                          animationDuration={600}
                          animationBegin={i * 100}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="flex flex-col rounded-xl border border-line bg-surface p-5 shadow-card">
              <h2 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
                Classificações
              </h2>
              {donutTotal === 0 ? (
                <div className="flex flex-1 items-center justify-center font-mono text-[11px] uppercase tracking-[0.06em] text-text-500">
                  Sem dados no período
                </div>
              ) : (
                <>
                  <div className="relative mx-auto mt-2 h-48 w-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutData}
                          dataKey="count"
                          nameKey="nivel"
                          innerRadius="64%"
                          outerRadius="88%"
                          paddingAngle={2}
                          startAngle={90}
                          endAngle={-270}
                          animationDuration={700}
                        >
                          {donutData.map((d) => (
                            <Cell key={d.nivel} fill={CONFIANCA_COR[d.nivel]} stroke="none" />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value, name) => [
                            `${value} ${Number(value) === 1 ? "despesa" : "despesas"}`,
                            CONFIANCA_LABEL[name as NivelConfianca] ?? String(name),
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-mono text-[28px] font-semibold tabular text-text-900">{donutTotal}</span>
                      <span className="text-[12px] text-text-500">despesas</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-1">
                    {donut.map((d) => (
                      <button
                        key={d.nivel}
                        type="button"
                        onClick={() => navigate(`/app/despesas?confianca=${d.nivel}`)}
                        className="group flex h-9 items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-paper"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CONFIANCA_COR[d.nivel] }} />
                        <span className="flex-1 text-[13px] font-medium text-text-900">
                          {CONFIANCA_LABEL[d.nivel]}
                        </span>
                        <span className="font-mono text-[12px] tabular text-text-500">{d.count}</span>
                        <MoneyValue value={d.total} size="sm" color="muted" />
                        <ArrowRight className="h-3.5 w-3.5 text-text-500 opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Row 3: pendências + despesas recentes ──────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">Pendências</h2>
                {pendencias.length > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-conf-media-bg px-1.5 font-mono text-[11px] font-semibold tabular text-conf-media-text">
                    {pendencias.length}
                  </span>
                )}
              </div>
              {pendencias.length === 0 ? (
                <div className="flex items-center gap-2.5 rounded-lg bg-conf-alta-bg px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-conf-alta-text" />
                  <span className="text-[13px] font-medium text-conf-alta-text">
                    Nenhuma pendência. Tudo em dia.
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {pendencias.map((p, i) => (
                    <motion.div
                      key={p.texto}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, ease: "easeOut", delay: 0.06 * i }}
                      className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5"
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          p.destaque === "red" ? "bg-conf-vedado-bg text-conf-vedado-text" : "bg-conf-media-bg text-conf-media-text",
                        )}
                      >
                        {p.icone}
                      </span>
                      <span className="flex-1 text-[13px] font-medium text-text-900">{p.texto}</span>
                      <Link
                        to={p.to}
                        className="group inline-flex items-center gap-1 text-[12px] font-semibold text-brand-500 transition-colors hover:text-brand-900"
                      >
                        {p.cta}
                        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-line bg-surface shadow-card lg:col-span-2">
              <div className="flex items-center justify-between px-5 pt-5">
                <h2 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
                  Despesas recentes
                </h2>
                <Link
                  to="/app/despesas"
                  className="group inline-flex items-center gap-1 text-[13px] font-semibold text-brand-500 transition-colors hover:text-brand-900"
                >
                  Ver todas
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
              <div className="mt-3 overflow-x-auto pb-2">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-y border-line">
                      <th className="h-10 px-5 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Data</th>
                      <th className="h-10 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Categoria</th>
                      <th className="h-10 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Fornecedor</th>
                      <th className="h-10 px-4 text-right text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Valor</th>
                      <th className="h-10 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Confiança</th>
                      <th className="h-10 px-5 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentes.map((d, i) => {
                      const Icone = d.categoria ? CATEGORIA_ICON[d.categoria] : Receipt
                      return (
                        <motion.tr
                          key={d.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut", delay: 0.04 * i }}
                          onClick={() => navigate(`/app/despesas?despesa=${d.id}`)}
                          className="h-11 cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-paper"
                        >
                          <td className="px-5 font-mono text-[13px] tabular text-text-900">
                            {formatDataPtBR(d.dataFatoGerador)}
                          </td>
                          <td className="px-4">
                            <span className="flex items-center gap-2 text-[13px] font-medium text-text-900">
                              <Icone className="h-3.5 w-3.5 text-text-500" />
                              {d.categoria ? CATEGORIA_LABEL[d.categoria] : "a definir"}
                            </span>
                          </td>
                          <td className="max-w-40 truncate px-4 text-[13px] text-text-500">
                            {d.colaborador ?? "—"}
                          </td>
                          <td className="px-4 text-right">
                            <MoneyValue value={d.valorFiscal} size="sm" />
                          </td>
                          <td className="px-4">
                            <ConfidenceBadge level={d.confianca} variant="outline" />
                          </td>
                          <td className="px-5">
                            <span
                              className={cn(
                                "inline-flex h-6 items-center rounded-full px-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.04em]",
                                STATUS_DESPESA_CLASSES[d.status],
                              )}
                            >
                              {STATUS_DESPESA_LABEL[d.status]}
                            </span>
                          </td>
                        </motion.tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </motion.div>
  )
}
