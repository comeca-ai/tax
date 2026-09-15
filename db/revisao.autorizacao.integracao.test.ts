import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { eq, inArray } from "drizzle-orm";
import { colaboradores, despesas, empresas, empresasConfig, logAuditoria, notasFiscais, usuarios } from "./schema";
import type { TrpcContext } from "../api/context";
const injected = vi.hoisted(() => ({ db: undefined as unknown, afterAuthorization: undefined as undefined | (() => Promise<void>) }));
vi.mock("../api/queries/connection", () => ({ getDb: () => injected.db }));
vi.mock("../api/routers/_shared", async original => {
  const module = await original<typeof import("../api/routers/_shared")>();
  return { ...module, papelRevisaoNaEmpresa: async (...args: Parameters<typeof module.papelRevisaoNaEmpresa>) => {
    const papel = await module.papelRevisaoNaEmpresa(...args);
    await injected.afterAuthorization?.();
    return papel;
  } };
});
vi.mock("../api/modules/reembolso/revisao/notificacaoWhatsapp", () => ({ notificarDecisaoWhatsapp: vi.fn() }));
import { revisaoRouter } from "../api/routers/revisao";
const target = process.env.POC_TEST_DATABASE_URL ? new URL(process.env.POC_TEST_DATABASE_URL) : null;
if (target && (target.protocol !== "mysql:" || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || !/^\/reembolsa_poc_test_[a-zA-Z0-9_]+$/.test(target.pathname) || target.search || target.hash)) throw new Error("Banco de teste inválido");
let db: MySql2Database, pool: Pool, empresa: number, owner: number, actor: number, pessoa: number, substituto: number, nota: number, despesa: number;
let perfil: "admin" | "cliente" = "cliente";
const ctx = (): TrpcContext => ({ req: new Request("http://localhost"), resHeaders: new Headers(), usuario: { id: actor, nome: "Revisor sintético", email: "fixture@example.invalid", perfil } });
const input = () => ({ empresaId: empresa, despesaId: despesa, decisao: "aprovar" as const, justificativa: "Revisão sintética de autorização concorrente" });
function gate() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }

describe.skipIf(!target)("revisão SQL revalida autoridade após pré-checagem", () => {
  beforeAll(async () => {
    pool = createPool(target!.href);
    const [actual] = await pool.query("SELECT DATABASE() AS nome");
    if ((actual as { nome: string }[])[0].nome !== target!.pathname.slice(1)) throw new Error("Banco divergente");
    db = drizzle(pool); injected.db = db;
    const user = async () => { const [row] = await db.insert(usuarios).values({ nome: "Fixture", email: `${randomUUID()}@example.invalid`, senhaHash: "fixture-sem-login", perfil: "cliente" }); return row.insertId; };
    owner = await user(); actor = await user();
    const [e] = await db.insert(empresas).values({ usuarioId: owner, razaoSocial: "Fixture autorização", cnpj: "99887766000155", cnaePrincipal: "6201501", regimeTributario: "simples_nacional", uf: "SP" }); empresa = e.insertId;
    const [p] = await db.insert(colaboradores).values({ empresaId: empresa, usuarioId: actor, nome: "Revisor", statusVinculo: "ativo" }); pessoa = p.insertId;
    const [s] = await db.insert(colaboradores).values({ empresaId: empresa, nome: "Substituto", statusVinculo: "ativo" }); substituto = s.insertId;
    await db.insert(empresasConfig).values({ empresaId: empresa, aprovadorId: pessoa });
    const [n] = await db.insert(notasFiscais).values({ empresaId: empresa, origem: "manual" }); nota = n.insertId;
    const [d] = await db.insert(despesas).values({ empresaId: empresa, notaFiscalId: nota, status: "em_revisao", confianca: "alta" }); despesa = d.insertId;
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede proibida"); }));
  });
  beforeEach(async () => {
    injected.afterAuthorization = undefined; perfil = "cliente";
    await db.update(usuarios).set({ perfil: "cliente" }).where(eq(usuarios.id, actor));
    await db.update(colaboradores).set({ statusVinculo: "ativo" }).where(eq(colaboradores.id, pessoa));
    await db.update(empresasConfig).set({ aprovadorId: pessoa, analistaId: null }).where(eq(empresasConfig.empresaId, empresa));
    await db.update(despesas).set({ status: "em_revisao" }).where(eq(despesas.id, despesa));
    await db.delete(logAuditoria).where(eq(logAuditoria.empresaId, empresa));
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    try { if (db && empresa) {
      await db.delete(logAuditoria).where(eq(logAuditoria.empresaId, empresa));
      await db.delete(despesas).where(eq(despesas.id, despesa));
      await db.delete(notasFiscais).where(eq(notasFiscais.id, nota));
      await db.delete(empresasConfig).where(eq(empresasConfig.empresaId, empresa));
      await db.delete(colaboradores).where(eq(colaboradores.empresaId, empresa));
      await db.delete(empresas).where(eq(empresas.id, empresa));
      await db.delete(usuarios).where(inArray(usuarios.id, [owner, actor]));
    } } finally { await pool?.end(); }
  });
  it.each(["desligamento", "troca-aprovador", "perfil-global"])("barra decisão depois de %s confirmado", async scenario => {
    if (scenario === "perfil-global") {
      perfil = "admin";
      await db.update(usuarios).set({ perfil: "admin" }).where(eq(usuarios.id, actor));
      await db.update(empresasConfig).set({ aprovadorId: null }).where(eq(empresasConfig.empresaId, empresa));
    }
    const checked = gate(), release = gate();
    injected.afterAuthorization = async () => { checked.resolve(); await release.promise; };
    const pending = revisaoRouter.createCaller(ctx()).decidir(input());
    void pending.catch(() => undefined);
    try {
      await checked.promise;
      if (scenario === "desligamento") await db.update(colaboradores).set({ statusVinculo: "desligado" }).where(eq(colaboradores.id, pessoa));
      if (scenario === "troca-aprovador") await db.update(empresasConfig).set({ aprovadorId: substituto }).where(eq(empresasConfig.empresaId, empresa));
      if (scenario === "perfil-global") await db.update(usuarios).set({ perfil: "cliente" }).where(eq(usuarios.id, actor));
      release.resolve();
      await expect(pending).rejects.toMatchObject({ code: "FORBIDDEN" });
      const [atual] = await db.select().from(despesas).where(eq(despesas.id, despesa));
      expect(atual.status).toBe("em_revisao");
      expect(await db.select().from(logAuditoria).where(eq(logAuditoria.empresaId, empresa))).toHaveLength(0);
    } finally { release.resolve(); await pending.catch(() => undefined); }
  });
  it("aprovação vigente continua funcionando e registra autoria", async () => {
    await expect(revisaoRouter.createCaller(ctx()).decidir(input())).resolves.toMatchObject({ status: "aprovada" });
    const logs = await db.select().from(logAuditoria).where(eq(logAuditoria.empresaId, empresa));
    expect(logs.some(log => log.acao === "despesa.decisao" && log.usuarioId === actor)).toBe(true);
  });
});
