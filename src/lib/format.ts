const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
})

/** pt-BR currency format: R$ 1.234,56 */
export function formatBRL(value: number): string {
  return brlFormatter.format(value)
}
