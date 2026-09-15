import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../context";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), acesso: vi.fn(), parser: vi.fn(), db: vi.fn(),
}));
vi.mock("./_shared", () => ({
  assertAdminDaEmpresa: mocks.admin,
  assertEmpresaAcesso: mocks.acesso,
  registrarLog: vi.fn(),
  ehAdminDeAlgumaEmpresa: vi.fn(),
}));
vi.mock("../queries/connection", () => ({ getDb: mocks.db }));
vi.mock("../modules/reembolso/policy/parser", () => ({
  getPolicyParser: () => ({ extract: mocks.parser }),
}));

import { politicaRouter } from "./politica";

const input = {
  empresaId: 42, arquivoNome: "politica.txt", arquivoMime: "text/plain",
  arquivoBase64: "dGVzdGU=",
};
function caller(autenticado = true) {
  const ctx: TrpcContext = {
    req: new Request("http://localhost/api/trpc"), resHeaders: new Headers(),
    usuario: autenticado ? { id: 7, email: "teste@example.test", nome: "Teste", perfil: "cliente" } : null,
  };
  return politicaRouter.createCaller(ctx);
}

describe("política: upload exige administração no servidor", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it("barra sessão ausente antes de consultar autorização ou executar parser", async () => {
    await expect(caller(false).upload(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.parser).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("leitura da empresa não autoriza upload; falha antes de parser e banco", async () => {
    mocks.acesso.mockResolvedValue({ id: 42 });
    mocks.admin.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(caller().upload(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.admin).toHaveBeenCalledWith(expect.objectContaining({ usuario: expect.objectContaining({ id: 7 }) }), 42);
    expect(mocks.acesso).not.toHaveBeenCalled();
    expect(mocks.parser).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("somente após autorização encaminha o documento ao parser", async () => {
    mocks.admin.mockResolvedValue({ id: 42 });
    mocks.parser.mockRejectedValue(new Error("parada controlada antes de qualquer escrita"));
    await expect(caller().upload(input)).rejects.toThrow("parada controlada");
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.parser).toHaveBeenCalledWith({
      arquivoNome: input.arquivoNome, mimeType: input.arquivoMime, base64: input.arquivoBase64,
    });
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.parser.mock.invocationCallOrder[0]!);
  });

  it("expõe configuração ausente do Arquiteto sem alterar o rascunho", async () => {
    mocks.admin.mockResolvedValue({ id: 42 });
    mocks.db.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              { id: 9, empresaId: 42, regras: { regrasExtraidas: [] } },
            ],
          }),
        }),
      }),
    });
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(
      caller().arquitetar({ id: 9, pedido: "Ajustar o limite de alimentação" })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "O Arquiteto não está configurado corretamente nesta homologação.",
    });
  });
});
