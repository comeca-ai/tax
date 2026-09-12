import { readText } from "../utils/fs";
import type { FeatureItem } from "../types";

const ROUTER_IMPORT_RE = /import \{ (\w+) \} from "\.\/routers\/(\w+)"/g;
const ROUTER_ENTRY_RE = /^\s+(\w+): (\w+),?\s*$/;
const PROCEDURE_RE = /\.(query|mutation|subscription)\s*\(/g;

/**
 * Extrai funcionalidades (routers tRPC) do conteúdo de `api/router.ts`.
 * Função pura para testabilidade.
 */
export function parseFeatures(
  routerContent: string,
  routerFiles: Map<string, string>,
): FeatureItem[] {
  const imports = new Map<string, string>(); // símbolo -> arquivo
  for (const m of routerContent.matchAll(ROUTER_IMPORT_RE)) {
    imports.set(m[1], `api/routers/${m[2]}.ts`);
  }

  const items: FeatureItem[] = [];
  const seen = new Set<string>();
  for (const line of routerContent.split("\n")) {
    const m = line.match(ROUTER_ENTRY_RE);
    if (!m) continue;
    const [, key, symbol] = m;
    const file = imports.get(symbol);
    if (!file || seen.has(key)) continue;
    seen.add(key);
    const fileContent = routerFiles.get(file) ?? "";
    const procedures = (fileContent.match(PROCEDURE_RE) ?? []).length;
    items.push({ name: key, file, procedures });
  }
  return items;
}

/** Varre `api/router.ts` e os arquivos de router referenciados. */
export async function scanFeatures(root: string): Promise<FeatureItem[]> {
  const routerFile = "api/router.ts";
  const routerContent = await readText(`${root}/${routerFile}`);

  const files = new Map<string, string>();
  for (const m of routerContent.matchAll(ROUTER_IMPORT_RE)) {
    const file = `api/routers/${m[2]}.ts`;
    try {
      files.set(file, await readText(`${root}/${file}`));
    } catch {
      files.set(file, "");
    }
  }
  return parseFeatures(routerContent, files);
}
