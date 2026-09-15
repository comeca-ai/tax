import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { colaboradores, despesas, empresas, empresasConfig, politicasReembolso } from "../../db/schema";
import { pocConfiguracao, pocPagamentos } from "../../db/pocSchema";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), db: vi.fn(), log: vi.fn() }));
vi.mock("./_shared", () => ({ assertAdminDaEmpresa: mocks.admin, assertAdminDaEmpresaBloqueado: mocks.admin, registrarLog: mocks.log, ehAdminDeAlgumaEmpresa: vi.fn() }));
vi.mock("../queries/connection", () => ({ getDb: mocks.db }));
import { campoRouter } from "./campo";
const config = {
  modo: "assistido" as const, politicaId: 1, politicaVersao: 2, tarifaCentavosPorKm: 75,
  tarifasCentavosPorKmPorUf: { SP: 90 }, periodoDias: 30, prazoNotaDias: 5,
  intervaloLembreteDias: 2, limiteLembretes: 3, regraPercurso: "Somente percurso comercial.", retencaoLocalizacaoDias: 30,
};
const caller = () => campoRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), usuario: { id: 7, email: "teste@example.test", nome: "Teste", perfil: "cliente" } });
let designadoExiste = true;
let statusDespesa = "aprovada";
let pagamento: { referencia: string; pagoEm: Date } | undefined;
const escritas: { table: unknown; value: unknown }[] = [];
beforeEach(() => {
  vi.resetAllMocks(); escritas.length = 0; designadoExiste = true; statusDespesa = "aprovada"; pagamento = undefined;
  mocks.admin.mockResolvedValue({ id: 42 });
  const tx = {
    select: () => ({ from: (table: unknown) => ({ where: () => {
      const rows = table === empresas ? [{ id: 42 }] : table === politicasReembolso ? [{ id: 1, status: "ativa", versao: 2 }]
        : table === pocConfiguracao ? [{ configuracao: { ...config, modo: "sombra" }, historico: [] }]
          : table === colaboradores ? designadoExiste ? [{ id: 9 }] : [] : table === empresasConfig ? [{ id: 1 }]
            : table === despesas ? [{ id: 5, empresaId: 42, status: statusDespesa }]
              : table === pocPagamentos ? pagamento ? [pagamento] : [] : [];
      return { for: async () => rows, limit: async () => rows, then: (resolve: (rows: unknown) => void) => resolve(rows) };
    } }) }),
    insert: (table: unknown) => ({ values: async (value: unknown) => { escritas.push({ table, value }); if (table === pocPagamentos) pagamento = value as typeof pagamento; } }),
    update: (table: unknown) => ({ set: (value: unknown) => ({ where: async () => { escritas.push({ table, value }); } }) }),
  };
  mocks.db.mockReturnValue({ ...tx, transaction: async (fn: (tx: unknown) => unknown) => fn(tx) });
});

describe("registro manual de pagamento", () => {
  const input = { despesaId: 5, referencia: "transferencia-teste", pagoEm: "2026-09-12T10:00:00Z" };
  it("registra ato e trilha apenas uma vez, sem alterar despesa aprovada", async () => {
    await caller().registrarPagamento(input);
    await caller().registrarPagamento(input);
    expect(escritas).toHaveLength(1);
    expect(escritas[0].table).toBe(pocPagamentos);
    expect(mocks.log).toHaveBeenCalledOnce();
    expect(mocks.log.mock.calls[0][1]).toMatchObject({ acao: "despesa.registrar_pagamento", usuarioId: 7, empresaId: 42, entidadeId: 5 });
    expect(statusDespesa).toBe("aprovada");
  });
  it("despesa sem aprovação não gera registro nem trilha de pagamento", async () => {
    statusDespesa = "revisao";
    await expect(caller().registrarPagamento(input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(escritas).toHaveLength(0);
    expect(mocks.log).not.toHaveBeenCalled();
  });
});

describe("governança da configuração campo", () => {
  it("autorização da empresa é obrigatória antes da transação", async () => {
    mocks.admin.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(caller().configurar({ empresaId: 42, configuracao: config })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db).not.toHaveBeenCalled();
    expect(escritas).toHaveLength(0);
  });
  it("designado que não atende vínculo ativo da empresa é rejeitado antes de escrita", async () => {
    designadoExiste = false;
    await expect(caller().configurar({ empresaId: 42, configuracao: { ...config, aprovadorId: 9 } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(escritas).toHaveLength(0);
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it("promoção humana grava autor, modo anterior/novo e versão no log transacional", async () => {
    await caller().configurar({ empresaId: 42, configuracao: { ...config, aprovadorId: 9, temValeRefeicao: true } });
    expect(escritas.find(e => e.table === empresasConfig)?.value).toMatchObject({ aprovadorId: 9, temValeRefeicao: true });
    const registro = mocks.log.mock.calls[0][1];
    expect(registro).toMatchObject({ usuarioId: 7, empresaId: 42, acao: "empresa.configurar_campo", regraVersao: "2" });
    expect(JSON.parse(registro.detalhes)).toMatchObject({ modoAnterior: "sombra", modoNovo: "assistido" });
  });
});
