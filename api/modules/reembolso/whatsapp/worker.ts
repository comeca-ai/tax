import { incluirConvidadosPermitidos } from "./convidadosPermitidos";
import { and, asc, eq, gt, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  whatsappInbox,
  whatsappOutbox,
  colaboradores,
  despesas,
  notasFiscais,
} from "../../../../db/schema";
import { pocCampo } from "../../../../db/pocSchema";
import type { OcrExtracao } from "../../../../contracts/types";
import { getDb } from "../../../queries/connection";
import { criarChaveIdempotenciaWhatsapp } from "./fila";
import { createDialog360Transport } from "./dialog360Transport";
import { resolverColaboradoresPorTelefone } from "./identificacaoDb";
import {
  ErroComprovanteWhatsapp,
  receberComprovanteWhatsapp,
  finalizarComprovanteFiscalWhatsapp,
} from "./comprovanteDb";
import { getOcrProvider } from "../../fiscal/ocr";
import { interpretarMensagemCampo } from "../campo/servico";
import { importarDocumentoCampo } from "../campo/documentos";
import {
  executarCicloLembretesCampo,
  validarLembreteCampo,
} from "../campo/lembretes";
import type { EstadoCampo } from "../campo/dominio";
import { remetentePermitido, resolverRemetenteCanal } from "./remetenteCanal";
import { ReservaConsultaPocIndisponivel, saldoChamadasPoc } from "../../../lib/pocConsultas";

export type IdentidadeWhatsapp = {
  empresaId: number;
  colaboradorId: number;
  telefone: string;
};
export type MensagemCampo = {
  id: string;
  type: string;
  text?: { body?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string; accuracy?: number };
  timestamp?: string;
};
export type TratarCampo = (
  identidade: IdentidadeWhatsapp,
  mensagem: MensagemCampo
) => Promise<string | null>;
export type ValidarEnvio = (
  identity: IdentidadeWhatsapp,
  referencia: string
) => Promise<boolean>;
type Db = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const tratarMensagemCampo: TratarCampo = async (identity, message) =>
  (
    await interpretarMensagemCampo(identity, {
      ...message,
      text: message.text?.body,
      timestamp: message.timestamp ?? "",
    })
  )?.textoResposta ?? null;

/** Só contexto explicitamente aberto/pendente; última placa histórica não é autorização. */
export function selecionarVeiculoCampo(
  estado: EstadoCampo | undefined,
  agora = Date.now()
): string | null {
  if (!estado) return null;
  const abertas = estado.jornadas.filter(
    j => j.pontos.at(-1)?.tipo !== "check_out"
  );
  if (abertas.length > 1) return null;
  if (abertas.length === 1) return abertas[0]!.veiculo;
  const pendente = estado.conversa?.pendente;
  return pendente && pendente.fluxo !== "presenca" && Date.parse(pendente.expiraEm) > agora
    ? pendente.veiculo
    : null;
}

async function localizarMidiaPersistida(
  identity: IdentidadeWhatsapp,
  mensagemId: string
) {
  const [row] = await getDb()
    .select({
      payload: whatsappInbox.payload,
      despesaId: despesas.id,
      notaFiscalId: notasFiscais.id,
      cnpjEmitente: notasFiscais.cnpjEmitente,
      cfop: notasFiscais.cfop,
      ncm: notasFiscais.ncm,
      cst: notasFiscais.cst,
      valor: notasFiscais.valor,
      dataFatoGerador: notasFiscais.dataFatoGerador,
      litros: notasFiscais.litros,
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
      notasFiscais,
      and(
        eq(notasFiscais.id, despesas.notaFiscalId),
        eq(notasFiscais.empresaId, despesas.empresaId)
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
  if (!row) return null;
  const extracao: OcrExtracao = {
    ...row,
    categoriaSugerida: null,
    confiancaExtracao: "baixa",
    camposPendentes: ["conferenciaExtracaoPersistida"],
    provedor: "persistido-sem-nova-consulta",
    avisos: [
      "Recuperação de processamento; campos não persistidos permanecem pendentes.",
    ],
  };
  const payload = row.payload as { textoResposta?: unknown };
  return {
    despesaId: row.despesaId,
    notaFiscalId: row.notaFiscalId,
    extracao,
    resposta:
      typeof payload.textoResposta === "string" ? payload.textoResposta : null,
  };
}

async function localizarVeiculoCampo(identity: IdentidadeWhatsapp) {
  const [row] = await getDb()
    .select({ estado: pocCampo.estado })
    .from(pocCampo)
    .where(
      and(
        eq(pocCampo.empresaId, identity.empresaId),
        eq(pocCampo.colaboradorId, identity.colaboradorId)
      )
    )
    .limit(1);
  return selecionarVeiculoCampo(row?.estado);
}

type DependenciasMidia = {
  localizar: typeof localizarMidiaPersistida;
  download: ReturnType<typeof createDialog360Transport>["downloadMedia"];
  extrair: ReturnType<typeof getOcrProvider>["extrair"];
  registrar: typeof receberComprovanteWhatsapp;
  veiculo: typeof localizarVeiculoCampo;
  importar: typeof importarDocumentoCampo;
  finalizar: typeof finalizarComprovanteFiscalWhatsapp;
};

/** Reusa a extração da primeira chamada também na conciliação; retry não consulta OCR de novo. */
export async function processarMidiaCampo(
  identity: IdentidadeWhatsapp,
  message: { id: string; mediaId: string; filename?: string },
  recebidoEm: Date,
  deps: DependenciasMidia
): Promise<string> {
  let registro = await deps.localizar(identity, message.id);
  if (registro) await deps.finalizar(identity, message.id);
  let extracao = registro?.extracao;
  if (!registro) {
    const comprovante = await deps.download(message.mediaId, message.filename);
    extracao = await deps.extrair({
      arquivoNome: comprovante.arquivoNome,
      arquivoMime: comprovante.arquivoMime,
      arquivoBase64: comprovante.conteudo.toString("base64"),
    });
    let result;
    try {
      result = await deps.registrar({
        ...identity,
        mensagemId: message.id,
        recebidoEm: recebidoEm.toISOString(),
        comprovante,
        extracao,
      });
    } catch (erro) {
      if (
        erro instanceof ErroComprovanteWhatsapp &&
        erro.codigo === "DUPLICADO"
      )
        return "Comprovante Recebido!";
      throw erro;
    }
    if (!result.despesaId) throw new Error("Comprovante em processamento");
    registro = await deps.localizar(identity, message.id);
    if (!registro || registro.despesaId !== result.despesaId)
      throw new Error("Vínculo de comprovante indisponível");
  }
  const veiculo = await deps.veiculo(identity);
  if (veiculo && extracao) {
    await deps.importar(
      identity,
      { notaFiscalId: registro.notaFiscalId, veiculo },
      { nome: "extracao-reutilizada", extrair: async () => extracao! }
    );
  }
  return "Comprovante Recebido!";
}

/** Idempotência estável; chamada permitida também pela revisão humana. */
export async function enfileirarRespostaWhatsapp(
  identity: IdentidadeWhatsapp,
  referencia: string,
  texto: string,
  recebidoEm: Date,
  connection?: Transaction
) {
  const db = connection ?? getDb();
  const [vinculo] = await db
    .select({ id: colaboradores.id })
    .from(colaboradores)
    .where(
      and(
        eq(colaboradores.id, identity.colaboradorId),
        eq(colaboradores.empresaId, identity.empresaId),
        eq(colaboradores.telefone, identity.telefone),
        eq(colaboradores.statusVinculo, "ativo")
      )
    );
  if (!vinculo) throw new Error("Vínculo inválido");
  const chaveIdempotencia = criarChaveIdempotenciaWhatsapp({
    provider: "dialog360",
    direcao: "saida",
    tipoEvento: "resposta",
    identificadorExterno: `${identity.empresaId}:${identity.colaboradorId}:${referencia}`,
  });
  await db
    .insert(whatsappOutbox)
    .ignore()
    .values({
      ...identity,
      provider: "dialog360",
      chaveIdempotencia,
      tipoMensagem: "text",
      payload: { texto, referencia, recebidoEm: recebidoEm.toISOString() },
    });
}

export function telefonesPermitidos(
  valor = process.env.WHATSAPP_POC_ALLOWED_PHONES
): Set<string> {
  return new Set(
    (valor ?? "")
      .split(",")
      .map(p => p.trim())
      .filter(p => /^[1-9]\d{7,14}$/.test(p))
  );
}
export function whatsappPocHabilitado(): boolean {
  return (
    process.env.WHATSAPP_POC_ENABLED === "true" &&
    Boolean(process.env.DIALOG_360_API_KEY?.trim()) &&
    Boolean(process.env.DIALOG_360_WEBHOOK_SECRET?.trim()) &&
    telefonesPermitidos().size > 0
  );
}
export function selecionarIdentidadeUnica<
  T extends { empresaId: number; colaboradorId: number; situacao: string },
>(rows: T[]): T | null {
  const unicos = new Map(
    rows
      .filter(r => r.situacao === "ativo")
      .map(r => [`${r.empresaId}:${r.colaboradorId}`, r])
  );
  return unicos.size === 1 ? [...unicos.values()][0]! : null;
}

export async function executarCicloWhatsapp(
  tratarCampo?: TratarCampo,
  validarEnvio?: ValidarEnvio
) {
  if (!whatsappPocHabilitado() || !process.env.DIALOG_360_API_KEY) return;
  const allowed = await incluirConvidadosPermitidos(telefonesPermitidos());
  if (!allowed.size) return;
  const db = getDb();
  const transport = createDialog360Transport(process.env.DIALOG_360_API_KEY);
  const now = new Date();
  const stale = new Date(now.getTime() - 300_000);
  // Crash na última tentativa deve terminar observavelmente, nunca travar processando.
  await db
    .update(whatsappInbox)
    .set({
      status: "esgotado",
      ultimoErro: "Tentativas esgotadas; revisão operacional necessária",
    })
    .where(
      and(
        eq(whatsappInbox.provider, "dialog360"),
        eq(whatsappInbox.tipoEvento, "mensagem"),
        gte(whatsappInbox.tentativas, 5),
        or(
          eq(whatsappInbox.status, "falhou"),
          and(
            eq(whatsappInbox.status, "processando"),
            or(
              isNull(whatsappInbox.processandoEm),
              lt(whatsappInbox.processandoEm, stale)
            )
          )
        )
      )
    );
  const item = await db.transaction(async tx => {
    const [row] = await tx
      .select()
      .from(whatsappInbox)
      .where(
        and(
          eq(whatsappInbox.provider, "dialog360"),
          eq(whatsappInbox.tipoEvento, "mensagem"),
          lt(whatsappInbox.tentativas, 5),
          or(
            and(
              or(
                eq(whatsappInbox.status, "pendente"),
                eq(whatsappInbox.status, "falhou")
              ),
              or(
                isNull(whatsappInbox.proximaTentativaAt),
                lte(whatsappInbox.proximaTentativaAt, now)
              )
            ),
            and(
              eq(whatsappInbox.status, "processando"),
              lt(whatsappInbox.processandoEm, stale)
            )
          )
        )
      )
      .orderBy(asc(whatsappInbox.id))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) return null;
    const tipo = (row.payload as { messages?: { type?: string }[] })?.messages?.[0]?.type;
    if (saldoChamadasPoc() < (tipo === "image" || tipo === "document" ? 4 : 1)) return null;
    await tx
      .update(whatsappInbox)
      .set({
        status: "processando",
        processandoEm: now,
        tentativas: row.tentativas + 1,
      })
      .where(eq(whatsappInbox.id, row.id));
    return row;
  });
  if (item) {
    const fence = and(
      eq(whatsappInbox.id, item.id),
      eq(whatsappInbox.status, "processando"),
      eq(whatsappInbox.tentativas, item.tentativas + 1)
    );
    try {
      if (!item.telefone || !remetentePermitido(item.telefone, allowed)) {
        await db
          .update(whatsappInbox)
          .set({
            status: "cancelado",
            ultimoErro: "Remetente fora da homologação autorizada",
          })
          .where(fence);
      } else {
        const identity = await resolverRemetenteCanal(item.telefone, allowed, resolverColaboradoresPorTelefone);
        if (!identity) {
          await db
            .update(whatsappInbox)
            .set({
              status: "cancelado",
              ultimoErro: "Identidade ausente ou ambígua",
            })
            .where(fence);
        } else {
          const value = item.payload as {
            messages?: (MensagemCampo & {
              image?: { id: string };
              document?: { id: string; filename?: string };
            })[];
          };
          const message = value.messages?.find(m => m.id === item.mensagemId);
          if (!message) throw new Error("Mensagem inválida");
          const sender: IdentidadeWhatsapp = {
            ...identity,
            telefone: identity.telefoneCadastro,
          };
          let resposta: string | null = tratarCampo
            ? await tratarCampo(sender, message)
            : null;
          const media =
            message.type === "image"
              ? message.image
              : message.type === "document"
                ? message.document
                : null;
          if (media && !resposta) {
            await enfileirarRespostaWhatsapp(sender, message.id, "Comprovante Recebido!", item.recebidoEm);
            await enviarProximaRespostaWhatsapp(validarEnvio);
            resposta = await processarMidiaCampo(
              sender,
              {
                id: message.id,
                mediaId: media.id,
                filename:
                  "filename" in media && typeof media.filename === "string"
                    ? media.filename
                    : undefined,
              },
              item.recebidoEm,
              {
                localizar: localizarMidiaPersistida,
                download: transport.downloadMedia,
                extrair: arquivo => getOcrProvider().extrair(arquivo),
                registrar: receberComprovanteWhatsapp,
                veiculo: localizarVeiculoCampo,
                importar: importarDocumentoCampo,
                finalizar: finalizarComprovanteFiscalWhatsapp,
              }
            );
          }
          resposta ??=
            "Envie um comprovante em PDF, JPG ou PNG para registrar sua despesa em revisão.";
          await enfileirarRespostaWhatsapp(
            sender,
            message.id,
            resposta,
            item.recebidoEm
          );
          await db
            .update(whatsappInbox)
            .set({
              empresaId: identity.empresaId,
              colaboradorId: identity.colaboradorId,
              status: "processado",
              processadoEm: new Date(),
              ultimoErro: null,
            })
            .where(fence);
        }
      }
    } catch {
      await db
        .update(whatsappInbox)
        .set({
          status: item.tentativas + 1 >= 5 ? "esgotado" : "falhou",
          ultimoErro: "Falha de processamento; verificar por ID técnico",
          proximaTentativaAt: new Date(
            Date.now() + 30_000 * 2 ** item.tentativas
          ),
        })
        .where(fence);
    }
  }
  await enviarProximaRespostaWhatsapp(validarEnvio);
}

/** Fila de saída independente de OCR e consultas fiscais. */
export async function enviarProximaRespostaWhatsapp(validarEnvio?: ValidarEnvio) {
  if (!whatsappPocHabilitado() || !process.env.DIALOG_360_API_KEY) return;
  if (saldoChamadasPoc() < 1) return;
  const db = getDb();
  const allowed = await incluirConvidadosPermitidos(telefonesPermitidos());
  const transport = createDialog360Transport(process.env.DIALOG_360_API_KEY);
  const now = new Date();
  const stale = new Date(now.getTime() - 300_000);
  // Um POST cujo resultado se perdeu pode ter sido entregue. Nunca reenviar automaticamente.
  await db
    .update(whatsappOutbox)
    .set({
      status: "incerto",
      ultimoErro: "Envio interrompido; conciliação manual necessária",
    })
    .where(
      and(
        eq(whatsappOutbox.provider, "dialog360"),
        eq(whatsappOutbox.tipoMensagem, "text"),
        eq(whatsappOutbox.status, "processando"),
        lt(whatsappOutbox.processandoEm, stale)
      )
    );
  const outgoing = await db.transaction(async tx => {
    const [row] = await tx
      .select()
      .from(whatsappOutbox)
      .where(
        and(
          eq(whatsappOutbox.provider, "dialog360"),
          eq(whatsappOutbox.tipoMensagem, "text"),
          eq(whatsappOutbox.status, "pendente")
        )
      )
      .orderBy(asc(whatsappOutbox.id))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) return null;
    await tx
      .update(whatsappOutbox)
      .set({
        status: "processando",
        processandoEm: now,
        tentativas: sql`${whatsappOutbox.tentativas} + 1`,
      })
      .where(eq(whatsappOutbox.id, row.id));
    return row;
  });
  if (outgoing) {
    try {
      const payload = outgoing.payload as {
        referencia?: string;
        texto?: string;
        recebidoEm?: string;
      };

      const [active] = await db
        .select({ id: colaboradores.id })
        .from(colaboradores)
        .where(
          and(
            eq(colaboradores.id, outgoing.colaboradorId),
            eq(colaboradores.empresaId, outgoing.empresaId),
            eq(colaboradores.telefone, outgoing.telefone),
            eq(colaboradores.statusVinculo, "ativo")
          )
        );
      const specificAllowed =
        !payload.referencia?.startsWith("campo:") ||
        Boolean(
          validarEnvio && (await validarEnvio(outgoing, payload.referencia))
        );
      if (
        !specificAllowed ||
        !active ||
        !allowed.has(outgoing.telefone) ||
        !dentroDaJanelaDeResposta(payload.recebidoEm) ||
        !payload.texto
      ) {
        await db
          .update(whatsappOutbox)
          .set({
            status: "cancelado",
            ultimoErro: "Envio não autorizado ou janela de conversa expirada",
          })
          .where(eq(whatsappOutbox.id, outgoing.id));
      } else {
        const id = await transport.sendText(outgoing.telefone, payload.texto);
        await db
          .update(whatsappOutbox)
          .set({
            status: "enviado",
            providerMensagemId: id,
            enviadoEm: new Date(),
          })
          .where(eq(whatsappOutbox.id, outgoing.id));
      }
    } catch (error) {
      await db
        .update(whatsappOutbox)
        .set({
          status: error instanceof ReservaConsultaPocIndisponivel ? "pendente" : "incerto",
          ultimoErro: error instanceof ReservaConsultaPocIndisponivel ? "Aguardando saldo autorizado; envio não iniciado" : "Resultado de envio incerto; não reenviar sem conciliar",
        })
        .where(eq(whatsappOutbox.id, outgoing.id));
    }
  }
}

export function dentroDaJanelaDeResposta(recebidoEm: string | undefined, agora = Date.now()): boolean {
  const age = agora - Date.parse(recebidoEm ?? "");
  return Number.isFinite(age) && age >= 0 && age < 24 * 3600_000;
}

/** Confirma recebimento persistido; o processamento documental continua pela inbox. */
export async function enfileirarConfirmacoesComprovante(cursor = 0): Promise<number> {
  if (!whatsappPocHabilitado()) return 0;
  const allowed = await incluirConvidadosPermitidos(telefonesPermitidos());
  const rows = await getDb().select().from(whatsappInbox).where(and(
    eq(whatsappInbox.provider, "dialog360"),
    eq(whatsappInbox.tipoEvento, "mensagem"),
    gt(whatsappInbox.id, cursor),
    gte(whatsappInbox.recebidoEm, new Date(Date.now() - 24 * 3600_000)),
    sql`JSON_UNQUOTE(JSON_EXTRACT(${whatsappInbox.payload}, '$.messages[0].type')) IN ('image','document')`,
    sql`NOT EXISTS (SELECT 1 FROM whatsapp_outbox o WHERE o.provider = 'dialog360' AND o.tipo_mensagem = 'text' AND JSON_UNQUOTE(JSON_EXTRACT(o.payload, '$.referencia')) = ${whatsappInbox.mensagemId})`
  )).orderBy(asc(whatsappInbox.id)).limit(20);
  for (const row of rows) {
    if (!row.telefone || !row.mensagemId || !dentroDaJanelaDeResposta(row.recebidoEm.toISOString())) continue;
    const identity = await resolverRemetenteCanal(row.telefone, allowed, resolverColaboradoresPorTelefone);
    if (!identity) continue;
    await enfileirarRespostaWhatsapp({ ...identity, telefone: identity.telefoneCadastro }, row.mensagemId, "Comprovante Recebido!", row.recebidoEm);
  }
  return rows.length === 20 ? rows.at(-1)!.id : 0;
}

export function criarCicloSerialWhatsapp(deps: {
  habilitado: () => boolean;
  processar: () => Promise<void>;
  lembretes: (cursor: number) => Promise<{ proximoCursor: number }>;
  agora?: () => number;
}) {
  let running = false;
  let cursor = 0;
  let proximoScanner = 0;
  return async () => {
    if (running || !deps.habilitado()) return;
    running = true;
    try {
      await deps.processar();
      const agora = (deps.agora ?? Date.now)();
      if (agora >= proximoScanner && deps.habilitado()) {
        proximoScanner = agora + 60_000;
        cursor = (await deps.lembretes(cursor)).proximoCursor;
      }
    } finally {
      running = false;
    }
  };
}

export function iniciarWorkerWhatsapp(
  tratarCampo: TratarCampo = tratarMensagemCampo,
  validarEnvio: ValidarEnvio = validarLembreteCampo
) {
  let stopped = false;
  const ciclo = criarCicloSerialWhatsapp({
    habilitado: () => !stopped && whatsappPocHabilitado(),
    processar: () => executarCicloWhatsapp(tratarCampo, validarEnvio),
    lembretes: cursor =>
      executarCicloLembretesCampo(async (...args) => {
        if (
          !whatsappPocHabilitado() ||
          !telefonesPermitidos().has(args[0].telefone)
        )
          throw new Error("Destinatário fora do piloto");
        await enfileirarRespostaWhatsapp(...args);
      }, cursor),
  });
  let confirmando = false, cursorConfirmacoes = 0;
  const timerConfirmacoes = setInterval(() => {
    if (stopped || confirmando || !whatsappPocHabilitado()) return;
    confirmando = true;
    void enfileirarConfirmacoesComprovante(cursorConfirmacoes)
      .then(async cursor => { cursorConfirmacoes = cursor; await enviarProximaRespostaWhatsapp(validarEnvio); })
      .catch(() => console.error("[whatsapp] Fila de confirmação indisponível"))
      .finally(() => { confirmando = false; });
  }, 1_000);
  timerConfirmacoes.unref();
  const timer = setInterval(() => {
    void ciclo().catch(() => console.error("[whatsapp] Ciclo indisponível"));
  }, 2_000);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
    clearInterval(timerConfirmacoes);
  };
}
