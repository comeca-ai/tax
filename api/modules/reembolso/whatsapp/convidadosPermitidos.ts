import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { colaboradores, whatsappOutbox } from "../../../../db/schema";
import { getDb } from "../../../queries/connection";

export function empresasDoCanal(
  valor = process.env.WHATSAPP_POC_ALLOWED_COMPANIES
): number[] {
  if (!valor) return [];
  const partes = valor.split(",").map(s => s.trim());
  return partes.every(
    p => /^[1-9]\d*$/.test(p) && Number.isSafeInteger(Number(p))
  )
    ? [...new Set(partes.map(Number))]
    : [];
}
let cache: { key: string; ate: number; telefones: string[] } | null = null;
export async function incluirConvidadosPermitidos(
  permitidos: Set<string>
): Promise<Set<string>> {
  const empresas = empresasDoCanal();
  if (!empresas.length) return permitidos;
  const key = empresas.join(",");
  if (!cache || cache.key !== key || cache.ate < Date.now()) {
    const rows = await getDb()
      .selectDistinct({ telefone: colaboradores.telefone })
      .from(colaboradores)
      .innerJoin(
        whatsappOutbox,
        and(
          eq(whatsappOutbox.empresaId, colaboradores.empresaId),
          eq(whatsappOutbox.colaboradorId, colaboradores.id),
          eq(whatsappOutbox.telefone, colaboradores.telefone)
        )
      )
      .where(
        and(
          inArray(colaboradores.empresaId, empresas),
          eq(colaboradores.statusVinculo, "ativo"),
          eq(whatsappOutbox.provider, "dialog360"),
          inArray(whatsappOutbox.tipoMensagem, [
            "convite",
            "boas_vindas_reenvio",
          ]),
          eq(whatsappOutbox.status, "enviado"),
          isNotNull(whatsappOutbox.providerMensagemId)
        )
      );
    cache = {
      key,
      ate: Date.now() + 5000,
      telefones: rows.flatMap(r =>
        r.telefone && /^[1-9]\d{7,14}$/.test(r.telefone) ? [r.telefone] : []
      ),
    };
  }
  return new Set([...permitidos, ...cache.telefones]);
}
