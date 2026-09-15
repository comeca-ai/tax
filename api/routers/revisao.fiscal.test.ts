import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { creditosApurados, despesas } from "../../db/schema";
import { fiscalVerificacoes } from "../../db/fiscalSchema";
import { ESTADOS_VERIFICACAO_FISCAL, type ResultadoVerificacaoFiscal } from "../../contracts/fiscal";

const mocks = vi.hoisted(() => ({ db: vi.fn(), papel: vi.fn(), log: vi.fn(), decisao: vi.fn(), notificar: vi.fn() }));
vi.mock("../queries/connection", () => ({ getDb: mocks.db }));
vi.mock("./_shared", () => ({ papelRevisaoNaEmpresa: mocks.papel, papelRevisaoNaEmpresaBloqueado: mocks.papel, registrarLog: mocks.log, ehAdminDeAlgumaEmpresa: vi.fn() }));
vi.mock("../modules/reembolso/decisoes/registro", () => ({ registrarDecisaoDespesa: mocks.decisao }));
vi.mock("../modules/reembolso/revisao/notificacaoWhatsapp", () => ({ notificarDecisaoWhatsapp: mocks.notificar }));
import { revisaoRouter } from "./revisao";

const dialect = new MySqlDialect();
let fiscal: ResultadoVerificacaoFiscal | undefined;
let statusDespesa: string;
let statusCredito: string;
let filtroFiscal: unknown[];
const input = { empresaId: 42, despesaId: 17, decisao: "aprovar" as const, justificativa: "Reembolso autorizado após revisão humana." };
const caller = () => revisaoRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), usuario: { id: 7, nome: "Revisor", email: "revisor@example.invalid", perfil: "cliente" } });

beforeEach(() => {
  vi.resetAllMocks();
  statusDespesa = "em_revisao";
  statusCredito = "em_revisao";
  filtroFiscal = [];
  fiscal = { estado: "autorizada", solicitada: true, consultaId: "consulta-real-persistida", verificadaEm: "2026-09-15T00:00:00Z", modelo: "55", configuracaoVersao: 1 };
  mocks.papel.mockResolvedValue({ papel: { temAprovadorDesignado: false, ehAprovadorDesignado: false }, aprovadorId: null, colaboradorDoUsuarioId: 8 });
  const tx = {
    select: () => ({ from: (table: unknown) => ({ where: (condition: SQL) => {
      if (table === fiscalVerificacoes) filtroFiscal = dialect.sqlToQuery(condition).params;
      const rows = () => table === despesas ? [{ id: 17, empresaId: 42, notaFiscalId: 23, status: statusDespesa, confianca: "alta", politicaVersaoAplicada: 1 }]
        : table === fiscalVerificacoes && fiscal ? [{ resultado: fiscal }] : [];
      return { limit: async () => rows(), for: async () => rows() };
    } }) }),
    update: (table: unknown) => ({ set: (value: { status: string }) => ({ where: async (condition: SQL) => {
      if (table === despesas) {
        if (statusDespesa !== "em_revisao") return [{ affectedRows: 0 }];
        statusDespesa = value.status;
      }
      if (table === creditosApurados) {
        const query = dialect.sqlToQuery(condition);
        expect(query.params[0]).toBe(17);
        if (!(query.params.includes("rejeitado") && statusCredito === "rejeitado")) statusCredito = value.status;
      }
      return [{ affectedRows: 1 }];
    } }) }),
  };
  mocks.db.mockReturnValue({ ...tx, transaction: async (fn: (tx: unknown) => unknown) => {
    const anterior = { statusDespesa, statusCredito };
    try { return await fn(tx); }
    catch (error) { statusDespesa = anterior.statusDespesa; statusCredito = anterior.statusCredito; throw error; }
  } });
});

describe("revisão mantém reembolso e confirmação fiscal separados", () => {
  it.each(ESTADOS_VERIFICACAO_FISCAL.filter(e => e !== "autorizada"))("aprovar com situação %s mantém crédito em revisão", async estado => {
    fiscal!.estado = estado;
    fiscal!.solicitada = estado !== "desativada";
    await expect(caller().decidir(input)).resolves.toMatchObject({ status: "aprovada" });
    expect(statusCredito).toBe("em_revisao");
    expect(filtroFiscal).toEqual([42, 23]);
    const log = mocks.log.mock.calls.find(([, evento]) => evento.acao === "revisao.creditos_fiscais")?.[1];
    expect(JSON.parse(log.detalhes)).toMatchObject({ verificacaoFiscal: estado, statusCredito: "em_revisao" });
  });
  it("nota legada sem verificação permite reembolso mas não confirma crédito", async () => {
    fiscal = undefined;
    await caller().decidir(input);
    expect(statusDespesa).toBe("aprovada");
    expect(statusCredito).toBe("em_revisao");
  });
  it("confirma somente documento autorizado com referência e horário persistidos", async () => {
    await caller().decidir(input);
    expect(statusCredito).toBe("confirmado");
  });
  it.each(["consultaId", "verificadaEm"] as const)("autorizada sem %s não confirma crédito", async campo => {
    fiscal![campo] = null;
    await caller().decidir(input);
    expect(statusCredito).toBe("em_revisao");
  });
  it("registro com horário inválido não certifica a verificação", async () => {
    fiscal!.verificadaEm = "invalido";
    await caller().decidir(input);
    expect(statusCredito).toBe("em_revisao");
  });
  it("verificação autorizada não remove vedação anterior do motor", async () => {
    statusCredito = "rejeitado";
    await caller().decidir(input);
    expect(statusCredito).toBe("rejeitado");
  });
  it("rejeição humana continua rejeitando o crédito", async () => {
    await caller().decidir({ ...input, decisao: "rejeitar" });
    expect(statusDespesa).toBe("rejeitada");
    expect(statusCredito).toBe("rejeitado");
  });
  it("falta de permissão não consulta nem altera crédito", async () => {
    mocks.papel.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(caller().decidir(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("falha de auditoria desfaz status de reembolso e crédito na mesma transação", async () => {
    mocks.log.mockRejectedValue(new Error("falha de persistência"));
    await expect(caller().decidir(input)).rejects.toThrow("falha de persistência");
    expect(statusDespesa).toBe("em_revisao");
    expect(statusCredito).toBe("em_revisao");
    expect(mocks.notificar).not.toHaveBeenCalled();
  });
});
