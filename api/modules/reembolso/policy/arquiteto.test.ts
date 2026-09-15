import { afterEach, describe, expect, it, vi } from "vitest";
import { ReservaConsultaPocIndisponivel } from "../../../lib/pocConsultas";
import { arquitetarPolitica, ErroArquitetoPolitica } from "./arquiteto";

const regra = {
  id: "r1", tema: "alimentacao" as const, categoria: "alimentacao" as const, escopo: "categoria" as const,
  descricao: "Alimentação em viagem", condicao: null, reembolsavel: "sim" as const, valorLimite: 120,
  moeda: "BRL", unidadeLimite: "dia" as const, exigeComprovante: true, exigeDocumentoFiscal: false,
  decisaoAutomatica: "nenhuma" as const,
};

const rascunho = {
  resumo: "Limite ajustado.",
  alteracoes: ["Alterou o limite diário"],
  regras: [{ ...regra, valorLimite: 150 }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.POLICY_OPENAI_MODEL;
  delete process.env.POLICY_OPENROUTER_MODEL;
  delete process.env.POLICY_ARCHITECT_MAX_OUTPUT_TOKENS;
  delete process.env.POLICY_OPENROUTER_MAX_OUTPUT_TOKENS;
});

describe("Arquiteto de Política", () => {
  it("retorna rascunho estruturado pela OpenAI sem persistir a política", async () => {
    process.env.OPENAI_API_KEY = "synthetic-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify(rascunho),
    }), { status: 200 })));
    const result = await arquitetarPolitica({ pedido: "Aumentar para 150", regrasAtuais: [regra] });
    expect(result.regras[0]?.valorLimite).toBe(150);
    expect(result.alteracoes).toEqual(["Alterou o limite diário"]);
    const requisicao = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    expect(requisicao.max_output_tokens).toBe(8_000);
    expect(requisicao.store).toBe(false);
  });

  it("usa OpenRouter com modelo simples quando a OpenAI não está configurada", async () => {
    process.env.OPENROUTER_API_KEY = "synthetic-openrouter-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(rascunho) } }],
    }), { status: 200 })));

    const result = await arquitetarPolitica({ pedido: "Aumentar para 150", regrasAtuais: [regra] });

    expect(result.modelo).toBe("openrouter:openrouter/free");
    expect(fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.any(Object)
    );
    const requisicao = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    expect(requisicao).toMatchObject({
      model: "openrouter/free",
      max_tokens: 4_000,
      provider: { require_parameters: true, data_collection: "deny" },
      response_format: { type: "json_schema", json_schema: { strict: true } },
    });
  });

  it("aciona OpenRouter depois de falha da OpenAI", async () => {
    process.env.OPENAI_API_KEY = "synthetic-key";
    process.env.OPENROUTER_API_KEY = "synthetic-openrouter-key";
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(rascunho) } }],
      }), { status: 200 })));

    const result = await arquitetarPolitica({ pedido: "Aumentar para 150", regrasAtuais: [regra] });

    expect(result.modelo).toBe("openrouter:openrouter/free");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("não opera sem nenhuma chave do runtime", async () => {
    await expect(arquitetarPolitica({ pedido: "Ajustar alimentação", regrasAtuais: [regra] }))
      .rejects.toThrow(/OPENAI_API_KEY e OPENROUTER_API_KEY/);
  });

  it("classifica limite do provedor sem repetir a chamada quando não há fallback", async () => {
    process.env.OPENAI_API_KEY = "synthetic-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
    await expect(
      arquitetarPolitica({ pedido: "Ajustar alimentação", regrasAtuais: [regra] })
    ).rejects.toMatchObject({ tipo: "limite" } satisfies Partial<ErroArquitetoPolitica>);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("não tenta fallback quando o ledger compartilhado bloqueia a chamada", async () => {
    process.env.OPENAI_API_KEY = "synthetic-key";
    process.env.OPENROUTER_API_KEY = "synthetic-openrouter-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new ReservaConsultaPocIndisponivel()));
    await expect(
      arquitetarPolitica({ pedido: "Ajustar alimentação", regrasAtuais: [regra] })
    ).rejects.toBeInstanceOf(ReservaConsultaPocIndisponivel);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("classifica resposta inválida sem alterar regras", async () => {
    process.env.OPENAI_API_KEY = "synthetic-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ output_text: "{}" }), { status: 200 })
    ));
    await expect(
      arquitetarPolitica({ pedido: "Ajustar alimentação", regrasAtuais: [regra] })
    ).rejects.toMatchObject({ tipo: "resposta" } satisfies Partial<ErroArquitetoPolitica>);
  });
});
