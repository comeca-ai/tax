import { z } from "zod";

export const REGIMES_TRIBUTARIOS = [
  "lucro_real",
  "lucro_presumido",
  "simples_nacional",
] as const;
export type RegimeTributario = (typeof REGIMES_TRIBUTARIOS)[number];

export const UFS_BRASIL = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
] as const;
export type Uf = (typeof UFS_BRASIL)[number];

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

export const cnpjConsultaInput = z.object({
  cnpj: z.string().min(14).max(18),
});

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

export type EmpresaInput = z.infer<typeof empresaInput>;
