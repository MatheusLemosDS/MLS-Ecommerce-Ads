import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {FINANCE_PROFILE} from '../src/connection-store.mjs';
import {EXTERNAL_CASH_SCHEMA, previewExternalCashImport, mutateExternalCash, readExternalCashWorkspace} from '../src/external-cash-store.mjs';
import {readExternalCashPeriodSummary} from '../src/external-cash-period.mjs';
import {projectExternalCashPeriodSummary, projectExternalCashPeriodRequest} from '../src/external-cash-period-frame.mjs';

const requestSchema = 'external_cash_request_v1';
const tenant = [FINANCE_PROFILE.partner_id, FINANCE_PROFILE.shop_id, FINANCE_PROFILE.environment,
  FINANCE_PROFILE.region, 'external-cash-v1'].join(':');
const now = () => Date.parse('2026-11-11T15:00:00Z');
let sequence = 0;
const uuid = () => '12345678-1234-4123-8123-' + (++sequence).toString(16).padStart(12, '0');
const documentHash = () => (++sequence).toString(16).padStart(64, '0');
const period = (start_date = '2026-10-30', end_date = '2026-11-05') => ({schema: 'external_cash_period_request_v1', start_date, end_date});
const row = (line, changes = {}) => ({line, date: '2026-11-05', amount_cents: line,
  external_id: 'SYNTHETIC-PERIOD-' + line, reference: null, description: 'Synthetic imported file line',
  reported_status: null, ...changes});

class ObservedD1 extends D1 {
  executed = [];
  afterBatch = null;
  prepare(sql) {
    const statement = super.prepare(sql);
    for (const operation of ['run', 'all', 'first']) {
      const execute = statement[operation];
      statement[operation] = async (...args) => {
        this.executed.push(sql);
        return execute(...args);
      };
    }
    statement.testSql = sql;
    return statement;
  }
  async batch(statements) {
    const result = await super.batch(statements);
    if (this.afterBatch) await this.afterBatch(statements);
    return result;
  }
}

function fixture(t) {
  const db = new ObservedD1(), admin = new D1();
  t.after(() => { db.db.close(); admin.db.close(); });
  return {db, env: {FINANCE_DB: db, ADMIN_DB: admin}};
}
const schemaSnapshot = db => db.db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all();
const records = db => db.db.prepare('SELECT * FROM finance_external_cash_records WHERE tenant=? ORDER BY record_id').all(tenant);
const currentRevision = db => db.db.prepare('SELECT revision FROM finance_external_cash_state WHERE tenant=?').get(tenant).revision;
const snapshot = db => Object.fromEntries(['state', 'documents', 'imports', 'records', 'origins', 'matches', 'unlinks', 'requests', 'audit', 'guard']
  .map(name => [name, db.db.prepare('SELECT * FROM finance_external_cash_' + name + ' ORDER BY 1,2').all()]));
async function save(env, source, rows, changes = {}) {
  const input = {schema: requestSchema, operation: 'preview', source, bank_account_declared: true,
    completed_transfers_declared: source === 'SHOPEE', document_hash: documentHash(),
    selection: {format: source === 'SHOPEE' ? 'shopee_csv' : 'nubank_csv', date_format: 'YMD', amount_format: 'DECIMAL'}, rows};
  const preview = await previewExternalCashImport(env, input);
  return mutateExternalCash(env, {...input, operation: 'import', request_id: uuid(), expected_revision: preview.revision,
    preview_hash: preview.preview_hash, confirmed: true, ...changes}, {now});
}
async function match(db, env, bank, transfer) {
  return mutateExternalCash(env, {schema: requestSchema, operation: 'match', request_id: uuid(),
    expected_revision: currentRevision(db), confirmed: true, reason: 'Owner checked synthetic period evidence',
    pairs: [{bank_record_id: bank.record_id, transfer_record_id: transfer.record_id}]}, {now});
}
const rejects = (run, suffix, status = 503) => assert.rejects(run, error => {
  assert.equal(error.code, 'FINANCE_EXTERNAL_CASH_' + suffix);
  assert.equal(error.status, status);
  return true;
});
const onlySelects = db => assert.ok(db.executed.length > 0 && db.executed.every(sql => /^SELECT\b/.test(sql)),
  'the period reader must execute only SELECT statements');

test('a cold period has unknown amounts, no coverage claim and performs no schema or data writes', async t => {
  const {db, env} = fixture(t), before = schemaSnapshot(db);
  const frame = await readExternalCashPeriodSummary(env, period(), {now});
  assert.ok(projectExternalCashPeriodSummary(frame));
  assert.equal(frame.state, 'NO_IMPORTED_RECORDS');
  assert.equal(frame.revision, 0);
  assert.equal(frame.coverage, 'IMPORTED_FILES_ONLY');
  assert.equal(frame.realized_profit_cents, null);
  assert.equal(frame.bank.record_count, 0);
  assert.equal(frame.bank.credit_cents, null);
  assert.equal(frame.bank.debit_cents, null);
  assert.equal(frame.shopee.transfer_cents, null);
  assert.deepEqual(frame.pending, ['IMPORTED_COVERAGE_NOT_CONFIRMED', 'NO_IMPORTED_RECORDS', 'BANK_RECORDS_NOT_IMPORTED', 'SHOPEE_TRANSFERS_NOT_IMPORTED']);
  onlySelects(db);
  assert.deepEqual(schemaSnapshot(db), before);
  assert.deepEqual(before, []);
});

test('a healthy empty schema remains unmodified without inventing a tenant state or a zero statement balance', async t => {
  const {db, env} = fixture(t);
  db.db.exec(EXTERNAL_CASH_SCHEMA.join(';'));
  const before = snapshot(db), objects = schemaSnapshot(db);
  const frame = await readExternalCashPeriodSummary(env, period(), {now});
  assert.equal(frame.state, 'NO_IMPORTED_RECORDS');
  assert.equal(frame.bank.latest_import_at, null);
  assert.equal(frame.shopee.positive_cents, null);
  onlySelects(db);
  assert.deepEqual(snapshot(db), before);
  assert.deepEqual(schemaSnapshot(db), objects);
});

test('period totals include more than one hundred rows, independently of legacy page size and duplicate file origins', async t => {
  const {db, env} = fixture(t), imported = Array.from({length: 250}, (_, index) => row(index + 1));
  await save(env, 'NUBANK', imported);
  await save(env, 'NUBANK', imported.slice(0, 50));
  const page = await readExternalCashWorkspace(env, {schema: requestSchema, operation: 'read', month: '2026-11', limit: 100});
  assert.equal(page.records.length, 100);
  assert.notEqual(page.next_cursor, null);
  const before = snapshot(db), objects = schemaSnapshot(db);
  db.executed.length = 0;
  const frame = await readExternalCashPeriodSummary(env, period(), {now});
  assert.ok(projectExternalCashPeriodSummary(frame));
  assert.equal(frame.revision, 2);
  assert.equal(frame.bank.record_count, 250);
  assert.equal(frame.bank.credit_count, 250);
  assert.equal(frame.bank.credit_cents, 31375);
  assert.equal(frame.bank.unmatched_credit_cents, 31375);
  assert.equal(frame.bank.unmatched_credit_count, 250);
  assert.equal(frame.shopee.record_count, 0);
  assert.equal(frame.shopee.transfer_cents, null);
  assert.equal(frame.realized_profit_cents, null);
  onlySelects(db);
  assert.deepEqual(snapshot(db), before);
  assert.deepEqual(schemaSnapshot(db), objects);
});

test('bank and transfer dates remain independent across a month boundary, including matches outside the selected calendar', async t => {
  const {db, env} = fixture(t);
  await save(env, 'NUBANK', [row(1, {date: '2026-10-31', amount_cents: 10000}),
    row(2, {date: '2026-10-29', amount_cents: 777}), row(3, {date: '2026-11-06', amount_cents: 888})]);
  await save(env, 'SHOPEE', [row(1, {date: '2026-11-01', amount_cents: 10000})]);
  const saved = records(db), bank = saved.find(value => value.source === 'NUBANK' && value.amount_cents === 10000),
    transfer = saved.find(value => value.source === 'SHOPEE');
  await match(db, env, bank, transfer);
  db.executed.length = 0;
  const full = await readExternalCashPeriodSummary(env, period(), {now});
  assert.equal(full.bank.record_count, 1);
  assert.equal(full.bank.credit_cents, 10000);
  assert.equal(full.bank.matched_credit_cents, 10000);
  assert.equal(full.shopee.record_count, 1);
  assert.equal(full.shopee.transfer_cents, 10000);
  assert.equal(full.shopee.matched_transfer_cents, 10000);
  assert.equal(full.realized_profit_cents, null);
  assert.equal(Object.hasOwn(full, 'total_income_cents'), false, 'a matched transfer and its bank credit are not two combined revenues');
  assert.ok(full.pending.includes('IMPORTED_COVERAGE_NOT_CONFIRMED'));
  assert.ok(!full.pending.includes('UNMATCHED_BANK_CREDITS'));
  const october = await readExternalCashPeriodSummary(env, period('2026-10-30', '2026-10-31'), {now});
  assert.equal(october.bank.credit_cents, 10000);
  assert.equal(october.bank.matched_credit_cents, 10000);
  assert.equal(october.shopee.record_count, 0);
  assert.equal(october.shopee.transfer_cents, null);
  const november = await readExternalCashPeriodSummary(env, period('2026-11-01', '2026-11-05'), {now});
  assert.equal(november.bank.credit_cents, null);
  assert.equal(november.shopee.transfer_cents, 10000);
  assert.equal(november.shopee.matched_transfer_cents, 10000);
  onlySelects(db);
});

test('unlink removes a match from aggregate coverage while preserving all original amounts and audited rows', async t => {
  const {db, env} = fixture(t);
  await save(env, 'NUBANK', [row(1, {amount_cents: 5000})]);
  await save(env, 'SHOPEE', [row(1, {amount_cents: 5000})]);
  const saved = records(db), matched = await match(db, env, saved.find(value => value.source === 'NUBANK'), saved.find(value => value.source === 'SHOPEE'));
  const before = await readExternalCashPeriodSummary(env, period(), {now});
  assert.equal(before.bank.matched_credit_cents, 5000);
  await mutateExternalCash(env, {schema: requestSchema, operation: 'unlink', request_id: uuid(),
    expected_revision: currentRevision(db), confirmed: true, reason: 'Owner corrected synthetic evidence',
    match_id: matched.result.match_ids[0]}, {now});
  const evidence = snapshot(db);
  db.executed.length = 0;
  const after = await readExternalCashPeriodSummary(env, period(), {now});
  assert.equal(after.revision, before.revision + 1);
  assert.equal(after.bank.credit_cents, before.bank.credit_cents);
  assert.equal(after.shopee.transfer_cents, before.shopee.transfer_cents);
  assert.equal(after.bank.matched_credit_count, 0);
  assert.equal(after.bank.matched_credit_cents, 0);
  assert.equal(after.bank.unmatched_credit_cents, 5000);
  assert.equal(after.shopee.matched_transfer_cents, 0);
  assert.equal(after.shopee.unmatched_transfer_cents, 5000);
  assert.ok(after.pending.includes('UNMATCHED_BANK_CREDITS'));
  assert.ok(after.pending.includes('UNMATCHED_SHOPEE_TRANSFERS'));
  onlySelects(db);
  assert.deepEqual(snapshot(db), evidence);
});

test('signed bank movement and nonpositive Shopee records are kept separate, with review pending preserved', async t => {
  const {db, env} = fixture(t);
  await save(env, 'NUBANK', [row(1, {amount_cents: 1000}), row(2, {amount_cents: -350}), row(3, {amount_cents: 0}),
    row(4, {amount_cents: 500, external_id: null}), row(5, {amount_cents: 500, external_id: null})]);
  await save(env, 'SHOPEE', [row(1, {amount_cents: 800}), row(2, {amount_cents: -100}), row(3, {amount_cents: 0})]);
  const frame = await readExternalCashPeriodSummary(env, period(), {now});
  assert.equal(frame.bank.record_count, 5);
  assert.equal(frame.bank.credit_cents, 2000);
  assert.equal(frame.bank.debit_count, 1);
  assert.equal(frame.bank.debit_cents, 350);
  assert.equal(frame.bank.zero_count, 1);
  assert.equal(frame.bank.review_count, 2);
  assert.equal(frame.shopee.positive_cents, 800);
  assert.equal(frame.shopee.negative_cents, 100);
  assert.equal(frame.shopee.transfer_cents, 700);
  assert.equal(frame.shopee.zero_count, 1);
  assert.ok(frame.pending.includes('IMPORTED_RECORD_REVIEW_REQUIRED'));
  assert.ok(frame.pending.includes('NONPOSITIVE_SHOPEE_TRANSFERS'));
  assert.equal(frame.realized_profit_cents, null);
});

test('aggregation is exact at the safe-integer boundary and refuses an overflowing total', async t => {
  const {db, env} = fixture(t);
  await save(env, 'NUBANK', [row(1, {amount_cents: Number.MAX_SAFE_INTEGER - 1}), row(2, {amount_cents: 1})]);
  const exact = await readExternalCashPeriodSummary(env, period(), {now});
  assert.equal(exact.bank.credit_cents, Number.MAX_SAFE_INTEGER);
  assert.equal(exact.bank.unmatched_credit_cents, Number.MAX_SAFE_INTEGER);
  await save(env, 'NUBANK', [row(3, {amount_cents: 1})]);
  const before = snapshot(db);
  db.executed.length = 0;
  await rejects(() => readExternalCashPeriodSummary(env, period(), {now}), 'STORAGE_INVALID');
  onlySelects(db);
  assert.deepEqual(snapshot(db), before);
});

test('a writer after the aggregate snapshot causes a revision conflict instead of a mixed report', async t => {
  const {db, env} = fixture(t);
  await save(env, 'NUBANK', [row(1, {amount_cents: 1000})]);
  let injected = false;
  db.afterBatch = statements => {
    if (injected || !statements.some(value => /GROUP BY r.source/.test(value.testSql))) return;
    injected = true;
    // This is the competing writer, outside the reader's prepared statements.
    db.db.prepare('UPDATE finance_external_cash_state SET revision=revision+1 WHERE tenant=?').run(tenant);
  };
  db.executed.length = 0;
  await rejects(() => readExternalCashPeriodSummary(env, period(), {now}), 'REVISION_CONFLICT', 409);
  assert.equal(injected, true);
  onlySelects(db);
  db.afterBatch = null;
  const frame = await readExternalCashPeriodSummary(env, period(), {now});
  assert.equal(frame.revision, 2);
  assert.equal(frame.bank.credit_cents, 1000);
});

test('foreign tenant records and links cannot change the fixed owner aggregate', async t => {
  const {db, env} = fixture(t);
  await save(env, 'NUBANK', [row(1, {amount_cents: 1000})]);
  await save(env, 'SHOPEE', [row(1, {amount_cents: 1000})]);
  const saved = records(db), bank = saved.find(value => value.source === 'NUBANK'), transfer = saved.find(value => value.source === 'SHOPEE'), foreign = tenant + ':FOREIGN';
  db.db.prepare('INSERT INTO finance_external_cash_state(tenant,revision) VALUES(?,99)').run(foreign);
  db.db.prepare('INSERT INTO finance_external_cash_records SELECT ?,record_id,source,date,999999,currency,external_id,reference,description,reported_status,status,import_id,review_hint,created_at FROM finance_external_cash_records WHERE tenant=? AND record_id=?').run(foreign, tenant, bank.record_id);
  db.db.prepare("INSERT INTO finance_external_cash_matches(tenant,match_id,bank_record_id,transfer_record_id,confirmed_at,reason,actor,revision) VALUES(?,?,?,?,?,'Synthetic foreign evidence','OWNER',99)")
    .run(foreign, uuid(), bank.record_id, transfer.record_id, Math.floor(now() / 1000));
  const frame = await readExternalCashPeriodSummary(env, period(), {now});
  assert.equal(frame.revision, 2);
  assert.equal(frame.bank.record_count, 1);
  assert.equal(frame.bank.credit_cents, 1000);
  assert.equal(frame.bank.matched_credit_cents, 0);
  assert.equal(frame.bank.unmatched_credit_cents, 1000);
  assert.equal(frame.shopee.matched_transfer_cents, 0);
  assert.equal(frame.shopee.transfer_cents, 1000);
});

test('strict periods reject invalid dates, extra tenant or pagination fields and shared database configuration before a read', async t => {
  const {db, env} = fixture(t);
  const allowed = await readExternalCashPeriodSummary(env, period('2026-10-15', '2026-11-14'), {now});
  assert.equal(allowed.start_date, '2026-10-15');
  db.executed.length = 0;
  for (const input of [period('2026-10-15', '2026-11-15'), period('2026-11-05', '2026-10-30'), period('2026-02-30', '2026-03-01'),
    {...period(), tenant: 'FOREIGN'}, {...period(), shop_id: 'FOREIGN'}, {...period(), limit: 1}, {...period(), cursor: 'foreign'}, {...period(), schema: 'external_cash_request_v1'}]) {
    assert.equal(projectExternalCashPeriodRequest(input), null);
    await rejects(() => readExternalCashPeriodSummary(env, input, {now}), 'REQUEST_INVALID', 400);
  }
  assert.equal(db.executed.length, 0);
  await rejects(() => readExternalCashPeriodSummary({FINANCE_DB: db, ADMIN_DB: db}, period(), {now}), 'CONFIGURATION');
  assert.equal(db.executed.length, 0);
});

test('damaged schema protections are refused with SELECT-only health checks and no repair writes', async t => {
  const {db, env} = fixture(t);
  await save(env, 'NUBANK', [row(1)]);
  db.db.exec('DROP TRIGGER finance_external_cash_records_no_update');
  const before = snapshot(db), objects = schemaSnapshot(db);
  db.executed.length = 0;
  await rejects(() => readExternalCashPeriodSummary(env, period(), {now}), 'STORAGE_INVALID');
  onlySelects(db);
  assert.deepEqual(snapshot(db), before);
  assert.deepEqual(schemaSnapshot(db), objects);
});
