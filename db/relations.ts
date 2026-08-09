import { relations } from "drizzle-orm";
import {
  usuarios,
  empresas,
  cnaesSecundarios,
  veiculos,
  notasFiscais,
  despesas,
  regrasElegibilidade,
  creditosApurados,
  evidenciasDocumentais,
  logAuditoria,
  politicasReembolso,
  convites,
} from "./schema";

export const usuariosRelations = relations(usuarios, ({ many }) => ({
  empresas: many(empresas),
  logs: many(logAuditoria),
  politicasCriadas: many(politicasReembolso),
  convitesCriados: many(convites),
}));

export const empresasRelations = relations(empresas, ({ one, many }) => ({
  usuario: one(usuarios, {
    fields: [empresas.usuarioId],
    references: [usuarios.id],
  }),
  cnaesSecundarios: many(cnaesSecundarios),
  veiculos: many(veiculos),
  notasFiscais: many(notasFiscais),
  despesas: many(despesas),
  politicasReembolso: many(politicasReembolso),
}));

export const cnaesSecundariosRelations = relations(
  cnaesSecundarios,
  ({ one }) => ({
    empresa: one(empresas, {
      fields: [cnaesSecundarios.empresaId],
      references: [empresas.id],
    }),
  }),
);

export const veiculosRelations = relations(veiculos, ({ one, many }) => ({
  empresa: one(empresas, {
    fields: [veiculos.empresaId],
    references: [empresas.id],
  }),
  despesas: many(despesas),
}));

export const notasFiscaisRelations = relations(notasFiscais, ({ one }) => ({
  empresa: one(empresas, {
    fields: [notasFiscais.empresaId],
    references: [empresas.id],
  }),
  despesa: one(despesas, {
    fields: [notasFiscais.id],
    references: [despesas.notaFiscalId],
  }),
}));

export const despesasRelations = relations(despesas, ({ one, many }) => ({
  empresa: one(empresas, {
    fields: [despesas.empresaId],
    references: [empresas.id],
  }),
  notaFiscal: one(notasFiscais, {
    fields: [despesas.notaFiscalId],
    references: [notasFiscais.id],
  }),
  veiculo: one(veiculos, {
    fields: [despesas.veiculoId],
    references: [veiculos.id],
  }),
  creditos: many(creditosApurados),
  evidencias: many(evidenciasDocumentais),
}));

export const regrasElegibilidadeRelations = relations(
  regrasElegibilidade,
  () => ({}),
);

export const creditosApuradosRelations = relations(
  creditosApurados,
  ({ one }) => ({
    despesa: one(despesas, {
      fields: [creditosApurados.despesaId],
      references: [despesas.id],
    }),
  }),
);

export const evidenciasDocumentaisRelations = relations(
  evidenciasDocumentais,
  ({ one }) => ({
    despesa: one(despesas, {
      fields: [evidenciasDocumentais.despesaId],
      references: [despesas.id],
    }),
  }),
);

export const logAuditoriaRelations = relations(logAuditoria, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [logAuditoria.usuarioId],
    references: [usuarios.id],
  }),
  empresa: one(empresas, {
    fields: [logAuditoria.empresaId],
    references: [empresas.id],
  }),
}));

export const politicasReembolsoRelations = relations(
  politicasReembolso,
  ({ one }) => ({
    empresa: one(empresas, {
      fields: [politicasReembolso.empresaId],
      references: [empresas.id],
    }),
    criadoPor: one(usuarios, {
      fields: [politicasReembolso.createdById],
      references: [usuarios.id],
    }),
  }),
);


export const convitesRelations = relations(convites, ({ one }) => ({
  criadoPor: one(usuarios, {
    fields: [convites.createdById],
    references: [usuarios.id],
  }),
}));
