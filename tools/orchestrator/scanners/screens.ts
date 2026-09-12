import { readText } from "../utils/fs";
import type { ScreenItem } from "../types";

const ROUTE_RE = /<Route\s+(?:index\s+)?(?:path="([^"]*)")?\s*element=\{<(\w+)/g;

/**
 * Extrai telas/rotas do conteúdo de `src/App.tsx`.
 * Rotas após `<RequireAuth />` são marcadas como protegidas.
 * Função pura para testabilidade.
 */
export function parseScreens(appContent: string): ScreenItem[] {
  const items: ScreenItem[] = [];
  // O nome "RequireAuth" aparece no import antes das rotas; o limiar real é
  // a tag <Route element={<RequireAuth ...>} />. Se ela não existir, cai de
  // volta para a primeira ocorrência textual (rotas anteriores continuam públicas).
  const tagBoundary = appContent.search(/<Route\s+element=\{<RequireAuth/);
  const textBoundary = appContent.indexOf("RequireAuth");
  const authBoundary = tagBoundary >= 0 ? tagBoundary : textBoundary;

  for (const m of appContent.matchAll(ROUTE_RE)) {
    const isIndex = m[0].includes("index");
    const path = m[1] ?? (isIndex ? "(index)" : "");
    // Wrappers de layout (<Route element={...}> sem path nem index) não são telas.
    if (!path) continue;
    items.push({
      path,
      component: m[2],
      protected: authBoundary >= 0 && (m.index ?? 0) > authBoundary,
    });
  }
  return items;
}

/** Varre `src/App.tsx`. */
export async function scanScreens(root: string): Promise<ScreenItem[]> {
  const content = await readText(`${root}/src/App.tsx`);
  return parseScreens(content);
}
