import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyReadonly } from './verificar-360dialog-readonly.mjs';

const apiKey = 'synthetic-api-key-123456';
const webhookSecret = 'Basic synthetic-webhook-secret';
function response(status, body = null) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

test('faz somente dois GETs fixos e sanitiza o resultado', async () => {
  const calls = [];
  const result = await verifyReadonly({ apiKey, webhookSecret, fetchFn: async (url, options) => {
    calls.push({ url, method: options.method, key: options.headers['D360-API-KEY'], body: options.body });
    if (url.endsWith('/health_status')) return response(200, {});
    return response(200, { url: 'https://homolog.oreembolsabot.app/api/webhooks/360dialog',
      headers: { Authorization: webhookSecret } });
  } });
  assert.deepEqual(calls.map(x => [x.url, x.method, x.body]), [
    ['https://waba-v2.360dialog.io/health_status', 'GET', undefined],
    ['https://waba-v2.360dialog.io/v1/configs/webhook', 'GET', undefined],
  ]);
  assert(calls.every(x => x.key === apiKey));
  assert.deepEqual(result, { apiKeyAccepted: true, healthStatusClass: '2xx',
    webhookReadStatusClass: '2xx', webhookConfigured: true, webhookTarget: 'homologacao',
    authorizationHeaderConfigured: true, authorizationMatchesSecret: true,
    requests: ['GET /health_status', 'GET /v1/configs/webhook'],
    providerMutation: false, messageSent: false });
  assert(!JSON.stringify(result).includes(apiKey));
  assert(!JSON.stringify(result).includes(webhookSecret));
});

for (const [name, url, expected] of [
  ['produção', 'https://oreembolsabot.app/api/webhooks/360dialog', 'producao'],
  ['outro', 'https://example.invalid/webhook', 'outro'],
  ['inválido', 'not a url', 'invalido'],
  ['ausente', '', 'ausente'],
]) test(`classifica destino ${name} sem devolver URL`, async () => {
  let count = 0;
  const result = await verifyReadonly({ apiKey, webhookSecret, fetchFn: async () =>
    ++count === 1 ? response(200, {}) : response(200, { url, headers: {} }) });
  assert.equal(result.webhookTarget, expected);
  if (url) assert(!JSON.stringify(result).includes(url));
});

test('401 não ecoa corpo nem credencial', async () => {
  const result = await verifyReadonly({ apiKey, webhookSecret, fetchFn: async () =>
    response(401, { error: apiKey }) });
  assert.equal(result.apiKeyAccepted, false);
  assert.equal(result.healthStatusClass, '4xx');
  assert(!JSON.stringify(result).includes(apiKey));
});

test('não confunde Authorization diferente com o secret', async () => {
  let count = 0;
  const result = await verifyReadonly({ apiKey, webhookSecret, fetchFn: async () =>
    ++count === 1 ? response(200, {}) : response(200, { url: 'https://homolog.oreembolsabot.app/api/webhooks/360dialog',
      headers: { authorization: 'Basic different-secret' } }) });
  assert.equal(result.authorizationHeaderConfigured, true);
  assert.equal(result.authorizationMatchesSecret, false);
});
