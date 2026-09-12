/**
 * Versionamento da política (RF-07). Função pura, sem I/O — o router só traduz o
 * resultado em erro (mesmo padrão de `texto.ts`).
 */

/**
 * A política em VIGOR é imutável: editar as regras dela no lugar fazia as marcações
 * valerem já no "Salvar regras" — antes do simulador e antes de "Ativar política" — e
 * duas configurações diferentes conviviam sob a mesma versão, sem que
 * `politicaVersaoAplicada` identificasse qual regra decidiu o quê. Editar a ativa é
 * criar uma nova versão: `politica.duplicar` → rascunho → `politica.ativar`.
 */
export function politicaEditavel(status: string): boolean {
  return status !== "ativa";
}

/** Mensagem única da recusa (router e tela dizem a mesma coisa). */
export const POLITICA_ATIVA_IMUTAVEL =
  "A política ativa não pode ser editada. Crie uma nova versão a partir dela — a versão em vigor continua valendo até você ativar a nova.";
