import { describe, expect, it } from "vitest";
import type { RegrasPolitica } from "@contracts/types";
import { decidirReembolso, type ExtracaoNota } from "./index";

const regras: RegrasPolitica = {
  limitesPorCategoria: { alimentacao: 55 },
  aprovacaoAutomaticaAte: 55,
  revisaoHumanaAcimaDe: 55,
  negacaoAcimaDe: 500,
  exigeVeiculoCadastrado: [],
  exigeEvidencia: [],
  observacoes: [],
};

const base: ExtracaoNota = {
  categoriaSugerida: "alimentacao",
  valor: 42,
  dataFatoGerador: "2026-08-10",
  cnpjEmitente: "13.759.045/0002-77",
  confiancaExtracao: "alta",
  camposPendentes: [],
};

describe("decidirReembolso (D-013/D-014)", () => {
  it("aprova com regra explícita quando dentro da política", () => {
    const r = decidirReembolso(base, regras, { temVeiculo: false });
    expect(r.decisao).toBe("aprovado");
    expect(r.categoria).toBe("alimentacao");
    expect(r.motivos[0]).toContain("Dentro da política");
  });

  it("nega citando a regra quando acima do teto de negação", () => {
    const r = decidirReembolso({ ...base, valor: 600 }, regras, { temVeiculo: false });
    expect(r.decisao).toBe("negado");
    expect(r.motivos.join(" ")).toContain("teto");
  });

  it("devolve para revisão quando acima do limite da categoria (dentro de 1,5×)", () => {
    const r = decidirReembolso({ ...base, valor: 70 }, regras, { temVeiculo: false });
    expect(r.decisao).toBe("revisao_manual");
  });

  it("nega quando acima de 1,5× o limite da categoria (caso do cupom R$ 90,14 > 1,5× R$ 55)", () => {
    const r = decidirReembolso({ ...base, valor: 90.14 }, regras, { temVeiculo: false });
    expect(r.decisao).toBe("negado");
  });

  it("sem política ativa, NUNCA aprova — vai para revisão manual", () => {
    const r = decidirReembolso(base, null, { temVeiculo: false });
    expect(r.decisao).toBe("revisao_manual");
    expect(r.motivos[0]).toContain("sem política");
  });

  it("sem valor extraído → revisão manual (ninguém preenche nada)", () => {
    const r = decidirReembolso({ ...base, valor: null }, regras, { temVeiculo: false });
    expect(r.decisao).toBe("revisao_manual");
    expect(r.motivos[0]).toContain("valor total");
  });

  it("sem data → revisão manual", () => {
    const r = decidirReembolso({ ...base, dataFatoGerador: null }, regras, { temVeiculo: false });
    expect(r.decisao).toBe("revisao_manual");
  });

  it("sem CNPJ do emitente → revisão manual", () => {
    const r = decidirReembolso({ ...base, cnpjEmitente: null }, regras, { temVeiculo: false });
    expect(r.decisao).toBe("revisao_manual");
    expect(r.motivos[0]).toContain("CNPJ");
  });

  it("categoria indeterminada → revisão manual, categoria null", () => {
    const r = decidirReembolso({ ...base, categoriaSugerida: null }, regras, { temVeiculo: false });
    expect(r.decisao).toBe("revisao_manual");
    expect(r.categoria).toBeNull();
  });

  it("combustível sem veículo cadastrado → revisão manual (regra da política)", () => {
    const regrasComb: RegrasPolitica = {
      ...regras,
      limitesPorCategoria: { combustivel: 300 },
      aprovacaoAutomaticaAte: 300,
      revisaoHumanaAcimaDe: 300,
      exigeVeiculoCadastrado: ["combustivel"],
    };
    const r = decidirReembolso(
      { ...base, categoriaSugerida: "combustivel", valor: 100 },
      regrasComb,
      { temVeiculo: false },
    );
    expect(r.decisao).toBe("revisao_manual");
  });
});
