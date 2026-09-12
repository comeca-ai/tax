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

/**
 * A requisição chegou por HTTPS? Atrás do nginx o `req.url` é sempre http —
 * quem informa o protocolo original é o X-Forwarded-Proto. Sem proxy, cai no
 * protocolo da própria URL.
 */
export function requisicaoSegura(req: Request): boolean {
  const xfp = req.headers.get("x-forwarded-proto");
  if (xfp) return xfp.split(",")[0].trim().toLowerCase() === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function cookieSessao(token: string, secure: boolean): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  // O Secure é decidido pela REQUISIÇÃO, não por config global: com APP_URL
  // https e acesso direto por http://IP:3000 o navegador descartava o cookie
  // Secure e a sessão morria em silêncio — causa das contas órfãs do wizard.
  // E em HTTP self-hosted (sem proxy) o Secure também não pode ir.
  const flag = secure ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${flag}`;
}

export function cookieLimparSessao(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
