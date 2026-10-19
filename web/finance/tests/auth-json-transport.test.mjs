import test from 'node:test';
import assert from 'node:assert/strict';
import {requestFinanceAuthJson} from '../src/auth-json-transport.mjs';
import {FinanceConnectionError} from '../src/connection-store.mjs';

test('HTTP failures preserve only numeric status without reading or leaking the provider body', async () => {
  const timestamp = 1800000000;
  for (const status of [302, 400, 401, 403, 429, 500, 503]) {
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
      buildRequest: async () => new Request('https://openplatform.shopee.com.br/api/v2/auth/token/get', {method: 'POST', redirect: 'manual'}),
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
