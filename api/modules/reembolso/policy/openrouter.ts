import type { PolicyExtracao } from "@contracts/types";
import type { ArquivoPolitica, PolicyParser } from "./parser";
import {
  avisosQualidade,
  mapearRuleset,
  PROMPT_EXTRACAO_POLITICA,
  type RulesetLLM,
} from "./mistral";
import { SCHEMA_RULESET } from "./schemaRuleset";
import { LIMITE_TEXTO_EXTRAIDO_BYTES, truncarUtf8 } from "./texto";

/**
 * Parser de política via OpenRouter (17/09/2026).
 *
 * Entra na frente da cascata porque é o único provedor de chat com saldo:
 * o chat da Mistral está com cota zero e a OpenAI sem crédito. O modelo
 * preferido continua sendo o da OpenAI — `POLICY_OPENROUTER_MODELS` começa
 * por `openai/gpt-4o-mini` —, só que faturado pelo OpenRouter, que faz o
 * fallback nativo para os demais da lista na mesma chamada.
 *
 * Só aceita TEXTO: quem lê o documento é o pré-passo (`ocr.ts`: texto nativo
 * do PDF → PaddleOCR). Sem texto, este parser se declara indisponível e a
 * cascata segue para o OCR anotado da Mistral, que lê o binário.
 *
 * Env:
 *  - OPENROUTER_API_KEY (obrigatória)
 *  - POLICY_OPENROUTER_MODELS (lista ordenada; default openai/gpt-4o-mini)
 *  - POLICY_OPENROUTER_MAX_OUTPUT_TOKENS (default 32 000)
 */

const TIMEOUT_MS = 240_000;

export function modelosPolitica(): string[] {
  const lista = (process.env.POLICY_OPENROUTER_MODELS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return lista.length ? lista : ["openai/gpt-4o-mini"];
}

function maxTokens(): number {
  const valor = Number(process.env.POLICY_OPENROUTER_MAX_OUTPUT_TOKENS ?? 32_000);
  return Number.isInteger(valor) && valor >= 1_000 && valor <= 64_000 ? valor : 32_000;
}

async function comTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), ms);
  try {
    return await fn(controle.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function extrairRuleset(texto: string, apiKey: string): Promise<{ ruleset: RulesetLLM; modelo: string }> {
  const modelos = modelosPolitica();
  const resposta = await comTimeout(
    (signal) =>
      fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: modelos[0],
          ...(modelos.length > 1 ? { models: modelos } : {}),
          temperature: 0.1,
          max_tokens: maxTokens(),
          response_format: {
            type: "json_schema",
            json_schema: { name: "politica_reembolso", strict: true, schema: SCHEMA_RULESET },
          },
          provider: { require_parameters: true, data_collection: "deny" },
          messages: [
            {
              role: "user",
              content: `${PROMPT_EXTRACAO_POLITICA}\n\nDOCUMENTO (texto extraído):\n${texto.slice(0, 120_000)}`,
            },
          ],
        }),
        signal,
      }),
    TIMEOUT_MS
  );
  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`OpenRouter HTTP ${resposta.status}: ${corpo.slice(0, 200)}`);
  }
  const dados = (await resposta.json()) as {
    model?: unknown;
    choices?: { message?: { content?: unknown }; finish_reason?: string }[];
  };
  const escolha = dados.choices?.[0];
  const conteudo = escolha?.message?.content;
  if (typeof conteudo !== "string" || !conteudo.trim())
    throw new Error("OpenRouter sem conteúdo na resposta");
  if (escolha?.finish_reason === "length")
    throw new Error(`OpenRouter cortou a resposta no limite de ${maxTokens()} tokens`);
  const semCercas = conteudo.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  // Com fallback de modelo, quem respondeu pode não ser o primeiro da lista.
  const respondido = typeof dados.model === "string" && dados.model ? dados.model : modelos[0];
  return { ruleset: JSON.parse(semCercas) as RulesetLLM, modelo: respondido };
}

export class OpenRouterPolicyParser implements PolicyParser {
  nome = "openrouter";

  private criarFallback?: () => PolicyParser;

  constructor(criarFallback?: () => PolicyParser) {
    this.criarFallback = criarFallback;
  }

  async extract(input: ArquivoPolitica): Promise<PolicyExtracao> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const ehTexto = (input.mimeType || "").toLowerCase().startsWith("text/");
    const motivoPular = !apiKey
      ? "OPENROUTER_API_KEY ausente"
      : !ehTexto
        ? "documento sem texto local (nenhum OCR gratuito leu)"
        : null;

    if (motivoPular) {
      if (!this.criarFallback) throw new Error(`OpenRouter indisponível: ${motivoPular}.`);
      const resultado = await this.criarFallback().extract(input);
      return {
        ...resultado,
        avisos: [...resultado.avisos, `OpenRouter não usado (${motivoPular}).`],
      };
    }

    const texto = Buffer.from(input.base64, "base64").toString("utf8");
    try {
      const { ruleset, modelo } = await extrairRuleset(texto, apiKey as string);
      const bruto = ruleset.qualidade_extracao?.confianca;
      const confianca = typeof bruto === "number" ? Math.max(0, Math.min(1, bruto)) : 0;
      const { regras, camposPendentes, resumo } = mapearRuleset(ruleset);
      return {
        textoExtraido: truncarUtf8(texto, LIMITE_TEXTO_EXTRAIDO_BYTES),
        regras,
        confiancaExtracao: confianca >= 0.85 ? "alta" : confianca >= 0.7 ? "media" : "baixa",
        camposPendentes,
        provedor: `openrouter:${modelo}`,
        avisos: [resumo.replace(/\n/g, " · "), ...avisosQualidade(ruleset.qualidade_extracao)],
      };
    } catch (erro) {
      if (!this.criarFallback) throw erro;
      const motivo = erro instanceof Error ? erro.message : String(erro);
      const resultado = await this.criarFallback().extract(input);
      return {
        ...resultado,
        avisos: [...resultado.avisos, `OpenRouter indisponível (${motivo}): extração seguiu para ${resultado.provedor}.`],
      };
    }
  }
}
