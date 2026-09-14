import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';

const nome = 'reembolsa_poc_test_20260913';
const usuario = 'reembolsa_poc_test';
const arquivo = '/root/.config/codex-secrets/poc-test-db.env';

async function main() {
  if (process.argv[2] !== '--criar-isolado') throw new Error('Confirmação ausente');
  if (fs.existsSync(arquivo)) throw new Error('Configuração já existe; não sobrescrever');
  const admin = await mysql.createConnection({ user: 'root', socketPath: '/run/mysqld/mysqld.sock' });
  try {
    const [bancos] = await admin.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [nome]);
    const [usuarios] = await admin.query('SELECT User FROM mysql.user WHERE User = ?', [usuario]);
    if (bancos.length || usuarios.length) throw new Error('Alvo já existe; não alterar');
    const senha = randomBytes(32).toString('hex');
    const url = `mysql://${usuario}:${senha}@127.0.0.1:3306/${nome}`;
    // Guarda recuperável antes da primeira mutação; nunca imprime URL/senha.
    fs.writeFileSync(arquivo, `POC_TEST_DATABASE_URL=${url}\n`, { flag: 'wx', mode: 0o600 });
    await admin.query(`CREATE DATABASE \`${nome}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.query('CREATE USER ?@? IDENTIFIED BY ?', [usuario, '127.0.0.1', senha]);
    await admin.query(`GRANT ALL PRIVILEGES ON \`${nome}\`.* TO ?@?`, [usuario, '127.0.0.1']);
    const conn = await mysql.createConnection(url);
    try { await migrate(drizzle(conn), { migrationsFolder: './db/migrations', migrationsSchema: nome }); }
    finally { await conn.end(); }
    console.log(JSON.stringify({ banco: nome, isolado: true, migracoes: 'aplicadas', credencial: arquivo, dadosProducaoCopiados: false }));
  } finally { await admin.end(); }
}
void main().catch(() => { console.error('Preparação interrompida; nenhuma limpeza destrutiva automática. Inspecionar somente o banco de teste identificado.'); process.exitCode = 1; });
