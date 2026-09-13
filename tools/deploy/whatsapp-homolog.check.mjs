import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { applyConfiguration, validatePayload, renderEnvironment, TARGET } from './whatsapp-homolog-receiver.mjs';

const payload = () => ({ version: 1, DIALOG_360_API_KEY: 'synthetic-api-key-123456789',
  DIALOG_360_WEBHOOK_SECRET: 'Bearer synthetic-webhook-987654321' });

function adapter(fail = {}) {
  const calls = [];
  let contents = 'PREVIOUS=synthetic\n';
  let restarts = 0;
  return { calls, contents: () => contents, io: {
    preflight: async () => { calls.push('preflight'); if (fail.preflight) throw new Error('private-error'); },
    read: () => { calls.push('read'); return contents; },
    backup: () => { calls.push('backup'); if (fail.backup) throw new Error('private-error'); },
    write: value => { calls.push('write'); if (fail.write) throw new Error('private-error'); contents = value; },
    restart: () => { calls.push('restart'); restarts++; if (fail.restart && restarts === 1) throw new Error('private-error'); },
    smoke: async secret => { calls.push('smoke'); assert.equal(secret, payload().DIALOG_360_WEBHOOK_SECRET); if (fail.smoke) throw new Error('private-error'); },
    health: async () => { calls.push('health'); if (fail.health) throw new Error('private-error'); },
  } };
}

test('renderiza somente as duas variáveis, preservando Authorization literal', () => {
  assert.equal(renderEnvironment(payload()),
    "DIALOG_360_API_KEY='synthetic-api-key-123456789'\nDIALOG_360_WEBHOOK_SECRET='Bearer synthetic-webhook-987654321'\n");
});

for (const [name, invalid] of [
  ['null', null], ['array', []], ['versão', { ...payload(), version: 2 }],
  ['caminho remoto', { ...payload(), path: '/etc/reembolsa/app.env' }],
  ['serviço remoto', { ...payload(), service: 'reembolsa.service' }],
  ['ausente', { version: 1 }],
  ['vazio', { ...payload(), DIALOG_360_API_KEY: '' }],
  ['espaço externo', { ...payload(), DIALOG_360_WEBHOOK_SECRET: ' synthetic-webhook-secret ' }],
  ['espaço API', { ...payload(), DIALOG_360_API_KEY: 'synthetic api key with spaces' }],
  ['newline', { ...payload(), DIALOG_360_WEBHOOK_SECRET: 'synthetic-webhook-secret\nPORT=3100' }],
  ['NUL', { ...payload(), DIALOG_360_WEBHOOK_SECRET: 'synthetic-webhook-secret\0' }],
  ['aspas', { ...payload(), DIALOG_360_WEBHOOK_SECRET: "synthetic-webhook-secret'" }],
  ['escape', { ...payload(), DIALOG_360_WEBHOOK_SECRET: 'synthetic-webhook-secret\\' }],
  ['interpolação', { ...payload(), DIALOG_360_WEBHOOK_SECRET: 'synthetic-webhook-$(command)' }],
  ['comprimento', { ...payload(), DIALOG_360_WEBHOOK_SECRET: 'a'.repeat(4097) }],
  ['iguais', { ...payload(), DIALOG_360_WEBHOOK_SECRET: payload().DIALOG_360_API_KEY }],
]) {
  test(`recusa ${name} antes de I/O`, async () => {
    const state = adapter();
    await assert.rejects(applyConfiguration(invalid, state.io));
    assert.deepEqual(state.calls, []);
  });
}

test('aplica, faz backup antes da escrita e não declara aceite E2E', async () => {
  const state = adapter();
  assert.deepEqual(await applyConfiguration(payload(), state.io), {
    configurationApplied: true, localAuthenticationChecked: true,
    providerCalled: false, persistenceChecked: false, productionChanged: false,
  });
  assert.equal(state.contents(), renderEnvironment(payload()));
  assert.deepEqual(state.calls, ['preflight', 'read', 'backup', 'write', 'restart', 'smoke']);
});

for (const failure of ['smoke', 'restart']) {
  test(`reverte configuração quando ${failure} falha`, async () => {
    const state = adapter({ [failure]: true });
    await assert.rejects(applyConfiguration(payload(), state.io), { message: 'APPLY_FAILED_CONFIGURATION_RESTORED' });
    assert.equal(state.contents(), 'PREVIOUS=synthetic\n');
    assert.deepEqual(state.calls.slice(-3), ['write', 'restart', 'health']);
  });
}

test('falha de rollback exige recuperação, sem erro interno ou segredo', async () => {
  const state = adapter({ smoke: true, health: true });
  await assert.rejects(applyConfiguration(payload(), state.io), {
    message: 'APPLY_FAILED_ROLLBACK_FAILED_MANUAL_RECOVERY_REQUIRED',
  });
});

for (const failure of ['preflight', 'backup']) {
  test(`falha de ${failure} não escreve nem reinicia`, async () => {
    const state = adapter({ [failure]: true });
    await assert.rejects(applyConfiguration(payload(), state.io));
    assert(!state.calls.includes('write'));
    assert(!state.calls.includes('restart'));
  });
}

test('falha de escrita e restauração é reportada como recuperação manual', async () => {
  const state = adapter({ write: true });
  await assert.rejects(applyConfiguration(payload(), state.io), {
    message: 'APPLY_FAILED_ROLLBACK_FAILED_MANUAL_RECOVERY_REQUIRED',
  });
});

test('CLI do receptor recusa input inválido sem imprimir entrada/stack', () => {
  const result = spawnSync(process.execPath, ['tools/deploy/whatsapp-homolog-receiver.mjs'], {
    input: JSON.stringify({ ...payload(), command: 'unexpected' }), encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'INVALID_FIELDS\n');
});

test('CLI do receptor limita bytes sem imprimir entrada', () => {
  const result = spawnSync(process.execPath, ['tools/deploy/whatsapp-homolog-receiver.mjs'], {
    input: 's'.repeat(10001), encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'INPUT_TOO_LARGE\n');
});

test('CLI do receptor não aceita argumentos mesmo com payload válido', () => {
  const result = spawnSync(process.execPath, ['tools/deploy/whatsapp-homolog-receiver.mjs', '/some/path'], {
    input: JSON.stringify(payload()), encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'ARGUMENTS_NOT_ALLOWED\n');
});

test('CLI do envio recusa execução fora do Actions antes de rede/arquivos', () => {
  const result = spawnSync(process.execPath, ['tools/deploy/whatsapp-homolog-send.mjs'], {
    env: { PATH: process.env.PATH, ...payload(), GITHUB_ACTIONS: 'false' }, encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert(!result.stderr.includes(payload().DIALOG_360_API_KEY));
  assert(!result.stderr.includes(payload().DIALOG_360_WEBHOOK_SECRET));
});

for (const [name, overrides] of [
  ['outro repositório', { GITHUB_REPOSITORY: 'another/repository' }],
  ['branch de trabalho', { GITHUB_REF: 'refs/heads/docs/360dialog-canal-unico' }],
  ['sem confirmação', { CONFIRM_HOMOLOG: 'false' }],
  ['sem host key', { HOMOLOG_SSH_KNOWN_HOSTS: '' }],
  ['host como opção SSH', { HOMOLOG_SSH_HOST: '-oProxyCommand=unexpected' }],
  ['porta inválida', { HOMOLOG_SSH_PORT: '65536' }],
]) {
  test(`emissor recusa ${name} sem transmitir credenciais`, () => {
    const result = spawnSync(process.execPath, ['tools/deploy/whatsapp-homolog-send.mjs'], {
      env: { PATH: process.env.PATH, ...payload(), GITHUB_ACTIONS: 'true',
        GITHUB_REPOSITORY: 'comeca-ai/projeto_tribureembolsa', GITHUB_REF: 'refs/heads/main',
        CONFIRM_HOMOLOG: 'true', HOMOLOG_SSH_HOST: 'invalid.example',
        HOMOLOG_SSH_PRIVATE_KEY: 'synthetic-private-key',
        HOMOLOG_SSH_KNOWN_HOSTS: 'synthetic-known-hosts', ...overrides }, encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert(!result.stderr.includes(payload().DIALOG_360_API_KEY));
    assert(!result.stderr.includes(payload().DIALOG_360_WEBHOOK_SECRET));
  });
}

test('destinos reais são constantes de homologação; wrapper não recebe argumentos', () => {
  assert.equal(TARGET.service, 'reembolsa-homolog.service');
  assert.equal(TARGET.origin, 'http://127.0.0.1:3101');
  assert(Object.isFrozen(TARGET));
  const wrapper = fs.readFileSync('tools/deploy/whatsapp-homolog-command.sh', 'utf8');
  assert(wrapper.includes('test "$#" -eq 0'));
  assert(wrapper.includes('/usr/bin/flock --nonblock'));
  assert(wrapper.includes('/usr/bin/env -i'));
  const source = fs.readFileSync('tools/deploy/whatsapp-homolog-send.mjs', 'utf8');
  assert(source.includes('StrictHostKeyChecking=yes'));
  assert(!source.includes('StrictHostKeyChecking=no'));
  assert(!source.includes('shell: true'));
  assert(!source.includes('ssh-keyscan'));
  assert.equal(validatePayload(payload()).version, 1);
});
