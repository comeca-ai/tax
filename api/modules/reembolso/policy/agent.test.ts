import { describe, expect, it } from "vitest";
import { regrasPoliticaSchema, type RegrasPolitica } from "@contracts/types";
import { avaliarDespesa } from "./agent";

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

/** Mesmo teto, sem unidade: comportamento clássico (acima de 1,5× nega). */
const TETO_POR_NOTA: RegrasPolitica = regrasPoliticaSchema.parse({
  limitesPorCategoria: { hospedagem: 400 },
  aprovacaoAutomaticaAte: 2000,
});

describe("avaliarDespesa — teto por período nunca nega (D-013)", () => {
  it("(a) teto de R$ 400 por dia + comprovante de R$ 1.200 → revisão humana, nunca negado", () => {
    const r = avaliarDespesa(
      { categoria: "hospedagem", valorNota: 1200 },
      TETO_TEMPORAL,
      { temVeiculo: false, temEvidencia: true },
    );
    expect(r.decisao).not.toBe("negado");
    expect(r.decisao).toBe("revisao_humana");
    expect(r.motivos[0]).toBe(
      "Valor de hospedagem acima do teto da política (R$ 400,00 por dia): R$ 1.200,00. Como o teto é por dia e o comprovante pode cobrir mais de um, a despesa vai para revisão do gestor em vez de ser negada.",
    );
    expect(r.regrasAplicadas.find((a) => a.regra === "limitePorCategoria")).toEqual({
      regra: "limitePorCategoria",
      resultado: "revisar",
      detalhe:
        "R$ 1.200,00 acima do teto de hospedagem (R$ 400,00 por dia); teto por período — revisão humana, sem negação automática",
    });
  });

  it("(b) mesmo teto SEM unidade temporal + R$ 1.200 → negado (1,5× de R$ 400)", () => {
    const r = avaliarDespesa(
      { categoria: "hospedagem", valorNota: 1200 },
      TETO_POR_NOTA,
      { temVeiculo: false, temEvidencia: true },
    );
    expect(r.decisao).toBe("negado");
    expect(r.regrasAplicadas.find((a) => a.regra === "limitePorCategoria")?.resultado).toBe("falhou");
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

  it("teto temporal estourado dentro de 1,5× também vai para revisão, citando a unidade", () => {
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

  it("nega quando valor supera 1,5× o limite da categoria", () => {
    const r = avaliarDespesa(
      { categoria: "alimentacao", valorNota: 200 }, // limite 120 → 1,5× = 180
      REGRAS_DEMO,
      { temVeiculo: false, temEvidencia: true },
    );
    expect(r.decisao).toBe("negado");
    expect(r.motivos[0]).toContain("1,5×");
    expect(
      r.regrasAplicadas.find((a) => a.regra === "limitePorCategoria"),
    ).toMatchObject({
      regra: "limitePorCategoria",
      resultado: "falhou",
    });
  });

  it("manda para revisão quando acima do limite mas dentro de 1,5×", () => {
    const r = avaliarDespesa(
      { categoria: "alimentacao", valorNota: 150 }, // >120, ≤180
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

  it("default conservador: sem teto de aprovação configurado → revisão humana", () => {
    const r = avaliarDespesa(
      { categoria: "alimentacao", valorNota: 50 },
      SEM_TETO,
      { temVeiculo: false, temEvidencia: false },
    );
    expect(r.decisao).toBe("revisao_humana");
    expect(r.motivos.join(" ")).toContain("sem teto de aprovação");
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
