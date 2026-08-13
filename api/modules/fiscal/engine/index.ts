import type {
  CategoriaDespesa,
  MemorialTributo,
  NivelConfianca,
  ResultadoMotor,
  Tributo,
} from "@contracts/types";
import {
  ALIQUOTA_CSLL,
  ALIQUOTA_IRPJ,
  ALIQUOTA_PIS_COFINS,
  DATA_CORTE_MP_1340,
  FATOR_LC_224,
  TOLERANCIA_DIVERGENCIA_CONSUMO,
  VERSAO_REGRA,
  icmsAdRemPorUf,
} from "./params";

/**
 * Motor de regras tributárias (RF-00 a RF-09).
 * Funções puras: as regras vigentes são carregadas do banco pelo router
 * e passadas como parâmetro (RF-07 — regra vigente na data do fato gerador).
 */

export type RegraVigente = {
  cnaePadrao: string;
  categoria: CategoriaDespesa;
  tributo: Tributo;
  tipoBeneficio: "credito" | "dedutibilidade";
  confianca: NivelConfianca;
  aliquota: number | null;
  baseLegal: string | null;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  versao: string;
};

export type EmpresaMotor = {
  cnaePrincipal: string;
  regimeTributario: "lucro_real" | "lucro_presumido" | "simples_nacional";
  uf: string;
};

export type DespesaMotor = {
  categoria: CategoriaDespesa;
  valorNota: number;
  dataFatoGerador: string; // ISO yyyy-mm-dd
  litros: number | null;
  kmComercial: number;
  kmNaoComercial: number;
};

export type VeiculoMotor = {
  kmPorLitroDeclarado: number;
  tarifaReembolsoKm: number;
} | null;

// ─────────────────────────────────────────────────────────────────────────────
// Matching CNAE × padrão (ex.: "49.30-2", "49.2x", "41.x", "*")
// ─────────────────────────────────────────────────────────────────────────────

function digitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/**
 * Retorna a especificidade do match (maior = mais específico) ou -1 se não casa.
 * - "*" casa com qualquer CNAE com especificidade 0 (fallback "não mapeado")
 * - padrão sem "x": match exato dos dígitos
 * - padrão com "x": prefixo dos dígitos do padrão
 */
export function matchCnaePadrao(cnae: string, padrao: string): number {
  if (padrao === "*") return 0;
  const cnaeDig = digitos(cnae);
  const padraoDig = digitos(padrao);
  if (!cnaeDig || !padraoDig) return -1;
  if (padrao.includes("x") || padrao.includes("X")) {
    return cnaeDig.startsWith(padraoDig) ? padraoDig.length : -1;
  }
  return cnaeDig === padraoDig ? 100 + padraoDig.length : -1;
}

/** Regra vigente na data do fato gerador (RF-07). */
function vigenteNaData(regra: RegraVigente, dataFato: string): boolean {
  if (regra.vigenciaInicio > dataFato) return false;
  if (regra.vigenciaFim && regra.vigenciaFim < dataFato) return false;
  return true;
}

/**
 * Seleciona a regra mais específica para (cnae, categoria, tributo) vigente
 * na data do fato gerador. Fallback: regra "*" (não mapeado → Baixa).
 */
export function selecionarRegra(
  regras: RegraVigente[],
  cnae: string,
  categoria: CategoriaDespesa,
  tributo: Tributo,
  dataFato: string,
): RegraVigente | null {
  let melhor: RegraVigente | null = null;
  let melhorScore = -1;
  for (const regra of regras) {
    if (regra.categoria !== categoria || regra.tributo !== tributo) continue;
    if (!vigenteNaData(regra, dataFato)) continue;
    const score = matchCnaePadrao(cnae, regra.cnaePadrao);
    if (score > melhorScore) {
      melhorScore = score;
      melhor = regra;
    }
  }
  return melhor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ordem de severidade da confiança (para rebaixamento — RF-09)
// ─────────────────────────────────────────────────────────────────────────────

const ORDEM_CONFIANCA: NivelConfianca[] = ["alta", "media", "baixa", "vedado"];

function rebaixar(confianca: NivelConfianca): NivelConfianca {
  const idx = ORDEM_CONFIANCA.indexOf(confianca);
  return ORDEM_CONFIANCA[Math.min(idx + 1, ORDEM_CONFIANCA.length - 1)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Motor principal
// ─────────────────────────────────────────────────────────────────────────────

export function processarDespesa(
  empresa: EmpresaMotor,
  despesa: DespesaMotor,
  veiculo: VeiculoMotor,
  regras: RegraVigente[],
): ResultadoMotor {
  const alertas: string[] = [];
  const memorialTributos: MemorialTributo[] = [];

  const dataFato = despesa.dataFatoGerador;
  const kmTotal = despesa.kmComercial + despesa.kmNaoComercial;

  // §7.4 — segregação de uso misto
  const pctComercial = kmTotal > 0 ? despesa.kmComercial / kmTotal : 1;
  const baseFiscal = despesa.valorNota * pctComercial;

  // valor_reembolsavel ≠ valor_fiscal: cálculo independente (tarifa/km)
  const valorReembolsavel =
    veiculo && veiculo.tarifaReembolsoKm > 0 && despesa.kmComercial > 0
      ? veiculo.tarifaReembolsoKm * despesa.kmComercial
      : baseFiscal;

  // ── RF-02: classificação categoria × CNAE × regime ────────────────────────
  const regraCredito = selecionarRegra(
    regras,
    empresa.cnaePrincipal,
    despesa.categoria,
    "pis_cofins",
    dataFato,
  );
  let confianca: NivelConfianca = regraCredito?.confianca ?? "baixa";
  if (!regraCredito) {
    alertas.push(
      "CNAE × categoria não mapeado na matriz de elegibilidade: confiança Baixa (revisão obrigatória).",
    );
  }

  // Simples Nacional / Lucro Presumido: sem crédito de PIS/COFINS (não cumulatividade)
  const regimePermiteCredito = empresa.regimeTributario === "lucro_real";
  if (!regimePermiteCredito) {
    alertas.push(
      `Regime ${empresa.regimeTributario === "simples_nacional" ? "Simples Nacional" : "Lucro Presumido"}: sem crédito de PIS/COFINS; apenas dedutibilidade é avaliada.`,
    );
  }

  // ── RF-03: quantificação — crédito e dedutibilidade são saídas PARALELAS ──
  if (regimePermiteCredito && confianca !== "vedado") {
    if (dataFato >= DATA_CORTE_MP_1340) {
      alertas.push(
        "MP 1.340/2026: crédito de PIS/COFINS sobre diesel/GLP zerado para fatos geradores a partir de 11/03/2026.",
      );
    } else {
      const valor = baseFiscal * ALIQUOTA_PIS_COFINS * FATOR_LC_224;
      memorialTributos.push({
        tributo: "pis_cofins",
        tipoBeneficio: "credito",
        valor: round2(valor),
        formula: `PIS/COFINS = base ${money(baseFiscal)} × 9,25% × fator 90% (a confirmar — LC 224/2025) = ${money(valor)}`,
        baseLegal: regraCredito?.baseLegal ?? null,
        regraVersao: regraCredito?.versao ?? VERSAO_REGRA,
      });
    }
  }

  // ICMS monofásico (combustível): alíquota ad rem × litros, por UF
  if (
    despesa.categoria === "combustivel" &&
    despesa.litros &&
    despesa.litros > 0 &&
    confianca !== "vedado"
  ) {
    const adRem = icmsAdRemPorUf(empresa.uf);
    const valor = despesa.litros * adRem * pctComercial;
    const regraIcms = selecionarRegra(
      regras,
      empresa.cnaePrincipal,
      despesa.categoria,
      "icms",
      dataFato,
    );
    memorialTributos.push({
      tributo: "icms",
      tipoBeneficio: "credito",
      valor: round2(valor),
      formula: `ICMS monofásico = ${despesa.litros} L × ad rem ${empresa.uf} R$ ${adRem.toFixed(4)}/L × ${(pctComercial * 100).toFixed(1)}% comercial = ${money(valor)}`,
      baseLegal: regraIcms?.baseLegal ?? "Convênio ICMS 15/2023 (monofásico ad rem) — valor de referência",
      regraVersao: regraIcms?.versao ?? VERSAO_REGRA,
    });
  }

  // CBS/IBS: regime pleno a partir de 2027 — depende de valor destacado na nota
  if (dataFato >= "2027-01-01") {
    alertas.push(
      "CBS/IBS: regime pleno a partir de 2027; crédito depende do valor destacado na nota (não extraído nesta versão).",
    );
  }

  // Dedutibilidade IRPJ/CSLL: regra única, qualquer CNAE — RF-03 paralelo ao crédito
  if (empresa.regimeTributario !== "simples_nacional" && confianca !== "vedado") {
    const creditoCbsIbs = 0; // CBS/IBS destacado não extraído nesta versão
    const baseDedutivel = baseFiscal - creditoCbsIbs;
    const valorIrpj = baseDedutivel * ALIQUOTA_IRPJ;
    const valorCsll = baseDedutivel * ALIQUOTA_CSLL;
    const valor = valorIrpj + valorCsll;
    const regraDed = selecionarRegra(
      regras,
      empresa.cnaePrincipal,
      despesa.categoria,
      "irpj_csll",
      dataFato,
    );
    memorialTributos.push({
      tributo: "irpj_csll",
      tipoBeneficio: "dedutibilidade",
      valor: round2(valor),
      formula: `IRPJ 25% (${money(valorIrpj)}) + CSLL 9% (${money(valorCsll)}) sobre base dedutível ${money(baseDedutivel)} (despesa fiscal − crédito CBS − crédito IBS) = ${money(valor)}`,
      baseLegal: regraDed?.baseLegal ?? "Art. 311 RIR/2018 (IRPJ); Art. 435 RIR/2018 (CSLL)",
      regraVersao: regraDed?.versao ?? VERSAO_REGRA,
    });
  } else if (empresa.regimeTributario === "simples_nacional") {
    alertas.push(
      "Simples Nacional: dedutibilidade IRPJ/CSLL não se aplica (tributos unificados no DAS).",
    );
  }

  // ── RF-09: teste de plausibilidade de consumo ─────────────────────────────
  let plausibilidade: ResultadoMotor["plausibilidade"] = {
    consumoRealKmPorLitro: null,
    kmPorLitroDeclarado: null,
    divergenciaPct: null,
    aprovado: null,
  };
  if (
    despesa.categoria === "combustivel" &&
    veiculo &&
    despesa.litros &&
    despesa.litros > 0 &&
    despesa.kmComercial > 0 &&
    veiculo.kmPorLitroDeclarado > 0
  ) {
    const consumoReal = despesa.kmComercial / despesa.litros;
    const divergencia =
      Math.abs(consumoReal - veiculo.kmPorLitroDeclarado) /
      veiculo.kmPorLitroDeclarado;
    const aprovado = divergencia <= TOLERANCIA_DIVERGENCIA_CONSUMO;
    plausibilidade = {
      consumoRealKmPorLitro: round2(consumoReal),
      kmPorLitroDeclarado: veiculo.kmPorLitroDeclarado,
      divergenciaPct: round2(divergencia * 100),
      aprovado,
    };
    if (!aprovado) {
      const antes = confianca;
      confianca = rebaixar(confianca);
      alertas.push(
        `RF-09: consumo real ${consumoReal.toFixed(2)} km/L diverge ${(divergencia * 100).toFixed(1)}% do declarado (${veiculo.kmPorLitroDeclarado} km/L), acima da tolerância de 15% — confiança rebaixada de "${antes}" para "${confianca}".`,
      );
    }
  } else if (despesa.categoria === "combustivel" && !veiculo) {
    alertas.push(
      "Combustível sem veículo vinculado: teste de plausibilidade (RF-09) não executado.",
    );
  }

  // ── RF-05: destino da despesa ─────────────────────────────────────────────
  const statusSugerido: ResultadoMotor["statusSugerido"] =
    confianca === "alta"
      ? "aprovada"
      : confianca === "vedado"
        ? "rejeitada"
        : "em_revisao";

  if (confianca === "vedado") {
    alertas.push(
      "Categoria vedada para o CNAE da empresa: despesa marcada como rejeitada.",
    );
  }

  return {
    confianca,
    statusSugerido,
    valorFiscal: round2(baseFiscal),
    valorReembolsavel: round2(valorReembolsavel),
    percentualComercial: kmTotal > 0 ? round2(pctComercial * 100) : null,
    memorialTributos,
    alertas,
    // RF-04: "Média confiança" exige documento de suporte
    requerEvidencia: confianca === "media",
    plausibilidade,
  };
}

function round2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function money(valor: number): string {
  return `R$ ${valor.toFixed(2)}`;
}
