import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router"
import { AnimatePresence, motion } from "framer-motion"
import { Bot, Clock, ClipboardCheck, Gauge, Paperclip, ShieldCheck } from "lucide-react"
import { trpc } from "@/providers/trpc"
import { useAuth } from "@/hooks/useAuth"
import { useActiveCompany } from "@/hooks/useActiveCompany"
import type { CategoriaDespesa } from "@contracts/types"
import ConfidenceBadge from "@/components/app/ConfidenceBadge"
import MoneyValue from "@/components/app/MoneyValue"
import RevisaoDetalhe from "@/components/ops/RevisaoDetalhe"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  CATEGORIA_ICONE,
  CATEGORIA_ROTULO,
  formatarData,
  formatarDataHora,
} from "@/components/ops/rotulos"
import { cn } from "@/lib/utils"

type FilaItem = NonNullable<ReturnType<typeof trpc.revisao.fila.useQuery>["data"]>[number]

/** Chips de motivo derivados dos dados reais da despesa (memorial + evidências). */
function motivosDaFila(item: FilaItem): string[] {
  const motivos: string[] = []
  const memorial = item.despesa.memorial ?? ""
  if (item.quantidadeEvidencias === 0 && item.despesa.confianca === "media") {
    motivos.push("evidência pendente")
  }
  const divergencia = memorial.match(/diverge ([\d]+[.,][\d]+)%/)
  if (memorial.includes("RF-09")) {
    motivos.push(divergencia ? `divergência ${divergencia[1]}%` : "divergência de consumo")
  }
  if (memorial.includes("não mapeado")) motivos.push("CNAE não mapeado")
  if (motivos.length === 0) {
    motivos.push(item.despesa.confianca === "media" ? "média confiança" : "rebaixada p/ revisão")
  }
  return motivos
}

function EmptyStateCliente() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface px-8 py-16 text-center">
      <img src="/empty-revisao.svg" alt="" className="h-auto w-56" />
      <div className="flex max-w-md flex-col gap-1.5">
        <h3 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
          A fila de revisão é operada pelo time de compliance
        </h3>
        <p className="text-sm leading-relaxed text-text-500">
          Despesas de média confiança passam por validação humana de um revisor antes de
          liberar os créditos. Você acompanha o andamento na lista de despesas.
        </p>
      </div>
      <Link
        to="/app/despesas"
        className="mt-1 inline-flex h-10 items-center rounded-[10px] border border-line px-4 text-sm font-medium text-text-900 transition hover:bg-paper"
      >
        Ver minhas despesas
      </Link>
    </div>
  )
}

function CardResumo({
  icon: Icon,
  titulo,
  valor,
  tom,
  delay,
}: {
  icon: typeof Clock
  titulo: string
  valor: string
  tom: "amber" | "red" | "neutro"
  delay: number
}) {
  const cores = {
    amber: "bg-conf-media-bg text-conf-media-text",
    red: "bg-conf-vedado-bg text-conf-vedado-text",
    neutro: "bg-paper text-text-500",
  }[tom]
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: "easeOut" }}
      className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card"
    >
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-[10px]", cores)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex flex-col">
        <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-500">{titulo}</span>
        <span className="font-mono text-lg font-semibold tabular text-text-900">{valor}</span>
      </div>
    </motion.div>
  )
}

export default function Revisao() {
  const { perfil, isLoading: carregandoAuth } = useAuth()
  const { activeCompany } = useActiveCompany()
  const [aba, setAba] = useState<"pendentes" | "resolvidas">("pendentes")
  const [ordenacao, setOrdenacao] = useState<"antigas" | "valor">("antigas")
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null)
  const [saindoIds, setSaindoIds] = useState<number[]>([])
  const [atalho, setAtalho] = useState<"aprovar" | "rejeitar" | null>(null)
  const dropzoneRef = useRef<HTMLButtonElement | null>(null)

  const fila = trpc.revisao.fila.useQuery(undefined, {
    retry: false,
    enabled: perfil !== "cliente",
  })

  // Resolvidas: despesas da empresa ativa já decididas (aprovada/rejeitada)
  const resolvidasQuery = trpc.despesas.list.useQuery(
    { empresaId: activeCompany?.id ?? 0 },
    { enabled: aba === "resolvidas" && !!activeCompany, retry: false },
  )

  const itens = useMemo(() => {
    const dados = fila.data ?? []
    const ordenado = [...dados]
    if (ordenacao === "antigas") {
      ordenado.sort((a, b) => new Date(a.despesa.createdAt).getTime() - new Date(b.despesa.createdAt).getTime())
    } else {
      ordenado.sort((a, b) => (b.valorNota ?? 0) - (a.valorNota ?? 0))
    }
    return ordenado
  }, [fila.data, ordenacao])

  // Mantém seleção válida conforme a fila muda (auto-seleciona o próximo)
  useEffect(() => {
    if (itens.length === 0) {
      if (selecionadoId !== null) setSelecionadoId(null)
      return
    }
    if (selecionadoId === null || !itens.some((i) => i.despesa.id === selecionadoId)) {
      setSelecionadoId(itens[0].despesa.id)
    }
  }, [itens, selecionadoId])

  const resolvidas = useMemo(
    () =>
      (resolvidasQuery.data ?? []).filter(
        (d) => d.status === "aprovada" || d.status === "rejeitada",
      ),
    [resolvidasQuery.data],
  )

  // Auto-seleção na aba resolvidas
  useEffect(() => {
    if (aba !== "resolvidas") return
    if (resolvidas.length > 0 && (selecionadoId === null || !resolvidas.some((d) => d.id === selecionadoId))) {
      setSelecionadoId(resolvidas[0].id)
    }
  }, [aba, resolvidas, selecionadoId])

  // Atalhos de teclado: j/k navega, a aprova, r rejeita, e foca evidência
  useEffect(() => {
    if (aba !== "pendentes") return
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) return
      const idx = itens.findIndex((i) => i.despesa.id === selecionadoId)
      if (e.key === "j") {
        e.preventDefault()
        const prox = itens[Math.min(idx + 1, itens.length - 1)]
        if (prox) setSelecionadoId(prox.despesa.id)
      } else if (e.key === "k") {
        e.preventDefault()
        const ant = itens[Math.max(idx - 1, 0)]
        if (ant) setSelecionadoId(ant.despesa.id)
      } else if (e.key === "a") {
        e.preventDefault()
        setAtalho("aprovar")
      } else if (e.key === "r") {
        e.preventDefault()
        setAtalho("rejeitar")
      } else if (e.key === "e") {
        e.preventDefault()
        dropzoneRef.current?.focus()
        dropzoneRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
      }
    }
    window.addEventListener("keydown", aoTeclar)
    return () => window.removeEventListener("keydown", aoTeclar)
  }, [aba, itens, selecionadoId])

  if (carregandoAuth) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-[420px]" />
      </div>
    )
  }

  const acessoNegado =
    fila.isError &&
    (fila.error as unknown as { data?: { code?: string } }).data?.code === "FORBIDDEN"

  if (perfil === "cliente" || acessoNegado) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="flex flex-col gap-6"
      >
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-text-900">
            Fila de revisão
          </h1>
        </header>
        <EmptyStateCliente />
      </motion.div>
    )
  }

  const aguardandoEvidencia = itens.filter((i) => i.quantidadeEvidencias === 0).length
  const divergentes = itens.filter((i) => (i.despesa.memorial ?? "").includes("RF-09")).length
  const somenteLeitura = aba === "resolvidas"

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
          Fila de revisão
        </h1>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={itens.length}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex h-6 items-center rounded-full bg-conf-media-bg px-2.5 font-mono text-[11px] font-semibold tabular text-conf-media-text"
          >
            {itens.length} {itens.length === 1 ? "pendente" : "pendentes"}
          </motion.span>
        </AnimatePresence>
        <div className="ml-auto flex items-center gap-2.5">
          <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as "antigas" | "valor")}>
            <SelectTrigger className="h-10 w-[150px] rounded-[10px] border-line text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="antigas">Mais antigas</SelectItem>
              <SelectItem value="valor">Maior valor</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex rounded-[10px] border border-line bg-surface p-0.5">
            {(["pendentes", "resolvidas"] as const).map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => setAba(valor)}
                className={cn(
                  "relative h-9 rounded-lg px-3.5 text-[13px] font-medium capitalize transition-colors",
                  aba === valor ? "text-text-900" : "text-text-500 hover:text-text-900",
                )}
              >
                {aba === valor && (
                  <motion.span
                    layoutId="revisao-abas"
                    transition={{ type: "spring", stiffness: 320, damping: 30 }}
                    className="absolute inset-0 rounded-lg bg-paper ring-1 ring-line"
                  />
                )}
                <span className="relative">{valor === "pendentes" ? "Pendentes" : "Resolvidas"}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {aba === "pendentes" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <CardResumo icon={Paperclip} titulo="Aguardando evidência" valor={String(aguardandoEvidencia)} tom="amber" delay={0} />
          <CardResumo icon={Gauge} titulo="Rebaixadas por divergência de consumo" valor={String(divergentes)} tom="red" delay={0.07} />
          <CardResumo icon={Clock} titulo="Tempo médio de resolução" valor="—" tom="neutro" delay={0.14} />
        </div>
      )}

      {/* Split view */}
      {aba === "pendentes" && fila.isLoading && (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-[420px]" />
        </div>
      )}

      {aba === "pendentes" && !fila.isLoading && itens.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface px-8 py-16 text-center">
          <img src="/empty-revisao.svg" alt="" className="h-auto w-56" />
          <div className="flex flex-col gap-1">
            <h3 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">Fila zerada.</h3>
            <p className="max-w-sm text-sm text-text-500">
              Toda média confiança foi validada. Novas despesas que precisarem de olho humano aparecem aqui.
            </p>
          </div>
          <Link
            to="/app/despesas"
            className="mt-1 inline-flex h-10 items-center rounded-[10px] border border-line px-4 text-sm font-medium text-text-900 transition hover:bg-paper"
          >
            Ver despesas liberadas
          </Link>
        </div>
      )}

      {aba === "pendentes" && itens.length > 0 && (
        <div className="grid items-start gap-4 lg:grid-cols-[380px_1fr]">
          {/* Fila */}
          <div className="flex max-h-[calc(100dvh-260px)] flex-col gap-2.5 overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {itens.map((item, idx) => {
                const despesa = item.despesa
                const ativo = despesa.id === selecionadoId
                const saindo = saindoIds.includes(despesa.id)
                const Icone = CATEGORIA_ICONE[despesa.categoria as CategoriaDespesa] ?? ClipboardCheck
                return (
                  <motion.button
                    key={despesa.id}
                    type="button"
                    layout
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0, transition: { delay: Math.min(idx * 0.05, 0.3), duration: 0.25 } }}
                    exit={{ opacity: 0, x: 24, height: 0, marginBottom: 0, transition: { duration: 0.35 } }}
                    onClick={() => setSelecionadoId(despesa.id)}
                    className={cn(
                      "relative flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 text-left shadow-card transition-colors",
                      ativo && "border-brand-500/50 bg-paper",
                      saindo && "pointer-events-none",
                    )}
                  >
                    {ativo && (
                      <motion.span
                        layoutId="revisao-ativa"
                        transition={{ type: "spring", stiffness: 320, damping: 30 }}
                        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-brand-500"
                      />
                    )}
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
                        <Icone className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-900">
                        {CATEGORIA_ROTULO[despesa.categoria as CategoriaDespesa] ?? despesa.categoria}
                        {despesa.colaborador ? ` · ${despesa.colaborador}` : ""}
                      </span>
                      <ConfidenceBadge
                        level={despesa.confianca}
                        variant={despesa.confianca === "media" ? "solid" : "outline"}
                      />
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <MoneyValue value={item.valorNota ?? despesa.valorFiscal} size="sm" />
                      <span className="font-mono text-[11px] tabular text-text-500">
                        {formatarData(item.dataFatoGerador)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {despesa.politicaDecisao === "revisao_humana" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-help items-center gap-1 rounded-full bg-conf-media-bg px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.02em] text-conf-media-text">
                              <Bot className="h-2.5 w-2.5" />
                              Agente de política
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[320px] whitespace-pre-line font-mono text-[11px] leading-relaxed">
                            {despesa.politicaMotivo ?? "Enviada à revisão pela política de reembolso."}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {motivosDaFila(item).map((motivo) => (
                        <span
                          key={motivo}
                          className="rounded-full bg-paper px-2 py-0.5 font-mono text-[10px] tracking-[0.02em] text-text-500 ring-1 ring-line"
                        >
                          {motivo}
                        </span>
                      ))}
                    </div>
                  </motion.button>
                )
              })}
            </AnimatePresence>
          </div>

          {/* Painel de revisão */}
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            {selecionadoId !== null && (
              <RevisaoDetalhe
                despesaId={selecionadoId}
                dropzoneRef={dropzoneRef}
                atalhoDecisao={atalho}
                onAtalhoConsumido={() => setAtalho(null)}
                onDecidido={(id) => {
                  setSaindoIds((ids) => [...ids, id])
                  const idx = itens.findIndex((i) => i.despesa.id === id)
                  const proximo = itens[idx + 1] ?? itens[idx - 1]
                  if (proximo) setSelecionadoId(proximo.despesa.id)
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Aba Resolvidas */}
      {aba === "resolvidas" && (
        <div className="grid items-start gap-4 lg:grid-cols-[380px_1fr]">
          <div className="flex max-h-[calc(100dvh-260px)] flex-col gap-2.5 overflow-y-auto pr-1">
            {resolvidasQuery.isLoading && (
              <>
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </>
            )}
            {!resolvidasQuery.isLoading && resolvidas.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center">
                <ShieldCheck className="h-6 w-6 text-text-500/50" />
                <p className="max-w-[240px] text-sm text-text-500">
                  Nenhuma despesa resolvida nesta empresa ainda.
                </p>
              </div>
            )}
            <AnimatePresence initial={false}>
              {resolvidas.map((d, idx) => {
                const ativo = d.id === selecionadoId
                const Icone = CATEGORIA_ICONE[d.categoria as CategoriaDespesa] ?? ClipboardCheck
                return (
                  <motion.button
                    key={d.id}
                    type="button"
                    layout
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0, transition: { delay: Math.min(idx * 0.05, 0.3), duration: 0.25 } }}
                    onClick={() => setSelecionadoId(d.id)}
                    className={cn(
                      "relative flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 text-left shadow-card transition-colors",
                      ativo && "border-brand-500/50 bg-paper",
                    )}
                  >
                    {ativo && (
                      <motion.span
                        layoutId="revisao-ativa-resolvidas"
                        transition={{ type: "spring", stiffness: 320, damping: 30 }}
                        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-brand-500"
                      />
                    )}
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
                        <Icone className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-900">
                        {CATEGORIA_ROTULO[d.categoria as CategoriaDespesa] ?? d.categoria}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.04em]",
                          d.status === "aprovada"
                            ? "bg-conf-alta-bg text-conf-alta-text"
                            : "bg-conf-vedado-bg text-conf-vedado-text",
                        )}
                      >
                        {d.status === "aprovada" ? "Aprovada" : "Rejeitada"}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <MoneyValue value={d.valorNota ?? d.valorFiscal} size="sm" />
                      <span className="font-mono text-[11px] tabular text-text-500">
                        {formatarDataHora(d.createdAt)}
                      </span>
                    </div>
                    {d.motivoRevisao && (
                      <p className="truncate font-mono text-[10.5px] text-text-500">
                        nota: “{d.motivoRevisao}”
                      </p>
                    )}
                  </motion.button>
                )
              })}
            </AnimatePresence>
          </div>
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            {selecionadoId !== null && resolvidas.some((d) => d.id === selecionadoId) ? (
              <RevisaoDetalhe despesaId={selecionadoId} somenteLeitura />
            ) : (
              !resolvidasQuery.isLoading && (
                <div className="flex min-h-[280px] items-center justify-center p-8 text-sm text-text-500">
                  Selecione uma despesa resolvida para ver o detalhe.
                </div>
              )
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}
