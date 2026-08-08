import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { createRouter, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { veiculos } from "@db/schema";
import { veiculoInput } from "@contracts/types";
import { assertEmpresaAcesso, registrarLog } from "./_shared";

export const veiculosRouter = createRouter({
  /** Lista veículos da empresa. */
  list: protectedProcedure
    .input(z.object({ empresaId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertEmpresaAcesso(ctx, input.empresaId);
      const db = getDb();
      return db
        .select()
        .from(veiculos)
        .where(eq(veiculos.empresaId, input.empresaId));
    }),

  /** Cadastro de veículo (km/L declarado e tarifa/km alimentam RF-09 e §7.4). */
  create: protectedProcedure
    .input(
      z.object({
        empresaId: z.number().int().positive(),
        dados: veiculoInput,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await assertEmpresaAcesso(ctx, input.empresaId);
      const db = getDb();
      const result = await db.insert(veiculos).values({
        empresaId: input.empresaId,
        placa: input.dados.placa.toUpperCase(),
        renavam: input.dados.renavam ?? null,
        kmPorLitroDeclarado: input.dados.kmPorLitroDeclarado,
        tarifaReembolsoKm: input.dados.tarifaReembolsoKm,
        descricao: input.dados.descricao ?? null,
      });
      const id = Number(result[0].insertId);
      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        empresaId: input.empresaId,
        acao: "veiculo.create",
        entidade: "veiculo",
        entidadeId: id,
        detalhes: `Placa ${input.dados.placa.toUpperCase()}, ${input.dados.kmPorLitroDeclarado} km/L`,
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        empresaId: z.number().int().positive(),
        dados: veiculoInput,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await assertEmpresaAcesso(ctx, input.empresaId);
      const db = getDb();
      const updated = await db
        .update(veiculos)
        .set({
          placa: input.dados.placa.toUpperCase(),
          renavam: input.dados.renavam ?? null,
          kmPorLitroDeclarado: input.dados.kmPorLitroDeclarado,
          tarifaReembolsoKm: input.dados.tarifaReembolsoKm,
          descricao: input.dados.descricao ?? null,
        })
        .where(and(eq(veiculos.id, input.id), eq(veiculos.empresaId, input.empresaId)));
      if (Number(updated[0].affectedRows) === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Veículo não encontrado." });
      }
      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        empresaId: input.empresaId,
        acao: "veiculo.update",
        entidade: "veiculo",
        entidadeId: input.id,
      });
      return { ok: true };
    }),

  remove: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        empresaId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await assertEmpresaAcesso(ctx, input.empresaId);
      const db = getDb();
      const removed = await db
        .delete(veiculos)
        .where(and(eq(veiculos.id, input.id), eq(veiculos.empresaId, input.empresaId)));
      if (Number(removed[0].affectedRows) === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Veículo não encontrado." });
      }
      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        empresaId: input.empresaId,
        acao: "veiculo.remove",
        entidade: "veiculo",
        entidadeId: input.id,
      });
      return { ok: true };
    }),
});
