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
import { consolidarRegras } from "../modules/reembolso/policy/derivar";
import { LIMITE_TEXTO_EXTRAIDO_BYTES, truncarUtf8 } from "../modules/reembolso/policy/texto";
import { avaliarDespesa } from "../modules/reembolso/policy/agent";
import {
  POLITICA_ATIVA_IMUTAVEL,
  politicaEditavel,
} from "../modules/reembolso/policy/versao";
import { assertAdminDaEmpresa, assertEmpresaAcesso, registrarLog } from "./_shared";

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
        // Trunca por bytes UTF-8: a coluna TEXT (65 535 B) nunca estoura,
        // mesmo que um provider não trunque na extração.
        textoExtraido:
          extracao.textoExtraido === null
            ? null
            : truncarUtf8(extracao.textoExtraido, LIMITE_TEXTO_EXTRAIDO_BYTES),
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

  /**
   * Política completa (regras, textoExtraido, camposPendentes). As regras saem
   * CONSOLIDADAS: a tela precisa ver exatamente os parâmetros que o agente aplica —
   * devolver o JSON cru mostrava tetos que o motor não usava (v1.8).
   */
  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const politica = await buscarPoliticaOuFalhar(input.id);
      await assertEmpresaAcesso(ctx, politica.empresaId);
      return {
        ...politica,
        regras: consolidarRegras(regrasPoliticaSchema.parse(politica.regras ?? {})),
      };
    }),

  /**
   * Clona uma política como RASCUNHO — é assim que se edita a política em vigor (RF-07).
   * A versão ativa continua valendo, com as regras que decidiram cada despesa até aqui;
   * a cópia só passa a valer no "Ativar política", que atribui a versão nova.
   */
  duplicar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const politica = await buscarPoliticaOuFalhar(input.id);
      await assertAdminDaEmpresa(ctx, politica.empresaId);
      const db = getDb();

      const result = await db.insert(politicasReembolso).values({
        empresaId: politica.empresaId,
        arquivoNome: politica.arquivoNome,
        arquivoPath: politica.arquivoPath,
        textoExtraido: politica.textoExtraido,
        regras: regrasPoliticaSchema.parse(politica.regras ?? {}),
        status: "rascunho",
        // Rascunho não tem versão: `ativar` atribui max(versao)+1 na ativação.
        versao: 1,
        confiancaExtracao: politica.confiancaExtracao,
        camposPendentes: (politica.camposPendentes as string[] | null) ?? [],
        createdById: ctx.usuario.id,
      });
      const politicaId = Number(result[0].insertId);

      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        empresaId: politica.empresaId,
        acao: "politica.duplicar",
        entidade: "politica_reembolso",
        entidadeId: politicaId,
        detalhes: `Rascunho criado a partir da política ${politica.id} (v${politica.versao}, ${politica.status}).`,
      });

      return { politicaId };
    }),

  /** Edição manual das regras extraídas (preenchimento assistido). */
  updateRegras: protectedProcedure
    .input(politicaUpdateRegrasInput)
    .mutation(async ({ input, ctx }) => {
      const politica = await buscarPoliticaOuFalhar(input.id);
      // Editar regra é declarar o que o agente pode aprovar ou negar sozinho: só o
      // admin da empresa (ou o suporte da plataforma) decide isso (P-4, v1.8).
      await assertAdminDaEmpresa(ctx, politica.empresaId);
      // RF-07: a política em vigor é imutável. Gravar em cima dela fazia as marcações
      // valerem no "Salvar regras" — antes do simulador, antes de "Ativar política" — e
      // duas configurações diferentes conviviam sob a mesma versão, sem que
      // `politicaVersaoAplicada` identificasse qual regra decidiu o quê.
      if (!politicaEditavel(politica.status)) {
        throw new TRPCError({ code: "CONFLICT", message: POLITICA_ATIVA_IMUTAVEL });
      }
      const db = getDb();
      // Limites, exigências e tetos nascem das regras extraídas (servidor é a fonte).
      // "edicao": lista vazia é declaração do gestor — apagar tudo zera os parâmetros.
      const regras = consolidarRegras(input.regras, "edicao");

      await db
        .update(politicasReembolso)
        .set({ regras, camposPendentes: [] })
        .where(eq(politicasReembolso.id, politica.id));

      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        empresaId: politica.empresaId,
        acao: "politica.update_regras",
        entidade: "politica_reembolso",
        entidadeId: politica.id,
        detalhes: `Regras editadas manualmente (${regras.regrasExtraidas.length} regras extraídas).`,
      });

      return { ok: true, regras };
    }),

  /**
   * Ativa a política em transação: inativa as demais da mesma empresa e
   * versiona como max(versao)+1 — apenas UMA política ativa por empresa.
   */
  ativar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const politica = await buscarPoliticaOuFalhar(input.id);
      // Ativar é o gesto que põe as marcações em vigor — mesmo portão do updateRegras.
      await assertAdminDaEmpresa(ctx, politica.empresaId);
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
          .set({
            status: "ativa",
            versao: novaVersao,
            regras: consolidarRegras(regrasPoliticaSchema.parse(politica.regras ?? {})),
          })
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
      // Suspender a avaliação automática é decisão sobre a empresa, não operação de
      // revisão: mesmo portão do updateRegras e do ativar (P-4, v1.8).
      await assertAdminDaEmpresa(ctx, politica.empresaId);
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
      const politica = rows[0];
      if (!politica) return null;
      // Consolidado: o card da política ativa e o motor precisam dizer a mesma coisa.
      return {
        ...politica,
        regras: consolidarRegras(regrasPoliticaSchema.parse(politica.regras ?? {})),
      };
    }),

  /**
   * Dry-run do agente avaliador — não grava nada.
   * Sem `politicaId`, simula a política ATIVA da empresa (playground da tela de status);
   * com `politicaId`, simula aquela política, inclusive rascunho: o passo 3 manda o
   * gestor "testar antes de ativar" e devolvia o veredito da versão antiga, o que fazia
   * a marcação recém-salva parecer sem efeito (v1.8).
   * Nenhuma política aplicável → { politicaAtiva: false, resultado: null }.
   */
  testar: protectedProcedure
    .input(politicaTestarInput)
    .mutation(async ({ input, ctx }) => {
      await assertEmpresaAcesso(ctx, input.empresaId);
      const db = getDb();
      let politica: typeof politicasReembolso.$inferSelect | undefined;
      if (input.politicaId !== undefined) {
        // Mesmo portão de acesso do `get`: a política precisa ser da empresa simulada.
        const alvo = await buscarPoliticaOuFalhar(input.politicaId);
        await assertEmpresaAcesso(ctx, alvo.empresaId);
        if (alvo.empresaId !== input.empresaId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Política não encontrada." });
        }
        politica = alvo;
      } else {
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
        politica = rows[0];
      }
      if (!politica) {
        return {
          politicaAtiva: false as const,
          versao: null,
          resultado: null as ResultadoPolitica | null,
        };
      }

      const regras = consolidarRegras(regrasPoliticaSchema.parse(politica.regras ?? {}));
      const resultado = avaliarDespesa(
        { categoria: input.categoria, valorNota: input.valorNota },
        regras,
        { temVeiculo: input.temVeiculo, temEvidencia: input.temEvidencia },
      );

      return {
        politicaAtiva: true as const,
        // Rascunho não tem versão (todos nascem "1"): mostrar "política v1" no veredito
        // do passo 3 apontaria para uma versão que não é a simulada.
        versao: politica.status === "ativa" ? politica.versao : null,
        resultado,
      };
    }),
});
