import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  BedDouble,
  CarFront,
  CarTaxiFront,
  Fuel,
  Route,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react"
import { CATEGORIA_DESPESA_ROTULO, type CategoriaDespesa, type NivelConfianca, type Tributo } from "@contracts/types"

// ─────────────────────────────────────────────────────────────────────────────
// Labels e metadados PT-BR das páginas de despesas (fonte: @contracts/types)
// ─────────────────────────────────────────────────────────────────────────────

/** Rótulo vem do contrato: a mesma grafia nos chips da tela e nos motivos do agente. */
export const CATEGORIA_META: Record<CategoriaDespesa, { label: string; icon: LucideIcon }> = {
  combustivel: { label: CATEGORIA_DESPESA_ROTULO.combustivel, icon: Fuel },
  alimentacao: { label: CATEGORIA_DESPESA_ROTULO.alimentacao, icon: UtensilsCrossed },
  hospedagem: { label: CATEGORIA_DESPESA_ROTULO.hospedagem, icon: BedDouble },
  pedagio: { label: CATEGORIA_DESPESA_ROTULO.pedagio, icon: Route },
  uber: { label: CATEGORIA_DESPESA_ROTULO.uber, icon: CarFront },
  taxi: { label: CATEGORIA_DESPESA_ROTULO.taxi, icon: CarTaxiFront },
}

export const CATEGORIA_OPTIONS = (Object.keys(CATEGORIA_META) as CategoriaDespesa[]).map((value) => ({
  value,
  label: CATEGORIA_META[value].label,
}))

export const TRIBUTO_LABEL: Record<Tributo, string> = {
  pis_cofins: "PIS/COFINS",
  icms: "ICMS",
  cbs: "CBS",
  ibs: "IBS",
  irpj_csll: "IRPJ/CSLL",
}

export const TIPOS_EVIDENCIA = [
  { value: "contrato", label: "Contrato" },
  { value: "ordem_servico", label: "Ordem de serviço" },
  { value: "roteiro", label: "Roteiro" },
  { value: "teste_consumo", label: "Teste de consumo" },
  { value: "outro", label: "Outro" },
] as const

export function tipoEvidenciaLabel(tipo: string): string {
  return TIPOS_EVIDENCIA.find((t) => t.value === tipo)?.label ?? tipo
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatação (datas pt-BR e números)
// ─────────────────────────────────────────────────────────────────────────────

/** `2026-03-12` → `12/03/2026` */
export function formatData(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return format(parseISO(iso), "dd/MM/yyyy")
  } catch {
    return iso
  }
}

/** Date → `14/03/2026 09:41` */
export function formatDataHora(data: Date | string | null | undefined): string {
  if (!data) return "—"
  try {
    const d = typeof data === "string" ? parseISO(data) : data
    return format(d, "dd/MM/yyyy HH:mm", { locale: ptBR })
  } catch {
    return "—"
  }
}

export function formatNumero(valor: number | null | undefined, casas = 1): string {
  if (valor === null || valor === undefined) return "—"
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

export function formatKm(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—"
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} km`
}

/**
 * Nível de confiança → percentual aproximado para dots OCR nos campos fiscais.
 * alta ≥ 90 (verde), media 70–89 (âmbar), baixa/vedado < 70 (vermelho).
 */
export function confiancaParaPct(nivel: NivelConfianca | "alta" | "media" | "baixa"): number {
  switch (nivel) {
    case "alta":
      return 96
    case "media":
      return 82
    default:
      return 58
  }
}
