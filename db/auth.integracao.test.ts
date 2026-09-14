import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { eq, inArray } from "drizzle-orm";
import { authRateLimits, authSessoesRevogadas } from "./authSchema";
import { usuarios } from "./schema";
const injected = vi.hoisted(() => ({
  db: undefined as unknown,
  namespace: `auth-test-${Date.now()}-${Math.random()}`,
}));
vi.mock("../api/queries/connection", () => ({
  getDb: () => {
    if (!injected.db) throw new Error("Banco isolado não inicializado.");
    return injected.db;
  },
}));
vi.mock("../api/lib/env", () => ({ env: { appSecret: injected.namespace } }));
import {
  chaveLimiteAuth,
  consumirLimiteAuth,
  LIMITES_AUTH,
} from "../api/auth/rateLimit";
import { criarTokenSessao } from "../api/auth/session";
import { revogarSessao, sessaoRevogada } from "../api/auth/revogacao";
import { createContext } from "../api/context";

const testUrl = process.env.POC_TEST_DATABASE_URL;
const target = testUrl ? new URL(testUrl) : null;
if (
  target &&
  (target.protocol !== "mysql:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
    !/^\/reembolsa_poc_test_[a-zA-Z0-9_]+$/.test(target.pathname) ||
    target.search ||
    target.hash)
)
  throw new Error(
    "Autenticação SQL exige banco localhost reembolsa_poc_test_* dedicado."
  );
let pool: Pool;
let db: MySql2Database;
let usuarioId: number;
const run = randomUUID();
const chaves = new Set<string>();
const tokens: string[] = [];
const identity = `${run}@example.invalid`;
const chave = (who: string) => {
  const value = chaveLimiteAuth("login", who);
  chaves.add(value);
  return value;
};
async function contexto(token: string) {
  return createContext({
    req: new Request("http://localhost", {
      headers: { cookie: `tax_session=${token}` },
    }),
    resHeaders: new Headers(),
    info: {},
  } as Parameters<typeof createContext>[0]);
}

describe.skipIf(!target)(
  "auth — persistência e concorrência em MySQL isolado",
  () => {
    beforeAll(async () => {
      pool = createPool({ uri: target!.href, connectionLimit: 10 });
      const [rows] = await pool.query("SELECT DATABASE() AS nome");
      if ((rows as { nome: string }[])[0]?.nome !== target!.pathname.slice(1))
        throw new Error("Banco efetivo não corresponde ao alvo isolado.");
      db = drizzle(pool);
      injected.db = db;
      await db.select().from(authRateLimits).limit(0);
      await db.select().from(authSessoesRevogadas).limit(0);
      const [insert] = await db
        .insert(usuarios)
        .values({
          nome: "Auth SQL sintético",
          email: identity,
          senhaHash: "synthetic-old-hash",
          perfil: "cliente",
        });
      usuarioId = insert.insertId;
      chave("global");
      chave(`identidade:${identity}`);
    });
    afterAll(async () => {
      if (db) {
        if (tokens.length)
          await db.delete(authSessoesRevogadas).where(
            inArray(
              authSessoesRevogadas.tokenHash,
              tokens.map(t => createHash("sha256").update(t).digest("hex"))
            )
          );
        if (chaves.size)
          await db
            .delete(authRateLimits)
            .where(inArray(authRateLimits.chave, [...chaves]));
        if (usuarioId)
          await db.delete(usuarios).where(eq(usuarios.id, usuarioId));
      }
      await pool?.end();
    });
    it("20 tentativas concorrentes admitem exatamente o limite de 10", async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, () => consumirLimiteAuth("login", identity))
      );
      expect(results.filter(Boolean)).toHaveLength(
        LIMITES_AUTH.login.porIdentidade
      );
      const [counter] = await db
        .select()
        .from(authRateLimits)
        .where(eq(authRateLimits.chave, chave(`identidade:${identity}`)));
      expect(counter.tentativas).toBe(10);
      expect(counter.chave).not.toContain(identity);
    });
    it("nova instância de conexão conserva bloqueio e janela expirada volta a aceitar", async () => {
      injected.db = drizzle(pool);
      expect(await consumirLimiteAuth("login", identity)).toBe(false);
      expect(
        await consumirLimiteAuth(
          "login",
          identity,
          Date.now() + LIMITES_AUTH.login.janelaMs + 1
        )
      ).toBe(true);
      injected.db = db;
    });
    it("logout persistido bloqueia reuso do token sem revogar outro dispositivo", async () => {
      const token = criarTokenSessao(usuarioId, "synthetic-old-hash");
      const outro = criarTokenSessao(usuarioId, "synthetic-old-hash");
      tokens.push(token, outro);
      expect((await contexto(token)).usuario?.id).toBe(usuarioId);
      await revogarSessao(token);
      expect(await sessaoRevogada(token)).toBe(true);
      expect((await contexto(token)).usuario).toBeNull();
      expect((await contexto(outro)).usuario?.id).toBe(usuarioId);
      await revogarSessao(token); // idempotente
    });
    it("mudança da senha no banco invalida todos os cookies antigos", async () => {
      const token = criarTokenSessao(usuarioId, "synthetic-old-hash");
      tokens.push(token);
      expect((await contexto(token)).usuario?.id).toBe(usuarioId);
      await db
        .update(usuarios)
        .set({ senhaHash: "synthetic-new-hash" })
        .where(eq(usuarios.id, usuarioId));
      expect((await contexto(token)).usuario).toBeNull();
      const novo = criarTokenSessao(usuarioId, "synthetic-new-hash");
      tokens.push(novo);
      expect((await contexto(novo)).usuario?.id).toBe(usuarioId);
      expect((await contexto(novo)).usuario).not.toHaveProperty("senhaHash");
    });
  }
);
