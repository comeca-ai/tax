import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizarExtracaoIA, VisaoOcrProvider } from "./visao";
import { HeuristicOcrProvider } from "./index";

const arquivo = { arquivoNome: "fixture.png", arquivoMime: "image/png", arquivoBase64: "Zml4dHVyZQ==" };
const chave = "35260912345678000123550010000000011000000001000".slice(0, 44);
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "fixture-key");
  vi.stubEnv("MISTRAL_API_KEY", "");
  vi.stubEnv("OCR_VISION_PROVIDER", "openai");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("OCR combustível — identidade fiscal explícita", () => {
  it("preserva destinatário e chave completa sem copiar emitente", () => {
    const r = normalizarExtracaoIA({ cnpjEmitente: "98.765.432/0001-99", cnpjDestinatario: "12.345.678/0001-23", chaveAcesso: chave.match(/.{1,4}/g)!.join(" ") });
    expect(r.cnpjEmitente).toBe("98.765.432/0001-99");
    expect(r.cnpjDestinatario).toBe("12345678000123");
    expect(r.chaveAcesso).toBe(chave);
    expect(normalizarExtracaoIA({ cnpjEmitente: "12.345.678/0001-23" }).cnpjDestinatario).toBeNull();
  });
  it.each([null, "123.456.789-00", "CNPJ desconhecido", "1234567800012", 12345678000123])("não transforma CPF/ausência/número em CNPJ: %j", cnpjDestinatario => {
    expect(normalizarExtracaoIA({ cnpjDestinatario }).cnpjDestinatario).toBeNull();
  });
  it.each([null, "123", "1".repeat(43), "1".repeat(45), `${"1".repeat(43)}?`, Number("12345678901234567890")])("não completa ou reconstrói chave parcial: %j", chaveAcesso => {
    expect(normalizarExtracaoIA({ chaveAcesso }).chaveAcesso).toBeNull();
  });
  it("contrato Responses requer os campos nullable e devolve extração", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify({ cnpjEmitente: "98.765.432/0001-99", cnpjDestinatario: "12345678000123", chaveAcesso: chave, valor: 100, litros: 20, dataFatoGerador: "2026-09-13", categoriaSugerida: "combustivel", confianca: "alta" }) })));
    vi.stubGlobal("fetch", fetchMock);
    const r = await new VisaoOcrProvider(new HeuristicOcrProvider()).extrair(arquivo);
    expect(r).toMatchObject({ cnpjDestinatario: "12345678000123", chaveAcesso: chave });
    expect(r.camposPendentes).not.toContain("chaveAcesso");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema.required).toEqual(expect.arrayContaining(["cnpjDestinatario", "chaveAcesso"]));
    expect(body.text.format.schema.properties.chaveAcesso.type).toEqual(["string", "null"]);
    expect(body.input[0].content[0].text).toContain("não reconstrua dígitos");
  });
  it("combustível incompleto conserva campos pendentes sem barrar contrato legado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify({ categoriaSugerida: "combustivel", cnpjEmitente: "98.765.432/0001-99" }) }))));
    const r = await new VisaoOcrProvider(new HeuristicOcrProvider()).extrair(arquivo);
    expect(r).toMatchObject({ cnpjDestinatario: null, chaveAcesso: null });
    expect(r.camposPendentes).toEqual(expect.arrayContaining(["cnpjDestinatario", "chaveAcesso", "litros"]));
  });
});

describe("OCR — falhas externas sanitizadas", () => {
  it("não lê nem devolve corpo de erro HTTP do provedor", async () => {
    const text = vi.fn().mockResolvedValue("SENTINELA_ERRO_PRIVADO");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text }));
    const r = await new VisaoOcrProvider(new HeuristicOcrProvider()).extrair(arquivo);
    expect(text).not.toHaveBeenCalled();
    expect(r.avisos.join(" ")).toContain("HTTP 401");
    expect(JSON.stringify(r)).not.toContain("SENTINELA_ERRO_PRIVADO");
  });
  it("sanitiza também HTTP Mistral sem alterar fallback", async () => {
    vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("MISTRAL_API_KEY", "fixture-key");
    vi.stubEnv("OCR_VISION_PROVIDER", "mistral");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("SENTINELA_ERRO_PRIVADO", { status: 403 })));
    const r = await new VisaoOcrProvider(new HeuristicOcrProvider()).extrair(arquivo);
    expect(r.avisos.join(" ")).toContain("HTTP 403");
    expect(JSON.stringify(r)).not.toContain("SENTINELA_ERRO_PRIVADO");
  });
  it("erro de transporte ou JSON não revela mensagem bruta", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("SENTINELA_ERRO_PRIVADO")));
    const r = await new VisaoOcrProvider(new HeuristicOcrProvider()).extrair(arquivo);
    expect(r.avisos.join(" ")).toContain("falha de transporte ou resposta inválida");
    expect(JSON.stringify(r)).not.toContain("SENTINELA_ERRO_PRIVADO");
  });
  it("resposta incompleta não expõe incomplete_details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "incomplete", incomplete_details: { reason: "SENTINELA_ERRO_PRIVADO" }, output: [] }))));
    const r = await new VisaoOcrProvider(new HeuristicOcrProvider()).extrair(arquivo);
    expect(r.avisos.join(" ")).toContain("resposta sem conteúdo utilizável");
    expect(JSON.stringify(r)).not.toContain("SENTINELA_ERRO_PRIVADO");
  });
});
