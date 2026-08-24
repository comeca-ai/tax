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
    exigeDocumentoFiscal: false,
    decisaoAutomatica: "nenhuma",
    ...parcial,
  };
}

describe("derivarParametros — limitesPorCategoria (só escopo 'categoria')", () => {
  it("limite é o MENOR dos valores BRL reembolsáveis de escopo categoria; exceção/vedado/USD ignorados", () => {
    const p = derivarParametros([
      regra({ descricao: "Café", tema: "alimentacao", categoria: "alimentacao", escopo: "categoria", valorLimite: 30 }),
      regra({ descricao: "Jantar", tema: "alimentacao", categoria: "alimentacao", escopo: "categoria", valorLimite: 120 }),
      regra({ descricao: "Exceção", tema: "alimentacao", categoria: "alimentacao", escopo: "categoria", valorLimite: 500, reembolsavel: "excecao" }),
      regra({ descricao: "Vedado", tema: "alimentacao", categoria: "alimentacao", escopo: "categoria", valorLimite: 900, reembolsavel: "vedado" }),
      regra({ descricao: "USD", tema: "alimentacao", categoria: "alimentacao", escopo: "categoria", valorLimite: 900, moeda: "USD" }),
    ]);
    // Aplicar TODAS as regras: acima do menor teto declarado, revisão (nunca eleger vencedora).
    expect(p.limitesPorCategoria).toEqual({ alimentacao: 30 });
    expect(p.limitesCitados).toEqual([
      {
        categoria: "alimentacao",
        regraId: "café",
        descricao: "Café",
        motivo: 'Teto de alimentação na política: R$ 30 — regra: "Café".',
      },
    ]);
  });

  it("duas regras de categoria com valores diferentes: o MENOR governa e é ele que a decisão cita", () => {
    const p = derivarParametros([
      regra({ descricao: "Hospedagem até 400", tema: "hospedagem-e-viagem", categoria: "hospedagem", escopo: "categoria", valorLimite: 400 }),
      regra({ descricao: "Hospedagem até 150", tema: "hospedagem-e-viagem", categoria: "hospedagem", escopo: "categoria", valorLimite: 150 }),
    ]);
    expect(p.limitesPorCategoria).toEqual({ hospedagem: 150 });
    expect(p.limitesCitados.map((c) => c.descricao)).toEqual(["Hospedagem até 150"]);
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

  it("empate no menor entre regra temporal e não temporal marca como temporal (conservador)", () => {
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

describe("derivarParametros — vedação, exceção e lacunas por categoria", () => {
  it("vedação automática exige regra vedada MARCADA 'negar' com escopo categoria", () => {
    const p = derivarParametros([
      regra({ descricao: "Uber liberado", categoria: "uber" }),
      regra({
        descricao: "Mobilidade urbana não é reembolsada",
        categoria: "uber",
        escopo: "categoria",
        reembolsavel: "vedado",
        decisaoAutomatica: "negar",
      }),
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
    expect(p.lacunas).toEqual([]);
  });

  it("regra vedada de escopo categoria SEM marcação não veda nada — vira lacuna", () => {
    const p = derivarParametros([
      regra({ descricao: "Uber liberado", categoria: "uber" }),
      regra({ descricao: "Mobilidade urbana não é reembolsada", categoria: "uber", escopo: "categoria", reembolsavel: "vedado" }),
    ]);
    expect(p.categoriasVedadas).toEqual([]);
    expect(p.lacunas.map((l) => l.tipo)).toEqual(["conflito-vedado-permissivo"]);
  });

  it("só regra vedada na categoria, sem marcação → lacuna 'so-vedado-sem-marcacao', nunca negação", () => {
    const p = derivarParametros([
      regra({ descricao: "Gorjetas para motoristas", categoria: "uber", reembolsavel: "vedado" }),
    ]);
    expect(p.categoriasVedadas).toEqual([]);
    expect(p.lacunas).toEqual([
      {
        tipo: "so-vedado-sem-marcacao",
        categoria: "uber",
        regraIds: ["gorjetas-para-motoristas"],
        motivo:
          'A política só tem regra vedada para Uber/app — regra: "Gorjetas para motoristas" — e nenhuma está marcada como negação automática. A despesa vai para revisão do gestor.',
      },
    ]);
  });

  it("vedada convivendo com reembolsável → lacuna 'conflito-vedado-permissivo', nomeando as duas regras", () => {
    const p = derivarParametros([
      regra({ descricao: "Aplicativos de transporte", categoria: "uber" }),
      regra({ descricao: "Gorjetas para motoristas", categoria: "uber", reembolsavel: "vedado" }),
    ]);
    expect(p.categoriasVedadas).toEqual([]);
    expect(p.categoriasExcecao).toEqual([]);
    expect(p.lacunas).toEqual([
      {
        tipo: "conflito-vedado-permissivo",
        categoria: "uber",
        regraIds: ["gorjetas-para-motoristas", "aplicativos-de-transporte"],
        motivo:
          'A política tem regra vedada e regra permissiva para Uber/app e não diz qual prevalece — regras: "Gorjetas para motoristas" e "Aplicativos de transporte". A despesa vai para revisão do gestor.',
      },
    ]);
  });

  it("categoriasExcecao só nasce de regra 'excecao' com escopo categoria", () => {
    const soItem = derivarParametros([
      regra({ descricao: "Hospedagem em viagens", categoria: "hospedagem", reembolsavel: "excecao" }),
    ]);
    expect(soItem.categoriasExcecao).toEqual([]);

    const p = derivarParametros([
      regra({ descricao: "Hospedagem em viagens", categoria: "hospedagem", escopo: "categoria", reembolsavel: "excecao" }),
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
    expect(p.lacunas).toEqual([]);
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

  it("nenhuma categoria é negada nem excepcionada automaticamente; hospedagem e Uber viram lacuna", () => {
    const p = derivarParametros(REGRAS_POLITICA_13);
    expect(p.categoriasVedadas).toEqual([]);
    // Nenhuma regra da política real tem escopo "categoria": nada é declarado como exceção.
    expect(p.categoriasExcecao).toEqual([]);
    expect(p.lacunas.map((l) => `${l.categoria}:${l.tipo}`)).toEqual([
      "hospedagem:conflito-vedado-permissivo",
      "uber:conflito-vedado-permissivo",
    ]);
  });

  it("a política real, como está, NÃO autoriza nada: nenhum teto de aprovação nem de negação", () => {
    const p = derivarParametros(REGRAS_POLITICA_13);
    expect(p.aprovacaoAutomaticaAte).toBeNull();
    expect(p.aprovacaoAutomaticaAteRegraId).toBeNull();
    expect(p.aprovacaoAutomaticaPorCategoria).toEqual({});
    expect(p.revisaoHumanaAcimaDe).toBeNull();
    expect(p.negacaoAcimaDe).toBeNull();
    expect(p.exigeVeiculoCadastrado).toEqual([]);
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

describe("derivarParametros — exigeVeiculoCadastrado (regex morta na v1.8)", () => {
  it("texto 'veículo cadastrado' em regra de combustível NÃO exige mais veículo (P-3 adiada)", () => {
    const p = derivarParametros([
      regra({
        descricao: "Reembolso de combustível para veículo cadastrado",
        tema: "transporte-e-deslocamento",
        categoria: "combustivel",
      }),
    ]);
    expect(p.exigeVeiculoCadastrado).toEqual([]);
  });

  it("nenhum texto livre reintroduz a exigência", () => {
    const p = derivarParametros([
      regra({ descricao: "Deslocamento", tema: "transporte-e-deslocamento", condicao: "apenas carro próprio" }),
      regra({ descricao: "Almoço com veículo próprio", tema: "alimentacao", categoria: "alimentacao" }),
    ]);
    expect(p.exigeVeiculoCadastrado).toEqual([]);
  });
});

describe("derivarParametros — tetos gerais (só a marcação do gestor autoriza)", () => {
  it("aprovar / exceção / negar viram os 3 tetos, cada um citando a regra", () => {
    const p = derivarParametros([
      regra({ descricao: "Alçada do gestor", valorLimite: 200, decisaoAutomatica: "aprovar" }),
      regra({ descricao: "Acima deste valor exige aprovação do diretor", valorLimite: 1000, reembolsavel: "excecao" }),
      regra({ descricao: "Teto por despesa", valorLimite: 5000, reembolsavel: "vedado", decisaoAutomatica: "negar" }),
    ]);
    expect(p.aprovacaoAutomaticaAte).toBe(200);
    expect(p.aprovacaoAutomaticaAteRegraId).toBe("alçada-do-gestor");
    expect(p.revisaoHumanaAcimaDe).toBe(1000);
    expect(p.revisaoHumanaAcimaDeRegraId).toBe("acima-deste-valor-exige-aprovação-do-diretor");
    expect(p.negacaoAcimaDe).toBe(5000);
    expect(p.negacaoAcimaDeRegraId).toBe("teto-por-despesa");
  });

  it("D-013: texto 'aprovação automática' SEM marcação não gera teto de aprovação (regex morta)", () => {
    const p = derivarParametros([
      regra({ descricao: "Aprovação automática até o valor de alçada", valorLimite: 200 }),
      regra({ descricao: "Reembolso automático de pequenas despesas", valorLimite: 300 }),
    ]);
    expect(p.aprovacaoAutomaticaAte).toBeNull();
    expect(p.aprovacaoAutomaticaAteRegraId).toBeNull();
  });

  it("os três tetos aplicam TODAS as regras: o menor valor governa em cada um", () => {
    const p = derivarParametros([
      regra({ descricao: "Aprova até 300", valorLimite: 300, decisaoAutomatica: "aprovar" }),
      regra({ descricao: "Aprova até 500", valorLimite: 500, decisaoAutomatica: "aprovar" }),
      regra({ descricao: "Alçada do gestor", valorLimite: 800, reembolsavel: "excecao" }),
      regra({ descricao: "Alçada da diretoria", valorLimite: 1500, reembolsavel: "excecao" }),
      regra({ descricao: "Nega acima de 4000", valorLimite: 4000, reembolsavel: "vedado", decisaoAutomatica: "negar" }),
      regra({ descricao: "Nega acima de 5000", valorLimite: 5000, reembolsavel: "vedado", decisaoAutomatica: "negar" }),
    ]);
    expect(p.aprovacaoAutomaticaAte).toBe(300);
    expect(p.aprovacaoAutomaticaAteRegraId).toBe("aprova-até-300");
    expect(p.revisaoHumanaAcimaDe).toBe(800);
    expect(p.negacaoAcimaDe).toBe(4000);
    expect(p.negacaoAcimaDeRegraId).toBe("nega-acima-de-4000");
  });

  it("regra com categoria, moeda estrangeira ou unidade dias_* não vira teto geral", () => {
    const p = derivarParametros([
      regra({ descricao: "Aprova por categoria", categoria: "alimentacao", valorLimite: 200, decisaoAutomatica: "aprovar" }),
      regra({ descricao: "Revisão humana acima de", valorLimite: 30, unidadeLimite: "dias_para_pagamento", reembolsavel: "excecao" }),
      regra({ descricao: "Aprova em dólar", valorLimite: 200, moeda: "USD", decisaoAutomatica: "aprovar" }),
    ]);
    expect(p.aprovacaoAutomaticaAte).toBeNull();
    expect(p.revisaoHumanaAcimaDe).toBeNull();
    expect(p.negacaoAcimaDe).toBeNull();
  });

  it("regra 'exceção' com texto 'aprovação automática' vira revisão, nunca aprovação", () => {
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

describe("derivarParametros — aprovacaoAutomaticaPorCategoria", () => {
  it("nasce de regra marcada 'aprovar' com escopo categoria", () => {
    const p = derivarParametros([
      regra({ descricao: "Almoço em viagem", tema: "alimentacao", categoria: "alimentacao", escopo: "categoria", valorLimite: 70, decisaoAutomatica: "aprovar" }),
    ]);
    expect(p.aprovacaoAutomaticaPorCategoria).toEqual({ alimentacao: 70 });
    expect(p.limitesPorCategoria).toEqual({ alimentacao: 70 });
  });

  it("marcada com escopo 'item' não produz teto de aprovação nem de categoria", () => {
    const p = derivarParametros([
      regra({ descricao: "Café", tema: "alimentacao", categoria: "alimentacao", valorLimite: 30, decisaoAutomatica: "aprovar" }),
    ]);
    expect(p.aprovacaoAutomaticaPorCategoria).toEqual({});
    expect(p.limitesPorCategoria).toEqual({});
  });

  it("duas marcadas na mesma categoria: o menor teto governa", () => {
    const p = derivarParametros([
      regra({ descricao: "Almoço 90", tema: "alimentacao", categoria: "alimentacao", escopo: "categoria", valorLimite: 90, decisaoAutomatica: "aprovar" }),
      regra({ descricao: "Almoço 70", tema: "alimentacao", categoria: "alimentacao", escopo: "categoria", valorLimite: 70, decisaoAutomatica: "aprovar" }),
    ]);
    expect(p.aprovacaoAutomaticaPorCategoria).toEqual({ alimentacao: 70 });
  });
});

describe("derivarParametros — lacuna 'marcacao-sem-valor' (P-5: aprovar exige teto)", () => {
  it("marcada 'aprovar' com unidade percentual não vira teto e gera lacuna", () => {
    const p = derivarParametros([
      regra({ descricao: "Reembolso de 50% da mensalidade", valorLimite: 50, unidadeLimite: "percentual", decisaoAutomatica: "aprovar" }),
    ]);
    expect(p.aprovacaoAutomaticaAte).toBeNull();
    expect(p.lacunas).toEqual([
      {
        tipo: "marcacao-sem-valor",
        categoria: null,
        regraIds: ["reembolso-de-50%-da-mensalidade"],
        motivo:
          'A regra "Reembolso de 50% da mensalidade" está marcada para o agente aprovar sozinho, mas não tem limite em reais — o agente não pode aplicá-la.',
      },
    ]);
  });

  it("marcada 'aprovar' sem valor ou em moeda estrangeira também gera lacuna", () => {
    const p = derivarParametros([
      regra({ descricao: "Pedágio sem teto", categoria: "pedagio", decisaoAutomatica: "aprovar" }),
      regra({ descricao: "Diária em dólar", valorLimite: 200, moeda: "USD", decisaoAutomatica: "aprovar" }),
    ]);
    expect(p.lacunas.map((l) => l.tipo)).toEqual(["marcacao-sem-valor", "marcacao-sem-valor"]);
    expect(p.lacunas[0].categoria).toBe("pedagio");
    expect(p.aprovacaoAutomaticaAte).toBeNull();
  });

  it("marcada 'aprovar' com valor em reais não gera lacuna", () => {
    const p = derivarParametros([
      regra({ descricao: "Alçada do gestor", valorLimite: 500, decisaoAutomatica: "aprovar" }),
    ]);
    expect(p.lacunas).toEqual([]);
    expect(p.aprovacaoAutomaticaAte).toBe(500);
  });
});

describe("derivarParametros — exigeDocumentoFiscal (declaração do gestor, sem match por id)", () => {
  it("regra com o campo marcado exige documento fiscal e é citada", () => {
    const p = derivarParametros([
      regra({ id: "so-nota-fiscal", descricao: "Só aceitamos nota fiscal ou recibo", reembolsavel: "vedado", exigeDocumentoFiscal: true }),
    ]);
    expect(p.exigeDocumentoFiscal).toBe(true);
    expect(p.regraDocumentoFiscalId).toBe("so-nota-fiscal");
  });

  it("sem a marcação, não exige", () => {
    const p = derivarParametros([regra({ descricao: "Almoço", tema: "alimentacao", categoria: "alimentacao" })]);
    expect(p.exigeDocumentoFiscal).toBe(false);
    expect(p.regraDocumentoFiscalId).toBeNull();
  });

  it("o id 'comprovantes-nao-aceitos' deixou de significar qualquer coisa (match por id morto)", () => {
    const p = derivarParametros([
      regra({ id: "comprovantes-nao-aceitos", descricao: "Comprovantes de pagamento não são aceitos", reembolsavel: "vedado" }),
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
    expect(uma.lacunas).toEqual([]);
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

  it("sem marcação do gestor nada é vedado nem excepcionado: as duas listas viram lacunas nomeadas", () => {
    const regras = regrasPoliticaSchema.parse({
      regrasExtraidas: [
        regra({ descricao: "Aplicativos de transporte", categoria: "uber" }),
        regra({ descricao: "Gorjetas para motoristas", categoria: "uber", reembolsavel: "vedado" }),
        regra({ descricao: "Bebidas alcoólicas", categoria: "alimentacao", reembolsavel: "vedado" }),
      ],
    });
    const consolidada = consolidarRegras(regras);
    expect(consolidada.categoriasVedadas).toEqual([]);
    expect(consolidada.categoriasExcecao).toEqual([]);
    expect(consolidada.lacunas).toEqual([
      {
        tipo: "so-vedado-sem-marcacao",
        categoria: "alimentacao",
        regraIds: ["bebidas-alcoólicas"],
        motivo:
          'A política só tem regra vedada para alimentação — regra: "Bebidas alcoólicas" — e nenhuma está marcada como negação automática. A despesa vai para revisão do gestor.',
      },
      {
        tipo: "conflito-vedado-permissivo",
        categoria: "uber",
        regraIds: ["gorjetas-para-motoristas", "aplicativos-de-transporte"],
        motivo:
          'A política tem regra vedada e regra permissiva para Uber/app e não diz qual prevalece — regras: "Gorjetas para motoristas" e "Aplicativos de transporte". A despesa vai para revisão do gestor.',
      },
    ]);
  });
});
