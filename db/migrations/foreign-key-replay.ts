type Connection = { query: (sql: string, values?: unknown[]) => Promise<unknown> };

/** MariaDB pode devolver ER_CANT_CREATE_TABLE para FK já existente. Verifica a definição antes de pular. */
export async function foreignKeyAlreadyApplied(conn: Connection, sql: string): Promise<boolean> {
  const match = /^ALTER TABLE `([a-zA-Z0-9_]+)` ADD CONSTRAINT `([a-zA-Z0-9_]+)` FOREIGN KEY \(([^)]+)\) REFERENCES `([a-zA-Z0-9_]+)` \(([^)]+)\);?$/i.exec(sql.trim());
  if (!match) return false;
  const [, table, name, columnsRaw, referencedTable, referencedRaw] = match;
  const columns = columnsRaw.split(',').map(c => c.trim());
  const referenced = referencedRaw.split(',').map(c => c.trim());
  if (columns.length !== referenced.length || [...columns, ...referenced].some(c => !/^`[a-zA-Z0-9_]+`$/.test(c))) return false;
  const result = await conn.query("SELECT k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, k.REFERENCED_TABLE_SCHEMA, r.UPDATE_RULE, r.DELETE_RULE, DATABASE() AS CURRENT_SCHEMA FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME=? AND k.CONSTRAINT_NAME=? ORDER BY k.ORDINAL_POSITION", [table, name]);
  const [rows] = result as [Array<{ COLUMN_NAME: string; REFERENCED_TABLE_NAME: string; REFERENCED_COLUMN_NAME: string; REFERENCED_TABLE_SCHEMA: string; CURRENT_SCHEMA: string; UPDATE_RULE: string; DELETE_RULE: string }>];
  if (!rows.length) return false;
  const matches = rows.length === columns.length && rows.every((r, i) =>
    r.COLUMN_NAME === columns[i].slice(1, -1) && r.REFERENCED_TABLE_NAME === referencedTable &&
    r.REFERENCED_COLUMN_NAME === referenced[i].slice(1, -1) && r.REFERENCED_TABLE_SCHEMA === r.CURRENT_SCHEMA &&
    ['NO ACTION', 'RESTRICT'].includes(r.UPDATE_RULE) && ['NO ACTION', 'RESTRICT'].includes(r.DELETE_RULE));
  if (!matches) throw new Error('A chave estrangeira existente diverge da migração; requer revisão.');
  return true;
}
