import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Check,
  FileText,
  Loader2,
  Paperclip,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/providers/trpc"
import type { CategoriaDespesa } from "@contracts/types"
import ConfidenceBadge from "@/components/app/ConfidenceBadge"
import FiscalField from "@/components/app/FiscalField"
import MoneyValue from "@/components/app/MoneyValue"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  CATEGORIA_ICONE,
  CATEGORIA_ROTULO,
  STATUS_ROTULO,
  TRIBUTO_ROTULO,
  formatarData,
  formatarDataHora,
  formatarNumero,
} from "@/components/ops/rotulos"
import { cn } from "@/lib/utils"

const MOTIVOS_REJEICAO = [
  "Documento insuficiente",
  "Despesa pessoal",
  "Fora do objeto social",
  "Outro",
] as const

export interface RevisaoDetalheProps {
  despesaId: number
  /** Empresa da fila (v1.12.0) — obrigatória quando `somenteLeitura` é false. */
  empresaId?: number
  /** Há aprovador designado e quem decide não é ele: pede motivo de delegação (v1.12.0). */
  exigeMotivoDelegacao?: boolean
  /** Nome do aprovador designado, para o rótulo do motivo de delegação. */
  aprovadorDesignadoNome?: string | null
  /** Modo leitura (aba Resolvidas): sem barra de decisão nem upload. */
  somenteLeitura?: boolean
  /** Chamado após decisão bem-sucedida, para animar a saída e selecionar o próximo. */
  onDecidido?: (despesaId: number, decisao: "aprovar" | "rejeitar") => void
  /** Registra o botão de anexar evidência para o atalho de teclado `e`. */
  dropzoneRef?: React.RefObject<HTMLButtonElement | null>
  /** Abre o dialog de decisão por atalho de teclado (`a` / `r`). */
  atalhoDecisao?: "aprovar" | "rejeitar" | null
  onAtalhoConsumido?: () => void
}

type Decisao = "aprovar" | "rejeitar"

/** Painel de revisão da despesa selecionada (RF-05): dados + memorial + evidências + decisão. */
export default function RevisaoDetalhe({
  despesaId,
  empresaId,
  exigeMotivoDelegacao = false,
  aprovadorDesignadoNome = null,
  somenteLeitura = false,
  onDecidido,
  dropzoneRef,
  atalhoDecisao,
  onAtalhoConsumido,
}: RevisaoDetalheProps) {
  const utils = trpc.useUtils()
  const detalhe = trpc.despesas.get.useQuery({ id: despesaId }, { retry: false })

  const [notas, setNotas] = useState("")
  const [dialog, setDialog] = useState<Decisao | null>(null)
  const [motivoRejeicao, setMotivoRejeicao] = useState<string>(MOTIVOS_REJEICAO[0])
  const [justificativa, setJustificativa] = useState("")
  const [motivoDelegacao, setMotivoDelegacao] = useState("")
  const [exigirEvidencia, setExigirEvidencia] = useState(false)
  const [uploadProgresso, setUploadProgresso] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropzoneInternoRef = useRef<HTMLButtonElement>(null)

  // Reseta estado local ao trocar de despesa
  useEffect(() => {
    setNotas("")
    setDialog(null)
    setJustificativa("")
    setMotivoDelegacao("")
    setExigirEvidencia(false)
  }, [despesaId])

  // Atalhos de teclado vindos da página (`a` aprovar, `r` rejeitar)
  useEffect(() => {
    if (!atalhoDecisao || somenteLeitura) return
    abrirDialog(atalhoDecisao)
    onAtalhoConsumido?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atalhoDecisao])

  const decidir = trpc.revisao.decidir.useMutation({
    onSuccess: async (_r, vars) => {
      await Promise.all([
        utils.revisao.fila.invalidate(),
        utils.despesas.get.invalidate({ id: despesaId }),
        utils.despesas.list.invalidate(),
      ])
      toast.success(
        vars.decisao === "aprovar"
          ? "Despesa liberada — crédito movido para capturável."
          : "Despesa rejeitada e registrada no log.",
      )
      setDialog(null)
      onDecidido?.(despesaId, vars.decisao)
    },
    onError: (erro) => {
      const codigo = (erro as unknown as { data?: { code?: string } }).data?.code
      // PRECONDITION_FAILED cobre dois casos distintos (v1.12.0): a evidência
      // do RF-04 (mensagem começa com "RF-04") e o motivo de delegação ausente.
      if (codigo === "PRECONDITION_FAILED" && erro.message.startsWith("RF-04")) {
        setDialog(null)
        setExigirEvidencia(true)
        toast.warning("Evidência obrigatória: anexe um documento de suporte antes de aprovar (RF-04).")
      } else {
        toast.error(erro.message)
      }
    },
  })

  const addEvidencia = trpc.despesas.addEvidencia.useMutation({
    onSuccess: async () => {
      await utils.despesas.get.invalidate({ id: despesaId })
      await utils.revisao.fila.invalidate()
      setExigirEvidencia(false)
      toast.success("Evidência anexada à despesa.")
    },
    onError: (erro) => toast.error(erro.message),
    onSettled: () => setUploadProgresso(false),
  })

  const dados = detalhe.data
  const despesa = dados?.despesa
  const nota = dados?.nota
  const evidencias = useMemo(() => dados?.evidencias ?? [], [dados])
  const creditos = useMemo(() => dados?.creditos ?? [], [dados])

  const semEvidencia = evidencias.length === 0
  const bloqueioAprovacao = !somenteLeitura && despesa?.confianca === "media" && semEvidencia

  function abrirDialog(decisao: Decisao) {
    setJustificativa(notas)
    setMotivoRejeicao(MOTIVOS_REJEICAO[0])
    setDialog(decisao)
  }

  function confirmarDecisao() {
    if (!despesa || !dialog) return
    const texto =
      dialog === "rejeitar"
        ? `${motivoRejeicao}: ${justificativa.trim()}`.slice(0, 2000)
        : justificativa.trim()
    decidir.mutate({
      empresaId: empresaId!,
      despesaId: despesa.id,
      decisao: dialog,
      justificativa: texto,
      motivoDelegacao: exigeMotivoDelegacao ? motivoDelegacao.trim() : undefined,
    })
  }

  function aoSelecionarArquivo(arquivo: File) {
    if (!despesa) return
    setUploadProgresso(true)
    const leitor = new FileReader()
    leitor.onload = () => {
      const resultado = String(leitor.result ?? "")
      const base64 = resultado.includes(",") ? resultado.split(",")[1] : resultado
      addEvidencia.mutate({
        despesaId: despesa.id,
        tipo: "documento_suporte",
        arquivoNome: arquivo.name,
        arquivoMime: arquivo.type || undefined,
        arquivoBase64: base64 || undefined,
        observacao: notas.trim() || undefined,
      })
    }
    leitor.onerror = () => {
      setUploadProgresso(false)
      toast.error("Falha ao ler o arquivo selecionado.")
    }
    leitor.readAsDataURL(arquivo)
  }

  if (detalhe.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (detalhe.isError || !despesa) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 p-8 text-center">
        <TriangleAlert className="h-6 w-6 text-amber-500" />
        <p className="text-sm text-text-500">
          {detalhe.error?.message ?? "Não foi possível carregar a despesa."}
        </p>
      </div>
    )
  }

  const IconeCategoria = CATEGORIA_ICONE[despesa.categoria as CategoriaDespesa] ?? FileText

  return (
    <motion.div
      key={despesaId}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex min-h-full flex-col"
    >
      {/* Header */}
      <div className="border-b border-line p-6 pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand-500/10 text-brand-500">
            <IconeCategoria className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
              {CATEGORIA_ROTULO[despesa.categoria as CategoriaDespesa] ?? despesa.categoria}
              {nota?.cnpjEmitente && (
                <span className="text-text-500"> · CNPJ {nota.cnpjEmitente}</span>
              )}
            </h2>
            <p className="font-mono text-[11px] tracking-[0.02em] text-text-500">
              entrou na fila em {formatarDataHora(despesa.createdAt)}
              {despesa.confianca === "media" && " · motivo: média confiança exige documento de suporte (RF-04)"}
              {despesa.motivoRevisao && somenteLeitura && ` · ${despesa.motivoRevisao}`}
            </p>
          </div>
          <MoneyValue value={nota?.valor ?? despesa.valorFiscal} size="lg" />
          <div className="flex items-center gap-2">
            <ConfidenceBadge level={despesa.confianca} />
            <span className="rounded-full bg-paper px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.04em] text-text-500 ring-1 ring-line">
              {STATUS_ROTULO[despesa.status]}
            </span>
          </div>
        </div>
      </div>

      {/* Doc preview + dados/memorial */}
      <div className="grid gap-4 p-6 lg:grid-cols-2">
        {/* Documento */}
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-500">
              Documento original
            </span>
            {nota?.origem && (
              <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-text-500">
                origem: {nota.origem}
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
            <FileText className="h-8 w-8 text-text-500/50" />
            <p className="max-w-[260px] truncate font-mono text-[12px] text-text-900">
              {nota?.arquivoNome ?? "nota fiscal"}
            </p>
            <p className="font-mono text-[11px] text-text-500">
              {nota?.arquivoMime ?? "arquivo"} · armazenado na plataforma
            </p>
            <p className="max-w-[280px] text-[11px] leading-relaxed text-text-500">
              A pré-visualização do arquivo não está disponível nesta consulta; os campos
              extraídos via OCR estão ao lado para conferência.
            </p>
          </div>
        </div>

        {/* Dados + memorial */}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-xl border border-line bg-surface p-5">
            <FiscalField label="CNPJ emitente" value={nota?.cnpjEmitente ?? "—"} />
            <FiscalField label="Data do fato gerador" value={formatarData(nota?.dataFatoGerador)} />
            <FiscalField label="CFOP" value={nota?.cfop ?? "—"} />
            <FiscalField label="NCM" value={nota?.ncm ?? "—"} />
            <FiscalField label="CST" value={nota?.cst ?? "—"} />
            <FiscalField label="Litros" value={despesa.litros != null ? `${formatarNumero(despesa.litros)} L` : "—"} />
            <FiscalField label="Km comercial" value={`${formatarNumero(despesa.kmComercial, 0)} km`} />
            <FiscalField label="Km não comercial" value={`${formatarNumero(despesa.kmNaoComercial, 0)} km`} />
            {despesa.colaborador && <FiscalField label="Colaborador" value={despesa.colaborador} mono={false} />}
          </div>

          {/* Memorial de cálculo (dark, compacto) */}
          <div className="rounded-xl bg-ink-900 p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-dark-400">
                Memorial de cálculo
              </span>
              {creditos[0]?.regraVersao && (
                <span className="font-mono text-[10px] text-text-dark-400">
                  regra v{creditos[0].regraVersao}
                </span>
              )}
            </div>
            {creditos.length === 0 ? (
              <p className="font-mono text-[12px] text-text-dark-400">
                Sem créditos apurados para esta despesa.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {creditos.map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-mono text-[12px] font-medium text-brand-400">
                        {TRIBUTO_ROTULO[c.tributo] ?? c.tributo}
                      </span>
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.04em] text-text-dark-400">
                        {c.tipoBeneficio === "credito" ? "crédito" : "dedutibilidade"}
                      </span>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-text-dark-400">
                        {c.memorial}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[13px] font-medium tabular text-text-dark-100">
                      <MoneyValue value={c.valor} size="sm" color="positive" className="text-brand-400" />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {despesa.memorial && (
              <pre className="mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap border-t border-line-dark pt-3 font-mono text-[10.5px] leading-relaxed text-text-dark-400">
                {despesa.memorial}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* Evidências */}
      <div className="flex flex-col gap-3 px-6 pb-6">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-500">
          Evidências · Documento de suporte
        </span>

        <AnimatePresence>
          {exigirEvidencia && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-start gap-2.5 rounded-[10px] border border-amber-500/40 bg-conf-media-bg px-3.5 py-3"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-[13px] leading-snug text-conf-media-text">
                <span className="font-semibold">Evidência obrigatória.</span> Despesas de média
                confiança só podem ser aprovadas com um documento de suporte anexado (RF-04).
                Anexe abaixo e tente aprovar novamente.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-wrap items-start gap-3">
          {evidencias.map((ev) => (
            <motion.div
              key={ev.id}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
              className="flex w-[240px] items-center gap-2.5 rounded-[10px] border border-line bg-surface p-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-500">
                <Paperclip className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-mono text-[11.5px] text-text-900">{ev.arquivoNome}</p>
                <p className="font-mono text-[10px] text-text-500">
                  {formatarDataHora(ev.createdAt)}
                </p>
              </div>
            </motion.div>
          ))}

          {!somenteLeitura && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const arquivo = e.target.files?.[0]
                  if (arquivo) aoSelecionarArquivo(arquivo)
                  e.target.value = ""
                }}
              />
              <button
                type="button"
                ref={(el) => {
                  dropzoneInternoRef.current = el
                  if (dropzoneRef) dropzoneRef.current = el
                }}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadProgresso}
                className={cn(
                  "flex min-h-[64px] w-[240px] flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed px-3 py-3 text-center transition-colors",
                  semEvidencia
                    ? "border-amber-500/60 bg-conf-media-bg/40 hover:border-amber-500"
                    : "border-line bg-surface hover:border-brand-500",
                  uploadProgresso && "cursor-not-allowed opacity-60",
                )}
              >
                {uploadProgresso ? (
                  <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                ) : (
                  <Upload className={cn("h-4 w-4", semEvidencia ? "text-amber-500" : "text-text-500")} />
                )}
                <span className={cn("text-[12px] font-medium", semEvidencia ? "text-conf-media-text" : "text-text-500")}>
                  {uploadProgresso ? "Enviando…" : "Anexar PDF/imagem"}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Notas do revisor */}
      {!somenteLeitura && (
        <div className="flex flex-col gap-2 px-6 pb-28">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-500">
            Observações da revisão (ficam no log de auditoria)
          </span>
          <Textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ex.: visita técnica confirmada com o fornecedor…"
            className="min-h-[76px] rounded-[10px] border-line text-sm"
          />
        </div>
      )}

      {/* Barra de decisão (sticky) + disclaimer */}
      {!somenteLeitura && (
        <div className="sticky bottom-0 mt-auto border-t border-line bg-surface/95 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3 px-6 py-3.5">
            <button
              type="button"
              onClick={() => abrirDialog("rejeitar")}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-red-500/50 px-4 text-sm font-semibold text-red-500 transition hover:-translate-y-px hover:bg-red-500/5"
            >
              <X className="h-4 w-4" /> Rejeitar
            </button>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <button
                      type="button"
                      disabled
                      className="inline-flex h-10 cursor-not-allowed items-center rounded-[10px] px-4 text-sm font-medium text-text-500 opacity-50"
                    >
                      Reclassificar
                    </button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Reclassificação assistida disponível em breve.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="ml-auto">
                    <button
                      type="button"
                      onClick={() => abrirDialog("aprovar")}
                      disabled={bloqueioAprovacao}
                      className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-brand-500 px-5 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                      <Check className="h-4 w-4" /> Aprovar e liberar
                    </button>
                  </span>
                </TooltipTrigger>
                {bloqueioAprovacao && (
                  <TooltipContent>
                    <p className="text-xs">Anexe uma evidência para liberar a aprovação (RF-04).</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="border-t border-line px-6 py-2 font-mono text-[11px] leading-relaxed text-amber-500">
            Aprovações de média confiança devem ser validadas por um advogado tributarista.
            Isto não é aconselhamento jurídico.
          </p>
        </div>
      )}

      {/* Dialog de decisão (aprovar / rejeitar) */}
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {dialog === "aprovar" ? "Aprovar e liberar despesa" : "Rejeitar despesa"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "aprovar"
                ? "O crédito será movido para capturável e a decisão registrada no log de auditoria."
                : "A despesa será marcada como rejeitada e o motivo ficará registrado no log imutável."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {dialog === "rejeitar" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">
                  Motivo
                </span>
                <Select value={motivoRejeicao} onValueChange={setMotivoRejeicao}>
                  <SelectTrigger className="h-11 rounded-[10px] border-line">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_REJEICAO.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">
                Justificativa <span className="text-red-500">*</span>
              </span>
              <Textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Obrigatória — mínimo de 3 caracteres (máx. 2000)."
                className="min-h-[96px] rounded-[10px] border-line text-sm"
                maxLength={2000}
              />
              <span className="text-right font-mono text-[10px] text-text-500">
                {justificativa.trim().length}/2000
              </span>
            </div>
            {exigeMotivoDelegacao && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">
                  {aprovadorDesignadoNome
                    ? `Motivo de decidir no lugar de ${aprovadorDesignadoNome}`
                    : "Motivo de decidir no lugar do aprovador designado"}{" "}
                  <span className="text-red-500">*</span>
                </span>
                <Textarea
                  value={motivoDelegacao}
                  onChange={(e) => setMotivoDelegacao(e.target.value)}
                  placeholder="Ex.: aprovador em férias — decisão não pode esperar."
                  className="min-h-[76px] rounded-[10px] border-line text-sm"
                  maxLength={2000}
                />
                <span className="text-right font-mono text-[10px] text-text-500">
                  {motivoDelegacao.trim().length}/2000
                </span>
                <span className="text-[11px] text-text-500">
                  Fica registrado na trilha de delegação.
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDialog(null)}
              className="inline-flex h-10 items-center rounded-[10px] border border-line px-4 text-sm font-medium text-text-900 transition hover:bg-paper"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarDecisao}
              disabled={
                justificativa.trim().length < 3 ||
                (exigeMotivoDelegacao && motivoDelegacao.trim().length < 3) ||
                decidir.isPending
              }
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50",
                dialog === "aprovar" ? "bg-brand-500 hover:bg-brand-500/90" : "bg-red-500 hover:bg-red-500/90",
              )}
            >
              {decidir.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {dialog === "aprovar" ? "Confirmar aprovação" : "Confirmar rejeição"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
