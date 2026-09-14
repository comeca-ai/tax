import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../context";
import { criarNfeIoRouter } from "./nfeio";
const accessKey = (() => {
  const base = "3526091420016600016655001000000007100000000";
  let sum = 0;
  for (
    let i = 42, weight = 2;
    i >= 0;
    i--, weight = weight === 9 ? 2 : weight + 1
  )
    sum += Number(base[i]) * weight;
  const dv = 11 - (sum % 11);
  return base + (dv >= 10 ? 0 : dv);
})();
const input = {
  empresaId: 42,
  notaFiscalId: 8,
  solicitacaoId: "865454c3-aa0e-4eca-8837-d42865d2bedd",
  confirmarConsulta: true as const,
};
const result = {
  estado: "autorizada" as const,
  httpStatus: 200,
  consultadaEm: "2026-09-13T12:00:00.000Z",
};
function fixture(authenticated = true) {
  const deps = {
    autorizar: vi.fn().mockResolvedValue({ cnpj: "99887766000155" }),
    chavePersistida: vi.fn().mockResolvedValue(accessKey),
    config: vi
      .fn()
      .mockReturnValue({
        habilitado: true,
        apiKey: "synthetic-secret",
        orcamentoId: "budget-synthetic",
      }),
    reservar: vi.fn().mockResolvedValue({ existente: false, resultado: null }),
    consultar: vi.fn().mockResolvedValue(result),
    concluir: vi.fn().mockResolvedValue(undefined),
  };
  const ctx: TrpcContext = {
    req: new Request("http://localhost/api/trpc"),
    resHeaders: new Headers(),
    usuario: authenticated
      ? {
          id: 7,
          email: "synthetic@example.test",
          nome: "Teste",
          perfil: "cliente",
        }
      : null,
  };
  return { deps, caller: criarNfeIoRouter(deps).createCaller(ctx) };
}
describe("NFE.io: autorização e orçamento antes de rede", () => {
  beforeEach(() => vi.clearAllMocks());
  it("sem sessão não toca autorização, banco nem provedor", async () => {
    const { deps, caller } = fixture(false);
    await expect(caller.consultar(input)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(deps.autorizar).not.toHaveBeenCalled();
    expect(deps.reservar).not.toHaveBeenCalled();
    expect(deps.consultar).not.toHaveBeenCalled();
  });
  it("empresa alheia falha antes de ler chave ou configuração", async () => {
    const { deps, caller } = fixture();
    deps.autorizar.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(caller.consultar(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(deps.chavePersistida).not.toHaveBeenCalled();
    expect(deps.config).not.toHaveBeenCalled();
    expect(deps.consultar).not.toHaveBeenCalled();
  });
  it("recusa chave arbitrária no contrato público e requer confirmação", async () => {
    const { deps, caller } = fixture();
    await expect(
      caller.consultar({ ...input, chave: accessKey } as typeof input)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.consultar({
        ...input,
        confirmarConsulta: false,
      } as unknown as typeof input)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(deps.consultar).not.toHaveBeenCalled();
  });
  it("desabilitado ou sem chave persistida não reserva orçamento", async () => {
    const { deps, caller } = fixture();
    deps.config.mockReturnValue({
      habilitado: false,
      apiKey: "synthetic-secret",
      orcamentoId: "budget-synthetic",
    });
    await expect(caller.consultar(input)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    deps.config.mockReturnValue({
      habilitado: true,
      apiKey: "synthetic-secret",
      orcamentoId: "budget-synthetic",
    });
    deps.chavePersistida.mockResolvedValue(null);
    await expect(caller.consultar(input)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(deps.reservar).not.toHaveBeenCalled();
  });
  it("reserva durável precede rede e não persiste chave/token", async () => {
    const { deps, caller } = fixture();
    expect((await caller.consultar(input)).resultado).toEqual(result);
    expect(deps.autorizar.mock.invocationCallOrder[0]).toBeLessThan(
      deps.chavePersistida.mock.invocationCallOrder[0]!
    );
    expect(deps.reservar.mock.invocationCallOrder[0]).toBeLessThan(
      deps.consultar.mock.invocationCallOrder[0]!
    );
    expect(deps.consultar.mock.invocationCallOrder[0]).toBeLessThan(
      deps.concluir.mock.invocationCallOrder[0]!
    );
    const persisted = JSON.stringify([
      deps.reservar.mock.calls,
      deps.concluir.mock.calls,
    ]);
    expect(persisted).not.toContain(accessKey);
    expect(persisted).not.toContain("synthetic-secret");
    expect(deps.reservar.mock.calls[0]?.[0]).toMatchObject({
      empresaId: 42,
      usuarioId: 7,
      notaFiscalId: 8,
      chaveHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
  it("orçamento ausente/esgotado nunca chama provedor", async () => {
    const { deps, caller } = fixture();
    deps.reservar.mockRejectedValue(
      new TRPCError({ code: "TOO_MANY_REQUESTS" })
    );
    await expect(caller.consultar(input)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(deps.consultar).not.toHaveBeenCalled();
  });
  it("replay de reserva incompleta retorna incerto, sem segunda chamada", async () => {
    const { deps, caller } = fixture();
    deps.reservar.mockResolvedValue({ existente: true, resultado: null });
    expect(await caller.consultar(input)).toMatchObject({
      repetida: true,
      reconciliacaoNecessaria: true,
      resultado: null,
    });
    expect(deps.consultar).not.toHaveBeenCalled();
    expect(deps.concluir).not.toHaveBeenCalled();
  });
  it("falha depois da rede não retorna detalhes nem tenta novamente", async () => {
    const { deps, caller } = fixture();
    deps.concluir.mockRejectedValue(
      new Error("synthetic-secret provider body")
    );
    await expect(caller.consultar(input)).rejects.toThrow(
      "Consulta não concluída"
    );
    expect(deps.consultar).toHaveBeenCalledOnce();
  });
});
