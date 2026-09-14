import { ReservaConsultaPocIndisponivel } from "../../../lib/pocConsultas";

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
type Resposta360dialog = {
  messages?: { id?: unknown }[];
};

export type ResultadoBoasVindas = {
  /** Compatibilidade: significa aceite pela API, não confirmação de entrega. */
  enviado: boolean;
  messageId: string | null;
  status:
    "aceito" | "falhou" | "incerto" | "nao_configurado" | "limite_atingido";
};

async function lerRespostaLimitada(
  response: Response
): Promise<Resposta360dialog> {
  if (!response.body) throw new Error("Resposta ausente");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65_536) throw new Error("Resposta acima do limite");
      chunks.push(value);
    }
    return JSON.parse(
      Buffer.concat(chunks).toString("utf8")
    ) as Resposta360dialog;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

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
}): Promise<ResultadoBoasVindas> {
  const apiKey = process.env.DIALOG_360_API_KEY?.trim();
  const template = process.env.DIALOG_360_WELCOME_TEMPLATE?.trim();
  const idioma = process.env.DIALOG_360_WELCOME_TEMPLATE_LANGUAGE || "pt_BR";
  const telefone = opts.telefone?.replace(/\D/g, "") ?? "";
  if (!apiKey || !template) {
    return { enviado: false, messageId: null, status: "nao_configurado" };
  }
  if (
    !/^[1-9]\d{9,14}$/.test(telefone) ||
    !/^[a-z0-9_]{1,128}$/.test(template) ||
    !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(idioma) ||
    /[\r\n]/.test(apiKey) ||
    !opts.nome.trim() ||
    opts.nome.length > 255 ||
    /[\r\n\t]/.test(opts.nome)
  ) {
    return { enviado: false, messageId: null, status: "falhou" };
  }

  try {
    const response = await fetch(DIALOG_360_MESSAGES_URL, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        "D360-API-KEY": apiKey,
      },
      body: JSON.stringify(
        montarTemplateBoasVindasWhatsapp({
          telefone,
          nome: opts.nome,
          template,
          idioma,
        })
      ),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(
        `[360dialog] Falha ao enviar boas-vindas WhatsApp: HTTP ${response.status}`
      );
      await response.body?.cancel().catch(() => {});
      // Um erro de gateway/servidor não prova que o POST não foi processado.
      return {
        enviado: false,
        messageId: null,
        status: response.status >= 500 ? "incerto" : "falhou",
      };
    }
    const resposta = await lerRespostaLimitada(response);
    const messageId = resposta?.messages?.[0]?.id;
    if (
      typeof messageId !== "string" ||
      !/^wamid\.[A-Za-z0-9+/=_.-]+$/.test(messageId) ||
      messageId.length > 128
    ) {
      console.warn(
        "[360dialog] Resposta sem identificador válido; não reenviar automaticamente."
      );
      return { enviado: false, messageId: null, status: "incerto" };
    }
    return { enviado: true, messageId, status: "aceito" };
  } catch (error) {
    if (error instanceof ReservaConsultaPocIndisponivel)
      return { enviado: false, messageId: null, status: "limite_atingido" };
    console.error(
      "[360dialog] Resultado de boas-vindas incerto; não reenviar automaticamente."
    );
    return { enviado: false, messageId: null, status: "incerto" };
  }
}
