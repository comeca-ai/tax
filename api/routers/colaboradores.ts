import { dominioAdministrador, exigirDominioConvite } from "../lib/dominioConvite";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createRouter, perfilProcedure, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { colaboradores } from "@db/schema";
import { assertAdminDaEmpresa, assertEmpresaAcesso, registrarLog } from "./_shared";
import { normalizarTelefone } from "../modules/reembolso/agente";
import { enviarConviteColaboradorIdempotente } from "../modules/reembolso/convites/servico";
import { TRPCError } from "@trpc/server";

/** Mesma trava de `assertAdminDaEmpresa`, dita na linguagem desta tela. */
const MSG_SO_ADMIN =
  "Só o administrador da empresa pode gerenciar os colaboradores dela.";

const colaboradorInput = z.object({
  empresaId: z.number().int().positive(),
  nome: z.string().trim().min(3).max(255),
  // v1.9.1: o convite é por e-mail (WhatsApp fora), então o e-mail é
  // obrigatório e o telefone virou dado opcional de contato.
  email: z.string().trim().email().max(255),
  telefone: z
    .string()
    .trim()
    .min(8)
    .max(20)
    .transform((t) => normalizarTelefone(t))
    .optional()
    .or(z.literal("")),
  matricula: z.string().trim().max(50).optional().or(z.literal("")),
  centroCusto: z.string().trim().max(100).optional().or(z.literal("")),
});

/**
 * Colaboradores (v1.5.0) — pessoas que pedem reembolso. Quem cadastra é o
 * administrador da empresa (v1.9.1: antes exigia `perfil === "admin"`, o perfil
 * da plataforma, e por isso nenhum cliente conseguia montar a própria equipe).
 * O colaborador não precisa de login: a jornada dele acontece no WhatsApp
 * (D-002/D-005).
 */
export const colaboradoresRouter = createRouter({
  criar: protectedProcedure
    .input(colaboradorInput)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const empresa = await assertAdminDaEmpresa(ctx, input.empresaId, MSG_SO_ADMIN);
      exigirDominioConvite(input.email, await dominioAdministrador(db, empresa.usuarioId));

      const result = await db.insert(colaboradores).values({
        empresaId: input.empresaId,
        nome: input.nome,
        email: input.email,
        telefone: input.telefone || null,
        matricula: input.matricula || null,
        centroCusto: input.centroCusto || null,
      });
      const id = Number(result[0].insertId);

      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        empresaId: input.empresaId,
        acao: "colaborador.criar",
        entidade: "colaboradores",
        entidadeId: id,
        detalhes: `Colaborador ${input.nome} cadastrado pelo admin da empresa`,
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

  atualizarStatus: protectedProcedure
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
      await assertAdminDaEmpresa(ctx, colaborador.empresaId, MSG_SO_ADMIN);
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

  /**
   * Convite do colaborador (v1.6.0 como isqueiro do WhatsApp; reescrito na
   * v1.9.1). Emite o convite por e-mail e, depois da ação explícita do gestor,
   * envia as boas-vindas via 360dialog se o template estiver configurado. Sem
   * a integração, o gestor recebe um link wa.me manual com o mesmo aceite.
   */
  enviarConvite: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(colaboradores)
        .where(eq(colaboradores.id, input.id))
        .limit(1);
      const colaborador = rows[0];
      if (!colaborador) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
      }
      await assertAdminDaEmpresa(ctx, colaborador.empresaId, MSG_SO_ADMIN);
      return enviarConviteColaboradorIdempotente({ empresaId: colaborador.empresaId, colaboradorId: colaborador.id, usuarioId: ctx.usuario.id });
    }),
});
