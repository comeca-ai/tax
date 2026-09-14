import { describe, expect, it } from "vitest";
import { regrasPoliticaSchema } from "@contracts/types";
import { avaliarDespesa } from "./agent";
import { consolidarRegras } from "./derivar";

// Transcrição MANUAL e PARCIAL: não é evidência de extração automática do PDF.
// Km, prazos e calendário não cabem no contrato atual e não são simulados aqui.
const exemplo = regrasPoliticaSchema.parse({
  regrasExtraidas: [
    {
      id: "pi004-refeicao", tema: "alimentacao", categoria: "alimentacao",
      escopo: "item", descricao: "Almoço e jantar: limite de R$ 90 por refeição.",
      condicao: "Justificativa e aprovação; ressalva para almoço com cliente.",
      valorLimite: 90, exigeComprovante: true,
    },
    {
      id: "pi004-alcool", tema: "alimentacao", categoria: "alimentacao",
      escopo: "item", descricao: "Bebidas alcoólicas não são reembolsáveis.",
      reembolsavel: "vedado",
    },
    {
      id: "pi004-hotel", tema: "hospedagem-e-viagem", categoria: "hospedagem",
      escopo: "categoria", descricao: "Hospedagem somente em caso extraordinário autorizado previamente pelo CEO.",
      reembolsavel: "excecao",
    },
  ],
});
const regras = consolidarRegras(exemplo);

describe("PI-004 — salvaguardas da referência manual", () => {
  it.each([89.99, 90, 90.01, 180])("refeição de %s não dispensa aprovação humana", (valorNota) => {
    const resultado = avaliarDespesa({ categoria: "alimentacao", valorNota }, regras, { temEvidencia: true });
    expect(resultado.decisao).toBe("revisao_humana");
  });

  it("não promove o limite por refeição ou a vedação do álcool para toda alimentação", () => {
    expect(regras.limitesPorCategoria.alimentacao).toBeUndefined();
    expect(regras.categoriasVedadas.some((r) => r.categoria === "alimentacao")).toBe(false);
    expect(regras.aprovacaoAutomaticaAte).toBeNull();
    expect(regras.aprovacaoAutomaticaPorCategoria).toEqual({});
  });

  it("hospedagem com possibilidade de exceção exige revisão, não negação irrestrita", () => {
    expect(avaliarDespesa({ categoria: "hospedagem", valorNota: 100 }, regras, { temEvidencia: true }).decisao)
      .toBe("revisao_humana");
  });

  it("não inventa aprovação de combustível a partir da política de viagens", () => {
    expect(regras.limitesPorCategoria.combustivel).toBeUndefined();
    expect(avaliarDespesa({ categoria: "combustivel", valorNota: 95 }, regras, { temEvidencia: true }).decisao)
      .toBe("revisao_humana");
  });
});
