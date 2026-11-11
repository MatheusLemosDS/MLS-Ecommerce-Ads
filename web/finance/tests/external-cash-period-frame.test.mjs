import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {readExternalCashPeriodSummary} from '../src/external-cash-period.mjs';
import {createExternalCashPeriodProtocol, projectExternalCashPeriodRequest, projectExternalCashPeriodSummary,
  externalCashPeriodResponseMatches, externalCashPeriodPending} from '../src/external-cash-period-frame.mjs';

const request = (changes = {}) => ({schema: 'external_cash_period_request_v1', start_date: '2026-10-30', end_date: '2026-11-05', ...changes});
const empty = await readExternalCashPeriodSummary({FINANCE_DB: new D1()}, request(), {now: () => Date.parse('2026-11-11T15:00:00Z')});
function available() {
  const value = structuredClone(empty);
  value.state = 'AVAILABLE'; value.revision = 3;
  value.bank = {record_count: 3, credit_count: 1, credit_cents: 1234, debit_count: 1, debit_cents: 50, zero_count: 1,
    matched_credit_count: 1, matched_credit_cents: 1234, unmatched_credit_count: 0, unmatched_credit_cents: 0,
    review_count: 0, latest_import_at: value.checked_at};
  value.shopee = {record_count: 3, positive_count: 1, positive_cents: 1234, negative_count: 1, negative_cents: 12, zero_count: 1,
    transfer_cents: 1222, matched_transfer_count: 1, matched_transfer_cents: 1234, unmatched_transfer_count: 0,
    unmatched_transfer_cents: 0, review_count: 0, latest_import_at: value.checked_at};
  value.pending = externalCashPeriodPending(value.bank, value.shopee);
  return value;
}

test('cash period request has strict calendar dates, inclusive31date maximum and no tenant/cursor/mutation fields', () => {
  assert.deepEqual(projectExternalCashPeriodRequest(request()), request());
  assert.ok(projectExternalCashPeriodRequest(request({start_date: '2026-10-31', end_date: '2026-11-30'})));
  assert.ok(projectExternalCashPeriodRequest(request({start_date: '2026-11-05'})));
  for (const input of [null, [], {...request(), tenant: 'other'}, {...request(), operation: 'import'}, {...request(), cursor: null},
    request({start_date: '2026-11-06'}), request({end_date: '2026-11-30'}), request({end_date: '2026-02-30'}),
    request({start_date: '2026-1-01'}), request({schema: 'external_cash_request_v1'})]) assert.equal(projectExternalCashPeriodRequest(input), null);
});

test('cash period response projects only the separate immutable file-evidence DTO', () => {
  assert.deepEqual(projectExternalCashPeriodSummary(empty), empty);
  const value = available();
  assert.deepEqual(projectExternalCashPeriodSummary(value), value);
  assert.equal(value.shopee.transfer_cents, value.shopee.positive_cents - value.shopee.negative_cents);
  assert.equal(value.coverage, 'IMPORTED_FILES_ONLY');
  assert.equal(value.realized_profit_cents, null);
  assert.ok(externalCashPeriodResponseMatches(request(), value));
  assert.equal(externalCashPeriodResponseMatches(request({end_date: '2026-11-04'}), value), false);
});

test('cash period rejects incomplete sources masquerading as zero, profit/coverage assertions and arithmetic mismatches', () => {
  const changes = [
    value => value.bank.credit_cents = 0,
    value => value.realized_profit_cents = 123,
    value => value.coverage = 'COMPLETE',
    value => value.state = 'COMPLETE',
    value => value.pending = [],
    value => value.revision = -1,
    value => value.bank.latest_import_at = 1,
    value => value.balance_cents = 0,
    value => value.shopee.transfer_cents = Number.MAX_SAFE_INTEGER + 1,
  ];
  for (const change of changes) {const value = structuredClone(empty); change(value); assert.equal(projectExternalCashPeriodSummary(value), null);}
  for (const change of [value => value.bank.record_count++, value => value.bank.matched_credit_cents++,
    value => value.shopee.transfer_cents++, value => value.shopee.negative_cents = -1,
    value => value.bank.review_count = 4, value => value.bank.credit_count = -0,
    value => {value.bank.credit_cents = 0; value.bank.matched_credit_cents = 0;}]) {
    const value = available(); change(value); assert.equal(projectExternalCashPeriodSummary(value), null);
  }
});

test('cash period closed projectors reject accessors, inherited/extraneous properties and sparse pending arrays without invoking getters', () => {
  let calls = 0;
  const attack = {...request()}; Object.defineProperty(attack, 'start_date', {enumerable: true, get() {calls++; return '2026-10-30';}});
  assert.equal(projectExternalCashPeriodRequest(attack), null);
  const value = available(); Object.defineProperty(value.bank, 'credit_cents', {enumerable: true, get() {calls++; return 1234;}});
  assert.equal(projectExternalCashPeriodSummary(value), null);
  const missing = structuredClone(empty); delete missing.pending[0];
  assert.equal(projectExternalCashPeriodSummary(missing), null);
  assert.equal(calls, 0);
  assert.equal(projectExternalCashPeriodRequest(Object.assign(Object.create({owner: true}), request())), null);
});

test('cash period self-contained factory validates the same payload in an isolated browser-like evaluation', () => {
  const protocol = Function('return (' + createExternalCashPeriodProtocol.toString() + ')()')();
  assert.deepEqual(protocol.projectExternalCashPeriodRequest(request()), request());
  assert.deepEqual(protocol.projectExternalCashPeriodSummary(available()), available());
  assert.deepEqual(protocol.projectExternalCashPeriodSummary(empty), empty);
});
