import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "sonner"
import {
  CalendarDays,
  Check,
  ChevronDown,
  Eraser,
  FileChartColumn,
  TriangleAlert,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { endOfDay, format, startOfMonth, subDays, subMonths } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { DateRange } from "react-day-picker"

import { trpc } from "@/providers/trpc"
import { useActiveCompany } from "@/hooks/useActiveCompany"
import ExportButtons from "@/components/app/ExportButtons"
import MoneyValue from "@/components/app/MoneyValue"
import ConfidenceBadge from "@/components/app/ConfidenceBadge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/format"
import type { CategoriaDespesa, NivelConfianca, RelatorioLinha, Tributo } from "@contracts/types"
import {
  CATEGORIA_ICON,
  CATEGORIA_LABEL,
  CONFIANCA_COR,
  CONFIANCA_LABEL,
  CONFIANCA_ORDER,
  REGIME_LABEL,
  STATUS_DESPESA_CLASSES,
  STATUS_DESPESA_LABEL,
  TRIBUTO_LABEL,
  formatDataPtBR,
  parseDataLocal,
  toISODate,
} from "@/components/painel/fiscal"

// ─────────────────────────────────────────────────────────────────────────────
// Filtros (RF-06) — chips de tributo separam IRPJ/CSLL; a API usa irpj_csll
// ─────────────────────────────────────────────────────────────────────────────

type ChipTributo = "pis_cofins" | "icms" | "cbs" | "ibs" | "irpj" | "csll"

const TRIBUTO_CHIPS: { key: ChipTributo; rotulo: string }[] = [
  { key: "pis_cofins", rotulo: "PIS/COFINS" },
  { key: "icms", rotulo: "ICMS" },
  { key: "cbs", rotulo: "CBS" },
  { key: "ibs", rotulo: "IBS" },
  { key: "irpj", rotulo: "IRPJ" },
  { key: "csll", rotulo: "CSLL" },
]

function chipParaTributo(chip: ChipTributo): Tributo {
  return chip === "irpj" || chip === "csll" ? "irpj_csll" : chip
}

function tributoCasaComChips(tributo: Tributo | null, chips: Set<ChipTributo>): boolean {
  if (chips.size === 0) return true
  if (tributo === null) return false
  if (tributo === "irpj_csll") return chips.has("irpj") || chips.has("csll")
  return chips.has(tributo)
}

function lerConjunto<T extends string>(bruto: string | null, validos: readonly T[]): Set<T> {
  if (!bruto) return new Set()
  return new Set(bruto.split(",").filter((v): v is T => (validos as readonly string[]).includes(v)))
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes locais
// ─────────────────────────────────────────────────────────────────────────────

interface ChipFiltroProps {
  ativo: boolean
  onClick: () => void
  dot?: string
  children: React.ReactNode
}

function ChipFiltro({ ativo, onClick, dot, children }: ChipFiltroProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-all",
        ativo
          ? "border-brand-500 bg-brand-500/10 text-brand-500"
          : "border-line bg-surface text-text-500 hover:border-text-500/40 hover:text-text-900",
      )}
    >
      {dot && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dot }} />}
      {children}
      {ativo && (
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.15 }}>
          <Check className="h-3 w-3" />
        </motion.span>
      )}
    </button>
  )
}

const BENEFICIO_LABEL: Record<string, string> = {
  credito: "Crédito",
  dedutibilidade: "Dedutibilidade",
}

// ─────────────────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────────────────

export default function Relatorios() {
  const navigate = useNavigate()
  const { activeCompany, companies, isLoading: carregandoEmpresa } = useActiveCompany()
  const [searchParams, setSearchParams] = useSearchParams()

  // Período padrão: últimos 90 dias (design: default view = empresa atual, 90d).
  const padrao = useMemo(() => {
    const agora = new Date()
    return { de: toISODate(subDays(agora, 89)), ate: toISODate(agora) }
  }, [])

  const de = searchParams.get("de") ?? padrao.de
  const ate = searchParams.get("ate") ?? padrao.ate
  const tributosSel = useMemo(
    () => lerConjunto(searchParams.get("tributos"), TRIBUTO_CHIPS.map((t) => t.key)),
    [searchParams],
  )
  const confSel = useMemo(
    () => lerConjunto(searchParams.get("confianca"), CONFIANCA_ORDER),
    [searchParams],
  )
  const empresaParam = Number(searchParams.get("empresa")) || undefined
  const empresaId = companies.find((c) => c.id === empresaParam)?.id ?? activeCompany?.id
  const empresaRelatorio = companies.find((c) => c.id === empresaId) ?? activeCompany

  function atualizar(chaves: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(chaves)) {
      if (v === null || v === "") next.delete(k)
      else next.set(k, v)
    }
    setSearchParams(next, { replace: true })
  }

  function alternarTributo(chip: ChipTributo) {
    const next = new Set(tributosSel)
    if (next.has(chip)) next.delete(chip)
    else next.add(chip)
    atualizar({ tributos: [...next].join(",") || null })
  }

  function alternarConfianca(nivel: NivelConfianca) {
    const next = new Set(confSel)
    if (next.has(nivel)) next.delete(nivel)
    else next.add(nivel)
    atualizar({ confianca: [...next].join(",") || null })
  }

  function limpar() {
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  // A API aceita um único tributo/confiança — passa quando há seleção única;
  // seleção múltipla é refinada no cliente sobre as linhas retornadas.
  const apiTributos = useMemo(
    () => new Set([...tributosSel].map(chipParaTributo)),
    [tributosSel],
  )
  const tributoUnico = apiTributos.size === 1 ? ([...apiTributos][0] as Tributo) : undefined
  const confUnica = confSel.size === 1 ? ([...confSel][0] as NivelConfianca) : undefined

  const filtroApi = useMemo(
    () => ({
      empresaId: empresaId ?? 0,
      dataInicio: de,
      dataFim: ate,
      tributo: tributoUnico,
      confianca: confUnica,
    }),
    [empresaId, de, ate, tributoUnico, confUnica],
  )

  const rel = trpc.relatorios.gerar.useQuery(filtroApi, {
    enabled: empresaId !== undefined,
    retry: false,
  })

  const csvQuery = trpc.relatorios.exportarCsv.useQuery(filtroApi, {
    enabled: false,
    retry: false,
  })

  useEffect(() => {
    if (rel.error) toast.error("Não foi possível gerar o relatório.")
  }, [rel.error])

  // Count-up da banda de totais na primeira chegada dos dados.
  const [animReady, setAnimReady] = useState(false)
  useEffect(() => {
    if (rel.data && !animReady) {
      const raf = requestAnimationFrame(() => setAnimReady(true))
      return () => cancelAnimationFrame(raf)
    }
  }, [rel.data, animReady])
  const k = (valor: number) => (animReady ? valor : 0)

  const linhas = useMemo(
    () =>
      (rel.data?.linhas ?? []).filter(
        (l) =>
          tributoCasaComChips(l.tributo, tributosSel) &&
          (confSel.size === 0 || confSel.has(l.confianca)),
      ),
    [rel.data, tributosSel, confSel],
  )

  // Totais: despesa distinta para valores fiscais; créditos por linha (join duplica).
  const totais = useMemo(() => {
    const distintas = new Map<number, RelatorioLinha>()
    for (const l of linhas) distintas.set(l.despesaId, l)
    const porTributo: Record<Tributo, number> = {
      pis_cofins: 0,
      icms: 0,
      cbs: 0,
      ibs: 0,
      irpj_csll: 0,
    }
    let creditos = 0
    let dedutibilidade = 0
    for (const l of linhas) {
      if (l.tributo && l.valorCredito !== null) porTributo[l.tributo] += l.valorCredito
      if (l.tipoBeneficio === "credito") creditos += l.valorCredito ?? 0
      if (l.tipoBeneficio === "dedutibilidade") dedutibilidade += l.valorCredito ?? 0
    }
    return {
      valorFiscal: [...distintas.values()].reduce((s, l) => s + l.valorFiscal, 0),
      valorReembolsavel: [...distintas.values()].reduce((s, l) => s + l.valorReembolsavel, 0),
      creditos,
      dedutibilidade,
      porTributo,
      despesas: distintas.size,
    }
  }, [linhas])

  // Stacked column: despesas distintas por mês × confiança.
  const confPorMes = useMemo(() => {
    const distintas = new Map<number, RelatorioLinha>()
    for (const l of linhas) distintas.set(l.despesaId, l)
    const meses = new Map<string, { rotulo: string; ordem: number } & Record<NivelConfianca, number>>()
    for (const l of distintas.values()) {
      if (!l.dataFatoGerador) continue
      const data = parseDataLocal(l.dataFatoGerador)
      const chave = l.dataFatoGerador.slice(0, 7)
      const bucket =
        meses.get(chave) ??
        ({ rotulo: format(data, "MMM yy", { locale: ptBR }), ordem: data.getTime(), alta: 0, media: 0, baixa: 0, vedado: 0 } as {
          rotulo: string
          ordem: number
        } & Record<NivelConfianca, number>)
      bucket[l.confianca] += 1
      meses.set(chave, bucket)
    }
    return [...meses.entries()]
      .sort((a, b) => a[1].ordem - b[1].ordem)
      .map(([, v]) => v)
  }, [linhas])

  const confContagem = useMemo(() => {
    const contagem: Record<NivelConfianca, number> = { alta: 0, media: 0, baixa: 0, vedado: 0 }
    for (const m of confPorMes) {
      for (const n of CONFIANCA_ORDER) contagem[n] += m[n]
    }
    return contagem
  }, [confPorMes])

  // Tabela agrupada por categoria (empresa única por relatório).
  const grupos = useMemo(() => {
    const porCategoria = new Map<CategoriaDespesa, RelatorioLinha[]>()
    for (const l of linhas) {
      if (!l.categoria) continue
      const arr = porCategoria.get(l.categoria) ?? []
      arr.push(l)
      porCategoria.set(l.categoria, arr)
    }
    return (Object.keys(CATEGORIA_LABEL) as CategoriaDespesa[])
      .filter((c) => porCategoria.has(c))
      .map((c) => {
        const linhasCat = [...(porCategoria.get(c) ?? [])].sort((a, b) =>
          (a.dataFatoGerador ?? "").localeCompare(b.dataFatoGerador ?? ""),
        )
        return {
          categoria: c,
          linhas: linhasCat,
          despesas: new Set(linhasCat.map((l) => l.despesaId)).size,
          subtotal: linhasCat.reduce((s, l) => s + (l.valorCredito ?? 0), 0),
        }
      })
  }, [linhas])

  const [colapsados, setColapsados] = useState<Record<string, boolean>>({})
  function alternarGrupo(cat: string) {
    setColapsados((prev) => ({ ...prev, [cat]: !prev[cat] }))
  }

  // ── Exportação ────────────────────────────────────────────────────────────
  const [exportando, setExportando] = useState(false)

  async function exportarCsv() {
    if (empresaId === undefined) return
    setExportando(true)
    try {
      const res = await csvQuery.refetch()
      if (res.error || !res.data) throw res.error ?? new Error("Resposta vazia")
      // BOM para o Excel pt-BR interpretar acentos corretamente.
      const blob = new Blob(["﻿" + res.data.conteudo], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = res.data.nomeArquivo
      a.click()
      URL.revokeObjectURL(url)
      toast.success("CSV baixado", { description: res.data.nomeArquivo })
    } catch {
      toast.error("Falha ao gerar o CSV.")
    } finally {
      setExportando(false)
    }
  }

  function exportarPdf() {
    // View de impressão (hidden print:block) espelha a banda de totais + tabela.
    requestAnimationFrame(() => {
      window.print()
      toast.success("PDF gerado", { description: "Use “Salvar como PDF” na janela de impressão." })
    })
  }

  const periodoRotulo = `${formatDataPtBR(de)} – ${formatDataPtBR(ate)}`
  const [periodoAberto, setPeriodoAberto] = useState(false)
  const [tempRange, setTempRange] = useState<DateRange | undefined>(undefined)

  function aplicarPreset(preset: "mes" | "trimestre" | "ano") {
    const agora = new Date()
    const inicio =
      preset === "mes"
        ? startOfMonth(agora)
        : preset === "trimestre"
          ? subMonths(agora, 3)
          : new Date(agora.getFullYear(), 0, 1)
    atualizar({ de: toISODate(inicio), ate: toISODate(endOfDay(agora)) })
    setPeriodoAberto(false)
  }

  // ── Carregando / sem empresa ───────────────────────────────────────────────
  if (carregandoEmpresa) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
      </div>
    )
  }

  if (!activeCompany) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface px-8 py-16 text-center"
      >
        <img src="/empty-despesas.svg" alt="" className="h-auto w-56" />
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
            Nenhuma empresa cadastrada
          </h1>
          <p className="max-w-sm text-sm text-text-500">
            Cadastre uma empresa para gerar relatórios de créditos e dedutibilidade.
          </p>
        </div>
      </motion.div>
    )
  }

  const celulasTotais: {
    chave: Tributo | "base"
    rotulo: string
    valor: number
    dedutibilidade?: boolean
    pre2027?: boolean
  }[] = [
    { chave: "pis_cofins", rotulo: "PIS/COFINS", valor: totais.porTributo.pis_cofins },
    { chave: "icms", rotulo: "ICMS", valor: totais.porTributo.icms },
    { chave: "cbs", rotulo: "CBS", valor: totais.porTributo.cbs, pre2027: totais.porTributo.cbs === 0 },
    { chave: "ibs", rotulo: "IBS", valor: totais.porTributo.ibs, pre2027: totais.porTributo.ibs === 0 },
    { chave: "irpj_csll", rotulo: "IRPJ/CSLL · dedutibilidade", valor: totais.porTributo.irpj_csll, dedutibilidade: true },
    { chave: "base", rotulo: "Base fiscal total", valor: totais.valorFiscal },
  ]
  const maxTributo = Math.max(1, ...celulasTotais.map((c) => c.valor))

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      {/* Regras de impressão: esconde chrome do AppShell e padding da sidebar. */}
      <style>{`@media print {
  #root aside, #root header, #root footer { display: none !important; }
  #root .pl-\\[264px\\] { padding-left: 0 !important; }
  #root main { padding: 0 !important; max-width: none !important; }
}`}</style>

      <div className="flex flex-col gap-6 print:hidden">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-text-900">
            Relatórios
          </h1>
          <div className={cn(exportando && "pointer-events-none opacity-60")}>
            <ExportButtons
              disabled={empresaId === undefined || rel.isLoading}
              onExport={(formato) => {
                if (formato === "csv") void exportarCsv()
                else exportarPdf()
              }}
            />
          </div>
        </div>

        {/* ── Filtros (RF-06) ────────────────────────────────────────────── */}
        <div className="sticky top-20 z-20 rounded-xl border border-line bg-surface p-4 shadow-card">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex min-w-52 flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-500">Empresa</span>
              <Select
                value={empresaId !== undefined ? String(empresaId) : undefined}
                onValueChange={(v) => atualizar({ empresa: v })}
              >
                <SelectTrigger className="h-11 rounded-[10px] border-line">
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.razaoSocial}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-500">Período</span>
              <Popover open={periodoAberto} onOpenChange={setPeriodoAberto}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex h-11 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[13px] font-medium text-text-900 transition-colors hover:bg-paper"
                  >
                    <CalendarDays className="h-4 w-4 text-text-500" />
                    <span className="font-mono tabular">{periodoRotulo}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-text-500" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <div className="flex">
                    <div className="flex flex-col gap-1 border-r border-line p-3">
                      {(
                        [
                          { key: "mes", rotulo: "Este mês" },
                          { key: "trimestre", rotulo: "Trimestre" },
                          { key: "ano", rotulo: "Ano" },
                        ] as const
                      ).map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => aplicarPreset(p.key)}
                          className="h-8 whitespace-nowrap rounded-lg px-3 text-left text-[13px] font-medium text-text-500 transition-colors hover:bg-paper hover:text-text-900"
                        >
                          {p.rotulo}
                        </button>
                      ))}
                      <span className="mt-1 border-t border-line pt-2 font-mono text-[10px] uppercase tracking-[0.04em] text-text-500">
                        Competência customizada
                      </span>
                    </div>
                    <div>
                      <Calendar
                        mode="range"
                        numberOfMonths={2}
                        locale={ptBR}
                        selected={tempRange}
                        onSelect={setTempRange}
                        defaultMonth={parseDataLocal(de)}
                      />
                      <div className="flex items-center justify-end gap-2 border-t border-line p-3">
                        <button
                          type="button"
                          onClick={() => setPeriodoAberto(false)}
                          className="h-9 rounded-[10px] border border-line px-3.5 text-[13px] font-semibold text-text-500 transition-colors hover:bg-paper"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={!tempRange?.from}
                          onClick={() => {
                            if (!tempRange?.from) return
                            atualizar({
                              de: toISODate(tempRange.from),
                              ate: toISODate(tempRange.to ?? tempRange.from),
                            })
                            setPeriodoAberto(false)
                          }}
                          className="h-9 rounded-[10px] bg-brand-500 px-3.5 text-[13px] font-semibold text-white transition hover:bg-brand-500/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Aplicar
                        </button>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-500">Tributo</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {TRIBUTO_CHIPS.map((t) => (
                  <ChipFiltro key={t.key} ativo={tributosSel.has(t.key)} onClick={() => alternarTributo(t.key)}>
                    {t.rotulo}
                  </ChipFiltro>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-500">Confiança</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {CONFIANCA_ORDER.map((n) => (
                  <ChipFiltro
                    key={n}
                    ativo={confSel.has(n)}
                    onClick={() => alternarConfianca(n)}
                    dot={CONFIANCA_COR[n]}
                  >
                    {CONFIANCA_LABEL[n]}
                  </ChipFiltro>
                ))}
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={limpar}
                className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-line px-4 text-[13px] font-semibold text-text-500 transition-colors hover:bg-paper hover:text-text-900"
              >
                <Eraser className="h-4 w-4" /> Limpar
              </button>
              <button
                type="button"
                onClick={() => void rel.refetch()}
                className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-brand-500 px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
              >
                <FileChartColumn className="h-4 w-4" /> Gerar relatório
              </button>
            </div>
          </div>
        </div>

        {/* ── Resultados ─────────────────────────────────────────────────── */}
        {rel.isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-44 rounded-xl" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-72 rounded-xl" />
              <Skeleton className="h-72 rounded-xl" />
            </div>
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 animate-pulse rounded-xl" />
              ))}
            </div>
          </div>
        ) : linhas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface px-8 py-16 text-center">
            <img src="/empty-despesas.svg" alt="" className="h-auto w-56" />
            <div className="flex flex-col gap-1">
              <h3 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
                Nenhum dado para este recorte.
              </h3>
              <p className="max-w-sm text-sm text-text-500">
                Não há despesas que correspondam aos filtros aplicados.
              </p>
            </div>
            <button
              type="button"
              onClick={limpar}
              className="mt-1 inline-flex h-10 items-center rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
            >
              Ajustar filtros
            </button>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${empresaId}-${de}-${ate}-${[...tributosSel].join()}-${[...confSel].join()}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className={cn("flex flex-col gap-4", rel.isFetching && "animate-pulse")}
            >
              {/* Row 1 — banda de totais (dark, receipt-style) */}
              <div className="rounded-xl bg-ink-900 p-6 shadow-card">
                <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-dark-400">
                  Apuração consolidada · {empresaRelatorio?.razaoSocial ?? "—"} · {periodoRotulo}
                </p>
                <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_auto]">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                    {celulasTotais.map((c) => (
                      <div key={c.chave} className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-dark-400">
                          {c.rotulo}
                        </span>
                        {c.pre2027 ? (
                          <span className="font-mono text-[15px] tabular text-text-dark-400">
                            R$ 0,00 <span className="text-[11px]">(pré-2027)</span>
                          </span>
                        ) : (
                          <MoneyValue
                            value={k(c.valor)}
                            size="md"
                            animate
                            className={cn("!text-lg", c.dedutibilidade ? "text-text-dark-100/80" : "text-text-dark-100")}
                          />
                        )}
                        <div className="mt-1 h-1 w-full max-w-28 rounded-full bg-line-dark">
                          <div
                            className={cn("h-1 rounded-full", c.dedutibilidade ? "bg-text-dark-400" : "bg-brand-400")}
                            style={{ width: `${Math.max(2, (c.valor / maxTributo) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col justify-center gap-1 border-t border-line-dark pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                    <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-dark-400">
                      Total capturável
                    </span>
                    <MoneyValue value={k(totais.creditos)} size="xl" animate className="!text-[32px] text-brand-400" />
                    <p className="max-w-60 font-mono text-[11px] leading-relaxed tracking-[0.02em] text-text-dark-400">
                      créditos e dedutibilidade em trilhas paralelas — totais apresentados separados, nunca somados
                    </p>
                  </div>
                </div>
              </div>

              {/* Row 2 — charts */}
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                  <h2 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">Por tributo</h2>
                  <div className="mt-3 h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={celulasTotais.filter((c) => c.chave !== "base")} layout="vertical" margin={{ top: 4, right: 96, bottom: 4, left: 8 }}>
                        <CartesianGrid horizontal={false} stroke="#E3E8E2" strokeDasharray="3 3" />
                        <XAxis type="number" hide />
                        <YAxis
                          type="category"
                          dataKey="rotulo"
                          width={86}
                          tick={{ fontSize: 12, fill: "#5B6762" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <RechartsTooltip
                          formatter={(v) => [formatBRL(Number(v)), "Valor"]}
                          cursor={{ fill: "#F4F6F3" }}
                        />
                        <Bar dataKey="valor" radius={[0, 6, 6, 0]} animationDuration={600}>
                          {celulasTotais
                            .filter((c) => c.chave !== "base")
                            .map((c, i) => (
                              <Cell
                                key={c.chave}
                                fill="#0EA968"
                                fillOpacity={c.dedutibilidade ? 0.35 : 1}
                                // barras crescem em cascata
                                style={{ transitionDelay: `${i * 80}ms` }}
                              />
                            ))}
                          <LabelList
                            dataKey="valor"
                            position="right"
                            formatter={(v: unknown) => formatBRL(Number(v))}
                            style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fill: "#101613" }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 font-mono text-[11px] tracking-[0.02em] text-text-500">
                    IRPJ/CSLL em tom claro: trilha de dedutibilidade, não de crédito.
                  </p>
                </div>

                <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                  <h2 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
                    Por nível de confiança
                  </h2>
                  {confPorMes.length === 0 ? (
                    <div className="flex h-60 items-center justify-center font-mono text-[11px] uppercase tracking-[0.06em] text-text-500">
                      Sem dados datados no recorte
                    </div>
                  ) : (
                    <div className="mt-3 h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={confPorMes} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                          <CartesianGrid stroke="#E3E8E2" strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="rotulo"
                            tick={{ fontSize: 12, fill: "#5B6762" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            allowDecimals={false}
                            width={32}
                            tick={{ fontSize: 11, fill: "#5B6762", fontFamily: '"JetBrains Mono", monospace' }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <RechartsTooltip cursor={{ fill: "#F4F6F3" }} />
                          {CONFIANCA_ORDER.map((n, i) => (
                            <Bar
                              key={n}
                              dataKey={n}
                              name={CONFIANCA_LABEL[n]}
                              stackId="1"
                              fill={CONFIANCA_COR[n]}
                              animationDuration={600}
                              animationBegin={i * 60}
                              cursor="pointer"
                              onClick={() => navigate(`/app/despesas?confianca=${n}`)}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {CONFIANCA_ORDER.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => navigate(`/app/despesas?confianca=${n}`)}
                        className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12px] text-text-500 transition-colors hover:bg-paper hover:text-text-900"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CONFIANCA_COR[n] }} />
                        {CONFIANCA_LABEL[n]}
                        <span className="font-mono tabular">{confContagem[n]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Row 3 — tabela detalhada agrupada por categoria */}
              <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-line">
                        <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Data</th>
                        <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Despesa</th>
                        <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Categoria</th>
                        <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Tributo</th>
                        <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Benefício</th>
                        <th className="h-11 px-4 text-right text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Base</th>
                        <th className="h-11 px-4 text-right text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Valor</th>
                        <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Confiança</th>
                        <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupos.map((g) => {
                        const Icone = CATEGORIA_ICON[g.categoria]
                        const colapsado = colapsados[g.categoria] === true
                        return [
                          <tr key={`${g.categoria}-header`} className="border-b border-line bg-paper/60">
                            <td colSpan={9} className="p-0">
                              <button
                                type="button"
                                onClick={() => alternarGrupo(g.categoria)}
                                className="flex h-11 w-full items-center gap-2.5 px-4 text-left transition-colors hover:bg-paper"
                              >
                                <ChevronDown
                                  className={cn("h-4 w-4 text-text-500 transition-transform", colapsado && "-rotate-90")}
                                />
                                <Icone className="h-4 w-4 text-text-500" />
                                <span className="text-[13px] font-semibold text-text-900">
                                  {CATEGORIA_LABEL[g.categoria]}
                                </span>
                                <span className="font-mono text-[12px] tabular text-text-500">
                                  — {g.despesas} {g.despesas === 1 ? "despesa" : "despesas"} —
                                </span>
                                <MoneyValue value={g.subtotal} size="sm" />
                              </button>
                            </td>
                          </tr>,
                          ...(!colapsado
                            ? g.linhas.map((l, i) => (
                                <motion.tr
                                  key={`${g.categoria}-${l.despesaId}-${l.tributo ?? "sem"}-${i}`}
                                  initial={{ opacity: 0, y: 6 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.4) }}
                                  className="h-11 border-b border-line transition-colors hover:bg-paper"
                                >
                                  <td className="px-4 font-mono text-[13px] tabular text-text-900">
                                    {formatDataPtBR(l.dataFatoGerador)}
                                  </td>
                                  <td className="px-4 font-mono text-[13px] tabular text-text-500">
                                    #{l.despesaId}
                                  </td>
                                  <td className="px-4 text-[13px] text-text-900">{l.categoria ? CATEGORIA_LABEL[l.categoria] : "a definir"}</td>
                                  <td className="px-4 font-mono text-[12px] tabular text-text-900">
                                    {l.tributo ? TRIBUTO_LABEL[l.tributo] : "—"}
                                  </td>
                                  <td className="px-4 text-[13px] text-text-500">
                                    {l.tipoBeneficio ? BENEFICIO_LABEL[l.tipoBeneficio] : "—"}
                                  </td>
                                  <td className="px-4 text-right">
                                    <MoneyValue value={l.valorFiscal} size="sm" />
                                  </td>
                                  <td className="px-4 text-right">
                                    {l.valorCredito !== null ? (
                                      <MoneyValue value={l.valorCredito} size="sm" />
                                    ) : (
                                      <span className="font-mono text-[13px] text-text-500">—</span>
                                    )}
                                  </td>
                                  <td className="px-4">
                                    <ConfidenceBadge level={l.confianca} variant="outline" />
                                  </td>
                                  <td className="px-4">
                                    <span
                                      className={cn(
                                        "inline-flex h-6 items-center rounded-full px-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.04em]",
                                        STATUS_DESPESA_CLASSES[l.status],
                                      )}
                                    >
                                      {STATUS_DESPESA_LABEL[l.status]}
                                    </span>
                                  </td>
                                </motion.tr>
                              ))
                            : []),
                          <tr key={`${g.categoria}-subtotal`} className="border-b border-line last:border-b-0">
                            <td colSpan={5} />
                            <td className="px-4 py-2 text-right font-mono text-[11px] uppercase tracking-[0.04em] text-text-500">
                              Subtotal
                            </td>
                            <td className="px-4 py-2 text-right">
                              <MoneyValue value={g.subtotal} size="sm" className="font-semibold" />
                            </td>
                            <td colSpan={2} />
                          </tr>,
                        ]
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Disclaimer RF-06 */}
              <div className="flex items-start gap-2.5 rounded-xl border border-conf-media-dot/20 bg-conf-media-bg px-4 py-3">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-conf-media-text" />
                <p className="font-mono text-[11px] leading-relaxed tracking-[0.02em] text-conf-media-text">
                  Relatórios incluem classificações de média confiança apenas após validação humana. Consulte um
                  advogado tributarista antes de efetivar créditos. Isto não é aconselhamento jurídico.
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* ── View de impressão (PDF via window.print) ───────────────────────── */}
      {!rel.isLoading && linhas.length > 0 && (
        <div className="hidden print:block">
          <div className="flex items-center gap-3 border-b-2 border-[#101613] pb-4">
            <img src="/logo-mark.svg" alt="" className="h-10 w-10" />
            <div className="flex flex-col">
              <span className="font-display text-lg font-semibold">
                reembolsa<span className="text-[#0EA968]">.ia</span>
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[#5B6762]">
                Relatório de apuração tributária
              </span>
            </div>
            <div className="ml-auto text-right font-mono text-[11px] leading-relaxed text-[#5B6762]">
              <p>{empresaRelatorio?.razaoSocial}</p>
              <p>
                {empresaRelatorio?.cnpj} ·{" "}
                {empresaRelatorio ? REGIME_LABEL[empresaRelatorio.regimeTributario] : ""} · {empresaRelatorio?.uf}
              </p>
              <p>Período: {periodoRotulo}</p>
            </div>
          </div>

          {/* Banda de totais espelhada */}
          <div className="mt-6 rounded-lg bg-[#0C1210] p-5 text-[#E8F0EB]">
            <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-[#8FA39A]">
              Apuração consolidada · {empresaRelatorio?.razaoSocial} · {periodoRotulo}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
              {celulasTotais.map((c) => (
                <span key={c.chave} className="font-mono text-[12px] tabular">
                  <span className="text-[#8FA39A]">{c.rotulo}: </span>
                  {c.pre2027 ? "R$ 0,00 (pré-2027)" : formatBRL(c.valor)}
                </span>
              ))}
              <span className="font-mono text-[13px] font-semibold tabular text-[#2BE08C]">
                Total capturável: {formatBRL(totais.creditos)}
              </span>
            </div>
            <p className="mt-2 font-mono text-[10px] text-[#8FA39A]">
              créditos e dedutibilidade em trilhas paralelas — totais apresentados separados, nunca somados
            </p>
          </div>

          {/* Tabela completa */}
          <table className="mt-6 w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#101613]">
                {["Data", "Despesa", "Categoria", "Tributo", "Benefício", "Base", "Valor", "Confiança"].map((h) => (
                  <th key={h} className="py-2 pr-3 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#5B6762]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={`print-${l.despesaId}-${l.tributo ?? "sem"}-${i}`} className="border-b border-[#E3E8E2]">
                  <td className="py-1.5 pr-3 font-mono text-[11px] tabular">{formatDataPtBR(l.dataFatoGerador)}</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px] tabular">#{l.despesaId}</td>
                  <td className="py-1.5 pr-3 text-[11px]">{l.categoria ? CATEGORIA_LABEL[l.categoria] : "a definir"}</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px]">{l.tributo ? TRIBUTO_LABEL[l.tributo] : "—"}</td>
                  <td className="py-1.5 pr-3 text-[11px]">{l.tipoBeneficio ? BENEFICIO_LABEL[l.tipoBeneficio] : "—"}</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px] tabular">{formatBRL(l.valorFiscal)}</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px] tabular">
                    {l.valorCredito !== null ? formatBRL(l.valorCredito) : "—"}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-[11px] uppercase">{CONFIANCA_LABEL[l.confianca]}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-6 border-t border-dashed border-[#E3E8E2] pt-3 font-mono text-[10px] leading-relaxed text-[#5B6762]">
            Relatórios incluem classificações de média confiança apenas após validação humana. Consulte um advogado
            tributarista antes de efetivar créditos. Isto não é aconselhamento jurídico.
            <br />
            gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} · regras v1.1 · log de auditoria
            preservado
          </p>
        </div>
      )}
    </motion.div>
  )
}
