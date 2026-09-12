import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  autorizarServico,
  exigirServicoAutenticado,
  lerTokensDeServico,
} from "./servicoAuth";

describe("autenticação da API de serviço WhatsApp", () => {
  const tokens = "token-atual, token-em-rotacao";

  it("aceita os dois tokens durante a rotação", () => {
    expect(autorizarServico("Bearer token-atual", tokens)).toBe(true);
    expect(autorizarServico("Bearer token-em-rotacao", tokens)).toBe(true);
  });

  it("falha fechada para token ausente, formato errado, token inválido ou configuração ausente", () => {
    expect(autorizarServico(undefined, tokens)).toBe(false);
    expect(autorizarServico("token-atual", tokens)).toBe(false);
    expect(autorizarServico("Bearer token-invalido", tokens)).toBe(false);
    expect(autorizarServico("Bearer token-atual", undefined)).toBe(false);
  });

  it("remove tokens vazios e duplicados da configuração", () => {
    expect(lerTokensDeServico(" token-a, ,token-a, token-b ")).toEqual(["token-a", "token-b"]);
  });

  it("não aceita cookie de sessão como atalho para a integração", async () => {
    const app = new Hono();
    app.use("/*", exigirServicoAutenticado(tokens));
    app.get("/protegida", c => c.json({ ok: true }));

    const porCookie = await app.request("http://local/protegida", {
      headers: { Cookie: "session=qualquer-coisa" },
    });
    expect(porCookie.status).toBe(401);
    expect(await porCookie.json()).toEqual({ error: "Unauthorized" });

    const autorizado = await app.request("http://local/protegida", {
      headers: { Authorization: "Bearer token-atual" },
    });
    expect(autorizado.status).toBe(200);
  });
});
