import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  limite: vi.fn(),
  mail: vi.fn(),
  revoke: vi.fn(),
  log: vi.fn(),
}));
vi.mock("../queries/connection", () => ({ getDb: mocks.db }));
vi.mock("../auth/rateLimit", () => ({ exigirLimiteAuth: mocks.limite }));
vi.mock("../auth/revogacao", () => ({ revogarSessao: mocks.revoke }));
vi.mock("../mail/mailer", () => ({ enviarResetSenhaEmail: mocks.mail }));
vi.mock("./_shared", () => ({
  registrarLog: mocks.log,
  ehAdminDeAlgumaEmpresa: vi.fn(),
  ehDesignadoDeAlgumaEmpresa: vi.fn(),
}));
import { authRouter } from "./auth";
const email = "synthetic@example.test";
const user = { id: 7, email, nome: "Teste", perfil: "cliente" as const };
const caller = () =>
  authRouter.createCaller({
    req: new Request("http://localhost", {
      headers: { cookie: "tax_session=synthetic-token" },
    }),
    resHeaders: new Headers(),
    usuario: user,
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.mail.mockResolvedValue({ enviado: false });
});
afterEach(() => vi.restoreAllMocks());

describe("limites antes de credenciais/banco de usuários", () => {
  const base = { email, nome: "Teste", senha: "synthetic-password" };
  const calls = [
    ["login", () => caller().login({ email, senha: base.senha })],
    ["registro", () => caller().registro(base)],
    [
      "registro",
      () =>
        caller().registroComEmpresa({
          ...base,
          razaoSocial: "Empresa Teste",
          cnpj: "12345678000190",
          cnaePrincipal: "62015",
          cnaesSecundarios: [],
          regimeTributario: "simples_nacional",
          uf: "SP",
          aceiteLgpd: true,
          declaracaoPoderes: true,
        }),
    ],
    ["solicitarReset", () => caller().solicitarResetSenha({ email })],
    [
      "redefinirSenha",
      () =>
        caller().redefinirSenha({
          token: "synthetic-reset-token-123",
          novaSenha: base.senha,
        }),
    ],
    [
      "trocarSenha",
      () =>
        caller().trocarSenha({
          senhaAtual: base.senha,
          novaSenha: "synthetic-new-password",
        }),
    ],
  ] as const;
  it.each(calls)(
    "%s bloqueia antes de consultas, hash ou envio",
    async (acao, call) => {
      mocks.limite.mockRejectedValue(
        new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Muitas tentativas.",
        })
      );
      await expect(call()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
      expect(mocks.limite.mock.calls[0][0]).toBe(acao);
      expect(mocks.db).not.toHaveBeenCalled();
      expect(mocks.mail).not.toHaveBeenCalled();
    }
  );
});

describe("recuperação não divulga link em log", () => {
  it("SMTP ausente mantém resposta genérica e não registra e-mail/token", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    let resetToken = "";
    mocks.db.mockReturnValue({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [{ id: 7 }] }) }),
      }),
      insert: () => ({
        values: async (value: { token: string }) => {
          resetToken = value.token;
        },
      }),
    });
    expect(await caller().solicitarResetSenha({ email })).toEqual({ ok: true });
    expect(resetToken).not.toBe("");
    const output = JSON.stringify([warn.mock.calls, log.mock.calls]);
    expect(output).not.toContain(resetToken);
    expect(output).not.toContain(email);
    expect(output).not.toContain("/redefinir-senha/");
  });
  it("logout espera revogação persistir; falha no banco não anuncia sucesso", async () => {
    mocks.revoke.mockRejectedValue(new Error("persistência indisponível"));
    await expect(caller().logout()).rejects.toThrow(/persistência/);
    expect(mocks.revoke).toHaveBeenCalledWith("synthetic-token");
  });
});
