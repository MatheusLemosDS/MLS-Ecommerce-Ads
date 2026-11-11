import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {getFinanceExternalCashPeriod} from '../src/app-external-cash-period.mjs';
import {EXTERNAL_CASH_PERIOD_PATH, EXTERNAL_CASH_PERIOD_RESPONSE_MAXIMUM, createExternalCashPeriodProtocol} from '../../finance/src/external-cash-period-frame.mjs';

const secret = 'SYNTHETIC_PERIOD_APP_' + 's'.repeat(40), env = {APP_INTERNAL_SECRET: secret};
const protocol = createExternalCashPeriodProtocol();
const input = () => ({schema: 'external_cash_period_request_v1', start_date: '2026-10-30', end_date: '2026-11-05'});
const error = code => ({schema: 'external_cash_error_v1', error: 'FINANCE_EXTERNAL_CASH_' + code});
const failed = (code = 'UNAVAILABLE', status = 502) => ({status, body: error(code)});
function frame() {
  const bank = {record_count: 2, credit_count: 1, credit_cents: 12345, debit_count: 1, debit_cents: 345,
    zero_count: 0, matched_credit_count: 1, matched_credit_cents: 12345, unmatched_credit_count: 0,
    unmatched_credit_cents: 0, review_count: 0, latest_import_at: 1794402000};
  const shopee = {record_count: 1, positive_count: 1, positive_cents: 12345, negative_count: 0,
    negative_cents: 0, zero_count: 0, transfer_cents: 12345, matched_transfer_count: 1,
    matched_transfer_cents: 12345, unmatched_transfer_count: 0, unmatched_transfer_cents: 0,
    review_count: 0, latest_import_at: 1794401000};
  const value = protocol.projectExternalCashPeriodSummary({schema: 'external_cash_period_summary_v1',
    start_date: input().start_date, end_date: input().end_date, checked_at: 1794405600, revision: 3,
    state: 'AVAILABLE', currency: 'BRL', coverage: 'IMPORTED_FILES_ONLY',
    basis: 'IMPORTED_BANK_AND_TRANSFER_CALENDARS', bank, shopee,
    pending: protocol.externalCashPeriodPending(bank, shopee), realized_profit_cents: null});
  assert.ok(value, 'the synthetic aggregate must satisfy the shared closed protocol');
  return value;
}

test('period gateway uses one fixed private destination and only its own projected headers and dates', async () => {
  let calls = 0;
  const result = await getFinanceExternalCashPeriod(env, input(), {fetchImpl: async request => {
    calls++;
    assert.equal(request.url, 'https://auth.brazacommerce.com.br' + EXTERNAL_CASH_PERIOD_PATH);
    assert.equal(request.method, 'POST');
    assert.equal(request.redirect, 'manual');
    assert.deepEqual([...request.headers.keys()].sort(), ['accept', 'content-type', 'x-braza-app-key']);
    assert.equal(request.headers.get('x-braza-app-key'), secret);
    assert.equal(request.headers.get('content-type'), 'application/json');
    assert.equal(request.headers.get('accept'), 'application/json');
    assert.deepEqual(await request.json(), input());
    return Response.json(frame(), {headers: {'set-cookie': 'SYNTHETIC_PRIVATE_COOKIE', location: 'https://other.invalid/private'}});
  }});
  assert.equal(calls, 1);
  assert.deepEqual(result, {status: 200, body: frame()});
  assert.deepEqual(Object.keys(result).sort(), ['body', 'status']);
  assert.equal(result.body.realized_profit_cents, null);
});

test('tenant selectors, URLs, mutation payloads, unsafe options and missing credentials never invoke transport', async () => {
  let calls = 0, getterCalls = 0;
  const fetchImpl = () => {calls++; throw Error('TRANSPORT_MUST_NOT_RUN');};
  for (const value of [{...input(), tenant: 'other'}, {...input(), shop_id: 'other'}, {...input(), url: 'https://other.invalid'},
    {...input(), operation: 'import'}, {...input(), end_date: '2026-12-31'}, {...input(), limit: 100}, null]) {
    assert.deepEqual(await getFinanceExternalCashPeriod(env, value, {fetchImpl}), failed('REQUEST_INVALID', 400));
  }
  for (const value of [{}, {APP_INTERNAL_SECRET: ''}, {APP_INTERNAL_SECRET: 123}]) {
    assert.deepEqual(await getFinanceExternalCashPeriod(value, input(), {fetchImpl}), failed('CONFIGURATION', 503));
  }
  for (const options of [null, [], {fetchImpl, timeoutMs: 4}, {fetchImpl, timeoutMs: 45001}, {fetchImpl, timeoutMs: 5.5},
    {fetchImpl, unexpected: true}, Object.defineProperty({}, 'fetchImpl', {get() {getterCalls++; return fetchImpl;}})]) {
    assert.deepEqual(await getFinanceExternalCashPeriod(env, input(), options), failed('CONFIGURATION', 503));
  }
  assert.equal(calls, 0);
  assert.equal(getterCalls, 0);
});

test('response bounds, media, redirects, invalid UTF-8 and transport diagnostics are rejected without leaking them', async () => {
  const replies = [
    () => new Response(null, {status: 302, headers: {location: 'https://other.invalid/SYNTHETIC_PRIVATE'}}),
    () => {const response = Response.json(frame()); Object.defineProperty(response, 'redirected', {value: true}); return response;},
    () => new Response('SYNTHETIC_PRIVATE', {headers: {'content-type': 'text/html'}}),
    () => new Response('{}', {headers: {'content-type': 'application/json; charset=windows-1252'}}),
    ...[String(EXTERNAL_CASH_PERIOD_RESPONSE_MAXIMUM + 1), 'invalid', '9007199254740992'].map(length => () =>
      new Response('{}', {headers: {'content-type': 'application/json', 'content-length': length}})),
    () => new Response(' '.repeat(EXTERNAL_CASH_PERIOD_RESPONSE_MAXIMUM + 1), {headers: {'content-type': 'application/json'}}),
    () => new Response(Uint8Array.from([0xc3, 0x28]), {headers: {'content-type': 'application/json'}}),
    () => new Response('{"private":"SYNTHETIC_PRIVATE"', {headers: {'content-type': 'application/json'}}),
    () => {throw Error('SYNTHETIC_PRIVATE_PROVIDER_CREDENTIAL');},
  ];
  for (const reply of replies) {
    const result = await getFinanceExternalCashPeriod(env, input(), {fetchImpl: reply});
    assert.deepEqual(result, failed());
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE|private|provider|credential|location/);
  }
});

test('only the exact period and closed summary or matching finite error can cross the gateway', async () => {
  const good = frame();
  for (const value of [{...good, start_date: '2026-10-31'}, {...good, end_date: '2026-11-04'},
    {...good, owner_account: 'SYNTHETIC_PRIVATE'}, {...good, realized_profit_cents: 12000},
    {...good, coverage: 'COMPLETE'}, {...good, bank: {...good.bank, matched_credit_cents: 1}}]) {
    assert.deepEqual(await getFinanceExternalCashPeriod(env, input(), {fetchImpl: () => Response.json(value)}), failed());
  }
  assert.deepEqual(await getFinanceExternalCashPeriod(env, input(), {fetchImpl: () => Response.json(error('REVISION_CONFLICT'), {status: 409})}), failed('REVISION_CONFLICT', 409));
  assert.deepEqual(await getFinanceExternalCashPeriod(env, input(), {fetchImpl: () => Response.json(error('STORAGE_INVALID'), {status: 503})}), failed('STORAGE_INVALID', 503));
  for (const reply of [() => Response.json(error('REVISION_CONFLICT'), {status: 503}),
    () => Response.json({...error('STORAGE_INVALID'), details: 'SYNTHETIC_PRIVATE'}, {status: 503}),
    () => Response.json({schema: 'external_cash_error_v1', error: 'SYNTHETIC_PRIVATE'}, {status: 502})]) {
    assert.deepEqual(await getFinanceExternalCashPeriod(env, input(), {fetchImpl: reply}), failed());
  }
});

test('a stalled body is aborted and canceled by the gateway deadline without waiting for cancellation', async () => {
  let signal, canceled = 0;
  const result = await getFinanceExternalCashPeriod(env, input(), {timeoutMs: 5, fetchImpl: request => {
    signal = request.signal;
    return new Response(new ReadableStream({pull() {}, cancel() {canceled++; return new Promise(() => {});}}),
      {headers: {'content-type': 'application/json'}});
  }});
  assert.deepEqual(result, failed('TIMEOUT', 504));
  assert.equal(signal.aborted, true);
  assert.equal(canceled, 1);
});

test('a response arriving after the deadline is canceled and cannot replace the timeout result', async () => {
  let resolveFetch, signal, canceled = 0;
  const result = await getFinanceExternalCashPeriod(env, input(), {timeoutMs: 5, fetchImpl: request => {
    signal = request.signal;
    return new Promise(resolve => {resolveFetch = resolve;});
  }});
  assert.deepEqual(result, failed('TIMEOUT', 504));
  assert.equal(signal.aborted, true);
  resolveFetch(new Response(new ReadableStream({pull() {}, cancel() {canceled++;}}), {headers: {'content-type': 'application/json'}}));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(canceled, 1);
  assert.deepEqual(result, failed('TIMEOUT', 504));
});

for (const minify of [false, true]) test(`compiled period gateway preserves destination, request and period guards minify=${minify}`, async () => {
  const bundle = await build({entryPoints: ['web/cloudflare/src/app-external-cash-period.mjs'], bundle: true,
    write: false, format: 'esm', platform: 'browser', target: 'es2022', minify, logLevel: 'silent'});
  const compiled = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  let calls = 0;
  const fetchImpl = async request => {
    calls++;
    assert.equal(request.url, 'https://auth.brazacommerce.com.br' + EXTERNAL_CASH_PERIOD_PATH);
    assert.deepEqual(await request.json(), input());
    return Response.json(frame());
  };
  assert.deepEqual(await compiled.getFinanceExternalCashPeriod(env, input(), {fetchImpl}), {status: 200, body: frame()});
  assert.equal(calls, 1);
  assert.deepEqual(await compiled.getFinanceExternalCashPeriod(env, {...input(), tenant: 'other'}, {fetchImpl}), failed('REQUEST_INVALID', 400));
  assert.equal(calls, 1);
  assert.deepEqual(await compiled.getFinanceExternalCashPeriod(env, input(), {fetchImpl: () => Response.json({...frame(), end_date: '2026-11-04'})}), failed());
});
