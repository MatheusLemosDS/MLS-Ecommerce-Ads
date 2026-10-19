import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {runFinancePaymentSample} from '../src/payment-sample.mjs';

const KEY = 'fixture-private-key-ç';
const ACCESS = 'fixture-private-access';
const REFRESH = 'fixture-private-refresh';
const SERIAL = 'FIXTURE_PRIVATE_ORDER';
const paths = ['/api/v2/order/get_order_list', '/api/v2/order/get_order_detail', '/api/v2/payment/get_escrow_detail'];
const payloads = () => [
  {error: '', response: {order_list: [{order_sn: SERIAL}], more: true}},
  {error: '', response: {order_list: [{order_sn: SERIAL, order_status: 'COMPLETED', currency: 'BRL',
    buyer_username: 'PRIVATE_BUYER', item_list: [{item_name: 'PRIVATE_PRODUCT'}]}]}},
  {error: '', response: {order_sn: SERIAL, buyer_user_name: 'PRIVATE_BUYER', order_income: {
    escrow_amount: 78.91, original_cost_of_goods_sold: 98.76, commission_fee: 9.87, service_fee: 1.23,
    seller_transaction_fee: 2.34, actual_shipping_fee: 5.67, secret: KEY, items: [
      {item_id: 123456, model_id: 0, line_item_id: 'PRIVATE_LINE', quantity_purchased: 2,
        original_price: 50.5, selling_price: 45.5, is_kit: false, buyer: 'PRIVATE_BUYER'},
      {item_id: 'PRIVATE_ITEM', model_id: 0, quantity_purchased: 1, kit_items: {private: KEY}},
    ],
  }}},
];

async function fixture(ttl = 500, nowValue = Date.UTC(2026, 9, 19, 1, 30)) {
  const db = new D1();
  const clock = {milliseconds: nowValue};
  const now = () => clock.milliseconds;
  const epoch = () => Math.floor(now() / 1000);
  const env = {FINANCE_DB: db, FINANCE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64'),
    SHOPEE_FINANCE_PARTNER_KEY: KEY, FINANCE_CONNECTION_ENABLED: 'true'};
  const store = await createFinanceStore(env, {now});
  await store.setup();
  if (ttl !== null) await store.saveTokens({access_token: ACCESS, refresh_token: REFRESH, expires_at: epoch() + ttl});
  const calls = [];
  const responses = payloads();
  const fetchImpl = async request => {
    calls.push(request);
    return Response.json(responses[calls.length - 1]);
  };
  const run = (overrides = {}) => runFinancePaymentSample(env, {now, fetchImpl, ...overrides});
  return {db, clock, now, epoch, env, store, calls, responses, fetchImpl, run};
}

const safe = code => failure => {
  assert.equal(failure.code, code);
  const exported = String(failure) + JSON.stringify(failure);
  for (const value of [KEY, ACCESS, REFRESH, SERIAL, 'PRIVATE_BUYER']) assert.ok(!exported.includes(value));
  return true;
};

test('one completed BRL sample uses three signed Global Shop GETs and exports fixed schema only', async () => {
  const f = await fixture();
  const before = f.db.db.prepare('SELECT * FROM finance_connections').get();
  const result = await f.run();
  assert.equal(result.status, 'VALIDATED'); assert.equal(result.identity_match, true);
  assert.equal(result.schema_version, 1); assert.equal(result.token_revision, 1);
  assert.equal(result.checked_at, f.epoch()); assert.equal(result.item_count, 2);
  assert.deepEqual(result.item_fields.find(field => field.name === 'item_id'), {name: 'item_id', type: 'mixed'});
  assert.deepEqual(result.fields.find(field => field.name === 'escrow_amount'), {name: 'escrow_amount', type: 'number'});
  assert.equal(f.calls.length, 3);
  for (let index = 0; index < f.calls.length; index++) {
    const request = f.calls[index]; const url = new URL(request.url);
    assert.equal(url.origin, 'https://partner.shopeemobile.com'); assert.equal(url.pathname, paths[index]);
    assert.equal(request.method, 'GET'); assert.equal(request.redirect, 'manual');
    assert.equal(request.headers.get('cookie'), null); assert.equal(request.headers.get('authorization'), null);
    assert.equal(await request.clone().text(), '');
    assert.equal(url.searchParams.get('partner_id'), '2049333'); assert.equal(url.searchParams.get('shop_id'), '1178167501');
    assert.equal(url.searchParams.get('access_token'), ACCESS);
    const stamp = url.searchParams.get('timestamp');
    assert.equal(url.searchParams.get('sign'), createHmac('sha256', KEY)
      .update('2049333' + paths[index] + stamp + ACCESS + '1178167501').digest('hex'));
    assert.ok(!request.url.includes(KEY));
  }
  const list = new URL(f.calls[0].url).searchParams;
  assert.equal(list.get('time_range_field'), 'create_time'); assert.equal(list.get('page_size'), '1');
  assert.equal(list.get('order_status'), 'COMPLETED'); assert.equal(list.get('cursor'), '');
  assert.equal(Number(list.get('time_from')), Date.UTC(2026, 9, 12, 3) / 1000);
  assert.equal(Number(list.get('time_to')), f.epoch());
  assert.equal(new URL(f.calls[1].url).searchParams.get('order_sn_list'), SERIAL);
  assert.equal(new URL(f.calls[2].url).searchParams.get('order_sn'), SERIAL);
  const text = JSON.stringify(result);
  for (const value of [KEY, ACCESS, REFRESH, SERIAL, 'PRIVATE_BUYER', 'PRIVATE_PRODUCT', 'PRIVATE_LINE', 'PRIVATE_ITEM', '78.91', '98.76']) {
    assert.ok(!text.includes(value));
  }
  assert.deepEqual(f.db.db.prepare('SELECT * FROM finance_connections').get(), before);
});

test('empty sample stops after one list request without following cursor or claiming validation', async () => {
  const f = await fixture(); f.responses[0].response = {order_list: [], more: true, next_cursor: SERIAL};
  assert.deepEqual(await f.run(), {schema_version: 1, status: 'EMPTY', checked_at: f.epoch(), token_revision: 1,
    fields: [], item_fields: [], item_count: 0});
  assert.equal(f.calls.length, 1);
});

test('expired access is refreshed once and the resulting revision and access sign all reads', async () => {
  const f = await fixture(1); f.clock.milliseconds += 2000;
  let refreshes = 0; let reads = 0;
  const result = await f.run({fetchImpl: async request => {
    const url = new URL(request.url);
    if (url.pathname === '/api/v2/auth/access_token/get') {
      refreshes++;
      const body = await request.json(); assert.equal(body.refresh_token, REFRESH);
      assert.equal(request.method, 'POST'); assert.equal(request.redirect, 'manual');
      return Response.json({error: '', message: '', request_id: 'fixture', partner_id: 2049333, shop_id: 1178167501,
        access_token: ACCESS + '-new', refresh_token: REFRESH + '-new', expire_in: 14400});
    }
    reads++;
    assert.equal(url.searchParams.get('access_token'), ACCESS + '-new');
    assert.equal(url.searchParams.get('sign'), createHmac('sha256', KEY)
      .update('2049333' + url.pathname + url.searchParams.get('timestamp') + ACCESS + '-new1178167501').digest('hex'));
    return Response.json(f.responses[reads - 1]);
  }});
  assert.equal(refreshes, 1); assert.equal(reads, 3); assert.equal(result.token_revision, 2);
  assert.equal((await f.store.readTokens()).refresh_token, REFRESH + '-new');
});

test('invalid configuration and disconnected state produce no provider requests', async () => {
  for (const change of [env => {delete env.SHOPEE_FINANCE_PARTNER_KEY; env.SHOPEE_PARTNER_KEY = KEY;},
    env => {env.SHOPEE_FINANCE_PARTNER_KEY = 'bad\nkey';}, env => {env.FINANCE_CONNECTION_ENABLED = 'false';}]) {
    const f = await fixture(1); change(f.env);
    await assert.rejects(f.run()); assert.equal(f.calls.length, 0);
    assert.equal((await f.store.status()).status, 'CONNECTED');
  }
  const f = await fixture(null);
  await assert.rejects(f.run(), safe('FINANCE_AUTHORIZATION_REQUIRED')); assert.equal(f.calls.length, 0);
});

test('bad list, detail identity, status or currency stop before Payment', async () => {
  const cases = [
    [0, {order_list: [{order_sn: SERIAL}, {order_sn: SERIAL}]}, 'LIST_RESPONSE_INVALID', 1],
    [0, {order_list: [{order_sn: 'A,B'}]}, 'LIST_RESPONSE_INVALID', 1],
    [0, {order_list: [{order_sn: 'bad\nserial'}]}, 'LIST_RESPONSE_INVALID', 1],
    [0, {order_list: {}}, 'LIST_RESPONSE_INVALID', 1],
    [1, {order_list: []}, 'DETAIL_RESPONSE_INVALID', 2],
    [1, {order_list: [{order_sn: 'OTHER'}]}, 'DETAIL_IDENTITY_MISMATCH', 2],
    [1, {order_list: [{order_sn: SERIAL, order_status: 'SHIPPED', currency: 'BRL'}]}, 'DETAIL_STATUS_MISMATCH', 2],
    [1, {order_list: [{order_sn: SERIAL, order_status: 'COMPLETED', currency: 'USD'}]}, 'DETAIL_CURRENCY_MISMATCH', 2],
  ];
  for (const [index, value, suffix, calls] of cases) {
    const f = await fixture(); f.responses[index].response = value;
    await assert.rejects(f.run(), safe('FINANCE_SAMPLE_' + suffix)); assert.equal(f.calls.length, calls);
  }
});

test('escrow requires a matching identity echo and a bounded object income/item schema', async () => {
  const cases = [
    [{order_income: {}}, 'PAYMENT_IDENTITY_MISMATCH'],
    [{order_sn: 'OTHER', order_income: {}}, 'PAYMENT_IDENTITY_MISMATCH'],
    [{order_sn: SERIAL, order_income: {order_sn: 'OTHER'}}, 'PAYMENT_IDENTITY_MISMATCH'],
    [{order_sn: SERIAL, order_income: []}, 'PAYMENT_RESPONSE_INVALID'],
    [{order_sn: SERIAL, order_income: {items: {}}}, 'PAYMENT_RESPONSE_INVALID'],
    [{order_sn: SERIAL, order_income: {items: [null]}}, 'PAYMENT_RESPONSE_INVALID'],
    [{order_sn: SERIAL, order_income: {items: Array.from({length: 1001}, () => ({}))}}, 'PAYMENT_RESPONSE_INVALID'],
  ];
  for (const [response, suffix] of cases) {
    const f = await fixture(); f.responses[2].response = response;
    await assert.rejects(f.run(), safe('FINANCE_SAMPLE_' + suffix)); assert.equal(f.calls.length, 3);
    assert.equal((await f.store.status()).status, 'CONNECTED');
  }
  const f = await fixture(); f.responses[2].response = {order_income: {order_sn: SERIAL}};
  assert.equal((await f.run()).identity_match, true);
});

test('scope echoes and exact API permission errors fail closed without leaking provider data', async () => {
  for (let index = 0; index < 3; index++) {
    for (const [field, value] of [['shop_id', 1], ['partner_id', 2047569], ['shop_id', '1178167501']]) {
      const f = await fixture(); f.responses[index].response[field] = value;
      await assert.rejects(f.run(), safe('FINANCE_SAMPLE_' + ['LIST', 'DETAIL', 'PAYMENT'][index] + '_IDENTITY_MISMATCH'));
      assert.equal(f.calls.length, index + 1);
    }
    const f = await fixture(); f.responses[index] = {error: 'error_api_permission', message: KEY};
    await assert.rejects(f.run(), safe('FINANCE_SAMPLE_' + ['LIST', 'DETAIL', 'PAYMENT'][index] + '_API_PERMISSION_REJECTED'));
    assert.equal(f.calls.length, index + 1);
  }
  const f = await fixture(); f.responses[0] = {error: KEY, message: ACCESS};
  await assert.rejects(f.run(), safe('FINANCE_SAMPLE_LIST_API_ERROR'));
});

test('HTTP failures, redirects and malformed transport never retry or change connection', async () => {
  const providers = [
    () => Response.json({error: 'error_api_permission', message: KEY}, {status: 403}),
    () => new Response(KEY, {status: 302, headers: {location: 'https://other.invalid'}}),
    () => new Response(KEY, {status: 429}),
    () => new Response(KEY, {headers: {'content-type': 'text/html'}}),
    () => new Response(' '.repeat(65537), {headers: {'content-type': 'application/json'}}),
    () => new Response(new Uint8Array([0xff]), {headers: {'content-type': 'application/json'}}),
    () => { throw Error(KEY); },
  ];
  for (const provider of providers) {
    const f = await fixture(); let attempts = 0;
    await assert.rejects(f.run({fetchImpl: async () => { attempts++; return provider(); }}), failure => {
      assert.ok(failure.code.startsWith('FINANCE_SAMPLE_LIST_'));
      for (const value of [KEY, ACCESS, REFRESH, SERIAL]) assert.ok(!(String(failure) + JSON.stringify(failure)).includes(value));
      return true;
    });
    assert.equal(attempts, 1); assert.equal((await f.store.status()).status, 'CONNECTED');
  }
});

test('HTTP 403 preserves finite permission/signature diagnostics and HTTP status without provider values', async () => {
  for (let index = 0; index < 3; index++) {
    for (const [providerCode, suffix] of [
      ['error_api_permission', 'API_PERMISSION_REJECTED'], ['error_sign', 'API_SIGNATURE_REJECTED'],
      ['error_param', 'API_PARAMETER_REJECTED'], ['error_auth', 'API_AUTHORIZATION_REJECTED'],
      ['error_partner_id', 'API_PARTNER_REJECTED'], [KEY, 'UPSTREAM_HTTP'],
    ]) {
      const f = await fixture(); let calls = 0;
      await assert.rejects(f.run({fetchImpl: async () => {
        const current = calls++;
        return current === index
          ? Response.json({error: providerCode, message: KEY, request_id: ACCESS,
            response: {order_sn: SERIAL, secret: REFRESH}}, {status: 403})
          : Response.json(f.responses[current]);
      }}), failure => {
        safe('FINANCE_SAMPLE_' + ['LIST', 'DETAIL', 'PAYMENT'][index] + '_' + suffix)(failure);
        assert.equal(failure.upstream_status, 403);
        assert.equal(failure.status, 502);
        return true;
      });
      assert.equal(calls, index + 1);
      assert.equal((await f.store.status()).status, 'CONNECTED');
    }
  }
});

test('deadline aborts a stalled GET and ignores its late response', async () => {
  const f = await fixture(); let attempts = 0; let captured; let release;
  const pending = f.run({timeoutMs: 20, fetchImpl: request => {
    attempts++; captured = request; return new Promise(resolve => { release = resolve; });
  }});
  await assert.rejects(pending, safe('FINANCE_SAMPLE_LIST_TIMEOUT'));
  assert.equal(attempts, 1); assert.equal(captured.signal.aborted, true);
  release(Response.json(f.responses[0]));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(attempts, 1); assert.equal((await f.store.status()).status, 'CONNECTED');
});

test('each Shop request has a fresh timestamp and an expired token is never reused', async () => {
  const f = await fixture(); const seen = [];
  await f.run({fetchImpl: async request => {
    seen.push(Number(new URL(request.url).searchParams.get('timestamp')));
    const response = Response.json(f.responses[seen.length - 1]);
    f.clock.milliseconds += 1000;
    return response;
  }});
  assert.equal(seen[1], seen[0] + 1); assert.equal(seen[2], seen[0] + 2);
  const expiring = await fixture(121); let calls = 0;
  await assert.rejects(expiring.run({fetchImpl: async () => {
    calls++; expiring.clock.milliseconds += 122000;
    return Response.json(expiring.responses[0]);
  }}), safe('FINANCE_SAMPLE_AUTHORIZATION_EXPIRED'));
  assert.equal(calls, 1);
});
