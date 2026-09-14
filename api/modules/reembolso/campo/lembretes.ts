import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { colaboradores, empresas } from "../../../../db/schema";
import { pocCampo, pocConfiguracao } from "../../../../db/pocSchema";
import { getDb } from "../../../queries/connection";
import { alterarCampo, type IdentidadeCampo, type TransacaoCampo } from "./servico";
import type { Conciliacao } from "./dominio";
import type { ConfiguracaoCampo } from "./politica";

type IdentidadeEnvio = IdentidadeCampo & { telefone: string };
export type EnfileirarLembrete = (identity: IdentidadeEnvio, referencia: string, texto: string, recebidoEm: Date, tx?: TransacaoCampo) => Promise<unknown>;

/** Janela usa mensagem original, não horário da execução do agendador. */
export function podeAgendarLembrete(c: Conciliacao, config: ConfiguracaoCampo, ultimaMensagemEm: string | undefined, agora: Date): boolean {
  const ultima = Date.parse(ultimaMensagemEm ?? "");
  if (!Number.isFinite(ultima) || ultima > agora.getTime() || agora.getTime() - ultima >= 23 * 3600_000) return false;
  if (c.estado !== "documentacao_pendente" || c.lembrete !== "pendente") return false;
  if ((c.lembretes?.agendados ?? 0) >= config.limiteLembretes) return false;
  if (agora.getTime() < Date.parse(c.fim) + config.prazoNotaDias * 86400_000) return false;
  return !c.lembretes || agora.getTime() - Date.parse(c.lembretes.ultimoEm) >= config.intervaloLembreteDias * 86400_000;
}

export async function processarLembretesCampo(identity: IdentidadeCampo, enfileirar: EnfileirarLembrete, agora = new Date()): Promise<number> {
  return alterarCampo(identity, null, "lembretes.verificar", async (estado, tx) => {
    const [config] = await tx.select().from(pocConfiguracao).where(eq(pocConfiguracao.empresaId, identity.empresaId));
    const [pessoa] = await tx.select().from(colaboradores).where(and(eq(colaboradores.id, identity.colaboradorId), eq(colaboradores.empresaId, identity.empresaId))).limit(1);
    const [empresa] = await tx.select().from(empresas).where(eq(empresas.id, identity.empresaId)).limit(1);
    if (!config || !pessoa?.telefone || !empresa) return 0;
    let total = 0;
    for (const c of estado.conciliacoes) {
      if (!podeAgendarLembrete(c, config.configuracao, estado.conversa?.ultimaMensagemEm, agora)) continue;
      const etapa = (c.lembretes?.agendados ?? 0) + 1;
      const chave = createHash("sha256").update(JSON.stringify([identity.empresaId, identity.colaboradorId, c.veiculo, c.inicio, c.fim])).digest("hex");
      const referencia = `campo:lembrete:${chave}:${etapa}`;
      await enfileirar({ ...identity, telefone: pessoa.telefone }, referencia, `Há documentação de combustível pendente no período ${c.inicio.slice(0, 10)} a ${c.fim.slice(0, 10)}. Envie a nota no CNPJ ${empresa.cnpj}. A solicitação é documental; não representa cobrança financeira.`, new Date(estado.conversa!.ultimaMensagemEm!), tx);
      c.lembretes = { agendados: etapa, ultimoEm: agora.toISOString(), referencias: [...(c.lembretes?.referencias ?? []), referencia] };
      total++;
    }
    return total;
  });
}

/** O worker deve chamar imediatamente antes do envio de referencias campo:lembrete:. */
export async function validarLembreteCampo(identity: IdentidadeCampo, referencia: string): Promise<boolean> {
  if (!referencia.startsWith("campo:lembrete:")) return true;
  const db = getDb();
  const [pessoa] = await db.select().from(colaboradores).where(and(eq(colaboradores.id, identity.colaboradorId), eq(colaboradores.empresaId, identity.empresaId), eq(colaboradores.statusVinculo, "ativo"))).limit(1);
  if (!pessoa) return false;
  const [row] = await db.select().from(pocCampo).where(and(eq(pocCampo.empresaId, identity.empresaId), eq(pocCampo.colaboradorId, identity.colaboradorId))).limit(1);
  const c = row?.estado.conciliacoes.find(c => c.lembretes?.referencias.includes(referencia));
  return Boolean(c && c.estado === "documentacao_pendente" && c.lembrete === "pendente");
}

/** Um lote limitado por ciclo; root agenda explicitamente junto ao worker. */
export async function executarCicloLembretesCampo(enfileirar: EnfileirarLembrete, depoisColaboradorId = 0) {
  // Paginação por offset seria instável; cursor determinístico de pessoa.
  const { gt, asc } = await import("drizzle-orm");
  const rows = await getDb().select({ empresaId: pocCampo.empresaId, colaboradorId: pocCampo.colaboradorId }).from(pocCampo).where(gt(pocCampo.colaboradorId, depoisColaboradorId)).orderBy(asc(pocCampo.colaboradorId)).limit(100);
  let agendados = 0, falhas = 0;
  for (const row of rows) {
    try { agendados += await processarLembretesCampo(row, enfileirar); } catch { falhas++; }
  }
  return { agendados, falhas, proximoCursor: rows.length === 100 ? rows.at(-1)!.colaboradorId : 0 };
}
