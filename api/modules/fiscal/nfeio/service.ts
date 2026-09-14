import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { despesas, notasFiscais, whatsappInbox } from "../../../../db/schema";
import { pocCampo, pocDocumentos } from "../../../../db/pocSchema";
import { nfeIoConsultas, nfeIoOrcamentos } from "../../../../db/nfeioSchema";
import { fiscalDocumentos } from "../../../../db/fiscalSchema";
import { integridadeFiscalConfere } from "../verificacao/documento";
import { getDb } from "../../../queries/connection";
import { assertAdminDaEmpresa } from "../../../routers/_shared";
import type { TrpcContext } from "../../../context";
import {
  chaveNfe55Valida,
  consultarNfeIo,
  type ResultadoConsultaNfeIo,
} from "./adapter";

export type PedidoConsultaNfeIo = {
  empresaId: number;
  notaFiscalId: number;
  solicitacaoId: string;
  confirmarConsulta: true;
};
type Reserva = {
  id: string;
  orcamentoId: string;
  empresaId: number;
  notaFiscalId: number;
  usuarioId: number;
  chaveHash: string;
};
type ResultadoReserva = {
  existente: boolean;
  resultado: ResultadoConsultaNfeIo | null;
};
export type DependenciasConsultaNfeIo = {
  autorizar: (ctx: TrpcContext, empresaId: number) => Promise<{ cnpj: string }>;
  chavePersistida: (
    empresaId: number,
    notaFiscalId: number
  ) => Promise<string | null>;
  config: () => { habilitado: boolean; apiKey?: string; orcamentoId?: string };
  reservar: (input: Reserva) => Promise<ResultadoReserva>;
  consultar: typeof consultarNfeIo;
  concluir: (
    input: Reserva,
    resultado: ResultadoConsultaNfeIo
  ) => Promise<void>;
};
function error(
  code:
    | "UNAUTHORIZED"
    | "PRECONDITION_FAILED"
    | "FORBIDDEN"
    | "TOO_MANY_REQUESTS"
    | "INTERNAL_SERVER_ERROR",
  message: string
): never {
  throw new TRPCError({ code, message });
}

async function chavePersistida(
  empresaId: number,
  notaFiscalId: number
): Promise<string | null> {
  const db = getDb();
  const [nota] = await db
    .select({ hash: notasFiscais.arquivoChecksum, arquivo: notasFiscais.arquivoBase64 })
    .from(notasFiscais)
    .where(
      and(
        eq(notasFiscais.id, notaFiscalId),
        eq(notasFiscais.empresaId, empresaId)
      )
    )
    .limit(1);
  if (!nota?.hash) return null;
  const [documentoWeb] = await db.select().from(fiscalDocumentos).where(and(
    eq(fiscalDocumentos.notaFiscalId, notaFiscalId), eq(fiscalDocumentos.empresaId, empresaId)
  )).limit(1);
  if (documentoWeb) return documentoWeb.chaveEstado === "valida" &&
    integridadeFiscalConfere(nota.arquivo, nota.hash, documentoWeb.hash) ? documentoWeb.chave : null;
  const pessoas = await db
    .select({
      colaboradorId: whatsappInbox.colaboradorId,
      estado: pocCampo.estado,
    })
    .from(whatsappInbox)
    .innerJoin(
      despesas,
      and(
        eq(despesas.id, whatsappInbox.despesaId),
        eq(despesas.empresaId, whatsappInbox.empresaId)
      )
    )
    .innerJoin(
      pocCampo,
      and(
        eq(pocCampo.colaboradorId, whatsappInbox.colaboradorId),
        eq(pocCampo.empresaId, whatsappInbox.empresaId)
      )
    )
    .where(
      and(
        eq(whatsappInbox.empresaId, empresaId),
        eq(despesas.notaFiscalId, notaFiscalId),
        eq(whatsappInbox.provider, "dialog360"),
        eq(whatsappInbox.tipoEvento, "comprovante")
      )
    )
    .limit(2);
  if (pessoas.length !== 1) return null;
  const documentos = pessoas[0]!.estado.documentos.filter(
    d => d.notaFiscalId === notaFiscalId && d.hash === nota.hash
  );
  if (documentos.length !== 1 || !documentos[0]!.chave) return null;
  const documento = documentos[0]!;
  const [indice] = await db
    .select({ chave: pocDocumentos.chave })
    .from(pocDocumentos)
    .where(
      and(
        eq(pocDocumentos.id, documento.id),
        eq(pocDocumentos.empresaId, empresaId),
        eq(pocDocumentos.colaboradorId, pessoas[0]!.colaboradorId!),
        eq(pocDocumentos.hash, nota.hash),
        eq(pocDocumentos.chave, documento.chave!)
      )
    )
    .limit(1);
  return indice?.chave ?? null;
}

export async function reservarConsultaNfeIo(
  input: Reserva
): Promise<ResultadoReserva> {
  return getDb().transaction(async tx => {
    const [budget] = await tx
      .select()
      .from(nfeIoOrcamentos)
      .where(eq(nfeIoOrcamentos.id, input.orcamentoId))
      .for("update");
    if (!budget)
      error(
        "PRECONDITION_FAILED",
        "Orçamento NFE.io não provisionado pelo operador."
      );
    const [existing] = await tx
      .select()
      .from(nfeIoConsultas)
      .where(eq(nfeIoConsultas.id, input.id))
      .for("update");
    if (existing) {
      if (
        existing.empresaId !== input.empresaId ||
        existing.notaFiscalId !== input.notaFiscalId ||
        existing.usuarioId !== input.usuarioId ||
        existing.orcamentoId !== input.orcamentoId ||
        existing.chaveHash !== input.chaveHash
      )
        error("FORBIDDEN", "Identificador de consulta indisponível.");
      return { existente: true, resultado: existing.resultado };
    }
    if (
      !Number.isInteger(budget.limite) ||
      budget.limite <= 0 ||
      budget.limite > 20 ||
      budget.usadas >= budget.limite
    )
      error("TOO_MANY_REQUESTS", "Orçamento NFE.io indisponível ou esgotado.");
    await tx.insert(nfeIoConsultas).values({ ...input, status: "reservada" });
    await tx
      .update(nfeIoOrcamentos)
      .set({ usadas: budget.usadas + 1 })
      .where(eq(nfeIoOrcamentos.id, input.orcamentoId));
    return { existente: false, resultado: null };
  });
}
async function concluir(input: Reserva, resultado: ResultadoConsultaNfeIo) {
  const [updated] = await getDb()
    .update(nfeIoConsultas)
    .set({
      resultado,
      status:
        resultado.estado === "timeout_incerto" || resultado.httpStatus === null
          ? "incerta"
          : "concluida",
      concluidaEm: new Date(),
    })
    .where(
      and(
        eq(nfeIoConsultas.id, input.id),
        eq(nfeIoConsultas.empresaId, input.empresaId),
        eq(nfeIoConsultas.usuarioId, input.usuarioId),
        eq(nfeIoConsultas.status, "reservada")
      )
    );
  if (updated.affectedRows !== 1)
    error(
      "INTERNAL_SERVER_ERROR",
      "Resultado não persistido; mantenha o identificador da consulta para conciliação."
    );
}
export const dependenciasPadraoNfeIo: DependenciasConsultaNfeIo = {
  autorizar: assertAdminDaEmpresa,
  chavePersistida,
  reservar: reservarConsultaNfeIo,
  concluir,
  consultar: consultarNfeIo,
  config: () => ({
    habilitado: process.env.NFE_IO_ENABLED === "true",
    apiKey: process.env.API_NFE_IO,
    orcamentoId: process.env.NFE_IO_BUDGET_ID,
  }),
};

/** Autorização vem antes de nota, credencial, orçamento e qualquer rede. */
export async function executarConsultaNfeIo(
  ctx: TrpcContext,
  input: PedidoConsultaNfeIo,
  deps: DependenciasConsultaNfeIo = dependenciasPadraoNfeIo
) {
  if (!ctx.usuario) error("UNAUTHORIZED", "Autenticação necessária.");
  const empresa = await deps.autorizar(ctx, input.empresaId);
  const config = deps.config();
  if (
    !input.confirmarConsulta ||
    !config.habilitado ||
    !config.apiKey ||
    config.apiKey.length > 4096 ||
    /\s/.test(config.apiKey) ||
    /^Bearer/i.test(config.apiKey) ||
    !config.orcamentoId ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(config.orcamentoId)
  )
    error(
      "PRECONDITION_FAILED",
      "Consulta NFE.io não habilitada/configurada pelo operador."
    );
  const chave = await deps.chavePersistida(input.empresaId, input.notaFiscalId);
  if (!chave || !chaveNfe55Valida(chave))
    error(
      "PRECONDITION_FAILED",
      "Nota sem chave NF-e modelo 55 válida e vinculada ao arquivo persistido."
    );
  const cnpjEsperado = empresa.cnpj.replace(/\D/g, "");
  if (!/^\d{14}$/.test(cnpjEsperado))
    error("PRECONDITION_FAILED", "CNPJ da empresa indisponível.");
  const reserva: Reserva = {
    id: input.solicitacaoId,
    empresaId: input.empresaId,
    notaFiscalId: input.notaFiscalId,
    usuarioId: ctx.usuario.id,
    orcamentoId: config.orcamentoId,
    chaveHash: createHash("sha256").update(chave).digest("hex"),
  };
  const previous = await deps.reservar(reserva);
  if (previous.existente)
    return {
      consultaId: reserva.id,
      repetida: true,
      resultado: previous.resultado,
      reconciliacaoNecessaria:
        previous.resultado === null ||
        previous.resultado.estado === "timeout_incerto" ||
        previous.resultado.httpStatus === null,
    };
  const resultado = await deps.consultar({
    chave,
    cnpjEsperado,
    apiKey: config.apiKey,
  });
  await deps.concluir(reserva, resultado);
  return {
    consultaId: reserva.id,
    repetida: false,
    resultado,
    reconciliacaoNecessaria:
      resultado.estado === "timeout_incerto" || resultado.httpStatus === null,
  };
}
