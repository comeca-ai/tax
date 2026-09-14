export const LIMITE_CONSULTAS: number;
export function reservarConsulta(arquivo: string, cenario: string, destino: "openai" | "360dialog", limite?: number): { consulta: number; cenario: string; destino: string; reservadoEm: string };
export function saldoConsultas(arquivo: string, limite?: number): number;
export function criarFetchLimitado(options: { arquivo: string; cenario: () => string; executar?: typeof fetch; registrar?: (result: Record<string, unknown>) => void }): typeof fetch;
