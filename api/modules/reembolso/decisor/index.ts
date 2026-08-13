import type {
  CategoriaDespesa,
  RegraAplicada,
  RegrasPolitica,
} from "@contracts/types";
import { avaliarDespesa } from "../policy/agent";

/**
 * Decisor de reembolso (v1.7.0) — D-013 / D-014.
 *
 * Função PURA: recebe o que a extração viu na nota + as regras da política
 * ativa, e devolve o veredito. Três saídas, nenhuma ambígua:
 *
 *  - aprovado       → regra explícita da política autorizou (citada)
 *  - negado         → regra explícita da política vedou (citada)
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
};

export type DecisaoReembolso = {
  decisao: "aprovado" | "negado" | "revisao_manual";
  /** Frases PT-BR exibidas ao usuário/gestor — a "regra citada". */
  motivos: string[];
  regrasAplicadas: RegraAplicada[];
  /** Categoria efetivamente usada na decisão (null quando indeterminada). */
  categoria: CategoriaDespesa | null;
};

const CATEGORIA_ROTULO: Record<CategoriaDespesa, string> = {
  combustivel: "combustível",
  alimentacao: "alimentação",
  hospedagem: "hospedagem",
  pedagio: "pedágio",
  uber: "Uber/app",
  taxi: "táxi",
};

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
  contexto: { temVeiculo: boolean },
): DecisaoReembolso {
  // ── 0. Sem política ativa, nada pode ser aprovado (D-013) ────────────────
  if (!regrasPolitica) {
    return {
      decisao: "revisao_manual",
      motivos: [
        "Empresa sem política de reembolso ativa — nenhuma despesa pode ser aprovada automaticamente.",
      ],
      regrasAplicadas: [],
      categoria: extracao.categoriaSugerida,
    };
  }

  // ── 1. Extração incompleta = dúvida material → revisão manual ────────────
  const faltantes: string[] = [];
  if (extracao.valor == null || extracao.valor <= 0) faltantes.push("valor total");
  if (!extracao.dataFatoGerador) faltantes.push("data");
  if (!extracao.cnpjEmitente) faltantes.push("CNPJ do emitente");
  if (faltantes.length > 0) {
    return {
      decisao: "revisao_manual",
      motivos: [
        `Não foi possível extrair ${faltantes.join(", ")} da imagem — enviada para revisão do gestor.`,
      ],
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
        `Dentro da política: ${CATEGORIA_ROTULO[extracao.categoriaSugerida]} de R$ ${fmt(extracao.valor!)}.`,
        ...veredito.motivos,
      ],
      regrasAplicadas: veredito.regrasAplicadas,
      categoria: extracao.categoriaSugerida,
    };
  }

  if (veredito.decisao === "negado") {
    return {
      decisao: "negado",
      motivos: veredito.motivos,
      regrasAplicadas: veredito.regrasAplicadas,
      categoria: extracao.categoriaSugerida,
    };
  }

  // revisao_humana do avaliador → revisão manual do gestor (motivo da política)
  return {
    decisao: "revisao_manual",
    motivos: veredito.motivos,
    regrasAplicadas: veredito.regrasAplicadas,
    categoria: extracao.categoriaSugerida,
  };
}
