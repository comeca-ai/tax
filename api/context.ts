import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { eq } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { usuarios } from "@db/schema";
import type { UsuarioSessao } from "@contracts/types";
import {
  SESSION_COOKIE,
  lerCookie,
  verificarTokenSessao,
} from "./auth/session";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  /** Usuário autenticado (null quando não há sessão válida) */
  usuario: UsuarioSessao | null;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const { req, resHeaders } = opts;
  let usuario: UsuarioSessao | null = null;

  const token = lerCookie(req, SESSION_COOKIE);
  if (token) {
    const payload = verificarTokenSessao(token);
    if (payload) {
      const db = getDb();
      const rows = await db
        .select({
          id: usuarios.id,
          email: usuarios.email,
          nome: usuarios.nome,
          perfil: usuarios.perfil,
        })
        .from(usuarios)
        .where(eq(usuarios.id, payload.uid))
        .limit(1);
      usuario = rows[0] ?? null;
    }
  }

  return { req, resHeaders, usuario };
}
