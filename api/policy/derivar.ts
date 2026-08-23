import {
  CATEGORIAS_DESPESA,
  TEMAS_POLITICA,
  type CategoriaDespesa,
  type RegraExtraida,
  type RegrasPolitica,
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
  | "exigeVeiculoCadastrado"
  | "exigeEvidencia"
  | "aprovacaoAutomaticaAte"
  | "revisaoHumanaAcimaDe"
  | "negacaoAcimaDe"
>;

const REGEX_VEICULO = /ve[íi]culo\s+(cadastrado|pr[óo]prio|da\s+empresa)|carro\s+pr[óo]prio/i;
// Único sinal textual aceito para aprovação automática: a política precisa escrever isso
// com todas as letras. Os demais tetos vêm do campo estruturado `reembolsavel`, que o
// gestor vê e edita no card — nada é inferido de texto livre (D-013).
const REGEX_APROVACAO_AUTOMATICA = /aprova[çc][ãa]o\s+autom[áa]tica|reembolso\s+autom[áa]tico/i;

function textoDe(r: RegraExtraida): string {
  return `${r.descricao} ${r.condicao ?? ""}`;
}

/** Parâmetros do agente derivados das regras extraídas (ver regras no cabeçalho). */
export function derivarParametros(regras: RegraExtraida[]): ParametrosDerivados {
  // 1. Limite por categoria = maior valor BRL entre as regras reembolsáveis da categoria
  const limitesPorCategoria: Partial<Record<CategoriaDespesa, number | null>> = {};
  for (const cat of CATEGORIAS_DESPESA) {
    const valores = regras
      .filter((r) => r.categoria === cat && r.reembolsavel === "sim" && r.moeda === "BRL")
      .map((r) => r.valorLimite)
      .filter((v): v is number => v !== null);
    if (valores.length) limitesPorCategoria[cat] = Math.max(...valores);
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
      !(r.unidadeLimite ?? "").startsWith("dias_"),
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

  return {
    limitesPorCategoria,
    exigeVeiculoCadastrado,
    exigeEvidencia,
    aprovacaoAutomaticaAte,
    revisaoHumanaAcimaDe,
    negacaoAcimaDe,
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
  if (regras.regrasExtraidas.length === 0) return regras;
  return {
    ...regras,
    ...derivarParametros(regras.regrasExtraidas),
    observacoes: observacoesDe(regras.regrasExtraidas),
  };
}
