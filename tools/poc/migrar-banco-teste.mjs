import { readFileSync } from "node:fs";
import { createConnection } from "mysql2/promise";
import { safeDatabase, TEST_DATABASE } from "./browser-smoke-guards.mjs";

async function main() {
  if (process.argv[2] !== "--banco-isolado") throw new Error("Confirmação ausente");
  const raw = readFileSync("/root/.config/codex-secrets/poc-test-db.env", "utf8");
  const value = raw.split("\n").find(line => line.startsWith("POC_TEST_DATABASE_URL="))?.slice("POC_TEST_DATABASE_URL=".length);
  if (!value) throw new Error("Configuração ausente");
  const target = safeDatabase(value);
  const db = await createConnection(target.href);
  try {
    const [rows] = await db.query("SELECT DATABASE() AS nome");
    if (rows[0]?.nome !== TEST_DATABASE) throw new Error("Banco inesperado");
    // Completa somente as duas migrações aditivas autorizadas no banco descartável.
    const statements = ["0018_veiculo_unificado.sql", "0019_auth_seguranca.sql", "0020_equipe_lotes.sql"].flatMap(name => readFileSync(`./db/migrations/${name}`, "utf8").split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean));
    for (const sql of statements) {
      if (sql.includes("ADD CONSTRAINT `colaboradores_superior_tenant_fk`")) {
        const [existing] = await db.query("SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='colaboradores' AND CONSTRAINT_NAME='colaboradores_superior_tenant_fk' ORDER BY ORDINAL_POSITION");
        if (existing.length) {
          if (existing.length !== 2 || existing[0].COLUMN_NAME !== "empresa_id" || existing[0].REFERENCED_COLUMN_NAME !== "empresa_id" || existing[1].COLUMN_NAME !== "superior_direto_id" || existing[1].REFERENCED_COLUMN_NAME !== "id" || existing.some(r => r.REFERENCED_TABLE_NAME !== "colaboradores")) throw new Error("FK superior divergente");
          continue;
        }
      }
      if (sql.includes("ADD CONSTRAINT `veiculos_pessoa_empresa_fk`")) {
        const [existing] = await db.query("SELECT COLUMN_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='veiculos' AND CONSTRAINT_NAME='veiculos_pessoa_empresa_fk' ORDER BY ORDINAL_POSITION");
        if (existing.length) {
          if (existing.length !== 2 || existing[0].COLUMN_NAME !== "empresa_id" || existing[0].REFERENCED_COLUMN_NAME !== "empresa_id" || existing[1].COLUMN_NAME !== "colaborador_id" || existing[1].REFERENCED_COLUMN_NAME !== "id") throw new Error("FK existente divergente");
          continue;
        }
      }
      try { await db.query(sql); }
      catch (error) { if (!["ER_DUP_FIELDNAME", "ER_DUP_KEYNAME", "ER_FK_DUP_NAME"].includes(error.code)) throw error; }
    }
    const [constraints] = await db.query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'veiculos' AND CONSTRAINT_NAME IN ('veiculos_pessoa_empresa_fk', 'veiculos_pessoa_placa_unique')");
    if (constraints.length !== 2) throw new Error("Constraints incompletas");
    console.log(JSON.stringify({ banco: TEST_DATABASE, migracoes: "aplicadas", producao: false }));
  } finally { await db.end(); }
}
main().catch(error => { console.error(JSON.stringify({ erro: "migracao_isolada", tipo: error?.name, codigo: error?.code ?? error?.cause?.code ?? "sem_codigo", errno: error?.errno ?? error?.cause?.errno ?? null })); process.exitCode = 1; });
