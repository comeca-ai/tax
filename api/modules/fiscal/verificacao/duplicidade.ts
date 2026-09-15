import { and, eq } from "drizzle-orm";
import { despesas, notasFiscais } from "../../../../db/schema";
import { TRPCError } from "@trpc/server";
import { fiscalDocumentos } from "../../../../db/fiscalSchema";
import type { getDb } from "../../../queries/connection";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * O chamador mantém o lock da empresa até gravar nota e identidade na mesma
 * transação. Leituras atuais evitam snapshots antigos após esperar outro envio.
 * Não retorna ID ou autoria do documento de outro colaborador.
 */
export async function documentoJaRegistrado(
  tx: Pick<Tx, "select">,
  empresaId: number,
  identidade: { hash: string; chave: string | null },
): Promise<boolean> {
  const [binario] = await tx.select({ id: notasFiscais.id })
    .from(notasFiscais)
    .where(and(eq(notasFiscais.empresaId, empresaId), eq(notasFiscais.arquivoChecksum, identidade.hash)))
    .limit(1).for("update");
  if (binario) return true;
  if (!identidade.chave) return false;
  const [documento] = await tx.select({ id: fiscalDocumentos.notaFiscalId })
    .from(fiscalDocumentos)
    .where(and(eq(fiscalDocumentos.empresaId, empresaId), eq(fiscalDocumentos.chave, identidade.chave)))
    .limit(1).for("update");
  return Boolean(documento);
}

/** O lock da nota dura até o commit do insert de despesa pelo chamador. */
export async function assertNotaSemDespesa(
  tx: Pick<Tx, "select">,
  input: { empresaId: number; notaFiscalId: number },
): Promise<void> {
  const [nota] = await tx.select({ id: notasFiscais.id }).from(notasFiscais)
    .where(and(eq(notasFiscais.empresaId, input.empresaId), eq(notasFiscais.id, input.notaFiscalId)))
    .for("update");
  if (!nota) throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada." });
  const [existente] = await tx.select({ id: despesas.id }).from(despesas)
    .where(and(eq(despesas.empresaId, input.empresaId), eq(despesas.notaFiscalId, input.notaFiscalId)))
    .limit(1).for("update");
  if (existente) throw new TRPCError({ code: "CONFLICT", message: "Esta nota já foi processada." });
}
