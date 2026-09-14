import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArguments, replaceEnvironment, renderDropin, createDatabaseSql, isolateHomolog, TARGET } from './isolar-homolog.mjs';

const password = 'a'.repeat(64);
const environment = "DATABASE_URL='mysql://reembolsa_app:synthetic@localhost:3306/reembolsa_homolog'\nDIALOG_360_API_KEY='synthetic-no-real-secret'\nDIALOG_360_WEBHOOK_SECRET='Bearer synthetic-header'\nWHATSAPP_POC_ENABLED=false\n";
function adapter(fail) {
  const calls = [];
  const io = Object.fromEntries(['preflight', 'backup', 'createAccounts', 'prepareUploads', 'installConfiguration', 'restartHomolog', 'postcheck', 'restoreConfiguration', 'checkRestored'].map(name => [name, async () => {
    calls.push(name); if (name === fail) throw new Error('private-database-error'); return { backupPath: 'synthetic' };
  }]));
  return { calls, io };
}
test('padrão é somente preflight e rejeita alvos/comandos arbitrários', () => {
  assert.equal(parseArguments([]), '--preflight'); assert.equal(parseArguments(['--apply']), '--apply');
  for (const args of [['--service=reembolsa.service'], ['--apply', '--force'], ['--rollback'], ['--database=prod']]) assert.throws(() => parseArguments(args));
});
test('preflight não chama backup, contas, escrita ou restart', async () => {
  const { io, calls } = adapter(); const result = await isolateHomolog('--preflight', io);
  assert.equal(result.changesApplied, false); assert.deepEqual(calls, ['preflight']);
});
test('aplica com backup prévio e pós-checagem, sem alegar rollback DDL', async () => {
  const { io, calls } = adapter(); const result = await isolateHomolog('--apply', io);
  assert.deepEqual(calls, ['preflight', 'backup', 'createAccounts', 'prepareUploads', 'installConfiguration', 'restartHomolog', 'postcheck']);
  assert.equal(result.databaseDdlRollbackSupported, false); assert.equal(result.workerEnabledByScript, false);
});
for (const phase of ['preflight', 'backup']) test(`falha ${phase} não altera contas/configuração`, async () => {
  const { io, calls } = adapter(phase); await assert.rejects(isolateHomolog('--apply', io));
  assert(!calls.includes('createAccounts')); assert(!calls.includes('restartHomolog'));
});
for (const phase of ['createAccounts', 'prepareUploads', 'installConfiguration', 'postcheck']) test(`falha ${phase} restaura configuração e identifica resíduos DDL`, async () => {
  const { io, calls } = adapter(phase);
  await assert.rejects(isolateHomolog('--apply', io), { message: 'APPLY_FAILED_CONFIG_RESTORED_ACCOUNTS_REQUIRE_MANUAL_REVIEW' });
  assert.deepEqual(calls.slice(-3), ['restoreConfiguration', 'restartHomolog', 'checkRestored']);
});
test('rollback com erro requer recuperação manual sem divulgar erro original', async () => {
  const { io } = adapter('postcheck'); io.restoreConfiguration = async () => { throw new Error('secret'); };
  await assert.rejects(isolateHomolog('--apply', io), { message: 'APPLY_FAILED_ROLLBACK_FAILED_MANUAL_RECOVERY_REQUIRED' });
});
test('env troca somente usuário/senha homolog, bind e uploads, preservando worker e credenciais 360', () => {
  const next = replaceEnvironment(environment, password);
  assert(next.includes(`mysql://reembolsa_homolog_app:${password}@127.0.0.1:3306/reembolsa_homolog`));
  assert(next.includes('APP_HOST=127.0.0.1')); assert(next.includes('WHATSAPP_POC_ENABLED=false'));
  assert(next.includes(`UPLOADS_DIR=${TARGET.uploads}`));
  for (const line of environment.split('\n').filter(line => line.startsWith('DIALOG_'))) assert(next.includes(line));
  assert.equal((replaceEnvironment(`${environment}APP_HOST=0.0.0.0\n`, password).match(/^APP_HOST=/gm) ?? []).length, 1);
});
test('uploads legado ou alvo dedicado é substituído uma única vez pelo alvo homolog fixo', () => {
  for (const legacy of ['uploads', `${TARGET.app}/uploads`, TARGET.uploads]) {
    const next = replaceEnvironment(`${environment}UPLOADS_DIR='${legacy}'\n`, password);
    assert.equal((next.match(/^UPLOADS_DIR=/gm) ?? []).length, 1);
    assert(next.includes(`UPLOADS_DIR=${TARGET.uploads}\n`));
  }
});
for (const [name, text] of [
  ['banco produção', environment.replace('/reembolsa_homolog', '/reembolsa')],
  ['host remoto', environment.replace('@localhost', '@attacker.example')],
  ['socket/opções override', environment.replace("/reembolsa_homolog'", "/reembolsa_homolog?user=root'")],
  ['porta diferente', environment.replace(':3306/', ':3307/')],
  ['URL duplicada', environment + environment],
  ['multiline', "OTHER='unterminated\n" + environment],
  ['export', environment.replace('DATABASE_URL=', 'export DATABASE_URL=')],
  ['conta nova existente', environment.replace('reembolsa_app:', 'reembolsa_homolog_app:')],
  ['uploads produção', environment + 'UPLOADS_DIR=/srv/reembolsa/prod/uploads\n'],
  ['uploads traversal', environment + 'UPLOADS_DIR=/srv/reembolsa/homolog/../prod/uploads\n'],
  ['uploads duplicado', environment + `UPLOADS_DIR=${TARGET.uploads}\nUPLOADS_DIR=${TARGET.uploads}\n`],
  ['uploads export', environment + `export UPLOADS_DIR=${TARGET.uploads}\n`],
]) test(`env recusa ${name}`, () => assert.throws(() => replaceEnvironment(text, password)));
test('DDL não contém permissões globais, GRANT OPTION ou comandos de produção', () => {
  const sql = createDatabaseSql(password);
  assert.equal((sql.match(/CREATE USER /g) ?? []).length, 2);
  assert.equal((sql.match(/GRANT SELECT, INSERT, UPDATE, DELETE ON `reembolsa_homolog`\.\*/g) ?? []).length, 2);
  assert(!/ALL PRIVILEGES|GRANT OPTION|DROP|REVOKE|ON \*\.\*|ON `reembolsa`/.test(sql));
  assert.throws(() => createDatabaseSql("'; DROP USER x;"));
});
test('drop-in restringe identidade e única pasta persistente gravável sem mudar ExecStart', () => {
  const dropin = renderDropin();
  assert(dropin.includes('User=reembolsa-homolog')); assert(dropin.includes('ProtectSystem=strict'));
  assert(dropin.includes(`ReadWritePaths=\nReadWritePaths=${TARGET.uploads}\n`));
  assert(!/ExecStart|DIALOG_360|WHATSAPP_POC_ENABLED/.test(dropin));
});
