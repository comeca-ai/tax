import { createHash, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

export type ServicoTenant = { empresaId: number };
export type ServicoEnv = { Variables: { servicoTenant: ServicoTenant } };
type CredencialTenant = ServicoTenant & { token: string };
const digest = (valor: string) => createHash("sha256").update(valor).digest();

/** Configuração nova e explícita. Uma falha fecha toda a superfície de serviço. */
export function lerTokensDeServico(
  valor: string | undefined
): CredencialTenant[] {
  if (!valor || valor.length > 65536) return [];
  try {
    const lista: unknown = JSON.parse(valor);
    if (!Array.isArray(lista) || !lista.length || lista.length > 100) return [];
    const tokens = new Set<string>();
    for (const item of lista) {
      if (
        !item ||
        typeof item !== "object" ||
        Object.keys(item).some(k => !["token", "empresaId"].includes(k)) ||
        typeof item.token !== "string" ||
        item.token.length < 32 ||
        item.token.length > 4096 ||
        /\s/.test(item.token) ||
        !Number.isSafeInteger(item.empresaId) ||
        item.empresaId <= 0 ||
        tokens.has(item.token)
      )
        return [];
      tokens.add(item.token);
    }
    return lista as CredencialTenant[];
  } catch {
    return [];
  }
}

export function autorizarServico(
  cabecalho: string | undefined,
  configuracao: string | undefined
): ServicoTenant | null {
  const token = /^Bearer ([^\s]+)$/i.exec(cabecalho?.trim() ?? "")?.[1];
  if (!token || token.length > 4096) return null;
  const recebido = digest(token);
  const credencial = lerTokensDeServico(configuracao).find(c =>
    timingSafeEqual(recebido, digest(c.token))
  );
  return credencial ? { empresaId: credencial.empresaId } : null;
}

/** Sem fallback para WHATSAPP_SERVICE_API_TOKENS (credencial global antiga). */
export function exigirServicoAutenticado(
  configuracao: string | undefined
): MiddlewareHandler<ServicoEnv> {
  return async (c, next) => {
    const tenant = autorizarServico(
      c.req.header("Authorization"),
      configuracao
    );
    if (!tenant) return c.json({ error: "Unauthorized" }, 401);
    c.set("servicoTenant", tenant);
    return next();
  };
}
