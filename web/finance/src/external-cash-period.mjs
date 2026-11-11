import {FinanceConnectionError} from './connection-store.mjs';
import {readExternalCashStorageContext} from './external-cash-store.mjs';
import {projectExternalCashPeriodRequest, projectExternalCashPeriodSummary, externalCashPeriodPending} from './external-cash-period-frame.mjs';

const fail = (code, status = 503) => { throw new FinanceConnectionError('FINANCE_EXTERNAL_CASH_' + code, status); };
const number = value => {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) fail('STORAGE_INVALID');
  const result = BigInt(value);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) fail('STORAGE_INVALID');
  return Number(result);
};
const bankKeys = ['record_count', 'credit_count', 'credit_cents', 'debit_count', 'debit_cents', 'zero_count',
  'matched_credit_count', 'matched_credit_cents', 'unmatched_credit_count', 'unmatched_credit_cents', 'review_count', 'latest_import_at'];
const shopeeKeys = ['record_count', 'positive_count', 'positive_cents', 'negative_count', 'negative_cents', 'zero_count',
  'transfer_cents', 'matched_transfer_count', 'matched_transfer_cents', 'unmatched_transfer_count', 'unmatched_transfer_cents', 'review_count', 'latest_import_at'];
const emptySource = keys => Object.fromEntries(keys.map(key => [key, key.endsWith('_count') ? 0 : null]));
const stateRevision = row => {
  if (!row) return 0;
  if (!Number.isSafeInteger(row.revision) || row.revision < 0 || row.revision >= Number.MAX_SAFE_INTEGER) fail('STORAGE_INVALID');
  return row.revision;
};

// SUM values cross D1 as decimal strings, never rounded floating point. Every
// source is grouped over its own record date; there is no combined income sum.
const aggregateSql = `SELECT r.source,
  CAST(COUNT(*) AS TEXT) AS record_count,
  CAST(SUM(CASE WHEN r.amount_cents>0 THEN 1 ELSE 0 END) AS TEXT) AS positive_count,
  CAST(SUM(CASE WHEN r.amount_cents>0 THEN r.amount_cents ELSE 0 END) AS TEXT) AS positive_cents,
  CAST(SUM(CASE WHEN r.amount_cents<0 THEN 1 ELSE 0 END) AS TEXT) AS negative_count,
  CAST(SUM(CASE WHEN r.amount_cents<0 THEN -r.amount_cents ELSE 0 END) AS TEXT) AS negative_cents,
  CAST(SUM(CASE WHEN r.amount_cents=0 THEN 1 ELSE 0 END) AS TEXT) AS zero_count,
  CAST(SUM(CASE WHEN r.amount_cents>0 AND r.matched=1 THEN 1 ELSE 0 END) AS TEXT) AS matched_count,
  CAST(SUM(CASE WHEN r.amount_cents>0 AND r.matched=1 THEN r.amount_cents ELSE 0 END) AS TEXT) AS matched_cents,
  CAST(SUM(CASE WHEN r.review=1 THEN 1 ELSE 0 END) AS TEXT) AS review_count,
  CAST(MAX(r.created_at) AS TEXT) AS latest_import_at,
  CAST(SUM(CASE WHEN typeof(r.amount_cents)<>'integer' OR r.amount_cents>9007199254740991 OR r.amount_cents< -9007199254740991
    OR r.currency<>'BRL' OR (r.source='NUBANK' AND r.status<>'POSTED') OR (r.source='SHOPEE' AND r.status<>'COMPLETED')
    OR typeof(r.created_at)<>'integer' OR r.created_at<1 OR r.created_at>9999999999 THEN 1 ELSE 0 END) AS TEXT) AS invalid_count
FROM (SELECT r.*,
  EXISTS(SELECT 1 FROM finance_external_cash_matches m WHERE m.tenant=r.tenant
    AND ((r.source='NUBANK' AND m.bank_record_id=r.record_id) OR (r.source='SHOPEE' AND m.transfer_record_id=r.record_id))
    AND NOT EXISTS(SELECT 1 FROM finance_external_cash_unlinks u WHERE u.tenant=m.tenant AND u.match_id=m.match_id)) AS matched,
  (r.review_hint=1 OR (r.external_id IS NULL AND EXISTS(SELECT 1 FROM finance_external_cash_records other
    WHERE other.tenant=r.tenant AND other.source=r.source AND other.date=r.date AND other.amount_cents=r.amount_cents AND other.record_id<>r.record_id))) AS review
  FROM finance_external_cash_records r WHERE r.tenant=? AND r.date BETWEEN ? AND ?) r GROUP BY r.source`;

function projectSource(row, kind) {
  const counts = Object.fromEntries(['record_count', 'positive_count', 'positive_cents', 'negative_count', 'negative_cents', 'zero_count',
    'matched_count', 'matched_cents', 'review_count', 'latest_import_at', 'invalid_count'].map(key => [key, number(row[key])]));
  if (counts.invalid_count || counts.matched_count > counts.positive_count || counts.matched_cents > counts.positive_cents) fail('STORAGE_INVALID');
  const matching = {['matched_' + (kind === 'bank' ? 'credit' : 'transfer') + '_count']: counts.matched_count,
    ['matched_' + (kind === 'bank' ? 'credit' : 'transfer') + '_cents']: counts.matched_cents,
    ['unmatched_' + (kind === 'bank' ? 'credit' : 'transfer') + '_count']: counts.positive_count - counts.matched_count,
    ['unmatched_' + (kind === 'bank' ? 'credit' : 'transfer') + '_cents']: counts.positive_cents - counts.matched_cents};
  const common = {record_count: counts.record_count, zero_count: counts.zero_count, ...matching,
    review_count: counts.review_count, latest_import_at: counts.latest_import_at};
  return kind === 'bank' ? {...common, credit_count: counts.positive_count, credit_cents: counts.positive_cents,
    debit_count: counts.negative_count, debit_cents: counts.negative_cents}
    : {...common, positive_count: counts.positive_count, positive_cents: counts.positive_cents,
      negative_count: counts.negative_count, negative_cents: counts.negative_cents,
      transfer_cents: Number(BigInt(counts.positive_cents) - BigInt(counts.negative_cents))};
}

export async function readExternalCashPeriodSummary(env, input, {now = () => Date.now()} = {}) {
  try {
    const request = projectExternalCashPeriodRequest(input);
    if (!request) fail('REQUEST_INVALID', 400);
    let stamp;
    try { stamp = now(); } catch { fail('CLOCK_INVALID'); }
    if (!Number.isSafeInteger(stamp) || stamp < 1000 || stamp > 9999999999999) fail('CLOCK_INVALID');
    const {db, tenant, schemaPresent} = await readExternalCashStorageContext(env);
    let revision = 0, bank = emptySource(bankKeys), shopee = emptySource(shopeeKeys);
    if (schemaPresent) {
      const results = await db.batch([
        db.prepare('SELECT revision FROM finance_external_cash_state WHERE tenant=?').bind(tenant),
        db.prepare(aggregateSql).bind(tenant, request.start_date, request.end_date),
      ]);
      const revisionRows = results?.[0]?.results, rows = results?.[1]?.results;
      if (!Array.isArray(revisionRows) || revisionRows.length > 1 || !Array.isArray(rows) || rows.length > 2) fail('STORAGE_INVALID');
      revision = stateRevision(revisionRows[0]);
      // Detect a writer between the snapshot and its delivery, rather than
      // combining totals/matches from different sidecar revisions.
      const current = stateRevision(await db.prepare('SELECT revision FROM finance_external_cash_state WHERE tenant=?').bind(tenant).first());
      if (current !== revision) fail('REVISION_CONFLICT', 409);
      const seen = new Set();
      for (const row of rows) {
        if (!['NUBANK', 'SHOPEE'].includes(row.source) || seen.has(row.source) || revisionRows.length === 0) fail('STORAGE_INVALID');
        seen.add(row.source);
        if (row.source === 'NUBANK') bank = projectSource(row, 'bank'); else shopee = projectSource(row, 'shopee');
      }
    }
    const summary = projectExternalCashPeriodSummary({schema: 'external_cash_period_summary_v1',
      start_date: request.start_date, end_date: request.end_date, checked_at: Math.floor(stamp / 1000), revision,
      state: bank.record_count || shopee.record_count ? 'AVAILABLE' : 'NO_IMPORTED_RECORDS',
      currency: 'BRL', coverage: 'IMPORTED_FILES_ONLY', basis: 'IMPORTED_BANK_AND_TRANSFER_CALENDARS',
      bank, shopee, pending: externalCashPeriodPending(bank, shopee), realized_profit_cents: null});
    if (!summary) fail('STORAGE_INVALID');
    return summary;
  } catch (error) {
    if (error instanceof FinanceConnectionError) throw error;
    fail('STORAGE_UNAVAILABLE');
  }
}
