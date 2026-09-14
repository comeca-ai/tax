import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { colaboradores, veiculos } from "../../db/schema";
import { createRouter, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import {
  assertAdminDaEmpresa,
  assertEmpresaAcesso,
  registrarLog,
} from "./_shared";

import { veiculoUnificadoInput } from "../../contracts/veiculos";
export { veiculoUnificadoInput } from "../../contracts/veiculos";

export const veiculosRouter = createRouter({
  listar: protectedProcedure
    .input(z.object({ empresaId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const empresa = await assertEmpresaAcesso(ctx, input.empresaId);
      return getDb()
        .select()
        .from(veiculos)
        .where(eq(veiculos.empresaId, empresa.id));
    }),
  salvar: protectedProcedure
    .input(veiculoUnificadoInput)
    .mutation(async ({ ctx, input }) => {
      const empresa = await assertAdminDaEmpresa(ctx, input.empresaId);
      try {
        return await getDb().transaction(async tx => {
          const [pessoa] = await tx
            .select({ id: colaboradores.id })
            .from(colaboradores)
            .where(
              and(
                eq(colaboradores.id, input.colaboradorId),
                eq(colaboradores.empresaId, empresa.id),
                eq(colaboradores.statusVinculo, "ativo")
              )
            )
            .limit(1);
          if (!pessoa)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Colaborador ativo da empresa não encontrado.",
            });
          const [r] = await tx
            .insert(veiculos)
            .values({ ...input, empresaId: empresa.id });
          await registrarLog(tx, {
            usuarioId: ctx.usuario!.id,
            empresaId: empresa.id,
            acao: "veiculo.cadastrar",
            entidade: "veiculos",
            entidadeId: r.insertId,
            detalhes: "Cadastro unificado vinculado ao colaborador da empresa.",
          });
          return { id: r.insertId };
        });
      } catch (error) {
        const e = error as { code?: string; cause?: { code?: string } };
        if (e.code === "ER_DUP_ENTRY" || e.cause?.code === "ER_DUP_ENTRY")
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esta placa já está cadastrada para o colaborador.",
          });
        throw error;
      }
    }),
});
