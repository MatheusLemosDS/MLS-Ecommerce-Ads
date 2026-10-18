import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FINANCE_PROFILE, FinanceConnectionError} from '../src/connection-store.mjs';
import {normalizeFinanceRefreshResponse} from '../src/refresh-response.mjs';

const context = {requestedAt: 1792333333, receivedAt: 1792333335,
  previousRefreshToken: 'fixture-previous-private-refresh'};
const response = () => ({request_id: 'fixture-private-request-id', error: '',
  message: 'fixture-private-message', access_token: 'fixture-new-private-access',
  refresh_token: 'fixture-new-private-refresh', expire_in: 14400,
  partner_id: FINANCE_PROFILE.partner_id, shop_id: FINANCE_PROFILE.shop_id});
const safeError = (code, status = 502) => error => {
  assert.ok(error instanceof FinanceConnectionError);
  assert.equal(error.code, code); assert.equal(error.message, code); assert.equal(error.status, status);
  const serialized = JSON.stringify(error) + error.stack;
  for (const secret of ['fixture-private', 'provider-private', 'fixture-new-private',
    context.previousRefreshToken]) assert.ok(!serialized.includes(secret));
  return true;
};
const invalid = safeError('FINANCE_REFRESH_RESPONSE_INVALID');

test('normalizes the documented shop-scoped fields and omits all provider metadata', () => {
  const payload = {...response(), merchant_id: 999, supplier_id_list: [123], user_id_list: [456],
    arbitrary_extra: 'fixture-private-ignored-extra'};
  const normalized = normalizeFinanceRefreshResponse(payload, context);
  assert.deepEqual(normalized, {access_token: payload.access_token, refresh_token: payload.refresh_token,
    expires_at: context.requestedAt + payload.expire_in});
  assert.deepEqual(Object.keys(normalized), ['access_token', 'refresh_token', 'expires_at']);
  assert.equal(payload.refresh_token, 'fixture-new-private-refresh');
});

test('uses the actual TTL rather than assuming four hours and does not add response latency', () => {
  const payload = {...response(), expire_in: 300};
  const normalized = normalizeFinanceRefreshResponse(payload, {...context, receivedAt: context.requestedAt + 299});
  assert.equal(normalized.expires_at, context.requestedAt + 300);
  assert.equal(normalized.expires_at - (context.requestedAt + 299), 1);
  assert.equal(normalizeFinanceRefreshResponse({...payload, expire_in: 1},
    {...context, receivedAt: context.requestedAt}).expires_at, context.requestedAt + 1);
});

test('rejects responses whose conservative expiry was reached during transport', () => {
  for (const receivedAt of [context.requestedAt + 300, context.requestedAt + 301]) {
    assert.throws(() => normalizeFinanceRefreshResponse({...response(), expire_in: 300},
      {...context, receivedAt}), safeError('FINANCE_REFRESH_RESPONSE_EXPIRED'));
  }
});

test('API errors use a fixed classification without private error, message or request ID values', () => {
  assert.throws(() => normalizeFinanceRefreshResponse({...response(), error: 'provider-private-error'}, context),
    safeError('FINANCE_REFRESH_API_ERROR'));
});

test('requires an explicit empty error string and bounded request_id and message strings', () => {
  for (const field of ['error', 'request_id', 'message']) {
    for (const value of [undefined, null, 0, true, {}, [], 'x'.repeat(8193)]) {
      const payload = {...response(), [field]: value};
      assert.throws(() => normalizeFinanceRefreshResponse(payload, context), invalid);
    }
    const missing = response(); delete missing[field];
    assert.throws(() => normalizeFinanceRefreshResponse(missing, context), invalid);
  }
  assert.equal(normalizeFinanceRefreshResponse({...response(), request_id: '', message: ''}, context)
    .access_token, response().access_token);
});

test('requires exact numeric financial application and shop identities', () => {
  for (const [field, values] of [['partner_id', [2047569, 9, '2049333', null, true]],
    ['shop_id', [9, '1178167501', null, true]]]) {
    for (const value of values) assert.throws(() => normalizeFinanceRefreshResponse(
      {...response(), [field]: value}, context), safeError('FINANCE_REFRESH_IDENTITY_MISMATCH'));
  }
});

test('merchant/supplier/user response fields cannot substitute for the exact shop identity', () => {
  for (const extras of [{merchant_id: 1178167501}, {supplier_id_list: [1178167501]},
    {user_id_list: [1178167501]}, {shop_id_list: [1178167501]}]) {
    const payload = {...response(), ...extras}; delete payload.shop_id;
    assert.throws(() => normalizeFinanceRefreshResponse(payload, context), invalid);
    assert.throws(() => normalizeFinanceRefreshResponse({...payload, shop_id: 7}, context),
      safeError('FINANCE_REFRESH_IDENTITY_MISMATCH'));
  }
});

test('rejects invalid token types, empty values, oversize values and control characters', () => {
  for (const field of ['access_token', 'refresh_token']) {
    for (const value of [undefined, null, 12, false, {}, [], '', 'x'.repeat(8193),
      'fixture-private\nvalue', 'fixture-private\u0000value', 'fixture-private\u007fvalue']) {
      assert.throws(() => normalizeFinanceRefreshResponse({...response(), [field]: value}, context), invalid);
    }
  }
  assert.equal(normalizeFinanceRefreshResponse({...response(), access_token: 'x'.repeat(8192)}, context)
    .access_token.length, 8192);
});

test('rejects reuse of the previous refresh token while accepting a distinct rotated token', () => {
  assert.throws(() => normalizeFinanceRefreshResponse({...response(), refresh_token: context.previousRefreshToken}, context),
    safeError('FINANCE_REFRESH_TOKEN_NOT_ROTATED'));
  assert.notEqual(normalizeFinanceRefreshResponse(response(), context).refresh_token, context.previousRefreshToken);
});

test('expire_in is a positive integer in seconds with the documented four-hour upper bound', () => {
  for (const expire_in of [undefined, null, '14400', true, false, [], {}, 0, -1, 1.5, 14401,
    Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => normalizeFinanceRefreshResponse({...response(), expire_in}, context), invalid);
  }
});

test('requires caller context with valid UNIX seconds and a private previous refresh token', () => {
  for (const options of [undefined, null, [], {}, new Date(),
    {...context, requestedAt: 1792333333000}, {...context, receivedAt: 1792333335000},
    {...context, requestedAt: '1792333333'}, {...context, receivedAt: true},
    {...context, requestedAt: -1}, {...context, receivedAt: 0},
    {...context, requestedAt: 1.5}, {...context, previousRefreshToken: ''},
    {...context, previousRefreshToken: 'fixture-private\ntoken'}]) {
    assert.throws(() => normalizeFinanceRefreshResponse(response(), options),
      safeError('FINANCE_REFRESH_RESPONSE_CONTEXT_INVALID', 503));
  }
  assert.equal(normalizeFinanceRefreshResponse({...response(), expire_in: 1},
    {...context, requestedAt: 0, receivedAt: 0}).expires_at, 1);
});

test('accepts JSON-like null-prototype objects and rejects arrays or non-plain payloads', () => {
  assert.equal(normalizeFinanceRefreshResponse(Object.assign(Object.create(null), response()), context)
    .access_token, response().access_token);
  for (const payload of [null, undefined, [], new Date(), Object.create(response()), 'fixture-private']) {
    assert.throws(() => normalizeFinanceRefreshResponse(payload, context), invalid);
  }
});

test('ignores unconsumed extra properties without invoking getters', () => {
  const payload = response();
  Object.defineProperty(payload, 'supplier_id_list', {get() {throw Error('fixture-private-unused-accessor');}});
  assert.equal(normalizeFinanceRefreshResponse(payload, context).refresh_token, response().refresh_token);
});

test('malformed required field accessors and hostile objects fail without exception text', () => {
  const payload = response();
  Object.defineProperty(payload, 'access_token', {get() {throw Error('fixture-private-accessor');}});
  assert.throws(() => normalizeFinanceRefreshResponse(payload, context), invalid);
  const hostile = new Proxy({}, {getPrototypeOf() {throw Error('provider-private-proxy');}});
  assert.throws(() => normalizeFinanceRefreshResponse(hostile, context), invalid);
  const forged = new Proxy({}, {getPrototypeOf() {throw new FinanceConnectionError('provider-private-forged');}});
  assert.throws(() => normalizeFinanceRefreshResponse(forged, context), invalid);
});

test('normalization does not perform network I/O', t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', () => {calls++; throw Error('provider-private-unexpected-network');});
  normalizeFinanceRefreshResponse(response(), context);
  assert.equal(calls, 0);
});
