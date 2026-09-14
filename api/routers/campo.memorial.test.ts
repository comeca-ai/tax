import { beforeEach, describe, expect, it, vi } from "vitest";
import { colaboradores, politicasReembolso } from "../../db/schema";
import { pocConfiguracao } from "../../db/pocSchema";
import { novoEstadoCampo } from "../modules/reembolso/campo/dominio";
const mocks = vi.hoisted(() => ({ db: vi.fn(), alterar: vi.fn() }));
vi.mock("./_shared", () => ({ assertAdminDaEmpresa: vi.fn().mockResolvedValue({ id: 42, cnpj: "12345678000100" }), registrarLog: vi.fn(), ehAdminDeAlgumaEmpresa: vi.fn() }));
vi.mock("../queries/connection", () => ({ getDb: mocks.db }));
vi.mock("../modules/reembolso/campo/servico", async importOriginal => ({ ...await importOriginal<typeof import("../modules/reembolso/campo/servico")>(), alterarCampo: mocks.alterar }));
import { campoRouter } from "./campo";
const caller = () => campoRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), usuario: { id: 7, email: "teste@example.test", nome: "Teste", perfil: "cliente" } });
const input = { colaboradorId: 9, inicio: "2026-09-13T00:00:00Z", fim: "2026-09-14T00:00:00Z", veiculo: "ABC1D23" };
let estado = novoEstadoCampo();
beforeEach(() => {
  estado = novoEstadoCampo();
  estado.jornadas.push({ id: "j", veiculo: "ABC1D23", consumoKmLitro: 10, pontos: [
    { id: "a", tipo: "check_in", latitude: 0, longitude: 0, ocorridoEm: "2026-09-13T10:00:00Z", recebidoEm: "2026-09-13T10:00:00Z" },
    { id: "b", tipo: "check_out", latitude: 1, longitude: 1, ocorridoEm: "2026-09-13T11:00:00Z", recebidoEm: "2026-09-13T11:00:00Z" },
  ], calculo: { estado: "estimado", metros: 15000, calculadoEm: "2026-09-13T12:00:00Z" } });
  const tx = { select: () => ({ from: (table: unknown) => ({ where: () => {
    const rows = table === colaboradores ? [{ id: 9, empresaId: 42 }]
      : table === pocConfiguracao ? [{ configuracao: { politicaId: 1, politicaVersao: 2, tarifasCentavosPorKmPorUf: { SP: 75 } } }]
        : table === politicasReembolso ? [{ id: 1, status: "ativa", versao: 2 }] : [];
    return { limit: async () => rows, then: (resolve: (value: unknown) => void) => resolve(rows) };
  } }) }) };
  mocks.db.mockReturnValue(tx);
  mocks.alterar.mockImplementation(async (_identity, _user, _action, fn) => fn(estado, tx));
});

describe("memorial comercial na conciliação", () => {
  it("segrega metros não comerciais, usa UF e grava o memorial no agregado", async () => {
    const result = await caller().conciliar({ ...input, ufCalculo: "SP", metrosComerciais: 12345 });
    expect(result.memorialReembolso).toMatchObject({ metrosComerciais: 12345, metrosNaoComerciais: 2655, valorCentavos: 926, uf: "SP", politicaVersao: 2 });
    expect(estado.conciliacoes[0].memorialReembolso).toEqual(result.memorialReembolso);
  });
  it("não presume distância comercial quando classificação não foi informada", async () => {
    expect((await caller().conciliar(input)).memorialReembolso).toBeUndefined();
  });
  it("barra distância comercial acima da consolidada e entrada incompleta", async () => {
    await expect(caller().conciliar({ ...input, ufCalculo: "SP", metrosComerciais: 15001 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().conciliar({ ...input, ufCalculo: "SP" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(estado.conciliacoes).toHaveLength(0);
  });
  it("UF sem tarifa não cria conciliação com valor inventado", async () => {
    await expect(caller().conciliar({ ...input, ufCalculo: "RJ", metrosComerciais: 1000 })).rejects.toThrow(/não configurada/);
    expect(estado.conciliacoes).toHaveLength(0);
  });
});
