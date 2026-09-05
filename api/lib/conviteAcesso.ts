import { and, eq } from "drizzle-orm";
import { convites } from "@db/schema";
import type { Perfil } from "@contracts/types";
import { getDb } from "../queries/connection";
import { gerarTokenConvite, linkAceite } from "./conviteUtils";

/** Convite de acesso vale 7 dias. */
export const CONVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * Emite um convite de acesso ao painel (v1.9.1). Vive fora do router porque
 * agora tem dois emissores: a área "Usuários do painel" e o convite do
 * colaborador — que desde a saída do WhatsApp também é um link de aceite.
 * Convites pendentes anteriores do mesmo e-mail são revogados.
 */
export async function emitirConviteAcesso(
  db: ReturnType<typeof getDb>,
  entrada: { email: string; perfil: Perfil; createdById: number },
): Promise<{ id: number; token: string; link: string }> {
  await db
    .update(convites)
    .set({ status: "revogado" })
    .where(
      and(eq(convites.email, entrada.email), eq(convites.status, "pendente")),
    );

  const token = gerarTokenConvite();
  const result = await db.insert(convites).values({
    email: entrada.email,
    perfil: entrada.perfil,
    token,
    createdById: entrada.createdById,
    expiresAt: new Date(Date.now() + CONVITE_TTL_MS),
  });

  return { id: Number(result[0].insertId), token, link: linkAceite(token) };
}
