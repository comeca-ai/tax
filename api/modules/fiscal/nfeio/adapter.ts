import { chaveFiscalValida } from "../../reembolso/campo/dominio";

/** Exclusivo do servidor: uma chamada GET, sem fallback, redirect ou retry. */
export const NFE_IO_ORIGIN = "https://nfe.api.nfe.io";
export const LIMITE_RESPOSTA_NFE_IO = 2 * 1024 * 1024;
export type EstadoConsultaNfeIo =
  | "autorizada"
  | "cancelada"
  | "nao_autorizada"
  | "homologacao"
  | "destinatario_divergente"
  | "credencial_rejeitada"
  | "acesso_negado"
  | "nao_localizada"
  | "limite_provedor"
  | "indisponivel"
  | "timeout_incerto"
  | "resposta_invalida"
  | "chave_rejeitada";
export type ResultadoConsultaNfeIo = {
  estado: EstadoConsultaNfeIo;
  httpStatus: number | null;
  consultadaEm: string;
};

export function chaveNfe55Valida(chave: string): boolean {
  return chaveFiscalValida(chave) && chave.slice(20, 22) === "55";
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function resultado(
  estado: EstadoConsultaNfeIo,
  httpStatus: number | null
): ResultadoConsultaNfeIo {
  return { estado, httpStatus, consultadaEm: new Date().toISOString() };
}
function cnpjDaResposta(value: unknown): string | null {
  if (typeof value === "string" && /^\d{14}$/.test(value)) return value;
  // JSON numérico da NFE.io não preserva zeros iniciais do CNPJ.
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value < 1e14
  )
    return String(value).padStart(14, "0");
  return null;
}

export function interpretarRespostaNfeIo(
  raw: unknown,
  chave: string,
  cnpjEsperado: string
): ResultadoConsultaNfeIo {
  const body = object(raw);
  const protocol = object(body?.protocol);
  if (
    !chaveNfe55Valida(chave) ||
    !/^\d{14}$/.test(cnpjEsperado) ||
    !body ||
    !protocol ||
    protocol.accessKey !== chave ||
    ![55, "55"].includes(body.codeModel as string | number)
  )
    return resultado("resposta_invalida", 200);
  // O protocolo inicial pode continuar 100 depois do cancelamento.
  if (
    body.currentStatus === "Canceled" ||
    [101, 151, "101", "151"].includes(protocol.statusCode as string | number)
  )
    return resultado("cancelada", 200);
  if (!["Authorized", "Unknown"].includes(body.currentStatus as string))
    return resultado("resposta_invalida", 200);
  if (
    body.currentStatus !== "Authorized" ||
    ![100, "100"].includes(protocol.statusCode as string | number)
  )
    return resultado("nao_autorizada", 200);
  if (
    body.environmentType === "Homologation" ||
    protocol.environmentType === "Homologation"
  )
    return resultado("homologacao", 200);
  if (
    body.environmentType !== "Production" ||
    (protocol.environmentType !== undefined &&
      protocol.environmentType !== "Production")
  )
    return resultado("resposta_invalida", 200);
  const buyer = cnpjDaResposta(object(body.buyer)?.federalTaxNumber);
  if (!buyer) return resultado("resposta_invalida", 200);
  return resultado(
    buyer === cnpjEsperado ? "autorizada" : "destinatario_divergente",
    200
  );
}

async function readJsonBounded(response: Response): Promise<unknown> {
  if (
    !response.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json") ||
    !response.body
  )
    throw new Error("Invalid response");
  const declared = response.headers.get("content-length");
  if (
    declared &&
    (!/^\d+$/.test(declared) || Number(declared) > LIMITE_RESPOSTA_NFE_IO)
  )
    throw new Error("Response limit");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > LIMITE_RESPOSTA_NFE_IO) throw new Error("Response limit");
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel();
  }
}

export async function consultarNfeIo(
  input: { chave: string; cnpjEsperado: string; apiKey: string },
  fetchFn: typeof fetch = fetch
): Promise<ResultadoConsultaNfeIo> {
  if (!chaveNfe55Valida(input.chave) || !/^\d{14}$/.test(input.cnpjEsperado))
    throw new Error("INVALID_NFE_IO_INPUT");
  if (
    !input.apiKey ||
    input.apiKey.length > 4096 ||
    /\s|[\r\n]/.test(input.apiKey) ||
    /^Bearer/i.test(input.apiKey)
  )
    throw new Error("INVALID_NFE_IO_CONFIGURATION");
  let response: Response;
  try {
    response = await fetchFn(
      `${NFE_IO_ORIGIN}/v2/productinvoices/serpro/${input.chave}`,
      {
        method: "GET",
        headers: { Authorization: input.apiKey, Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      }
    );
  } catch (error) {
    return resultado(
      error instanceof Error &&
        ["AbortError", "TimeoutError"].includes(error.name)
        ? "timeout_incerto"
        : "indisponivel",
      null
    );
  }
  if (response.status !== 200) {
    try {
      await response.body?.cancel();
    } catch {
      /* Não expõe erro de transporte. */
    }
    const known: Record<number, EstadoConsultaNfeIo> = {
      400: "chave_rejeitada",
      401: "credencial_rejeitada",
      403: "acesso_negado",
      404: "nao_localizada",
      429: "limite_provedor",
    };
    return resultado(
      known[response.status] ??
        (response.status >= 500 ? "indisponivel" : "resposta_invalida"),
      response.status
    );
  }
  try {
    return interpretarRespostaNfeIo(
      await readJsonBounded(response),
      input.chave,
      input.cnpjEsperado
    );
  } catch (error) {
    try {
      await response.body?.cancel();
    } catch {
      /* Reader já cancelado ou conexão encerrada. */
    }
    return resultado(
      error instanceof Error &&
        ["AbortError", "TimeoutError"].includes(error.name)
        ? "timeout_incerto"
        : "resposta_invalida",
      200
    );
  }
}
