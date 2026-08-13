import { eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, protectedProcedure, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { cnaesSecundarios, empresas } from "@db/schema";
import { cnpjConsultaInput, empresaInput } from "@contracts/types";
import {
  cnpjValido,
  consultarCnpjReceitaWs,
  somenteDigitos,
} from "../modules/fiscal/cnpj/receitaws";
import { assertEmpresaAcesso, registrarLog } from "./_shared";

/** RF-00: cadastro completo exige CNAE principal, regime tributário e UF. */
function cadastroCompleto(empresa: typeof empresas.$inferSelect): boolean {
  return Boolean(
    empresa.cnaePrincipal && empresa.regimeTributario && empresa.uf,
  );
}

export const empresasRouter = createRouter({
  /** Lista empresas do usuário (admin/revisor veem todas). */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const rows =
      ctx.usuario.perfil === "cliente"
        ? await db
            .select()
            .from(empresas)
            .where(eq(empresas.usuarioId, ctx.usuario.id))
        : await db.select().from(empresas);
    return rows.map((e) => ({ ...e, cadastroCompleto: cadastroCompleto(e) }));
  }),

  /** Detalhe da empresa + CNAEs secundários (RF-00). */
  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const empresa = await assertEmpresaAcesso(ctx, input.id);
      const db = getDb();
      const cnaes = await db
        .select()
        .from(cnaesSecundarios)
        .where(eq(cnaesSecundarios.empresaId, input.id));
      return {
        ...empresa,
        cnaesSecundarios: cnaes.map((c) => c.cnae),
        cadastroCompleto: cadastroCompleto(empresa),
      };
    }),

  /**
   * Consulta de CNPJ na Receita Federal via ReceitaWS (v1.3.0) — prefill do
   * cadastro de empresa. PÚBLICA: também usada no wizard de cadastro (signup),
   * antes do usuário ter conta. Dados de CNPJ são públicos por natureza; o
   * custo de abuso é limitado à cota do plano gratuito (3 req/min).
   * Requer RECEITAWS_TOKEN no ambiente.
   */
  consultarCnpj: publicQuery
    .input(cnpjConsultaInput)
    .mutation(async ({ input, ctx }) => {
      if (!process.env.RECEITAWS_TOKEN) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Consulta automática de CNPJ não configurada neste ambiente (RECEITAWS_TOKEN ausente).",
        });
      }

      const digitos = somenteDigitos(input.cnpj);
      if (digitos.length !== 14 || !cnpjValido(digitos)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CNPJ inválido." });
      }

      const dados = await consultarCnpjReceitaWs(digitos);

      const db = getDb();
      await registrarLog(db, {
        usuarioId: ctx.usuario?.id ?? null,
        acao: "empresa.consultar_cnpj",
        entidade: "cnpj",
        detalhes: `CNPJ ${dados.cnpj} — ${dados.razaoSocial} (${dados.situacao})`,
      });

      return dados;
    }),

  /** Cadastro de empresa (RF-00). */
  create: protectedProcedure
    .input(empresaInput)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const result = await db.insert(empresas).values({
        usuarioId: ctx.usuario.id,
        razaoSocial: input.razaoSocial,
        cnpj: input.cnpj,
        cnaePrincipal: input.cnaePrincipal,
        regimeTributario: input.regimeTributario,
        uf: input.uf,
      });
      const id = Number(result[0].insertId);

      if (input.cnaesSecundarios.length > 0) {
        await db.insert(cnaesSecundarios).values(
          input.cnaesSecundarios.map((cnae) => ({ empresaId: id, cnae })),
        );
      }

      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        empresaId: id,
        acao: "empresa.create",
        entidade: "empresa",
        entidadeId: id,
        detalhes: `CNAE ${input.cnaePrincipal}, regime ${input.regimeTributario}, UF ${input.uf}, LGPD ${input.aceiteLgpd ? "aceito" : "n/a"}, poderes ${input.declaracaoPoderes ? "declarados" : "n/a"}`,
      });

      return { id, cadastroCompleto: true };
    }),

  /** Atualização de dados cadastrais (RF-00). */
  update: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), dados: empresaInput }))
    .mutation(async ({ input, ctx }) => {
      await assertEmpresaAcesso(ctx, input.id);
      const db = getDb();
      await db
        .update(empresas)
        .set({
          razaoSocial: input.dados.razaoSocial,
          cnpj: input.dados.cnpj,
          cnaePrincipal: input.dados.cnaePrincipal,
          regimeTributario: input.dados.regimeTributario,
          uf: input.dados.uf,
        })
        .where(eq(empresas.id, input.id));

      await db
        .delete(cnaesSecundarios)
        .where(eq(cnaesSecundarios.empresaId, input.id));
      if (input.dados.cnaesSecundarios.length > 0) {
        await db.insert(cnaesSecundarios).values(
          input.dados.cnaesSecundarios.map((cnae) => ({
            empresaId: input.id,
            cnae,
          })),
        );
      }

      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        empresaId: input.id,
        acao: "empresa.update",
        entidade: "empresa",
        entidadeId: input.id,
      });

      return { ok: true, cadastroCompleto: true };
    }),
});
