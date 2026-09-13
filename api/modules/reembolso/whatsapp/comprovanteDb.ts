import { and, eq } from "drizzle-orm";
import { colaboradores, despesas, notasFiscais, whatsappInbox } from "../../../../db/schema";
import { getDb } from "../../../queries/connection";
import { prepararComprovanteParaBanco } from "./armazenamento";
import type { PedidoComprovanteWhatsapp } from "./comprovanteRouter";
import { criarChaveIdempotenciaWhatsapp } from "./fila";

export type ResultadoRecebimentoComprovanteWhatsapp = {
  despesaId: number | null;
  situacao: "em_revisao" | "em_processamento";
  idempotente: boolean;
};

export class ErroComprovanteWhatsapp extends Error {
  constructor(message: string, readonly codigo: "VINCULO_INVALIDO" | "PERSISTENCIA") {
    super(message);
  }
}

async function buscarResultadoExistente(chaveIdempotencia: string) {
  const db = getDb();
  const [item] = await db
    .select({ despesaId: whatsappInbox.despesaId, status: whatsappInbox.status })
    .from(whatsappInbox)
    .where(and(eq(whatsappInbox.provider, "dialog360"), eq(whatsappInbox.chaveIdempotencia, chaveIdempotencia)))
    .limit(1);

  if (!item) return null;
  return {
    despesaId: item.despesaId,
    situacao: item.despesaId ? "em_revisao" as const : "em_processamento" as const,
    idempotente: true,
  };
}

/**
 * Persiste a entrada de mídia de modo idempotente. A despesa nasce sempre em
 * revisão: extração OCR e decisão de política são etapas posteriores, nunca
 * uma autorização automática causada por uma simples reentrega do provider.
 */
export async function receberComprovanteWhatsapp(
  pedido: PedidoComprovanteWhatsapp,
): Promise<ResultadoRecebimentoComprovanteWhatsapp> {
  const db = getDb();
  const chaveIdempotencia = criarChaveIdempotenciaWhatsapp({
    provider: "dialog360",
    direcao: "entrada",
    tipoEvento: "comprovante",
    identificadorExterno: pedido.mensagemId,
  });

  const existente = await buscarResultadoExistente(chaveIdempotencia);
  if (existente) return existente;

  const [colaborador] = await db
    .select({ nome: colaboradores.nome, centroCusto: colaboradores.centroCusto })
    .from(colaboradores)
    .where(and(
      eq(colaboradores.id, pedido.colaboradorId),
      eq(colaboradores.empresaId, pedido.empresaId),
      eq(colaboradores.statusVinculo, "ativo"),
    ))
    .limit(1);
  if (!colaborador) {
    throw new ErroComprovanteWhatsapp("Colaborador sem vínculo ativo na empresa.", "VINCULO_INVALIDO");
  }

  // A reserva é a barreira de concorrência. INSERT IGNORE preserva a entrada
  // vencedora quando o provider reentrega a mesma mensagem simultaneamente.
  const reserva = await db.insert(whatsappInbox).ignore().values({
    provider: "dialog360",
    chaveIdempotencia,
    tipoEvento: "comprovante",
    mensagemId: pedido.mensagemId,
    empresaId: pedido.empresaId,
    colaboradorId: pedido.colaboradorId,
    payload: { recebidoEm: pedido.recebidoEm, arquivoNome: pedido.comprovante.arquivoNome },
    status: "processando",
  });
  if (reserva[0].affectedRows === 0) {
    const concorrente = await buscarResultadoExistente(chaveIdempotencia);
    if (concorrente) return concorrente;
    throw new ErroComprovanteWhatsapp("Não foi possível reservar o comprovante.", "PERSISTENCIA");
  }

  try {
    const resultado = await db.transaction(async tx => {
      const arquivo = prepararComprovanteParaBanco(pedido.comprovante);
      const nota = await tx.insert(notasFiscais).values({
        empresaId: pedido.empresaId,
        arquivoNome: pedido.comprovante.arquivoNome,
        arquivoMime: pedido.comprovante.arquivoMime,
        ...arquivo,
        origem: "manual",
      });
      const notaFiscalId = Number(nota[0].insertId);
      const despesa = await tx.insert(despesas).values({
        empresaId: pedido.empresaId,
        notaFiscalId,
        colaborador: colaborador.nome,
        centroCusto: colaborador.centroCusto,
        kmComercial: 0,
        kmNaoComercial: 0,
        valorFiscal: 0,
        valorReembolsavel: 0,
        confianca: "baixa",
        status: "em_revisao",
        motivoRevisao: "Comprovante recebido pelo WhatsApp; aguardando extração e revisão.",
      });
      const despesaId = Number(despesa[0].insertId);
      await tx
        .update(whatsappInbox)
        .set({ despesaId, status: "processado", processadoEm: new Date() })
        .where(and(eq(whatsappInbox.provider, "dialog360"), eq(whatsappInbox.chaveIdempotencia, chaveIdempotencia)));
      return despesaId;
    });
    return { despesaId: resultado, situacao: "em_revisao", idempotente: false };
  } catch {
    await db
      .update(whatsappInbox)
      .set({ status: "falhou", tentativas: 1, ultimoErro: "Falha ao registrar comprovante." })
      .where(and(eq(whatsappInbox.provider, "dialog360"), eq(whatsappInbox.chaveIdempotencia, chaveIdempotencia)));
    throw new ErroComprovanteWhatsapp("Não foi possível registrar o comprovante.", "PERSISTENCIA");
  }
}
