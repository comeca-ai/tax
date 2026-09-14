import { describe, expect, it } from "vitest";
import { gerarLinkConviteWhatsapp, mensagemConviteWhatsapp } from "./conviteWhatsapp";

const convite = {
  nome: "João da Silva",
  empresa: "Empresa Exemplo Ltda.",
  link: "https://oreembolsobot.app/convite/token-seguro",
};

describe("convite via WhatsApp", () => {
  it("gera link wa.me com número internacional e convite codificado", () => {
    const link = gerarLinkConviteWhatsapp({ ...convite, telefone: "+55 (11) 99777-6666" });

    expect(link).toMatch(/^https:\/\/wa\.me\/5511997776666\?text=/);
    expect(decodeURIComponent(link ?? "")).toContain(convite.link);
    expect(decodeURIComponent(link ?? "")).toContain("Empresa Exemplo Ltda.");
  });

  it("não gera link sem telefone internacional válido", () => {
    expect(gerarLinkConviteWhatsapp({ ...convite, telefone: null })).toBeNull();
    expect(gerarLinkConviteWhatsapp({ ...convite, telefone: "119977" })).toBeNull();
  });

  it("informa prazo e o objetivo do aceite", () => {
    expect(mensagemConviteWhatsapp(convite)).toContain("válido por 7 dias");
    expect(mensagemConviteWhatsapp(convite)).toContain("Crie sua senha");
  });
});
