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
  boolean,
  index,
  foreignKey,
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
  t => [uniqueIndex("usuarios_email_unique").on(t.email)]
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
  // Extração automática (v1.7.0, D-014): o que o OCR/visão detectou — ninguém digita
  categoriaSugerida: varchar("categoria_sugerida", { length: 20 }),
  litros: double("litros"),
  // Classificação do documento pela IA de visão (v1.8) — o decisor usa para negar comprovante não fiscal
  tipoDocumento: varchar("tipo_documento", { length: 30 }),
  confiancaTipo: varchar("confianca_tipo", { length: 10 }),
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

export const despesas = mysqlTable(
  "despesas",
  {
    id: serial("id").primaryKey(),
    empresaId: bigint("empresa_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => empresas.id),
    notaFiscalId: bigint("nota_fiscal_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => notasFiscais.id),
    veiculoId: bigint("veiculo_id", {
      mode: "number",
      unsigned: true,
    }).references(() => veiculos.id),
    // Nullable desde v1.7.0 (D-014): sem categoria detectável → revisão manual,
    // ninguém preenche nada
    categoria: categoriaDespesaEnum,
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
  },
  t => [
    // Alvo da FK composta da 0009: garante que a despesa citada numa delegação
    // seja da MESMA empresa do registro. InnoDB exige que as colunas
    // referenciadas sejam o prefixo de um índice.
    index("despesas_empresa_id_id_idx").on(t.empresaId, t.id),
  ]
);

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
  usuarioId: bigint("usuario_id", {
    mode: "number",
    unsigned: true,
  }).references(() => usuarios.id),
  empresaId: bigint("empresa_id", {
    mode: "number",
    unsigned: true,
  }).references(() => empresas.id),
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
  t => [uniqueIndex("convites_token_unique").on(t.token)]
);

// ─────────────────────────────────────────────────────────────────────────────
// 12b. Redefinição de senha (v1.6.1) — token único, 1h de validade, uso único.
// ─────────────────────────────────────────────────────────────────────────────

export const resetsSenha = mysqlTable(
  "resets_senha",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    token: varchar("token", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => [uniqueIndex("resets_senha_token_unique").on(t.token)]
);

// ─────────────────────────────────────────────────────────────────────────────
// Enums da Norma PoC — papel no fluxo de 3 níveis, equipe e motorização
// ─────────────────────────────────────────────────────────────────────────────

export const papelFluxoEnum = mysqlEnum("papel_fluxo", [
  "solicitante",
  "analista",
  "aprovador",
]);

export const equipeColaboradorEnum = mysqlEnum("equipe", [
  "interna",
  "externa",
]);

export const motorizacaoEnum = mysqlEnum("motorizacao", [
  "combustao",
  "hibrido",
  "eletrico",
]);

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
    usuarioId: bigint("usuario_id", {
      mode: "number",
      unsigned: true,
    }).references(() => usuarios.id),
    nome: varchar("nome", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    telefone: varchar("telefone", { length: 20 }),
    matricula: varchar("matricula", { length: 50 }),
    centroCusto: varchar("centro_custo", { length: 100 }),
    statusAtivacao: statusAtivacaoEnum.notNull().default("pendente"),
    papelFluxo: papelFluxoEnum.notNull().default("solicitante"),
    equipe: equipeColaboradorEnum.notNull().default("externa"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  t => [
    uniqueIndex("colaboradores_empresa_telefone_unique").on(
      t.empresaId,
      t.telefone
    ),
    // Alvo das FKs compostas da Norma PoC: garante que analista, aprovador e
    // as duas pontas de uma delegação sejam da MESMA empresa. InnoDB exige
    // que as colunas referenciadas sejam o prefixo de um índice.
    index("colaboradores_empresa_id_id_idx").on(t.empresaId, t.id),
  ]
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
  t => [uniqueIndex("sessoes_conversa_telefone_unique").on(t.telefone)]
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
  t => [
    uniqueIndex("declaracoes_perfil_colab_categoria_unique").on(
      t.colaboradorId,
      t.categoria
    ),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// 16. Config por empresa (Norma PoC) — 1:1 com `empresas`.
// `cnpj` é redundante de propósito: é o CNPJ como veio da planilha da PoC,
// chave de importação. A fonte de verdade do cadastro é `empresas.cnpj`.
// `tarifa_km` é única em R$/km por empresa (decisão do dono, 25/08): sem
// diferenciação por motorização e sem diferenciação por UF na PoC.
// `analista_id` / `aprovador_id` são os designados da empresa no fluxo de
// 3 níveis — apontam para `colaboradores`, não para `usuarios`, porque o
// aprovador pode não ter login.
// ─────────────────────────────────────────────────────────────────────────────

export const empresasConfig = mysqlTable(
  "empresas_config",
  {
    id: serial("id").primaryKey(),
    empresaId: bigint("empresa_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => empresas.id),
    cnpj: varchar("cnpj", { length: 18 }),
    temValeRefeicao: boolean("tem_vale_refeicao").notNull().default(false),
    temContratoCorporativoApp: boolean("tem_contrato_corporativo_app")
      .notNull()
      .default(false),
    // `double` por consistência com veiculos.tarifa_reembolso_km e
    // despesas.valor_fiscal — NÃO é exato: 1.15 * 43 = 49.449999999999996.
    // Quem consumir precisa arredondar a 2 casas ANTES de comparar com teto.
    // Precedência: esta tarifa é a da EMPRESA e vence a legada
    // veiculos.tarifa_reembolso_km (cadastro removido em 3e16d4f/738e02d).
    tarifaKm: double("tarifa_km"),
    analistaId: bigint("analista_id", { mode: "number", unsigned: true }),
    aprovadorId: bigint("aprovador_id", { mode: "number", unsigned: true }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  t => [
    uniqueIndex("empresas_config_empresa_id_unique").on(t.empresaId),
    // Multi-tenant: o analista e o aprovador designados têm de ser
    // colaboradores DESTA empresa. Sem isto o banco aceita apontar para
    // colaborador de outra empresa e a fila de análise vaza entre clientes.
    // Nome explícito: o gerado pelo drizzle passaria de 64 chars.
    // Semântica MATCH SIMPLE: com analista_id NULL a FK não é checada.
    foreignKey({
      name: "empresas_config_analista_mesma_empresa_fk",
      columns: [t.empresaId, t.analistaId],
      foreignColumns: [colaboradores.empresaId, colaboradores.id],
    }),
    foreignKey({
      name: "empresas_config_aprovador_mesma_empresa_fk",
      columns: [t.empresaId, t.aprovadorId],
      foreignColumns: [colaboradores.empresaId, colaboradores.id],
    }),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// 17. Veículo do colaborador (Norma PoC) — dado CADASTRAL.
// Não confundir com `veiculos` (seção 4), que é da EMPRESA, alimenta o
// km/litro do RF-09 e é referenciada por `despesas.veiculo_id`.
// `motorizacao` NÃO governa tarifa: a tarifa é única por empresa.
// ─────────────────────────────────────────────────────────────────────────────

export const veiculosColaborador = mysqlTable(
  "veiculos_colaborador",
  {
    id: serial("id").primaryKey(),
    colaboradorId: bigint("colaborador_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => colaboradores.id),
    placa: varchar("placa", { length: 10 }).notNull(),
    motorizacao: motorizacaoEnum,
    ufLicenciamento: varchar("uf_licenciamento", { length: 2 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  // Não há risco multi-tenant aqui: um colaborador pertence a exatamente uma
  // empresa, então a empresa do veículo é a do dono, sem ambiguidade. O que
  // faltava era impedir a MESMA placa duas vezes para a MESMA pessoa.
  t => [
    uniqueIndex("veiculos_colaborador_colab_placa_unique").on(
      t.colaboradorId,
      t.placa
    ),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// 18. Delegação de decisão (Norma PoC, Seção 6.1) — quem decidiu, quando,
// em nome de quem e por quê. Append-only por convenção, como `log_auditoria`:
// nunca UPDATE, nunca DELETE. `decidiu_usuario_id` guarda a conta logada que
// executou o ato — rastro de auditoria separado da pessoa do organograma.
// ATENÇÃO ao tamanho dos identificadores: o teto do MySQL é 64 caracteres e
// nomes gerados pelo drizzle a partir de tabela+coluna+tabela alvo chegam perto.
// A FK simples que o drizzle geraria para `em_nome_de_colaborador_id` batia
// exatamente 64; a FK composta nomeada à mão que a substituiu resolveu isso.
// Maior identificador hoje: 55 caracteres (medido). Ao renomear tabela ou
// coluna, confira a margem — estourar quebra o boot com ER_TOO_LONG_IDENT, e
// o teste `nenhum identificador de constraint passa de 64 caracteres` pega.
// ─────────────────────────────────────────────────────────────────────────────

export const delegacoesDecisao = mysqlTable(
  "delegacoes_decisao",
  {
    id: serial("id").primaryKey(),
    empresaId: bigint("empresa_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => empresas.id),
    // Nullable de propósito: hoje quem decide despesa é um `usuarios`
    // (`revisao.decidir` é perfilProcedure("revisor","admin")), e não existe
    // caminho no código em que um `colaboradores` decide. Exigir colaborador
    // aqui obrigaria a inventar linha fantasma para conta de suporte. Regra do
    // writer: pelo menos um de (decidiu_colaborador_id, decidiu_usuario_id).
    decidiuColaboradorId: bigint("decidiu_colaborador_id", {
      mode: "number",
      unsigned: true,
    }),
    emNomeDeColaboradorId: bigint("em_nome_de_colaborador_id", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    decidiuUsuarioId: bigint("decidiu_usuario_id", {
      mode: "number",
      unsigned: true,
    }).references(() => usuarios.id),
    despesaId: bigint("despesa_id", {
      mode: "number",
      unsigned: true,
    }).references(() => despesas.id),
    motivo: text("motivo"),
    decididoEm: timestamp("decidido_em").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => [
    // Multi-tenant: as TRÊS pontas da delegação (quem decidiu, em nome de
    // quem, e sobre qual despesa) têm de ser da MESMA empresa do registro.
    // Sem isto o banco aceita registrar que um colaborador da empresa 1
    // decidiu em nome de um da empresa 2, dentro da empresa 3 — provado no
    // QA. Numa trilha de auditoria isso é inaceitável.
    // A ponta `despesa_id` foi amarrada só na 0009: a 0008 a deixou como FK
    // simples e o QA gravou, com dado real, uma delegação da empresa 1
    // apontando despesa da empresa 2.
    foreignKey({
      name: "delegacoes_decisao_decidiu_mesma_empresa_fk",
      columns: [t.empresaId, t.decidiuColaboradorId],
      foreignColumns: [colaboradores.empresaId, colaboradores.id],
    }),
    foreignKey({
      name: "delegacoes_decisao_em_nome_mesma_empresa_fk",
      columns: [t.empresaId, t.emNomeDeColaboradorId],
      foreignColumns: [colaboradores.empresaId, colaboradores.id],
    }),
    // `despesa_id` é nullable de propósito (delegação pode não citar despesa);
    // com NULL o InnoDB não cobra a FK, que é o comportamento desejado.
    foreignKey({
      name: "delegacoes_decisao_despesa_mesma_empresa_fk",
      columns: [t.empresaId, t.despesaId],
      foreignColumns: [despesas.empresaId, despesas.id],
    }),
  ]
);
