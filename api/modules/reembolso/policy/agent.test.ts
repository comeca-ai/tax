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
