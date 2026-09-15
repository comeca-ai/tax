import { beforeEach, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), db: vi.fn(), log: vi.fn() }));
vi.mock("./_shared", () => ({
  assertAdminDaEmpresa: mocks.admin,
  assertAdminDaEmpresaBloqueado: mocks.admin,
  registrarLog: mocks.log,
}));
vi.mock("../queries/connection", () => ({ getDb: mocks.db }));
import { metricasPocRouter } from "./metricasPoc";
const caller = () =>
  metricasPocRouter.createCaller({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    usuario: {
      id: 7,
      email: "teste@example.test",
      nome: "Teste",
      perfil: "cliente",
    },
  });
const input = {
  empresaId: 42,
  despesaId: 5,
  conjunto: "piloto",
  campo: "valor",
  previsto: true,
  observado: false,
  evidencia: "Comparado ao documento original",
};
beforeEach(() => {
  vi.resetAllMocks();
});
it("nega acesso antes de ler métricas ou gravar amostra", async () => {
  mocks.admin.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
  await expect(
    caller().resumo({
      empresaId: 42,
      inicio: "2026-09-01T00:00:00Z",
      fim: "2026-10-01T00:00:00Z",
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(caller().auditarAmostra(input)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(mocks.db).not.toHaveBeenCalled();
});
it("amostra escreve somente auditoria, com autor e empresa", async () => {
  const tx = {
    select: () => ({
      from: () => ({ where: () => ({ for: async () => [{ id: 5 }] }) }),
    }),
  };
  mocks.db.mockReturnValue({
    transaction: async (f: (t: unknown) => unknown) => f(tx),
  });
  await caller().auditarAmostra(input);
  expect(mocks.log).toHaveBeenCalledWith(
    tx,
    expect.objectContaining({
      usuarioId: 7,
      empresaId: 42,
      entidadeId: 5,
      acao: "poc.auditoria_amostral",
    })
  );
});
it("não grava avaliação quando despesa não pertence à empresa", async () => {
  const tx = {
    select: () => ({
      from: () => ({ where: () => ({ for: async () => [] }) }),
    }),
  };
  mocks.db.mockReturnValue({
    transaction: async (f: (t: unknown) => unknown) => f(tx),
  });
  await expect(caller().auditarAmostra(input)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(mocks.log).not.toHaveBeenCalled();
});
it("revogação entre leitura e transação impede a gravação", async () => {
  mocks.admin
    .mockResolvedValueOnce({ id: 42 })
    .mockRejectedValueOnce(new TRPCError({ code: "FORBIDDEN" }));
  const tx = { select: vi.fn() };
  mocks.db.mockReturnValue({
    transaction: async (f: (t: unknown) => unknown) => f(tx),
  });
  await expect(caller().auditarAmostra(input)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(tx.select).not.toHaveBeenCalled();
  expect(mocks.log).not.toHaveBeenCalled();
});
