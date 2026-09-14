import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  criarTokenSessao,
  lerCookie,
  sessaoCorrespondeCredencial,
  SESSION_TTL_MS,
  verificarTokenSessao,
} from "./session";
import { env } from "../lib/env";

afterEach(() => vi.useRealTimers());
describe("sessão vinculada à credencial atual", () => {
  it("troca/reset invalida token anterior sem incluir senhaHash no payload", () => {
    const original = "synthetic-salted-password-hash-a";
    const token = criarTokenSessao(7, original);
    const payload = verificarTokenSessao(token)!;
    expect(sessaoCorrespondeCredencial(payload, original)).toBe(true);
    expect(
      sessaoCorrespondeCredencial(payload, "synthetic-new-salted-hash")
    ).toBe(false);
    const decoded = Buffer.from(token.split(".")[0], "base64url").toString(
      "utf8"
    );
    expect(decoded).not.toContain(original);
    expect(decoded).not.toContain("senhaHash");
  });
  it("sessões emitidas no mesmo instante têm identidade distinta para logout individual", () => {
    vi.useFakeTimers();
    expect(criarTokenSessao(7, "synthetic-hash")).not.toBe(
      criarTokenSessao(7, "synthetic-hash")
    );
  });
  it("recusa token legado sem marcador mesmo com assinatura correta", () => {
    const payload = Buffer.from(
      JSON.stringify({ uid: 7, exp: Date.now() + 10000 })
    ).toString("base64url");
    const signature = createHmac("sha256", env.appSecret)
      .update(payload)
      .digest("base64url");
    expect(verificarTokenSessao(`${payload}.${signature}`)).toBeNull();
  });
  it("recusa assinatura adulterada e token no instante exato da expiração", () => {
    vi.useFakeTimers();
    const token = criarTokenSessao(7, "synthetic-hash");
    expect(verificarTokenSessao(`${token}x`)).toBeNull();
    vi.advanceTimersByTime(SESSION_TTL_MS);
    expect(verificarTokenSessao(token)).toBeNull();
  });
  it("cookie malformado não derruba criação do contexto", () => {
    expect(
      lerCookie(
        new Request("http://localhost", {
          headers: { cookie: "tax_session=%ZZ" },
        }),
        "tax_session"
      )
    ).toBeNull();
  });
});
