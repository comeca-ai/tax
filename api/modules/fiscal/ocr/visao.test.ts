import { describe, expect, it } from "vitest";
import { normalizarExtracaoIA, VisaoOcrProvider } from "./visao";
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
    });
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

  it("sem chaves de IA, imagem degrada para revisão manual (nunca trava)", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const p = new VisaoOcrProvider(fallback);
    const r = await p.extrair({
      arquivoNome: "cupom.jpg",
      arquivoMime: "image/jpeg",
      arquivoBase64: Buffer.from([0xff, 0xd8, 0xff]).toString("base64"),
    });
    expect(r.confiancaExtracao).toBe("baixa");
    expect(r.camposPendentes).toContain("valor");
    expect(r.avisos[0]).toContain("revisão manual");
  });
});
