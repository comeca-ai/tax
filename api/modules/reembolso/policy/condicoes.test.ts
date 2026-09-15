import { describe, expect, it } from "vitest";
import { regrasPoliticaSchema, type RegraExtraida } from "../../../../contracts/types";
import { consolidarRegras } from "./derivar";
import { avaliarDespesa } from "./agent";

function regra(extra: Partial<RegraExtraida> = {}): RegraExtraida {
  return { id: "refeicao", descricao: "Alimentação até cem reais", tema: "alimentacao", categoria: "alimentacao", escopo: "categoria", condicao: "Somente quando o colaborador não recebe vale-refeição", reembolsavel: "sim", valorLimite: 100, moeda: "BRL", unidadeLimite: null, exigeComprovante: false, exigeDocumentoFiscal: false, decisaoAutomatica: "aprovar", ...extra };
}
function avaliar(regras: RegraExtraida[], categoria: "alimentacao" | "uber" = "alimentacao", valorNota = 50) {
  const politica = consolidarRegras(regrasPoliticaSchema.parse({ regrasExtraidas: regras }));
  return { politica, resultado: avaliarDespesa({ categoria, valorNota }, politica, { temEvidencia: true }) };
}
describe("condições textuais não são autorização executável", () => {
  it("não aprova ignorando condição de vale-refeição e cita a regra pendente", () => {
    const { politica, resultado } = avaliar([regra()]);
    expect(resultado.decisao).toBe("revisao_humana");
    expect(politica.lacunas).toContainEqual(expect.objectContaining({ tipo: "condicao-nao-avaliada", regraIds: ["refeicao"] }));
    expect(resultado.motivos.join(" ")).toContain("vale-refeição");
    expect(politica.regrasExtraidas[0].condicao).toContain("vale-refeição");
  });
  it.each([
    { reembolsavel: "vedado" as const, valorLimite: null },
    { reembolsavel: "vedado" as const, categoria: null, escopo: "item" as const, valorLimite: 10 },
  ])("não transforma negação condicional em veto incondicional", extra => {
    const { resultado } = avaliar([regra({ ...extra, decisaoAutomatica: "negar" })]);
    expect(resultado.decisao).toBe("revisao_humana");
  });
  it("mantém negação incondicional comprovada mesmo com condição pendente", () => {
    const { resultado } = avaliar([regra(), regra({ id: "vedacao", condicao: null, reembolsavel: "vedado", decisaoAutomatica: "negar", valorLimite: null })]);
    expect(resultado.decisao).toBe("negado");
  });
  it("não propaga a lacuna de alimentação para categoria independente", () => {
    const { resultado } = avaliar([regra(), regra({ id: "uber", descricao: "Transporte permitido", categoria: "uber", condicao: null })], "uber");
    expect(resultado.decisao).toBe("aprovado");
  });
  it("um teto incondicional não dispensa condição aplicável ainda não avaliada", () => {
    expect(avaliar([regra(), regra({ id: "teto", condicao: null })]).resultado.decisao).toBe("revisao_humana");
  });
});
