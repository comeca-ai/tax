import { describe, expect, it } from "vitest";
import { montarTemplateBoasVindasWhatsapp } from "./dialog360Invite";

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
});
