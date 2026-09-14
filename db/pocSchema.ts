import { bigint, foreignKey, index, json, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { colaboradores, despesas, empresas, usuarios } from "./schema";
import type { EstadoCampo } from "../api/modules/reembolso/campo/dominio";
import type { ConfiguracaoCampo } from "../api/modules/reembolso/campo/politica";

export const pocConfiguracao = mysqlTable("poc_configuracao", {
  empresaId: bigint("empresa_id", { mode: "number", unsigned: true }).primaryKey().references(() => empresas.id),
  configuracao: json("configuracao").$type<ConfiguracaoCampo>().notNull(),
  historico: json("historico").$type<{ usuarioId: number; em: string; configuracao: ConfiguracaoCampo }[]>().notNull(),
});

/** Agregado bloqueado por colaborador: captura e conciliação são serializadas. */
export const pocCampo = mysqlTable("poc_campo", {
  colaboradorId: bigint("colaborador_id", { mode: "number", unsigned: true }).primaryKey(),
  empresaId: bigint("empresa_id", { mode: "number", unsigned: true }).notNull().references(() => empresas.id),
  estado: json("estado").$type<EstadoCampo>().notNull(),
  atualizadoEm: timestamp("atualizado_em").notNull().defaultNow().onUpdateNow(),
}, t => [index("poc_campo_empresa_idx").on(t.empresaId), foreignKey({ name: "poc_campo_colaborador_tenant_fk", columns: [t.empresaId, t.colaboradorId], foreignColumns: [colaboradores.empresaId, colaboradores.id] })]);

/** Unicidade por empresa, inclusive quando outro colaborador reenvia a nota. */
export const pocDocumentos = mysqlTable("poc_documentos", {
  id: varchar("id", { length: 36 }).primaryKey(),
  empresaId: bigint("empresa_id", { mode: "number", unsigned: true }).notNull(),
  colaboradorId: bigint("colaborador_id", { mode: "number", unsigned: true }).notNull(),
  chave: varchar("chave", { length: 44 }),
  hash: varchar("hash", { length: 64 }).notNull(),
}, t => [uniqueIndex("poc_documentos_chave_uq").on(t.empresaId, t.chave), uniqueIndex("poc_documentos_hash_uq").on(t.empresaId, t.hash), foreignKey({ name: "poc_documentos_colaborador_tenant_fk", columns: [t.empresaId, t.colaboradorId], foreignColumns: [colaboradores.empresaId, colaboradores.id] })]);

export const pocPagamentos = mysqlTable("poc_pagamentos", {
  despesaId: bigint("despesa_id", { mode: "number", unsigned: true }).primaryKey(),
  empresaId: bigint("empresa_id", { mode: "number", unsigned: true }).notNull(),
  usuarioId: bigint("usuario_id", { mode: "number", unsigned: true }).notNull().references(() => usuarios.id),
  referencia: varchar("referencia", { length: 128 }).notNull(),
  pagoEm: timestamp("pago_em").notNull(),
  registradoEm: timestamp("registrado_em").notNull().defaultNow(),
}, t => [foreignKey({ name: "poc_pagamentos_despesa_tenant_fk", columns: [t.empresaId, t.despesaId], foreignColumns: [despesas.empresaId, despesas.id] })]);
