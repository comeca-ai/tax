import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, expect, it, vi } from "vitest"
import PoliticaSimulador from "./PoliticaSimulador"

const state = vi.hoisted(() => ({ isError: false, isSuccess: false, isPending: false, error: { message: "Serviço indisponível" }, data: { resultado: null, versao: null }, mutate: vi.fn(), reset: vi.fn() }))
vi.mock("@/providers/trpc", () => ({ trpc: { politica: { testar: { useMutation: () => state } } } }))
beforeEach(() => { state.isError = false; state.isSuccess = false; state.isPending = false })
const render = () => renderToStaticMarkup(<PoliticaSimulador empresaId={8} politicaId={33} />)

it("não mostra veredito antes da resposta do servidor", () => {
  expect(render()).not.toContain("Política aprovada")
  expect(render()).toContain("Simular caso")
  expect(state.mutate).not.toHaveBeenCalled()
})
it("mostra falha explícita sem aprovação fictícia", () => {
  state.isError = true
  expect(render()).toContain('role="alert"')
  expect(render()).toContain("Não foi possível simular")
  expect(render()).not.toContain("Política aprovada")
})
it("sem política aplicável não transforma resposta em sucesso de negócio", () => {
  state.isSuccess = true
  expect(render()).toContain("Nenhum veredito foi produzido")
})
it("enquanto envia mantém controles desabilitados e estado pendente", () => {
  state.isPending = true
  expect(render()).toContain("Simulando…")
  expect(render()).toContain('disabled=""')
})
