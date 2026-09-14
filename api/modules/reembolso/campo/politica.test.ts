import { describe, expect, it } from "vitest";
import { configuracaoCampoSchema, memorialReembolso, tarifaDaUf } from "./politica";

const base = {
  modo: "sombra" as const, politicaId: 1, politicaVersao: 3,
  tarifaCentavosPorKm: 50, periodoDias: 30, prazoNotaDias: 5,
  intervaloLembreteDias: 2, limiteLembretes: 3, regraPercurso: "Somente percurso comercial documentado.",
  retencaoLocalizacaoDias: 30,
};

describe("tarifa por UF e memorial da empresa", () => {
  it("mesma distância usa a tarifa da UF e arredonda antes de fornecer o valor", () => {
    const config = configuracaoCampoSchema.parse({ ...base, tarifasCentavosPorKmPorUf: { SP: 75, RJ: 90 } });
    expect(memorialReembolso(12345, config, "SP")).toEqual({ uf: "SP", metrosComerciais: 12345, tarifaCentavosPorKm: 75, valorCentavos: 926, politicaId: 1, politicaVersao: 3 });
    expect(memorialReembolso(12345, config, "RJ").valorCentavos).toBe(1111);
  });
  it("não usa tarifa global quando UF não foi configurada", () => {
    expect(() => tarifaDaUf(base, "SP")).toThrow(/não configurada/);
    expect(() => tarifaDaUf(base, "XX")).toThrow();
  });
  it("rejeita tarifa fracionária/negativa e UF inexistente", () => {
    for (const tarifas of [{ SP: 0 }, { SP: -1 }, { SP: 0.75 }, { XX: 75 }]) {
      expect(configuracaoCampoSchema.safeParse({ ...base, tarifasCentavosPorKmPorUf: tarifas }).success).toBe(false);
    }
  });
  it("aceita flags e remoção explícita de designação sem inventar valores no legado", () => {
    expect(configuracaoCampoSchema.parse(base).aprovadorId).toBeUndefined();
    expect(configuracaoCampoSchema.parse({ ...base, temValeRefeicao: true, temContratoCorporativoApp: false, analistaId: 7, aprovadorId: null })).toMatchObject({ temValeRefeicao: true, temContratoCorporativoApp: false, analistaId: 7, aprovadorId: null });
  });
});
