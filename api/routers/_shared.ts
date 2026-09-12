import { TRPCError } from "@trpc/server";
import { and, eq, or } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { colaboradores, empresas, empresasConfig, logAuditoria } from "@db/schema";
import { podeRevisarDespesas } from "@contracts/permissoes";
import type { PapelRevisao } from "@contracts/types";
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

/**
 * Papel do usuário no fluxo de revisão da empresa (v1.12.0). Lança FORBIDDEN
 * se não participa: a fila e a decisão são do aprovador/analista designado
 * (`empresas_config`), do admin da empresa ou do admin da plataforma — ver
 * `podeRevisarDespesas` em `@contracts/permissoes`.
 *
 * A designação vale enquanto `empresas_config` apontar para o colaborador,
 * mesmo com `status_vinculo = desligado` — a higiene da designação pertence à
 * configuração da empresa; aqui é só leitura.
 */
export async function papelRevisaoNaEmpresa(
  ctx: TrpcContext,
  empresaId: number,
): Promise<{
  empresa: typeof empresas.$inferSelect;
  papel: PapelRevisao;
  aprovadorId: number | null;
  colaboradorDoUsuarioId: number | null;
}> {
  if (!ctx.usuario) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Autenticação necessária." });
  }
  // NOT_FOUND de empresa e FORBIDDEN de vínculo continuam do assert existente.
  const empresa = await assertEmpresaAcesso(ctx, empresaId);

  const db = getDb();
  const configRows = await db
    .select({
      aprovadorId: empresasConfig.aprovadorId,
      analistaId: empresasConfig.analistaId,
    })
    .from(empresasConfig)
    .where(eq(empresasConfig.empresaId, empresaId))
    .limit(1);
  // A 1:1 pode não existir — trata como sem designados (fallback do admin).
  const config = configRows[0] ?? { aprovadorId: null, analistaId: null };

  const colabRows = await db
    .select({ id: colaboradores.id })
    .from(colaboradores)
    .where(
      and(
        eq(colaboradores.usuarioId, ctx.usuario.id),
        eq(colaboradores.empresaId, empresaId),
      ),
    )
    .limit(1);
  const colaboradorDoUsuarioId = colabRows[0]?.id ?? null;

  let aprovadorDesignadoNome: string | null = null;
  if (config.aprovadorId != null) {
    const designado = await db
      .select({ nome: colaboradores.nome })
      .from(colaboradores)
      .where(eq(colaboradores.id, config.aprovadorId))
      .limit(1);
    aprovadorDesignadoNome = designado[0]?.nome ?? null;
  }

  const papel: PapelRevisao = {
    ehAprovadorDesignado:
      colaboradorDoUsuarioId !== null && config.aprovadorId === colaboradorDoUsuarioId,
    ehAnalistaDesignado:
      colaboradorDoUsuarioId !== null && config.analistaId === colaboradorDoUsuarioId,
    ehAdminDaEmpresa: empresa.usuarioId === ctx.usuario.id,
    ehAdminDaPlataforma: ctx.usuario.perfil === "admin",
    temAprovadorDesignado: config.aprovadorId !== null,
    aprovadorDesignadoNome,
  };

  if (
    !podeRevisarDespesas({
      perfil: ctx.usuario.perfil,
      ehAdminDaEmpresa: papel.ehAdminDaEmpresa,
      ehAprovadorDesignado: papel.ehAprovadorDesignado,
      ehAnalistaDesignado: papel.ehAnalistaDesignado,
    })
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "A fila de revisão desta empresa é do aprovador designado ou do administrador dela.",
    });
  }

  return { empresa, papel, aprovadorId: config.aprovadorId, colaboradorDoUsuarioId };
}

/** auth.me: o usuário é aprovador ou analista designado de ALGUMA empresa? */
export async function ehDesignadoDeAlgumaEmpresa(
  usuarioId: number,
): Promise<{ aprovador: boolean; analista: boolean }> {
  const db = getDb();
  const rows = await db
    .select({
      id: colaboradores.id,
      aprovadorId: empresasConfig.aprovadorId,
      analistaId: empresasConfig.analistaId,
    })
    .from(colaboradores)
    .innerJoin(empresasConfig, eq(empresasConfig.empresaId, colaboradores.empresaId))
    .where(
      and(
        eq(colaboradores.usuarioId, usuarioId),
        or(
          eq(empresasConfig.aprovadorId, colaboradores.id),
          eq(empresasConfig.analistaId, colaboradores.id),
        ),
      ),
    );
  return {
    aprovador: rows.some((r) => r.aprovadorId === r.id),
    analista: rows.some((r) => r.analistaId === r.id),
  };
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
