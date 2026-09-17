import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPolicyParser } from "./parser";
import { prepararTexto } from "./ocr";

/**
 * Pré-passo de texto (ocr.ts) visto pelo consumidor real: `getPolicyParser()`
 * com POLICY_PROVIDER=mistral. Cada teste afirma QUAIS chamadas externas
 * aconteceram — o dinheiro está aí, não no texto devolvido.
 */

const SIDECAR = "http://127.0.0.1:4191";
const TOKEN = "token-do-sidecar";

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

type Chamada = { host: string; path: string; auth: string | null; corpo: string };

/** PDF "escaneado" para os testes: bytes que não são PDF → pdf-parse falha → sem texto nativo. */
const ESCANEADO = { arquivoNome: "politica-escaneada.pdf", mimeType: "application/pdf", base64: "cGRmLWRlLXRlc3Rl" };

const ENV = ["POLICY_PROVIDER", "MISTRAL_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "POLICY_OPENROUTER_MODELS", "POLICY_OCR_URL", "POLICY_OCR_TOKEN", "POLICY_OCR_TIMEOUT_MS"] as const;

describe("pré-passo de texto no upload da política", () => {
  const fetchOriginal = globalThis.fetch;
  let anterior: Record<string, string | undefined>;
  let chamadas: Chamada[];
  let sidecar: { status: number; corpo: unknown };

  function instalarFetch() {
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      const headers = new Headers(init?.headers);
      chamadas.push({ host: u.host, path: u.pathname, auth: headers.get("authorization"), corpo: String(init?.body ?? "") });
      const json = (status: number, corpo: unknown) =>
        ({ ok: status >= 200 && status < 300, status, json: async () => corpo, text: async () => JSON.stringify(corpo) }) as unknown as Response;
      if (u.host === "127.0.0.1:4191") return json(sidecar.status, sidecar.corpo);
      if (u.host === "api.mistral.ai" && u.pathname === "/v1/ocr")
        return json(200, { pages: [{ markdown: "texto do OCR pago da Mistral" }], document_annotation: JSON.stringify(RULESET) });
      if (u.host === "openrouter.ai" && u.pathname === "/api/v1/chat/completions")
        return json(200, { model: "openai/gpt-4o-mini", choices: [{ message: { content: JSON.stringify(RULESET) }, finish_reason: "stop" }] });
      throw new Error(`chamada inesperada: ${u.host}${u.pathname}`);
    }) as typeof globalThis.fetch;
  }

  beforeEach(() => {
    anterior = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
    process.env.POLICY_PROVIDER = "mistral";
    process.env.MISTRAL_API_KEY = "chave-mistral";
    process.env.OPENROUTER_API_KEY = "chave-openrouter";
    delete process.env.POLICY_OPENROUTER_MODELS;
    delete process.env.OPENAI_API_KEY;
    process.env.POLICY_OCR_URL = SIDECAR;
    process.env.POLICY_OCR_TOKEN = TOKEN;
    delete process.env.POLICY_OCR_TIMEOUT_MS;
    chamadas = [];
    sidecar = { status: 200, corpo: { texto: "Alimentação: teto R$ 50 por dia", paginas: [{}, {}], segundos: 1.2, motor: "paddleocr 3.7.0" } };
    instalarFetch();
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    for (const k of ENV) {
      if (anterior[k] === undefined) delete process.env[k];
      else process.env[k] = anterior[k];
    }
  });

  const rotas = () => chamadas.map(c => `${c.host}${c.path}`);

  it("escaneado + sidecar no ar: OCR local, depois só o chat barato — nenhum OCR pago", async () => {
    const r = await getPolicyParser().extract(ESCANEADO);
    expect(rotas()).toEqual(["127.0.0.1:4191/ocr", "openrouter.ai/api/v1/chat/completions"]);
    expect(chamadas[0].auth).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(chamadas[0].corpo)).toEqual(ESCANEADO);
    // o texto do Paddle foi o que chegou ao LLM
    expect(chamadas[1].corpo).toContain("Alimentação: teto R$ 50 por dia");
    expect(r.provedor).toBe("openrouter:openai/gpt-4o-mini");
    expect(r.regras.limitesPorCategoria.alimentacao).toBe(50);
    expect(r.avisos[0]).toMatch(/^OCR local \(paddleocr 3\.7\.0, 2 página\(s\), 1\.2s\)/);
  });

  it("sidecar fora (503): OCR anotado da Mistral lê e estrutura numa chamada só", async () => {
    sidecar = { status: 503, corpo: { error: "servico_fechado" } };
    const r = await getPolicyParser().extract(ESCANEADO);
    expect(rotas()).toEqual(["127.0.0.1:4191/ocr", "api.mistral.ai/v1/ocr"]);
    // o pedido leva o JSON Schema: é o OCR que devolve as regras, sem passar pelo chat
    expect(chamadas[1].corpo).toContain("document_annotation_format");
    expect(r.avisos[0]).toMatch(/^OCR local indisponível \(HTTP 503\): OCR do provedor de IA usado/);
    expect(r.provedor).toMatch(/^mistral-ocr:/);
    expect(r.regras.limitesPorCategoria.alimentacao).toBe(50);
  });

  it("sidecar devolve texto vazio: tratado como falha, OCR pago assume", async () => {
    sidecar = { status: 200, corpo: { texto: "   ", paginas: [] } };
    const r = await getPolicyParser().extract(ESCANEADO);
    expect(rotas()).toEqual(["127.0.0.1:4191/ocr", "api.mistral.ai/v1/ocr"]);
    expect(r.avisos[0]).toMatch(/OCR local indisponível \(texto vazio\)/);
  });

  it("sem OCR local configurado: OCR anotado da Mistral assume o documento", async () => {
    delete process.env.POLICY_OCR_URL;
    const r = await getPolicyParser().extract(ESCANEADO);
    expect(rotas()).toEqual(["api.mistral.ai/v1/ocr"]);
    expect(r.avisos.some(a => /OCR local/.test(a))).toBe(false);
    expect(r.provedor).toMatch(/^mistral-ocr:/);
  });

  it("PDF com texto nativo: zero OCR de qualquer tipo, direto ao chat", async () => {
    const pdf = readFileSync(new URL("./__fixtures__/politica-reembolso-sp.pdf", import.meta.url));
    const r = await getPolicyParser().extract({
      arquivoNome: "politica-reembolso-sp.pdf",
      mimeType: "application/pdf",
      base64: pdf.toString("base64"),
    });
    expect(rotas()).toEqual(["openrouter.ai/api/v1/chat/completions"]);
    expect(r.avisos[0]).toMatch(/^Texto nativo do PDF \(\d+ página\(s\)\); nenhum OCR foi necessário\./);
  });

  it("arquivo text/*: pré-passo não faz nada", async () => {
    const r = await getPolicyParser().extract({
      arquivoNome: "politica.txt",
      mimeType: "text/plain",
      base64: Buffer.from("Alimentação: R$ 50 por dia").toString("base64"),
    });
    expect(rotas()).toEqual(["openrouter.ai/api/v1/chat/completions"]);
    expect(r.avisos.some(a => /OCR local|Texto nativo/.test(a))).toBe(false);
  });

  it("prepararTexto devolve text/plain com o texto do OCR em base64 e preserva o nome do arquivo", async () => {
    const p = await prepararTexto(ESCANEADO);
    expect(p.origem).toBe("paddle");
    expect(p.input.mimeType).toBe("text/plain");
    expect(p.input.arquivoNome).toBe(ESCANEADO.arquivoNome);
    expect(Buffer.from(p.input.base64, "base64").toString("utf8")).toBe("Alimentação: teto R$ 50 por dia");
  });
});
