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
