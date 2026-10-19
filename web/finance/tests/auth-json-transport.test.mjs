import test from 'node:test';
import assert from 'node:assert/strict';
import {requestFinanceAuthJson} from '../src/auth-json-transport.mjs';
import {FinanceConnectionError} from '../src/connection-store.mjs';

test('HTTP failures other than 403 preserve only numeric status without reading the provider body', async () => {
  const timestamp = 1800000000;
  for (const status of [302, 400, 401, 429, 500, 503]) {
    let requests = 0, cancelled = 0, normalized = 0;
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('fixture-private-provider-body')); },
      cancel() { cancelled++; },
    });
    await assert.rejects(requestFinanceAuthJson({
      input: {timestamp}, prefix: 'FINANCE_INITIAL_EXCHANGE',
      options: {now: () => timestamp * 1000, fetchImpl: async () => {
        requests++;
        return new Response(stream, {status, headers: {'content-type': 'application/json'}});
      }},
      buildRequest: async () => new Request('https://partner.shopeemobile.com/api/v2/auth/token/get', {method: 'POST', redirect: 'manual'}),
      normalizeResponse: () => { normalized++; },
    }), failure => {
      assert.ok(failure instanceof FinanceConnectionError);
      assert.equal(failure.code, 'FINANCE_INITIAL_EXCHANGE_UPSTREAM_HTTP');
      assert.equal(failure.upstream_status, status);
      assert.equal(Object.hasOwn(failure, 'cause'), false);
      assert.ok(!JSON.stringify(failure).includes('fixture-private-provider-body'));
      return true;
    });
    assert.equal(requests, 1);
    assert.equal(normalized, 0);
    assert.equal(cancelled, 1);
  }
});

const TIMESTAMP = 1800000000;
const PREFIX = 'FINANCE_INITIAL_EXCHANGE';
const PRIVATE_VALUES = ['fixture-private-provider-message', 'fixture-private-request-id',
  'fixture-private-access-token', 'fixture-private-refresh-token', 'fixture-private-key'];

function invoke(response, {timeoutMs = 10000} = {}) {
  const observations = {requests: 0, normalized: 0, request: undefined};
  const result = requestFinanceAuthJson({
    input: {timestamp: TIMESTAMP}, prefix: PREFIX,
    options: {now: () => TIMESTAMP * 1000, timeoutMs, fetchImpl: async request => {
      observations.requests++;
      observations.request = request;
      assert.equal(request.redirect, 'manual');
      return response;
    }},
    buildRequest: async () => new Request('https://partner.shopeemobile.com/api/v2/auth/token/get',
      {method: 'POST', redirect: 'manual'}),
    normalizeResponse: () => { observations.normalized++; return 'UNEXPECTED_NORMALIZATION'; },
  });
  return {result, observations};
}

const safeFailure = (diagnostic, {suffix = 'UPSTREAM_HTTP', status = 403} = {}) => failure => {
  assert.ok(failure instanceof FinanceConnectionError);
  assert.equal(failure.code, PREFIX + '_' + suffix);
  assert.equal(failure.message, failure.code);
  assert.equal(failure.upstream_status, suffix === 'UPSTREAM_HTTP' ? status : undefined);
  assert.equal(failure.upstream_diagnostic, diagnostic);
  assert.equal(Object.hasOwn(failure, 'cause'), false);
  for (const value of PRIVATE_VALUES) {
    assert.ok(!String(failure).includes(value));
    assert.ok(!JSON.stringify(failure).includes(value));
    assert.ok(!failure.stack.includes(value));
  }
  return true;
};

function forbiddenJson(payload, headers = {}) {
  return new Response(JSON.stringify(payload), {status: 403,
    headers: {'content-type': 'application/json', ...headers}});
}

test('403 JSON maps only exact finite provider errors and never retains private response fields', async () => {
  for (const [error, diagnostic] of [
    ['error_sign', 'JSON_SIGNATURE_REJECTED'],
    ['invalid_code', 'JSON_CODE_REJECTED'],
    ['error_param', 'JSON_PARAMETER_REJECTED'],
    ['error_auth', 'JSON_AUTHORIZATION_REJECTED'],
    ['error_api_permission', 'JSON_PERMISSION_REJECTED'],
    ['error_partner_id', 'JSON_PARTNER_REJECTED'],
    ['error_ip', 'JSON_IP_REJECTED'],
  ]) {
    const {result, observations} = invoke(forbiddenJson({error,
      message: PRIVATE_VALUES[0], request_id: PRIVATE_VALUES[1],
      access_token: PRIVATE_VALUES[2], refresh_token: PRIVATE_VALUES[3],
      extra: {key: PRIVATE_VALUES[4]}}));
    await assert.rejects(result, safeFailure(diagnostic));
    assert.equal(observations.requests, 1);
    assert.equal(observations.normalized, 0);
  }
});

test('403 unknown errors and lookalikes remain unrecognized without using provider messages', async () => {
  for (const error of [...PRIVATE_VALUES, 'ERROR_SIGN', 'error_sign ', 'error_sign:' + PRIVATE_VALUES[0],
    'INVALID_CODE', 'invalid_code ', ' invalid_code', 'invalid_code:' + PRIVATE_VALUES[0],
    'invalid_code_' + PRIVATE_VALUES[2],
    'error_ip_address', '__proto__', 'constructor', null, 403, {error: 'error_sign'}]) {
    const {result, observations} = invoke(forbiddenJson({error,
      message: 'error_sign ' + PRIVATE_VALUES[0], request_id: PRIVATE_VALUES[1]}));
    await assert.rejects(result, safeFailure('JSON_UNRECOGNIZED'));
    assert.equal(observations.requests, 1);
    assert.equal(observations.normalized, 0);
  }
});

test('403 success-shaped tokens and scalar JSON are never normalized', async () => {
  for (const payload of [{error: '', message: '', request_id: PRIVATE_VALUES[1],
    access_token: PRIVATE_VALUES[2], refresh_token: PRIVATE_VALUES[3], expire_in: 14400},
    {}, null, [], [{error: 'error_sign'}], 'error_sign', 403]) {
    const {result, observations} = invoke(forbiddenJson(payload));
    await assert.rejects(result, safeFailure('JSON_UNRECOGNIZED'));
    assert.equal(observations.requests, 1);
    assert.equal(observations.normalized, 0);
  }
});

test('403 accepts the same UTF-8 JSON content types as successful responses', async () => {
  for (const type of ['application/json', 'Application/JSON; charset=UTF-8', 'application/json; charset="utf-8"']) {
    const {result, observations} = invoke(forbiddenJson({error: 'error_sign'}, {'content-type': type}));
    await assert.rejects(result, safeFailure('JSON_SIGNATURE_REJECTED'));
    assert.equal(observations.normalized, 0);
  }
});

test('403 HTML and unsupported content types are classified without reading their bodies', async () => {
  for (const [contentType, diagnostic] of [
    ['text/html', 'HTML_CONTENT_TYPE'], ['TEXT/HTML; charset=UTF-8', 'HTML_CONTENT_TYPE'],
    ['text/plain', 'OTHER_CONTENT_TYPE'], ['application/problem+json', 'OTHER_CONTENT_TYPE'],
    ['application/json; charset=iso-8859-1', 'OTHER_CONTENT_TYPE'], [null, 'OTHER_CONTENT_TYPE'],
  ]) {
    let cancelled = 0;
    const stream = new ReadableStream({cancel() { cancelled++; }});
    stream.getReader = () => { throw Error(PRIVATE_VALUES[0]); };
    const headers = contentType === null ? {} : {'content-type': contentType};
    const {result, observations} = invoke(new Response(stream, {status: 403, headers}));
    await assert.rejects(result, safeFailure(diagnostic));
    assert.equal(cancelled, 1);
    assert.equal(observations.requests, 1);
    assert.equal(observations.normalized, 0);
  }
});

test('403 advertised oversized or malformed lengths are rejected without reading the body', async () => {
  for (const length of ['65537', '9007199254740992', '-1', 'invalid']) {
    let cancelled = 0;
    const stream = new ReadableStream({cancel() { cancelled++; }});
    stream.getReader = () => { throw Error(PRIVATE_VALUES[0]); };
    const {result, observations} = invoke(new Response(stream, {status: 403,
      headers: {'content-type': 'application/json', 'content-length': length}}));
    await assert.rejects(result, safeFailure('JSON_BODY_TOO_LARGE'));
    assert.equal(cancelled, 1);
    assert.equal(observations.requests, 1);
    assert.equal(observations.normalized, 0);
  }
});

test('403 streamed bytes remain bounded across chunks with absent or misleading Content-Length', async () => {
  for (const declared of [null, '1']) {
    let index = 0, cancelled = 0;
    const chunks = [new Uint8Array(32768), new Uint8Array(32768), new Uint8Array(1)];
    const stream = new ReadableStream({pull(controller) { controller.enqueue(chunks[index++]); },
      cancel() { cancelled++; }});
    const headers = {'content-type': 'application/json'};
    if (declared !== null) headers['content-length'] = declared;
    const {result, observations} = invoke(new Response(stream, {status: 403, headers}));
    await assert.rejects(result, safeFailure('JSON_BODY_TOO_LARGE'));
    assert.equal(cancelled, 1);
    assert.equal(observations.requests, 1);
    assert.equal(observations.normalized, 0);
  }
});

test('403 JSON exactly at 64KiB is classified without response normalization', async () => {
  const body = new Uint8Array(65536).fill(32);
  body.set(new TextEncoder().encode(JSON.stringify({error: 'error_ip', message: PRIVATE_VALUES[0]})));
  const {result, observations} = invoke(new Response(body, {status: 403,
    headers: {'content-type': 'application/json', 'content-length': '65536'}}));
  await assert.rejects(result, safeFailure('JSON_IP_REJECTED'));
  assert.equal(observations.requests, 1);
  assert.equal(observations.normalized, 0);
});

test('403 malformed JSON, invalid UTF-8 and missing bodies receive fixed diagnostics', async () => {
  for (const body of [null, '', '{"private":"' + PRIVATE_VALUES[0] + '"', new Uint8Array([0xc3, 0x28])]) {
    const {result, observations} = invoke(new Response(body, {status: 403,
      headers: {'content-type': 'application/json'}}));
    await assert.rejects(result, safeFailure('JSON_INVALID'));
    assert.equal(observations.requests, 1);
    assert.equal(observations.normalized, 0);
  }
});

test('403 body reads stay inside the deadline even when stream cancellation does not settle', {timeout: 1000}, async () => {
  let cancelled = 0;
  const stream = new ReadableStream({start(controller) { controller.enqueue(new TextEncoder().encode('{')); },
    cancel() { cancelled++; return new Promise(() => {}); }});
  const {result, observations} = invoke(new Response(stream, {status: 403,
    headers: {'content-type': 'application/json'}}), {timeoutMs: 20});
  await assert.rejects(result, safeFailure(undefined, {suffix: 'TIMEOUT', status: undefined}));
  assert.equal(observations.request.signal.aborted, true);
  assert.equal(cancelled, 1);
  assert.equal(observations.requests, 1);
  assert.equal(observations.normalized, 0);
});

test('403 stream read failures retain no private error details and never retry', async () => {
  const stream = new ReadableStream({start(controller) { controller.error(Error(PRIVATE_VALUES[0])); }});
  const {result, observations} = invoke(new Response(stream, {status: 403,
    headers: {'content-type': 'application/json'}}));
  await assert.rejects(result, safeFailure(undefined, {suffix: 'UPSTREAM_FAILED', status: undefined}));
  assert.equal(observations.requests, 1);
  assert.equal(observations.normalized, 0);
});

test('a redirected 403 is rejected and cancelled without reading or classifying its body', async () => {
  let cancelled = 0;
  const stream = new ReadableStream({cancel() { cancelled++; }});
  stream.getReader = () => { throw Error(PRIVATE_VALUES[0]); };
  const response = new Response(stream, {status: 403, headers: {'content-type': 'application/json'}});
  Object.defineProperty(response, 'redirected', {value: true});
  const {result, observations} = invoke(response);
  await assert.rejects(result, safeFailure(undefined));
  assert.equal(cancelled, 1);
  assert.equal(observations.requests, 1);
  assert.equal(observations.normalized, 0);
});
