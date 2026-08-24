import {
  CATEGORIAS_DESPESA,
  CATEGORIA_DESPESA_ROTULO,
  TEMAS_POLITICA,
  UNIDADES_LIMITE_TEMPORAIS,
  type CategoriaDespesa,
  type CategoriaRegraCitada,
  type RegraExtraida,
  type RegrasPolitica,
  type UnidadeLimiteTemporal,
} from "@contracts/types";

/**
 * Derivação dos parâmetros consumidos pelo agente (`avaliarDespesa`) a partir
 * das regras estruturadas extraídas do documento (v1.7).
 *
 * As regras extraídas são a única fonte editável pelo gestor; limites por
 * categoria, exigências e tetos gerais nascem delas aqui, no servidor. Teto
 * geral só existe quando uma regra de governança o define explicitamente
 * (D-013) — sem regra, `null` e a despesa segue para revisão humana.
 *
 * Funções puras, sem I/O — mesmo padrão de `decidirReembolso()`.
 */

export type ParametrosDerivados = Pick<
  RegrasPolitica,
  | "limitesPorCategoria"
  | "tetosTemporaisPorCategoria"
  | "categoriasVedadas"
  | "categoriasExcecao"
  | "exigeVeiculoCadastrado"
  | "exigeEvidencia"
  | "aprovacaoAutomaticaAte"
  | "revisaoHumanaAcimaDe"
  | "negacaoAcimaDe"
  | "exigeDocumentoFiscal"
  | "regraDocumentoFiscalId"
>;

/** Ids de regra que exigem documento fiscal (comprovantes de pagamento não aceitos). */
const IDS_REGRA_DOCUMENTO_FISCAL = new Set(["comprovantes-nao-aceitos"]);

const REGEX_VEICULO = /ve[íi]culo\s+(cadastrado|pr[óo]prio|da\s+empresa)|carro\s+pr[óo]prio/i;
// Único sinal textual aceito para aprovação automática: a política precisa escrever isso
// com todas as letras. Os demais tetos vêm do campo estruturado `reembolsavel`, que o
// gestor vê e edita no card — nada é inferido de texto livre (D-013).
const REGEX_APROVACAO_AUTOMATICA = /aprova[çc][ãa]o\s+autom[áa]tica|reembolso\s+autom[áa]tico/i;

function textoDe(r: RegraExtraida): string {
  return `${r.descricao} ${r.condicao ?? ""}`;
}

/** Unidades que não são dinheiro (percentual, prazos) — nunca viram teto em reais. */
function limiteNaoMonetario(r: RegraExtraida): boolean {
  const u = r.unidadeLimite ?? "";
  return u === "percentual" || u.startsWith("dias_");
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
  // 1. Limite da categoria: SÓ de regra que o gestor marcou com escopo "categoria".
  // Uma regra de escopo "item" descreve um sub-item ("Lavanderia em viagens — R$ 30/dia")
  // e nunca vira teto da categoria: era o bug que negava um hotel de R$ 691,17 citando
  // um limite de lavanderia de R$ 30.
  const limitesPorCategoria: Partial<Record<CategoriaDespesa, number | null>> = {};
  // Teto por período (diária, viagem, evento): um mesmo comprovante pode cobrir vários,
  // então acima dele o pior desfecho é revisão humana, nunca negação automática (D-013).
  const tetosTemporaisPorCategoria: Partial<Record<CategoriaDespesa, UnidadeLimiteTemporal>> = {};
  for (const cat of CATEGORIAS_DESPESA) {
    const promovidas = regras.filter(
      (r) =>
        r.categoria === cat &&
        r.escopo === "categoria" &&
        r.reembolsavel === "sim" &&
        r.moeda === "BRL" &&
        !limiteNaoMonetario(r) &&
        r.valorLimite !== null,
    );
    if (!promovidas.length) continue;
    const teto = Math.max(...promovidas.map((r) => r.valorLimite as number));
    limitesPorCategoria[cat] = teto;
    // Desempate conservador: se entre as regras que atingem o máximo houver alguma com
    // unidade temporal, a categoria é marcada como temporal — pior desfecho vira revisão.
    const temporal = promovidas.find(
      (r) =>
        r.valorLimite === teto &&
        UNIDADES_LIMITE_TEMPORAIS.includes(r.unidadeLimite as UnidadeLimiteTemporal),
    );
    if (temporal) tetosTemporaisPorCategoria[cat] = temporal.unidadeLimite as UnidadeLimiteTemporal;
  }

  // 2. Evidência: regra sem categoria exige em todas; com categoria, só nela
  const exigeEvidencia = CATEGORIAS_DESPESA.filter((cat) =>
    regras.some((r) => r.exigeComprovante && (r.categoria === null || r.categoria === cat)),
  );

  // 3. Veículo cadastrado: só faz sentido para combustível
  const exigeVeiculo = regras.some(
    (r) =>
      (r.categoria === "combustivel" || (r.categoria === null && r.tema === "transporte-e-deslocamento")) &&
      REGEX_VEICULO.test(textoDe(r)),
  );
  const exigeVeiculoCadastrado: CategoriaDespesa[] = exigeVeiculo ? ["combustivel"] : [];

  // 4. Tetos gerais: só de regras de governança, sem categoria, em BRL e com valor monetário.
  // Classificação determinística pelo campo `reembolsavel` (visível no card do gestor):
  //   vedado  → teto de negação (acima do valor, nega)
  //   excecao → revisão humana (acima do valor, precisa de aprovação superior)
  //   sim     → aprovação automática SOMENTE se o texto disser "aprovação automática"/
  //             "reembolso automático"; senão a regra não vira teto (D-013: sem regra
  //             explícita, nada é aprovado automaticamente).
  let aprovacaoAutomaticaAte: number | null = null;
  let revisaoHumanaAcimaDe: number | null = null;
  let negacaoAcimaDe: number | null = null;
  const candidatas = regras.filter(
    (r) =>
      r.tema === "governanca-do-processo" &&
      r.categoria === null &&
      r.moeda === "BRL" &&
      r.valorLimite !== null &&
      !limiteNaoMonetario(r),
  );
  for (const r of candidatas) {
    if (r.valorLimite === null) continue;
    const valor = r.valorLimite;
    if (r.reembolsavel === "vedado") {
      negacaoAcimaDe = negacaoAcimaDe === null ? valor : Math.max(negacaoAcimaDe, valor);
    } else if (r.reembolsavel === "excecao") {
      revisaoHumanaAcimaDe = revisaoHumanaAcimaDe === null ? valor : Math.min(revisaoHumanaAcimaDe, valor);
    } else if (REGEX_APROVACAO_AUTOMATICA.test(textoDe(r))) {
      aprovacaoAutomaticaAte = aprovacaoAutomaticaAte === null ? valor : Math.min(aprovacaoAutomaticaAte, valor);
    }
  }

  // 5. Exigência de documento fiscal: regra de governança VEDADA com id conhecido.
  // Match determinístico por id (decisão do dono: sem regex em texto livre da política).
  const regraDoc = regras.find(
    (r) =>
      r.tema === "governanca-do-processo" &&
      r.reembolsavel === "vedado" &&
      IDS_REGRA_DOCUMENTO_FISCAL.has(r.id),
  );

  // 6. Vedação e exceção POR CATEGORIA.
  //    (1) regra vedada com escopo "categoria" veta sempre (override explícito do gestor);
  //    (2) sem esse override, a categoria só é vedada se NÃO houver nenhuma regra "sim" nela;
  //    (3) coexistindo "vedado" e "sim", a categoria vai para EXCEÇÃO (revisão humana citando
  //        a regra), nunca negação automática.
  //    NÃO "simplificar" para «qualquer regra vedada veta a categoria»: numa política real,
  //    uber tem 1 "sim" (aplicativos de transporte) + 1 "vedado" (gorjetas para motoristas) e
  //    hospedagem tem 5 "sim", 2 "excecao" e 6 "vedado" (itens pessoais, bagagem, dependentes).
  //    Pela regra literal o agente negaria 100% das despesas de Uber e de hospedagem por causa
  //    de sub-itens — o mesmo erro de "sub-item vira categoria" que este arquivo existe para
  //    corrigir, espelhado.
  const categoriasVedadas: CategoriaRegraCitada[] = [];
  const categoriasExcecao: CategoriaRegraCitada[] = [];
  for (const cat of CATEGORIAS_DESPESA) {
    const daCategoria = regras.filter((r) => r.categoria === cat);
    if (daCategoria.length === 0) continue;
    const rotulo = CATEGORIA_DESPESA_ROTULO[cat];
    const vedadas = daCategoria.filter((r) => r.reembolsavel === "vedado");
    const temReembolsavel = daCategoria.some((r) => r.reembolsavel === "sim");

    const vetoDeCategoria = vedadas.find((r) => r.escopo === "categoria");
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
    if (vedadas.length > 0 && !temReembolsavel) {
      categoriasVedadas.push(
        citar(
          cat,
          vedadas[0],
          `Categoria ${rotulo} vedada pela política — regra: "${curto(vedadas[0].descricao)}"; a política não tem nenhuma regra reembolsável nesta categoria.`,
        ),
      );
      continue;
    }
    const excecao = daCategoria.find((r) => r.reembolsavel === "excecao");
    if (excecao) {
      categoriasExcecao.push(
        citar(
          cat,
          excecao,
          `Categoria ${rotulo} exige aprovação superior na política — regra: "${curto(excecao.descricao)}".`,
        ),
      );
      continue;
    }
    if (vedadas.length > 0) {
      categoriasExcecao.push(
        citar(
          cat,
          vedadas[0],
          `Categoria ${rotulo} tem regra vedada que pode se aplicar — regra: "${curto(vedadas[0].descricao)}". Como a política também reembolsa ${rotulo}, a despesa vai para revisão humana.`,
        ),
      );
    }
  }

  return {
    limitesPorCategoria,
    tetosTemporaisPorCategoria,
    categoriasVedadas,
    categoriasExcecao,
    exigeVeiculoCadastrado,
    exigeEvidencia,
    aprovacaoAutomaticaAte,
    revisaoHumanaAcimaDe,
    negacaoAcimaDe,
    exigeDocumentoFiscal: regraDoc !== undefined,
    regraDocumentoFiscalId: regraDoc?.id ?? null,
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
