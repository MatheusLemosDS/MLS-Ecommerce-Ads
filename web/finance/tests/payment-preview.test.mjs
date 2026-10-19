import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {runFinancePaymentPreview, runFinancePaymentSample} from '../src/payment-sample.mjs';
import {FINANCE_PREVIEW_SCHEMA, FINANCE_PREVIEW_AMOUNT_FIELDS, projectFinancePaymentPreview} from '../src/payment-preview-frame.mjs';

const KEY = 'fixture-only-preview-key';
const ACCESS = 'fixture-only-preview-access';
const REFRESH = 'fixture-only-preview-refresh';
const SERIAL = 'FIXTURE_ORDER_26';
const paths = ['/api/v2/order/get_order_list', '/api/v2/order/get_order_detail', '/api/v2/payment/get_escrow_detail'];
const income = () => ({escrow_amount: 8990, original_cost_of_goods_sold: 9990, buyer_total_amount: 10190,
  commission_fee: 1000, service_fee: 0, seller_transaction_fee: 200, actual_shipping_fee: -200,
  ads_escrow_top_up_fee_or_technical_support_fee: 0,
  buyer_user_name: 'PRIVATE_BUYER', message: ACCESS, secret: REFRESH,
  items: [{quantity_purchased: 2, original_price: 4995, selling_price: 4495, is_kit: false,
    item_id: 123456, model_id: 789, buyer: 'PRIVATE_BUYER', item_name: 'PRIVATE_PRODUCT', kit_items: {secret: KEY}}]});
const replies = () => [
  {error: '', response: {order_list: [{order_sn: SERIAL}], more: true}},
  {error: '', response: {order_list: [{order_sn: SERIAL, order_status: 'COMPLETED', currency: 'BRL'}]}},
  {error: '', message: KEY, response: {order_sn: SERIAL, buyer_user_name: 'PRIVATE_BUYER', order_income: income()}},
];
const frame = () => ({schema: FINANCE_PREVIEW_SCHEMA, status: 'AVAILABLE', checked_at: 1792405689,
  token_revision: 2, currency: 'BRL', monetary_unit: 'UNCONFIRMED', order_sn: SERIAL, identity_match: true,
  amounts: FINANCE_PREVIEW_AMOUNT_FIELDS.map((name, index) => ({name, value: index ? null : 89.9})),
  items: [{quantity_purchased: 2, original_price: 49.95, selling_price: 44.95, is_kit: false}], item_count: 1});

async function fixture(ttl = 500) {
  const db = new D1(); const clock = {milliseconds: 1792405689000};
  const now = () => clock.milliseconds; const epoch = () => Math.floor(now() / 1000);
  const env = {FINANCE_DB: db, FINANCE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64'),
    SHOPEE_FINANCE_PARTNER_KEY: KEY, FINANCE_CONNECTION_ENABLED: 'true'};
  const store = await createFinanceStore(env, {now}); await store.setup();
  if (ttl !== null) await store.saveTokens({access_token: ACCESS, refresh_token: REFRESH, expires_at: epoch() + ttl});
  const calls = []; const responses = replies();
  const fetchImpl = async request => {calls.push(request); return Response.json(responses[calls.length - 1]);};
  const run = (options = {}) => runFinancePaymentPreview(env, {now, fetchImpl, ...options});
  return {db, clock, now, epoch, env, store, calls, responses, fetchImpl, run};
}

function safeError(expected) {
  return failure => {
    assert.equal(failure.code, expected);
    const text = String(failure) + JSON.stringify(failure);
    for (const value of [KEY, ACCESS, REFRESH, SERIAL, 'PRIVATE_BUYER', 'PRIVATE_PRODUCT']) assert.ok(!text.includes(value));
    return true;
  };
}

test('private one-order preview preserves raw numeric units and signs exactly three fixed Shop GETs', async () => {
  const f = await fixture(); const before = f.db.db.prepare('SELECT * FROM finance_connections').get();
  const result = await f.run({order_sn: 'CALLER_ORDER_IGNORED', origin: 'https://other.invalid'});
  assert.equal(result.schema, FINANCE_PREVIEW_SCHEMA); assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.order_sn, SERIAL); assert.equal(result.identity_match, true);
  assert.equal(result.currency, 'BRL'); assert.equal(result.monetary_unit, 'UNCONFIRMED');
  assert.equal(result.checked_at, f.epoch()); assert.equal(result.token_revision, 1);
  assert.deepEqual(result.amounts, FINANCE_PREVIEW_AMOUNT_FIELDS.map(name => ({name, value: income()[name]})));
  assert.deepEqual(result.items, [{quantity_purchased: 2, original_price: 4995, selling_price: 4495, is_kit: false}]);
  assert.equal(result.item_count, 1); assert.equal(f.calls.length, 3);
  for (let index = 0; index < 3; index++) {
    const request = f.calls[index]; const url = new URL(request.url);
    assert.equal(url.origin, 'https://partner.shopeemobile.com'); assert.equal(url.pathname, paths[index]);
    assert.equal(request.method, 'GET'); assert.equal(request.redirect, 'manual');
    assert.equal(url.searchParams.get('sign'), createHmac('sha256', KEY)
      .update('2049333' + paths[index] + url.searchParams.get('timestamp') + ACCESS + '1178167501').digest('hex'));
    assert.equal(request.headers.get('cookie'), null); assert.equal(request.headers.get('authorization'), null);
    assert.ok(!request.url.includes('CALLER_ORDER_IGNORED'));
  }
  const text = JSON.stringify(result);
  for (const value of [KEY, ACCESS, REFRESH, 'PRIVATE_BUYER', 'PRIVATE_PRODUCT', 'item_id', 'model_id', 'kit_items', 'message']) assert.ok(!text.includes(value));
  assert.deepEqual(f.db.db.prepare('SELECT * FROM finance_connections').get(), before);
});

test('empty preview stops after listing and has exactly eight unknown amounts and no private order', async () => {
  const f = await fixture(); f.responses[0].response = {order_list: [], more: true, next_cursor: SERIAL};
  assert.deepEqual(await f.run(), {schema: FINANCE_PREVIEW_SCHEMA, status: 'EMPTY', checked_at: f.epoch(),
    token_revision: 1, currency: 'BRL', monetary_unit: 'UNCONFIRMED', order_sn: null, identity_match: false,
    amounts: FINANCE_PREVIEW_AMOUNT_FIELDS.map(name => ({name, value: null})), items: [], item_count: 0});
  assert.equal(f.calls.length, 1);
});

test('missing and explicitly null source values remain unknown instead of becoming zero', async () => {
  const f = await fixture(); f.responses[2].response.order_income = {escrow_amount: null, service_fee: 0,
    items: [{quantity_purchased: null, original_price: null}, {selling_price: 0, is_kit: null}]};
  const result = await f.run();
  assert.deepEqual(result.amounts, FINANCE_PREVIEW_AMOUNT_FIELDS.map(name => ({name, value: name === 'service_fee' ? 0 : null})));
  assert.deepEqual(result.items, [
    {quantity_purchased: null, original_price: null, selling_price: null, is_kit: null},
    {quantity_purchased: null, original_price: null, selling_price: 0, is_kit: null},
  ]);
});

test('expired token rotates once before preview and its replacement signs every read', async () => {
  const f = await fixture(1); f.clock.milliseconds += 2000; let refreshes = 0; let reads = 0;
  const result = await f.run({fetchImpl: async request => {
    const url = new URL(request.url);
    if (url.pathname === '/api/v2/auth/access_token/get') {
      refreshes++; assert.equal((await request.json()).refresh_token, REFRESH);
      return Response.json({error: '', message: '', request_id: 'fixture', partner_id: 2049333, shop_id: 1178167501,
        access_token: ACCESS + '-new', refresh_token: REFRESH + '-new', expire_in: 14400});
    }
    assert.equal(url.searchParams.get('access_token'), ACCESS + '-new');
    assert.equal(url.searchParams.get('sign'), createHmac('sha256', KEY)
      .update('2049333' + url.pathname + url.searchParams.get('timestamp') + ACCESS + '-new1178167501').digest('hex'));
    return Response.json(f.responses[reads++]);
  }});
  assert.equal(refreshes, 1); assert.equal(reads, 3); assert.equal(result.token_revision, 2);
  assert.equal((await f.store.readTokens()).refresh_token, REFRESH + '-new');
});

test('schema-only sample retains its original contract and never exports preview values or serial', async () => {
  const f = await fixture();
  const result = await runFinancePaymentSample(f.env, {now: f.now, fetchImpl: f.fetchImpl});
  assert.deepEqual(Object.keys(result).sort(), ['schema_version', 'status', 'checked_at', 'token_revision',
    'identity_match', 'fields', 'item_fields', 'item_count'].sort());
  assert.equal(result.status, 'VALIDATED');
  const text = JSON.stringify(result);
  for (const value of [SERIAL, KEY, ACCESS, REFRESH, '8990', '9990', 'PRIVATE_BUYER']) assert.ok(!text.includes(value));
});

test('invalid provider monetary values, quantities and item shapes fail without coercion or connection mutation', async () => {
  const changes = [
    source => {source.escrow_amount = '8990';}, source => {source.commission_fee = true;},
    source => {source.actual_shipping_fee = {value: 5};}, source => {source.service_fee = 1e12 + 1;},
    source => {source.items[0].original_price = '4995';}, source => {source.items[0].selling_price = -1e12 - 1;},
    source => {source.items[0].quantity_purchased = 0;}, source => {source.items[0].quantity_purchased = -1;},
    source => {source.items[0].quantity_purchased = 1.5;}, source => {source.items[0].quantity_purchased = 1e9 + 1;},
    source => {source.items[0].quantity_purchased = '2';}, source => {source.items[0].is_kit = 1;},
    source => {source.items = null;}, source => {source.items = [null];},
    source => {source.items = Array.from({length: 101}, () => ({}));},
  ];
  for (const change of changes) {
    const f = await fixture(); change(f.responses[2].response.order_income);
    await assert.rejects(f.run(), safeError('FINANCE_SAMPLE_PREVIEW_RESPONSE_INVALID'));
    assert.equal(f.calls.length, 3); assert.equal((await f.store.status()).status, 'CONNECTED');
  }
  const f = await fixture();
  await assert.rejects(f.run({fetchImpl: async request => {
    f.calls.push(request);
    return f.calls.length === 3
      ? new Response('{"error":"","response":{"order_sn":"' + SERIAL + '","order_income":{"escrow_amount":1e309}}}', {headers: {'content-type': 'application/json'}})
      : Response.json(f.responses[f.calls.length - 1]);
  }}), safeError('FINANCE_SAMPLE_PREVIEW_RESPONSE_INVALID'));
});

test('preview preserves the collector identity, BRL/status, permission and no-network configuration guards', async () => {
  for (const change of [f => {f.responses[1].response.order_list[0].order_sn = 'WRONG_ORDER';},
    f => {f.responses[1].response.order_list[0].order_status = 'SHIPPED';},
    f => {f.responses[1].response.order_list[0].currency = 'USD';},
    f => {f.responses[2].response.order_sn = 'WRONG_ORDER';},
    f => {f.responses[2].response.order_income.order_sn = 'WRONG_ORDER';}]) {
    const f = await fixture(); change(f); await assert.rejects(f.run());
    assert.ok(f.calls.length <= 3); assert.equal((await f.store.status()).status, 'CONNECTED');
  }
  for (const change of [f => {f.env.FINANCE_CONNECTION_ENABLED = 'false';},
    f => {delete f.env.SHOPEE_FINANCE_PARTNER_KEY; f.env.SHOPEE_PARTNER_KEY = KEY;}]) {
    const f = await fixture(); change(f); await assert.rejects(f.run()); assert.equal(f.calls.length, 0);
  }
  const f = await fixture(null); await assert.rejects(f.run(), safeError('FINANCE_AUTHORIZATION_REQUIRED'));
  assert.equal(f.calls.length, 0);
});

test('preview permission/signature failures preserve finite diagnostics without exposing order or provider text', async () => {
  for (const [providerCode, suffix] of [['error_api_permission', 'API_PERMISSION_REJECTED'],
    ['error_sign', 'API_SIGNATURE_REJECTED'], [KEY, 'UPSTREAM_HTTP']]) {
    const f = await fixture(); let calls = 0;
    await assert.rejects(f.run({fetchImpl: async () => {
      const index = calls++;
      return index === 2 ? Response.json({error: providerCode, message: KEY, request_id: ACCESS,
        response: {order_sn: SERIAL, buyer_user_name: 'PRIVATE_BUYER'}}, {status: 403})
        : Response.json(f.responses[index]);
    }}), failure => {
      safeError('FINANCE_SAMPLE_PAYMENT_' + suffix)(failure);
      assert.equal(failure.upstream_status, 403); return true;
    });
    assert.equal(calls, 3); assert.equal((await f.store.status()).status, 'CONNECTED');
  }
});

test('shared projector strictly rejects extra fields, malformed private identities and invalid numeric/type contracts', () => {
  const original = frame(); const result = projectFinancePaymentPreview(original);
  assert.deepEqual(result, original); assert.notEqual(result, original); assert.notEqual(result.items[0], original.items[0]);
  const changes = [
    value => {value.buyer = 'PRIVATE_BUYER';}, value => {value.access_token = ACCESS;},
    value => {value.schema_version = 1;}, value => {value.schema = 'other';},
    value => {value.order_sn = null;}, value => {value.order_sn = 'bad\nserial';},
    value => {value.identity_match = false;}, value => {value.currency = 'USD';},
    value => {value.monetary_unit = 'CENTS';}, value => {value.status = 'EMPTY';},
    value => {value.checked_at = 0;}, value => {value.token_revision = 0;},
    value => {value.amounts.pop();}, value => {value.amounts.reverse();},
    value => {value.amounts[0].name = 'PRIVATE_NAME';}, value => {value.amounts[0].value = '89.9';},
    value => {value.amounts[0].value = Infinity;}, value => {value.amounts[0].value = NaN;},
    value => {value.amounts[0].value = 1e12 + 1;}, value => {value.amounts[0].secret = KEY;},
    value => {value.items[0].item_id = 123;}, value => {value.items[0].quantity_purchased = 0;},
    value => {value.items[0].original_price = -Infinity;}, value => {value.items[0].is_kit = 'false';},
    value => {value.item_count = 2;}, value => {value.items = Array.from({length: 101}, () => ({...value.items[0]})); value.item_count = 101;},
  ];
  for (const change of changes) {const value = frame(); change(value); assert.equal(projectFinancePaymentPreview(value), null);}
  assert.equal(projectFinancePaymentPreview(Object.defineProperty(frame(), 'status', {get() {throw Error(KEY);}})), null);
  const missing = frame(); delete missing.items[0].is_kit; assert.equal(projectFinancePaymentPreview(missing), null);
  const sparse = frame(); delete sparse.amounts[0]; assert.equal(projectFinancePaymentPreview(sparse), null);
  const bounded = frame(); bounded.amounts[0].value = -1e12; bounded.items[0].quantity_purchased = 1e9;
  assert.notEqual(projectFinancePaymentPreview(bounded), null);
});
