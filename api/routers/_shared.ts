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

/**
 * Garante que o usuário pode DECIDIR sobre a empresa — não só operá-la (v1.8).
 * Mais restrita que `assertEmpresaAcesso`, para o que autoriza gasto automático:
 * marcar `decisaoAutomatica` numa regra e ativar a política.
 *
 * Passa quem é:
 *  - **admin da empresa**: o usuário que criou a conta da empresa (`empresas.usuarioId`).
 *    Decisão do dono (24/08): quem cria a conta é o admin daquela empresa e é ele quem
 *    define o que o agente aprova sozinho;
 *  - **admin da plataforma** (`usuarios.perfil === "admin"`): suporte.
 *
 * Barra o `revisor`, que existe para revisar despesa e passava em qualquer empresa —
 * redefinir o que o agente aprova sozinho nunca foi papel dele.
 */
export async function assertAdminDaEmpresa(
  ctx: TrpcContext,
  empresaId: number,
): Promise<typeof empresas.$inferSelect> {
  const empresa = await assertEmpresaAcesso(ctx, empresaId);
  const ehAdminDaPlataforma = ctx.usuario?.perfil === "admin";
  const ehAdminDaEmpresa = empresa.usuarioId === ctx.usuario?.id;
  if (!ehAdminDaPlataforma && !ehAdminDaEmpresa) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Só o administrador da empresa pode alterar as regras e ativar a política de reembolso.",
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
