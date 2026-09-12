import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createRouter, perfilProcedure, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { colaboradores } from "@db/schema";
import { assertAdminDaEmpresa, assertEmpresaAcesso, registrarLog } from "./_shared";
import { normalizarTelefone } from "../modules/reembolso/agente";
import { emitirConviteAcesso } from "../lib/conviteAcesso";
import { enviarConviteColaboradorEmail } from "../mail/mailer";
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
      await assertAdminDaEmpresa(ctx, input.empresaId, MSG_SO_ADMIN);

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
   * v1.9.1). O WhatsApp está fora — o canal é o E-MAIL: emite um convite de
   * acesso ao painel e manda o link de aceite. Sem SMTP, devolve o link para
   * o admin copiar e mandar por onde quiser.
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
      const empresa = await assertAdminDaEmpresa(ctx, colaborador.empresaId, MSG_SO_ADMIN);
      if (!colaborador.email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cadastre o e-mail do colaborador antes de enviar o convite.",
        });
      }
      if (colaborador.usuarioId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Este colaborador já ativou o acesso dele.",
        });
      }

      const { link } = await emitirConviteAcesso(db, {
        email: colaborador.email,
        perfil: "cliente",
        createdById: ctx.usuario.id,
      });
      const { enviado } = await enviarConviteColaboradorEmail({
        para: colaborador.email,
        nome: colaborador.nome,
        empresa: empresa.razaoSocial,
        link,
      });

      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        empresaId: colaborador.empresaId,
        acao: "colaborador.convite",
        entidade: "colaboradores",
        entidadeId: colaborador.id,
        detalhes: enviado
          ? `Convite enviado por e-mail para ${colaborador.email}`
          : "Link de convite gerado para envio manual (SMTP indisponível)",
      });

      return { linkAceite: link, enviadoPorEmail: enviado, email: colaborador.email };
    }),
});
