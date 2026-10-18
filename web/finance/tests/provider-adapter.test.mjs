import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createFinanceProviderAdapter, FINANCE_CALLBACK} from '../src/provider-adapter.mjs';
import {createFinanceWorker} from '../src/connection-worker.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import productionWorker from '../src/production-worker.mjs';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';

const KEY = 'fixture-finance-partner-key';
const STATE = 'A'.repeat(43);
const stamp = 1800000000;
const params = {state: STATE, redirect_uri: FINANCE_CALLBACK, partner_id: 2049333, shop_id: 1178167501};
const env = {FINANCE_CONNECTION_ENABLED: 'true', SHOPEE_FINANCE_PARTNER_KEY: KEY};
const now = () => stamp * 1000;

test('official authorization URL uses a signed public API and encodes state inside redirect', async () => {
  let requests = 0;
  const adapter = createFinanceProviderAdapter({now, fetchImpl: () => { requests++; }});
  const url = new URL(await adapter.authorizationUrl(params, env));
  assert.equal(url.origin, 'https://partner.shopeemobile.com');
  assert.equal(url.pathname, '/api/v2/shop/auth_partner');
  assert.deepEqual([...url.searchParams.keys()], ['partner_id', 'timestamp', 'sign', 'redirect']);
  assert.equal(url.searchParams.get('partner_id'), '2049333');
  assert.equal(url.searchParams.get('timestamp'), String(stamp));
  assert.equal(url.searchParams.get('sign'), createHmac('sha256', KEY)
    .update('2049333/api/v2/shop/auth_partner' + stamp).digest('hex'));
  assert.equal(url.searchParams.get('redirect'), FINANCE_CALLBACK + '?state=' + STATE);
  assert.equal(url.searchParams.has('state'), false); assert.equal(url.searchParams.has('redirect_uri'), false);
  assert.equal(url.href.includes(KEY), false); assert.equal(requests, 0);
});

test('activation requires the explicit flag, dedicated key and injected transport', async () => {
  const adapter = createFinanceProviderAdapter({now, fetchImpl: () => { throw new Error('NO_NETWORK'); }});
  for (const candidate of [{}, {...env, FINANCE_CONNECTION_ENABLED: 'false'},
    {...env, FINANCE_CONNECTION_ENABLED: true}, {...env, SHOPEE_FINANCE_PARTNER_KEY: ''},
    {FINANCE_CONNECTION_ENABLED: 'true', SHOPEE_PARTNER_KEY: KEY}]) {
    assert.equal(adapter.isReady(candidate), false);
    await assert.rejects(adapter.authorizationUrl(params, candidate), {code: 'FINANCE_PROVIDER_CONFIGURATION'});
  }
  assert.equal(createFinanceProviderAdapter({now}).isReady(env), false);
  assert.equal(adapter.isReady(env), true);
});

test('authorization cannot override app, shop, callback, state or add unrecognized parameters', async () => {
  const adapter = createFinanceProviderAdapter({now, fetchImpl: () => { throw new Error('NO_NETWORK'); }});
  for (const change of [{partner_id: 2047569}, {shop_id: 1}, {redirect_uri: 'https://other.invalid'},
    {state: 'bad'}, {origin: 'https://other.invalid'}]) {
    await assert.rejects(adapter.authorizationUrl({...params, ...change}, env), {code: 'FINANCE_PROVIDER_CONFIGURATION'});
  }
  for (const change of [{partner_id: 2047569}, {shop_id: 1}, {merchant_id: 123}]) {
    await assert.rejects(adapter.exchange({code: 'fixture-code', partner_id: 2049333, shop_id: 1178167501,
      ...change}, env), {code: 'FINANCE_PROVIDER_CONFIGURATION'});
  }
});

test('real adapter joins browser-bound authorization, initial POST and encrypted single-use callback', async () => {
  const db = new D1();
  const runtimeEnv = {...env, FINANCE_DB: db, FINANCE_ROUTER_SECRET: 'fixture-router-' + 'z'.repeat(40),
    FINANCE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 10).toString('base64')};
  let exchanges = 0;
  const adapter = createFinanceProviderAdapter({now, fetchImpl: async request => {
    exchanges++;
    const url = new URL(request.url);
    assert.equal(url.origin + url.pathname, 'https://partner.shopeemobile.com/api/v2/auth/token/get');
    assert.equal(url.searchParams.get('sign'), createHmac('sha256', KEY)
      .update('2049333/api/v2/auth/token/get' + stamp).digest('hex'));
    assert.deepEqual(await request.json(), {shop_id: 1178167501, code: 'fixture-one-time-code', partner_id: 2049333});
    return Response.json({error: '', message: '', request_id: 'fixture', expire_in: 13859,
      access_token: 'fixture-access', refresh_token: 'fixture-refresh'});
  }});
  const worker = createFinanceWorker({adapter, now});
  const run = (url, cookie) => worker.fetch(new Request(url, {headers: {
    'X-Braza-Finance-Router': runtimeEnv.FINANCE_ROUTER_SECRET, ...(cookie ? {cookie} : {}),
  }}), runtimeEnv);
  const start = await run(FINANCE_CALLBACK.replace('/callback', '/connect'));
  assert.equal(start.status, 302);
  const location = new URL(start.headers.get('location'));
  const returned = new URL(location.searchParams.get('redirect'));
  returned.searchParams.set('code', 'fixture-one-time-code');
  returned.searchParams.set('shop_id', '1178167501');
  const cookie = start.headers.get('set-cookie').split(';')[0];
  const success = await run(returned.href, cookie);
  assert.equal(success.status, 200);
  const body = await success.text();
  for (const secret of ['fixture-one-time-code', 'fixture-access', 'fixture-refresh', KEY]) assert.ok(!body.includes(secret));
  const store = await createFinanceStore(runtimeEnv, {now});
  assert.equal((await store.status()).status, 'CONNECTED');
  const tokens = await store.readTokens();
  assert.equal(tokens.expires_at, stamp + 13859); assert.equal(tokens.refresh_token, 'fixture-refresh');
  const row = db.db.prepare('SELECT * FROM finance_connections').get();
  assert.equal(JSON.stringify(row).includes('fixture-refresh'), false);
  assert.equal((await run(returned.href, cookie)).status, 400); assert.equal(exchanges, 1);
});

test('the deployable entry stays disabled without its flag or dedicated finance credentials', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', () => { calls++; throw new Error('NO_NETWORK'); });
  const response = await productionWorker.fetch(new Request(FINANCE_CALLBACK.replace('/callback', '/connect'), {
    headers: {'X-Braza-Finance-Router': 'fixture-router-' + 'z'.repeat(40)},
  }), {FINANCE_ROUTER_SECRET: 'fixture-router-' + 'z'.repeat(40)});
  assert.equal(response.status, 503); assert.equal(calls, 0);
});
