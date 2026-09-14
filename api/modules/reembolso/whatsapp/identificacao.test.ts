import { Hono } from "hono";
import { exigirServicoAutenticado, type ServicoEnv } from "./servicoAuth";
import { describe, expect, it, vi } from "vitest";
import {
  criarRouterIdentificacaoWhatsapp,
  normalizarTelefoneE164,
  type ColaboradorResolvidoWhatsapp,
} from "./identificacao";

const colaborador: ColaboradorResolvidoWhatsapp = {
  colaboradorId: 7,
  empresaId: 11,
  empresaNome: "Empresa de teste",
  nome: "Pessoa de teste",
  situacao: "ativo",
  politicaId: 13,
  tags: ["externa", "nivel:2", "papel:solicitante"],
};

const token = "fixture-tenant-aaaaaaaaaaaaaaaaaaaaaaaa";
function montar(router: Hono<ServicoEnv>) {
  const app = new Hono<ServicoEnv>();
  app.use(
    "/*",
    exigirServicoAutenticado(JSON.stringify([{ token, empresaId: 11 }]))
  );
  app.route("/", router);
  return {
    request: (url: string, init: RequestInit = {}) =>
      app.request(url, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      }),
  };
}

describe("identificação WhatsApp por telefone", () => {
  it("aceita somente E.164 canônico e não aceita busca aproximada", () => {
    expect(normalizarTelefoneE164("+5511999999999")).toBe("5511999999999");
    expect(normalizarTelefoneE164("5511999999999")).toBeNull();
    expect(normalizarTelefoneE164("+55 (11) 99999-9999")).toBeNull();
    expect(normalizarTelefoneE164("+0123456789")).toBeNull();
  });

  it("devolve somente a identidade operacional do telefone encontrado", async () => {
    const resolver = vi.fn().mockResolvedValue([colaborador]);
    const app = montar(criarRouterIdentificacaoWhatsapp(resolver));

    const resposta = await app.request(
      "http://local/colaboradores?telefone=%2B5511999999999"
    );
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ colaboradores: [colaborador] });
    expect(resolver).toHaveBeenCalledWith("5511999999999", 11);
  });

  it("não diferencia telefone desconhecido de vínculo inexistente", async () => {
    const resolver = vi.fn().mockResolvedValue([]);
    const app = montar(criarRouterIdentificacaoWhatsapp(resolver));

    const resposta = await app.request(
      "http://local/colaboradores?telefone=%2B5511988888888"
    );
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ colaboradores: [] });
  });

  it("rejeita formato inválido sem consultar o banco", async () => {
    const resolver = vi.fn();
    const app = montar(criarRouterIdentificacaoWhatsapp(resolver));

    const resposta = await app.request(
      "http://local/colaboradores?telefone=5511999999999"
    );
    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toEqual({ error: "Telefone inválido." });
    expect(resolver).not.toHaveBeenCalled();
  });
});
it("não revela identidade de outra empresa mesmo se resolver retornar dados excedentes", async () => {
  const resolver = vi
    .fn()
    .mockResolvedValue([
      colaborador,
      { ...colaborador, empresaId: 99, nome: "Não expor" },
    ]);
  const response = await montar(
    criarRouterIdentificacaoWhatsapp(resolver)
  ).request(
    "http://local/colaboradores?telefone=%2B5511999999999&empresa_id=99"
  );
  expect(await response.json()).toEqual({ colaboradores: [colaborador] });
  expect(resolver).toHaveBeenCalledWith("5511999999999", 11);
});
it("router de identidade sem credencial falha fechado antes de consultar", async () => {
  const resolver = vi.fn();
  expect(
    (
      await criarRouterIdentificacaoWhatsapp(resolver).request(
        "http://local/colaboradores?telefone=%2B5511999999999"
      )
    ).status
  ).toBe(401);
  expect(resolver).not.toHaveBeenCalled();
});
