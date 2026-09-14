import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, describe, vi } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { eq, inArray } from "drizzle-orm";
import { colaboradores, empresas, usuarios, logAuditoria } from "./schema";
import { equipeLotes } from "./equipeSchema";
const injected = vi.hoisted(() => ({
  db: undefined as unknown,
  invite: vi.fn(),
}));
vi.mock("../api/queries/connection", () => ({ getDb: () => injected.db }));
vi.mock("../api/modules/reembolso/convites/servico", () => ({
  enviarConviteColaboradorIdempotente: injected.invite,
}));
import { colaboradoresRouter } from "../api/routers/colaboradores";
import { equipeLoteRouter } from "../api/routers/equipeLote";
const raw = process.env.POC_TEST_DATABASE_URL,
  target = raw ? new URL(raw) : null;
if (
  target &&
  (target.protocol !== "mysql:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
    !/^\/reembolsa_poc_test_[a-zA-Z0-9_]+$/.test(target.pathname) ||
    target.search ||
    target.hash)
)
  throw new Error("Use banco local isolado");
let pool: Pool,
  db: MySql2Database,
  user: number,
  empresa: number,
  other: number,
  personB: number;
const run = randomUUID();
const header =
  "nome;email;telefone;matricula;vinculo;superiorMatricula;equipe\n";
const csv =
  header +
  "Pessoa Chefe;chefe@example.invalid;+5511998888801;A;CLT;;interna\nPessoa Equipe;equipe@example.invalid;+5511998888802;B;MEI;A;externa";
const caller = () =>
  equipeLoteRouter.createCaller({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    usuario: {
      id: user,
      nome: "Fixture",
      email: "fixture@example.invalid",
      perfil: "cliente",
    },
  });
describe.skipIf(!target)("E5 SQL e API — lote e isolamento", () => {
  beforeAll(async () => {
    pool = createPool(target!.href);
    const [rows] = await pool.query("SELECT DATABASE() AS nome");
    if ((rows as { nome: string }[])[0].nome !== target!.pathname.slice(1))
      throw new Error("Banco divergente");
    db = drizzle(pool);
    injected.db = db;
    const [u] = await db.insert(usuarios).values({
      nome: "Fixture Lote",
      email: `${run}@example.invalid`,
      senhaHash: "fixture-sem-login",
      perfil: "cliente",
    });
    user = u.insertId;
    const base = {
      usuarioId: user,
      razaoSocial: "Fixture Lote",
      cnaePrincipal: "6201501",
      regimeTributario: "simples_nacional" as const,
      uf: "SP",
    };
    const [a] = await db.insert(empresas).values({
      ...base,
      cnpj: run.replace(/\D/g, "").padEnd(14, "0").slice(0, 14),
    });
    empresa = a.insertId;
    const [b] = await db.insert(empresas).values({
      ...base,
      cnpj: run.replace(/\D/g, "").padEnd(14, "1").slice(0, 13) + "2",
    });
    other = b.insertId;
    const [p] = await db
      .insert(colaboradores)
      .values({ empresaId: other, nome: "Pessoa Outra", matricula: "OUTRA" });
    personB = p.insertId;
  });
  afterAll(async () => {
    if (!db) return;
    const ids = [empresa, other].filter(Boolean);
    if (ids.length) {
      await db.delete(logAuditoria).where(inArray(logAuditoria.empresaId, ids));
      await db.delete(equipeLotes).where(inArray(equipeLotes.empresaId, ids));
      await db
        .update(colaboradores)
        .set({ superiorDiretoId: null })
        .where(inArray(colaboradores.empresaId, ids));
      await db
        .delete(colaboradores)
        .where(inArray(colaboradores.empresaId, ids));
      await db.delete(empresas).where(inArray(empresas.id, ids));
    }
    if (user) await db.delete(usuarios).where(eq(usuarios.id, user));
    await pool?.end();
  });
  it("novo cadastro fora do domínio é recusado no servidor sem gravar", async () => {
    const c = colaboradoresRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      usuario: {
        id: user,
        nome: "Fixture",
        email: "fixture@example.invalid",
        perfil: "cliente",
      },
    });
    await expect(
      c.criar({
        empresaId: empresa,
        nome: "Pessoa externa",
        email: "pessoa@outro.invalid",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await db
        .select()
        .from(colaboradores)
        .where(eq(colaboradores.empresaId, empresa))
    ).toHaveLength(0);
    expect(injected.invite).not.toHaveBeenCalled();
  });
  it("revalida o domínio ao confirmar uma prévia antiga", async () => {
    const previa = await caller().previa({ empresaId: empresa, csv });
    expect(previa.token).toBeTruthy();
    try {
      await db
        .update(usuarios)
        .set({ email: `${run}@novo.invalid` })
        .where(eq(usuarios.id, user));
      await expect(
        caller().confirmar({
          empresaId: empresa,
          csv,
          token: previa.token!,
          confirmacao: true,
          enviarConvites: true,
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(
        await db
          .select()
          .from(colaboradores)
          .where(eq(colaboradores.empresaId, empresa))
      ).toHaveLength(0);
      expect(injected.invite).not.toHaveBeenCalled();
    } finally {
      await db
        .update(usuarios)
        .set({ email: `${run}@example.invalid` })
        .where(eq(usuarios.id, user));
    }
  });
  it("planilha inválida não grava nem convida", async () => {
    const r = await caller().previa({
      empresaId: empresa,
      csv: csv.replace("+5511998888802", "119"),
    });
    expect(r.erros).not.toHaveLength(0);
    expect(
      await db
        .select()
        .from(colaboradores)
        .where(eq(colaboradores.empresaId, empresa))
    ).toHaveLength(0);
    expect(injected.invite).not.toHaveBeenCalled();
  });
  it("confirma transação, vínculo, superior e repetição sem duplicar", async () => {
    const r = await caller().previa({ empresaId: empresa, csv });
    const input = {
      empresaId: empresa,
      csv,
      token: r.token!,
      confirmacao: true as const,
      enviarConvites: false,
    };
    const out = await caller().confirmar(input);
    const replay = await caller().confirmar(input);
    expect(replay.id).toBe(out.id);
    expect(replay.idempotente).toBe(true);
    const rows = await db
      .select()
      .from(colaboradores)
      .where(eq(colaboradores.empresaId, empresa));
    expect(rows).toHaveLength(2);
    const a = rows.find(p => p.matricula === "A")!,
      b = rows.find(p => p.matricula === "B")!;
    expect(b.tipoVinculo).toBe("MEI");
    expect(b.superiorDiretoId).toBe(a.id);
    expect(injected.invite).not.toHaveBeenCalled();
  });
  it("FK composta bloqueia superior de outra empresa", async () => {
    const [p] = await db
      .select()
      .from(colaboradores)
      .where(eq(colaboradores.empresaId, empresa));
    await expect(
      db
        .update(colaboradores)
        .set({ superiorDiretoId: personB })
        .where(eq(colaboradores.id, p.id))
    ).rejects.toThrow();
  });
  it("API rejeita superior externo antes de gravar", async () => {
    const c =
      header +
      "Outra Pessoa;outra@example.invalid;+5511998888803;C;PJ;OUTRA;externa";
    const r = await caller().previa({ empresaId: empresa, csv: c });
    expect(r.erros.some(e => e.campo === "superiorMatricula")).toBe(true);
    expect(r.token).toBeNull();
  });
});
