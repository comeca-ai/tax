import { registrarDecisaoDespesa } from "../decisoes/registro";
import { and, desc, eq } from "drizzle-orm";
import {
  colaboradores,
  empresas,
  politicasReembolso,
  logAuditoria,
  despesas,
  notasFiscais,
  whatsappInbox,
} from "../../../../db/schema";
import { getDb } from "../../../queries/connection";
import { prepararComprovanteParaBanco } from "./armazenamento";
import type { PedidoComprovanteWhatsapp } from "./comprovanteRouter";
import { criarChaveIdempotenciaWhatsapp } from "./fila";
import { pocConfiguracao } from "../../../../db/pocSchema";
import { decidirComprovanteWhatsapp } from "./decisaoComprovante";
import { fiscalDocumentos } from "../../../../db/fiscalSchema";
import {
  exigeRevisaoFiscal,
  ROTULOS_VERIFICACAO_FISCAL,
} from "../../../../contracts/fiscal";
import type { OcrExtracao } from "../../../../contracts/types";
import { identidadeFiscalDoUpload } from "../../fiscal/verificacao/documento";
import { verificarFiscalWhatsapp } from "../../fiscal/verificacao/service";
export type ResultadoRecebimentoComprovanteWhatsapp = {
  despesaId: number | null;
  situacao: "em_revisao" | "em_processamento" | "aprovada" | "rejeitada";
  idempotente: boolean;
};
export class ErroComprovanteWhatsapp extends Error {
  readonly codigo: "VINCULO_INVALIDO" | "PERSISTENCIA" | "DUPLICADO";
  constructor(
    message: string,
    codigo: "VINCULO_INVALIDO" | "PERSISTENCIA" | "DUPLICADO"
  ) {
    super(message);
    this.codigo = codigo;
  }
}

/** Reexecutável após crash; consulta fora dos locks e nunca muda uma decisão humana final. */
export async function finalizarComprovanteFiscalWhatsapp(
  identity: { empresaId: number; colaboradorId: number },
  mensagemId: string
) {
  const db = getDb();
  const [registro] = await db
    .select({
      inboxId: whatsappInbox.id,
      payload: whatsappInbox.payload,
      despesaId: despesas.id,
      notaFiscalId: despesas.notaFiscalId,
    })
    .from(whatsappInbox)
    .innerJoin(
      despesas,
      and(
        eq(despesas.id, whatsappInbox.despesaId),
        eq(despesas.empresaId, whatsappInbox.empresaId)
      )
    )
    .where(
      and(
        eq(whatsappInbox.empresaId, identity.empresaId),
        eq(whatsappInbox.colaboradorId, identity.colaboradorId),
        eq(whatsappInbox.provider, "dialog360"),
        eq(whatsappInbox.tipoEvento, "comprovante"),
        eq(whatsappInbox.mensagemId, mensagemId)
      )
    )
    .limit(1);
  const payload = registro?.payload as
    { fiscalPendente?: boolean; extracao?: OcrExtracao } | undefined;
  if (!registro || !payload?.fiscalPendente) return null;
  const fiscal = await verificarFiscalWhatsapp({
    ...identity,
    notaFiscalId: registro.notaFiscalId,
  });
  if (fiscal.estado === "processando")
    return { situacao: "em_revisao" as const };
  return db.transaction(async tx => {
    const [inbox] = await tx
      .select()
      .from(whatsappInbox)
      .where(eq(whatsappInbox.id, registro.inboxId))
      .for("update");
    const [despesa] = await tx
      .select()
      .from(despesas)
      .where(
        and(
          eq(despesas.id, registro.despesaId),
          eq(despesas.empresaId, identity.empresaId)
        )
      )
      .for("update");
    if (!inbox || !despesa)
      throw new ErroComprovanteWhatsapp(
        "Persistência indisponível",
        "PERSISTENCIA"
      );
    const pendente = (inbox.payload as { fiscalPendente?: boolean })
      ?.fiscalPendente;
    if (!pendente) return null;
    if (despesa.status !== "em_revisao") {
      await tx
        .update(whatsappInbox)
        .set({
          payload: {
            textoResposta: "Comprovante Recebido!",
            fiscalPendente: false,
          },
        })
        .where(eq(whatsappInbox.id, inbox.id));
      return {
        situacao:
          despesa.status === "aprovada"
            ? ("aprovada" as const)
            : despesa.status === "rejeitada"
              ? ("rejeitada" as const)
              : ("em_revisao" as const),
      };
    }
    const [politica] = await tx
      .select()
      .from(politicasReembolso)
      .where(
        and(
          eq(politicasReembolso.empresaId, identity.empresaId),
          eq(politicasReembolso.status, "ativa")
        )
      )
      .orderBy(desc(politicasReembolso.versao))
      .limit(1);
    const [config] = await tx
      .select()
      .from(pocConfiguracao)
      .where(eq(pocConfiguracao.empresaId, identity.empresaId))
      .limit(1);
    const avaliacao = decidirComprovanteWhatsapp(
      payload.extracao ?? undefined,
      politica ?? null,
      config?.configuracao ?? null
    );
    if (exigeRevisaoFiscal(fiscal)) {
      if (avaliacao.decisao.decisao !== "negado")
        avaliacao.decisao.decisao = "revisao_manual";
      if (avaliacao.status === "aprovada") avaliacao.status = "em_revisao";
      avaliacao.decisao.motivos.push(ROTULOS_VERIFICACAO_FISCAL[fiscal.estado]);
      avaliacao.motivo = [
        ...avaliacao.decisao.motivos,
        ...avaliacao.decisao.ressalvas,
      ].join("\n");
    }
    await tx
      .update(despesas)
      .set({
        status: avaliacao.status,
        confianca: avaliacao.decisao.confianca,
        categoria: avaliacao.decisao.categoria,
        politicaDecisao:
          avaliacao.decisao.decisao === "revisao_manual"
            ? "revisao_humana"
            : avaliacao.decisao.decisao,
        politicaMotivo: avaliacao.motivo,
        politicaVersaoAplicada: avaliacao.politicaVersao,
        motivoRevisao:
          avaliacao.status === "em_revisao" ? avaliacao.motivo : null,
      })
      .where(eq(despesas.id, despesa.id));
    await tx
      .insert(logAuditoria)
      .values({
        usuarioId: null,
        empresaId: identity.empresaId,
        acao: "reembolso_decisao",
        entidade: "despesa",
        entidadeId: despesa.id,
        detalhes: JSON.stringify({
          ...avaliacao.decisao,
          modo: avaliacao.modo,
          statusAplicado: avaliacao.status,
          politicaId: politica?.id ?? null,
          origem: "whatsapp",
          colaboradorId: identity.colaboradorId,
          validacaoFiscal: fiscal.estado,
          consultaId: fiscal.consultaId,
        }),
        regraVersao: politica ? `politica-v${politica.versao}` : "sem-politica",
      });
    await tx
      .update(whatsappInbox)
      .set({
        payload: {
          textoResposta: "Comprovante Recebido!",
          fiscalPendente: false,
        },
        status: "processado",
        processadoEm: new Date(),
        ultimoErro: null,
      })
      .where(eq(whatsappInbox.id, inbox.id));
    await registrarDecisaoDespesa(tx,{empresaId:identity.empresaId,despesaId:despesa.id,origemDecisao:"automatica",usuarioId:null,usuarioNome:null,statusAplicado:avaliacao.status,motivo:avaliacao.motivo || "Avaliação automática registrada sem motivo detalhado.",politicaId:politica?.id??null,politicaVersao:avaliacao.politicaVersao,regrasAplicadas:avaliacao.decisao.regrasAplicadas});
    return { situacao: avaliacao.status };
  });
}
/** Reserva, ownership e efeitos ficam na mesma transação: rollback permite retry. */
export async function receberComprovanteWhatsapp(
  pedido: PedidoComprovanteWhatsapp
): Promise<ResultadoRecebimentoComprovanteWhatsapp> {
  const db = getDb();
  const chaveIdempotencia = criarChaveIdempotenciaWhatsapp({
    provider: "dialog360",
    direcao: "entrada",
    tipoEvento: "comprovante",
    identificadorExterno: pedido.mensagemId,
  });
  const reservado = await db.transaction(async tx => {
    const [colaborador] = await tx
      .select()
      .from(colaboradores)
      .where(
        and(
          eq(colaboradores.id, pedido.colaboradorId),
          eq(colaboradores.empresaId, pedido.empresaId),
          eq(colaboradores.statusVinculo, "ativo")
        )
      )
      .for("update");
    if (!colaborador)
      throw new ErroComprovanteWhatsapp("Vínculo inválido", "VINCULO_INVALIDO");
    // Serializa documentos da empresa, inclusive remetentes diferentes.
    // O lock cobre consulta de checksum + criação da nota/despesa.
    await tx
      .select({ id: empresas.id })
      .from(empresas)
      .where(eq(empresas.id, pedido.empresaId))
      .for("update");
    await tx.insert(whatsappInbox).ignore().values({
      provider: "dialog360",
      chaveIdempotencia,
      tipoEvento: "comprovante",
      recebidoEm: pedido.recebidoEm && Number.isFinite(Date.parse(pedido.recebidoEm)) ? new Date(pedido.recebidoEm) : new Date(),
      mensagemId: pedido.mensagemId,
      empresaId: pedido.empresaId,
      colaboradorId: pedido.colaboradorId,
      payload: {},
      status: "pendente",
    });
    const [item] = await tx
      .select()
      .from(whatsappInbox)
      .where(
        and(
          eq(whatsappInbox.provider, "dialog360"),
          eq(whatsappInbox.chaveIdempotencia, chaveIdempotencia)
        )
      )
      .for("update");
    if (
      !item ||
      item.empresaId !== pedido.empresaId ||
      item.colaboradorId !== pedido.colaboradorId
    )
      throw new ErroComprovanteWhatsapp("Vínculo inválido", "VINCULO_INVALIDO");
    if (item.despesaId)
      return {
        despesaId: item.despesaId,
        situacao: "em_revisao" as const,
        idempotente: true,
        pendenteFiscal: Boolean(
          (item.payload as { fiscalPendente?: boolean } | null)?.fiscalPendente
        ),
      };
    if (item.status === "cancelado")
      throw new ErroComprovanteWhatsapp("Registro cancelado", "PERSISTENCIA");
    // Registros legados com processamento recente não são tomados de outro worker.
    if (
      item.status === "processando" &&
      item.processandoEm &&
      Date.now() - item.processandoEm.getTime() < 300_000
    )
      return {
        despesaId: null,
        situacao: "em_processamento" as const,
        idempotente: true,
      };
    const arquivo = prepararComprovanteParaBanco(pedido.comprovante);
    const [duplicado] = await tx
      .select({ id: notasFiscais.id })
      .from(notasFiscais)
      .where(
        and(
          eq(notasFiscais.empresaId, pedido.empresaId),
          eq(notasFiscais.arquivoChecksum, arquivo.arquivoChecksum)
        )
      )
      .limit(1);
    if (duplicado)
      throw new ErroComprovanteWhatsapp(
        "Este comprovante já foi registrado na empresa.",
        "DUPLICADO"
      );
    const ocr = pedido.extracao;
    const nota = await tx.insert(notasFiscais).values({
      empresaId: pedido.empresaId,
      arquivoNome: pedido.comprovante.arquivoNome,
      arquivoMime: pedido.comprovante.arquivoMime,
      ...arquivo,
      origem: ocr ? "ocr" : "manual",
      cnpjEmitente: ocr?.cnpjEmitente,
      cfop: ocr?.cfop,
      ncm: ocr?.ncm,
      cst: ocr?.cst,
      valor: ocr?.valor,
      dataFatoGerador: ocr?.dataFatoGerador,
      litros: ocr?.litros,
      categoriaSugerida: ocr?.categoriaSugerida,
      tipoDocumento: ocr?.tipoDocumento,
      confiancaTipo: ocr?.confiancaTipo,
    });
    const notaFiscalId = Number(nota[0].insertId);
    const identidadeFiscal = identidadeFiscalDoUpload(
      arquivo.arquivoBase64,
      ocr?.chaveAcesso
    );
    await tx
      .insert(fiscalDocumentos)
      .values({
        notaFiscalId,
        empresaId: pedido.empresaId,
        usuarioId: null,
        colaboradorId: colaborador.id,
        chave: identidadeFiscal.chave,
        chaveEstado: identidadeFiscal.chaveEstado,
        hash: identidadeFiscal.hash,
      });
    const despesa = await tx.insert(despesas).values({
      empresaId: pedido.empresaId,
      notaFiscalId,
      colaborador: colaborador.nome,
      centroCusto: colaborador.centroCusto,
      kmComercial: 0,
      kmNaoComercial: 0,
      valorFiscal: 0,
      confianca: ocr?.confiancaExtracao ?? "baixa",
      categoria: ocr?.categoriaSugerida ?? null,
      status: "em_revisao",
      valorReembolsavel: ocr?.valor ?? 0,
      politicaDecisao: "revisao_humana",
      motivoRevisao: "Aguardando conferência fiscal e aplicação da política.",
    });
    const despesaId = Number(despesa[0].insertId);
    await tx
      .update(whatsappInbox)
      .set({
        despesaId,
        payload: {
          textoResposta: "Comprovante Recebido!",
          fiscalPendente: true,
          extracao: ocr ?? null,
        },
        status: "processado",
        processadoEm: new Date(),
        ultimoErro: null,
      })
      .where(eq(whatsappInbox.id, item.id));
    return {
      despesaId,
      situacao: "em_revisao" as const,
      idempotente: false,
      pendenteFiscal: true,
    };
  });
  const finalizado =
    reservado.despesaId &&
    "pendenteFiscal" in reservado &&
    reservado.pendenteFiscal
      ? await finalizarComprovanteFiscalWhatsapp(pedido, pedido.mensagemId)
      : null;
  return {
    despesaId: reservado.despesaId,
    situacao: finalizado?.situacao ?? reservado.situacao,
    idempotente: reservado.idempotente,
  };
}
