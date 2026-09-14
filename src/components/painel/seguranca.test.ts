import { describe, expect, it } from "vitest"
import { erroArquivoPolitica, podeConfirmarDecisao, podeEditarPolitica, pertenceAEmpresa } from "./seguranca"

describe("ações do painel preservam permissões e requisitos", () => {
  it("não reapresenta detalhe de outra empresa ao conservar um ID na URL", () => {
    expect(pertenceAEmpresa({ empresaId: 2 }, 2)).toBe(true)
    expect(pertenceAEmpresa({ empresaId: 2 }, 3)).toBe(false)
    expect(pertenceAEmpresa({ empresaId: 2 }, undefined)).toBe(false)
    expect(pertenceAEmpresa(undefined, 2)).toBe(false)
  })
  it("permite dono e admin; bloqueia visitante e outro tenant", () => {
    expect(podeEditarPolitica({ id: 5, perfil: "cliente" }, { usuarioId: 5 })).toBe(true)
    expect(podeEditarPolitica({ id: 1, perfil: "admin" }, { usuarioId: 5 })).toBe(true)
    expect(podeEditarPolitica({ id: 5, perfil: "cliente" }, { usuarioId: 6 })).toBe(false)
    expect(podeEditarPolitica(null, { usuarioId: 5 })).toBe(false)
    expect(podeEditarPolitica({ id: 5, perfil: "admin" }, null)).toBe(false)
  })
  const decisao = { empresaId: 8, somenteLeitura: false, pending: false, justificativa: "Documento conferido", exigeDelegacao: false, motivoDelegacao: "" }
  it("não permite decisão sem motivo, tenant, permissão ou durante envio", () => {
    expect(podeConfirmarDecisao(decisao)).toBe(true)
    for (const alteracao of [{ justificativa: "  " }, { empresaId: undefined }, { somenteLeitura: true }, { pending: true }, { justificativa: "a".repeat(2001) }]) {
      expect(podeConfirmarDecisao({ ...decisao, ...alteracao })).toBe(false)
    }
  })
  it("decisão por delegação requer motivo próprio", () => {
    expect(podeConfirmarDecisao({ ...decisao, exigeDelegacao: true })).toBe(false)
    expect(podeConfirmarDecisao({ ...decisao, exigeDelegacao: true, motivoDelegacao: "Aprovador ausente" })).toBe(true)
  })
  it("recusa documentos vazios, acima do limite e conteúdo ativo", () => {
    expect(erroArquivoPolitica({ size: 0, type: "application/pdf" })).toBeTruthy()
    expect(erroArquivoPolitica({ size: 10 * 1024 * 1024 + 1, type: "application/pdf" })).toBeTruthy()
    expect(erroArquivoPolitica({ size: 10, type: "image/svg+xml" })).toBeTruthy()
    expect(erroArquivoPolitica({ size: 10, type: "text/html" })).toBeTruthy()
    expect(erroArquivoPolitica({ size: 10, type: "application/pdf" })).toBeNull()
  })
})
