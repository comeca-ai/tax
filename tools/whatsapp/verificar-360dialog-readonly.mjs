import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const REPOSITORY = 'comeca-ai/projeto_tribureembolsa';
const BRANCH_REF = 'refs/heads/main';
const HEALTH = 'https://waba-v2.360dialog.io/health_status';
const WEBHOOK = 'https://waba-v2.360dialog.io/v1/configs/webhook';
const HOMOLOG_WEBHOOK = 'https://homolog.oreembolsabot.app/api/webhooks/360dialog';
const CHANNEL_WEBHOOK = 'https://oreembolsobot.app/api/webhooks/360dialog';

function assertSafe(condition, message) {
  if (!condition) throw new Error(message);
}

function classifyWebhook(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return 'ausente';
  try {
    const url = new URL(raw);
    if (url.href === CHANNEL_WEBHOOK) return 'canal_informado';
    if (url.href === HOMOLOG_WEBHOOK) return 'homologacao';
    if (url.hostname === 'oreembolsabot.app' || url.hostname === 'www.oreembolsabot.app') return 'producao';
    return 'outro';
  } catch { return 'invalido'; }
}

async function fixedGet(fetchFn, url, apiKey) {
  assertSafe([HEALTH, WEBHOOK].includes(url), 'Endpoint não permitido');
  return fetchFn(url, {
    method: 'GET', redirect: 'error',
    headers: { 'D360-API-KEY': apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
}

export async function verifyReadonly({ apiKey, webhookSecret, fetchFn = fetch }) {
  assertSafe(typeof apiKey === 'string' && apiKey.trim(), 'API key ausente');
  // A 360dialog exige a API key para estes GETs. O segredo do receptor é
  // uma configuração da aplicação, opcional apenas nesta comparação.
  const webhookSecretConfigured = typeof webhookSecret === 'string' && Boolean(webhookSecret.trim());
  const health = await fixedGet(fetchFn, HEALTH, apiKey);
  const webhook = await fixedGet(fetchFn, WEBHOOK, apiKey);
  let configuration = null;
  if (webhook.ok) {
    const text = await webhook.text();
    assertSafe(text.length <= 100000, 'Resposta do provedor acima do limite');
    try { configuration = JSON.parse(text); } catch { /* resultado sanitizado abaixo */ }
  } else {
    await webhook.body?.cancel();
  }
  await health.body?.cancel();
  const url = configuration && typeof configuration === 'object' ? configuration.url : null;
  const headers = configuration && typeof configuration.headers === 'object' && configuration.headers
    ? configuration.headers : {};
  const authorization = headers.Authorization ?? headers.authorization;
  return {
    apiKeyAccepted: health.status === 200 && webhook.status === 200,
    healthStatusClass: `${Math.floor(health.status / 100)}xx`,
    webhookReadStatusClass: `${Math.floor(webhook.status / 100)}xx`,
    webhookConfigured: typeof url === 'string' && Boolean(url.trim()),
    webhookTarget: classifyWebhook(url),
    authorizationHeaderConfigured: typeof authorization === 'string' && Boolean(authorization),
    webhookSecretConfigured,
    authorizationMatchesSecret: webhookSecretConfigured
      ? typeof authorization === 'string' && authorization === webhookSecret : null,
    requests: ['GET /health_status', 'GET /v1/configs/webhook'],
    providerMutation: false,
    messageSent: false,
  };
}

async function cli() {
  assertSafe(process.env.GITHUB_ACTIONS === 'true', 'Somente GitHub Actions');
  assertSafe(process.env.GITHUB_REPOSITORY === REPOSITORY, 'Repositório não permitido');
  assertSafe(process.env.GITHUB_REF === BRANCH_REF, 'Branch não permitida');
  const result = await verifyReadonly({
    apiKey: process.env.DIALOG_360_API_KEY,
    webhookSecret: process.env.DIALOG_360_WEBHOOK_SECRET,
  });
  for (const [key, value] of Object.entries(result)) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${Array.isArray(value) ? JSON.stringify(value) : value}\n`);
  }
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `API key aceita: ${result.apiKeyAccepted ? 'sim' : 'não'}\n\n`
    + `Webhook configurado: ${result.webhookConfigured ? 'sim' : 'não'}\n\n`
    + `Destino classificado: ${result.webhookTarget}\n\n`
    + `Authorization coincide com o secret: ${result.authorizationMatchesSecret === null
      ? 'não verificado (segredo de referência ausente)' : result.authorizationMatchesSecret ? 'sim' : 'não'}\n\n`
    + 'Esta consulta não valida o recebimento, a autenticação ou a persistência no servidor do webhook.\n\n'
    + 'Somente dois GETs; nenhuma mensagem ou mutação no provedor. Valores e respostas não são exibidos.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli().catch(() => {
    process.stderr.write('Consulta somente leitura não concluída; nenhum valor foi exibido.\n');
    process.exitCode = 1;
  });
}
