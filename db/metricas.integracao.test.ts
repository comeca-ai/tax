import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { eq, inArray } from "drizzle-orm";
import * as schema from "./schema";
import { pocPagamentos } from "./pocSchema";
import { metricasPocRouter } from "../api/routers/metricasPoc";
import { campoRouter } from "../api/routers/campo";
const injected = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("../api/queries/connection", () => ({
  getDb: () => {
    if (!injected.db) throw new Error("Banco isolado não inicializado");
    return injected.db;
  },
}));
const raw = process.env.POC_TEST_DATABASE_URL;
const target = raw ? new URL(raw) : null;
if (
  target &&
  (target.protocol !== "mysql:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    !/^\/reembolsa_poc_test_[a-zA-Z0-9_]+$/.test(target.pathname) ||
    target.search ||
    target.hash)
)
  throw new Error("Exige banco local reembolsa_poc_test_* isolado.");
let pool: Pool, db: MySql2Database;
const users: number[] = [],
  empresas: number[] = [],
  notas: number[] = [],
  despesas: number[] = [];
const ctx = (id: number, perfil: "cliente" | "admin" = "cliente") => ({
  req: new Request("http://localhost/test"),
  resHeaders: new Headers(),
  usuario: {
    id,
    nome: "Auditor sintético",
    email: "fixture@example.invalid",
    perfil,
  },
});
const filtro = () => ({
  empresaId: empresas[0],
  inicio: "2026-09-01T00:00:00Z",
  fim: "2026-09-02T00:00:00Z",
});
const amostra = () => ({
  empresaId: empresas[0],
  despesaId: despesas[0],
  conjunto: "conjunto-sintetico",
  campo: "manipulacao",
  previsto: true,
  observado: false,
  evidencia: "Evidência sintética para integração SQL.",
});
describe.skipIf(!target)("Métricas POC — SQL/API isolada", () => {
  beforeAll(async () => {
    pool = createPool({ uri: raw!, timezone: "Z" });
    const [names] = await pool.query("SELECT DATABASE() AS nome");
    if ((names as { nome: string }[])[0]?.nome !== target!.pathname.slice(1))
      throw new Error("Banco efetivo não autorizado");
    db = drizzle(pool);
    injected.db = db;
    for (let i = 0; i < 2; i++) {
      const [u] = await db.insert(schema.usuarios).values({
        email: `${randomUUID()}@example.invalid`,
        nome: "Fixture métricas",
        senhaHash: "fixture-sem-login",
        perfil: "cliente",
      });
      users.push(u.insertId);
      const [e] = await db.insert(schema.empresas).values({
        usuarioId: u.insertId,
        cnpj: "12345678000123",
        razaoSocial: "Fixture métricas",
        cnaePrincipal: "1234567",
        regimeTributario: "simples_nacional",
        uf: "SP",
      });
      empresas.push(e.insertId);
      const [n] = await db
        .insert(schema.notasFiscais)
        .values({ empresaId: e.insertId, arquivoNome: "sintetico.txt" });
      notas.push(n.insertId);
      const [d] = await db.insert(schema.despesas).values({
        empresaId: e.insertId,
        notaFiscalId: n.insertId,
        status: "aprovada",
        createdAt: new Date("2026-09-01T01:00:00Z"),
      });
      despesas.push(d.insertId);
    }
  });
  afterAll(async () => {
    try {
      if (!db) return;
      if (despesas.length)
        await db
          .delete(pocPagamentos)
          .where(inArray(pocPagamentos.despesaId, despesas));
      if (empresas.length)
        await db
          .delete(schema.logAuditoria)
          .where(inArray(schema.logAuditoria.empresaId, empresas));
      if (despesas.length)
        await db
          .delete(schema.despesas)
          .where(inArray(schema.despesas.id, despesas));
      if (notas.length)
        await db
          .delete(schema.notasFiscais)
          .where(inArray(schema.notasFiscais.id, notas));
      if (empresas.length)
        await db
          .delete(schema.empresas)
          .where(inArray(schema.empresas.id, empresas));
      if (users.length)
        await db
          .delete(schema.usuarios)
          .where(inArray(schema.usuarios.id, users));
    } finally {
      await pool?.end();
    }
  });
  it("filtra tenant/período e impede sessão admin revogada", async () => {
    const caller = metricasPocRouter.createCaller(ctx(users[0]));
    expect((await caller.resumo(filtro())).denominadorDespesas).toBe(1);
    expect(
      (
        await caller.resumo({
          ...filtro(),
          inicio: "2026-09-02T00:00:00Z",
          fim: "2026-09-03T00:00:00Z",
        })
      ).denominadorDespesas
    ).toBe(0);
    const revoked = metricasPocRouter.createCaller(ctx(users[1], "admin"));
    await expect(revoked.resumo(filtro())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(revoked.auditarAmostra(amostra())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("preserva valor/status e histórico com autor; última amostra compõe matriz", async () => {
    const caller = metricasPocRouter.createCaller(ctx(users[0]));
    const [before] = await db
      .select()
      .from(schema.despesas)
      .where(eq(schema.despesas.id, despesas[0]));
    await caller.auditarAmostra(amostra());
    await caller.auditarAmostra({ ...amostra(), observado: true });
    const [after] = await db
      .select()
      .from(schema.despesas)
      .where(eq(schema.despesas.id, despesas[0]));
    expect(after).toEqual(before);
    const logs = await db
      .select()
      .from(schema.logAuditoria)
      .where(eq(schema.logAuditoria.empresaId, empresas[0]));
    expect(logs.filter(l => l.acao === "poc.auditoria_amostral")).toHaveLength(
      2
    );
    expect(logs.every(l => l.usuarioId === users[0])).toBe(true);
    expect((await caller.resumo(filtro())).amostras[0]).toMatchObject({
      denominador: 1,
      verdadeirosPositivos: 1,
    });
  });
  it("pagamento exige empresa correta e gera tempo rastreável sem PIX", async () => {
    const caller = campoRouter.createCaller(ctx(users[0]));
    const input = {
      empresaId: empresas[0],
      despesaId: despesas[0],
      referencia: "fixture-pagamento",
      pagoEm: "2026-09-01T03:00:00Z",
    };
    await expect(
      caller.registrarPagamento({ ...input, empresaId: empresas[1] })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await caller.registrarPagamento(input);
    await caller.registrarPagamento(input);
    const r = await metricasPocRouter
      .createCaller(ctx(users[0]))
      .resumo(filtro());
    expect(r.criacaoAtePagamento).toMatchObject({
      mediaMs: 7200000,
      denominador: 1,
    });
    expect(r.pagamentosManuais).toBe(1);
  });
});
