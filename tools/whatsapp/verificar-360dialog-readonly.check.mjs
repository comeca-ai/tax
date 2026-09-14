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
    authorizationHeaderConfigured: true, webhookSecretConfigured: true, authorizationMatchesSecret: true,
    requests: ['GET /health_status', 'GET /v1/configs/webhook'],
    providerMutation: false, messageSent: false });
  assert(!JSON.stringify(result).includes(apiKey));
  assert(!JSON.stringify(result).includes(webhookSecret));
});

for (const [name, url, expected] of [
  ['homologação no domínio atual', 'https://homolog.oreembolsobot.app/api/webhooks/360dialog', 'homologacao'],
  ['canal informado pelo usuário', 'https://oreembolsobot.app/api/webhooks/360dialog', 'canal_informado'],
  ['caminho diferente no domínio do canal', 'https://oreembolsobot.app/outro', 'outro'],
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
  assert.equal(result.webhookConfigured, null);
  assert.equal(result.authorizationHeaderConfigured, null);
  assert.equal(result.authorizationMatchesSecret, null);
  assert.equal(result.webhookTarget, 'nao_verificado');
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

for (const secret of [undefined, '', '   ']) {
  test(`consulta com API key sem segredo de referência (${JSON.stringify(secret)})`, async () => {
    const calls = [];
    const result = await verifyReadonly({ apiKey, webhookSecret: secret, fetchFn: async (url, options) => {
      calls.push([url, options.method, options.headers]);
      return response(200, { url: 'https://oreembolsobot.app/api/webhooks/360dialog',
        headers: { Authorization: 'synthetic-provider-header' } });
    } });
    assert.equal(calls.length, 2);
    assert(calls.every(([, method, headers]) => method === 'GET' && headers['D360-API-KEY'] === apiKey));
    assert.equal(result.apiKeyAccepted, true);
    assert.equal(result.webhookSecretConfigured, false);
    assert.equal(result.authorizationHeaderConfigured, true);
    assert.equal(result.authorizationMatchesSecret, null);
    assert.equal(result.webhookTarget, 'canal_informado');
    assert(!JSON.stringify(result).includes('synthetic-provider-header'));
    assert(!JSON.stringify(result).includes(apiKey));
  });
}

test('ausência de headers é aceita pela API sem afirmar autenticação do receptor', async () => {
  const result = await verifyReadonly({ apiKey, fetchFn: async () => response(200, {}) });
  assert.equal(result.apiKeyAccepted, true);
  assert.equal(result.authorizationHeaderConfigured, false);
  assert.equal(result.authorizationMatchesSecret, null);
});

test('API key ausente continua bloqueando a consulta antes da rede', async () => {
  await assert.rejects(verifyReadonly({ fetchFn: async () => {
    assert.fail('não deve fazer chamada sem API key');
  } }), /API key ausente/);
});
