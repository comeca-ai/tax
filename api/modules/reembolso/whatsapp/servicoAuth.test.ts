import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  autorizarServico,
  exigirServicoAutenticado,
  lerTokensDeServico,
  type ServicoEnv,
} from "./servicoAuth";
const atual = "fixture-current-aaaaaaaaaaaaaaaaaaaaaaaa";
const novo = "fixture-rotation-bbbbbbbbbbbbbbbbbbbbbbb";
const config = JSON.stringify([
  { token: atual, empresaId: 1 },
  { token: novo, empresaId: 1 },
]);
describe("token de serviço vinculado à empresa", () => {
  it("rotação mantém ambos tokens restritos à mesma empresa", () => {
    expect(autorizarServico(`Bearer ${atual}`, config)).toEqual({
      empresaId: 1,
    });
    expect(autorizarServico(`Bearer ${novo}`, config)).toEqual({
      empresaId: 1,
    });
  });
  it.each([
    undefined,
    "",
    atual,
    `${atual},${novo}`,
    "{}",
    "[]",
    "invalid",
    JSON.stringify([{ token: atual, empresaId: 0 }]),
    JSON.stringify([
      { token: atual, empresaId: 1 },
      { token: atual, empresaId: 2 },
    ]),
  ])("configuração inválida ou global antiga falha fechada", value => {
    expect(lerTokensDeServico(value)).toEqual([]);
    expect(autorizarServico(`Bearer ${atual}`, value)).toBeNull();
  });
  it("não aceita ausência, cookie ou token desconhecido", async () => {
    const app = new Hono<ServicoEnv>();
    app.use("/*", exigirServicoAutenticado(config));
    app.get("/protegida", c => c.json(c.get("servicoTenant")));
    for (const headers of [
      { Cookie: "session=fixture" },
      { Authorization: "Bearer desconhecido" },
      {},
    ]) {
      expect(
        (await app.request("http://local/protegida", { headers })).status
      ).toBe(401);
    }
    const response = await app.request("http://local/protegida", {
      headers: { Authorization: `Bearer ${atual}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ empresaId: 1 });
  });
});
