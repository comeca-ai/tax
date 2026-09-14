import {
  bigint,
  int,
  json,
  mysqlTable,
  timestamp,
  varchar,
  index,
  foreignKey,
} from "drizzle-orm/mysql-core";
import { empresas, usuarios, notasFiscais } from "./schema";
import type { ResultadoConsultaNfeIo } from "../api/modules/fiscal/nfeio/adapter";

/** Criado/alocado somente pelo operador; a rota nunca inicializa ou repõe orçamento. */
export const nfeIoOrcamentos = mysqlTable("nfe_io_orcamentos", {
  id: varchar("id", { length: 64 }).primaryKey(),
  limite: int("limite", { unsigned: true }).notNull().default(0),
  usadas: int("usadas", { unsigned: true }).notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
/** Não guarda chave de consulta, XML, JSON bruto ou credencial. */
export const nfeIoConsultas = mysqlTable(
  "nfe_io_consultas",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    orcamentoId: varchar("orcamento_id", { length: 64 }).notNull(),
    empresaId: bigint("empresa_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => empresas.id),
    notaFiscalId: bigint("nota_fiscal_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => notasFiscais.id),
    usuarioId: bigint("usuario_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => usuarios.id),
    chaveHash: varchar("chave_hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("reservada"),
    resultado: json("resultado").$type<ResultadoConsultaNfeIo>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    concluidaEm: timestamp("concluida_em"),
  },
  t => [
    index("nfe_io_consultas_orcamento_idx").on(t.orcamentoId),
    foreignKey({
      name: "nfe_io_consultas_orcamento_fk",
      columns: [t.orcamentoId],
      foreignColumns: [nfeIoOrcamentos.id],
    }),
  ]
);
