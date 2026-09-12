import { describe, expect, it } from "vitest";
import {
  cnaeCurto,
  mapearRespostaReceitaWs,
  somenteDigitos,
} from "./receitaws";

// ─────────────────────────────────────────────────────────────────────────────
// Testes das funções puras da integração ReceitaWS (v1.3.0) — sem rede.
// ─────────────────────────────────────────────────────────────────────────────

describe("somenteDigitos", () => {
  it("remove máscara de CNPJ", () => {
    expect(somenteDigitos("00.000.000/0001-91")).toBe("00000000000191");
  });

  it("mantém string já sem máscara", () => {
    expect(somenteDigitos("00000000000191")).toBe("00000000000191");
  });

  it("remove qualquer caractere não numérico", () => {
    expect(somenteDigitos(" 00.000.000/0001-91 \n")).toBe("00000000000191");
  });
});

describe("cnaeCurto", () => {
  it("converte CNAE completo da Receita para o formato curto", () => {
    expect(cnaeCurto("64.22-1-00")).toBe("64.22-1");
  });

  it("mantém CNAE já curto", () => {
    expect(cnaeCurto("64.22-1")).toBe("64.22-1");
    expect(cnaeCurto("49.30-2")).toBe("49.30-2");
  });

  it("mantém formatos inesperados como estão", () => {
    expect(cnaeCurto("6422100")).toBe("6422100");
    expect(cnaeCurto("64.22-1-0")).toBe("64.22-1-0");
    expect(cnaeCurto("")).toBe("");
  });
});

// Fixture realista: Banco do Brasil S.A. (CNPJ 00.000.000/0001-91)
const fixtureBancoDoBrasil = {
  abertura: "07/10/1966",
  situacao: "ATIVA",
  tipo: "MATRIZ",
  nome: "BANCO DO BRASIL SA",
  fantasia: "DIRECAO GERAL",
  porte: "DEMAIS",
  atividade_principal: [
    { code: "64.22-1-00", text: "Bancos múltiplos, com carteira comercial" },
  ],
  atividades_secundarias: [
    { code: "66.19-3-02", text: "Correspondentes de instituições financeiras" },
  ],
  uf: "DF",
  municipio: "BRASILIA",
};

describe("mapearRespostaReceitaWs", () => {
  it("mapeia todos os campos do fixture do Banco do Brasil", () => {
    const dados = mapearRespostaReceitaWs(fixtureBancoDoBrasil, "00000000000191");
    expect(dados).toEqual({
      cnpj: "00.000.000/0001-91",
      razaoSocial: "BANCO DO BRASIL SA",
      nomeFantasia: "DIRECAO GERAL",
      situacao: "ATIVA",
      cnaePrincipal: {
        codigo: "64.22-1",
        descricao: "Bancos múltiplos, com carteira comercial",
      },
      cnaesSecundarios: [
        {
          codigo: "66.19-3",
          descricao: "Correspondentes de instituições financeiras",
        },
      ],
      uf: "DF",
      municipio: "BRASILIA",
    });
  });

  it("aplica trim na razão social e no município", () => {
    const dados = mapearRespostaReceitaWs(
      { ...fixtureBancoDoBrasil, nome: "  BANCO DO BRASIL SA  ", municipio: " BRASILIA " },
      "00000000000191",
    );
    expect(dados.razaoSocial).toBe("BANCO DO BRASIL SA");
    expect(dados.municipio).toBe("BRASILIA");
  });

  it("remove secundário duplicado do principal e duplicatas entre secundários", () => {
    const dados = mapearRespostaReceitaWs(
      {
        ...fixtureBancoDoBrasil,
        atividades_secundarias: [
          // mesmo CNAE do principal (completo → curto bate com o principal)
          { code: "64.22-1-00", text: "Bancos múltiplos, com carteira comercial" },
          { code: "66.19-3-02", text: "Correspondentes de instituições financeiras" },
          // duplicata do secundário acima
          { code: "66.19-3-02", text: "Correspondentes de instituições financeiras" },
        ],
      },
      "00000000000191",
    );
    expect(dados.cnaesSecundarios).toEqual([
      { codigo: "66.19-3", descricao: "Correspondentes de instituições financeiras" },
    ]);
  });

  it("fantasia vazia vira null", () => {
    const dados = mapearRespostaReceitaWs(
      { ...fixtureBancoDoBrasil, fantasia: "   " },
      "00000000000191",
    );
    expect(dados.nomeFantasia).toBeNull();
  });

  it("tolera ausência de atividades", () => {
    const dados = mapearRespostaReceitaWs(
      { ...fixtureBancoDoBrasil, atividade_principal: [], atividades_secundarias: undefined },
      "00000000000191",
    );
    expect(dados.cnaePrincipal).toBeNull();
    expect(dados.cnaesSecundarios).toEqual([]);
  });

  it("lança erro quando o shape mínimo não é atendido", () => {
    expect(() => mapearRespostaReceitaWs(null, "00000000000191")).toThrow();
    expect(() => mapearRespostaReceitaWs({ status: "OK" }, "00000000000191")).toThrow();
  });
});
