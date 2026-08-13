import type {
  CategoriaDespesa,
  RegraAplicada,
  RegrasPolitica,
  ResultadoPolitica,
} from "@contracts/types";

/**
 * Agente avaliador da política de reembolso (v1.1.0).
 * Função PURA e testável: não acessa banco nem I/O — as regras da política
 * ativa e o contexto da despesa são passados como parâmetros.
 * Roda DEPOIS do motor tributário (camada independente); sem política ativa
 * o agente não é invocado e o comportamento v1.0.0 é preservado.
 */

export type DespesaPolitica = {
  categoria: CategoriaDespesa;
  valorNota: number;
};

export type ContextoPolitica = {
  temVeiculo: boolean;
  temEvidencia: boolean;
};

/** Formata valor monetário em PT-BR: 1234.56 → "1.234,56". */
export function fmtBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const CATEGORIA_LABELS: Record<CategoriaDespesa, string> = {
  combustivel: "combustível",
  alimentacao: "alimentação",
  hospedagem: "hospedagem",
  pedagio: "pedágio",
  uber: "Uber/app",
  taxi: "táxi",
};

/**
 * Avalia uma despesa contra as regras da política ativa.
 * Ordem das regras (primeira negação encerra; revisões acumulam):
 * 1. valorNota > negacaoAcimaDe → negado
 * 2. limite da categoria: > 1,5× → negado; > limite (≤1,5×) → revisão humana
 * 3. valorNota > revisaoHumanaAcimaDe → revisão humana
 * 4. categoria exige veículo cadastrado e não há → revisão humana
 * 5. categoria exige evidência e não há → revisão humana
 * 6. valorNota ≤ aprovacaoAutomaticaAte e nada falhou → aprovado
 *    (sem teto configurado → default conservador: revisão humana)
 */
export function avaliarDespesa(
  despesa: DespesaPolitica,
  regras: RegrasPolitica,
  contexto: ContextoPolitica,
): ResultadoPolitica {
  const { categoria, valorNota } = despesa;
  const regrasAplicadas: RegraAplicada[] = [];
  const motivos: string[] = [];
  let precisaRevisao = false;

  // ── 1. Teto absoluto de negação ──────────────────────────────────────────
  if (regras.negacaoAcimaDe != null) {
    const falhou = valorNota > regras.negacaoAcimaDe;
    regrasAplicadas.push({
      regra: "negacaoAcimaDe",
      resultado: falhou ? "falhou" : "passou",
      detalhe: falhou
        ? `R$ ${fmtBRL(valorNota)} acima do teto de negação de R$ ${fmtBRL(regras.negacaoAcimaDe)}`
        : `R$ ${fmtBRL(valorNota)} dentro do teto de negação de R$ ${fmtBRL(regras.negacaoAcimaDe)}`,
    });
    if (falhou) {
      motivos.push(
        `Despesa acima do teto da política: R$ ${fmtBRL(valorNota)} > R$ ${fmtBRL(regras.negacaoAcimaDe)}.`,
      );
      return { decisao: "negado", motivos, regrasAplicadas };
    }
  }

  // ── 2. Limite da categoria (1,5× = tolerância antes da negação) ─────────
  const limite = regras.limitesPorCategoria[categoria];
  if (limite != null) {
    const label = CATEGORIA_LABELS[categoria];
    if (valorNota > limite * 1.5) {
      regrasAplicadas.push({
        regra: "limitePorCategoria",
        resultado: "falhou",
        detalhe: `R$ ${fmtBRL(valorNota)} supera 1,5× o limite de ${label} (R$ ${fmtBRL(limite)})`,
      });
      motivos.push(
        `Valor de ${label} acima de 1,5× o limite da política: R$ ${fmtBRL(valorNota)} > R$ ${fmtBRL(limite * 1.5)} (limite R$ ${fmtBRL(limite)}).`,
      );
      return { decisao: "negado", motivos, regrasAplicadas };
    }
    if (valorNota > limite) {
      regrasAplicadas.push({
        regra: "limitePorCategoria",
        resultado: "revisar",
        detalhe: `R$ ${fmtBRL(valorNota)} acima do limite de ${label} (R$ ${fmtBRL(limite)}), dentro da tolerância de 1,5×`,
      });
      motivos.push(
        `Valor de ${label} acima do limite da política: R$ ${fmtBRL(valorNota)} > R$ ${fmtBRL(limite)}.`,
      );
      precisaRevisao = true;
    } else {
      regrasAplicadas.push({
        regra: "limitePorCategoria",
        resultado: "passou",
        detalhe: `R$ ${fmtBRL(valorNota)} dentro do limite de ${label} (R$ ${fmtBRL(limite)})`,
      });
    }
  }

  // ── 3. Faixa de revisão humana por valor ─────────────────────────────────
  if (regras.revisaoHumanaAcimaDe != null) {
    const revisar = valorNota > regras.revisaoHumanaAcimaDe;
    regrasAplicadas.push({
      regra: "revisaoHumanaAcimaDe",
      resultado: revisar ? "revisar" : "passou",
      detalhe: revisar
        ? `R$ ${fmtBRL(valorNota)} acima de R$ ${fmtBRL(regras.revisaoHumanaAcimaDe)} (faixa de revisão humana)`
        : `R$ ${fmtBRL(valorNota)} abaixo da faixa de revisão humana (R$ ${fmtBRL(regras.revisaoHumanaAcimaDe)})`,
    });
    if (revisar) {
      motivos.push(
        `Valor acima da faixa de revisão humana da política: R$ ${fmtBRL(valorNota)} > R$ ${fmtBRL(regras.revisaoHumanaAcimaDe)}.`,
      );
      precisaRevisao = true;
    }
  }

  // ── 4. Exigência de veículo cadastrado ───────────────────────────────────
  if (regras.exigeVeiculoCadastrado.includes(categoria)) {
    const revisar = !contexto.temVeiculo;
    regrasAplicadas.push({
      regra: "exigeVeiculoCadastrado",
      resultado: revisar ? "revisar" : "passou",
      detalhe: revisar
        ? `Categoria ${CATEGORIA_LABELS[categoria]} exige veículo cadastrado e nenhum foi vinculado`
        : "Veículo cadastrado vinculado à despesa",
    });
    if (revisar) {
      motivos.push(
        `Categoria ${CATEGORIA_LABELS[categoria]} exige veículo cadastrado na política e a despesa não tem veículo vinculado.`,
      );
      precisaRevisao = true;
    }
  }

  // ── 5. Exigência de evidência documental ─────────────────────────────────
  if (regras.exigeEvidencia.includes(categoria)) {
    const revisar = !contexto.temEvidencia;
    regrasAplicadas.push({
      regra: "exigeEvidencia",
      resultado: revisar ? "revisar" : "passou",
      detalhe: revisar
        ? `Categoria ${CATEGORIA_LABELS[categoria]} exige evidência documental e nenhuma foi anexada`
        : "Evidência documental anexada",
    });
    if (revisar) {
      motivos.push(
        `Categoria ${CATEGORIA_LABELS[categoria]} exige evidência documental na política e a despesa não tem evidência anexada.`,
      );
      precisaRevisao = true;
    }
  }

  // ── 6. Aprovação automática (ou default conservador) ─────────────────────
  if (precisaRevisao) {
    return { decisao: "revisao_humana", motivos, regrasAplicadas };
  }
  if (regras.aprovacaoAutomaticaAte != null && valorNota <= regras.aprovacaoAutomaticaAte) {
    regrasAplicadas.push({
      regra: "aprovacaoAutomaticaAte",
      resultado: "passou",
      detalhe: `R$ ${fmtBRL(valorNota)} dentro do teto de aprovação automática (R$ ${fmtBRL(regras.aprovacaoAutomaticaAte)})`,
    });
    motivos.push(
      `Despesa aprovada automaticamente: R$ ${fmtBRL(valorNota)} ≤ R$ ${fmtBRL(regras.aprovacaoAutomaticaAte)} e nenhuma regra da política falhou.`,
    );
    return { decisao: "aprovado", motivos, regrasAplicadas };
  }

  // Sem teto de aprovação configurado (ou acima dele): default conservador
  regrasAplicadas.push({
    regra: "aprovacaoAutomaticaAte",
    resultado: "revisar",
    detalhe:
      regras.aprovacaoAutomaticaAte != null
        ? `R$ ${fmtBRL(valorNota)} acima do teto de aprovação automática (R$ ${fmtBRL(regras.aprovacaoAutomaticaAte)})`
        : "Teto de aprovação automática não configurado — default conservador",
  });
  motivos.push(
    regras.aprovacaoAutomaticaAte != null
      ? `Valor acima do teto de aprovação automática: R$ ${fmtBRL(valorNota)} > R$ ${fmtBRL(regras.aprovacaoAutomaticaAte)}.`
      : "Política sem teto de aprovação automática configurado: enviada para revisão humana por precaução.",
  );
  return { decisao: "revisao_humana", motivos, regrasAplicadas };
}
