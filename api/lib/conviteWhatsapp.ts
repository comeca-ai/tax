/**
 * Link de compartilhamento do convite pelo WhatsApp.
 *
 * O envio é iniciado conscientemente pelo gestor no próprio WhatsApp. Assim,
 * não dependemos de uma API de mensagens e o link de aceite não é enviado a
 * um telefone que não esteja cadastrado para o colaborador.
 */
function numeroWhatsapp(telefone: string | null | undefined): string | null {
  const numero = telefone?.replace(/\D/g, "") ?? "";
  // Formato internacional E.164 sem o sinal de +: DDI + DDD + número.
  return numero.length >= 10 && numero.length <= 15 ? numero : null;
}

export function mensagemConviteWhatsapp(opts: {
  nome: string;
  empresa: string;
  link: string;
}): string {
  return [
    `Olá, ${opts.nome}!`,
    `A ${opts.empresa} convidou você para acessar o reembolsa.ia.`,
    `Crie sua senha por este link (válido por 7 dias): ${opts.link}`,
  ].join("\n\n");
}

export function gerarLinkConviteWhatsapp(opts: {
  telefone: string | null | undefined;
  nome: string;
  empresa: string;
  link: string;
}): string | null {
  const telefone = numeroWhatsapp(opts.telefone);
  if (!telefone) return null;

  return `https://wa.me/${telefone}?text=${encodeURIComponent(mensagemConviteWhatsapp(opts))}`;
}
