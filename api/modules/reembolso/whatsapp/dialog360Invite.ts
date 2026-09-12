/**
 * Envio de convite de acesso pela 360dialog.
 *
 * O primeiro contato no WhatsApp precisa usar um template ativo. Esperamos o
 * template de categoria UTILITY descrito em CONFIGURACAO-BANCO-E-EMAIL.md:
 * dois parâmetros no corpo (nome, empresa) e o primeiro botão URL dinâmico
 * recebendo o token de convite como sufixo.
 */
const DIALOG_360_MESSAGES_URL = "https://waba-v2.360dialog.io/messages";

type ParametroTexto = { type: "text"; text: string };

export function montarTemplateConviteWhatsapp(opts: {
  telefone: string;
  nome: string;
  empresa: string;
  token: string;
  template: string;
  idioma: string;
}) {
  const parametrosCorpo: ParametroTexto[] = [
    { type: "text", text: opts.nome },
    { type: "text", text: opts.empresa },
  ];

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: opts.telefone,
    type: "template",
    template: {
      name: opts.template,
      language: { code: opts.idioma },
      components: [
        { type: "body", parameters: parametrosCorpo },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: opts.token }],
        },
      ],
    },
  };
}

export async function enviarConviteWhatsapp360dialog(opts: {
  telefone: string | null | undefined;
  nome: string;
  empresa: string;
  token: string;
}): Promise<{ enviado: boolean }> {
  const apiKey = process.env.DIALOG_360_API_KEY;
  const template = process.env.DIALOG_360_INVITE_TEMPLATE;
  const telefone = opts.telefone?.replace(/\D/g, "") ?? "";
  if (!apiKey || !template || telefone.length < 10 || telefone.length > 15) {
    return { enviado: false };
  }

  try {
    const response = await fetch(DIALOG_360_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "D360-API-KEY": apiKey,
      },
      body: JSON.stringify(
        montarTemplateConviteWhatsapp({
          telefone,
          nome: opts.nome,
          empresa: opts.empresa,
          token: opts.token,
          template,
          idioma: process.env.DIALOG_360_INVITE_TEMPLATE_LANGUAGE || "pt_BR",
        }),
      ),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(`[360dialog] Falha ao enviar convite WhatsApp: HTTP ${response.status}`);
      return { enviado: false };
    }
    return { enviado: true };
  } catch (erro) {
    console.error("[360dialog] Falha ao enviar convite WhatsApp:", erro);
    return { enviado: false };
  }
}
