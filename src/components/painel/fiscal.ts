import type { LucideIcon } from "lucide-react"
import {
  BedDouble,
  Car,
  CarTaxiFront,
  Fuel,
  Milestone,
  UtensilsCrossed,
} from "lucide-react"
import type {
  CategoriaDespesa,
  NivelConfianca,
  RegimeTributario,
  StatusDespesa,
  Tributo,
} from "@contracts/types"

/** Labels/paleta/ícones compartilhados das páginas de painel (Dashboard/Relatórios). */

export const CATEGORIA_LABEL: Record<CategoriaDespesa, string> = {
  combustivel: "Combustível",
  alimentacao: "Alimentação",
  hospedagem: "Hospedagem",
  pedagio: "Pedágio",
  uber: "Uber",
  taxi: "Táxi",
}

export const CATEGORIA_ICON: Record<CategoriaDespesa, LucideIcon> = {
  combustivel: Fuel,
  alimentacao: UtensilsCrossed,
  hospedagem: BedDouble,
  pedagio: Milestone,
  uber: Car,
  taxi: CarTaxiFront,
}

/** Paleta de categorias dos gráficos (design.md: brand-500, blue-500, amber-500, violet, text-500). */
export const CATEGORIA_COR: Record<CategoriaDespesa, string> = {
  combustivel: "#0EA968",
  alimentacao: "#2563EB",
  hospedagem: "#D97706",
  pedagio: "#7C3AED",
  uber: "#5B6762",
  taxi: "#0B3D2A",
}

export const CONFIANCA_LABEL: Record<NivelConfianca, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
  vedado: "Vedado",
}

/** Cores exatas do Confidence System (design.md). */
export const CONFIANCA_COR: Record<NivelConfianca, string> = {
  alta: "#0EA968",
  media: "#D97706",
  baixa: "#EA580C",
  vedado: "#DC2626",
}

export const CONFIANCA_ORDER: NivelConfianca[] = ["alta", "media", "baixa", "vedado"]

export const STATUS_DESPESA_LABEL: Record<StatusDespesa, string> = {
  pendente: "Pendente",
  em_revisao: "Em revisão",
  aprovada: "Liberada",
  rejeitada: "Rejeitada",
}

export const STATUS_DESPESA_CLASSES: Record<StatusDespesa, string> = {
  pendente: "bg-paper text-text-500 ring-1 ring-line",
  em_revisao: "bg-conf-media-bg text-conf-media-text",
  aprovada: "bg-conf-alta-bg text-conf-alta-text",
  rejeitada: "bg-conf-vedado-bg text-conf-vedado-text",
}

export const TRIBUTO_LABEL: Record<Tributo, string> = {
  pis_cofins: "PIS/COFINS",
  icms: "ICMS",
  cbs: "CBS",
  ibs: "IBS",
  irpj_csll: "IRPJ/CSLL",
}

export const REGIME_LABEL: Record<RegimeTributario, string> = {
  lucro_real: "Lucro Real",
  lucro_presumido: "Lucro Presumido",
  simples_nacional: "Simples Nacional",
}

/** "yyyy-mm-dd" → Date local (sem deslocamento de fuso). */
export function parseDataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number)
  return new Date(ano, (mes ?? 1) - 1, dia ?? 1)
}

/** Date → "yyyy-mm-dd" local (input das queries tRPC). */
export function toISODate(data: Date): string {
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, "0")
  const dia = String(data.getDate()).padStart(2, "0")
  return `${ano}-${mes}-${dia}`
}

/** "yyyy-mm-dd" → "dd/mm/aaaa". */
export function formatDataPtBR(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [ano, mes, dia] = iso.split("-")
  if (!ano || !mes || !dia) return iso
  return `${dia}/${mes}/${ano}`
}

/** Chave de mês "yyyy-MM" a partir de uma ISO date. */
export function mesChave(iso: string): string {
  return iso.slice(0, 7)
}
