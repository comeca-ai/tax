import {
  CATEGORIA_DESPESA_ROTULO,
  type CategoriaDespesa,
  type RegraAplicada,
  type RegrasPolitica,
  type ResultadoPolitica,
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

/**
 * Avalia uma despesa contra as regras da política ativa.
 * Ordem das regras (primeira negação encerra; revisões acumulam):
 * 1. categoria em categoriasVedadas → negado citando a regra
 * 2. valorNota > negacaoAcimaDe → negado
 * 3. categoria em categoriasExcecao → revisão humana citando a regra
 * 4. limite da categoria: > 1,5× → negado; > limite (≤1,5×) → revisão humana.
 *    Teto por período (tetosTemporaisPorCategoria) nunca nega: acima dele, revisão.
 * 5. valorNota > revisaoHumanaAcimaDe → revisão humana
 * 6. categoria exige veículo cadastrado e não há → revisão humana
 * 7. categoria exige evidência e não há → revisão humana
 * 8. valorNota ≤ aprovacaoAutomaticaAte e nada falhou → aprovado
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

  // ── 1. Categoria vedada pela política ────────────────────────────────────
  const vedada = regras.categoriasVedadas.find((c) => c.categoria === categoria);
  if (vedada) {
    regrasAplicadas.push({
      regra: "categoriaVedada",
      resultado: "falhou",
      detalhe: `Regra "${vedada.descricao}" (${vedada.regraId})`,
    });
    motivos.push(vedada.motivo);
    return { decisao: "negado", motivos, regrasAplicadas };
  }

  // ── 2. Teto absoluto de negação ──────────────────────────────────────────
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

  // ── 3. Categoria em exceção: aprovação superior → revisão humana ─────────
  const excecao = regras.categoriasExcecao.find((c) => c.categoria === categoria);
  if (excecao) {
    regrasAplicadas.push({
      regra: "categoriaExcecao",
      resultado: "revisar",
      detalhe: `Regra "${excecao.descricao}" (${excecao.regraId})`,
    });
    motivos.push(excecao.motivo);
    precisaRevisao = true;
  }

  // ── 4. Limite da categoria (1,5× = tolerância antes da negação) ─────────
  // Quando o teto veio de regra com unidade temporal (diária, viagem, evento), um mesmo
  // comprovante pode cobrir vários períodos: estourar o teto vira revisão do gestor, nunca
  // negação automática (D-013). Sem unidade, segue a tolerância de 1,5× de sempre.
  const limite = regras.limitesPorCategoria[categoria];
  if (limite != null) {
    const unidade = regras.tetosTemporaisPorCategoria[categoria] ?? null;
    const label = CATEGORIA_DESPESA_ROTULO[categoria];
    const tetoTxt = `R$ ${fmtBRL(limite)}${unidade ? ` por ${unidade}` : ""}`;
    if (valorNota > limite) {
      if (!unidade && valorNota > limite * 1.5) {
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
      regrasAplicadas.push({
        regra: "limitePorCategoria",
        resultado: "revisar",
        detalhe: unidade
          ? `R$ ${fmtBRL(valorNota)} acima do teto de ${label} (${tetoTxt}); teto por período — revisão humana, sem negação automática`
          : `R$ ${fmtBRL(valorNota)} acima do limite de ${label} (${tetoTxt}), dentro da tolerância de 1,5×`,
      });
      motivos.push(
        unidade
          ? `Valor de ${label} acima do teto da política (${tetoTxt}): R$ ${fmtBRL(valorNota)}. Como o teto é por ${unidade} e o comprovante pode cobrir mais de um, a despesa vai para revisão do gestor em vez de ser negada.`
          : `Valor de ${label} acima do limite da política: R$ ${fmtBRL(valorNota)} > R$ ${fmtBRL(limite)}.`,
      );
      precisaRevisao = true;
    } else {
      regrasAplicadas.push({
        regra: "limitePorCategoria",
        resultado: "passou",
        detalhe: `R$ ${fmtBRL(valorNota)} dentro do limite de ${label} (${tetoTxt})`,
      });
    }
  }

  // ── 5. Faixa de revisão humana por valor ─────────────────────────────────
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

  // ── 6. Exigência de veículo cadastrado ───────────────────────────────────
  if (regras.exigeVeiculoCadastrado.includes(categoria)) {
    const revisar = !contexto.temVeiculo;
    regrasAplicadas.push({
      regra: "exigeVeiculoCadastrado",
      resultado: revisar ? "revisar" : "passou",
      detalhe: revisar
        ? `Categoria ${CATEGORIA_DESPESA_ROTULO[categoria]} exige veículo cadastrado e nenhum foi vinculado`
        : "Veículo cadastrado vinculado à despesa",
    });
    if (revisar) {
      motivos.push(
        `Categoria ${CATEGORIA_DESPESA_ROTULO[categoria]} exige veículo cadastrado na política e a despesa não tem veículo vinculado.`,
      );
      precisaRevisao = true;
    }
  }

  // ── 7. Exigência de evidência documental ─────────────────────────────────
  if (regras.exigeEvidencia.includes(categoria)) {
    const revisar = !contexto.temEvidencia;
    regrasAplicadas.push({
      regra: "exigeEvidencia",
      resultado: revisar ? "revisar" : "passou",
      detalhe: revisar
        ? `Categoria ${CATEGORIA_DESPESA_ROTULO[categoria]} exige evidência documental e nenhuma foi anexada`
        : "Evidência documental anexada",
    });
    if (revisar) {
      motivos.push(
        `Categoria ${CATEGORIA_DESPESA_ROTULO[categoria]} exige evidência documental na política e a despesa não tem evidência anexada.`,
      );
      precisaRevisao = true;
    }
  }

  // ── 8. Aprovação automática (ou default conservador) ─────────────────────
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
