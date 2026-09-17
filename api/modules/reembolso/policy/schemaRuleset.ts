/**
 * JSON Schema do ruleset da política — contrato único de saída estruturada.
 *
 * Vive em módulo próprio porque três parsers o usam (OpenAI Responses,
 * OpenRouter chat e o OCR anotado da Mistral) e deixá-lo em `openai.ts`
 * criaria import circular com `mistral.ts`.
 */

export const SCHEMA_RULESET = {
  type: "object",
  additionalProperties: false,
  required: ["politica", "qualidade_extracao", "regras", "ambiguidades", "campos_customizados"],
  properties: {
    campos_customizados: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["grupo", "nome", "tipo", "obrigatorio", "opcoes", "descricao", "fonte"],
        properties: {
          grupo: { type: "string", enum: ["cargo", "funcao", "particularidade"] },
          nome: { type: "string" },
          tipo: { type: "string", enum: ["texto", "numero", "data", "selecao", "booleano"] },
          obrigatorio: { type: "boolean" },
          opcoes: { type: "array", items: { type: "string" } },
          descricao: { type: "string" },
          fonte: { type: "string" },
        },
      },
    },
    politica: {
      type: "object",
      additionalProperties: false,
      required: ["titulo", "vigencia", "moeda_padrao"],
      properties: {
        titulo: { type: "string" },
        vigencia: { type: ["string", "null"] },
        moeda_padrao: { type: "string" },
      },
    },
    qualidade_extracao: {
      type: "object",
      additionalProperties: false,
      required: ["legivel", "confianca", "paginas_com_problema", "observacoes"],
      properties: {
        legivel: { type: "boolean" },
        confianca: { type: "number", minimum: 0, maximum: 1 },
        paginas_com_problema: { type: "array", items: { type: "integer", minimum: 1 } },
        observacoes: { type: "string" },
      },
    },
    regras: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "tema",
          "categoria",
          "alcance",
          "descricao",
          "condicao",
          "reembolsavel",
          "valor_limite",
          "moeda",
          "unidade_limite",
          "exige_comprovante",
        ],
        properties: {
          id: { type: "string" },
          tema: { type: "string" },
          categoria: { type: "string" },
          alcance: { type: "string", enum: ["categoria", "item"] },
          descricao: { type: "string" },
          condicao: { type: ["string", "null"] },
          reembolsavel: { type: "string", enum: ["sim", "excecao", "vedado"] },
          valor_limite: { type: ["number", "null"] },
          moeda: { type: ["string", "null"] },
          unidade_limite: {
            type: ["string", "null"],
            enum: [
              "dia",
              "mes",
              "viagem",
              "evento",
              "percentual",
              "dias_antecedencia",
              "dias_para_pagamento",
              null,
            ],
          },
          exige_comprovante: { type: "boolean" },
        },
      },
    },
    ambiguidades: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "severidade", "local", "descricao"],
        properties: {
          id: { type: "string" },
          severidade: { type: "string", enum: ["alta", "media", "baixa"] },
          local: { type: "string" },
          descricao: { type: "string" },
        },
      },
    },
  },
} as const;
