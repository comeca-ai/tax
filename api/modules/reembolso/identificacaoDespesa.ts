import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { colaboradores, despesas } from "../../../db/schema";
import type { TrpcContext } from "../../context";
import { createRouter, protectedProcedure } from "../../middleware";
import { getDb } from "../../queries/connection";
import {
  assertEmpresaAcesso,
  papelRevisaoNaEmpresa,
  registrarLog,
} from "../../routers/_shared";

/** O remetente só é o solicitante quando há exatamente um vínculo ativo na empresa. */
export async function identificarSolicitanteWeb(
  ctx: TrpcContext,
  empresaId: number,
  informado: { colaborador?: string; centroCusto?: string } = {}
) {
  const rows = ctx.usuario
    ? await getDb()
        .select({
          id: colaboradores.id,
          nome: colaboradores.nome,
          centroCusto: colaboradores.centroCusto,
        })
        .from(colaboradores)
        .where(
          and(
            eq(colaboradores.empresaId, empresaId),
            eq(colaboradores.usuarioId, ctx.usuario.id),
            eq(colaboradores.statusVinculo, "ativo")
          )
        )
        .limit(2)
    : [];
  const proprio = rows.length === 1 ? rows[0] : null;
  const explicito = informado.colaborador?.trim() || null;
  // Nome explicitamente informado pode ser um terceiro; não lhe atribui o CC do remetente.
  return {
    colaborador: explicito ?? proprio?.nome ?? null,
    centroCusto:
      informado.centroCusto?.trim() ||
      (!explicito || explicito === proprio?.nome
        ? proprio?.centroCusto?.trim() || null
        : null),
  };
}

const alvo = z
  .object({
    empresaId: z.number().int().positive(),
    despesaId: z.number().int().positive(),
  })
  .strict();
export const despesaIdentificacaoRouter = createRouter({
  opcoes: protectedProcedure.input(alvo).query(async ({ ctx, input }) => {
    await assertEmpresaAcesso(ctx, input.empresaId);
    try {
      await papelRevisaoNaEmpresa(ctx, input.empresaId);
    } catch (error) {
      if (error instanceof TRPCError && error.code === "FORBIDDEN")
        return { permitido: false, colaboradores: [] };
      throw error;
    }
    const db = getDb();
    const [despesa] = await db
      .select({ status: despesas.status })
      .from(despesas)
      .where(
        and(
          eq(despesas.id, input.despesaId),
          eq(despesas.empresaId, input.empresaId)
        )
      )
      .limit(1);
    if (!despesa)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Despesa não encontrada.",
      });
    if (!["pendente", "em_revisao"].includes(despesa.status))
      return { permitido: false, colaboradores: [] };
    const pessoas = await db
      .select({
        id: colaboradores.id,
        nome: colaboradores.nome,
        centroCusto: colaboradores.centroCusto,
      })
      .from(colaboradores)
      .where(
        and(
          eq(colaboradores.empresaId, input.empresaId),
          eq(colaboradores.statusVinculo, "ativo")
        )
      );
    return { permitido: true, colaboradores: pessoas };
  }),
  corrigir: protectedProcedure
    .input(
      alvo
        .extend({
          colaboradorId: z.number().int().positive(),
          motivo: z.string().trim().min(3).max(500),
          colaboradorAtual: z.string().max(255).nullable(),
          centroCustoAtual: z.string().max(255).nullable(),
        })
        .strict()
    )
    .mutation(async ({ ctx, input }) => {
      await papelRevisaoNaEmpresa(ctx, input.empresaId);
      return getDb().transaction(async tx => {
        const [despesa] = await tx
          .select()
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
        if (!["pendente", "em_revisao"].includes(despesa.status))
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "A identificação só pode ser corrigida antes da decisão final da despesa.",
          });
        if (
          despesa.colaborador !== input.colaboradorAtual ||
          despesa.centroCusto !== input.centroCustoAtual
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "A identificação foi alterada. Atualize a despesa e confira os dados antes de salvar.",
          });
        const [pessoa] = await tx
          .select()
          .from(colaboradores)
          .where(
            and(
              eq(colaboradores.id, input.colaboradorId),
              eq(colaboradores.empresaId, input.empresaId),
              eq(colaboradores.statusVinculo, "ativo")
            )
          )
          .for("update");
        if (!pessoa)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Colaborador ativo não encontrado nesta empresa.",
          });
        const centroCusto = pessoa.centroCusto?.trim() || null;
        await tx
          .update(despesas)
          .set({ colaborador: pessoa.nome, centroCusto })
          .where(
            and(
              eq(despesas.id, input.despesaId),
              eq(despesas.empresaId, input.empresaId)
            )
          );
        await registrarLog(tx, {
          usuarioId: ctx.usuario.id,
          empresaId: input.empresaId,
          acao: "despesa.identificar_colaborador",
          entidade: "despesa",
          entidadeId: input.despesaId,
          detalhes: JSON.stringify({
            colaboradorId: pessoa.id,
            anterior: {
              colaborador: despesa.colaborador,
              centroCusto: despesa.centroCusto,
            },
            atual: { colaborador: pessoa.nome, centroCusto },
            motivo: input.motivo,
          }),
        });
        return { ok: true, colaborador: pessoa.nome, centroCusto };
      });
    }),
});
