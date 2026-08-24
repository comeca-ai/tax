import { useState } from "react"
import {
  ArrowLeft,
  Check,
  CircleAlert,
  CircleCheck,
  CircleX,
  Layers,
  Paperclip,
  Pencil,
  Plus,
  Receipt,
  Save,
  X,
} from "lucide-react"
import {
  DECISOES_AUTOMATICAS_REGRA,
  REEMBOLSAVEL_REGRA,
  REGRA_TEXTO_MAX,
  TEMAS_POLITICA,
  UNIDADES_LIMITE,
  type CategoriaDespesa,
  type ConfiancaExtracao,
  type DecisaoAutomaticaRegra,
  type RegraExtraida,
  type ReembolsavelRegra,
  type TemaPolitica,
  type UnidadeLimite,
} from "@contracts/types"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { useIsMobile } from "@/hooks/use-mobile"
import { CATEGORIA_META } from "@/components/despesas/meta"
import { numeroParaPt, parseNumeroPt } from "@/components/despesas/wizard/types"
import { cn } from "@/lib/utils"
import { CATEGORIAS_POLITICA, type RegrasForm } from "./regrasForm"
import {
  AVISO_DECISAO_REBAIXADA,
  DECISAO_AUTOMATICA_CHIP,
  REEMBOLSAVEL_LABELS,
  ROTULO_SEM_DECISAO_AUTOMATICA,
  UNIDADE_LABELS,
  adicionarRegra,
  agruparPorTema,
  editarRegra,
  estadoDecisaoAutomatica,
  estadoEscopo,
  novaRegra,
  rebaixarDecisaoAutomatica,
  removerRegra,
  resumoValor,
  type GrupoRegras,
} from "./regrasExtraidas"
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
  "h-11 w-full rounded-[10px] border border-line bg-surface px-3 font-mono text-[13px] tabular text-text-900 outline-none transition placeholder:text-text-500/60 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20 sm:h-10"

const BOTAO_ICONE =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-500 transition hover:bg-surface focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/30 sm:h-8 sm:w-8"

const BADGE_REEMBOLSAVEL: Record<ReembolsavelRegra, string> = {
  sim: "bg-conf-alta-bg text-conf-alta-text",
  excecao: "bg-conf-media-bg text-conf-media-text",
  vedado: "bg-conf-vedado-bg text-conf-vedado-text",
}

const CHIP = "inline-flex h-6 items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-[11px] font-medium"

/** Chip da decisão automática: verde quando aprova sozinho, vermelho quando nega. */
const CHIP_DECISAO: Record<DecisaoAutomaticaRegra, string> = {
  nenhuma: "",
  aprovar: "border-conf-alta-dot/25 bg-conf-alta-bg text-conf-alta-text",
  negar: "border-conf-vedado-dot/25 bg-conf-vedado-bg text-conf-vedado-text",
}

/** Destaque âmbar de preenchimento assistido (pendente e ainda não editado). */
function destaqueAssistido(pendente: boolean): string {
  return pendente ? "bg-conf-media-bg/50 ring-1 ring-conf-media-dot/25" : ""
}

/** Mesmo limite do contrato (`regraExtraidaSchema`): evita BAD_REQUEST no "Salvar regras". */
function textoDentroDoLimite(descricao: string, condicao: string | null): boolean {
  return descricao.trim().length <= REGRA_TEXTO_MAX && (condicao ?? "").trim().length <= REGRA_TEXTO_MAX
}

/** Contador "n/300" exibido só quando o texto se aproxima do limite. */
function contadorTexto(texto: string) {
  if (texto.length < REGRA_TEXTO_MAX - 50) return null
  const estourou = texto.length > REGRA_TEXTO_MAX
  return (
    <p className={cn("text-right font-mono text-[10px] tabular", estourou ? "text-conf-vedado-text" : "text-text-500")}>
      {texto.length}/{REGRA_TEXTO_MAX}
    </p>
  )
}

/** Último tema com itens (tema padrão ao adicionar regra); governança se nenhum. */
function ultimoTemaComItens(grupos: GrupoRegras[]): TemaPolitica {
  for (let i = grupos.length - 1; i >= 0; i--) {
    if (grupos[i].itens.length > 0) return grupos[i].tema
  }
  return "governanca-do-processo"
}

/** Rascunho em edição: valor em string pt-BR ("" = sem limite); alterado pelo gestor → moeda BRL. */
interface RascunhoRegra {
  id: string
  regra: RegraExtraida
  valor: string
  valorAlterado: boolean
  /** A última edição derrubou a decisão automática — o `<select>` volta sozinho e o gestor precisa saber. */
  rebaixada: boolean
}

function rascunhoDe(regra: RegraExtraida): RascunhoRegra {
  return {
    id: regra.id,
    regra,
    valor: regra.valorLimite !== null ? numeroParaPt(regra.valorLimite) : "",
    valorAlterado: false,
    rebaixada: false,
  }
}

/**
 * Rótulo visível do controle. No mobile o grid vira 1 coluna e os 4 campos ficavam
 * sem rótulo nenhum (só `aria-label`, que ninguém enxerga); no desktop as 4 colunas
 * lado a lado se explicam e o rótulo some para não duplicar a informação.
 */
function CampoRegra({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-text-500 sm:sr-only">
        {rotulo}
      </span>
      {children}
    </label>
  )
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

/** Passo 2 do wizard de política: revisão/edição das regras extraídas (única fonte dos parâmetros). */
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
  const grupos = agruparPorTema(form.regrasExtraidas)
  const comItens = grupos.filter((g) => g.itens.length > 0)
  const semItens = grupos.filter((g) => g.itens.length === 0)

  const [editando, setEditando] = useState<RascunhoRegra | null>(null)
  const [nova, setNova] = useState("")
  const [temaNovo, setTemaNovo] = useState<TemaPolitica>(() => ultimoTemaComItens(grupos))

  function pendente(campo: string): boolean {
    return camposPendentes.includes(campo) && !editados.has(campo)
  }

  function setLista(regrasExtraidas: RegraExtraida[]) {
    onChange({ ...form, regrasExtraidas })
    onEditou("regrasExtraidas")
  }

  /**
   * Aplica o patch ao rascunho e rebaixa a decisão automática que ele deixou de
   * sustentar. Vale para TODA edição do card: apagar a categoria de uma regra marcada
   * "negar" a convertia de "nega hospedagem" em "nega tudo", em silêncio (v1.8).
   * `valor` presente = o gestor digitou no campo de valor (que é sempre em reais).
   */
  function setRascunho(patch: Partial<Omit<RegraExtraida, "id">>, valor?: string) {
    if (!editando) return
    const valorFinal = valor ?? editando.valor
    const regra = { ...editando.regra, ...patch }
    const rebaixamento = rebaixarDecisaoAutomatica(regra, valorFinal)
    const rebaixou = rebaixamento.decisaoAutomatica !== undefined
    setEditando({
      ...editando,
      valor: valorFinal,
      valorAlterado: editando.valorAlterado || valor !== undefined,
      regra: { ...regra, ...rebaixamento },
      // O aviso fica visível até o gestor voltar a escolher uma decisão automática.
      rebaixada: rebaixou || (patch.decisaoAutomatica === undefined && editando.rebaixada),
    })
  }

  function salvarEdicao() {
    if (!editando) return
    const descricao = editando.regra.descricao.trim()
    const condicao = editando.regra.condicao?.trim() || null
    if (!descricao || !textoDentroDoLimite(descricao, condicao)) return
    const n = parseNumeroPt(editando.valor)
    const valorLimite = editando.valor.trim() && n > 0 ? n : null
    // Valor digitado pelo gestor é sempre em reais
    const moeda = editando.valorAlterado ? "BRL" : editando.regra.moeda
    setLista(
      editarRegra(form.regrasExtraidas, editando.id, {
        ...editando.regra,
        descricao,
        condicao,
        valorLimite,
        moeda,
      }),
    )
    setEditando(null)
  }

  function remover(id: string) {
    setLista(removerRegra(form.regrasExtraidas, id))
    if (editando?.id === id) setEditando(null)
  }

  function adicionar() {
    const descricao = nova.trim().slice(0, REGRA_TEXTO_MAX)
    if (!descricao) return
    const regra = novaRegra(temaNovo, descricao)
    setLista(adicionarRegra(form.regrasExtraidas, regra))
    setEditando(rascunhoDe(regra))
    setNova("")
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

  function cardLeitura(regra: RegraExtraida) {
    const categoria = regra.categoria ? CATEGORIA_META[regra.categoria] : null
    const IconeCategoria = categoria?.icon
    const valor = resumoValor(regra)
    return (
      <li key={regra.id} className="flex items-start gap-2 rounded-lg border border-line bg-paper px-3 py-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            <span
              className={cn(
                "inline-flex h-5 items-center rounded-full px-2 font-mono text-[10px] font-medium uppercase tracking-[0.04em]",
                BADGE_REEMBOLSAVEL[regra.reembolsavel],
              )}
            >
              {REEMBOLSAVEL_LABELS[regra.reembolsavel]}
            </span>
            {categoria && IconeCategoria ? (
              <span className={cn(CHIP, "text-text-900")}>
                <IconeCategoria className="h-3 w-3 text-text-500" />
                {categoria.label}
              </span>
            ) : (
              <span className={cn(CHIP, "text-text-500")}>Sem categoria</span>
            )}
            {regra.escopo === "categoria" && (
              <span className={cn(CHIP, "text-text-900")}>
                <Layers className="h-3 w-3 text-text-500" aria-hidden="true" />
                Vale para a categoria
              </span>
            )}
            {DECISAO_AUTOMATICA_CHIP[regra.decisaoAutomatica] && (
              <span className={cn(CHIP, CHIP_DECISAO[regra.decisaoAutomatica])}>
                {regra.decisaoAutomatica === "aprovar" ? (
                  <CircleCheck className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <CircleX className="h-3 w-3" aria-hidden="true" />
                )}
                {DECISAO_AUTOMATICA_CHIP[regra.decisaoAutomatica]}
              </span>
            )}
            {valor && <span className={cn(CHIP, "font-mono tabular text-text-900")}>{valor}</span>}
            {regra.exigeComprovante && (
              <span className={cn(CHIP, "text-text-900")}>
                <Paperclip className="h-3 w-3 text-text-500" />
                Exige comprovante
              </span>
            )}
            {regra.exigeDocumentoFiscal && (
              <span className={cn(CHIP, "text-text-900")}>
                <Receipt className="h-3 w-3 text-text-500" aria-hidden="true" />
                Só nota fiscal ou recibo
              </span>
            )}
          </div>
          <p className="text-[13px] leading-relaxed text-text-900">{regra.descricao}</p>
          {regra.condicao && <p className="text-[12px] leading-relaxed text-text-500">{regra.condicao}</p>}
        </div>
        <button
          type="button"
          aria-label="Editar regra"
          onClick={() => setEditando(rascunhoDe(regra))}
          className={cn(BOTAO_ICONE, "hover:text-brand-500")}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Remover regra"
          onClick={() => remover(regra.id)}
          className={cn(BOTAO_ICONE, "hover:text-conf-vedado-dot")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </li>
    )
  }

  function cardEdicao(rascunho: RascunhoRegra) {
    const r = rascunho.regra
    const podeSalvar = r.descricao.trim() !== "" && textoDentroDoLimite(r.descricao, r.condicao)
    const escopo = estadoEscopo(r, rascunho.valor)
    const decisao = estadoDecisaoAutomatica(r, rascunho.valor)
    const dicasDecisao = [decisao.aprovar.dica, decisao.negar.dica].filter(
      (dica): dica is string => dica !== null,
    )
    const dicaEscopoId = `escopo-dica-${rascunho.id}`
    const dicaDecisaoId = `decisao-dica-${rascunho.id}`
    return (
      <li key={rascunho.id} className="flex flex-col gap-2 rounded-lg border border-brand-500 bg-paper px-3 py-2">
        <textarea
          rows={2}
          autoFocus
          value={r.descricao}
          onChange={(e) => setRascunho({ descricao: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              salvarEdicao()
            } else if (e.key === "Escape") {
              e.preventDefault()
              setEditando(null)
            }
          }}
          aria-label="Descrição da regra"
          placeholder="Descreva a regra…"
          maxLength={REGRA_TEXTO_MAX}
          className={cn(INPUT_BASE, "h-auto resize-y py-2 font-sans text-[13px] leading-relaxed sm:h-auto")}
        />
        {contadorTexto(r.descricao)}
        <input
          value={r.condicao ?? ""}
          onChange={(e) => setRascunho({ condicao: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              setEditando(null)
            }
          }}
          aria-label="Condição"
          placeholder="Condição (opcional)"
          maxLength={REGRA_TEXTO_MAX}
          className={cn(INPUT_BASE, "font-sans")}
        />
        {contadorTexto(r.condicao ?? "")}
        <div className="grid gap-2 sm:grid-cols-4">
          <CampoRegra rotulo="Categoria">
            <select
              aria-label="Categoria"
              value={r.categoria ?? ""}
              onChange={(e) =>
                // Sem categoria não há o que promover: o escopo volta a "item" no mesmo patch.
                setRascunho(
                  e.target.value === ""
                    ? { categoria: null, escopo: "item" }
                    : { categoria: e.target.value as CategoriaDespesa },
                )
              }
              className={cn(INPUT_BASE, "font-sans")}
            >
              <option value="">Sem categoria</option>
              {CATEGORIAS_POLITICA.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA_META[c].label}
                </option>
              ))}
            </select>
          </CampoRegra>
          <CampoRegra rotulo="Valor limite (R$)">
            <input
              inputMode="decimal"
              value={rascunho.valor}
              onChange={(e) => setRascunho({ moeda: "BRL" }, e.target.value)}
              placeholder="sem limite"
              aria-label="Valor limite (R$)"
              className={INPUT_BASE}
            />
          </CampoRegra>
          <CampoRegra rotulo="Unidade do limite">
            <select
              aria-label="Unidade do limite"
              value={r.unidadeLimite ?? ""}
              onChange={(e) =>
                setRascunho({
                  unidadeLimite:
                    e.target.value === "" ? null : (e.target.value as UnidadeLimite),
                })
              }
              className={cn(INPUT_BASE, "font-sans")}
            >
              <option value="">Sem unidade</option>
              {UNIDADES_LIMITE.map((u) => (
                <option key={u} value={u}>
                  {UNIDADE_LABELS[u]}
                </option>
              ))}
            </select>
          </CampoRegra>
          <CampoRegra rotulo="Reembolsável">
            <select
              aria-label="Reembolsável"
              value={r.reembolsavel}
              onChange={(e) => setRascunho({ reembolsavel: e.target.value as ReembolsavelRegra })}
              className={cn(INPUT_BASE, "font-sans")}
            >
              {REEMBOLSAVEL_REGRA.map((v) => (
                <option key={v} value={v}>
                  {REEMBOLSAVEL_LABELS[v]}
                </option>
              ))}
            </select>
          </CampoRegra>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <label className="flex min-h-11 items-center gap-2 text-[12px] text-text-900 sm:min-h-0">
            <Checkbox
              checked={r.exigeComprovante}
              onCheckedChange={(v) => setRascunho({ exigeComprovante: v === true })}
              aria-label="Exige comprovante"
            />
            Exige comprovante
          </label>
          <label className="flex min-h-11 items-center gap-2 text-[12px] text-text-900 sm:min-h-0">
            <Checkbox
              checked={r.exigeDocumentoFiscal}
              onCheckedChange={(v) => setRascunho({ exigeDocumentoFiscal: v === true })}
              aria-label="Só aceito nota fiscal ou recibo"
            />
            Só aceito nota fiscal ou recibo
          </label>
          <label
            className={cn(
              "flex min-h-11 items-center gap-2 text-[12px] sm:min-h-0",
              escopo.habilitado ? "text-text-900" : "text-text-500",
            )}
          >
            <Checkbox
              checked={escopo.marcado}
              disabled={!escopo.habilitado}
              onCheckedChange={(v) => setRascunho({ escopo: v === true ? "categoria" : "item" })}
              aria-label="Vale para a categoria inteira"
              aria-describedby={escopo.dica ? dicaEscopoId : undefined}
            />
            Vale para a categoria inteira
            {escopo.dica && (
              <span id={dicaEscopoId} className="text-[11px] text-text-500">
                {escopo.dica}
              </span>
            )}
          </label>
        </div>
        {escopo.aviso && (
          <p className="text-[11px] leading-relaxed text-text-500">{escopo.aviso}</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <select
              aria-label="Decisão automática"
              aria-describedby={dicasDecisao.length > 0 ? dicaDecisaoId : undefined}
              value={decisao.valor}
              onChange={(e) => setRascunho({ decisaoAutomatica: e.target.value as DecisaoAutomaticaRegra })}
              className={cn(INPUT_BASE, "font-sans sm:max-w-[320px]")}
            >
              {DECISOES_AUTOMATICAS_REGRA.map((v) => {
                const opcao = v === "nenhuma" ? null : decisao[v]
                return (
                  <option key={v} value={v} disabled={opcao !== null && !opcao.habilitada}>
                    {opcao === null ? ROTULO_SEM_DECISAO_AUTOMATICA : opcao.rotulo}
                  </option>
                )
              })}
            </select>
            {/* Opção desabilitada em `select` nativo não tem tooltip: no celular o gestor
                toca e nada explica. A dica de cada opção indisponível fica sempre visível. */}
            {dicasDecisao.length > 0 && (
              <ul id={dicaDecisaoId} className="flex flex-col gap-0.5">
                {dicasDecisao.map((dica) => (
                  <li key={dica} className="text-[11px] leading-relaxed text-text-500">
                    {dica}
                  </li>
                ))}
              </ul>
            )}
            {rascunho.rebaixada && (
              <p className="text-[11px] leading-relaxed text-conf-media-text">
                {AVISO_DECISAO_REBAIXADA}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
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
              disabled={!podeSalvar}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md bg-brand-500 px-3 text-[12px] font-semibold text-white transition hover:bg-brand-500/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/30",
                !podeSalvar && "cursor-not-allowed opacity-50",
              )}
            >
              <Check className="h-3.5 w-3.5" />
              Salvar
            </button>
          </div>
        </div>
      </li>
    )
  }

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
          {/* Regras estruturadas por tema (fonte dos parâmetros do agente) */}
          <SecaoRegras
            titulo="Regras da política"
            descricao="Tudo que o agente aplica nasce destas regras. Edite valores, categorias e condições; remova o que não vale; acrescente o que faltou. Ao cadastrar regras aqui, limites e tetos antigos desta política são substituídos pelos derivados. Marque “Vale para a categoria inteira” nas regras que definem o limite geral do tipo de despesa; sub-itens (lavanderia, frigobar, gorjeta) ficam desmarcados. Em “Decisão automática”, marque as regras que autorizam o agente a decidir sem você — o rótulo de cada opção diz o alcance dela. Sem nenhuma regra marcada, toda despesa vem para a sua revisão."
            pendente={pendente("regrasExtraidas")}
          >
            {comItens.length > 0 ? (
              <div className="flex flex-col gap-4">
                {comItens.map((grupo) => (
                  <div key={grupo.tema} className="flex flex-col gap-1.5">
                    <h4 className="flex items-center">
                      <span className="inline-flex items-center rounded-md border border-line bg-paper px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-text-500">
                        {grupo.titulo}
                      </span>
                    </h4>
                    <ul className="flex flex-col gap-1.5">
                      {grupo.itens.map((regra) =>
                        editando?.id === regra.id ? cardEdicao(editando) : cardLeitura(regra),
                      )}
                    </ul>
                  </div>
                ))}
                {semItens.length > 0 && (
                  <p className="font-mono text-[11px] tracking-[0.02em] text-text-500">
                    Sem regras em: {semItens.map((g) => g.titulo).join(", ")}
                  </p>
                )}
              </div>
            ) : (
              <p className="font-mono text-[11px] tracking-[0.02em] text-text-500">
                Nenhuma regra extraída. Cadastre abaixo as regras da política — limites, exigências e vedações.
              </p>
            )}

            {/* Adicionar regra (no tema escolhido) */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                aria-label="Tema da nova regra"
                value={temaNovo}
                onChange={(e) => setTemaNovo(e.target.value as TemaPolitica)}
                className={cn(INPUT_BASE, "font-sans sm:max-w-[220px]")}
              >
                {TEMAS_POLITICA.map(([slug, titulo]) => (
                  <option key={slug} value={slug}>
                    {titulo}
                  </option>
                ))}
              </select>
              <div className="flex flex-1 items-center gap-2">
                <input
                  value={nova}
                  onChange={(e) => setNova(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      adicionar()
                    }
                  }}
                  placeholder="Descrição da nova regra…"
                  maxLength={REGRA_TEXTO_MAX}
                  className={cn(INPUT_BASE, "font-sans")}
                />
                <button
                  type="button"
                  onClick={adicionar}
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
            {/* Card em edição: bloqueia o salvamento para não descartar o rascunho em silêncio */}
            <button
              type="button"
              onClick={onSalvar}
              disabled={salvando || editando !== null}
              title={editando ? "Conclua ou cancele a regra em edição antes de salvar" : undefined}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-[10px] bg-brand-500 px-5 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90",
                (salvando || editando !== null) && "cursor-not-allowed opacity-50 hover:translate-y-0",
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
