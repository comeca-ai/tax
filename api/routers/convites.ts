import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createRouter, perfilProcedure, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { convites, usuarios } from "@db/schema";
import {
  conviteAceitarInput,
  conviteCriarInput,
  type Convite,
} from "@contracts/types";
import { hashSenha } from "../auth/password";
import { cookieSessao, criarTokenSessao } from "../auth/session";
import { conviteExpirado, gerarTokenConvite } from "../lib/conviteUtils";
import { enviarConviteEmail } from "../mail/mailer";
import { registrarLog } from "./_shared";

const CONVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

/** Link absoluto de aceite exibido ao admin quando não há SMTP configurado. */
function linkAceite(token: string): string {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  return `${appUrl}/convite/${token}`;
}

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

/** Revoga todos os convites pendentes de um e-mail (re-emissão/substituição). */
async function revogarPendentes(db: ReturnType<typeof getDb>, email: string) {
  await db
    .update(convites)
    .set({ status: "revogado" })
    .where(and(eq(convites.email, email), eq(convites.status, "pendente")));
}

export const convitesRouter = createRouter({
  /** Admin convida um e-mail com um perfil (v1.2.0). */
  criar: perfilProcedure("admin")
    .input(conviteCriarInput)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const email = input.email.trim().toLowerCase();

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

      // Substitui convites pendentes anteriores do mesmo e-mail.
      await revogarPendentes(db, email);

      const token = gerarTokenConvite();
      const expiresAt = new Date(Date.now() + CONVITE_TTL_MS);
      const result = await db.insert(convites).values({
        email,
        perfil: input.perfil,
        token,
        createdById: ctx.usuario.id,
        expiresAt,
      });
      const id = Number(result[0].insertId);

      const link = linkAceite(token);
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

  /** Lista todos os convites, mais recentes primeiro (admin). */
  listar: perfilProcedure("admin").query(async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(convites)
      .orderBy(desc(convites.createdAt), desc(convites.id));
    return rows.map(paraConvite);
  }),

  /** Revoga um convite pendente (admin). */
  revogar: perfilProcedure("admin")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(convites)
        .where(eq(convites.id, input.id))
        .limit(1);
      const convite = rows[0];
      if (!convite) {
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

  /** Reenvia: revoga o atual (se pendente) e cria um novo convite (admin). */
  reenviar: perfilProcedure("admin")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(convites)
        .where(eq(convites.id, input.id))
        .limit(1);
      const atual = rows[0];
      if (!atual) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Convite não encontrado.",
        });
      }
      if (atual.status === "pendente") {
        await db
          .update(convites)
          .set({ status: "revogado" })
          .where(eq(convites.id, atual.id));
      }

      const token = gerarTokenConvite();
      const expiresAt = new Date(Date.now() + CONVITE_TTL_MS);
      const result = await db.insert(convites).values({
        email: atual.email,
        perfil: atual.perfil,
        token,
        createdById: ctx.usuario.id,
        expiresAt,
      });
      const id = Number(result[0].insertId);

      const link = linkAceite(token);
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

      ctx.resHeaders.append("set-cookie", cookieSessao(criarTokenSessao(id)));
      await registrarLog(db, {
        usuarioId: id,
        acao: "convite.aceitar",
        entidade: "convite",
        entidadeId: convite.id,
        detalhes: `${email} (${convite.perfil})`,
      });

      return { id, email, nome, perfil: convite.perfil };
    }),
});
