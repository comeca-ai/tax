import { describe, expect, it } from "vitest";
import {
  CATEGORIA_DESPESA_ROTULO as ROTULO,
  regrasPoliticaSchema,
  type RegrasPolitica,
} from "@contracts/types";
import { avaliarDespesa } from "./agent";
import { consolidarRegras } from "./derivar";

/**
 * Agente avaliador da política (v1.1.0) — função pura.
 * Regras demo espelham o seed (política da Transportes Demo Ltda).
 */
const REGRAS_DEMO: RegrasPolitica = regrasPoliticaSchema.parse({
  limitesPorCategoria: {
    alimentacao: 120,
    hospedagem: 450,
    uber: 80,
    taxi: 80,
    combustivel: 600,
    pedagio: null,
  },
  exigeVeiculoCadastrado: ["combustivel"],
  exigeEvidencia: ["hospedagem", "alimentacao"],
  aprovacaoAutomaticaAte: 200,
  revisaoHumanaAcimaDe: 2000,
  negacaoAcimaDe: 5000,
  observacoes: [],
});

const SEM_TETO: RegrasPolitica = regrasPoliticaSchema.parse({
  limitesPorCategoria: { alimentacao: 120 },
});

/** Política que marcou hospedagem como vedada e Uber como exceção (derivado em `derivar.ts`). */
const REGRAS_MARCADAS: RegrasPolitica = regrasPoliticaSchema.parse({
  ...REGRAS_DEMO,
  categoriasVedadas: [
    {
      categoria: "hospedagem",
      regraId: "hospedagem-de-dependentes",
      descricao: "Hospedagem de acompanhantes e dependentes",
      motivo:
        'Categoria hospedagem vedada pela política — regra: "Hospedagem de acompanhantes e dependentes".',
    },
  ],
  categoriasExcecao: [
    {
      categoria: "uber",
      regraId: "gorjetas-motoristas-aplicativo",
      descricao: "Gorjetas para motoristas de aplicativos de mobilidade urbana",
      motivo:
        'Categoria Uber/app exige aprovação superior na política — regra: "Gorjetas para motoristas de aplicativos de mobilidade urbana".',
    },
  ],
});

/** Teto de hospedagem promovido pelo gestor com unidade por diária (Decisão 1 do dono). */
const TETO_TEMPORAL: RegrasPolitica = regrasPoliticaSchema.parse({
  limitesPorCategoria: { hospedagem: 400 },
  tetosTemporaisPorCategoria: { hospedagem: "dia" },
  aprovacaoAutomaticaAte: 2000,
});

/** Mesmo teto, sem unidade: desde a v1.8 o desfecho é o mesmo — revisão, nunca negação. */
const TETO_POR_NOTA: RegrasPolitica = regrasPoliticaSchema.parse({
  limitesPorCategoria: { hospedagem: 400 },
  aprovacaoAutomaticaAte: 2000,
});

describe("avaliarDespesa — teto de categoria nunca nega (D-013)", () => {
  it("(a) teto de R$ 400 por dia + comprovante de R$ 1.200 → revisão humana, nunca negado", () => {
    const r = avaliarDespesa(
      { categoria: "hospedagem", valorNota: 1200 },
      TETO_TEMPORAL,
      { temVeiculo: false, temEvidencia: true },
    );
    expect(r.decisao).not.toBe("negado");
    expect(r.decisao).toBe("revisao_humana");
    expect(r.motivos[0]).toBe(
      `Valor de ${ROTULO.hospedagem} acima do limite da política (R$ 400,00 por dia): R$ 1.200,00. A despesa vai para a sua revisão.`,
    );
    expect(r.regrasAplicadas.find((a) => a.regra === "limitePorCategoria")).toEqual({
      regra: "limitePorCategoria",
      resultado: "revisar",
      detalhe: `R$ 1.200,00 acima do limite de ${ROTULO.hospedagem} (R$ 400,00 por dia)`,
    });
  });

  it("(b) mesmo teto SEM unidade temporal + R$ 1.200 → revisão, sem citar tolerância nenhuma", () => {
    const r = avaliarDespesa(
      { categoria: "hospedagem", valorNota: 1200 },
      TETO_POR_NOTA,
      { temVeiculo: false, temEvidencia: true },
    );
    expect(r.decisao).toBe("revisao_humana");
    expect(r.motivos.join(" ")).not.toContain("1,5");
    expect(r.regrasAplicadas.find((a) => a.regra === "limitePorCategoria")?.resultado).toBe("revisar");
  });

  it("(c) R$ 300 dentro do teto → aprovado nos dois casos", () => {
    for (const regras of [TETO_TEMPORAL, TETO_POR_NOTA]) {
      const r = avaliarDespesa(
        { categoria: "hospedagem", valorNota: 300 },
        regras,
        { temVeiculo: false, temEvidencia: true },
      );
      expect(r.decisao).toBe("aprovado");
    }
  });

  it("teto temporal estourado vai para revisão citando a unidade", () => {
    const r = avaliarDespesa(
      { categoria: "hospedagem", valorNota: 500 },
      TETO_TEMPORAL,
      { temVeiculo: false, temEvidencia: true },
    );
    expect(r.decisao).toBe("revisao_humana");
    expect(r.motivos[0]).toContain("R$ 400,00 por dia");
  });
});

describe("avaliarDespesa — categoria vedada e categoria em exceção", () => {
  it("categoria vedada → negado citando a regra da política", () => {
    const r = avaliarDespesa(
      { categoria: "hospedagem", valorNota: 300 },
      REGRAS_MARCADAS,
      { temVeiculo: true, temEvidencia: true },
    );
    expect(r.decisao).toBe("negado");
    expect(r.regrasAplicadas).toHaveLength(1);
    expect(r.regrasAplicadas[0]).toMatchObject({
      regra: "categoriaVedada",
      resultado: "falhou",
      detalhe: 'Regra "Hospedagem de acompanhantes e dependentes" (hospedagem-de-dependentes)',
    });
    expect(r.motivos[0]).toContain("Hospedagem de acompanhantes e dependentes");
  });

  it("vedação vence o teto de negação: valor baixo, categoria vedada → negado pela vedação", () => {
    const r = avaliarDespesa(
      { categoria: "hospedagem", valorNota: 10 },
      REGRAS_MARCADAS,
      { temVeiculo: true, temEvidencia: true },
    );
    expect(r.decisao).toBe("negado");
    expect(r.regrasAplicadas[0].regra).toBe("categoriaVedada");
  });

  it("categoria em exceção, dentro do limite e do teto de aprovação → revisão humana", () => {
    const r = avaliarDespesa(
      { categoria: "uber", valorNota: 40 }, // ≤ limite 80 e ≤ aprovacaoAutomaticaAte 200
      REGRAS_MARCADAS,
      { temVeiculo: true, temEvidencia: true },
    );
    expect(r.decisao).toBe("revisao_humana");
    expect(r.regrasAplicadas.find((a) => a.regra === "categoriaExcecao")).toMatchObject({
      resultado: "revisar",
      detalhe:
        'Regra "Gorjetas para motoristas de aplicativos de mobilidade urbana" (gorjetas-motoristas-aplicativo)',
    });
    expect(r.motivos[0]).toContain("aprovação superior");
  });

  it("categoria não marcada continua aprovando como antes", () => {
    const r = avaliarDespesa(
      { categoria: "alimentacao", valorNota: 120 },
      REGRAS_MARCADAS,
      { temVeiculo: false, temEvidencia: true },
    );
    expect(r.decisao).toBe("aprovado");
    expect(r.regrasAplicadas.some((a) => a.regra.startsWith("categoria"))).toBe(false);
  });
});

describe("avaliarDespesa — agente de política de reembolso", () => {
  it("nega despesa acima do teto absoluto (negacaoAcimaDe)", () => {
    const r = avaliarDespesa(
      { categoria: "hospedagem", valorNota: 5001 },
      REGRAS_DEMO,
      { temVeiculo: true, temEvidencia: true },
    );
    expect(r.decisao).toBe("negado");
    expect(r.motivos[0]).toContain("teto da política");
    expect(r.regrasAplicadas[0]).toMatchObject({
      regra: "negacaoAcimaDe",
      resultado: "falhou",
    });
  });

  it("muito acima do limite da categoria continua sendo REVISÃO, nunca negação (D-013)", () => {
    const r = avaliarDespesa(
      { categoria: "alimentacao", valorNota: 200 }, // limite 120; antes negava por 1,5×
      REGRAS_DEMO,
      { temVeiculo: false, temEvidencia: true },
    );
    expect(r.decisao).toBe("revisao_humana");
    expect(r.motivos.join(" ")).not.toContain("1,5");
    expect(
      r.regrasAplicadas.find((a) => a.regra === "limitePorCategoria"),
    ).toMatchObject({
      regra: "limitePorCategoria",
      resultado: "revisar",
    });
  });

  it("manda para revisão quando acima do limite da categoria", () => {
    const r = avaliarDespesa(
      { categoria: "alimentacao", valorNota: 150 }, // > 120
      REGRAS_DEMO,
      { temVeiculo: false, temEvidencia: true },
    );
    expect(r.decisao).toBe("revisao_humana");
    expect(r.motivos.join(" ")).toContain("limite");
    expect(
      r.regrasAplicadas.find((a) => a.regra === "limitePorCategoria")?.resultado,
    ).toBe("revisar");
  });

  it("manda para revisão quando acima de revisaoHumanaAcimaDe", () => {
    const r = avaliarDespesa(
      { categoria: "pedagio", valorNota: 2500 }, // pedágio sem limite; > 2000
      REGRAS_DEMO,
      { temVeiculo: false, temEvidencia: false },
    );
    expect(r.decisao).toBe("revisao_humana");
    expect(
      r.regrasAplicadas.find((a) => a.regra === "revisaoHumanaAcimaDe")?.resultado,
    ).toBe("revisar");
  });

  it("manda para revisão quando categoria exige veículo cadastrado e não há", () => {
    const r = avaliarDespesa(
      { categoria: "combustivel", valorNota: 300 },
      REGRAS_DEMO,
      { temVeiculo: false, temEvidencia: true },
    );
    expect(r.decisao).toBe("revisao_humana");
    expect(r.motivos.join(" ")).toContain("veículo cadastrado");
    expect(
      r.regrasAplicadas.find((a) => a.regra === "exigeVeiculoCadastrado")?.resultado,
    ).toBe("revisar");
  });

  it("não aplica exigência de veículo quando veículo está vinculado", () => {
    const r = avaliarDespesa(
      { categoria: "combustivel", valorNota: 300 },
      REGRAS_DEMO,
      { temVeiculo: true, temEvidencia: true },
    );
    expect(
      r.regrasAplicadas.find((a) => a.regra === "exigeVeiculoCadastrado")?.resultado,
    ).toBe("passou");
    expect(r.decisao).toBe("revisao_humana"); // 300 > 200 (teto de aprovação auto)
  });

  it("manda para revisão quando categoria exige evidência e não há", () => {
    const r = avaliarDespesa(
      { categoria: "hospedagem", valorNota: 300 }, // ≤ limite 450
      REGRAS_DEMO,
      { temVeiculo: false, temEvidencia: false },
    );
    expect(r.decisao).toBe("revisao_humana");
    expect(r.motivos.join(" ")).toContain("evidência");
    expect(
      r.regrasAplicadas.find((a) => a.regra === "exigeEvidencia")?.resultado,
    ).toBe("revisar");
  });

  it("aprova automaticamente até o teto quando nada falha", () => {
    const r = avaliarDespesa(
      { categoria: "alimentacao", valorNota: 120 },
      REGRAS_DEMO,
      { temVeiculo: false, temEvidencia: true },
    );
    expect(r.decisao).toBe("aprovado");
    expect(r.motivos.join(" ")).toContain("aprovada automaticamente");
    expect(r.regrasAplicadas.every((a) => a.resultado === "passou")).toBe(true);
  });

  it("sem nenhuma regra que autorize aprovação → revisão humana nomeando a ausência", () => {
    const r = avaliarDespesa(
      { categoria: "alimentacao", valorNota: 50 },
      SEM_TETO,
      { temVeiculo: false, temEvidencia: false },
    );
    expect(r.decisao).toBe("revisao_humana");
    expect(r.motivos).toContain(
      "A política da empresa não declara nenhuma regra que autorize o agente a aprovar sozinho — a despesa foi enviada para a sua revisão.",
    );
  });

  it("negação por teto tem precedência sobre limite de categoria", () => {
    const r = avaliarDespesa(
      { categoria: "alimentacao", valorNota: 6000 },
      REGRAS_DEMO,
      { temVeiculo: false, temEvidencia: false },
    );
    expect(r.decisao).toBe("negado");
    expect(r.regrasAplicadas).toHaveLength(1);
    expect(r.regrasAplicadas[0].regra).toBe("negacaoAcimaDe");
  });
});

describe("avaliarDespesa — aprovação só onde o gestor declarou (v1.8)", () => {
  const APROVA_POR_CATEGORIA: RegrasPolitica = regrasPoliticaSchema.parse({
    aprovacaoAutomaticaPorCategoria: { alimentacao: 70 },
  });
  const DOIS_TETOS: RegrasPolitica = regrasPoliticaSchema.parse({
    aprovacaoAutomaticaAte: 500,
    aprovacaoAutomaticaPorCategoria: { alimentacao: 70 },
  });

  it("teto só por categoria: R$ 60 de alimentação aprova, R$ 80 vai para revisão", () => {
    const dentro = avaliarDespesa(
      { categoria: "alimentacao", valorNota: 60 },
      APROVA_POR_CATEGORIA,
      { temVeiculo: false, temEvidencia: true },
    );
    expect(dentro.decisao).toBe("aprovado");

    const fora = avaliarDespesa(
      { categoria: "alimentacao", valorNota: 80 },
      APROVA_POR_CATEGORIA,
      { temVeiculo: false, temEvidencia: true },
    );
    expect(fora.decisao).toBe("revisao_humana");
    expect(fora.motivos.join(" ")).toContain(`teto de aprovação automática de ${ROTULO.alimentacao}`);
  });

  it("teto por categoria não autoriza outra categoria", () => {
    const r = avaliarDespesa(
      { categoria: "hospedagem", valorNota: 10 },
      APROVA_POR_CATEGORIA,
      { temVeiculo: false, temEvidencia: true },
    );
    expect(r.decisao).toBe("revisao_humana");
    expect(r.motivos.join(" ")).toContain("não declara nenhuma regra que autorize");
  });

  it("os dois tetos juntos: o menor aplicável governa (global 500 + categoria 70)", () => {
    const r = avaliarDespesa(
      { categoria: "alimentacao", valorNota: 100 },
      DOIS_TETOS,
      { temVeiculo: false, temEvidencia: true },
    );
    expect(r.decisao).toBe("revisao_humana");

    const dentro = avaliarDespesa(
      { categoria: "alimentacao", valorNota: 60 },
      DOIS_TETOS,
      { temVeiculo: false, temEvidencia: true },
    );
    expect(dentro.decisao).toBe("aprovado");
    expect(dentro.motivos.join(" ")).toContain("R$ 60,00 ≤ R$ 70,00");
  });

  it("teto global sozinho: R$ 150 com teto 200 → aprovado", () => {
    const r = avaliarDespesa(
      { categoria: "pedagio", valorNota: 150 },
      regrasPoliticaSchema.parse({ aprovacaoAutomaticaAte: 200 }),
      { temVeiculo: false, temEvidencia: true },
    );
    expect(r.decisao).toBe("aprovado");
  });
});

describe("avaliarDespesa — lacunas da política viram revisão nomeada", () => {
  const LACUNA_GLOBAL: RegrasPolitica = regrasPoliticaSchema.parse({
    aprovacaoAutomaticaAte: 500,
    lacunas: [
      { tipo: "marcacao-sem-valor", categoria: null, regraIds: ["x"], motivo: "Falta o limite em reais da regra X." },
    ],
  });
  const LACUNA_DA_CATEGORIA: RegrasPolitica = regrasPoliticaSchema.parse({
    aprovacaoAutomaticaAte: 500,
    lacunas: [
      {
        tipo: "conflito-vedado-permissivo",
        categoria: "alimentacao",
        regraIds: ["a", "b"],
        motivo: "A política tem regra vedada e regra permissiva para alimentação.",
      },
    ],
  });

  it("lacuna sem categoria manda qualquer despesa para revisão", () => {
    for (const categoria of ["alimentacao", "hospedagem"] as const) {
      const r = avaliarDespesa({ categoria, valorNota: 10 }, LACUNA_GLOBAL, {
        temVeiculo: false,
        temEvidencia: true,
      });
      expect(r.decisao).toBe("revisao_humana");
      expect(r.motivos).toContain("Falta o limite em reais da regra X.");
      expect(r.regrasAplicadas).toContainEqual({
        regra: "lacunaDaPolitica",
        resultado: "revisar",
        detalhe: "marcacao-sem-valor",
      });
    }
  });

  it("lacuna de categoria só afeta a categoria dela", () => {
    const naCategoria = avaliarDespesa({ categoria: "alimentacao", valorNota: 10 }, LACUNA_DA_CATEGORIA, {
      temVeiculo: false,
      temEvidencia: true,
    });
    expect(naCategoria.decisao).toBe("revisao_humana");
    expect(naCategoria.motivos).toContain("A política tem regra vedada e regra permissiva para alimentação.");

    const fora = avaliarDespesa({ categoria: "hospedagem", valorNota: 10 }, LACUNA_DA_CATEGORIA, {
      temVeiculo: false,
      temEvidencia: true,
    });
    expect(fora.decisao).toBe("aprovado");
  });
});

describe("avaliarDespesa — negação por categoria só com marcação do gestor", () => {
  it("regra vedada marcada 'negar' com escopo categoria → negado citando a regra", () => {
    const regras = consolidarRegras(
      regrasPoliticaSchema.parse({
        regrasExtraidas: [
          {
            id: "gorjetas-motoristas-aplicativo",
            tema: "transporte-e-deslocamento",
            categoria: "uber",
            escopo: "categoria",
            descricao: "Gorjetas para motoristas de aplicativos",
            reembolsavel: "vedado",
            decisaoAutomatica: "negar",
          },
        ],
      }),
    );
    const r = avaliarDespesa({ categoria: "uber", valorNota: 32 }, regras, {
      temVeiculo: false,
      temEvidencia: true,
    });
    expect(r.decisao).toBe("negado");
    expect(r.motivos[0]).toContain("Gorjetas para motoristas de aplicativos");
  });

  it("a MESMA regra sem a marcação não nega nada: vira lacuna e revisão", () => {
    const regras = consolidarRegras(
      regrasPoliticaSchema.parse({
        regrasExtraidas: [
          {
            id: "gorjetas-motoristas-aplicativo",
            tema: "transporte-e-deslocamento",
            categoria: "uber",
            escopo: "categoria",
            descricao: "Gorjetas para motoristas de aplicativos",
            reembolsavel: "vedado",
          },
        ],
      }),
    );
    const r = avaliarDespesa({ categoria: "uber", valorNota: 32 }, regras, {
      temVeiculo: false,
      temEvidencia: true,
    });
    expect(r.decisao).toBe("revisao_humana");
    expect(r.motivos.join(" ")).toContain(`só tem 1 regra vedada para ${ROTULO.uber}`);
  });
});

describe("avaliarDespesa — negacaoAcimaDe nomeia a regra que fixou o teto", () => {
  it("motivo cita a descrição da regra marcada 'negar'", () => {
    const regras = consolidarRegras(
      regrasPoliticaSchema.parse({
        regrasExtraidas: [
          {
            id: "teto-absoluto",
            tema: "governanca-do-processo",
            descricao: "Nenhuma despesa acima de R$ 5.000 é reembolsada",
            reembolsavel: "vedado",
            valorLimite: 5000,
            decisaoAutomatica: "negar",
          },
        ],
      }),
    );
    const r = avaliarDespesa({ categoria: "hospedagem", valorNota: 6000 }, regras, {
      temVeiculo: false,
      temEvidencia: true,
    });
    expect(r.decisao).toBe("negado");
    expect(r.motivos[0]).toContain('Regra: "Nenhuma despesa acima de R$ 5.000 é reembolsada".');
  });
});
