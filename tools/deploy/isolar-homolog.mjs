/** One-shot local, nunca chamado por Actions. O padrão não altera estado. */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const TARGET = Object.freeze({
  service: 'reembolsa-homolog.service', productionService: 'reembolsa.service',
  user: 'reembolsa-homolog', databaseUser: 'reembolsa_homolog_app', database: 'reembolsa_homolog',
  app: '/srv/reembolsa/homolog/app', uploads: '/srv/reembolsa/homolog/uploads',
  environment: '/etc/reembolsa/homolog.env',
  dropin: '/etc/systemd/system/reembolsa-homolog.service.d/90-isolation.conf',
  backups: '/var/backups/reembolsa-homolog/isolation',
  health: 'http://127.0.0.1:3101/api/health',
  lock: '/etc/reembolsa/.homolog-isolation.lock',
});
export class IsolationError extends Error {}
function ensure(ok, code) { if (!ok) throw new IsolationError(code); }

export function parseArguments(args) {
  ensure(args.length <= 1 && (!args.length || ['--preflight', '--apply', '--help'].includes(args[0])), 'INVALID_ARGUMENTS');
  return args[0] ?? '--preflight';
}

/** Recusa sintaxe ambígua/multilinha nas três variáveis que será necessário trocar. */
export function replaceEnvironment(previous, password) {
  ensure(/^[a-f0-9]{64}$/.test(password), 'INVALID_GENERATED_PASSWORD');
  ensure(typeof previous === 'string' && !previous.includes('\0') && previous.length < 1_000_000, 'INVALID_ENVIRONMENT');
  const lines = previous.split(/\r?\n/); const found = new Map();
  for (const [i, line] of lines.entries()) {
    if (line.trim() && !line.trimStart().startsWith('#')) {
      ensure(/^[A-Z][A-Z0-9_]*=(?:"[^"\r\n]*"|'[^'\r\n]*'|[^"'\r\n]*)$/.test(line) && !line.endsWith('\\'), 'MULTILINE_OR_UNSUPPORTED_ENVIRONMENT');
    }
    const match = /^(DATABASE_URL|APP_HOST|UPLOADS_DIR)=(.*)$/.exec(line);
    if (!match) {
      ensure(!/^\s*(?:export\s+)?(?:DATABASE_URL|APP_HOST|UPLOADS_DIR)\s*=/.test(line), 'AMBIGUOUS_ENVIRONMENT');
      continue;
    }
    ensure(!found.has(match[1]), 'DUPLICATE_ENVIRONMENT_KEY');
    let value = match[2];
    if (value.startsWith('"') || value.startsWith("'")) {
      ensure(value.at(-1) === value[0], 'INVALID_ENVIRONMENT_QUOTE'); value = value.slice(1, -1);
    }
    ensure(!/[\s'"\\$`]/.test(value), 'UNSUPPORTED_ENVIRONMENT_VALUE');
    found.set(match[1], { i, value });
  }
  ensure(found.has('DATABASE_URL'), 'DATABASE_URL_MISSING');
  if (found.has('UPLOADS_DIR')) ensure([TARGET.uploads, `${TARGET.app}/uploads`, 'uploads'].includes(found.get('UPLOADS_DIR').value), 'UNEXPECTED_UPLOADS_TARGET');
  let database;
  try { database = new URL(found.get('DATABASE_URL').value); } catch { throw new IsolationError('INVALID_DATABASE_URL'); }
  ensure(database.protocol === 'mysql:' && ['127.0.0.1', 'localhost'].includes(database.hostname) &&
    (!database.port || database.port === '3306') && !database.search && !database.hash && database.pathname === `/${TARGET.database}` && database.username === 'reembolsa_app', 'UNEXPECTED_DATABASE_TARGET');
  // mysql2 usa TCP explícito; nunca reutiliza o usuário de produção.
  database.hostname = '127.0.0.1'; database.username = TARGET.databaseUser; database.password = password;
  lines[found.get('DATABASE_URL').i] = `DATABASE_URL='${database.href}'`;
  if (found.has('APP_HOST')) lines[found.get('APP_HOST').i] = 'APP_HOST=127.0.0.1';
  else lines.push('APP_HOST=127.0.0.1');
  if (found.has('UPLOADS_DIR')) lines[found.get('UPLOADS_DIR').i] = `UPLOADS_DIR=${TARGET.uploads}`;
  else lines.push(`UPLOADS_DIR=${TARGET.uploads}`);
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

export function renderDropin() {
  return `[Service]\nUser=${TARGET.user}\nGroup=${TARGET.user}\nSupplementaryGroups=\nUMask=0077\nNoNewPrivileges=true\nProtectSystem=strict\nProtectHome=true\nPrivateTmp=true\nPrivateDevices=true\nRestrictSUIDSGID=true\nCapabilityBoundingSet=\nReadWritePaths=\nReadWritePaths=${TARGET.uploads}\nReadOnlyPaths=${TARGET.app}\n`;
}

export function createDatabaseSql(password) {
  ensure(/^[a-f0-9]{64}$/.test(password), 'INVALID_GENERATED_PASSWORD');
  return ['127.0.0.1', 'localhost'].map(host =>
    `CREATE USER '${TARGET.databaseUser}'@'${host}' IDENTIFIED BY '${password}';\nGRANT SELECT, INSERT, UPDATE, DELETE ON \`${TARGET.database}\`.* TO '${TARGET.databaseUser}'@'${host}';`).join('\n');
}

/** Máquina de aplicação testável sem executar sistema operacional nem MariaDB. */
export async function isolateHomolog(mode, io) {
  ensure(['--preflight', '--apply'].includes(mode), 'INVALID_MODE');
  await io.preflight();
  if (mode !== '--apply') return { preflightPassed: true, changesApplied: false, target: TARGET.service };
  const backup = await io.backup();
  try {
    await io.createAccounts();
    await io.prepareUploads();
    await io.installConfiguration();
    await io.restartHomolog();
    await io.postcheck();
  } catch {
    try { await io.restoreConfiguration(backup); await io.restartHomolog(); await io.checkRestored(); }
    catch { throw new IsolationError('APPLY_FAILED_ROLLBACK_FAILED_MANUAL_RECOVERY_REQUIRED'); }
    throw new IsolationError('APPLY_FAILED_CONFIG_RESTORED_ACCOUNTS_REQUIRE_MANUAL_REVIEW');
  }
  return { preflightPassed: true, changesApplied: true, target: TARGET.service,
    productionChanged: false, workerEnabledByScript: false, databaseDdlRollbackSupported: false };
}

function command(file, args, input) {
  return execFileSync(file, args, { input, encoding: 'utf8', timeout: 45000,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C' } }).trim();
}
function serviceProperty(service, property) { return command('/usr/bin/systemctl', ['show', service, '-p', property, '--value']); }
function mariadb(sql) {
  return command('/usr/bin/mariadb', ['--no-defaults', '--protocol=socket', '--socket=/run/mysqld/mysqld.sock', '--user=root', '--batch', '--skip-column-names'], sql);
}
function rootPath(file, directory = false, privateFile = false) {
  const st = fs.lstatSync(file);
  ensure(!st.isSymbolicLink() && (directory ? st.isDirectory() : st.isFile()) && st.uid === 0 &&
    !(st.mode & 0o022) && (!privateFile || !(st.mode & 0o007)) && (directory || st.nlink === 1), 'UNSAFE_PATH');
  return st;
}
function assertParents(file) {
  let dir = path.dirname(file);
  while (dir !== '/') { rootPath(dir, true); dir = path.dirname(dir); }
}
function createRootDirectory(dir, mode) {
  const parent = path.dirname(dir);
  if (!fs.existsSync(parent)) createRootDirectory(parent, 0o700);
  rootPath(parent, true);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { mode });
  const st = rootPath(dir, true); ensure((st.mode & 0o077) === (mode & 0o077), 'UNEXPECTED_DIRECTORY_MODE');
}
function atomicWrite(file, contents, mode = 0o600) {
  assertParents(file);
  if (fs.existsSync(file)) rootPath(file);
  const temporary = path.join(path.dirname(file), `.isolation-${randomUUID()}`);
  try {
    const fd = fs.openSync(temporary, 'wx', mode);
    try { fs.writeFileSync(fd, contents); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
async function health() {
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const response = await fetch(TARGET.health, { redirect: 'error', signal: AbortSignal.timeout(2000) });
      await response.body?.cancel(); if (response.status === 200) return;
    } catch { /* reinício em andamento */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new IsolationError('HOMOLOG_HEALTH_FAILED');
}

function runtimeIO() {
  let previous, next, originalMode, productionPid, originalHomologPid, backupPath, previousUploads = null;
  let newPassword;
  return {
    async preflight() {
      ensure(process.getuid?.() === 0, 'ROOT_REQUIRED');
      for (const executable of ['/usr/bin/systemctl', '/usr/bin/mariadb', '/usr/sbin/useradd', '/usr/sbin/runuser', '/usr/bin/getent', '/usr/bin/ss', '/usr/bin/id', '/usr/bin/test']) rootPath(executable);
      assertParents(TARGET.environment); const envStat = rootPath(TARGET.environment, false, true); originalMode = envStat.mode & 0o777;
      assertParents(TARGET.uploads);
      ensure(!fs.existsSync(TARGET.dropin), 'ISOLATION_DROPIN_ALREADY_EXISTS');
      ensure(serviceProperty(TARGET.service, 'WorkingDirectory') === TARGET.app && serviceProperty(TARGET.service, 'User') === 'reembolsa' && serviceProperty(TARGET.service, 'Group') === 'reembolsa', 'UNEXPECTED_HOMOLOG_SERVICE');
      ensure(serviceProperty(TARGET.service, 'EnvironmentFiles') === `${TARGET.environment} (ignore_errors=no)`, 'UNEXPECTED_ENVIRONMENT_FILES');
      for (const property of ['StateDirectory', 'CacheDirectory', 'LogsDirectory', 'RuntimeDirectory', 'BindPaths', 'RootDirectory', 'RootImage'])
        ensure(serviceProperty(TARGET.service, property) === '', 'REVIEW_ADDITIONAL_WRITABLE_OR_ROOT_PATHS');
      ensure(serviceProperty(TARGET.service, 'ActiveState') === 'active' && serviceProperty(TARGET.productionService, 'ActiveState') === 'active', 'SERVICE_NOT_HEALTHY_BEFORE_APPLY');
      productionPid = serviceProperty(TARGET.productionService, 'MainPID'); originalHomologPid = serviceProperty(TARGET.service, 'MainPID');
      ensure(productionPid !== '0' && originalHomologPid !== '0', 'MISSING_SERVICE_PID');
      // Compatibilidade APP_HOST/UPLOADS_DIR é pré-condição de rollout documentada;
      // preflight estrutural pode ocorrer antes de preparar a release aprovada.
      ensure(fs.statSync(path.join(TARGET.app, 'dist/boot.js')).isFile(), 'HOMOLOG_ENTRYPOINT_MISSING');
      let absent = false; try { command('/usr/bin/getent', ['passwd', TARGET.user]); } catch (err) { absent = err.status === 2; }
      ensure(absent, 'LINUX_ACCOUNT_ALREADY_EXISTS');
      absent = false; try { command('/usr/bin/getent', ['group', TARGET.user]); } catch (err) { absent = err.status === 2; }
      ensure(absent, 'LINUX_GROUP_ALREADY_EXISTS');
      ensure(mariadb(`SELECT COUNT(*) FROM mysql.user WHERE User='${TARGET.databaseUser}';`) === '0', 'DATABASE_ACCOUNT_ALREADY_EXISTS');
      ensure(mariadb(`SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${TARGET.database}';`) === '1', 'HOMOLOG_DATABASE_MISSING');
      if (fs.existsSync(TARGET.uploads)) {
        const st = fs.lstatSync(TARGET.uploads); ensure(st.isDirectory() && !st.isSymbolicLink() && fs.readdirSync(TARGET.uploads).length === 0, 'UPLOADS_REQUIRE_MANUAL_MIGRATION');
        previousUploads = { uid: st.uid, gid: st.gid, mode: st.mode & 0o777 };
      }
      previous = fs.readFileSync(TARGET.environment, 'utf8'); newPassword = randomBytes(32).toString('hex');
      next = replaceEnvironment(previous, newPassword);
      await health();
    },
    backup() {
      createRootDirectory(TARGET.backups, 0o700);
      backupPath = path.join(TARGET.backups, randomUUID()); fs.mkdirSync(backupPath, { mode: 0o700 });
      fs.writeFileSync(path.join(backupPath, 'homolog.env'), previous, { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(path.join(backupPath, 'manifest.json'), JSON.stringify({ service: TARGET.service, originalMode, productionPid, originalHomologPid,
        previousUploads, dropinPreviouslyAbsent: true, createdAt: new Date().toISOString(), databaseDdlRollbackSupported: false }), { flag: 'wx', mode: 0o600 });
      return { backupPath };
    },
    createAccounts() {
      command('/usr/sbin/useradd', ['--system', '--user-group', '--no-create-home', '--home-dir', '/nonexistent', '--shell', '/usr/sbin/nologin', TARGET.user]);
      mariadb(createDatabaseSql(newPassword));
    },
    prepareUploads() {
      // Apenas diretório dedicado vazio; nunca chown recursivo de app/prod.
      if (!fs.existsSync(TARGET.uploads)) fs.mkdirSync(TARGET.uploads, { mode: 0o700 });
      const uid = Number(command('/usr/bin/id', ['-u', TARGET.user])); const gid = Number(command('/usr/bin/id', ['-g', TARGET.user]));
      ensure(Number.isSafeInteger(uid) && uid > 0 && Number.isSafeInteger(gid) && gid > 0, 'INVALID_SERVICE_IDENTITY');
      fs.chownSync(TARGET.uploads, uid, gid); fs.chmodSync(TARGET.uploads, 0o700);
      command('/usr/sbin/runuser', ['--user', TARGET.user, '--', '/usr/bin/test', '-r', path.join(TARGET.app, 'dist/boot.js')]);
    },
    installConfiguration() {
      const directory = path.dirname(TARGET.dropin);
      if (!fs.existsSync(directory)) { assertParents(directory); fs.mkdirSync(directory, { mode: 0o755 }); }
      rootPath(directory, true); atomicWrite(TARGET.environment, next); atomicWrite(TARGET.dropin, renderDropin(), 0o644);
      command('/usr/bin/systemctl', ['daemon-reload']);
    },
    restartHomolog() { command('/usr/bin/systemctl', ['restart', TARGET.service]); },
    async postcheck() {
      await health();
      ensure(serviceProperty(TARGET.service, 'User') === TARGET.user && serviceProperty(TARGET.service, 'Group') === TARGET.user, 'WRONG_RUNTIME_IDENTITY');
      const pid = serviceProperty(TARGET.service, 'MainPID');
      const listeners = command('/usr/bin/ss', ['-H', '-ltnp', 'sport = :3101']);
      ensure(listeners.includes('127.0.0.1:3101') && !listeners.includes('0.0.0.0:3101') && !listeners.includes('*:3101') && !listeners.includes('[::]:3101') && listeners.includes(`pid=${pid},`), 'UNSAFE_OR_UNOWNED_LISTENER');
      ensure(serviceProperty(TARGET.productionService, 'MainPID') === productionPid && serviceProperty(TARGET.productionService, 'ActiveState') === 'active', 'PRODUCTION_STATE_CHANGED');
      ensure((fs.statSync(TARGET.environment).mode & 0o777) === 0o600, 'ENVIRONMENT_MODE_INCORRECT');
      const grantOwner = `SUBSTRING_INDEX(GRANTEE,'@',1)=CONCAT(CHAR(39),'${TARGET.databaseUser}',CHAR(39))`;
      const global = mariadb(`SELECT COUNT(*) FROM information_schema.USER_PRIVILEGES WHERE ${grantOwner} AND PRIVILEGE_TYPE<>'USAGE';`);
      const grants = mariadb(`SELECT TABLE_SCHEMA,PRIVILEGE_TYPE FROM information_schema.SCHEMA_PRIVILEGES WHERE ${grantOwner} ORDER BY TABLE_SCHEMA,PRIVILEGE_TYPE;`).split('\n');
      ensure(global === '0' && grants.length === 8 && grants.every(line => /^reembolsa_homolog\t(SELECT|INSERT|UPDATE|DELETE)$/.test(line)), 'DATABASE_GRANTS_INCORRECT');
      const client = path.join(backupPath, 'temporary-client.cnf');
      try {
        fs.writeFileSync(client, `[client]\nuser=${TARGET.databaseUser}\npassword=${newPassword}\nhost=127.0.0.1\nport=3306\nprotocol=tcp\ndatabase=${TARGET.database}\n`, { flag: 'wx', mode: 0o600 });
        const args = [`--defaults-file=${client}`, '--batch', '--skip-column-names'];
        const identity = command('/usr/bin/mariadb', args, 'SELECT CURRENT_USER(),DATABASE();');
        ensure(new RegExp(`^${TARGET.databaseUser}@(localhost|127\\.0\\.0\\.1)\\t${TARGET.database}$`).test(identity), 'DATABASE_RUNTIME_IDENTITY_MISMATCH');
        let denied = false;
        try { command('/usr/bin/mariadb', args, 'USE reembolsa;'); }
        catch (error) { denied = /ERROR 1044\b/.test(String(error.stderr)); }
        ensure(denied, 'PRODUCTION_DATABASE_NOT_ISOLATED');
      } finally { if (fs.existsSync(client)) fs.unlinkSync(client); }
      // Não imprime nem reutiliza credencial da conta de produção.
    },
    restoreConfiguration() {
      atomicWrite(TARGET.environment, previous, originalMode);
      if (fs.existsSync(TARGET.dropin)) { rootPath(TARGET.dropin); fs.unlinkSync(TARGET.dropin); }
      if (previousUploads) { fs.chownSync(TARGET.uploads, previousUploads.uid, previousUploads.gid); fs.chmodSync(TARGET.uploads, previousUploads.mode); }
      command('/usr/bin/systemctl', ['daemon-reload']);
    },
    async checkRestored() {
      await health();
      ensure(serviceProperty(TARGET.service, 'User') === 'reembolsa', 'ROLLBACK_IDENTITY_MISMATCH');
      ensure(serviceProperty(TARGET.productionService, 'MainPID') === productionPid, 'PRODUCTION_STATE_CHANGED');
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let lock;
  try {
    const mode = parseArguments(process.argv.slice(2));
    if (mode === '--help') process.stdout.write('Uso: node tools/deploy/isolar-homolog.mjs [--preflight|--apply]\nPadrão somente leitura. --apply exige root e altera exclusivamente homologação.\n');
    else {
      if (mode === '--apply') {
        ensure(process.getuid?.() === 0, 'ROOT_REQUIRED'); assertParents(TARGET.lock);
        try { lock = fs.openSync(TARGET.lock, 'wx', 0o600); fs.writeFileSync(lock, String(process.pid)); }
        catch { throw new IsolationError('ISOLATION_LOCK_EXISTS_OR_UNAVAILABLE'); }
      }
      process.stdout.write(`${JSON.stringify(await isolateHomolog(mode, runtimeIO()))}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof IsolationError ? error.message : 'ISOLATION_FAILED'}\n`); process.exitCode = 1;
  } finally {
    if (lock !== undefined) {
      try { fs.closeSync(lock); fs.unlinkSync(TARGET.lock); }
      catch { process.stderr.write('LOCK_RELEASE_FAILED_MANUAL_REVIEW_REQUIRED\n'); process.exitCode = 1; }
    }
  }
}
