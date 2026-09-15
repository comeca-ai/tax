import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, inArray } from "drizzle-orm";
import { creditosApurados, despesas, empresas, logAuditoria, notasFiscais, usuarios } from "./schema";
import type { TrpcContext } from "../api/context";
import type { ResultadoVerificacaoFiscal } from "../contracts/fiscal";

const injected = vi.hoisted(() => ({ db: undefined as unknown, verificar: vi.fn(), falharLog: false }));
vi.mock("../api/queries/connection", () => ({ getDb: () => injected.db }));
vi.mock("../api/modules/fiscal/verificacao/service", async importOriginal => ({
  ...await importOriginal<typeof import("../api/modules/fiscal/verificacao/service")>(),
  verificarFiscalAntesDaDecisao: injected.verificar,
}));
vi.mock("../api/routers/_shared", async importOriginal => {
  const original = await importOriginal<typeof import("../api/routers/_shared")>();
  return {
    ...original,
    registrarLog: async (...args: Parameters<typeof original.registrarLog>) => {
      if (injected.falharLog && args[1].acao === "despesa.create") throw new Error("Falha de auditoria sintética");
      return original.registrarLog(...args);
    },
  };
});
import { despesasRouter } from "../api/routers/despesas";

const raw = process.env.POC_TEST_DATABASE_URL;
const target = raw ? new URL(raw) : null;
if (target && (target.protocol !== "mysql:" || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)
  || !/^\/reembolsa_poc_test_[a-zA-Z0-9_]+$/.test(target.pathname) || target.search || target.hash)) {
  throw new Error("Use banco local isolado reembolsa_poc_test_*");
}
const desativada: ResultadoVerificacaoFiscal = {
  estado: "desativada", solicitada: false, configuracaoVersao: 0,
  consultaId: null, modelo: null, verificadaEm: null,
};
let db: MySql2Database, pool: Pool, owner: number, empresa: number;
const notas: number[] = [];
const ctx = (): TrpcContext => ({
  req: new Request("http://localhost"), resHeaders: new Headers(),
  usuario: { id: owner, nome: "Fixture concorrência", email: "fixture@example.invalid", perfil: "cliente" },
});
const caller = () => despesasRouter.createCaller(ctx());
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
async function notaNova() {
  // A fixture entra no banco diretamente: este teste cobre criação e atomicidade,
  // não upload/OCR. Nenhuma chamada externa é necessária.
  const [row] = await db.insert(notasFiscais).values({
    empresaId: empresa, valor: 30, dataFatoGerador: "2026-09-14",
    cnpjEmitente: "14200166000166", categoriaSugerida: "alimentacao", origem: "manual",
  });
  notas.push(row.insertId);
  return { empresaId: empresa, notaFiscalId: row.insertId, categoria: "alimentacao" as const,
    valorNota: 100, dataFatoGerador: "2026-09-15", cnpjEmitente: "14200166000166" };
}

describe.skipIf(!target)("despesa SQL: criação concorrente e rollback dos campos confirmados", () => {
  beforeAll(async () => {
    pool = createPool(target!.href);
    const [actual] = await pool.query("SELECT DATABASE() AS nome");
    if ((actual as { nome: string }[])[0].nome !== target!.pathname.slice(1)) throw new Error("Banco divergente");
    db = drizzle(pool);
    injected.db = db;
    const [user] = await db.insert(usuarios).values({ nome: "Fixture concorrência", email: `${randomUUID()}@example.invalid`, senhaHash: "fixture-no-login", perfil: "cliente" });
    owner = user.insertId;
    const [company] = await db.insert(empresas).values({
      usuarioId: owner, razaoSocial: "Fixture concorrência", cnpj: "99887766000155",
      cnaePrincipal: "6201501", regimeTributario: "simples_nacional", uf: "SP",
    });
    empresa = company.insertId;
    // Qualquer caminho inesperado até a rede falha neste teste.
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede proibida nesta suíte SQL"); }));
  });
  beforeEach(() => {
    injected.falharLog = false;
    injected.verificar.mockReset().mockResolvedValue(desativada);
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    if (!db) return;
    try {
      if (empresa) {
        const rows = await db.select({ id: despesas.id }).from(despesas).where(eq(despesas.empresaId, empresa));
        if (rows.length) await db.delete(creditosApurados).where(inArray(creditosApurados.despesaId, rows.map(row => row.id)));
        await db.delete(logAuditoria).where(eq(logAuditoria.empresaId, empresa));
        await db.delete(despesas).where(eq(despesas.empresaId, empresa));
        if (notas.length) await db.delete(notasFiscais).where(inArray(notasFiscais.id, notas));
        await db.delete(empresas).where(eq(empresas.id, empresa));
      }
      if (owner) await db.delete(usuarios).where(eq(usuarios.id, owner));
    } finally { await pool.end(); }
  });

  it("create perdedora não sobrescreve valor/data/CNPJ da nota da vencedora", async () => {
    const first = await notaNova();
    const second = { ...first, valorNota: 200, dataFatoGerador: "2026-09-16", cnpjEmitente: "99887766000155" };
    const chegouPrimeira = gate(), chegouSegunda = gate(), liberarPrimeira = gate(), liberarSegunda = gate();
    injected.verificar.mockImplementation(async (_ctx, input: { valorNota: number }) => {
      if (input.valorNota === first.valorNota) {
        chegouPrimeira.resolve(); await liberarPrimeira.promise;
      } else {
        chegouSegunda.resolve(); await liberarSegunda.promise;
      }
      return desativada;
    });
    const vencedor = caller().create(first);
    const perdedor = caller().create(second);
    // Consome rejeições desde o início e libera barreiras inclusive em falhas.
    const resultados = Promise.allSettled([vencedor, perdedor]);
    try {
      await Promise.all([chegouPrimeira.promise, chegouSegunda.promise]);
      liberarPrimeira.resolve();
      await vencedor;
      liberarSegunda.resolve();
      const [a, b] = await resultados;
      expect(a.status).toBe("fulfilled");
      expect(b.status).toBe("rejected");
      if (b.status === "rejected") expect(b.reason).toMatchObject({ code: "CONFLICT" });
      const [nota] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, first.notaFiscalId));
      expect(nota).toMatchObject({ valor: first.valorNota, dataFatoGerador: first.dataFatoGerador, cnpjEmitente: first.cnpjEmitente });
      const rows = await db.select().from(despesas).where(and(eq(despesas.empresaId, empresa), eq(despesas.notaFiscalId, first.notaFiscalId)));
      expect(rows).toHaveLength(1);
      expect(rows[0].valorReembolsavel).toBe(first.valorNota);
    } finally {
      liberarPrimeira.resolve(); liberarSegunda.resolve();
      await resultados;
    }
  });

  it("falha de auditoria reverte nota e despesa; retry reutiliza a nota intacta", async () => {
    const input = await notaNova();
    injected.falharLog = true;
    await expect(caller().create(input)).rejects.toThrow("Falha de auditoria sintética");
    const [nota] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, input.notaFiscalId));
    expect(nota).toMatchObject({ valor: 30, dataFatoGerador: "2026-09-14" });
    expect(await db.select().from(despesas).where(eq(despesas.notaFiscalId, input.notaFiscalId))).toHaveLength(0);
    injected.falharLog = false;
    await expect(caller().create(input)).resolves.toMatchObject({ despesaId: expect.any(Number) });
    const [salva] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, input.notaFiscalId));
    expect(salva).toMatchObject({ valor: input.valorNota, dataFatoGerador: input.dataFatoGerador });
  });
});
