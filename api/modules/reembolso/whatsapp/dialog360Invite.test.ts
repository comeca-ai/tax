import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enviarBoasVindasWhatsapp360dialog,
  montarTemplateBoasVindasWhatsapp,
} from "./dialog360Invite";

const apiKeyOriginal = process.env.DIALOG_360_API_KEY;
const templateOriginal = process.env.DIALOG_360_WELCOME_TEMPLATE;
const fetchOriginal = globalThis.fetch;

afterEach(() => {
  if (apiKeyOriginal === undefined) delete process.env.DIALOG_360_API_KEY;
  else process.env.DIALOG_360_API_KEY = apiKeyOriginal;
  if (templateOriginal === undefined) delete process.env.DIALOG_360_WELCOME_TEMPLATE;
  else process.env.DIALOG_360_WELCOME_TEMPLATE = templateOriginal;
  globalThis.fetch = fetchOriginal;
});

describe("template de boas-vindas 360dialog", () => {
  it("monta o template ativo com o nome do colaborador", () => {
    expect(
      montarTemplateBoasVindasWhatsapp({
        telefone: "5511997776666",
        nome: "João da Silva",
        template: "boas_vindas_reembolsa",
        idioma: "pt_BR",
      }),
    ).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5511997776666",
      type: "template",
      template: {
        name: "boas_vindas_reembolsa",
        language: { code: "pt_BR" },
        components: [
          { type: "body", parameters: [{ type: "text", text: "João da Silva" }] },
        ],
      },
    });
  });

  it("devolve o messageId aceito pelo provedor", async () => {
    process.env.DIALOG_360_API_KEY = "chave-de-teste";
    process.env.DIALOG_360_WELCOME_TEMPLATE = "boas_vindas_reembolsa";
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.abc123" }] }), { status: 200 }),
    );

    await expect(
      enviarBoasVindasWhatsapp360dialog({ telefone: "+55 11 99999-9999", nome: "João" }),
    ).resolves.toEqual({ enviado: true, messageId: "wamid.abc123" });
  });
});
