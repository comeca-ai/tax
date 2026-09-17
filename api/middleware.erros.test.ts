import { afterEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createRouter, logarErroInterno, protectedProcedure, publicQuery } from "./middleware";

describe("tRPC não expõe detalhes internos pela rede", () => {
  const router = createRouter({
    falha: publicQuery.query(() => { throw new Error("SENTINELA_PRIVADA SELECT senha FROM usuarios"); }),
    falhaComCausa: publicQuery.query(() => {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível armazenar o documento.",
        cause: new Error("EACCES: permission denied, mkdir '/srv/x'") });
    }),
    protegido: protectedProcedure.query(() => ({ ok: true })),
  });
  async function requisitar(procedure: string) {
    return fetchRequestHandler({ endpoint: "/api/trpc", router, onError: logarErroInterno,
      req: new Request(`http://localhost/api/trpc/${procedure}`),
      createContext: () => ({ req: new Request("http://localhost"), resHeaders: new Headers(), usuario: null }),
    });
  }
  afterEach(() => vi.restoreAllMocks());
  it("registra a causa no servidor sem mudar a resposta ao navegador", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await requisitar("falhaComCausa");
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain("Falha interna");
    expect(text).not.toContain("EACCES");
    const logado = erro.mock.calls.map(args => args.join(" ")).join("\n");
    expect(logado).toContain("falhaComCausa");
    expect(logado).toContain("Não foi possível armazenar o documento.");
    expect(logado).toContain("EACCES: permission denied");
  });
  it("não loga códigos que já explicam o erro na resposta", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    await requisitar("protegido");
    expect(erro).not.toHaveBeenCalled();
  });
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
