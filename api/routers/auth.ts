import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createRouter, protectedProcedure, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { cnaesSecundarios, empresas, resetsSenha, usuarios } from "@db/schema";
import { loginInput, registroComEmpresaInput, registroInput } from "@contracts/types";
import { podeGerenciarEquipe } from "@contracts/permissoes";
import { hashSenha, verificarSenha } from "../auth/password";
import { gerarTokenConvite } from "../lib/conviteUtils";
import { enviarResetSenhaEmail } from "../mail/mailer";

const RESET_TTL_MS = 1000 * 60 * 60; // 1 hora
import {
  cookieLimparSessao,
  cookieSessao,
  criarTokenSessao,
  requisicaoSegura,
} from "../auth/session";
import { ehAdminDeAlgumaEmpresa, registrarLog } from "./_shared";

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

      ctx.resHeaders.append(
        "set-cookie",
        cookieSessao(criarTokenSessao(id), requisicaoSegura(ctx.req)),
      );
      await registrarLog(db, {
        usuarioId: id,
        acao: "usuario.registro",
        entidade: "usuario",
        entidadeId: id,
      });

      // Conta recém-criada ainda não tem empresa — a área Equipe abre depois
      // que ele cadastrar a empresa (v1.9.1).
      return {
        id,
        email,
        nome: input.nome.trim(),
        perfil,
        podeGerenciarEquipe: false,
      };
    }),

  /**
   * Wizard de cadastro: conta + empresa numa transação só (v1.9.2). Antes
   * eram duas chamadas (registro depois empresas.create) — quando a segunda
   * falhava, a conta ficava órfã. Agora: ou grava os dois, ou nenhum.
   * O `registro` simples continua para quem cria conta sem empresa (ex.:
   * convite de colaborador cria a conta em convites.aceitar).
   */
  registroComEmpresa: publicQuery
    .input(registroComEmpresaInput)
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

      const total = await db.select({ id: usuarios.id }).from(usuarios).limit(1);
      const perfil = total.length === 0 ? ("admin" as const) : ("cliente" as const);

      const senhaHash = await hashSenha(input.senha);

      const { id, empresaId } = await db.transaction(async (tx) => {
        const rUsuario = await tx.insert(usuarios).values({
          email,
          nome: input.nome.trim(),
          senhaHash,
          perfil,
        });
        const id = Number(rUsuario[0].insertId);

        const rEmpresa = await tx.insert(empresas).values({
          usuarioId: id,
          razaoSocial: input.razaoSocial,
          cnpj: input.cnpj,
          cnaePrincipal: input.cnaePrincipal,
          regimeTributario: input.regimeTributario,
          uf: input.uf,
        });
        const empresaId = Number(rEmpresa[0].insertId);

        if (input.cnaesSecundarios.length > 0) {
          await tx.insert(cnaesSecundarios).values(
            input.cnaesSecundarios.map((cnae) => ({ empresaId, cnae })),
          );
        }

        await registrarLog(tx, {
          usuarioId: id,
          acao: "usuario.registro",
          entidade: "usuario",
          entidadeId: id,
        });
        await registrarLog(tx, {
          usuarioId: id,
          empresaId,
          acao: "empresa.create",
          entidade: "empresa",
          entidadeId: empresaId,
          detalhes: `CNAE ${input.cnaePrincipal}, regime ${input.regimeTributario}, UF ${input.uf}, LGPD ${input.aceiteLgpd ? "aceito" : "n/a"}, poderes ${input.declaracaoPoderes ? "declarados" : "n/a"}`,
        });

        return { id, empresaId };
      });

      ctx.resHeaders.append(
        "set-cookie",
        cookieSessao(criarTokenSessao(id), requisicaoSegura(ctx.req)),
      );

      // Acabou de criar a própria empresa — já é admin dela (v1.9.1).
      return {
        id,
        email,
        nome: input.nome.trim(),
        perfil,
        podeGerenciarEquipe: true,
        empresa: { id: empresaId, cadastroCompleto: true },
      };
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
      cookieSessao(criarTokenSessao(usuario.id), requisicaoSegura(ctx.req)),
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
      podeGerenciarEquipe: podeGerenciarEquipe({
        perfil: usuario.perfil,
        ehAdminDeEmpresa: await ehAdminDeAlgumaEmpresa(usuario.id),
      }),
    };
  }),

  /** Encerra a sessão (limpa cookie). */
  logout: publicQuery.mutation(({ ctx }) => {
    ctx.resHeaders.append("set-cookie", cookieLimparSessao());
    return { ok: true };
  }),

  /** Sessão atual (null quando não autenticado) + o que ela pode fazer. */
  me: publicQuery.query(async ({ ctx }) => {
    if (!ctx.usuario) return null;
    return {
      ...ctx.usuario,
      podeGerenciarEquipe: podeGerenciarEquipe({
        perfil: ctx.usuario.perfil,
        ehAdminDeEmpresa: await ehAdminDeAlgumaEmpresa(ctx.usuario.id),
      }),
    };
  }),

  /**
   * Solicita redefinição de senha (v1.6.1). Resposta é SEMPRE a mesma,
   * existindo ou não o e-mail — não vaza quem tem conta. Sem SMTP, o link
   * vai para o log do servidor (admin recupera por lá), nunca para o cliente.
   */
  solicitarResetSenha: publicQuery
    .input(z.object({ email: z.string().trim().email().max(255) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const email = input.email.trim().toLowerCase();
      const rows = await db
        .select({ id: usuarios.id })
        .from(usuarios)
        .where(eq(usuarios.email, email))
        .limit(1);
      if (rows.length === 0) return { ok: true };

      const token = gerarTokenConvite();
      const expiresAt = new Date(Date.now() + RESET_TTL_MS);
      await db.insert(resetsSenha).values({ email, token, expiresAt });

      const appUrl = process.env.APP_URL || "http://localhost:3000";
      const link = `${appUrl}/redefinir-senha/${token}`;
      const { enviado } = await enviarResetSenhaEmail({ para: email, link });
      if (!enviado) {
        console.log(`[auth] Reset de senha para ${email} (SMTP indisponível): ${link}`);
      }
      return { ok: true };
    }),

  /** Redefine a senha com token válido, não usado e não expirado (v1.6.1). */
  redefinirSenha: publicQuery
    .input(
      z.object({
        token: z.string().trim().min(20).max(128),
        novaSenha: z.string().min(8, "A senha tem no mínimo 8 caracteres").max(128),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(resetsSenha)
        .where(eq(resetsSenha.token, input.token))
        .limit(1);
      const reset = rows[0];
      const invalido =
        !reset || reset.usedAt !== null || reset.expiresAt.getTime() < Date.now();
      if (invalido) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Link inválido ou expirado. Solicite uma nova redefinição.",
        });
      }

      await db
        .update(usuarios)
        .set({ senhaHash: await hashSenha(input.novaSenha) })
        .where(eq(usuarios.email, reset.email));
      await db
        .update(resetsSenha)
        .set({ usedAt: new Date() })
        .where(eq(resetsSenha.id, reset.id));

      await registrarLog(db, {
        acao: "usuario.redefinir_senha",
        entidade: "usuarios",
        detalhes: `Senha redefinida para ${reset.email}`,
      });
      return { ok: true };
    }),

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
