import {
  bigint,
  boolean,
  foreignKey,
  int,
  json,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { colaboradores, empresas, notasFiscais, usuarios } from "./schema";
import { nfeIoOrcamentos } from "./nfeioSchema";
import type { ResultadoVerificacaoFiscal } from "../contracts/fiscal";

/** Ausência de configuração significa false. Toda alteração gera auditoria na mesma transação. */
export const fiscalConfiguracao = mysqlTable("fiscal_configuracao", {
  empresaId: bigint("empresa_id", { mode: "number", unsigned: true })
    .primaryKey()
    .references(() => empresas.id),
  habilitada: boolean("habilitada").notNull().default(false),
  versao: int("versao", { unsigned: true }).notNull().default(0),
  alteradaPor: bigint("alterada_por", { mode: "number", unsigned: true })
    .notNull()
    .references(() => usuarios.id),
  alteradaEm: timestamp("alterada_em").notNull().defaultNow().onUpdateNow(),
});

/** Chave extraída do arquivo; nunca aceita chave informada na chamada de consulta. */
export const fiscalDocumentos = mysqlTable(
  "fiscal_documentos",
  {
    notaFiscalId: bigint("nota_fiscal_id", {
      mode: "number",
      unsigned: true,
    }).primaryKey(),
    empresaId: bigint("empresa_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => empresas.id),
    usuarioId: bigint("usuario_id", {
      mode: "number",
      unsigned: true,
    }).references(() => usuarios.id),
    colaboradorId: bigint("colaborador_id", { mode: "number", unsigned: true }),
    chave: varchar("chave", { length: 44 }),
    chaveEstado: varchar("chave_estado", { length: 16 }).notNull(),
    hash: varchar("hash", { length: 64 }).notNull(),
    criadaEm: timestamp("criada_em").notNull().defaultNow(),
  },
  t => [
    foreignKey({
      name: "fiscal_documentos_nota_tenant_fk",
      columns: [t.empresaId, t.notaFiscalId],
      foreignColumns: [notasFiscais.empresaId, notasFiscais.id],
    }),
    foreignKey({
      name: "fiscal_documentos_colaborador_tenant_fk",
      columns: [t.empresaId, t.colaboradorId],
      foreignColumns: [colaboradores.empresaId, colaboradores.id],
    }),
  ]
);

/** Uma execução por nota: crash/timeout conserva a reserva, sem repetir cobrança. */
export const fiscalVerificacoes = mysqlTable(
  "fiscal_verificacoes",
  {
    notaFiscalId: bigint("nota_fiscal_id", {
      mode: "number",
      unsigned: true,
    }).primaryKey(),
    empresaId: bigint("empresa_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => empresas.id),
    usuarioId: bigint("usuario_id", {
      mode: "number",
      unsigned: true,
    }).references(() => usuarios.id),
    colaboradorId: bigint("colaborador_id", { mode: "number", unsigned: true }),
    orcamentoId: varchar("orcamento_id", { length: 64 }).references(
      () => nfeIoOrcamentos.id
    ),
    id: varchar("id", { length: 36 }).notNull(),
    resultado: json("resultado").$type<ResultadoVerificacaoFiscal>().notNull(),
    criadaEm: timestamp("criada_em").notNull().defaultNow(),
    concluidaEm: timestamp("concluida_em"),
  },
  t => [
    foreignKey({
      name: "fiscal_verificacoes_nota_tenant_fk",
      columns: [t.empresaId, t.notaFiscalId],
      foreignColumns: [notasFiscais.empresaId, notasFiscais.id],
    }),
    foreignKey({
      name: "fiscal_verificacoes_colaborador_tenant_fk",
      columns: [t.empresaId, t.colaboradorId],
      foreignColumns: [colaboradores.empresaId, colaboradores.id],
    }),
  ]
);
