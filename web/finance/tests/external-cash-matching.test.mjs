import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestExternalCashPairs} from '../src/external-cash-matching.mjs';

const record = (record_id, source, values = {}) => ({record_id, source, date: '2026-11-10',
  amount_cents: 12345, currency: 'BRL', status: source === 'NUBANK' ? 'POSTED' : 'COMPLETED',
  reference: null, match_id: null, ...values});

test('amount and dates only suggest every eligible pair, preserving ambiguity and inputs', () => {
  const records = [record('bank-b', 'NUBANK'), record('transfer-b', 'SHOPEE'),
    record('bank-a', 'NUBANK'), record('transfer-a', 'SHOPEE')];
  const before = structuredClone(records), result = suggestExternalCashPairs(records);
  assert.deepEqual(result.suggestions.map(row => [row.bank_record_id, row.transfer_record_id]), [
    ['bank-a', 'transfer-a'], ['bank-a', 'transfer-b'], ['bank-b', 'transfer-a'], ['bank-b', 'transfer-b'],
  ]);
  assert.ok(result.suggestions.every(row => row.confidence === 'AMOUNT_DATE' && row.state === 'SUGGESTED'));
  assert.equal(result.truncated, false);
  assert.deepEqual(records, before);
});

test('bank calendar days include both seven-day boundaries across months and leap years', () => {
  const records = [record('bank', 'NUBANK', {date: '2024-03-01'}),
    record('before', 'SHOPEE', {date: '2024-02-23'}),
    record('after', 'SHOPEE', {date: '2024-03-08'}),
    record('too-early', 'SHOPEE', {date: '2024-02-22'}),
    record('too-late', 'SHOPEE', {date: '2024-03-09'})];
  const result = suggestExternalCashPairs(records);
  assert.deepEqual(result.suggestions.map(row => [row.transfer_record_id, row.day_distance]), [['after', 7], ['before', 7]]);
});

test('unique exact shared references rank first without becoming confirmed', () => {
  const records = [record('bank', 'NUBANK', {reference: 'CASE-1'}),
    record('near', 'SHOPEE'), record('reference', 'SHOPEE', {date: '2026-11-03', reference: 'CASE-1'}),
    record('case-different', 'SHOPEE', {reference: 'case-1'})];
  const result = suggestExternalCashPairs(records);
  assert.deepEqual(result.suggestions.map(row => [row.transfer_record_id, row.confidence]), [
    ['reference', 'SHARED_REFERENCE'], ['case-different', 'AMOUNT_DATE'], ['near', 'AMOUNT_DATE'],
  ]);
  assert.ok(result.suggestions.every(row => row.state === 'SUGGESTED'));
});

test('a reference repeated on either side loses higher confidence even outside the date or amount window', () => {
  for (const source of ['NUBANK', 'SHOPEE']) {
    const rows = [record('bank', 'NUBANK', {reference: 'SAME'}), record('transfer', 'SHOPEE', {reference: 'SAME'}),
      record('elsewhere', source, {date: '2026-01-01', amount_cents: 1, reference: 'SAME'})];
    assert.deepEqual(suggestExternalCashPairs(rows).suggestions, [{bank_record_id: 'bank', transfer_record_id: 'transfer',
      amount_cents: 12345, day_distance: 0, confidence: 'AMOUNT_DATE', state: 'SUGGESTED'}]);
  }
});

test('ineligible currencies, signs, dates, states and linked records cannot suggest or form value groups', () => {
  const rows = [record('bank', 'NUBANK')];
  for (const [index, values] of [{currency: 'USD'}, {amount_cents: -12345}, {amount_cents: 0},
    {amount_cents: 12345.01}, {amount_cents: 12344}, {date: '2026-02-30'},
    {status: 'PENDING'}, {match_id: 'existing'}, {source: 'NUBANK'},
    {amount_cents: 6000}, {amount_cents: 6345}].entries()) rows.push(record('excluded-' + index, 'SHOPEE', values));
  assert.deepEqual(suggestExternalCashPairs(rows), {suggestions: [], truncated: false});
  assert.deepEqual(suggestExternalCashPairs([record('debit', 'NUBANK', {amount_cents: -12345}), record('transfer', 'SHOPEE')]),
    {suggestions: [], truncated: false});
});

test('bounded suggestions keep the globally strongest candidates and report truncation deterministically', () => {
  const rows = [record('bank-z', 'NUBANK'), record('bank-a', 'NUBANK', {reference: 'UNIQUE'}),
    ...Array.from({length: 50}, (_, index) => record('transfer-' + String(index).padStart(3, '0'), 'SHOPEE')),
    record('transfer-ref', 'SHOPEE', {date: '2026-11-17', reference: 'UNIQUE'})];
  const expected = suggestExternalCashPairs(rows, {limit: 3});
  assert.equal(expected.truncated, true);
  assert.deepEqual(expected.suggestions.map(row => [row.bank_record_id, row.transfer_record_id]), [
    ['bank-a', 'transfer-ref'], ['bank-a', 'transfer-000'], ['bank-a', 'transfer-001'],
  ]);
  assert.deepEqual(suggestExternalCashPairs([...rows].reverse(), {limit: 3}), expected);
  const exact = suggestExternalCashPairs([record('bank', 'NUBANK'), record('transfer', 'SHOPEE')], {limit: 1});
  assert.equal(exact.suggestions.length, 1);
  assert.equal(exact.truncated, false);
});

test('ambiguous record identities and malformed rows are excluded without reading accessors', () => {
  let reads = 0;
  const poisoned = record('poisoned', 'SHOPEE');
  Object.defineProperty(poisoned, 'amount_cents', {get() {reads++; return 12345;}});
  const rows = [null, [], {}, poisoned, record('bank', 'NUBANK'), record('duplicate', 'SHOPEE'),
    record('duplicate', 'SHOPEE', {amount_cents: 2}), record('valid', 'SHOPEE', {unrelated: 'ignored'})];
  assert.deepEqual(suggestExternalCashPairs(rows).suggestions.map(row => row.transfer_record_id), ['valid']);
  assert.equal(reads, 0);
  for (const limit of [0, 101, 1.5, NaN]) assert.throws(() => suggestExternalCashPairs([], {limit}), /EXTERNAL_CASH_MATCHING_INPUT_INVALID/);
});

test('a dense thousand-row input returns only the bounded page', () => {
  const rows = Array.from({length: 1000}, (_, index) => record(String(index).padStart(4, '0'), index < 500 ? 'NUBANK' : 'SHOPEE'));
  const result = suggestExternalCashPairs(rows);
  assert.equal(result.suggestions.length, 100);
  assert.equal(result.truncated, true);
  assert.equal(result.suggestions[0].bank_record_id, '0000');
  assert.equal(result.suggestions[99].transfer_record_id, '0599');
});
