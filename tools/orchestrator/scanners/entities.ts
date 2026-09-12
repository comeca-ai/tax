import { readText } from "../utils/fs";
import type { EntityItem } from "../types";

const TABLE_RE = /export const (\w+)\s*=\s*(mysqlTable|pgTable|sqliteTable)\s*\(/;

/**
 * Extrai entidades (tabelas Drizzle) de um arquivo de schema.
 * Função pura — recebe o conteúdo para ser testável sem filesystem.
 */
export function parseEntities(content: string, file: string): EntityItem[] {
  const items: EntityItem[] = [];
  const lines = content.split("\n");
  lines.forEach((line, idx) => {
    const m = line.match(TABLE_RE);
    if (m) items.push({ name: m[1], file, line: idx + 1 });
  });
  return items;
}

/** Varre o schema padrão do projeto (`db/schema.ts`). */
export async function scanEntities(root: string): Promise<EntityItem[]> {
  const file = "db/schema.ts";
  const content = await readText(`${root}/${file}`);
  return parseEntities(content, file);
}
