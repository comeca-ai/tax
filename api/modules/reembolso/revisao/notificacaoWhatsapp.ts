import { and, desc, eq } from "drizzle-orm";
import { colaboradores, whatsappInbox } from "../../../../db/schema";
import type { getDb } from "../../../queries/connection";
import { enfileirarRespostaWhatsapp } from "../whatsapp/worker";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export function instanteUltimaMensagem(payload: unknown, mensagemId: string | null): Date {
  if (!mensagemId) return new Date(0);
  const mensagens = (payload as { messages?: { id?: string; timestamp?: string }[] } | null)?.messages;
  const mensagem = Array.isArray(mensagens) ? mensagens.find(m => m?.id === mensagemId) : undefined;
  const segundos = Number(mensagem?.timestamp);
  // Sem prova do horário original, a outbox ficará cancelada por janela expirada.
  return new Date(Number.isFinite(segundos) && segundos > 0 && segundos < 8_640_000_000_000 ? segundos * 1000 : 0);
}

/** Participa da MESMA transação da decisão; não chama a rede. */
export async function notificarDecisaoWhatsapp(tx: Tx, input: {
  empresaId: number; despesaId: number; status: "aprovada" | "rejeitada";
}) {
  const origens = await tx.select({ colaboradorId: colaboradores.id, telefone: colaboradores.telefone })
    .from(whatsappInbox).innerJoin(colaboradores, and(
      eq(colaboradores.id, whatsappInbox.colaboradorId), eq(colaboradores.empresaId, whatsappInbox.empresaId),
    )).where(and(
      eq(whatsappInbox.empresaId, input.empresaId), eq(whatsappInbox.despesaId, input.despesaId),
      eq(whatsappInbox.provider, "dialog360"), eq(whatsappInbox.tipoEvento, "comprovante"),
      eq(colaboradores.statusVinculo, "ativo"),
    )).limit(2);
  if (origens.length !== 1 || !origens[0]?.telefone) return { enfileirada: false as const };
  const origem = origens[0];
  const [ultima] = await tx.select({ payload: whatsappInbox.payload, mensagemId: whatsappInbox.mensagemId })
    .from(whatsappInbox).where(and(
      eq(whatsappInbox.empresaId, input.empresaId), eq(whatsappInbox.colaboradorId, origem.colaboradorId),
      eq(whatsappInbox.telefone, origem.telefone!), eq(whatsappInbox.provider, "dialog360"),
      eq(whatsappInbox.tipoEvento, "mensagem"), eq(whatsappInbox.status, "processado"),
    )).orderBy(desc(whatsappInbox.recebidoEm)).limit(1);
  await enfileirarRespostaWhatsapp({ empresaId: input.empresaId, colaboradorId: origem.colaboradorId, telefone: origem.telefone! },
    `decisao:${input.despesaId}:${input.status}`,
    `A revisão da despesa ${input.despesaId} foi concluída: ${input.status}. Esta mensagem não confirma pagamento.`,
    instanteUltimaMensagem(ultima?.payload, ultima?.mensagemId ?? null), tx);
  return { enfileirada: true as const };
}
