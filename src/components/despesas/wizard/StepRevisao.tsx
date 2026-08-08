import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  CircleAlert,
  FileText,
  Minus,
  PencilLine,
  Plus,
  TriangleAlert,
} from "lucide-react"
import { Link } from "react-router"
import { trpc } from "@/providers/trpc"
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
import { CATEGORIA_META, CATEGORIA_OPTIONS, confiancaParaPct, formatNumero } from "../meta"
import {
  CAMPO_PARA_CHAVE_OCR,
  parseNumeroPt,
  type FormState,
  type NotaProcessada,
} from "./types"

interface StepRevisaoProps {
  nota: NotaProcessada
  empresaId: number
  form: FormState
  onChange: (form: FormState) => void
  editados: Set<string>
  onEditou: (campo: string) => void
  assistido: boolean
  cadastroIncompleto: boolean
  processando: boolean
  onVoltar: () => void
  onProcessar: () => void
}

const INPUT_BASE =
  "h-11 w-full rounded-[10px] border bg-surface px-3 text-[13px] text-text-900 outline-none transition placeholder:text-text-500/60 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20"

function corDot(conf: number): string {
  if (conf >= 90) return "bg-conf-alta-dot"
  if (conf >= 70) return "bg-conf-media-dot"
  return "bg-conf-vedado-dot"
}

interface CampoOcrProps {
  campo: string
  label: string
  obrigatorio?: boolean
  pendente: boolean
  editado: boolean
  confianca: number
  children: React.ReactNode
}

function CampoOcr({ campo, label, obrigatorio, pendente, editado, confianca, children }: CampoOcrProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-[10px] p-2 -m-2 transition-colors",
        pendente && !editado && "bg-conf-media-bg/50 ring-1 ring-conf-media-dot/25",
      )}
    >
      <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.06em] text-text-500">
        {label}
        {obrigatorio && <span className="text-conf-vedado-dot">*</span>}
        {editado ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-px font-mono text-[10px] font-medium normal-case tracking-normal text-blue-500">
            <PencilLine className="h-2.5 w-2.5" />
            Editado
          </span>
        ) : (
          <motion.span
            key={campo}
            initial={pendente ? { scale: 1.4 } : false}
            animate={{ scale: 1 }}
            transition={{ duration: 0.4 }}
            title={`Confiança OCR ${confianca}%`}
            className={cn("h-2 w-2 rounded-full", corDot(confianca))}
          />
        )}
      </span>
      {children}
    </div>
  )
}

export default function StepRevisao({
  nota,
  empresaId,
  form,
  onChange,
  editados,
  onEditou,
  assistido,
  cadastroIncompleto,
  processando,
  onVoltar,
  onProcessar,
}: StepRevisaoProps) {
  const [zoom, setZoom] = useState(1)
  const veiculosQuery = trpc.veiculos.list.useQuery(
    { empresaId },
    { enabled: empresaId > 0, retry: false },
  )
  const veiculos = useMemo(() => veiculosQuery.data ?? [], [veiculosQuery.data])

  const extracao = nota.extracao
  const confBase = confiancaParaPct(extracao.confiancaExtracao)

  function confCampo(campo: string): number {
    const chave = CAMPO_PARA_CHAVE_OCR[campo] ?? campo
    if (extracao.camposPendentes.includes(chave)) return Math.min(confBase, 55)
    return confBase
  }

  function pendenteCampo(campo: string): boolean {
    const chave = CAMPO_PARA_CHAVE_OCR[campo] ?? campo
    return extracao.camposPendentes.includes(chave)
  }

  function set(campo: keyof FormState, valor: string) {
    onChange({ ...form, [campo]: valor })
    onEditou(campo)
  }

  const kmComercial = parseNumeroPt(form.kmComercial)
  const kmNaoComercial = parseNumeroPt(form.kmNaoComercial)
  const kmTotal = kmComercial + kmNaoComercial
  const valorNota = parseNumeroPt(form.valorNota)
  const pctComercial = kmTotal > 0 ? Math.round((kmComercial / kmTotal) * 100) : null
  const baseFiscal = pctComercial !== null ? (valorNota * kmComercial) / kmTotal : null

  const isImagem = nota.arquivoMime.startsWith("image/")
  const mostraVeiculo = ["combustivel", "pedagio", "uber", "taxi"].includes(form.categoria)
  const mostraLitros = form.categoria === "combustivel"

  const campoProps = (campo: string) => ({
    campo,
    pendente: pendenteCampo(campo),
    editado: editados.has(campo),
    confianca: confCampo(campo),
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onProcessar()
      }}
      className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]"
    >
      {/* Coluna esquerda — formulário */}
      <div className="flex flex-col gap-4">
        {assistido && (
          <div className="flex items-start gap-2.5 rounded-xl border border-conf-media-dot/25 bg-conf-media-bg px-4 py-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-conf-media-text" />
            <p className="text-[13px] font-medium text-conf-media-text">
              Preenchimento assistido — campos obrigatórios marcados com{" "}
              <span className="text-conf-vedado-dot">*</span>.{" "}
              {extracao.avisos[0] ?? "Confira cada campo contra a nota original."}
            </p>
          </div>
        )}

        {/* 1 · Dados da nota */}
        <motion.fieldset
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0 }}
          className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-card"
        >
          <legend className="sr-only">Dados da nota</legend>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-500">
            Dados da nota
          </span>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CampoOcr {...campoProps("cnpjEmitente")} label="CNPJ emitente" obrigatorio={pendenteCampo("cnpjEmitente")}>
              <input
                value={form.cnpjEmitente}
                onChange={(e) => set("cnpjEmitente", e.target.value)}
                placeholder="00.000.000/0000-00"
                className={cn(INPUT_BASE, "border-line font-mono tabular")}
              />
            </CampoOcr>
            <CampoOcr {...campoProps("dataFatoGerador")} label="Data do fato gerador" obrigatorio>
              <input
                type="date"
                required
                value={form.dataFatoGerador}
                onChange={(e) => set("dataFatoGerador", e.target.value)}
                className={cn(INPUT_BASE, "border-line font-mono tabular")}
              />
            </CampoOcr>
            <CampoOcr {...campoProps("cfop")} label="CFOP" obrigatorio={pendenteCampo("cfop")}>
              <input
                value={form.cfop}
                onChange={(e) => set("cfop", e.target.value)}
                placeholder="5656"
                className={cn(INPUT_BASE, "border-line font-mono tabular")}
              />
            </CampoOcr>
            <CampoOcr {...campoProps("ncm")} label="NCM" obrigatorio={pendenteCampo("ncm")}>
              <input
                value={form.ncm}
                onChange={(e) => set("ncm", e.target.value)}
                placeholder="2710.12.59"
                className={cn(INPUT_BASE, "border-line font-mono tabular")}
              />
            </CampoOcr>
            <CampoOcr {...campoProps("cst")} label="CST/CSOSN" obrigatorio={pendenteCampo("cst")}>
              <input
                value={form.cst}
                onChange={(e) => set("cst", e.target.value)}
                placeholder="060"
                className={cn(INPUT_BASE, "border-line font-mono tabular")}
              />
            </CampoOcr>
            <CampoOcr {...campoProps("valorNota")} label="Valor total (R$)" obrigatorio>
              <input
                required
                inputMode="decimal"
                value={form.valorNota}
                onChange={(e) => set("valorNota", e.target.value)}
                placeholder="487,30"
                className={cn(INPUT_BASE, "border-line font-mono tabular")}
              />
            </CampoOcr>
            {mostraLitros && (
              <CampoOcr {...campoProps("litros")} label="Litros" obrigatorio={pendenteCampo("litros")}>
                <input
                  inputMode="decimal"
                  value={form.litros}
                  onChange={(e) => set("litros", e.target.value)}
                  placeholder="48,200"
                  className={cn(INPUT_BASE, "border-line font-mono tabular")}
                />
              </CampoOcr>
            )}
          </div>
        </motion.fieldset>

        {/* 2 · Classificação */}
        <motion.fieldset
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
          className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-card"
        >
          <legend className="sr-only">Classificação</legend>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-500">
            Classificação
          </span>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CampoOcr {...campoProps("categoria")} label="Categoria da despesa" obrigatorio>
              <Select
                value={form.categoria}
                onValueChange={(v) => set("categoria", v)}
              >
                <SelectTrigger className="h-11 w-full border-line text-[13px]">
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIA_OPTIONS.map((c) => {
                    const Icone = CATEGORIA_META[c.value].icon
                    return (
                      <SelectItem key={c.value} value={c.value}>
                        <span className="flex items-center gap-2">
                          <Icone className="h-3.5 w-3.5 text-text-500" />
                          {c.label}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </CampoOcr>
            <CampoOcr campo="colaborador" label="Colaborador" pendente={false} editado={editados.has("colaborador")} confianca={100}>
              <input
                value={form.colaborador}
                onChange={(e) => set("colaborador", e.target.value)}
                placeholder="Ex.: Ana Souza"
                className={cn(INPUT_BASE, "border-line")}
              />
            </CampoOcr>
            <CampoOcr campo="centroCusto" label="Centro de custo" pendente={false} editado={editados.has("centroCusto")} confianca={100}>
              <input
                value={form.centroCusto}
                onChange={(e) => set("centroCusto", e.target.value)}
                placeholder="Ex.: CC-OPERACOES"
                className={cn(INPUT_BASE, "border-line font-mono tabular")}
              />
            </CampoOcr>
          </div>
          <CampoOcr campo="motivo" label="Motivo do deslocamento" pendente={false} editado={editados.has("motivo")} confianca={100}>
            <textarea
              rows={2}
              value={form.motivo}
              onChange={(e) => set("motivo", e.target.value)}
              placeholder="Ex.: visita técnica ao cliente X em Campinas"
              className="w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] text-text-900 outline-none transition placeholder:text-text-500/60 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20"
            />
          </CampoOcr>
        </motion.fieldset>

        {/* 3 · Uso do veículo */}
        {mostraVeiculo && (
          <motion.fieldset
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.16 }}
            className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-card"
          >
            <legend className="sr-only">Uso do veículo</legend>
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-500">
              Uso do veículo
            </span>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <CampoOcr campo="veiculoId" label="Veículo vinculado" pendente={false} editado={editados.has("veiculoId")} confianca={100}>
                {veiculosQuery.isLoading ? (
                  <Skeleton className="h-11 w-full rounded-[10px]" />
                ) : (
                  <Select value={form.veiculoId} onValueChange={(v) => set("veiculoId", v === "nenhum" ? "" : v)}>
                    <SelectTrigger className="h-11 w-full border-line text-[13px]">
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Sem veículo</SelectItem>
                      {veiculos.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          <span className="font-mono tabular">
                            {v.placa} · {formatNumero(v.kmPorLitroDeclarado)} km/L
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </CampoOcr>
              <CampoOcr campo="kmComercial" label="km comercial" pendente={false} editado={editados.has("kmComercial")} confianca={100}>
                <input
                  inputMode="decimal"
                  value={form.kmComercial}
                  onChange={(e) => set("kmComercial", e.target.value)}
                  placeholder="412"
                  className={cn(INPUT_BASE, "border-line font-mono tabular")}
                />
              </CampoOcr>
              <CampoOcr campo="kmNaoComercial" label="km não comercial" pendente={false} editado={editados.has("kmNaoComercial")} confianca={100}>
                <input
                  inputMode="decimal"
                  value={form.kmNaoComercial}
                  onChange={(e) => set("kmNaoComercial", e.target.value)}
                  placeholder="46"
                  className={cn(INPUT_BASE, "border-line font-mono tabular")}
                />
              </CampoOcr>
            </div>

            {pctComercial !== null && (
              <motion.div
                key={`${kmComercial}-${kmTotal}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="rounded-[10px] border-l-[3px] border-brand-500 bg-paper px-4 py-3 font-mono text-[12px] tabular text-text-900"
              >
                % comercial = {formatNumero(kmComercial, 0)} ÷ {formatNumero(kmTotal, 0)} km ={" "}
                <span className="font-semibold text-brand-500">{pctComercial}%</span>
                {baseFiscal !== null && valorNota > 0 && (
                  <>
                    {" "}
                    · base fiscal = {formatBRL(valorNota)} × {pctComercial}% ={" "}
                    <span className="font-semibold text-brand-500">{formatBRL(baseFiscal)}</span>
                  </>
                )}
              </motion.div>
            )}
          </motion.fieldset>
        )}
      </div>

      {/* Coluna direita — preview do documento (sticky) */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-500">
              <FileText className="h-3.5 w-3.5" />
              Nota original
            </span>
            {isImagem && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Reduzir zoom"
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-text-500 transition hover:bg-paper hover:text-text-900"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-12 text-center font-mono text-[11px] tabular text-text-500">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  aria-label="Aumentar zoom"
                  onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-text-500 transition hover:bg-paper hover:text-text-900"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {isImagem ? (
            <div className="max-h-[420px] overflow-auto rounded-lg border border-line bg-paper">
              <img
                src={`data:${nota.arquivoMime};base64,${nota.arquivoBase64}`}
                alt={nota.arquivoNome}
                style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
                className="w-full transition-transform duration-200"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-paper px-6 py-12 text-center">
              <FileText className="h-8 w-8 text-text-500" />
              <span className="max-w-full truncate font-mono text-[12px] text-text-900">
                {nota.arquivoNome}
              </span>
              <span className="font-mono text-[11px] text-text-500">
                {nota.arquivoMime || "arquivo"} · extração via {extracao.provedor}
              </span>
            </div>
          )}

          {extracao.avisos.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {extracao.avisos.map((aviso, i) => (
                <span key={i} className="flex items-start gap-1.5 font-mono text-[11px] leading-relaxed text-text-500">
                  <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-conf-media-dot" />
                  {aviso}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Footer sticky */}
      <div className="sticky bottom-0 z-10 -mx-2 flex items-center gap-2 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-card backdrop-blur lg:col-span-2">
        <button
          type="button"
          onClick={onVoltar}
          className="inline-flex h-10 items-center rounded-[10px] px-4 text-[13px] font-semibold text-text-500 transition hover:bg-paper hover:text-text-900"
        >
          ← Voltar
        </button>
        <div className="ml-auto flex items-center gap-3">
          {cadastroIncompleto && (
            <span className="hidden items-center gap-2 text-[12px] font-medium text-conf-media-text sm:flex">
              <TriangleAlert className="h-4 w-4" />
              Complete o cadastro da empresa para processar créditos.
              <Link to="/app/empresas" className="font-semibold underline">
                Completar cadastro
              </Link>
            </span>
          )}
          <button
            type="submit"
            disabled={processando || cadastroIncompleto || !form.categoria || !form.valorNota || !form.dataFatoGerador}
            title={cadastroIncompleto ? "Complete o cadastro da empresa para processar créditos" : undefined}
            className={cn(
              "inline-flex h-10 items-center rounded-[10px] bg-brand-500 px-5 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90",
              (processando || cadastroIncompleto || !form.categoria || !form.valorNota || !form.dataFatoGerador) &&
                "cursor-not-allowed opacity-50 hover:translate-y-0",
            )}
          >
            {processando ? "Processando…" : "Processar crédito →"}
          </button>
        </div>
      </div>
    </form>
  )
}
