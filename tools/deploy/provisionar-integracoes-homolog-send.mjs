import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { validatePayload } from './provisionar-integracoes-homolog-receiver.mjs';

// Credenciais trafegam somente no stdin do SSH; sem artifacts, logs ou argv.
let directory;
try {
  if (process.env.GITHUB_ACTIONS !== 'true'
    || process.env.GITHUB_REPOSITORY !== 'comeca-ai/projeto_tribureembolsa'
    || process.env.GITHUB_REF !== 'refs/heads/main'
    || process.env.CONFIRM_HOMOLOG !== 'true') throw new Error();
  const payload = validatePayload({ version: 1,
    DIALOG_360_API_KEY: process.env.DIALOG_360_API_KEY,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
    API_NFE_IO: process.env.API_NFE_IO });
  const host = process.env.HOMOLOG_SSH_HOST;
  const port = process.env.HOMOLOG_SSH_PORT || '22';
  if (!host || !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(host)
    || !/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535
    || !process.env.HOMOLOG_SSH_PRIVATE_KEY?.trim()
    || !process.env.HOMOLOG_SSH_KNOWN_HOSTS?.trim()) throw new Error();

  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'integracoes-homolog-'));
  const identity = path.join(directory, 'identity');
  const knownHosts = path.join(directory, 'known_hosts');
  fs.writeFileSync(identity, process.env.HOMOLOG_SSH_PRIVATE_KEY + '\n', { mode: 0o600 });
  fs.writeFileSync(knownHosts, process.env.HOMOLOG_SSH_KNOWN_HOSTS + '\n', { mode: 0o600 });
  const child = spawn('/usr/bin/ssh', [
    '-F', '/dev/null', '-T', '-p', port, '-i', identity,
    '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
    '-o', `UserKnownHostsFile=${knownHosts}`, '-o', 'GlobalKnownHostsFile=/dev/null',
    '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3',
    '-o', 'ClearAllForwardings=yes', '-o', 'LogLevel=ERROR',
    `integracoes-homolog-deploy@${host}`, 'apply-integracoes-homolog-v1',
  ], { stdio: ['pipe', 'ignore', 'ignore'],
    env: { PATH: '/usr/bin:/bin', LANG: 'C' } });
  // Nem stdout nem stderr remotos são reproduzidos: saída do host não é confiável.
  // Janela inclui tentativa de rollback e seus health checks.
  const timer = setTimeout(() => child.kill('SIGTERM'), 420000);
  child.stdin.on('error', () => {}); // EPIPE é tratado pelo exit code do SSH.
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
    child.stdin.end(JSON.stringify(payload));
  }).finally(() => clearTimeout(timer));
  if (exitCode !== 0) throw new Error();
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    'Configuração de homologação aplicada; health check e autenticação local passaram.\n\n'
    + 'Não valida provedores, HTTPS público ou conversa real. A flag do worker permaneceu desativada; produção não foi alterada.\n');
} catch {
  process.stderr.write('Fluxo não concluído. Conferir pré-requisitos e estado da homologação com a operação; não repetir cegamente. Nenhum valor foi exibido.\n');
  process.exitCode = 1;
} finally {
  // Diretório exclusivo criado acima; somente dois arquivos conhecidos.
  if (directory) {
    for (const name of ['identity', 'known_hosts']) {
      const file = path.join(directory, name);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    fs.rmdirSync(directory);
  }
}
