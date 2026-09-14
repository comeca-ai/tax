import { z } from "zod";

export const empresaFiscalInput = z
  .object({ empresaId: z.number().int().positive() })
  .strict();
export const configurarFiscalInput = empresaFiscalInput
  .extend({
    habilitada: z.boolean(),
    versaoEsperada: z.number().int().nonnegative(),
  })
  .strict();

export const ESTADOS_VERIFICACAO_FISCAL = [
  "desativada",
  "processando",
  "sem_chave",
  "chave_invalida",
  "nao_suportada",
  "integridade_divergente",
  "sem_orcamento",
  "indisponivel",
  "autorizada",
  "cancelada",
  "nao_autorizada",
  "homologacao",
  "destinatario_divergente",
  "credencial_rejeitada",
  "acesso_negado",
  "nao_localizada",
  "limite_provedor",
  "timeout_incerto",
  "resposta_invalida",
  "chave_rejeitada",
] as const;
export type EstadoVerificacaoFiscal =
  (typeof ESTADOS_VERIFICACAO_FISCAL)[number];
export type ResultadoVerificacaoFiscal = {
  estado: EstadoVerificacaoFiscal;
  solicitada: boolean;
  configuracaoVersao: number;
  consultaId: string | null;
  modelo: string | null;
  verificadaEm: string | null;
};

export const ROTULOS_VERIFICACAO_FISCAL: Record<
  EstadoVerificacaoFiscal,
  string
> = {
  desativada: "Verificação fiscal desativada pela empresa",
  processando: "Verificação fiscal em processamento; aguarde conferência",
  sem_chave: "Chave de acesso não disponível no documento persistido",
  chave_invalida: "Chave de acesso extraída inválida; requer conferência",
  nao_suportada: "Modelo de nota não suportado pela consulta fiscal atual",
  integridade_divergente: "Integridade do arquivo não confirmada",
  sem_orcamento: "Consulta fiscal sem saldo autorizado",
  indisponivel: "Consulta fiscal indisponível",
  autorizada: "NF-e autorizada e destinatário compatível com a empresa",
  cancelada: "Nota fiscal cancelada",
  nao_autorizada: "Autorização da nota fiscal não confirmada",
  homologacao: "Documento emitido em ambiente fiscal de testes",
  destinatario_divergente: "Destinatário da nota diferente da empresa",
  credencial_rejeitada: "Consulta fiscal indisponível: credencial recusada",
  acesso_negado: "Consulta fiscal indisponível: acesso recusado",
  nao_localizada: "Nota não localizada pelo provedor fiscal",
  limite_provedor: "Limite de consultas do provedor atingido",
  timeout_incerto: "Consulta sem resposta conclusiva; requer conciliação",
  resposta_invalida: "Resposta fiscal não pôde ser validada",
  chave_rejeitada: "Chave de acesso recusada pelo provedor",
};

export function exigeRevisaoFiscal(
  resultado: ResultadoVerificacaoFiscal
): boolean {
  return resultado.solicitada && resultado.estado !== "autorizada";
}
