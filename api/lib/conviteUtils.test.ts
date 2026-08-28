import { afterEach, describe, expect, it } from "vitest";
import { conviteExpirado, gerarTokenConvite, linkAceite } from "./conviteUtils";

describe("gerarTokenConvite", () => {
  it("gera token hex de 48 caracteres", () => {
    const token = gerarTokenConvite();
    expect(token).toMatch(/^[0-9a-f]{48}$/);
  });

  it("gera tokens únicos (100 amostras sem colisão)", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(gerarTokenConvite());
    }
    expect(tokens.size).toBe(100);
  });
});

describe("conviteExpirado", () => {
  const agora = new Date("2026-01-15T12:00:00Z");

  it("retorna true quando expiresAt está no passado", () => {
    const expirado = new Date("2026-01-15T11:59:59Z");
    expect(conviteExpirado(expirado, agora)).toBe(true);
  });

  it("retorna false quando expiresAt está no futuro", () => {
    const valido = new Date("2026-01-15T12:00:01Z");
    expect(conviteExpirado(valido, agora)).toBe(false);
  });

  it("retorna false quando expiresAt é exatamente agora (expira só depois)", () => {
    expect(conviteExpirado(new Date(agora.getTime()), agora)).toBe(false);
  });

  it("usa a data atual por padrão quando 'agora' não é informado", () => {
    expect(conviteExpirado(new Date(Date.now() - 1000))).toBe(true);
    expect(conviteExpirado(new Date(Date.now() + 60_000))).toBe(false);
  });
});

/**
 * O link de aceite é o que o gestor copia da tela e o que vai no e-mail do
 * convite (v1.9.1) — se ele sair errado, o convidado não entra.
 */
describe("linkAceite", () => {
  const original = process.env.APP_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = original;
  });

  it("usa a APP_URL do ambiente", () => {
    process.env.APP_URL = "https://oreembolsobot.app";
    expect(linkAceite("abc123")).toBe("https://oreembolsobot.app/convite/abc123");
  });

  it("sem APP_URL, cai no localhost do desenvolvimento", () => {
    delete process.env.APP_URL;
    expect(linkAceite("abc123")).toBe("http://localhost:3000/convite/abc123");
  });
});
