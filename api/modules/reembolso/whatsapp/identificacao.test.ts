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

describe("identificação WhatsApp por telefone", () => {
  it("aceita somente E.164 canônico e não aceita busca aproximada", () => {
    expect(normalizarTelefoneE164("+5511999999999")).toBe("5511999999999");
    expect(normalizarTelefoneE164("5511999999999")).toBeNull();
    expect(normalizarTelefoneE164("+55 (11) 99999-9999")).toBeNull();
    expect(normalizarTelefoneE164("+0123456789")).toBeNull();
  });

  it("devolve somente a identidade operacional do telefone encontrado", async () => {
    const resolver = vi.fn().mockResolvedValue([colaborador]);
    const app = criarRouterIdentificacaoWhatsapp(resolver);

    const resposta = await app.request("http://local/colaboradores?telefone=%2B5511999999999");
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ colaboradores: [colaborador] });
    expect(resolver).toHaveBeenCalledWith("5511999999999");
  });

  it("não diferencia telefone desconhecido de vínculo inexistente", async () => {
    const resolver = vi.fn().mockResolvedValue([]);
    const app = criarRouterIdentificacaoWhatsapp(resolver);

    const resposta = await app.request("http://local/colaboradores?telefone=%2B5511988888888");
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ colaboradores: [] });
  });

  it("rejeita formato inválido sem consultar o banco", async () => {
    const resolver = vi.fn();
    const app = criarRouterIdentificacaoWhatsapp(resolver);

    const resposta = await app.request("http://local/colaboradores?telefone=5511999999999");
    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toEqual({ error: "Telefone inválido." });
    expect(resolver).not.toHaveBeenCalled();
  });
});
