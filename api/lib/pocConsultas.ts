import { reservarConsulta, saldoConsultas } from "../../tools/poc/limite-consultas.mjs";

export class ReservaConsultaPocIndisponivel extends Error {
  constructor() { super("Reserva de consulta indisponível; nenhuma chamada externa foi iniciada."); }
}
function config() {
  const arquivo = process.env.POC_CALLS_LEDGER;
  if (!arquivo) return null;
  const limite = Number(process.env.POC_CALLS_LIMIT ?? "20");
  if (!Number.isInteger(limite) || limite < 1 || limite > 1000) throw new ReservaConsultaPocIndisponivel();
  return { arquivo, limite };
}
export function saldoChamadasPoc(): number {
  try {
    const c = config();
    return c ? saldoConsultas(c.arquivo, c.limite) : Infinity;
  } catch { return 0; }
}

/** Habilitada somente pelo operador. Reinício/deploy nunca repõe o saldo. */
export function instalarLimiteChamadasPoc() {
  const c = config();
  if (!c) return;
  // Falha na leitura impede iniciar o ambiente com limite sem efeito.
  saldoConsultas(c.arquivo, c.limite);
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const destino = url.hostname === "api.openai.com" ? "openai" : url.hostname === "waba-v2.360dialog.io" ? "360dialog" : null;
    if (destino) {
      try { reservarConsulta(c.arquivo, "poc_runtime", destino, c.limite); }
      catch { throw new ReservaConsultaPocIndisponivel(); }
    }
    return original(input, init);
  };
}
