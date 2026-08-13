import nodemailer from "nodemailer";
import { PERFIL_LABELS, type Perfil } from "@contracts/types";

/**
 * Mailer plugável (v1.2.0): se SMTP_HOST não estiver configurado, retorna
 * { enviado: false } e o caller devolve o link de aceite para o admin
 * copiar/compartilhar manualmente. Falhas de envio nunca quebram o fluxo
 * de criação do convite.
 */
export async function enviarConviteEmail(opts: {
  para: string;
  link: string;
  perfil: Perfil;
}): Promise<{ enviado: boolean }> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    return { enviado: false };
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const from = process.env.SMTP_FROM || user;
  const perfilLabel = PERFIL_LABELS[opts.perfil];

  const texto = [
    "Olá!",
    "",
    `Você foi convidado para o reembolsa.ia com o perfil ${perfilLabel}.`,
    "",
    `Para aceitar o convite e criar sua senha, acesse: ${opts.link}`,
    "",
    "Este link expira em 7 dias. Se você não esperava este convite, ignore este e-mail.",
  ].join("\n");

  const html = `
<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
  <h2 style="color: #0f766e;">Você foi convidado para o reembolsa.ia</h2>
  <p>Olá! Você foi convidado para acessar o <strong>reembolsa.ia</strong> com o perfil <strong>${perfilLabel}</strong>.</p>
  <p style="margin: 24px 0;">
    <a href="${opts.link}"
       style="background: #0f766e; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
      Aceitar convite
    </a>
  </p>
  <p style="font-size: 13px; color: #555;">
    Se o botão não funcionar, copie e cole este link no navegador:<br/>
    <a href="${opts.link}">${opts.link}</a>
  </p>
  <p style="font-size: 13px; color: #555;">
    Este link expira em 7 dias. Se você não esperava este convite, ignore este e-mail.
  </p>
</div>`.trim();

  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_PORT === "465",
      auth: user ? { user, pass: process.env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from,
      to: opts.para,
      subject: "Você foi convidado para o reembolsa.ia",
      text: texto,
      html,
    });
    return { enviado: true };
  } catch (err) {
    console.error("[mailer] Falha ao enviar e-mail de convite:", err);
    return { enviado: false };
  }
}

/**
 * E-mail-isqueiro do agente (v1.6.0 — D-004): convida o colaborador a INICIAR
 * a conversa no WhatsApp pelo link wa.me. Sem SMTP configurado (ou falha),
 * retorna { enviado: false } e o caller mostra o link para o admin copiar.
 */
export async function enviarConviteAgenteEmail(opts: {
  para: string;
  nome: string;
  empresa: string;
  linkWhatsApp: string;
}): Promise<{ enviado: boolean }> {
  const host = process.env.SMTP_HOST;
  if (!host) return { enviado: false };

  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const from = process.env.SMTP_FROM || user;

  const texto = [
    `Olá, ${opts.nome}!`,
    "",
    `A ${opts.empresa} cadastrou você no reembolso. Para ativar e começar a receber seus reembolsos, é só chamar a gente no WhatsApp:`,
    "",
    opts.linkWhatsApp,
    "",
    "Toque no link, envie a mensagem que já vem escrita e pronto — leva menos de 1 minuto.",
  ].join("\n");

  const html = `
<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
  <h2 style="color: #0f766e;">Ative seu reembolso em 1 minuto</h2>
  <p>Olá, <strong>${opts.nome}</strong>! A <strong>${opts.empresa}</strong> cadastrou você no reembolso.</p>
  <p>Para ativar e começar a receber seus reembolsos, chame a gente no WhatsApp:</p>
  <p style="margin: 24px 0;">
    <a href="${opts.linkWhatsApp}"
       style="background: #0f766e; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
      Ativar no WhatsApp
    </a>
  </p>
  <p style="font-size: 13px; color: #555;">
    Toque no botão e envie a mensagem que já vem escrita — o agente confirma seus dados e pronto.
  </p>
</div>`.trim();

  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_PORT === "465",
      auth: user ? { user, pass: process.env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from,
      to: opts.para,
      subject: `${opts.empresa}: ative seu reembolso no WhatsApp`,
      text: texto,
      html,
    });
    return { enviado: true };
  } catch (err) {
    console.error("[mailer] Falha ao enviar e-mail-isqueiro:", err);
    return { enviado: false };
  }
}

/**
 * E-mail de redefinição de senha (v1.6.1). Mesma regra do convite: sem SMTP,
 * retorna { enviado: false } e o caller decide o fallback (log do servidor —
 * nunca expor o link ao cliente, para não virar vetor de tomada de conta).
 */
export async function enviarResetSenhaEmail(opts: {
  para: string;
  link: string;
}): Promise<{ enviado: boolean }> {
  const host = process.env.SMTP_HOST;
  if (!host) return { enviado: false };

  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const from = process.env.SMTP_FROM || user;

  const texto = [
    "Olá!",
    "",
    "Recebemos um pedido para redefinir sua senha no reembolsa.ia.",
    `Para criar uma nova senha, acesse: ${opts.link}`,
    "",
    "Este link expira em 1 hora. Se não foi você, ignore este e-mail — sua senha continua a mesma.",
  ].join("\n");

  const html = `
<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
  <h2 style="color: #0f766e;">Redefinir sua senha</h2>
  <p>Recebemos um pedido para redefinir sua senha no <strong>reembolsa.ia</strong>.</p>
  <p style="margin: 24px 0;">
    <a href="${opts.link}"
       style="background: #0f766e; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
      Criar nova senha
    </a>
  </p>
  <p style="font-size: 13px; color: #555;">
    Este link expira em 1 hora. Se não foi você, ignore este e-mail — sua senha continua a mesma.
  </p>
</div>`.trim();

  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_PORT === "465",
      auth: user ? { user, pass: process.env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from,
      to: opts.para,
      subject: "Redefinição de senha — reembolsa.ia",
      text: texto,
      html,
    });
    return { enviado: true };
  } catch (err) {
    console.error("[mailer] Falha ao enviar e-mail de reset:", err);
    return { enviado: false };
  }
}
