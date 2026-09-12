import type { PolicyExtracao } from "@contracts/types";
import type { ArquivoPolitica, PolicyParser } from "./parser";
import {
  avisosQualidade,
  mapearRuleset,
  PROMPT_EXTRACAO_POLITICA,
  type RulesetLLM,
} from "./mistral";
import { LIMITE_TEXTO_EXTRAIDO_BYTES, truncarUtf8 } from "./texto";

/**
 * Parser de política via OpenAI Responses API.
 *
 * O documento é enviado diretamente como arquivo/imagem, sem gravá-lo antes
 * na API. `store: false` evita que a resposta seja usada como estado de
 * conversa. A saída é JSON estruturado e segue o mesmo contrato do parser
 * Mistral, portanto a revisão assistida continua sendo a etapa decisória.
 *
 * Env:
 *  - OPENAI_API_KEY (obrigatória)
 *  - POLICY_OPENAI_MODEL (default "gpt-4o-mini")
 */

const SCHEMA_RULESET = {
  type: "object",
  additionalProperties: false,
  required: ["politica", "qualidade_extracao", "regras", "ambiguidades"],
  properties: {
    politica: {
      type: "object",
      additionalProperties: false,
      required: ["titulo", "vigencia", "moeda_padrao"],
      properties: {
        titulo: { type: "string" },
        vigencia: { type: ["string", "null"] },
        moeda_padrao: { type: "string" },
      },
    },
    qualidade_extracao: {
      type: "object",
      additionalProperties: false,
      required: ["legivel", "confianca", "paginas_com_problema", "observacoes"],
      properties: {
        legivel: { type: "boolean" },
        confianca: { type: "number", minimum: 0, maximum: 1 },
        paginas_com_problema: { type: "array", items: { type: "integer", minimum: 1 } },
        observacoes: { type: "string" },
      },
    },
    regras: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "tema",
          "categoria",
          "alcance",
          "descricao",
          "condicao",
          "reembolsavel",
          "valor_limite",
          "moeda",
          "unidade_limite",
          "exige_comprovante",
        ],
        properties: {
          id: { type: "string" },
          tema: { type: "string" },
          categoria: { type: "string" },
          alcance: { type: "string", enum: ["categoria", "item"] },
          descricao: { type: "string" },
          condicao: { type: ["string", "null"] },
          reembolsavel: { type: "string", enum: ["sim", "excecao", "vedado"] },
          valor_limite: { type: ["number", "null"] },
          moeda: { type: ["string", "null"] },
          unidade_limite: {
            type: ["string", "null"],
            enum: [
              "dia",
              "mes",
              "viagem",
              "evento",
              "percentual",
              "dias_antecedencia",
              "dias_para_pagamento",
              null,
            ],
          },
          exige_comprovante: { type: "boolean" },
        },
      },
    },
    ambiguidades: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "severidade", "local", "descricao"],
        properties: {
          id: { type: "string" },
          severidade: { type: "string", enum: ["alta", "media", "baixa"] },
          local: { type: "string" },
          descricao: { type: "string" },
        },
      },
    },
  },
} as const;

async function comTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), ms);
  try {
    return await fn(controle.signal);
  } finally {
    clearTimeout(timer);
  }
}

function conteudoDoArquivo(input: ArquivoPolitica): Record<string, unknown> {
  const mime = (input.mimeType || "application/pdf").toLowerCase();
  if (mime.startsWith("text/")) {
    return {
      type: "input_text",
      text: Buffer.from(input.base64, "base64").toString("utf8").slice(0, 120_000),
    };
  }
  if (mime.startsWith("image/")) {
    return {
      type: "input_image",
      image_url: `data:${mime};base64,${input.base64}`,
      detail: "high",
    };
  }
  // A Responses API valida `file_data` como data URL. Base64 cru é recusado
  // para PDFs, embora seja válido dentro do data URL abaixo.
  return {
    type: "input_file",
    filename: input.arquivoNome,
    file_data: `data:${mime};base64,${input.base64}`,
  };
}

function textoDaResposta(resposta: unknown): string {
  const dados = resposta as {
    output_text?: unknown;
    output?: { content?: { type?: string; text?: string }[] }[];
  };
  if (typeof dados.output_text === "string" && dados.output_text.trim()) return dados.output_text;
  const texto = (dados.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();
  if (!texto) throw new Error("OpenAI resposta vazia");
  return texto;
}

async function extrairRuleset(input: ArquivoPolitica, apiKey: string, modelo: string): Promise<RulesetLLM> {
  const resposta = await comTimeout(
    (signal) =>
      fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: modelo,
          store: false,
          max_output_tokens: 32_000,
          text: {
            format: {
              type: "json_schema",
              name: "politica_reembolso",
              strict: true,
              schema: SCHEMA_RULESET,
            },
          },
          input: [
            {
              role: "developer",
              content: [
                {
                  type: "input_text",
                  text: `${PROMPT_EXTRACAO_POLITICA}\n\nO documento está anexado nesta mensagem.`,
                },
              ],
            },
            { role: "user", content: [conteudoDoArquivo(input)] },
          ],
        }),
        signal,
      }),
    240_000,
  );
  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${resposta.status}: ${corpo.slice(0, 200)}`);
  }
  return JSON.parse(textoDaResposta(await resposta.json())) as RulesetLLM;
}

export class OpenAiPolicyParser implements PolicyParser {
  nome = "openai";

  private criarFallback?: () => PolicyParser;

  constructor(criarFallback?: () => PolicyParser) {
    this.criarFallback = criarFallback;
  }

  async extract(input: ArquivoPolitica): Promise<PolicyExtracao> {
    const apiKey = process.env.OPENAI_API_KEY;
    const modelo = process.env.POLICY_OPENAI_MODEL ?? "gpt-4o-mini";
    if (!apiKey) return this.comFallback(input, "OPENAI_API_KEY ausente");

    try {
      const ruleset = await extrairRuleset(input, apiKey, modelo);
      const confiancaBruta = ruleset.qualidade_extracao?.confianca;
      const confianca = typeof confiancaBruta === "number" ? Math.max(0, Math.min(1, confiancaBruta)) : 0;
      const { regras, camposPendentes, resumo } = mapearRuleset(ruleset);
      return {
        textoExtraido: truncarUtf8(resumo, LIMITE_TEXTO_EXTRAIDO_BYTES),
        regras,
        confiancaExtracao: confianca >= 0.85 ? "alta" : confianca >= 0.7 ? "media" : "baixa",
        camposPendentes,
        provedor: `openai:${modelo}`,
        avisos: [resumo.replace(/\n/g, " · "), ...avisosQualidade(ruleset.qualidade_extracao)],
      };
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      return this.comFallback(input, `OpenAI indisponível (${motivo})`);
    }
  }

  private async comFallback(input: ArquivoPolitica, motivo: string): Promise<PolicyExtracao> {
    if (!this.criarFallback) throw new Error(motivo);
    const resultado = await this.criarFallback().extract(input);
    return {
      ...resultado,
      confiancaExtracao: "baixa",
      avisos: [...resultado.avisos, `${motivo}: extração heurística usada como contingência.`],
    };
  }
}
