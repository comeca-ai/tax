import { expect, it } from "vitest";
import {
  regrasPoliticaSchema,
  type OcrExtracao,
} from "../../../../contracts/types";
import { decidirComprovanteWhatsapp } from "./decisaoComprovante";
const extracao: OcrExtracao = {
  categoriaSugerida: "alimentacao",
  valor: 40,
  dataFatoGerador: "2026-09-13",
  cnpjEmitente: "12345678000199",
  confiancaExtracao: "alta",
  camposPendentes: [],
  cfop: null,
  ncm: null,
  cst: null,
  litros: null,
  provedor: "fixture",
  avisos: [],
};
const politica = {
  id: 1,
  versao: 3,
  regras: regrasPoliticaSchema.parse({
    regrasExtraidas: [
      {
        id: "refeicao",
        tema: "alimentacao",
        categoria: "alimentacao",
        escopo: "categoria",
        descricao: "Alimentação aprovada até R$ 50.",
        valorLimite: 50,
        moeda: "BRL",
        decisaoAutomatica: "aprovar",
        reembolsavel: "sim",
      },
    ],
  }),
};
it("mesma evidência preserva veredito nos três modos e só autônomo aplica", () => {
  const resultados = (["sombra", "assistido", "autonomo"] as const).map(modo =>
    decidirComprovanteWhatsapp(extracao, politica, {
      modo,
      politicaId: 1,
      politicaVersao: 3,
    })
  );
  expect(resultados[0].decisao).toEqual(resultados[1].decisao);
  expect(resultados[1].decisao).toEqual(resultados[2].decisao);
  expect(resultados[0].status).toBe("em_revisao");
  expect(resultados[1].status).toBe("em_revisao");
  expect(resultados[2].decisao.decisao).toBe("aprovado");
  expect(resultados[2].status).toBe("aprovada");
  expect(resultados[0].resposta).not.toContain("aprovado");
  expect(resultados[1].resposta).toContain("confirmação humana");
  expect(resultados[2].resposta).toContain("Política v3");
  expect(resultados[2].decisao.regrasAplicadas.length).toBeGreaterThan(0);
});
it("empresa sem configuração e promoção ligada à versão antiga caem em sombra", () => {
  expect(decidirComprovanteWhatsapp(extracao, politica, null).modo).toBe(
    "sombra"
  );
  expect(
    decidirComprovanteWhatsapp(extracao, politica, {
      modo: "autonomo",
      politicaId: 1,
      politicaVersao: 2,
    }).modo
  ).toBe("sombra");
});
it("OCR ausente e política inválida nunca aprovam", () => {
  expect(decidirComprovanteWhatsapp(undefined, politica, null).status).toBe(
    "em_revisao"
  );
  expect(
    decidirComprovanteWhatsapp(
      extracao,
      { ...politica, regras: "invalida" },
      { modo: "autonomo", politicaId: 1, politicaVersao: 3 }
    ).status
  ).toBe("em_revisao");
});
