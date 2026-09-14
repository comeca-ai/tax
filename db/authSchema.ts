import {
  bigint,
  index,
  int,
  mysqlTable,
  varchar,
} from "drizzle-orm/mysql-core";

/** Autenticação é anterior ao tenant; a chave é HMAC, nunca e-mail/IP em claro. */
export const authRateLimits = mysqlTable(
  "auth_rate_limits",
  {
    chave: varchar("chave", { length: 64 }).primaryKey(),
    janelaInicio: bigint("janela_inicio", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    tentativas: int("tentativas", { unsigned: true }).notNull(),
  },
  t => [index("auth_rate_limits_janela_idx").on(t.janelaInicio)]
);

/** Apenas impressão do token revogado; cookie e marcador de senha nunca são persistidos aqui. */
export const authSessoesRevogadas = mysqlTable(
  "auth_sessoes_revogadas",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    expiraEm: bigint("expira_em", { mode: "number", unsigned: true }).notNull(),
  },
  t => [index("auth_sessoes_revogadas_expira_idx").on(t.expiraEm)]
);
