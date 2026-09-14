// Instalar somente após revisão, fora da árvore gravável pela aplicação.
// Não aceita caminhos, serviços, comandos ou código pelo protocolo SSH.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const TARGET = Object.freeze({
  directory: '/etc/reembolsa-whatsapp-homolog',
  file: '/etc/reembolsa-whatsapp-homolog/secrets.env',
  service: 'reembolsa-homolog.service',
  workingDirectory: '/srv/reembolsa/homolog/app',
  origin: 'http://127.0.0.1:3101',
});
const KEYS = ['DIALOG_360_API_KEY', 'DIALOG_360_WEBHOOK_SECRET'];

export class SafeError extends Error {}
function requireSafe(condition, code) {
  if (!condition) throw new SafeError(code);
}

export function validatePayload(payload) {
  requireSafe(payload && typeof payload === 'object' && !Array.isArray(payload), 'INVALID_PAYLOAD');
  requireSafe(Object.keys(payload).sort().join(',') === [...KEYS, 'version'].sort().join(','), 'INVALID_FIELDS');
  requireSafe(payload.version === 1, 'INVALID_VERSION');
  for (const key of KEYS) {
    const value = payload[key];
    // Conjunto deliberadamente restrito, sem aspas, escapes ou quebras de linha.
    // Espaço interno permite o Authorization literal "Bearer ...".
    requireSafe(typeof value === 'string' && value.length >= 16 && value.length <= 4096
      && value === value.trim() && /^[A-Za-z0-9._~+/= :\-]+$/.test(value), 'INVALID_CREDENTIAL');
  }
  requireSafe(!payload.DIALOG_360_API_KEY.includes(' '), 'INVALID_API_KEY');
  requireSafe(payload.DIALOG_360_API_KEY !== payload.DIALOG_360_WEBHOOK_SECRET, 'CREDENTIALS_MUST_DIFFER');
  return payload;
}

export function renderEnvironment(payload) {
  validatePayload(payload);
  return KEYS.map(key => `${key}='${payload[key]}'\n`).join('');
}

// Injeção de dependências apenas para testes; a CLI usa os alvos fixos acima.
export async function applyConfiguration(payload, io) {
  const next = renderEnvironment(payload);
  await io.preflight();
  const previous = io.read();
  io.backup(previous);
  try {
    io.write(next);
    io.restart();
    await io.smoke(payload.DIALOG_360_WEBHOOK_SECRET);
  } catch {
    try {
      io.write(previous);
      io.restart();
      await io.health();
    } catch {
      throw new SafeError('APPLY_FAILED_ROLLBACK_FAILED_MANUAL_RECOVERY_REQUIRED');
    }
    throw new SafeError('APPLY_FAILED_CONFIGURATION_RESTORED');
  }
  return { configurationApplied: true, localAuthenticationChecked: true,
    providerCalled: false, persistenceChecked: false, productionChanged: false };
}

function systemctl(...args) {
  return execFileSync('/usr/bin/systemctl', args, {
    encoding: 'utf8', timeout: 45000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C' },
  }).trim();
}

function securePath(file, directory = false) {
  const stat = fs.lstatSync(file);
  requireSafe(!stat.isSymbolicLink() && (directory ? stat.isDirectory() : stat.isFile())
    && stat.uid === 0 && (stat.mode & 0o077) === 0 && (directory || stat.nlink === 1), 'UNSAFE_CONFIG_PATH');
}

function atomicWrite(contents) {
  const temporary = path.join(TARGET.directory, `.pending-${randomUUID()}`);
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, contents); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, TARGET.file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

async function request(route, options) {
  const response = await fetch(TARGET.origin + route, {
    ...options, redirect: 'error', signal: AbortSignal.timeout(3000),
  });
  await response.body?.cancel();
  return response.status;
}

async function health() {
  for (let attempt = 0; attempt < 15; attempt++) {
    try { if (await request('/api/health') === 200) return; } catch { /* reiniciando */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new SafeError('HEALTH_CHECK_FAILED');
}

function runtimeIO() {
  return {
    async preflight() {
      requireSafe(process.getuid() === 0, 'ROOT_REQUIRED');
      for (const parent of ['/etc']) {
        const stat = fs.lstatSync(parent);
        requireSafe(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === 0
          && (stat.mode & 0o022) === 0, 'UNSAFE_PARENT_DIRECTORY');
      }
      securePath(TARGET.directory, true);
      securePath(TARGET.file);
      requireSafe(systemctl('show', TARGET.service, '-p', 'WorkingDirectory', '--value')
        === TARGET.workingDirectory, 'WRONG_SERVICE_DIRECTORY');
      const files = systemctl('show', TARGET.service, '-p', 'EnvironmentFiles', '--value');
      requireSafe(files.endsWith(`${TARGET.file} (ignore_errors=no)`), 'MISSING_FINAL_ENVIRONMENT_FILE');
      await health();
    },
    read: () => fs.readFileSync(TARGET.file, 'utf8'),
    backup: previous => fs.writeFileSync(path.join(TARGET.directory,
      `previous-${Date.now()}-${randomUUID()}.env`), previous, { flag: 'wx', mode: 0o600 }),
    write: atomicWrite,
    restart: () => systemctl('restart', TARGET.service),
    health,
    async smoke(secret) {
      await health();
      const route = '/api/webhooks/360dialog';
      const post = authorization => ({ method: 'POST', body: '{}',
        headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) } });
      requireSafe(await request(route, post()) === 403, 'UNAUTHENTICATED_REQUEST_ACCEPTED');
      requireSafe(await request(route, post(`${secret}-invalid`)) === 403, 'WRONG_SECRET_ACCEPTED');
      requireSafe(await request(route, post(secret)) === 200, 'VALID_SECRET_REJECTED');
      // Corpo vazio: não cria evento/recibo nem abre conexão de persistência.
    },
  };
}

async function readPayload(stream) {
  const chunks = [];
  let size = 0;
  const timer = setTimeout(() => stream.destroy(new SafeError('INPUT_TIMEOUT')), 10000);
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      requireSafe(size <= 10000, 'INPUT_TOO_LARGE');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { clearTimeout(timer); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    requireSafe(process.argv.length === 2, 'ARGUMENTS_NOT_ALLOWED');
    const result = await applyConfiguration(await readPayload(process.stdin), runtimeIO());
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    // Nunca imprimir stack, stderr de subprocesso, payload ou configuração.
    process.stderr.write((error instanceof SafeError ? error.message : 'CONFIGURATION_FAILED') + '\n');
    process.exitCode = 1;
  }
}
