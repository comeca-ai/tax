import { createHash } from "node:crypto";

/** Estados técnicos permitidos para itens ainda não processados da POC. */
export const STATUS_FILA_WHATSAPP = [
  "pendente",
  "processando",
  "enviado",
  "processado",
  "falhou",
  "cancelado",
  "esgotado",
  "incerto",
] as const;

export type StatusFilaWhatsapp = (typeof STATUS_FILA_WHATSAPP)[number];
export type DirecaoMensagemWhatsapp = "entrada" | "saida";

/**
 * Produz uma chave estável, sem telefone, conteúdo da conversa ou segredo.
 *
 * A chave é persistida com índice único pelo provider. Reentregas que usam o
 * mesmo identificador externo chegam à mesma linha da fila e, portanto, não
 * podem abrir duas despesas nem enviar duas respostas.
 */
export function criarChaveIdempotenciaWhatsapp(input: {
  provider: string;
  direcao: DirecaoMensagemWhatsapp;
  tipoEvento: string;
  identificadorExterno: string;
}): string {
  const partes = [input.provider, input.direcao, input.tipoEvento, input.identificadorExterno];
  if (partes.some(parte => !parte.trim())) {
    throw new Error("A chave de idempotência exige provider, direção, tipo e identificador externo.");
  }

  return createHash("sha256")
    .update(`whatsapp-poc-v1\u0000${partes.join("\u0000")}`)
    .digest("hex");
}

/**
 * O worker usará esta regra para decidir se um item pode receber nova tentativa.
 * Itens concluídos ou cancelados são terminais e nunca voltam para a fila.
 */
export function podeTentarNovamente(status: StatusFilaWhatsapp): boolean {
  return status === "pendente" || status === "falhou";
}
