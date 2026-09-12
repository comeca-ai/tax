/**
 * Envio de boas-vindas pela 360dialog após a confirmação do convite.
 *
 * O primeiro contato no WhatsApp precisa usar um template ativo. O template
 * atual `boas_vindas_reembolsa` tem uma variável no corpo: o nome da pessoa.
 * O aceite de acesso segue no e-mail; se ele falhar, o gestor ainda tem o
 * fallback manual wa.me com o link seguro do convite.
 */
const DIALOG_360_MESSAGES_URL = "https://waba-v2.360dialog.io/messages";

type ParametroTexto = { type: "text"; text: string };

export function montarTemplateBoasVindasWhatsapp(opts: {
  telefone: string;
  nome: string;
  template: string;
  idioma: string;
}) {
  const parametrosCorpo: ParametroTexto[] = [{ type: "text", text: opts.nome }];

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: opts.telefone,
    type: "template",
    template: {
      name: opts.template,
      language: { code: opts.idioma },
      components: [{ type: "body", parameters: parametrosCorpo }],
    },
  };
}

export async function enviarBoasVindasWhatsapp360dialog(opts: {
  telefone: string | null | undefined;
  nome: string;
}): Promise<{ enviado: boolean }> {
  const apiKey = process.env.DIALOG_360_API_KEY;
  const template = process.env.DIALOG_360_WELCOME_TEMPLATE;
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
        montarTemplateBoasVindasWhatsapp({
          telefone,
          nome: opts.nome,
          template,
          idioma: process.env.DIALOG_360_WELCOME_TEMPLATE_LANGUAGE || "pt_BR",
        }),
      ),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(`[360dialog] Falha ao enviar boas-vindas WhatsApp: HTTP ${response.status}`);
      return { enviado: false };
    }
    return { enviado: true };
  } catch (erro) {
    console.error("[360dialog] Falha ao enviar boas-vindas WhatsApp:", erro);
    return { enviado: false };
  }
}
