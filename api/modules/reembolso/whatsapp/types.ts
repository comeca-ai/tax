/**
 * Adapter de transporte WhatsApp (D-010/D-011).
 * O agente (api/agente) só conhece esta interface — nunca o Evolution/Meta
 * diretamente. Trocar de provider = trocar variáveis de ambiente, não produto.
 */

/** Mensagem recebida normalizada (qualquer provider vira isto). */
export interface MensagemRecebida {
  /** Telefone do remetente, só dígitos com DDI (ex.: "5511998887777"). */
  telefone: string;
  /** Texto da mensagem ("" quando é só mídia). */
  texto: string;
  /** Tipo lógico da mensagem. */
  tipo: "texto" | "imagem" | "audio" | "documento" | "outro";
  /** ID externo da mensagem (idempotência/log). */
  mensagemId?: string;
  /** Nome de exibição do contato, quando o provider envia. */
  nomeContato?: string;
}

/** Envio de mensagens para um telefone. */
export interface WhatsappProvider {
  readonly nome: string;
  sendText(telefone: string, texto: string): Promise<void>;
}
