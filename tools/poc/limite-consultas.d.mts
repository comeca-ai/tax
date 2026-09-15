export const LIMITE_CONSULTAS: number;
export type DestinoConsulta = "openai" | "openrouter" | "mistral" | "360dialog";
export function reservarConsulta(arquivo: string, cenario: string, destino: DestinoConsulta, limite?: number): { consulta: number; cenario: string; destino: string; reservadoEm: string };
export function saldoConsultas(arquivo: string, limite?: number): number;
export function criarFetchLimitado(options: { arquivo: string; cenario: () => string; executar?: typeof fetch; registrar?: (result: Record<string, unknown>) => void }): typeof fetch;
export type EventoUsoIa = {
  registradoEm?: string;
  provedor: "openai" | "openrouter" | "mistral";
  endpointExterno: string;
  operacao: string;
  http?: number | null;
  estado: "respondida" | "resultado_incerto";
  tokensEntrada?: number | null;
  tokensSaida?: number | null;
  tokensTotal?: number | null;
};
export function registrarUsoIa(arquivo: string, evento: EventoUsoIa): Record<string, unknown>;
export function montarDashboardIa(eventos: Record<string, unknown>[], geradoEm?: string): Record<string, unknown>;
export function gravarDashboardIa(arquivoUso: string, arquivoSaida: string, geradoEm?: string): Record<string, unknown>;
