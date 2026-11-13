import {isCommercialContext} from '../../cloudflare/src/commercial-context.mjs';
import {TenantInitializationMap} from '../../cloudflare/src/tenant-storage.mjs';
// Private, owner-declared file evidence. Never reads a bank API or changes profit.
import {FINANCE_PROFILE, FinanceConnectionError} from './connection-store.mjs';
import {projectExternalCashRequest, projectExternalCashResponse, isExternalCashCompletedStatus} from './external-cash-frame.mjs';

const encoder = new TextEncoder();
const legacyTenant = [FINANCE_PROFILE.partner_id, FINANCE_PROFILE.shop_id, FINANCE_PROFILE.environment,FINANCE_PROFILE.region,'external-cash-v1'].join(':');
const cashContexts=new WeakMap();
const tenantForDatabase=db=>{const context=cashContexts.get(db);if(!context)fail('CONFIGURATION');return context.tenant;};
const prefix = 'FINANCE_EXTERNAL_CASH_';
const fail = (code, status = 503) => { throw new FinanceConnectionError(prefix + code, status); };
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  encoder.encode(typeof value === 'string' ? value : JSON.stringify(value)))), byte => byte.toString(16).padStart(2, '0')).join('');
const initialized = new TenantInitializationMap();

export const EXTERNAL_CASH_SCHEMA = Object.freeze([
  `CREATE TABLE IF NOT EXISTS finance_external_cash_state(tenant TEXT PRIMARY KEY,revision INTEGER NOT NULL CHECK(revision>=0))`,
  `CREATE TABLE IF NOT EXISTS finance_external_cash_documents(tenant TEXT NOT NULL,document_id TEXT NOT NULL,source TEXT NOT NULL,document_hash TEXT NOT NULL,normalized_digest TEXT NOT NULL,selection_json TEXT NOT NULL,declarations_json TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(tenant,document_id))`,
  `CREATE TABLE IF NOT EXISTS finance_external_cash_imports(tenant TEXT NOT NULL,import_id TEXT NOT NULL,document_id TEXT NOT NULL,request_id TEXT NOT NULL,revision INTEGER NOT NULL,inserted_count INTEGER NOT NULL,duplicate_count INTEGER NOT NULL,review_count INTEGER NOT NULL,created_at INTEGER NOT NULL,actor TEXT NOT NULL CHECK(actor='OWNER'),PRIMARY KEY(tenant,import_id))`,
  `CREATE TABLE IF NOT EXISTS finance_external_cash_records(tenant TEXT NOT NULL,record_id TEXT NOT NULL,source TEXT NOT NULL CHECK(source IN('NUBANK','SHOPEE')),date TEXT NOT NULL,amount_cents INTEGER NOT NULL,currency TEXT NOT NULL CHECK(currency='BRL'),external_id TEXT COLLATE BINARY,reference TEXT COLLATE BINARY,description TEXT,reported_status TEXT,status TEXT NOT NULL CHECK(status IN('POSTED','COMPLETED')),import_id TEXT NOT NULL,review_hint INTEGER NOT NULL CHECK(review_hint IN(0,1)),created_at INTEGER NOT NULL,PRIMARY KEY(tenant,record_id),UNIQUE(tenant,source,external_id))`,
  `CREATE INDEX IF NOT EXISTS finance_external_cash_records_date ON finance_external_cash_records(tenant,source,date,amount_cents)`,
  `CREATE INDEX IF NOT EXISTS finance_external_cash_records_amount ON finance_external_cash_records(tenant,source,amount_cents,date)`,
  `CREATE INDEX IF NOT EXISTS finance_external_cash_records_reference ON finance_external_cash_records(tenant,source,reference)`,
  `CREATE TABLE IF NOT EXISTS finance_external_cash_origins(tenant TEXT NOT NULL,source TEXT NOT NULL,document_hash TEXT NOT NULL,line INTEGER NOT NULL,record_id TEXT NOT NULL,payload_hash TEXT NOT NULL,PRIMARY KEY(tenant,source,document_hash,line))`,
  `CREATE TABLE IF NOT EXISTS finance_external_cash_matches(tenant TEXT NOT NULL,match_id TEXT NOT NULL,bank_record_id TEXT NOT NULL,transfer_record_id TEXT NOT NULL,confirmed_at INTEGER NOT NULL,reason TEXT NOT NULL,actor TEXT NOT NULL CHECK(actor='OWNER'),revision INTEGER NOT NULL,PRIMARY KEY(tenant,match_id))`,
  `CREATE INDEX IF NOT EXISTS finance_external_cash_match_bank ON finance_external_cash_matches(tenant,bank_record_id)`,
  `CREATE INDEX IF NOT EXISTS finance_external_cash_match_transfer ON finance_external_cash_matches(tenant,transfer_record_id)`,
  `CREATE TABLE IF NOT EXISTS finance_external_cash_unlinks(tenant TEXT NOT NULL,match_id TEXT NOT NULL,request_id TEXT NOT NULL,unlinked_at INTEGER NOT NULL,reason TEXT NOT NULL,actor TEXT NOT NULL CHECK(actor='OWNER'),revision INTEGER NOT NULL,PRIMARY KEY(tenant,match_id))`,
  `CREATE TABLE IF NOT EXISTS finance_external_cash_requests(tenant TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,response_json TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(tenant,request_id))`,
  `CREATE TABLE IF NOT EXISTS finance_external_cash_audit(tenant TEXT NOT NULL,request_id TEXT NOT NULL,operation TEXT NOT NULL,revision INTEGER NOT NULL,actor TEXT NOT NULL CHECK(actor='OWNER'),created_at INTEGER NOT NULL,details_json TEXT NOT NULL,PRIMARY KEY(tenant,request_id))`,
  `CREATE TABLE IF NOT EXISTS finance_external_cash_guard(id INTEGER PRIMARY KEY CHECK(id=1),ok INTEGER NOT NULL CHECK(ok=1))`,
  ...['documents', 'imports', 'records', 'origins', 'matches', 'unlinks', 'requests', 'audit'].flatMap(name =>
    ['UPDATE', 'DELETE'].map(operation => `CREATE TRIGGER IF NOT EXISTS finance_external_cash_${name}_no_${operation.toLowerCase()} BEFORE ${operation} ON finance_external_cash_${name} BEGIN SELECT RAISE(ABORT,'external_cash_immutable'); END`)),
]);
// SQLite omits IF NOT EXISTS in sqlite_master. Compare every named table,
// index and immutable-history trigger against the definitions this version
// understands before treating an existing schema as ready for owner writes.
const canonicalSchemaSql = sql => sql.replace(/\bIF NOT EXISTS\s+/i, '').replace(/\s+/g, ' ').trim().replace(/;$/, '');
const schemaObjects = new Map(EXTERNAL_CASH_SCHEMA.map(sql => {
  const [, type, name] = /^CREATE (TABLE|INDEX|TRIGGER) IF NOT EXISTS ([a-z_]+)/.exec(sql);
  return [name, {type: type.toLowerCase(), sql: canonicalSchemaSql(sql)}];
}));

function database(env) {
  const db = env?.FINANCE_DB;
  if (!db || db === env.ADMIN_DB || typeof db.prepare !== 'function' || typeof db.batch !== 'function') fail('CONFIGURATION');
  const context=env.COMMERCIAL_CONTEXT;if(context&&!isCommercialContext(context))fail('FORBIDDEN',403);
  cashContexts.set(db,{tenant:context?(context.legacyCashTenant??'commercial:'+context.namespace+':external-cash-v1'):legacyTenant,actor:context??null});
  return db;
}
function requestFor(input, operation) {
  const request = projectExternalCashRequest(input);
  if (!request || (operation && request.operation !== operation)) fail('REQUEST_INVALID', 400);
  if (encoder.encode(JSON.stringify(request)).byteLength > 512 * 1024) fail('REQUEST_INVALID', 400);
  return request;
}
function clock(now) {
  let stamp;
  try { stamp = now(); } catch { fail('CLOCK_INVALID'); }
  if (!Number.isSafeInteger(stamp) || stamp < 1000 || stamp > 9999999999999) fail('CLOCK_INVALID');
  return Math.floor(stamp / 1000);
}
async function exists(db) {
  const names = [...schemaObjects.keys()];
  const result = await db.prepare(`SELECT type,name,sql FROM sqlite_master WHERE name IN(${names.map(() => '?').join(',')})`).bind(...names).all();
  const rows = result?.results;
  if (!Array.isArray(rows)) fail('STORAGE_INVALID');
  if (rows.length === 0) return false;
  if (rows.length !== schemaObjects.size || rows.some(row => {
    const expected = schemaObjects.get(row.name);
    return !expected || row.type !== expected.type || typeof row.sql !== 'string' || canonicalSchemaSql(row.sql) !== expected.sql;
  })) fail('STORAGE_INVALID');
  return true;
}
async function revision(db) {
  const tenant=tenantForDatabase(db);
  if (!await exists(db)) return 0;
  const state = await db.prepare('SELECT revision FROM finance_external_cash_state WHERE tenant=?').bind(tenant).first();
  if (!state) return 0;
  if (!Number.isSafeInteger(state.revision) || state.revision < 0 || state.revision >= Number.MAX_SAFE_INTEGER) fail('STORAGE_INVALID');
  return state.revision;
}
async function setup(db, {schemaPresent, statePresent}) {
  const tenant=tenantForDatabase(db);
  if (schemaPresent) {
    if (!statePresent) await db.prepare('INSERT OR IGNORE INTO finance_external_cash_state(tenant,revision) VALUES(?,0)').bind(tenant).run();
    return;
  }
  // A fresh isolate must not replay thirty-one DDL statements against healthy
  // existing storage: each statement consumes the D1 invocation query budget.
  if (!initialized.has(db)) initialized.set(db, db.batch([...EXTERNAL_CASH_SCHEMA.map(sql => db.prepare(sql)),
    db.prepare('INSERT OR IGNORE INTO finance_external_cash_state(tenant,revision) VALUES(?,0)').bind(tenant)]).catch(error => {
      initialized.delete(db); throw error;
    }));
  await initialized.get(db);
}
const active = alias => `NOT EXISTS(SELECT 1 FROM finance_external_cash_unlinks u WHERE u.tenant=${alias}.tenant AND u.match_id=${alias}.match_id)`;
const unlinked = alias => `NOT EXISTS(SELECT 1 FROM finance_external_cash_matches m WHERE m.tenant=${alias}.tenant AND (m.bank_record_id=${alias}.record_id OR m.transfer_record_id=${alias}.record_id) AND ${active('m')})`;
const review = alias => `(${alias}.review_hint=1 OR (${alias}.external_id IS NULL AND EXISTS(SELECT 1 FROM finance_external_cash_records other WHERE other.tenant=${alias}.tenant AND other.source=${alias}.source AND other.date=${alias}.date AND other.amount_cents=${alias}.amount_cents AND other.record_id<>${alias}.record_id)))`;
const emptySummary = () => ({record_count: 0, match_count: 0, unmatched_bank_count: 0, unmatched_transfer_count: 0, review_count: 0});
function emptyWorkspace(rev = 0) {
  return {schema: 'external_cash_workspace_v1', revision: rev, records: [], matches: [], suggestions: [], next_cursor: null, summary: emptySummary()};
}
function bounded(value) {
  const projected = projectExternalCashResponse(value);
  if (!projected || encoder.encode(JSON.stringify(projected)).byteLength > 128 * 1024) fail('STORAGE_INVALID');
  return projected;
}

async function readWorkspace(env, input) {
  const request = requestFor(input, 'read'), db = database(env),tenant=tenantForDatabase(db);
  if (!await exists(db)) {
    if (request.cursor !== null) fail('CURSOR_STALE', 409);
    return emptyWorkspace();
  }
  let cursorId = '';
  let expectedRevision = null;
  if (request.cursor !== null) {
    const parts = /^r:(\d+):([a-f0-9]{64}):([a-f0-9]{16})$/.exec(request.cursor);
    if (!parts || parts[3] !== (await hash([request.month, request.source])).slice(0, 16)) fail('CURSOR_STALE', 409);
    expectedRevision = Number(parts[1]); cursorId = parts[2];
  }
  const sourceWhere = request.source === null ? '' : ' AND r.source=?';
  const rowArgs = [tenant, request.month, ...(request.source === null ? [] : [request.source]), cursorId, request.limit + 1];
  const results = await db.batch([
    db.prepare('SELECT revision FROM finance_external_cash_state WHERE tenant=?').bind(tenant),
    db.prepare(`SELECT r.*,${review('r')} AS review FROM finance_external_cash_records r WHERE r.tenant=? AND substr(r.date,1,7)=?${sourceWhere} AND r.record_id>? ORDER BY r.record_id LIMIT ?`).bind(...rowArgs),
    db.prepare(`SELECT COUNT(*) AS record_count,COALESCE(SUM(CASE WHEN ${review('r')} THEN 1 ELSE 0 END),0) AS review_count,COALESCE(SUM(CASE WHEN r.source='NUBANK' AND r.amount_cents>0 AND ${unlinked('r')} THEN 1 ELSE 0 END),0) AS unmatched_bank_count,COALESCE(SUM(CASE WHEN r.source='SHOPEE' AND r.amount_cents>0 AND ${unlinked('r')} THEN 1 ELSE 0 END),0) AS unmatched_transfer_count FROM finance_external_cash_records r WHERE r.tenant=? AND substr(r.date,1,7)=?`).bind(tenant, request.month),
    db.prepare(`SELECT COUNT(*) AS match_count FROM finance_external_cash_matches m WHERE m.tenant=? AND ${active('m')} AND EXISTS(SELECT 1 FROM finance_external_cash_records r WHERE r.tenant=m.tenant AND (r.record_id=m.bank_record_id OR r.record_id=m.transfer_record_id) AND substr(r.date,1,7)=?)`).bind(tenant, request.month),
  ]);
  const rev = results[0]?.results?.[0]?.revision ?? 0;
  if (expectedRevision !== null && expectedRevision !== rev) fail('CURSOR_STALE', 409);
  const rawRows = results[1]?.results;
  if (!Array.isArray(rawRows)) fail('STORAGE_INVALID');
  let selected = rawRows.slice(0, request.limit);
  const ids = JSON.stringify(selected.map(row => row.record_id));
  // Both output lists are bounded by the selected page. Reference confidence
  // counts every eligible saved record, including those outside that page.
  const selectedResults = await db.batch([
    db.prepare('SELECT revision FROM finance_external_cash_state WHERE tenant=?').bind(tenant),
    db.prepare(`SELECT m.match_id,m.bank_record_id,m.transfer_record_id,m.confirmed_at,m.reason FROM finance_external_cash_matches m WHERE m.tenant=? AND ${active('m')} AND (m.bank_record_id IN(SELECT value FROM json_each(?)) OR m.transfer_record_id IN(SELECT value FROM json_each(?))) ORDER BY m.match_id LIMIT 100`).bind(tenant, ids, ids),
    db.prepare(`SELECT * FROM (WITH page AS (SELECT value AS record_id FROM json_each(?)),
      eligible AS MATERIALIZED (SELECT r.record_id,r.source,r.date,r.amount_cents,r.reference FROM finance_external_cash_records r
        WHERE r.tenant=? AND r.currency='BRL' AND r.amount_cents>0
        AND ((r.source='NUBANK' AND r.status='POSTED') OR (r.source='SHOPEE' AND r.status='COMPLETED')) AND ${unlinked('r')}),
      refs AS MATERIALIZED (SELECT source,reference,COUNT(*) AS n FROM eligible WHERE reference IS NOT NULL GROUP BY source,reference),
      candidates AS (
        SELECT b.record_id AS bank_record_id,t.record_id AS transfer_record_id FROM page p
        JOIN eligible b ON b.record_id=p.record_id AND b.source='NUBANK'
        JOIN eligible t ON t.source='SHOPEE' AND t.amount_cents=b.amount_cents AND t.date BETWEEN date(b.date,'-7 days') AND date(b.date,'+7 days')
        UNION
        SELECT b.record_id AS bank_record_id,t.record_id AS transfer_record_id FROM page p
        JOIN eligible t ON t.record_id=p.record_id AND t.source='SHOPEE'
        JOIN eligible b ON b.source='NUBANK' AND b.amount_cents=t.amount_cents AND b.date BETWEEN date(t.date,'-7 days') AND date(t.date,'+7 days'))
      SELECT c.bank_record_id,c.transfer_record_id,
        CASE WHEN b.reference IS NOT NULL AND b.reference<>'' AND b.reference=t.reference AND rb.n=1 AND rt.n=1 THEN 'SHARED_REFERENCE' ELSE 'AMOUNT_DATE' END AS confidence
      FROM candidates c JOIN eligible b ON b.record_id=c.bank_record_id JOIN eligible t ON t.record_id=c.transfer_record_id
      LEFT JOIN refs rb ON rb.source='NUBANK' AND rb.reference=b.reference LEFT JOIN refs rt ON rt.source='SHOPEE' AND rt.reference=t.reference
      ORDER BY CASE WHEN confidence='SHARED_REFERENCE' THEN 0 ELSE 1 END,ABS(julianday(t.date)-julianday(b.date)),c.bank_record_id,c.transfer_record_id LIMIT 100)`).bind(ids, tenant),
  ]);
  if ((selectedResults[0]?.results?.[0]?.revision ?? 0) !== rev) fail('REVISION_CONFLICT', 409);
  const cursorScope = (await hash([request.month, request.source])).slice(0, 16);
  function pageFor(rows) {
    const selectedIds = new Set(rows.map(row => row.record_id));
    const related = row => selectedIds.has(row.bank_record_id) || selectedIds.has(row.transfer_record_id);
    const records = rows.map(row => ({record_id: row.record_id, source: row.source, date: row.date,
      amount_cents: row.amount_cents, currency: row.currency, external_id: row.external_id, reference: row.reference,
      description: row.description, import_id: row.import_id, review: Boolean(row.review)}));
    return {schema: 'external_cash_workspace_v1', revision: rev, records,
      matches: selectedResults[1].results.filter(related), suggestions: selectedResults[2].results.filter(related),
      next_cursor: rawRows.length > rows.length ? `r:${rev}:${rows.at(-1).record_id}:${cursorScope}` : null,
      summary: {...results[2].results[0], ...results[3].results[0]}};
  }
  let frame = pageFor(selected);
  // Multibyte text and audited reasons can make a requested hundred rows too
  // large. Return a smaller complete page with a continuation, never truncate
  // immutable descriptions or leak an oversized response.
  while (selected.length > 1 && encoder.encode(JSON.stringify(frame)).byteLength > 128 * 1024) {
    selected = selected.slice(0, -1); frame = pageFor(selected);
  }
  return bounded(frame);
}

function statusAllowed(request) {
  if (request.source !== 'SHOPEE') return;
  for (const row of request.rows) {
    if (!isExternalCashCompletedStatus(row.reported_status)) fail('STATUS_NOT_COMPLETED', 400);
  }
}
function importBody(request) {
  return {source: request.source, bank_account_declared: request.bank_account_declared,
    completed_transfers_declared: request.completed_transfers_declared, document_hash: request.document_hash,
    selection: request.selection, rows: [...request.rows].sort((a, b) => a.line - b.line)};
}
async function inspectImport(db, request) {
  const tenant=tenantForDatabase(db);
  statusAllowed(request);
  const normalized = importBody(request), digest = await hash(normalized), rev = await revision(db);
  const rows = await Promise.all(normalized.rows.map(async row => ({...row,
    record_id: await hash([tenant, request.source, row.external_id === null ? ['FILE_LINE', request.document_hash, row.line] : ['EXTERNAL_ID', row.external_id]]),
    payload_hash: await hash(row), review_hint: 0,
  })));
  const json = JSON.stringify(rows);
  let savedRows = [], savedOrigins = [], similarLines = new Set(), statePresent = false;
  const schemaPresent = await exists(db);
  if (schemaPresent) {
    const found = await db.batch([
      db.prepare('SELECT revision FROM finance_external_cash_state WHERE tenant=?').bind(tenant),
      db.prepare(`SELECT record_id,date,amount_cents,currency,status FROM finance_external_cash_records WHERE tenant=? AND record_id IN(SELECT json_extract(value,'$.record_id') FROM json_each(?))`).bind(tenant, json),
      db.prepare(`SELECT line,record_id,payload_hash FROM finance_external_cash_origins WHERE tenant=? AND source=? AND document_hash=? AND line IN(SELECT json_extract(value,'$.line') FROM json_each(?))`).bind(tenant, request.source, request.document_hash, json),
      db.prepare(`SELECT json_extract(j.value,'$.line') AS line FROM json_each(?) j WHERE json_extract(j.value,'$.external_id') IS NULL AND EXISTS(SELECT 1 FROM finance_external_cash_records r WHERE r.tenant=? AND r.source=? AND r.date=json_extract(j.value,'$.date') AND r.amount_cents=json_extract(j.value,'$.amount_cents') AND r.record_id<>json_extract(j.value,'$.record_id'))`).bind(json, tenant, request.source),
    ]);
    if ((found[0]?.results?.[0]?.revision ?? 0) !== rev) fail('REVISION_CONFLICT', 409);
    statePresent = Boolean(found[0]?.results?.[0]);
    savedRows = found[1].results; savedOrigins = found[2].results; similarLines = new Set(found[3].results.map(row => row.line));
  }
  const saved = new Map(savedRows.map(row => [row.record_id, row])), origins = new Map(savedOrigins.map(row => [row.line, row]));
  const seen = new Map(), sameAmounts = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.date, row.amount_cents]);
    if (!sameAmounts.has(key)) sameAmounts.set(key, new Set());
    sameAmounts.get(key).add(row.record_id);
  }
  let conflict = false, duplicateCount = 0, reviewCount = 0;
  const display = [];
  for (const row of rows) {
    const previous = saved.get(row.record_id) ?? seen.get(row.record_id), origin = origins.get(row.line);
    const contradicts = Boolean(previous && (previous.date !== row.date || previous.amount_cents !== row.amount_cents)
      || origin && (origin.record_id !== row.record_id || origin.payload_hash !== row.payload_hash));
    if (contradicts) conflict = true;
    const duplicate = Boolean(previous || origin);
    const possible = row.external_id === null && (sameAmounts.get(JSON.stringify([row.date, row.amount_cents])).size > 1
      || similarLines.has(row.line));
    row.review_hint = Number(possible || contradicts);
    const state = contradicts ? 'REVIEW' : duplicate ? 'DUPLICATE' : possible ? 'REVIEW' : 'NEW';
    if (duplicate && !contradicts) duplicateCount++;
    if (state === 'REVIEW') reviewCount++;
    display.push({line: row.line, state}); seen.set(row.record_id, row);
  }
  const previewHash = await hash([tenant, rev, digest]);
  return {revision: rev, digest, previewHash, rows, display, conflict, schemaPresent, statePresent,
    counts: {total: rows.length, new: rows.length - duplicateCount, duplicates: duplicateCount, review: reviewCount}};
}

async function previewImport(env, input) {
  const request = requestFor(input, 'preview'), db = database(env), inspected = await inspectImport(db, request);
  let offset = 0;
  if (request.cursor !== null) {
    const parts = /^p:(\d+):([a-f0-9]{64}):(\d+)$/.exec(request.cursor);
    if (!parts || Number(parts[1]) !== inspected.revision || parts[2] !== inspected.previewHash) fail('CURSOR_STALE', 409);
    offset = Number(parts[3]);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= inspected.display.length) fail('CURSOR_STALE', 409);
  }
  const next = offset + request.limit;
  return bounded({schema: 'external_cash_preview_v1', revision: inspected.revision, preview_hash: inspected.previewHash,
    can_import: !inspected.conflict, counts: inspected.counts, rows: inspected.display.slice(offset, next),
    next_cursor: next < inspected.display.length ? `p:${inspected.revision}:${inspected.previewHash}:${next}` : null});
}

function guard(db, condition, ...args) {
  return db.prepare(`INSERT INTO finance_external_cash_guard(id,ok) VALUES(1,CASE WHEN (${condition}) THEN 1 ELSE 0 END) ON CONFLICT(id) DO UPDATE SET ok=excluded.ok`).bind(...args);
}
async function replay(db, requestId, requestHash) {
  const tenant=tenantForDatabase(db);
  if (!await exists(db)) return null;
  const row = await db.prepare('SELECT request_hash,response_json FROM finance_external_cash_requests WHERE tenant=? AND request_id=?').bind(tenant, requestId).first();
  if (!row) return null;
  if (row.request_hash !== requestHash) fail('REQUEST_ID_REUSED', 409);
  let response;
  try { response = JSON.parse(row.response_json); } catch { fail('STORAGE_INVALID'); }
  return bounded({...response, replayed: true});
}
const mutationResult = () => ({import_id: null, inserted_count: 0, duplicate_count: 0, review_count: 0, match_ids: [], unlinked_match_id: null});
function baseStatements(db, request) {
  const tenant=tenantForDatabase(db);
  return [db.prepare('UPDATE finance_external_cash_state SET revision=revision+1 WHERE tenant=? AND revision=?').bind(tenant, request.expected_revision), guard(db, 'changes()=1')];
}
async function persist(db, request, requestHash, response, statements, stamp, conflictCode) {
  const tenant=tenantForDatabase(db);
  const details = JSON.stringify(response.result);
  statements.push(db.prepare("INSERT INTO finance_external_cash_audit(tenant,request_id,operation,revision,actor,created_at,details_json) VALUES(?,?,?,?,'OWNER',?,?)").bind(tenant, request.request_id, request.operation, response.revision, stamp, details));
  statements.push(db.prepare('INSERT INTO finance_external_cash_requests(tenant,request_id,request_hash,response_json,created_at) VALUES(?,?,?,?,?)').bind(tenant, request.request_id, requestHash, JSON.stringify(response), stamp));
  const actor=cashContexts.get(db)?.actor;
  if(actor){const event=JSON.stringify({schema:'commercial_actor_event_v1',actor_user_id:actor.userId,organization_id:actor.organizationId,store_id:actor.storeId,membership_id:actor.membershipId,capability:actor.requiredCapability,operation:request.operation,request_id:request.request_id});statements.push(db.prepare("INSERT INTO finance_external_cash_audit(tenant,request_id,operation,revision,actor,created_at,details_json) VALUES(?,?,'ACTOR_CONTEXT_V1',?,'OWNER',?,?)").bind(tenant,request.request_id+':actor-v1',response.revision,stamp,event));}

  try { await db.batch(statements); } catch (cause) {
    let previous, current;
    try { previous = await replay(db, request.request_id, requestHash); current = await revision(db); }
    catch (error) { if (error?.code === prefix + 'REQUEST_ID_REUSED') throw error; }
    if (previous) return previous;
    if (current !== undefined && current !== request.expected_revision) fail('REVISION_CONFLICT', 409);
    // With no receipt, the caller must resend exactly the same request_id/body.
    // A committed batch is recognized by replay before any revision check.
    if (conflictCode && /(?:constraint|SQLITE_CONSTRAINT)/i.test(String(cause?.message ?? ''))) fail(conflictCode, 409);
    const error = new FinanceConnectionError(prefix + 'RETRY_REQUIRED', 503);
    error.retry_same_request = true;
    throw error;
  }
  return bounded(response);
}

async function mutate(env, input, {now = () => Date.now()} = {}) {
  const request = requestFor(input), db = database(env);
  if (!['import', 'match', 'unlink'].includes(request.operation)) fail('REQUEST_INVALID', 400);
  const requestHash = await hash(request), previous = await replay(db, request.request_id, requestHash);
  if (previous) return previous;
  const stamp = clock(now);
  if (request.operation === 'import') return importRows(db, request, requestHash, stamp);
  return mutateMatch(db, request, requestHash, stamp);
}

async function importRows(db, request, requestHash, stamp) {
  const tenant=tenantForDatabase(db);
  const inspected = await inspectImport(db, request);
  if (inspected.revision !== request.expected_revision) fail('REVISION_CONFLICT', 409);
  if (inspected.previewHash !== request.preview_hash) fail('PREVIEW_MISMATCH', 409);
  if (inspected.conflict) fail('IMPORT_CONFLICT', 409);
  const importId = crypto.randomUUID(), documentId = await hash([tenant, request.source, request.document_hash, inspected.digest]);
  const result = {...mutationResult(), import_id: importId, inserted_count: inspected.counts.new,
    duplicate_count: inspected.counts.duplicates, review_count: inspected.counts.review};
  const response = {schema: 'external_cash_mutation_v1', operation: 'import', request_id: request.request_id,
    revision: request.expected_revision + 1, replayed: false, result};
  await setup(db, inspected);
  const rowsJson = JSON.stringify(inspected.rows), status = request.source === 'NUBANK' ? 'POSTED' : 'COMPLETED';
  const statements = baseStatements(db, request);
  statements.push(guard(db, `NOT EXISTS(SELECT 1 FROM json_each(?) j JOIN finance_external_cash_records r ON r.tenant=? AND r.record_id=json_extract(j.value,'$.record_id') WHERE r.date<>json_extract(j.value,'$.date') OR r.amount_cents<>json_extract(j.value,'$.amount_cents')) AND NOT EXISTS(SELECT 1 FROM json_each(?) j JOIN finance_external_cash_origins o ON o.tenant=? AND o.source=? AND o.document_hash=? AND o.line=json_extract(j.value,'$.line') WHERE o.record_id<>json_extract(j.value,'$.record_id') OR o.payload_hash<>json_extract(j.value,'$.payload_hash'))`, rowsJson, tenant, rowsJson, tenant, request.source, request.document_hash));
  const declarations = JSON.stringify({bank_account_declared: true, completed_transfers_declared: request.completed_transfers_declared,
    basis: 'OWNER_DECLARED_IMPORTED_FILES'});
  statements.push(db.prepare('INSERT OR IGNORE INTO finance_external_cash_documents(tenant,document_id,source,document_hash,normalized_digest,selection_json,declarations_json,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(tenant, documentId, request.source, request.document_hash, inspected.digest, JSON.stringify(request.selection), declarations, stamp));
  statements.push(db.prepare("INSERT INTO finance_external_cash_imports(tenant,import_id,document_id,request_id,revision,inserted_count,duplicate_count,review_count,created_at,actor) VALUES(?,?,?,?,?,?,?,?,?,'OWNER')").bind(tenant, importId, documentId, request.request_id, response.revision, result.inserted_count, result.duplicate_count, result.review_count, stamp));
  statements.push(db.prepare(`INSERT OR IGNORE INTO finance_external_cash_records(tenant,record_id,source,date,amount_cents,currency,external_id,reference,description,reported_status,status,import_id,review_hint,created_at) SELECT ?,json_extract(value,'$.record_id'),?,json_extract(value,'$.date'),json_extract(value,'$.amount_cents'),'BRL',json_extract(value,'$.external_id'),json_extract(value,'$.reference'),json_extract(value,'$.description'),json_extract(value,'$.reported_status'),?,?,json_extract(value,'$.review_hint'),? FROM json_each(?) ORDER BY CAST(key AS INTEGER)`).bind(tenant, request.source, status, importId, stamp, rowsJson));
  statements.push(guard(db, 'changes()=?', result.inserted_count));
  statements.push(db.prepare(`INSERT OR IGNORE INTO finance_external_cash_origins(tenant,source,document_hash,line,record_id,payload_hash) SELECT ?,?,?,json_extract(value,'$.line'),json_extract(value,'$.record_id'),json_extract(value,'$.payload_hash') FROM json_each(?)`).bind(tenant, request.source, request.document_hash, rowsJson));
  return persist(db, request, requestHash, response, statements, stamp, 'IMPORT_CONFLICT');
}

async function mutateMatch(db, request, requestHash, stamp) {
  const tenant=tenantForDatabase(db);
  const current = await revision(db);
  if (current !== request.expected_revision) fail('REVISION_CONFLICT', 409);
  if (!await exists(db)) fail('MATCH_NOT_FOUND', 404);
  const response = {schema: 'external_cash_mutation_v1', operation: request.operation, request_id: request.request_id,
    revision: current + 1, replayed: false, result: mutationResult()};
  const statements = baseStatements(db, request);
  if (request.operation === 'match') {
    const pairs = request.pairs.map(pair => ({...pair, match_id: crypto.randomUUID()}));
    const json = JSON.stringify(pairs);
    const validPairs = `SELECT COUNT(*) FROM json_each(?) j JOIN finance_external_cash_records b ON b.tenant=? AND b.record_id=json_extract(j.value,'$.bank_record_id') JOIN finance_external_cash_records t ON t.tenant=b.tenant AND t.record_id=json_extract(j.value,'$.transfer_record_id') WHERE b.source='NUBANK' AND b.status='POSTED' AND b.currency='BRL' AND b.amount_cents>0 AND t.source='SHOPEE' AND t.status='COMPLETED' AND t.currency='BRL' AND t.amount_cents=b.amount_cents AND ${unlinked('b')} AND ${unlinked('t')}`;
    const selected = await db.prepare(validPairs).bind(json, tenant).first();
    if (!selected || Object.values(selected)[0] !== pairs.length) fail('MATCH_CONFLICT', 409);
    statements.push(guard(db, `(${validPairs})=?`, json, tenant, pairs.length));
    statements.push(db.prepare(`INSERT INTO finance_external_cash_matches(tenant,match_id,bank_record_id,transfer_record_id,confirmed_at,reason,actor,revision) SELECT ?,json_extract(value,'$.match_id'),json_extract(value,'$.bank_record_id'),json_extract(value,'$.transfer_record_id'),?,?,'OWNER',? FROM json_each(?)`).bind(tenant, stamp, request.reason, response.revision, json));
    response.result.match_ids = pairs.map(pair => pair.match_id);
  } else {
    const found = await db.prepare(`SELECT match_id FROM finance_external_cash_matches m WHERE m.tenant=? AND m.match_id=? AND ${active('m')}`).bind(tenant, request.match_id).first();
    if (!found) fail('MATCH_NOT_FOUND', 404);
    statements.push(guard(db, `EXISTS(SELECT 1 FROM finance_external_cash_matches m WHERE m.tenant=? AND m.match_id=? AND ${active('m')})`, tenant, request.match_id));
    statements.push(db.prepare("INSERT INTO finance_external_cash_unlinks(tenant,match_id,request_id,unlinked_at,reason,actor,revision) VALUES(?,?,?,?,?,'OWNER',?)").bind(tenant, request.match_id, request.request_id, stamp, request.reason, response.revision));
    response.result.unlinked_match_id = request.match_id;
  }
  return persist(db, request, requestHash, response, statements, stamp, 'MATCH_CONFLICT');
}

async function protect(operation) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof FinanceConnectionError) throw error;
    fail('STORAGE_UNAVAILABLE');
  }
}

export async function readExternalCashWorkspace(env, input) {
  return protect(() => readWorkspace(env, input));
}
export async function previewExternalCashImport(env, input) {
  return protect(() => previewImport(env, input));
}
export async function mutateExternalCash(env, input, options) {
  return protect(() => mutate(env, input, options));
}

// Internal SELECT-only context for aggregate readers. This deliberately does
// not call setup or share the mutation initialization cache.
export async function readExternalCashStorageContext(env) {
  return protect(async () => {
    const db = database(env);
    return {db, tenant:tenantForDatabase(db), schemaPresent: await exists(db)};
  });
}
