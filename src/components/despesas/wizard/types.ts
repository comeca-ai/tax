import type { CategoriaDespesa, OcrExtracao } from "@contracts/types"

/** Nota fiscal processada pelo upload + OCR (RF-01). */
export interface NotaProcessada {
  notaFiscalId: number
  arquivoNome: string
  arquivoMime: string
  arquivoBase64: string
  extracao: OcrExtracao
}

export type StatusFila = "enviando" | "ocr" | "concluido" | "falha"

export interface FilaItem {
  key: string
  nome: string
  tamanho: number
  status: StatusFila
  erro?: string
}

/** Estado do formulário de revisão (passo 2) — tudo string até o submit. */
export interface FormState {
  cnpjEmitente: string
  cfop: string
  ncm: string
  cst: string
  valorNota: string
  dataFatoGerador: string
  litros: string
  categoria: CategoriaDespesa | ""
  colaborador: string
  centroCusto: string
  motivo: string
  veiculoId: string
  kmComercial: string
  kmNaoComercial: string
}

/** `1.234,56` (pt-BR) → 1234.56 */
export function parseNumeroPt(valor: string): number {
  const limpo = valor.trim().replace(/\./g, "").replace(",", ".")
  const n = Number(limpo)
  return Number.isFinite(n) ? n : 0
}

/** 1234.56 → `1234,56` */
export function numeroParaPt(valor: number, casas = 2): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

export function formFromExtracao(extracao: OcrExtracao): FormState {
  return {
    cnpjEmitente: extracao.cnpjEmitente ?? "",
    cfop: extracao.cfop ?? "",
    ncm: extracao.ncm ?? "",
    cst: extracao.cst ?? "",
    valorNota: extracao.valor != null ? numeroParaPt(extracao.valor) : "",
    dataFatoGerador: extracao.dataFatoGerador ?? "",
    litros: extracao.litros != null ? numeroParaPt(extracao.litros, 3) : "",
    categoria: extracao.categoriaSugerida ?? "",
    colaborador: "",
    centroCusto: "",
    motivo: "",
    veiculoId: "",
    kmComercial: "",
    kmNaoComercial: "",
  }
}

/** Mapeia o nome do campo do formulário → chave usada em `camposPendentes` do OCR. */
export const CAMPO_PARA_CHAVE_OCR: Record<string, string> = {
  cnpjEmitente: "cnpjEmitente",
  cfop: "cfop",
  ncm: "ncm",
  cst: "cst",
  valorNota: "valor",
  dataFatoGerador: "dataFatoGerador",
  litros: "litros",
  categoria: "categoria",
}
