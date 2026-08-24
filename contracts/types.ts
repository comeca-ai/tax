export * from "./errors";

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos e schemas compartilhados frontend/backend — Tax Engine (reembolsa.ia.br)
// ─────────────────────────────────────────────────────────────────────────────

export const PERFIS = ["admin", "cliente", "revisor"] as const;
export type Perfil = (typeof PERFIS)[number];

export const REGIMES_TRIBUTARIOS = [
  "lucro_real",
  "lucro_presumido",
  "simples_nacional",
] as const;
export type RegimeTributario = (typeof REGIMES_TRIBUTARIOS)[number];

export const CATEGORIAS_DESPESA = [
  "combustivel",
  "alimentacao",
  "hospedagem",
  "pedagio",
  "uber",
  "taxi",
] as const;
export type CategoriaDespesa = (typeof CATEGORIAS_DESPESA)[number];

export const NIVEIS_CONFIANCA = ["alta", "media", "baixa", "vedado"] as const;
export type NivelConfianca = (typeof NIVEIS_CONFIANCA)[number];

export const STATUS_DESPESA = [
  "pendente",
  "em_revisao",
  "aprovada",
  "rejeitada",
] as const;
export type StatusDespesa = (typeof STATUS_DESPESA)[number];

export const TRIBUTOS = ["pis_cofins", "icms", "cbs", "ibs", "irpj_csll"] as const;
export type Tributo = (typeof TRIBUTOS)[number];

export const TIPOS_BENEFICIO = ["credito", "dedutibilidade"] as const;
export type TipoBeneficio = (typeof TIPOS_BENEFICIO)[number];

export const STATUS_CREDITO = [
  "apurado",
  "em_revisao",
  "confirmado",
  "rejeitado",
] as const;
export type StatusCredito = (typeof STATUS_CREDITO)[number];

export const UFS_BRASIL = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
] as const;
export type Uf = (typeof UFS_BRASIL)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Schemas zod (inputs tRPC)
// ─────────────────────────────────────────────────────────────────────────────

export const registroInput = z.object({
  nome: z.string().min(2).max(255),
  email: z.string().email().max(255),
  senha: z.string().min(8).max(128),
});

export const loginInput = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

export const empresaInput = z.object({
  razaoSocial: z.string().min(2).max(255),
  cnpj: z.string().min(11).max(18),
  cnaePrincipal: z.string().min(2).max(10),
  cnaesSecundarios: z.array(z.string().max(10)).max(20).default([]),
  regimeTributario: z.enum(REGIMES_TRIBUTARIOS),
  uf: z.enum(UFS_BRASIL),
  /** Aceites do wizard de cadastro (v1.6.2) — registrados na auditoria. */
  aceiteLgpd: z.boolean().optional(),
  declaracaoPoderes: z.boolean().optional(),
});

export const veiculoInput = z.object({
  placa: z.string().min(7).max(10),
  renavam: z.string().max(20).optional(),
  kmPorLitroDeclarado: z.number().positive(),
  tarifaReembolsoKm: z.number().min(0).default(0),
  descricao: z.string().max(255).optional(),
});

// Limite de 10 MB por arquivo → base64 ≈ 13,4 MB de caracteres (margem p/ overhead)
export const ARQUIVO_BASE64_MAX = 14_000_000;
const ARQUIVO_BASE64_MSG =
  "Arquivo acima do limite de 10 MB. Comprima a imagem ou envie em outro formato (JPG, PNG, PDF ou XML).";

export const uploadNotaInput = z.object({
  empresaId: z.number().int().positive(),
  arquivoNome: z.string().min(1).max(255),
  arquivoMime: z.string().max(100),
  arquivoBase64: z.string().min(1).max(ARQUIVO_BASE64_MAX, ARQUIVO_BASE64_MSG),
});

export const despesaInput = z.object({
  empresaId: z.number().int().positive(),
  notaFiscalId: z.number().int().positive(),
  veiculoId: z.number().int().positive().optional(),
  categoria: z.enum(CATEGORIAS_DESPESA),
  colaborador: z.string().max(255).optional(),
  centroCusto: z.string().max(255).optional(),
  motivoDeslocamento: z.string().optional(),
  kmComercial: z.number().min(0).default(0),
  kmNaoComercial: z.number().min(0).default(0),
  litros: z.number().min(0).optional(),
  // Campos fiscais da nota (confirmados pelo usuário após OCR ou digitados)
  valorNota: z.number().min(0),
  dataFatoGerador: z.string(), // ISO date yyyy-mm-dd
  cnpjEmitente: z.string().max(18).optional(),
  cfop: z.string().max(10).optional(),
  ncm: z.string().max(10).optional(),
  cst: z.string().max(10).optional(),
});

export const revisaoInput = z.object({
  despesaId: z.number().int().positive(),
  decisao: z.enum(["aprovar", "rejeitar"]),
  justificativa: z.string().min(3).max(2000),
});

export const evidenciaInput = z.object({
  despesaId: z.number().int().positive(),
  tipo: z.string().min(2).max(100),
  arquivoNome: z.string().min(1).max(255),
  arquivoMime: z.string().max(100).optional(),
  arquivoBase64: z.string().max(ARQUIVO_BASE64_MAX, ARQUIVO_BASE64_MSG).optional(),
  observacao: z.string().max(2000).optional(),
});

export const relatorioFiltroInput = z.object({
  empresaId: z.number().int().positive(),
  dataInicio: z.string().optional(), // ISO date
  dataFim: z.string().optional(),
  tributo: z.enum(TRIBUTOS).optional(),
  confianca: z.enum(NIVEIS_CONFIANCA).optional(),
});

// ── Consulta de CNPJ na Receita (ReceitaWS) — v1.3.0 ───────────────────────

export const cnpjConsultaInput = z.object({
  cnpj: z.string().min(14).max(18),
});

// ─────────────────────────────────────────────────────────────────────────────
// DTOs de saída
// ─────────────────────────────────────────────────────────────────────────────

/** Resultado da extração OCR de uma nota fiscal (RF-01). */
export type OcrExtracao = {
  cnpjEmitente: string | null;
  cfop: string | null;
  ncm: string | null;
  cst: string | null;
  valor: number | null;
  dataFatoGerador: string | null; // ISO date
  litros: number | null;
  categoriaSugerida: CategoriaDespesa | null;
  confiancaExtracao: "alta" | "media" | "baixa";
  /** Campos que precisam de confirmação/preenchimento manual assistido */
  camposPendentes: string[];
  provedor: string;
  avisos: string[];
  /** Tipo de documento detectado pela IA de visão (v1.8); ausente/null no heurístico e em dados antigos */
  tipoDocumento?: TipoDocumento | null;
  /** Confiança da IA na classificação do tipo (não confundir com confiancaExtracao dos campos) */
  confiancaTipo?: ConfiancaExtracao | null;
};

/** Linha de cálculo de um tributo (RF-03) — memorial de cálculo. */
export type MemorialTributo = {
  tributo: Tributo;
  tipoBeneficio: TipoBeneficio;
  valor: number;
  formula: string;
  baseLegal: string | null;
  regraVersao: string;
};

/** Resultado completo do motor para uma despesa. */
export type ResultadoMotor = {
  confianca: NivelConfianca;
  statusSugerido: StatusDespesa;
  valorFiscal: number;
  valorReembolsavel: number;
  percentualComercial: number | null;
  memorialTributos: MemorialTributo[];
  alertas: string[];
  requerEvidencia: boolean;
  plausibilidade: {
    consumoRealKmPorLitro: number | null;
    kmPorLitroDeclarado: number | null;
    divergenciaPct: number | null;
    aprovado: boolean | null;
  };
};

/** Totais do dashboard (RF-08). */
export type DashboardResumo = {
  valorIdentificado: number;
  valorCapturavel: number;
  valorEmRevisao: number;
  totalDespesas: number;
  pendenciasRevisao: number;
  despesasSemEvidencia: number;
  evolucaoPorCategoria: {
    categoria: CategoriaDespesa;
    total: number;
    valorCreditos: number;
    quantidade: number;
  }[];
};

/** Linha de relatório (RF-06). */
export type RelatorioLinha = {
  despesaId: number;
  dataFatoGerador: string | null;
  categoria: CategoriaDespesa | null;
  confianca: NivelConfianca;
  status: StatusDespesa;
  valorFiscal: number;
  valorReembolsavel: number;
  tributo: Tributo | null;
  tipoBeneficio: TipoBeneficio | null;
  valorCredito: number | null;
};

/** Usuário autenticado (sem hash). */
export type UsuarioSessao = {
  id: number;
  email: string;
  nome: string;
  perfil: Perfil;
};

// ─────────────────────────────────────────────────────────────────────────────
// Agente de Política de Reembolso (v1.1.0)
// ─────────────────────────────────────────────────────────────────────────────

export const DECISOES_POLITICA = ["aprovado", "negado", "revisao_humana"] as const;
export type DecisaoPolitica = (typeof DECISOES_POLITICA)[number];

export const STATUS_POLITICA = ["rascunho", "ativa", "inativa"] as const;
export type StatusPolitica = (typeof STATUS_POLITICA)[number];

export const CONFIANCAS_EXTRACAO = ["alta", "media", "baixa"] as const;
export type ConfiancaExtracao = (typeof CONFIANCAS_EXTRACAO)[number];

/** Tipo de documento detectado pelo OCR de visão (v1.8): o LLM só relata; quem julga é o decisor (D-013). */
export const TIPOS_DOCUMENTO = [
  "nota_fiscal",
  "recibo",
  "extrato_conta",
  "comprovante_pagamento",
  "outro",
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const TIPO_DOCUMENTO_LABELS: Record<TipoDocumento, string> = {
  nota_fiscal: "nota fiscal",
  recibo: "recibo",
  extrato_conta: "extrato de conta",
  comprovante_pagamento: "comprovante de pagamento",
  outro: "documento não fiscal",
};

/** Labels PT-BR para UI. */
export const DECISAO_POLITICA_LABELS: Record<DecisaoPolitica, string> = {
  aprovado: "Aprovado pela política",
  negado: "Negado pela política",
  revisao_humana: "Revisão humana (política)",
};

export const STATUS_POLITICA_LABELS: Record<StatusPolitica, string> = {
  rascunho: "Rascunho",
  ativa: "Ativa",
  inativa: "Inativa",
};

export const CONFIANCA_EXTRACAO_LABELS: Record<ConfiancaExtracao, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

/** Rótulo PT-BR da categoria usado nas frases do servidor (agente, decisor, derivação). */
export const CATEGORIA_DESPESA_ROTULO: Record<CategoriaDespesa, string> = {
  combustivel: "combustível",
  alimentacao: "alimentação",
  hospedagem: "hospedagem",
  pedagio: "pedágio",
  uber: "Uber/app",
  taxi: "táxi",
};

/** Grandes temas de uma política de reembolso (slug, título) — ordem de exibição. */
export const TEMAS_POLITICA = [
  ["alimentacao", "Alimentação"],
  ["transporte-e-deslocamento", "Transporte e deslocamento"],
  ["hospedagem-e-viagem", "Hospedagem e viagem"],
  ["saude", "Saúde"],
  ["educacao-e-desenvolvimento", "Educação e desenvolvimento"],
  ["tecnologia-e-escritorio", "Tecnologia e escritório"],
  ["eventos-e-relacionamento", "Eventos e relacionamento"],
  ["mudanca-e-transferencia", "Mudança e transferência"],
  ["governanca-do-processo", "Governança do processo"],
] as const;
export type TemaPolitica = (typeof TEMAS_POLITICA)[number][0];
export const TEMAS_POLITICA_SLUGS = [
  "alimentacao",
  "transporte-e-deslocamento",
  "hospedagem-e-viagem",
  "saude",
  "educacao-e-desenvolvimento",
  "tecnologia-e-escritorio",
  "eventos-e-relacionamento",
  "mudanca-e-transferencia",
  "governanca-do-processo",
] as const satisfies readonly TemaPolitica[];
export const TEMA_POLITICA_TITULO = Object.fromEntries(TEMAS_POLITICA) as Record<TemaPolitica, string>;

export const UNIDADES_LIMITE = [
  "dia",
  "mes",
  "viagem",
  "evento",
  "percentual",
  "dias_antecedencia",
  "dias_para_pagamento",
] as const;
export type UnidadeLimite = (typeof UNIDADES_LIMITE)[number];

/**
 * Unidades em que o teto é por período: um único comprovante pode cobrir mais de um
 * (3 diárias numa nota de hotel). Por isso o pior desfecho vira revisão, nunca negação (D-013).
 * "mes" NÃO entra: nota mensal única é caso raro e o teto mensal exige acumulado, não existe aqui.
 */
export const UNIDADES_LIMITE_TEMPORAIS = ["dia", "viagem", "evento"] as const;
export type UnidadeLimiteTemporal = (typeof UNIDADES_LIMITE_TEMPORAIS)[number];

export const REEMBOLSAVEL_REGRA = ["sim", "excecao", "vedado"] as const;
export type ReembolsavelRegra = (typeof REEMBOLSAVEL_REGRA)[number];

/**
 * Alcance de uma regra dentro da categoria (v1.8).
 *  - "item"      → sub-item da categoria (ex.: "Lavanderia em viagens — R$ 30/dia").
 *                  NUNCA vira teto, vedação ou exceção da categoria inteira.
 *  - "categoria" → o gestor marcou explicitamente que a regra vale para a categoria toda.
 * Default "item": promover uma regra é ato consciente do gestor.
 */
export const ESCOPOS_REGRA = ["item", "categoria"] as const;
export type EscopoRegra = (typeof ESCOPOS_REGRA)[number];

/**
 * O que ESTA regra autoriza o agente a fazer sozinho (v1.8).
 *  - "nenhuma" → a regra é documentação: pode gerar teto/exceção (revisão), NUNCA
 *                aprovação nem negação automática. Default de tudo que já existe.
 *  - "aprovar" → reembolsavel "sim" + valorLimite > 0 em BRL não-percentual/não-prazo,
 *                E alcance declarado: sem categoria (teto geral) ou escopo "categoria".
 *  - "negar"   → reembolsavel "vedado", e o alcance define o que é exigido:
 *                sem categoria → valorLimite > 0 em BRL (teto geral de negação);
 *                com categoria → escopo "categoria" e SEM valor (veda a categoria toda).
 *                Regra vedada COM valor nunca vira vedação de categoria: negaria a
 *                categoria inteira em qualquer valor, alcance maior do que a regra declara.
 * NENHUM prompt de LLM pede este campo e nenhum parser o preenche: só o gestor,
 * no card. É a única porta para decisão automática (D-013).
 */
export const DECISOES_AUTOMATICAS_REGRA = ["nenhuma", "aprovar", "negar"] as const;
export type DecisaoAutomaticaRegra = (typeof DECISOES_AUTOMATICAS_REGRA)[number];

/** Tamanho máximo de `descricao` e `condicao` de uma regra (espelhado no `maxLength` do card de edição). */
export const REGRA_TEXTO_MAX = 300;

/** Uma regra estruturada extraída do documento (ou cadastrada pelo gestor). Fonte dos parâmetros derivados. */
export const regraExtraidaSchema = z.object({
  id: z.string().min(1).max(80),
  tema: z.enum(TEMAS_POLITICA_SLUGS),
  categoria: z.enum(CATEGORIAS_DESPESA).nullable().default(null),
  escopo: z.enum(ESCOPOS_REGRA).default("item"),
  descricao: z.string().trim().min(1).max(REGRA_TEXTO_MAX),
  condicao: z.string().trim().max(REGRA_TEXTO_MAX).nullable().default(null),
  reembolsavel: z.enum(REEMBOLSAVEL_REGRA).default("sim"),
  valorLimite: z.number().min(0).nullable().default(null),
  moeda: z.string().trim().toUpperCase().length(3).default("BRL"),
  unidadeLimite: z.enum(UNIDADES_LIMITE).nullable().default(null),
  exigeComprovante: z.boolean().default(false),
  /**
   * Declaração do gestor: esta regra só aceita nota fiscal ou recibo — comprovante de
   * pagamento (Pix, cartão, extrato) não serve. Substitui o match pelo id
   * `comprovantes-nao-aceitos`, que nenhum prompt pedia (decisão do dono P-2, v1.8).
   */
  exigeDocumentoFiscal: z.boolean().default(false),
  decisaoAutomatica: z.enum(DECISOES_AUTOMATICAS_REGRA).default("nenhuma"),
});
export type RegraExtraida = z.infer<typeof regraExtraidaSchema>;

/** Categoria marcada pela política + a regra que a marcou. Toda decisão cita a regra (D-013). */
export const categoriaRegraCitadaSchema = z.object({
  categoria: z.enum(CATEGORIAS_DESPESA),
  regraId: z.string().min(1).max(80),
  descricao: z.string().trim().min(1).max(REGRA_TEXTO_MAX),
  /** Frase PT-BR pronta para o veredito — quem deriva sabe o porquê; o agente só cita. */
  motivo: z.string().trim().min(1).max(400),
});
export type CategoriaRegraCitada = z.infer<typeof categoriaRegraCitadaSchema>;

/** Ponto em que a política NÃO define e o agente, por isso, não decide (v1.8). */
export const LACUNA_TIPOS = [
  "conflito-vedado-permissivo", // regra vedada de CATEGORIA convivendo com regra "sim", sem marcação
  "so-vedado-sem-marcacao", // só regra vedada na categoria, nenhuma marcada como "negar"
  "marcacao-sem-valor", // regra marcada "aprovar" sem valor monetário aplicável
  "marcacao-sem-efeito", // marcação do gestor que a derivação não consegue aplicar (escopo/valor)
  "lacunas-demais", // agregado: houve mais lacunas do que o contrato comporta
] as const;
export type LacunaTipo = (typeof LACUNA_TIPOS)[number];

/**
 * Teto de lacunas gravadas numa política. A derivação NUNCA pode produzir mais do que
 * isso: o JSON é reparseado a cada leitura (`politica.get`, `politica.ativa`,
 * `despesas.decidirAutomatico`) e um array maior derrubava a empresa inteira com
 * `too_big`. Ao truncar, a última entra como "lacunas-demais" — sem categoria, ou seja,
 * mandando TUDO para revisão: cortar só pode errar para o lado seguro (D-013).
 */
export const LACUNAS_MAX = 60;

export const lacunaPoliticaSchema = z.object({
  tipo: z.enum(LACUNA_TIPOS),
  /** null = vale para toda despesa; categoria = só nela. */
  categoria: z.enum(CATEGORIAS_DESPESA).nullable().default(null),
  regraIds: z.array(z.string().min(1).max(80)).max(20).default([]),
  /** Frase PT-BR pronta para o veredito — nomeia a lacuna. */
  motivo: z.string().trim().min(1).max(400),
});
export type LacunaPolitica = z.infer<typeof lacunaPoliticaSchema>;

/**
 * JSON de regras da política — contrato estável, versionado junto à política
 * (campo `regras` de politicas_reembolso). Valores monetários em R$.
 */
export const regrasPoliticaSchema = z.object({
  /** Teto por categoria (R$); null/ausente = sem limite específico */
  limitesPorCategoria: z
    .partialRecord(z.enum(CATEGORIAS_DESPESA), z.number().min(0).nullable())
    .default({}),
  /**
   * Categoria → unidade do teto, quando o teto veio de regra com unidade temporal (v1.8).
   * Presença da chave = teto por período: acima dele o pior desfecho é REVISÃO, nunca negação (D-013).
   * Ausência = comportamento atual (acima de 1,5x nega). Política antiga chega {} e não muda de comportamento.
   */
  tetosTemporaisPorCategoria: z
    .partialRecord(z.enum(CATEGORIAS_DESPESA), z.enum(UNIDADES_LIMITE_TEMPORAIS))
    .default({}),
  /** Categorias negadas automaticamente, com a regra que vedou (derivado das regras extraídas) */
  categoriasVedadas: z.array(categoriaRegraCitadaSchema).default([]),
  /** Categorias que exigem revisão humana (aprovação superior), com a regra citada (derivado) */
  categoriasExcecao: z.array(categoriaRegraCitadaSchema).default([]),
  /** Categorias que exigem veículo cadastrado na empresa */
  exigeVeiculoCadastrado: z.array(z.enum(CATEGORIAS_DESPESA)).default([]),
  /** Categorias que exigem evidência documental anexada */
  exigeEvidencia: z.array(z.enum(CATEGORIAS_DESPESA)).default([]),
  /** Aprovação automática até este valor (R$); null = sem teto configurado */
  aprovacaoAutomaticaAte: z.number().min(0).nullable().default(null),
  /** Teto de aprovação automática POR categoria (R$) — só de regra marcada "aprovar" com escopo "categoria" (v1.8) */
  aprovacaoAutomaticaPorCategoria: z
    .partialRecord(z.enum(CATEGORIAS_DESPESA), z.number().min(0))
    .default({}),
  /** Regras citadas nos tetos por categoria (D-013: todo motivo nomeia a regra) */
  limitesCitados: z.array(categoriaRegraCitadaSchema).default([]),
  /** Id da regra que fundamenta cada teto global; null quando o teto não existe */
  aprovacaoAutomaticaAteRegraId: z.string().max(80).nullable().default(null),
  revisaoHumanaAcimaDeRegraId: z.string().max(80).nullable().default(null),
  negacaoAcimaDeRegraId: z.string().max(80).nullable().default(null),
  /** Onde a política não define — o agente não decide e nomeia a lacuna (v1.8) */
  lacunas: z.array(lacunaPoliticaSchema).max(LACUNAS_MAX).default([]),
  /** Acima deste valor (R$) vai para revisão humana; null = sem regra */
  revisaoHumanaAcimaDe: z.number().min(0).nullable().default(null),
  /** Acima deste valor (R$) a despesa é negada; null = sem teto de negação */
  negacaoAcimaDe: z.number().min(0).nullable().default(null),
  /** Política exige nota fiscal/recibo em TODA despesa — só de regra marcada SEM categoria (v1.8) */
  exigeDocumentoFiscal: z.boolean().default(false),
  /** Id da regra extraída que fundamenta a exigência geral (para citação na negação); null = não exige */
  regraDocumentoFiscalId: z.string().max(80).nullable().default(null),
  /**
   * Exigência de nota fiscal/recibo POR categoria, com a regra que exigiu. Regra de
   * hospedagem marcada "só aceito nota fiscal" vale em hospedagem e em nenhuma outra:
   * é a segunda porta de negação automática e o alcance dela nunca pode ser maior do
   * que o da regra (D-013).
   */
  exigeDocumentoFiscalPorCategoria: z.array(categoriaRegraCitadaSchema).default([]),
  /** Observações em texto livre extraídas do documento da política */
  observacoes: z.array(z.string()).default([]),
  /** Regras estruturadas (v1.7 do agente). Única fonte editável; os campos acima são derivados delas no servidor. Ausente = política antiga. */
  regrasExtraidas: z.array(regraExtraidaSchema).max(500).default([]),
});
export type RegrasPolitica = z.infer<typeof regrasPoliticaSchema>;

/** Resultado da extração do documento de política (parser plugável). */
export type PolicyExtracao = {
  textoExtraido: string | null;
  regras: RegrasPolitica;
  confiancaExtracao: ConfiancaExtracao;
  /** Campos que precisam de revisão/preenchimento manual assistido */
  camposPendentes: string[];
  provedor: string;
  avisos: string[];
};

/** Uma regra avaliada pelo agente, com resultado individual. */
export type RegraAplicada = {
  regra: string;
  resultado: "passou" | "falhou" | "revisar";
  detalhe: string;
};

/** Resultado do agente avaliador para uma despesa. */
export type ResultadoPolitica = {
  decisao: DecisaoPolitica;
  motivos: string[];
  regrasAplicadas: RegraAplicada[];
};

// ── Inputs tRPC (politica.*) ────────────────────────────────────────────────

export const politicaUploadInput = z.object({
  empresaId: z.number().int().positive(),
  arquivoNome: z.string().min(1).max(255),
  arquivoMime: z.string().max(100),
  arquivoBase64: z.string().min(1),
});

export const politicaUpdateRegrasInput = z.object({
  id: z.number().int().positive(),
  regras: regrasPoliticaSchema,
});

export const politicaTestarInput = z.object({
  empresaId: z.number().int().positive(),
  categoria: z.enum(CATEGORIAS_DESPESA),
  valorNota: z.number().min(0),
  temVeiculo: z.boolean().default(false),
  temEvidencia: z.boolean().default(false),
});


// ─────────────────────────────────────────────────────────────────────────────
// Convites de usuários (v1.2.0) — primeiro usuário da plataforma = admin,
// admin convida os demais por e-mail (link com token).
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_CONVITE = ["pendente", "aceito", "revogado"] as const;
export type StatusConvite = (typeof STATUS_CONVITE)[number];

export const STATUS_CONVITE_LABELS: Record<StatusConvite, string> = {
  pendente: "Pendente",
  aceito: "Aceito",
  revogado: "Revogado",
};

export const PERFIL_LABELS: Record<Perfil, string> = {
  admin: "Administrador",
  cliente: "Cliente (empresa)",
  revisor: "Revisor",
};

/** Convite retornado pela API (nunca expõe token de outros nem hash). */
export type Convite = {
  id: number;
  email: string;
  perfil: Perfil;
  status: StatusConvite;
  expiresAt: Date;
  createdAt: Date;
  /** Link absoluto de aceite — presente só na criação/reenvio e se SMTP não configurado */
  linkAceite?: string;
  /** true quando o convite foi enviado por e-mail (SMTP configurado) */
  enviadoPorEmail?: boolean;
};

// ── Inputs tRPC (convites.*) ────────────────────────────────────────────────

export const conviteCriarInput = z.object({
  email: z.string().email().max(255),
  perfil: z.enum(PERFIS),
});

export const conviteAceitarInput = z.object({
  token: z.string().min(16).max(128),
  nome: z.string().min(2).max(255),
  senha: z.string().min(8).max(128),
});

// ── Consulta de CNPJ na Receita (ReceitaWS) — v1.3.0 ───────────────────────

export type CnaeReceita = { codigo: string; descricao: string };

/** Dados da Receita Federal (via ReceitaWS) para prefill do cadastro — v1.3.0 */
export type DadosReceitaCnpj = {
  cnpj: string; // formatado XX.XXX.XXX/XXXX-XX
  razaoSocial: string;
  nomeFantasia: string | null;
  situacao: string; // "ATIVA", "BAIXADA", ...
  cnaePrincipal: CnaeReceita | null; // código curto "64.22-1"
  cnaesSecundarios: CnaeReceita[]; // códigos curtos, sem duplicar o principal
  uf: string | null;
  municipio: string | null;
};
