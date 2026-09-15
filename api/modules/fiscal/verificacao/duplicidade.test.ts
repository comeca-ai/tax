import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
import { despesas, notasFiscais } from "../../../../db/schema";
import { assertNotaSemDespesa } from "./duplicidade";

const dialect = new MySqlDialect();
function bancoSimulado() {
  let expense: { empresaId: number; notaFiscalId: number } | null = null;
  let previous = Promise.resolve();
  const empresaDaNota = 42;
  return {
    expense: () => expense,
    criar: async (empresaId: number, falhar = false) => {
      let release: (() => void) | undefined;
      let locked = false;
      const tx = {
        select: () => ({ from: (table: unknown) => ({ where: (condition: SQL) => {
          const params = dialect.sqlToQuery(condition).params;
          expect(params).toEqual([empresaId, 23]);
          const query = { limit: () => query, for: async (mode: string) => {
            expect(mode).toBe("update");
            if (table === notasFiscais) {
              if (empresaId !== empresaDaNota) return [];
              const current = previous;
              previous = new Promise<void>(resolve => { release = resolve; });
              await current;
              locked = true;
              return [{ id: 23 }];
            }
            expect(table).toBe(despesas);
            expect(locked).toBe(true);
            return expense ? [{ id: 17 }] : [];
          } };
          return query;
        } }) }),
      };
      try {
        await assertNotaSemDespesa(tx as unknown as Parameters<typeof assertNotaSemDespesa>[0], { empresaId, notaFiscalId: 23 });
        if (falhar) throw new Error("insert falhou");
        expense = { empresaId, notaFiscalId: 23 };
        return expense;
      } finally { release?.(); }
    },
  };
}

describe("reserva transacional da nota antes da despesa", () => {
  it("duas criações concorrentes da mesma nota só persistem uma despesa", async () => {
    const db = bancoSimulado();
    const results = await Promise.allSettled([db.criar(42), db.criar(42)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(r => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({ code: "CONFLICT" });
    expect(db.expense()).toEqual({ empresaId: 42, notaFiscalId: 23 });
  });
  it("nota de outra empresa não é reservada e não revela despesa", async () => {
    const db = bancoSimulado();
    await expect(db.criar(99)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.expense()).toBeNull();
  });
  it("falha antes do insert libera reserva para uma nova tentativa", async () => {
    const db = bancoSimulado();
    await expect(db.criar(42, true)).rejects.toThrow("insert falhou");
    expect(db.expense()).toBeNull();
    await expect(db.criar(42)).resolves.toEqual({ empresaId: 42, notaFiscalId: 23 });
  });
});
