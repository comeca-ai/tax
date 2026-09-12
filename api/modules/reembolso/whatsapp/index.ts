import { createEvolutionProvider } from "./evolution";
import type { WhatsappProvider } from "./types";

export * from "./types";
export * from "./evolution";

/**
 * Seleciona o provider de transporte WhatsApp (D-010).
 * WHATSAPP_PROVIDER=evolution (padrão, largada) | meta (futuro, D-010).
 *
 * Retorna null quando o provider selecionado não está configurado —
 * o caller (boot/webhook) responde 503 e o agente simplesmente não roda;
 * site e back office seguem 100% (D-011: falha do WhatsApp não derruba o app).
 */
export function getWhatsappProvider(): WhatsappProvider | null {
  const selecionado = (process.env.WHATSAPP_PROVIDER || "evolution").toLowerCase();

  if (selecionado === "evolution") {
    const apiUrl = process.env.EVOLUTION_API_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;
    const instance = process.env.EVOLUTION_INSTANCE;
    if (!apiUrl || !apiKey || !instance) return null;
    return createEvolutionProvider({ apiUrl, apiKey, instance });
  }

  if (selecionado === "meta") {
    // Futuro (D-010): Cloud API oficial. O webhook legado
    // (/api/webhooks/whatsapp, verificação hub.challenge) já existe desde a
    // v1.2.0; o adapter de envio chega quando a migração for agendada.
    return null;
  }

  return null;
}
