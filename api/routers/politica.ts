import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { createRouter, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { politicasReembolso } from "@db/schema";
import {
  politicaTestarInput,
  politicaUpdateRegrasInput,
  politicaUploadInput,
  regrasPoliticaSchema,
  type ResultadoPolitica,
} from "@contracts/types";
import { getPolicyParser } from "../modules/reembolso/policy/parser";
import { avaliarDespesa } from "../modules/reembolso/policy/agent";
import { assertEmpresaAcesso, registrarLog } from "./_shared";

/**
 * Agente de Política de Reembolso (v1.1.0) — CRUD da política por empresa
 * + dry-run do agente avaliador. Apenas UMA política "ativa" por empresa
 * (garantido na transação de ativação).
 */

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "politicas");

function nomeArquivoSeguro(nome: string): string {
  return nome.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(-120);
}

async function buscarPoliticaOuFalhar(id: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(politicasReembolso)
    .where(eq(politicasReembolso.id, id))
    .limit(1);
  const politica = rows[0];
  if (!politica) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Política não encontrada." });
  }
  return politica;
}

export const politicaRouter = createRouter({
  /**
   * Upload do documento da política → parser plugável extrai regras →
   * salva arquivo em uploads/ e registro em status "rascunho".
   */
  upload: protectedProcedure
    .input(politicaUploadInput)
    .mutation(async ({ input, ctx }) => {
      await assertEmpresaAcesso(ctx, input.empresaId);
      const db = getDb();

      const parser = getPolicyParser();
      const extracao = await parser.extract({
        arquivoNome: input.arquivoNome,
        mimeType: input.arquivoMime,
        base64: input.arquivoBase64,
      });

      // Persiste o arquivo original no disco (uploads/)
      let arquivoPath: string | null = null;
      try {
        await mkdir(UPLOADS_DIR, { recursive: true });
        const nomeSeguro = `${input.empresaId}-${Date.now()}-${nomeArquivoSeguro(input.arquivoNome)}`;
        arquivoPath = path.join("uploads", "politicas", nomeSeguro);
        await writeFile(
          path.join(UPLOADS_DIR, nomeSeguro),
          Buffer.from(input.arquivoBase64, "base64"),
        );
      } catch {
        arquivoPath = null; // falha de I/O não bloqueia a extração
      }

      const result = await db.insert(politicasReembolso).values({
        empresaId: input.empresaId,
        arquivoNome: input.arquivoNome,
        arquivoPath,
        textoExtraido: extracao.textoExtraido,
        regras: extracao.regras,
        status: "rascunho",
        versao: 1,
        confiancaExtracao: extracao.confiancaExtracao,
        camposPendentes: extracao.camposPendentes,
        createdById: ctx.usuario.id,
      });
      const politicaId = Number(result[0].insertId);

      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        empresaId: input.empresaId,
        acao: "politica.upload",
        entidade: "politica_reembolso",
        entidadeId: politicaId,
        detalhes: `Parser (${extracao.provedor}): confiança ${extracao.confiancaExtracao}; pendentes: ${extracao.camposPendentes.join(", ") || "nenhum"}`,
      });

      return { politicaId, extracao };
    }),

  /** Lista políticas da empresa (sem textoExtraido). */
  list: protectedProcedure
    .input(z.object({ empresaId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertEmpresaAcesso(ctx, input.empresaId);
      const db = getDb();
      const rows = await db
        .select({
          id: politicasReembolso.id,
          empresaId: politicasReembolso.empresaId,
          arquivoNome: politicasReembolso.arquivoNome,
          arquivoPath: politicasReembolso.arquivoPath,
          regras: politicasReembolso.regras,
          status: politicasReembolso.status,
          versao: politicasReembolso.versao,
          confiancaExtracao: politicasReembolso.confiancaExtracao,
          camposPendentes: politicasReembolso.camposPendentes,
          createdById: politicasReembolso.createdById,
          createdAt: politicasReembolso.createdAt,
          updatedAt: politicasReembolso.updatedAt,
        })
        .from(politicasReembolso)
        .where(eq(politicasReembolso.empresaId, input.empresaId))
        .orderBy(desc(politicasReembolso.createdAt));
      return rows;
    }),

  /** Política completa (regras, textoExtraido, camposPendentes). */
  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const politica = await buscarPoliticaOuFalhar(input.id);
      await assertEmpresaAcesso(ctx, politica.empresaId);
      return politica;
    }),

  /** Edição manual das regras extraídas (preenchimento assistido). */
  updateRegras: protectedProcedure
    .input(politicaUpdateRegrasInput)
    .mutation(async ({ input, ctx }) => {
      const politica = await buscarPoliticaOuFalhar(input.id);
      await assertEmpresaAcesso(ctx, politica.empresaId);
      const db = getDb();

      await db
        .update(politicasReembolso)
        .set({ regras: input.regras, camposPendentes: [] })
        .where(eq(politicasReembolso.id, politica.id));

      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        empresaId: politica.empresaId,
        acao: "politica.update_regras",
        entidade: "politica_reembolso",
        entidadeId: politica.id,
        detalhes: "Regras editadas manualmente (preenchimento assistido).",
      });

      return { ok: true };
    }),

  /**
   * Ativa a política em transação: inativa as demais da mesma empresa e
   * versiona como max(versao)+1 — apenas UMA política ativa por empresa.
   */
  ativar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const politica = await buscarPoliticaOuFalhar(input.id);
      await assertEmpresaAcesso(ctx, politica.empresaId);
      const db = getDb();

      const versao = await db.transaction(async (tx) => {
        const todas = await tx
          .select({ versao: politicasReembolso.versao })
          .from(politicasReembolso)
          .where(eq(politicasReembolso.empresaId, politica.empresaId));
        const novaVersao = Math.max(0, ...todas.map((t) => t.versao)) + 1;

        await tx
          .update(politicasReembolso)
          .set({ status: "inativa" })
          .where(
            and(
              eq(politicasReembolso.empresaId, politica.empresaId),
              ne(politicasReembolso.id, politica.id),
              eq(politicasReembolso.status, "ativa"),
            ),
          );
        await tx
          .update(politicasReembolso)
          .set({ status: "ativa", versao: novaVersao })
          .where(eq(politicasReembolso.id, politica.id));
        return novaVersao;
      });

      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        empresaId: politica.empresaId,
        acao: "politica.ativar",
        entidade: "politica_reembolso",
        entidadeId: politica.id,
        detalhes: `Política ativada na versão ${versao}; demais políticas da empresa inativadas.`,
      });

      return { ok: true, versao };
    }),

  /** Desativa a política (empresa fica sem política ativa → agente não roda). */
  desativar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const politica = await buscarPoliticaOuFalhar(input.id);
      await assertEmpresaAcesso(ctx, politica.empresaId);
      const db = getDb();

      await db
        .update(politicasReembolso)
        .set({ status: "inativa" })
        .where(eq(politicasReembolso.id, politica.id));

      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        empresaId: politica.empresaId,
        acao: "politica.desativar",
        entidade: "politica_reembolso",
        entidadeId: politica.id,
        detalhes: "Política desativada; avaliação automática de despesas suspensa.",
      });

      return { ok: true };
    }),

  /** Política ativa da empresa (ou null). */
  ativa: protectedProcedure
    .input(z.object({ empresaId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertEmpresaAcesso(ctx, input.empresaId);
      const db = getDb();
      const rows = await db
        .select()
        .from(politicasReembolso)
        .where(
          and(
            eq(politicasReembolso.empresaId, input.empresaId),
            eq(politicasReembolso.status, "ativa"),
          ),
        )
        .orderBy(desc(politicasReembolso.versao))
        .limit(1);
      return rows[0] ?? null;
    }),

  /**
   * Dry-run do agente avaliador contra a política ativa — não grava nada.
   * Sem política ativa → { politicaAtiva: false, resultado: null }.
   */
  testar: protectedProcedure
    .input(politicaTestarInput)
    .mutation(async ({ input, ctx }) => {
      await assertEmpresaAcesso(ctx, input.empresaId);
      const db = getDb();
      const rows = await db
        .select()
        .from(politicasReembolso)
        .where(
          and(
            eq(politicasReembolso.empresaId, input.empresaId),
            eq(politicasReembolso.status, "ativa"),
          ),
        )
        .orderBy(desc(politicasReembolso.versao))
        .limit(1);
      const politica = rows[0];
      if (!politica) {
        return {
          politicaAtiva: false as const,
          versao: null,
          resultado: null as ResultadoPolitica | null,
        };
      }

      const regras = regrasPoliticaSchema.parse(politica.regras ?? {});
      const resultado = avaliarDespesa(
        { categoria: input.categoria, valorNota: input.valorNota },
        regras,
        { temVeiculo: input.temVeiculo, temEvidencia: input.temEvidencia },
      );

      return {
        politicaAtiva: true as const,
        versao: politica.versao,
        resultado,
      };
    }),
});
