import { beforeEach, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { nfeIoConsultas, nfeIoOrcamentos } from "../../../../db/nfeioSchema";
import { reservarConsultaNfeIo } from "./service";
const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("../../../queries/connection", () => ({ getDb: mocks.db }));
type Input = Parameters<typeof reservarConsultaNfeIo>[0];
const input: Input = {
  id: "request-one",
  orcamentoId: "budget-test",
  empresaId: 1,
  notaFiscalId: 2,
  usuarioId: 3,
  chaveHash: "a".repeat(64),
};

/** Simula isolamento transacional serial; não substitui prova MariaDB concorrente real. */
function fakeDatabase(limit: number | null = 1, failUpdate = false) {
  let budget =
    limit === null ? null : { id: input.orcamentoId, limite: limit, usadas: 0 };
  let entries = new Map<string, Input & { status: string; resultado: null }>();
  let tail: Promise<unknown> = Promise.resolve();
  const locks: { table: unknown; mode: string }[] = [];
  const dialect = new MySqlDialect();
  const transaction = (fn: (tx: unknown) => Promise<unknown>) => {
    const execution = tail.then(async () => {
      let stagedBudget = budget ? { ...budget } : null;
      const stagedEntries = new Map(entries);
      const tx = {
        select: () => ({
          from: (table: unknown) => ({
            where: (condition: Parameters<MySqlDialect["sqlToQuery"]>[0]) => ({
              for: async (mode: string) => {
                locks.push({ table, mode });
                const id = dialect.sqlToQuery(condition).params[0];
                if (table === nfeIoOrcamentos)
                  return stagedBudget?.id === id ? [stagedBudget] : [];
                const entry = stagedEntries.get(String(id));
                return entry ? [entry] : [];
              },
            }),
          }),
        }),
        insert: (table: unknown) => ({
          values: async (row: Input & { status: string }) => {
            expect(table).toBe(nfeIoConsultas);
            stagedEntries.set(row.id, { ...row, resultado: null });
          },
        }),
        update: (table: unknown) => ({
          set: (value: { usadas: number }) => ({
            where: async () => {
              expect(table).toBe(nfeIoOrcamentos);
              if (failUpdate) throw new Error("synthetic rollback");
              stagedBudget = { ...stagedBudget!, ...value };
            },
          }),
        }),
      };
      const result = await fn(tx);
      budget = stagedBudget;
      entries = stagedEntries;
      return result;
    });
    tail = execution.catch(() => undefined);
    return execution;
  };
  mocks.db.mockReturnValue({ transaction });
  return { budget: () => budget, entries: () => entries, locks };
}
beforeEach(() => vi.clearAllMocks());
it("orçamento não provisionado falha sem criá-lo", async () => {
  const state = fakeDatabase(null);
  await expect(reservarConsultaNfeIo(input)).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  });
  expect(state.budget()).toBeNull();
  expect(state.entries().size).toBe(0);
});
it("duas reservas concorrentes disputam último crédito sob lock e só uma vence", async () => {
  const state = fakeDatabase(1);
  const results = await Promise.allSettled([
    reservarConsultaNfeIo(input),
    reservarConsultaNfeIo({ ...input, id: "request-two" }),
  ]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(state.budget()?.usadas).toBe(1);
  expect(state.entries().size).toBe(1);
  expect(state.locks[0]).toEqual({ table: nfeIoOrcamentos, mode: "update" });
});
it("replay após reserva já consumida não debita novamente", async () => {
  const state = fakeDatabase(1);
  await reservarConsultaNfeIo(input);
  expect(await reservarConsultaNfeIo(input)).toEqual({
    existente: true,
    resultado: null,
  });
  expect(state.budget()?.usadas).toBe(1);
  expect(state.entries().size).toBe(1);
});
it("mesmo identificador com outro tenant ou usuário é recusado", async () => {
  const state = fakeDatabase(3);
  await reservarConsultaNfeIo(input);
  for (const change of [
    { empresaId: 99 },
    { usuarioId: 99 },
    { notaFiscalId: 99 },
    { chaveHash: "b".repeat(64) },
  ])
    await expect(
      reservarConsultaNfeIo({ ...input, ...change })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(state.budget()?.usadas).toBe(1);
});
it("falha antes commit desfaz registro e débito para não declarar reserva durável", async () => {
  const state = fakeDatabase(1, true);
  await expect(reservarConsultaNfeIo(input)).rejects.toThrow(
    "synthetic rollback"
  );
  expect(state.budget()?.usadas).toBe(0);
  expect(state.entries().size).toBe(0);
});
it("saldo zero ou limite acima do teto operacional nunca reserva", async () => {
  for (const limit of [0, 21]) {
    const state = fakeDatabase(limit);
    await expect(reservarConsultaNfeIo(input)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(state.entries().size).toBe(0);
  }
});
