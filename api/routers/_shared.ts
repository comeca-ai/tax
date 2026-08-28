import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { colaboradores, empresas, logAuditoria } from "@db/schema";
import type { TrpcContext } from "../context";

type Db = ReturnType<typeof getDb>;

/**
 * O usuário é colaborador ativo desta empresa? (v1.9.1)
 *
 * O vínculo nasce quando ele aceita o convite: `convites.aceitar` preenche
 * `colaboradores.usuarioId`. É o que dá ao convidado acesso à empresa que o
 * convidou — sem isso ele entra no painel e não enxerga nada.
 */
async function ehColaboradorDaEmpresa(
  usuarioId: number,
  empresaId: number,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: colaboradores.id })
    .from(colaboradores)
    .where(
      and(
        eq(colaboradores.usuarioId, usuarioId),
        eq(colaboradores.empresaId, empresaId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Garante que o usuário tem acesso à empresa:
 * - admin/revisor: acesso a qualquer empresa
 * - cliente: empresas próprias e aquelas em que é colaborador (v1.9.1)
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
    empresa.usuarioId !== ctx.usuario.id &&
    !(await ehColaboradorDaEmpresa(ctx.usuario.id, empresa.id))
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
  mensagem = "Só o administrador da empresa pode alterar as regras e ativar a política de reembolso.",
): Promise<typeof empresas.$inferSelect> {
  const empresa = await assertEmpresaAcesso(ctx, empresaId);
  const ehAdminDaPlataforma = ctx.usuario?.perfil === "admin";
  const ehAdminDaEmpresa = empresa.usuarioId === ctx.usuario?.id;
  if (!ehAdminDaPlataforma && !ehAdminDaEmpresa) {
    throw new TRPCError({ code: "FORBIDDEN", message: mensagem });
  }
  return empresa;
}

/**
 * O usuário criou alguma empresa? (v1.9.1)
 *
 * É o que faz dele "admin da empresa" em `assertAdminDaEmpresa` — aqui sem
 * empresa alvo, para responder "esta sessão pode gerenciar equipe?".
 */
export async function ehAdminDeAlgumaEmpresa(usuarioId: number): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: empresas.id })
    .from(empresas)
    .where(eq(empresas.usuarioId, usuarioId))
    .limit(1);
  return rows.length > 0;
}

/** RF-04: trilha imutável — apenas INSERT, nunca UPDATE/DELETE. */
export async function registrarLog(
  // Pick (e não Db) para aceitar também a transação do registroComEmpresa —
  // o log precisa rolar junto com a gravação que ele audita (v1.9.2).
  db: Pick<Db, "insert">,
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
