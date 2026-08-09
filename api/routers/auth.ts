import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createRouter, protectedProcedure, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { usuarios } from "@db/schema";
import { loginInput, registroInput } from "@contracts/types";
import { hashSenha, verificarSenha } from "../auth/password";
import {
  cookieLimparSessao,
  cookieSessao,
  criarTokenSessao,
} from "../auth/session";
import { registrarLog } from "./_shared";

export const authRouter = createRouter({
  /** Cadastro de usuário (perfil padrão: cliente). */
  registro: publicQuery
    .input(registroInput)
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
          message: "E-mail já cadastrado.",
        });
      }

      // primeiro usuário da plataforma vira admin (v1.2.0); os demais entram
      // como cliente (ou via convite, com o perfil definido pelo admin).
      const total = await db
        .select({ id: usuarios.id })
        .from(usuarios)
        .limit(1);
      const perfil = total.length === 0 ? ("admin" as const) : ("cliente" as const);

      const senhaHash = await hashSenha(input.senha);
      const result = await db.insert(usuarios).values({
        email,
        nome: input.nome.trim(),
        senhaHash,
        perfil,
      });
      const id = Number(result[0].insertId);

      ctx.resHeaders.append("set-cookie", cookieSessao(criarTokenSessao(id)));
      await registrarLog(db, {
        usuarioId: id,
        acao: "usuario.registro",
        entidade: "usuario",
        entidadeId: id,
      });

      return { id, email, nome: input.nome.trim(), perfil };
    }),

  /** Login email/senha → cookie de sessão HttpOnly. */
  login: publicQuery.input(loginInput).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const email = input.email.trim().toLowerCase();
    const rows = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, email))
      .limit(1);
    const usuario = rows[0];
    if (!usuario || !(await verificarSenha(input.senha, usuario.senhaHash))) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "E-mail ou senha inválidos.",
      });
    }

    ctx.resHeaders.append(
      "set-cookie",
      cookieSessao(criarTokenSessao(usuario.id)),
    );
    await registrarLog(db, {
      usuarioId: usuario.id,
      acao: "usuario.login",
      entidade: "usuario",
      entidadeId: usuario.id,
    });

    return {
      id: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      perfil: usuario.perfil,
    };
  }),

  /** Encerra a sessão (limpa cookie). */
  logout: publicQuery.mutation(({ ctx }) => {
    ctx.resHeaders.append("set-cookie", cookieLimparSessao());
    return { ok: true };
  }),

  /** Sessão atual (null quando não autenticado). */
  me: publicQuery.query(({ ctx }) => ctx.usuario),

  /** Troca de senha (autenticado). */
  trocarSenha: protectedProcedure
    .input(z.object({ senhaAtual: z.string().min(1), novaSenha: z.string().min(8).max(128) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(usuarios)
        .where(eq(usuarios.id, ctx.usuario.id))
        .limit(1);
      const usuario = rows[0];
      if (!usuario || !(await verificarSenha(input.senhaAtual, usuario.senhaHash))) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Senha atual incorreta.",
        });
      }
      await db
        .update(usuarios)
        .set({ senhaHash: await hashSenha(input.novaSenha) })
        .where(eq(usuarios.id, usuario.id));
      await registrarLog(db, {
        usuarioId: usuario.id,
        acao: "usuario.trocar_senha",
        entidade: "usuario",
        entidadeId: usuario.id,
      });
      return { ok: true };
    }),
});
