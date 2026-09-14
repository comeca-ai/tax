import { randomUUID } from "node:crypto";
import { and, asc, eq, gt } from "drizzle-orm";
import { colaboradores, politicasReembolso } from "../../../../db/schema";
import { pocCampo, pocConfiguracao } from "../../../../db/pocSchema";
import { getDb } from "../../../queries/connection";
import { atualizarConciliacoes, type Jornada } from "./dominio";
import { estimarJornada } from "./maps";
import { alterarCampo, type IdentidadeCampo } from "./servico";

export const INTERVALO_MAPS_PADRAO_MINUTOS = 30;

/** Estado persistido governa retries, inclusive após reinício ou chamadas concorrentes. */
export function podeConsultarMaps(jornada: Jornada, agora: Date): boolean {
  if (jornada.calculo.estado === "estimado" || jornada.pontos.length < 2 || jornada.pontos.length > 27 || jornada.pontos.at(-1)?.tipo !== "check_out") return false;
  const proxima = jornada.calculo.proximaTentativaEm;
  return !proxima || (Number.isFinite(Date.parse(proxima)) && Date.parse(proxima) <= agora.getTime());
}

export function reservarTentativaMaps(jornada: Jornada, intervaloMinutos: number, agora: Date, consultaId: string): Jornada["calculo"] {
  if (!Number.isInteger(intervaloMinutos) || intervaloMinutos < 1 || intervaloMinutos > 10080) throw new Error("Intervalo de consulta Maps inválido.");
  return { ...jornada.calculo, consultaId, ultimaTentativaEm: agora.toISOString(), proximaTentativaEm: new Date(agora.getTime() + intervaloMinutos * 60_000).toISOString(), tentativas: (jornada.calculo.tentativas ?? 0) + 1, erro: null };
}

type Deps = { estimar?: typeof estimarJornada; agora?: () => Date; apiKey?: string; habilitado?: boolean };

/** Reserva é commitada antes da rede. Coordenadas e ID original da jornada são preservados. */
export async function calcularJornadaPersistida(identity: IdentidadeCampo, jornadaId: string, usuarioId: number | null, automatico = false, deps: Deps = {}): Promise<Jornada> {
  const habilitado = deps.habilitado ?? process.env.POC_MAPS_ENABLED === "true";
  const apiKey = deps.apiKey ?? process.env.GOOGLE_MAPS_API_KEY;
  const agora = (deps.agora ?? (() => new Date()))();
  const reservation = await alterarCampo(identity, usuarioId, "jornada.reservar_consulta_maps", async (estado, tx) => {
    const jornada = estado.jornadas.find(j => j.id === jornadaId);
    if (!jornada) throw new Error("Jornada indisponível.");
    const [row] = await tx.select().from(pocConfiguracao).where(eq(pocConfiguracao.empresaId, identity.empresaId));
    const config = row?.configuracao;
    if (!habilitado || !apiKey || !config || (automatico && !config.calculoMapsAutomatico) || !podeConsultarMaps(jornada, agora)) return { jornada, reservada: false };
    const [politica] = await tx.select().from(politicasReembolso).where(and(eq(politicasReembolso.empresaId, identity.empresaId), eq(politicasReembolso.id, config.politicaId)));
    if (!politica || politica.status !== "ativa" || politica.versao !== config.politicaVersao) return { jornada, reservada: false };
    jornada.calculo = reservarTentativaMaps(jornada, config.intervaloConsultaMapsMinutos ?? INTERVALO_MAPS_PADRAO_MINUTOS, agora, randomUUID());
    return { jornada: structuredClone(jornada), reservada: true };
  });
  if (!reservation.reservada) return reservation.jornada;
  let resultado: Jornada["calculo"];
  try { resultado = await (deps.estimar ?? estimarJornada)(reservation.jornada, { habilitado, apiKey }); }
  catch { resultado = { estado: "aguardando_calculo", metros: null, calculadoEm: null }; }
  return alterarCampo(identity, usuarioId, "jornada.resultado_consulta_maps", estado => {
    const jornada = estado.jornadas.find(j => j.id === jornadaId);
    if (!jornada) throw new Error("Jornada indisponível.");
    if (jornada.calculo.consultaId !== reservation.jornada.calculo.consultaId) return jornada;
    if (JSON.stringify(jornada.pontos) !== JSON.stringify(reservation.jornada.pontos)) return jornada;
    jornada.calculo = { ...jornada.calculo, ...resultado, erro: resultado.estado === "estimado" ? null : "Consulta indisponível; nova tentativa respeitará o intervalo configurado." };
    atualizarConciliacoes(estado);
    return jornada;
  });
}

/** Uma chamada externa por ciclo. Cursor evita deixar empresas posteriores sem atendimento. */
export async function executarCicloMaps(cursor = 0): Promise<number> {
  if (process.env.POC_MAPS_ENABLED !== "true" || !process.env.GOOGLE_MAPS_API_KEY) return 0;
  const rows = await getDb().select({ empresaId: pocCampo.empresaId, colaboradorId: pocCampo.colaboradorId, estado: pocCampo.estado, config: pocConfiguracao.configuracao })
    .from(pocCampo).innerJoin(pocConfiguracao, eq(pocConfiguracao.empresaId, pocCampo.empresaId))
    .innerJoin(colaboradores, and(eq(colaboradores.id, pocCampo.colaboradorId), eq(colaboradores.empresaId, pocCampo.empresaId)))
    .where(and(gt(pocCampo.colaboradorId, cursor), eq(colaboradores.statusVinculo, "ativo"))).orderBy(asc(pocCampo.colaboradorId)).limit(20);
  for (const row of rows) {
    if (!row.config.calculoMapsAutomatico) continue;
    const jornada = row.estado.jornadas.find(j => podeConsultarMaps(j, new Date()));
    if (jornada) { await calcularJornadaPersistida(row, jornada.id, null, true); return row.colaboradorId; }
  }
  return rows.length === 20 ? rows.at(-1)!.colaboradorId : 0;
}

export function iniciarWorkerMaps() {
  let running = false, cursor = 0;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void executarCicloMaps(cursor).then(next => { cursor = next; })
      .catch(() => console.error("[campo] Consulta de distância indisponível"))
      .finally(() => { running = false; });
  }, 30_000);
  timer.unref();
  return () => clearInterval(timer);
}
