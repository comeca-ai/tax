import { describe, expect, it } from "vitest";
import { extrairAnnotationMistral, normalizarExtracaoIA, VisaoOcrProvider } from "./visao";
import type { OcrProvider } from "./index";

describe("normalizarExtracaoIA", () => {
  it("normaliza JSON completo da IA", () => {
    const r = normalizarExtracaoIA({
      cnpjEmitente: "13.759.045/0002-77",
      valor: 90.14,
      dataFatoGerador: "2026-05-24",
      litros: null,
      categoriaSugerida: "alimentacao",
      consumidorIdentificado: false,
      resumoItens: "mercearia",
      confianca: "alta",
    });
    expect(r.valor).toBe(90.14);
    expect(r.categoriaSugerida).toBe("alimentacao");
    expect(r.consumidorIdentificado).toBe(false);
  });

  it("aceita valor em string BR e data dd/mm/aaaa", () => {
    const r = normalizarExtracaoIA({ valor: "1.234,56", dataFatoGerador: "24/05/2026" });
    expect(r.valor).toBe(1234.56);
    expect(r.dataFatoGerador).toBe("2026-05-24");
  });

  it("rejeita categoria fora do enum (mercado não é alimentação)", () => {
    const r = normalizarExtracaoIA({ categoriaSugerida: "mercearia" });
    expect(r.categoriaSugerida).toBeNull();
  });

  it("rejeita valor inválido/absurdo", () => {
    expect(normalizarExtracaoIA({ valor: -5 }).valor).toBeNull();
    expect(normalizarExtracaoIA({ valor: "abc" }).valor).toBeNull();
    expect(normalizarExtracaoIA({ valor: 99_000_000 }).valor).toBeNull();
  });

  it("confiança desconhecida vira baixa", () => {
    expect(normalizarExtracaoIA({ confianca: "altíssima" }).confianca).toBe("baixa");
  });

  it("payload vazio → tudo null, sem explodir", () => {
    const r = normalizarExtracaoIA(null);
    expect(r).toMatchObject({
      cnpjEmitente: null,
      valor: null,
      dataFatoGerador: null,
      categoriaSugerida: null,
      confianca: "baixa",
      tipoDocumento: null,
      confiancaTipo: null,
    });
  });

  it("preserva tipoDocumento e confiancaTipo válidos", () => {
    const r = normalizarExtracaoIA({ tipoDocumento: "extrato_conta", confiancaTipo: "alta" });
    expect(r.tipoDocumento).toBe("extrato_conta");
    expect(r.confiancaTipo).toBe("alta");
  });

  it("tipoDocumento fora do enum vira null", () => {
    expect(normalizarExtracaoIA({ tipoDocumento: "boleto" }).tipoDocumento).toBeNull();
  });

  it("confiancaTipo fora do enum vira null", () => {
    expect(normalizarExtracaoIA({ confiancaTipo: "altíssima" }).confiancaTipo).toBeNull();
  });
});

describe("extrairAnnotationMistral", () => {
  it("aceita document_annotation como string JSON", () => {
    const a = extrairAnnotationMistral({
      document_annotation: '{"valor":90.14,"confianca":"alta"}',
    });
    expect(a).toMatchObject({ valor: 90.14 });
  });

  it("remove cercas de código markdown da string", () => {
    const a = extrairAnnotationMistral({
      document_annotation: '```json\n{"valor":90.14}\n```',
    });
    expect(a).toMatchObject({ valor: 90.14 });
  });

  it("aceita document_annotation como objeto", () => {
    const obj = { valor: 90.14 };
    expect(extrairAnnotationMistral({ document_annotation: obj })).toBe(obj);
  });

  it("sem document_annotation (ou string vazia) lança", () => {
    expect(() => extrairAnnotationMistral({})).toThrow("document_annotation");
    expect(() => extrairAnnotationMistral({ document_annotation: "  " })).toThrow(
      "document_annotation",
    );
  });
});

describe("VisaoOcrProvider", () => {
  const fallback: OcrProvider = {
    nome: "fake-texto",
    extrair: async () => ({
      cnpjEmitente: "11.111.111/0001-11",
      cfop: null, ncm: null, cst: null,
      valor: 10,
      dataFatoGerador: "2026-01-01",
      litros: null,
      categoriaSugerida: "combustivel",
      confiancaExtracao: "alta",
      camposPendentes: [],
      provedor: "fake-texto",
      avisos: [],
    }),
  };

  it("delega XML ao provider de texto (não gasta IA)", async () => {
    const p = new VisaoOcrProvider(fallback);
    const r = await p.extrair({
      arquivoNome: "nota.xml",
      arquivoMime: "application/xml",
      arquivoBase64: Buffer.from("<NFe/>").toString("base64"),
    });
    expect(r.provedor).toBe("fake-texto");
    expect(r.valor).toBe(10);
  });

  it("o modelo do Mistral OCR vem de MISTRAL_OCR_MODEL (a mesma env do parser de política)", async () => {
    const fetchOriginal = globalThis.fetch;
    const chaveOriginal = process.env.MISTRAL_API_KEY;
    const modeloOriginal = process.env.MISTRAL_OCR_MODEL;
    process.env.MISTRAL_API_KEY = "chave-de-teste";
    process.env.MISTRAL_OCR_MODEL = "mistral-ocr-2505";
    const chamadas: { url: string; model: string }[] = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const corpo = JSON.parse(String(init?.body)) as { model: string };
      chamadas.push({ url: String(url), model: corpo.model });
      return {
        ok: true,
        json: async () => ({
          document_annotation:
            '{"valor":90.14,"dataFatoGerador":"2026-05-24","categoriaSugerida":"alimentacao","confianca":"alta","tipoDocumento":"nota_fiscal","confiancaTipo":"alta"}',
        }),
      } as unknown as Response;
    }) as typeof globalThis.fetch;
    try {
      const p = new VisaoOcrProvider(fallback);
      const r = await p.extrair({
        arquivoNome: "cupom.jpg",
        arquivoMime: "image/jpeg",
        arquivoBase64: Buffer.from([0xff, 0xd8, 0xff]).toString("base64"),
      });
      expect(chamadas).toHaveLength(1);
      expect(chamadas[0].url).toContain("api.mistral.ai");
      expect(chamadas[0].model).toBe("mistral-ocr-2505");
      expect(r.provedor).toBe("visao-ia:mistral");
      expect(r.tipoDocumento).toBe("nota_fiscal");
      expect(r.confiancaTipo).toBe("alta");
    } finally {
      globalThis.fetch = fetchOriginal;
      if (chaveOriginal === undefined) delete process.env.MISTRAL_API_KEY;
      else process.env.MISTRAL_API_KEY = chaveOriginal;
      if (modeloOriginal === undefined) delete process.env.MISTRAL_OCR_MODEL;
      else process.env.MISTRAL_OCR_MODEL = modeloOriginal;
    }
  });

  it("sem chaves de IA, imagem degrada para revisão manual (nunca trava)", async () => {
    delete process.env.MISTRAL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const p = new VisaoOcrProvider(fallback);
    const r = await p.extrair({
      arquivoNome: "cupom.jpg",
      arquivoMime: "image/jpeg",
      arquivoBase64: Buffer.from([0xff, 0xd8, 0xff]).toString("base64"),
    });
    expect(r.confiancaExtracao).toBe("baixa");
    expect(r.camposPendentes).toContain("valor");
    expect(r.avisos[0]).toContain("revisão manual");
    expect(r.avisos[0]).toContain("mistral");
    expect(r.avisos[0]).toContain("openai");
  });
});
