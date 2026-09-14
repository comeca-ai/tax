import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../context";
import { criarFiscalRouter } from "./fiscal";

function fixture(perfil: "admin" | "cliente" = "cliente") {
  const deps = {
    autorizarLeitura: vi.fn().mockResolvedValue({ usuarioId: 7 }),
    autorizarAlteracao: vi.fn().mockResolvedValue({}),
    ler: vi.fn().mockResolvedValue({ habilitada: false, versao: 0 }),
    salvar: vi.fn().mockResolvedValue({ habilitada: true, versao: 1 }),
    historico: vi.fn().mockResolvedValue([]),
  };
  const ctx: TrpcContext = {
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    usuario: {
      id: 7,
      nome: "Fixture",
      email: "fixture@example.invalid",
      perfil,
    },
  };
  return { deps, ctx, caller: criarFiscalRouter(deps).createCaller(ctx) };
}
describe("configuração fiscal por empresa", () => {
  it("leitura verifica empresa antes da configuração e do histórico", async () => {
    const { deps, caller } = fixture();
    deps.autorizarLeitura.mockRejectedValue(
      new TRPCError({ code: "FORBIDDEN" })
    );
    await expect(caller.configuracao({ empresaId: 99 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(deps.ler).not.toHaveBeenCalled();
    expect(deps.historico).not.toHaveBeenCalled();
  });
  it("colaborador sem poderes administrativos não altera opção", async () => {
    const { deps, caller } = fixture();
    deps.autorizarAlteracao.mockRejectedValue(
      new TRPCError({ code: "FORBIDDEN" })
    );
    await expect(
      caller.configurar({ empresaId: 1, habilitada: true, versaoEsperada: 0 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(deps.salvar).not.toHaveBeenCalled();
  });
  it("autoria vem da sessão, não do formulário", async () => {
    const { deps, caller } = fixture();
    const input = { empresaId: 1, habilitada: true, versaoEsperada: 0 };
    await caller.configurar(input);
    expect(deps.salvar).toHaveBeenCalledWith(input, 7);
    await expect(
      caller.configurar({ ...input, usuarioId: 99 } as typeof input)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("leitor sem administração não recebe histórico nem controle habilitado", async () => {
    const { deps, caller } = fixture();
    deps.autorizarLeitura.mockResolvedValue({ usuarioId: 8 });
    expect(await caller.configuracao({ empresaId: 1 })).toMatchObject({
      podeAlterar: false,
      historico: [],
    });
    expect(deps.historico).not.toHaveBeenCalled();
  });
});
