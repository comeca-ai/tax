import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { apresentacaoConvite, type ResultadoConvite, type StatusWhatsapp } from "./statusConvite"
import Colaboradores from "./Colaboradores"

const mocks = vi.hoisted(() => ({
  success: vi.fn(), info: vi.fn(), error: vi.fn(), invalidate: vi.fn(), enviar: vi.fn(),
  mutationOptions: [] as Array<{
    retry?: boolean
    mutationFn: (id: number) => Promise<ResultadoConvite>
    onSuccess: (res: ResultadoConvite, id: number) => Promise<void>
    onError: (erro: Error, id: number) => void
  }>,
}))
vi.mock("sonner", () => ({ toast: { success: mocks.success, info: mocks.info, error: mocks.error } }))
vi.mock("@/hooks/useActiveCompany", () => ({ useActiveCompany: () => ({ activeCompany: { id: 1 } }) }))
vi.mock("@/providers/trpc", () => ({ trpc: { useUtils: () => ({ client: { colaboradores: {
  criar: { mutate: vi.fn() }, listar: { query: vi.fn() }, enviarConvite: { mutate: mocks.enviar },
} } }) } }))
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useQuery: () => ({ data: [], isLoading: false }),
  useMutation: (options: typeof mocks.mutationOptions[number]) => {
    mocks.mutationOptions.push(options)
    return { isPending: false, mutate: vi.fn() }
  },
}))

const resultado = (statusWhatsapp?: StatusWhatsapp, enviadoPorEmail = false): ResultadoConvite => ({
  statusWhatsapp, enviadoPorEmail, enviadoPorWhatsapp: false,
  email: "pessoa@example.test", linkAceite: "https://example.test/convite/sintetico",
  linkWhatsapp: "https://wa.me/000000?text=sintetico", messageIdWhatsapp: "mensagem-sintetica",
})

describe("apresentação do convite WhatsApp", () => {
  it.each(["pendente", "incerto", "aceito", "entregue"] as const)("%s não oferece reenvio/manual", (status) => {
    expect(apresentacaoConvite(resultado(status)).bloquearReenvio).toBe(true)
  })
  it.each(["falhou", "nao_configurado", "limite_atingido"] as const)("%s permite compartilhar sem inventar entrega", (status) => {
    const estado = apresentacaoConvite(resultado(status))
    expect(estado.bloquearReenvio).toBe(false)
    expect(estado.titulo).not.toContain("entregue")
  })
  it("booleano legado não comprova entrega e ausência de status não comprova falha", () => {
    expect(apresentacaoConvite({ enviadoPorWhatsapp: true }).status).toBe("aceito")
    expect(apresentacaoConvite({ enviadoPorWhatsapp: false }).status).toBe("incerto")
    expect(apresentacaoConvite({ enviadoPorWhatsapp: true, statusWhatsapp: "incerto" }).status).toBe("incerto")
  })
})

describe("Colaboradores com API simulada", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mutationOptions.length = 0
    renderToStaticMarkup(<Colaboradores />)
  })
  it.each(["pendente", "incerto", "aceito", "nao_configurado", "limite_atingido"] as const)("%s não gera toast de entrega/sucesso", async (status) => {
    await mocks.mutationOptions[1].onSuccess(resultado(status), 7)
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.info).toHaveBeenCalledWith(apresentacaoConvite(resultado(status)).titulo, expect.any(Object))
  })
  it("aceitação WhatsApp não é atribuída ao e-mail", async () => {
    await mocks.mutationOptions[1].onSuccess({ ...resultado("aceito"), enviadoPorWhatsapp: true }, 7)
    expect(mocks.info).toHaveBeenCalledWith("WhatsApp: envio aceito pela API", {
      description: expect.stringContaining("E-mail não enviado."),
    })
  })
  it("e-mail enviado não transforma falha WhatsApp em sucesso", async () => {
    await mocks.mutationOptions[1].onSuccess(resultado("falhou", true), 7)
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith("WhatsApp: envio falhou", {
      description: expect.stringContaining("E-mail enviado."),
    })
  })
  it("somente entrega confirmada usa sucesso de entrega", async () => {
    await mocks.mutationOptions[1].onSuccess(resultado("entregue"), 7)
    expect(mocks.success).toHaveBeenCalledWith("WhatsApp: convite entregue", expect.any(Object))
  })
  it("erro de transporte não incentiva retry nem expõe detalhes internos", () => {
    mocks.mutationOptions[1].onError(new Error("SQL credencial-sintetica"), 7)
    expect(mocks.error).toHaveBeenCalledWith("Não foi possível confirmar o convite", {
      description: expect.stringContaining("antes de repetir"),
    })
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain("credencial-sintetica")
    expect(mocks.mutationOptions[1].retry).toBe(false)
  })
  it("preserva endpoint e identificador sem chamar rede real", async () => {
    mocks.enviar.mockResolvedValueOnce(resultado("pendente"))
    await mocks.mutationOptions[1].mutationFn(7)
    expect(mocks.enviar).toHaveBeenCalledExactlyOnceWith({ id: 7 })
  })
})
