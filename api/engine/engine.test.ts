import { describe, expect, it } from "vitest";
import {
  matchCnaePadrao,
  processarDespesa,
  selecionarRegra,
  type RegraVigente,
} from "./index";

const regra = (
  padrao: string,
  categoria: RegraVigente["categoria"],
  tributo: RegraVigente["tributo"],
  confianca: RegraVigente["confianca"],
  tipoBeneficio: RegraVigente["tipoBeneficio"] = "credito",
): RegraVigente => ({
  cnaePadrao: padrao,
  categoria,
  tributo,
  tipoBeneficio,
  confianca,
  aliquota: null,
  baseLegal: null,
  vigenciaInicio: "2024-01-01",
  vigenciaFim: null,
  versao: "1.1",
});

const REGRAS: RegraVigente[] = [
  regra("49.30-2", "combustivel", "pis_cofins", "alta"),
  regra("49.2x", "combustivel", "pis_cofins", "alta"),
  regra("47.31-8", "combustivel", "pis_cofins", "vedado"),
  regra("69.11-7", "combustivel", "pis_cofins", "baixa"),
  regra("*", "combustivel", "pis_cofins", "baixa"),
  regra("*", "combustivel", "irpj_csll", "alta", "dedutibilidade"),
  regra("*", "alimentacao", "irpj_csll", "alta", "dedutibilidade"),
];

describe("matchCnaePadrao", () => {
  it("casa exato, prefixo e fallback", () => {
    expect(matchCnaePadrao("49.30-2", "49.30-2")).toBeGreaterThan(100);
    expect(matchCnaePadrao("49.21-0", "49.2x")).toBe(3);
    expect(matchCnaePadrao("49.30-2", "49.2x")).toBe(-1); // 49302 não é do subgrupo 49.2
    expect(matchCnaePadrao("47.31-8", "49.2x")).toBe(-1);
    expect(matchCnaePadrao("qualquer", "*")).toBe(0);
  });
});

describe("selecionarRegra", () => {
  it("prefere a regra mais específica", () => {
    const r = selecionarRegra(REGRAS, "49.30-2", "combustivel", "pis_cofins", "2026-01-15");
    expect(r?.cnaePadrao).toBe("49.30-2");
  });
  it("usa fallback * quando não mapeado", () => {
    const r = selecionarRegra(REGRAS, "55.90-1", "combustivel", "pis_cofins", "2026-01-15");
    expect(r?.cnaePadrao).toBe("*");
    expect(r?.confianca).toBe("baixa");
  });
  it("respeita vigência (RF-07)", () => {
    const comVigencia = REGRAS.map((r) =>
      r.cnaePadrao === "49.30-2"
        ? { ...r, vigenciaInicio: "2026-06-01" as const }
        : r,
    );
    const r = selecionarRegra(comVigencia, "49.30-2", "combustivel", "pis_cofins", "2026-01-15");
    expect(r?.cnaePadrao).toBe("*");
  });
});

const empresa = {
  cnaePrincipal: "49.30-2",
  regimeTributario: "lucro_real" as const,
  uf: "SP",
};
const veiculo = { kmPorLitroDeclarado: 8.5, tarifaReembolsoKm: 0.85 };

describe("processarDespesa", () => {
  it("RF-02/03: transporte de cargas, combustível, alta confiança → aprovada com créditos paralelos", () => {
    const r = processarDespesa(
      empresa,
      {
        categoria: "combustivel",
        valorNota: 1000,
        dataFatoGerador: "2026-01-15",
        litros: 100,
        kmComercial: 850,
        kmNaoComercial: 0,
      },
      veiculo,
      REGRAS,
    );
    expect(r.confianca).toBe("alta");
    expect(r.statusSugerido).toBe("aprovada");
    const tributos = r.memorialTributos.map((m) => m.tributo).sort();
    expect(tributos).toEqual(["icms", "irpj_csll", "pis_cofins"]);
    const pis = r.memorialTributos.find((m) => m.tributo === "pis_cofins");
    expect(pis?.valor).toBeCloseTo(83.25, 2); // 1000 × 9,25% × 90%
    const ded = r.memorialTributos.find((m) => m.tributo === "irpj_csll");
    expect(ded?.valor).toBeCloseTo(340, 2); // 1000 × 34%
    // valor_reembolsavel = tarifa × km (independente do valor fiscal)
    expect(r.valorReembolsavel).toBeCloseTo(722.5, 2);
    expect(r.valorFiscal).toBeCloseTo(1000, 2);
  });

  it("RF-07: MP 1.340/2026 zera PIS/COFINS a partir de 11/03/2026", () => {
    const r = processarDespesa(
      empresa,
      {
        categoria: "combustivel",
        valorNota: 1000,
        dataFatoGerador: "2026-04-01",
        litros: 100,
        kmComercial: 850,
        kmNaoComercial: 0,
      },
      veiculo,
      REGRAS,
    );
    expect(r.memorialTributos.find((m) => m.tributo === "pis_cofins")).toBeUndefined();
    expect(r.alertas.some((a) => a.includes("MP 1.340/2026"))).toBe(true);
  });

  it("RF-09: divergência de consumo > 15% rebaixa confiança e envia à revisão", () => {
    const r = processarDespesa(
      empresa,
      {
        categoria: "combustivel",
        valorNota: 1000,
        dataFatoGerador: "2026-01-15",
        litros: 100,
        kmComercial: 400, // 4 km/L vs 8,5 declarado → 53% divergência
        kmNaoComercial: 0,
      },
      veiculo,
      REGRAS,
    );
    expect(r.confianca).toBe("media"); // rebaixada de alta
    expect(r.statusSugerido).toBe("em_revisao");
    expect(r.plausibilidade.aprovado).toBe(false);
    expect(r.requerEvidencia).toBe(true);
  });

  it("RF-02: CNAE vedado (revenda de combustível) → rejeitada", () => {
    const r = processarDespesa(
      { ...empresa, cnaePrincipal: "47.31-8" },
      {
        categoria: "combustivel",
        valorNota: 1000,
        dataFatoGerador: "2026-01-15",
        litros: 100,
        kmComercial: 0,
        kmNaoComercial: 0,
      },
      null,
      REGRAS,
    );
    expect(r.confianca).toBe("vedado");
    expect(r.statusSugerido).toBe("rejeitada");
    expect(r.memorialTributos).toHaveLength(0);
  });

  it("Simples Nacional: sem crédito nem dedutibilidade", () => {
    const r = processarDespesa(
      { ...empresa, regimeTributario: "simples_nacional" },
      {
        categoria: "combustivel",
        valorNota: 1000,
        dataFatoGerador: "2026-01-15",
        litros: 100,
        kmComercial: 850,
        kmNaoComercial: 0,
      },
      veiculo,
      REGRAS,
    );
    expect(r.memorialTributos.find((m) => m.tributo === "pis_cofins")).toBeUndefined();
    expect(r.memorialTributos.find((m) => m.tributo === "irpj_csll")).toBeUndefined();
    expect(r.memorialTributos.find((m) => m.tributo === "icms")).toBeDefined();
  });

  it("§7.4: segregação de uso misto altera a base fiscal", () => {
    const r = processarDespesa(
      empresa,
      {
        categoria: "alimentacao",
        valorNota: 200,
        dataFatoGerador: "2026-01-15",
        litros: null,
        kmComercial: 60,
        kmNaoComercial: 40,
      },
      null,
      REGRAS,
    );
    expect(r.percentualComercial).toBeCloseTo(60, 1);
    expect(r.valorFiscal).toBeCloseTo(120, 2); // 200 × 60%
  });
});
