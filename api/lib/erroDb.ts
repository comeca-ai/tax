/**
 * Erros do driver MySQL chegam embrulhados pelo drizzle (`DrizzleQueryError`),
 * com o erro real em `cause` — o código só aparece se a gente descer a cadeia.
 * Sem isto, uma violação de índice único vira 500 genérico (v1.9.2).
 */
const MAX_PROFUNDIDADE = 5;

/** Percorre a cadeia de `cause` procurando o código/errno do MySQL. */
export function ehChaveDuplicada(erro: unknown): boolean {
  let atual = erro;
  for (let i = 0; i < MAX_PROFUNDIDADE && atual; i++) {
    const e = atual as { code?: unknown; errno?: unknown; cause?: unknown };
    if (e.code === "ER_DUP_ENTRY" || e.errno === 1062) return true;
    atual = e.cause;
  }
  return false;
}
