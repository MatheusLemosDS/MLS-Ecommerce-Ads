import test from 'node:test';
import assert from 'node:assert/strict';
import defaultWorker, {createFinanceWorker} from '../src/connection-worker.mjs';
import {FINANCE_PROFILE, FinanceConnectionError, createFinanceStore} from '../src/connection-store.mjs';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';

const ORIGIN = 'https://auth.brazacommerce.com.br';
const PREFIX = '/shopee/finance';
const ROUTER_SECRET = 'fixture-finance-router-' + 'x'.repeat(40);
const SECRET_HEADER = 'X-Braza-Finance-Router';
const PRIVATE_ACCESS = 'fixture-private-access-token';
const PRIVATE_REFRESH = 'fixture-private-refresh-token';
const PRIVATE_CODE = 'fixture-private-code';
const cookieName = 'braza_finance_oauth';

function fixture() {
  const db = new D1();
  // D1 batches execute atomically and serially at the database boundary.
  let queue = Promise.resolve();
  const originalBatch = db.batch.bind(db);
  db.batch = statements => {
    const next = queue.then(() => originalBatch(statements));
    queue = next.catch(() => {});
    return next;
  };
  let databaseAccesses = 0;
  const originalPrepare = db.prepare.bind(db);
  db.prepare = sql => { databaseAccesses++; return originalPrepare(sql); };
  const clock = {milliseconds: 1800000000000};
  const env = {
    FINANCE_DB: db,
    FINANCE_ROUTER_SECRET: ROUTER_SECRET,
    FINANCE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  };
  const calls = [];
  const authorizationCalls = [];
  const adapter = {
    isReady: () => true,
    authorizationUrl(params) {
      authorizationCalls.push(params);
      const url = new URL('https://open.shopee.com/auth');
      for (const [key, value] of Object.entries({partner_id: params.partner_id,
        auth_type: 'seller', redirect_uri: params.redirect_uri, response_type: 'code', state: params.state})) url.searchParams.set(key, String(value));
      return url.toString();
    },
    async exchange(params) {
      calls.push(params);
      return {access_token: PRIVATE_ACCESS, refresh_token: PRIVATE_REFRESH, expires_at: Math.floor(clock.milliseconds / 1000) + 14400};
    },
  };
  const worker = createFinanceWorker({adapter, now: () => clock.milliseconds});
  const request = (path, {method = 'GET', headers = {}, origin = ORIGIN} = {}) => new Request(origin + path, {
    method,
    headers: {[SECRET_HEADER]: ROUTER_SECRET, ...headers},
  });
  const run = (path, options) => worker.fetch(request(path, options), env);
  const store = async () => { const result = await createFinanceStore(env, {now: () => clock.milliseconds}); await result.setup(); return result; };
  return {db, env, clock, adapter, worker, calls, authorizationCalls, request, run, store, accesses: () => databaseAccesses};
}

async function begin(ctx) {
  const response = await ctx.run(PREFIX + '/connect');
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('Location'));
  return {response, state: location.searchParams.get('state'), cookie: response.headers.get('Set-Cookie').split(';', 1)[0], location};
}

function callbackPath(session, changes = {}) {
  const params = new URLSearchParams({state: session.state, code: PRIVATE_CODE, shop_id: String(FINANCE_PROFILE.shop_id), ...changes});
  return PREFIX + '/callback?' + params;
}

function assertSafe(response, body, {callback = false} = {}) {
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(response.headers.get('Content-Security-Policy'), /default-src 'none'/);
  for (const secret of [PRIVATE_ACCESS, PRIVATE_REFRESH, PRIVATE_CODE, ROUTER_SECRET]) assert.ok(!body.includes(secret));
  if (callback) assert.match(response.headers.get('Set-Cookie'), /braza_finance_oauth=;.*Max-Age=0;.*HttpOnly; Secure; SameSite=Lax/);
}

test('the default worker has no provider adapter and never issues or consumes a nonce', async () => {
  const ctx = fixture();
  for (const path of [PREFIX + '/connect', PREFIX + '/callback?state=PRIVATE']) {
    const response = await defaultWorker.fetch(ctx.request(path), ctx.env);
    assert.equal(response.status, 503);
    assertSafe(response, await response.text(), {callback: path.includes('/callback')});
  }
  assert.equal(ctx.accesses(), 0);
  assert.equal(ctx.calls.length, 0);
});

test('missing adapter readiness, credentials or database cannot start authorization', async () => {
  for (const setting of ['missing', 'false', 'throws', 'async', 'method']) {
    const ctx = fixture();
    if (setting === 'missing') delete ctx.adapter.isReady;
    if (setting === 'false') ctx.adapter.isReady = () => false;
    if (setting === 'throws') ctx.adapter.isReady = () => { throw new Error(PRIVATE_REFRESH); };
    if (setting === 'async') ctx.adapter.isReady = async () => true;
    if (setting === 'method') delete ctx.adapter.exchange;
    const response = await ctx.run(PREFIX + '/connect');
    assert.equal(response.status, 503);
    assertSafe(response, await response.text());
    assert.equal(ctx.accesses(), 0);
  }
  for (const key of ['FINANCE_DB', 'FINANCE_TOKEN_ENCRYPTION_KEY']) {
    const ctx = fixture(); delete ctx.env[key];
    const response = await ctx.run(PREFIX + '/connect');
    assert.equal(response.status, 503); assert.equal(ctx.authorizationCalls.length, 0);
  }
});

test('the service binding secret is exclusive, validated before storage, and never returned', async () => {
  for (const value of [undefined, '', 'short']) {
    const ctx = fixture(); ctx.env.FINANCE_ROUTER_SECRET = value;
    const response = await ctx.run(PREFIX + '/status');
    assert.equal(response.status, 503); assert.equal(ctx.accesses(), 0);
  }
  for (const headers of [
    {[SECRET_HEADER]: ''}, {[SECRET_HEADER]: ROUTER_SECRET + 'x'},
    {[SECRET_HEADER]: 'x'.repeat(513)}, {[SECRET_HEADER]: '', 'X-Braza-Orders-Secret': ROUTER_SECRET},
    {[SECRET_HEADER]: '', Authorization: 'Bearer ' + ROUTER_SECRET}, {[SECRET_HEADER]: '', Cookie: 'session=' + ROUTER_SECRET},
  ]) {
    const ctx = fixture();
    const response = await ctx.run(PREFIX + '/status', {headers});
    assert.equal(response.status, 403); assert.equal(ctx.accesses(), 0);
    assertSafe(response, await response.text());
  }
});

test('untrusted hosts, protocol, ports, Ads paths and methods are rejected before database access', async () => {
  const ctx = fixture();
  for (const origin of ['https://private-finance.workers.dev', 'http://auth.brazacommerce.com.br', 'https://auth.brazacommerce.com.br:444', 'https://auth.brazacommerce.com.br.evil.invalid']) {
    const response = await ctx.run(PREFIX + '/connect', {origin});
    assert.equal(response.status, 404);
  }
  for (const path of ['/shopee/connect', '/shopee/callback', '/api/ads', PREFIX, PREFIX + '/status/']) assert.equal((await ctx.run(path)).status, 404);
  for (const method of ['POST', 'HEAD', 'DELETE', 'OPTIONS']) assert.equal((await ctx.run(PREFIX + '/connect', {method})).status, 405);
  assert.equal(ctx.accesses(), 0);
  assert.equal(ctx.calls.length, 0);
});

test('connect generates a browser-bound state, fixed callback and pinned finance profile', async () => {
  const ctx = fixture(), session = await begin(ctx);
  assert.equal(session.location.origin, 'https://open.shopee.com');
  assert.equal(session.location.pathname, '/auth');
  const redirect = new URL(session.location.searchParams.get('redirect_uri'));
  assert.equal(redirect.origin + redirect.pathname, ORIGIN + PREFIX + '/callback');
  assert.equal(redirect.search, '');
  assert.equal(session.location.searchParams.get('state'), session.state);
  assert.equal(session.location.searchParams.get('auth_type'), 'seller');
  assert.equal(session.location.searchParams.get('response_type'), 'code');
  assert.equal(session.location.searchParams.get('partner_id'), '2049333');
  assert.equal(session.location.searchParams.has('shop_id'), false);
  assert.match(session.state, /^[A-Za-z0-9_-]{43}$/);
  assert.match(session.response.headers.get('Set-Cookie'), /Path=\/shopee\/finance; Max-Age=600; HttpOnly; Secure; SameSite=Lax/);
  const rows = ctx.db.db.prepare('SELECT * FROM finance_oauth_states').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].expires_at - rows[0].issued_at, 600);
  assert.ok(!JSON.stringify(rows).includes(session.state));
  assert.ok(!JSON.stringify(rows).includes(session.cookie.split('=')[1]));
  assert.deepEqual(ctx.authorizationCalls[0], {state: session.state, redirect_uri: ORIGIN + PREFIX + '/callback', partner_id: 2049333, shop_id: 1178167501});
});

test('authorization URL validation pins the Global frontend and exact OAuth fields', async () => {
  const good = state => 'https://open.shopee.com/auth?' + new URLSearchParams({
    partner_id: '2049333', auth_type: 'seller', redirect_uri: ORIGIN + PREFIX + '/callback', response_type: 'code', state});
  const changed = (state, field, value) => { const url = new URL(good(state)); url[field] = value; return url.toString(); };
  const param = (state, field, value) => { const url = new URL(good(state)); url.searchParams.set(field, value); return url.toString(); };
  const bad = [
    state => changed(state, 'hostname', 'evil.invalid'),
    state => changed(state, 'hostname', 'open.shopee.com.br'),
    state => changed(state, 'protocol', 'http:'),
    state => changed(state, 'port', '444'),
    state => changed(state, 'username', 'name'),
    state => changed(state, 'password', 'pass'),
    state => param(state, 'redirect_uri', 'https://evil.invalid/callback'),
    state => param(state, 'redirect_uri', ORIGIN + PREFIX + '/callback?state=' + state),
    state => param(state, 'redirect_uri', ORIGIN + '/shopee/callback'),
    state => param(state, 'auth_type', 'merchant'),
    state => param(state, 'response_type', 'token'),
    state => param(state, 'redirect', ORIGIN + PREFIX + '/callback'),
    state => param(state, 'sign', 'a'.repeat(64)),
    state => param(state, 'timestamp', '1800000000'),
    state => param(state, 'scope', 'shop'),
    state => changed(state, 'pathname', '/api/v2/auth/token/get'),
    state => changed(state, 'pathname', '/auth/'),
    state => changed(state, 'hostname', 'open.shopee.com.evil.invalid'),
    state => 'https://partner.shopeemobile.com/api/v2/shop/auth_partner?' + new URLSearchParams({
      partner_id: '2049333', timestamp: '1800000000', sign: 'a'.repeat(64), redirect: ORIGIN + PREFIX + '/callback?state=' + state}),
    state => 'https://openplatform.shopee.com.br/api/v2/shop/auth_partner?' + new URLSearchParams({
      partner_id: '2049333', timestamp: '1800000000', sign: 'a'.repeat(64), redirect: ORIGIN + PREFIX + '/callback?state=' + state}),
    state => param(state, 'state', ''),
    state => param(state, 'state', state + 'x'),
    state => good(state) + '&state=' + state,
    state => good(state) + '#fragment',
    state => param(state, 'partner_id', '2047569'),
    state => param(state, 'partner_id', ''),
    state => { const url = new URL(good(state)); url.searchParams.delete('partner_id'); return url.toString(); },
    state => good(state) + '&partner_id=2049333',
    state => param(state, 'shop_id', '1178167502'),
    state => good(state) + '&shop_id=1178167501&shop_id=1178167501',
    state => good(state) + '&redirect_uri=' + encodeURIComponent(ORIGIN + PREFIX + '/callback'),
    ...['partner_id', 'auth_type', 'redirect_uri', 'response_type', 'state'].flatMap(field => [
      state => { const url = new URL(good(state)); url.searchParams.delete(field); return url.toString(); },
      state => { const url = new URL(good(state)); url.searchParams.append(field, url.searchParams.get(field)); return url.toString(); },
    ]),
    () => 'https://open.shopee.com/' + 'x'.repeat(4096),
  ];
  for (const makeUrl of bad) {
    const ctx = fixture(); ctx.adapter.authorizationUrl = ({state}) => makeUrl(state);
    const response = await ctx.run(PREFIX + '/connect');
    assert.equal(response.status, 503); assert.equal(response.headers.get('Location'), null);
    assertSafe(response, await response.text()); assert.equal(ctx.calls.length, 0);
  }
});

test('a successful callback exchanges once and persists encrypted tokens while returning clean HTML', async () => {
  const ctx = fixture(), session = await begin(ctx);
  const result = await ctx.run(callbackPath(session), {headers: {Cookie: session.cookie}});
  assert.equal(result.status, 200);
  const body = await result.text();
  assert.match(body, /Conexão financeira concluída/); assertSafe(result, body, {callback: true});
  assert.deepEqual(ctx.calls, [{code: PRIVATE_CODE, shop_id: 1178167501, partner_id: 2049333}]);
  const raw = JSON.stringify(ctx.db.db.prepare('SELECT * FROM finance_connections').all());
  for (const secret of [PRIVATE_ACCESS, PRIVATE_REFRESH, PRIVATE_CODE]) assert.ok(!raw.includes(secret));
  assert.equal(ctx.db.db.prepare('SELECT COUNT(*) n FROM finance_oauth_states').get().n, 0);
  const tokens = await (await ctx.store()).readTokens();
  assert.equal(tokens.access_token, PRIVATE_ACCESS); assert.equal(tokens.refresh_token, PRIVATE_REFRESH);
  assert.equal(tokens.revision, 1);
});

test('callback query validation rejects wrong shop, duplicate fields, unknown fields and control characters without exchange', async () => {
  const ctx = fixture(), session = await begin(ctx);
  const original = callbackPath(session);
  const variants = [
    callbackPath(session, {shop_id: '1178167502'}), callbackPath(session, {shop_id: '01178167501'}),
    callbackPath(session, {state: 'x'}), callbackPath(session, {code: ''}),
    callbackPath(session, {code: 'x'.repeat(1025)}), callbackPath(session, {code: 'secret\ncode'}),
    callbackPath(session, {main_account_id: 'not-an-id'}), callbackPath(session, {main_account_id: '1'.repeat(21)}),
    callbackPath(session, {unexpected: PRIVATE_ACCESS}), original + '&state=' + session.state,
    original + '&code=again', original + '&shop_id=1178167501', original + '&main_account_id=1&main_account_id=2',
    original + '&error=denied', original + '&error=denied&error=again',
  ];
  for (const path of variants) {
    const response = await ctx.run(path, {headers: {Cookie: session.cookie}});
    assert.equal(response.status, 400); assertSafe(response, await response.text(), {callback: true});
  }
  assert.equal(ctx.calls.length, 0);
  assert.equal((await ctx.run(original, {headers: {Cookie: session.cookie}})).status, 200);
});

test('browser cookie must be present, unique, correctly named, bounded and match the state', async () => {
  const ctx = fixture(), session = await begin(ctx), other = await begin(ctx);
  for (const cookie of ['', 'session=' + session.cookie.split('=')[1], session.cookie + '; ' + session.cookie, cookieName + '=x', cookieName + '=' + 'x'.repeat(4097), other.cookie]) {
    const response = await ctx.run(callbackPath(session), {headers: {Cookie: cookie}});
    assert.equal(response.status, 400); assertSafe(response, await response.text(), {callback: true});
  }
  assert.equal(ctx.calls.length, 0);
  assert.equal((await ctx.run(callbackPath(session), {headers: {Cookie: 'other=valid; ' + session.cookie}})).status, 200);
});

test('expired state and nonce replay never call the provider again', async () => {
  const ctx = fixture(), session = await begin(ctx);
  ctx.clock.milliseconds += 600000;
  const expired = await ctx.run(callbackPath(session), {headers: {Cookie: session.cookie}});
  assert.equal(expired.status, 400); assert.equal(ctx.calls.length, 0);
  const next = await begin(ctx);
  assert.equal((await ctx.run(callbackPath(next), {headers: {Cookie: next.cookie}})).status, 200);
  const replay = await ctx.run(callbackPath(next), {headers: {Cookie: next.cookie}});
  assert.equal(replay.status, 400); assert.equal(ctx.calls.length, 1);
});

test('concurrent callbacks sharing one nonce execute the adapter exactly once', async () => {
  const ctx = fixture(), session = await begin(ctx);
  let entered, release;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  const releasePromise = new Promise(resolve => { release = resolve; });
  const actual = ctx.adapter.exchange;
  ctx.adapter.exchange = async params => { const result = await actual(params); entered(); await releasePromise; return result; };
  const first = ctx.run(callbackPath(session), {headers: {Cookie: session.cookie}});
  await enteredPromise;
  const second = await ctx.run(callbackPath(session), {headers: {Cookie: session.cookie}});
  assert.equal(second.status, 400); assert.equal(ctx.calls.length, 1);
  release(); assert.equal((await first).status, 200);
});

test('different browser states for the same finance profile cannot exchange tokens concurrently', async () => {
  const ctx = fixture(), firstSession = await begin(ctx), otherSession = await begin(ctx);
  let entered, release;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  const releasePromise = new Promise(resolve => { release = resolve; });
  const actual = ctx.adapter.exchange;
  ctx.adapter.exchange = async params => { const result = await actual(params); entered(); await releasePromise; return result; };
  const first = ctx.run(callbackPath(firstSession), {headers: {Cookie: firstSession.cookie}});
  await enteredPromise;
  const other = await ctx.run(callbackPath(otherSession), {headers: {Cookie: otherSession.cookie}});
  assert.equal(other.status, 409); assert.equal(ctx.calls.length, 1);
  const inFlight = await (await ctx.run(PREFIX + '/status')).json();
  assert.equal(inFlight.status, 'AUTHORIZING'); assert.equal(inFlight.connected, false);
  assert.equal(inFlight.revision, 0);
  release(); assert.equal((await first).status, 200);
  assert.equal((await ctx.run(callbackPath(otherSession), {headers: {Cookie: otherSession.cookie}})).status, 400);
  assert.equal(ctx.calls.length, 1);
  const tokens = await (await ctx.store()).readTokens();
  assert.equal(tokens.access_token, PRIVATE_ACCESS); assert.equal(tokens.revision, 1);
});

test('authorization and refresh leases exclude each other before any second provider call', async () => {
  const ctx = fixture(), initial = await begin(ctx);
  assert.equal((await ctx.run(callbackPath(initial), {headers: {Cookie: initial.cookie}})).status, 200);
  const store = await ctx.store();
  const lease = await store.claimRefresh(1);
  const session = await begin(ctx);
  const response = await ctx.run(callbackPath(session), {headers: {Cookie: session.cookie}});
  assert.equal(response.status, 409); assert.equal(ctx.calls.length, 1);
  const status = await (await ctx.run(PREFIX + '/status')).json();
  assert.equal(status.status, 'REFRESHING');
  await store.completeRefresh(lease, {access_token: 'fixture-rotated-access', refresh_token: 'fixture-rotated-refresh', expires_at: Math.floor(ctx.clock.milliseconds / 1000) + 14400});
  const tokens = await store.readTokens();
  assert.equal(tokens.revision, 2); assert.equal(tokens.access_token, 'fixture-rotated-access');
});

test('reconnection increments the existing profile revision and an expired issuance lease cannot persist tokens', async () => {
  const ctx = fixture(), initial = await begin(ctx);
  assert.equal((await ctx.run(callbackPath(initial), {headers: {Cookie: initial.cookie}})).status, 200);
  const second = await begin(ctx);
  ctx.adapter.exchange = async params => {
    ctx.calls.push(params);
    return {access_token: 'fixture-second-access', refresh_token: 'fixture-second-refresh', expires_at: Math.floor(ctx.clock.milliseconds / 1000) + 14400};
  };
  assert.equal((await ctx.run(callbackPath(second), {headers: {Cookie: second.cookie}})).status, 200);
  assert.equal((await (await ctx.store()).readTokens()).revision, 2);
  const third = await begin(ctx), actual = ctx.adapter.exchange;
  ctx.adapter.exchange = async params => { const result = await actual(params); ctx.clock.milliseconds += 61000; return result; };
  const stale = await ctx.run(callbackPath(third), {headers: {Cookie: third.cookie}});
  assert.equal(stale.status, 409); assertSafe(stale, await stale.text(), {callback: true});
  const status = await (await ctx.run(PREFIX + '/status')).json();
  assert.equal(status.status, 'REAUTH_REQUIRED'); assert.equal(status.connected, false);
  assert.equal(await (await ctx.store()).readTokens(), null);
  const raw = ctx.db.db.prepare('SELECT ciphertext,iv FROM finance_connections').get();
  assert.equal(raw.ciphertext, null); assert.equal(raw.iv, null);
});

test('status exposes only the safe connection projection, even when the default provider is absent', async () => {
  const ctx = fixture();
  const disconnected = await defaultWorker.fetch(ctx.request(PREFIX + '/status'), ctx.env);
  assert.equal(disconnected.status, 200);
  assert.deepEqual(Object.keys(await disconnected.json()).sort(), ['connected', 'status', 'revision', 'expires_at', 'partner_id', 'shop_id'].sort());
  const session = await begin(ctx); await ctx.run(callbackPath(session), {headers: {Cookie: session.cookie}});
  const result = await ctx.run(PREFIX + '/status'), body = await result.text();
  assertSafe(result, body);
  assert.deepEqual(JSON.parse(body), {connected: true, status: 'CONNECTED', revision: 1, expires_at: Math.floor(ctx.clock.milliseconds / 1000) + 14400, partner_id: 2049333, shop_id: 1178167501});
});

test('unknown upstream error text never appears in HTML or JSON and a consumed state cannot retry exchange', async () => {
  const ctx = fixture(), session = await begin(ctx);
  ctx.adapter.exchange = async params => { ctx.calls.push(params); throw new Error(PRIVATE_ACCESS + PRIVATE_REFRESH + PRIVATE_CODE); };
  const response = await ctx.run(callbackPath(session), {headers: {Cookie: session.cookie}});
  assert.equal(response.status, 503); assertSafe(response, await response.text(), {callback: true});
  assert.equal((await ctx.run(callbackPath(session), {headers: {Cookie: session.cookie}})).status, 400);
  assert.equal(ctx.calls.length, 1);
  const status = await (await ctx.run(PREFIX + '/status')).json();
  assert.equal(status.status, 'REAUTH_REQUIRED'); assert.equal(status.connected, false);
});

test('invalid adapter token output is rejected before plaintext reaches storage or responses', async () => {
  for (const tokens of [null, {}, {access_token: PRIVATE_ACCESS, refresh_token: PRIVATE_REFRESH, expires_at: 1}, {access_token: PRIVATE_ACCESS, refresh_token: PRIVATE_REFRESH, expires_at: '1800014400'}]) {
    const ctx = fixture(), session = await begin(ctx);
    ctx.adapter.exchange = async () => tokens;
    const response = await ctx.run(callbackPath(session), {headers: {Cookie: session.cookie}});
    assert.equal(response.status, 503); assertSafe(response, await response.text(), {callback: true});
    assert.equal((await (await ctx.run(PREFIX + '/status')).json()).status, 'REAUTH_REQUIRED');
    assert.equal(ctx.db.db.prepare('SELECT ciphertext FROM finance_connections').get().ciphertext, null);
  }
});

test('callback diagnostics disclose only fixed exchange or persistence categories and never permit replay', async () => {
  const cases = [
    ['FINANCE_INITIAL_EXCHANGE_API_SIGNATURE_REJECTED', undefined, 'FINANCE_INITIAL_EXCHANGE_API_SIGNATURE_REJECTED'],
    ['FINANCE_INITIAL_EXCHANGE_API_CODE_REJECTED', undefined, 'FINANCE_INITIAL_EXCHANGE_API_CODE_REJECTED'],
    ['FINANCE_INITIAL_EXCHANGE_RESPONSE_INVALID', undefined, 'FINANCE_INITIAL_EXCHANGE_RESPONSE_INVALID'],
    ['FINANCE_STORAGE_UNAVAILABLE', undefined, 'FINANCE_STORAGE_UNAVAILABLE'],
    ['FINANCE_INITIAL_EXCHANGE_UPSTREAM_HTTP', 403, 'FINANCE_INITIAL_EXCHANGE_HTTP_403'],
    ['FINANCE_INITIAL_EXCHANGE_UPSTREAM_HTTP', 429, 'FINANCE_INITIAL_EXCHANGE_HTTP_429'],
    ['FINANCE_INITIAL_EXCHANGE_UPSTREAM_HTTP', 302, 'FINANCE_INITIAL_EXCHANGE_HTTP_REDIRECT'],
    ['FINANCE_INITIAL_EXCHANGE_UPSTREAM_HTTP', 502, 'FINANCE_INITIAL_EXCHANGE_HTTP_SERVER'],
    [PRIVATE_CODE + '<script>', undefined, 'CONNECTION_UNAVAILABLE'],
    ['FINANCE_INITIAL_EXCHANGE_UPSTREAM_HTTP', PRIVATE_ACCESS, 'FINANCE_INITIAL_EXCHANGE_UPSTREAM_HTTP'],
  ];
  for (const [code, upstreamStatus, diagnostic] of cases) {
    const ctx = fixture(), session = await begin(ctx);
    ctx.adapter.exchange = async params => {
      ctx.calls.push(params);
      const failure = new FinanceConnectionError(code);
      failure.message = PRIVATE_ACCESS + PRIVATE_REFRESH;
      failure.upstream_status = upstreamStatus;
      throw failure;
    };
    const result = await ctx.run(callbackPath(session), {headers: {Cookie: session.cookie}});
    const body = await result.text();
    assert.equal(result.status, 503);
    assertSafe(result, body, {callback: true});
    assert.ok(body.includes('<code>' + diagnostic + '</code>'));
    assert.equal((await (await ctx.run(PREFIX + '/status')).json()).status, 'REAUTH_REQUIRED');
    assert.equal((await ctx.run(callbackPath(session), {headers: {Cookie: session.cookie}})).status, 400);
    assert.equal(ctx.calls.length, 1);
  }
});

test('HTTP 403 callback distinguishes fixed JSON and HTML categories without exposing arbitrary metadata', async () => {
  for (const detail of ['JSON_SIGNATURE_REJECTED', 'JSON_CODE_REJECTED', 'JSON_AUTHORIZATION_REJECTED', 'JSON_IP_REJECTED',
    'JSON_UNRECOGNIZED', 'HTML_CONTENT_TYPE', 'OTHER_CONTENT_TYPE', PRIVATE_CODE, '<script>private</script>']) {
    const ctx = fixture(), session = await begin(ctx);
    ctx.adapter.exchange = async params => {
      ctx.calls.push(params);
      const error = new FinanceConnectionError('FINANCE_INITIAL_EXCHANGE_UPSTREAM_HTTP');
      error.upstream_status = 403;
      error.upstream_diagnostic = detail;
      error.message = PRIVATE_ACCESS + PRIVATE_REFRESH;
      throw error;
    };
    const result = await ctx.run(callbackPath(session), {headers: {Cookie: session.cookie}});
    const html = await result.text();
    assert.equal(result.status, 503);
    assertSafe(result, html, {callback: true});
    const known = ['JSON_SIGNATURE_REJECTED', 'JSON_CODE_REJECTED', 'JSON_AUTHORIZATION_REJECTED', 'JSON_IP_REJECTED',
      'JSON_UNRECOGNIZED', 'HTML_CONTENT_TYPE', 'OTHER_CONTENT_TYPE'].includes(detail);
    const expected = 'FINANCE_INITIAL_EXCHANGE_HTTP_403' + (known ? '_' + detail : '');
    assert.ok(html.includes('<code>' + expected + '</code>'));
    assert.ok(!html.includes('<script>'));
    assert.equal((await ctx.run(callbackPath(session), {headers: {Cookie: session.cookie}})).status, 400);
    assert.equal(ctx.calls.length, 1);
  }
});

test('URL bounds and unexpected connect/status query parameters are rejected before storage', async () => {
  const ctx = fixture();
  for (const path of [PREFIX + '/connect?state=unexpected', PREFIX + '/status?token=PRIVATE', PREFIX + '/callback?' + 'x'.repeat(4096)]) {
    const response = await ctx.run(path); assert.equal(response.status, 400);
  }
  assert.equal(ctx.accesses(), 0); assert.equal(ctx.calls.length, 0);
});

test('authorization denial consumes its valid state without requesting tokens', async () => {
  const ctx = fixture(), session = await begin(ctx);
  const path = PREFIX + '/callback?' + new URLSearchParams({state: session.state, shop_id: String(FINANCE_PROFILE.shop_id), error: 'access_denied'});
  const response = await ctx.run(path, {headers: {Cookie: session.cookie}});
  assert.equal(response.status, 400); assertSafe(response, await response.text(), {callback: true});
  assert.equal(ctx.calls.length, 0);
  assert.equal((await ctx.run(callbackPath(session), {headers: {Cookie: session.cookie}})).status, 400);
});
