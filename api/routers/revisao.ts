import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { createRouter, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import {
  creditosApurados,
  delegacoesDecisao,
  despesas,
  evidenciasDocumentais,
  notasFiscais,
} from "@db/schema";
import { revisaoFilaInput, revisaoInput } from "@contracts/types";
import { exigeMotivoDelegacao } from "@contracts/permissoes";
import { papelRevisaoNaEmpresa, registrarLog } from "./_shared";

/**
 * RF-05: fila de revisão humana — "Média confiança" e rebaixadas (RF-09).
 * Acesso por papel na empresa (v1.12.0): aprovador/analista designado,
 * admin da empresa ou admin da plataforma — ver `papelRevisaoNaEmpresa`.
 */
export const revisaoRouter = createRouter({
  /** Fila de revisão: despesas em_revisao da empresa consultada. */
  fila: protectedProcedure.input(revisaoFilaInput).query(async ({ input, ctx }) => {
    const { papel } = await papelRevisaoNaEmpresa(ctx, input.empresaId);
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
      .where(
        and(
          eq(despesas.status, "em_revisao"),
          eq(despesas.empresaId, input.empresaId),
        ),
      )
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
    return { itens: [...porDespesa.values()], papel };
  }),

  /**
   * Decisão de revisão. RF-04: despesa de "Média confiança" só pode ser
   * aprovada com evidência documental anexada. Justificativa obrigatória.
   * Quem não é o aprovador designado decide com motivo de delegação
   * registrado em `delegacoes_decisao` (Norma PoC §6.1, v1.12.0).
   */
  decidir: protectedProcedure
    .input(revisaoInput)
    .mutation(async ({ input, ctx }) => {
      const { papel, aprovadorId, colaboradorDoUsuarioId } =
        await papelRevisaoNaEmpresa(ctx, input.empresaId);
      const db = getDb();
      const rows = await db
        .select()
        .from(despesas)
        .where(eq(despesas.id, input.despesaId))
        .limit(1);
      const despesa = rows[0];
      // Mesma mensagem para inexistente e para despesa de outra empresa —
      // não vaza a existência de despesa alheia.
      if (!despesa || despesa.empresaId !== input.empresaId) {
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

      const delega = exigeMotivoDelegacao(papel);
      if (delega && (!input.motivoDelegacao || input.motivoDelegacao.trim().length < 3)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Você não é o aprovador designado desta empresa — informe o motivo de decidir no lugar dele.",
        });
      }

      const novoStatus = input.decisao === "aprovar" ? "aprovada" : "rejeitada";
      const statusCredito =
        input.decisao === "aprovar" ? ("confirmado" as const) : ("rejeitado" as const);

      // Decisão, créditos, delegação e log são atômicos — delegação órfã ou
      // decisão sem log ficam impossíveis (padrão registroComEmpresa v1.9.2).
      await db.transaction(async (tx) => {
        // Recondiciona ao status em_revisao: duas decisões intercaladas passam
        // ambas na checagem lá de cima (SELECT fora da tx), mas só a primeira
        // afeta linha aqui — a segunda aborta sem sobrescrever a decisão nem
        // duplicar delegação/log (caso de borda 3 da spec).
        const [atualizacao] = await tx
          .update(despesas)
          .set({ status: novoStatus, motivoRevisao: input.justificativa })
          .where(and(eq(despesas.id, despesa.id), eq(despesas.status, "em_revisao")));
        if (atualizacao.affectedRows === 0) {
          const [atual] = await tx
            .select({ status: despesas.status })
            .from(despesas)
            .where(eq(despesas.id, despesa.id))
            .limit(1);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Despesa não está em revisão (status atual: ${atual?.status ?? "desconhecido"}).`,
          });
        }
        await tx
          .update(creditosApurados)
          .set({ status: statusCredito })
          .where(eq(creditosApurados.despesaId, despesa.id));

        if (delega) {
          await tx.insert(delegacoesDecisao).values({
            empresaId: input.empresaId,
            // null para admin da plataforma sem vínculo na empresa
            decidiuColaboradorId: colaboradorDoUsuarioId,
            emNomeDeColaboradorId: aprovadorId!,
            decidiuUsuarioId: ctx.usuario.id,
            despesaId: despesa.id,
            motivo: input.motivoDelegacao!.trim(),
          });
        }

        await registrarLog(tx, {
          usuarioId: ctx.usuario.id,
          empresaId: despesa.empresaId,
          acao: `revisao.${input.decisao}`,
          entidade: "despesa",
          entidadeId: despesa.id,
          detalhes: input.justificativa,
        });
      });

      return { ok: true, status: novoStatus };
    }),
});
