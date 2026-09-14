import { describe, expect, it } from "vitest";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createRouter, protectedProcedure, publicQuery } from "./middleware";

describe("tRPC não expõe detalhes internos pela rede", () => {
  const router = createRouter({
    falha: publicQuery.query(() => { throw new Error("SENTINELA_PRIVADA SELECT senha FROM usuarios"); }),
    protegido: protectedProcedure.query(() => ({ ok: true })),
  });
  async function requisitar(procedure: string) {
    return fetchRequestHandler({ endpoint: "/api/trpc", router,
      req: new Request(`http://localhost/api/trpc/${procedure}`),
      createContext: () => ({ req: new Request("http://localhost"), resHeaders: new Headers(), usuario: null }),
    });
  }
  it("substitui mensagem SQL e remove stack na resposta HTTP real", async () => {
    const response = await requisitar("falha");
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain("Falha interna");
    expect(text).not.toContain("SENTINELA_PRIVADA");
    expect(text).not.toContain("SELECT senha");
    expect(text).not.toContain("middleware.erros.test");
  });
  it("preserva código e orientação de autenticação", async () => {
    const response = await requisitar("protegido");
    expect(response.status).toBe(401);
    expect(await response.text()).toContain("UNAUTHORIZED");
  });
});
