import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createRouter, perfilProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { colaboradores } from "@db/schema";
import { assertEmpresaAcesso, registrarLog } from "./_shared";
import { normalizarTelefone } from "../agente";

const colaboradorInput = z.object({
  empresaId: z.number().int().positive(),
  nome: z.string().trim().min(3).max(255),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  telefone: z
    .string()
    .trim()
    .min(8)
    .max(20)
    .transform((t) => normalizarTelefone(t)),
  matricula: z.string().trim().max(50).optional().or(z.literal("")),
  centroCusto: z.string().trim().max(100).optional().or(z.literal("")),
});

/**
 * Colaboradores (v1.5.0) — pessoas que pedem reembolso. O admin cadastra
 * aqui (manual, um a um; upload em lote chega na v1.9.0). O colaborador não
 * precisa de login: a jornada dele acontece no WhatsApp (D-002/D-005).
 */
export const colaboradoresRouter = createRouter({
  criar: perfilProcedure("admin")
    .input(colaboradorInput)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await assertEmpresaAcesso(ctx, input.empresaId);

      const result = await db.insert(colaboradores).values({
        empresaId: input.empresaId,
        nome: input.nome,
        email: input.email || null,
        telefone: input.telefone,
        matricula: input.matricula || null,
        centroCusto: input.centroCusto || null,
      });
      const id = Number(result[0].insertId);

      await registrarLog(db, {
        usuarioId: ctx.usuario!.id,
        empresaId: input.empresaId,
        acao: "colaborador.criar",
        entidade: "colaboradores",
        entidadeId: id,
        detalhes: `Colaborador ${input.nome} cadastrado pelo admin`,
      });

      return { id };
    }),

  listar: perfilProcedure("admin", "revisor", "cliente")
    .input(z.object({ empresaId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      await assertEmpresaAcesso(ctx, input.empresaId);
      const rows = await db
        .select()
        .from(colaboradores)
        .where(eq(colaboradores.empresaId, input.empresaId))
        .orderBy(desc(colaboradores.createdAt));
      return rows;
    }),

  atualizarStatus: perfilProcedure("admin")
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["pendente", "confirmado", "divergencia"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(colaboradores)
        .where(eq(colaboradores.id, input.id))
        .limit(1);
      const colaborador = rows[0];
      if (!colaborador) return { ok: false };
      await assertEmpresaAcesso(ctx, colaborador.empresaId);
      await db
        .update(colaboradores)
        .set({ statusAtivacao: input.status })
        .where(
          and(
            eq(colaboradores.id, input.id),
            eq(colaboradores.empresaId, colaborador.empresaId),
          ),
        );
      return { ok: true };
    }),
});
