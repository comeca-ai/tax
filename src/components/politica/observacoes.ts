/**
 * Lógica pura (sem React) das observações da política: o parser Mistral gera
 * linhas de cabeçalho `— Tema —` seguidas das regras do tema. Aqui agrupamos,
 * editamos, removemos e inserimos mantendo a ordem original — nunca mutando o
 * array recebido.
 */

/** Travessão U+2014, igual ao gerado em api/policy/mistral.ts. */
export const REGEX_CABECALHO_TEMA = /^—\s*(.+?)\s*—$/;

export function ehCabecalhoTema(linha: string): boolean {
  return REGEX_CABECALHO_TEMA.test(linha.trim());
}

/** "— Alimentação —" → "Alimentação". Linha que não é cabeçalho volta trimada. */
export function tituloDoTema(linha: string): string {
  const m = REGEX_CABECALHO_TEMA.exec(linha.trim());
  return m ? m[1] : linha.trim();
}

export interface ItemObservacao {
  /** Posição no array original. */
  indice: number;
  texto: string;
}

export interface GrupoObservacoes {
  /** null = linhas antes do primeiro cabeçalho. */
  tema: string | null;
  indiceCabecalho: number | null;
  itens: ItemObservacao[];
}

/**
 * Percorre em ordem; cada cabeçalho abre um grupo; linhas sem cabeçalho prévio
 * vão para o grupo tema=null (criado só se houver itens).
 */
export function agruparObservacoes(lista: string[]): GrupoObservacoes[] {
  const grupos: GrupoObservacoes[] = [];
  let atual: GrupoObservacoes | null = null;
  lista.forEach((linha, indice) => {
    if (ehCabecalhoTema(linha)) {
      atual = { tema: tituloDoTema(linha), indiceCabecalho: indice, itens: [] };
      grupos.push(atual);
      return;
    }
    if (atual === null) {
      atual = { tema: null, indiceCabecalho: null, itens: [] };
      grupos.push(atual);
    }
    atual.itens.push({ indice, texto: linha });
  });
  return grupos;
}

function indiceValido(lista: string[], indice: number): boolean {
  return Number.isInteger(indice) && indice >= 0 && indice < lista.length;
}

/** Nova lista com lista[indice] = texto.trim(); vazio ou índice inválido → lista original. */
export function editarObservacao(lista: string[], indice: number, texto: string): string[] {
  const limpo = texto.trim();
  if (!limpo || !indiceValido(lista, indice)) return lista;
  const nova = [...lista];
  nova[indice] = limpo;
  return nova;
}

/** Nova lista sem o índice; índice inválido → lista original. */
export function removerObservacao(lista: string[], indice: number): string[] {
  if (!indiceValido(lista, indice)) return lista;
  return lista.filter((_, i) => i !== indice);
}

/**
 * Insere texto.trim() ao fim do grupo cujo cabeçalho está em `indiceCabecalho`
 * (antes do próximo cabeçalho). null = "Sem tema": entra antes do primeiro
 * cabeçalho (ou no fim, se não houver). Cabeçalho inexistente → push no fim.
 * Vazio → lista original.
 */
export function adicionarObservacao(
  lista: string[],
  texto: string,
  indiceCabecalho: number | null,
): string[] {
  const limpo = texto.trim();
  if (!limpo) return lista;
  if (
    indiceCabecalho !== null &&
    (!indiceValido(lista, indiceCabecalho) || !ehCabecalhoTema(lista[indiceCabecalho]))
  ) {
    return [...lista, limpo];
  }
  // null → procura desde o início (primeiro cabeçalho); senão, desde o próximo ao cabeçalho dado
  let posicao = lista.length;
  for (let i = indiceCabecalho === null ? 0 : indiceCabecalho + 1; i < lista.length; i++) {
    if (ehCabecalhoTema(lista[i])) {
      posicao = i;
      break;
    }
  }
  return [...lista.slice(0, posicao), limpo, ...lista.slice(posicao)];
}

/**
 * Posição em que `adicionarObservacao` inseriu o novo item: primeiro índice em
 * que a lista nova difere da antiga (ou o fim, se a inserção foi no final).
 * Usado pelo componente para reajustar o índice do item em edição.
 */
export function posicaoInserida(antes: string[], depois: string[]): number {
  for (let i = 0; i < antes.length; i++) {
    if (antes[i] !== depois[i]) return i;
  }
  return antes.length;
}
