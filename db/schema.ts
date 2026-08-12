import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  mediumtext,
  text,
  timestamp,
  date,
  double,
  bigint,
  int,
  json,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ─────────────────────────────────────────────────────────────────────────────
// Enums compartilhados (espelham contracts/types.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const perfilEnum = mysqlEnum("perfil", ["admin", "cliente", "revisor"]);

export const regimeTributarioEnum = mysqlEnum("regime_tributario", [
  "lucro_real",
  "lucro_presumido",
  "simples_nacional",
]);

export const categoriaDespesaEnum = mysqlEnum("categoria", [
  "combustivel",
  "alimentacao",
  "hospedagem",
  "pedagio",
  "uber",
  "taxi",
]);

export const confiancaEnum = mysqlEnum("confianca", [
  "alta",
  "media",
  "baixa",
  "vedado",
]);

export const statusDespesaEnum = mysqlEnum("status", [
  "pendente",
  "em_revisao",
  "aprovada",
  "rejeitada",
]);

export const tributoEnum = mysqlEnum("tributo", [
  "pis_cofins",
  "icms",
  "cbs",
  "ibs",
  "irpj_csll",
]);

export const tipoBeneficioEnum = mysqlEnum("tipo_beneficio", [
  "credito",
  "dedutibilidade",
]);

export const statusCreditoEnum = mysqlEnum("status", [
  "apurado",
  "em_revisao",
  "confirmado",
  "rejeitado",
]);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Usuários (auth própria email/senha)
// ─────────────────────────────────────────────────────────────────────────────

export const usuarios = mysqlTable(
  "usuarios",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    nome: varchar("nome", { length: 255 }).notNull(),
    senhaHash: varchar("senha_hash", { length: 255 }).notNull(),
    perfil: perfilEnum.notNull().default("cliente"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("usuarios_email_unique").on(t.email)],
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Empresas (tenant / "Cliente" da spec) — RF-00
// ─────────────────────────────────────────────────────────────────────────────

export const empresas = mysqlTable("empresas", {
  id: serial("id").primaryKey(),
  usuarioId: bigint("usuario_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => usuarios.id),
  razaoSocial: varchar("razao_social", { length: 255 }).notNull(),
  cnpj: varchar("cnpj", { length: 18 }).notNull(),
  cnaePrincipal: varchar("cnae_principal", { length: 10 }).notNull(),
  regimeTributario: regimeTributarioEnum.notNull(),
  uf: varchar("uf", { length: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CNAEs secundários da empresa — RF-00
// ─────────────────────────────────────────────────────────────────────────────

export const cnaesSecundarios = mysqlTable("cnaes_secundarios", {
  id: serial("id").primaryKey(),
  empresaId: bigint("empresa_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => empresas.id),
  cnae: varchar("cnae", { length: 10 }).notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Veículos — RF-01 / RF-09
// ─────────────────────────────────────────────────────────────────────────────

export const veiculos = mysqlTable("veiculos", {
  id: serial("id").primaryKey(),
  empresaId: bigint("empresa_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => empresas.id),
  placa: varchar("placa", { length: 10 }).notNull(),
  renavam: varchar("renavam", { length: 20 }),
  kmPorLitroDeclarado: double("km_por_litro_declarado").notNull(),
  tarifaReembolsoKm: double("tarifa_reembolso_km").notNull().default(0),
  descricao: varchar("descricao", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Notas fiscais (ingestão / OCR) — RF-01
// ─────────────────────────────────────────────────────────────────────────────

export const notasFiscais = mysqlTable("notas_fiscais", {
  id: serial("id").primaryKey(),
  empresaId: bigint("empresa_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => empresas.id),
  cnpjEmitente: varchar("cnpj_emitente", { length: 18 }),
  cfop: varchar("cfop", { length: 10 }),
  ncm: varchar("ncm", { length: 10 }),
  cst: varchar("cst", { length: 10 }),
  valor: double("valor"),
  dataFatoGerador: date("data_fato_gerador", { mode: "string" }),
  // Upload na plataforma: arquivo original guardado inline (MVP, sem storage externo)
  arquivoNome: varchar("arquivo_nome", { length: 255 }),
  arquivoMime: varchar("arquivo_mime", { length: 100 }),
  arquivoBase64: mediumtext("arquivo_base64"),
  origem: mysqlEnum("origem", ["ocr", "manual"]).notNull().default("manual"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Despesas — RF-01/RF-02/RF-05
// ─────────────────────────────────────────────────────────────────────────────

export const despesas = mysqlTable("despesas", {
  id: serial("id").primaryKey(),
  empresaId: bigint("empresa_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => empresas.id),
  notaFiscalId: bigint("nota_fiscal_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => notasFiscais.id),
  veiculoId: bigint("veiculo_id", { mode: "number", unsigned: true }).references(
    () => veiculos.id,
  ),
  categoria: categoriaDespesaEnum.notNull(),
  colaborador: varchar("colaborador", { length: 255 }),
  centroCusto: varchar("centro_custo", { length: 255 }),
  motivoDeslocamento: text("motivo_deslocamento"),
  kmComercial: double("km_comercial").notNull().default(0),
  kmNaoComercial: double("km_nao_comercial").notNull().default(0),
  litros: double("litros"),
  // valor_fiscal (base tributária segregada) ≠ valor_reembolsavel (tarifa/km) — §7.4
  valorFiscal: double("valor_fiscal").notNull().default(0),
  valorReembolsavel: double("valor_reembolsavel").notNull().default(0),
  confianca: confiancaEnum.notNull().default("baixa"),
  status: statusDespesaEnum.notNull().default("pendente"),
  memorial: text("memorial"),
  motivoRevisao: text("motivo_revisao"),
  // Agente de Política de Reembolso (v1.1.0) — decisão posterior e independente do motor tributário
  politicaDecisao: mysqlEnum("politica_decisao", [
    "aprovado",
    "negado",
    "revisao_humana",
  ]),
  politicaMotivo: text("politica_motivo"),
  politicaVersaoAplicada: int("politica_versao_aplicada"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Regras de elegibilidade (matriz CNAE × categoria × tributo) — RF-02/RF-07
// ─────────────────────────────────────────────────────────────────────────────

export const regrasElegibilidade = mysqlTable("regras_elegibilidade", {
  id: serial("id").primaryKey(),
  // Padrão de CNAE: ex. "49.30-2", "49.2x", "41.x", "46.x", "*" (não mapeado)
  cnaePadrao: varchar("cnae_padrao", { length: 12 }).notNull(),
  categoria: categoriaDespesaEnum.notNull(),
  tributo: tributoEnum.notNull(),
  tipoBeneficio: tipoBeneficioEnum.notNull(),
  confianca: confiancaEnum.notNull(),
  // Parâmetros de cálculo (alíquota/fator); null = usa fórmula padrão
  aliquota: double("aliquota"),
  baseLegal: text("base_legal"),
  vigenciaInicio: date("vigencia_inicio", { mode: "string" }).notNull(),
  vigenciaFim: date("vigencia_fim", { mode: "string" }),
  versao: varchar("versao", { length: 20 }).notNull().default("1.1"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Créditos apurados — RF-03 (crédito e dedutibilidade são saídas paralelas)
// ─────────────────────────────────────────────────────────────────────────────

export const creditosApurados = mysqlTable("creditos_apurados", {
  id: serial("id").primaryKey(),
  despesaId: bigint("despesa_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => despesas.id),
  tributo: tributoEnum.notNull(),
  tipoBeneficio: tipoBeneficioEnum.notNull(),
  valor: double("valor").notNull(),
  status: statusCreditoEnum.notNull().default("apurado"),
  memorial: text("memorial"),
  regraVersao: varchar("regra_versao", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Evidências documentais — RF-04 ("Média confiança" exige suporte)
// ─────────────────────────────────────────────────────────────────────────────

export const evidenciasDocumentais = mysqlTable("evidencias_documentais", {
  id: serial("id").primaryKey(),
  despesaId: bigint("despesa_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => despesas.id),
  tipo: varchar("tipo", { length: 100 }).notNull(),
  arquivoNome: varchar("arquivo_nome", { length: 255 }).notNull(),
  arquivoMime: varchar("arquivo_mime", { length: 100 }),
  arquivoBase64: mediumtext("arquivo_base64"),
  observacao: text("observacao"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Log de auditoria imutável — RF-04 (nunca UPDATE/DELETE no app)
// ─────────────────────────────────────────────────────────────────────────────

export const logAuditoria = mysqlTable("log_auditoria", {
  id: serial("id").primaryKey(),
  usuarioId: bigint("usuario_id", { mode: "number", unsigned: true }).references(
    () => usuarios.id,
  ),
  empresaId: bigint("empresa_id", { mode: "number", unsigned: true }).references(
    () => empresas.id,
  ),
  acao: varchar("acao", { length: 100 }).notNull(),
  entidade: varchar("entidade", { length: 100 }).notNull(),
  entidadeId: bigint("entidade_id", { mode: "number", unsigned: true }),
  detalhes: text("detalhes"),
  regraVersao: varchar("regra_versao", { length: 20 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Políticas de reembolso (Agente de Política) — v1.1.0
// Uma política "ativa" por empresa; regras JSON conforme contracts/types.ts
// ─────────────────────────────────────────────────────────────────────────────

export const politicasReembolso = mysqlTable("politicas_reembolso", {
  id: serial("id").primaryKey(),
  empresaId: bigint("empresa_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => empresas.id),
  arquivoNome: varchar("arquivo_nome", { length: 255 }).notNull(),
  arquivoPath: varchar("arquivo_path", { length: 500 }),
  textoExtraido: text("texto_extraido"),
  // RegrasPolitica: limites por categoria, exigências, tetos de decisão
  regras: json("regras").notNull(),
  status: mysqlEnum("status", ["rascunho", "ativa", "inativa"])
    .notNull()
    .default("rascunho"),
  versao: int("versao").notNull().default(1),
  confiancaExtracao: mysqlEnum("confianca_extracao", [
    "alta",
    "media",
    "baixa",
  ]),
  camposPendentes: json("campos_pendentes"),
  createdById: bigint("created_by_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => usuarios.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});


// ─────────────────────────────────────────────────────────────────────────────
// 12. Convites de usuários (v1.2.0)
// Admin convida por e-mail; aceite via link com token único (7 dias).
// ─────────────────────────────────────────────────────────────────────────────

export const convites = mysqlTable(
  "convites",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    perfil: perfilEnum.notNull().default("cliente"),
    token: varchar("token", { length: 128 }).notNull(),
    status: mysqlEnum("status", ["pendente", "aceito", "revogado"])
      .notNull()
      .default("pendente"),
    createdById: bigint("created_by_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => usuarios.id),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("convites_token_unique").on(t.token)],
);

// ─────────────────────────────────────────────────────────────────────────────
// 13. Colaboradores (v1.5.0) — pessoas da empresa que pedem reembolso.
// O admin cadastra (hoje manual; upload em lote na v1.9.0). O vínculo com
// `usuarios` é opcional: o colaborador pode existir só no WhatsApp, sem login.
// `superiorId` define o degrau de escalada da zona cinzenta (v1.6.0).
// ─────────────────────────────────────────────────────────────────────────────

export const statusAtivacaoEnum = mysqlEnum("status_ativacao", [
  "pendente", // cadastrado pelo admin, ainda não falou com o agente
  "confirmado", // passou pelo onboarding conversacional
  "divergencia", // contestou os dados no onboarding — admin precisa revisar
]);

export const colaboradores = mysqlTable(
  "colaboradores",
  {
    id: serial("id").primaryKey(),
    empresaId: bigint("empresa_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => empresas.id),
    usuarioId: bigint("usuario_id", { mode: "number", unsigned: true }).references(
      () => usuarios.id,
    ),
    nome: varchar("nome", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    telefone: varchar("telefone", { length: 20 }),
    matricula: varchar("matricula", { length: 50 }),
    centroCusto: varchar("centro_custo", { length: 100 }),
    statusAtivacao: statusAtivacaoEnum.notNull().default("pendente"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("colaboradores_empresa_telefone_unique").on(t.empresaId, t.telefone)],
);

// ─────────────────────────────────────────────────────────────────────────────
// 14. Sessões de conversa do agente WhatsApp (v1.5.0)
// Uma sessão por telefone; `estado` é o passo da máquina de onboarding
// (ver api/agente/maquina.ts) e `contexto` carrega os dados coletados.
// ─────────────────────────────────────────────────────────────────────────────

export const sessoesConversa = mysqlTable(
  "sessoes_conversa",
  {
    id: serial("id").primaryKey(),
    telefone: varchar("telefone", { length: 20 }).notNull(),
    colaboradorId: bigint("colaborador_id", {
      mode: "number",
      unsigned: true,
    }).references(() => colaboradores.id),
    estado: varchar("estado", { length: 40 }).notNull().default("inicio"),
    contexto: json("contexto"),
    ultimaInteracaoAt: timestamp("ultima_interacao_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("sessoes_conversa_telefone_unique").on(t.telefone)],
);

// ─────────────────────────────────────────────────────────────────────────────
// 15. Declarações de perfil de despesa (v1.5.0)
// O que o colaborador disse que costuma pedir — define o checklist contextual
// dele (ex.: declarou combustivel → precisa de veículo).
// ─────────────────────────────────────────────────────────────────────────────

export const declaracoesPerfil = mysqlTable(
  "declaracoes_perfil",
  {
    id: serial("id").primaryKey(),
    colaboradorId: bigint("colaborador_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => colaboradores.id),
    categoria: categoriaDespesaEnum.notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("declaracoes_perfil_colab_categoria_unique").on(
      t.colaboradorId,
      t.categoria,
    ),
  ],
);
