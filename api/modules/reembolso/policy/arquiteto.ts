import { regrasPoliticaSchema, regraExtraidaSchema, type RegraExtraida } from "@contracts/types";
import { ReservaConsultaPocIndisponivel } from "../../../lib/pocConsultas";

const MAX_PEDIDO = 4_000;
const MAX_TOKENS_OPENAI_PADRAO = 8_000;
const MAX_TOKENS_OPENROUTER_PADRAO = 4_000;
const TIMEOUT_MS = 60_000;

export class ErroArquitetoPolitica extends Error {
  readonly tipo:
    | "configuracao"
    | "limite"
    | "timeout"
    | "provedor"
    | "resposta";

  constructor(
    tipo: "configuracao" | "limite" | "timeout" | "provedor" | "resposta",
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ErroArquitetoPolitica";
    this.tipo = tipo;
  }
}

function maxTokens(nome: string, padrao: number) {
  const valor = Number(process.env[nome] ?? padrao);
  return Number.isInteger(valor) && valor >= 1_000 && valor <= 16_000
    ? valor
    : padrao;
}

const REGRA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "tema", "categoria", "escopo", "descricao", "condicao", "reembolsavel", "valorLimite", "moeda", "unidadeLimite", "exigeComprovante", "exigeDocumentoFiscal", "decisaoAutomatica"],
  properties: {
    id: { type: "string" },
    tema: { type: "string", enum: ["alimentacao", "hospedagem", "transporte", "combustivel", "pedagio", "documentacao", "prazos", "geral"] },
    categoria: { type: ["string", "null"], enum: ["combustivel", "alimentacao", "hospedagem", "pedagio", "uber", "taxi", null] },
    escopo: { type: "string", enum: ["categoria", "item"] },
    descricao: { type: "string" },
    condicao: { type: ["string", "null"] },
    reembolsavel: { type: "string", enum: ["sim", "excecao", "vedado"] },
    valorLimite: { type: ["number", "null"] },
    moeda: { type: "string" },
    unidadeLimite: { type: ["string", "null"], enum: ["dia", "mes", "viagem", "evento", "percentual", "dias_antecedencia", "dias_para_pagamento", null] },
    exigeComprovante: { type: "boolean" },
    exigeDocumentoFiscal: { type: "boolean" },
    decisaoAutomatica: { type: "string", enum: ["nenhuma", "aprovar", "negar"] },
  },
} as const;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "alteracoes", "regras"],
  properties: {
    resumo: { type: "string" },
    alteracoes: { type: "array", items: { type: "string" } },
    regras: { type: "array", items: REGRA_SCHEMA },
  },
} as const;

const INSTRUCAO = "Você é o Arquiteto de Política de uma empresa brasileira. Receba um pedido de alteração e a lista atual de regras. Retorne a lista COMPLETA de regras após aplicar somente o pedido. Preserve todas as regras não mencionadas. Nunca invente autorização ampla: se o pedido for ambíguo, mantenha decisãoAutomatica como nenhuma e descreva a ambiguidade em alteracoes. A saída é um rascunho para revisão humana; não diga que publicou ou ativou nada.";

function promptUsuario(pedido: string, regrasAtuais: RegraExtraida[]) {
  return `PEDIDO:\n${pedido}\n\nREGRAS ATUAIS (JSON):\n${JSON.stringify(regrasAtuais)}`;
}

function textoRespostaOpenAi(resposta: unknown): string {
  const dados = resposta as { output_text?: unknown; output?: { content?: { type?: string; text?: string }[] }[] };
  if (typeof dados.output_text === "string" && dados.output_text.trim()) return dados.output_text;
  const texto = (dados.output ?? []).flatMap(item => item.content ?? []).filter(item => item.type === "output_text" && typeof item.text === "string").map(item => item.text).join("\n").trim();
  if (!texto) throw new Error("resposta sem conteúdo utilizável");
  return texto;
}

function textoRespostaOpenRouter(resposta: unknown): string {
  const dados = resposta as { choices?: { message?: { content?: unknown } }[] };
  const conteudo = dados.choices?.[0]?.message?.content;
  if (typeof conteudo !== "string" || !conteudo.trim())
    throw new Error("resposta sem conteúdo utilizável");
  return conteudo.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function validarRegras(regras: unknown): RegraExtraida[] {
  if (!Array.isArray(regras) || regras.length > 200) throw new Error("resposta com regras inválidas");
  const resultado = regras.map(regra => regraExtraidaSchema.parse(regra));
  if (new Set(resultado.map(regra => regra.id)).size !== resultado.length) throw new Error("resposta com IDs de regra duplicados");
  return resultado;
}

function montarResultado(texto: string, modelo: string) {
  let bruto: { resumo?: unknown; alteracoes?: unknown; regras?: unknown };
  let regras: RegraExtraida[];
  try {
    bruto = JSON.parse(texto) as typeof bruto;
    regras = validarRegras(bruto.regras);
  } catch (error) {
    throw new ErroArquitetoPolitica(
      "resposta",
      "O provedor de IA retornou um rascunho inválido",
      { cause: error }
    );
  }
  return {
    resumo: typeof bruto.resumo === "string" ? bruto.resumo.slice(0, 1_000) : "Rascunho preparado para revisão.",
    alteracoes: Array.isArray(bruto.alteracoes) ? bruto.alteracoes.filter((item): item is string => typeof item === "string").slice(0, 30) : [],
    regras: regrasPoliticaSchema.shape.regrasExtraidas.parse(regras),
    modelo,
  };
}

function erroHttp(provedor: string, status: number) {
  const tipo = status === 401 || status === 403
    ? "configuracao"
    : status === 429
      ? "limite"
      : "provedor";
  return new ErroArquitetoPolitica(tipo, `${provedor} respondeu HTTP ${status}`);
}

function erroChamada(provedor: string, error: unknown) {
  if (error instanceof ReservaConsultaPocIndisponivel || error instanceof ErroArquitetoPolitica)
    return error;
  if (["TimeoutError", "AbortError"].includes((error as Error | undefined)?.name ?? ""))
    return new ErroArquitetoPolitica(
      "timeout",
      `${provedor} não concluiu o rascunho em 60 segundos`,
      { cause: error }
    );
  return new ErroArquitetoPolitica(
    "provedor",
    `${provedor} não pôde ser consultado`,
    { cause: error }
  );
}

async function chamarOpenAi(pedido: string, regrasAtuais: RegraExtraida[], apiKey: string) {
  const modelo = process.env.POLICY_OPENAI_MODEL ?? "gpt-4o-mini";
  let resposta: Response;
  try {
    resposta = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelo,
        store: false,
        max_output_tokens: maxTokens("POLICY_ARCHITECT_MAX_OUTPUT_TOKENS", MAX_TOKENS_OPENAI_PADRAO),
        text: { format: { type: "json_schema", name: "arquiteto_politica", strict: true, schema: OUTPUT_SCHEMA } },
        input: [
          { role: "developer", content: [{ type: "input_text", text: INSTRUCAO }] },
          { role: "user", content: [{ type: "input_text", text: promptUsuario(pedido, regrasAtuais) }] },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw erroChamada("OpenAI", error);
  }
  if (!resposta.ok) throw erroHttp("OpenAI", resposta.status);
  try {
    return montarResultado(textoRespostaOpenAi(await resposta.json()), modelo);
  } catch (error) {
    if (error instanceof ErroArquitetoPolitica) throw error;
    throw erroChamada("OpenAI", error);
  }
}

async function chamarOpenRouter(pedido: string, regrasAtuais: RegraExtraida[], apiKey: string) {
  const modelo = process.env.POLICY_OPENROUTER_MODEL ?? "openrouter/free";
  let resposta: Response;
  try {
    resposta = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelo,
        temperature: 0.1,
        max_tokens: maxTokens("POLICY_OPENROUTER_MAX_OUTPUT_TOKENS", MAX_TOKENS_OPENROUTER_PADRAO),
        response_format: { type: "json_schema", json_schema: { name: "arquiteto_politica", strict: true, schema: OUTPUT_SCHEMA } },
        provider: { require_parameters: true, data_collection: "deny" },
        messages: [
          { role: "developer", content: INSTRUCAO },
          { role: "user", content: promptUsuario(pedido, regrasAtuais) },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw erroChamada("OpenRouter", error);
  }
  if (!resposta.ok) throw erroHttp("OpenRouter", resposta.status);
  try {
    return montarResultado(textoRespostaOpenRouter(await resposta.json()), `openrouter:${modelo}`);
  } catch (error) {
    if (error instanceof ErroArquitetoPolitica) throw error;
    throw erroChamada("OpenRouter", error);
  }
}

export async function arquitetarPolitica(input: { pedido: string; regrasAtuais: RegraExtraida[] }) {
  const pedido = input.pedido.trim();
  if (!pedido || pedido.length > MAX_PEDIDO) throw new Error("pedido de ajuste inválido");

  const openAiKey = process.env.OPENAI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openAiKey && !openRouterKey)
    throw new ErroArquitetoPolitica(
      "configuracao",
      "OPENAI_API_KEY e OPENROUTER_API_KEY ausentes no runtime de homologação"
    );

  let falhaOpenAi: unknown;
  if (openAiKey) {
    try {
      return await chamarOpenAi(pedido, input.regrasAtuais, openAiKey);
    } catch (error) {
      if (error instanceof ReservaConsultaPocIndisponivel) throw error;
      falhaOpenAi = error;
    }
  }

  if (openRouterKey) {
    try {
      return await chamarOpenRouter(pedido, input.regrasAtuais, openRouterKey);
    } catch (error) {
      if (error instanceof ReservaConsultaPocIndisponivel) throw error;
      if (error instanceof ErroArquitetoPolitica) throw error;
      throw erroChamada("OpenRouter", error);
    }
  }

  if (falhaOpenAi instanceof ErroArquitetoPolitica) throw falhaOpenAi;
  throw erroChamada("OpenAI", falhaOpenAi);
}
