import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { createRouter, equipeProcedure, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { colaboradores, convites, usuarios } from "@db/schema";
import {
  conviteAceitarInput,
  conviteCriarInput,
  type Convite,
} from "@contracts/types";
import { perfisConvidaveis } from "@contracts/permissoes";
import { hashSenha } from "../auth/password";
import { cookieSessao, criarTokenSessao, requisicaoSegura } from "../auth/session";
import { conviteExpirado } from "../lib/conviteUtils";
import { emitirConviteAcesso } from "../lib/conviteAcesso";
import { enviarConviteEmail } from "../mail/mailer";
import { registrarLog } from "./_shared";

function paraConvite(row: typeof convites.$inferSelect): Convite {
  return {
    id: row.id,
    email: row.email,
    perfil: row.perfil,
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

/**
 * Quem não é admin da plataforma só mexe no convite que ele mesmo enviou —
 * responder NOT_FOUND, e não FORBIDDEN, não confirma que o id existe (v1.9.1).
 */
function podeMexer(
  ctx: { usuario: { id: number; perfil: string } },
  convite: typeof convites.$inferSelect,
): boolean {
  return ctx.usuario.perfil === "admin" || convite.createdById === ctx.usuario.id;
}

export const convitesRouter = createRouter({
  /**
   * Admin da plataforma ou da empresa convida um e-mail com um perfil
   * (v1.2.0; aberto ao admin da empresa na v1.9.1).
   */
  criar: equipeProcedure
    .input(conviteCriarInput)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const email = input.email.trim().toLowerCase();

      // `admin` e `revisor` alcançam todas as empresas — só a plataforma concede.
      if (!perfisConvidaveis(ctx.usuario.perfil).includes(input.perfil)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Você pode convidar pessoas como Cliente. Perfis da plataforma são concedidos pelo suporte.",
        });
      }

      const existente = await db
        .select({ id: usuarios.id })
        .from(usuarios)
        .where(eq(usuarios.email, email))
        .limit(1);
      if (existente.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "E-mail já possui conta.",
        });
      }

      const { id, link } = await emitirConviteAcesso(db, {
        email,
        perfil: input.perfil,
        createdById: ctx.usuario.id,
      });
      const { enviado } = await enviarConviteEmail({
        para: email,
        link,
        perfil: input.perfil,
      });

      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        acao: "convite.criar",
        entidade: "convite",
        entidadeId: id,
        detalhes: `${email} (${input.perfil})`,
      });

      const rows = await db
        .select()
        .from(convites)
        .where(eq(convites.id, id))
        .limit(1);
      return {
        ...paraConvite(rows[0]),
        ...(enviado ? {} : { linkAceite: link }),
        enviadoPorEmail: enviado,
      };
    }),

  /**
   * Convites mais recentes primeiro. O admin da plataforma vê todos; o admin
   * da empresa vê só os que ele mesmo enviou — a lista traz e-mail de pessoa
   * convidada por outra empresa (v1.9.1).
   */
  listar: equipeProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const base = db.select().from(convites);
    const rows = await (ctx.usuario.perfil === "admin"
      ? base
      : base.where(eq(convites.createdById, ctx.usuario.id))
    ).orderBy(desc(convites.createdAt), desc(convites.id));
    return rows.map(paraConvite);
  }),

  /** Revoga um convite pendente (o próprio, se não for admin da plataforma). */
  revogar: equipeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(convites)
        .where(eq(convites.id, input.id))
        .limit(1);
      const convite = rows[0];
      if (!convite || !podeMexer(ctx, convite)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Convite não encontrado.",
        });
      }
      if (convite.status !== "pendente") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Convite não está pendente.",
        });
      }
      await db
        .update(convites)
        .set({ status: "revogado" })
        .where(eq(convites.id, convite.id));
      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        acao: "convite.revogar",
        entidade: "convite",
        entidadeId: convite.id,
        detalhes: convite.email,
      });
      return { ok: true };
    }),

  /** Reenvia: revoga o atual (se pendente) e cria um novo convite. */
  reenviar: equipeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(convites)
        .where(eq(convites.id, input.id))
        .limit(1);
      const atual = rows[0];
      if (!atual || !podeMexer(ctx, atual)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Convite não encontrado.",
        });
      }
      const { id, link } = await emitirConviteAcesso(db, {
        email: atual.email,
        perfil: atual.perfil,
        createdById: ctx.usuario.id,
      });
      const { enviado } = await enviarConviteEmail({
        para: atual.email,
        link,
        perfil: atual.perfil,
      });

      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        acao: "convite.reenviar",
        entidade: "convite",
        entidadeId: id,
        detalhes: `${atual.email} (anterior #${atual.id})`,
      });

      const novo = await db
        .select()
        .from(convites)
        .where(eq(convites.id, id))
        .limit(1);
      return {
        ...paraConvite(novo[0]),
        ...(enviado ? {} : { linkAceite: link }),
        enviadoPorEmail: enviado,
      };
    }),

  /** Dados públicos do convite (tela de aceite) — expõe só o essencial. */
  porToken: publicQuery
    .input(z.object({ token: z.string().min(16).max(128) }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(convites)
        .where(eq(convites.token, input.token))
        .limit(1);
      const convite = rows[0];
      if (!convite || convite.status !== "pendente") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Convite inválido ou já utilizado.",
        });
      }
      return {
        email: convite.email,
        perfil: convite.perfil,
        expirado: conviteExpirado(convite.expiresAt),
      };
    }),

  /** Aceite do convite: cria o usuário com o perfil convidado e inicia sessão. */
  aceitar: publicQuery
    .input(conviteAceitarInput)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(convites)
        .where(eq(convites.token, input.token))
        .limit(1);
      const convite = rows[0];
      if (!convite || convite.status !== "pendente") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Convite inválido ou já utilizado.",
        });
      }
      if (conviteExpirado(convite.expiresAt)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Convite expirado — peça um novo convite ao administrador.",
        });
      }

      const email = convite.email;
      const existente = await db
        .select({ id: usuarios.id })
        .from(usuarios)
        .where(eq(usuarios.email, email))
        .limit(1);
      if (existente.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "E-mail já possui conta — faça login.",
        });
      }

      const nome = input.nome.trim();
      const senhaHash = await hashSenha(input.senha);
      const result = await db.insert(usuarios).values({
        email,
        nome,
        senhaHash,
        perfil: convite.perfil,
      });
      const id = Number(result[0].insertId);

      await db
        .update(convites)
        .set({ status: "aceito", acceptedAt: new Date() })
        .where(eq(convites.id, convite.id));

      // Convite de colaborador (v1.9.1): a ficha da pessoa na empresa já existe,
      // só faltava a conta. O e-mail é a chave — é por ele que o convite foi
      // emitido. Só preenche ficha ainda sem usuário, nunca rouba vínculo.
      await db
        .update(colaboradores)
        .set({ usuarioId: id, statusAtivacao: "confirmado" })
        .where(
          and(eq(colaboradores.email, email), isNull(colaboradores.usuarioId)),
        );

      ctx.resHeaders.append(
        "set-cookie",
        cookieSessao(criarTokenSessao(id), requisicaoSegura(ctx.req)),
      );
      await registrarLog(db, {
        usuarioId: id,
        acao: "convite.aceitar",
        entidade: "convite",
        entidadeId: convite.id,
        detalhes: `${email} (${convite.perfil})`,
      });

      // Conta nova, sem empresa: a área Equipe só abre depois que ela cadastrar
      // a própria empresa (v1.9.1).
      return { id, email, nome, perfil: convite.perfil, podeGerenciarEquipe: false };
    }),
});
