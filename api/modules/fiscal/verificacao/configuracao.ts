import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { fiscalConfiguracao } from "../../../../db/fiscalSchema";
import { empresas, logAuditoria } from "../../../../db/schema";
import { getDb } from "../../../queries/connection";
import { registrarLog } from "../../../routers/_shared";

export async function lerConfiguracaoFiscal(empresaId: number) {
  const [row] = await getDb()
    .select()
    .from(fiscalConfiguracao)
    .where(eq(fiscalConfiguracao.empresaId, empresaId))
    .limit(1);
  return (
    row ?? {
      empresaId,
      habilitada: false,
      versao: 0,
      alteradaPor: null,
      alteradaEm: null,
    }
  );
}

export async function salvarConfiguracaoFiscal(
  input: { empresaId: number; habilitada: boolean; versaoEsperada: number },
  usuarioId: number
) {
  return getDb().transaction(async tx => {
    // Trava também a configuração ainda inexistente, serializando a primeira ativação.
    await tx
      .select({ id: empresas.id })
      .from(empresas)
      .where(eq(empresas.id, input.empresaId))
      .for("update");
    const [row] = await tx
      .select()
      .from(fiscalConfiguracao)
      .where(eq(fiscalConfiguracao.empresaId, input.empresaId))
      .for("update");
    if ((row?.versao ?? 0) !== input.versaoEsperada)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "A opção fiscal foi alterada por outra pessoa. Atualize o painel antes de salvar.",
      });
    if (row?.habilitada === input.habilitada) return row;
    const values = {
      empresaId: input.empresaId,
      habilitada: input.habilitada,
      versao: (row?.versao ?? 0) + 1,
      alteradaPor: usuarioId,
      alteradaEm: new Date(),
    };
    await tx
      .insert(fiscalConfiguracao)
      .values(values)
      .onDuplicateKeyUpdate({ set: values });
    await registrarLog(tx, {
      usuarioId,
      empresaId: input.empresaId,
      acao: "fiscal.configurar",
      entidade: "empresa",
      entidadeId: input.empresaId,
      detalhes: JSON.stringify({
        anterior: row?.habilitada ?? false,
        habilitada: input.habilitada,
        versao: values.versao,
      }),
    });
    return values;
  });
}

export async function historicoConfiguracaoFiscal(empresaId: number) {
  return getDb()
    .select({
      usuarioId: logAuditoria.usuarioId,
      em: logAuditoria.createdAt,
      detalhes: logAuditoria.detalhes,
    })
    .from(logAuditoria)
    .where(
      and(
        eq(logAuditoria.empresaId, empresaId),
        eq(logAuditoria.acao, "fiscal.configurar")
      )
    )
    .orderBy(desc(logAuditoria.id))
    .limit(20);
}
