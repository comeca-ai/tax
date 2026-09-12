import { randomBytes } from "node:crypto";

/**
 * Utilitários puros de convites (v1.2.0) — sem acesso a banco,
 * testáveis isoladamente (ver conviteUtils.test.ts).
 */

/** Token de convite: 24 bytes aleatórios → 48 caracteres hex. */
export function gerarTokenConvite(): string {
  return randomBytes(24).toString("hex");
}

/** Um convite está expirado quando expiresAt é anterior ao instante atual. */
export function conviteExpirado(expiresAt: Date, agora: Date = new Date()): boolean {
  return expiresAt.getTime() < agora.getTime();
}

/** Link absoluto da tela de aceite do convite (`/convite/:token`). */
export function linkAceite(token: string): string {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  return `${appUrl}/convite/${token}`;
}
