/**
 * Monta um link `wa.me` de compartilhamento (WhatsApp) com texto pré-preenchido.
 * `telefone` (opcional, só dígitos com DDI, ex. "5511999999999") direciona a conversa;
 * sem telefone, o WhatsApp abre o seletor de contato do usuário.
 * Abra o retorno com `window.open(url, "_blank", "noopener,noreferrer")`.
 */
export function waCompartilhar(texto: string, telefone?: string): string {
  const alvo = telefone ? telefone.replace(/\D/g, "") : ""
  return `https://wa.me/${alvo}?text=${encodeURIComponent(texto)}`
}
