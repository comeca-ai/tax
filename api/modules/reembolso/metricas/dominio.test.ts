import { describe, expect, it } from "vitest";
import {
  calcularMetricas,
  periodoMetricasSchema,
  type EventoMetrica,
} from "./dominio";
const data = (hora: number) => new Date(Date.UTC(2026, 8, 15, hora));
const despesas = [
  {
    id: 1,
    createdAt: data(1),
    status: "aprovada",
    confianca: "alta",
    pagoEm: data(4),
  },
  {
    id: 2,
    createdAt: data(1),
    status: "em_revisao",
    confianca: "baixa",
    pagoEm: null,
  },
];
const evento = (
  id: number,
  detalhes: object,
  acao = "poc.auditoria_amostral"
): EventoMetrica => ({
  id,
  entidadeId: 1,
  acao,
  detalhes: JSON.stringify(detalhes),
  createdAt: data(2),
});
const amostra = {
  empresaId: 1,
  despesaId: 1,
  conjunto: "piloto-acordado",
  campo: "valor",
  previsto: true,
  observado: false,
  evidencia: "Conferência humana do documento original.",
};
describe("métricas com denominadores explícitos", () => {
  it("mede tempos válidos e expõe despesas sem dados; decisão não gera pagamento", () => {
    const r = calcularMetricas(despesas, [
      evento(1, { statusAplicado: "aprovada" }, "despesa.decisao"),
    ]);
    expect(r.criacaoAteDecisao).toEqual({
      mediaMs: 3600000,
      denominador: 1,
      semDadosOuInconsistentes: 1,
    });
    expect(r.criacaoAtePagamento.mediaMs).toBe(10800000);
    expect(r.decisaoAtePagamento.mediaMs).toBe(7200000);
    expect(r.pagamentosManuais).toBe(1);
    expect(despesas[1].pagoEm).toBeNull();
  });
  it("amostra vazia e coorte vazia não fabricam precisão ou duração zero", () => {
    const r = calcularMetricas([], []);
    expect(r.amostras).toEqual([]);
    expect(r.criacaoAtePagamento.mediaMs).toBeNull();
  });
  it("correção amostral conta uma vez sem mudar despesa; matrizes não misturam campos", () => {
    const original = structuredClone(despesas);
    const r = calcularMetricas(despesas, [
      evento(1, amostra),
      evento(2, { ...amostra, observado: true }),
      evento(3, {
        ...amostra,
        campo: "manipulacao",
        previsto: false,
        observado: true,
      }),
    ]);
    expect(r.amostras[0]).toMatchObject({
      denominador: 1,
      verdadeirosPositivos: 1,
      falsosPositivos: 0,
      precisao: 1,
    });
    expect(r.amostras[1]).toMatchObject({ falsosNegativos: 1, precisao: null });
    expect(despesas).toEqual(original);
  });
  it("descarta tempos negativos e identifica registro amostral inválido", () => {
    const r = calcularMetricas(
      [{ ...despesas[0], pagoEm: data(0) }],
      [evento(1, {})]
    );
    expect(r.criacaoAtePagamento.denominador).toBe(0);
    expect(r.registrosInvalidos).toBe(1);
  });
  it("declara decisão histórica com status desconhecido como inválida", () => {
    const r = calcularMetricas(despesas, [
      evento(1, { statusAplicado: "liberada" }, "despesa.decisao"),
    ]);
    expect(r.criacaoAteDecisao.denominador).toBe(0);
    expect(r.registrosInvalidos).toBe(1);
  });
  it("aceita estado intermediário sem medi-lo como decisão terminal", () => {
    const r = calcularMetricas(despesas, [
      evento(1, { statusAplicado: "em_revisao" }, "despesa.decisao"),
    ]);
    expect(r.criacaoAteDecisao.denominador).toBe(0);
    expect(r.registrosInvalidos).toBe(0);
  });
  it("rejeita período vazio ou invertido", () => {
    expect(
      periodoMetricasSchema.safeParse({
        empresaId: 1,
        inicio: data(2).toISOString(),
        fim: data(1).toISOString(),
      }).success
    ).toBe(false);
  });
  it("rejeita datas calendárias impossíveis também na API", () => {
    expect(
      periodoMetricasSchema.safeParse({
        empresaId: 1,
        inicio: "2026-02-30T00:00:00Z",
        fim: "2026-03-02T00:00:00Z",
      }).success
    ).toBe(false);
    expect(
      periodoMetricasSchema.safeParse({
        empresaId: 1,
        inicio: "2026-02-28T23:30:00-03:00",
        fim: "2026-03-01T00:30:00-03:00",
      }).success
    ).toBe(true);
  });
});
