import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPolicyParser } from "./parser";

/**
 * Ordem da cascata decidida em 17/09/2026:
 *
 *   PaddleOCR (pré-passo) → [texto?] → OpenRouter → OpenAI → heurístico
 *                        → [sem texto] → OCR anotado da Mistral → …
 *
 * O chat da Mistral saiu da cascata: o workspace tem cota de OCR, não de chat.
 * Cada teste afirma QUAIS endpoints foram chamados — é onde está o dinheiro.
 */

const RULESET = {
  politica: { titulo: "Viagens", vigencia: null, moeda_padrao: "BRL" },
  qualidade_extracao: { legivel: true, confianca: 0.9, paginas_com_problema: [], observacoes: "" },
  regras: [{
    id: "almoco", tema: "alimentacao", categoria: "alimentacao", alcance: "categoria",
    descricao: "Almoço até R$ 50", condicao: null, reembolsavel: "sim", valor_limite: 50,
    moeda: "BRL", unidade_limite: "dia", exige_comprovante: true,
  }],
  ambiguidades: [],
};

const TEXTO = {
  arquivoNome: "politica.txt",
  mimeType: "text/plain",
  base64: Buffer.from("Alimentação: até R$ 50 por dia").toString("base64"),
};
const ESCANEADO = { arquivoNome: "politica.pdf", mimeType: "application/pdf", base64: "cGRmLWRlLXRlc3Rl" };

const ENV = ["POLICY_PROVIDER", "MISTRAL_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY",
  "POLICY_OPENROUTER_MODELS", "POLICY_OCR_URL", "OCR_LOCAL_URL"] as const;

describe("cascata da política: OCR local → Mistral OCR → OpenRouter → OpenAI → heurístico", () => {
  const fetchOriginal = globalThis.fetch;
  let anterior: Record<string, string | undefined>;
  let rotas: string[];
  let falhar: Set<string>;

  beforeEach(() => {
    anterior = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
    for (const k of ENV) delete process.env[k];
    process.env.POLICY_PROVIDER = "mistral";
    rotas = [];
    falhar = new Set();
    globalThis.fetch = (async (url: string | URL) => {
      const u = new URL(String(url));
      const rota = `${u.host}${u.pathname}`;
      rotas.push(rota);
      const json = (status: number, corpo: unknown) =>
        ({ ok: status >= 200 && status < 300, status, json: async () => corpo, text: async () => JSON.stringify(corpo) }) as unknown as Response;
      if (falhar.has(rota)) return json(429, { error: "sem cota" });
      if (rota === "api.mistral.ai/v1/ocr")
        return json(200, { pages: [{ markdown: "texto lido pelo OCR da Mistral" }], document_annotation: JSON.stringify(RULESET) });
      if (rota === "openrouter.ai/api/v1/chat/completions")
        return json(200, { model: "openai/gpt-4o-mini", choices: [{ message: { content: JSON.stringify(RULESET) }, finish_reason: "stop" }] });
      if (rota === "api.openai.com/v1/responses")
        return json(200, { output_text: JSON.stringify(RULESET) });
      throw new Error(`chamada inesperada: ${rota}`);
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    for (const k of ENV) {
      if (anterior[k] === undefined) delete process.env[k];
      else process.env[k] = anterior[k];
    }
  });

  it("com texto local: OpenRouter estrutura, a Mistral nem é chamada", async () => {
    process.env.OPENROUTER_API_KEY = "chave-or";
    process.env.MISTRAL_API_KEY = "chave-mistral";
    const r = await getPolicyParser().extract(TEXTO);
    expect(rotas).toEqual(["openrouter.ai/api/v1/chat/completions"]);
    expect(r.provedor).toBe("openrouter:openai/gpt-4o-mini");
    expect(r.regras.limitesPorCategoria.alimentacao).toBe(50);
  });

  it("sem texto local: OCR anotado da Mistral lê o documento e devolve as regras", async () => {
    process.env.OPENROUTER_API_KEY = "chave-or";
    process.env.MISTRAL_API_KEY = "chave-mistral";
    const r = await getPolicyParser().extract(ESCANEADO);
    expect(rotas).toEqual(["api.mistral.ai/v1/ocr"]);
    expect(r.provedor).toMatch(/^mistral-ocr:/);
  });

  it("OCR da Mistral sem cota: cai no OpenRouter, e depois na OpenAI", async () => {
    process.env.MISTRAL_API_KEY = "chave-mistral";
    process.env.OPENROUTER_API_KEY = "chave-or";
    process.env.OPENAI_API_KEY = "chave-openai";
    falhar.add("api.mistral.ai/v1/ocr");
    falhar.add("openrouter.ai/api/v1/chat/completions");
    const r = await getPolicyParser().extract(ESCANEADO);
    expect(rotas).toEqual([
      "api.mistral.ai/v1/ocr",
      // OpenRouter só lê texto; sem texto local ele se declara indisponível e passa adiante
      "api.openai.com/v1/responses",
    ]);
    expect(r.provedor).toMatch(/^openai:/);
  });

  it("todos fora: heurístico responde e o upload não trava", async () => {
    process.env.MISTRAL_API_KEY = "chave-mistral";
    process.env.OPENROUTER_API_KEY = "chave-or";
    falhar.add("api.mistral.ai/v1/ocr");
    falhar.add("openrouter.ai/api/v1/chat/completions");
    const r = await getPolicyParser().extract(TEXTO);
    expect(r.provedor).toBe("heuristico-local");
    expect(r.regras.limitesPorCategoria.alimentacao).toBe(50);
    expect(r.avisos.some(a => /OpenRouter indisponível/.test(a))).toBe(true);
  });

  it("sem nenhuma chave: ninguém é chamado, heurístico assume", async () => {
    const r = await getPolicyParser().extract(TEXTO);
    expect(rotas).toEqual([]);
    expect(r.provedor).toBe("heuristico-local");
  });
});
