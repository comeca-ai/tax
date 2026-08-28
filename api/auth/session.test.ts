import { describe, expect, it } from "vitest";
import { cookieSessao, requisicaoSegura } from "./session";

// O atributo Secure do cookie de sessão é decidido pela requisição, não por
// config global. Regressão da falha de 24–28/08: APP_URL https + acesso
// direto por http://IP:3000 → navegador descartava o cookie Secure e a
// sessão morria em silêncio (contas órfãs do wizard).

function req(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe("requisicaoSegura", () => {
  it("confia no X-Forwarded-Proto=https do nginx mesmo com URL interna http", () => {
    expect(
      requisicaoSegura(req("http://127.0.0.1:3000/api/trpc", { "x-forwarded-proto": "https" })),
    ).toBe(true);
  });

  it("X-Forwarded-Proto=http (acesso direto à porta) é inseguro", () => {
    expect(
      requisicaoSegura(req("http://34.39.190.83:3000/api/trpc", { "x-forwarded-proto": "http" })),
    ).toBe(false);
  });

  it("sem proxy, cai no protocolo da própria URL", () => {
    expect(requisicaoSegura(req("https://oreembolsobot.app/api/trpc"))).toBe(true);
    expect(requisicaoSegura(req("http://localhost:3000/api/trpc"))).toBe(false);
  });

  it("lista de proxies usa o protocolo mais externo", () => {
    expect(
      requisicaoSegura(req("http://app:3000/api/trpc", { "x-forwarded-proto": "https, http" })),
    ).toBe(true);
  });
});

describe("cookieSessao", () => {
  it("marca Secure apenas quando a requisição é segura", () => {
    expect(cookieSessao("tok", true)).toContain("; Secure");
    expect(cookieSessao("tok", false)).not.toContain("Secure");
  });

  it("sempre HttpOnly, SameSite=Lax e path raiz", () => {
    for (const secure of [true, false]) {
      const cookie = cookieSessao("tok", secure);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Path=/");
    }
  });
});
