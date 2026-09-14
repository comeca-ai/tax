import { regrasPoliticaSchema, regraExtraidaSchema, type RegraExtraida } from "@contracts/types";

const MAX_PEDIDO = 4_000;

const REGRA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "tema", "categoria", "escopo", "descricao", "condicao", "reembolsavel", "valorLimite", "moeda", "unidadeLimite", "exigeComprovante", "exigeDocumentoFiscal", "decisaoAutomatica"],
  properties: {
    id: { type: "string" },
    tema: { type: "string", enum: ["alimentacao", "hospedagem", "transporte", "combustivel", "pedagio", "documentacao", "prazos", "geral"] },
    categoria: { type: ["string", "null"], enum: ["combustivel", "alimentacao", "hospedagem", "pedagio", "uber", "taxi", null] },
    escopo: { type: "string", enum: ["categoria", "item"] },
    descricao: { type: "string" },
    condicao: { type: ["string", "null"] },
    reembolsavel: { type: "string", enum: ["sim", "excecao", "vedado"] },
    valorLimite: { type: ["number", "null"] },
    moeda: { type: "string" },
    unidadeLimite: { type: ["string", "null"], enum: ["dia", "mes", "viagem", "evento", "percentual", "dias_antecedencia", "dias_para_pagamento", null] },
    exigeComprovante: { type: "boolean" },
    exigeDocumentoFiscal: { type: "boolean" },
    decisaoAutomatica: { type: "string", enum: ["nenhuma", "aprovar", "negar"] },
  },
} as const;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "alteracoes", "regras"],
  properties: {
    resumo: { type: "string" },
    alteracoes: { type: "array", items: { type: "string" } },
    regras: { type: "array", items: REGRA_SCHEMA },
  },
} as const;

function textoResposta(resposta: unknown): string {
  const dados = resposta as { output_text?: unknown; output?: { content?: { type?: string; text?: string }[] }[] };
  if (typeof dados.output_text === "string" && dados.output_text.trim()) return dados.output_text;
  const texto = (dados.output ?? []).flatMap(item => item.content ?? []).filter(item => item.type === "output_text" && typeof item.text === "string").map(item => item.text).join("\n").trim();
  if (!texto) throw new Error("resposta sem conteúdo utilizável");
  return texto;
}

function validarRegras(regras: unknown): RegraExtraida[] {
  if (!Array.isArray(regras) || regras.length > 200) throw new Error("resposta com regras inválidas");
  const resultado = regras.map(regra => regraExtraidaSchema.parse(regra));
  if (new Set(resultado.map(regra => regra.id)).size !== resultado.length) throw new Error("resposta com IDs de regra duplicados");
  return resultado;
}

export async function arquitetarPolitica(input: { pedido: string; regrasAtuais: RegraExtraida[] }) {
  const pedido = input.pedido.trim();
  if (!pedido || pedido.length > MAX_PEDIDO) throw new Error("pedido de ajuste inválido");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ausente no runtime de homologação");
  const modelo = process.env.POLICY_OPENAI_MODEL ?? "gpt-4o-mini";
  const resposta = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelo,
      store: false,
      max_output_tokens: 16_000,
      text: { format: { type: "json_schema", name: "arquiteto_politica", strict: true, schema: OUTPUT_SCHEMA } },
      input: [
        { role: "developer", content: [{ type: "input_text", text: "Você é o Arquiteto de Política de uma empresa brasileira. Receba um pedido de alteração e a lista atual de regras. Retorne a lista COMPLETA de regras após aplicar somente o pedido. Preserve todas as regras não mencionadas. Nunca invente autorização ampla: se o pedido for ambíguo, mantenha decisãoAutomatica como nenhuma e descreva a ambiguidade em alteracoes. A saída é um rascunho para revisão humana; não diga que publicou ou ativou nada." }] },
        { role: "user", content: [{ type: "input_text", text: `PEDIDO:\n${pedido}\n\nREGRAS ATUAIS (JSON):\n${JSON.stringify(input.regrasAtuais)}` }] },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resposta.ok) throw new Error(`OpenAI respondeu HTTP ${resposta.status}`);
  const bruto = JSON.parse(textoResposta(await resposta.json())) as { resumo?: unknown; alteracoes?: unknown; regras?: unknown };
  const regras = validarRegras(bruto.regras);
  return {
    resumo: typeof bruto.resumo === "string" ? bruto.resumo.slice(0, 1_000) : "Rascunho preparado para revisão.",
    alteracoes: Array.isArray(bruto.alteracoes) ? bruto.alteracoes.filter((item): item is string => typeof item === "string").slice(0, 30) : [],
    regras: regrasPoliticaSchema.shape.regrasExtraidas.parse(regras),
    modelo,
  };
}
