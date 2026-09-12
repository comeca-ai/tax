import { and, eq } from "drizzle-orm";
import { colaboradores, empresas, politicasReembolso } from "../../../../db/schema";
import { getDb } from "../../../queries/connection";
import type { ColaboradorResolvidoWhatsapp } from "./identificacao";

function tagsDoColaborador(colaborador: {
  equipe: "interna" | "externa";
  nivelAprovacao: number | null;
  papelFluxo: string;
}): string[] {
  const tags: string[] = [colaborador.equipe];
  if (colaborador.nivelAprovacao !== null) tags.push(`nivel:${colaborador.nivelAprovacao}`);
  tags.push(`papel:${colaborador.papelFluxo}`);
  return tags;
}

/** Consulta interna: traz somente a identidade operacional do agente. */
export async function resolverColaboradoresPorTelefone(
  telefoneNormalizado: string,
): Promise<ColaboradorResolvidoWhatsapp[]> {
  const db = getDb();
  const rows = await db
    .select({
      colaboradorId: colaboradores.id,
      empresaId: empresas.id,
      empresaNome: empresas.razaoSocial,
      nome: colaboradores.nome,
      statusVinculo: colaboradores.statusVinculo,
      equipe: colaboradores.equipe,
      nivelAprovacao: colaboradores.nivelAprovacao,
      papelFluxo: colaboradores.papelFluxo,
      politicaId: politicasReembolso.id,
    })
    .from(colaboradores)
    .innerJoin(empresas, eq(empresas.id, colaboradores.empresaId))
    .leftJoin(
      politicasReembolso,
      and(
        eq(politicasReembolso.empresaId, colaboradores.empresaId),
        eq(politicasReembolso.status, "ativa"),
      ),
    )
    .where(eq(colaboradores.telefone, telefoneNormalizado));

  return rows.map(row => ({
    colaboradorId: row.colaboradorId,
    empresaId: row.empresaId,
    empresaNome: row.empresaNome,
    nome: row.nome,
    situacao: row.statusVinculo === "ativo" ? "ativo" : "suspenso",
    politicaId: row.politicaId,
    tags: tagsDoColaborador(row),
  }));
}
