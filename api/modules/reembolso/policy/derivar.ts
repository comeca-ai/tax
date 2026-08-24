import {
  CATEGORIAS_DESPESA,
  CATEGORIA_DESPESA_ROTULO,
  TEMAS_POLITICA,
  UNIDADES_LIMITE_TEMPORAIS,
  type CategoriaDespesa,
  type CategoriaRegraCitada,
  type LacunaPolitica,
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
 * card da regra (D-013). Onde a política não define — vedado convivendo com
 * permissivo, vedado sem marcação, marcação sem valor — o agente não decide: a
 * derivação produz uma LACUNA nomeada e a despesa vai para revisão dizendo o que falta.
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
  | "revisaoHumanaAcimaDe"
  | "revisaoHumanaAcimaDeRegraId"
  | "negacaoAcimaDe"
  | "negacaoAcimaDeRegraId"
  | "exigeDocumentoFiscal"
  | "regraDocumentoFiscalId"
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
    const tetoAprovacao = menorTeto(
      promovidas.filter((r) => r.decisaoAutomatica === "aprovar"),
    );
    if (tetoAprovacao !== null) {
      aprovacaoAutomaticaPorCategoria[cat] = tetoAprovacao.valorLimite as number;
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
    semCategoriaEmReais.filter((r) => r.decisaoAutomatica === "aprovar"),
  );
  const regraNegacao = menorTeto(semCategoriaEmReais.filter((r) => r.decisaoAutomatica === "negar"));
  const regraRevisao = menorTeto(
    semCategoriaEmReais.filter(
      (r) => r.tema === "governanca-do-processo" && r.reembolsavel === "excecao",
    ),
  );

  // 4b. Marcação sem valor aplicável: o gestor autorizou, mas não deu teto em reais.
  // A regra não vira teto (P-5: nenhuma aprovação automática sem limite declarado) e
  // a lacuna é nomeada para o gestor saber o que falta.
  for (const r of regras) {
    if (r.decisaoAutomatica !== "aprovar" || temValorEmReais(r)) continue;
    lacunas.push({
      tipo: "marcacao-sem-valor",
      categoria: r.categoria,
      regraIds: [r.id],
      motivo: `A regra "${curto(r.descricao)}" está marcada para o agente aprovar sozinho, mas não tem limite em reais — o agente não pode aplicá-la.`,
    });
  }

  // 5. Exigência de documento fiscal: declaração estruturada do gestor no card
  // ("só aceito nota fiscal ou recibo"). O match pelo id `comprovantes-nao-aceitos`,
  // que nenhum prompt pedia, morreu na v1.8 (decisão do dono P-2).
  const regraDoc = regras.find((r) => r.exigeDocumentoFiscal);

  // 6. Vedação e exceção POR CATEGORIA — só o que a política DECLARA:
  //    (1) categoria vedada ⇒ regra vedada marcada "negar" com escopo "categoria";
  //    (2) categoria em exceção ⇒ regra "excecao" com escopo "categoria";
  //    (3) todo o resto (vedado sem marcação, vedado convivendo com permissivo) é
  //        LACUNA: o agente não decide e diz o que falta na política.
  //    Numa política real uber tem 1 "sim" (aplicativos) + 1 "vedado" (gorjetas) e
  //    hospedagem tem 5 "sim", 2 "excecao" e 6 "vedado" (itens pessoais, bagagem,
  //    dependentes) — inferir vedação daí negaria 100% dessas despesas por sub-item.
  const categoriasVedadas: CategoriaRegraCitada[] = [];
  const categoriasExcecao: CategoriaRegraCitada[] = [];
  for (const cat of CATEGORIAS_DESPESA) {
    const daCategoria = regras.filter((r) => r.categoria === cat);
    if (daCategoria.length === 0) continue;
    const rotulo = CATEGORIA_DESPESA_ROTULO[cat];
    const vedadas = daCategoria.filter((r) => r.reembolsavel === "vedado");
    const permissiva = daCategoria.find((r) => r.reembolsavel === "sim") ?? null;

    const vetoDeCategoria = vedadas.find(
      (r) => r.decisaoAutomatica === "negar" && r.escopo === "categoria",
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

    if (vedadas.length === 0) continue;
    if (permissiva) {
      lacunas.push({
        tipo: "conflito-vedado-permissivo",
        categoria: cat,
        regraIds: [vedadas[0].id, permissiva.id],
        motivo: `A política tem regra vedada e regra permissiva para ${rotulo} e não diz qual prevalece — regras: "${curto(vedadas[0].descricao)}" e "${curto(permissiva.descricao)}". A despesa vai para revisão do gestor.`,
      });
    } else {
      lacunas.push({
        tipo: "so-vedado-sem-marcacao",
        categoria: cat,
        regraIds: [vedadas[0].id],
        motivo: `A política só tem regra vedada para ${rotulo} — regra: "${curto(vedadas[0].descricao)}" — e nenhuma está marcada como negação automática. A despesa vai para revisão do gestor.`,
      });
    }
  }

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
    revisaoHumanaAcimaDe: regraRevisao?.valorLimite ?? null,
    revisaoHumanaAcimaDeRegraId: regraRevisao?.id ?? null,
    negacaoAcimaDe: regraNegacao?.valorLimite ?? null,
    negacaoAcimaDeRegraId: regraNegacao?.id ?? null,
    exigeDocumentoFiscal: regraDoc !== undefined,
    regraDocumentoFiscalId: regraDoc?.id ?? null,
    lacunas,
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

/** Regras prontas para gravar: parâmetros e observações derivados das regras extraídas (se houver). */
export function consolidarRegras(regras: RegrasPolitica): RegrasPolitica {
  // Sem regras extraídas não há o que derivar: política demo (id 1 e 2) e saída do parser
  // heurístico ficam intocadas — derivar aqui zeraria os limites que elas já trazem prontos.
  if (regras.regrasExtraidas.length === 0) return regras;
  return {
    ...regras,
    ...derivarParametros(regras.regrasExtraidas),
    observacoes: observacoesDe(regras.regrasExtraidas),
  };
}
