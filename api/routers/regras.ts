import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createRouter, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { logAuditoria, regrasElegibilidade } from "@db/schema";
import { CATEGORIAS_DESPESA } from "@contracts/types";
import { assertEmpresaAcesso } from "./_shared";

/** Visualização da matriz de elegibilidade e base legal (RF-02/RF-07). */
export const regrasRouter = createRouter({
  /** Lista a matriz completa de regras (com vigências e versões). */
  matriz: protectedProcedure.query(async () => {
    const db = getDb();
    return db
      .select()
      .from(regrasElegibilidade)
      .orderBy(regrasElegibilidade.cnaePadrao, regrasElegibilidade.categoria);
  }),

  /** Regras vigentes em uma data (RF-07) — útil para simulação. */
  vigentes: protectedProcedure
    .input(
      z.object({
        data: z.string(), // ISO yyyy-mm-dd
        categoria: z.enum(CATEGORIAS_DESPESA).optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(regrasElegibilidade);
      return rows.filter(
        (r) =>
          r.vigenciaInicio <= input.data &&
          (!r.vigenciaFim || r.vigenciaFim >= input.data) &&
          (!input.categoria || r.categoria === input.categoria),
      );
    }),

  /** Trilha de auditoria da empresa (RF-04 — log imutável). */
  auditoria: protectedProcedure
    .input(
      z.object({
        empresaId: z.number().int().positive(),
        limite: z.number().int().min(1).max(500).default(100),
      }),
    )
    .query(async ({ input, ctx }) => {
      await assertEmpresaAcesso(ctx, input.empresaId);
      const db = getDb();
      return db
        .select()
        .from(logAuditoria)
        .where(eq(logAuditoria.empresaId, input.empresaId))
        .orderBy(desc(logAuditoria.createdAt))
        .limit(input.limite);
    }),
});
