import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../../../../db/schema";
import { enviarConviteColaboradorIdempotente } from "./servico";
import type { getDb } from "../../../queries/connection";

const value = process.env.POC_TEST_DATABASE_URL;
let target: URL | null = null;
if (value) {
  try { target = new URL(value); } catch { throw new Error("POC_TEST_DATABASE_URL inválida."); }
  if (target.protocol !== "mysql:" || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || !/^\/reembolsa_poc_test_[a-zA-Z0-9_]+$/.test(target.pathname) || target.search || target.hash) throw new Error("Convites SQL exigem banco reembolsa_poc_test_* dedicado em localhost.");
}
let pool: Pool | undefined;
let db: ReturnType<typeof getDb>;
let usuarioId: number | undefined, empresaId: number | undefined, colaboradorId: number | undefined;
const eventosIds: number[] = [];
const run = randomUUID();

describe.skipIf(!target)("convite — concorrência SQL real isolada", () => {
  beforeAll(async () => {
    pool = createPool({ uri: value!, connectionLimit: 5, timezone: "Z" });
    const [rows] = await pool.query("SELECT DATABASE() AS nome");
    if ((rows as { nome: string }[])[0]?.nome !== target!.pathname.slice(1)) throw new Error("Banco efetivo diverge do teste autorizado.");
    db = drizzle(pool, { schema, mode: "default" }) as unknown as ReturnType<typeof getDb>;
    await db.select().from(schema.whatsappOutbox).limit(0);
    const [u] = await db.insert(schema.usuarios).values({ email: `${run}@example.invalid`, nome: "Fixture convite", senhaHash: "sem-login-valido", perfil: "cliente" }); usuarioId = u.insertId;
    const [e] = await db.insert(schema.empresas).values({ usuarioId, razaoSocial: "Empresa sintética convite", cnpj: "12345678000123", cnaePrincipal: "1234567", regimeTributario: "simples_nacional", uf: "SP" }); empresaId = e.insertId;
    const [c] = await db.insert(schema.colaboradores).values({ empresaId, nome: "Pessoa sintética convite", email: `pessoa-${run}@example.invalid`, telefone: "5521999999999", statusVinculo: "ativo" }); colaboradorId = c.insertId;
    await db.insert(schema.convites).values({ email: `pessoa-${run}@example.invalid`, perfil: "cliente", token: `legacy-${run}`, createdById: usuarioId, expiresAt: new Date(Date.now() + 86400_000) });
  });
  afterAll(async () => {
    try {
      if (!db) return;
      if (eventosIds.length) await db.delete(schema.whatsappWebhookEvents).where(inArray(schema.whatsappWebhookEvents.id, eventosIds));
      if (empresaId && colaboradorId) await db.delete(schema.whatsappOutbox).where(and(eq(schema.whatsappOutbox.empresaId, empresaId), eq(schema.whatsappOutbox.colaboradorId, colaboradorId)));
      // createdBy é exclusivamente o usuário sintético criado neste teste.
      if (usuarioId) await db.delete(schema.convites).where(eq(schema.convites.createdById, usuarioId));
      if (colaboradorId) await db.delete(schema.colaboradores).where(eq(schema.colaboradores.id, colaboradorId));
      if (empresaId) await db.delete(schema.empresas).where(eq(schema.empresas.id, empresaId));
      if (usuarioId) await db.delete(schema.usuarios).where(eq(schema.usuarios.id, usuarioId));
    } finally { await pool?.end(); }
  });
  it("duplo clique cria uma reserva, uma emissão, preserva legado e correlaciona entrega", async () => {
    const email = vi.fn(async () => ({ enviado: true }));
    const whatsapp = vi.fn(async () => ({ enviado: true, messageId: `wamid.fixture.${run}`, status: "aceito" as const }));
    const deps = { db, email, whatsapp };
    const input = { empresaId: empresaId!, colaboradorId: colaboradorId!, usuarioId: usuarioId! };
    const [a, b] = await Promise.all([enviarConviteColaboradorIdempotente(input, deps), enviarConviteColaboradorIdempotente(input, deps)]);
    expect(a.conviteId).toBe(b.conviteId); expect(a.linkAceite).toBe(b.linkAceite);
    expect(email).toHaveBeenCalledTimes(1); expect(whatsapp).toHaveBeenCalledTimes(1);
    const convites = await db.select().from(schema.convites).where(eq(schema.convites.createdById, usuarioId!));
    expect(convites).toHaveLength(2); expect(convites.every(c => c.status === "pendente")).toBe(true);
    const outbox = await db.select().from(schema.whatsappOutbox).where(and(eq(schema.whatsappOutbox.empresaId, empresaId!), eq(schema.whatsappOutbox.colaboradorId, colaboradorId!)));
    expect(outbox).toHaveLength(1); expect(Object.keys(outbox[0].payload as object).sort()).toEqual(["conviteId", "enviadoPorEmail", "statusWhatsapp"].sort());
    expect((await enviarConviteColaboradorIdempotente(input, deps)).statusWhatsapp).toBe("aceito");
    const [evento] = await db.insert(schema.whatsappWebhookEvents).values({ tipoEvento: "status", mensagemId: `wamid.fixture.${run}`, telefone: "5521999999999", canalTelefone: "552196483003", statusEntrega: "delivered", payload: {} }); eventosIds.push(evento.insertId);
    expect((await enviarConviteColaboradorIdempotente(input, deps)).statusWhatsapp).toBe("entregue");
    await db.update(schema.convites).set({ status: "revogado" }).where(eq(schema.convites.id, a.conviteId));
    await expect(enviarConviteColaboradorIdempotente(input, deps)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(email).toHaveBeenCalledTimes(1); expect(whatsapp).toHaveBeenCalledTimes(1);
  });
});
