import { useMemo, useState } from "react"
import { Link } from "react-router"
import { AnimatePresence, motion } from "framer-motion"
import {
  CarFront,
  Check,
  CirclePlus,
  EllipsisVertical,
  History,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react"
import { toast } from "sonner"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { trpc } from "@/providers/trpc"
import { useActiveCompany } from "@/hooks/useActiveCompany"
import FiscalField from "@/components/app/FiscalField"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import VeiculoFormDialog, { TOLERANCIA_CONSUMO } from "@/components/ops/VeiculoFormDialog"
import type { VeiculoFormValores } from "@/components/ops/VeiculoFormDialog"
import { formatarData, formatarNumero } from "@/components/ops/rotulos"
import { formatBRL } from "@/lib/format"
import { cn } from "@/lib/utils"

const DEFESA_DISMISS_KEY = "defesa-veiculos-dismissed"

/** Banner contextual: por que o cadastro do veículo defende o crédito de combustível. */
function DefesaVeiculosBanner() {
  const [visivel, setVisivel] = useState(() => {
    try {
      return localStorage.getItem(DEFESA_DISMISS_KEY) !== "1"
    } catch {
      return true
    }
  })

  const dispensar = () => {
    try {
      localStorage.setItem(DEFESA_DISMISS_KEY, "1")
    } catch {
      /* storage indisponível — apenas oculta nesta sessão */
    }
    setVisivel(false)
  }

  return (
    <AnimatePresence initial={false}>
      {visivel && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: "hidden", transition: { duration: 0.25 } }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="flex items-start gap-3.5 rounded-xl border border-line bg-surface p-4 shadow-card"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-500/10 text-brand-500">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="text-[14px] font-semibold text-text-900">Por que cadastrar o veículo?</h2>
            <p className="text-[13px] leading-relaxed text-text-500">
              É a prova de plausibilidade do crédito de combustível: o motor cruza km rodados ×
              litros, com tolerância de 15%. Se a Receita perguntar, o valor do diesel se sustenta.
            </p>
          </div>
          <button
            type="button"
            aria-label="Dispensar aviso"
            onClick={dispensar}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-text-500 transition hover:bg-paper hover:text-text-900"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

type Veiculo = NonNullable<ReturnType<typeof trpc.veiculos.list.useQuery>["data"]>[number]
type DespesaRow = NonNullable<ReturnType<typeof trpc.despesas.list.useQuery>["data"]>[number]

interface ConsumoAgregado {
  kmTotal: number
  litrosTotal: number
  real: number | null
  divergenciaPct: number | null
  dentro: boolean | null
  registros: DespesaRow[]
}

/** Agrega km ÷ litros das despesas do veículo (RF-09 — mesmo cálculo do motor). */
function agregarConsumo(veiculo: Veiculo, despesas: DespesaRow[]): ConsumoAgregado {
  const registros = despesas.filter(
    (d) => d.veiculoId === veiculo.id && (d.litros ?? 0) > 0 && d.kmComercial > 0,
  )
  const kmTotal = registros.reduce((acc, d) => acc + d.kmComercial, 0)
  const litrosTotal = registros.reduce((acc, d) => acc + (d.litros ?? 0), 0)
  if (litrosTotal <= 0 || veiculo.kmPorLitroDeclarado <= 0) {
    return { kmTotal, litrosTotal, real: null, divergenciaPct: null, dentro: null, registros }
  }
  const real = kmTotal / litrosTotal
  const div = Math.abs(real - veiculo.kmPorLitroDeclarado) / veiculo.kmPorLitroDeclarado
  return {
    kmTotal,
    litrosTotal,
    real,
    divergenciaPct: div * 100,
    dentro: div <= TOLERANCIA_CONSUMO,
    registros,
  }
}

/** Barra-gauge RF-09: marcador do consumo declarado vs. real, com zona de tolerância. */
function GaugePlausibilidade({ veiculo, ag }: { veiculo: Veiculo; ag: ConsumoAgregado }) {
  if (ag.real === null || ag.divergenciaPct === null) {
    return (
      <div className="rounded-[10px] border border-dashed border-line bg-paper px-3.5 py-3">
        <p className="font-mono text-[11.5px] leading-relaxed text-text-500">
          Sem dados suficientes para o teste de plausibilidade (RF-09) — vincule despesas de
          combustível com litros e km comerciais a este veículo.
        </p>
      </div>
    )
  }

  const declarado = veiculo.kmPorLitroDeclarado
  const min = Math.min(declarado * (1 - TOLERANCIA_CONSUMO - 0.08), ag.real * 0.92)
  const max = Math.max(declarado * (1 + TOLERANCIA_CONSUMO + 0.08), ag.real * 1.08)
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`
  const divergente = ag.dentro === false

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "rounded-[10px] border px-3.5 py-3",
              divergente ? "border-conf-vedado-dot/40 bg-conf-vedado-bg/40" : "border-line bg-paper",
            )}
          >
            <div className="relative h-2.5 rounded-full bg-line">
              {/* Faixa de tolerância (declarado ±15%) */}
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                style={{
                  left: pos(declarado * (1 - TOLERANCIA_CONSUMO)),
                  width: `calc(${pos(declarado * (1 + TOLERANCIA_CONSUMO))} - ${pos(declarado * (1 - TOLERANCIA_CONSUMO))})`,
                  transformOrigin: "left",
                }}
                className={cn(
                  "absolute top-0 h-full rounded-full",
                  divergente ? "bg-conf-vedado-dot/25" : "bg-conf-alta-dot/30",
                )}
              />
              {/* Marcador declarado */}
              <span
                style={{ left: pos(declarado) }}
                className="absolute top-1/2 h-4 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-900"
              />
              {/* Marcador real */}
              <motion.span
                initial={{ left: pos(declarado) }}
                animate={{ left: pos(ag.real) }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
                className={cn(
                  "absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface",
                  divergente ? "bg-conf-vedado-dot" : "bg-conf-alta-dot",
                )}
              />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-[11px] tabular text-text-900">
                consumo real {formatarNumero(ag.real)} km/L ({formatarNumero(ag.kmTotal, 0)} km ÷{" "}
                {formatarNumero(ag.litrosTotal)} L) · divergência {formatarNumero(ag.divergenciaPct)}%
                · tolerância 15%
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.03em]",
                  divergente ? "bg-conf-vedado-bg text-conf-vedado-text" : "bg-conf-alta-bg text-conf-alta-text",
                )}
              >
                {divergente ? (
                  <>
                    <TriangleAlert className="h-3 w-3" /> rebaixa despesas para revisão
                  </>
                ) : (
                  <>
                    <Check className="h-3 w-3" /> dentro da tolerância
                  </>
                )}
              </span>
              {divergente && (
                <Link to="/app/revisao" className="text-[12px] font-medium text-red-500 hover:underline">
                  Ver fila de revisão →
                </Link>
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-mono text-xs">Consumo real = km rodados ÷ litros (RF-09)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default function Veiculos() {
  const { activeCompany, isLoading: carregandoEmpresas } = useActiveCompany()
  const empresaId = activeCompany?.id
  const utils = trpc.useUtils()

  const veiculosQuery = trpc.veiculos.list.useQuery(
    { empresaId: empresaId ?? 0 },
    { enabled: !!empresaId, retry: false },
  )
  const despesasQuery = trpc.despesas.list.useQuery(
    { empresaId: empresaId ?? 0 },
    { enabled: !!empresaId, retry: false },
  )

  const [modal, setModal] = useState<{ modo: "criar" } | { modo: "editar"; veiculo: Veiculo } | null>(null)
  const [excluindo, setExcluindo] = useState<Veiculo | null>(null)
  const [historico, setHistorico] = useState<Veiculo | null>(null)

  const veiculos = useMemo(() => veiculosQuery.data ?? [], [veiculosQuery.data])
  const despesas = useMemo(() => despesasQuery.data ?? [], [despesasQuery.data])

  const consumos = useMemo(() => {
    const mapa = new Map<number, ConsumoAgregado>()
    for (const v of veiculos) mapa.set(v.id, agregarConsumo(v, despesas))
    return mapa
  }, [veiculos, despesas])

  const divergentes = veiculos.filter((v) => consumos.get(v.id)?.dentro === false)
  const comDados = veiculos.filter((v) => consumos.get(v.id)?.dentro !== null)

  const tarifaMedia = useMemo(() => {
    const tarifas = veiculos.map((v) => v.tarifaReembolsoKm).filter((t) => t > 0)
    if (tarifas.length === 0) return null
    return tarifas.reduce((a, b) => a + b, 0) / tarifas.length
  }, [veiculos])

  const invalidar = async () => {
    await Promise.all([
      utils.veiculos.list.invalidate(),
      utils.despesas.list.invalidate(),
    ])
  }

  const criar = trpc.veiculos.create.useMutation({
    onSuccess: async () => {
      await invalidar()
      toast.success("Veículo salvo")
    },
  })
  const atualizar = trpc.veiculos.update.useMutation({
    onSuccess: async () => {
      await invalidar()
      toast.success("Veículo salvo")
    },
  })
  const remover = trpc.veiculos.remove.useMutation({
    onSuccess: async () => {
      await invalidar()
      toast.success("Veículo excluído — despesas já vinculadas mantêm o histórico.")
      setExcluindo(null)
    },
    onError: (erro) => toast.error(erro.message),
  })

  const submitVeiculo = async (valores: VeiculoFormValores) => {
    if (!empresaId) return
    const dados = {
      placa: valores.placa,
      renavam: valores.renavam ? valores.renavam : undefined,
      kmPorLitroDeclarado: valores.kmPorLitroDeclarado,
      tarifaReembolsoKm: valores.tarifaReembolsoKm,
      descricao: valores.descricao?.trim() ? valores.descricao.trim() : undefined,
    }
    if (modal?.modo === "editar") {
      await atualizar.mutateAsync({ id: modal.veiculo.id, empresaId, dados })
    } else {
      await criar.mutateAsync({ empresaId, dados })
    }
  }

  const carregando = carregandoEmpresas || (!!empresaId && veiculosQuery.isLoading)
  const veiculoHistorico = historico ? consumos.get(historico.id) : undefined
  const dadosGrafico = useMemo(() => {
    if (!historico || !veiculoHistorico) return []
    return [...veiculoHistorico.registros]
      .sort((a, b) => String(a.dataFatoGerador ?? "").localeCompare(String(b.dataFatoGerador ?? "")))
      .map((d) => {
        const consumo = d.kmComercial / (d.litros ?? 1)
        const div =
          Math.abs(consumo - historico.kmPorLitroDeclarado) / historico.kmPorLitroDeclarado
        return {
          data: formatarData(d.dataFatoGerador),
          consumo: Number(consumo.toFixed(2)),
          divergente: div > TOLERANCIA_CONSUMO,
        }
      })
  }, [historico, veiculoHistorico])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-text-900">
          Veículos
        </h1>
        {!carregando && veiculos.length > 0 && (
          <span className="inline-flex h-6 items-center rounded-full bg-paper px-2.5 font-mono text-[11px] font-semibold tabular text-text-500 ring-1 ring-line">
            {veiculos.length}
          </span>
        )}
        {activeCompany && (
          <span className="font-mono text-[11px] text-text-500">
            {activeCompany.razaoSocial}
          </span>
        )}
        <button
          type="button"
          onClick={() => setModal({ modo: "criar" })}
          disabled={!empresaId}
          className="ml-auto inline-flex h-11 items-center gap-2 rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CirclePlus className="h-4 w-4" /> Cadastrar veículo
        </button>
      </header>

      <DefesaVeiculosBanner />

      {carregando && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </>
      )}

      {!carregando && !empresaId && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface px-8 py-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-line">
            <CarFront className="h-7 w-7 text-text-500/60" />
          </span>
          <div className="flex flex-col gap-1">
            <h3 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
              Nenhuma empresa selecionada
            </h3>
            <p className="max-w-sm text-sm text-text-500">
              Cadastre uma empresa para começar a gerenciar veículos.
            </p>
          </div>
          <Link
            to="/app/empresas?nova=1"
            className="mt-1 inline-flex h-10 items-center rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-500/90"
          >
            Cadastrar empresa
          </Link>
        </div>
      )}

      {!carregando && empresaId && (
        <>
          {/* Summary strip */}
          <div className="grid gap-4 sm:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 shadow-card"
            >
              <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-500">
                Tarifa média de reembolso
              </span>
              <span className="font-mono text-lg font-semibold tabular text-text-900">
                {tarifaMedia !== null ? `${formatBRL(tarifaMedia)}/km` : "—"}
              </span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.07, duration: 0.3, ease: "easeOut" }}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-4 shadow-card",
                divergentes.length > 0 ? "border-conf-vedado-dot/40 bg-surface" : "border-line bg-surface",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-[10px]",
                  divergentes.length > 0
                    ? "bg-conf-vedado-bg text-conf-vedado-text"
                    : "bg-conf-alta-bg text-conf-alta-text",
                )}
              >
                {divergentes.length > 0 ? <TriangleAlert className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </span>
              <div className="flex flex-col">
                <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-500">
                  {divergentes.length > 0
                    ? "Veículos com divergência de consumo"
                    : "Consumo dentro da tolerância"}
                </span>
                <span className="font-mono text-lg font-semibold tabular text-text-900">
                  {divergentes.length > 0
                    ? divergentes.length
                    : comDados.length > 0
                      ? "todos os monitorados"
                      : "—"}
                </span>
              </div>
            </motion.div>
          </div>

          {/* Empty state */}
          {veiculos.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface px-8 py-16 text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-line">
                <CarFront className="h-8 w-8 text-text-500/60" />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
                  Nenhum veículo cadastrado
                </h3>
                <p className="max-w-sm text-sm leading-relaxed text-text-500">
                  Cadastre veículos para habilitar o teste de plausibilidade de consumo, a
                  segregação de uso misto e o reembolso por km.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModal({ modo: "criar" })}
                className="mt-1 inline-flex h-10 items-center gap-2 rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
              >
                <CirclePlus className="h-4 w-4" /> Cadastrar veículo
              </button>
            </div>
          )}

          {/* Grid de cards */}
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <AnimatePresence initial={false}>
              {veiculos.map((v, idx) => {
                const ag = consumos.get(v.id)
                const divergente = ag?.dentro === false
                return (
                  <motion.article
                    key={v.id}
                    layout
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.3 } }}
                    transition={{ delay: 0.07 + Math.min(idx * 0.07, 0.35), duration: 0.3, ease: "easeOut" }}
                    whileHover={{ y: -3 }}
                    className={cn(
                      "flex flex-col gap-4 rounded-xl border bg-surface p-5 shadow-card transition-shadow",
                      divergente ? "border-conf-vedado-dot/50" : "border-line",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand-500/10 text-brand-500">
                        <CarFront className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-[15px] font-semibold text-text-900">
                          {v.descricao ?? "Veículo"} <span className="text-text-500">·</span>{" "}
                          <span className="font-mono tabular">{v.placa}</span>
                        </h3>
                      </div>
                      <span className="flex items-center gap-1.5">
                        <motion.span
                          animate={divergente ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
                          transition={divergente ? { duration: 2, repeat: Infinity } : undefined}
                          className={cn(
                            "h-2 w-2 rounded-full",
                            divergente ? "bg-conf-vedado-dot" : "bg-conf-alta-dot",
                          )}
                        />
                        <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-text-500">
                          {divergente ? "divergente" : ag?.dentro === null ? "sem dados" : "ok"}
                        </span>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <FiscalField label="RENAVAM" value={v.renavam ?? "—"} />
                      <FiscalField label="km/L declarado" value={formatarNumero(v.kmPorLitroDeclarado)} />
                      <FiscalField label="Tarifa reembolso" value={`${formatBRL(v.tarifaReembolsoKm)}/km`} />
                      <FiscalField
                        label="Registros de consumo"
                        value={String(ag?.registros.length ?? 0)}
                      />
                    </div>

                    {ag && <GaugePlausibilidade veiculo={v} ag={ag} />}

                    <div className="flex items-center gap-1 border-t border-line pt-3">
                      <button
                        type="button"
                        onClick={() => setModal({ modo: "editar", veiculo: v })}
                        className="inline-flex h-9 items-center rounded-[10px] px-3 text-[13px] font-medium text-text-500 transition hover:bg-paper hover:text-text-900"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistorico(v)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium text-text-500 transition hover:bg-paper hover:text-text-900"
                      >
                        <History className="h-3.5 w-3.5" /> Histórico
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Mais ações"
                            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-text-500 transition hover:bg-paper hover:text-text-900"
                          >
                            <EllipsisVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => setExcluindo(v)}
                            className="text-red-500 focus:text-red-500"
                          >
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </motion.article>
                )
              })}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Modal criar/editar */}
      <VeiculoFormDialog
        aberto={modal !== null}
        onFechar={() => setModal(null)}
        titulo={modal?.modo === "editar" ? "Editar veículo" : "Cadastrar veículo"}
        valoresIniciais={
          modal?.modo === "editar"
            ? {
                descricao: modal.veiculo.descricao ?? "",
                placa: modal.veiculo.placa,
                renavam: modal.veiculo.renavam ?? "",
                kmPorLitroDeclarado: modal.veiculo.kmPorLitroDeclarado,
                tarifaReembolsoKm: modal.veiculo.tarifaReembolsoKm,
              }
            : undefined
        }
        consumoReal={modal?.modo === "editar" ? consumos.get(modal.veiculo.id)?.real : null}
        onSubmit={submitVeiculo}
      />

      {/* Confirm excluir */}
      <Dialog open={excluindo !== null} onOpenChange={(open) => !open && setExcluindo(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Excluir veículo?</DialogTitle>
            <DialogDescription>
              Despesas já vinculadas mantêm o histórico, mas novas não poderão usar este
              veículo{excluindo ? ` (${excluindo.placa})` : ""}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setExcluindo(null)}
              className="inline-flex h-10 items-center rounded-[10px] border border-line px-4 text-sm font-medium text-text-900 transition hover:bg-paper"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={remover.isPending}
              onClick={() => excluindo && empresaId && remover.mutate({ id: excluindo.id, empresaId })}
              className="inline-flex h-10 items-center rounded-[10px] bg-red-500 px-4 text-sm font-semibold text-white transition hover:bg-red-500/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Excluir veículo
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drawer Histórico */}
      <Sheet open={historico !== null} onOpenChange={(open) => !open && setHistorico(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[480px]">
          <SheetHeader>
            <SheetTitle>
              Histórico — {historico?.descricao ?? "Veículo"}{" "}
              <span className="font-mono tabular">{historico?.placa}</span>
            </SheetTitle>
            <SheetDescription>
              Consumo real por abastecimento; faixa tracejada = declarado ±15% (RF-09).
            </SheetDescription>
          </SheetHeader>

          {historico && (
            <div className="flex flex-col gap-6 px-4 pb-8">
              {dadosGrafico.length > 0 ? (
                <div className="h-56 rounded-xl border border-line bg-surface p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dadosGrafico} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                      <CartesianGrid stroke="#E3E8E2" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="data" tick={{ fontSize: 10, fill: "#5B6762" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#5B6762" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                      <ChartTooltip
                        formatter={(value) => [`${formatarNumero(Number(value))} km/L`, "Consumo"]}
                        contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #E3E8E2" }}
                      />
                      <ReferenceArea
                        y1={historico.kmPorLitroDeclarado * (1 - TOLERANCIA_CONSUMO)}
                        y2={historico.kmPorLitroDeclarado * (1 + TOLERANCIA_CONSUMO)}
                        fill="#0EA968"
                        fillOpacity={0.08}
                      />
                      <ReferenceLine
                        y={historico.kmPorLitroDeclarado}
                        stroke="#101613"
                        strokeDasharray="4 4"
                        strokeWidth={1}
                      />
                      <Line
                        type="monotone"
                        dataKey="consumo"
                        stroke="#0EA968"
                        strokeWidth={2}
                        dot={(props) => {
                          const { cx, cy, payload } = props as unknown as {
                            cx: number
                            cy: number
                            payload: { divergente: boolean }
                          }
                          return (
                            <circle
                              key={`${cx}-${cy}`}
                              cx={cx}
                              cy={cy}
                              r={4}
                              fill={payload.divergente ? "#DC2626" : "#0EA968"}
                              stroke="#fff"
                              strokeWidth={1.5}
                            />
                          )
                        }}
                        animationDuration={900}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-line bg-paper px-5 py-8 text-center">
                  <p className="text-sm text-text-500">
                    Nenhum abastecimento com litros e km registrado para este veículo.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-500">
                  Abastecimentos
                </span>
                {veiculoHistorico && veiculoHistorico.registros.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {[...veiculoHistorico.registros]
                      .sort((a, b) => String(b.dataFatoGerador ?? "").localeCompare(String(a.dataFatoGerador ?? "")))
                      .map((d) => {
                        const consumo = d.kmComercial / (d.litros ?? 1)
                        const div =
                          Math.abs(consumo - historico.kmPorLitroDeclarado) /
                          historico.kmPorLitroDeclarado
                        const divergente = div > TOLERANCIA_CONSUMO
                        return (
                          <li
                            key={d.id}
                            className="flex items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3.5 py-2.5"
                          >
                            <span
                              className={cn(
                                "h-2 w-2 shrink-0 rounded-full",
                                divergente ? "bg-conf-vedado-dot" : "bg-conf-alta-dot",
                              )}
                            />
                            <span className="font-mono text-[11.5px] leading-relaxed tabular text-text-900">
                              {formatarData(d.dataFatoGerador)} · despesa #{d.id} ·{" "}
                              {formatarNumero(d.litros ?? 0)} L · {formatarNumero(d.kmComercial, 0)} km
                              comerciais · consumo {formatarNumero(consumo, 2)} km/L
                            </span>
                          </li>
                        )
                      })}
                  </ul>
                ) : (
                  <p className="text-sm text-text-500">Sem registros de consumo.</p>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </motion.div>
  )
}
