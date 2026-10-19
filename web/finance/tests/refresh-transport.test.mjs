import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FinanceConnectionError} from '../src/connection-store.mjs';
import {requestFinanceRefresh} from '../src/refresh-transport.mjs';

const timestamp = 1792333333;
const input = {partnerKey: 'fixture-signing-key-only', refreshToken: 'fixture-private-previous-token', timestamp};
const now = () => timestamp * 1000;
const payload = overrides => ({
  request_id: 'fixture-request', error: '', message: '',
  refresh_token: 'fixture-private-next-token', access_token: 'fixture-private-access-token',
  expire_in: 14400, partner_id: 2049333, shop_id: 1178167501, merchant_id: 0,
  supplier_id_list: [], user_id_list: [], ...overrides,
});
const jsonResponse = (value = payload(), options = {}) => new Response(JSON.stringify(value), {
  ...options, headers: {'content-type': 'application/json', ...options.headers},
});
const safeError = expected => failure => {
  assert.ok(failure instanceof FinanceConnectionError);
  if (expected) assert.equal(failure.code, expected);
  assert.equal(failure.message, failure.code);
  assert.match(failure.code, /^[A-Z0-9_]+$/);
  for (const privateValue of [input.partnerKey, input.refreshToken, payload().refresh_token,
    payload().access_token, 'fixture-private-provider-message']) {
    assert.ok(!String(failure).includes(privateValue));
    assert.ok(!JSON.stringify(failure).includes(privateValue));
  }
  assert.equal(Object.hasOwn(failure, 'cause'), false);
  return true;
};

test('transport has no implicit global fetch and requires explicit injected fetch', async t => {
  let globalCalls = 0;
  t.mock.method(globalThis, 'fetch', () => { globalCalls++; throw Error('UNEXPECTED_NETWORK'); });
  await assert.rejects(requestFinanceRefresh(input), safeError('FINANCE_REFRESH_TRANSPORT_UNAVAILABLE'));
  await assert.rejects(requestFinanceRefresh(input, {fetchImpl: null, now}), safeError('FINANCE_REFRESH_TRANSPORT_UNAVAILABLE'));
  assert.equal(globalCalls, 0);
});

test('one Brazil production request returns only normalized tokens with conservative expiry', async () => {
  let calls = 0;
  const result = await requestFinanceRefresh(input, {now, fetchImpl: async request => {
    calls++;
    assert.ok(request instanceof Request);
    assert.equal(request.method, 'POST');
    assert.equal(request.redirect, 'manual');
    assert.equal(request.signal.aborted, false);
    const url = new URL(request.url);
    assert.equal(url.origin, 'https://openplatform.shopee.com.br');
    assert.equal(url.pathname, '/api/v2/auth/access_token/get');
    assert.equal(url.searchParams.get('partner_id'), '2049333');
    assert.equal(url.searchParams.get('timestamp'), String(timestamp));
    assert.match(url.searchParams.get('sign'), /^[0-9a-f]{64}$/);
    assert.equal(request.headers.get('content-type'), 'application/json');
    assert.equal(request.headers.get('authorization'), null);
    assert.equal(request.headers.get('cookie'), null);
    assert.deepEqual(await request.json(), {refresh_token: input.refreshToken, partner_id: 2049333, shop_id: 1178167501});
    return jsonResponse();
  }});
  assert.equal(calls, 1);
  assert.deepEqual(result, {access_token: payload().access_token, refresh_token: payload().refresh_token,
    expires_at: timestamp + 14400});
});

test('request timestamps outside five minutes and invalid clock fail without transmitting', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return jsonResponse(); };
  for (const value of [timestamp - 301, timestamp + 301, 0, NaN, '1792333333', timestamp * 1000]) {
    await assert.rejects(requestFinanceRefresh({...input, timestamp: value}, {now, fetchImpl}), safeError('FINANCE_REFRESH_REQUEST_STALE'));
  }
  for (const clock of [() => NaN, () => -1, () => { throw Error('fixture-private-provider-message'); }]) {
    await assert.rejects(requestFinanceRefresh(input, {now: clock, fetchImpl}), safeError('FINANCE_CLOCK_CONFIGURATION'));
  }
  assert.equal(calls, 0);
});

test('invalid deadline and extra request scope fail before any provider call', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return jsonResponse(); };
  for (const timeoutMs of [0, 4, 10001, 7.5, '1000', NaN, Infinity]) {
    await assert.rejects(requestFinanceRefresh(input, {fetchImpl, now, timeoutMs}), safeError('FINANCE_REFRESH_TRANSPORT_CONFIGURATION'));
  }
  await assert.rejects(requestFinanceRefresh({...input, merchant_id: 77}, {fetchImpl, now}), safeError('FINANCE_REFRESH_REQUEST_INVALID'));
  assert.equal(calls, 0);
});

test('deadline aborts an uncooperative fetch and rejects without waiting for it', async () => {
  let calls = 0;
  let request;
  let resolveFetch;
  const result = requestFinanceRefresh(input, {now, timeoutMs: 20, fetchImpl: value => {
    calls++; request = value;
    return new Promise(resolve => { resolveFetch = resolve; });
  }});
  await assert.rejects(result, safeError('FINANCE_REFRESH_TIMEOUT'));
  assert.equal(calls, 1);
  assert.equal(request.signal.aborted, true);
  // A late provider completion cannot turn an already rejected operation into a
  // usable token result. This module has no persistence or completion callback.
  let cancelled = 0;
  resolveFetch(new Response(new ReadableStream({cancel() { cancelled++; }}), {
    headers: {'content-type': 'application/json'},
  }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  assert.equal(cancelled, 1);
});

test('deadline includes a body whose stream never completes and cancels it', async () => {
  let cancelled = 0;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{')); },
    cancel() { cancelled++; },
  });
  await assert.rejects(requestFinanceRefresh(input, {now, timeoutMs: 20,
    fetchImpl: async () => new Response(stream, {headers: {'content-type': 'application/json'}}),
  }), safeError('FINANCE_REFRESH_TIMEOUT'));
  assert.equal(cancelled, 1);
});

test('timeout is sanitized even when fetch abort rejection contains private details', async () => {
  await assert.rejects(requestFinanceRefresh(input, {now, timeoutMs: 20, fetchImpl: request => new Promise((resolve, reject) => {
    request.signal.addEventListener('abort', () => reject(Error('fixture-private-provider-message')));
  })}), safeError('FINANCE_REFRESH_TIMEOUT'));
});

test('HTTP failures and redirects are refused once, without retry or alternate host', async () => {
  for (const status of [201, 204, 301, 302, 307, 308, 400, 401, 403, 429, 500, 503]) {
    let calls = 0;
    await assert.rejects(requestFinanceRefresh(input, {now, fetchImpl: async request => {
      calls++;
      assert.equal(new URL(request.url).host, 'openplatform.shopee.com.br');
      assert.equal(request.redirect, 'manual');
      return new Response(status === 204 ? null : 'fixture-private-provider-message', {
        status, headers: {location: 'https://other.invalid/private', 'content-type': 'text/html'},
      });
    }}), safeError('FINANCE_REFRESH_UPSTREAM_HTTP'));
    assert.equal(calls, 1);
  }
});

test('network rejection and non-Response results expose only a fixed error', async () => {
  for (const fetchImpl of [async () => { throw Error('fixture-private-provider-message'); },
    async () => { throw new FinanceConnectionError('fixture-private-provider-message'); },
    async () => null,
    async () => ({status: 200, json: async () => payload()}),
  ]) {
    await assert.rejects(requestFinanceRefresh(input, {now, fetchImpl}), safeError());
  }
});

test('JSON media type is required and optional UTF-8 charset is accepted', async () => {
  for (const type of ['text/html', 'text/plain', 'application/problem+json', 'application/json; charset=iso-8859-1']) {
    await assert.rejects(requestFinanceRefresh(input, {now,
      fetchImpl: async () => jsonResponse(payload(), {headers: {'content-type': type}}),
    }), safeError('FINANCE_REFRESH_UPSTREAM_CONTENT_TYPE'));
  }
  for (const type of ['application/json', 'Application/JSON; charset=UTF-8', 'application/json; charset="utf-8"']) {
    const result = await requestFinanceRefresh(input, {now,
      fetchImpl: async () => jsonResponse(payload(), {headers: {'content-type': type}}),
    });
    assert.equal(result.refresh_token, payload().refresh_token);
  }
});

test('Content-Length larger than 64KiB is rejected without pulling the response body', async () => {
  let cancelled = 0;
  const stream = new ReadableStream({cancel() { cancelled++; }});
  await assert.rejects(requestFinanceRefresh(input, {now, fetchImpl: async () => new Response(stream, {
    headers: {'content-type': 'application/json', 'content-length': '65537'},
  })}), safeError('FINANCE_REFRESH_UPSTREAM_BODY_TOO_LARGE'));
  assert.equal(cancelled, 1);
});

test('streamed bytes are bounded even when Content-Length is absent or misleading', async () => {
  for (const declared of [null, '1']) {
    let cancelled = 0;
    let enqueued = false;
    const stream = new ReadableStream({pull(controller) {
      if (!enqueued) { enqueued = true; controller.enqueue(new Uint8Array(65537)); }
    }, cancel() { cancelled++; }});
    const headers = {'content-type': 'application/json'};
    if (declared !== null) headers['content-length'] = declared;
    await assert.rejects(requestFinanceRefresh(input, {now,
      fetchImpl: async () => new Response(stream, {headers}),
    }), safeError('FINANCE_REFRESH_UPSTREAM_BODY_TOO_LARGE'));
    assert.equal(cancelled, 1);
  }
});

test('64KiB valid JSON is accepted but byte counts accumulate across streamed chunks', async () => {
  const encoded = new TextEncoder().encode(JSON.stringify(payload()));
  const atLimit = new Uint8Array(65536).fill(32);
  atLimit.set(encoded);
  const result = await requestFinanceRefresh(input, {now, fetchImpl: async () => new Response(atLimit, {
    headers: {'content-type': 'application/json', 'content-length': '65536'},
  })});
  assert.equal(result.access_token, payload().access_token);

  let nextChunk = 0;
  let cancelled = 0;
  const chunks = [new Uint8Array(32768), new Uint8Array(32768), new Uint8Array(1)];
  const stream = new ReadableStream({pull(controller) { controller.enqueue(chunks[nextChunk++]); },
    cancel() { cancelled++; }});
  await assert.rejects(requestFinanceRefresh(input, {now, fetchImpl: async () => new Response(stream, {
    headers: {'content-type': 'application/json'},
  })}), safeError('FINANCE_REFRESH_UPSTREAM_BODY_TOO_LARGE'));
  assert.equal(cancelled, 1);
});

test('malformed JSON and invalid UTF-8 never echo the provider body', async () => {
  for (const body of ['{"private":"fixture-private-provider-message"', '', new Uint8Array([0xc3, 0x28])]) {
    await assert.rejects(requestFinanceRefresh(input, {now, fetchImpl: async () => new Response(body, {
      headers: {'content-type': 'application/json'},
    })}), safeError('FINANCE_REFRESH_UPSTREAM_INVALID_JSON'));
  }
});

test('provider API failures, identity mismatch and unusable tokens are never returned', async () => {
  for (const value of [
    payload({error: 'error_api_permission', message: 'fixture-private-provider-message'}),
    payload({partner_id: 2047569}), payload({shop_id: 999}), payload({shop_id: '1178167501'}),
    payload({expire_in: '14400'}), payload({expire_in: 0}), payload({expire_in: 14401}),
    payload({refresh_token: input.refreshToken}), payload({access_token: ''}),
    null, [], 'fixture-private-provider-message',
  ]) {
    await assert.rejects(requestFinanceRefresh(input, {now, fetchImpl: async () => jsonResponse(value)}), safeError());
  }
});

test('normalization receives request and receipt times rather than extending validity by network time', async () => {
  const clocks = [timestamp * 1000, (timestamp + 3) * 1000];
  const result = await requestFinanceRefresh(input, {now: () => clocks.shift(),
    fetchImpl: async () => jsonResponse(payload({expire_in: 10})),
  });
  assert.equal(result.expires_at, timestamp + 10);
  assert.deepEqual(clocks, []);
});

test('a clock that jumps past token validity cannot return an expired access token', async () => {
  const clocks = [timestamp * 1000, (timestamp + 11) * 1000];
  await assert.rejects(requestFinanceRefresh(input, {now: () => clocks.shift(),
    fetchImpl: async () => jsonResponse(payload({expire_in: 10})),
  }), safeError());
});
