import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { eq, inArray } from "drizzle-orm";
import { empresas, logAuditoria, politicasReembolso, usuarios } from "./schema";
import { regrasPoliticaSchema } from "../contracts/types";
import type { TrpcContext } from "../api/context";
const injected = vi.hoisted(() => ({ db: undefined as unknown, afterAdmin: undefined as undefined | (() => Promise<void>), failLog: false, parser: vi.fn(), writeFile: vi.fn(), unlink: vi.fn() }));
vi.mock("../api/modules/reembolso/policy/parser", () => ({ getPolicyParser: () => ({ extract: injected.parser }) }));
vi.mock("node:fs/promises", async original => ({ ...await original<typeof import("node:fs/promises")>(), mkdir: vi.fn(), writeFile: injected.writeFile, unlink: injected.unlink }));
vi.mock("../api/queries/connection", () => ({ getDb: () => injected.db }));
vi.mock("../api/routers/_shared", async original => {
  const module = await original<typeof import("../api/routers/_shared")>();
  return { ...module,
    assertAdminDaEmpresa: async (...args: Parameters<typeof module.assertAdminDaEmpresa>) => { const result = await module.assertAdminDaEmpresa(...args); await injected.afterAdmin?.(); return result; },
    registrarLog: async (...args: Parameters<typeof module.registrarLog>) => { if (injected.failLog) throw new Error("Falha de log sintética"); return module.registrarLog(...args); },
  };
});
import { politicaRouter } from "../api/routers/politica";
import { assertAdminDaEmpresa, assertAdminDaEmpresaBloqueado } from "../api/routers/_shared";
const target = process.env.POC_TEST_DATABASE_URL ? new URL(process.env.POC_TEST_DATABASE_URL) : null;
if (target && (target.protocol !== "mysql:" || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || !/^\/reembolsa_poc_test_[a-zA-Z0-9_]+$/.test(target.pathname) || target.search || target.hash)) throw new Error("Banco de teste inválido");
let db: MySql2Database, pool: Pool, owner: number, outro: number, empresa: number;
const ids: number[] = [];
const regras = (label: string) => regrasPoliticaSchema.parse({ observacoes: [label] });
const ctx = (): TrpcContext => ({ req: new Request("http://localhost"), resHeaders: new Headers(), usuario: { id: owner, nome: "Fixture", email: "fixture@example.invalid", perfil: "cliente" } });
const caller = () => politicaRouter.createCaller(ctx());
async function nova() { const [r] = await db.insert(politicasReembolso).values({ empresaId: empresa, arquivoNome: "fixture.txt", regras: regras("original"), status: "rascunho", versao: 0, createdById: owner }); ids.push(r.insertId); return r.insertId; }
function gate() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }

describe.skipIf(!target)("política SQL: edição, ativação e auditoria atômicas", () => {
  beforeAll(async () => {
    pool = createPool(target!.href);
    const [actual] = await pool.query("SELECT DATABASE() AS nome");
    if ((actual as { nome: string }[])[0].nome !== target!.pathname.slice(1)) throw new Error("Banco divergente");
    db = drizzle(pool); injected.db = db;
    const [u] = await db.insert(usuarios).values({ nome: "Fixture", email: `${randomUUID()}@example.invalid`, senhaHash: "fixture-sem-login", perfil: "cliente" }); owner = u.insertId;
    const [o] = await db.insert(usuarios).values({ nome: "Outro", email: `${randomUUID()}@example.invalid`, senhaHash: "fixture-sem-login", perfil: "cliente" }); outro = o.insertId;
    const [e] = await db.insert(empresas).values({ usuarioId: owner, razaoSocial: "Fixture política", cnpj: "99887766000155", cnaePrincipal: "6201501", regimeTributario: "simples_nacional", uf: "SP" }); empresa = e.insertId;
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede proibida"); }));
  });
  beforeEach(() => { injected.afterAdmin = undefined; injected.failLog = false; injected.parser.mockReset(); injected.writeFile.mockReset(); injected.unlink.mockReset(); });
  afterAll(async () => {
    vi.unstubAllGlobals();
    try { if (db && empresa) {
      await db.delete(logAuditoria).where(eq(logAuditoria.empresaId, empresa));
      if (ids.length) await db.delete(politicasReembolso).where(inArray(politicasReembolso.id, ids));
      await db.delete(empresas).where(eq(empresas.id, empresa));
      await db.delete(usuarios).where(inArray(usuarios.id, [owner, outro]));
    } } finally { await pool?.end(); }
  });
  it("edição atrasada não altera política ativada após sua leitura inicial", async () => {
    const id = await nova(), checked = gate(), release = gate();
    injected.afterAdmin = async () => { checked.resolve(); await release.promise; };
    const pending = caller().updateRegras({ id, regras: regras("edição atrasada") });
    void pending.catch(() => undefined);
    try {
      await checked.promise; injected.afterAdmin = undefined;
      const activation = await caller().ativar({ id }); release.resolve();
      await expect(pending).rejects.toMatchObject({ code: "CONFLICT" });
      const [row] = await db.select().from(politicasReembolso).where(eq(politicasReembolso.id, id));
      expect(row.status).toBe("ativa"); expect(row.versao).toBe(activation.versao);
      expect(regrasPoliticaSchema.parse(row.regras).observacoes).toEqual(["original"]);
    } finally { release.resolve(); await pending.catch(() => undefined); }
  });
  it("ativação usa edição concluída depois da leitura inicial, sem restaurar JSON antigo", async () => {
    const id = await nova(), checked = gate(), release = gate();
    injected.afterAdmin = async () => { checked.resolve(); await release.promise; };
    const pending = caller().ativar({ id }); void pending.catch(() => undefined);
    try {
      await checked.promise; injected.afterAdmin = undefined;
      const updated = regrasPoliticaSchema.parse({ regrasExtraidas: [{ id: "nova", descricao: "Nova regra validada", tema: "alimentacao", categoria: "alimentacao", escopo: "categoria", valorLimite: 75, decisaoAutomatica: "aprovar" }] });
      await caller().updateRegras({ id, regras: updated }); release.resolve();
      await pending;
      const [row] = await db.select().from(politicasReembolso).where(eq(politicasReembolso.id, id));
      expect(regrasPoliticaSchema.parse(row.regras).regrasExtraidas[0].id).toBe("nova");
      expect(regrasPoliticaSchema.parse(row.regras).aprovacaoAutomaticaPorCategoria.alimentacao).toBe(75);
    } finally { release.resolve(); await pending.catch(() => undefined); }
  });
  it("duas ativações simultâneas deixam só uma ativa e versões distintas", async () => {
    const a = await nova(), b = await nova();
    const results = await Promise.all([caller().ativar({ id: a }), caller().ativar({ id: b })]);
    expect(new Set(results.map(r => r.versao)).size).toBe(2);
    const rows = await db.select().from(politicasReembolso).where(eq(politicasReembolso.empresaId, empresa));
    expect(rows.filter(row => row.status === "ativa")).toHaveLength(1);
  });
  it("falha de auditoria reverte ativação e mantém a política anterior ativa", async () => {
    const a = await nova(), b = await nova(); await caller().ativar({ id: a });
    injected.failLog = true;
    await expect(caller().ativar({ id: b })).rejects.toThrow("Falha de log sintética");
    const rows = await db.select().from(politicasReembolso).where(inArray(politicasReembolso.id, [a, b]));
    expect(rows.find(row => row.id === a)?.status).toBe("ativa");
    expect(rows.find(row => row.id === b)?.status).toBe("rascunho");
  });
  it.each([
    ["updateRegras", "perfil"], ["ativar", "perfil"], ["desativar", "perfil"],
    ["updateRegras", "dono"], ["ativar", "dono"], ["desativar", "dono"],
  ] as const)("%s rejeita revogação de %s após autorização inicial", async (operacao, revogacao) => {
    const id = await nova();
    if (operacao === "desativar") await caller().ativar({ id });
    const antes = await db.select().from(politicasReembolso).where(eq(politicasReembolso.empresaId, empresa));
    const logs = await db.select().from(logAuditoria).where(eq(logAuditoria.empresaId, empresa));
    if (revogacao === "perfil") {
      await db.update(usuarios).set({ perfil: "admin" }).where(eq(usuarios.id, owner));
      await db.update(empresas).set({ usuarioId: outro }).where(eq(empresas.id, empresa));
    }
    injected.afterAdmin = async () => {
      if (revogacao === "perfil") await db.update(usuarios).set({ perfil: "cliente" }).where(eq(usuarios.id, owner));
      else await db.update(empresas).set({ usuarioId: outro }).where(eq(empresas.id, empresa));
    };
    try {
      const atual = politicaRouter.createCaller({ ...ctx(), usuario: { ...ctx().usuario!, perfil: revogacao === "perfil" ? "admin" : "cliente" } });
      const pending = operacao === "updateRegras" ? atual.updateRegras({ id, regras: regras("sem autoridade") }) : atual[operacao]({ id });
      await expect(pending).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await db.select().from(politicasReembolso).where(eq(politicasReembolso.empresaId, empresa))).toEqual(antes);
      expect(await db.select().from(logAuditoria).where(eq(logAuditoria.empresaId, empresa))).toEqual(logs);
    } finally {
      injected.afterAdmin = undefined;
      await db.update(empresas).set({ usuarioId: owner }).where(eq(empresas.id, empresa));
      await db.update(usuarios).set({ perfil: "cliente" }).where(eq(usuarios.id, owner));
    }
  });
  it("perfil de revisor não concede administração e contexto admin antigo não a restaura", async () => {
    await db.update(usuarios).set({ perfil: "revisor" }).where(eq(usuarios.id, outro));
    const antigo: TrpcContext = { ...ctx(), usuario: { ...ctx().usuario!, id: outro, perfil: "admin" } };
    try {
      await expect(assertAdminDaEmpresa(antigo, empresa)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(db.transaction(tx => assertAdminDaEmpresaBloqueado(antigo, empresa, tx))).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await db.update(usuarios).set({ perfil: "cliente" }).where(eq(usuarios.id, outro));
    }
  });
  it.each(["upload", "duplicar"] as const)("%s revalida autoridade antes de criar rascunho", async operacao => {
    const id = await nova();
    const antes = await db.select().from(politicasReembolso).where(eq(politicasReembolso.empresaId, empresa));
    const logs = await db.select().from(logAuditoria).where(eq(logAuditoria.empresaId, empresa));
    const revogar = () => db.update(empresas).set({ usuarioId: outro }).where(eq(empresas.id, empresa));
    injected.parser.mockImplementation(async () => {
      await revogar();
      return { textoExtraido: "fixture", regras: regras("extraída"), confiancaExtracao: "alta", camposPendentes: [], provedor: "fixture-sem-rede" };
    });
    if (operacao === "duplicar") injected.afterAdmin = async () => { await revogar(); };
    try {
      const pending = operacao === "upload" ? caller().upload({ empresaId: empresa, arquivoNome: "fixture.txt", arquivoMime: "text/plain", arquivoBase64: "dGVzdGU=" }) : caller().duplicar({ id });
      await expect(pending).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await db.select().from(politicasReembolso).where(eq(politicasReembolso.empresaId, empresa))).toEqual(antes);
      expect(await db.select().from(logAuditoria).where(eq(logAuditoria.empresaId, empresa))).toEqual(logs);
      expect(injected.writeFile).not.toHaveBeenCalled();
    } finally {
      injected.afterAdmin = undefined;
      await db.update(empresas).set({ usuarioId: owner }).where(eq(empresas.id, empresa));
    }
  });
  it.each(["upload", "duplicar"] as const)("%s reverte criação quando auditoria falha", async operacao => {
    const id = await nova();
    const antes = await db.select().from(politicasReembolso).where(eq(politicasReembolso.empresaId, empresa));
    const logs = await db.select().from(logAuditoria).where(eq(logAuditoria.empresaId, empresa));
    injected.parser.mockResolvedValue({ textoExtraido: "fixture", regras: regras("extraída"), confiancaExtracao: "alta", camposPendentes: [], provedor: "fixture-sem-rede" });
    injected.failLog = true;
    const pending = operacao === "upload" ? caller().upload({ empresaId: empresa, arquivoNome: "fixture.txt", arquivoMime: "text/plain", arquivoBase64: "dGVzdGU=" }) : caller().duplicar({ id });
    await expect(pending).rejects.toThrow("Falha de log sintética");
    expect(await db.select().from(politicasReembolso).where(eq(politicasReembolso.empresaId, empresa))).toEqual(antes);
    expect(await db.select().from(logAuditoria).where(eq(logAuditoria.empresaId, empresa))).toEqual(logs);
    if (operacao === "upload") {
      expect(injected.writeFile).toHaveBeenCalledTimes(1);
      expect(injected.unlink).toHaveBeenCalledTimes(1);
    }
  });
  it("upload remove escrita parcial e não cria rascunho sem arquivo", async () => {
    const antes = await db.select().from(politicasReembolso).where(eq(politicasReembolso.empresaId, empresa));
    const logs = await db.select().from(logAuditoria).where(eq(logAuditoria.empresaId, empresa));
    injected.parser.mockResolvedValue({ textoExtraido: "fixture", regras: regras("extraída"), confiancaExtracao: "alta", camposPendentes: [], provedor: "fixture-sem-rede" });
    injected.writeFile.mockRejectedValueOnce(new Error("Falha parcial sintética"));
    injected.unlink.mockResolvedValueOnce(undefined);
    await expect(caller().upload({ empresaId: empresa, arquivoNome: "fixture.txt", arquivoMime: "text/plain", arquivoBase64: "dGVzdGU=" })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Não foi possível armazenar o documento da política.",
    });
    expect(await db.select().from(politicasReembolso).where(eq(politicasReembolso.empresaId, empresa))).toEqual(antes);
    expect(await db.select().from(logAuditoria).where(eq(logAuditoria.empresaId, empresa))).toEqual(logs);
    expect(injected.unlink).toHaveBeenCalledTimes(1);
  });
  it.each(["upload", "duplicar"] as const)("%s autorizado cria rascunho com autoria e log", async operacao => {
    const id = await nova();
    injected.parser.mockResolvedValue({ textoExtraido: "fixture", regras: regras("extraída"), confiancaExtracao: "alta", camposPendentes: [], provedor: "fixture-sem-rede" });
    const result = operacao === "upload" ? await caller().upload({ empresaId: empresa, arquivoNome: "fixture.txt", arquivoMime: "text/plain", arquivoBase64: "dGVzdGU=" }) : await caller().duplicar({ id });
    ids.push(result.politicaId);
    const [row] = await db.select().from(politicasReembolso).where(eq(politicasReembolso.id, result.politicaId));
    expect(row).toMatchObject({ empresaId: empresa, status: "rascunho", createdById: owner });
    const logs = await db.select().from(logAuditoria).where(eq(logAuditoria.empresaId, empresa));
    expect(logs.some(log => log.acao === `politica.${operacao}` && log.entidadeId === row.id && log.usuarioId === owner)).toBe(true);
  });
});
