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
} from "../modules/fiscal/engine";
import { getOcrProvider } from "../modules/fiscal/ocr";
import { avaliarDespesa } from "../modules/reembolso/policy/agent";
import { decidirReembolso } from "../modules/reembolso/decisor";
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

      let notaFiscalId: number;
      try {
        const result = await db.insert(notasFiscais).values({
          empresaId: input.empresaId,
          cnpjEmitente: extracao.cnpjEmitente,
          cfop: extracao.cfop,
          ncm: extracao.ncm,
          cst: extracao.cst,
          valor: extracao.valor,
          dataFatoGerador: extracao.dataFatoGerador,
          categoriaSugerida: extracao.categoriaSugerida,
          litros: extracao.litros,
          arquivoNome: input.arquivoNome,
          arquivoMime: input.arquivoMime,
          arquivoBase64: input.arquivoBase64,
          origem: "ocr",
        });
        notaFiscalId = Number(result[0].insertId);
      } catch (err) {
        // Nunca vazar SQL/params para o cliente — mensagem amigável PT-BR
        console.error("[uploadNota] falha ao persistir nota fiscal:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Não conseguimos salvar a nota fiscal. Verifique se o arquivo tem até 10 MB e tente novamente — se o erro persistir, fale com o suporte.",
        });
      }

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

  /**
   * Fluxo automático de reembolso (v1.7.0 — D-013/D-014): a nota já foi
   * extraída no upload; aqui o decisor APROVA, NEGA ou manda para REVISÃO
   * MANUAL — sem ninguém preencher nada. O motor fiscal roda depois, quando
   * (e se) houver dados fiscais completos.
   */
  processarAutomatica: protectedProcedure
    .input(
      z.object({
        empresaId: z.number().int().positive(),
        notaFiscalId: z.number().int().positive(),
        veiculoId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const empresa = await assertEmpresaAcesso(ctx, input.empresaId);
      const db = getDb();

      const notaRows = await db
        .select()
        .from(notasFiscais)
        .where(
          and(
            eq(notasFiscais.id, input.notaFiscalId),
            eq(notasFiscais.empresaId, input.empresaId),
          ),
        )
        .limit(1);
      const nota = notaRows[0];
      if (!nota) {
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
          message: "Esta nota já foi processada.",
        });
      }

      // Política ativa (mais recente)
      const politicaRows = await db
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
      const politicaAtiva = politicaRows[0] ?? null;
      const regrasPolitica = politicaAtiva
        ? regrasPoliticaSchema.parse(politicaAtiva.regras ?? {})
        : null;

      // Veículo (opcional — só faz sentido para combustível)
      let temVeiculo = false;
      if (input.veiculoId) {
        const v = await db
          .select({ id: veiculos.id })
          .from(veiculos)
          .where(
            and(eq(veiculos.id, input.veiculoId), eq(veiculos.empresaId, input.empresaId)),
          )
          .limit(1);
        temVeiculo = v.length > 0;
      }

      // ── Decisor de reembolso (função pura — módulo reembolso) ──────────
      const decisao = decidirReembolso(
        {
          categoriaSugerida: (nota.categoriaSugerida as never) ?? null,
          valor: nota.valor,
          dataFatoGerador: nota.dataFatoGerador,
          cnpjEmitente: nota.cnpjEmitente,
          confiancaExtracao: nota.valor != null && nota.cnpjEmitente ? "alta" : "baixa",
          camposPendentes: [],
        },
        regrasPolitica,
        { temVeiculo },
      );

      const statusFinal: StatusDespesa =
        decisao.decisao === "aprovado"
          ? "aprovada"
          : decisao.decisao === "negado"
            ? "rejeitada"
            : "em_revisao";

      // ── Motor fiscal (módulo fiscal) — entra DEPOIS e só com dados ──────
      let motor: ReturnType<typeof processarDespesa> | null = null;
      const cadastroCompleto = Boolean(
        empresa.cnaePrincipal && empresa.regimeTributario && empresa.uf,
      );
      if (
        cadastroCompleto &&
        decisao.categoria &&
        nota.valor != null &&
        nota.dataFatoGerador
      ) {
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
        motor = processarDespesa(
          {
            cnaePrincipal: empresa.cnaePrincipal,
            regimeTributario: empresa.regimeTributario,
            uf: empresa.uf,
          },
          {
            categoria: decisao.categoria,
            valorNota: nota.valor,
            dataFatoGerador: nota.dataFatoGerador,
            litros: nota.litros ?? null,
            kmComercial: 0,
            kmNaoComercial: 0,
          },
          null,
          regras,
        );
      }

      const memorial = motor
        ? [
            ...motor.memorialTributos.map((m) => `[${m.tributo}] ${m.formula}`),
            ...motor.alertas.map((a) => `ALERTA: ${a}`),
          ].join("\n")
        : null;

      const insert = await db.insert(despesas).values({
        empresaId: input.empresaId,
        notaFiscalId: input.notaFiscalId,
        veiculoId: input.veiculoId ?? null,
        categoria: decisao.categoria,
        kmComercial: 0,
        kmNaoComercial: 0,
        litros: nota.litros ?? null,
        valorFiscal: motor?.valorFiscal ?? 0,
        valorReembolsavel: nota.valor ?? 0,
        confianca: motor?.confianca ?? "media",
        status: statusFinal,
        memorial,
        motivoRevisao:
          decisao.decisao === "revisao_manual" ? decisao.motivos.join("\n") : null,
        politicaDecisao:
          decisao.decisao === "revisao_manual"
            ? "revisao_humana"
            : decisao.decisao === "negado"
              ? "negado"
              : "aprovado",
        politicaMotivo: decisao.motivos.join("\n"),
        politicaVersaoAplicada: politicaAtiva?.versao ?? null,
      });
      const despesaId = Number(insert[0].insertId);

      if (motor && motor.memorialTributos.length > 0) {
        const statusCredito =
          motor.confianca === "alta"
            ? ("apurado" as const)
            : motor.confianca === "vedado"
              ? ("rejeitado" as const)
              : ("em_revisao" as const);
        await db.insert(creditosApurados).values(
          motor.memorialTributos.map((m) => ({
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

      // Trilha: decisão do reembolso (ator: agente automático)
      await registrarLog(db, {
        usuarioId: null,
        empresaId: input.empresaId,
        acao: "reembolso_decisao",
        entidade: "despesa",
        entidadeId: despesaId,
        detalhes: JSON.stringify({
          decisao: decisao.decisao,
          motivos: decisao.motivos,
          regrasAplicadas: decisao.regrasAplicadas,
          politicaId: politicaAtiva?.id ?? null,
        }),
        regraVersao: politicaAtiva ? `politica-v${politicaAtiva.versao}` : "sem-politica",
      });

      return {
        despesaId,
        decisao: decisao.decisao,
        motivos: decisao.motivos,
        regrasAplicadas: decisao.regrasAplicadas,
        politicaVersao: politicaAtiva?.versao ?? null,
        categoria: decisao.categoria,
        valor: nota.valor,
        dataFatoGerador: nota.dataFatoGerador,
        cnpjEmitente: nota.cnpjEmitente,
        motor,
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

      let id: number;
      try {
        const result = await db.insert(evidenciasDocumentais).values({
          despesaId: input.despesaId,
          tipo: input.tipo,
          arquivoNome: input.arquivoNome,
          arquivoMime: input.arquivoMime ?? null,
          arquivoBase64: input.arquivoBase64 ?? null,
          observacao: input.observacao ?? null,
        });
        id = Number(result[0].insertId);
      } catch (err) {
        // Nunca vazar SQL/params para o cliente — mensagem amigável PT-BR
        console.error("[addEvidencia] falha ao persistir evidência:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Não conseguimos anexar a evidência. Verifique se o arquivo tem até 10 MB e tente novamente — se o erro persistir, fale com o suporte.",
        });
      }

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
