import { PERFIS, type Perfil } from "./types";

/**
 * Quem pode gerenciar a equipe da empresa (v1.9.1).
 *
 * Até aqui a área `/app/equipe` exigia `perfil === "admin"` — o perfil da
 * plataforma, que ninguém que se cadastra recebe. Na prática nenhum cliente
 * conseguia convidar ninguém nem cadastrar colaborador na própria empresa.
 *
 * A regra passa a ser a mesma já usada para as regras da política
 * (`assertAdminDaEmpresa`, decisão do dono de 24/08): **quem criou a empresa é
 * o administrador dela**. O perfil global continua intocado — dono de empresa
 * NÃO vira `admin` da plataforma, senão passaria a enxergar as empresas dos
 * outros (`empresas.list` só filtra para `cliente`).
 */
export function podeGerenciarEquipe(sessao: {
  perfil: Perfil;
  ehAdminDeEmpresa: boolean;
}): boolean {
  return sessao.perfil === "admin" || sessao.ehAdminDeEmpresa;
}

/**
 * Perfis que cada um pode conceder ao convidar.
 *
 * `admin` e `revisor` são perfis da PLATAFORMA: enxergam todas as empresas
 * (`revisao.fila` não filtra por empresa). Só o admin da plataforma concede
 * esses. O admin da empresa convida `cliente` — a conta entra na plataforma
 * com as empresas dela, sem alcance sobre as dos outros.
 */
export function perfisConvidaveis(perfil: Perfil): Perfil[] {
  return perfil === "admin" ? [...PERFIS] : ["cliente"];
}
