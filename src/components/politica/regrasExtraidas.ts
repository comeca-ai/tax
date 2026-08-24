import {
  TEMAS_POLITICA,
  UNIDADES_LIMITE_TEMPORAIS,
  type CategoriaDespesa,
  type DecisaoAutomaticaRegra,
  type RegraExtraida,
  type ReembolsavelRegra,
  type RegrasPolitica,
  type TemaPolitica,
  type UnidadeLimite,
  type UnidadeLimiteTemporal,
} from "@contracts/types"
import { CATEGORIA_META } from "@/components/despesas/meta"
import { parseNumeroPt } from "@/components/despesas/wizard/types"
import { formatBRL } from "@/lib/format"

/** Lógica pura dos cards de regras extraídas (passo "Revisar regras"). */

export interface GrupoRegras {
  tema: TemaPolitica
  titulo: string
  itens: RegraExtraida[]
}

export const REEMBOLSAVEL_LABELS: Record<ReembolsavelRegra, string> = {
  sim: "Reembolsável",
  excecao: "Exceção · aprovação superior",
  vedado: "Vedado",
}

export const UNIDADE_LABELS: Record<UnidadeLimite, string> = {
  dia: "por dia",
  mes: "por mês",
  viagem: "por viagem",
  evento: "por evento",
  percentual: "%",
  dias_antecedencia: "dias de antecedência",
  dias_para_pagamento: "dias para pagamento",
}

/** Sempre os 9 temas, na ordem de TEMAS_POLITICA, mesmo vazios. */
export function agruparPorTema(regras: RegraExtraida[]): GrupoRegras[] {
  return TEMAS_POLITICA.map(([tema, titulo]) => ({
    tema,
    titulo,
    itens: regras.filter((r) => r.tema === tema),
  }))
}

export function gerarId(): string {
  const aleatorio = Math.random().toString(36).slice(2, 6).padEnd(4, "0")
  return `manual-${Date.now().toString(36)}-${aleatorio}`
}

export function novaRegra(tema: TemaPolitica, descricao: string): RegraExtraida {
  return {
    id: gerarId(),
    tema,
    categoria: null,
    // Regra nasce como sub-item: promover para a categoria inteira é ato do gestor (D-013).
    escopo: "item",
    descricao,
    condicao: null,
    reembolsavel: "sim",
    valorLimite: null,
    moeda: "BRL",
    unidadeLimite: null,
    exigeComprovante: false,
    exigeDocumentoFiscal: false,
    // Regra nasce sem autorizar nada: só o gestor marca decisão automática (D-013).
    decisaoAutomatica: "nenhuma",
  }
}

/** Imutável; id inexistente devolve a mesma lista. */
export function editarRegra(
  lista: RegraExtraida[],
  id: string,
  patch: Partial<Omit<RegraExtraida, "id">>,
): RegraExtraida[] {
  if (!lista.some((r) => r.id === id)) return lista
  return lista.map((r) => (r.id === id ? { ...r, ...patch, id } : r))
}

export function removerRegra(lista: RegraExtraida[], id: string): RegraExtraida[] {
  return lista.filter((r) => r.id !== id)
}

/** Insere após a última regra do mesmo tema (ou no fim, se o tema é inédito). */
export function adicionarRegra(lista: RegraExtraida[], regra: RegraExtraida): RegraExtraida[] {
  let posicao = lista.length
  for (let i = lista.length - 1; i >= 0; i--) {
    if (lista[i].tema === regra.tema) {
      posicao = i + 1
      break
    }
  }
  return [...lista.slice(0, posicao), regra, ...lista.slice(posicao)]
}

/** "até R$ 80,00/dia" (BRL) · "até USD 50" (outra moeda) · null sem valor. */
export function resumoValor(r: RegraExtraida): string | null {
  if (r.valorLimite === null) return null
  const valor = r.moeda === "BRL" ? formatBRL(r.valorLimite) : `${r.moeda} ${r.valorLimite}`
  const unidade = r.unidadeLimite && !r.unidadeLimite.startsWith("dias_") ? `/${r.unidadeLimite}` : ""
  return `até ${valor}${unidade}`
}

/** Rótulo curto para a coluna de badge do resumo (passo 3 / política ativa). */
export const REEMBOLSAVEL_LABELS_CURTO: Record<ReembolsavelRegra, string> = {
  sim: "Sim",
  excecao: "Exceção",
  vedado: "Vedado",
}

/** "1 regra" · "2 regras". Plural padrão = singular + "s" salvo quando informado. */
export function plural(n: number, singular: string, pluralForma = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForma}`
}

export interface ContagemRegras {
  total: number
  sim: number
  excecao: number
  vedado: number
  /** Temas distintos com ao menos uma regra. */
  temas: number
}

export function contarRegras(regras: RegraExtraida[]): ContagemRegras {
  const c: ContagemRegras = { total: regras.length, sim: 0, excecao: 0, vedado: 0, temas: 0 }
  const temas = new Set<TemaPolitica>()
  for (const r of regras) {
    c[r.reembolsavel]++
    temas.add(r.tema)
  }
  c.temas = temas.size
  return c
}

/** "12 regras · 3 vedadas · 2 exceções" — partes zeradas são omitidas; total sempre aparece. */
export function resumoGrupo(itens: RegraExtraida[]): string {
  const c = contarRegras(itens)
  const partes = [plural(c.total, "regra")]
  if (c.vedado > 0) partes.push(plural(c.vedado, "vedada"))
  if (c.excecao > 0) partes.push(plural(c.excecao, "exceção", "exceções"))
  return partes.join(" · ")
}

/**
 * Valor da regra para o resumo escaneável (unidade por extenso via UNIDADE_LABELS):
 *  - percentual → "10%" (nunca moeda)
 *  - dias_antecedencia / dias_para_pagamento → "30 dias de antecedência" (sem "até", sem moeda)
 *  - BRL → "até R$ 80,00 por dia" | "até R$ 500,00" (sem unidade)
 *  - outra moeda → "até USD 80 por viagem" (código ISO, número sem formatação pt-BR)
 *  - sem valorLimite → null
 * Não substitui `resumoValor` (usado no passo 2).
 */
export function formatarLimite(r: RegraExtraida): string | null {
  if (r.valorLimite === null) return null
  const u = r.unidadeLimite
  if (u === "percentual") return `${r.valorLimite}%`
  if (u === "dias_antecedencia" || u === "dias_para_pagamento") return `${r.valorLimite} ${UNIDADE_LABELS[u]}`
  const valor = r.moeda === "BRL" ? formatBRL(r.valorLimite) : `${r.moeda} ${r.valorLimite}`
  return u ? `até ${valor} ${UNIDADE_LABELS[u]}` : `até ${valor}`
}

/** Aviso mostrado quando o gestor promove uma regra cujo teto é por período. */
export const AVISO_TETO_TEMPORAL =
  "Este teto será comparado com o valor total de cada comprovante. Como a nota pode cobrir vários dias, despesas acima dele vão para a sua revisão em vez de serem negadas."

export interface EstadoEscopo {
  habilitado: boolean
  marcado: boolean
  /** Texto visível ao lado do rótulo quando o checkbox está desabilitado (nunca `title`: mobile não tem hover). */
  dica: string | null
  /** Aviso de teto por período; null quando não se aplica. */
  aviso: string | null
}

/** Estado do checkbox "Vale para a categoria inteira" no card de edição. */
export function estadoEscopo(r: RegraExtraida, valorDigitado: string): EstadoEscopo {
  const habilitado = r.categoria !== null
  const marcado = habilitado && r.escopo === "categoria"
  const temporal =
    r.unidadeLimite !== null &&
    UNIDADES_LIMITE_TEMPORAIS.includes(r.unidadeLimite as UnidadeLimiteTemporal)
  return {
    habilitado,
    marcado,
    dica: habilitado ? null : "Escolha uma categoria para aplicar a regra à categoria inteira.",
    aviso: marcado && parseNumeroPt(valorDigitado) > 0 && temporal ? AVISO_TETO_TEMPORAL : null,
  }
}

/**
 * Rótulo da opção "sem decisão automática". As outras duas são montadas em
 * `estadoDecisaoAutomatica`: elas precisam declarar o ALCANCE da marcação — "O agente
 * pode negar sozinho" numa regra sem categoria significava "negar toda despesa da
 * empresa" e o gestor não tinha como saber (v1.8).
 */
export const ROTULO_SEM_DECISAO_AUTOMATICA = "Só o gestor decide (padrão)"

/** Rótulo curto do chip no card de leitura; "nenhuma" não vira chip. */
export const DECISAO_AUTOMATICA_CHIP: Record<DecisaoAutomaticaRegra, string | null> = {
  nenhuma: null,
  aprovar: "Agente aprova sozinho",
  negar: "Agente nega sozinho",
}

export const DICA_APROVACAO_AUTOMATICA =
  "Marque a regra como reembolsável e informe um valor em reais para o agente poder aprovar sozinho."
export const DICA_APROVACAO_MOEDA =
  "O agente só aprova sozinho com limite em reais — esta regra está em outra moeda."
/**
 * A dica anterior mandava promover a regra do sub-item ("marque também Vale para a
 * categoria inteira"), e seguir isso no café da manhã fixava R$ 15 como teto de TODA a
 * alimentação — o menor teto governa. O gesto certo é cadastrar a regra da categoria,
 * no mesmo tom de `DICA_NEGACAO_COM_VALOR`.
 */
export const DICA_APROVACAO_ESCOPO =
  "Esta regra vale para um sub-item da categoria. Promovê-la fixa o valor dela como teto de TODA a categoria — o menor teto governa. Para liberar a categoria, cadastre uma regra do limite dela (ex.: “Alimentação em viagem — até R$ 124,00 por dia”), marque “Vale para a categoria inteira” e “O agente pode aprovar sozinho”."
export const DICA_NEGACAO_AUTOMATICA = "Só regra vedada pode autorizar negação automática."
export const DICA_NEGACAO_VALOR_GERAL =
  "Sem categoria, o agente só nega sozinho acima de um valor em reais — informe o valor, ou escolha a categoria desta regra."
export const DICA_NEGACAO_COM_VALOR =
  "Regra com valor não autoriza negação automática: o agente negaria a categoria inteira, em qualquer valor. Para vedar a categoria toda, cadastre uma regra vedada sem valor."
export const DICA_NEGACAO_ESCOPO =
  "Marque também “Vale para a categoria inteira” para o agente poder negar sozinho as despesas desta categoria."

/** Aviso ao lado do seletor quando a edição derrubou a marcação (o `<select>` volta sozinho). */
export const AVISO_DECISAO_REBAIXADA =
  "A decisão automática voltou para “Só o gestor decide”: a regra deixou de sustentar a marcação anterior."

/**
 * Alargar o alcance é tão perigoso quanto estreitar — e passava calado. Apagar a
 * categoria de uma regra marcada "aprovar" transformava "aprova alimentação até
 * R$ 15" em "aprova QUALQUER despesa até R$ 15", com o card idêntico nos dois
 * estados. Alargamento passa a exigir uma marcação nova, feita de olho no rótulo.
 */
export const AVISO_MARCACAO_ALARGADA =
  "Sem categoria, a marcação passaria a valer para TODA despesa da empresa — ela voltou para “Só o gestor decide”. Marque de novo se é isso que a política diz."

/** Aviso quando a exigência de nota fiscal é desmarcada por deixar de ter alcance. */
export const AVISO_DOCUMENTO_FISCAL_REBAIXADO =
  "“Só aceito nota fiscal ou recibo” foi desmarcado: a exigência só vale sem categoria (empresa toda) ou com “Vale para a categoria inteira”."

/** Dica do checkbox "Só aceito nota fiscal ou recibo" quando ele não pode ser marcado. */
export const DICA_DOCUMENTO_FISCAL_ESCOPO =
  "Marque “Vale para a categoria inteira” para exigir nota fiscal nas despesas desta categoria — numa regra de sub-item a exigência recusaria comprovantes da categoria inteira."

export interface EstadoDocumentoFiscal {
  habilitado: boolean
  marcado: boolean
  /** Por que está desabilitado (nunca `title`: mobile não tem hover). */
  dica: string | null
}

/**
 * Estado do checkbox "Só aceito nota fiscal ou recibo" — espelho de
 * `documentoFiscalTemEfeito` (`derivar.ts`). É porta de NEGAÇÃO automática: marcada
 * numa regra de sub-item ("gorjeta ao camareiro só com recibo"), negava a diária de
 * hotel paga por Pix citando a gorjeta (D-013).
 */
export function estadoDocumentoFiscal(r: RegraExtraida): EstadoDocumentoFiscal {
  const habilitado = r.categoria === null || r.escopo === "categoria"
  return {
    habilitado,
    marcado: habilitado && r.exigeDocumentoFiscal,
    dica: habilitado ? null : DICA_DOCUMENTO_FISCAL_ESCOPO,
  }
}

export interface OpcaoDecisaoAutomatica {
  habilitada: boolean
  /** Rótulo da opção — declara o ALCANCE (toda despesa da empresa × uma categoria). */
  rotulo: string
  /** Por que está desabilitada (nunca `title`: mobile não tem hover). */
  dica: string | null
}

export interface EstadoDecisaoAutomatica {
  valor: DecisaoAutomaticaRegra
  aprovar: OpcaoDecisaoAutomatica
  negar: OpcaoDecisaoAutomatica
}

/**
 * Estado do seletor "Decisão automática" no card de edição — espelho exato do que o
 * servidor consegue derivar (`aprovacaoTemEfeito` / `negacaoTemEfeito` em `derivar.ts`).
 * Habilitar uma opção que a derivação ignora produzia chip verde no card e "nada" no
 * resumo, sem uma palavra de explicação.
 *
 *  - aprovar → regra reembolsável, valor em reais > 0 (P-5: nenhuma aprovação sem teto)
 *    e alcance declarado: sem categoria, ou "Vale para a categoria inteira".
 *  - negar   → regra vedada. Sem categoria: valor em reais > 0 (teto geral de negação).
 *    Com categoria: "Vale para a categoria inteira" e SEM valor — regra vedada com valor
 *    negaria a categoria inteira em qualquer valor, alcance maior do que ela declara.
 */
export function estadoDecisaoAutomatica(
  r: RegraExtraida,
  valorDigitado: string,
): EstadoDecisaoAutomatica {
  const rotuloCategoria = r.categoria ? CATEGORIA_META[r.categoria].label : null
  const naoMonetaria =
    r.unidadeLimite === "percentual" || (r.unidadeLimite?.startsWith("dias_") ?? false)
  const valor = parseNumeroPt(valorDigitado)
  const temValor = valor > 0 && !naoMonetaria
  const emReais = r.moeda === "BRL"
  const promovida = r.escopo === "categoria"

  const rotuloAprovar = rotuloCategoria
    ? `O agente pode aprovar sozinho as despesas de ${rotuloCategoria}`
    : "O agente pode aprovar qualquer despesa até este valor"
  let dicaAprovar: string | null = null
  if (r.reembolsavel !== "sim" || !temValor) dicaAprovar = DICA_APROVACAO_AUTOMATICA
  else if (!emReais) dicaAprovar = DICA_APROVACAO_MOEDA
  else if (rotuloCategoria && !promovida) dicaAprovar = DICA_APROVACAO_ESCOPO

  const rotuloNegar = rotuloCategoria
    ? `O agente pode negar sozinho todas as despesas de ${rotuloCategoria}`
    : "O agente pode negar qualquer despesa acima deste valor"
  let dicaNegar: string | null = null
  if (r.reembolsavel !== "vedado") dicaNegar = DICA_NEGACAO_AUTOMATICA
  else if (rotuloCategoria === null) {
    if (!temValor || !emReais) dicaNegar = DICA_NEGACAO_VALOR_GERAL
  } else if (valor > 0) dicaNegar = DICA_NEGACAO_COM_VALOR
  else if (!promovida) dicaNegar = DICA_NEGACAO_ESCOPO

  return {
    valor: r.decisaoAutomatica,
    aprovar: { habilitada: dicaAprovar === null, rotulo: rotuloAprovar, dica: dicaAprovar },
    negar: { habilitada: dicaNegar === null, rotulo: rotuloNegar, dica: dicaNegar },
  }
}

/**
 * Patch que rebaixa `decisaoAutomatica` para "nenhuma" quando a regra deixa de
 * poder sustentá-la (mesmo padrão de `categoria: null → escopo: "item"`).
 */
export function rebaixarDecisaoAutomatica(
  r: RegraExtraida,
  valorDigitado: string,
): Partial<Pick<RegraExtraida, "decisaoAutomatica">> {
  const e = estadoDecisaoAutomatica(r, valorDigitado)
  const sustentada =
    (r.decisaoAutomatica === "aprovar" && e.aprovar.habilitada) ||
    (r.decisaoAutomatica === "negar" && e.negar.habilitada)
  return r.decisaoAutomatica === "nenhuma" || sustentada ? {} : { decisaoAutomatica: "nenhuma" }
}

/** Unidades cujo limite é por período — o agente compara com CADA comprovante. */
const UNIDADES_POR_PERIODO: readonly UnidadeLimite[] = ["dia", "mes", "viagem", "evento"]

/**
 * Aviso do teto por período no caminho da decisão automática. O aviso existia só
 * quando a regra era promovida à categoria: no caminho global, "R$ 100 por mês" virava
 * R$ 100 por nota sem uma palavra — e é justamente o caminho que decide sozinho.
 */
export const AVISO_TETO_POR_PERIODO =
  "O limite desta regra é por período, e o agente compara com o valor de CADA comprovante — não com o total gasto no período."

/** Aviso a exibir junto do seletor de decisão automática; null quando não se aplica. */
export function avisoTetoPorPeriodo(r: RegraExtraida, valorDigitado: string): string | null {
  if (r.decisaoAutomatica === "nenhuma" || r.unidadeLimite === null) return null
  if (!UNIDADES_POR_PERIODO.includes(r.unidadeLimite)) return null
  return parseNumeroPt(valorDigitado) > 0 ? AVISO_TETO_POR_PERIODO : null
}

export interface Rebaixamento {
  /** Patch a aplicar sobre a regra proposta (vazio quando nada foi rebaixado). */
  patch: Partial<Pick<RegraExtraida, "decisaoAutomatica" | "exigeDocumentoFiscal">>
  /** Aviso visível ao lado do controle; null quando nada mudou. */
  aviso: string | null
}

/**
 * Rebaixa TODA marcação que a edição deixou sem alcance — ou cujo alcance ela
 * ALARGARIA. Estreitar já era tratado; alargar não era, e apagar a categoria de uma
 * regra marcada "aprovar" virava aprovação automática global em silêncio (D-013: o
 * alcance nunca pode ser maior do que a regra declara).
 */
export function rebaixarMarcacoes(
  anterior: RegraExtraida,
  proposta: RegraExtraida,
  valorDigitado: string,
): Rebaixamento {
  const patch: Rebaixamento["patch"] = {}
  let aviso: string | null = null
  const alargou = anterior.categoria !== null && proposta.categoria === null

  if (proposta.decisaoAutomatica !== "nenhuma" && alargou) {
    patch.decisaoAutomatica = "nenhuma"
    aviso = AVISO_MARCACAO_ALARGADA
  } else {
    const rebaixamento = rebaixarDecisaoAutomatica(proposta, valorDigitado)
    if (rebaixamento.decisaoAutomatica !== undefined) {
      patch.decisaoAutomatica = rebaixamento.decisaoAutomatica
      aviso = AVISO_DECISAO_REBAIXADA
    }
  }

  if (proposta.exigeDocumentoFiscal && (alargou || !estadoDocumentoFiscal(proposta).habilitado)) {
    patch.exigeDocumentoFiscal = false
    aviso = alargou ? AVISO_MARCACAO_ALARGADA : (aviso ?? AVISO_DOCUMENTO_FISCAL_REBAIXADO)
  }

  return { patch, aviso }
}

/** Política que não autoriza NENHUMA aprovação automática — nem global, nem por categoria. */
export function semAutorizacaoDeAprovacao(regras: RegrasPolitica): boolean {
  return (
    regras.aprovacaoAutomaticaAte == null &&
    Object.values(regras.aprovacaoAutomaticaPorCategoria ?? {}).every((v) => v == null)
  )
}

/**
 * Texto do estado vazio de "O agente decide sozinho". O anterior dizia que a política
 * "não define" e parava aí; o gestor olhava 70 regras extraídas e não tinha como
 * saber que nenhuma delas serve — sub-item não vira limite de categoria.
 */
export const TEXTO_SEM_APROVACAO_AUTOMATICA =
  "Nada — o agente não aprova nenhuma despesa sozinho, tudo vai para a sua revisão. As regras extraídas do seu documento descrevem sub-itens (café, lavanderia), e sub-item não vira limite da categoria. Para liberar o agente, cadastre uma regra por categoria — por exemplo “Alimentação em viagem — até R$ 124,00 por dia” — e marque nela “Vale para a categoria inteira” e “O agente pode aprovar sozinho”."

function rotulo(categoria: CategoriaDespesa): string {
  return CATEGORIA_META[categoria].label
}

/**
 * Parâmetros que valiam antes do salvamento e deixam de valer depois dele.
 * A política demo/heurística traz limites prontos no JSON e nenhuma regra extraída:
 * "Criar nova versão" + "Salvar sem mexer" zerava tudo (é o que `consolidarRegras`
 * com origem "edicao" deve fazer — a lista de regras é a declaração do gestor), só que
 * em silêncio. O passo 3 passa a listar o que a nova versão deixa de aplicar.
 */
export function parametrosPerdidos(antes: RegrasPolitica, depois: RegrasPolitica): string[] {
  const perdidos: string[] = []
  if (antes.aprovacaoAutomaticaAte != null && depois.aprovacaoAutomaticaAte == null) {
    perdidos.push(`aprova sozinho até ${formatBRL(antes.aprovacaoAutomaticaAte)}`)
  }
  if (antes.negacaoAcimaDe != null && depois.negacaoAcimaDe == null) {
    perdidos.push(`nega acima de ${formatBRL(antes.negacaoAcimaDe)}`)
  }
  if (antes.revisaoHumanaAcimaDe != null && depois.revisaoHumanaAcimaDe == null) {
    perdidos.push(`manda para revisão acima de ${formatBRL(antes.revisaoHumanaAcimaDe)}`)
  }
  for (const [cat, valor] of Object.entries(antes.limitesPorCategoria ?? {}) as [
    CategoriaDespesa,
    number | null,
  ][]) {
    if (valor != null && depois.limitesPorCategoria?.[cat] == null) {
      perdidos.push(`teto de ${rotulo(cat)}: ${formatBRL(valor)}`)
    }
  }
  for (const [cat, valor] of Object.entries(antes.aprovacaoAutomaticaPorCategoria ?? {}) as [
    CategoriaDespesa,
    number | undefined,
  ][]) {
    if (valor != null && depois.aprovacaoAutomaticaPorCategoria?.[cat] == null) {
      perdidos.push(`aprova sozinho ${rotulo(cat)} até ${formatBRL(valor)}`)
    }
  }
  for (const c of antes.categoriasVedadas ?? []) {
    if (!(depois.categoriasVedadas ?? []).some((d) => d.categoria === c.categoria)) {
      perdidos.push(`nega sempre: ${rotulo(c.categoria)}`)
    }
  }
  for (const cat of antes.exigeVeiculoCadastrado ?? []) {
    if (!(depois.exigeVeiculoCadastrado ?? []).includes(cat)) {
      perdidos.push(`exige veículo cadastrado em ${rotulo(cat)}`)
    }
  }
  for (const cat of antes.exigeEvidencia ?? []) {
    if (!(depois.exigeEvidencia ?? []).includes(cat)) {
      perdidos.push(`exige evidência em ${rotulo(cat)}`)
    }
  }
  if (antes.exigeDocumentoFiscal && !depois.exigeDocumentoFiscal) {
    perdidos.push("só aceita nota fiscal ou recibo")
  }
  return perdidos
}
