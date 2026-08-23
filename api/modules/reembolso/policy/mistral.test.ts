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

  it("exige_comprovante em regra sem categoria exige evidência em todas as categorias", () => {
    const { regras } = mapearRuleset({
      regras: [
        { categoria: "outros", descricao: "A", reembolsavel: "sim" },
        { categoria: "outros", descricao: "B", reembolsavel: "sim", exige_comprovante: true },
      ],
    });
    expect(regras.exigeEvidencia).toEqual([...CATEGORIAS_DESPESA]);
  });

  it("camposPendentes contém só ambiguidades (sem tetos)", () => {
    expect(mapearRuleset({ regras: [] }).camposPendentes).toEqual([]);
    const { camposPendentes } = mapearRuleset({
      regras: [],
      ambiguidades: [{ local: "§3", descricao: "Limite de hospedagem ausente" }],
    });
    expect(camposPendentes).toEqual(["§3: Limite de hospedagem ausente"]);
  });

  it("tetos gerais só nascem de regra de governança explícita", () => {
    const { regras } = mapearRuleset({
      regras: [
        { tema: "governanca-do-processo", categoria: "outros", descricao: "Aprovação automática até", reembolsavel: "sim", valor_limite: 200 },
        { tema: "governanca-do-processo", categoria: "outros", descricao: "Revisão humana acima de", reembolsavel: "excecao", valor_limite: 1000 },
      ],
    });
    expect(regras.aprovacaoAutomaticaAte).toBe(200);
    expect(regras.revisaoHumanaAcimaDe).toBe(1000);
    expect(regras.negacaoAcimaDe).toBeNull();
    expect(mapearRuleset({ regras: [] }).regras.aprovacaoAutomaticaAte).toBeNull();
  });

  it("regra do LLM vira RegraExtraida com campos mapeados", () => {
    const { regras } = mapearRuleset({
      regras: [
        {
          id: "Combustivel Veiculo",
          tema: "transporte-e-deslocamento",
          categoria: "transporte",
          descricao: "Combustível com veículo próprio",
          condicao: "  km comercial  ",
          reembolsavel: "sim",
          valor_limite: 0.9,
          moeda: "brl",
          unidade_limite: "dia",
          exige_comprovante: true,
        },
      ],
    });
    expect(regras.regrasExtraidas).toEqual([
      {
        id: "combustivel-veiculo",
        tema: "transporte-e-deslocamento",
        categoria: "combustivel",
        descricao: "Combustível com veículo próprio",
        condicao: "km comercial",
        reembolsavel: "sim",
        valorLimite: 0.9,
        moeda: "BRL",
        unidadeLimite: "dia",
        exigeComprovante: true,
      },
    ]);
    expect(regras.exigeVeiculoCadastrado).toEqual(["combustivel"]);
    expect(regras.exigeEvidencia).toEqual(["combustivel"]);
  });

  it("lixo parcial é saneado: tema/reembolsavel/unidade inválidos, valor negativo, moeda longa", () => {
    const { regras } = mapearRuleset({
      regras: [
        {
          tema: "outra-coisa",
          categoria: "outros",
          descricao: "Regra X",
          reembolsavel: "talvez",
          valor_limite: -5,
          moeda: "REAIS",
          unidade_limite: "semana",
          exige_comprovante: "sim" as unknown as boolean,
        },
      ],
    });
    expect(regras.regrasExtraidas).toEqual([
      {
        id: "regra-1",
        tema: "governanca-do-processo",
        categoria: null,
        descricao: "Regra X",
        condicao: null,
        reembolsavel: "sim",
        valorLimite: null,
        moeda: "BRL",
        unidadeLimite: null,
        exigeComprovante: false,
      },
    ]);
  });

  it("ids duplicados ganham sufixo; regra sem descricao é descartada", () => {
    const { regras } = mapearRuleset({
      regras: [
        { id: "almoco", tema: "alimentacao", categoria: "alimentacao", descricao: "A", reembolsavel: "sim" },
        { id: "almoco", tema: "alimentacao", categoria: "alimentacao", descricao: "B", reembolsavel: "sim" },
        { id: "almoco", tema: "alimentacao", categoria: "alimentacao", descricao: "   ", reembolsavel: "sim" },
        { id: "almoco", tema: "alimentacao", categoria: "alimentacao", descricao: "C", reembolsavel: "sim" },
      ],
    });
    expect(regras.regrasExtraidas.map((r) => r.id)).toEqual(["almoco", "almoco-2", "almoco-3"]);
    expect(regras.regrasExtraidas.map((r) => r.descricao)).toEqual(["A", "B", "C"]);
  });
});
