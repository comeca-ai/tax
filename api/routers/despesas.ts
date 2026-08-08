import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createRouter, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import {
  creditosApurados,
  despesas,
  evidenciasDocumentais,
  notasFiscais,
  politicasReembolso,
  regrasElegibilidade,
  veiculos,
} from "@db/schema";
import {
  CATEGORIAS_DESPESA,
  STATUS_DESPESA,
  despesaInput,
  evidenciaInput,
  regrasPoliticaSchema,
  uploadNotaInput,
  type ResultadoPolitica,
  type StatusDespesa,
} from "@contracts/types";
import {
  processarDespesa,
  type RegraVigente,
} from "../engine";
import { getOcrProvider } from "../ocr";
import { avaliarDespesa } from "../policy/agent";
import { assertEmpresaAcesso, registrarLog } from "./_shared";

export const despesasRouter = createRouter({
  /**
   * RF-01: upload da nota fiscal na plataforma → persiste arquivo → OCR.
   * Retorna a extração para revisão dos campos antes de criar a despesa.
   */
  uploadNota: protectedProcedure
    .input(uploadNotaInput)
    .mutation(async ({ input, ctx }) => {
      await assertEmpresaAcesso(ctx, input.empresaId);
      const db = getDb();

      const provider = getOcrProvider();
      const extracao = await provider.extrair({
        arquivoNome: input.arquivoNome,
        arquivoMime: input.arquivoMime,
        arquivoBase64: input.arquivoBase64,
      });

      const result = await db.insert(notasFiscais).values({
        empresaId: input.empresaId,
        cnpjEmitente: extracao.cnpjEmitente,
        cfop: extracao.cfop,
        ncm: extracao.ncm,
        cst: extracao.cst,
        valor: extracao.valor,
        dataFatoGerador: extracao.dataFatoGerador,
        arquivoNome: input.arquivoNome,
        arquivoMime: input.arquivoMime,
        arquivoBase64: input.arquivoBase64,
        origem: "ocr",
      });
      const notaFiscalId = Number(result[0].insertId);

      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        empresaId: input.empresaId,
        acao: "nota.upload",
        entidade: "nota_fiscal",
        entidadeId: notaFiscalId,
        detalhes: `OCR (${extracao.provedor}): confiança ${extracao.confiancaExtracao}; pendentes: ${extracao.camposPendentes.join(", ") || "nenhum"}`,
      });

      return { notaFiscalId, extracao };
    }),

  /**
   * RF-01/RF-02/RF-03: cria a despesa a partir da nota (campos confirmados
   * pelo usuário), roda o motor e persiste créditos apurados + trilha.
   */
  create: protectedProcedure
    .input(despesaInput)
    .mutation(async ({ input, ctx }) => {
      const empresa = await assertEmpresaAcesso(ctx, input.empresaId);
      const db = getDb();

      // RF-00: cadastro incompleto → não processa créditos
      if (!empresa.cnaePrincipal || !empresa.regimeTributario || !empresa.uf) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Cadastro da empresa incompleto (CNAE, regime tributário e UF são obrigatórios). Complete o cadastro antes de processar despesas.",
        });
      }

      const nota = await db
        .select()
        .from(notasFiscais)
        .where(
          and(
            eq(notasFiscais.id, input.notaFiscalId),
            eq(notasFiscais.empresaId, input.empresaId),
          ),
        )
        .limit(1);
      if (!nota[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada." });
      }
      const despesaExistente = await db
        .select({ id: despesas.id })
        .from(despesas)
        .where(eq(despesas.notaFiscalId, input.notaFiscalId))
        .limit(1);
      if (despesaExistente.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Esta nota fiscal já está vinculada a uma despesa.",
        });
      }

      let veiculo: typeof veiculos.$inferSelect | null = null;
      if (input.veiculoId) {
        const rows = await db
          .select()
          .from(veiculos)
          .where(
            and(
              eq(veiculos.id, input.veiculoId),
              eq(veiculos.empresaId, input.empresaId),
            ),
          )
          .limit(1);
        veiculo = rows[0] ?? null;
        if (!veiculo) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Veículo não encontrado." });
        }
      }

      // Atualiza a nota com os campos confirmados pelo usuário
      await db
        .update(notasFiscais)
        .set({
          cnpjEmitente: input.cnpjEmitente ?? nota[0].cnpjEmitente,
          cfop: input.cfop ?? nota[0].cfop,
          ncm: input.ncm ?? nota[0].ncm,
          cst: input.cst ?? nota[0].cst,
          valor: input.valorNota,
          dataFatoGerador: input.dataFatoGerador,
        })
        .where(eq(notasFiscais.id, input.notaFiscalId));

      // RF-07: regras vigentes na data do fato gerador
      const regrasRows = await db.select().from(regrasElegibilidade);
      const regras: RegraVigente[] = regrasRows.map((r) => ({
        cnaePadrao: r.cnaePadrao,
        categoria: r.categoria,
        tributo: r.tributo,
        tipoBeneficio: r.tipoBeneficio,
        confianca: r.confianca,
        aliquota: r.aliquota,
        baseLegal: r.baseLegal,
        vigenciaInicio: r.vigenciaInicio,
        vigenciaFim: r.vigenciaFim,
        versao: r.versao,
      }));

      const resultado = processarDespesa(
        {
          cnaePrincipal: empresa.cnaePrincipal,
          regimeTributario: empresa.regimeTributario,
          uf: empresa.uf,
        },
        {
          categoria: input.categoria,
          valorNota: input.valorNota,
          dataFatoGerador: input.dataFatoGerador,
          litros: input.litros ?? null,
          kmComercial: input.kmComercial,
          kmNaoComercial: input.kmNaoComercial,
        },
        veiculo
          ? {
              kmPorLitroDeclarado: veiculo.kmPorLitroDeclarado,
              tarifaReembolsoKm: veiculo.tarifaReembolsoKm,
            }
          : null,
        regras,
      );

      const memorial = [
        ...resultado.memorialTributos.map((m) => `[${m.tributo}] ${m.formula}`),
        ...resultado.alertas.map((a) => `ALERTA: ${a}`),
      ].join("\n");

      // ── Agente de Política de Reembolso (v1.1.0) ─────────────────────────
      // Camada POSTERIOR e independente do motor tributário: só roda se a
      // empresa tiver política ATIVA. Sem política ativa → comportamento v1.0.0.
      const politicaAtivaRows = await db
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
      const politicaAtiva = politicaAtivaRows[0] ?? null;

      let politicaResultado: ResultadoPolitica | null = null;
      let statusFinal: StatusDespesa = resultado.statusSugerido;
      if (politicaAtiva) {
        const regrasPolitica = regrasPoliticaSchema.parse(politicaAtiva.regras ?? {});
        politicaResultado = avaliarDespesa(
          { categoria: input.categoria, valorNota: input.valorNota },
          regrasPolitica,
          {
            temVeiculo: veiculo !== null,
            // A despesa ainda não existe → impossível ter evidência anexada
            // neste ponto; evidências são anexadas depois (addEvidencia).
            temEvidencia: false,
          },
        );
        if (politicaResultado.decisao === "negado") {
          statusFinal = "rejeitada";
        } else if (politicaResultado.decisao === "revisao_humana") {
          // Revisão humana prevalece mesmo se o motor tributário deu alta
          statusFinal = "em_revisao";
        }
        // "aprovado" → mantém o fluxo do motor tributário
      }

      const insertDespesa = await db.insert(despesas).values({
        empresaId: input.empresaId,
        notaFiscalId: input.notaFiscalId,
        veiculoId: input.veiculoId ?? null,
        categoria: input.categoria,
        colaborador: input.colaborador ?? null,
        centroCusto: input.centroCusto ?? null,
        motivoDeslocamento: input.motivoDeslocamento ?? null,
        kmComercial: input.kmComercial,
        kmNaoComercial: input.kmNaoComercial,
        litros: input.litros ?? null,
        valorFiscal: resultado.valorFiscal,
        valorReembolsavel: resultado.valorReembolsavel,
        confianca: resultado.confianca,
        status: statusFinal,
        memorial,
        politicaDecisao: politicaResultado?.decisao ?? null,
        politicaMotivo: politicaResultado
          ? politicaResultado.motivos.join("\n")
          : null,
        politicaVersaoAplicada: politicaAtiva?.versao ?? null,
      });
      const despesaId = Number(insertDespesa[0].insertId);

      // RF-03: créditos e dedutibilidade persistidos como saídas paralelas
      const statusCredito =
        resultado.confianca === "alta"
          ? ("apurado" as const)
          : resultado.confianca === "vedado"
            ? ("rejeitado" as const)
            : ("em_revisao" as const);
      if (resultado.memorialTributos.length > 0) {
        await db.insert(creditosApurados).values(
          resultado.memorialTributos.map((m) => ({
            despesaId,
            tributo: m.tributo,
            tipoBeneficio: m.tipoBeneficio,
            valor: m.valor,
            status: statusCredito,
            memorial: m.formula,
            regraVersao: m.regraVersao,
          })),
        );
      }

      // RF-04: trilha imutável com regra, versão e data
      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        empresaId: input.empresaId,
        acao: "despesa.create",
        entidade: "despesa",
        entidadeId: despesaId,
        detalhes: `Categoria ${input.categoria}; confiança ${resultado.confianca}; status ${statusFinal}; valor fiscal R$ ${resultado.valorFiscal}; ${resultado.alertas.length} alerta(s)`,
        regraVersao: resultado.memorialTributos[0]?.regraVersao ?? "1.1",
      });

      // Trilha do agente de política: actorId null = agente automático
      if (politicaAtiva && politicaResultado) {
        await registrarLog(db, {
          usuarioId: null,
          empresaId: input.empresaId,
          acao: "politica_avaliacao",
          entidade: "despesa",
          entidadeId: despesaId,
          detalhes: JSON.stringify({
            politicaId: politicaAtiva.id,
            decisao: politicaResultado.decisao,
            motivos: politicaResultado.motivos,
            regrasAplicadas: politicaResultado.regrasAplicadas,
          }),
          regraVersao: `politica-v${politicaAtiva.versao}`,
        });
      }

      return {
        despesaId,
        resultado,
        politica: politicaResultado
          ? { ...politicaResultado, versao: politicaAtiva?.versao ?? null }
          : null,
      };
    }),

  /** Lista despesas da empresa com filtros. */
  list: protectedProcedure
    .input(
      z.object({
        empresaId: z.number().int().positive(),
        status: z.enum(STATUS_DESPESA).optional(),
        categoria: z.enum(CATEGORIAS_DESPESA).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      await assertEmpresaAcesso(ctx, input.empresaId);
      const db = getDb();
      const condicoes = [eq(despesas.empresaId, input.empresaId)];
      if (input.status) condicoes.push(eq(despesas.status, input.status));
      if (input.categoria) condicoes.push(eq(despesas.categoria, input.categoria));
      const rows = await db
        .select({
          despesa: despesas,
          dataFatoGerador: notasFiscais.dataFatoGerador,
          valorNota: notasFiscais.valor,
        })
        .from(despesas)
        .leftJoin(notasFiscais, eq(despesas.notaFiscalId, notasFiscais.id))
        .where(and(...condicoes))
        .orderBy(desc(despesas.createdAt));
      return rows.map((r) => ({
        ...r.despesa,
        dataFatoGerador: r.dataFatoGerador,
        valorNota: r.valorNota,
      }));
    }),

  /** Detalhe da despesa: nota, créditos (memorial) e evidências (RF-03/RF-04). */
  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(despesas)
        .where(eq(despesas.id, input.id))
        .limit(1);
      const despesa = rows[0];
      if (!despesa) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Despesa não encontrada." });
      }
      await assertEmpresaAcesso(ctx, despesa.empresaId);

      const [nota, creditos, evidencias, veiculo] = await Promise.all([
        db
          .select({
            id: notasFiscais.id,
            cnpjEmitente: notasFiscais.cnpjEmitente,
            cfop: notasFiscais.cfop,
            ncm: notasFiscais.ncm,
            cst: notasFiscais.cst,
            valor: notasFiscais.valor,
            dataFatoGerador: notasFiscais.dataFatoGerador,
            arquivoNome: notasFiscais.arquivoNome,
            arquivoMime: notasFiscais.arquivoMime,
            origem: notasFiscais.origem,
          })
          .from(notasFiscais)
          .where(eq(notasFiscais.id, despesa.notaFiscalId))
          .limit(1),
        db
          .select()
          .from(creditosApurados)
          .where(eq(creditosApurados.despesaId, despesa.id)),
        db
          .select({
            id: evidenciasDocumentais.id,
            tipo: evidenciasDocumentais.tipo,
            arquivoNome: evidenciasDocumentais.arquivoNome,
            arquivoMime: evidenciasDocumentais.arquivoMime,
            observacao: evidenciasDocumentais.observacao,
            createdAt: evidenciasDocumentais.createdAt,
          })
          .from(evidenciasDocumentais)
          .where(eq(evidenciasDocumentais.despesaId, despesa.id)),
        despesa.veiculoId
          ? db
              .select()
              .from(veiculos)
              .where(eq(veiculos.id, despesa.veiculoId))
              .limit(1)
          : Promise.resolve([]),
      ]);

      return {
        despesa,
        nota: nota[0] ?? null,
        creditos,
        evidencias,
        veiculo: veiculo[0] ?? null,
      };
    }),

  /** RF-04: anexa evidência documental (exigida para "Média confiança"). */
  addEvidencia: protectedProcedure
    .input(evidenciaInput)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(despesas)
        .where(eq(despesas.id, input.despesaId))
        .limit(1);
      const despesa = rows[0];
      if (!despesa) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Despesa não encontrada." });
      }
      await assertEmpresaAcesso(ctx, despesa.empresaId);

      const result = await db.insert(evidenciasDocumentais).values({
        despesaId: input.despesaId,
        tipo: input.tipo,
        arquivoNome: input.arquivoNome,
        arquivoMime: input.arquivoMime ?? null,
        arquivoBase64: input.arquivoBase64 ?? null,
        observacao: input.observacao ?? null,
      });
      const id = Number(result[0].insertId);

      await registrarLog(db, {
        usuarioId: ctx.usuario.id,
        empresaId: despesa.empresaId,
        acao: "evidencia.create",
        entidade: "evidencia_documental",
        entidadeId: id,
        detalhes: `Despesa #${input.despesaId}; tipo ${input.tipo}`,
      });

      return { id };
    }),
});
