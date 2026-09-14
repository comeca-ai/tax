import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { logAuditoria } from "../../../../db/schema";
import { getDb } from "../../../queries/connection";

const base = z.object({
  empresaId:z.number().int().positive(),despesaId:z.number().int().positive(),
  statusAplicado:z.enum(["pendente","em_revisao","aprovada","rejeitada"]),
  motivo:z.string().trim().min(1).max(10000),
  politicaId:z.number().int().positive().nullable(),politicaVersao:z.number().int().positive().nullable(),
  regrasAplicadas:z.array(z.object({regra:z.string(),resultado:z.enum(["passou","falhou","revisar"]),detalhe:z.string()})).default([]),
});
export const registroDecisaoSchema=z.discriminatedUnion("origemDecisao",[
  base.extend({origemDecisao:z.literal("automatica"),usuarioId:z.null(),usuarioNome:z.null()}),
  base.extend({origemDecisao:z.literal("humana"),usuarioId:z.number().int().positive(),usuarioNome:z.string().trim().min(1).max(255)}),
]);
export type RegistroDecisao=z.input<typeof registroDecisaoSchema>;
type Tx=Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** Append na mesma transação da decisão. Sombra/assistido não são aprovação efetiva. */
export async function registrarDecisaoDespesa(tx:Pick<Tx,"insert">,input:RegistroDecisao){
  const r=registroDecisaoSchema.parse(input);
  await tx.insert(logAuditoria).values({usuarioId:r.usuarioId,empresaId:r.empresaId,acao:"despesa.decisao",entidade:"despesa",entidadeId:r.despesaId,
    detalhes:JSON.stringify({...r,aprovacaoEfetiva:r.statusAplicado==="aprovada",versaoRegistro:1}),
    regraVersao:r.politicaVersao?`politica-v${r.politicaVersao}`:"sem-politica"});
}
export async function historicoDecisoesDespesa(empresaId:number,despesaId:number){
  const rows=await getDb().select({id:logAuditoria.id,detalhes:logAuditoria.detalhes,em:logAuditoria.createdAt}).from(logAuditoria)
    .where(and(eq(logAuditoria.empresaId,empresaId),eq(logAuditoria.entidade,"despesa"),eq(logAuditoria.entidadeId,despesaId),eq(logAuditoria.acao,"despesa.decisao"))).orderBy(asc(logAuditoria.id));
  return rows.flatMap(row=>{try{const r=registroDecisaoSchema.safeParse(JSON.parse(row.detalhes??""));return r.success&&r.data.empresaId===empresaId&&r.data.despesaId===despesaId?[{id:row.id,em:row.em,...r.data,aprovacaoEfetiva:r.data.statusAplicado==="aprovada"}]:[]}catch{return[]}});
}
