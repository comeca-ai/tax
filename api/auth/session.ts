import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../lib/env";

/**
 * Sessão stateless: token HMAC-SHA256 (APP_SECRET) em cookie HttpOnly.
 * Formato: base64url(payload).base64url(assinatura)
 * payload = { uid: number, exp: epoch_ms }
 */

export const SESSION_COOKIE = "tax_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

type SessionPayload = { uid: number; exp: number };

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", env.appSecret).update(data).digest("base64url");
}

export function criarTokenSessao(usuarioId: number): string {
  const payload = b64url(
    JSON.stringify({ uid: usuarioId, exp: Date.now() + SESSION_TTL_MS }),
  );
  return `${payload}.${sign(payload)}`;
}

export function verificarTokenSessao(token: string): SessionPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (typeof parsed.uid !== "number" || typeof parsed.exp !== "number") {
      return null;
    }
    if (parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function lerCookie(req: Request, nome: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    if (part.slice(0, eq).trim() === nome) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export function cookieSessao(token: string): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secure = env.isProduction ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function cookieLimparSessao(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
