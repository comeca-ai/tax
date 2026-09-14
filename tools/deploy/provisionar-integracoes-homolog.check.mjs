import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { validatePayload, prepareEnvironment, applyConfiguration, readPayload, TARGET } from './provisionar-integracoes-homolog-receiver.mjs';

const payload = { version: 1, DIALOG_360_API_KEY: 'synthetic-dialog-credential', GOOGLE_MAPS_API_KEY: 'synthetic-maps-credential', API_NFE_IO: 'synthetic-fiscal-credential' };
const environment = "DATABASE_URL='mysql://reembolsa_homolog_app:synthetic@127.0.0.1:3306/reembolsa_homolog'\nAPP_HOST=127.0.0.1\nSMTP_PASS='preserve-me'\nWHATSAPP_POC_ENABLED=false\n";

test('schema recusa campos de comando, campos ausentes e injeção', () => {
  assert.deepEqual(validatePayload(payload), payload);
  for (const next of [null, [], { ...payload, command: 'restart-prod' }, { ...payload, version: 2 }, { ...payload, API_NFE_IO: undefined },
    { ...payload, DIALOG_360_API_KEY: 'secret\nAPP_SECRET=override' }, { ...payload, GOOGLE_MAPS_API_KEY: "secret'$(id)" }]) assert.throws(() => validatePayload(next));
});
test('provisiona somente campos permitidos, preserva worker e gera segredo do receptor', () => {
  const result = prepareEnvironment(environment, payload, () => 'a'.repeat(64));
  assert(result.environment.includes("SMTP_PASS='preserve-me'"));
  assert(result.environment.includes('WHATSAPP_POC_ENABLED=false'));
  assert(result.environment.includes("POC_MAPS_ENABLED='true'"));
  assert(result.environment.includes("NFE_IO_ENABLED='false'"));
  assert.equal(result.webhookSecret, `Bearer ${'a'.repeat(64)}`);
  assert.equal((result.environment.match(/^DIALOG_360_API_KEY=/gm) ?? []).length, 1);
});
test('reaplicação preserva segredo, ativação fiscal existente e orçamento', () => {
  const existing = environment + "DIALOG_360_WEBHOOK_SECRET='Bearer existing-synthetic-secret'\nNFE_IO_ENABLED=true\nNFE_IO_BUDGET_ID=teste_20\n";
  const first = prepareEnvironment(existing, payload, () => { throw new Error('não deve gerar'); });
  assert.equal(first.webhookSecret, 'Bearer existing-synthetic-secret');
  assert(first.environment.includes('NFE_IO_ENABLED=true\nNFE_IO_BUDGET_ID=teste_20'));
  assert.equal(prepareEnvironment(first.environment, payload).environment, first.environment);
});
test('recusa ativação indireta de worker ao completar credenciais', async () => {
  assert.throws(() => prepareEnvironment(environment.replace('WHATSAPP_POC_ENABLED=false', 'WHATSAPP_POC_ENABLED=true'), payload), /WORKER_MUST_BE_DISABLED/);
  const io = fakeIO(); io.read = () => environment.replace('WHATSAPP_POC_ENABLED=false', 'WHATSAPP_POC_ENABLED=true');
  await assert.rejects(applyConfiguration(payload, io), /WORKER_MUST_BE_DISABLED/);
  assert.deepEqual(io.events, ['preflight']);
});
test('recusa banco compartilhado/produção, override, env ambíguo e bind público', () => {
  for (const bad of [environment.replace('reembolsa_homolog_app:', 'reembolsa_app:'), environment.replace('/reembolsa_homolog', '/reembolsa'),
    environment.replace("/reembolsa_homolog'", "/reembolsa_homolog?user=root'"), environment + 'APP_HOST=127.0.0.1\n',
    environment + 'export API_NFE_IO=secret\n', environment.replace('APP_HOST=127.0.0.1', 'APP_HOST=0.0.0.0'), environment + 'SMTP_PASS="multi\nline"\n']) assert.throws(() => prepareEnvironment(bad, payload));
});
function fakeIO(failSmoke = false, failRollback = false) {
  const events = []; let current = environment; let restarts = 0;
  return { events, current: () => current, preflight: async () => events.push('preflight'), read: () => current,
    backup: value => { assert.equal(value, environment); events.push('backup'); }, generate: () => 'b'.repeat(64),
    write: value => { current = value; events.push('write'); }, restart: () => { restarts++; events.push('restart'); if (failRollback && restarts === 2) throw new Error('raw confidential'); },
    smoke: async () => { events.push('smoke'); if (failSmoke) throw new Error('raw secret'); }, health: async () => events.push('health') };
}
test('aplicação faz backup antes de escrever e não chama provedores', async () => {
  const io = fakeIO(); const result = await applyConfiguration(payload, io);
  assert.deepEqual(io.events, ['preflight', 'backup', 'write', 'restart', 'smoke']);
  assert.equal(result.providerCalled, false); assert.equal(result.workerEnabledByScript, false); assert.equal(result.productionChanged, false);
});
test('falha de smoke restaura env e reinicia homologação', async () => {
  const io = fakeIO(true); await assert.rejects(applyConfiguration(payload, io), /APPLY_FAILED_CONFIGURATION_RESTORED/);
  assert.equal(io.current(), environment); assert.deepEqual(io.events.slice(-3), ['write', 'restart', 'health']);
});
test('falha de rollback distingue recuperação manual sem erro bruto', async () => {
  await assert.rejects(applyConfiguration(payload, fakeIO(true, true)), { message: 'APPLY_FAILED_ROLLBACK_FAILED_MANUAL_RECOVERY_REQUIRED' });
});
test('preflight falho e payload inválido não escrevem nem fazem backup', async () => {
  const io = fakeIO(); io.preflight = async () => { throw new Error('preflight'); };
  await assert.rejects(applyConfiguration(payload, io)); assert.deepEqual(io.events, []);
  await assert.rejects(applyConfiguration({ ...payload, extra: true }, fakeIO()));
});
test('stdin limita volume antes de parsear', async () => {
  assert.deepEqual(await readPayload(Readable.from([Buffer.from(JSON.stringify(payload))])), payload);
  await assert.rejects(readPayload(Readable.from([Buffer.alloc(15001)])), /INPUT_TOO_LARGE/);
});
test('CLI falha sem reproduzir payload ou segredo', () => {
  const out = spawnSync(process.execPath, ['tools/deploy/provisionar-integracoes-homolog-receiver.mjs'], { input: '{"secret":"synthetic-do-not-print"}', encoding: 'utf8' });
  assert.notEqual(out.status, 0); assert.equal(out.stdout, ''); assert(!out.stderr.includes('synthetic-do-not-print'));
});
test('sender recusa execução fora de Actions sem exibir credenciais', () => {
  const out = spawnSync(process.execPath, ['tools/deploy/provisionar-integracoes-homolog-send.mjs'], { encoding: 'utf8', env: { PATH: process.env.PATH, DIALOG_360_API_KEY: 'synthetic-do-not-print' } });
  assert.notEqual(out.status, 0); assert(!out.stderr.includes('synthetic-do-not-print'));
});
test('alvos, lock compartilhado e nomes GitHub são fixos', () => {
  assert.equal(TARGET.environment, '/etc/reembolsa/homolog.env'); assert.equal(TARGET.service, 'reembolsa-homolog.service');
  const wrapper = fs.readFileSync('tools/deploy/provisionar-integracoes-homolog-command.sh', 'utf8');
  assert(wrapper.includes('/etc/reembolsa/.homolog-isolation.lock')); assert(wrapper.includes('test "$#" -eq 0'));
  const workflow = fs.readFileSync('.github/workflows/provisionar-integracoes-homolog.yml', 'utf8');
  for (const key of ['API_KEY', 'API_GOOGLE_MAPS', 'API_NFE_IO']) assert(workflow.includes(`secrets.${key} }}`));
  assert(!workflow.includes('upload-artifact'));
});
