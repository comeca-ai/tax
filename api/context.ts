import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { eq } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { usuarios } from "@db/schema";
import type { UsuarioSessao } from "@contracts/types";
import { sessaoRevogada } from "./auth/revogacao";
import {
  SESSION_COOKIE,
  lerCookie,
  verificarTokenSessao,
  sessaoCorrespondeCredencial,
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
    if (payload && !await sessaoRevogada(token)) {
      const db = getDb();
      const rows = await db
        .select({
          id: usuarios.id,
          email: usuarios.email,
          nome: usuarios.nome,
          perfil: usuarios.perfil,
          senhaHash: usuarios.senhaHash,
        })
        .from(usuarios)
        .where(eq(usuarios.id, payload.uid))
        .limit(1);
      const row = rows[0];
      if (row && sessaoCorrespondeCredencial(payload, row.senhaHash)) {
        usuario = { id: row.id, email: row.email, nome: row.nome, perfil: row.perfil };
      }
    }
  }

  return { req, resHeaders, usuario };
}
