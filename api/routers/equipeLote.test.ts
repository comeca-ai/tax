import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  db: { select: vi.fn(), transaction: vi.fn() },
  invite: vi.fn(),
  dominio: vi.fn(async () => "example.invalid"),
}));
vi.mock("../lib/dominioConvite", () => ({
  dominioAdministrador: mocks.dominio,
}));
vi.mock("./_shared", () => ({ assertAdminDaEmpresa: mocks.admin }));
vi.mock("../queries/connection", () => ({ getDb: () => mocks.db }));
vi.mock("../modules/reembolso/convites/servico", () => ({
  enviarConviteColaboradorIdempotente: mocks.invite,
}));
import { equipeLoteRouter } from "./equipeLote";
const csv =
  "nome;email;telefone;matricula;vinculo;superiorMatricula;equipe\nPessoa Um;um@example.invalid;+5511999999901;A;CLT;;interna";
const ctx = {
  req: new Request("http://localhost"),
  resHeaders: new Headers(),
  usuario: {
    id: 1,
    nome: "Fixture",
    email: "fixture@example.invalid",
    perfil: "cliente" as const,
  },
};
const caller = equipeLoteRouter.createCaller(ctx);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ id: 1 });
  mocks.db.select.mockReturnValue({ from: () => ({ where: async () => [] }) });
});
it("prévia não abre transação nem envia convite", async () => {
  const r = await caller.previa({ empresaId: 1, csv });
  expect(r.erros).toEqual([]);
  expect(r.token).toBeTruthy();
  expect(mocks.db.transaction).not.toHaveBeenCalled();
  expect(mocks.invite).not.toHaveBeenCalled();
});
it("recusa empresa antes de ler pessoas", async () => {
  mocks.admin.mockRejectedValue(new Error("negado"));
  await expect(caller.previa({ empresaId: 2, csv })).rejects.toThrow();
  expect(mocks.db.select).not.toHaveBeenCalled();
});
it("prévia inválida não fornece token", async () => {
  const r = await caller.previa({
    empresaId: 1,
    csv: csv.replace("+5511999999901", "119"),
  });
  expect(r.token).toBeNull();
  expect(r.erros[0].linha).toBe(2);
});
it("confirmação exige autorização explícita", async () => {
  const r = await caller.previa({ empresaId: 1, csv });
  await expect(
    caller.confirmar({
      empresaId: 1,
      csv,
      token: r.token!,
      confirmacao: false as true,
      enviarConvites: true,
    })
  ).rejects.toThrow();
  expect(mocks.db.transaction).not.toHaveBeenCalled();
});
it("token é vinculado a arquivo, empresa e pessoa", async () => {
  const r = await caller.previa({ empresaId: 1, csv });
  const input = {
    empresaId: 1,
    csv,
    token: r.token!,
    confirmacao: true as const,
    enviarConvites: false,
  };
  await expect(caller.confirmar({ ...input, csv: csv + "\n" })).rejects.toThrow(
    "Prévia inválida"
  );
  await expect(caller.confirmar({ ...input, empresaId: 2 })).rejects.toThrow(
    "Prévia inválida"
  );
  const other = equipeLoteRouter.createCaller({
    ...ctx,
    usuario: { ...ctx.usuario, id: 2 },
  });
  await expect(other.confirmar(input)).rejects.toThrow("Prévia inválida");
  expect(mocks.db.transaction).not.toHaveBeenCalled();
});
it("repetição recupera lote existente sem enviar convite por padrão", async () => {
  const r = await caller.previa({ empresaId: 1, csv });
  const query = {
    from: () => ({
      where: () => ({ for: async () => [{ id: 4, pessoas: [11, 12] }] }),
    }),
  };
  mocks.db.transaction.mockImplementation(async fn =>
    fn({ select: () => query })
  );
  const out = await caller.confirmar({
    empresaId: 1,
    csv,
    token: r.token!,
    confirmacao: true,
    enviarConvites: false,
  });
  expect(out).toMatchObject({
    id: 4,
    pessoas: [11, 12],
    idempotente: true,
    convites: [],
  });
  expect(mocks.invite).not.toHaveBeenCalled();
});

it("domínio diferente na prévia bloqueia token e informa a linha", async () => {
  const r = await caller.previa({
    empresaId: 1,
    csv: csv.replace("um@example.invalid", "um@outro.invalid"),
  });
  expect(r.token).toBeNull();
  expect(r.erros).toContainEqual({
    linha: 2,
    campo: "email",
    mensagem:
      "Use um e-mail com o domínio @example.invalid, igual ao do administrador da empresa.",
  });
  expect(mocks.invite).not.toHaveBeenCalled();
});
