import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPolicyParser, HeuristicPolicyParser } from "./parser";

/**
 * Parser heurístico da política (v1.4.3).
 * Fixture: documento fictício de política de reembolso (SP) com camada de texto —
 * antes desta versão o parser tratava PDF como binário e não extraía nada.
 */
const FIXTURE_PDF = path.join(
  __dirname,
  "__fixtures__",
  "politica-reembolso-sp.pdf",
);

function pdfBase64(): string {
  return readFileSync(FIXTURE_PDF).toString("base64");
}

const parser = new HeuristicPolicyParser();

describe("HeuristicPolicyParser — PDF com camada de texto", () => {
  it("extrai o texto do PDF (não trata como binário)", async () => {
    const r = await parser.extract({
      arquivoNome: "politica-reembolso-sp.pdf",
      mimeType: "application/pdf",
      base64: pdfBase64(),
    });
    expect(r.textoExtraido).toBeTruthy();
    expect(r.textoExtraido).toContain("POLÍTICA DE REEMBOLSO");
    expect(r.confiancaExtracao).not.toBe("baixa");
  });

  it("extrai tetos por categoria da tabela de limites", async () => {
    const r = await parser.extract({
      arquivoNome: "politica-reembolso-sp.pdf",
      mimeType: "application/pdf",
      base64: pdfBase64(),
    });
    // "Almoço (Dia a dia) Até R$ 55,00 / dia" → alimentacao 55 (1º valor)
    expect(r.regras.limitesPorCategoria.alimentacao).toBe(55);
    // "Hospedagem (Diária c/ café) Até R$ 450,00 / noite" → hospedagem 450
    expect(r.regras.limitesPorCategoria.hospedagem).toBe(450);
  });

  it("NÃO contamina combustível com a tarifa por km (R$ 1,30/km)", async () => {
    const r = await parser.extract({
      arquivoNome: "politica-reembolso-sp.pdf",
      mimeType: "application/pdf",
      base64: pdfBase64(),
    });
    expect(r.regras.limitesPorCategoria.combustivel).toBeUndefined();
    // A tarifa por km aparece como observação, não como teto
    expect(
      r.regras.observacoes.some((o) => /tarifa\/km|quilometragem/i.test(o)),
    ).toBe(true);
  });

  it("registra variações de teto como observação (jantar, refeição c/ cliente)", async () => {
    const r = await parser.extract({
      arquivoNome: "politica-reembolso-sp.pdf",
      mimeType: "application/pdf",
      base64: pdfBase64(),
    });
    expect(
      r.regras.observacoes.some((o) => /varia[çc][ãa]o de teto/i.test(o)),
    ).toBe(true);
  });

  it("marca exigência de evidência em alimentação (nota fiscal discriminada)", async () => {
    const r = await parser.extract({
      arquivoNome: "politica-reembolso-sp.pdf",
      mimeType: "application/pdf",
      base64: pdfBase64(),
    });
    expect(r.regras.exigeEvidencia).toContain("alimentacao");
  });

  it("mantém tetos globais pendentes quando o documento não os define", async () => {
    const r = await parser.extract({
      arquivoNome: "politica-reembolso-sp.pdf",
      mimeType: "application/pdf",
      base64: pdfBase64(),
    });
    expect(r.regras.aprovacaoAutomaticaAte).toBeNull();
    expect(r.camposPendentes).toContain("aprovacaoAutomaticaAte");
    expect(r.camposPendentes).toContain("revisaoHumanaAcimaDe");
    expect(r.camposPendentes).toContain("negacaoAcimaDe");
    expect(r.avisos.length).toBeGreaterThan(0);
  });
});

describe("HeuristicPolicyParser — demais formatos", () => {
  it("texto puro: extrai limite na mesma linha da categoria", async () => {
    const texto =
      "Política de reembolso\nAlimentação: até R$ 120,00 por dia\n" +
      "Hospedagem até R$ 450,00 a diária\n" +
      "Aprovação automática até R$ 200,00\n";
    const r = await parser.extract({
      arquivoNome: "politica.txt",
      mimeType: "text/plain",
      base64: Buffer.from(texto, "utf8").toString("base64"),
    });
    expect(r.regras.limitesPorCategoria.alimentacao).toBe(120);
    expect(r.regras.limitesPorCategoria.hospedagem).toBe(450);
    expect(r.regras.aprovacaoAutomaticaAte).toBe(200);
  });

  it("binário sem texto (imagem) → baixa confiança e tudo pendente", async () => {
    const r = await parser.extract({
      arquivoNome: "politica.jpeg",
      mimeType: "image/jpeg",
      base64: Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(500).fill(0x11)]).toString(
        "base64",
      ),
    });
    expect(r.textoExtraido).toBeNull();
    expect(r.confiancaExtracao).toBe("baixa");
    expect(r.camposPendentes).toContain("limitesPorCategoria");
    expect(r.camposPendentes).toContain("negacaoAcimaDe");
  });
});

describe("OpenAiPolicyParser", () => {
  it("seleciona OpenAI, anexa o PDF na Responses API e mantém saída estruturada", async () => {
    const fetchOriginal = globalThis.fetch;
    const providerOriginal = process.env.POLICY_PROVIDER;
    const chaveOriginal = process.env.OPENAI_API_KEY;
    const modeloOriginal = process.env.POLICY_OPENAI_MODEL;
    process.env.POLICY_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "chave-de-teste";
    process.env.POLICY_OPENAI_MODEL = "modelo-de-teste";
    const chamadas: { url: string; corpo: Record<string, unknown> }[] = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      chamadas.push({ url: String(url), corpo: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return {
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            politica: { titulo: "Viagens", vigencia: null, moeda_padrao: "BRL" },
            qualidade_extracao: { legivel: true, confianca: 0.9, paginas_com_problema: [], observacoes: "" },
            regras: [{
              id: "almoco", tema: "alimentacao", categoria: "alimentacao", alcance: "categoria",
              descricao: "Almoço até R$ 50", condicao: null, reembolsavel: "sim", valor_limite: 50,
              moeda: "BRL", unidade_limite: "dia", exige_comprovante: true,
            }],
            ambiguidades: [],
          }),
        }),
      } as unknown as Response;
    }) as typeof globalThis.fetch;

    try {
      const resultado = await getPolicyParser().extract({
        arquivoNome: "politica.pdf",
        mimeType: "application/pdf",
        base64: "cGRmLWRlLXRlc3Rl",
      });
      expect(chamadas).toHaveLength(1);
      expect(chamadas[0].url).toBe("https://api.openai.com/v1/responses");
      expect(chamadas[0].corpo.model).toBe("modelo-de-teste");
      expect(chamadas[0].corpo.store).toBe(false);
      expect(resultado.provedor).toBe("openai:modelo-de-teste");
      expect(resultado.regras.limitesPorCategoria.alimentacao).toBe(50);
      expect(resultado.confiancaExtracao).toBe("alta");
    } finally {
      globalThis.fetch = fetchOriginal;
      if (providerOriginal === undefined) delete process.env.POLICY_PROVIDER;
      else process.env.POLICY_PROVIDER = providerOriginal;
      if (chaveOriginal === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = chaveOriginal;
      if (modeloOriginal === undefined) delete process.env.POLICY_OPENAI_MODEL;
      else process.env.POLICY_OPENAI_MODEL = modeloOriginal;
    }
  });
});
