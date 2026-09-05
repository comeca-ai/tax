// Import relativo (não `@db/*`): esse alias não existe em vitest.config.ts —
// nenhum router tem teste hoje, então nunca precisou ser resolvido lá.
import { whatsappWebhookEvents } from "../../../../db/schema";
import { getDb } from "../../../queries/connection";

/**
 * Webhook definitivo 360dialog (WhatsApp Business Cloud API) — canal
 * dedicado da plataforma (`+55 21 96848 3003`), evento de PLATAFORMA, não por
 * empresa (sem FK, sem tenant). Este módulo NÃO implementa `WhatsappProvider`
 * e não é wireado em `getWhatsappProvider()` — é ingestão crua, isolada do
 * resto do produto (D-020). Zero decisão/roteamento de negócio (D-013/D-014).
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
  status: 200 | 403;
  corpo: { received: true } | { error: "Forbidden" };
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
          ? textoOuNull((metadata as Record<string, unknown>).display_phone_number)
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
 * Grava os eventos extraídos em `whatsapp_webhook_events`. Best-effort: quem
 * chama nunca aguarda esta função antes de responder à 360dialog (ver
 * `processarWebhookDialog360`) — falha aqui só vai para `console.error`.
 * Sem eventos, não abre conexão nem chama `insert`.
 */
export async function persistirEventosDialog360(
  eventos: EventoDialog360[],
): Promise<void> {
  if (eventos.length === 0) return;
  const db = getDb();
  await db.insert(whatsappWebhookEvents).values(eventos);
}

/**
 * Decide a resposta ao webhook e dispara a persistência em segundo plano.
 * Síncrona de propósito (não é `async`): o 200 nunca espera a extração nem a
 * gravação no banco — é isso que garante o SLA de <5s mesmo com o MySQL
 * lento. A 360dialog só reenvia (retry) quando a resposta não é 2xx, então
 * todo 200 — mesmo com payload malformado — encerra o retry dela.
 *
 * Fail-closed: sem `segredoEsperado` configurado no ambiente, a rota fica
 * sempre 403 — diferente do `WHATSAPP_WEBHOOK_SECRET` do Evolution (opcional/
 * aberto quando ausente), porque este é um endpoint público novo cuja ÚNICA
 * defesa é o segredo compartilhado (a 360dialog não documenta HMAC
 * publicamente). O corpo do erro é sempre o mesmo genérico, para não dar
 * pista a quem tenta a rota sem o segredo certo.
 */
export function processarWebhookDialog360(
  authorization: string | null | undefined,
  body: unknown,
  segredoEsperado: string | undefined,
): ResultadoWebhookDialog360 {
  if (!segredoEsperado || authorization !== segredoEsperado) {
    return { status: 403, corpo: { error: "Forbidden" } };
  }

  const eventos = extrairEventosDialog360(body);
  if (eventos.length > 0) {
    const mensagens = eventos.filter(e => e.tipoEvento === "mensagem").length;
    const statuses = eventos.filter(e => e.tipoEvento === "status").length;
    console.log(
      `[360dialog] evento recebido — ${mensagens} mensagem(ns), ${statuses} status(es)`,
    );
    void persistirEventosDialog360(eventos).catch(err => {
      console.error("[360dialog] Falha ao persistir evento:", err);
    });
  }

  return { status: 200, corpo: { received: true } };
}
