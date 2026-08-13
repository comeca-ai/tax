/**
 * Convite-isqueiro do agente (D-004): o admin dispara um e-mail/link e o
 * colaborador INICIA a conversa com o agente pelo wa.me — mensagem pré-
 * preenchida com nome e matrícula para o agente identificar de quem se trata.
 */

/** Número do agente (WhatsApp da instância Evolution) — só dígitos com DDI. */
export function numeroDoAgente(): string | null {
  const n = process.env.AGENT_WHATSAPP_NUMBER;
  if (!n) return null;
  const limpo = n.replace(/\D/g, "");
  return limpo.length >= 10 ? limpo : null;
}

/** Mensagem que chega pré-preenchida no WhatsApp do colaborador. */
export function mensagemConviteAgente(opts: {
  nome: string;
  empresa: string;
  matricula?: string | null;
}): string {
  const partes = [
    `Oi! Sou ${opts.nome}, da ${opts.empresa}.`,
    opts.matricula ? `Minha matrícula é ${opts.matricula}.` : null,
    "Quero ativar meu reembolso.",
  ].filter(Boolean);
  return partes.join(" ");
}

/** Link wa.me completo (ou null se AGENT_WHATSAPP_NUMBER não configurado). */
export function gerarLinkConviteAgente(opts: {
  nome: string;
  empresa: string;
  matricula?: string | null;
}): string | null {
  const numero = numeroDoAgente();
  if (!numero) return null;
  const texto = encodeURIComponent(mensagemConviteAgente(opts));
  return `https://wa.me/${numero}?text=${texto}`;
}
