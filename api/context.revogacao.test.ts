import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarTokenSessao } from "./auth/session";
const mocks = vi.hoisted(() => ({ db: vi.fn(), revogada: vi.fn() }));
vi.mock("./queries/connection", () => ({ getDb: mocks.db }));
vi.mock("./auth/revogacao", () => ({ sessaoRevogada: mocks.revogada }));
import { createContext } from "./context";
const token = criarTokenSessao(7, "synthetic-old-hash");
let senhaHash = "synthetic-old-hash";
beforeEach(() => {
  vi.resetAllMocks();
  senhaHash = "synthetic-old-hash";
  mocks.revogada.mockResolvedValue(false);
  mocks.db.mockReturnValue({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              id: 7,
              nome: "Teste",
              email: "test@example.test",
              perfil: "cliente",
              senhaHash,
            },
          ],
        }),
      }),
    }),
  });
});
async function context() {
  return createContext({
    req: new Request("http://localhost", {
      headers: { cookie: `tax_session=${token}` },
    }),
    resHeaders: new Headers(),
    info: {},
  } as Parameters<typeof createContext>[0]);
}
describe("contexto rejeita sessão revogada", () => {
  it("senha alterada encerra autenticação e nunca retorna hash ao cliente", async () => {
    expect((await context()).usuario).toEqual({
      id: 7,
      nome: "Teste",
      email: "test@example.test",
      perfil: "cliente",
    });
    senhaHash = "synthetic-new-hash";
    expect((await context()).usuario).toBeNull();
  });
  it("logout impede reuso do cookie capturado antes mesmo da leitura do usuário", async () => {
    mocks.revogada.mockResolvedValue(true);
    expect((await context()).usuario).toBeNull();
    expect(mocks.db).not.toHaveBeenCalled();
  });
});
