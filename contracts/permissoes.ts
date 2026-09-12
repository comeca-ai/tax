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

/**
 * Quem revisa a fila de despesas da empresa (A1, 31/08):
 * aprovador designado OU analista designado (empresas_config) OU admin da
 * empresa (fallback do §4.4 do PRODUTO.md — caminho normal do dia 1, 100%
 * das empresas têm aprovador_id NULL) OU admin da PLATAFORMA (suporte).
 * O perfil `revisor` da plataforma NÃO passa — era ele o furo multi-tenant.
 */
export function podeRevisarDespesas(sessao: {
  perfil: Perfil;
  ehAdminDaEmpresa: boolean;
  ehAprovadorDesignado: boolean;
  ehAnalistaDesignado: boolean;
}): boolean {
  return (
    sessao.perfil === "admin" ||
    sessao.ehAdminDaEmpresa ||
    sessao.ehAprovadorDesignado ||
    sessao.ehAnalistaDesignado
  );
}

/**
 * Delegação (Norma PoC §6.1): decisão de quem NÃO é o aprovador designado
 * registra delegacoes_decisao com motivo. Só existe delegação quando HÁ um
 * aprovador designado — sem designado o admin é o caminho normal, não um
 * substituto, e não há colaborador para o `em_nome_de` (NOT NULL).
 */
export function exigeMotivoDelegacao(papel: {
  temAprovadorDesignado: boolean;
  ehAprovadorDesignado: boolean;
}): boolean {
  return papel.temAprovadorDesignado && !papel.ehAprovadorDesignado;
}
