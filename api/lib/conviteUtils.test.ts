import { describe, expect, it } from "vitest";
import { conviteExpirado, gerarTokenConvite } from "./conviteUtils";

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
