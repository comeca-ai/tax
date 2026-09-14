import type { Jornada } from "./dominio";

/** Só executada pelo comando posterior de consolidação; nunca na captura. */
export async function estimarJornada(jornada: Jornada, config: { habilitado: boolean; apiKey?: string }, request: typeof fetch = fetch): Promise<Jornada["calculo"]> {
  const pendente: Jornada["calculo"] = { estado: "aguardando_calculo", metros: null, calculadoEm: null };
  if (!config.habilitado || !config.apiKey || jornada.pontos.at(-1)?.tipo !== "check_out" || jornada.pontos.length < 2) return pendente;
  const point = (p: Jornada["pontos"][number]) => ({ location: { latLng: { latitude: p.latitude, longitude: p.longitude } } });
  let metros = 0;
  // Uma única chamada evita duplicação parcial cobrada em caso de timeout.
  // Limite explícito: jornadas maiores continuam pendentes para segmentação futura.
  if (jornada.pontos.length > 27) return pendente;
  try {
    const response = await request("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": config.apiKey, "X-Goog-FieldMask": "routes.distanceMeters" },
      body: JSON.stringify({ origin: point(jornada.pontos[0]), destination: point(jornada.pontos.at(-1)!), intermediates: jornada.pontos.slice(1, -1).map(point), travelMode: "DRIVE", optimizeWaypointOrder: false }),
    });
    if (!response.ok) return pendente;
    const body = await response.json() as { routes?: { distanceMeters?: number }[] };
    const distancia = body.routes?.[0]?.distanceMeters;
    if (typeof distancia !== "number" || !Number.isSafeInteger(distancia) || distancia < 0) return pendente;
    metros = distancia;
  } catch { return pendente; }
  return { estado: "estimado", metros, calculadoEm: new Date().toISOString() };
}
