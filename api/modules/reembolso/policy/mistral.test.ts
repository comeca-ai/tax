import { describe, expect, it } from "vitest";
import { CATEGORIAS_DESPESA } from "@contracts/types";
import { avisosQualidade, mapearRuleset, regrasExtraidasDe, type RegraLLM } from "./mistral";

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

  it("regra extraída é sub-item: nenhum valor do documento vira teto da categoria", () => {
    const { regras } = mapearRuleset({
      regras: [
        { categoria: "alimentacao", descricao: "Café", reembolsavel: "sim", valor_limite: 30 },
        { categoria: "alimentacao", descricao: "Jantar", reembolsavel: "sim", valor_limite: 120 },
        { categoria: "alimentacao", descricao: "Exceção", reembolsavel: "excecao", valor_limite: 500 },
        { categoria: "alimentacao", descricao: "USD", reembolsavel: "sim", valor_limite: 900, moeda: "USD" },
      ],
    });
    // Promover um sub-item a teto da categoria é ato consciente do gestor (escopo "categoria").
    expect(regras.limitesPorCategoria).toEqual({});
    expect(regras.regrasExtraidas.map((r) => r.valorLimite)).toEqual([30, 120, 500, 900]);
  });

  it("categoria com regra vedada e regra reembolsável vira LACUNA, nunca vedação automática", () => {
    const { regras } = mapearRuleset({
      regras: [
        {
          id: "aplicativos-de-transporte",
          categoria: "transporte",
          descricao: "Aplicativos de transporte (Uber, 99, etc.)",
          reembolsavel: "sim",
        },
        {
          id: "gorjetas-motoristas",
          categoria: "transporte",
          descricao: "Gorjetas para motoristas de aplicativos de mobilidade urbana",
          reembolsavel: "vedado",
        },
      ],
    });
    expect(regras.categoriasVedadas).toEqual([]);
    expect(regras.categoriasExcecao).toEqual([]);
    // O LLM devolve toda regra com escopo "item": vedado de sub-item convivendo com
    // permissivo não é conflito de hierarquia e não trava a categoria (B-3, v1.8).
    // Nada é vedado automaticamente — que é o ponto: o LLM não autoriza negação.
    expect(regras.lacunas).toEqual([]);
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

  it("nenhum teto de aprovação nasce do documento: só revisão humana, que é ausência de decisão", () => {
    const { regras } = mapearRuleset({
      regras: [
        { tema: "governanca-do-processo", categoria: "outros", descricao: "Aprovação automática até", reembolsavel: "sim", valor_limite: 200 },
        { tema: "governanca-do-processo", categoria: "outros", descricao: "Revisão humana acima de", reembolsavel: "excecao", valor_limite: 1000 },
      ],
    });
    // O texto "Aprovação automática até" não autoriza nada sem a marcação do gestor (v1.8).
    expect(regras.aprovacaoAutomaticaAte).toBeNull();
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
        escopo: "item",
        descricao: "Combustível com veículo próprio",
        condicao: "km comercial",
        reembolsavel: "sim",
        valorLimite: 0.9,
        moeda: "BRL",
        unidadeLimite: "dia",
        exigeComprovante: true,
        exigeDocumentoFiscal: false,
        decisaoAutomatica: "nenhuma",
      },
    ]);
    // A regex de "veículo cadastrado" morreu na v1.8: exigência só por campo estruturado (P-3).
    expect(regras.exigeVeiculoCadastrado).toEqual([]);
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
        escopo: "item",
        descricao: "Regra X",
        condicao: null,
        reembolsavel: "sim",
        valorLimite: null,
        moeda: "BRL",
        unidadeLimite: null,
        exigeComprovante: false,
        exigeDocumentoFiscal: false,
        decisaoAutomatica: "nenhuma",
      },
    ]);
  });

  it("o `escopo` do JSON do modelo (nacional|internacional) não vira escopo do contrato", () => {
    const { regras } = mapearRuleset({
      regras: [
        {
          id: "diaria-internacional",
          tema: "hospedagem-e-viagem",
          categoria: "hospedagem",
          descricao: "Diária em viagem internacional",
          reembolsavel: "sim",
          escopo: "internacional",
        },
      ],
    });
    expect(regras.regrasExtraidas[0].escopo).toBe("item");
  });

  it("alcance 'categoria' com categoria reconhecida vira escopo 'categoria'", () => {
    const { regras } = mapearRuleset({
      regras: [
        {
          id: "diaria-de-hotel",
          tema: "hospedagem-e-viagem",
          categoria: "hospedagem",
          alcance: "categoria",
          descricao: "Hospedagem: até R$ 400 por diária",
          reembolsavel: "sim",
          valor_limite: 400,
          unidade_limite: "dia",
        },
      ],
    });
    expect(regras.regrasExtraidas[0].escopo).toBe("categoria");
    // Promovida pelo LLM e confirmada pelo gestor no card: já vira teto derivado.
    expect(regras.limitesPorCategoria).toEqual({ hospedagem: 400 });
    expect(regras.tetosTemporaisPorCategoria).toEqual({ hospedagem: "dia" });
  });

  it("alcance 'categoria' sem categoria reconhecida continua 'item'", () => {
    const { regras } = mapearRuleset({
      regras: [
        {
          id: "material-de-escritorio",
          tema: "tecnologia-e-escritorio",
          categoria: "outros",
          alcance: "categoria",
          descricao: "Material de escritório",
          reembolsavel: "sim",
          valor_limite: 200,
        },
      ],
    });
    expect(regras.regrasExtraidas[0].categoria).toBeNull();
    expect(regras.regrasExtraidas[0].escopo).toBe("item");
    expect(regras.limitesPorCategoria).toEqual({});
  });

  it("alcance ausente ou com lixo vira 'item'", () => {
    const { regras } = mapearRuleset({
      regras: [
        { id: "a", categoria: "alimentacao", descricao: "Sem alcance", reembolsavel: "sim" },
        { id: "b", categoria: "alimentacao", alcance: "CATEGORIA", descricao: "Caixa alta", reembolsavel: "sim" },
        { id: "c", categoria: "alimentacao", alcance: "talvez", descricao: "Lixo", reembolsavel: "sim" },
      ],
    });
    expect(regras.regrasExtraidas.map((r) => r.escopo)).toEqual(["item", "item", "item"]);
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

describe("regrasExtraidasDe — o LLM nunca autoriza decisão automática (D-013)", () => {
  it("campos inventados pelo modelo para decidir sozinho são ignorados", () => {
    const regras = regrasExtraidasDe([
      {
        id: "alcada-do-gestor",
        tema: "governanca-do-processo",
        categoria: "outros",
        alcance: "categoria",
        descricao: "Aprovação automática até o valor de alçada",
        reembolsavel: "sim",
        valor_limite: 500,
        decisao_automatica: "aprovar",
        exige_documento_fiscal: true,
      } as RegraLLM,
    ]);
    expect(regras[0].decisaoAutomatica).toBe("nenhuma");
    expect(regras[0].exigeDocumentoFiscal).toBe(false);
  });
});
