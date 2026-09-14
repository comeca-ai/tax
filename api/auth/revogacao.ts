import { createHash } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { authSessoesRevogadas } from "../../db/authSchema";
import { getDb } from "../queries/connection";
import { verificarTokenSessao } from "./session";

const impressao = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function sessaoRevogada(token: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ tokenHash: authSessoesRevogadas.tokenHash })
    .from(authSessoesRevogadas)
    .where(eq(authSessoesRevogadas.tokenHash, impressao(token)))
    .limit(1);
  return Boolean(row);
}

export async function revogarSessao(token: string): Promise<void> {
  const payload = verificarTokenSessao(token);
  if (!payload) return;
  const db = getDb();
  const tokenHash = impressao(token);
  await db
    .insert(authSessoesRevogadas)
    .values({ tokenHash, expiraEm: payload.exp })
    .onDuplicateKeyUpdate({ set: { tokenHash } });
  // Limpeza limitada: expiração já impede reuso mesmo depois de remover a impressão.
  await db
    .delete(authSessoesRevogadas)
    .where(lt(authSessoesRevogadas.expiraEm, Date.now()))
    .limit(100);
}
