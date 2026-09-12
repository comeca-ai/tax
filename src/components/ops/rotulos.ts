import type { LucideIcon } from "lucide-react"
import {
  Fuel,
  UtensilsCrossed,
  BedDouble,
  CarTaxiFront,
  CarFront,
  Route,
} from "lucide-react"
import type { CategoriaDespesa, RegimeTributario, StatusDespesa } from "@contracts/types"

/** Rótulos PT-BR compartilhados das páginas operacionais (revisão/veículos/empresas). */

export const CATEGORIA_ROTULO: Record<CategoriaDespesa, string> = {
  combustivel: "Combustível",
  alimentacao: "Alimentação",
  hospedagem: "Hospedagem",
  pedagio: "Pedágio",
  uber: "Uber",
  taxi: "Táxi",
}

export const CATEGORIA_ICONE: Record<CategoriaDespesa, LucideIcon> = {
  combustivel: Fuel,
  alimentacao: UtensilsCrossed,
  hospedagem: BedDouble,
  pedagio: Route,
  uber: CarFront,
  taxi: CarTaxiFront,
}

export const STATUS_ROTULO: Record<StatusDespesa, string> = {
  pendente: "Pendente",
  em_revisao: "Em revisão",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
}

export const REGIME_ROTULO: Record<RegimeTributario, string> = {
  lucro_real: "Lucro Real",
  lucro_presumido: "Lucro Presumido",
  simples_nacional: "Simples Nacional",
}

export const TRIBUTO_ROTULO: Record<string, string> = {
  pis_cofins: "PIS/COFINS",
  icms: "ICMS",
  cbs: "CBS",
  ibs: "IBS",
  irpj_csll: "IRPJ/CSLL",
}

const dataFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" })
const dataHoraFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" })

/** dd/mm/aaaa a partir de ISO date (yyyy-mm-dd) ou Date-like. */
export function formatarData(valor: string | Date | null | undefined): string {
  if (!valor) return "—"
  const s = typeof valor === "string" ? valor : valor.toISOString()
  // ISO date puro (yyyy-mm-dd): formata sem conversão de fuso
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [a, m, d] = s.split("-")
    return `${d}/${m}/${a}`
  }
  const dt = new Date(s)
  return Number.isNaN(dt.getTime()) ? "—" : dataFmt.format(dt)
}

/** dd/mm/aaaa hh:mm a partir de timestamp. */
export function formatarDataHora(valor: string | Date | null | undefined): string {
  if (!valor) return "—"
  const dt = valor instanceof Date ? valor : new Date(valor)
  return Number.isNaN(dt.getTime()) ? "—" : dataHoraFmt.format(dt)
}

/** Número pt-BR com casas decimais configuráveis (ex.: 10,5 km/L). */
export function formatarNumero(valor: number, casas = 1): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}
