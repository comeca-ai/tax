import fs from 'node:fs';
import path from 'node:path';

export const LIMITE_CONSULTAS = 20;

/** Reserva antes da rede. Falha/crash continua consumindo a unidade reservada. */
export function reservarConsulta(arquivo, cenario, destino, limite = LIMITE_CONSULTAS) {
  if (!Number.isInteger(limite) || limite < 1 || limite > 1000) throw new Error('Limite inválido');
  if (!/^[a-z0-9_-]{1,80}$/.test(cenario)) throw new Error('Cenário inválido');
  if (!['openai', 'openrouter', 'mistral', '360dialog'].includes(destino)) throw new Error('Destino inválido');
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
    if (rows.some((r, i) => r.consulta !== i + 1 || !r.cenario || !['openai', 'openrouter', 'mistral', '360dialog'].includes(r.destino))) throw new Error('Registro inconsistente');
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

const ENDPOINTS_IA = [
  {
    provedor: 'mistral',
    endpointExterno: 'POST https://api.mistral.ai/v1/ocr',
    operacoes: ['despesas.ocr_e_whatsapp.worker.comprovante'],
    finalidade: 'OCR de política e comprovantes; tokens podem não ser informados pelo endpoint OCR',
  },
  {
    provedor: 'mistral',
    endpointExterno: 'POST https://api.mistral.ai/v1/chat/completions',
    operacoes: ['politica.upload'],
    finalidade: 'Estruturação das regras extraídas da política',
  },
  {
    provedor: 'openai',
    endpointExterno: 'POST https://api.openai.com/v1/responses',
    operacoes: ['politica.arquitetar', 'politica.upload', 'despesas.ocr_e_whatsapp.worker.comprovante'],
    finalidade: 'Arquiteto, extração de política ou OCR de comprovante, conforme configuração',
  },
  {
    provedor: 'openrouter',
    endpointExterno: 'POST https://openrouter.ai/api/v1/chat/completions',
    operacoes: ['politica.arquitetar'],
    finalidade: 'Fallback simples do Arquiteto de Política',
  },
];

function abrirAppendSeguro(arquivo) {
  const dir = fs.lstatSync(path.dirname(arquivo));
  if (!dir.isDirectory() || dir.isSymbolicLink()) throw new Error('Diretório inválido');
  const fd = fs.openSync(arquivo, fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
  const stat = fs.fstatSync(fd);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) {
    fs.closeSync(fd);
    throw new Error('Registro inseguro');
  }
  return fd;
}

/** Registra apenas metadados operacionais; prompt, documento e credenciais nunca entram no arquivo. */
export function registrarUsoIa(arquivo, evento) {
  if (!['openai', 'openrouter', 'mistral'].includes(evento.provedor)) throw new Error('Provedor de IA inválido');
  if (!/^https:\/\/[^\s]+$/.test(evento.endpointExterno)) throw new Error('Endpoint de IA inválido');
  const inteiroOuNull = valor => Number.isSafeInteger(valor) && valor >= 0 ? valor : null;
  const registro = {
    schemaVersion: 1,
    registradoEm: typeof evento.registradoEm === 'string' ? evento.registradoEm : new Date().toISOString(),
    provedor: evento.provedor,
    endpointExterno: evento.endpointExterno,
    operacao: typeof evento.operacao === 'string' ? evento.operacao.slice(0, 80) : 'nao_identificada',
    http: Number.isInteger(evento.http) ? evento.http : null,
    estado: evento.estado === 'respondida' ? 'respondida' : 'resultado_incerto',
    tokensEntrada: inteiroOuNull(evento.tokensEntrada),
    tokensSaida: inteiroOuNull(evento.tokensSaida),
    tokensTotal: inteiroOuNull(evento.tokensTotal),
  };
  const fd = abrirAppendSeguro(arquivo);
  try {
    fs.writeSync(fd, `${JSON.stringify(registro)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return registro;
}

function lerUsoIa(arquivo) {
  if (!fs.existsSync(arquivo)) return [];
  const fd = fs.openSync(arquivo, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) throw new Error('Registro inseguro');
    return fs.readFileSync(fd, 'utf8').split('\n').filter(Boolean).map(linha => JSON.parse(linha));
  } finally {
    fs.closeSync(fd);
  }
}

function inicioJanela10Minutos(data) {
  const ms = new Date(data).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(Math.floor(ms / 600_000) * 600_000).toISOString();
}

export function montarDashboardIa(eventos, geradoEm = new Date().toISOString()) {
  const grupos = new Map();
  for (const evento of eventos) {
    const inicio = inicioJanela10Minutos(evento.registradoEm);
    if (!inicio) continue;
    const chave = `${inicio}|${evento.operacao}|${evento.provedor}|${evento.endpointExterno}`;
    const atual = grupos.get(chave) ?? {
      inicio,
      fim: new Date(new Date(inicio).getTime() + 600_000).toISOString(),
      operacao: evento.operacao,
      provedor: evento.provedor,
      endpointExterno: evento.endpointExterno,
      chamadas: 0,
      chamadasComTokens: 0,
      chamadasSemTokens: 0,
      tokensEntrada: 0,
      tokensSaida: 0,
      tokensTotal: 0,
      entradaIncompleta: false,
      saidaIncompleta: false,
      totalIncompleto: false,
    };
    atual.chamadas += 1;
    if (Number.isSafeInteger(evento.tokensEntrada) || Number.isSafeInteger(evento.tokensSaida) || Number.isSafeInteger(evento.tokensTotal)) {
      atual.chamadasComTokens += 1;
      if (Number.isSafeInteger(evento.tokensEntrada)) atual.tokensEntrada += evento.tokensEntrada;
      else atual.entradaIncompleta = true;
      if (Number.isSafeInteger(evento.tokensSaida)) atual.tokensSaida += evento.tokensSaida;
      else atual.saidaIncompleta = true;
      if (Number.isSafeInteger(evento.tokensTotal)) atual.tokensTotal += evento.tokensTotal;
      else atual.totalIncompleto = true;
    } else {
      atual.chamadasSemTokens += 1;
    }
    grupos.set(chave, atual);
  }
  return {
    schemaVersion: 1,
    geradoEm,
    janelaMinutos: 10,
    medicao: 'usage_reportado_pelo_provedor_sem_estimativas',
    endpointsIa: ENDPOINTS_IA,
    janelas: [...grupos.values()]
      .map(({ entradaIncompleta, saidaIncompleta, totalIncompleto, ...janela }) => ({
        ...janela,
        tokensEntrada: entradaIncompleta ? null : janela.tokensEntrada,
        tokensSaida: saidaIncompleta ? null : janela.tokensSaida,
        tokensTotal: totalIncompleto ? null : janela.tokensTotal,
      }))
      .sort((a, b) => a.inicio.localeCompare(b.inicio)),
  };
}

export function gravarDashboardIa(arquivoUso, arquivoSaida, geradoEm = new Date().toISOString()) {
  const dashboard = montarDashboardIa(lerUsoIa(arquivoUso), geradoEm);
  const dir = fs.lstatSync(path.dirname(arquivoSaida));
  if (!dir.isDirectory() || dir.isSymbolicLink()) throw new Error('Diretório de artefato inválido');
  const temporario = `${arquivoSaida}.${process.pid}.tmp`;
  const fd = fs.openSync(temporario, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(dashboard, null, 2)}\n`);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(temporario, arquivoSaida);
  } finally {
    try { fs.closeSync(fd); } catch { /* fechado após fsync */ }
    if (fs.existsSync(temporario)) fs.unlinkSync(temporario);
  }
  return dashboard;
}
