import {
  gravarDashboardIa,
  registrarUsoIa,
  reservarConsulta,
  saldoConsultas,
  type DestinoConsulta,
  type EventoUsoIa,
} from "../../tools/poc/limite-consultas.mjs";

export class ReservaConsultaPocIndisponivel extends Error {
  constructor() { super("Reserva de consulta indisponível; nenhuma chamada externa foi iniciada."); }
}

function config() {
  const arquivo = process.env.POC_CALLS_LEDGER;
  if (!arquivo) return null;
  const limite = Number(process.env.POC_CALLS_LIMIT ?? "20");
  if (!Number.isInteger(limite) || limite < 1 || limite > 1000) throw new ReservaConsultaPocIndisponivel();
  return { arquivo, limite };
}

function configUsoIa(c: ReturnType<typeof config>) {
  const arquivoUso = process.env.POC_AI_USAGE_LEDGER ?? (c ? `${c.arquivo}.ai-usage.jsonl` : undefined);
  const arquivoDashboard = process.env.POC_AI_DASHBOARD_FILE ?? (c ? `${c.arquivo}.ai-dashboard.json` : undefined);
  return arquivoUso && arquivoDashboard ? { arquivoUso, arquivoDashboard } : null;
}

function destino(url: URL): DestinoConsulta | null {
  if (url.hostname === "api.openai.com") return "openai";
  if (url.hostname === "openrouter.ai") return "openrouter";
  if (url.hostname === "api.mistral.ai") return "mistral";
  if (url.hostname === "waba-v2.360dialog.io") return "360dialog";
  return null;
}

function corpoJson(init?: RequestInit) {
  try {
    return JSON.parse(typeof init?.body === "string" ? init.body : "null") as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

function nomeSchema(corpo: Record<string, unknown> | null) {
  const text = corpo?.text as { format?: { name?: unknown } } | undefined;
  const responseFormat = corpo?.response_format as { json_schema?: { name?: unknown } } | undefined;
  const annotation = corpo?.document_annotation_format as { json_schema?: { name?: unknown } } | undefined;
  const nome = text?.format?.name ?? responseFormat?.json_schema?.name ?? annotation?.json_schema?.name;
  return typeof nome === "string" ? nome : null;
}

function operacaoIa(url: URL, init?: RequestInit) {
  const corpo = corpoJson(init);
  const schema = nomeSchema(corpo);
  if (schema === "arquiteto_politica") return "politica.arquitetar";
  if (schema === "politica_reembolso") return "politica.upload";
  if (schema === "extracao_nota") return "despesas.ocr_e_whatsapp.worker.comprovante";
  if (url.hostname === "api.mistral.ai" && url.pathname === "/v1/chat/completions") return "politica.upload";
  if (url.hostname === "api.mistral.ai" && url.pathname === "/v1/ocr") return "politica.upload";
  return "nao_identificada";
}

function tokenSeguro(valor: unknown) {
  return Number.isSafeInteger(valor) && Number(valor) >= 0 ? Number(valor) : null;
}

function eventoUso(
  provedor: "openai" | "openrouter" | "mistral",
  url: URL,
  init: RequestInit | undefined,
  resposta?: Response,
  json?: unknown,
): EventoUsoIa {
  const usage = (json as { usage?: Record<string, unknown> } | null)?.usage ?? {};
  const entrada = tokenSeguro(usage.input_tokens ?? usage.prompt_tokens);
  const saida = tokenSeguro(usage.output_tokens ?? usage.completion_tokens);
  const totalInformado = tokenSeguro(usage.total_tokens);
  return {
    provedor,
    endpointExterno: `${url.origin}${url.pathname}`,
    operacao: operacaoIa(url, init),
    http: resposta?.status ?? null,
    estado: resposta ? "respondida" : "resultado_incerto",
    tokensEntrada: entrada,
    tokensSaida: saida,
    tokensTotal: totalInformado,
  };
}

function registrarSemInterromper(arquivo: string, evento: EventoUsoIa) {
  try {
    registrarUsoIa(arquivo, evento);
  } catch (error) {
    console.error("Falha ao registrar telemetria de IA", error instanceof Error ? error.message : "erro desconhecido");
  }
}

export function saldoChamadasPoc(): number {
  try {
    const c = config();
    return c ? saldoConsultas(c.arquivo, c.limite) : Infinity;
  } catch { return 0; }
}

/** Habilitada somente pelo operador. Reinício/deploy nunca repõe o saldo. */
export function instalarLimiteChamadasPoc() {
  const c = config();
  const uso = configUsoIa(c);
  if (!c && !uso) return;
  if (c) saldoConsultas(c.arquivo, c.limite);
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const alvo = destino(url);
    if (alvo && c) {
      try { reservarConsulta(c.arquivo, "poc_runtime", alvo, c.limite); }
      catch { throw new ReservaConsultaPocIndisponivel(); }
    }
    const provedorIa = alvo === "openai" || alvo === "openrouter" || alvo === "mistral" ? alvo : null;
    try {
      const resposta = await original(input, init);
      if (provedorIa && uso) {
        const json = await resposta.clone().json().catch(() => null);
        registrarSemInterromper(uso.arquivoUso, eventoUso(provedorIa, url, init, resposta, json));
      }
      return resposta;
    } catch (error) {
      if (provedorIa && uso)
        registrarSemInterromper(uso.arquivoUso, eventoUso(provedorIa, url, init));
      throw error;
    }
  };
}

/** Atualiza um artefato JSON privado, sem interface, em janelas fixas de dez minutos. */
export function iniciarDashboardIaOperacional() {
  const uso = configUsoIa(config());
  if (!uso) return null;
  const atualizar = () => {
    try {
      gravarDashboardIa(uso.arquivoUso, uso.arquivoDashboard);
    } catch (error) {
      console.error("Falha ao atualizar dashboard operacional de IA", error instanceof Error ? error.message : "erro desconhecido");
    }
  };
  atualizar();
  const timer = setInterval(atualizar, 600_000);
  timer.unref();
  return () => clearInterval(timer);
}
