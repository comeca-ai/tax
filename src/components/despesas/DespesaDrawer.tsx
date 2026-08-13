import { useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import {
  FileText,
  Lock,
  Paperclip,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/providers/trpc"
import type { NivelConfianca } from "@contracts/types"
import ConfidenceBadge from "@/components/app/ConfidenceBadge"
import FiscalField from "@/components/app/FiscalField"
import MoneyValue from "@/components/app/MoneyValue"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatBRL } from "@/lib/format"
import { cn } from "@/lib/utils"
import MemorialCard, { type MemorialLinha } from "./MemorialCard"
import VereditoPolitica from "@/components/politica/VereditoPolitica"
import StatusChip from "./StatusChip"
import { fileParaBase64 } from "./arquivo"
import {
  CATEGORIA_META,
  TIPOS_EVIDENCIA,
  TRIBUTO_LABEL,
  confiancaParaPct,
  formatData,
  formatDataHora,
  formatKm,
  formatNumero,
  tipoEvidenciaLabel,
} from "./meta"

interface DespesaDrawerProps {
  despesaId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const secaoAnim = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
}

function Secao({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <motion.section
      {...secaoAnim}
      transition={{ duration: 0.25, delay: 0.05 * index, ease: "easeOut" }}
      className="flex flex-col gap-3 border-b border-line px-6 py-5 last:border-b-0"
    >
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-500">{title}</h3>
      {children}
    </motion.section>
  )
}

export default function DespesaDrawer({ despesaId, open, onOpenChange }: DespesaDrawerProps) {
  const utils = trpc.useUtils()
  const query = trpc.despesas.get.useQuery(
    { id: despesaId ?? 0 },
    { enabled: open && despesaId !== null, retry: false },
  )

  const [tipoEvidencia, setTipoEvidencia] = useState<string>("outro")
  const [observacao, setObservacao] = useState("")
  const [arquivo, setArquivo] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addEvidencia = trpc.despesas.addEvidencia.useMutation({
    onSuccess: async () => {
      toast.success("Evidência anexada", {
        description: "A despesa segue para revisão com o documento de suporte.",
      })
      setArquivo(null)
      setObservacao("")
      if (despesaId !== null) {
        await utils.despesas.get.invalidate({ id: despesaId })
        await utils.despesas.list.invalidate()
      }
    },
    onError: (erro) => {
      toast.error("Falha ao anexar evidência", { description: erro.message })
    },
  })

  const data = query.data
  const despesa = data?.despesa
  const nota = data?.nota ?? null
  const creditos = useMemo(() => data?.creditos ?? [], [data])
  const evidencias = useMemo(() => data?.evidencias ?? [], [data])
  const veiculo = data?.veiculo ?? null

  const memorialLinhas: MemorialLinha[] = useMemo(
    () =>
      creditos.map((c) => ({
        tributo: c.tributo,
        tipoBeneficio: c.tipoBeneficio,
        valor: c.valor,
        formula: c.memorial ?? "",
        baseLegal: null,
        regraVersao: c.regraVersao,
      })),
    [creditos],
  )

  // Dots OCR: proxy pelo nível de confiança da classificação da despesa.
  const ocrPct = despesa && nota?.origem === "ocr" ? confiancaParaPct(despesa.confianca as NivelConfianca) : undefined

  const kmComercial = despesa?.kmComercial ?? 0
  const kmNaoComercial = despesa?.kmNaoComercial ?? 0
  const kmTotal = kmComercial + kmNaoComercial
  const pctComercial = kmTotal > 0 ? Math.round((kmComercial / kmTotal) * 100) : null

  const precisaEvidencia =
    despesa?.confianca === "media" && evidencias.length === 0

  const timeline = useMemo(() => {
    if (!despesa) return []
    const itens: { data: Date | string; texto: string }[] = [
      {
        data: despesa.createdAt,
        texto: `Despesa criada · classificada ${STATUS_TIMELINE[despesa.confianca] ?? despesa.confianca} · categoria ${despesa.categoria ? (CATEGORIA_META[despesa.categoria]?.label ?? despesa.categoria) : "a definir"}`,
      },
      ...creditos.map((c) => ({
        data: c.createdAt,
        texto: `${c.tipoBeneficio === "credito" ? "Crédito apurado" : "Dedutibilidade apurada"} · ${TRIBUTO_LABEL[c.tributo]} ${formatBRL(c.valor)} · regra v${c.regraVersao}`,
      })),
      ...evidencias.map((e) => ({
        data: e.createdAt,
        texto: `Evidência anexada · ${tipoEvidenciaLabel(e.tipo)} · ${e.arquivoNome ?? "arquivo"}`,
      })),
    ]
    return itens.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
  }, [despesa, creditos, evidencias])

  async function enviarEvidencia() {
    if (!despesaId || !arquivo) return
    const base64 = await fileParaBase64(arquivo)
    addEvidencia.mutate({
      despesaId,
      tipo: tipoEvidencia,
      arquivoNome: arquivo.name,
      arquivoMime: arquivo.type || undefined,
      arquivoBase64: base64,
      observacao: observacao.trim() || undefined,
    })
  }

  const categoriaMeta = despesa?.categoria ? CATEGORIA_META[despesa.categoria] : null
  const CategoriaIcon = categoriaMeta?.icon

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-line bg-surface p-0 sm:max-w-[560px]"
      >
        <SheetTitle className="sr-only">Detalhe da despesa</SheetTitle>
        <SheetDescription className="sr-only">
          Memorial de cálculo, evidências e trilha de auditoria da despesa.
        </SheetDescription>

        {/* Header */}
        <div className="flex items-start gap-3 border-b border-line px-6 py-5 pr-12">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-500/10 text-brand-500">
            {CategoriaIcon ? <CategoriaIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate font-display text-[17px] font-semibold tracking-[-0.01em] text-text-900">
              {categoriaMeta?.label ?? "Despesa"}
              {nota?.cnpjEmitente ? ` · ${nota.cnpjEmitente}` : despesa ? ` #${despesa.id}` : ""}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {despesa && <ConfidenceBadge level={despesa.confianca as NivelConfianca} variant="solid" />}
              {despesa && <StatusChip status={despesa.status} />}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {query.isLoading && (
            <div className="flex flex-col gap-4 p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          )}

          {query.isError && (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <TriangleAlert className="h-6 w-6 text-conf-vedado-dot" />
              <p className="text-sm text-text-500">
                Não foi possível carregar a despesa. {query.error.message}
              </p>
            </div>
          )}

          {despesa && (
            <>
              {/* 1 · Resumo */}
              <Secao index={0} title="Resumo">
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <FiscalField label="Data do fato gerador" value={formatData(nota?.dataFatoGerador)} confidence={ocrPct} />
                  <FiscalField label="Valor da nota" value={nota?.valor != null ? formatBRL(nota.valor) : "—"} confidence={ocrPct} />
                  <FiscalField label="CNPJ emitente" value={nota?.cnpjEmitente ?? "—"} confidence={ocrPct} />
                  <FiscalField label="CFOP" value={nota?.cfop ?? "—"} confidence={ocrPct} />
                  <FiscalField label="NCM" value={nota?.ncm ?? "—"} confidence={ocrPct} />
                  <FiscalField label="CST/CSOSN" value={nota?.cst ?? "—"} confidence={ocrPct} />
                  {despesa.litros != null && (
                    <FiscalField label="Litros" value={`${formatNumero(despesa.litros)} L`} confidence={ocrPct} />
                  )}
                  <FiscalField label="Colaborador" value={despesa.colaborador ?? "—"} mono={false} />
                  <FiscalField label="Centro de custo" value={despesa.centroCusto ?? "—"} mono={false} />
                  <FiscalField label="km comercial" value={formatKm(despesa.kmComercial)} />
                  <FiscalField label="km não comercial" value={formatKm(despesa.kmNaoComercial)} />
                  {veiculo && (
                    <FiscalField
                      label="Veículo"
                      value={`${veiculo.placa} · ${formatNumero(veiculo.kmPorLitroDeclarado)} km/L`}
                    />
                  )}
                </div>
                {despesa.motivoDeslocamento && (
                  <FiscalField label="Motivo do deslocamento" value={despesa.motivoDeslocamento} mono={false} />
                )}
              </Secao>

              {/* 2 · Uso misto */}
              {pctComercial !== null && (
                <Secao index={1} title="Uso misto">
                  <div className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-4">
                    <span className="font-mono text-[13px] tabular text-text-900">
                      % comercial = {formatKm(kmComercial)} ÷ {formatKm(kmTotal)} ={" "}
                      <span className="font-semibold text-brand-500">{pctComercial}%</span>
                    </span>
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-line">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pctComercial}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="h-full bg-brand-500"
                      />
                    </div>
                    <div className="flex items-center gap-4 font-mono text-[11px] text-text-500">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-brand-500" /> comercial
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-line" /> não comercial
                      </span>
                    </div>
                    <p className="font-mono text-[11px] leading-relaxed tracking-[0.02em] text-text-500">
                      valor fiscal ({formatBRL(despesa.valorFiscal)}) ≠ valor reembolsável (
                      {formatBRL(despesa.valorReembolsavel)}
                      {veiculo && veiculo.tarifaReembolsoKm > 0
                        ? ` = tarifa/km ${formatBRL(veiculo.tarifaReembolsoKm)} × km comercial`
                        : ""}
                      ) — cálculos independentes.
                    </p>
                  </div>
                </Secao>
              )}

              {/* 3 · Memorial de cálculo */}
              <Secao index={2} title="Memorial de cálculo">
                {memorialLinhas.length > 0 ? (
                  <MemorialCard
                    linhas={memorialLinhas}
                    contexto={`regra v${memorialLinhas[0]?.regraVersao ?? "1.1"} · vigente na data do fato ${formatData(nota?.dataFatoGerador)}`}
                  />
                ) : (
                  <p className="rounded-xl border border-dashed border-line bg-paper px-4 py-6 text-center font-mono text-[12px] text-text-500">
                    Nenhum crédito apurado para esta despesa.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-line bg-paper p-3">
                    <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-500">
                      Valor fiscal
                    </span>
                    <MoneyValue value={despesa.valorFiscal} size="lg" color="positive" className="block" />
                  </div>
                  <div className="rounded-xl border border-line bg-paper p-3">
                    <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-500">
                      Valor reembolsável
                    </span>
                    <MoneyValue value={despesa.valorReembolsavel} size="lg" className="block" />
                  </div>
                </div>
              </Secao>

              {/* 4 · Política de reembolso (v1.1.0) */}
              {despesa.politicaDecisao && (
                <Secao index={3} title="Política de reembolso">
                  <VereditoPolitica
                    decisao={despesa.politicaDecisao}
                    motivos={(despesa.politicaMotivo ?? "").split("\n").filter(Boolean)}
                    versao={despesa.politicaVersaoAplicada}
                  />
                </Secao>
              )}

              {/* 5 · Evidências */}
              <Secao index={4} title="Evidências">
                {precisaEvidencia && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-conf-media-dot/20 bg-conf-media-bg px-4 py-3">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-conf-media-text" />
                    <div className="flex flex-col gap-1">
                      <p className="text-[13px] font-medium text-conf-media-text">
                        Esta despesa precisa de documento de suporte para sair da revisão.
                      </p>
                      <p className="text-[12px] leading-relaxed text-conf-media-text/90">
                        Sem documento anexado, nenhum crédito é confirmado — é essa exigência que
                        defende a apuração numa fiscalização.
                      </p>
                    </div>
                  </div>
                )}

                {nota?.arquivoNome && (
                  <div className="flex items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3">
                    <FileText className="h-5 w-5 shrink-0 text-blue-500" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-medium text-text-900">{nota.arquivoNome}</span>
                      <span className="font-mono text-[11px] text-text-500">
                        nota fiscal original · {nota.origem === "ocr" ? "OCR" : "manual"}
                      </span>
                    </div>
                  </div>
                )}

                {evidencias.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                    <Paperclip className="h-4 w-4 shrink-0 text-text-500" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-medium text-text-900">
                        {e.arquivoNome ?? tipoEvidenciaLabel(e.tipo)}
                      </span>
                      <span className="font-mono text-[11px] text-text-500">
                        {tipoEvidenciaLabel(e.tipo)} · {formatDataHora(e.createdAt)}
                        {e.observacao ? ` · ${e.observacao}` : ""}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Upload de evidência */}
                <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line bg-paper p-4">
                  <span className="text-[12px] font-semibold text-text-900">Anexar documento de suporte</span>
                  <div className="flex items-center gap-2">
                    <Select value={tipoEvidencia} onValueChange={setTipoEvidencia}>
                      <SelectTrigger className="h-10 flex-1 border-line bg-surface text-[13px]">
                        <SelectValue placeholder="Tipo de documento" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS_EVIDENCIA.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[13px] font-medium text-text-900 transition hover:bg-paper"
                    >
                      <Upload className="h-4 w-4 text-text-500" />
                      {arquivo ? "Trocar arquivo" : "Escolher arquivo"}
                    </button>
                  </div>
                  {arquivo && (
                    <span className="flex items-center gap-2 font-mono text-[11px] text-text-500">
                      <Paperclip className="h-3 w-3" />
                      {arquivo.name}
                      <button
                        type="button"
                        aria-label="Remover arquivo"
                        onClick={() => setArquivo(null)}
                        className="text-text-500 transition hover:text-conf-vedado-dot"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                  <textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    rows={2}
                    placeholder="Observação (opcional) — ex.: roteiro da visita ao cliente"
                    className="w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] text-text-900 outline-none transition placeholder:text-text-500/60 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20"
                  />
                  <button
                    type="button"
                    disabled={!arquivo || addEvidencia.isPending}
                    onClick={() => void enviarEvidencia()}
                    className={cn(
                      "inline-flex h-10 items-center justify-center rounded-[10px] bg-brand-500 px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90",
                      (!arquivo || addEvidencia.isPending) && "cursor-not-allowed opacity-50 hover:translate-y-0",
                    )}
                  >
                    {addEvidencia.isPending ? "Enviando…" : "Anexar evidência"}
                  </button>
                </div>
              </Secao>

              {/* 6 · Auditoria */}
              <Secao index={5} title="Auditoria">
                <ol className="relative flex flex-col gap-4 border-l border-line pl-5">
                  {timeline.map((item, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: 0.1 + i * 0.05 }}
                      className="relative"
                    >
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.3, delay: 0.1 + i * 0.05 }}
                        className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand-500"
                      />
                      <span className="font-mono text-[12px] leading-relaxed text-text-500">
                        <span className="font-semibold text-text-900">{formatDataHora(item.data)}</span>
                        {" · "}
                        {item.texto}
                      </span>
                    </motion.li>
                  ))}
                </ol>
                <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.02em] text-text-500">
                  <Lock className="h-3.5 w-3.5" />
                  Registro imutável — não pode ser editado ou apagado.
                </p>
              </Secao>
            </>
          )}
        </div>

        {/* Footer */}
        {despesa && (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface px-6 py-4">
            {precisaEvidencia && (
              <span className="mr-auto flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.04em] text-conf-media-text">
                <TriangleAlert className="h-3.5 w-3.5" /> evidência pendente
              </span>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-10 items-center rounded-[10px] border border-line bg-surface px-4 text-[13px] font-semibold text-text-900 transition hover:bg-paper"
            >
              Fechar
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

const STATUS_TIMELINE: Record<string, string> = {
  alta: "Alta confiança",
  media: "Média confiança",
  baixa: "Baixa confiança",
  vedado: "Vedado",
}
