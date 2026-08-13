import type { MensagemRecebida, WhatsappProvider } from "./types";

/**
 * Provider Evolution API (D-010/D-011): stack separado self-hosted na VPS.
 * Envio: POST {url}/message/sendText/{instance} com header `apikey`.
 * Recebimento: webhook event "messages.upsert" → parseEvolutionPayload().
 *
 * Referência do payload (v2):
 * {
 *   event: "messages.upsert",
 *   instance: "reembolsa",
 *   data: {
 *     key: { remoteJid: "5511...@s.whatsapp.net", fromMe: false, id: "ABCD" },
 *     pushName: "João",
 *     message: { conversation: "oi" } | { extendedTextMessage: { text } } |
 *              { imageMessage: {...} } | ...
 *   }
 * }
 */

export interface EvolutionConfig {
  apiUrl: string;
  apiKey: string;
  instance: string;
}

/** Remove sufixos do JID e deixa só dígitos: "5511..@s.whatsapp.net" → "5511.." */
export function telefoneDoJid(jid: string | undefined | null): string {
  if (!jid) return "";
  return jid.split("@")[0].replace(/\D/g, "");
}

function tipoDaMensagem(
  message: Record<string, unknown>,
): MensagemRecebida["tipo"] {
  if ("imageMessage" in message) return "imagem";
  if ("audioMessage" in message || "pttMessage" in message) return "audio";
  if ("documentMessage" in message) return "documento";
  if ("conversation" in message || "extendedTextMessage" in message) return "texto";
  return "outro";
}

function textoDaMensagem(message: Record<string, unknown>): string {
  const conversation = message.conversation;
  if (typeof conversation === "string") return conversation.trim();
  const extended = message.extendedTextMessage as { text?: unknown } | undefined;
  if (extended && typeof extended.text === "string") return extended.text.trim();
  const image = message.imageMessage as { caption?: unknown } | undefined;
  if (image && typeof image.caption === "string") return image.caption.trim();
  return "";
}

/**
 * Normaliza o webhook do Evolution em MensagemRecebida.
 * Retorna null para eventos que não são mensagem recebida de pessoa física:
 * - eventos diferentes de "messages.upsert"
 * - mensagens enviadas por nós (fromMe)
 * - grupos (@g.us), broadcasts (status@broadcast) e canais
 * - payload malformado
 */
export function parseEvolutionPayload(
  body: unknown,
): MensagemRecebida | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as Record<string, unknown>;
  if (payload.event !== "messages.upsert") return null;

  const data = payload.data as Record<string, unknown> | undefined;
  const key = data?.key as Record<string, unknown> | undefined;
  const message = data?.message as Record<string, unknown> | undefined;
  if (!key || !message) return null;
  if (key.fromMe === true) return null;

  const remoteJid = typeof key.remoteJid === "string" ? key.remoteJid : "";
  if (!remoteJid.endsWith("@s.whatsapp.net")) return null; // grupos/broadcast/canais

  const telefone = telefoneDoJid(remoteJid);
  if (!telefone) return null;

  return {
    telefone,
    texto: textoDaMensagem(message),
    tipo: tipoDaMensagem(message),
    mensagemId: typeof key.id === "string" ? key.id : undefined,
    nomeContato:
      typeof data.pushName === "string" ? (data.pushName as string) : undefined,
  };
}

/** Cria o provider de envio do Evolution. */
export function createEvolutionProvider(
  config: EvolutionConfig,
): WhatsappProvider {
  const base = config.apiUrl.replace(/\/+$/, "");
  return {
    nome: "evolution",
    async sendText(telefone: string, texto: string): Promise<void> {
      const resp = await fetch(`${base}/message/sendText/${config.instance}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.apiKey,
        },
        body: JSON.stringify({ number: telefone, text: texto }),
      });
      if (!resp.ok) {
        const corpo = await resp.text().catch(() => "");
        throw new Error(
          `Evolution sendText falhou (${resp.status}): ${corpo.slice(0, 200)}`,
        );
      }
    },
  };
}
