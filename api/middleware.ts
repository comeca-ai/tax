import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import type { Perfil } from "@contracts/types";
import { podeGerenciarEquipe } from "@contracts/permissoes";
import { ehAdminDeAlgumaEmpresa } from "./routers/_shared";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

/** Exige sessão autenticada. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.usuario) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Autenticação necessária.",
    });
  }
  return next({ ctx: { ...ctx, usuario: ctx.usuario } });
});

/** Exige um dos perfis informados (ex.: admin, revisor). */
export function perfilProcedure(...perfis: Perfil[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!perfis.includes(ctx.usuario.perfil)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Perfil sem permissão para esta operação.",
      });
    }
    return next({ ctx });
  });
}

/**
 * Área Equipe (v1.9.1): admin da plataforma OU admin de alguma empresa —
 * quem criou a empresa administra a equipe dela. Ver `@contracts/permissoes`.
 */
export const equipeProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const ehAdminDeEmpresa = await ehAdminDeAlgumaEmpresa(ctx.usuario.id);
  if (!podeGerenciarEquipe({ perfil: ctx.usuario.perfil, ehAdminDeEmpresa })) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Só o administrador da empresa gerencia a equipe. Cadastre sua empresa para convidar pessoas.",
    });
  }
  return next({ ctx });
});
