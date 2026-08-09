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
});

export const veiculoInput = z.object({
  placa: z.string().min(7).max(10),
  renavam: z.string().max(20).optional(),
  kmPorLitroDeclarado: z.number().positive(),
  tarifaReembolsoKm: z.number().min(0).default(0),
  descricao: z.string().max(255).optional(),
});

export const uploadNotaInput = z.object({
  empresaId: z.number().int().positive(),
  arquivoNome: z.string().min(1).max(255),
  arquivoMime: z.string().max(100),
  arquivoBase64: z.string().min(1),
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
  arquivoBase64: z.string().optional(),
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
  categoria: CategoriaDespesa;
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

/**
 * JSON de regras da política — contrato estável, versionado junto à política
 * (campo `regras` de politicas_reembolso). Valores monetários em R$.
 */
export const regrasPoliticaSchema = z.object({
  /** Teto por categoria (R$); null/ausente = sem limite específico */
  limitesPorCategoria: z
    .partialRecord(z.enum(CATEGORIAS_DESPESA), z.number().min(0).nullable())
    .default({}),
  /** Categorias que exigem veículo cadastrado na empresa */
  exigeVeiculoCadastrado: z.array(z.enum(CATEGORIAS_DESPESA)).default([]),
  /** Categorias que exigem evidência documental anexada */
  exigeEvidencia: z.array(z.enum(CATEGORIAS_DESPESA)).default([]),
  /** Aprovação automática até este valor (R$); null = sem teto configurado */
  aprovacaoAutomaticaAte: z.number().min(0).nullable().default(null),
  /** Acima deste valor (R$) vai para revisão humana; null = sem regra */
  revisaoHumanaAcimaDe: z.number().min(0).nullable().default(null),
  /** Acima deste valor (R$) a despesa é negada; null = sem teto de negação */
  negacaoAcimaDe: z.number().min(0).nullable().default(null),
  /** Observações em texto livre extraídas do documento da política */
  observacoes: z.array(z.string()).default([]),
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
