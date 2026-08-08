import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, CircleAlert, Plus, Save, X } from "lucide-react"
import type { ConfiancaExtracao } from "@contracts/types"
import { CONFIANCA_EXTRACAO_LABELS } from "@contracts/types"
import { Checkbox } from "@/components/ui/checkbox"
import { CATEGORIA_META } from "@/components/despesas/meta"
import { cn } from "@/lib/utils"
import { CATEGORIAS_POLITICA, type RegrasForm } from "./regrasForm"

interface PoliticaRegrasStepProps {
  form: RegrasForm
  onChange: (form: RegrasForm) => void
  camposPendentes: string[]
  editados: Set<string>
  onEditou: (campo: string) => void
  confiancaExtracao: ConfiancaExtracao
  provedor: string
  avisos: string[]
  salvando: boolean
  onVoltar: () => void
  onSalvar: () => void
}

const INPUT_BASE =
  "h-10 w-full rounded-[10px] border border-line bg-surface px-3 font-mono text-[13px] tabular text-text-900 outline-none transition placeholder:text-text-500/60 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20"

const DOT_CONFIANCA: Record<ConfiancaExtracao, string> = {
  alta: "bg-conf-alta-dot",
  media: "bg-conf-media-dot",
  baixa: "bg-conf-vedado-dot",
}

/** Destaque âmbar de preenchimento assistido (pendente e ainda não editado). */
function destaqueAssistido(pendente: boolean): string {
  return pendente ? "bg-conf-media-bg/50 ring-1 ring-conf-media-dot/25" : ""
}

interface SecaoRegrasProps {
  titulo: string
  descricao?: string
  pendente: boolean
  children: React.ReactNode
}

function SecaoRegras({ titulo, descricao, pendente, children }: SecaoRegrasProps) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors",
        destaqueAssistido(pendente),
      )}
    >
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-text-900">
          {titulo}
          {pendente && (
            <span className="inline-flex items-center gap-1 rounded-full bg-conf-media-bg px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-conf-media-text">
              <CircleAlert className="h-2.5 w-2.5" />
              Revisar
            </span>
          )}
        </h3>
        {descricao && <p className="text-[12px] leading-relaxed text-text-500">{descricao}</p>}
      </div>
      {children}
    </section>
  )
}

/** Passo 2 do wizard de política: revisão/edição assistida das regras extraídas. */
export default function PoliticaRegrasStep({
  form,
  onChange,
  camposPendentes,
  editados,
  onEditou,
  confiancaExtracao,
  provedor,
  avisos,
  salvando,
  onVoltar,
  onSalvar,
}: PoliticaRegrasStepProps) {
  const [novaObservacao, setNovaObservacao] = useState("")

  function pendente(campo: string): boolean {
    return camposPendentes.includes(campo) && !editados.has(campo)
  }

  function setLimite(cat: (typeof CATEGORIAS_POLITICA)[number], valor: string) {
    onChange({ ...form, limites: { ...form.limites, [cat]: valor } })
    onEditou("limitesPorCategoria")
  }

  function setFlag(
    grupo: "exigeVeiculo" | "exigeEvidencia",
    cat: (typeof CATEGORIAS_POLITICA)[number],
    valor: boolean,
  ) {
    onChange({ ...form, [grupo]: { ...form[grupo], [cat]: valor } })
    onEditou(grupo === "exigeVeiculo" ? "exigeVeiculoCadastrado" : "exigeEvidencia")
  }

  function setTeto(campo: "aprovacaoAutomaticaAte" | "revisaoHumanaAcimaDe" | "negacaoAcimaDe", valor: string) {
    onChange({ ...form, [campo]: valor })
    onEditou(campo)
  }

  function adicionarObservacao() {
    const texto = novaObservacao.trim()
    if (!texto) return
    onChange({ ...form, observacoes: [...form.observacoes, texto] })
    onEditou("observacoes")
    setNovaObservacao("")
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Confiança da extração */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
        <span className="flex items-center gap-2 text-[12px] font-medium text-text-900">
          <motion.span
            initial={{ scale: 1.4 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.4 }}
            title={`Confiança da extração: ${CONFIANCA_EXTRACAO_LABELS[confiancaExtracao]}`}
            className={cn("h-2.5 w-2.5 rounded-full", DOT_CONFIANCA[confiancaExtracao])}
          />
          Extração {CONFIANCA_EXTRACAO_LABELS[confiancaExtracao].toLowerCase()}
        </span>
        <span className="inline-flex items-center rounded-md border border-line bg-paper px-2 py-0.5 font-mono text-[10px] tracking-[0.02em] text-text-500">
          parser {provedor}
        </span>
        {camposPendentes.length > 0 && (
          <span className="font-mono text-[11px] tracking-[0.02em] text-conf-media-text">
            {camposPendentes.length} campo(s) para conferir — destacados em âmbar
          </span>
        )}
      </div>

      {/* Avisos do parser */}
      {avisos.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-4 shadow-card">
          {avisos.map((aviso, i) => (
            <span
              key={i}
              className="flex items-start gap-2 font-mono text-[12px] leading-relaxed text-text-500"
            >
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-conf-media-dot" />
              {aviso}
            </span>
          ))}
        </div>
      )}

      {/* Limites + exigências por categoria */}
      <SecaoRegras
        titulo="Limites e exigências por categoria"
        descricao="Limite em branco = sem teto específico para a categoria. Acima de 1,5× o limite o agente nega; entre 1× e 1,5× vai para revisão humana."
        pendente={pendente("limitesPorCategoria")}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="pb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-text-500">
                  Categoria
                </th>
                <th className="pb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-text-500">
                  Limite (R$)
                </th>
                <th
                  className={cn(
                    "rounded-t-md pb-2 text-center text-[11px] font-medium uppercase tracking-[0.06em] text-text-500",
                    pendente("exigeVeiculoCadastrado") && "text-conf-media-text",
                  )}
                >
                  Exige veículo
                </th>
                <th
                  className={cn(
                    "rounded-t-md pb-2 text-center text-[11px] font-medium uppercase tracking-[0.06em] text-text-500",
                    pendente("exigeEvidencia") && "text-conf-media-text",
                  )}
                >
                  Exige evidência
                </th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIAS_POLITICA.map((cat) => {
                const meta = CATEGORIA_META[cat]
                const Icone = meta.icon
                return (
                  <tr key={cat} className="border-b border-line/60 last:border-b-0">
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-2 text-[13px] font-medium text-text-900">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
                          <Icone className="h-3.5 w-3.5" />
                        </span>
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <input
                        inputMode="decimal"
                        value={form.limites[cat]}
                        onChange={(e) => setLimite(cat, e.target.value)}
                        placeholder="sem limite"
                        aria-label={`Limite de ${meta.label}`}
                        className={cn(INPUT_BASE, "max-w-[150px]")}
                      />
                    </td>
                    <td className="py-2.5 text-center">
                      <Checkbox
                        checked={form.exigeVeiculo[cat]}
                        onCheckedChange={(v) => setFlag("exigeVeiculo", cat, v === true)}
                        aria-label={`Exige veículo cadastrado para ${meta.label}`}
                      />
                    </td>
                    <td className="py-2.5 text-center">
                      <Checkbox
                        checked={form.exigeEvidencia[cat]}
                        onCheckedChange={(v) => setFlag("exigeEvidencia", cat, v === true)}
                        aria-label={`Exige evidência para ${meta.label}`}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SecaoRegras>

      {/* Tetos globais */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div
          className={cn(
            "flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors",
            destaqueAssistido(pendente("aprovacaoAutomaticaAte")),
          )}
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-500">
            Aprovação automática até
          </span>
          <input
            inputMode="decimal"
            value={form.aprovacaoAutomaticaAte}
            onChange={(e) => setTeto("aprovacaoAutomaticaAte", e.target.value)}
            placeholder="sem teto"
            className={INPUT_BASE}
          />
          <span className="text-[11px] leading-relaxed text-text-500">
            Até este valor (e sem nenhuma falha) o agente aprova direto.
          </span>
        </div>
        <div
          className={cn(
            "flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors",
            destaqueAssistido(pendente("revisaoHumanaAcimaDe")),
          )}
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-500">
            Revisão humana acima de
          </span>
          <input
            inputMode="decimal"
            value={form.revisaoHumanaAcimaDe}
            onChange={(e) => setTeto("revisaoHumanaAcimaDe", e.target.value)}
            placeholder="sem regra"
            className={INPUT_BASE}
          />
          <span className="text-[11px] leading-relaxed text-text-500">
            Acima deste valor a despesa sempre passa por olho humano.
          </span>
        </div>
        <div
          className={cn(
            "flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors",
            destaqueAssistido(pendente("negacaoAcimaDe")),
          )}
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-500">
            Negação acima de
          </span>
          <input
            inputMode="decimal"
            value={form.negacaoAcimaDe}
            onChange={(e) => setTeto("negacaoAcimaDe", e.target.value)}
            placeholder="sem teto"
            className={INPUT_BASE}
          />
          <span className="text-[11px] leading-relaxed text-text-500">
            Teto absoluto: acima dele o agente nega o reembolso.
          </span>
        </div>
      </div>

      {/* Observações */}
      <SecaoRegras
        titulo="Observações da política"
        descricao="Regras em texto livre extraídas do documento (ex.: tarifa por km). São informativas — não alteram a decisão do agente."
        pendente={false}
      >
        {form.observacoes.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {form.observacoes.map((obs, i) => (
              <li
                key={`${obs}-${i}`}
                className="flex items-start gap-2 rounded-lg border border-line bg-paper px-3 py-2"
              >
                <span className="flex-1 font-mono text-[12px] leading-relaxed text-text-900">
                  {obs}
                </span>
                <button
                  type="button"
                  aria-label="Remover observação"
                  onClick={() =>
                    onChange({ ...form, observacoes: form.observacoes.filter((_, j) => j !== i) })
                  }
                  className="text-text-500 transition hover:text-conf-vedado-dot"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-mono text-[11px] tracking-[0.02em] text-text-500">
            Nenhuma observação extraída.
          </p>
        )}
        <div className="flex items-center gap-2">
          <input
            value={novaObservacao}
            onChange={(e) => setNovaObservacao(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                adicionarObservacao()
              }
            }}
            placeholder="Adicionar observação manual…"
            className={cn(INPUT_BASE, "font-sans")}
          />
          <button
            type="button"
            onClick={adicionarObservacao}
            disabled={!novaObservacao.trim()}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 text-[13px] font-semibold text-text-900 transition hover:bg-paper",
              !novaObservacao.trim() && "cursor-not-allowed opacity-50",
            )}
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </div>
      </SecaoRegras>

      {/* Ações */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onVoltar}
          className="inline-flex h-11 items-center gap-2 rounded-[10px] px-4 text-[13px] font-semibold text-text-500 transition hover:bg-paper hover:text-text-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Enviar outro documento
        </button>
        <button
          type="button"
          onClick={onSalvar}
          disabled={salvando}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-[10px] bg-brand-500 px-5 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90",
            salvando && "cursor-not-allowed opacity-50 hover:translate-y-0",
          )}
        >
          <Save className="h-4 w-4" />
          {salvando ? "Salvando…" : "Salvar regras"}
        </button>
      </div>
    </div>
  )
}
