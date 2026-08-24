import {
  TEMAS_POLITICA,
  UNIDADES_LIMITE_TEMPORAIS,
  type RegraExtraida,
  type ReembolsavelRegra,
  type TemaPolitica,
  type UnidadeLimite,
  type UnidadeLimiteTemporal,
} from "@contracts/types"
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
