import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

/**
 * Aplica migrações SQL geradas por `drizzle-kit generate` de forma NÃO
 * interativa (sem `db:push`, sem prompts). Uso:
 *
 *   npx tsx db/migrations/apply.ts            # aplica a migração mais recente
 *   npx tsx db/migrations/apply.ts 0001_x.sql  # aplica um arquivo específico
 *
 * Cada statement é separado por `--> statement-breakpoint`. Statements que
 * falharem por já existirem (tabela/coluna duplicada) são reportados e não
 * interrompem a aplicação — a migração nunca dropa tabelas com dados.
 */

const MIGRATIONS_DIR = path.dirname(new URL(import.meta.url).pathname);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida no ambiente/.env");

  const alvo =
    process.argv[2] ??
    readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .pop();
  if (!alvo) throw new Error("Nenhum arquivo .sql encontrado em db/migrations/");

  const sql = readFileSync(path.join(MIGRATIONS_DIR, alvo), "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`▶ Aplicando ${alvo} (${statements.length} statements)...`);
  const conn = await mysql.createConnection(url);
  try {
    for (const [i, stmt] of statements.entries()) {
      try {
        await conn.query(stmt);
        console.log(`  ✓ [${i + 1}/${statements.length}] ${stmt.slice(0, 72).replace(/\n/g, " ")}...`);
      } catch (err) {
        const code = (err as { code?: string }).code ?? "";
        // Idempotência: objeto já existe → avisa e segue (nunca dropa dados)
        if (["ER_TABLE_EXISTS_ERROR", "ER_DUP_FIELDNAME", "ER_DUP_KEYNAME"].includes(code)) {
          console.log(`  ⚠ [${i + 1}/${statements.length}] já aplicado (${code}), pulando`);
        } else {
          throw err;
        }
      }
    }
  } finally {
    await conn.end();
  }
  console.log("✓ Migração aplicada.");
}

main().catch((err) => {
  console.error("✗ Falha na migração:", err);
  process.exit(1);
});
