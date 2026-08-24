import {
  CATEGORIA_DESPESA_ROTULO,
  TIPO_DOCUMENTO_LABELS,
  type CategoriaDespesa,
  type ConfiancaExtracao,
  type RegraAplicada,
  type RegrasPolitica,
  type TipoDocumento,
} from "@contracts/types";
import { avaliarDespesa } from "../policy/agent";

/**
 * Decisor de reembolso (v1.7.0) — D-013 / D-014.
 *
 * Função PURA: recebe o que a extração viu na nota + as regras da política
 * ativa, e devolve o veredito. Três saídas, nenhuma ambígua:
 *
 *  - aprovado       → regra explícita da política autorizou (citada)
 *  - negado         → regra explícita da política vedou (citada) — inclui
 *                     comprovante não fiscal (extrato/Pix/cartão) quando a
 *                     política exige nota fiscal/recibo (v1.8)
 *  - revisao_manual → dúvida MATERIAL: extração incompleta, categoria
 *                     indeterminada, ou ausência de política ativa.
 *                     O gestor decide olhando a evidência — ninguém
 *                     preenche nada, e sem regra na política não há
 *                     aprovação (nem humana no automático).
 *
 * O decisor NUNCA pede dados ao usuário: o que a evidência não mostrou,
 * ninguém digita.
 */

export type ExtracaoNota = {
  categoriaSugerida: CategoriaDespesa | null;
  valor: number | null;
  dataFatoGerador: string | null;
  cnpjEmitente: string | null;
  confiancaExtracao: "alta" | "media" | "baixa";
  camposPendentes: string[];
  /** Tipo de documento visto pela IA de visão; null/ausente = OCR sem classificação (heurístico, dados antigos) */
  tipoDocumento?: TipoDocumento | null;
  confiancaTipo?: "alta" | "media" | "baixa" | null;
};

export type DecisaoReembolso = {
  decisao: "aprovado" | "negado" | "revisao_manual";
  /** Frases PT-BR exibidas ao usuário/gestor — a "regra citada". */
  motivos: string[];
  /** Observações que NÃO bloqueiam a decisão (ex.: CNPJ não identificado no comprovante). */
  ressalvas: string[];
  /** Confiança da decisão; rebaixada a "media" quando há ressalva. */
  confianca: ConfiancaExtracao;
  regrasAplicadas: RegraAplicada[];
  /** Categoria efetivamente usada na decisão (null quando indeterminada). */
  categoria: CategoriaDespesa | null;
};

/**
 * Tipos que não são documento fiscal — extrato e Pix/cartão.
 * "outro" NÃO entra (v1.8): é o balde de incerteza do prompt de visão ("qualquer outra
 * coisa → outro"), e tratá-lo como não fiscal rejeitava NFC-e de maquininha.
 */
const TIPOS_NAO_FISCAIS: ReadonlySet<TipoDocumento> = new Set([
  "extrato_conta",
  "comprovante_pagamento",
]);

/** Tipos sem lastro fiscal evidente — viram ressalva quando a política nada declara (v1.8). */
const TIPOS_SEM_LASTRO_FISCAL: ReadonlySet<TipoDocumento> = new Set([
  "extrato_conta",
  "comprovante_pagamento",
  "outro",
]);

/** Confiança da extração da nota — o CNPJ NÃO entra: sua ausência é ressalva, não bloqueio. */
export function confiancaDaNota(nota: {
  valor: number | null;
  dataFatoGerador: string | null;
  categoriaSugerida: string | null;
}): ConfiancaExtracao {
  if (nota.valor == null || nota.valor <= 0) return "baixa";
  return nota.dataFatoGerador && nota.categoriaSugerida ? "alta" : "media";
}

/** Formata valor monetário em PT-BR: 1234.56 → "1.234,56". */
function fmt(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function decidirReembolso(
  extracao: ExtracaoNota,
  regrasPolitica: RegrasPolitica | null,
  contexto: { temVeiculo: boolean; politicaVersao?: number | null },
): DecisaoReembolso {
  // ── 0.3 Ressalvas e confiança — montadas ANTES do bloco 0 de propósito ───
  // Toda saída deste decisor (inclusive a de "sem política ativa") devolve os
  // dois campos, então eles precisam existir antes da primeira delas.
  // CNPJ ausente não bloqueia a decisão: o agente decide com valor + data +
  // categoria; a falta do CNPJ vira ressalva e rebaixa a confiança.
  const ressalvas: string[] = [];
  if (!extracao.cnpjEmitente) {
    ressalvas.push(
      "CNPJ do emitente não identificado no comprovante — confira na evidência anexada.",
    );
  }
  // Tipo de documento sem lastro fiscal e política silenciosa: o agente não supõe que
  // o comprovante serve nem que não serve — declara o que viu e segue as regras de valor.
  const tipoDoc = extracao.tipoDocumento ?? null;
  if (
    tipoDoc &&
    TIPOS_SEM_LASTRO_FISCAL.has(tipoDoc) &&
    regrasPolitica &&
    !regrasPolitica.exigeDocumentoFiscal
  ) {
    ressalvas.push(
      `Documento enviado parece ser ${TIPO_DOCUMENTO_LABELS[tipoDoc]}; sua política não declara se esse tipo de comprovante é aceito.`,
    );
  }
  const confianca: ConfiancaExtracao =
    ressalvas.length > 0 && extracao.confiancaExtracao === "alta"
      ? "media"
      : extracao.confiancaExtracao;

  // ── 0. Sem política ativa, nada pode ser aprovado (D-013) ────────────────
  if (!regrasPolitica) {
    return {
      decisao: "revisao_manual",
      motivos: [
        "Empresa sem política de reembolso ativa — nenhuma despesa pode ser aprovada automaticamente.",
      ],
      ressalvas,
      confianca,
      regrasAplicadas: [],
      categoria: extracao.categoriaSugerida,
    };
  }

  // ── 0.5 Comprovante não fiscal (extrato/Pix/cartão) — regra da política ──
  if (regrasPolitica.exigeDocumentoFiscal && tipoDoc && TIPOS_NAO_FISCAIS.has(tipoDoc)) {
    const regraDoc =
      regrasPolitica.regrasExtraidas.find((r) => r.id === regrasPolitica.regraDocumentoFiscalId) ?? null;
    const rotulo = TIPO_DOCUMENTO_LABELS[tipoDoc];
    const idRegra = regraDoc?.id ?? regrasPolitica.regraDocumentoFiscalId ?? "documento-fiscal-exigido";
    if (extracao.confiancaTipo === "alta") {
      const versao = contexto.politicaVersao != null ? ` (v${contexto.politicaVersao})` : "";
      return {
        decisao: "negado",
        motivos: [
          `Comprovante não aceito pela política: o documento enviado parece ser ${rotulo} — a política exige nota fiscal ou recibo.`,
          `Regra "${idRegra}" da política${versao}: ${regraDoc?.descricao ?? "comprovantes de pagamento não são aceitos"}${regraDoc?.condicao ? ` — Condição: ${regraDoc.condicao}` : ""}.`,
          "Peça a nota fiscal ao estabelecimento e reenvie a despesa.",
        ],
        ressalvas,
        confianca,
        regrasAplicadas: [
          { regra: idRegra, resultado: "falhou", detalhe: `tipo de documento detectado: ${rotulo} (confiança alta)` },
        ],
        categoria: extracao.categoriaSugerida,
      };
    }
    // Dúvida sobre o tipo NÃO nega (D-013): gestor confirma olhando a imagem
    return {
      decisao: "revisao_manual",
      motivos: [
        `Documento parece ser ${rotulo}, não nota fiscal — enviado para o gestor confirmar.`,
      ],
      ressalvas,
      confianca,
      regrasAplicadas: [
        { regra: idRegra, resultado: "revisar", detalhe: `tipo de documento detectado: ${rotulo} (confiança ${extracao.confiancaTipo ?? "desconhecida"})` },
      ],
      categoria: extracao.categoriaSugerida,
    };
  }

  // ── 1. Extração incompleta = dúvida material → revisão manual ────────────
  const faltantes: string[] = [];
  if (extracao.valor == null || extracao.valor <= 0) faltantes.push("valor total");
  if (!extracao.dataFatoGerador) faltantes.push("data");
  if (faltantes.length > 0) {
    return {
      decisao: "revisao_manual",
      motivos: [
        `Não foi possível extrair ${faltantes.join(", ")} da imagem — enviada para revisão do gestor.`,
      ],
      ressalvas,
      confianca,
      regrasAplicadas: [
        {
          regra: "extracao",
          resultado: "revisar",
          detalhe: `confiança ${extracao.confiancaExtracao}; faltantes: ${faltantes.join(", ")}`,
        },
      ],
      categoria: extracao.categoriaSugerida,
    };
  }

  // ── 2. Categoria indeterminada = não dá para aplicar a política ──────────
  if (!extracao.categoriaSugerida) {
    return {
      decisao: "revisao_manual",
      motivos: [
        "Categoria da despesa não identificada na nota — enviada para revisão do gestor.",
      ],
      ressalvas,
      confianca,
      regrasAplicadas: [
        {
          regra: "categoria",
          resultado: "revisar",
          detalhe: "nenhuma categoria detectada pela extração",
        },
      ],
      categoria: null,
    };
  }

  // ── 3. Política: aprova, nega ou devolve — sempre citando a regra ────────
  const veredito = avaliarDespesa(
    { categoria: extracao.categoriaSugerida, valorNota: extracao.valor! },
    regrasPolitica,
    { temVeiculo: contexto.temVeiculo, temEvidencia: true },
  );

  if (veredito.decisao === "aprovado") {
    return {
      decisao: "aprovado",
      motivos: [
        `Dentro da política: ${CATEGORIA_DESPESA_ROTULO[extracao.categoriaSugerida]} de R$ ${fmt(extracao.valor!)}.`,
        ...veredito.motivos,
      ],
      ressalvas,
      confianca,
      regrasAplicadas: veredito.regrasAplicadas,
      categoria: extracao.categoriaSugerida,
    };
  }

  if (veredito.decisao === "negado") {
    return {
      decisao: "negado",
      motivos: veredito.motivos,
      ressalvas,
      confianca,
      regrasAplicadas: veredito.regrasAplicadas,
      categoria: extracao.categoriaSugerida,
    };
  }

  // revisao_humana do avaliador → revisão manual do gestor (motivo da política)
  return {
    decisao: "revisao_manual",
    motivos: veredito.motivos,
    ressalvas,
    confianca,
    regrasAplicadas: veredito.regrasAplicadas,
    categoria: extracao.categoriaSugerida,
  };
}
