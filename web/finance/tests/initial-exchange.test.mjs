import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FinanceConnectionError} from '../src/connection-store.mjs';
import {requestFinanceInitialExchange} from '../src/initial-exchange.mjs';

const timestamp = 1792333333;
const now = () => timestamp * 1000;
const input = {partnerKey: 'fixture-initial-key-hex-looking-aa11', code: 'fixture-private-one-time-code', timestamp};
const payload = overrides => ({request_id: 'fixture-request', error: '', message: '',
  access_token: 'fixture-private-access', refresh_token: 'fixture-private-refresh', expire_in: 13859, ...overrides});
const jsonResponse = (value = payload(), options = {}) => new Response(JSON.stringify(value), {
  ...options, headers: {'content-type': 'application/json', ...options.headers},
});
const safeError = expected => failure => {
  assert.ok(failure instanceof FinanceConnectionError);
  if (expected) assert.equal(failure.code, expected);
  assert.equal(failure.message, failure.code);
  assert.match(failure.code, /^[A-Z0-9_]+$/);
  for (const privateValue of [input.partnerKey, input.code, payload().access_token,
    payload().refresh_token, 'fixture-private-provider-message']) {
    assert.ok(!String(failure).includes(privateValue));
    assert.ok(!JSON.stringify(failure).includes(privateValue));
  }
  assert.equal(Object.hasOwn(failure, 'cause'), false);
  return true;
};

test('initial exchange never falls back to global fetch', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', () => { calls++; throw Error('UNEXPECTED_NETWORK'); });
  await assert.rejects(requestFinanceInitialExchange(input), safeError('FINANCE_INITIAL_EXCHANGE_TRANSPORT_UNAVAILABLE'));
  assert.equal(calls, 0);
});

test('initial shop exchange uses the documented production Auth API, POST query/body and independent signature', async () => {
  let calls = 0;
  const result = await requestFinanceInitialExchange(input, {now, fetchImpl: async request => {
    calls++;
    assert.equal(request.method, 'POST');
    assert.equal(request.redirect, 'manual');
    const url = new URL(request.url);
    assert.equal(url.origin, 'https://partner.shopeemobile.com');
    assert.equal(url.pathname, '/api/v2/auth/token/get');
    assert.deepEqual([...url.searchParams.keys()], ['partner_id', 'timestamp', 'sign']);
    assert.equal(url.searchParams.get('partner_id'), '2049333');
    assert.equal(url.searchParams.get('timestamp'), String(timestamp));
    // Independent Python hmac/hashlib SHA256 vector, using UTF-8 key text.
    assert.equal(url.searchParams.get('sign'), '33130515eac800247a310de9ca991eb6b7b0e2b4d2a56b6b7fa2f277f124a6bb');
    assert.equal(request.headers.get('content-type'), 'application/json');
    assert.equal(request.headers.get('accept'), 'application/json');
    assert.equal(request.headers.get('cookie'), null);
    assert.equal(request.headers.get('authorization'), null);
    const publicParts = request.url + JSON.stringify([...request.headers]);
    assert.ok(!publicParts.includes(input.code));
    assert.ok(!publicParts.includes(input.partnerKey));
    const body = await request.json();
    assert.deepEqual(body, {shop_id: 1178167501, code: input.code, partner_id: 2049333});
    assert.equal(typeof body.shop_id, 'number');
    assert.equal(typeof body.partner_id, 'number');
    assert.ok(!JSON.stringify(body).includes(input.partnerKey));
    return jsonResponse();
  }});
  assert.equal(calls, 1);
  assert.deepEqual(result, {access_token: payload().access_token, refresh_token: payload().refresh_token,
    expires_at: timestamp + 13859});
});

test('documented success without identity echoes is accepted and other metadata never creates scopes', async () => {
  const result = await requestFinanceInitialExchange(input, {now, fetchImpl: async () => jsonResponse(payload({
    shop_id_list: [1178167501, 123], merchant_id: 456, merchant_id_list: [456],
    supplier_id_list: [789], user_id_list: [900], unexpected: {private: 'fixture-private-provider-message'},
  }))});
  assert.deepEqual(Object.keys(result), ['access_token', 'refresh_token', 'expires_at']);
  assert.equal(result.expires_at, timestamp + 13859);
});

test('optional scalar identity echoes must equal the fixed typed finance profile', async () => {
  const matching = await requestFinanceInitialExchange(input, {now,
    fetchImpl: async () => jsonResponse(payload({partner_id: 2049333, shop_id: 1178167501})),
  });
  assert.equal(matching.refresh_token, payload().refresh_token);
  for (const extra of [{partner_id: 2047569}, {shop_id: 99}, {partner_id: '2049333'},
    {shop_id: '1178167501'}, {partner_id: null}, {shop_id: null}]) {
    await assert.rejects(requestFinanceInitialExchange(input, {now,
      fetchImpl: async () => jsonResponse(payload(extra)),
    }), safeError('FINANCE_INITIAL_EXCHANGE_IDENTITY_MISMATCH'));
  }
});

test('invalid codes, keys and scope overrides fail without transmitting', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return jsonResponse(); };
  for (const code of ['', undefined, 44, [], 'x'.repeat(8193), 'private\ncode', 'private\u007fcode']) {
    await assert.rejects(requestFinanceInitialExchange({...input, code}, {now, fetchImpl}), safeError('FINANCE_INITIAL_EXCHANGE_CODE_INVALID'));
  }
  for (const partnerKey of ['', undefined, 44, 'x'.repeat(4097), '\nprivate']) {
    await assert.rejects(requestFinanceInitialExchange({...input, partnerKey}, {now, fetchImpl}), safeError('FINANCE_INITIAL_EXCHANGE_SIGNING_KEY_CONFIGURATION'));
  }
  for (const extra of [{merchant_id: 77}, {shop_id: 99}, {partner_id: 2047569},
    {origin: 'https://other.invalid'}, {refresh_token: 'fixture'}, {body: {}}]) {
    await assert.rejects(requestFinanceInitialExchange({...input, ...extra}, {now, fetchImpl}), safeError('FINANCE_INITIAL_EXCHANGE_REQUEST_INVALID'));
  }
  assert.equal(calls, 0);
});

test('missing fields and accessor exceptions expose fixed errors without provider traffic', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return jsonResponse(); };
  for (const field of ['code', 'partnerKey']) {
    const value = {...input}; delete value[field];
    await assert.rejects(requestFinanceInitialExchange(value, {now, fetchImpl}), safeError('FINANCE_INITIAL_EXCHANGE_REQUEST_INVALID'));
  }
  const getter = Object.defineProperty({...input}, 'code', {get() { throw Error('fixture-private-provider-message'); }});
  await assert.rejects(requestFinanceInitialExchange(getter, {now, fetchImpl}), safeError('FINANCE_INITIAL_EXCHANGE_REQUEST_INVALID'));
  const clockGetter = Object.defineProperty({...input}, 'timestamp', {get() { throw Error('fixture-private-provider-message'); }});
  await assert.rejects(requestFinanceInitialExchange(clockGetter, {now, fetchImpl}), safeError('FINANCE_INITIAL_EXCHANGE_REQUEST_STALE'));
  assert.equal(calls, 0);
});

test('timestamps outside five minutes are rejected before building a request', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return jsonResponse(); };
  for (const value of [timestamp - 301, timestamp + 301, timestamp * 1000, 0, '1792333333', NaN]) {
    await assert.rejects(requestFinanceInitialExchange({...input, timestamp: value}, {now, fetchImpl}), safeError('FINANCE_INITIAL_EXCHANGE_REQUEST_STALE'));
  }
  assert.equal(calls, 0);
});

test('HTTP failures and redirects make one call with no retries or alternate endpoint', async () => {
  for (const status of [201, 204, 301, 302, 307, 308, 400, 401, 403, 429, 500, 503]) {
    let calls = 0;
    await assert.rejects(requestFinanceInitialExchange(input, {now, fetchImpl: async request => {
      calls++;
      assert.equal(request.redirect, 'manual');
      return new Response(status === 204 ? null : 'fixture-private-provider-message', {
        status, headers: {location: 'https://other.invalid', 'content-type': 'application/json'},
      });
    }}), safeError('FINANCE_INITIAL_EXCHANGE_UPSTREAM_HTTP'));
    assert.equal(calls, 1);
  }
});

test('deadline aborts a fetch that ignores cancellation and late completion is discarded', async () => {
  let captured;
  let finish;
  let calls = 0;
  const result = requestFinanceInitialExchange(input, {now, timeoutMs: 20, fetchImpl: request => {
    calls++; captured = request;
    return new Promise(resolve => { finish = resolve; });
  }});
  await assert.rejects(result, safeError('FINANCE_INITIAL_EXCHANGE_TIMEOUT'));
  assert.equal(captured.signal.aborted, true);
  let cancelled = 0;
  finish(new Response(new ReadableStream({cancel() { cancelled++; }}), {headers: {'content-type': 'application/json'}}));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  assert.equal(cancelled, 1);
});

test('deadline covers stream consumption and cancels a nonterminating body', async () => {
  let cancelled = 0;
  const stream = new ReadableStream({start(controller) { controller.enqueue(new TextEncoder().encode('{')); },
    cancel() { cancelled++; }});
  await assert.rejects(requestFinanceInitialExchange(input, {now, timeoutMs: 20,
    fetchImpl: async () => new Response(stream, {headers: {'content-type': 'application/json'}}),
  }), safeError('FINANCE_INITIAL_EXCHANGE_TIMEOUT'));
  assert.equal(cancelled, 1);
});

test('network, content-type, invalid JSON and malformed UTF-8 failures are sanitized', async () => {
  for (const fetchImpl of [
    async () => { throw Error('fixture-private-provider-message'); },
    async () => { throw new FinanceConnectionError('fixture-private-provider-message'); },
    async () => new Response('fixture-private-provider-message', {headers: {'content-type': 'text/html'}}),
    async () => new Response('{"private":"fixture-private-provider-message"', {headers: {'content-type': 'application/json'}}),
    async () => new Response(new Uint8Array([0xc3, 0x28]), {headers: {'content-type': 'application/json'}}),
  ]) {
    await assert.rejects(requestFinanceInitialExchange(input, {now, fetchImpl}), safeError());
  }
});

test('oversized Content-Length and streamed JSON bodies are refused at 64KiB', async () => {
  const headers = {'content-type': 'application/json', 'content-length': '65537'};
  await assert.rejects(requestFinanceInitialExchange(input, {now,
    fetchImpl: async () => new Response('{}', {headers}),
  }), safeError('FINANCE_INITIAL_EXCHANGE_UPSTREAM_BODY_TOO_LARGE'));
  await assert.rejects(requestFinanceInitialExchange(input, {now,
    fetchImpl: async () => new Response(new Uint8Array(65537), {headers: {'content-type': 'application/json'}}),
  }), safeError('FINANCE_INITIAL_EXCHANGE_UPSTREAM_BODY_TOO_LARGE'));
});

test('known provider errors become fixed categories without copying private response fields', async () => {
  for (const [error, suffix] of [
    ['error_sign', 'API_SIGNATURE_REJECTED'],
    ['invalid_code', 'API_CODE_REJECTED'],
    ['error_param', 'API_PARAMETER_REJECTED'],
    ['error_auth', 'API_AUTHORIZATION_REJECTED'],
    ['error_api_permission', 'API_PERMISSION_REJECTED'],
    ['error_partner_id', 'API_PARTNER_REJECTED'],
  ]) {
    let calls = 0;
    await assert.rejects(requestFinanceInitialExchange(input, {now, fetchImpl: async () => {
      calls++;
      return jsonResponse(payload({error,
        request_id: input.code,
        message: input.partnerKey + payload().access_token + payload().refresh_token,
      }));
    }}), safeError('FINANCE_INITIAL_EXCHANGE_' + suffix));
    assert.equal(calls, 1);
  }
});

test('unknown provider error strings remain generic, including secrets and allowlist lookalikes', async () => {
  for (const error of [input.code, input.partnerKey, payload().access_token,
    payload().refresh_token, 'fixture-private-provider-message', '__proto__', 'constructor',
    'ERROR_SIGN', 'error_sign ', 'error_sign:' + input.code,
    'INVALID_CODE', 'invalid_code ', ' invalid_code', 'invalid_code:' + input.code,
    'invalid_code_' + payload().access_token]) {
    await assert.rejects(requestFinanceInitialExchange(input, {now,
      fetchImpl: async () => jsonResponse(payload({error, message: input.code})),
    }), safeError('FINANCE_INITIAL_EXCHANGE_API_ERROR'));
  }
});

test('API errors, malformed success fields and invalid TTL never produce tokens', async () => {
  for (const value of [
    payload({error: 'error_api_permission', message: 'fixture-private-provider-message'}),
    payload({error: null}), payload({request_id: 9}), payload({message: null}),
    payload({access_token: ''}), payload({refresh_token: ''}), payload({access_token: 'a\nb'}),
    payload({refresh_token: 'x'.repeat(8193)}), payload({expire_in: '13859'}), payload({expire_in: 0}),
    payload({expire_in: -1}), payload({expire_in: 14401}), null, [], 'fixture-private-provider-message',
  ]) {
    await assert.rejects(requestFinanceInitialExchange(input, {now, fetchImpl: async () => jsonResponse(value)}), safeError());
  }
});

test('request dispatch sets conservative expiry and expired or reversed receipt clocks fail', async () => {
  const clocks = [timestamp * 1000, (timestamp + 3) * 1000];
  const result = await requestFinanceInitialExchange(input, {now: () => clocks.shift(),
    fetchImpl: async () => jsonResponse(payload({expire_in: 10})),
  });
  assert.equal(result.expires_at, timestamp + 10);
  for (const receivedAt of [timestamp + 10, timestamp - 1]) {
    const sequence = [timestamp * 1000, receivedAt * 1000];
    await assert.rejects(requestFinanceInitialExchange(input, {now: () => sequence.shift(),
      fetchImpl: async () => jsonResponse(payload({expire_in: 10})),
    }), safeError());
  }
});
