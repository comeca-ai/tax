import { z } from "zod";

function dataHoraCalendarioValida(valor: string) {
  const partes =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
      valor
    );
  if (!partes) return false;
  const instante = Date.parse(valor);
  if (!Number.isFinite(instante)) return false;
  const deslocamento = partes[8]
    ? (partes[8] === "+" ? 1 : -1) *
      (Number(partes[9]) * 60 + Number(partes[10]))
    : 0;
  const local = new Date(instante + deslocamento * 60_000);
  return (
    local.getUTCFullYear() === Number(partes[1]) &&
    local.getUTCMonth() + 1 === Number(partes[2]) &&
    local.getUTCDate() === Number(partes[3]) &&
    local.getUTCHours() === Number(partes[4]) &&
    local.getUTCMinutes() === Number(partes[5]) &&
    local.getUTCSeconds() === Number(partes[6])
  );
}

const dataHoraMetrica = z
  .string()
  .datetime({ offset: true })
  .refine(dataHoraCalendarioValida, "Data inválida.");

const decisaoMetricaSchema = z.object({
  statusAplicado: z.enum([
    "pendente",
    "em_revisao",
    "aprovada",
    "rejeitada",
  ]),
});

export const periodoMetricasSchema = z
  .object({
    empresaId: z.number().int().positive(),
    inicio: dataHoraMetrica,
    fim: dataHoraMetrica,
  })
  .refine(v => Date.parse(v.inicio) < Date.parse(v.fim), "Período inválido.");
export const amostraSchema = z.object({
  empresaId: z.number().int().positive(),
  despesaId: z.number().int().positive(),
  conjunto: z.string().trim().min(3).max(128),
  campo: z.string().trim().min(1).max(128),
  previsto: z.boolean(),
  observado: z.boolean(),
  evidencia: z.string().trim().min(10).max(2000),
});
export type DespesaMetrica = {
  id: number;
  createdAt: Date;
  status: string;
  confianca: string;
  pagoEm: Date | null;
};
export type EventoMetrica = {
  id: number;
  entidadeId: number | null;
  acao: string;
  detalhes: string | null;
  createdAt: Date;
};
const duracao = (valores: number[], total: number) => ({
  mediaMs: valores.length
    ? valores.reduce((a, b) => a + b, 0) / valores.length
    : null,
  denominador: valores.length,
  semDadosOuInconsistentes: total - valores.length,
});

/** Coorte: despesas criadas em [inicio,fim); eventos posteriores contam até a consulta. */
export function calcularMetricas(
  despesas: DespesaMetrica[],
  eventos: EventoMetrica[]
) {
  const ids = new Set(despesas.map(d => d.id));
  const decisoes = new Map<number, Date>();
  const amostras = new Map<string, z.infer<typeof amostraSchema>>();
  let registrosInvalidos = 0;
  for (const evento of [...eventos].sort((a, b) => a.id - b.id)) {
    if (evento.entidadeId === null || !ids.has(evento.entidadeId)) continue;
    try {
      const valor = JSON.parse(evento.detalhes ?? "");
      if (evento.acao === "despesa.decisao") {
        const decisao = decisaoMetricaSchema.parse(valor);
        if (["aprovada", "rejeitada"].includes(decisao.statusAplicado)) {
          const anterior = decisoes.get(evento.entidadeId);
          if (!anterior || evento.createdAt < anterior)
            decisoes.set(evento.entidadeId, evento.createdAt);
        }
      }
      if (evento.acao === "poc.auditoria_amostral") {
        const a = amostraSchema.parse(valor);
        if (a.despesaId !== evento.entidadeId)
          throw new Error("Identidade divergente");
        // Nova avaliação mantém histórico; só a última por item/campo/conjunto entra na matriz.
        amostras.set(JSON.stringify([a.despesaId, a.conjunto, a.campo]), a);
      }
    } catch {
      registrosInvalidos++;
    }
  }
  const ateDecisao: number[] = [],
    atePagamento: number[] = [],
    decisaoPagamento: number[] = [];
  for (const d of despesas) {
    const decisao = decisoes.get(d.id);
    if (decisao && decisao >= d.createdAt)
      ateDecisao.push(+decisao - +d.createdAt);
    if (d.pagoEm && d.pagoEm >= d.createdAt)
      atePagamento.push(+d.pagoEm - +d.createdAt);
    if (decisao && d.pagoEm && decisao >= d.createdAt && d.pagoEm >= decisao)
      decisaoPagamento.push(+d.pagoEm - +decisao);
  }
  const grupos = new Map<
    string,
    {
      conjunto: string;
      campo: string;
      verdadeirosPositivos: number;
      verdadeirosNegativos: number;
      falsosPositivos: number;
      falsosNegativos: number;
    }
  >();
  for (const a of amostras.values()) {
    const key = JSON.stringify([a.conjunto, a.campo]);
    const g = grupos.get(key) ?? {
      conjunto: a.conjunto,
      campo: a.campo,
      verdadeirosPositivos: 0,
      verdadeirosNegativos: 0,
      falsosPositivos: 0,
      falsosNegativos: 0,
    };
    g[
      a.previsto
        ? a.observado
          ? "verdadeirosPositivos"
          : "falsosPositivos"
        : a.observado
          ? "falsosNegativos"
          : "verdadeirosNegativos"
    ]++;
    grupos.set(key, g);
  }
  return {
    denominadorDespesas: despesas.length,
    emRevisao: despesas.filter(d => d.status === "em_revisao").length,
    pagamentosManuais: despesas.filter(d => d.pagoEm !== null).length,
    criacaoAteDecisao: duracao(ateDecisao, despesas.length),
    criacaoAtePagamento: duracao(atePagamento, despesas.length),
    decisaoAtePagamento: duracao(decisaoPagamento, despesas.length),
    confiancaDeclarada: Object.fromEntries(
      ["alta", "media", "baixa", "vedado"].map(c => [
        c,
        despesas.filter(d => d.confianca === c).length,
      ])
    ),
    amostras: [...grupos.values()].map(g => {
      const denominador =
        g.verdadeirosPositivos +
        g.verdadeirosNegativos +
        g.falsosPositivos +
        g.falsosNegativos;
      const positivos = g.verdadeirosPositivos + g.falsosPositivos;
      return {
        ...g,
        denominador,
        acuracia:
          (g.verdadeirosPositivos + g.verdadeirosNegativos) / denominador,
        precisao: positivos ? g.verdadeirosPositivos / positivos : null,
      };
    }),
    registrosInvalidos,
    limites: [
      "Criação da despesa não comprova o instante de envio; tempo desde envio indisponível.",
      "Amostra informada pelo auditor, sem inferência sobre toda a população ou meta de aceite.",
      "Confiança declarada não é precisão medida.",
      "Convites, ativação e adoção ainda sem série de eventos por empresa neste relatório.",
    ],
  };
}
