// Import relativo (não `@db/*`): esse alias não existe em vitest.config.ts —
// nenhum router tem teste hoje, então nunca precisou ser resolvido lá.
import { createHash, timingSafeEqual } from "node:crypto";
import { whatsappWebhookEvents, whatsappInbox } from "../../../../db/schema";
import { criarChaveIdempotenciaWhatsapp } from "./fila";
import { getDb } from "../../../queries/connection";

/**
 * Webhook definitivo 360dialog (WhatsApp Business Cloud API) — canal
 * dedicado da plataforma (`+55 21 96848 3003`), evento de PLATAFORMA, não por
 * empresa (sem FK, sem tenant). Este módulo NÃO implementa `WhatsappProvider`
 * e não é wireado em `getWhatsappProvider()` — é ingestão crua, isolada do
 * resto do produto. O ingresso registra inbox durável; o worker separado
 * processa somente remetentes explicitamente habilitados na homologação.
 *
 * Formato do payload (WhatsApp Business Cloud API):
 * {
 *   entry: [{
 *     changes: [{
 *       value: {
 *         metadata: { display_phone_number: "552196483003", ... },
 *         messages?: [{ id, from, type, ... }],
 *         statuses?: [{ id, status: "sent"|"delivered"|"read"|..., recipient_id, ... }],
 *       }
 *     }]
 *   }]
 * }
 */

/** Linha pronta para `insert` em `whatsapp_webhook_events` (sem id/createdAt). */
export interface EventoDialog360 {
  tipoEvento: string;
  statusEntrega: string | null;
  mensagemId: string | null;
  telefone: string | null;
  canalTelefone: string | null;
  payload: unknown;
}

export interface ResultadoWebhookDialog360 {
  status: 200 | 400 | 403 | 503;
  corpo: { received: true } | { error: string };
}

function textoOuNull(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

/**
 * Extrai os eventos (mensagens + statuses) de um payload da 360dialog.
 * Pura, sem I/O: nunca lança — payload malformado em qualquer nível
 * (`null`, `{}`, `entry` ausente/não-array, `changes` não-array, `value`
 * ausente/não-objeto, `messages`/`statuses` não-array, item não-objeto)
 * simplesmente não contribui eventos, sem interromper o resto do payload.
 */
export function extrairEventosDialog360(body: unknown): EventoDialog360[] {
  const eventos: EventoDialog360[] = [];
  if (!body || typeof body !== "object") return eventos;

  const entryList = (body as Record<string, unknown>).entry;
  if (!Array.isArray(entryList)) return eventos;

  for (const entry of entryList) {
    if (!entry || typeof entry !== "object") continue;
    const changes = (entry as Record<string, unknown>).changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as Record<string, unknown>).value;
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;

      const metadata = v.metadata;
      const canalTelefone =
        metadata && typeof metadata === "object"
          ? textoOuNull(
              (metadata as Record<string, unknown>).display_phone_number
            )
          : null;

      const mensagens = v.messages;
      if (Array.isArray(mensagens)) {
        for (const msg of mensagens) {
          if (!msg || typeof msg !== "object") continue;
          const m = msg as Record<string, unknown>;
          eventos.push({
            tipoEvento: "mensagem",
            statusEntrega: null,
            mensagemId: textoOuNull(m.id),
            telefone: textoOuNull(m.from),
            canalTelefone,
            payload: value,
          });
        }
      }

      const statuses = v.statuses;
      if (Array.isArray(statuses)) {
        for (const st of statuses) {
          if (!st || typeof st !== "object") continue;
          const s = st as Record<string, unknown>;
          eventos.push({
            tipoEvento: "status",
            statusEntrega: textoOuNull(s.status),
            mensagemId: textoOuNull(s.id),
            telefone: textoOuNull(s.recipient_id),
            canalTelefone,
            payload: value,
          });
        }
      }
    }
  }

  return eventos;
}

/**
 * Grava inbox deduplicada e log na mesma transação, antes de responder ACK.
 * Sem eventos, não abre conexão nem chama `insert`.
 */
export async function persistirEventosDialog360(
  eventos: EventoDialog360[]
): Promise<void> {
  if (eventos.length === 0) return;
  const db = getDb();
  await db.transaction(async tx => {
    for (const evento of eventos) {
      if (!evento.mensagemId || evento.mensagemId.length > 128)
        throw new Error("Evento sem identificação");
      const chaveIdempotencia = criarChaveIdempotenciaWhatsapp({
        provider: "dialog360",
        direcao: "entrada",
        tipoEvento: `${evento.tipoEvento}:${evento.statusEntrega ?? ""}`,
        identificadorExterno: evento.mensagemId,
      });
      const inserted = await tx
        .insert(whatsappInbox)
        .ignore()
        .values({
          provider: "dialog360",
          chaveIdempotencia,
          mensagemId: evento.mensagemId,
          telefone: evento.telefone,
          tipoEvento: evento.tipoEvento,
          recebidoEm: dataEvento(evento),
          payload: evento.payload,
          status: evento.tipoEvento === "mensagem" ? "pendente" : "processado",
        });
      if (inserted[0].affectedRows > 0)
        await tx.insert(whatsappWebhookEvents).values(evento);
    }
  });
}

function dataEvento(evento: EventoDialog360): Date {
  if (evento.tipoEvento !== "mensagem") return new Date();
  const value = evento.payload as {
    messages?: { id?: unknown; timestamp?: unknown }[];
  };
  const timestamp = value.messages?.find(
    m => m.id === evento.mensagemId
  )?.timestamp;
  const seconds =
    typeof timestamp === "string" && /^\d{1,12}$/.test(timestamp)
      ? Number(timestamp)
      : NaN;
  if (
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    seconds * 1000 > Date.now() + 300_000
  )
    throw new Error("Timestamp inválido");
  return new Date(seconds * 1000);
}

export function autenticarWebhookDialog360(
  recebido: string | null | undefined,
  esperado: string | undefined
): boolean {
  if (!recebido || !esperado?.trim()) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(recebido), hash(esperado));
}

/**
 * ACK somente após commit. Falha de banco retorna 503 para permitir retry;
 * efeitos de negócio e chamadas externas pertencem ao worker separado.
 *
 * Fail-closed: sem `segredoEsperado` configurado no ambiente, a rota fica
 * sempre 403 — diferente do `WHATSAPP_WEBHOOK_SECRET` do Evolution (opcional/
 * aberto quando ausente), porque este é um endpoint público novo cuja ÚNICA
 * defesa é o segredo compartilhado (a 360dialog não documenta HMAC
 * publicamente). O corpo do erro é sempre o mesmo genérico, para não dar
 * pista a quem tenta a rota sem o segredo certo.
 */
export async function processarWebhookDialog360(
  authorization: string | null | undefined,
  body: unknown,
  segredoEsperado: string | undefined
): Promise<ResultadoWebhookDialog360> {
  if (!autenticarWebhookDialog360(authorization, segredoEsperado)) {
    return { status: 403, corpo: { error: "Forbidden" } };
  }

  if (!body || typeof body !== "object")
    return { status: 400, corpo: { error: "Invalid payload" } };
  const eventos = extrairEventosDialog360(body);
  if (
    eventos.length > 100 ||
    eventos.some(
      e =>
        !e.mensagemId ||
        e.mensagemId.length > 128 ||
        (e.telefone?.length ?? 0) > 20
    )
  )
    return { status: 400, corpo: { error: "Invalid payload" } };
  try {
    eventos.forEach(dataEvento);
  } catch {
    return { status: 400, corpo: { error: "Invalid payload" } };
  }
  try {
    await persistirEventosDialog360(eventos);
  } catch {
    return { status: 503, corpo: { error: "Temporarily unavailable" } };
  }

  return { status: 200, corpo: { received: true } };
}
