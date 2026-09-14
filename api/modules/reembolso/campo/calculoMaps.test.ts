import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstadoCampo, Jornada } from "./dominio";
import { pocConfiguracao } from "../../../../db/pocSchema";
const mocks = vi.hoisted(() => ({ estado: null as EstadoCampo | null, config: {} as Record<string, unknown>, serial: Promise.resolve(), commits: [] as string[] }));
vi.mock("../../../queries/connection", () => ({ getDb: vi.fn() }));
vi.mock("./servico", () => ({ alterarCampo: async (_identity: unknown, _user: unknown, action: string, fn: (state: EstadoCampo, tx: unknown) => unknown) => {
  const task = mocks.serial.then(async () => {
    const state = structuredClone(mocks.estado!);
    const tx = { select: () => ({ from: (table: unknown) => ({ where: async () => table === pocConfiguracao ? [{ configuracao: mocks.config }] : [{ id: 1, status: "ativa", versao: 1 }] }) }) };
    const result = await fn(state, tx); mocks.estado = state; mocks.commits.push(action); return result;
  });
  mocks.serial = task.then(() => undefined, () => undefined); return task;
} }));
import { calcularJornadaPersistida, podeConsultarMaps } from "./calculoMaps";
const agora = new Date("2026-09-14T12:00:00Z");
const id = { empresaId: 1, colaboradorId: 3 };
const jornada = (): Jornada => ({ id: "j1", veiculo: "ABC1D23", consumoKmLitro: 10, pontos: [
  { id: "in", tipo: "check_in", latitude: -8, longitude: -34, ocorridoEm: "2026-09-14T10:00:00Z", recebidoEm: "2026-09-14T10:00:00Z" },
  { id: "out", tipo: "check_out", latitude: -8.1, longitude: -34.1, ocorridoEm: "2026-09-14T11:00:00Z", recebidoEm: "2026-09-14T11:00:00Z" },
], calculo: { estado: "aguardando_calculo", metros: null, calculadoEm: null } });
beforeEach(() => {
  mocks.estado = { jornadas: [jornada()], documentos: [], conciliacoes: [], auditoria: [] };
  mocks.config = { politicaId: 1, politicaVersao: 1, calculoMapsAutomatico: true, intervaloConsultaMapsMinutos: 15 };
  mocks.serial = Promise.resolve(); mocks.commits = [];
});
describe("consulta Maps persistida por jornada", () => {
  it("grava reserva antes da rede, preserva IDs e reutiliza distância calculada", async () => {
    const estimar = vi.fn(async () => {
      expect(mocks.estado!.jornadas[0].calculo.consultaId).toBeTruthy();
      expect(mocks.commits).toContain("jornada.reservar_consulta_maps");
      return { estado: "estimado" as const, metros: 12345, calculadoEm: agora.toISOString() };
    });
    const deps = { estimar, habilitado: true, apiKey: "synthetic", agora: () => agora };
    const result = await calcularJornadaPersistida(id, "j1", 7, false, deps);
    expect(result.id).toBe("j1"); expect(result.pontos.map(p => p.id)).toEqual(["in", "out"]);
    expect(result.calculo).toMatchObject({ estado: "estimado", metros: 12345, tentativas: 1 });
    await calcularJornadaPersistida(id, "j1", 7, false, deps);
    expect(estimar).toHaveBeenCalledOnce();
  });
  it("falha mantém pontos e distância pendente, com intervalo durável inclusive para clique manual", async () => {
    const estimar = vi.fn().mockRejectedValue(new Error("provider timeout"));
    const deps = { estimar, habilitado: true, apiKey: "synthetic", agora: () => agora };
    const result = await calcularJornadaPersistida(id, "j1", null, true, deps);
    expect(result.calculo).toMatchObject({ metros: null, proximaTentativaEm: "2026-09-14T12:15:00.000Z", tentativas: 1 });
    await calcularJornadaPersistida(id, "j1", 7, false, { ...deps, agora: () => new Date("2026-09-14T12:14:59Z") });
    expect(estimar).toHaveBeenCalledOnce();
    await calcularJornadaPersistida(id, "j1", null, true, { ...deps, agora: () => new Date("2026-09-14T12:15:00Z") });
    expect(estimar).toHaveBeenCalledTimes(2);
    expect(mocks.estado!.jornadas[0].pontos).toHaveLength(2);
  });
  it("concorrência entre execução manual e automática reserva só uma consulta", async () => {
    let concluir!: (value: Jornada["calculo"]) => void;
    const estimar = vi.fn(() => new Promise<Jornada["calculo"]>(resolve => { concluir = resolve; }));
    const deps = { estimar, habilitado: true, apiKey: "synthetic", agora: () => agora };
    const first = calcularJornadaPersistida(id, "j1", 7, false, deps);
    await vi.waitFor(() => expect(estimar).toHaveBeenCalledOnce());
    await calcularJornadaPersistida(id, "j1", null, true, deps);
    expect(estimar).toHaveBeenCalledOnce();
    concluir({ estado: "estimado", metros: 123, calculadoEm: agora.toISOString() }); await first;
  });
  it("configuração legada não ativa consulta automática", async () => {
    delete mocks.config.calculoMapsAutomatico;
    const estimar = vi.fn();
    await calcularJornadaPersistida(id, "j1", null, true, { estimar, habilitado: true, apiKey: "synthetic", agora: () => agora });
    expect(estimar).not.toHaveBeenCalled(); expect(mocks.estado!.jornadas[0].calculo.consultaId).toBeUndefined();
  });
  it("jornada aberta e timestamp de retry inválido não disparam cobrança", () => {
    const open = jornada(); open.pontos.pop(); expect(podeConsultarMaps(open, agora)).toBe(false);
    const invalid = jornada(); invalid.calculo.proximaTentativaEm = "invalid"; expect(podeConsultarMaps(invalid, agora)).toBe(false);
  });
});
