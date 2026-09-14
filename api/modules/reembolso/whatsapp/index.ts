import { createDialog360Transport } from "./dialog360Transport";
import type { WhatsappProvider } from "./types";

export * from "./types";
export * from "./evolution";

/**
 * Seleciona o canal único 360dialog (D-022); legado nunca é fallback.
 *
 * Retorna null quando o provider selecionado não está configurado —
 * o caller (boot/webhook) responde 503 e o agente simplesmente não roda;
 * site e back office seguem 100% (D-011: falha do WhatsApp não derruba o app).
 */
export function getWhatsappProvider(): WhatsappProvider | null {
  const selecionado = (process.env.WHATSAPP_PROVIDER || "dialog360").toLowerCase();

  if (selecionado === "dialog360") {
    const apiKey = process.env.DIALOG_360_API_KEY;
    if (!apiKey) return null;
    const transport = createDialog360Transport(apiKey);
    return { nome: transport.nome, async sendText(phone, text) { await transport.sendText(phone, text); } };
  }

  if (selecionado === "meta") {
    // Futuro (D-010): Cloud API oficial. O webhook legado
    // (/api/webhooks/whatsapp, verificação hub.challenge) já existe desde a
    // v1.2.0; o adapter de envio chega quando a migração for agendada.
    return null;
  }

  return null;
}
