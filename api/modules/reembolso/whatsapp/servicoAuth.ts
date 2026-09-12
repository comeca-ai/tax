import { createHash, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

function digest(valor: string): Buffer {
  return createHash("sha256").update(valor).digest();
}

/**
 * Aceita uma lista curta de tokens separados por vírgula para permitir rotação
 * sem indisponibilidade: publica-se o token novo junto do antigo e, depois da
 * troca do consumidor, remove-se o antigo. Nenhum token é logado ou retornado.
 */
export function lerTokensDeServico(valor: string | undefined): string[] {
  if (!valor) return [];
  return [...new Set(valor.split(",").map(token => token.trim()).filter(Boolean))];
}

function extrairBearer(cabecalho: string | undefined): string | null {
  const encontrado = /^Bearer ([^\s]+)$/i.exec(cabecalho?.trim() ?? "");
  return encontrado?.[1] ?? null;
}

/** Fail-closed: credencial ausente, malformada ou desconhecida nunca autoriza. */
export function autorizarServico(
  cabecalhoAuthorization: string | undefined,
  tokensConfigurados: string | undefined,
): boolean {
  const tokenRecebido = extrairBearer(cabecalhoAuthorization);
  const tokens = lerTokensDeServico(tokensConfigurados);
  if (!tokenRecebido || tokens.length === 0) return false;

  const recebido = digest(tokenRecebido);
  return tokens.some(token => timingSafeEqual(recebido, digest(token)));
}

/** Middleware exclusivo da API de integração; não aceita cookie de usuário. */
export function exigirServicoAutenticado(
  tokensConfigurados: string | undefined,
): MiddlewareHandler {
  return async (c, next) => {
    if (!autorizarServico(c.req.header("Authorization"), tokensConfigurados)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  };
}
