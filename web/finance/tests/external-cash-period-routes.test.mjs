import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {FinanceConnectionError} from '../src/connection-store.mjs';
import {readExternalCashPeriodSummary} from '../src/external-cash-period.mjs';
import {forwardExternalCashPeriod} from '../src/auth-router.mjs';
import {createExternalCashPeriodWorker} from '../src/external-cash-worker.mjs';
import {EXTERNAL_CASH_PERIOD_PATH, EXTERNAL_CASH_PERIOD_REQUEST_MAXIMUM, EXTERNAL_CASH_PERIOD_RESPONSE_MAXIMUM} from '../src/external-cash-period-frame.mjs';

const origin = 'https://auth.brazacommerce.com.br', secret = 'SYNTHETIC_ROUTER_SECRET_123456789012345';
const input = () => ({schema: 'external_cash_period_request_v1', start_date: '2026-10-30', end_date: '2026-11-05'});
const frame = await readExternalCashPeriodSummary({FINANCE_DB: new D1()}, input());
const validator = {validateInternalApp: request => request.headers.get('x-braza-app-key') === 'SYNTHETIC_APP_KEY'};
const request = (value = input(), headers = {}, target = origin + EXTERNAL_CASH_PERIOD_PATH) => new Request(target,
  {method: 'POST', headers: {'content-type': 'application/json', 'x-braza-app-key': 'SYNTHETIC_APP_KEY', ...headers}, body: typeof value === 'string' ? value : JSON.stringify(value)});
const direct = (value = input(), headers = {}, target) => request(value, {'x-braza-finance-router': secret, ...headers}, target);
const authEnv = fetch => ({FINANCE_ROUTER_SECRET: secret, SHOPEE_FINANCE_SERVICE: {fetch}});

function chain(active = {forwardExternalCashPeriod, createExternalCashPeriodWorker}) {
  let reads = 0, bindings = 0;
  const worker = active.createExternalCashPeriodWorker({readPeriodSummary: async (env, value) => {reads++; assert.deepEqual(value, input()); return frame;}});
  const env = authEnv(received => {
    bindings++; assert.equal(received.url, origin + EXTERNAL_CASH_PERIOD_PATH);
    assert.equal(received.headers.get('x-braza-finance-router'), secret);
    for (const name of ['cookie', 'authorization', 'x-braza-app-key', 'x-braza-actor', 'x-braza-shop-id']) assert.equal(received.headers.get(name), null);
    return worker.fetch(received, {FINANCE_ROUTER_SECRET: secret, FINANCE_CONNECTION_ENABLED: 'false'});
  });
  return {run: () => active.forwardExternalCashPeriod(request(input(), {cookie: 'SYNTHETIC_PRIVATE', authorization: 'Bearer SYNTHETIC_PRIVATE',
    'x-braza-actor': 'caller', 'x-braza-shop-id': 'other'}), env, validator), counts: () => ({reads, bindings})};
}

test('cash aggregate private chain is independent of OAuth and strips caller credentials/tenant', async () => {
  const current = chain(), response = await current.run();
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), frame);
  assert.deepEqual(current.counts(), {reads: 1, bindings: 1});
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('set-cookie'), null);
});

test('cash aggregate authenticates before reading a body or invoking a read capability', async () => {
  let calls = 0;
  const req = request(), response = await forwardExternalCashPeriod(req, authEnv(() => {calls++;}), {validateInternalApp: () => false});
  assert.equal(response.status, 401); assert.equal(req.bodyUsed, false);
  const worker = createExternalCashPeriodWorker({readPeriodSummary: () => {calls++;}}), req2 = direct(input(), {'x-braza-finance-router': 'wrong'});
  assert.equal((await worker.fetch(req2, {FINANCE_ROUTER_SECRET: secret})).status, 403);
  assert.equal(req2.bodyUsed, false); assert.equal(calls, 0);
});

test('cash aggregate route rejects non-exact paths/method/query/schema and oversize or invalid bodies', async () => {
  let calls = 0; const worker = createExternalCashPeriodWorker({readPeriodSummary: () => {calls++; return frame;}});
  const invoke = req => worker.fetch(req, {FINANCE_ROUTER_SECRET: secret});
  for (const path of [origin + EXTERNAL_CASH_PERIOD_PATH + '/', 'https://other.invalid' + EXTERNAL_CASH_PERIOD_PATH,
    origin + '/internal/finance/external-cash-v1']) assert.equal((await invoke(direct(input(), {}, path))).status, 404);
  assert.equal((await invoke(new Request(origin + EXTERNAL_CASH_PERIOD_PATH))).status, 405);
  assert.equal((await invoke(direct(input(), {}, origin + EXTERNAL_CASH_PERIOD_PATH + '?tenant=other'))).status, 400);
  for (const value of [{...input(), tenant: 'other'}, {...input(), operation: 'import'}, {...input(), end_date: '2026-12-01'}, '{', 'null', ' '.repeat(EXTERNAL_CASH_PERIOD_REQUEST_MAXIMUM + 1)]) {
    assert.equal((await invoke(direct(value))).status, 400);
    assert.equal((await forwardExternalCashPeriod(request(value), authEnv(() => {calls++;}), validator)).status, 400);
  }
  assert.equal((await invoke(direct(input(), {'content-type': 'text/plain'}))).status, 400);
  assert.equal((await invoke(direct(input(), {'content-length': String(EXTERNAL_CASH_PERIOD_REQUEST_MAXIMUM + 1)}))).status, 400);
  assert.equal(calls, 0);
});

test('cash aggregate validates response schema, exact requested period, status, media and response bounds', async () => {
  const replies = [() => Response.json({...frame, bank_account: 'SYNTHETIC_PRIVATE'}), () => Response.json({...frame, end_date: '2026-11-04'}),
    () => new Response('<private>', {headers: {'content-type': 'text/html'}}),
    () => new Response(' '.repeat(EXTERNAL_CASH_PERIOD_RESPONSE_MAXIMUM + 1), {headers: {'content-type': 'application/json'}}),
    () => new Response(null, {status: 302, headers: {location: 'https://other.invalid/SYNTHETIC_PRIVATE'}}),
    () => Response.json({schema: 'external_cash_error_v1', error: 'FINANCE_EXTERNAL_CASH_REVISION_CONFLICT', private: 'SYNTHETIC_PRIVATE'}, {status: 409})];
  for (const reply of replies) {
    const response = await forwardExternalCashPeriod(request(), authEnv(reply), validator);
    assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /PRIVATE|private|location/);
  }
  const response = await forwardExternalCashPeriod(request(), authEnv(() => Response.json({schema: 'external_cash_error_v1', error: 'FINANCE_EXTERNAL_CASH_REVISION_CONFLICT'},
    {status: 409, headers: {'set-cookie': 'private=cookie'}})), validator);
  assert.equal(response.status, 409); assert.equal(response.headers.get('set-cookie'), null);
});

test('cash aggregate service sanitizes unknown errors and preserves known typed storage errors', async () => {
  for (const [error, status, code] of [[new FinanceConnectionError('FINANCE_EXTERNAL_CASH_STORAGE_INVALID', 503), 503, 'FINANCE_EXTERNAL_CASH_STORAGE_INVALID'],
    [new Error('SYNTHETIC_PRIVATE_DATABASE'), 502, 'FINANCE_EXTERNAL_CASH_UNAVAILABLE']]) {
    const worker = createExternalCashPeriodWorker({readPeriodSummary: () => {throw error;}}), response = await worker.fetch(direct(), {FINANCE_ROUTER_SECRET: secret});
    assert.equal(response.status, status); assert.deepEqual(await response.json(), {schema: 'external_cash_error_v1', error: code});
  }
  const worker = createExternalCashPeriodWorker({readPeriodSummary: () => ({...frame, start_date: '2026-10-31'})});
  assert.equal((await worker.fetch(direct(), {FINANCE_ROUTER_SECRET: secret})).status, 502);
});

test('cash aggregate router bounds a hanging binding and cancels a late response body', async () => {
  const original = globalThis.setTimeout; let resolveFetch, signal, canceled = 0;
  globalThis.setTimeout = (fn, ms, ...args) => original(fn, ms === 15000 ? 10 : ms, ...args);
  try {
    const response = await forwardExternalCashPeriod(request(), authEnv(req => {signal = req.signal; return new Promise(resolve => {resolveFetch = resolve;});}), validator);
    assert.equal(response.status, 504); assert.equal(signal.aborted, true);
    resolveFetch(new Response(new ReadableStream({pull() {}, cancel() {canceled++;}}), {headers: {'content-type': 'application/json'}}));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(canceled, 1);
  } finally {globalThis.setTimeout = original;}
});

for (const minify of [false, true]) test(`cash aggregate chain compiles with closed request/response guards minify=${minify}`, async () => {
  const result = await build({stdin: {contents: "export {forwardExternalCashPeriod} from './web/finance/src/auth-router.mjs';export {createExternalCashPeriodWorker} from './web/finance/src/external-cash-worker.mjs';",
    resolveDir: process.cwd(), sourcefile: 'external-cash-period-guards.mjs'}, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', minify});
  const active = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
  const current = chain(active), response = await current.run(); assert.equal(response.status, 200); assert.deepEqual(await response.json(), frame);
});
