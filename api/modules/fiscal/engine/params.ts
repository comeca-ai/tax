/**
 * Parâmetros tributários do motor — versionados por data do fato gerador (RF-07).
 * Valores com caráter estimativo; memorial de cálculo sempre informa a base legal.
 */

export const VERSAO_REGRA = "1.1";

/** PIS/COFINS sobre diesel/GLP — 9,25% cumulativo PIS 1,65% + COFINS 7,6%. */
export const ALIQUOTA_PIS_COFINS = 0.0925;

/**
 * MP 1.340/2026: PIS/COFINS sobre diesel zerado a partir de 11/03/2026.
 * Antes disso, fator 90% "a confirmar" (LC 224/2025).
 */
export const DATA_CORTE_MP_1340 = "2026-03-11";
export const FATOR_LC_224 = 0.9;

/** IRPJ 25% + CSLL 9% sobre a base dedutível. */
export const ALIQUOTA_IRPJ = 0.25;
export const ALIQUOTA_CSLL = 0.09;

/** Tolerância do teste de plausibilidade de consumo (RF-09). */
export const TOLERANCIA_DIVERGENCIA_CONSUMO = 0.15;

/**
 * ICMS monofásico ad rem sobre combustível (R$/litro), por UF.
 * Valores aproximados de referência (diesel); ajustar conforme legislação
 * estadual vigente na data do fato gerador.
 */
export const ICMS_AD_REM_POR_UF: Record<string, number> = {
  AC: 1.0061, AL: 1.0061, AP: 1.0061, AM: 1.0061, BA: 1.0061, CE: 1.0061,
  DF: 1.0061, ES: 1.0061, GO: 1.0061, MA: 1.0061, MT: 1.0061, MS: 1.0061,
  MG: 1.0061, PA: 1.0061, PB: 1.0061, PR: 1.0061, PE: 1.0061, PI: 1.0061,
  RJ: 1.0061, RN: 1.0061, RS: 1.0061, RO: 1.0061, RR: 1.0061, SC: 1.0061,
  SP: 1.0061, SE: 1.0061, TO: 1.0061,
};

export const ICMS_AD_REM_PADRAO = 1.0061;

export function icmsAdRemPorUf(uf: string): number {
  return ICMS_AD_REM_POR_UF[uf.toUpperCase()] ?? ICMS_AD_REM_PADRAO;
}
