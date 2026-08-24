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

/** Descrição da regra citada (para o motivo nomear a regra, D-013); "" quando não achada. */
function descricaoDaRegra(regras: RegrasPolitica, id: string | null): string {
  if (!id) return "";
  return regras.regrasExtraidas.find((r) => r.id === id)?.descricao ?? "";
}

/** ` Regra: "…".` quando a política citou a regra; string vazia quando não há citação. */
function sufixoRegra(descricao: string): string {
  return descricao ? ` Regra: "${descricao}".` : "";
}

/**
 * Avalia uma despesa contra as regras da política ativa (v1.8 — a política é a única fonte).
 * Ordem das regras (primeira negação encerra; revisões acumulam):
 * 1. categoria em categoriasVedadas → negado citando a regra (só regra marcada "negar")
 * 2. valorNota > negacaoAcimaDe → negado citando a regra
 * 3. lacunas aplicáveis da política → revisão humana nomeando o que falta
 * 4. categoria em categoriasExcecao → revisão humana citando a regra
 * 5. valorNota > limite da categoria → SEMPRE revisão humana, nunca negação: a
 *    tolerância de 1,5× era um número que a política nunca escreveu (D-013)
 * 6. valorNota > revisaoHumanaAcimaDe → revisão humana
 * 7. categoria exige veículo cadastrado / evidência e não há → revisão humana
 * 8. nada falhou E existe teto de aprovação aplicável E o valor respeita TODOS eles
 *    → aprovado; sem nenhum teto declarado → revisão humana nomeando a ausência
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
        `Despesa acima do teto da política: R$ ${fmtBRL(valorNota)} > R$ ${fmtBRL(regras.negacaoAcimaDe)}.${sufixoRegra(descricaoDaRegra(regras, regras.negacaoAcimaDeRegraId))}`,
      );
      return { decisao: "negado", motivos, regrasAplicadas };
    }
  }

  // ── 3. Lacunas: onde a política não define, o agente não decide ──────────
  // Uma lacuna sem categoria vale para toda despesa; com categoria, só nela.
  for (const lacuna of regras.lacunas) {
    if (lacuna.categoria !== null && lacuna.categoria !== categoria) continue;
    regrasAplicadas.push({
      regra: "lacunaDaPolitica",
      resultado: "revisar",
      detalhe: lacuna.tipo,
    });
    motivos.push(lacuna.motivo);
    precisaRevisao = true;
  }

  // ── 4. Categoria em exceção: aprovação superior → revisão humana ─────────
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

  // ── 5. Limite da categoria — acima dele é SEMPRE revisão ────────────────
  // A tolerância de 1,5× saiu na v1.8: era um número que a política nunca escreveu, e
  // negar por ele violava D-013. Estourar teto de categoria manda ao gestor citando a
  // regra que fixou o teto (`limitesCitados`).
  const limite = regras.limitesPorCategoria[categoria];
  if (limite != null) {
    const unidade = regras.tetosTemporaisPorCategoria[categoria] ?? null;
    const label = CATEGORIA_DESPESA_ROTULO[categoria];
    const tetoTxt = `R$ ${fmtBRL(limite)}${unidade ? ` por ${unidade}` : ""}`;
    const citada = regras.limitesCitados.find((c) => c.categoria === categoria) ?? null;
    const sufixo = sufixoRegra(citada?.descricao ?? "");
    if (valorNota > limite) {
      regrasAplicadas.push({
        regra: "limitePorCategoria",
        resultado: "revisar",
        detalhe: `R$ ${fmtBRL(valorNota)} acima do limite de ${label} (${tetoTxt})${citada ? ` — regra: "${citada.descricao}"` : ""}`,
      });
      motivos.push(
        `Valor de ${label} acima do limite da política (${tetoTxt}): R$ ${fmtBRL(valorNota)}.${sufixo} A despesa vai para a sua revisão.`,
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

  // ── 6. Faixa de revisão humana por valor ─────────────────────────────────
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
        `Valor acima da faixa de revisão humana da política: R$ ${fmtBRL(valorNota)} > R$ ${fmtBRL(regras.revisaoHumanaAcimaDe)}.${sufixoRegra(descricaoDaRegra(regras, regras.revisaoHumanaAcimaDeRegraId))}`,
      );
      precisaRevisao = true;
    }
  }

  // ── 7a. Exigência de veículo cadastrado ──────────────────────────────────
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

  // ── 7b. Exigência de evidência documental ────────────────────────────────
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

  // ── 8. Aprovação automática — só onde o gestor declarou ─────────────────
  if (precisaRevisao) {
    return { decisao: "revisao_humana", motivos, regrasAplicadas };
  }

  // Tetos aplicáveis: o global e o da categoria. Aplicam-se TODOS — o valor precisa
  // caber em cada um deles; nenhum teto declarado = nenhuma autorização (D-013).
  // Cada teto carrega a regra que o autorizou: aprovar era o único desfecho que não
  // citava regra nenhuma, e o gestor não tinha como enxergar que uma regra sobre
  // lavagem de carro alugado estava liberando o Uber de lazer dele (D-013).
  const tetosAplicaveis: { valor: number; rotulo: string; descricao: string }[] = [];
  if (regras.aprovacaoAutomaticaAte != null) {
    tetosAplicaveis.push({
      valor: regras.aprovacaoAutomaticaAte,
      rotulo: "teto de aprovação automática",
      descricao: descricaoDaRegra(regras, regras.aprovacaoAutomaticaAteRegraId),
    });
  }
  const tetoDaCategoria = regras.aprovacaoAutomaticaPorCategoria[categoria];
  if (tetoDaCategoria != null) {
    const citada = (regras.aprovacaoCitadaPorCategoria ?? []).find(
      (c) => c.categoria === categoria,
    );
    tetosAplicaveis.push({
      valor: tetoDaCategoria,
      rotulo: `teto de aprovação automática de ${CATEGORIA_DESPESA_ROTULO[categoria]}`,
      descricao: citada?.descricao ?? "",
    });
  }

  if (tetosAplicaveis.length === 0) {
    regrasAplicadas.push({
      regra: "aprovacaoAutomaticaAte",
      resultado: "revisar",
      detalhe: "nenhuma regra da política marcada para o agente aprovar sozinho",
    });
    motivos.push(
      "A política da empresa não declara nenhuma regra que autorize o agente a aprovar sozinho — a despesa foi enviada para a sua revisão.",
    );
    return { decisao: "revisao_humana", motivos, regrasAplicadas };
  }

  const excedido = tetosAplicaveis
    .filter((t) => valorNota > t.valor)
    .sort((a, b) => a.valor - b.valor)[0];
  if (excedido) {
    regrasAplicadas.push({
      regra: "aprovacaoAutomaticaAte",
      resultado: "revisar",
      detalhe: `R$ ${fmtBRL(valorNota)} acima do ${excedido.rotulo} (R$ ${fmtBRL(excedido.valor)})`,
    });
    motivos.push(
      `Valor acima do ${excedido.rotulo} da política: R$ ${fmtBRL(valorNota)} > R$ ${fmtBRL(excedido.valor)}.${sufixoRegra(excedido.descricao)}`,
    );
    return { decisao: "revisao_humana", motivos, regrasAplicadas };
  }

  // Governa o menor teto aplicável — e é a regra DELE que a aprovação cita.
  const governa = [...tetosAplicaveis].sort((a, b) => a.valor - b.valor)[0];
  regrasAplicadas.push({
    regra: "aprovacaoAutomaticaAte",
    resultado: "passou",
    detalhe: `R$ ${fmtBRL(valorNota)} dentro do ${governa.rotulo} (R$ ${fmtBRL(governa.valor)})${governa.descricao ? ` — regra: "${governa.descricao}"` : ""}`,
  });
  motivos.push(
    `Despesa aprovada automaticamente: R$ ${fmtBRL(valorNota)} ≤ R$ ${fmtBRL(governa.valor)} e nenhuma regra da política falhou.${sufixoRegra(governa.descricao)}`,
  );
  return { decisao: "aprovado", motivos, regrasAplicadas };
}
