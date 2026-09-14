import { afterEach, describe, expect, it, vi } from "vitest";
import { arquitetarPolitica } from "./arquiteto";

const regra = {
  id: "r1", tema: "alimentacao" as const, categoria: "alimentacao" as const, escopo: "categoria" as const,
  descricao: "Alimentação em viagem", condicao: null, reembolsavel: "sim" as const, valorLimite: 120,
  moeda: "BRL", unidadeLimite: "dia" as const, exigeComprovante: true, exigeDocumentoFiscal: false,
  decisaoAutomatica: "nenhuma" as const,
};

afterEach(() => { vi.unstubAllGlobals(); delete process.env.OPENAI_API_KEY; });

describe("Arquiteto de Política", () => {
  it("retorna rascunho estruturado sem persistir a política", async () => {
    process.env.OPENAI_API_KEY = "synthetic-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify({ resumo: "Limite ajustado.", alteracoes: ["Alterou o limite diário"], regras: [{ ...regra, valorLimite: 150 }] }),
    }), { status: 200 })));
    const result = await arquitetarPolitica({ pedido: "Aumentar para 150", regrasAtuais: [regra] });
    expect(result.regras[0]?.valorLimite).toBe(150);
    expect(result.alteracoes).toEqual(["Alterou o limite diário"]);
  });

  it("não opera sem a chave do runtime", async () => {
    await expect(arquitetarPolitica({ pedido: "Ajustar alimentação", regrasAtuais: [regra] })).rejects.toThrow(/OPENAI_API_KEY/);
  });
});
