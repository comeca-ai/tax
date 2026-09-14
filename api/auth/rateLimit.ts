import { createHmac } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { authRateLimits } from "../../db/authSchema";
import { getDb } from "../queries/connection";
import { env } from "../lib/env";

export const LIMITES_AUTH = {
  login: { porIdentidade: 10, global: 2000, janelaMs: 15 * 60_000 },
  registro: { porIdentidade: 5, global: 500, janelaMs: 60 * 60_000 },
  solicitarReset: { porIdentidade: 3, global: 1000, janelaMs: 15 * 60_000 },
  redefinirSenha: { porIdentidade: 10, global: 2000, janelaMs: 15 * 60_000 },
  trocarSenha: { porIdentidade: 10, global: 2000, janelaMs: 15 * 60_000 },
} as const;
export type AcaoAuth = keyof typeof LIMITES_AUTH;

export function chaveLimiteAuth(acao: AcaoAuth, identidade: string): string {
  return createHmac("sha256", env.appSecret)
    .update(`auth-rate-v1:${acao}:${identidade}`)
    .digest("hex");
}

/** Compartilhado entre processos pelo banco. Nunca confia em X-Forwarded-For do cliente. */
export async function consumirLimiteAuth(
  acao: AcaoAuth,
  identidade: string,
  agora = Date.now()
): Promise<boolean> {
  const politica = LIMITES_AUTH[acao];
  return getDb().transaction(async tx => {
    // Sempre trava global antes de identidade: evita inversão de locks entre requisições.
    for (const [nome, limite] of [
      ["global", politica.global],
      [`identidade:${identidade.trim().toLowerCase()}`, politica.porIdentidade],
    ] as const) {
      const chave = chaveLimiteAuth(acao, nome);
      await tx
        .insert(authRateLimits)
        .values({ chave, janelaInicio: agora, tentativas: 0 })
        .onDuplicateKeyUpdate({ set: { chave } });
      const [row] = await tx
        .select()
        .from(authRateLimits)
        .where(eq(authRateLimits.chave, chave))
        .for("update");
      if (!row) throw new Error("Contador de autenticação indisponível.");
      const expirou = agora - row.janelaInicio >= politica.janelaMs;
      if (!expirou && row.tentativas >= limite) return false;
      await tx
        .update(authRateLimits)
        .set({
          janelaInicio: expirou ? agora : row.janelaInicio,
          tentativas: expirou ? 1 : row.tentativas + 1,
        })
        .where(eq(authRateLimits.chave, chave));
    }
    await tx
      .delete(authRateLimits)
      .where(lt(authRateLimits.janelaInicio, agora - 24 * 60 * 60_000))
      .limit(100);
    return true;
  });
}

export async function exigirLimiteAuth(
  acao: AcaoAuth,
  identidade: string
): Promise<void> {
  if (!(await consumirLimiteAuth(acao, identidade)))
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Muitas tentativas. Aguarde antes de tentar novamente.",
    });
}
