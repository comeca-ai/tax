import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
  fiscalConfiguracao,
  fiscalDocumentos,
  fiscalVerificacoes,
} from "../../../../db/fiscalSchema";
import {
  colaboradores,
  despesas,
  empresas,
  notasFiscais,
  whatsappInbox,
} from "../../../../db/schema";
import { nfeIoOrcamentos } from "../../../../db/nfeioSchema";
import type {
  EstadoVerificacaoFiscal,
  ResultadoVerificacaoFiscal,
} from "../../../../contracts/fiscal";
import type { TrpcContext } from "../../../context";
import { getDb } from "../../../queries/connection";
import { assertEmpresaAcesso, registrarLog } from "../../../routers/_shared";
import {
  executarConsultaNfeIo,
  dependenciasPadraoNfeIo,
} from "../nfeio/service";
import {
  chaveNfe55Valida,
  consultarNfeIo,
  type ResultadoConsultaNfeIo,
} from "../nfeio/adapter";
import { integridadeFiscalConfere } from "./documento";

type Pedido = { empresaId: number; notaFiscalId: number };
type ReservaFiscal = {
  existente: boolean;
  id: string;
  resultado: ResultadoVerificacaoFiscal;
  documento: {
    chave: string | null;
    chaveEstado: string;
    integridade: boolean;
  } | null;
};

async function reservarVerificacao(
  input: Pedido,
  usuarioId: number | null,
  colaboradorId: number | null = null
): Promise<ReservaFiscal> {
  return getDb().transaction(async tx => {
    const [nota] = await tx
      .select()
      .from(notasFiscais)
      .where(
        and(
          eq(notasFiscais.id, input.notaFiscalId),
          eq(notasFiscais.empresaId, input.empresaId)
        )
      )
      .for("update");
    if (!nota)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Nota fiscal não encontrada nesta empresa.",
      });
    const [anterior] = await tx
      .select()
      .from(fiscalVerificacoes)
      .where(
        and(
          eq(fiscalVerificacoes.notaFiscalId, input.notaFiscalId),
          eq(fiscalVerificacoes.empresaId, input.empresaId)
        )
      );
    if (anterior)
      return {
        existente: true,
        id: anterior.id,
        resultado: anterior.resultado,
        documento: null,
      };
    const [config] = await tx
      .select()
      .from(fiscalConfiguracao)
      .where(eq(fiscalConfiguracao.empresaId, input.empresaId));
    const [doc] = await tx
      .select()
      .from(fiscalDocumentos)
      .where(
        and(
          eq(fiscalDocumentos.notaFiscalId, input.notaFiscalId),
          eq(fiscalDocumentos.empresaId, input.empresaId)
        )
      );
    const solicitada = config?.habilitada ?? false;
    const id = randomUUID();
    const resultado: ResultadoVerificacaoFiscal = {
      estado: solicitada ? "processando" : "desativada",
      solicitada,
      configuracaoVersao: config?.versao ?? 0,
      consultaId: null,
      modelo: doc?.chave?.slice(20, 22) ?? null,
      verificadaEm: null,
    };
    await tx.insert(fiscalVerificacoes).values({
      ...input,
      usuarioId,
      colaboradorId,
      id,
      resultado,
      concluidaEm: solicitada ? null : new Date(),
    });
    return {
      existente: false,
      id,
      resultado,
      documento: doc
        ? {
            chave: doc.chave,
            chaveEstado: doc.chaveEstado,
            integridade: integridadeFiscalConfere(
              nota.arquivoBase64,
              nota.arquivoChecksum,
              doc.hash
            ),
          }
        : null,
    };
  });
}

async function concluirVerificacao(
  input: Pedido,
  id: string,
  usuarioId: number | null,
  resultado: ResultadoVerificacaoFiscal
) {
  await getDb().transaction(async tx => {
    const [row] = await tx
      .select()
      .from(fiscalVerificacoes)
      .where(
        and(
          eq(fiscalVerificacoes.notaFiscalId, input.notaFiscalId),
          eq(fiscalVerificacoes.empresaId, input.empresaId),
          eq(fiscalVerificacoes.id, id)
        )
      )
      .for("update");
    if (!row || row.resultado.estado !== "processando")
      throw new TRPCError({
        code: "CONFLICT",
        message: "Verificação fiscal requer conciliação.",
      });
    await tx
      .update(fiscalVerificacoes)
      .set({ resultado, concluidaEm: new Date() })
      .where(eq(fiscalVerificacoes.notaFiscalId, input.notaFiscalId));
    await registrarLog(tx, {
      usuarioId,
      empresaId: input.empresaId,
      acao: "fiscal.verificar",
      entidade: "nota_fiscal",
      entidadeId: input.notaFiscalId,
      detalhes: JSON.stringify(resultado),
    });
  });
}

export const dependenciasVerificacaoFiscal = {
  autorizar: assertEmpresaAcesso,
  reservar: reservarVerificacao,
  concluir: concluirVerificacao,
  consultar: (
    ctx: TrpcContext,
    input: Pedido & { solicitacaoId: string; confirmarConsulta: true }
  ) =>
    // A autorização administrativa já foi persistida na configuração/versionamento.
    // O solicitante precisa manter vínculo com a empresa, mas não precisa ser administrador.
    executarConsultaNfeIo(ctx, input, {
      ...dependenciasPadraoNfeIo,
      autorizar: assertEmpresaAcesso,
    }),
};

/** Executada após OCR e antes da decisão. Desativada nunca toca a API do provedor. */
export async function verificarFiscalAntesDaDecisao(
  ctx: TrpcContext,
  input: Pedido,
  deps = dependenciasVerificacaoFiscal
): Promise<ResultadoVerificacaoFiscal> {
  if (!ctx.usuario) throw new TRPCError({ code: "UNAUTHORIZED" });
  await deps.autorizar(ctx, input.empresaId);
  const reserva = await deps.reservar(input, ctx.usuario.id);
  return executarReservaFiscal(
    input,
    reserva,
    ctx.usuario.id,
    () =>
      deps.consultar(ctx, {
        ...input,
        solicitacaoId: reserva.id,
        confirmarConsulta: true,
      }),
    deps.concluir
  );
}

async function executarReservaFiscal(
  input: Pedido,
  reserva: ReservaFiscal,
  usuarioId: number | null,
  consultar: () => Promise<{
    consultaId: string;
    resultado: ResultadoConsultaNfeIo | null;
  }>,
  concluir = concluirVerificacao
): Promise<ResultadoVerificacaoFiscal> {
  if (reserva.existente || !reserva.resultado.solicitada)
    return reserva.resultado;
  let estado: EstadoVerificacaoFiscal;
  let consultaId: string | null = null;
  let verificadaEm: string | null = null;
  const doc = reserva.documento;
  if (!doc) estado = "sem_chave";
  else if (!doc.integridade) estado = "integridade_divergente";
  else if (doc.chaveEstado === "invalida") estado = "chave_invalida";
  else if (!doc.chave) estado = "sem_chave";
  else if (!chaveNfe55Valida(doc.chave)) estado = "nao_suportada";
  else {
    try {
      consultaId = reserva.id;
      const consulta = await consultar();
      consultaId = consulta.consultaId;
      estado = consulta.resultado?.estado ?? "processando";
      verificadaEm = consulta.resultado?.consultadaEm ?? null;
    } catch (error) {
      // Não publica mensagem/SQL/credencial do erro; não repete uma consulta incerta.
      estado =
        error instanceof TRPCError && error.code === "TOO_MANY_REQUESTS"
          ? "sem_orcamento"
          : "indisponivel";
    }
  }
  const resultado = { ...reserva.resultado, estado, consultaId, verificadaEm };
  await concluir(input, reserva.id, usuarioId, resultado);
  return resultado;
}

/** Canal autenticado + documento persistido conferidos, sem fabricar usuário de login. */
export async function verificarFiscalWhatsapp(
  input: Pedido & { colaboradorId: number }
) {
  const db = getDb();
  const [vinculo] = await db
    .select({ cnpj: empresas.cnpj, chave: fiscalDocumentos.chave })
    .from(fiscalDocumentos)
    .innerJoin(
      colaboradores,
      and(
        eq(colaboradores.id, fiscalDocumentos.colaboradorId),
        eq(colaboradores.empresaId, fiscalDocumentos.empresaId),
        eq(colaboradores.statusVinculo, "ativo")
      )
    )
    .innerJoin(empresas, eq(empresas.id, fiscalDocumentos.empresaId))
    .innerJoin(
      despesas,
      and(
        eq(despesas.notaFiscalId, fiscalDocumentos.notaFiscalId),
        eq(despesas.empresaId, fiscalDocumentos.empresaId)
      )
    )
    .innerJoin(
      whatsappInbox,
      and(
        eq(whatsappInbox.despesaId, despesas.id),
        eq(whatsappInbox.empresaId, fiscalDocumentos.empresaId),
        eq(whatsappInbox.colaboradorId, colaboradores.id)
      )
    )
    .where(
      and(
        eq(fiscalDocumentos.notaFiscalId, input.notaFiscalId),
        eq(fiscalDocumentos.empresaId, input.empresaId),
        eq(colaboradores.id, input.colaboradorId),
        eq(whatsappInbox.provider, "dialog360"),
        eq(whatsappInbox.tipoEvento, "comprovante")
      )
    )
    .limit(1);
  if (!vinculo)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Vínculo fiscal do comprovante WhatsApp não confirmado.",
    });
  const reserva = await reservarVerificacao(
    { empresaId: input.empresaId, notaFiscalId: input.notaFiscalId },
    null,
    input.colaboradorId
  );
  return executarReservaFiscal(input, reserva, null, async () => {
    const config = dependenciasPadraoNfeIo.config();
    const cnpj = vinculo.cnpj.replace(/\D/g, "");
    if (
      !config.habilitado ||
      !config.apiKey ||
      !config.orcamentoId ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(config.orcamentoId) ||
      !/^\d{14}$/.test(cnpj) ||
      !vinculo.chave
    )
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    if (
      config.apiKey.length > 4096 ||
      /\s/.test(config.apiKey) ||
      /^Bearer/i.test(config.apiKey)
    )
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    const idOrcamento = config.orcamentoId;
    const repetida = await db.transaction(async tx => {
      const [budget] = await tx
        .select()
        .from(nfeIoOrcamentos)
        .where(eq(nfeIoOrcamentos.id, idOrcamento))
        .for("update");
      const [execucao] = await tx
        .select()
        .from(fiscalVerificacoes)
        .where(
          and(
            eq(fiscalVerificacoes.notaFiscalId, input.notaFiscalId),
            eq(fiscalVerificacoes.empresaId, input.empresaId),
            eq(fiscalVerificacoes.id, reserva.id),
            eq(fiscalVerificacoes.colaboradorId, input.colaboradorId)
          )
        )
        .for("update");
      if (!execucao) throw new TRPCError({ code: "FORBIDDEN" });
      if (execucao.orcamentoId) return true;
      if (
        !budget ||
        !Number.isInteger(budget.limite) ||
        budget.limite <= 0 ||
        budget.limite > 20 ||
        budget.usadas >= budget.limite
      )
        throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
      await tx
        .update(fiscalVerificacoes)
        .set({ orcamentoId: idOrcamento })
        .where(eq(fiscalVerificacoes.notaFiscalId, input.notaFiscalId));
      await tx
        .update(nfeIoOrcamentos)
        .set({ usadas: budget.usadas + 1 })
        .where(eq(nfeIoOrcamentos.id, idOrcamento));
      return false;
    });
    if (repetida) return { consultaId: reserva.id, resultado: null };
    // Rede somente depois do commit da reserva. A própria execução é o ledger do ator automático.
    const resultado = await consultarNfeIo({
      chave: vinculo.chave,
      cnpjEsperado: cnpj,
      apiKey: config.apiKey,
    });
    return { consultaId: reserva.id, resultado };
  });
}

/** Chamador deve conferir acesso à empresa antes de expor o resultado pelo ID da despesa. */
export async function lerResultadoFiscal(
  empresaId: number,
  notaFiscalId: number
) {
  const [row] = await getDb()
    .select({ resultado: fiscalVerificacoes.resultado })
    .from(fiscalVerificacoes)
    .where(
      and(
        eq(fiscalVerificacoes.empresaId, empresaId),
        eq(fiscalVerificacoes.notaFiscalId, notaFiscalId)
      )
    )
    .limit(1);
  return row?.resultado ?? null;
}
