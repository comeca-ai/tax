import fs from 'node:fs';
import path from 'node:path';

export const LIMITE_CONSULTAS = 20;

/** Reserva antes da rede. Falha/crash continua consumindo a unidade reservada. */
export function reservarConsulta(arquivo, cenario, destino, limite = LIMITE_CONSULTAS) {
  if (!Number.isInteger(limite) || limite < 1 || limite > 1000) throw new Error('Limite inválido');
  if (!/^[a-z0-9_-]{1,80}$/.test(cenario)) throw new Error('Cenário inválido');
  if (!['openai', '360dialog'].includes(destino)) throw new Error('Destino inválido');
  const dir = fs.lstatSync(path.dirname(arquivo));
  if (!dir.isDirectory() || dir.isSymbolicLink()) throw new Error('Diretório inválido');
  const trava = `${arquivo}.lock`;
  const lock = fs.openSync(trava, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  try {
    const fd = fs.openSync(arquivo, fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_RDWR | fs.constants.O_NOFOLLOW, 0o600);
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) throw new Error('Registro inseguro');
      const linhas = fs.readFileSync(fd, 'utf8').split('\n').filter(Boolean);
      const registros = linhas.map(line => JSON.parse(line));
      if (registros.some((r, i) => r.consulta !== i + 1 || !r.cenario || !r.destino)) throw new Error('Registro inconsistente');
      if (registros.length >= limite) throw new Error(`Limite de ${limite} consultas atingido`);
      const registro = { consulta: registros.length + 1, cenario, destino, reservadoEm: new Date().toISOString() };
      fs.writeSync(fd, `${JSON.stringify(registro)}\n`);
      fs.fsyncSync(fd);
      return registro;
    } finally { fs.closeSync(fd); }
  } finally { fs.closeSync(lock); fs.unlinkSync(trava); }
}

/** Leitura operacional do mesmo ledger; a reserva continua sendo a autoridade atômica. */
export function saldoConsultas(arquivo, limite = LIMITE_CONSULTAS) {
  if (!Number.isInteger(limite) || limite < 1 || limite > 1000) throw new Error('Limite inválido');
  const fd = fs.openSync(arquivo, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) throw new Error('Registro inseguro');
    const rows = fs.readFileSync(fd, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
    if (rows.some((r, i) => r.consulta !== i + 1 || !r.cenario || !['openai', '360dialog'].includes(r.destino))) throw new Error('Registro inconsistente');
    return Math.max(0, limite - rows.length);
  } finally { fs.closeSync(fd); }
}

/** Somente o processo coordenador recebe credenciais; redirects são proibidos. */
export function criarFetchLimitado({ arquivo, cenario, executar = globalThis.fetch, registrar = () => {} }) {
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (url.href !== 'https://api.openai.com/v1/responses' || method !== 'POST') throw new Error('Chamada fora do ensaio autorizado');
    const body = JSON.parse(String(init.body));
    if (body.store !== false || !Number.isInteger(body.max_output_tokens) || body.max_output_tokens > 2000) throw new Error('Limites do ensaio ausentes');
    const reserva = reservarConsulta(arquivo, cenario(), 'openai');
    registrar({ ...reserva, estado: 'reservada' });
    try {
      const resposta = await executar(input, { ...init, redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(60_000), ...(init.signal ? [init.signal] : [])]) });
      const json = await resposta.clone().json().catch(() => null);
      registrar({ consulta: reserva.consulta, estado: 'respondida', http: resposta.status,
        tokensEntrada: Number.isSafeInteger(json?.usage?.input_tokens) ? json.usage.input_tokens : null,
        tokensSaida: Number.isSafeInteger(json?.usage?.output_tokens) ? json.usage.output_tokens : null });
      return resposta;
    } catch { registrar({ consulta: reserva.consulta, estado: 'resultado_incerto' }); throw new Error('Consulta externa indisponível'); }
  };
}
