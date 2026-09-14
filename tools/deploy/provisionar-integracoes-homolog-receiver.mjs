// Instalar root:root fora do checkout; stdin aceita apenas credenciais conhecidas.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const TARGET = Object.freeze({
  environment: '/etc/reembolsa/homolog.env',
  backups: '/etc/reembolsa/integracoes-homolog-backups',
  service: 'reembolsa-homolog.service',
  app: '/srv/reembolsa/homolog/app',
  user: 'reembolsa-homolog',
  origin: 'http://127.0.0.1:3101',
});
const KEYS = ['DIALOG_360_API_KEY', 'GOOGLE_MAPS_API_KEY', 'API_NFE_IO'];
export class SafeError extends Error {}
function ensure(ok, code) { if (!ok) throw new SafeError(code); }

export function validatePayload(payload) {
  ensure(payload && typeof payload === 'object' && !Array.isArray(payload), 'INVALID_PAYLOAD');
  ensure(Object.keys(payload).sort().join(',') === [...KEYS, 'version'].sort().join(','), 'INVALID_FIELDS');
  ensure(payload.version === 1, 'INVALID_VERSION');
  for (const key of KEYS) ensure(typeof payload[key] === 'string' && /^[A-Za-z0-9._~+/=:-]{16,4096}$/.test(payload[key]), 'INVALID_CREDENTIAL');
  return payload;
}

export function prepareEnvironment(previous, payload, generate = () => randomBytes(32).toString('hex')) {
  validatePayload(payload);
  ensure(typeof previous === 'string' && previous.length < 1_000_000 && !previous.includes('\0'), 'INVALID_ENVIRONMENT');
  const lines = previous.split(/\r?\n/); const entries = new Map();
  for (const [i, line] of lines.entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^"'\r\n]*))$/.exec(line);
    ensure(match && !line.endsWith('\\'), 'UNSUPPORTED_ENVIRONMENT');
    ensure(!entries.has(match[1]), 'DUPLICATE_ENVIRONMENT_KEY');
    entries.set(match[1], { i, value: match[2] ?? match[3] ?? match[4] });
  }
  let database;
  try { database = new URL(entries.get('DATABASE_URL')?.value); } catch { throw new SafeError('INVALID_DATABASE_URL'); }
  ensure(database.protocol === 'mysql:' && database.hostname === '127.0.0.1' && (!database.port || database.port === '3306') &&
    database.username === 'reembolsa_homolog_app' && database.pathname === '/reembolsa_homolog' && !database.search && !database.hash, 'DATABASE_NOT_ISOLATED');
  ensure(entries.get('APP_HOST')?.value === '127.0.0.1', 'APP_NOT_LOOPBACK');
  // Preencher credenciais pode tornar um worker já habilitado operacional no restart.
  ensure(entries.get('WHATSAPP_POC_ENABLED')?.value !== 'true', 'WORKER_MUST_BE_DISABLED');
  let webhookSecret = entries.get('DIALOG_360_WEBHOOK_SECRET')?.value;
  if (!webhookSecret) {
    const generated = generate(); ensure(/^[a-f0-9]{64}$/.test(generated), 'INVALID_GENERATED_SECRET');
    webhookSecret = `Bearer ${generated}`;
  }
  ensure(/^[A-Za-z0-9._~+/= :\-]{16,4096}$/.test(webhookSecret) && webhookSecret === webhookSecret.trim(), 'INVALID_WEBHOOK_SECRET');
  ensure(webhookSecret !== payload.DIALOG_360_API_KEY, 'CREDENTIALS_MUST_DIFFER');
  const updates = { ...Object.fromEntries(KEYS.map(key => [key, payload[key]])), DIALOG_360_WEBHOOK_SECRET: webhookSecret,
    POC_MAPS_ENABLED: 'true' };
  // O orçamento e a ativação fiscal pertencem a uma etapa separada. Não desativa configuração existente.
  if (!entries.get('NFE_IO_ENABLED')?.value) updates.NFE_IO_ENABLED = 'false';
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}='${value}'`;
    if (entries.has(key)) lines[entries.get(key).i] = line; else lines.push(line);
  }
  return { environment: `${lines.join('\n').replace(/\n+$/, '')}\n`, webhookSecret };
}

export async function applyConfiguration(payload, io) {
  validatePayload(payload);
  await io.preflight();
  const previous = io.read();
  const next = prepareEnvironment(previous, payload, io.generate);
  io.backup(previous);
  try { io.write(next.environment); io.restart(); await io.smoke(next.webhookSecret); }
  catch {
    try { io.write(previous); io.restart(); await io.health(); }
    catch { throw new SafeError('APPLY_FAILED_ROLLBACK_FAILED_MANUAL_RECOVERY_REQUIRED'); }
    throw new SafeError('APPLY_FAILED_CONFIGURATION_RESTORED');
  }
  return { configurationApplied: true, localAuthenticationChecked: true, providerCalled: false,
    messageSent: false, workerEnabledByScript: false, productionChanged: false };
}

function systemctl(...args) {
  return execFileSync('/usr/bin/systemctl', args, { encoding: 'utf8', timeout: 45000,
    stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C' } }).trim();
}
function securePath(file, directory = false, privatePath = false) {
  const st = fs.lstatSync(file);
  ensure(!st.isSymbolicLink() && (directory ? st.isDirectory() : st.isFile()) && st.uid === 0 &&
    !(st.mode & 0o022) && (!privatePath || !(st.mode & 0o077)) && (directory || st.nlink === 1), 'UNSAFE_PATH');
}
function atomicWrite(contents) {
  securePath('/etc', true); securePath('/etc/reembolsa', true); securePath(TARGET.environment, false, true);
  const temporary = `/etc/reembolsa/.integracoes-${randomUUID()}`;
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, contents); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, TARGET.environment);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
async function request(route, options) {
  const response = await fetch(TARGET.origin + route, { ...options, redirect: 'error', signal: AbortSignal.timeout(3000) });
  await response.body?.cancel(); return response.status;
}
async function health() {
  for (let i = 0; i < 15; i++) {
    try { if (await request('/api/health') === 200) return; } catch { /* aguarda reinício */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new SafeError('HEALTH_CHECK_FAILED');
}
function runtimeIO() {
  return {
    async preflight() {
      ensure(process.getuid() === 0, 'ROOT_REQUIRED');
      securePath('/etc', true); securePath('/etc/reembolsa', true);
      securePath(TARGET.environment, false, true); securePath(TARGET.backups, true, true);
      ensure(systemctl('show', TARGET.service, '-p', 'WorkingDirectory', '--value') === TARGET.app, 'WRONG_SERVICE_DIRECTORY');
      ensure(systemctl('show', TARGET.service, '-p', 'User', '--value') === TARGET.user, 'SERVICE_NOT_ISOLATED');
      ensure(systemctl('show', TARGET.service, '-p', 'EnvironmentFiles', '--value') === `${TARGET.environment} (ignore_errors=no)`, 'UNEXPECTED_ENVIRONMENT_FILES');
      await health();
    },
    read: () => fs.readFileSync(TARGET.environment, 'utf8'),
    backup: previous => fs.writeFileSync(path.join(TARGET.backups, `previous-${Date.now()}-${randomUUID()}.env`), previous, { flag: 'wx', mode: 0o600 }),
    write: atomicWrite,
    restart: () => systemctl('restart', TARGET.service),
    health,
    async smoke(secret) {
      await health();
      const post = authorization => ({ method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) } });
      ensure(await request('/api/webhooks/360dialog', post()) === 403, 'UNAUTHENTICATED_REQUEST_ACCEPTED');
      ensure(await request('/api/webhooks/360dialog', post(`${secret}-invalid`)) === 403, 'WRONG_SECRET_ACCEPTED');
      ensure(await request('/api/webhooks/360dialog', post(secret)) === 200, 'VALID_SECRET_REJECTED');
    },
  };
}
export async function readPayload(stream) {
  let size = 0; const chunks = [];
  const timer = setTimeout(() => stream.destroy(new SafeError('INPUT_TIMEOUT')), 10000);
  try {
    for await (const chunk of stream) { size += chunk.length; ensure(size <= 15000, 'INPUT_TOO_LARGE'); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { clearTimeout(timer); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    ensure(process.argv.length === 2, 'ARGUMENTS_NOT_ALLOWED');
    process.stdout.write(JSON.stringify(await applyConfiguration(await readPayload(process.stdin), runtimeIO())) + '\n');
  } catch (error) {
    process.stderr.write((error instanceof SafeError ? error.message : 'CONFIGURATION_FAILED') + '\n'); process.exitCode = 1;
  }
}
