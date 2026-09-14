import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ db: {} as unknown }));
vi.mock("../../../queries/connection", () => ({ getDb: () => mock.db }));
import { colaboradores, veiculos, politicasReembolso } from "../../../../db/schema";
import { pocCampo, pocConfiguracao } from "../../../../db/pocSchema";
import { interpretarMensagemCampo, registrarEventoCampo } from "./servico";
import type { EstadoCampo } from "./dominio";

const identidade = { empresaId: 1, colaboradorId: 2 };
let estado: EstadoCampo | undefined;
let ativo = true;
let exigeFinanceiro = true;
const locks: unknown[] = [];
beforeEach(() => {
  estado = undefined; ativo = true; exigeFinanceiro = true; locks.length = 0;
  const tx = {
    select: () => ({ from: (table: unknown) => {
      if (!exigeFinanceiro && [veiculos, pocConfiguracao, politicasReembolso].includes(table as typeof veiculos)) throw new Error("Presença consultou dependência financeira");
      const rows = () => table === colaboradores ? [{ id: 2, empresaId: 1, statusVinculo: ativo ? "ativo" : "suspenso" }]
        : table === pocCampo ? estado ? [{ estado: structuredClone(estado) }] : []
          : table === veiculos ? [{ placa: "ABC1D23", kmPorLitroDeclarado: 10 }]
            : table === pocConfiguracao ? [{ configuracao: { retencaoLocalizacaoDias: 30, politicaId: 3, politicaVersao: 1 } }]
              : table === politicasReembolso ? [{ status: "ativa", versao: 1 }] : [];
      return { where: () => ({ for: async () => { locks.push(table); return rows(); }, limit: async () => rows(), then: (resolve: (r: unknown[]) => void) => resolve(rows()) }) };
    } }),
    insert: () => ({ values: async (value: { estado: EstadoCampo }) => { estado = structuredClone(value.estado); } }),
    update: () => ({ set: (value: { estado: EstadoCampo }) => ({ where: async () => { estado = structuredClone(value.estado); } }) }),
  };
  mock.db = { transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(tx) };
});

describe("serviço campo com persistência transacional simulada", () => {
  it("combina comando e localização, persiste fechamento e resposta idempotente", async () => {
    exigeFinanceiro = false;
    const ts = Math.floor(Date.now() / 1000);
    const comando = await interpretarMensagemCampo(identidade, { id: "c1", type: "text", text: "check-in", timestamp: ts });
    expect(comando?.textoResposta).toContain("localização");
    const local = { id: "l1", type: "location", location: { latitude: -22, longitude: -43 }, timestamp: ts };
    const resposta = await interpretarMensagemCampo(identidade, local);
    expect(estado?.presencas?.[0].pontos).toHaveLength(1);
    expect(await interpretarMensagemCampo(identidade, local)).toEqual(resposta);
    expect(estado?.presencas?.[0].pontos).toHaveLength(1);
    await interpretarMensagemCampo(identidade, { id: "c2", type: "text", text: "check-out", timestamp: ts });
    await interpretarMensagemCampo(identidade, { ...local, id: "l2" });
    expect(estado?.presencas?.[0].pontos.at(-1)?.tipo).toBe("check_out");
    expect(estado?.jornadas).toHaveLength(0);
    expect(estado?.presencas?.[0].pontos[0]).toMatchObject({ comandoId: "c1", comandoEm: new Date(ts * 1000).toISOString() });
    expect(locks[0]).toBe(colaboradores);
    expect(locks[1]).toBe(pocCampo);
  });
  it("aceita placa opcional inexistente e aliases sem exigir cadastro", async () => {
    exigeFinanceiro = false;
    const timestamp = Math.floor(Date.now() / 1000);
    expect((await interpretarMensagemCampo(identidade, { id: "c1", type: "text", text: "checkin XXX1X23", timestamp }))?.textoResposta).toContain("localização");
    await interpretarMensagemCampo(identidade, { id: "gps", type: "location", location: { latitude: 0, longitude: 0 }, timestamp });
    expect((await interpretarMensagemCampo(identidade, { id: "c2", type: "text", text: "checkout", timestamp }))?.textoResposta).toContain("localização");
  });
  it("rejeita checkout sem entrada, GPS antigo e ID adulterado; local expirado inicia automaticamente", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const mensagem = { id: "c1", type: "text", text: "check-in", timestamp };
    expect((await interpretarMensagemCampo(identidade, { ...mensagem, id: "saida", text: "check-out" }))?.textoResposta).toContain("antes");
    await interpretarMensagemCampo(identidade, mensagem);
    await expect(interpretarMensagemCampo(identidade, { ...mensagem, text: "check-out" })).rejects.toThrow(/outro conteúdo/);
    await expect(interpretarMensagemCampo(identidade, { id: "gps", type: "location", location: { latitude: 0, longitude: 0 }, timestamp: timestamp - 1 })).rejects.toThrow(/anterior ao comando/);
    estado!.conversa!.pendente!.expiraEm = new Date(Date.now() - 1000).toISOString();
    expect((await interpretarMensagemCampo(identidade, { id: "gps", type: "location", location: { latitude: 0, longitude: 0 }, timestamp }))?.textoResposta).toContain("Check-in registrado");
    expect(estado?.presencas ?? []).toHaveLength(1);
  });
  it("infere check-in e check-out de localizações consecutivas", async () => {
    const r = await interpretarMensagemCampo(identidade, { id: "m", type: "location", location: { latitude: 0, longitude: 0 }, timestamp: Date.now() / 1000 });
    expect(r?.textoResposta).toContain("Check-in registrado");
    const saida = await interpretarMensagemCampo(identidade, { id: "m2", type: "location", location: { latitude: 0.1, longitude: 0.1 }, timestamp: Date.now() / 1000 });
    expect(saida?.textoResposta).toContain("Check-out registrado");
    expect(estado?.presencas?.[0].pontos.map(p => p.tipo)).toEqual(["check_in", "check_out"]);
  });
  it("suspensão impede captura antes de ler o agregado", async () => {
    ativo = false;
    await expect(registrarEventoCampo(identidade, { jornadaId: "f04927dc-a21f-4992-ab2d-66a71dbacfa1", veiculo: "ABC1D23", ponto: { id: "m", tipo: "check_in", latitude: 0, longitude: 0, ocorridoEm: new Date().toISOString() } })).rejects.toThrow(/Vínculo/);
    expect(estado).toBeUndefined();
    expect(locks).toEqual([colaboradores]);
  });
});
