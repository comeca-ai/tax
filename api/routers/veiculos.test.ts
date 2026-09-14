import { describe, expect, it } from "vitest";
import { veiculoUnificadoInput } from "./veiculos";

const exemplo = {
  empresaId: 1,
  colaboradorId: 2,
  placa: "abc-1234",
  renavam: "12345678901",
  motorizacao: "combustao",
  ufLicenciamento: "SP",
  kmPorLitroDeclarado: 10,
};
describe("cadastro unificado de veículo", () => {
  it("normaliza placas antigas e Mercosul", () => {
    expect(veiculoUnificadoInput.parse(exemplo).placa).toBe("ABC1234");
    expect(
      veiculoUnificadoInput.parse({ ...exemplo, placa: "abc1d23" }).placa
    ).toBe("ABC1D23");
  });
  it.each([
    { placa: "invalida" },
    { ufLicenciamento: "XX" },
    { renavam: "texto" },
    { colaboradorId: 0 },
    { kmPorLitroDeclarado: 0 },
    { kmPorLitroDeclarado: Infinity },
  ])("rejeita dados inválidos: %j", alteracao => {
    expect(
      veiculoUnificadoInput.safeParse({ ...exemplo, ...alteracao }).success
    ).toBe(false);
  });
});

it.each(["combustao", "hibrido", "eletrico"])(
  "aceita motorização %s",
  motorizacao => {
    expect(
      veiculoUnificadoInput.parse({
        ...exemplo,
        motorizacao,
        kmPorLitroDeclarado: 18.5,
      }).motorizacao
    ).toBe(motorizacao);
  }
);
