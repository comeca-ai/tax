import { afterEach, describe, expect, it } from "vitest";
import {
  gerarLinkConviteAgente,
  mensagemConviteAgente,
  numeroDoAgente,
} from "./convite";

describe("convite-isqueiro do agente (D-004)", () => {
  afterEach(() => {
    delete process.env.AGENT_WHATSAPP_NUMBER;
  });

  it("gera link wa.me com mensagem pré-preenchida (nome + matrícula + empresa)", () => {
    process.env.AGENT_WHATSAPP_NUMBER = "55 (11) 91234-5678";
    const link = gerarLinkConviteAgente({
      nome: "João Silva",
      empresa: "START UP LTDA",
      matricula: "1234",
    });
    expect(link).not.toBeNull();
    const url = new URL(link!);
    expect(url.origin + url.pathname).toBe("https://wa.me/5511912345678");
    const texto = decodeURIComponent(url.searchParams.get("text") ?? "");
    expect(texto).toContain("João Silva");
    expect(texto).toContain("START UP LTDA");
    expect(texto).toContain("1234");
  });

  it("omite matrícula quando não informada", () => {
    process.env.AGENT_WHATSAPP_NUMBER = "5511912345678";
    const texto = mensagemConviteAgente({ nome: "Maria", empresa: "ACME" });
    expect(texto).not.toContain("matrícula");
    expect(texto).toContain("Maria");
    expect(texto).toContain("ACME");
  });

  it("sem AGENT_WHATSAPP_NUMBER configurado, retorna null (admin vê fallback)", () => {
    delete process.env.AGENT_WHATSAPP_NUMBER;
    expect(numeroDoAgente()).toBeNull();
    expect(
      gerarLinkConviteAgente({ nome: "João", empresa: "ACME" }),
    ).toBeNull();
  });

  it("ignora número curto demais para ser real", () => {
    process.env.AGENT_WHATSAPP_NUMBER = "1199";
    expect(numeroDoAgente()).toBeNull();
  });
});
