import { useState } from "react"
import { ArrowLeft, Check, CircleAlert, Pencil, Plus, Save, X } from "lucide-react"
import type { ConfiancaExtracao } from "@contracts/types"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { useIsMobile } from "@/hooks/use-mobile"
import { CATEGORIA_META } from "@/components/despesas/meta"
import { cn } from "@/lib/utils"
import { CATEGORIAS_POLITICA, type RegrasForm } from "./regrasForm"
import {
  adicionarObservacao,
  posicaoInserida,
  agruparObservacoes,
  editarObservacao,
  removerObservacao,
  type GrupoObservacoes,
} from "./observacoes"
import PoliticaTextoExtraido from "./PoliticaTextoExtraido"

interface PoliticaRegrasStepProps {
  form: RegrasForm
  onChange: (form: RegrasForm) => void
  camposPendentes: string[]
  editados: Set<string>
  onEditou: (campo: string) => void
  confiancaExtracao: ConfiancaExtracao
  provedor: string
  avisos: string[]
  textoExtraido: string | null
  salvando: boolean
  onVoltar: () => void
  onSalvar: () => void
}

const INPUT_BASE =
  "h-10 w-full rounded-[10px] border border-line bg-surface px-3 font-mono text-[13px] tabular text-text-900 outline-none transition placeholder:text-text-500/60 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20"

const BOTAO_ICONE =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-500 transition hover:bg-surface focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/30"

/** Destaque âmbar de preenchimento assistido (pendente e ainda não editado). */
function destaqueAssistido(pendente: boolean): string {
  return pendente ? "bg-conf-media-bg/50 ring-1 ring-conf-media-dot/25" : ""
}

/** Último grupo com cabeçalho (tema padrão ao adicionar regra); null se não houver. */
function ultimoCabecalho(grupos: GrupoObservacoes[]): number | null {
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i]
    if (g.indiceCabecalho !== null) return g.indiceCabecalho
  }
  return null
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
  textoExtraido,
  salvando,
  onVoltar,
  onSalvar,
}: PoliticaRegrasStepProps) {
  const isMobile = useIsMobile()
  const grupos = agruparObservacoes(form.observacoes)
  const cabecalhos = grupos.flatMap((g) =>
    g.indiceCabecalho !== null && g.tema !== null ? [{ indice: g.indiceCabecalho, tema: g.tema }] : [],
  )

  const [editando, setEditando] = useState<{ indice: number; rascunho: string } | null>(null)
  const [nova, setNova] = useState("")
  const [temaNovo, setTemaNovo] = useState<number | null>(() => ultimoCabecalho(grupos))
  // null = "Sem tema" (escolha explícita, preservada). Índice de cabeçalho que
  // ficou defasado após remoções cai no último tema.
  const temaSelecionado =
    temaNovo === null || cabecalhos.some((c) => c.indice === temaNovo)
      ? temaNovo
      : ultimoCabecalho(grupos)

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

  function salvarEdicao() {
    if (!editando) return
    const texto = editando.rascunho.trim()
    if (!texto) return
    if (texto !== form.observacoes[editando.indice]) {
      onChange({ ...form, observacoes: editarObservacao(form.observacoes, editando.indice, texto) })
      onEditou("observacoes")
    }
    setEditando(null)
  }

  function removerRegra(indice: number) {
    onChange({ ...form, observacoes: removerObservacao(form.observacoes, indice) })
    onEditou("observacoes")
    // item em edição: fecha se foi o removido; desloca uma posição se o removido vinha antes dele
    if (editando) {
      if (editando.indice === indice) setEditando(null)
      else if (indice < editando.indice) setEditando({ ...editando, indice: editando.indice - 1 })
    }
    // cabeçalho selecionado desloca uma posição se o item removido vinha antes dele
    if (temaSelecionado !== null && indice < temaSelecionado) setTemaNovo(temaSelecionado - 1)
  }

  function adicionarRegra() {
    const texto = nova.trim()
    if (!texto) return
    const observacoes = adicionarObservacao(form.observacoes, texto, temaSelecionado)
    onChange({ ...form, observacoes })
    onEditou("observacoes")
    setNova("")
    // a inserção pode ocorrer no meio da lista: item em edição que vinha depois desloca uma posição
    if (editando) {
      const posicao = posicaoInserida(form.observacoes, observacoes)
      if (posicao <= editando.indice) setEditando({ ...editando, indice: editando.indice + 1 })
    }
  }

  const painelTexto = (
    <PoliticaTextoExtraido
      texto={textoExtraido}
      confiancaExtracao={confiancaExtracao}
      provedor={provedor}
      avisos={avisos}
      camposPendentesQtd={camposPendentes.length}
      className={isMobile ? undefined : "md:sticky md:top-4"}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Mobile: texto lido recolhível acima das regras */}
      {isMobile ? (
        <Accordion type="single" collapsible className="rounded-xl border border-line bg-surface px-4 shadow-card">
          <AccordionItem value="texto" className="border-b-0">
            <AccordionTrigger className="text-[13px] font-semibold text-text-900">
              Texto lido do documento
            </AccordionTrigger>
            <AccordionContent>{painelTexto}</AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}

      <div className="md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start md:gap-4">
        {!isMobile && painelTexto}

        <div className="flex flex-col gap-4">
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

          {/* Regras extraídas (texto livre, agrupadas por tema) */}
          <SecaoRegras
            titulo="Regras extraídas do documento"
            descricao="Regras em texto livre lidas do documento, agrupadas por tema. São informativas — não alteram a decisão automática do agente. Edite, remova ou acrescente antes de salvar."
            pendente={false}
          >
            {grupos.length > 0 ? (
              <div className="flex flex-col gap-4">
                {grupos.map((grupo) => (
                  <div key={grupo.indiceCabecalho ?? "sem-tema"} className="flex flex-col gap-1.5">
                    <h4 className="flex items-center">
                      <span className="inline-flex items-center rounded-md border border-line bg-paper px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-text-500">
                        {grupo.tema ?? "Sem tema"}
                      </span>
                    </h4>
                    {grupo.itens.length === 0 ? (
                      <p className="font-mono text-[11px] tracking-[0.02em] text-text-500">
                        Nenhuma regra neste tema.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {grupo.itens.map((item) =>
                          editando?.indice === item.indice ? (
                            <li
                              key={item.indice}
                              className="flex flex-col gap-2 rounded-lg border border-brand-500 bg-paper px-3 py-2"
                            >
                              <textarea
                                rows={2}
                                autoFocus
                                value={editando.rascunho}
                                onChange={(e) => setEditando({ indice: item.indice, rascunho: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault()
                                    salvarEdicao()
                                  } else if (e.key === "Escape") {
                                    e.preventDefault()
                                    setEditando(null)
                                  }
                                }}
                                aria-label="Texto da regra"
                                className={cn(INPUT_BASE, "h-auto resize-y py-2 text-[12px] leading-relaxed")}
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditando(null)}
                                  className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-semibold text-text-500 transition hover:bg-surface hover:text-text-900 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/30"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={salvarEdicao}
                                  disabled={!editando.rascunho.trim()}
                                  className={cn(
                                    "inline-flex h-8 items-center gap-1.5 rounded-md bg-brand-500 px-3 text-[12px] font-semibold text-white transition hover:bg-brand-500/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/30",
                                    !editando.rascunho.trim() && "cursor-not-allowed opacity-50",
                                  )}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Salvar
                                </button>
                              </div>
                            </li>
                          ) : (
                            <li
                              key={item.indice}
                              className="flex items-start gap-2 rounded-lg border border-line bg-paper px-3 py-2"
                            >
                              <span className="flex-1 font-mono text-[12px] leading-relaxed text-text-900">
                                {item.texto}
                              </span>
                              <button
                                type="button"
                                aria-label="Editar regra"
                                onClick={() => setEditando({ indice: item.indice, rascunho: item.texto })}
                                className={cn(BOTAO_ICONE, "hover:text-brand-500")}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label="Remover regra"
                                onClick={() => removerRegra(item.indice)}
                                className={cn(BOTAO_ICONE, "hover:text-conf-vedado-dot")}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-mono text-[11px] tracking-[0.02em] text-text-500">
                Nenhuma regra extraída. Adicione abaixo as regras da política em texto livre.
              </p>
            )}

            {/* Adicionar regra (no tema escolhido) */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {cabecalhos.length > 0 && (
                <select
                  aria-label="Tema da nova regra"
                  value={temaSelecionado ?? ""}
                  onChange={(e) => setTemaNovo(e.target.value === "" ? null : Number(e.target.value))}
                  className={cn(INPUT_BASE, "font-sans sm:max-w-[220px]")}
                >
                  {cabecalhos.map((c) => (
                    <option key={c.indice} value={c.indice}>
                      {c.tema}
                    </option>
                  ))}
                  <option value="">Sem tema</option>
                </select>
              )}
              <div className="flex flex-1 items-center gap-2">
                <input
                  value={nova}
                  onChange={(e) => setNova(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      adicionarRegra()
                    }
                  }}
                  placeholder="Adicionar regra…"
                  className={cn(INPUT_BASE, "font-sans")}
                />
                <button
                  type="button"
                  onClick={adicionarRegra}
                  disabled={!nova.trim()}
                  className={cn(
                    "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 text-[13px] font-semibold text-text-900 transition hover:bg-paper",
                    !nova.trim() && "cursor-not-allowed opacity-50",
                  )}
                >
                  <Plus className="h-4 w-4" />
                  Adicionar
                </button>
              </div>
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
      </div>
    </div>
  )
}
