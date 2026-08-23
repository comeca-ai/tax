import {
  TEMAS_POLITICA,
  type RegraExtraida,
  type ReembolsavelRegra,
  type TemaPolitica,
  type UnidadeLimite,
} from "@contracts/types"
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
