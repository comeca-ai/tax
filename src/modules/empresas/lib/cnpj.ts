/** Máscara e validação (dígitos verificadores) de CNPJ. */

/** Aplica a máscara 00.000.000/0000-00 conforme o usuário digita. */
export function mascaraCnpj(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 14)
  return digitos
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
}

/** Valida CNPJ por checksum (módulo 11). Aceita com ou sem máscara. */
export function cnpjValido(valor: string): boolean {
  const d = valor.replace(/\D/g, "")
  if (d.length !== 14) return false
  if (/^(\d)\1{13}$/.test(d)) return false

  const digito = (base: string, pesos: number[]): number => {
    const soma = base.split("").reduce((acc, n, i) => acc + Number(n) * pesos[i], 0)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }

  const d1 = digito(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = digito(d.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return d === d.slice(0, 12) + String(d1) + String(d2)
}
