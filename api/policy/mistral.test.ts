import { describe, expect, it } from "vitest";
import { CATEGORIAS_DESPESA } from "@contracts/types";
import { avisosQualidade, mapearRuleset } from "./mistral";

describe("avisosQualidade", () => {
  it("sem bloco de qualidade devolve vazio", () => {
    expect(avisosQualidade(undefined)).toEqual([]);
    expect(avisosQualidade({})).toEqual([]);
  });

  it("só observacoes gera 1 aviso", () => {
    expect(avisosQualidade({ legivel: true, observacoes: "Tabela cortada na p. 3" })).toEqual([
      "Tabela cortada na p. 3",
    ]);
  });

  it("páginas com problema viram aviso com a lista", () => {
    const avisos = avisosQualidade({ paginas_com_problema: [2, 5] });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("2, 5");
  });

  it("ignora páginas inválidas", () => {
    const lixo = [0, -1, "x"] as unknown as number[];
    expect(avisosQualidade({ paginas_com_problema: lixo })).toEqual([]);
  });

  it("legivel=false gera aviso de revisão", () => {
    const avisos = avisosQualidade({ legivel: false });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/pouco legível/);
  });
});

describe("mapearRuleset", () => {
  it("agrupa observações por tema na ordem de TEMAS, com cabeçalhos", () => {
    const { regras } = mapearRuleset({
      regras: [
        {
          id: "vedado-bebida",
          tema: "governanca-do-processo",
          categoria: "outros",
          descricao: "Bebidas alcoólicas",
          reembolsavel: "vedado",
        },
        {
          id: "almoco",
          tema: "alimentacao",
          categoria: "alimentacao",
          descricao: "Almoço em viagem",
          reembolsavel: "sim",
          valor_limite: 80,
          unidade_limite: "dia",
        },
      ],
    });
    expect(regras.observacoes).toEqual([
      "— Alimentação —",
      "Almoço em viagem — até R$ 80/dia",
      "— Governança do processo —",
      "VEDADO: Bebidas alcoólicas",
    ]);
  });

  it("tema desconhecido cai em governança do processo", () => {
    const { regras } = mapearRuleset({
      regras: [{ tema: "outra-coisa", categoria: "outros", descricao: "Regra X", reembolsavel: "sim" }],
    });
    expect(regras.observacoes).toEqual(["— Governança do processo —", "Regra X"]);
  });

  it("limite da categoria é o máximo dos limites BRL reembolsáveis", () => {
    const { regras } = mapearRuleset({
      regras: [
        { categoria: "alimentacao", descricao: "Café", reembolsavel: "sim", valor_limite: 30 },
        { categoria: "alimentacao", descricao: "Jantar", reembolsavel: "sim", valor_limite: 120 },
        { categoria: "alimentacao", descricao: "Exceção", reembolsavel: "excecao", valor_limite: 500 },
        { categoria: "alimentacao", descricao: "USD", reembolsavel: "sim", valor_limite: 900, moeda: "USD" },
      ],
    });
    expect(regras.limitesPorCategoria.alimentacao).toBe(120);
  });

  it("exige_comprovante em qualquer regra exige evidência em todas as categorias", () => {
    const { regras } = mapearRuleset({
      regras: [
        { categoria: "outros", descricao: "A", reembolsavel: "sim" },
        { categoria: "outros", descricao: "B", reembolsavel: "sim", exige_comprovante: true },
      ],
    });
    expect(regras.exigeEvidencia).toEqual([...CATEGORIAS_DESPESA]);
  });

  it("camposPendentes começa pelos 3 tetos", () => {
    const { camposPendentes } = mapearRuleset({ regras: [] });
    expect(camposPendentes.slice(0, 3).map((c) => c.split(" ")[0])).toEqual([
      "aprovacaoAutomaticaAte",
      "revisaoHumanaAcimaDe",
      "negacaoAcimaDe",
    ]);
  });
});
