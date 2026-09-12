import { LACUNA_TIPOS, type LacunaTipo } from "@contracts/types"

/**
 * Tradução da trilha de regras avaliadas para o gestor. `RegraAplicada.regra` e o
 * `detalhe` das lacunas são chaves de máquina (`lacunaDaPolitica`,
 * `aprovacaoAutomaticaAte`, `conflito-vedado-permissivo`) — úteis na auditoria,
 * ilegíveis na tela, onde apareciam cruas para quem só quer saber o que aconteceu.
 * A trilha continua gravada com as chaves; só a exibição é traduzida.
 */

const ROTULO_REGRA: Record<string, string> = {
  categoriaVedada: "Categoria vedada pela política",
  negacaoAcimaDe: "Teto de negação da política",
  lacunaDaPolitica: "Ponto que a política não define",
  categoriaExcecao: "Categoria que exige aprovação superior",
  limitePorCategoria: "Teto da categoria",
  revisaoHumanaAcimaDe: "Faixa de revisão do gestor",
  exigeEvidencia: "Exigência de evidência documental",
  aprovacaoAutomaticaAte: "Aprovação automática",
  extracao: "Leitura do comprovante",
  categoria: "Categoria da despesa",
}

const ROTULO_LACUNA: Record<LacunaTipo, string> = {
  "conflito-vedado-permissivo": "a política veda e libera a mesma categoria",
  "so-vedado-sem-marcacao": "a categoria só tem regra vedada, sem marcação do gestor",
  "marcacao-sem-valor": "regra marcada para o agente aprovar sozinho, sem limite em reais",
  "marcacao-sem-efeito": "marcação do gestor que a política não consegue aplicar",
  "lacunas-demais": "mais pontos indefinidos do que cabe no relatório",
}

/** Nome legível da regra avaliada; chave desconhecida (id de regra) vira o nome genérico. */
export function rotuloRegraAplicada(regra: string): string {
  return ROTULO_REGRA[regra] ?? "Regra da política"
}

/** Detalhe legível: só o slug de lacuna é traduzido — o resto já é frase PT-BR. */
export function detalheLegivel(detalhe: string): string {
  return LACUNA_TIPOS.includes(detalhe as LacunaTipo)
    ? ROTULO_LACUNA[detalhe as LacunaTipo]
    : detalhe
}
