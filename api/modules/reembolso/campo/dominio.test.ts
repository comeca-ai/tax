import { describe, expect, it, vi } from "vitest";
import { adicionarPonto, atualizarConciliacoes, checkpointsDoUsuario, chaveFiscalValida, conciliar, novoEstadoCampo, type Jornada } from "./dominio";
import { estimarJornada } from "./maps";
import { aplicarModo, valorEstimadoCentavos } from "./politica";
import type { DecisaoReembolso } from "../decisor";

const agora = "2026-09-13T12:00:00.000Z";
const inicio = "2026-09-13T00:00:00.000Z", fim = "2026-09-14T00:00:00.000Z";
const ponto = { id: "m1", tipo: "check_in" as const, latitude: -22, longitude: -43, ocorridoEm: "2026-09-13T09:00:00.000Z" };
const vazia = (): Jornada => ({ id: "j1", veiculo: "ABC1D23", consumoKmLitro: 10, pontos: [], calculo: { estado: "aguardando_calculo", metros: null, calculadoEm: null } });
function completa() {
  let j = adicionarPonto(vazia(), ponto, agora);
  j = adicionarPonto(j, { ...ponto, id: "m2", tipo: "checkpoint", ocorridoEm: "2026-09-13T10:00:00.000Z" }, agora);
  return adicionarPonto(j, { ...ponto, id: "m3", tipo: "check_out", ocorridoEm: "2026-09-13T11:00:00.000Z" }, agora);
}

describe("jornadas persistíveis", () => {
  it("agrega somente checkpoints e preserva o último registro", () => {
    const estado = novoEstadoCampo();
    estado.jornadas.push(completa());
    expect(checkpointsDoUsuario(estado)).toEqual({ checkpoints: 1, jornadas: 1, ultimoCheckpointEm: "2026-09-13T10:00:00.000Z" });
    expect(checkpointsDoUsuario(novoEstadoCampo())).toEqual({ checkpoints: 0, jornadas: 0, ultimoCheckpointEm: null });
  });
  it("inclui presença sem jornada e não duplica evento copiado para a jornada", () => {
    const estado = novoEstadoCampo();
    const jornada = completa();
    estado.jornadas.push(jornada);
    estado.presencas = [
      { id: "presenca-vinculada", jornadaId: jornada.id, pontos: [{ ...jornada.pontos[1], comandoId: "cmd-1", comandoEm: agora }] },
      { id: "presenca-inicial", pontos: [{
        id: "presenca-checkpoint", tipo: "checkpoint", latitude: -22, longitude: -43,
        ocorridoEm: "2026-09-13T11:30:00.000Z", recebidoEm: agora, comandoId: "cmd-2", comandoEm: agora,
      }] },
    ];

    expect(checkpointsDoUsuario(estado)).toEqual({ checkpoints: 2, jornadas: 2, ultimoCheckpointEm: "2026-09-13T11:30:00.000Z" });
  });
  it("preserva origem e torna reentrega idêntica neutra", () => {
    const j = adicionarPonto(vazia(), ponto, agora);
    expect(adicionarPonto(j, ponto, "2026-09-13T13:00:00Z")).toBe(j);
    expect(j.pontos[0].recebidoEm).toBe(agora);
    expect(() => adicionarPonto(j, { ...ponto, latitude: 0 }, agora)).toThrow(/outro conteúdo/);
  });
  it("rejeita eventos sem início, atrasados, futuros e posteriores ao fechamento", () => {
    expect(() => adicionarPonto(vazia(), { ...ponto, tipo: "check_out" }, agora)).toThrow(/Sequência/);
    const j = adicionarPonto(vazia(), ponto, agora);
    expect(() => adicionarPonto(j, { ...ponto, id: "late", tipo: "checkpoint", ocorridoEm: inicio }, agora)).toThrow(/atrasado/);
    expect(() => adicionarPonto(vazia(), { ...ponto, ocorridoEm: fim }, agora)).toThrow(/futuro/);
    expect(() => adicionarPonto(completa(), { ...ponto, id: "x", tipo: "checkpoint" }, agora)).toThrow(/encerrada/);
  });
  it("rejeita coordenadas fora de faixa", () => expect(() => adicionarPonto(vazia(), { ...ponto, latitude: 91 }, agora)).toThrow());
});

describe("Maps posterior", () => {
  it("não chama provedor sem habilitação/chave ou antes do fechamento", async () => {
    const request = vi.fn();
    expect((await estimarJornada(completa(), { habilitado: false, apiKey: "test" }, request)).metros).toBeNull();
    await estimarJornada(completa(), { habilitado: true }, request);
    await estimarJornada(vazia(), { habilitado: true, apiKey: "test" }, request);
    expect(request).not.toHaveBeenCalled();
  });
  it("preserva ordem e usa apenas distância retornada", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ routes: [{ distanceMeters: 12345 }] })));
    const r = await estimarJornada(completa(), { habilitado: true, apiKey: "test" }, request);
    expect(r.metros).toBe(12345);
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body.optimizeWaypointOrder).toBe(false);
    expect(body.intermediates).toHaveLength(1);
  });
  it.each([{}, { routes: [] }, { routes: [{ distanceMeters: -1 }] }, { routes: [{ distanceMeters: "12" }] }])("resposta incompleta permanece pendente: %j", async body => {
    const r = await estimarJornada(completa(), { habilitado: true, apiKey: "test" }, vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    expect(r).toMatchObject({ estado: "aguardando_calculo", metros: null });
  });
  it("falha/timeout não fabrica distância", async () => {
    expect((await estimarJornada(completa(), { habilitado: true, apiKey: "test" }, vi.fn().mockRejectedValue(new Error("timeout")))).metros).toBeNull();
  });
});

describe("conciliação documental separada do consumo", () => {
  it("regularização cancela lembrete e preserva versão anterior", () => {
    const estado = novoEstadoCampo();
    const j = completa(); j.calculo = { estado: "estimado", metros: 100000, calculadoEm: agora };
    estado.jornadas.push(j);
    estado.conciliacoes.push(conciliar(estado, inicio, fim, j.veiculo));
    expect(estado.conciliacoes[0]).toMatchObject({ estado: "documentacao_pendente", lembrete: "pendente", litrosEsperados: 10 });
    estado.documentos.push({ id: "d1", chave: "a", hash: "hash", cnpjDestinatario: "cnpj", veiculo: j.veiculo, data: agora, litros: 50, estado: "regular", motivo: "revisado" });
    atualizarConciliacoes(estado);
    expect(estado.conciliacoes[0]).toMatchObject({ estado: "conciliado", lembrete: "cancelado", litrosDocumentados: 50, litrosEsperados: 10, versao: 2 });
    expect(estado.historicoConciliacoes?.[0].lembrete).toBe("pendente");
  });
  it("não soma jornada incompleta, consumo ausente ou períodos sobrepostos", () => {
    const estado = novoEstadoCampo(); estado.jornadas.push(adicionarPonto(vazia(), ponto, agora));
    expect(conciliar(estado, inicio, fim, "ABC1D23")).toMatchObject({ estado: "revisao", metrosEstimados: null });
    estado.conciliacoes.push(conciliar(estado, inicio, fim, "ABC1D23"));
    expect(() => conciliar(estado, "2026-09-13T01:00:00Z", fim, "ABC1D23")).toThrow(/sobreposto/);
  });
  it("confere dígito verificador de chave fiscal", () => {
    const base = "35260912345678000123550010000000011000000001".slice(0, 43);
    const chave = Array.from({ length: 10 }, (_, i) => base + i).find(chaveFiscalValida);
    expect(chave).toBeDefined();
    expect(chaveFiscalValida("0".repeat(44))).toBe(false);
    expect(chaveFiscalValida("a".repeat(44))).toBe(false);
  });
});

describe("modos e moeda", () => {
  const decisao = { decisao: "aprovado" } as DecisaoReembolso;
  it("mesmo veredito, efeitos distintos e padrão sombra", () => {
    expect(aplicarModo(decisao).aplicarStatus).toBe(false);
    expect(aplicarModo(decisao, "assistido").aplicarStatus).toBe(false);
    expect(aplicarModo(decisao, "assistido", true).aplicarStatus).toBe(true);
    expect(aplicarModo(decisao, "autonomo").decisao).toBe(decisao);
    expect(aplicarModo(decisao, "autonomo").aplicarStatus).toBe(true);
  });
  it("arredonda centavos e exige tarifa explícita", () => {
    expect(valorEstimadoCentavos(12345, 75)).toBe(926);
    expect(() => valorEstimadoCentavos(100, 0)).toThrow();
    expect(() => valorEstimadoCentavos(Number.MAX_SAFE_INTEGER, 100)).toThrow();
  });
});

describe("memorial auditado e recálculo de distância", () => {
  it("preserva classificação na revisão documental e invalida quando a distância muda", () => {
    const estado = novoEstadoCampo();
    const j = completa();
    j.calculo = { estado: "estimado", metros: 15000, calculadoEm: agora };
    estado.jornadas.push(j);
    const c = conciliar(estado, inicio, fim, j.veiculo);
    const memorial = { uf: "SP", metrosComerciais: 10000, metrosNaoComerciais: 5000, tarifaCentavosPorKm: 75, valorCentavos: 750, politicaId: 1, politicaVersao: 2 };
    c.memorialReembolso = memorial;
    estado.conciliacoes.push(c);
    atualizarConciliacoes(estado);
    expect(estado.conciliacoes[0].memorialReembolso).toEqual(memorial);
    j.calculo.metros = 14000;
    atualizarConciliacoes(estado);
    expect(estado.conciliacoes[0].memorialReembolso).toBeUndefined();
    expect(estado.historicoConciliacoes?.at(-1)?.memorialReembolso).toEqual(memorial);
  });
});
