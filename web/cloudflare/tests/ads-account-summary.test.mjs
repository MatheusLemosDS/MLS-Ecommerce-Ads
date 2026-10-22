import test from 'node:test';
import assert from 'node:assert/strict';
import {adsMeasurementPageSelection, getAdsSummary} from '../src/app-ads-summary.mjs';
import {getAdsPeriod, projectAdsPeriod} from '../src/ads-period.mjs';
import {projectAdsMeasurement} from '../src/ads-measurement.mjs';
import {adsToday} from '../src/admin-ads-today.mjs';

const stamp = Date.UTC(2026, 9, 22, 1);
const now = () => stamp;
const day = '2026-10-21';
const selection = {start_date: day, end_date: day};
const env = {APP_INTERNAL_SECRET: 'PRIVATE_APP_KEY'};
const payload = () => ({
  status: 'ok', connected: true,
  shop: {id: 1178167501, name: 'PRIVATE_SHOP_NAME'},
  period: {start_date: '21-10-2026', end_date: '21-10-2026'},
  balance: 31.07,
  metrics: {spend: 999999999, gmv: 999999999, orders: 999999999, roas: 999999999},
  daily: [{date: '21-10-2026', expense: 52.61, broad_gmv: 1011.37, broad_order: 15, broad_roas: 19.28, direct_gmv: 500.23, direct_order: 7, direct_roas: '9.5000', private_token: 'PRIVATE_ROW_TOKEN'}],
  private_token: 'PRIVATE_TOKEN'
});
async function readSummary(raw = payload(), input = selection, overrides = {}) {
  const calls = [];
  const summary = await getAdsSummary(env, input, {now, fetchImpl: async request => { calls.push(request); return Response.json(raw); }, ...overrides});
  return {summary, calls};
}
const assertUnavailable = summary => {
  assert.equal(summary.ok, false);
  assert.equal(summary.connected, false);
  assert.equal(summary.metrics, undefined);
  assert.ok(summary.measurement === null || summary.measurement.status === 'UNAVAILABLE');
  const json = JSON.stringify(summary);
  for (const privateValue of ['PRIVATE_TOKEN', 'PRIVATE_APP_KEY', 'PRIVATE_SHOP_NAME', 'PRIVATE_ERROR']) assert.ok(!json.includes(privateValue));
};

test('Admin and Ads share the same bounded daily read, exact spend, attribution and source ROAS', async () => {
  const {summary, calls} = await readSummary();
  const periodCalls = [];
  const period = await getAdsPeriod(env, selection, {now, fetchImpl: async request => { periodCalls.push(request); return Response.json(payload()); }});
  assert.equal(calls.length, 1);
  assert.equal(periodCalls.length, 1);
  for (const request of [...calls, ...periodCalls]) {
    const url = new URL(request.url);
    assert.equal(url.origin, 'https://auth.brazacommerce.com.br');
    assert.equal(url.pathname, '/internal/shopee/ads/summary');
    assert.deepEqual([...url.searchParams], [['start_date', '21-10-2026'], ['end_date', '21-10-2026']]);
    assert.equal(request.method, 'GET');
    assert.equal(request.redirect, 'manual');
    assert.equal(request.headers.get('X-Braza-App-Key'), env.APP_INTERNAL_SECRET);
    for (const name of ['cookie', 'authorization', 'x-braza-finance-router']) assert.equal(request.headers.get(name), null);
  }
  assert.deepEqual(summary.measurement, period.measurement);
  assert.equal(summary.ok, true);
  assert.equal(summary.connected, true);
  assert.deepEqual(summary.period, selection);
  assert.equal(period.expense_cents, 5261);
  assert.equal(summary.metrics.spend, 52.61);
  assert.equal(summary.metrics.gmv, 1011.37);
  assert.equal(summary.metrics.orders, 15);
  assert.equal(summary.metrics.roas, 19.28);
  assert.equal(summary.measurement.totals.broad.reported_roas_raw, 19.28);
  assert.equal(summary.measurement.totals.broad.calculated_roas_raw, '19.223912');
  assert.equal(summary.measurement.totals.direct.gmv_cents, 50023);
  assert.equal(summary.measurement.totals.direct.orders, 7);
  assert.equal(summary.balance, 31.07);
  assert.equal(summary.measurement.balance_cents, 3107);
  assert.deepEqual(summary.daily, summary.measurement.days);
  assert.equal(summary.daily[0].broad.gmv_cents, 101137);
  assert.equal(summary.daily[0].direct.reported_roas_raw, '9.5000');
  for (const key of ['items_sold', 'impressions', 'clicks', 'ctr', 'cpc']) assert.equal(summary.metrics[key], null);
  for (const privateValue of ['PRIVATE_SHOP_NAME', 'PRIVATE_TOKEN', 'PRIVATE_ROW_TOKEN', '999999999']) assert.ok(!JSON.stringify(summary).includes(privateValue));
});

test('a fresh expense read updates calculated ROAS without rewriting the provider ROAS or using a cached total', async () => {
  const earlier = (await readSummary()).summary;
  const raw = payload(); raw.daily[0].expense = 52.77;
  const later = (await readSummary(raw, selection, {now: () => stamp + 60000})).summary;
  assert.equal(earlier.metrics.spend, 52.61);
  assert.equal(later.metrics.spend, 52.77);
  assert.equal(later.measurement.expense_cents, 5277);
  assert.equal(later.measurement.totals.broad.calculated_roas_raw, '19.165624');
  assert.equal(later.measurement.totals.broad.reported_roas_raw, 19.28);
  assert.equal(later.metrics.roas, 19.28);
  assert.equal(later.measurement.fetched_at, earlier.measurement.fetched_at + 60);
});

test('page selection defaults to the current Sao Paulo month and explicit dates pass through to the same source', async () => {
  const month={start_date:'2026-10-01',end_date:day};
  for (const route of ['/dashboard', '/ads', '/campaigns']) {
    assert.deepEqual(adsMeasurementPageSelection(new URL('https://app.brazacommerce.com.br' + route), {now}), month);
  }
  const calls=[];
  const summary=await getAdsSummary(env,undefined,{now,fetchImpl:async request=>{
    const query=new URL(request.url).searchParams,source={start_date:query.get('start_date'),end_date:query.get('end_date')};calls.push(request);
    const iso=value=>value.split('-').reverse().join('-'),start=Date.parse(iso(source.start_date)+'T00:00:00Z'),end=Date.parse(iso(source.end_date)+'T00:00:00Z');
    const daily=Array.from({length:(end-start)/86400000+1},(_,index)=>({date:new Date(start+index*86400000).toISOString().slice(0,10),expense:1,broad_gmv:2,broad_order:1}));
    return Response.json({...payload(),period:source,daily});
  }});
  assert.deepEqual(summary.period, month);
  assert.equal(summary.calendar.day_partial, true);assert.equal(summary.metrics.spend,21);assert.equal(summary.metrics.gmv,42);assert.equal(summary.metrics.roas,2);assert.equal(summary.measurement,undefined);
  assert.equal(calls.length,2);assert.equal(new URL(calls[0].url).searchParams.get('start_date'), '01-10-2026');assert.equal(new URL(calls[1].url).searchParams.get('start_date'),'16-10-2026');
  const explicit = adsMeasurementPageSelection(new URL('https://app.brazacommerce.com.br/ads?start_date=2026-10-20&end_date=2026-10-21'), {now});
  assert.deepEqual(explicit, {start_date: '2026-10-20', end_date: day});
  const raw = payload(); raw.period.start_date = '20-10-2026';
  raw.daily.unshift({date: '20-10-2026', expense: '0.10', broad_gmv: '1.00', broad_order: 1, broad_roas: 10});
  const {summary: ranged, calls: rangedCalls} = await readSummary(raw, explicit);
  assert.equal(new URL(rangedCalls[0].url).searchParams.get('start_date'), '20-10-2026');
  assert.equal(ranged.metrics.spend, 52.71);
  assert.equal(ranged.metrics.gmv, 1012.37);
  assert.equal(ranged.measurement.totals.broad.reported_roas_raw, null);
  assert.equal(ranged.metrics.roas, Number(ranged.measurement.totals.broad.calculated_roas_raw));
});

test('invalid, duplicate or incomplete date selectors cannot silently fall back to another period', async () => {
  for (const query of [
    'start_date=2026-10-21', 'end_date=2026-10-21',
    'start_date=2026-10-21&start_date=2026-10-20&end_date=2026-10-21',
    'start_date=2026-10-21&end_date=2026-10-21&end_date=2026-10-20',
    'start_date=&end_date=', 'start_date=2026-02-30&end_date=2026-10-21',
    'start_date=2026-10-22&end_date=2026-10-22',
    'start_date=2026-09-20&end_date=2026-10-21',
    'month=2026-10&start_date=2026-10-21&end_date=2026-10-21',
    'month=2026-10&month=2026-09', 'month=2026-11', 'month=2026-13', 'month=',
    'start_date=2026-10-21&end_date=2026-10-20'
  ]) {
    const selected = adsMeasurementPageSelection(new URL('https://app.brazacommerce.com.br/ads?' + query), {now});
    const {summary, calls} = await readSummary(payload(), selected);
    assert.equal(calls.length, 0, query);
    assertUnavailable(summary);
  }
});

test('missing broad attribution does not borrow direct metrics, while explicit zero expense has no calculated ROAS', async () => {
  const raw = payload();
  delete raw.daily[0].broad_gmv; delete raw.daily[0].broad_order; delete raw.daily[0].broad_roas;
  const summary = (await readSummary(raw)).summary;
  assert.equal(summary.ok, true);
  assert.equal(summary.metrics.spend, 52.61);
  assert.equal(summary.metrics.gmv, null);
  assert.equal(summary.metrics.orders, null);
  assert.equal(summary.metrics.roas, null);
  assert.equal(summary.metrics.cost_per_order, null);
  assert.equal(summary.measurement.totals.direct.gmv_cents, 50023);
  const zero = payload(); zero.daily[0].expense = 0; zero.daily[0].broad_gmv = 0; zero.daily[0].broad_order = 0; delete zero.daily[0].broad_roas;
  const result = (await readSummary(zero)).summary;
  assert.equal(result.metrics.spend, 0);
  assert.equal(result.metrics.gmv, 0);
  assert.equal(result.metrics.orders, 0);
  assert.equal(result.metrics.roas, null);
  assert.equal(result.measurement.totals.broad.calculated_roas_raw, null);
});

test('partial coverage never claims zero or a complete spend and ambiguous source dates fail closed', async () => {
  for (const raw of [{...payload(), daily: []}, {...payload(), daily: [{...payload().daily[0], expense: '0.001'}]}]) {
    const {summary} = await readSummary(raw);
    assert.equal(summary.ok, true);
    assert.equal(summary.measurement.status, 'PARTIAL');
    assert.equal(summary.metrics.spend, null);
    assert.equal(summary.measurement.expense_cents, null);
    assert.equal(summary.measurement.known_expense_cents, 0);
    assert.equal(summary.measurement.totals.broad.calculated_roas_raw, null);
    assert.deepEqual(summary.measurement.missing_dates, [day]);
    assert.equal(summary.metrics.cost_per_order, null);
  }
  for (const change of [raw => raw.daily.push(raw.daily[0]), raw => raw.daily[0].date = '2026-10-20', raw => raw.daily[0].date = '31-02-2026', raw => raw.period.end_date = '22-10-2026', raw => raw.shop.id = 2047569]) {
    const raw = payload(); change(raw); assertUnavailable((await readSummary(raw)).summary);
  }
});

test('network, malformed responses and timeout failures remain finite without private source data or retries', async () => {
  for (const fetchImpl of [
    async () => { throw Error('PRIVATE_ERROR'); },
    async () => new Response('PRIVATE_ERROR', {status: 403}),
    async () => new Response('{PRIVATE_ERROR', {headers: {'content-type': 'application/json'}}),
    async () => new Response('PRIVATE_ERROR', {headers: {'content-type': 'text/html'}}),
    async () => new Response(JSON.stringify({...payload(), padding: 'PRIVATE_ERROR'.repeat(6000)}), {headers: {'content-type': 'application/json'}})
  ]) {
    let calls = 0;
    const {summary} = await readSummary(payload(), selection, {fetchImpl: async request => { calls++; return fetchImpl(request); }});
    assert.equal(calls, 1);
    assertUnavailable(summary);
  }
  let calls = 0;
  const {summary} = await readSummary(payload(), selection, {timeoutMs: 5, fetchImpl: async () => { calls++; return new Promise(() => {}); }});
  assert.equal(calls, 1);
  assertUnavailable(summary);
});

test('an invalid clock cannot escape the finite response contract when using the default date selection', async () => {
  for (const clock of [() => NaN, () => { throw Error('PRIVATE_ERROR'); }]) {
    let calls = 0;
    const summary = await getAdsSummary(env, undefined, {now: clock, fetchImpl: async () => { calls++; throw Error('must not fetch'); }});
    assert.equal(calls, 0);
    assertUnavailable(summary);
  }
});

test('optional measurement sidecars reject cross-report mixtures, forged equations and private extras', async () => {
  const period = await getAdsPeriod(env, selection, {now, fetchImpl: async () => Response.json(payload())});
  assert.ok(projectAdsPeriod(period));
  const earlier = await getAdsPeriod(env, selection, {now: () => stamp - 60000, fetchImpl: async () => Response.json(payload())});
  const differentRaw = payload(); differentRaw.daily[0].expense = 52.77;
  const differentExpense = await getAdsPeriod(env, selection, {now, fetchImpl: async () => Response.json(differentRaw)});
  for (const child of [earlier.measurement, differentExpense.measurement]) {
    assert.ok(projectAdsMeasurement(child));
    assert.equal(projectAdsPeriod({...period, measurement: child}), null);
  }
  for (const change of [
    frame => frame.measurement.private_token = 'PRIVATE',
    frame => frame.measurement.days[0].broad.private_token = 'PRIVATE',
    frame => frame.measurement.days[0].broad.gmv_cents++,
    frame => frame.measurement.totals.broad.gmv_cents++,
    frame => frame.measurement.totals.broad.calculated_roas_raw = '19.280000',
    frame => frame.measurement.totals.broad.reported_roas_raw = 'PRIVATE',
    frame => frame.measurement.covered_days = 0,
    frame => frame.measurement.missing_dates = [day],
    frame => frame.expense_cents = 5277,
    frame => frame.days[0].expense_cents = 5277,
    frame => frame.start_date = '2026-10-20',
    frame => frame.fetched_at++
  ]) {
    const candidate = structuredClone(period); change(candidate);
    assert.equal(projectAdsPeriod(candidate), null);
  }
  const olderFrame = structuredClone(period); delete olderFrame.measurement;
  assert.deepEqual(projectAdsPeriod(olderFrame), olderFrame);
});

test('Hermes daily view consumes the same canonical day in BRL and preserves separate attribution', async () => {
  const summary = (await readSummary()).summary;
  const result = adsToday(summary, day);
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.currency, 'BRL');
  assert.equal(result.monetary_unit, 'BRL');
  assert.equal(result.expense_raw, '52.61');
  assert.deepEqual(result.direct, {conversions: 7, gmv_raw: '500.23', roas_raw: '9.5000'});
  assert.deepEqual(result.broad, {conversions: 15, gmv_raw: '1011.37', roas_raw: '19.28'});
  assert.equal(result.measurement.balance_cents, 3107);
  assert.equal(result.measurement.totals.broad.calculated_roas_raw, '19.223912');
  assert.equal(result.store_total_orders, null);
  assert.equal(adsToday(summary, '2026-10-20').status, 'UNAVAILABLE');
  const partial = (await readSummary({...payload(), daily: []})).summary;
  assert.equal(adsToday(partial, day).status, 'UNAVAILABLE');
  const tampered = structuredClone(summary); tampered.measurement.private_token = 'PRIVATE';
  assert.equal(adsToday(tampered, day).status, 'UNAVAILABLE');
  for (const secret of ['PRIVATE_SHOP_NAME', 'PRIVATE_TOKEN', 'PRIVATE_ROW_TOKEN']) assert.ok(!JSON.stringify(result).includes(secret));
});
