import { describe, expect, it } from "vitest"
import {
  ERRO_EMPRESA_GENERICO,
  camposRecusados,
  codigoTrpc,
  descreverErroEmpresa,
} from "./cadastroErro"

/**
 * Formatos reais observados na stack de teste (POST /api/trpc/empresas.create):
 * o zod devolve `message` com o JSON das issues; os demais erros vêm em PT-BR.
 */
function erroTrpc(code: string, message: string): Error {
  const erro = new Error(message) as Error & { data: { code: string } }
  erro.data = { code }
  return erro
}

const ISSUES_TETO_CNAES = JSON.stringify([
  {
    origin: "array",
    code: "too_big",
    maximum: 20,
    inclusive: true,
    path: ["cnaesSecundarios"],
    message: "Too big: expected array to have <=20 items",
  },
])

describe("codigoTrpc", () => {
  it("extrai o código do erro do tRPC", () => {
    expect(codigoTrpc(erroTrpc("BAD_REQUEST", "x"))).toBe("BAD_REQUEST")
  })

  it("devolve null para erro de rede, null e valores estranhos", () => {
    expect(codigoTrpc(new Error("Failed to fetch"))).toBeNull()
    expect(codigoTrpc(null)).toBeNull()
    expect(codigoTrpc("boom")).toBeNull()
    expect(codigoTrpc({ data: { code: 42 } })).toBeNull()
  })
})

describe("camposRecusados", () => {
  it("nomeia o campo recusado a partir das issues do zod", () => {
    expect(camposRecusados(ISSUES_TETO_CNAES)).toEqual(["CNAEs secundários"])
  })

  it("não repete o mesmo campo e preserva a ordem", () => {
    const issues = JSON.stringify([
      { path: ["uf"], message: "a" },
      { path: ["cnpj"], message: "b" },
      { path: ["uf"], message: "c" },
    ])
    expect(camposRecusados(issues)).toEqual(["UF", "CNPJ"])
  })

  it("usa o nome cru quando o campo não tem rótulo conhecido", () => {
    expect(camposRecusados(JSON.stringify([{ path: ["campoNovo"] }]))).toEqual([
      "campoNovo",
    ])
  })

  it("devolve null quando não é JSON de issues", () => {
    expect(camposRecusados("Autenticação necessária.")).toBeNull()
    expect(camposRecusados("[isso não é json")).toBeNull()
    expect(camposRecusados("[]")).toBeNull()
  })
})

describe("descreverErroEmpresa", () => {
  it("traduz o teto de 20 CNAEs em mensagem acionável", () => {
    const { codigo, mensagem, tecnico } = descreverErroEmpresa(
      erroTrpc("BAD_REQUEST", ISSUES_TETO_CNAES)
    )
    expect(codigo).toBe("BAD_REQUEST")
    expect(mensagem).toContain("CNAEs secundários")
    expect(mensagem).not.toContain("too_big")
    // O detalhe cru fica só no console.
    expect(tecnico).toContain("BAD_REQUEST")
    expect(tecnico).toContain("too_big")
  })

  it("enumera vários campos recusados", () => {
    const issues = JSON.stringify([
      { path: ["uf"] },
      { path: ["cnpj"] },
      { path: ["razaoSocial"] },
    ])
    const { mensagem } = descreverErroEmpresa(erroTrpc("BAD_REQUEST", issues))
    expect(mensagem).toContain("UF, CNPJ e razão social")
  })

  it("mostra a mensagem PT-BR do servidor quando ela é legível", () => {
    const { mensagem } = descreverErroEmpresa(
      erroTrpc("UNAUTHORIZED", "Autenticação necessária.")
    )
    expect(mensagem).toContain("Autenticação necessária.")
  })

  it("cai no genérico quando o servidor mascara o erro", () => {
    expect(
      descreverErroEmpresa(
        erroTrpc("INTERNAL_SERVER_ERROR", "Internal server error")
      ).mensagem
    ).toBe(ERRO_EMPRESA_GENERICO)
  })

  it("cai no genérico em falha de rede, sem código do tRPC", () => {
    const { codigo, mensagem, tecnico } = descreverErroEmpresa(
      new Error("Failed to fetch")
    )
    expect(codigo).toBeNull()
    expect(mensagem).toBe(ERRO_EMPRESA_GENERICO)
    expect(tecnico).toContain("Failed to fetch")
  })

  it("não lança para valores que não são Error", () => {
    expect(descreverErroEmpresa(undefined).mensagem).toBe(ERRO_EMPRESA_GENERICO)
    expect(descreverErroEmpresa("boom").mensagem).toBe(ERRO_EMPRESA_GENERICO)
  })
})
