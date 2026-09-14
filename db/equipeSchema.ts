import {
  mysqlTable,
  bigint,
  varchar,
  json,
  timestamp,
  foreignKey,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { empresas, usuarios } from "./schema";
export const equipeLotes = mysqlTable(
  "equipe_lotes",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    empresaId: bigint("empresa_id", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    usuarioId: bigint("usuario_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => usuarios.id),
    chave: varchar("chave", { length: 64 }).notNull(),
    pessoas: json("pessoas").$type<number[]>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => [
    foreignKey({
      name: "equipe_lotes_empresa_fk",
      columns: [t.empresaId],
      foreignColumns: [empresas.id],
    }),
    uniqueIndex("equipe_lotes_empresa_chave_unique").on(t.empresaId, t.chave),
  ]
);
