import { TRPCError } from "@trpc/server";
import { and, eq, gte, lt, inArray } from "drizzle-orm";
import { despesas, logAuditoria } from "../../db/schema";
import { pocPagamentos } from "../../db/pocSchema";
import { createRouter, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import {
  assertAdminDaEmpresa,
  assertAdminDaEmpresaBloqueado,
  registrarLog,
} from "./_shared";
import {
  amostraSchema,
  calcularMetricas,
  periodoMetricasSchema,
} from "../modules/reembolso/metricas/dominio";

export const metricasPocRouter = createRouter({
  resumo: protectedProcedure
    .input(periodoMetricasSchema)
    .query(async ({ input, ctx }) => {
      await assertAdminDaEmpresa(
        ctx,
        input.empresaId,
        "Só o administrador da empresa pode consultar as métricas da POC.",
      );
      const db = getDb();
      const rows = await db
        .select({
          id: despesas.id,
          createdAt: despesas.createdAt,
          status: despesas.status,
          confianca: despesas.confianca,
          pagoEm: pocPagamentos.pagoEm,
        })
        .from(despesas)
        .leftJoin(
          pocPagamentos,
          and(
            eq(pocPagamentos.despesaId, despesas.id),
            eq(pocPagamentos.empresaId, despesas.empresaId)
          )
        )
        .where(
          and(
            eq(despesas.empresaId, input.empresaId),
            gte(despesas.createdAt, new Date(input.inicio)),
            lt(despesas.createdAt, new Date(input.fim))
          )
        );
      const eventos = rows.length
        ? await db
            .select({
              id: logAuditoria.id,
              entidadeId: logAuditoria.entidadeId,
              acao: logAuditoria.acao,
              detalhes: logAuditoria.detalhes,
              createdAt: logAuditoria.createdAt,
            })
            .from(logAuditoria)
            .where(
              and(
                eq(logAuditoria.empresaId, input.empresaId),
                eq(logAuditoria.entidade, "despesa"),
                inArray(logAuditoria.acao, [
                  "despesa.decisao",
                  "poc.auditoria_amostral",
                ]),
                inArray(
                  logAuditoria.entidadeId,
                  rows.map(d => d.id)
                )
              )
            )
        : [];
      return {
        empresaId: input.empresaId,
        inicio: input.inicio,
        fimExclusivo: input.fim,
        consultadoEm: new Date().toISOString(),
        coorte: "criacao_despesa" as const,
        ...calcularMetricas(rows, eventos),
      };
    }),
  auditarAmostra: protectedProcedure
    .input(amostraSchema)
    .mutation(async ({ input, ctx }) => {
      await assertAdminDaEmpresa(
        ctx,
        input.empresaId,
        "Só o administrador da empresa pode registrar a auditoria amostral.",
      );
      return getDb().transaction(async tx => {
        await assertAdminDaEmpresaBloqueado(
          ctx,
          input.empresaId,
          tx,
          "Sua autorização para registrar a auditoria amostral não está mais vigente.",
        );
        const [despesa] = await tx
          .select({ id: despesas.id })
          .from(despesas)
          .where(
            and(
              eq(despesas.id, input.despesaId),
              eq(despesas.empresaId, input.empresaId)
            )
          )
          .for("update");
        if (!despesa)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Despesa não encontrada.",
          });
        await registrarLog(tx, {
          usuarioId: ctx.usuario.id,
          empresaId: input.empresaId,
          acao: "poc.auditoria_amostral",
          entidade: "despesa",
          entidadeId: input.despesaId,
          detalhes: JSON.stringify({ ...input, versaoRegistro: 1 }),
          regraVersao: "amostra-v1",
        });
        return { registrado: true as const };
      });
    }),
});
