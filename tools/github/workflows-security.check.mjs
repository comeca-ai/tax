import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const workflowDirectory = '.github/workflows';
const workflows = fs.readdirSync(workflowDirectory)
  .filter(file => file.endsWith('.yml'))
  .map(file => ({ file, source: fs.readFileSync(path.join(workflowDirectory, file), 'utf8') }));

test('actions externas usam SHA completo e permissões são explícitas', () => {
  for (const { file, source } of workflows) {
    assert.match(source, /^permissions:/m, `${file}: permissions ausente`);
    for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/gm)) {
      const reference = match[1];
      assert.match(reference, /@[0-9a-f]{40}$/, `${file}: action não fixada por SHA: ${reference}`);
    }
  }
});

test('workflows com credenciais 360dialog não executam automaticamente', () => {
  for (const { file, source } of workflows.filter(item => item.source.includes('DIALOG_360_'))) {
    assert.match(source, /^\s{2}workflow_dispatch:/m, `${file}: workflow_dispatch ausente`);
    assert.doesNotMatch(source, /^\s{2}(push|pull_request|schedule):/m,
      `${file}: credenciais não podem ser usadas por evento automático`);
    assert.match(source, /environment:\s*homologacao/, `${file}: environment homologacao ausente`);
    assert.match(source, /refs\/heads\/main/, `${file}: execução fora da main`);
  }
});

test('consulta da 360dialog não escreve no repositório', () => {
  const source = workflows.find(item => item.file === 'verificar-360dialog-readonly.yml')?.source ?? '';
  assert.doesNotMatch(source, /contents:\s*write/);
  assert.match(source, /contents:\s*read/);
  assert.match(source, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(source, /providerMutation:\s*false/);
  assert.match(source, /messageSent:\s*false/);
});

for (const [name, credentials, expectedCode] of [
  ['cadastro atual API_KEY e URL', { API_KEY: 'synthetic-api-key', URL_API_MENSAGENS: 'https://example.invalid' }, 0],
  ['nome legado sozinho não é aceito', { DIALOG_360_API_KEY: 'synthetic-legacy-key' }, 1],
  ['URL sem chave', { URL_API_MENSAGENS: 'https://example.invalid' }, 1],
]) test(`checagem real de presença: ${name}`, () => {
  const source = workflows.find(item => item.file === 'verificar-secrets-whatsapp.yml').source;
  const script = source.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\n\s*NODE/)[1];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whatsapp-presence-'));
  try {
    const summary = path.join(directory, 'summary.md');
    const result = spawnSync(process.execPath, ['--input-type=module'], {
      input: script, encoding: 'utf8',
      env: { GITHUB_STEP_SUMMARY: summary, ...credentials },
    });
    assert.equal(result.status, expectedCode);
    const output = fs.readFileSync(summary, 'utf8') + result.stdout + result.stderr;
    for (const value of Object.values(credentials)) assert(!output.includes(value));
    assert(output.includes('DIALOG_360_WEBHOOK_SECRET: ausente'));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('chave do canal tem um único nome no GitHub, sem fallback silencioso', () => {
  for (const file of ['configurar-whatsapp-homolog.yml', 'verificar-360dialog-readonly.yml']) {
    const source = workflows.find(item => item.file === file).source;
    assert.match(source, /DIALOG_360_API_KEY:\s*\$\{\{ secrets\.API_KEY \}\}/);
    assert.doesNotMatch(source, /secrets\.DIALOG_360_API_KEY/);
  }
});

test('artifact preserva comparação não verificada como null', () => {
  const source = workflows.find(item => item.file === 'verificar-360dialog-readonly.yml').source;
  const scripts = [...source.matchAll(/node --input-type=module <<'NODE'\n([\s\S]*?)\n\s*NODE/g)];
  const script = scripts.find(([, body]) => body.includes('const entries ='))[1];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whatsapp-report-'));
  try {
    const output = path.join(directory, 'output');
    fs.writeFileSync(output, 'apiKeyAccepted=true\nwebhookSecretConfigured=false\nauthorizationMatchesSecret=null\nrequests=[]\n');
    const result = spawnSync(process.execPath, ['--input-type=module'], {
      input: script, encoding: 'utf8', env: { GITHUB_OUTPUT: output },
    });
    assert.equal(result.status, 0);
    const entry = fs.readFileSync(output, 'utf8').split('\n').find(line => line.startsWith('report='));
    const report = JSON.parse(entry.slice('report='.length));
    assert.equal(report.apiKeyAccepted, true);
    assert.equal(report.webhookSecretConfigured, false);
    assert.equal(report.authorizationMatchesSecret, null);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
