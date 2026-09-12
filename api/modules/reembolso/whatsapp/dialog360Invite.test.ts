import { describe, expect, it } from "vitest";
import { montarTemplateConviteWhatsapp } from "./dialog360Invite";

describe("template de convite 360dialog", () => {
  it("monta template utility com URL dinâmica e dados do colaborador", () => {
    expect(
      montarTemplateConviteWhatsapp({
        telefone: "5511997776666",
        nome: "João da Silva",
        empresa: "Empresa Exemplo",
        token: "token-seguro-123",
        template: "convite_acesso",
        idioma: "pt_BR",
      }),
    ).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5511997776666",
      type: "template",
      template: {
        name: "convite_acesso",
        language: { code: "pt_BR" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "João da Silva" },
              { type: "text", text: "Empresa Exemplo" },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: "token-seguro-123" }],
          },
        ],
      },
    });
  });
});
