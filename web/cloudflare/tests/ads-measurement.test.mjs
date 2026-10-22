import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildAdsMeasurement, projectAdsMeasurement} from '../src/ads-measurement.mjs';

const stamp = Date.UTC(2026, 9, 22, 12) / 1000;
const selection = {start_date: '2026-10-20', end_date: '2026-10-21'};
const source = () => ({
  status: 'ok', connected: true,
  shop: {id: 1178167501, name: 'PRIVATE_SHOP'},
  period: {start_date: '20-10-2026', end_date: '21-10-2026'},
  balance: 31.07, metrics: {spend: 999999999, roas: 999999999},
  daily: [
    {date: '20-10-2026', expense: 0.1, direct_gmv: '0.20', direct_order: 1, direct_roas: 2, broad_gmv: 0.3, broad_order: 2, broad_roas: 3},
    {date: '2026-10-21', expense: '0.20', direct_gmv: 0.6, direct_order: '2', direct_roas: '3.0000', broad_gmv: '1.20', broad_order: 4, broad_roas: 6}
  ], private_token: 'PRIVATE_TOKEN'
});
const build = (raw = source(), input = selection, at = stamp) => buildAdsMeasurement(raw, input, at);
const unavailable = frame => {
  assert.equal(frame.status, 'UNAVAILABLE');
  assert.equal(frame.expense_cents, null);
  assert.equal(frame.known_expense_cents, 0);
  assert.equal(frame.balance_cents, null);
  assert.ok(projectAdsMeasurement(frame));
};

test('canonical measurement sums exact daily cents and never reads rounded summary aggregates', () => {
  const frame = build();
  assert.equal(frame.status, 'AVAILABLE');
  assert.equal(frame.expense_cents, 30);
  assert.equal(frame.known_expense_cents, 30);
  assert.equal(frame.balance_cents, 3107);
  assert.equal(frame.totals.direct.gmv_cents, 80);
  assert.equal(frame.totals.broad.gmv_cents, 150);
  assert.equal(frame.totals.direct.orders, 3);
  assert.equal(frame.totals.broad.orders, 6);
  assert.equal(frame.totals.direct.calculated_roas_raw, '2.666667');
  assert.equal(frame.totals.broad.calculated_roas_raw, '5.000000');
  assert.equal(frame.totals.direct.reported_roas_raw, null);
  assert.equal(frame.totals.broad.reported_roas_raw, null);
  assert.equal(frame.days[1].direct.reported_roas_raw, '3.0000');
  assert.equal(frame.covered_days, 2);
  assert.equal(frame.total_days, 2);
  assert.deepEqual(frame.missing_dates, []);
  assert.equal(frame.day_partial, false);
  assert.equal(frame.source_timezone, 'UNCONFIRMED');
  assert.equal(frame.unit_confirmation, 'OPERATOR_CONFIRMED_BRL_2026_10_20');
  assert.equal(frame.basis, 'CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION');
  assert.equal(frame.fetched_at, stamp);
  assert.deepEqual(projectAdsMeasurement(frame), frame);
  for (const privateValue of ['PRIVATE_SHOP', 'PRIVATE_TOKEN', '999999999']) assert.ok(!JSON.stringify(frame).includes(privateValue));
});

test('the screenshot preserves provider ROAS 19.28 alongside independently calculated 19.223912', () => {
  const raw = source();
  raw.period.start_date = '21-10-2026';
  raw.daily = [{date: '21/10/2026', expense: 52.61, broad_gmv: 1011.37, broad_order: 15, broad_roas: 19.28}];
  const frame = build(raw, {start_date: '2026-10-21', end_date: '2026-10-21'});
  assert.equal(frame.expense_cents, 5261);
  assert.equal(frame.totals.broad.gmv_cents, 101137);
  assert.equal(frame.totals.broad.orders, 15);
  assert.equal(frame.totals.broad.reported_roas_raw, 19.28);
  assert.equal(frame.totals.broad.calculated_roas_raw, '19.223912');
  assert.deepEqual(frame.totals.broad, frame.days[0].broad);
  assert.equal(frame.totals.direct.gmv_cents, null);
  assert.equal(frame.totals.direct.orders, null);
});

test('period ROAS is a ratio of sums, never an average or sum of daily ROAS', () => {
  const raw = source();
  raw.daily[0].expense = 1;
  raw.daily[0].broad_gmv = 10;
  raw.daily[0].broad_roas = 10;
  raw.daily[1].expense = 9;
  raw.daily[1].broad_gmv = 18;
  raw.daily[1].broad_roas = 2;
  const frame = build(raw);
  assert.equal(frame.totals.broad.calculated_roas_raw, '2.800000');
  assert.equal(frame.totals.broad.reported_roas_raw, null);
  assert.equal(frame.days[0].broad.reported_roas_raw, 10);
  assert.equal(frame.days[1].broad.reported_roas_raw, 2);
});

test('rounding uses exact HALF_UP at six places, including half ties and very large ratios', () => {
  const raw = source();
  for (const [expense, gmv, expected] of [[128, 1, '0.007813'], [3, 1, '0.333333'], ['0.01', '90071992547409.91', '9007199254740991.000000']]) {
    raw.daily[0].expense = expense;
    raw.daily[0].broad_gmv = gmv;
    const frame = build({...raw, period: {...raw.period, end_date: raw.period.start_date}, daily: [raw.daily[0]]}, {...selection, end_date: selection.start_date});
    assert.equal(frame.days[0].broad.calculated_roas_raw, expected);
    assert.ok(projectAdsMeasurement(frame));
  }
});

test('direct and broad coverage are independent and a missing broad field never falls back to direct', () => {
  const raw = source();
  delete raw.daily[1].broad_gmv;
  delete raw.daily[0].direct_order;
  const frame = build(raw);
  assert.equal(frame.status, 'AVAILABLE');
  assert.equal(frame.expense_cents, 30);
  assert.equal(frame.days[1].broad.gmv_cents, null);
  assert.equal(frame.days[1].broad.calculated_roas_raw, null);
  assert.equal(frame.totals.broad.gmv_cents, null);
  assert.equal(frame.totals.broad.calculated_roas_raw, null);
  assert.equal(frame.totals.broad.orders, 6);
  assert.equal(frame.totals.direct.gmv_cents, 80);
  assert.equal(frame.totals.direct.orders, null);
});

test('missing days and invalid expense remain partial, with known subtotal distinct from a complete expense total', () => {
  const raw = source();
  raw.daily.pop();
  let frame = build(raw);
  assert.equal(frame.status, 'PARTIAL');
  assert.equal(frame.expense_cents, null);
  assert.equal(frame.known_expense_cents, 10);
  assert.equal(frame.covered_days, 1);
  assert.deepEqual(frame.missing_dates, ['2026-10-21']);
  assert.equal(frame.days[1].expense_cents, null);
  assert.equal(frame.totals.broad.gmv_cents, null);
  assert.equal(frame.totals.broad.orders, null);
  assert.equal(frame.diagnostic, 'ADS_MEASUREMENT_DATE_COVERAGE_PARTIAL');
  assert.ok(projectAdsMeasurement(frame));
  for (const invalid of [undefined, null, true, false, -1, -0, '-0', '', ' ', '01.00', '1e2', '50,00', 'NaN', NaN, Infinity, '0.001', 0.1 + 0.2, {}, [], '900719925474099.99', 90071992547409.9]) {
    const sourceValue = source();
    sourceValue.daily[1].expense = invalid;
    frame = build(sourceValue);
    assert.equal(frame.status, 'PARTIAL', String(invalid));
    assert.equal(frame.expense_cents, null);
    assert.equal(frame.known_expense_cents, 10);
    assert.equal(frame.days[1].expense_cents, null);
    assert.equal(frame.diagnostic, 'ADS_MEASUREMENT_EXPENSE_INVALID');
    assert.ok(projectAdsMeasurement(frame));
  }
  frame = build({...source(), daily: []});
  assert.equal(frame.status, 'PARTIAL');
  assert.equal(frame.covered_days, 0);
  assert.equal(frame.known_expense_cents, 0);
  assert.equal(frame.expense_cents, null);
});

test('explicit zero, missing values and invalid values remain distinct; zero expense has no invented ratio', () => {
  const raw = source();
  raw.daily.forEach(day => { day.expense = 0; day.broad_gmv = '0.00'; day.broad_order = 0; day.broad_roas = 0; });
  const frame = build(raw);
  assert.equal(frame.status, 'AVAILABLE');
  assert.equal(frame.expense_cents, 0);
  assert.equal(frame.known_expense_cents, 0);
  assert.equal(frame.totals.broad.gmv_cents, 0);
  assert.equal(frame.totals.broad.orders, 0);
  assert.equal(frame.totals.broad.calculated_roas_raw, null);
  assert.equal(frame.days[0].broad.reported_roas_raw, 0);
  for (const [field, invalid] of [['broad_gmv', '-1'], ['broad_order', 1.5], ['broad_order', '01'], ['broad_order', false], ['broad_order', Number.MAX_SAFE_INTEGER + 1], ['broad_roas', 'PRIVATE_TOKEN'], ['broad_roas', -0], ['broad_roas', Infinity], ['broad_roas', '1e2']]) {
    const other = source(); other.daily[0][field] = invalid;
    const result = build(other);
    const canonical = field.endsWith('_gmv') ? 'gmv_cents' : field.endsWith('_order') ? 'orders' : 'reported_roas_raw';
    assert.equal(result.days[0].broad[canonical], null);
    assert.equal(result.status, 'AVAILABLE');
    assert.ok(!JSON.stringify(result).includes('PRIVATE_TOKEN'));
  }
  for (const [value, cents] of [[1e2, 10000], [1e-2, 1], ['1.2300', 123], ['0', 0]]) {
    const other = source(); other.daily[0].expense = value;
    assert.equal(build(other).days[0].expense_cents, cents);
  }
});

test('balance is a separate credit balance and cannot contribute to expense or totals', () => {
  for (const balance of [0, '31.07', '5000.00', null, false, '-1', '1.001', {secret: 'PRIVATE'}]) {
    const raw = source(); raw.balance = balance;
    const frame = build(raw);
    assert.equal(frame.expense_cents, 30);
    assert.equal(frame.balance_cents, balance === 0 ? 0 : balance === '31.07' ? 3107 : balance === '5000.00' ? 500000 : null);
  }
});

test('identity, period, connection, dates and bounded daily list are pinned before metrics are trusted', () => {
  for (const change of [raw => raw.status = 'error', raw => raw.ok = false, raw => delete raw.status, raw => raw.connected = false, raw => raw.shop.id = 1, raw => raw.shop.id = '01178167501', raw => raw.period.start_date = '19-10-2026', raw => raw.period.end_date = '22-10-2026', raw => raw.daily = {}, raw => raw.daily = Array(16).fill(raw.daily[0]), raw => raw.daily[1].date = raw.daily[0].date, raw => raw.daily[1].date = '2026-10-22', raw => raw.daily[1].date = '31-02-2026', raw => raw.daily[1] = null]) {
    const raw = source(); change(raw); unavailable(build(raw));
  }
  const raw = source(); raw.shop.id = '1178167501'; raw.ok = true; raw.daily.reverse();
  assert.equal(build(raw).expense_cents, 30);
  assert.deepEqual(build(raw).days.map(day => day.date), ['2026-10-20', '2026-10-21']);
});

test('invalid requests produce finite configuration failures; day_partial uses Sao Paulo, never source timezone', () => {
  for (const input of [null, {}, {...selection, secret: 'PRIVATE'}, {...selection, end_date: '2026-10-23'}, {...selection, start_date: '2026-02-30'}, {...selection, end_date: '2026-10-19'}, {start_date: '2026-10-01', end_date: '2026-10-21'}]) {
    const frame = build(source(), input);
    unavailable(frame);
    assert.equal(frame.diagnostic, 'ADS_MEASUREMENT_CONFIGURATION');
  }
  for (const at of [0, NaN, Infinity, -1, stamp + 0.5, stamp * 1000]) unavailable(build(source(), selection, at));
  const at = Date.UTC(2026, 9, 22, 1) / 1000;
  const frame = build(source(), selection, at);
  assert.equal(frame.status, 'AVAILABLE');
  assert.equal(frame.day_partial, true);
  assert.equal(frame.source_timezone, 'UNCONFIRMED');
});

test('safe daily amounts cannot overflow an available period metric or expense', () => {
  for (const field of ['expense', 'broad_gmv', 'direct_gmv', 'broad_order', 'direct_order']) {
    const raw = source();
    raw.daily.forEach(day => day[field] = field.endsWith('_order') ? Number.MAX_SAFE_INTEGER : '50000000000000');
    const frame = build(raw);
    unavailable(frame);
    assert.equal(frame.diagnostic, 'ADS_MEASUREMENT_ARITHMETIC_UNSAFE');
  }
});

test('projection rejects private extras, forged equations, conflated attribution and altered metadata', () => {
  const frame = build();
  for (const change of [
    value => value.private_token = 'PRIVATE',
    value => value.balance_cents = -1,
    value => value.days[0].broad.private = 'PRIVATE',
    value => value.totals.private = 'PRIVATE',
    value => value.totals.broad.reported_roas_raw = 4.5,
    value => value.totals.broad.gmv_cents += value.totals.direct.gmv_cents,
    value => value.totals.broad.calculated_roas_raw = '4.500000',
    value => value.days[0].broad.calculated_roas_raw = 3,
    value => value.expense_cents++,
    value => value.known_expense_cents++,
    value => value.covered_days--,
    value => value.missing_dates = ['2026-10-21'],
    value => value.days.reverse(),
    value => value.unit_confirmation = 'UNKNOWN',
    value => value.source_timezone = 'America/Sao_Paulo',
    value => value.basis = 'ORDER_ATTRIBUTION',
    value => value.day_partial = true,
    value => value.diagnostic = 'PRIVATE_ERROR'
  ]) {
    const modified = structuredClone(frame); change(modified);
    assert.equal(projectAdsMeasurement(modified), null);
  }
  const partial = build({...source(), daily: []});
  assert.equal(projectAdsMeasurement({...partial, status: 'AVAILABLE', expense_cents: 0}), null);
  assert.equal(projectAdsMeasurement({...partial, known_expense_cents: 100}), null);
  const projected = projectAdsMeasurement(frame);
  projected.days[0].broad.gmv_cents = 0;
  assert.equal(frame.days[0].broad.gmv_cents, 30);
});

test('canonical projection is standalone, rejects accessors without executing them and ignores private raw extras', () => {
  const standalone = vm.runInNewContext('(' + projectAdsMeasurement.toString() + ')');
  // Pass a frame constructed in the same realm as the embedded projector.
  const projected = vm.runInNewContext('(' + projectAdsMeasurement.toString() + ')(' + JSON.stringify(build()) + ')');
  assert.equal(JSON.stringify(projected), JSON.stringify(build()));
  assert.equal(typeof standalone, 'function');
  let called = 0;
  const frame = build();
  Object.defineProperty(frame, 'days', {get() { called++; return []; }});
  assert.equal(projectAdsMeasurement(frame), null);
  const raw = source();
  Object.defineProperty(raw, 'private_getter', {get() { called++; throw Error('PRIVATE'); }});
  Object.defineProperty(raw.daily[0], 'private_getter', {get() { called++; throw Error('PRIVATE'); }});
  assert.equal(build(raw).expense_cents, 30);
  Object.defineProperty(raw.daily[0], 'expense', {get() { called++; return 10; }});
  assert.equal(build(raw).status, 'PARTIAL');
  assert.equal(called, 0);
});
