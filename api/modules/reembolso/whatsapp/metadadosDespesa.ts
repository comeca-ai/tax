import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { colaboradores, whatsappInbox } from "../../../../db/schema";
import { getDb } from "../../../queries/connection";

/** Chamado somente após a autorização da empresa; sem arquivos, telefone ou payload na resposta. */
export async function metadadosDespesasWhatsapp(
  empresaId: number,
  ids: number[]
) {
  const result = new Map<
    number,
    {
      colaboradorId: number;
      nome: string;
      centroCusto: string | null;
      enviadoEm: Date;
    }
  >();
  if (!ids.length) return result;
  const mensagem = alias(whatsappInbox, "mensagem_original");
  const rows = await getDb()
    .select({
      despesaId: whatsappInbox.despesaId,
      colaboradorId: colaboradores.id,
      nome: colaboradores.nome,
      centroCusto: colaboradores.centroCusto,
      persistidoEm: whatsappInbox.recebidoEm,
      originalEm: mensagem.recebidoEm,
    })
    .from(whatsappInbox)
    .innerJoin(
      colaboradores,
      and(
        eq(colaboradores.id, whatsappInbox.colaboradorId),
        eq(colaboradores.empresaId, whatsappInbox.empresaId)
      )
    )
    .leftJoin(
      mensagem,
      and(
        eq(mensagem.provider, whatsappInbox.provider),
        eq(mensagem.mensagemId, whatsappInbox.mensagemId),
        eq(mensagem.tipoEvento, "mensagem"),
        eq(mensagem.empresaId, whatsappInbox.empresaId),
        eq(mensagem.colaboradorId, whatsappInbox.colaboradorId)
      )
    )
    .where(
      and(
        eq(whatsappInbox.empresaId, empresaId),
        eq(whatsappInbox.provider, "dialog360"),
        eq(whatsappInbox.tipoEvento, "comprovante"),
        inArray(whatsappInbox.despesaId, ids)
      )
    )
    .orderBy(asc(whatsappInbox.id));
  for (const r of rows)
    if (r.despesaId && !result.has(r.despesaId))
      result.set(r.despesaId, {
        colaboradorId: r.colaboradorId,
        nome: r.nome,
        centroCusto: r.centroCusto,
        enviadoEm: r.originalEm ?? r.persistidoEm,
      });
  return result;
}
