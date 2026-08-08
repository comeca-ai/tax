import { useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { motion } from "framer-motion"
import {
  ArrowDown,
  ArrowUp,
  CirclePlus,
  Download,
  Search,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/providers/trpc"
import { useActiveCompany } from "@/hooks/useActiveCompany"
import type { CategoriaDespesa, NivelConfianca, StatusDespesa } from "@contracts/types"
import ConfidenceBadge from "@/components/app/ConfidenceBadge"
import DataTable, { type DataTableColumn } from "@/components/app/DataTable"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/format"
import DespesaDrawer from "@/components/despesas/DespesaDrawer"
import StatusChip from "@/components/despesas/StatusChip"
import {
  CATEGORIA_META,
  CATEGORIA_OPTIONS,
  formatData,
} from "@/components/despesas/meta"

type DespesaRow = {
  id: number
  categoria: CategoriaDespesa
  colaborador: string | null
  centroCusto: string | null
  motivoDeslocamento: string | null
  kmComercial: number
  kmNaoComercial: number
  litros: number | null
  valorFiscal: number
  valorReembolsavel: number
  confianca: NivelConfianca
  status: StatusDespesa
  createdAt: Date | string
  dataFatoGerador: string | null
  valorNota: number | null
}

const CONFIANCA_OPTIONS: { value: NivelConfianca; label: string; dot: string }[] = [
  { value: "alta", label: "Alta", dot: "bg-conf-alta-dot" },
  { value: "media", label: "Média", dot: "bg-conf-media-dot" },
  { value: "baixa", label: "Baixa", dot: "bg-conf-baixa-dot" },
  { value: "vedado", label: "Vedado", dot: "bg-conf-vedado-dot" },
]

const STATUS_OPTIONS: { value: StatusDespesa; label: string }[] = [
  { value: "aprovada", label: "Liberada" },
  { value: "em_revisao", label: "Em revisão" },
  { value: "rejeitada", label: "Rejeitada" },
  { value: "pendente", label: "Rascunho" },
]

type SortKey = "data" | "valorNota"

export default function Despesas() {
  const { activeCompany, isLoading: empresaLoading } = useActiveCompany()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const categoria = (searchParams.get("categoria") ?? "") as CategoriaDespesa | ""
  const status = (searchParams.get("status") ?? "") as StatusDespesa | ""
  const confianca = (searchParams.get("confianca") ?? "") as NivelConfianca | ""
  const [busca, setBusca] = useState("")
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "data", dir: "desc" })

  const despesaParam = searchParams.get("despesa")
  const despesaAberta = despesaParam ? Number(despesaParam) : null

  const empresaId = activeCompany?.id ?? 0
  const query = trpc.despesas.list.useQuery(
    {
      empresaId,
      status: status || undefined,
      categoria: categoria || undefined,
    },
    { enabled: empresaId > 0, retry: false },
  )

  const rows = useMemo(() => (query.data ?? []) as DespesaRow[], [query.data])

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const porBusca = termo
      ? rows.filter((r) =>
          [r.colaborador, r.centroCusto, r.motivoDeslocamento, CATEGORIA_META[r.categoria]?.label]
            .filter(Boolean)
            .some((campo) => String(campo).toLowerCase().includes(termo)),
        )
      : rows
    const porConfianca = confianca ? porBusca.filter((r) => r.confianca === confianca) : porBusca
    const ordenadas = [...porConfianca].sort((a, b) => {
      const mult = sort.dir === "asc" ? 1 : -1
      if (sort.key === "valorNota") return mult * ((a.valorNota ?? 0) - (b.valorNota ?? 0))
      return mult * (new Date(a.dataFatoGerador ?? a.createdAt).getTime() - new Date(b.dataFatoGerador ?? b.createdAt).getTime())
    })
    return ordenadas
  }, [rows, busca, confianca, sort])

  const filtrosAtivos = [
    categoria ? { chave: "categoria", rotulo: `Categoria: ${CATEGORIA_META[categoria]?.label}` } : null,
    status ? { chave: "status", rotulo: `Status: ${STATUS_OPTIONS.find((s) => s.value === status)?.label}` } : null,
    confianca ? { chave: "confianca", rotulo: `Confiança: ${CONFIANCA_OPTIONS.find((c) => c.value === confianca)?.label}` } : null,
  ].filter(Boolean) as { chave: string; rotulo: string }[]

  function atualizarParam(chave: string, valor: string) {
    const params = new URLSearchParams(searchParams)
    if (valor) params.set(chave, valor)
    else params.delete(chave)
    setSearchParams(params, { replace: true })
  }

  function limparFiltros() {
    setBusca("")
    const params = new URLSearchParams(searchParams)
    params.delete("categoria")
    params.delete("status")
    params.delete("confianca")
    setSearchParams(params, { replace: true })
  }

  function abrirDespesa(id: number | null) {
    const params = new URLSearchParams(searchParams)
    if (id) params.set("despesa", String(id))
    else params.delete("despesa")
    setSearchParams(params, { replace: true })
  }

  function toggleSort(key: SortKey) {
    setSort((atual) =>
      atual.key === key
        ? { key, dir: atual.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    )
  }

  function exportarCsv() {
    const cabecalho = [
      "Data do fato",
      "Categoria",
      "Colaborador",
      "Centro de custo",
      "km comercial",
      "km não comercial",
      "Litros",
      "Valor nota",
      "Valor fiscal",
      "Valor reembolsável",
      "Confiança",
      "Status",
    ]
    const num = (v: number | null) => (v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
    const linhas = filtradas.map((r) =>
      [
        formatData(r.dataFatoGerador),
        CATEGORIA_META[r.categoria]?.label ?? r.categoria,
        r.colaborador ?? "",
        r.centroCusto ?? "",
        num(r.kmComercial),
        num(r.kmNaoComercial),
        r.litros != null ? num(r.litros) : "",
        num(r.valorNota),
        num(r.valorFiscal),
        num(r.valorReembolsavel),
        r.confianca,
        STATUS_OPTIONS.find((s) => s.value === r.status)?.label ?? r.status,
      ]
        .map((celula) => `"${String(celula).replaceAll('"', '""')}"`)
        .join(";"),
    )
    const csv = "﻿" + [cabecalho.join(";"), ...linhas].join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "despesas.csv"
    link.click()
    URL.revokeObjectURL(url)
    toast.success("Exportação concluída", {
      description: `${filtradas.length} despesa(s) exportadas para despesas.csv.`,
    })
  }

  function headerOrdenavel(rotulo: string, key: SortKey) {
    const ativo = sort.key === key
    const Icone = ativo && sort.dir === "asc" ? ArrowUp : ArrowDown
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-[0.04em] transition-colors hover:text-text-900",
          ativo && "text-text-900",
        )}
      >
        {rotulo}
        <Icone className={cn("h-3 w-3", !ativo && "opacity-40")} />
      </button>
    )
  }

  const colunas: DataTableColumn<DespesaRow>[] = [
    {
      key: "data",
      header: headerOrdenavel("Data do fato", "data"),
      render: (r) => <span className="font-mono text-[13px] tabular">{formatData(r.dataFatoGerador)}</span>,
    },
    {
      key: "categoria",
      header: "Categoria",
      render: (r) => {
        const meta = CATEGORIA_META[r.categoria]
        const Icone = meta?.icon
        return (
          <span className="flex items-center gap-2 text-[13px] font-medium">
            {Icone && (
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500/10 text-brand-500">
                <Icone className="h-3.5 w-3.5" />
              </span>
            )}
            {meta?.label ?? r.categoria}
          </span>
        )
      },
    },
    {
      key: "colaborador",
      header: "Colaborador / CC",
      render: (r) => (
        <span className="flex flex-col">
          <span className="text-[13px] font-medium">{r.colaborador ?? "—"}</span>
          {r.centroCusto && <span className="font-mono text-[11px] text-text-500">{r.centroCusto}</span>}
        </span>
      ),
    },
    {
      key: "valorNota",
      header: headerOrdenavel("Valor nota", "valorNota"),
      numeric: true,
      render: (r) => (r.valorNota != null ? formatBRL(r.valorNota) : "—"),
    },
    {
      key: "valorFiscal",
      header: "Valor fiscal",
      numeric: true,
      render: (r) => <span className="text-brand-500">{formatBRL(r.valorFiscal)}</span>,
    },
    {
      key: "confianca",
      header: "Confiança",
      render: (r) => <ConfidenceBadge level={r.confianca} variant="outline" />,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusChip status={r.status} />,
    },
  ]

  const isLoading = empresaLoading || query.isLoading

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex flex-col gap-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-text-900">Despesas</h1>
        {!isLoading && (
          <span className="inline-flex h-6 items-center rounded-full bg-paper px-2.5 font-mono text-[11px] font-semibold tabular text-text-500 ring-1 ring-line">
            {filtradas.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={exportarCsv}
            disabled={filtradas.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-4 text-[13px] font-semibold text-text-900 transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4 text-text-500" />
            Exportar
          </button>
          <Link
            to="/app/despesas/nova"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-brand-500 px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
          >
            <CirclePlus className="h-4 w-4" />
            Nova despesa
          </Link>
        </div>
      </div>

      {/* Filter bar */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="sticky top-16 z-20 flex flex-col gap-3 rounded-xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-10 min-w-[240px] flex-1 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 focus-within:border-brand-500 focus-within:ring-[3px] focus-within:ring-brand-500/20">
            <Search className="h-4 w-4 shrink-0 text-text-500" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por colaborador, centro de custo…"
              className="h-full w-full bg-transparent text-[13px] text-text-900 outline-none placeholder:text-text-500/60"
            />
          </div>

          <Select value={categoria || "todas"} onValueChange={(v) => atualizarParam("categoria", v === "todas" ? "" : v)}>
            <SelectTrigger className="h-10 w-[170px] border-line text-[13px]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {CATEGORIA_OPTIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={confianca || "todas"} onValueChange={(v) => atualizarParam("confianca", v === "todas" ? "" : v)}>
            <SelectTrigger className="h-10 w-[160px] border-line text-[13px]">
              <SelectValue placeholder="Confiança" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as confianças</SelectItem>
              {CONFIANCA_OPTIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  <span className="flex items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
                    {c.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status || "todos"} onValueChange={(v) => atualizarParam("status", v === "todos" ? "" : v)}>
            <SelectTrigger className="h-10 w-[150px] border-line text-[13px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filtrosAtivos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {filtrosAtivos.map((f) => (
              <button
                key={f.chave}
                type="button"
                onClick={() => atualizarParam(f.chave, "")}
                className="inline-flex h-7 items-center gap-1.5 rounded-full bg-paper px-2.5 font-mono text-[11px] text-text-500 ring-1 ring-line transition hover:text-text-900 hover:ring-brand-500/40"
              >
                {f.rotulo}
                <X className="h-3 w-3" />
              </button>
            ))}
            <button
              type="button"
              onClick={limparFiltros}
              className="text-[12px] font-semibold text-brand-500 transition hover:underline"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </motion.div>

      {/* Table */}
      {isLoading ? (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center text-sm text-text-500">
          Não foi possível carregar as despesas. {query.error.message}
        </div>
      ) : rows.length > 0 && filtradas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-8 py-16 text-center">
          <p className="text-sm text-text-500">Nenhum resultado para esses filtros.</p>
          <button
            type="button"
            onClick={limparFiltros}
            className="text-[13px] font-semibold text-brand-500 hover:underline"
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <motion.div
          key={`${categoria}-${status}-${confianca}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          <DataTable
            columns={colunas}
            rows={filtradas}
            rowKey={(r) => String(r.id)}
            onRowClick={(r) => abrirDespesa(r.id)}
            pageSize={20}
            emptyState={{
              image: "/empty-despesas.svg",
              title: "Nenhuma despesa ainda",
              description: "Suba a primeira nota fiscal e deixe o OCR trabalhar.",
              ctaLabel: "Nova despesa",
              onCta: () => navigate("/app/despesas/nova"),
            }}
          />
        </motion.div>
      )}

      <DespesaDrawer
        despesaId={despesaAberta}
        open={despesaAberta !== null}
        onOpenChange={(aberto) => {
          if (!aberto) abrirDespesa(null)
        }}
      />
    </motion.div>
  )
}

