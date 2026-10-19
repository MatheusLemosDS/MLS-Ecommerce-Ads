import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore, FINANCE_PROFILE} from '../src/connection-store.mjs';
import {ensureFinanceAccessToken} from '../src/refresh-coordinator.mjs';

const ACCESS = 'fixture-internal-access';
const REFRESH = 'fixture-internal-refresh';
const KEY = 'fixture-finance-key';
const ROOT = 'https://openplatform.shopee.com.br';
const PATH = '/api/v2/auth/access_token/get';

async function fixture(ttl = 60) {
  const db = new D1();
  let queue = Promise.resolve();
  const batch = db.batch.bind(db);
  db.batch = statements => {
    const next = queue.then(() => batch(statements));
    queue = next.catch(() => {});
    return next;
  };
  const clock = {milliseconds: 1800000000000};
  const now = () => clock.milliseconds;
  const epoch = () => Math.floor(now() / 1000);
  const env = {FINANCE_DB: db, FINANCE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64'),
    SHOPEE_FINANCE_PARTNER_KEY: KEY};
  const store = await createFinanceStore(env, {now});
  await store.setup();
  if (ttl !== null) await store.saveTokens({access_token: ACCESS, refresh_token: REFRESH, expires_at: epoch() + ttl});
  const calls = [];
  const success = async request => {
    const url = new URL(request.url);
    assert.equal(url.origin, ROOT); assert.equal(url.pathname, PATH);
    assert.equal(request.method, 'POST'); assert.equal(request.redirect, 'manual');
    assert.equal(url.searchParams.get('partner_id'), String(FINANCE_PROFILE.partner_id));
    const stamp = url.searchParams.get('timestamp');
    assert.equal(url.searchParams.get('sign'), createHmac('sha256', KEY)
      .update(String(FINANCE_PROFILE.partner_id) + PATH + stamp).digest('hex'));
    const body = await request.json();
    assert.equal(body.partner_id, FINANCE_PROFILE.partner_id);
    assert.equal(body.shop_id, FINANCE_PROFILE.shop_id);
    assert.deepEqual(Object.keys(body).sort(), ['partner_id', 'refresh_token', 'shop_id']);
    calls.push(body);
    return Response.json({error: '', message: '', request_id: 'fixture', ...FINANCE_PROFILE,
      access_token: ACCESS + '-' + calls.length, refresh_token: REFRESH + '-' + calls.length, expire_in: 14400});
  };
  const run = overrides => ensureFinanceAccessToken(env, {now, fetchImpl: success, ...overrides});
  return {env, db, clock, now, epoch, store, calls, success, run};
}

test('cached access token needs no provider, key or transport and exposes no refresh token', async () => {
  const f = await fixture(500);
  delete f.env.SHOPEE_FINANCE_PARTNER_KEY;
  assert.deepEqual(await f.run({fetchImpl: undefined}), {access_token: ACCESS, expires_at: f.epoch() + 500, revision: 1});
  assert.equal(f.calls.length, 0);
});

test('refresh rotates the encrypted pair atomically and the next refresh uses its replacement', async () => {
  const f = await fixture();
  const first = await f.run();
  assert.deepEqual(first, {access_token: ACCESS + '-1', expires_at: f.epoch() + 14400, revision: 2});
  assert.equal(f.calls[0].refresh_token, REFRESH);
  assert.deepEqual(await f.store.readTokens(), {...first, refresh_token: REFRESH + '-1'});
  const row = f.db.db.prepare('SELECT * FROM finance_connections').get();
  for (const secret of [ACCESS, REFRESH, KEY]) assert.ok(!JSON.stringify(row).includes(secret));
  assert.deepEqual(await f.run(), first); assert.equal(f.calls.length, 1);
  f.clock.milliseconds += 14300000;
  const second = await f.run();
  assert.equal(second.revision, 3); assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].refresh_token, REFRESH + '-1');
  assert.equal((await f.store.readTokens()).refresh_token, REFRESH + '-2');
});

test('concurrent callers issue only one provider POST and do not invalidate its lease', async () => {
  const f = await fixture();
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const first = f.run({fetchImpl: async request => { entered(); await gate; return f.success(request); }});
  await started;
  await assert.rejects(f.run(), {code: 'FINANCE_REFRESH_IN_PROGRESS', status: 409});
  assert.equal((await f.store.status()).status, 'REFRESHING');
  release(); assert.equal((await first).revision, 2); assert.equal(f.calls.length, 1);
});

test('missing finance key never falls back to the Ads key or consumes a lease', async () => {
  const f = await fixture();
  f.env.SHOPEE_PARTNER_KEY = KEY; delete f.env.SHOPEE_FINANCE_PARTNER_KEY;
  await assert.rejects(f.run(), {code: 'FINANCE_REFRESH_SIGNING_KEY_CONFIGURATION'});
  assert.equal((await f.store.status()).status, 'CONNECTED');
  assert.equal((await f.store.readTokens()).refresh_token, REFRESH); assert.equal(f.calls.length, 0);
});

test('invalid transport or options are rejected before a lease and preserve the pair', async () => {
  for (const options of [{fetchImpl: undefined}, {timeoutMs: 0}, {timeoutMs: 10001},
    {minValiditySeconds: -1}, {minValiditySeconds: 14401}, {now: () => NaN}]) {
    const f = await fixture();
    await assert.rejects(f.run(options));
    assert.equal((await f.store.status()).status, 'CONNECTED');
    assert.equal((await f.store.readTokens()).refresh_token, REFRESH); assert.equal(f.calls.length, 0);
  }
});

test('missing connection and prior quarantine require authorization without fetching', async () => {
  const f = await fixture(null);
  await assert.rejects(f.run(), {code: 'FINANCE_AUTHORIZATION_REQUIRED'}); assert.equal(f.calls.length, 0);
});

test('expired access token can still acquire the single-use refresh lease', async () => {
  const f = await fixture(1); f.clock.milliseconds += 2000;
  assert.equal((await f.run()).revision, 2); assert.equal(f.calls.length, 1);
});

test('provider or protocol failure quarantines the pair and subsequent calls cannot retry it', async () => {
  const providers = [
    async () => { throw new Error(REFRESH); },
    async () => Response.json({error: REFRESH, message: KEY, request_id: ACCESS}),
    async () => Response.json({error: '', message: '', request_id: '', ...FINANCE_PROFILE,
      shop_id: 1, access_token: ACCESS, refresh_token: REFRESH + 'new', expire_in: 14400}),
    async () => new Response('private-' + REFRESH, {headers: {'content-type': 'application/json'}}),
  ];
  for (const provider of providers) {
    const f = await fixture(); let attempts = 0;
    await assert.rejects(f.run({fetchImpl: async request => { attempts++; return provider(request); }}), failure => {
      for (const value of [REFRESH, KEY, ACCESS]) assert.ok(!String(failure).includes(value));
      return true;
    });
    assert.equal((await f.store.status()).status, 'REAUTH_REQUIRED');
    assert.equal(await f.store.readTokens(), null);
    await assert.rejects(f.run(), {code: 'FINANCE_AUTHORIZATION_REQUIRED'}); assert.equal(attempts, 1);
    const row = f.db.db.prepare('SELECT * FROM finance_connections').get();
    assert.equal(row.ciphertext, null); assert.equal(row.iv, null);
  }
});

test('a timeout aborts once, quarantines and cannot save a late provider result', async () => {
  const f = await fixture(); let release, signal;
  const late = new Promise(resolve => { release = resolve; });
  const running = f.run({timeoutMs: 10, fetchImpl: async request => { signal = request.signal; return late; }});
  await assert.rejects(running, {code: 'FINANCE_REFRESH_TIMEOUT', status: 504});
  assert.equal(signal.aborted, true); assert.equal((await f.store.status()).status, 'REAUTH_REQUIRED');
  release(Response.json({error: '', message: '', request_id: 'fixture', ...FINANCE_PROFILE,
    access_token: ACCESS + 'late', refresh_token: REFRESH + 'late', expire_in: 14400}));
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(await f.store.readTokens(), null); assert.equal((await f.store.status()).revision, 1);
});

test('a lease that expires during the POST cannot persist a provider result', async () => {
  const f = await fixture();
  await assert.rejects(f.run({fetchImpl: async request => {
    const response = await f.success(request); f.clock.milliseconds += 61000; return response;
  }}), {code: 'FINANCE_REFRESH_CONFLICT', status: 409});
  assert.equal((await f.store.status()).status, 'REAUTH_REQUIRED'); assert.equal(await f.store.readTokens(), null);
});
