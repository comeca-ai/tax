import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { UFS_BRASIL } from "../../contracts/empresas";
import { colaboradores, despesas, empresas, empresasConfig, politicasReembolso } from "../../db/schema";
import { pocCampo, pocPagamentos, pocConfiguracao } from "../../db/pocSchema";
import { createRouter, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { assertAdminDaEmpresa, assertEmpresaAcesso, registrarLog } from "./_shared";
import type { TrpcContext } from "../context";
import { atualizarConciliacoes, checkpointsDoUsuario, conciliar, metricasCampo, novoEstadoCampo } from "../modules/reembolso/campo/dominio";
import { alterarCampo, eventoCampoSchema, registrarEventoCampo, vincularPresencaCampo } from "../modules/reembolso/campo/servico";
import { calcularJornadaPersistida } from "../modules/reembolso/campo/calculoMaps";
import { configuracaoCampoSchema, memorialReembolso } from "../modules/reembolso/campo/politica";
import { importarDocumentoCampo } from "../modules/reembolso/campo/documentos";

const pessoaInput = z.object({ colaboradorId: z.number().int().positive() });
/** Tenant nunca vem do formulário; é obtido da pessoa e autorizado antes de retornar dados. */
async function contexto(ctx: TrpcContext, id: number) {
  const [pessoa] = await getDb().select({ id: colaboradores.id, empresaId: colaboradores.empresaId }).from(colaboradores).where(eq(colaboradores.id, id)).limit(1);
  if (!pessoa) throw new TRPCError({ code: "NOT_FOUND", message: "Registro indisponível." });
  const empresa = await assertAdminDaEmpresa(ctx, pessoa.empresaId);
  return { colaboradorId: pessoa.id, empresaId: empresa.id, cnpj: empresa.cnpj.replace(/\D/g, "") };
}

export const campoRouter = createRouter({
  configuracao: protectedProcedure.input(z.object({ empresaId: z.number().int().positive() })).query(async ({ input, ctx }) => {
    await assertAdminDaEmpresa(ctx, input.empresaId);
    const [row] = await getDb().select().from(pocConfiguracao).where(eq(pocConfiguracao.empresaId, input.empresaId));
    return row ?? { empresaId: input.empresaId, configuracao: null, modo: "sombra" as const, historico: [] };
  }),
  configurar: protectedProcedure.input(z.object({ empresaId: z.number().int().positive(), configuracao: configuracaoCampoSchema })).mutation(async ({ input, ctx }) => {
    await assertAdminDaEmpresa(ctx, input.empresaId);
    return getDb().transaction(async tx => {
      await tx.select({ id: empresas.id }).from(empresas).where(eq(empresas.id, input.empresaId)).for("update");
      const [politica] = await tx.select().from(politicasReembolso).where(and(eq(politicasReembolso.id, input.configuracao.politicaId), eq(politicasReembolso.empresaId, input.empresaId))).for("update");
      if (!politica || politica.status !== "ativa" || politica.versao !== input.configuracao.politicaVersao) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Valide e ative a versão da política antes de configurar campo." });
      const [anterior] = await tx.select().from(pocConfiguracao).where(eq(pocConfiguracao.empresaId, input.empresaId)).for("update");
      for (const id of [input.configuracao.analistaId, input.configuracao.aprovadorId]) {
        if (id == null) continue;
        const [designado] = await tx.select({ id: colaboradores.id }).from(colaboradores).where(and(eq(colaboradores.id, id), eq(colaboradores.empresaId, input.empresaId), eq(colaboradores.statusVinculo, "ativo"))).limit(1);
        if (!designado) throw new TRPCError({ code: "BAD_REQUEST", message: "Analista e aprovador devem ser colaboradores ativos desta empresa." });
      }
      const parametros = {
        temValeRefeicao: input.configuracao.temValeRefeicao,
        temContratoCorporativoApp: input.configuracao.temContratoCorporativoApp,
        analistaId: input.configuracao.analistaId,
        aprovadorId: input.configuracao.aprovadorId,
      };
      const [norma] = await tx.select({ id: empresasConfig.id }).from(empresasConfig).where(eq(empresasConfig.empresaId, input.empresaId)).for("update");
      if (Object.values(parametros).some(v => v !== undefined)) {
        if (norma) await tx.update(empresasConfig).set(parametros).where(eq(empresasConfig.empresaId, input.empresaId));
        else await tx.insert(empresasConfig).values({ empresaId: input.empresaId, ...parametros });
      }
      const configuracao = { ...anterior?.configuracao, ...input.configuracao };
      const historico = [...(anterior?.historico ?? []), { usuarioId: ctx.usuario.id, em: new Date().toISOString(), configuracao }];
      if (anterior) await tx.update(pocConfiguracao).set({ configuracao, historico }).where(eq(pocConfiguracao.empresaId, input.empresaId));
      else await tx.insert(pocConfiguracao).values({ empresaId: input.empresaId, configuracao, historico });
      await registrarLog(tx, { usuarioId: ctx.usuario.id, empresaId: input.empresaId, acao: "empresa.configurar_campo", entidade: "poc_configuracao", entidadeId: input.empresaId, detalhes: JSON.stringify({ modoAnterior: anterior?.configuracao.modo ?? "sombra", modoNovo: input.configuracao.modo, configuracaoAnterior: anterior?.configuracao ?? null, configuracaoNova: configuracao }), regraVersao: String(input.configuracao.politicaVersao) });
      return { configuracao };
    });
  }),
  consultar: protectedProcedure.input(pessoaInput).query(async ({ input, ctx }) => {
    const identity = await contexto(ctx, input.colaboradorId);
    const [row] = await getDb().select().from(pocCampo).where(and(eq(pocCampo.empresaId, identity.empresaId), eq(pocCampo.colaboradorId, identity.colaboradorId)));
    const estado = row?.estado ?? novoEstadoCampo();
    return { ...estado, metricas: metricasCampo(estado) };
  }),
  /** Totais de checkpoint por pessoa, sempre limitados à empresa autorizada. */
  checkpoints: protectedProcedure.input(z.object({ empresaId: z.number().int().positive() })).query(async ({ input, ctx }) => {
    await assertEmpresaAcesso(ctx, input.empresaId);
    const rows = await getDb().select({ colaboradorId: colaboradores.id, usuarioId: colaboradores.usuarioId, nome: colaboradores.nome, cargo: colaboradores.cargo, estado: pocCampo.estado })
      .from(colaboradores).leftJoin(pocCampo, and(eq(colaboradores.id, pocCampo.colaboradorId), eq(colaboradores.empresaId, pocCampo.empresaId)))
      .where(and(eq(colaboradores.empresaId, input.empresaId), eq(colaboradores.statusVinculo, "ativo"))).orderBy(asc(colaboradores.nome));
    const usuarios = rows.map(row => ({ colaboradorId: row.colaboradorId, usuarioId: row.usuarioId, nome: row.nome, cargo: row.cargo, ...checkpointsDoUsuario(row.estado ?? novoEstadoCampo()) }));
    return { totalCheckpoints: usuarios.reduce((total, usuario) => total + usuario.checkpoints, 0), usuarios };
  }),
  vincularPresenca: protectedProcedure.input(pessoaInput.extend({ presencaId: z.string().uuid(), veiculo: z.string().min(1).max(10) })).mutation(async ({ input, ctx }) => {
    const identity = await contexto(ctx, input.colaboradorId);
    return vincularPresencaCampo(identity, input.presencaId, input.veiculo, ctx.usuario.id);
  }),
  registrarEvento: protectedProcedure.input(pessoaInput.extend(eventoCampoSchema.shape)).mutation(async ({ input, ctx }) => {
    const identity = await contexto(ctx, input.colaboradorId);
    return registrarEventoCampo(identity, input, ctx.usuario.id);
  }),
  calcular: protectedProcedure.input(pessoaInput.extend({ jornadaId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const identity = await contexto(ctx, input.colaboradorId);
    return calcularJornadaPersistida(identity, input.jornadaId, ctx.usuario.id);
  }),
  registrarDocumento: protectedProcedure.input(pessoaInput.extend({
    notaFiscalId: z.number().int().positive(), veiculo: z.string().min(1).max(10),
  })).mutation(async ({ input, ctx }) => {
    const identity = await contexto(ctx, input.colaboradorId);
    return importarDocumentoCampo(identity, input, undefined, ctx.usuario.id);
  }),
  revisarDocumento: protectedProcedure.input(pessoaInput.extend({ documentoId: z.string().uuid(), regular: z.boolean(), motivo: z.string().trim().min(10).max(1000) })).mutation(async ({ input, ctx }) => {
    const identity = await contexto(ctx, input.colaboradorId);
    return alterarCampo(identity, ctx.usuario.id, "documento.revisar", estado => {
      const documento = estado.documentos.find(d => d.id === input.documentoId);
      if (!documento) throw new TRPCError({ code: "NOT_FOUND" });
      if (input.regular && (documento.cnpjDestinatario !== identity.cnpj || !documento.chave || !documento.notaFiscalId || !documento.camposPendentes || documento.camposPendentes.length)) throw new TRPCError({ code: "BAD_REQUEST", message: "Documento sem evidência completa extraída do arquivo não pode ser regularizado." });
      documento.estado = input.regular ? "regular" : "divergente";
      documento.motivo = input.motivo;
      atualizarConciliacoes(estado);
      return documento;
    });
  }),
  conciliar: protectedProcedure.input(pessoaInput.extend({ inicio: z.string().datetime({ offset: true }), fim: z.string().datetime({ offset: true }), veiculo: z.string().min(1).max(10), ufCalculo: z.enum(UFS_BRASIL).optional(), metrosComerciais: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional() }).refine(v => (v.ufCalculo === undefined) === (v.metrosComerciais === undefined), { message: "Informe a UF e a distância comercial juntas." })).mutation(async ({ input, ctx }) => {
    const identity = await contexto(ctx, input.colaboradorId);
    return alterarCampo(identity, ctx.usuario.id, "periodo.conciliar", async (estado, tx) => {
      const resultado = conciliar(estado, new Date(input.inicio).toISOString(), new Date(input.fim).toISOString(), input.veiculo);
      if (input.ufCalculo !== undefined && input.metrosComerciais !== undefined) {
        if (resultado.metrosEstimados === null || input.metrosComerciais > resultado.metrosEstimados) throw new TRPCError({ code: "BAD_REQUEST", message: "A distância comercial não pode exceder o percurso consolidado; conclua o cálculo da jornada." });
        const [config] = await tx.select().from(pocConfiguracao).where(eq(pocConfiguracao.empresaId, identity.empresaId));
        if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure a política e a tarifa da UF antes de calcular o reembolso." });
        if (!config.configuracao.tarifasCentavosPorKmPorUf?.[input.ufCalculo]) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Tarifa de quilometragem não configurada para ${input.ufCalculo}.` });
        const [politica] = await tx.select().from(politicasReembolso).where(and(eq(politicasReembolso.id, config.configuracao.politicaId), eq(politicasReembolso.empresaId, identity.empresaId)));
        if (!politica || politica.status !== "ativa" || politica.versao !== config.configuracao.politicaVersao) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Revalide a configuração para a política ativa antes de calcular o reembolso." });
        resultado.memorialReembolso = { ...memorialReembolso(input.metrosComerciais, config.configuracao, input.ufCalculo), metrosNaoComerciais: resultado.metrosEstimados - input.metrosComerciais };
        await registrarLog(tx, { usuarioId: ctx.usuario.id, empresaId: identity.empresaId, acao: "campo.memorial_reembolso", entidade: "colaboradores", entidadeId: identity.colaboradorId, detalhes: JSON.stringify({ inicio: resultado.inicio, fim: resultado.fim, veiculo: resultado.veiculo, jornadas: resultado.jornadas, memorial: resultado.memorialReembolso }), regraVersao: String(config.configuracao.politicaVersao) });
      }
      estado.historicoConciliacoes = [...(estado.historicoConciliacoes ?? []), ...estado.conciliacoes.filter(c => c.inicio === resultado.inicio && c.fim === resultado.fim && c.veiculo === resultado.veiculo)];
      estado.conciliacoes = [...estado.conciliacoes.filter(c => !(c.inicio === resultado.inicio && c.fim === resultado.fim && c.veiculo === resultado.veiculo)), resultado];
      return resultado;
    });
  }),
  registrarPagamento: protectedProcedure.input(z.object({ despesaId: z.number().int().positive(), referencia: z.string().trim().min(3).max(128), pagoEm: z.string().datetime({ offset: true }) })).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const [despesa] = await db.select().from(despesas).where(eq(despesas.id, input.despesaId)).limit(1);
    if (!despesa) throw new TRPCError({ code: "NOT_FOUND" });
    await assertAdminDaEmpresa(ctx, despesa.empresaId);
    if (Date.parse(input.pagoEm) > Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "Data futura inválida." });
    return db.transaction(async tx => {
      const [atual] = await tx.select().from(despesas).where(and(eq(despesas.id, despesa.id), eq(despesas.empresaId, despesa.empresaId))).for("update");
      if (atual?.status !== "aprovada") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A despesa precisa estar aprovada." });
      const [existente] = await tx.select().from(pocPagamentos).where(eq(pocPagamentos.despesaId, despesa.id));
      if (existente) {
        if (existente.referencia !== input.referencia || existente.pagoEm.toISOString() !== new Date(input.pagoEm).toISOString()) throw new TRPCError({ code: "CONFLICT", message: "Pagamento já registrado com outros dados." });
        return existente;
      }
      const registro = { despesaId: despesa.id, empresaId: despesa.empresaId, usuarioId: ctx.usuario.id, referencia: input.referencia, pagoEm: new Date(input.pagoEm) };
      await tx.insert(pocPagamentos).values(registro);
      await registrarLog(tx, { usuarioId: ctx.usuario.id, empresaId: despesa.empresaId, acao: "despesa.registrar_pagamento", entidade: "despesas", entidadeId: despesa.id, detalhes: JSON.stringify({ referencia: input.referencia, pagoEm: input.pagoEm }) });
      return registro; // Registro contábil manual: nenhuma chamada bancária ou PIX.
    });
  }),
});
