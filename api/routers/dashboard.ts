import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { createRouter, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import {
  creditosApurados,
  despesas,
  evidenciasDocumentais,
  notasFiscais,
} from "@db/schema";
import type { DashboardResumo } from "@contracts/types";
import { assertEmpresaAcesso } from "./_shared";

/**
 * RF-08: dashboard — valor identificado vs capturável vs em revisão,
 * evolução por categoria e pendências.
 */
export const dashboardRouter = createRouter({
  resumo: protectedProcedure
    .input(z.object({ empresaId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertEmpresaAcesso(ctx, input.empresaId);
      const db = getDb();

      const despesasRows = await db
        .select()
        .from(despesas)
        .where(eq(despesas.empresaId, input.empresaId));

      const creditosRows = despesasRows.length
        ? await db
            .select({
              despesaId: creditosApurados.despesaId,
              tributo: creditosApurados.tributo,
              valor: creditosApurados.valor,
              status: creditosApurados.status,
            })
            .from(creditosApurados)
            .innerJoin(despesas, eq(creditosApurados.despesaId, despesas.id))
            .where(eq(despesas.empresaId, input.empresaId))
        : [];

      let valorIdentificado = 0;
      let valorCapturavel = 0;
      let valorEmRevisao = 0;
      const porCategoria = new Map<
        string,
        { total: number; valorCreditos: number; quantidade: number }
      >();

      for (const c of creditosRows) {
        if (c.status !== "rejeitado") valorIdentificado += c.valor;
        if (c.status === "apurado" || c.status === "confirmado") {
          valorCapturavel += c.valor;
        }
        if (c.status === "em_revisao") valorEmRevisao += c.valor;
      }

      for (const d of despesasRows) {
        const chaveCat = d.categoria ?? "sem_categoria";
        const atual = porCategoria.get(chaveCat) ?? {
          total: 0,
          valorCreditos: 0,
          quantidade: 0,
        };
        atual.total += d.valorFiscal;
        atual.quantidade += 1;
        porCategoria.set(chaveCat, atual);
      }
      for (const c of creditosRows) {
        const despesa = despesasRows.find((d) => d.id === c.despesaId);
        if (!despesa || c.status === "rejeitado") continue;
        const atual = porCategoria.get(despesa.categoria ?? "sem_categoria");
        if (atual) atual.valorCreditos += c.valor;
      }

      const pendenciasRevisao = despesasRows.filter(
        (d) => d.status === "em_revisao",
      ).length;

      // RF-04: médias confiança sem evidência = pendência documental
      let despesasSemEvidencia = 0;
      const medias = despesasRows.filter((d) => d.confianca === "media");
      for (const d of medias) {
        const ev = await db
          .select({ id: evidenciasDocumentais.id })
          .from(evidenciasDocumentais)
          .where(eq(evidenciasDocumentais.despesaId, d.id))
          .limit(1);
        if (ev.length === 0) despesasSemEvidencia += 1;
      }

      const resumo: DashboardResumo = {
        valorIdentificado: round2(valorIdentificado),
        valorCapturavel: round2(valorCapturavel),
        valorEmRevisao: round2(valorEmRevisao),
        totalDespesas: despesasRows.length,
        pendenciasRevisao,
        despesasSemEvidencia,
        evolucaoPorCategoria: [...porCategoria.entries()].map(
          ([categoria, v]) => ({
            categoria: categoria as DashboardResumo["evolucaoPorCategoria"][number]["categoria"],
            total: round2(v.total),
            valorCreditos: round2(v.valorCreditos),
            quantidade: v.quantidade,
          }),
        ),
      };
      return resumo;
    }),
});

/**
 * RF-06: relatórios por cliente, período, tributo e nível de confiança;
 * exportação CSV (PDF é gerado no frontend a partir das mesmas linhas).
 */
export const relatoriosRouter = createRouter({
  gerar: protectedProcedure
    .input(
      z.object({
        empresaId: z.number().int().positive(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        tributo: z
          .enum(["pis_cofins", "icms", "cbs", "ibs", "irpj_csll"])
          .optional(),
        confianca: z.enum(["alta", "media", "baixa", "vedado"]).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      await assertEmpresaAcesso(ctx, input.empresaId);
      const db = getDb();

      const condicoes = [eq(despesas.empresaId, input.empresaId)];
      if (input.dataInicio) {
        condicoes.push(gte(notasFiscais.dataFatoGerador, input.dataInicio));
      }
      if (input.dataFim) {
        condicoes.push(lte(notasFiscais.dataFatoGerador, input.dataFim));
      }
      if (input.confianca) {
        condicoes.push(eq(despesas.confianca, input.confianca));
      }

      const rows = await db
        .select({
          despesa: despesas,
          dataFatoGerador: notasFiscais.dataFatoGerador,
          credito: creditosApurados,
        })
        .from(despesas)
        .leftJoin(notasFiscais, eq(despesas.notaFiscalId, notasFiscais.id))
        .leftJoin(creditosApurados, eq(creditosApurados.despesaId, despesas.id))
        .where(and(...condicoes));

      const linhas = rows
        .filter(
          (r) =>
            !input.tributo ||
            r.credito === null ||
            r.credito.tributo === input.tributo,
        )
        .map((r) => ({
          despesaId: r.despesa.id,
          dataFatoGerador: r.dataFatoGerador,
          categoria: r.despesa.categoria,
          confianca: r.despesa.confianca,
          status: r.despesa.status,
          valorFiscal: r.despesa.valorFiscal,
          valorReembolsavel: r.despesa.valorReembolsavel,
          tributo: r.credito?.tributo ?? null,
          tipoBeneficio: r.credito?.tipoBeneficio ?? null,
          valorCredito: r.credito?.valor ?? null,
        }));

      // Join despesa × crédito duplica a despesa: totais de valor fiscal /
      // reembolsável são por despesa distinta; créditos por linha.
      const despesasDistintas = new Map<number, (typeof linhas)[number]>();
      for (const l of linhas) despesasDistintas.set(l.despesaId, l);
      const totais = {
        valorFiscal: round2(
          [...despesasDistintas.values()].reduce((s, l) => s + l.valorFiscal, 0),
        ),
        valorReembolsavel: round2(
          [...despesasDistintas.values()].reduce(
            (s, l) => s + l.valorReembolsavel,
            0,
          ),
        ),
        creditos: round2(
          linhas
            .filter((l) => l.tipoBeneficio === "credito")
            .reduce((s, l) => s + (l.valorCredito ?? 0), 0),
        ),
        dedutibilidade: round2(
          linhas
            .filter((l) => l.tipoBeneficio === "dedutibilidade")
            .reduce((s, l) => s + (l.valorCredito ?? 0), 0),
        ),
      };

      return { linhas, totais };
    }),

  /** Exportação CSV (RF-06). */
  exportarCsv: protectedProcedure
    .input(
      z.object({
        empresaId: z.number().int().positive(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        tributo: z
          .enum(["pis_cofins", "icms", "cbs", "ibs", "irpj_csll"])
          .optional(),
        confianca: z.enum(["alta", "media", "baixa", "vedado"]).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      await assertEmpresaAcesso(ctx, input.empresaId);
      // Reutiliza a lógica de geração via chamada interna simples
      const db = getDb();
      const condicoes = [eq(despesas.empresaId, input.empresaId)];
      if (input.dataInicio) {
        condicoes.push(gte(notasFiscais.dataFatoGerador, input.dataInicio));
      }
      if (input.dataFim) {
        condicoes.push(lte(notasFiscais.dataFatoGerador, input.dataFim));
      }
      if (input.confianca) {
        condicoes.push(eq(despesas.confianca, input.confianca));
      }
      const rows = await db
        .select({
          despesa: despesas,
          dataFatoGerador: notasFiscais.dataFatoGerador,
          credito: creditosApurados,
        })
        .from(despesas)
        .leftJoin(notasFiscais, eq(despesas.notaFiscalId, notasFiscais.id))
        .leftJoin(creditosApurados, eq(creditosApurados.despesaId, despesas.id))
        .where(and(...condicoes));

      const cabecalho =
        "despesa_id;data_fato_gerador;categoria;confianca;status;valor_fiscal;valor_reembolsavel;tributo;tipo_beneficio;valor";
      const linhas = rows
        .filter(
          (r) =>
            !input.tributo ||
            r.credito === null ||
            r.credito.tributo === input.tributo,
        )
        .map((r) =>
          [
            r.despesa.id,
            r.dataFatoGerador ?? "",
            r.despesa.categoria,
            r.despesa.confianca,
            r.despesa.status,
            r.despesa.valorFiscal.toFixed(2).replace(".", ","),
            r.despesa.valorReembolsavel.toFixed(2).replace(".", ","),
            r.credito?.tributo ?? "",
            r.credito?.tipoBeneficio ?? "",
            r.credito !== null ? r.credito.valor.toFixed(2).replace(".", ",") : "",
          ].join(";"),
        );
      return {
        nomeArquivo: `relatorio_${input.empresaId}_${new Date().toISOString().slice(0, 10)}.csv`,
        conteudo: [cabecalho, ...linhas].join("\n"),
      };
    }),
});

function round2(valor: number): number {
  return Math.round(valor * 100) / 100;
}
