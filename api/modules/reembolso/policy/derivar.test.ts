import { describe, expect, it } from "vitest";
import { CATEGORIAS_DESPESA, regrasPoliticaSchema, type RegraExtraida } from "@contracts/types";
import { consolidarRegras, derivarParametros, observacoesDe } from "./derivar";
import { REGRAS_POLITICA_13 } from "./politica13.fixture";

function regra(parcial: Partial<RegraExtraida> & { descricao: string }): RegraExtraida {
  return {
    id: parcial.descricao.toLowerCase().replace(/\s+/g, "-"),
    tema: "governanca-do-processo",
    categoria: null,
    escopo: "item",
    condicao: null,
    reembolsavel: "sim",
    valorLimite: null,
    moeda: "BRL",
    unidadeLimite: null,
    exigeComprovante: false,
    ...parcial,
  };
}

describe("derivarParametros — limitesPorCategoria (só escopo 'categoria')", () => {
  it("limite é o máximo dos valores BRL reembolsáveis de escopo categoria; exceção/vedado/USD ignorados", () => {
    const p = derivarParametros([
      regra({ descricao: "Café", tema: "alimentacao", categoria: "alimentacao", escopo: "categoria", valorLimite: 30 }),
      regra({ descricao: "Jantar", tema: "alimentacao", categoria: "alimentacao", escopo: "categoria", valorLimite: 120 }),
      regra({ descricao: "Exceção", tema: "alimentacao", categoria: "alimentacao", escopo: "categoria", valorLimite: 500, reembolsavel: "excecao" }),
      regra({ descricao: "Vedado", tema: "alimentacao", categoria: "alimentacao", escopo: "categoria", valorLimite: 900, reembolsavel: "vedado" }),
      regra({ descricao: "USD", tema: "alimentacao", categoria: "alimentacao", escopo: "categoria", valorLimite: 900, moeda: "USD" }),
    ]);
    expect(p.limitesPorCategoria).toEqual({ alimentacao: 120 });
  });

  it("sub-item com valor NÃO vira teto da categoria (lavanderia R$ 30 em hospedagem)", () => {
    const p = derivarParametros([
      regra({
        descricao: "Lavanderia em viagens nacionais",
        tema: "hospedagem-e-viagem",
        categoria: "hospedagem",
        valorLimite: 30,
        unidadeLimite: "dia",
      }),
    ]);
    expect(p.limitesPorCategoria).toEqual({});
    expect("hospedagem" in p.limitesPorCategoria).toBe(false);
  });

  it("escopo categoria com unidade percentual, dias_* ou moeda estrangeira não vira teto em reais", () => {
    const p = derivarParametros([
      regra({ descricao: "Percentual", categoria: "alimentacao", escopo: "categoria", valorLimite: 50, unidadeLimite: "percentual" }),
      regra({ descricao: "Prazo", categoria: "hospedagem", escopo: "categoria", valorLimite: 30, unidadeLimite: "dias_para_pagamento" }),
      regra({ descricao: "Dólar", categoria: "uber", escopo: "categoria", valorLimite: 80, moeda: "USD" }),
    ]);
    expect(p.limitesPorCategoria).toEqual({});
  });

  it("categoria sem regra fica ausente", () => {
    const p = derivarParametros([regra({ descricao: "Sem valor", categoria: "hospedagem" })]);
    expect(p.limitesPorCategoria).toEqual({});
    expect("hospedagem" in p.limitesPorCategoria).toBe(false);
  });
});

describe("derivarParametros — tetosTemporaisPorCategoria", () => {
  it("teto promovido com unidade 'dia' marca a categoria como temporal", () => {
    const p = derivarParametros([
      regra({
        descricao: "Hospedagem: até R$ 400 por diária",
        tema: "hospedagem-e-viagem",
        categoria: "hospedagem",
        escopo: "categoria",
        valorLimite: 400,
        unidadeLimite: "dia",
      }),
    ]);
    expect(p.limitesPorCategoria).toEqual({ hospedagem: 400 });
    expect(p.tetosTemporaisPorCategoria).toEqual({ hospedagem: "dia" });
  });

  it("teto sem unidade não é temporal", () => {
    const p = derivarParametros([
      regra({ descricao: "Hospedagem por nota", categoria: "hospedagem", escopo: "categoria", valorLimite: 400 }),
    ]);
    expect(p.limitesPorCategoria).toEqual({ hospedagem: 400 });
    expect(p.tetosTemporaisPorCategoria).toEqual({});
    expect("hospedagem" in p.tetosTemporaisPorCategoria).toBe(false);
  });

  it("unidade 'mes' NÃO é temporal (nota mensal não cobre vários meses)", () => {
    const p = derivarParametros([
      regra({
        descricao: "Internet do home office",
        categoria: "alimentacao",
        escopo: "categoria",
        valorLimite: 200,
        unidadeLimite: "mes",
      }),
    ]);
    expect(p.limitesPorCategoria).toEqual({ alimentacao: 200 });
    expect(p.tetosTemporaisPorCategoria).toEqual({});
  });

  it("empate no máximo entre regra temporal e não temporal marca como temporal (conservador)", () => {
    const p = derivarParametros([
      regra({ descricao: "Diária de hotel", categoria: "hospedagem", escopo: "categoria", valorLimite: 400, unidadeLimite: "dia" }),
      regra({ descricao: "Hospedagem por nota", categoria: "hospedagem", escopo: "categoria", valorLimite: 400 }),
    ]);
    expect(p.limitesPorCategoria).toEqual({ hospedagem: 400 });
    expect(p.tetosTemporaisPorCategoria).toEqual({ hospedagem: "dia" });
  });

  it("regra promovida sem valorLimite não vira teto nem marca unidade temporal", () => {
    const p = derivarParametros([
      regra({ descricao: "Hospedagem em viagens", categoria: "hospedagem", escopo: "categoria", unidadeLimite: "dia" }),
    ]);
    expect(p.limitesPorCategoria).toEqual({});
    expect(p.tetosTemporaisPorCategoria).toEqual({});
  });
});

describe("derivarParametros — vedação e exceção por categoria", () => {
  it("regra vedada de escopo categoria veta mesmo havendo regra reembolsável", () => {
    const p = derivarParametros([
      regra({ descricao: "Uber liberado", categoria: "uber" }),
      regra({ descricao: "Mobilidade urbana não é reembolsada", categoria: "uber", escopo: "categoria", reembolsavel: "vedado" }),
    ]);
    expect(p.categoriasVedadas).toEqual([
      {
        categoria: "uber",
        regraId: "mobilidade-urbana-não-é-reembolsada",
        descricao: "Mobilidade urbana não é reembolsada",
        motivo: 'Categoria Uber/app vedada pela política — regra: "Mobilidade urbana não é reembolsada".',
      },
    ]);
    expect(p.categoriasExcecao).toEqual([]);
  });

  it("vedada sem nenhuma regra reembolsável na categoria → vedada, citando a regra", () => {
    const p = derivarParametros([
      regra({ descricao: "Gorjetas para motoristas", categoria: "uber", reembolsavel: "vedado" }),
    ]);
    expect(p.categoriasVedadas.map((c) => c.categoria)).toEqual(["uber"]);
    expect(p.categoriasVedadas[0].motivo).toContain("Gorjetas para motoristas");
    expect(p.categoriasVedadas[0].motivo).toContain("não tem nenhuma regra reembolsável");
    expect(p.categoriasExcecao).toEqual([]);
  });

  it("vedada convivendo com reembolsável → exceção (revisão humana), nunca negação", () => {
    const p = derivarParametros([
      regra({ descricao: "Aplicativos de transporte", categoria: "uber" }),
      regra({ descricao: "Gorjetas para motoristas", categoria: "uber", reembolsavel: "vedado" }),
    ]);
    expect(p.categoriasVedadas).toEqual([]);
    expect(p.categoriasExcecao.map((c) => c.categoria)).toEqual(["uber"]);
    expect(p.categoriasExcecao[0].descricao).toBe("Gorjetas para motoristas");
    expect(p.categoriasExcecao[0].motivo).toContain("Uber/app");
    expect(p.categoriasExcecao[0].motivo).toContain("revisão humana");
  });

  it("regra de exceção tem precedência de citação sobre a vedada", () => {
    const p = derivarParametros([
      regra({ descricao: "Diária de hotel", categoria: "hospedagem" }),
      regra({ descricao: "Frigobar", categoria: "hospedagem", reembolsavel: "vedado" }),
      regra({ descricao: "Hospedagem em viagens", categoria: "hospedagem", reembolsavel: "excecao" }),
    ]);
    expect(p.categoriasExcecao).toEqual([
      {
        categoria: "hospedagem",
        regraId: "hospedagem-em-viagens",
        descricao: "Hospedagem em viagens",
        motivo:
          'Categoria hospedagem exige aprovação superior na política — regra: "Hospedagem em viagens".',
      },
    ]);
  });

  it("categoria sem nenhuma regra não entra em nenhuma das listas", () => {
    const p = derivarParametros([regra({ descricao: "Almoço", categoria: "alimentacao" })]);
    expect(p.categoriasVedadas).toEqual([]);
    expect(p.categoriasExcecao).toEqual([]);
  });
});

describe("derivarParametros — regressão da política 13 (70 regras reais)", () => {
  it("fixture íntegro: 70 regras, distribuição conferida e todas com escopo 'item'", () => {
    const porCategoria = (cat: string) =>
      REGRAS_POLITICA_13.filter((r) => r.categoria === cat).map((r) => r.reembolsavel);
    expect(REGRAS_POLITICA_13).toHaveLength(70);
    expect(porCategoria("uber")).toEqual(["sim", "vedado"]);
    expect(porCategoria("combustivel")).toEqual(["sim", "excecao"]);
    expect(porCategoria("hospedagem").filter((r) => r === "sim")).toHaveLength(5);
    expect(porCategoria("hospedagem").filter((r) => r === "excecao")).toHaveLength(2);
    expect(porCategoria("hospedagem").filter((r) => r === "vedado")).toHaveLength(6);
    expect(porCategoria("alimentacao")).toHaveLength(9);
    expect(porCategoria("pedagio")).toHaveLength(1);
    expect(porCategoria("taxi")).toHaveLength(0);
    expect(REGRAS_POLITICA_13.filter((r) => r.categoria === null)).toHaveLength(43);
    expect(REGRAS_POLITICA_13.every((r) => r.escopo === "item")).toBe(true);
  });

  it("nenhum sub-item vira teto: limitesPorCategoria vazio (hospedagem não é mais R$ 30)", () => {
    const p = derivarParametros(REGRAS_POLITICA_13);
    expect(p.limitesPorCategoria).toEqual({});
    expect("hospedagem" in p.limitesPorCategoria).toBe(false);
  });

  it("nenhuma categoria é negada automaticamente; combustível, hospedagem e Uber vão para exceção", () => {
    const p = derivarParametros(REGRAS_POLITICA_13);
    expect(p.categoriasVedadas).toEqual([]);
    expect(p.categoriasExcecao.map((c) => c.categoria)).toEqual([
      "combustivel",
      "hospedagem",
      "uber",
    ]);
    expect(p.categoriasExcecao.find((c) => c.categoria === "hospedagem")?.descricao).toBe(
      "Hospedagem em viagens",
    );
  });

  it("os três tetos gerais continuam null — nada passa a ser aprovado automaticamente", () => {
    const p = derivarParametros(REGRAS_POLITICA_13);
    expect(p.aprovacaoAutomaticaAte).toBeNull();
    expect(p.revisaoHumanaAcimaDe).toBeNull();
    expect(p.negacaoAcimaDe).toBeNull();
  });
});

describe("derivarParametros — exigeEvidencia", () => {
  it("comprovante sem categoria exige em todas", () => {
    const p = derivarParametros([regra({ descricao: "Nota fiscal obrigatória", exigeComprovante: true })]);
    expect(p.exigeEvidencia).toEqual([...CATEGORIAS_DESPESA]);
  });

  it("comprovante com categoria exige só nela", () => {
    const p = derivarParametros([
      regra({ descricao: "Nota do hotel", categoria: "hospedagem", exigeComprovante: true }),
    ]);
    expect(p.exigeEvidencia).toEqual(["hospedagem"]);
  });

  it("sem comprovante devolve vazio", () => {
    expect(derivarParametros([regra({ descricao: "A" })]).exigeEvidencia).toEqual([]);
  });
});

describe("derivarParametros — exigeVeiculoCadastrado", () => {
  it("regra de combustível com 'veículo próprio' exige veículo", () => {
    const p = derivarParametros([
      regra({ descricao: "Combustível só com veículo próprio", tema: "transporte-e-deslocamento", categoria: "combustivel" }),
    ]);
    expect(p.exigeVeiculoCadastrado).toEqual(["combustivel"]);
  });

  it("mesmo texto em alimentação não exige veículo", () => {
    const p = derivarParametros([
      regra({ descricao: "Almoço com veículo próprio", tema: "alimentacao", categoria: "alimentacao" }),
    ]);
    expect(p.exigeVeiculoCadastrado).toEqual([]);
  });

  it("regra sem categoria no tema transporte exige veículo", () => {
    const p = derivarParametros([
      regra({ descricao: "Deslocamento", tema: "transporte-e-deslocamento", condicao: "apenas veículo cadastrado" }),
    ]);
    expect(p.exigeVeiculoCadastrado).toEqual(["combustivel"]);
  });
});

describe("derivarParametros — tetos gerais (classificação por `reembolsavel`, não por texto)", () => {
  it("sim+'aprovação automática' / exceção / vedado viram os 3 tetos", () => {
    const p = derivarParametros([
      regra({ descricao: "Aprovação automática até", valorLimite: 200 }),
      regra({ descricao: "Acima deste valor exige aprovação do diretor", valorLimite: 1000, reembolsavel: "excecao" }),
      regra({ descricao: "Teto por despesa", valorLimite: 5000, reembolsavel: "vedado" }),
    ]);
    expect(p.aprovacaoAutomaticaAte).toBe(200);
    expect(p.revisaoHumanaAcimaDe).toBe(1000);
    expect(p.negacaoAcimaDe).toBe(5000);
  });

  it("aprovação/revisão usam o menor valor; negação o maior", () => {
    const p = derivarParametros([
      regra({ descricao: "Aprovação automática até", valorLimite: 300 }),
      regra({ descricao: "Reembolso automático", valorLimite: 200 }),
      regra({ descricao: "Alçada do gestor", valorLimite: 800, reembolsavel: "excecao" }),
      regra({ descricao: "Alçada da diretoria", valorLimite: 1500, reembolsavel: "excecao" }),
      regra({ descricao: "Não será reembolsado acima de", valorLimite: 4000, reembolsavel: "vedado" }),
      regra({ descricao: "Teto máximo", valorLimite: 5000, reembolsavel: "vedado" }),
    ]);
    expect(p.aprovacaoAutomaticaAte).toBe(200);
    expect(p.revisaoHumanaAcimaDe).toBe(800);
    expect(p.negacaoAcimaDe).toBe(5000);
  });

  it("regra com categoria ou unidade dias_* não vira teto", () => {
    const p = derivarParametros([
      regra({ descricao: "Aprovação automática até", categoria: "alimentacao", valorLimite: 200 }),
      regra({ descricao: "Revisão humana acima de", valorLimite: 30, unidadeLimite: "dias_para_pagamento", reembolsavel: "excecao" }),
      regra({ descricao: "Aprovação automática até", tema: "alimentacao", valorLimite: 200 }),
      regra({ descricao: "Aprovação automática até", valorLimite: 200, moeda: "USD" }),
    ]);
    expect(p.aprovacaoAutomaticaAte).toBeNull();
    expect(p.revisaoHumanaAcimaDe).toBeNull();
    expect(p.negacaoAcimaDe).toBeNull();
  });

  it("D-013: texto livre nunca gera teto — 'sem aprovação', 'negociação', 'negado' são ignorados quando reembolsavel=sim", () => {
    const p = derivarParametros([
      regra({ descricao: "Despesas acima de R$ 500 sem aprovação prévia do gestor não serão reembolsadas", valorLimite: 500 }),
      regra({ descricao: "Despesas de negociação com fornecedores — reembolso até", valorLimite: 300, unidadeLimite: "evento" }),
      regra({ descricao: "Pedido negado acima de", valorLimite: 900 }),
    ]);
    expect(p.aprovacaoAutomaticaAte).toBeNull();
    expect(p.revisaoHumanaAcimaDe).toBeNull();
    expect(p.negacaoAcimaDe).toBeNull();
  });

  it("regra 'exceção' com texto 'aprovação automática' NÃO vira aprovação automática — o campo estruturado manda", () => {
    const p = derivarParametros([
      regra({ descricao: "Aprovação automática até", valorLimite: 200, reembolsavel: "excecao" }),
    ]);
    expect(p.aprovacaoAutomaticaAte).toBeNull();
    expect(p.revisaoHumanaAcimaDe).toBe(200);
  });

  it("sem regra de governança os 3 tetos são null", () => {
    const p = derivarParametros([
      regra({ descricao: "Almoço", tema: "alimentacao", categoria: "alimentacao", valorLimite: 80 }),
    ]);
    expect(p.aprovacaoAutomaticaAte).toBeNull();
    expect(p.revisaoHumanaAcimaDe).toBeNull();
    expect(p.negacaoAcimaDe).toBeNull();
  });
});

describe("derivarParametros — exigeDocumentoFiscal (match por id, sem regex em texto)", () => {
  it("regra de governança vedada com id conhecido exige documento fiscal", () => {
    const p = derivarParametros([
      regra({ id: "comprovantes-nao-aceitos", descricao: "Comprovantes de pagamento não são aceitos", reembolsavel: "vedado" }),
    ]);
    expect(p.exigeDocumentoFiscal).toBe(true);
    expect(p.regraDocumentoFiscalId).toBe("comprovantes-nao-aceitos");
  });

  it("sem a regra, não exige", () => {
    const p = derivarParametros([regra({ descricao: "Almoço", tema: "alimentacao", categoria: "alimentacao" })]);
    expect(p.exigeDocumentoFiscal).toBe(false);
    expect(p.regraDocumentoFiscalId).toBeNull();
  });

  it("regra vedada de governança com outro id não exige (sem regex em texto)", () => {
    const p = derivarParametros([
      regra({ id: "so-nota-fiscal", descricao: "Só aceitamos nota fiscal como comprovante", reembolsavel: "vedado" }),
    ]);
    expect(p.exigeDocumentoFiscal).toBe(false);
    expect(p.regraDocumentoFiscalId).toBeNull();
  });

  it("id certo mas reembolsavel=sim não exige", () => {
    const p = derivarParametros([
      regra({ id: "comprovantes-nao-aceitos", descricao: "Comprovantes de pagamento não são aceitos" }),
    ]);
    expect(p.exigeDocumentoFiscal).toBe(false);
    expect(p.regraDocumentoFiscalId).toBeNull();
  });
});

describe("observacoesDe", () => {
  it("reproduz o formato textual por tema (cabeçalho, marcador, valor, condição)", () => {
    const obs = observacoesDe([
      regra({ descricao: "Bebidas alcoólicas", reembolsavel: "vedado" }),
      regra({ descricao: "Almoço em viagem", tema: "alimentacao", categoria: "alimentacao", valorLimite: 80, unidadeLimite: "dia" }),
    ]);
    expect(obs).toEqual([
      "— Alimentação —",
      "Almoço em viagem — até R$ 80/dia",
      "— Governança do processo —",
      "VEDADO: Bebidas alcoólicas",
    ]);
  });

  it("exceção, moeda estrangeira, unidade dias_* e condição", () => {
    const obs = observacoesDe([
      regra({ descricao: "Jantar com cliente", tema: "eventos-e-relacionamento", reembolsavel: "excecao", valorLimite: 50, moeda: "USD", condicao: "fora do país" }),
      regra({ descricao: "Prazo de envio", valorLimite: 30, unidadeLimite: "dias_antecedencia" }),
    ]);
    expect(obs).toEqual([
      "— Eventos e relacionamento —",
      "EXCEÇÃO (aprovação superior): Jantar com cliente — até USD 50 (fora do país)",
      "— Governança do processo —",
      "Prazo de envio — até R$ 30",
    ]);
  });

  it("sem regras devolve vazio", () => {
    expect(observacoesDe([])).toEqual([]);
  });
});

describe("consolidarRegras", () => {
  it("sem regras extraídas devolve o mesmo objeto", () => {
    const regras = regrasPoliticaSchema.parse({ aprovacaoAutomaticaAte: 150, observacoes: ["x"] });
    expect(consolidarRegras(regras)).toBe(regras);
  });

  it("com regras extraídas sobrescreve parâmetros e observações; idempotente", () => {
    const regras = regrasPoliticaSchema.parse({
      limitesPorCategoria: { uber: 999 },
      aprovacaoAutomaticaAte: 150,
      observacoes: ["antiga"],
      regrasExtraidas: [
        regra({ descricao: "Almoço", tema: "alimentacao", categoria: "alimentacao", escopo: "categoria", valorLimite: 80 }),
        regra({ descricao: "Revisão manual acima de", valorLimite: 1000, reembolsavel: "excecao" }),
      ],
    });
    const uma = consolidarRegras(regras);
    expect(uma.limitesPorCategoria).toEqual({ alimentacao: 80 });
    expect(uma.aprovacaoAutomaticaAte).toBeNull();
    expect(uma.revisaoHumanaAcimaDe).toBe(1000);
    expect(uma.observacoes).toEqual([
      "— Alimentação —",
      "Almoço — até R$ 80",
      "— Governança do processo —",
      "EXCEÇÃO (aprovação superior): Revisão manual acima de — até R$ 1000",
    ]);
    expect(uma.regrasExtraidas).toBe(regras.regrasExtraidas);
    expect(consolidarRegras(uma)).toEqual(uma);
  });

  it("política demo (regrasExtraidas vazio, limites preenchidos) sai inalterada", () => {
    const demo = regrasPoliticaSchema.parse({
      limitesPorCategoria: { alimentacao: 120, hospedagem: 450, uber: 80 },
      exigeVeiculoCadastrado: ["combustivel"],
      exigeEvidencia: ["hospedagem", "alimentacao"],
      aprovacaoAutomaticaAte: 200,
      revisaoHumanaAcimaDe: 2000,
      negacaoAcimaDe: 5000,
      observacoes: ["Tarifa de R$ 0,85 por km rodado."],
      regrasExtraidas: [],
    });
    const consolidada = consolidarRegras(demo);
    expect(consolidada).toBe(demo);
    expect(consolidada.limitesPorCategoria).toEqual({ alimentacao: 120, hospedagem: 450, uber: 80 });
    expect(consolidada.observacoes).toEqual(["Tarifa de R$ 0,85 por km rodado."]);
  });

  it("carrega as listas de vedação e exceção derivadas das regras extraídas", () => {
    const regras = regrasPoliticaSchema.parse({
      regrasExtraidas: [
        regra({ descricao: "Aplicativos de transporte", categoria: "uber" }),
        regra({ descricao: "Gorjetas para motoristas", categoria: "uber", reembolsavel: "vedado" }),
        regra({ descricao: "Bebidas alcoólicas", categoria: "alimentacao", reembolsavel: "vedado" }),
      ],
    });
    const consolidada = consolidarRegras(regras);
    expect(consolidada.categoriasVedadas.map((c) => c.categoria)).toEqual(["alimentacao"]);
    expect(consolidada.categoriasExcecao.map((c) => c.categoria)).toEqual(["uber"]);
  });
});
