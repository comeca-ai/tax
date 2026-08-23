import { describe, expect, it } from "vitest";
import { CATEGORIAS_DESPESA, regrasPoliticaSchema, type RegraExtraida } from "@contracts/types";
import { consolidarRegras, derivarParametros, observacoesDe } from "./derivar";

function regra(parcial: Partial<RegraExtraida> & { descricao: string }): RegraExtraida {
  return {
    id: parcial.descricao.toLowerCase().replace(/\s+/g, "-"),
    tema: "governanca-do-processo",
    categoria: null,
    condicao: null,
    reembolsavel: "sim",
    valorLimite: null,
    moeda: "BRL",
    unidadeLimite: null,
    exigeComprovante: false,
    ...parcial,
  };
}

describe("derivarParametros — limitesPorCategoria", () => {
  it("limite é o máximo dos valores BRL reembolsáveis; exceção/vedado/USD ignorados", () => {
    const p = derivarParametros([
      regra({ descricao: "Café", tema: "alimentacao", categoria: "alimentacao", valorLimite: 30 }),
      regra({ descricao: "Jantar", tema: "alimentacao", categoria: "alimentacao", valorLimite: 120 }),
      regra({ descricao: "Exceção", tema: "alimentacao", categoria: "alimentacao", valorLimite: 500, reembolsavel: "excecao" }),
      regra({ descricao: "Vedado", tema: "alimentacao", categoria: "alimentacao", valorLimite: 900, reembolsavel: "vedado" }),
      regra({ descricao: "USD", tema: "alimentacao", categoria: "alimentacao", valorLimite: 900, moeda: "USD" }),
    ]);
    expect(p.limitesPorCategoria).toEqual({ alimentacao: 120 });
  });

  it("categoria sem regra fica ausente", () => {
    const p = derivarParametros([regra({ descricao: "Sem valor", categoria: "hospedagem" })]);
    expect(p.limitesPorCategoria).toEqual({});
    expect("hospedagem" in p.limitesPorCategoria).toBe(false);
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
        regra({ descricao: "Almoço", tema: "alimentacao", categoria: "alimentacao", valorLimite: 80 }),
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
});
