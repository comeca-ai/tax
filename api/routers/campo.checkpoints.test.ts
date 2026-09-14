import { beforeEach, describe, expect, it, vi } from "vitest";
import { novoEstadoCampo } from "../modules/reembolso/campo/dominio";

const mocks = vi.hoisted(() => ({ db: vi.fn(), acesso: vi.fn() }));
vi.mock("./_shared", () => ({
  assertEmpresaAcesso: mocks.acesso,
  assertAdminDaEmpresa: vi.fn(),
  registrarLog: vi.fn(),
  ehAdminDeAlgumaEmpresa: vi.fn(),
}));
vi.mock("../queries/connection", () => ({ getDb: mocks.db }));
vi.mock("../modules/reembolso/campo/servico", async importOriginal => ({
  ...await importOriginal<typeof import("../modules/reembolso/campo/servico")>(),
}));
import { campoRouter } from "./campo";

const caller = () => campoRouter.createCaller({
  req: new Request("http://localhost"),
  resHeaders: new Headers(),
  usuario: { id: 7, email: "teste@example.test", nome: "Teste", perfil: "cliente" },
});

describe("checkpoints por empresa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.acesso.mockResolvedValue({ id: 42 });
  });

  it("agrega usuários ativos da empresa, inclusive quem ainda não pontuou", async () => {
    const estado = novoEstadoCampo();
    estado.jornadas.push({ id: "j1", veiculo: "ABC1D23", consumoKmLitro: 10, pontos: [
      { id: "p1", tipo: "check_in", latitude: 0, longitude: 0, ocorridoEm: "2026-09-13T10:00:00Z", recebidoEm: "2026-09-13T10:00:00Z" },
      { id: "p2", tipo: "checkpoint", latitude: 0, longitude: 0, ocorridoEm: "2026-09-13T10:30:00Z", recebidoEm: "2026-09-13T10:30:00Z" },
    ], calculo: { estado: "aguardando_calculo", metros: null, calculadoEm: null } });
    const rows = [
      { colaboradorId: 9, usuarioId: 7, nome: "Ana", cargo: "Motorista", estado },
      { colaboradorId: 10, usuarioId: 8, nome: "Bruno", cargo: null, estado: null },
    ];
    const query = { from: () => query, leftJoin: () => query, where: () => query, orderBy: () => Promise.resolve(rows) };
    mocks.db.mockReturnValue({ select: () => query });

    const result = await caller().checkpoints({ empresaId: 42 });

    expect(mocks.acesso).toHaveBeenCalledWith(expect.anything(), 42);
    expect(result).toMatchObject({ totalCheckpoints: 1, usuarios: [
      { colaboradorId: 9, nome: "Ana", checkpoints: 1, jornadas: 1 },
      { colaboradorId: 10, nome: "Bruno", checkpoints: 0, jornadas: 0, ultimoCheckpointEm: null },
    ] });
  });

  it("não consulta dados quando a empresa não está autorizada", async () => {
    mocks.acesso.mockRejectedValue(new Error("forbidden"));
    await expect(caller().checkpoints({ empresaId: 99 })).rejects.toThrow("forbidden");
    expect(mocks.db).not.toHaveBeenCalled();
  });
});
