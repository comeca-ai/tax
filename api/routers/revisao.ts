import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { createRouter, perfilProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import {
  creditosApurados,
  despesas,
  evidenciasDocumentais,
  notasFiscais,
} from "@db/schema";
import { revisaoInput } from "@contracts/types";
import { registrarLog } from "./_shared";

/**
 * RF-05: fila de revisão humana — "Média confiança" e rebaixadas (RF-09).
 * Acesso restrito a revisor/admin.
 */
export const revisaoRouter = createRouter({
  /** Fila de revisão: despesas em_revisao (todas as empresas). */
  fila: perfilProcedure("revisor", "admin").query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        despesa: despesas,
        dataFatoGerador: notasFiscais.dataFatoGerador,
        valorNota: notasFiscais.valor,
        evidencias: evidenciasDocumentais.id,
      })
      .from(despesas)
      .leftJoin(notasFiscais, eq(despesas.notaFiscalId, notasFiscais.id))
      .leftJoin(
        evidenciasDocumentais,
        eq(evidenciasDocumentais.despesaId, despesas.id),
      )
      .where(eq(despesas.status, "em_revisao"))
      .orderBy(desc(despesas.createdAt));

    // Agrupa evidências por despesa
    const porDespesa = new Map<
      number,
      {
        despesa: typeof despesas.$inferSelect;
        dataFatoGerador: string | null;
        valorNota: number | null;
        quantidadeEvidencias: number;
      }
    >();
    for (const row of rows) {
      const atual = porDespesa.get(row.despesa.id) ?? {
        despesa: row.despesa,
        dataFatoGerador: row.dataFatoGerador,
        valorNota: row.valorNota,
        quantidadeEvidencias: 0,
      };
      if (row.evidencias !== null) atual.quantidadeEvidencias += 1;
      porDespesa.set(row.despesa.id, atual);
    }
    return [...porDespesa.values()];
  }),

  /**
   * Decisão de revisão. RF-04: despesa de "Média confiança" só pode ser
   * aprovada com evidência documental anexada. Justificativa obrigatória.
   */
  decidir: perfilProcedure("revisor", "admin")
    .input(revisaoInput)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(despesas)
        .where(eq(despesas.id, input.despesaId))
        .limit(1);
      const despesa = rows[0];
      if (!despesa) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Despesa não encontrada." });
      }
      if (despesa.status !== "em_revisao") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Despesa não está em revisão (status atual: ${despesa.status}).`,
        });
      }

      if (input.decisao === "aprovar" && despesa.confianca === "media") {
        const evidencias = await db
          .select({ id: evidenciasDocumentais.id })
          .from(evidenciasDocumentais)
          .where(eq(evidenciasDocumentais.despesaId, despesa.id))
          .limit(1);
        if (evidencias.length === 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "RF-04: despesa de Média confiança exige documento de suporte (evidência) antes da aprovação.",
          });
        }
      }

      const novoStatus = input.decisao === "aprovar" ? "aprovada" : "rejeitada";
      const statusCredito =
        input.decisao === "aprovar" ? ("confirmado" as const) : ("rejeitado" as const);

      await db
        .update(despesas)
        .set({ status: novoStatus, motivoRevisao: input.justificativa })
        .where(eq(despesas.id, despesa.id));
      await db
        .update(creditosApurados)
        .set({ status: statusCredito })
        .where(eq(creditosApurados.despesaId, despesa.id));

      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        empresaId: despesa.empresaId,
        acao: `revisao.${input.decisao}`,
        entidade: "despesa",
        entidadeId: despesa.id,
        detalhes: input.justificativa,
      });

      return { ok: true, status: novoStatus };
    }),
});
