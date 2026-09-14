import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiPolicyParser } from "./openai";
import { HeuristicPolicyParser } from "./parser";

const input = { arquivoNome: "politica.txt", mimeType: "text/plain", base64: Buffer.from("Política de teste. Comprovantes são obrigatórios.").toString("base64") };
beforeEach(() => vi.stubEnv("OPENAI_API_KEY", "fixture-key"));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("política OpenAI — falhas sanitizadas", () => {
  it("solicita os campos estruturados na mesma chamada e preserva a resposta no contrato", async () => {
    const campo = { grupo: "funcao", nome: "Função", tipo: "selecao", obrigatorio: false, opcoes: ["Solicitante", "Aprovador"], descricao: "Responsabilidade no processo", fonte: "Funções: Solicitante; Aprovador" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify({ regras: [], campos_customizados: [campo] }) })));
    vi.stubGlobal("fetch", fetchMock);
    const resultado = await new OpenAiPolicyParser().extract(input);
    expect(fetchMock).toHaveBeenCalledOnce();
    const pedido = JSON.parse(fetchMock.mock.calls[0]![1].body);
    const schema = pedido.text.format.schema;
    expect(schema.required).toContain("campos_customizados");
    expect(schema.properties.campos_customizados.items.additionalProperties).toBe(false);
    expect(schema.properties.campos_customizados.items.required).toContain("fonte");
    expect(resultado.regras.camposCustomizados[0]).toMatchObject(campo);
    expect(resultado.regras.aprovacaoAutomaticaAte).toBeNull();
  });
  it("corpo HTTP nunca entra nos avisos do fallback", async () => {
    const text = vi.fn().mockResolvedValue("SENTINELA_ERRO_PRIVADO");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, text }));
    const r = await new OpenAiPolicyParser(() => new HeuristicPolicyParser()).extract(input);
    expect(text).not.toHaveBeenCalled();
    expect(r.avisos.join(" ")).toContain("HTTP 429");
    expect(r.confiancaExtracao).toBe("baixa");
    expect(JSON.stringify(r)).not.toContain("SENTINELA_ERRO_PRIVADO");
  });
  it("sem fallback o erro continua genérico", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("SENTINELA_ERRO_PRIVADO")));
    await expect(new OpenAiPolicyParser().extract(input)).rejects.toThrow("falha de transporte ou resposta inválida");
  });
  it("JSON malformado não vaza trecho da política/resposta", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: "{ SENTINELA_ERRO_PRIVADO" }))));
    const r = await new OpenAiPolicyParser(() => new HeuristicPolicyParser()).extract(input);
    expect(r.avisos.join(" ")).toContain("falha de transporte ou resposta inválida");
    expect(JSON.stringify(r)).not.toContain("SENTINELA_ERRO_PRIVADO");
  });
});
