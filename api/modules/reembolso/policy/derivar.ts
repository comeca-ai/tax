import {
  CATEGORIAS_DESPESA,
  CATEGORIA_DESPESA_ROTULO,
  LACUNAS_MAX,
  TEMAS_POLITICA,
  UNIDADES_LIMITE_TEMPORAIS,
  type CategoriaDespesa,
  type CategoriaRegraCitada,
  type LacunaPolitica,
  type LacunaTipo,
  type RegraExtraida,
  type RegrasPolitica,
  type UnidadeLimiteTemporal,
} from "@contracts/types";

/**
 * Derivação dos parâmetros consumidos pelo agente (`avaliarDespesa`) a partir
 * das regras estruturadas extraídas do documento (v1.7).
 *
 * As regras extraídas são a única fonte editável pelo gestor; limites por
 * categoria, exigências e tetos gerais nascem delas aqui, no servidor.
 *
 * v1.8 — a política é a única fonte: NENHUM parâmetro nasce de texto livre. Decisão
 * automática (aprovar/negar) existe só onde o gestor marcou `decisaoAutomatica` no
 * card da regra (D-013), e a marcação NUNCA tem alcance maior do que a regra declara.
 * Onde a política não define — vedado de categoria convivendo com permissivo, vedado
 * sem marcação, marcação sem valor, marcação que a derivação não consegue aplicar — o
 * agente não decide: a derivação produz uma LACUNA nomeada, dizendo o que falta e o
 * que fazer, e a despesa vai para revisão.
 *
 * Funções puras, sem I/O — mesmo padrão de `decidirReembolso()`.
 */

export type ParametrosDerivados = Pick<
  RegrasPolitica,
  | "limitesPorCategoria"
  | "tetosTemporaisPorCategoria"
  | "limitesCitados"
  | "categoriasVedadas"
  | "categoriasExcecao"
  | "exigeVeiculoCadastrado"
  | "exigeEvidencia"
  | "aprovacaoAutomaticaAte"
  | "aprovacaoAutomaticaAteRegraId"
  | "aprovacaoAutomaticaPorCategoria"
  | "aprovacaoCitadaPorCategoria"
  | "revisaoHumanaAcimaDe"
  | "revisaoHumanaAcimaDeRegraId"
  | "negacaoAcimaDe"
  | "negacaoAcimaDeRegraId"
  | "exigeDocumentoFiscal"
  | "regraDocumentoFiscalId"
  | "exigeDocumentoFiscalPorCategoria"
  | "lacunas"
>;

/** Unidades que não são dinheiro (percentual, prazos) — nunca viram teto em reais. */
function limiteNaoMonetario(r: RegraExtraida): boolean {
  const u = r.unidadeLimite ?? "";
  return u === "percentual" || u.startsWith("dias_");
}

/** Teto em reais aplicável: valor presente, em BRL e não percentual/prazo. */
function temValorEmReais(r: RegraExtraida): boolean {
  return r.valorLimite !== null && r.moeda === "BRL" && !limiteNaoMonetario(r);
}

/**
 * Valor capaz de fundamentar DECISÃO automática: em reais e MAIOR QUE ZERO.
 * `valorLimite: 0` marcado "negar" virava `negacaoAcimaDe = 0` e negava toda despesa
 * da empresa; marcado "aprovar" virava um teto que não aprova nada (v1.8).
 * Teto de categoria (que só produz revisão) segue aceitando zero — não é decisão.
 */
function temValorDeDecisao(r: RegraExtraida): boolean {
  return temValorEmReais(r) && (r.valorLimite as number) > 0;
}

/**
 * A marcação "aprovar" desta regra chega a produzir teto?
 * Sempre exige regra REEMBOLSÁVEL: teto geral saía de regra vedada marcada "aprovar"
 * porque o filtro de `reembolsavel` só existia no caminho por categoria — a tela
 * barrava, o servidor não, e uma porta de decisão não pode depender da tela (D-013).
 * Sem categoria vira teto geral; com categoria só quando o gestor promoveu a regra
 * para a categoria inteira — marcar "aprovar" num sub-item não autoriza nada.
 */
function aprovacaoTemEfeito(r: RegraExtraida): boolean {
  if (!temValorDeDecisao(r) || r.reembolsavel !== "sim") return false;
  return r.categoria === null || r.escopo === "categoria";
}

/**
 * A marcação "negar" desta regra chega a produzir negação?
 * Sempre exige regra VEDADA (ver `aprovacaoTemEfeito`: mesma lacuna, mesmo motivo).
 * Sem categoria: teto geral de negação, exige valor em reais > 0.
 * Com categoria: veda a categoria inteira, exige regra promovida e SEM valor —
 * regra vedada COM valor ("hospedagem acima de R$ 800 não é reembolsada") negaria
 * hospedagem de R$ 100, alcance maior do que a regra declara (D-013).
 */
function negacaoTemEfeito(r: RegraExtraida): boolean {
  if (r.reembolsavel !== "vedado") return false;
  if (r.categoria === null) return temValorDeDecisao(r);
  return r.escopo === "categoria" && r.valorLimite === null;
}

/**
 * A exigência de nota fiscal desta regra chega a valer?
 * Mesma trava das outras portas de negação: sem categoria vale na empresa toda; com
 * categoria só quando a regra foi promovida. Marcar "só aceito nota fiscal ou recibo"
 * em "Gorjeta ao camareiro só com recibo" (sub-item de hospedagem) negava a diária de
 * hotel paga por Pix citando a regra da gorjeta (D-013).
 */
function documentoFiscalTemEfeito(r: RegraExtraida): boolean {
  if (!r.exigeDocumentoFiscal) return false;
  return r.categoria === null || r.escopo === "categoria";
}

/** "1 regra" · "3 regras" — contagem em vez de eleger um par arbitrário de regras. */
function plural(n: number, singular: string, pluralForma = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}

/**
 * Regra de MENOR valorLimite (empate: a primeira da lista).
 * Duas regras com tetos diferentes não são conflito: são duas regras, e aplicar as duas
 * significa que o menor teto governa — acima dele, revisão. Não é eleger vencedora.
 */
function menorTeto(regras: RegraExtraida[]): RegraExtraida | null {
  let escolhida: RegraExtraida | null = null;
  for (const r of regras) {
    if (r.valorLimite === null) continue;
    if (escolhida === null || r.valorLimite < (escolhida.valorLimite as number)) escolhida = r;
  }
  return escolhida;
}

/** Descrição encurtada para o motivo lido em tooltip/mobile. */
function curto(texto: string, max = 120): string {
  return texto.length <= max ? texto : `${texto.slice(0, max - 1).trimEnd()}…`;
}

function citar(categoria: CategoriaDespesa, r: RegraExtraida, motivo: string): CategoriaRegraCitada {
  return { categoria, regraId: r.id, descricao: r.descricao, motivo };
}

/** Tamanho do `motivo` no contrato (`lacunaPoliticaSchema` / `categoriaRegraCitadaSchema`). */
const MOTIVO_MAX = 400;

/**
 * Lacuna nomeada, com o motivo já dentro do contrato: uma frase montada com duas
 * descrições longas passava de 400 caracteres e derrubava o reparse da política.
 */
function lacuna(
  tipo: LacunaTipo,
  categoria: CategoriaDespesa | null,
  regraIds: string[],
  motivo: string,
): LacunaPolitica {
  return { tipo, categoria, regraIds: regraIds.slice(0, 20), motivo: curto(motivo, MOTIVO_MAX) };
}

/** Parâmetros do agente derivados das regras extraídas (ver regras no cabeçalho). */
export function derivarParametros(regras: RegraExtraida[]): ParametrosDerivados {
  const lacunas: LacunaPolitica[] = [];

  // 1. Limite da categoria: SÓ de regra que o gestor marcou com escopo "categoria".
  // Uma regra de escopo "item" descreve um sub-item ("Lavanderia em viagens — R$ 30/dia")
  // e nunca vira teto da categoria: era o bug que negava um hotel de R$ 691,17 citando
  // um limite de lavanderia de R$ 30.
  // Havendo várias, APLICAM-SE TODAS: o menor teto governa e é ele que a decisão cita.
  const limitesPorCategoria: Partial<Record<CategoriaDespesa, number | null>> = {};
  const limitesCitados: CategoriaRegraCitada[] = [];
  // Teto por período (diária, viagem, evento): rótulo do motivo ("R$ 400,00 por dia").
  // Desde a v1.8 não muda mais o desfecho — estourar teto de categoria é sempre revisão.
  const tetosTemporaisPorCategoria: Partial<Record<CategoriaDespesa, UnidadeLimiteTemporal>> = {};
  // 1b. Teto de aprovação automática POR categoria: só de regra que o gestor marcou
  // "o agente pode aprovar sozinho" (D-013 — nenhum texto livre autoriza aprovação).
  const aprovacaoAutomaticaPorCategoria: Partial<Record<CategoriaDespesa, number>> = {};
  const aprovacaoCitadaPorCategoria: CategoriaRegraCitada[] = [];
  for (const cat of CATEGORIAS_DESPESA) {
    const rotulo = CATEGORIA_DESPESA_ROTULO[cat];
    const promovidas = regras.filter(
      (r) =>
        r.categoria === cat &&
        r.escopo === "categoria" &&
        r.reembolsavel === "sim" &&
        temValorEmReais(r),
    );
    const teto = menorTeto(promovidas);
    if (teto !== null) {
      const valor = teto.valorLimite as number;
      limitesPorCategoria[cat] = valor;
      const unidade = UNIDADES_LIMITE_TEMPORAIS.includes(teto.unidadeLimite as UnidadeLimiteTemporal)
        ? (teto.unidadeLimite as UnidadeLimiteTemporal)
        : null;
      if (unidade) tetosTemporaisPorCategoria[cat] = unidade;
      limitesCitados.push(
        citar(
          cat,
          teto,
          `Teto de ${rotulo} na política: R$ ${valor}${unidade ? ` por ${unidade}` : ""} — regra: "${curto(teto.descricao)}".`,
        ),
      );
    }
    // O teto de aprovação nunca é maior do que o teto da categoria: com "aprova até
    // R$ 400" e outra regra fixando R$ 150, o chip verde dizia 400 e o agente parava
    // em 150. Aplicam-se as duas — vale a menor, e o motivo nomeia as duas regras.
    const tetoAprovacao = menorTeto(
      promovidas.filter((r) => r.decisaoAutomatica === "aprovar" && temValorDeDecisao(r)),
    );
    if (tetoAprovacao !== null) {
      const autorizado = tetoAprovacao.valorLimite as number;
      const tetoDaCategoria = teto !== null ? (teto.valorLimite as number) : null;
      const efetivo =
        tetoDaCategoria !== null ? Math.min(autorizado, tetoDaCategoria) : autorizado;
      aprovacaoAutomaticaPorCategoria[cat] = efetivo;
      aprovacaoCitadaPorCategoria.push(
        citar(
          cat,
          tetoAprovacao,
          teto !== null && efetivo < autorizado
            ? `O agente aprova sozinho ${rotulo} até R$ ${efetivo}: a regra "${curto(tetoAprovacao.descricao, 80)}" autoriza até R$ ${autorizado}, mas o teto de ${rotulo} na política é menor — regra: "${curto(teto.descricao, 80)}".`
            : `O agente aprova sozinho ${rotulo} até R$ ${efetivo} — regra: "${curto(tetoAprovacao.descricao)}".`,
        ),
      );
    }
  }

  // 2. Evidência: regra sem categoria exige em todas; com categoria, só nela
  const exigeEvidencia = CATEGORIAS_DESPESA.filter((cat) =>
    regras.some((r) => r.exigeComprovante && (r.categoria === null || r.categoria === cat)),
  );

  // 3. Veículo cadastrado: a regex que o inferia de texto livre morreu na v1.8 e o
  // checkbox por regra ficou adiado (decisão do dono P-3). Sem campo estruturado, a
  // exigência não existe — nada é suposto a partir da descrição da regra.
  const exigeVeiculoCadastrado: CategoriaDespesa[] = [];

  // 4. Tetos gerais (regra sem categoria, em BRL e com valor monetário).
  //    aprovar / negar → SÓ com a marcação `decisaoAutomatica` do gestor: é a única
  //      porta para decisão automática (D-013). Nenhum texto livre autoriza.
  //    revisão humana → não precisa de marcação: o desfecho é a AUSÊNCIA de decisão,
  //      e continua nascendo da regra de governança marcada como exceção.
  //    Havendo várias, aplicam-se todas ⇒ o menor valor governa e é o citado.
  const semCategoriaEmReais = regras.filter((r) => r.categoria === null && temValorEmReais(r));
  const regraAprovacao = menorTeto(
    semCategoriaEmReais.filter((r) => r.decisaoAutomatica === "aprovar" && aprovacaoTemEfeito(r)),
  );
  const regraNegacao = menorTeto(
    semCategoriaEmReais.filter((r) => r.decisaoAutomatica === "negar" && negacaoTemEfeito(r)),
  );
  const regraRevisao = menorTeto(
    semCategoriaEmReais.filter(
      (r) => r.tema === "governanca-do-processo" && r.reembolsavel === "excecao",
    ),
  );

  // 4b. Marcação que o agente NÃO consegue aplicar. O gestor marcou, a tela mostrou o
  // chip e a derivação não produziu nada — era o único caminho que sumia sem deixar
  // rastro. Cada marcação sem efeito vira lacuna nomeada, dizendo o que fazer.
  //
  // Categoria cuja tentativa de VEDAÇÃO ficou sem efeito entra no conjunto abaixo: a
  // lacuna específica já disse o que fazer com aquelas regras vedadas, e repetir em
  // `so-vedado-sem-marcacao` / `conflito-vedado-permissivo` empilharia o mesmo conselho.
  const negacaoSemEfeitoPorCategoria = new Set<CategoriaDespesa>();
  for (const r of regras) {
    const rotulo = r.categoria ? CATEGORIA_DESPESA_ROTULO[r.categoria] : "";
    const desc = curto(r.descricao);

    // "Só aceito nota fiscal ou recibo" é porta de negação e obedece ao mesmo alcance.
    if (r.exigeDocumentoFiscal && !documentoFiscalTemEfeito(r)) {
      lacunas.push(
        lacuna(
          "marcacao-sem-efeito",
          r.categoria,
          [r.id],
          `A regra "${desc}" está marcada como "Só aceito nota fiscal ou recibo", mas vale só para um sub-item de ${rotulo} — o agente não recusa comprovante nenhum por causa dela. Marque "Vale para a categoria inteira" se a política exige nota fiscal em toda despesa de ${rotulo}.`,
        ),
      );
    }

    if (r.decisaoAutomatica === "nenhuma") continue;

    if (r.decisaoAutomatica === "aprovar") {
      if (aprovacaoTemEfeito(r)) continue;
      // P-5: nenhuma aprovação automática sem limite em reais declarado.
      if (!temValorDeDecisao(r)) {
        lacunas.push(
          lacuna(
            "marcacao-sem-valor",
            r.categoria,
            [r.id],
            `A regra "${desc}" está marcada para o agente aprovar sozinho, mas não tem limite em reais — o agente não pode aplicá-la. Informe o valor limite em reais desta regra, ou volte a decisão automática para "Só o gestor decide".`,
          ),
        );
        continue;
      }
      if (r.reembolsavel !== "sim") {
        lacunas.push(
          lacuna(
            "marcacao-sem-efeito",
            r.categoria,
            [r.id],
            `A regra "${desc}" está marcada para o agente aprovar sozinho, mas não está classificada como reembolsável — o agente não aprova nada por causa dela. Classifique-a como reembolsável ou volte para "Só o gestor decide".`,
          ),
        );
        continue;
      }
      lacunas.push(
        lacuna(
          "marcacao-sem-efeito",
          r.categoria,
          [r.id],
          `A regra "${desc}" está marcada para o agente aprovar sozinho, mas vale só para um sub-item de ${rotulo} — o agente não aprova nada por causa dela. Marque também "Vale para a categoria inteira" para o agente poder aprovar sozinho as despesas de ${rotulo}.`,
        ),
      );
      continue;
    }

    if (negacaoTemEfeito(r)) continue;
    if (r.categoria !== null && r.reembolsavel === "vedado") {
      negacaoSemEfeitoPorCategoria.add(r.categoria);
    }
    // Ordem importa: sem esta checagem antes, uma regra reembolsável SEM categoria
    // marcada "negar" recebia o conselho errado ("informe o valor"), que a
    // transformaria em teto de negação da empresa inteira.
    if (r.reembolsavel !== "vedado") {
      lacunas.push(
        lacuna(
          "marcacao-sem-efeito",
          r.categoria,
          [r.id],
          `A regra "${desc}" está marcada para o agente negar sozinho, mas não está classificada como vedada — só regra vedada autoriza negação automática. O agente não nega nada por causa dela.`,
        ),
      );
      continue;
    }
    if (r.categoria === null) {
      lacunas.push(
        lacuna(
          "marcacao-sem-efeito",
          null,
          [r.id],
          `A regra "${desc}" está marcada para o agente negar sozinho, mas não tem categoria nem valor em reais — o agente não nega nada por causa dela. Informe o valor acima do qual a despesa é negada, ou escolha a categoria e marque "Vale para a categoria inteira".`,
        ),
      );
      continue;
    }
    if (r.valorLimite !== null) {
      lacunas.push(
        lacuna(
          "marcacao-sem-efeito",
          r.categoria,
          [r.id],
          `A regra "${desc}" veda ${rotulo} a partir de um valor, e o agente não nega a categoria inteira por causa de um limite — negaria também as despesas abaixo dele. Para vedar ${rotulo} por completo, cadastre uma regra vedada SEM valor e marque "Vale para a categoria inteira".`,
        ),
      );
      continue;
    }
    lacunas.push(
      lacuna(
        "marcacao-sem-efeito",
        r.categoria,
        [r.id],
        `A regra "${desc}" está marcada para o agente negar sozinho, mas vale só para um sub-item de ${rotulo} — o agente não nega a categoria inteira por causa dela. Marque "Vale para a categoria inteira" se a política veda ${rotulo} por completo.`,
      ),
    );
  }

  // 5. Exigência de documento fiscal: declaração estruturada do gestor no card
  // ("só aceito nota fiscal ou recibo"). O match pelo id `comprovantes-nao-aceitos`,
  // que nenhum prompt pedia, morreu na v1.8 (decisão do dono P-2).
  // Regra COM categoria exige só naquela categoria: marcar o checkbox numa regra de
  // hospedagem negava extrato em alimentação citando a regra de hospedagem (v1.8).
  // E só quando a regra vale para a categoria INTEIRA (`documentoFiscalTemEfeito`):
  // marcada num sub-item ("gorjeta ao camareiro só com recibo"), negava a diária de
  // hotel paga por Pix citando a gorjeta.
  const regraDoc = regras.find((r) => r.exigeDocumentoFiscal && r.categoria === null);
  const exigeDocumentoFiscalPorCategoria: CategoriaRegraCitada[] = [];
  for (const cat of CATEGORIAS_DESPESA) {
    const r = regras.find((x) => x.categoria === cat && documentoFiscalTemEfeito(x));
    if (!r) continue;
    exigeDocumentoFiscalPorCategoria.push(
      citar(
        cat,
        r,
        `A política de ${CATEGORIA_DESPESA_ROTULO[cat]} só aceita nota fiscal ou recibo — regra: "${curto(r.descricao)}".`,
      ),
    );
  }

  // 6. Vedação e exceção POR CATEGORIA — só o que a política DECLARA:
  //    (1) categoria vedada ⇒ regra vedada, SEM valor, marcada "negar" com escopo
  //        "categoria" (regra vedada com valor não veda a categoria: ver `negacaoTemEfeito`);
  //    (2) categoria em exceção ⇒ regra "excecao" com escopo "categoria";
  //    (3) conflito de hierarquia (vedado convivendo com permissivo) é LACUNA — mas só
  //        quando a regra vedada vale para a CATEGORIA INTEIRA. Regra vedada de escopo
  //        "item" (frigobar, gorjeta, bebida alcoólica) é declaração sobre um sub-item,
  //        não discordância sobre a categoria: tratá-la como conflito travava hospedagem
  //        (6 vedadas de sub-item) e Uber (1) em revisão para sempre, sem gesto na tela
  //        capaz de resolver. DIVERGE da spec §3.1 item 7 — decisão do dono, 24/08.
  const categoriasVedadas: CategoriaRegraCitada[] = [];
  const categoriasExcecao: CategoriaRegraCitada[] = [];
  for (const cat of CATEGORIAS_DESPESA) {
    const daCategoria = regras.filter((r) => r.categoria === cat);
    if (daCategoria.length === 0) continue;
    const rotulo = CATEGORIA_DESPESA_ROTULO[cat];
    const vedadas = daCategoria.filter((r) => r.reembolsavel === "vedado");
    const permissivas = daCategoria.filter((r) => r.reembolsavel === "sim");

    const vetoDeCategoria = vedadas.find(
      (r) => r.decisaoAutomatica === "negar" && negacaoTemEfeito(r),
    );
    if (vetoDeCategoria) {
      categoriasVedadas.push(
        citar(
          cat,
          vetoDeCategoria,
          `Categoria ${rotulo} vedada pela política — regra: "${curto(vetoDeCategoria.descricao)}".`,
        ),
      );
      continue;
    }

    const excecao = daCategoria.find((r) => r.reembolsavel === "excecao" && r.escopo === "categoria");
    if (excecao) {
      categoriasExcecao.push(
        citar(
          cat,
          excecao,
          `Categoria ${rotulo} exige aprovação superior na política — regra: "${curto(excecao.descricao)}".`,
        ),
      );
    }

    if (vedadas.length === 0 || negacaoSemEfeitoPorCategoria.has(cat)) continue;
    const vedadasDaCategoriaInteira = vedadas.filter((r) => r.escopo === "categoria");
    if (permissivas.length > 0) {
      // Só regra vedada promovida à categoria discorda de uma regra que libera.
      if (vedadasDaCategoriaInteira.length === 0) continue;
      lacunas.push(
        lacuna(
          "conflito-vedado-permissivo",
          cat,
          [...vedadasDaCategoriaInteira.map((r) => r.id), ...permissivas.map((r) => r.id)],
          `Em ${rotulo}, ${plural(vedadasDaCategoriaInteira.length, "regra veda", "regras vedam")} a categoria inteira e ${plural(permissivas.length, "regra a libera", "regras a liberam")} — a política não diz qual prevalece. Abra as regras vedadas de ${rotulo} e desmarque "Vale para a categoria inteira" nas que descrevem só um sub-item. Enquanto isso a despesa vai para a sua revisão.`,
        ),
      );
    } else {
      lacunas.push(
        lacuna(
          "so-vedado-sem-marcacao",
          cat,
          vedadas.map((r) => r.id),
          `A política só tem ${plural(vedadas.length, "regra vedada", "regras vedadas")} para ${rotulo} e nenhuma diz o que é permitido — o agente não aprova nem nega sozinho. Para o agente negar ${rotulo} por completo, cadastre uma regra vedada SEM valor, marque "Vale para a categoria inteira" e "O agente pode negar sozinho". Enquanto isso a despesa vai para a sua revisão.`,
        ),
      );
    }
  }

  // 6b. Teto de lacunas: mais do que o contrato aceita derrubava o reparse da política
  // (`too_big`) e, com ele, `politica.get`, `politica.ativa` e a decisão automática da
  // empresa inteira. O corte troca a última pela lacuna agregada, SEM categoria — ou
  // seja, manda tudo para revisão: truncar só pode errar para o lado seguro (D-013).
  const lacunasGravadas =
    lacunas.length <= LACUNAS_MAX
      ? lacunas
      : [
          ...lacunas.slice(0, LACUNAS_MAX - 1),
          lacuna(
            "lacunas-demais",
            null,
            [],
            `A política tem ${lacunas.length} pontos que o agente não consegue aplicar — mais do que cabe no relatório. Enquanto isso, TODA despesa vai para a sua revisão. Revise as regras marcadas para o agente decidir sozinho e as categorias com regras vedadas.`,
          ),
        ];

  return {
    limitesPorCategoria,
    tetosTemporaisPorCategoria,
    limitesCitados,
    categoriasVedadas,
    categoriasExcecao,
    exigeVeiculoCadastrado,
    exigeEvidencia,
    aprovacaoAutomaticaAte: regraAprovacao?.valorLimite ?? null,
    aprovacaoAutomaticaAteRegraId: regraAprovacao?.id ?? null,
    aprovacaoAutomaticaPorCategoria,
    aprovacaoCitadaPorCategoria,
    revisaoHumanaAcimaDe: regraRevisao?.valorLimite ?? null,
    revisaoHumanaAcimaDeRegraId: regraRevisao?.id ?? null,
    negacaoAcimaDe: regraNegacao?.valorLimite ?? null,
    negacaoAcimaDeRegraId: regraNegacao?.id ?? null,
    exigeDocumentoFiscal: regraDoc !== undefined,
    regraDocumentoFiscalId: regraDoc?.id ?? null,
    exigeDocumentoFiscalPorCategoria,
    lacunas: lacunasGravadas,
  };
}

function fmtValor(r: RegraExtraida): string {
  if (r.valorLimite === null) return "";
  const sufixo = r.unidadeLimite && !r.unidadeLimite.startsWith("dias_") ? `/${r.unidadeLimite}` : "";
  return ` — até ${r.moeda === "BRL" ? "R$" : r.moeda} ${r.valorLimite}${sufixo}`;
}

/** Observações textuais por tema (formato lido por `observacoes.ts` e pelo resumo da política antiga). */
export function observacoesDe(regras: RegraExtraida[]): string[] {
  const observacoes: string[] = [];
  for (const [slug, titulo] of TEMAS_POLITICA) {
    const doTema = regras.filter((r) => r.tema === slug);
    if (!doTema.length) continue;
    observacoes.push(`— ${titulo} —`);
    for (const r of doTema) {
      const marcador =
        r.reembolsavel === "vedado" ? "VEDADO: " : r.reembolsavel === "excecao" ? "EXCEÇÃO (aprovação superior): " : "";
      const condicao = r.condicao ? ` (${r.condicao})` : "";
      observacoes.push(`${marcador}${r.descricao}${fmtValor(r)}${condicao}`);
    }
  }
  return observacoes;
}

/**
 * Origem da consolidação:
 *  - "leitura" (default) → política gravada sendo lida/reexibida. Sem regras extraídas
 *    nada é derivado: política demo (id 1 e 2) e saída do parser heurístico trazem os
 *    limites prontos no JSON e derivar aqui os zeraria.
 *  - "edicao" → o gestor acabou de salvar o passo "Revisar regras". Aqui a lista de
 *    regras é a declaração dele, inclusive quando está vazia: apagar todas as regras e
 *    salvar precisa zerar os parâmetros, e não congelar o `aprovacaoAutomaticaAte`
 *    anterior aprovando despesas que nenhuma regra sustenta (D-013).
 */
export type OrigemConsolidacao = "leitura" | "edicao";

/** Regras prontas para gravar: parâmetros e observações derivados das regras extraídas. */
export function consolidarRegras(
  regras: RegrasPolitica,
  origem: OrigemConsolidacao = "leitura",
): RegrasPolitica {
  if (regras.regrasExtraidas.length === 0 && origem === "leitura") return regras;
  return {
    ...regras,
    ...derivarParametros(regras.regrasExtraidas),
    observacoes: observacoesDe(regras.regrasExtraidas),
  };
}
