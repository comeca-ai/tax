import { describe, expect, it } from "vitest";
import {
  colaboradorDaEmpresa,
  dataPagamentoUtc,
  documentoRegularizavel,
  inteiroExplicito,
  mensagemErroCampo,
  periodoUtc,
} from "./formulario";

describe("formulários de campo", () => {
  it("não apresenta SQL, credenciais ou respostas internas como erro ao usuário", () => {
    const erro = Object.assign(new Error("SQL params: segredo-de-teste"), {
      data: { code: "INTERNAL_SERVER_ERROR" },
    });
    expect(mensagemErroCampo(erro)).not.toContain("segredo-de-teste");
    expect(mensagemErroCampo(erro)).toContain("não pôde ser confirmada");
    expect(mensagemErroCampo({ data: { code: "FORBIDDEN" } })).toContain(
      "não tem permissão"
    );
  });
  it("pagamento exige data real anterior ou igual ao registro", () => {
    const agora = Date.parse("2026-09-13T18:00:00Z");
    expect(dataPagamentoUtc("2026-09-13T15:00:00-03:00", agora)).toBe(
      "2026-09-13T18:00:00.000Z"
    );
    expect(dataPagamentoUtc("2026-09-14T15:00:00Z", agora)).toBeNull();
    expect(dataPagamentoUtc("", agora)).toBeNull();
  });
  it("não transforma parâmetro em branco em zero nem escolhe valores padrão", () => {
    for (const value of ["", " ", "1.5", "NaN", "-1", "1e2"])
      expect(inteiroExplicito(value, 0, 366)).toBeNull();
    expect(inteiroExplicito("0", 0, 10)).toBe(0);
    expect(inteiroExplicito("0", 1, 366)).toBeNull();
    expect(inteiroExplicito("367", 1, 366)).toBeNull();
    expect(inteiroExplicito("30", 1, 366)).toBe(30);
  });
  it("exige seleção explícita de pessoa presente na empresa ativa", () => {
    const lista = [
      { id: 7, empresaId: 1 },
      { id: 8, empresaId: 2 },
    ];
    expect(colaboradorDaEmpresa(lista, 1, null)).toBeNull();
    expect(colaboradorDaEmpresa(lista, 1, 8)).toBeNull();
    expect(colaboradorDaEmpresa(lista, 1, 7)).toEqual(lista[0]);
  });
  it("recusa período vazio, inválido, invertido e com fim igual ao início", () => {
    expect(periodoUtc("", "2026-09-14T00:00:00Z")).toBeNull();
    expect(periodoUtc("inválido", "2026-09-14T00:00:00Z")).toBeNull();
    expect(
      periodoUtc("2026-09-14T00:00:00Z", "2026-09-13T00:00:00Z")
    ).toBeNull();
    expect(
      periodoUtc("2026-09-14T00:00:00Z", "2026-09-14T00:00:00Z")
    ).toBeNull();
    expect(
      periodoUtc("2026-09-13T00:00:00-03:00", "2026-09-14T00:00:00-03:00")
    ).toEqual({
      inicio: "2026-09-13T03:00:00.000Z",
      fim: "2026-09-14T03:00:00.000Z",
    });
  });
  it("só permite conferência regular com evidência completa do destinatário correto", () => {
    const doc = {
      chave: "1".repeat(44),
      notaFiscalId: 4,
      cnpjDestinatario: "12345678000190",
      camposPendentes: [],
    };
    expect(documentoRegularizavel(doc, "12.345.678/0001-90")).toBe(true);
    expect(documentoRegularizavel(doc, "11111111000111")).toBe(false);
    expect(
      documentoRegularizavel(
        { ...doc, camposPendentes: ["litros"] },
        doc.cnpjDestinatario
      )
    ).toBe(false);
    expect(
      documentoRegularizavel(
        { ...doc, camposPendentes: undefined },
        doc.cnpjDestinatario
      )
    ).toBe(false);
    expect(
      documentoRegularizavel(
        { ...doc, notaFiscalId: undefined },
        doc.cnpjDestinatario
      )
    ).toBe(false);
    expect(
      documentoRegularizavel({ ...doc, chave: null }, doc.cnpjDestinatario)
    ).toBe(false);
  });
});

import { mensagemErroVeiculo } from "./formulario";
import { consumoVeiculo, orientacaoVeiculo } from "@contracts/veiculos";
it("mostra o campo rejeitado sem devolver valores ou mensagens internas", () => {
  const message = JSON.stringify([
    { path: ["placa"], message: "SQL segredo", input: "privado" },
  ]);
  expect(mensagemErroVeiculo({ data: { code: "BAD_REQUEST" }, message })).toBe(
    "Placa: use o formato ABC1234 ou ABC1D23."
  );
  expect(orientacaoVeiculo([{ path: ["__proto__"] }])).toBeNull();
  expect(
    mensagemErroVeiculo({ data: { code: "INTERNAL_SERVER_ERROR" }, message })
  ).not.toContain("segredo");
  expect(
    mensagemErroVeiculo({
      data: { code: "BAD_REQUEST" },
      message: "Colaborador ativo da empresa não encontrado.",
    })
  ).toContain("vínculo");
});
it("aceita consumo decimal com vírgula ou ponto sem interpretar texto ou notação científica", () => {
  expect(consumoVeiculo("18,5")).toBe(18.5);
  expect(consumoVeiculo("18.5")).toBe(18.5);
  for (const valor of ["", "18 km", "1e2", "18,5.2"])
    expect(consumoVeiculo(valor)).toBeNaN();
});
