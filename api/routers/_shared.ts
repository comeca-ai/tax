import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { empresas, logAuditoria } from "@db/schema";
import type { TrpcContext } from "../context";

type Db = ReturnType<typeof getDb>;

/**
 * Garante que o usuário tem acesso à empresa:
 * - admin/revisor: acesso a qualquer empresa
 * - cliente: apenas empresas próprias
 */
export async function assertEmpresaAcesso(
  ctx: TrpcContext,
  empresaId: number,
): Promise<typeof empresas.$inferSelect> {
  const db = getDb();
  const rows = await db
    .select()
    .from(empresas)
    .where(eq(empresas.id, empresaId))
    .limit(1);
  const empresa = rows[0];
  if (!empresa) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada." });
  }
  if (
    ctx.usuario &&
    ctx.usuario.perfil === "cliente" &&
    empresa.usuarioId !== ctx.usuario.id
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sem acesso a esta empresa.",
    });
  }
  return empresa;
}

/** RF-04: trilha imutável — apenas INSERT, nunca UPDATE/DELETE. */
export async function registrarLog(
  db: Db,
  entrada: {
    usuarioId?: number | null;
    empresaId?: number | null;
    acao: string;
    entidade: string;
    entidadeId?: number | null;
    detalhes?: string;
    regraVersao?: string;
  },
): Promise<void> {
  await db.insert(logAuditoria).values({
    usuarioId: entrada.usuarioId ?? null,
    empresaId: entrada.empresaId ?? null,
    acao: entrada.acao,
    entidade: entrada.entidade,
    entidadeId: entrada.entidadeId ?? null,
    detalhes: entrada.detalhes ?? null,
    regraVersao: entrada.regraVersao ?? null,
  });
}
