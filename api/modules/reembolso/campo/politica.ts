import { z } from "zod";
import type { DecisaoReembolso } from "../decisor";
import { UFS_BRASIL } from "../../../../contracts/empresas";

export const configuracaoCampoSchema = z.object({
  modo: z.enum(["sombra", "assistido", "autonomo"]),
  politicaId: z.number().int().positive(), politicaVersao: z.number().int().positive(),
  tarifaCentavosPorKm: z.number().int().positive().max(100000),
  tarifasCentavosPorKmPorUf: z.partialRecord(z.enum(UFS_BRASIL), z.number().int().positive().max(100000)).optional(),
  temValeRefeicao: z.boolean().optional(),
  temContratoCorporativoApp: z.boolean().optional(),
  analistaId: z.number().int().positive().nullable().optional(),
  aprovadorId: z.number().int().positive().nullable().optional(),
  periodoDias: z.number().int().min(1).max(366),
  prazoNotaDias: z.number().int().min(1).max(366),
  intervaloLembreteDias: z.number().int().min(1).max(366),
  limiteLembretes: z.number().int().min(0).max(10),
  regraPercurso: z.string().trim().min(10).max(2000),
  retencaoLocalizacaoDias: z.number().int().min(1).max(366),
  calculoMapsAutomatico: z.boolean().optional(),
  intervaloConsultaMapsMinutos: z.number().int().min(1).max(10080).optional(),
});
export type ConfiguracaoCampo = z.infer<typeof configuracaoCampoSchema>;

/** UF ausente não herda a tarifa global legada: exige configuração explícita. */
export function tarifaDaUf(config: ConfiguracaoCampo, uf: string): number {
  const estado = z.enum(UFS_BRASIL).parse(uf);
  const tarifa = config.tarifasCentavosPorKmPorUf?.[estado];
  if (!tarifa) throw new Error(`Tarifa de quilometragem não configurada para ${estado}.`);
  return tarifa;
}

export function memorialReembolso(metrosComerciais: number, config: ConfiguracaoCampo, uf: string) {
  const tarifaCentavosPorKm = tarifaDaUf(config, uf);
  return { uf, metrosComerciais, tarifaCentavosPorKm, valorCentavos: valorEstimadoCentavos(metrosComerciais, tarifaCentavosPorKm), politicaId: config.politicaId, politicaVersao: config.politicaVersao };
}

/** O veredito já calculado pelo decisor permanece idêntico nos três modos. */
export function aplicarModo(decisao: DecisaoReembolso, modo: ConfiguracaoCampo["modo"] = "sombra", confirmacaoHumana = false) {
  const aplicar = modo === "autonomo" || (modo === "assistido" && confirmacaoHumana);
  return { decisao, aplicarStatus: aplicar && decisao.decisao !== "revisao_manual", comunicarDecisao: aplicar, exigeRevisao: decisao.decisao === "revisao_manual" || modo === "assistido" && !confirmacaoHumana };
}

export function valorEstimadoCentavos(metrosComerciais: number, tarifaCentavosPorKm: number): number {
  if (!Number.isSafeInteger(metrosComerciais) || metrosComerciais < 0 || !Number.isSafeInteger(tarifaCentavosPorKm) || tarifaCentavosPorKm <= 0) throw new Error("Distância e tarifa explícitas são obrigatórias.");
  const produto = metrosComerciais * tarifaCentavosPorKm;
  if (!Number.isSafeInteger(produto)) throw new Error("Valor fora do limite seguro.");
  return Math.round(produto / 1000);
}
