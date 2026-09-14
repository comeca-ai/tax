import { describe, expect, it } from "vitest";
import { validarEquipeCsv, lerEquipeCsv } from "./equipeLote";
const h = "nome;email;telefone;matricula;vinculo;superiorMatricula;equipe\n";
const a = "Pessoa Um;um@example.invalid;+5511999999901;A;CLT;;interna";
const b = "Pessoa Dois;dois@example.invalid;+5511999999902;B;PJ;A;externa";
describe("pré-validação da equipe", () => {
  it("normaliza e resolve superior do lote sem depender da ordem", () => {
    const r = validarEquipeCsv(h + b + "\n" + a, []);
    expect(r.erros).toEqual([]);
    expect(r.total).toBe(2);
  });
  it("informa telefone inválido por linha", () => {
    const r = validarEquipeCsv(h + a.replace("+5511999999901", "119"), []);
    expect(r.erros).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ linha: 2, campo: "telefone" }),
      ])
    );
  });
  it("aponta ambas as matrículas duplicadas", () => {
    const r = validarEquipeCsv(h + a + "\n" + b.replace(";B;", ";A;"), []);
    expect(
      r.erros
        .filter(e => e.campo === "matricula")
        .map(e => e.linha)
        .sort()
    ).toEqual([2, 3]);
  });
  it("rejeita matrícula existente inclusive normalização de caixa", () => {
    expect(
      validarEquipeCsv(h + a, [
        { id: 1, matricula: "a", telefone: null, statusVinculo: "ativo" },
      ]).erros.some(e => e.campo === "matricula")
    ).toBe(true);
  });
  it("nega superior desconhecido ou desligado", () => {
    const r = validarEquipeCsv(h + b, [
      { id: 1, matricula: "A", telefone: null, statusVinculo: "desligado" },
    ]);
    expect(r.erros.some(e => e.campo === "superiorMatricula")).toBe(true);
  });
  it("nega ciclo e autossupervisão", () => {
    const r = validarEquipeCsv(
      h + a.replace(";CLT;;", ";CLT;B;") + "\n" + b,
      []
    );
    expect(r.erros.filter(e => e.campo === "superiorMatricula")).toHaveLength(
      2
    );
  });
  it("lê BOM, campos com separador e aspas escapadas", () => {
    const r = validarEquipeCsv(
      "\uFEFF" + h + a.replace("Pessoa Um", '"Pessoa; ""Um"""'),
      []
    );
    expect(r.erros).toEqual([]);
    expect(r.linhas[0].pessoa.nome).toBe('Pessoa; "Um"');
  });
  it("rejeita cabeçalho divergente, aspas incompletas e lote excessivo", () => {
    expect(() => lerEquipeCsv("nome\nx")).toThrow();
    expect(() => lerEquipeCsv(h + '"incompleta')).toThrow();
    expect(() => lerEquipeCsv(h + Array(101).fill(a).join("\n"))).toThrow();
  });
});
