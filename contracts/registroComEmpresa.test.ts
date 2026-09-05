import { describe, expect, it } from "vitest";
import { registroComEmpresaInput } from "./types";

// O contrato do wizard é plano de propósito: os caminhos dos issues do zod
// precisam casar com os rótulos que a tela usa em descreverErroEmpresa
// (src/pages/cadastroErro.ts). Se alguém aninhar a empresa num sub-objeto,
// a mensagem de erro da tela deixa de citar o campo.

const payloadValido = {
  nome: "Maria Silva",
  email: "maria@empresa.com.br",
  senha: "senha-super-secreta",
  razaoSocial: "Empresa da Maria LTDA",
  cnpj: "12.345.678/0001-90",
  cnaePrincipal: "62.01-5",
  cnaesSecundarios: ["63.11-9"],
  regimeTributario: "simples_nacional",
  uf: "PB",
  aceiteLgpd: true,
  declaracaoPoderes: true,
} as const;

describe("registroComEmpresaInput", () => {
  it("aceita o payload plano do wizard e aplica o default de CNAEs", () => {
    const { cnaesSecundarios: _omit, ...semSecundarios } = payloadValido;
    const parsed = registroComEmpresaInput.parse(semSecundarios);
    expect(parsed.cnaesSecundarios).toEqual([]);
    expect(parsed.email).toBe("maria@empresa.com.br");
  });

  it("rejeita CNAE longo com caminho plano (caso real: lista crua da Receita)", () => {
    const cru = registroComEmpresaInput.safeParse({
      ...payloadValido,
      cnaePrincipal: "62.01-5/00-extra", // 15 chars, estoura o max(10)
    });
    expect(cru.success).toBe(false);
    if (!cru.success) {
      expect(cru.error.issues[0].path).toEqual(["cnaePrincipal"]);
    }
  });

  it("exige os campos de conta junto com os de empresa", () => {
    const semSenha = registroComEmpresaInput.safeParse({
      razaoSocial: payloadValido.razaoSocial,
      cnpj: payloadValido.cnpj,
      cnaePrincipal: payloadValido.cnaePrincipal,
      regimeTributario: payloadValido.regimeTributario,
      uf: payloadValido.uf,
    });
    expect(semSenha.success).toBe(false);
  });
});
