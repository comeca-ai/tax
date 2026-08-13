import { TRPCError } from "@trpc/server";
import type { CnaeReceita, DadosReceitaCnpj } from "@contracts/types";

// ─────────────────────────────────────────────────────────────────────────────
// Consulta de CNPJ na Receita Federal via ReceitaWS (v1.3.0)
// Endpoint: GET https://www.receitaws.com.br/v1/cnpj/{14 dígitos}?token={TOKEN}
// Plano gratuito: 3 consultas/min (HTTP 429).
// ─────────────────────────────────────────────────────────────────────────────

const RECEITAWS_URL = "https://www.receitaws.com.br/v1/cnpj";
const TIMEOUT_MS = 10_000;

/** Remove tudo que não é dígito (aceita CNPJ com ou sem máscara). */
export function somenteDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Converte CNAE completo da Receita ("64.22-1-00") para o formato curto
 * usado no app ("64.22-1"). Se já estiver curto (ou em formato inesperado),
 * retorna como está.
 */
export function cnaeCurto(code: string): string {
  const c = String(code ?? "").trim();
  const m = c.match(/^(\d{2}\.\d{2}-\d)-\d{2}$/);
  return m ? m[1] : c;
}

/** Formata 14 dígitos como XX.XXX.XXX/XXXX-XX. */
function formatarCnpj(digitos: string): string {
  return digitos.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

/** Checksum módulo 11 do CNPJ (14 dígitos, sem máscara). */
export function cnpjValido(digitos: string): boolean {
  const d = somenteDigitos(digitos);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  const digito = (base: string, pesos: number[]): number => {
    const soma = base
      .split("")
      .reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digito(
    d.slice(0, 12) + d1,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return d === d.slice(0, 12) + String(d1) + String(d2);
}

type ReceitaWsAtividade = { code?: unknown; text?: unknown };

function mapearAtividade(a: ReceitaWsAtividade): CnaeReceita | null {
  const codigo = typeof a?.code === "string" ? a.code.trim() : "";
  const descricao = typeof a?.text === "string" ? a.text.trim() : "";
  if (!codigo) return null;
  return { codigo: cnaeCurto(codigo), descricao };
}

/**
 * Mapeia a resposta bruta da ReceitaWS para o DTO do app.
 * Valida o shape mínimo (objeto com `nome` string); lança Error se inválido.
 */
export function mapearRespostaReceitaWs(
  raw: unknown,
  cnpjDigitos: string,
): DadosReceitaCnpj {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Resposta inesperada da ReceitaWS (não é um objeto).");
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.nome !== "string" || !r.nome.trim()) {
    throw new Error("Resposta inesperada da ReceitaWS (sem razão social).");
  }

  const fantasia = typeof r.fantasia === "string" ? r.fantasia.trim() : "";

  const principalRaw = Array.isArray(r.atividade_principal)
    ? (r.atividade_principal[0] as ReceitaWsAtividade | undefined)
    : undefined;
  const cnaePrincipal = principalRaw ? mapearAtividade(principalRaw) : null;

  const vistos = new Set<string>(cnaePrincipal ? [cnaePrincipal.codigo] : []);
  const cnaesSecundarios: CnaeReceita[] = [];
  if (Array.isArray(r.atividades_secundarias)) {
    for (const item of r.atividades_secundarias as ReceitaWsAtividade[]) {
      const cnae = mapearAtividade(item);
      if (!cnae || vistos.has(cnae.codigo)) continue;
      vistos.add(cnae.codigo);
      cnaesSecundarios.push(cnae);
    }
  }

  const uf = typeof r.uf === "string" && r.uf.trim() ? r.uf.trim() : null;
  const municipio =
    typeof r.municipio === "string" && r.municipio.trim()
      ? r.municipio.trim()
      : null;

  return {
    cnpj: formatarCnpj(cnpjDigitos),
    razaoSocial: r.nome.trim(),
    nomeFantasia: fantasia || null,
    situacao: typeof r.situacao === "string" ? r.situacao.trim() : "",
    cnaePrincipal,
    cnaesSecundarios,
    uf,
    municipio,
  };
}

/**
 * Consulta o CNPJ (14 dígitos, sem máscara) na ReceitaWS.
 * Lança TRPCError com mensagem PT-BR em todos os caminhos de falha.
 */
export async function consultarCnpjReceitaWs(
  cnpjDigitos: string,
): Promise<DadosReceitaCnpj> {
  const token = process.env.RECEITAWS_TOKEN;
  if (!token) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Consulta automática de CNPJ não configurada neste ambiente (RECEITAWS_TOKEN ausente).",
    });
  }

  let res: Response;
  try {
    res = await fetch(
      `${RECEITAWS_URL}/${cnpjDigitos}?token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : "";
    if (nome === "TimeoutError" || nome === "AbortError") {
      throw new TRPCError({
        code: "TIMEOUT",
        message: "A consulta à Receita demorou demais — tente novamente.",
      });
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Falha de rede ao consultar a Receita — tente novamente.",
    });
  }

  if (res.status === 429) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message:
        "Muitas consultas seguidas — aguarde cerca de 1 minuto e tente de novo (limite do plano gratuito: 3 consultas/min).",
    });
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Resposta inesperada da Receita — tente novamente.",
    });
  }

  const status = (raw as { status?: unknown })?.status;
  if (!res.ok || status === "ERROR") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "CNPJ não encontrado na base da Receita Federal.",
    });
  }

  try {
    return mapearRespostaReceitaWs(raw, cnpjDigitos);
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Resposta inesperada da Receita — tente novamente.",
    });
  }
}
