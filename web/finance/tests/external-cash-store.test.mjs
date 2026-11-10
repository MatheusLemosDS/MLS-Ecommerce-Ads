import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {FINANCE_PROFILE} from '../src/connection-store.mjs';
import {projectExternalCashResponse} from '../src/external-cash-frame.mjs';
import {EXTERNAL_CASH_SCHEMA, readExternalCashWorkspace, previewExternalCashImport, mutateExternalCash} from '../src/external-cash-store.mjs';

const schema = 'external_cash_request_v1';
const now = () => Date.parse('2026-11-10T15:00:00Z');
let sequence = 0;
const requestId = () => '12345678-1234-4123-8123-' + (++sequence).toString(16).padStart(12, '0');
const documentHash = value => value.toString(16).padStart(64, '0');
const row = (line = 1, changes = {}) => ({line, date: '2026-11-10', amount_cents: 12345,
  external_id: 'SYNTHETIC-' + line, reference: null, description: 'Synthetic file evidence', reported_status: null, ...changes});
const previewInput = (source = 'NUBANK', rows = [row()], document = 1, changes = {}) => ({schema, operation: 'preview', source,
  bank_account_declared: true, completed_transfers_declared: source === 'SHOPEE', document_hash: documentHash(document),
  selection: {format: source === 'SHOPEE' ? 'shopee_csv' : 'nubank_csv', date_format: 'YMD', amount_format: 'DECIMAL'}, rows, ...changes});
const readInput = (changes = {}) => ({schema, operation: 'read', month: '2026-11', ...changes});

class ObservedD1 extends D1 {
  sql = [];
  executed = [];
  batches = [];
  beforeBatch = null;
  afterBatch = null;
  prepare(sql) {
    this.sql.push(sql);
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
    this.batches.push(statements.map(statement => statement.testSql));
    if (this.beforeBatch) await this.beforeBatch(statements);
    const result = await super.batch(statements);
    if (this.afterBatch) await this.afterBatch(statements);
    return result;
  }
}
function fixture() {
  const db = new ObservedD1(), env = {FINANCE_DB: db, ADMIN_DB: new D1()};
  return {db, env};
}
const tables = db => db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(item => item.name);
const count = (db, name) => db.db.prepare('SELECT COUNT(*) n FROM finance_external_cash_' + name).get().n;
const revision = db => db.db.prepare('SELECT revision FROM finance_external_cash_state').get().revision;
const records = db => db.db.prepare('SELECT * FROM finance_external_cash_records ORDER BY record_id').all();
const snapshot = db => Object.fromEntries(['state', 'documents', 'imports', 'records', 'origins', 'matches', 'unlinks', 'requests', 'audit']
  .map(name => [name, db.db.prepare('SELECT * FROM finance_external_cash_' + name + ' ORDER BY 1,2').all()]));
async function command(env, input, changes = {}, previewImport = previewExternalCashImport) {
  const preview = await previewImport(env, input);
  const {cursor, limit, ...payload} = input;
  return {...payload, operation: 'import', request_id: requestId(), expected_revision: preview.revision,
    preview_hash: preview.preview_hash, confirmed: true, ...changes};
}
async function save(env, input) {
  return mutateExternalCash(env, await command(env, input), {now});
}
const rejects = (run, suffix, status) => assert.rejects(run, error => {
  assert.equal(error.code, 'FINANCE_EXTERNAL_CASH_' + suffix);
  if (status) assert.equal(error.status, status);
  return true;
});
const pairFor = db => {
  const saved = records(db);
  return {bank_record_id: saved.find(item => item.source === 'NUBANK' && item.amount_cents > 0).record_id,
    transfer_record_id: saved.find(item => item.source === 'SHOPEE' && item.amount_cents > 0).record_id};
};
const matchInput = (rev, pairs, changes = {}) => ({schema, operation: 'match', request_id: requestId(), expected_revision: rev,
  confirmed: true, reason: 'Owner checked synthetic evidence', pairs, ...changes});

test('cold READ and PREVIEW use SELECT only and rejected owner confirmation creates no schema', async () => {
  const {db, env} = fixture();
  const workspace = await readExternalCashWorkspace(env, readInput());
  assert.ok(projectExternalCashResponse(workspace));
  assert.equal(workspace.revision, 0);
  assert.equal(workspace.summary.record_count, 0);
  const preview = await previewExternalCashImport(env, previewInput());
  assert.ok(projectExternalCashResponse(preview));
  assert.deepEqual(preview.counts, {total: 1, new: 1, duplicates: 0, review: 0});
  const input = await command(env, previewInput());
  for (const confirmed of [false, null, undefined]) {
    await rejects(() => mutateExternalCash(env, {...input, confirmed}, {now}), 'REQUEST_INVALID', 400);
  }
  assert.deepEqual(tables(db), []);
  assert.ok(db.sql.length > 0 && db.sql.every(sql => /^SELECT\b/.test(sql)));
});

test('a thousand-row import uses a bounded number of JSON1 statements and paginated responses', async () => {
  async function run(size) {
    const f = fixture();
    const input = previewInput('NUBANK', Array.from({length: size}, (_, index) => row(index + 1, {amount_cents: index + 1})));
    const write = await command(f.env, input);
    f.db.sql.length = 0;
    f.db.executed.length = 0;
    const saved = await mutateExternalCash(f.env, write, {now});
    assert.ok(projectExternalCashResponse(saved));
    assert.equal(saved.result.inserted_count, size);
    assert.equal(count(f.db, 'records'), size);
    assert.equal(count(f.db, 'origins'), size);
    assert.equal(count(f.db, 'audit'), 1);
    assert.equal(count(f.db, 'requests'), 1);
    return {...f, queries: f.db.executed.length};
  }
  const small = await run(1), large = await run(1000);
  assert.equal(large.queries, small.queries);
  assert.ok(large.queries <= 45, `cold thousand-row mutation executed ${large.queries} statements`);
  assert.ok(large.db.sql.some(sql => /INSERT OR IGNORE INTO finance_external_cash_records/.test(sql) && /json_each/.test(sql)));
  const found = new Set();
  let cursor = null, pages = 0;
  do {
    const page = await readExternalCashWorkspace(large.env, readInput({limit: 100, cursor}));
    assert.ok(projectExternalCashResponse(page));
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 128 * 1024);
    assert.equal(page.summary.record_count, 1000);
    for (const item of page.records) {assert.equal(found.has(item.record_id), false); found.add(item.record_id);}
    cursor = page.next_cursor;
    pages++;
  } while (cursor !== null);
  assert.equal(pages, 10);
  assert.equal(found.size, 1000);
});

test('a fresh worker isolate imports a thousand rows into an existing database within the statement budget', async () => {
  const {db, env} = fixture();
  await save(env, previewInput());
  const isolated = await import('../src/external-cash-store.mjs?isolate=statement-budget-' + requestId());
  const rows = Array.from({length: 1000}, (_, index) => row(index + 1, {
    external_id: 'SECOND-FILE-' + index, amount_cents: index + 1,
  }));
  const write = await command(env, previewInput('NUBANK', rows, 2), {}, isolated.previewExternalCashImport);
  db.executed.length = 0;
  const saved = await isolated.mutateExternalCash(env, write, {now});
  const executed = [...db.executed];
  assert.ok(projectExternalCashResponse(saved));
  assert.equal(saved.result.inserted_count, 1000);
  assert.equal(count(db, 'records'), 1001);
  assert.equal(count(db, 'audit'), 2);
  assert.ok(executed.length <= 45, `fresh existing-database mutation executed ${executed.length} statements`);
  assert.ok(executed.every(sql => !/^CREATE\b/.test(sql)), 'healthy existing schema is verified without DDL');
  const before = snapshot(db);
  const replayIsolate = await import('../src/external-cash-store.mjs?isolate=receipt-replay-' + requestId());
  db.executed.length = 0;
  const replayed = await replayIsolate.mutateExternalCash(env, write, {
    now: () => {throw Error('replay must finish before CAS and clock validation');},
  });
  assert.deepEqual(replayed, {...saved, replayed: true});
  assert.ok(db.executed.every(sql => /^SELECT\b/.test(sql)));
  assert.deepEqual(snapshot(db), before);
});

test('a fresh isolate refuses missing or altered schema protections without DDL or financial writes', async () => {
  for (const alteration of ['missing_trigger', 'altered_trigger', 'missing_index', 'malformed_table']) {
    const {db, env} = fixture();
    await save(env, previewInput());
    const next = previewInput('NUBANK', [row(2)], 2);
    const write = await command(env, next);
    if (alteration.endsWith('_trigger')) {
      const trigger = 'finance_external_cash_records_no_update';
      db.db.exec('DROP TRIGGER ' + trigger);
      if (alteration === 'altered_trigger') {
        db.db.exec('CREATE TRIGGER ' + trigger + ' BEFORE UPDATE ON finance_external_cash_records BEGIN SELECT 1; END');
      }
    } else if (alteration === 'missing_index') {
      db.db.exec('DROP INDEX finance_external_cash_records_amount');
    } else {
      db.db.exec('ALTER TABLE finance_external_cash_records ADD COLUMN unexpected_column TEXT');
    }
    const before = snapshot(db);
    for (const operation of ['read', 'preview', 'import']) {
      const isolated = await import('../src/external-cash-store.mjs?isolate=damaged-' + alteration + '-' + operation + '-' + requestId());
      db.executed.length = 0;
      await rejects(() => operation === 'read' ? isolated.readExternalCashWorkspace(env, readInput())
        : operation === 'preview' ? isolated.previewExternalCashImport(env, next)
          : isolated.mutateExternalCash(env, write, {now}), 'STORAGE_INVALID', 503);
      assert.ok(db.executed.length > 0);
      assert.ok(db.executed.every(sql => /^SELECT\b/.test(sql)), `${alteration} ${operation} executes only health reads`);
      assert.deepEqual(snapshot(db), before);
    }
  }
});

test('an existing healthy schema without tenant state initializes only the tenant row before a bulk import', async () => {
  const {db, env} = fixture();
  db.db.exec(EXTERNAL_CASH_SCHEMA.join(';'));
  assert.equal(count(db, 'state'), 0);
  const isolated = await import('../src/external-cash-store.mjs?isolate=empty-tenant-' + requestId());
  const rows = Array.from({length: 1000}, (_, index) => row(index + 1, {amount_cents: index + 1}));
  const write = await command(env, previewInput('NUBANK', rows), {}, isolated.previewExternalCashImport);
  assert.equal(write.expected_revision, 0);
  db.executed.length = 0;
  const saved = await isolated.mutateExternalCash(env, write, {now});
  assert.equal(saved.revision, 1);
  assert.equal(saved.result.inserted_count, 1000);
  assert.equal(count(db, 'state'), 1);
  assert.equal(count(db, 'records'), 1000);
  assert.equal(count(db, 'audit'), 1);
  assert.ok(db.executed.length <= 45);
  assert.ok(db.executed.every(sql => !/^CREATE\b/.test(sql)), 'schema is verified rather than recreated');
  assert.equal(db.executed.filter(sql => /^INSERT OR IGNORE INTO finance_external_cash_state\b/.test(sql)).length, 1);
});

test('external IDs are case sensitive and scoped by source; same ID date or amount conflict blocks the entire import', async () => {
  const {db, env} = fixture();
  await save(env, previewInput('NUBANK', [row(1, {external_id: 'Case-ID'}), row(2, {external_id: 'case-id'})]));
  await save(env, previewInput('SHOPEE', [row(1, {external_id: 'Case-ID'})], 2));
  assert.equal(count(db, 'records'), 3);
  const duplicate = await save(env, previewInput('NUBANK', [row(8, {external_id: 'Case-ID'})], 3));
  assert.equal(duplicate.result.inserted_count, 0);
  assert.equal(duplicate.result.duplicate_count, 1);
  const before = snapshot(db);
  for (const changed of [{amount_cents: 12346}, {date: '2026-11-09'}]) {
    const input = previewInput('NUBANK', [row(1, {external_id: 'Case-ID', ...changed}), row(2, {external_id: 'NEW-ATOMIC'})], 4);
    const preview = await previewExternalCashImport(env, input);
    assert.equal(preview.can_import, false);
    assert.equal(preview.rows[0].state, 'REVIEW');
    await rejects(() => mutateExternalCash(env, {...input, operation: 'import', request_id: requestId(), expected_revision: preview.revision,
      preview_hash: preview.preview_hash, confirmed: true}, {now}), 'IMPORT_CONFLICT', 409);
    assert.deepEqual(snapshot(db), before);
  }
});

test('no-ID file plus line identities survive filtered reimports while same-value entries remain separate and reviewed', async () => {
  const {db, env} = fixture();
  const first = row(7, {external_id: null});
  await save(env, previewInput('NUBANK', [first], 10));
  const original = records(db)[0];
  const second = row(11, {external_id: null});
  const imported = await save(env, previewInput('NUBANK', [first, second], 10));
  assert.equal(imported.result.inserted_count, 1);
  assert.equal(imported.result.duplicate_count, 1);
  assert.equal(imported.result.review_count, 1);
  assert.equal(count(db, 'records'), 2);
  assert.equal(count(db, 'origins'), 2);
  assert.equal(count(db, 'documents'), 2, 'a new normalized selection has its own document evidence');
  assert.deepEqual(records(db).find(item => item.record_id === original.record_id), original);
  const third = await save(env, previewInput('NUBANK', [row(7, {external_id: null})], 11));
  assert.equal(third.result.inserted_count, 1, 'equal amount/date from a different file is preserved');
  assert.equal(third.result.review_count, 1);
  const workspace = await readExternalCashWorkspace(env, readInput());
  assert.equal(workspace.records.length, 3);
  assert.ok(workspace.records.every(item => item.review));
  assert.equal(workspace.summary.review_count, 3);
  const before = snapshot(db), changed = previewInput('NUBANK', [row(7, {external_id: null, amount_cents: 1})], 10);
  assert.equal((await previewExternalCashImport(env, changed)).can_import, false);
  await rejects(async () => mutateExternalCash(env, await command(env, changed), {now}), 'IMPORT_CONFLICT', 409);
  assert.deepEqual(snapshot(db), before);
});

test('repeated IDs inside a file dedupe exact transactions and reject conflicting transactions atomically', async () => {
  const {db, env} = fixture();
  const same = previewInput('NUBANK', [row(1), row(2, {external_id: 'SYNTHETIC-1'})]);
  const preview = await previewExternalCashImport(env, same);
  assert.deepEqual(preview.counts, {total: 2, new: 1, duplicates: 1, review: 0});
  const saved = await save(env, same);
  assert.equal(saved.result.inserted_count, 1);
  assert.equal(count(db, 'origins'), 2);
  const bad = previewInput('NUBANK', [row(1, {external_id: 'NEW-ID'}), row(2, {external_id: 'NEW-ID', amount_cents: 1})], 3);
  const before = snapshot(db);
  assert.equal((await previewExternalCashImport(env, bad)).can_import, false);
  await rejects(async () => mutateExternalCash(env, await command(env, bad), {now}), 'IMPORT_CONFLICT', 409);
  assert.deepEqual(snapshot(db), before);
});

test('the exact preview hash and current revision are both required before import', async () => {
  const {db, env} = fixture();
  const input = await command(env, previewInput());
  await rejects(() => mutateExternalCash(env, {...input, preview_hash: 'f'.repeat(64)}, {now}), 'PREVIEW_MISMATCH', 409);
  assert.deepEqual(tables(db), []);
  await save(env, previewInput('NUBANK', [row(2)], 2));
  const before = snapshot(db);
  await rejects(() => mutateExternalCash(env, input, {now}), 'REVISION_CONFLICT', 409);
  assert.deepEqual(snapshot(db), before);
});

test('matches require an explicit owner confirmation and exact one-to-one positive source records', async () => {
  const {db, env} = fixture();
  await save(env, previewInput('NUBANK', [row(1, {reference: 'SHARED'}), row(2, {amount_cents: -12345})]));
  await save(env, previewInput('SHOPEE', [row(1, {reference: 'SHARED'})], 2));
  const pair = pairFor(db);
  const workspace = await readExternalCashWorkspace(env, readInput());
  assert.ok(projectExternalCashResponse(workspace));
  assert.equal(workspace.matches.length, 0);
  assert.deepEqual(workspace.suggestions, [{...pair, confidence: 'SHARED_REFERENCE'}]);
  assert.equal(count(db, 'matches'), 0, 'suggestions never write a match');
  const originalRecords = records(db), before = snapshot(db);
  await rejects(() => mutateExternalCash(env, matchInput(2, [pair], {confirmed: false}), {now}), 'REQUEST_INVALID', 400);
  await rejects(() => mutateExternalCash(env, matchInput(2, [pair, pair]), {now}), 'REQUEST_INVALID', 400);
  await rejects(() => mutateExternalCash(env, matchInput(2, [{bank_record_id: pair.transfer_record_id, transfer_record_id: pair.bank_record_id}]), {now}), 'MATCH_CONFLICT', 409);
  const debit = records(db).find(item => item.amount_cents < 0);
  await rejects(() => mutateExternalCash(env, matchInput(2, [{...pair, bank_record_id: debit.record_id}]), {now}), 'MATCH_CONFLICT', 409);
  assert.deepEqual(snapshot(db), before);
  const matched = await mutateExternalCash(env, matchInput(2, [pair]), {now});
  assert.ok(projectExternalCashResponse(matched));
  assert.equal(matched.result.match_ids.length, 1);
  assert.equal(count(db, 'matches'), 1);
  assert.deepEqual(records(db), originalRecords);
  await rejects(() => mutateExternalCash(env, matchInput(3, [pair]), {now}), 'MATCH_CONFLICT', 409);
});

test('a multi-pair match rejects every pair when any amount or existing-link constraint fails', async () => {
  const {db, env} = fixture();
  await save(env, previewInput('NUBANK', [row(1, {amount_cents: 100}), row(2, {amount_cents: 200})]));
  await save(env, previewInput('SHOPEE', [row(1, {amount_cents: 100}), row(2, {amount_cents: 201})], 2));
  const banks = records(db).filter(item => item.source === 'NUBANK').sort((a, b) => a.amount_cents - b.amount_cents);
  const transfers = records(db).filter(item => item.source === 'SHOPEE').sort((a, b) => a.amount_cents - b.amount_cents);
  const pairs = banks.map((item, index) => ({bank_record_id: item.record_id, transfer_record_id: transfers[index].record_id}));
  const before = snapshot(db);
  await rejects(() => mutateExternalCash(env, matchInput(2, pairs), {now}), 'MATCH_CONFLICT', 409);
  assert.deepEqual(snapshot(db), before);
});

test('unlink appends a reversal and audit, preserves original records and matches, and allows a new explicit match', async () => {
  const {db, env} = fixture();
  await save(env, previewInput());
  await save(env, previewInput('SHOPEE', [row()], 2));
  const pair = pairFor(db), originalRecords = records(db);
  const matched = await mutateExternalCash(env, matchInput(2, [pair]), {now});
  const matchId = matched.result.match_ids[0], originalMatch = db.db.prepare('SELECT * FROM finance_external_cash_matches').get();
  const input = {schema, operation: 'unlink', request_id: requestId(), expected_revision: 3, confirmed: true,
    match_id: matchId, reason: 'Owner reversed the synthetic comparison'};
  await rejects(() => mutateExternalCash(env, {...input, reason: ''}, {now}), 'REQUEST_INVALID', 400);
  const unlinked = await mutateExternalCash(env, input, {now});
  assert.ok(projectExternalCashResponse(unlinked));
  assert.equal(unlinked.result.unlinked_match_id, matchId);
  assert.equal(count(db, 'matches'), 1);
  assert.equal(count(db, 'unlinks'), 1);
  assert.equal(count(db, 'audit'), 4);
  assert.deepEqual(records(db), originalRecords);
  assert.deepEqual(db.db.prepare('SELECT * FROM finance_external_cash_matches').get(), originalMatch);
  const workspace = await readExternalCashWorkspace(env, readInput());
  assert.equal(workspace.matches.length, 0);
  assert.equal(workspace.suggestions.length, 1);
  const rematched = await mutateExternalCash(env, matchInput(4, [pair]), {now});
  assert.notEqual(rematched.result.match_ids[0], matchId);
  assert.equal(count(db, 'matches'), 2);
  assert.equal(count(db, 'unlinks'), 1);
});

test('request receipts replay before CAS and a reused ID with a different body cannot write', async () => {
  const {db, env} = fixture();
  const input = await command(env, previewInput()), saved = await mutateExternalCash(env, input, {now});
  await save(env, previewInput('NUBANK', [row(2)], 2));
  const before = snapshot(db);
  const replayed = await mutateExternalCash(env, input, {now: () => {throw Error('clock must not be read on replay');}});
  assert.deepEqual(replayed, {...saved, replayed: true});
  assert.equal(replayed.revision, 1);
  assert.equal(revision(db), 2);
  await rejects(() => mutateExternalCash(env, {...input, expected_revision: 2}, {now}), 'REQUEST_ID_REUSED', 409);
  assert.deepEqual(snapshot(db), before);
});

test('ambiguous committed batches recover the original receipt and failed batches require the identical retry body', async () => {
  const committed = fixture(), committedInput = await command(committed.env, previewInput());
  committed.db.afterBatch = statements => {
    if (statements.some(item => /INSERT INTO finance_external_cash_requests/.test(item.testSql))) {
      committed.db.afterBatch = null;
      throw Error('synthetic response lost after commit');
    }
  };
  const response = await mutateExternalCash(committed.env, committedInput, {now});
  assert.equal(response.replayed, true);
  assert.equal(count(committed.db, 'records'), 1);
  assert.equal(count(committed.db, 'audit'), 1);
  const failed = fixture(), retryInput = await command(failed.env, previewInput());
  failed.db.beforeBatch = statements => {
    if (statements.some(item => /INSERT INTO finance_external_cash_requests/.test(item.testSql))) {
      failed.db.beforeBatch = null;
      throw Error('synthetic transport failed before commit');
    }
  };
  await assert.rejects(() => mutateExternalCash(failed.env, retryInput, {now}), error => {
    assert.equal(error.code, 'FINANCE_EXTERNAL_CASH_RETRY_REQUIRED');
    assert.equal(error.status, 503);
    assert.equal(error.retry_same_request, true);
    return true;
  });
  assert.equal(count(failed.db, 'records'), 0);
  assert.equal(count(failed.db, 'requests'), 0);
  const retried = await mutateExternalCash(failed.env, retryInput, {now});
  assert.equal(retried.replayed, false);
  assert.equal(count(failed.db, 'records'), 1);
});

test('a revision change between validation and the transactional write rolls back all mutation statements', async () => {
  const {db, env} = fixture();
  await save(env, previewInput());
  const input = await command(env, previewInput('NUBANK', [row(2)], 2));
  db.beforeBatch = statements => {
    if (statements.some(item => /^UPDATE finance_external_cash_state/.test(item.testSql))) {
      db.beforeBatch = null;
      db.db.prepare('UPDATE finance_external_cash_state SET revision=revision+1').run();
    }
  };
  await rejects(() => mutateExternalCash(env, input, {now}), 'REVISION_CONFLICT', 409);
  assert.equal(revision(db), 2);
  assert.equal(count(db, 'records'), 1);
  assert.equal(count(db, 'imports'), 1);
  assert.equal(count(db, 'audit'), 1);
});

test('preview and workspace pagination cursors bind the selection and revision', async () => {
  const {env} = fixture();
  const input = previewInput('NUBANK', [row(1), row(2), row(3)], 1, {limit: 1});
  const preview = await previewExternalCashImport(env, input);
  assert.equal(preview.rows.length, 1);
  const next = await previewExternalCashImport(env, {...input, cursor: preview.next_cursor});
  assert.deepEqual(next.rows.map(item => item.line), [2]);
  await rejects(() => previewExternalCashImport(env, {...input, rows: [row(2)], cursor: preview.next_cursor}), 'CURSOR_STALE', 409);
  await save(env, input);
  await rejects(() => previewExternalCashImport(env, {...input, cursor: preview.next_cursor}), 'CURSOR_STALE', 409);
  const page = await readExternalCashWorkspace(env, readInput({limit: 1}));
  assert.ok(page.next_cursor);
  await rejects(() => readExternalCashWorkspace(env, readInput({limit: 1, source: 'SHOPEE', cursor: page.next_cursor})), 'CURSOR_STALE', 409);
  await rejects(() => readExternalCashWorkspace(env, readInput({month: '2026-10', cursor: page.next_cursor})), 'CURSOR_STALE', 409);
  await save(env, previewInput('NUBANK', [row(4)], 2));
  await rejects(() => readExternalCashWorkspace(env, readInput({cursor: page.next_cursor})), 'CURSOR_STALE', 409);
  const cold = fixture();
  await rejects(() => readExternalCashWorkspace(cold.env, readInput({cursor: page.next_cursor})), 'CURSOR_STALE', 409);
  assert.deepEqual(tables(cold.db), []);
});

test('Shopee source requires completed declaration and refuses pending or unknown reported statuses without writes', async () => {
  for (const reported_status of ['PENDING', 'PROCESSING', 'FAILED', 'UNKNOWN', 'awaiting completion']) {
    const {db, env} = fixture(), input = previewInput('SHOPEE', [row(1, {reported_status})]);
    await rejects(() => previewExternalCashImport(env, input), 'STATUS_NOT_COMPLETED', 400);
    assert.deepEqual(tables(db), []);
    assert.ok(db.sql.every(sql => /^SELECT\b/.test(sql)));
  }
  const {db, env} = fixture();
  await rejects(() => previewExternalCashImport(env, previewInput('SHOPEE', [row()], 1, {completed_transfers_declared: false})), 'REQUEST_INVALID', 400);
  assert.deepEqual(tables(db), []);
  const completed = ['COMPLETED', 'Concluída', 'TRANSFERIDO', 'SUCCESSFUL', null];
  const saved = await save(env, previewInput('SHOPEE', completed.map((reported_status, index) => row(index + 1, {reported_status}))));
  assert.equal(saved.result.inserted_count, completed.length);
  assert.ok(records(db).every(item => item.status === 'COMPLETED'));
});

test('caller tenant and currency overrides and raw account identifiers are rejected before schema setup', async () => {
  const {db, env} = fixture();
  for (const override of [{tenant: 'caller'}, {shop_id: FINANCE_PROFILE.shop_id}, {partner_id: FINANCE_PROFILE.partner_id},
    {currency: 'USD'}, {account_id: 'synthetic-account'}, {bank_account_id: 'synthetic-account'}]) {
    await rejects(() => previewExternalCashImport(env, {...previewInput(), ...override}), 'REQUEST_INVALID', 400);
  }
  for (const changes of [{currency: 'USD'}, {tenant: 'caller'}]) {
    await rejects(() => previewExternalCashImport(env, previewInput('NUBANK', [row(1, changes)])), 'REQUEST_INVALID', 400);
  }
  assert.deepEqual(tables(db), []);
  await save(env, previewInput());
  const savedTenant = db.db.prepare('SELECT tenant FROM finance_external_cash_records').get().tenant;
  assert.match(savedTenant, new RegExp('^' + FINANCE_PROFILE.partner_id + ':' + FINANCE_PROFILE.shop_id + ':'));
  assert.deepEqual(tables(env.ADMIN_DB), []);
});

test('zero-value immutable evidence remains visible but is never eligible for matching', async () => {
  const {db, env} = fixture();
  await save(env, previewInput('NUBANK', [row(1, {amount_cents: 0})]));
  await save(env, previewInput('SHOPEE', [row(1, {amount_cents: 0})], 2));
  const workspace = await readExternalCashWorkspace(env, readInput());
  assert.ok(projectExternalCashResponse(workspace));
  assert.equal(workspace.records.length, 2);
  assert.ok(workspace.records.every(item => item.amount_cents === 0));
  assert.equal(workspace.suggestions.length, 0);
  const rows = records(db);
  const pair = {bank_record_id: rows.find(item => item.source === 'NUBANK').record_id,
    transfer_record_id: rows.find(item => item.source === 'SHOPEE').record_id};
  await rejects(() => mutateExternalCash(env, matchInput(2, [pair]), {now}), 'MATCH_CONFLICT', 409);
  assert.equal(count(db, 'matches'), 0);
});

test('private Finance DB binding is mandatory and cannot alias the App admin DB', async () => {
  const db = new ObservedD1();
  for (const env of [{ADMIN_DB: db}, {FINANCE_DB: db, ADMIN_DB: db}, {FINANCE_DB: {prepare() {}}}]) {
    await rejects(() => readExternalCashWorkspace(env, readInput()), 'CONFIGURATION', 503);
    await rejects(() => previewExternalCashImport(env, previewInput()), 'CONFIGURATION', 503);
  }
  assert.deepEqual(tables(db), []);
});

test('month filtering follows each bank date and manual exact matching can cross the suggestion window', async () => {
  const {db, env} = fixture();
  await save(env, previewInput('NUBANK', [row(1, {date: '2026-10-01'}), row(2, {date: '2026-11-10', amount_cents: -100})]));
  await save(env, previewInput('SHOPEE', [row(1, {date: '2026-11-10'})], 2));
  const before = await readExternalCashWorkspace(env, readInput());
  assert.deepEqual(before.records.map(item => item.date), ['2026-11-10', '2026-11-10']);
  assert.equal(before.suggestions.length, 0, 'outside seven days is never a suggested match');
  await mutateExternalCash(env, matchInput(2, [pairFor(db)]), {now});
  const october = await readExternalCashWorkspace(env, readInput({month: '2026-10'}));
  const november = await readExternalCashWorkspace(env, readInput());
  assert.ok(projectExternalCashResponse(october));
  assert.ok(projectExternalCashResponse(november));
  assert.equal(october.records.length, 1);
  assert.equal(october.summary.match_count, 1);
  assert.equal(november.summary.match_count, 1, 'active pair touches the selected month through its transfer');
  assert.equal(november.matches.length, 1, 'selected transfer may point to a bank record in another month');
});

test('multibyte records use smaller complete pages to stay below the response byte limit', async () => {
  const {env} = fixture();
  const rows = Array.from({length: 100}, (_, index) => row(index + 1, {
    external_id: String(index).padStart(3, '0') + '😀'.repeat(62),
    reference: '😀'.repeat(80), description: '😀'.repeat(120),
  }));
  await save(env, previewInput('NUBANK', rows));
  const first = await readExternalCashWorkspace(env, readInput({limit: 100}));
  assert.ok(projectExternalCashResponse(first));
  assert.ok(Buffer.byteLength(JSON.stringify(first)) <= 128 * 1024);
  assert.ok(first.records.length > 0 && first.records.length < 100);
  assert.ok(first.next_cursor);
  const next = await readExternalCashWorkspace(env, readInput({limit: 100, cursor: first.next_cursor}));
  assert.ok(Buffer.byteLength(JSON.stringify(next)) <= 128 * 1024);
  assert.equal(first.records.length + next.records.length, 100);
  assert.equal(next.next_cursor, null);
  assert.ok([...first.records, ...next.records].every(item => item.description === '😀'.repeat(120)));
});

test('shared-reference confidence counts all eligible saved records outside the selected page and month', async () => {
  for (const repeatedSource of ['NUBANK', 'SHOPEE']) {
    const {env} = fixture();
    const bankRows = [row(1, {external_id: 'BANK-ONE', amount_cents: 100, reference: 'EXACT-SHARED'})];
    const transferRows = [row(1, {external_id: 'TRANSFER-ONE', amount_cents: 100, reference: 'EXACT-SHARED'})];
    (repeatedSource === 'NUBANK' ? bankRows : transferRows).push(row(2, {
      external_id: 'OUTSIDE-PAGE', date: '2026-01-01', amount_cents: 999, reference: 'EXACT-SHARED',
    }));
    await save(env, previewInput('NUBANK', bankRows));
    await save(env, previewInput('SHOPEE', transferRows, 2));
    const workspace = await readExternalCashWorkspace(env, readInput({source: 'NUBANK', limit: 1}));
    assert.equal(workspace.records.length, 1);
    assert.equal(workspace.suggestions.length, 1);
    assert.equal(workspace.suggestions[0].confidence, 'AMOUNT_DATE');
  }
});

test('original records, imports, matches and reversal evidence reject SQL update and delete', async () => {
  const {db, env} = fixture();
  await save(env, previewInput());
  await save(env, previewInput('SHOPEE', [row()], 2));
  const matched = await mutateExternalCash(env, matchInput(2, [pairFor(db)]), {now});
  await mutateExternalCash(env, {schema, operation: 'unlink', request_id: requestId(), expected_revision: 3,
    confirmed: true, reason: 'Keep immutable history', match_id: matched.result.match_ids[0]}, {now});
  const before = snapshot(db);
  for (const table of ['documents', 'imports', 'records', 'origins', 'matches', 'unlinks', 'requests', 'audit']) {
    const column = db.db.prepare('PRAGMA table_info(finance_external_cash_' + table + ')').all()[0].name;
    assert.throws(() => db.db.prepare('UPDATE finance_external_cash_' + table + ' SET ' + column + '=' + column).run(), /immutable/i);
    assert.throws(() => db.db.prepare('DELETE FROM finance_external_cash_' + table).run(), /immutable/i);
  }
  assert.deepEqual(snapshot(db), before);
});

test('dense equal-value evidence bounds suggestions while preserving ambiguity and never confirms matches', async () => {
  const {db, env} = fixture();
  const rows = Array.from({length: 1000}, (_, index) => row(index + 1, {reference: 'REPEATED-REFERENCE'}));
  await save(env, previewInput('NUBANK', rows));
  await save(env, previewInput('SHOPEE', rows, 2));
  const workspace = await readExternalCashWorkspace(env, readInput({limit: 100}));
  assert.ok(projectExternalCashResponse(workspace));
  assert.equal(workspace.records.length, 100);
  assert.ok(workspace.next_cursor);
  assert.equal(workspace.summary.record_count, 2000);
  assert.equal(workspace.summary.unmatched_bank_count, 1000);
  assert.equal(workspace.summary.unmatched_transfer_count, 1000);
  assert.equal(workspace.summary.match_count, 0);
  assert.equal(workspace.suggestions.length, 100);
  assert.ok(workspace.suggestions.every(item => item.confidence === 'AMOUNT_DATE'));
  assert.equal(new Set(workspace.suggestions.map(item => item.bank_record_id + ':' + item.transfer_record_id)).size, 100);
  const pageIds = new Set(workspace.records.map(item => item.record_id));
  assert.ok(workspace.suggestions.every(item => pageIds.has(item.bank_record_id) || pageIds.has(item.transfer_record_id)));
  assert.equal(workspace.matches.length, 0);
  assert.equal(count(db, 'matches'), 0);
  assert.equal(count(db, 'audit'), 2, 'only the two explicit imports are audited');
  assert.ok(Buffer.byteLength(JSON.stringify(workspace)) <= 128 * 1024);
});
