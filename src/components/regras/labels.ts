import type {
  CategoriaDespesa,
  NivelConfianca,
  RegimeTributario,
  TipoBeneficio,
  Tributo,
} from "@contracts/types"

/** Linha de regra de elegibilidade (espelha db/schema regras_elegibilidade). */
export interface RegraRow {
  id: number
  cnaePadrao: string
  categoria: CategoriaDespesa
  tributo: Tributo
  tipoBeneficio: TipoBeneficio
  confianca: NivelConfianca
  aliquota: number | null
  baseLegal: string | null
  vigenciaInicio: string
  vigenciaFim: string | null
  versao: string
  createdAt: Date
}

export const CATEGORIA_ROTULO: Record<CategoriaDespesa, string> = {
  combustivel: "Combustível",
  alimentacao: "Alimentação",
  hospedagem: "Hospedagem",
  pedagio: "Pedágio",
  uber: "Uber",
  taxi: "Táxi",
}

export const CATEGORIAS_ORDEM: CategoriaDespesa[] = [
  "combustivel",
  "alimentacao",
  "hospedagem",
  "pedagio",
  "uber",
  "taxi",
]

export const TRIBUTO_ROTULO: Record<Tributo, string> = {
  pis_cofins: "PIS/COFINS",
  icms: "ICMS",
  cbs: "CBS",
  ibs: "IBS",
  irpj_csll: "IRPJ/CSLL",
}

export const TIPO_BENEFICIO_ROTULO: Record<TipoBeneficio, string> = {
  credito: "crédito",
  dedutibilidade: "dedutibilidade",
}

export const CONFIANCA_ROTULO: Record<NivelConfianca, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
  vedado: "Vedado",
}

export const REGIME_ROTULO: Record<RegimeTributario, string> = {
  lucro_real: "Lucro Real",
  lucro_presumido: "Lucro Presumido",
  simples_nacional: "Simples Nacional",
}

/**
 * Células "Média-Alta" da matriz MVP (§7.2 da spec): a escala do banco é
 * alta|media|baixa|vedado e o seed as grava como "media" — aqui recuperamos
 * o rótulo "Média+" (design regras.md) para essas células específicas.
 */
const MEDIA_ALTA_CELULAS = new Set(["49.30-2|alimentacao", "49.30-2|hospedagem"])

export function isMediaAlta(cnaePadrao: string, categoria: CategoriaDespesa): boolean {
  return MEDIA_ALTA_CELULAS.has(`${cnaePadrao}|${categoria}`)
}

/** Corte da MP 1.340/2026 (PIS/COFINS diesel/GLP zerado) — espelha api/engine/params. */
export const DATA_CORTE_MP_1340 = "2026-03-11"

/** Linhas da matriz no desenho do design (10 linhas, agrupando padrões equivalentes). */
export interface LinhaMatrizDef {
  padroes: string[]
  cnaeLabel: string
  setor: string
}

export const LINHAS_MATRIZ: LinhaMatrizDef[] = [
  { padroes: ["49.30-2"], cnaeLabel: "49.30-2", setor: "Transporte de cargas" },
  { padroes: ["49.2x"], cnaeLabel: "49.2x", setor: "Transporte de passageiros" },
  { padroes: ["47.31-8", "46.81-8"], cnaeLabel: "47.31-8 / 46.81-8", setor: "Revenda de combustível" },
  { padroes: ["41.x", "42.x", "43.x"], cnaeLabel: "41.x–43.x", setor: "Construção civil" },
  { padroes: ["33.1x"], cnaeLabel: "33.1x", setor: "Manutenção industrial" },
  { padroes: ["69.11-7", "69.20-6"], cnaeLabel: "69.11-7 / 69.20-6", setor: "Advocacia e contabilidade" },
  { padroes: ["46.x", "47.x"], cnaeLabel: "46.x / 47.x", setor: "Comércio c/ entrega própria" },
  { padroes: ["80.1x"], cnaeLabel: "80.1x", setor: "Segurança privada" },
  { padroes: ["86.x"], cnaeLabel: "86.x", setor: "Saúde domiciliar" },
  { padroes: ["*"], cnaeLabel: "Não mapeado", setor: "CNAE fora da matriz" },
]

/** Casa um CNAE concreto (ex. "49.30-2") com um padrão da matriz ("49.2x", "41.x"…). */
export function cnaeMatch(padrao: string, cnae: string | null | undefined): boolean {
  if (!cnae) return false
  if (padrao === "*") return false // fallback genérico não é "sua empresa"
  const p = padrao.trim()
  const c = cnae.trim()
  if (p === c) return true
  const idx = p.indexOf("x")
  if (idx >= 0) return c.startsWith(p.slice(0, idx))
  return false
}

/** "2026-03-11" → "11/03/2026" (sem problemas de fuso). */
export function formatDateBr(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

export function formatVigencia(inicio: string, fim: string | null): string {
  return `${formatDateBr(inicio)} → ${fim ? formatDateBr(fim) : "em aberto"}`
}
