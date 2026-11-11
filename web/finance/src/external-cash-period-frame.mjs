// Read-only file aggregates have a separate opt-in protocol. No tenant,
// pagination, provider credential or bank coverage assertion crosses it.
export const EXTERNAL_CASH_PERIOD_PATH = '/internal/finance/external-cash-period-v1';
export const EXTERNAL_CASH_PERIOD_REQUEST_MAXIMUM = 256;
export const EXTERNAL_CASH_PERIOD_RESPONSE_MAXIMUM = 8192;

export function createExternalCashPeriodProtocol() {
  const exact = (value, keys) => value !== null && typeof value === 'object'
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Reflect.ownKeys(value).length === keys.length
    && Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key)
      && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) || {}, 'value'));
  const integer = (value, maximum = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value)
    && !Object.is(value, -0) && value >= 0 && value <= maximum;
  const date = value => typeof value === 'string' && /^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
    && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  const period = value => date(value.start_date) && date(value.end_date)
    && value.start_date <= value.end_date
    && (Date.parse(value.end_date + 'T00:00:00Z') - Date.parse(value.start_date + 'T00:00:00Z')) / 86400000 < 31;
  function request(value) {
    try {
      if (!exact(value, ['schema', 'start_date', 'end_date']) || value.schema !== 'external_cash_period_request_v1' || !period(value)) return null;
      return {schema: value.schema, start_date: value.start_date, end_date: value.end_date};
    } catch { return null; }
  }
  const bankKeys = ['record_count', 'credit_count', 'credit_cents', 'debit_count', 'debit_cents', 'zero_count',
    'matched_credit_count', 'matched_credit_cents', 'unmatched_credit_count', 'unmatched_credit_cents', 'review_count', 'latest_import_at'];
  const shopeeKeys = ['record_count', 'positive_count', 'positive_cents', 'negative_count', 'negative_cents', 'zero_count',
    'transfer_cents', 'matched_transfer_count', 'matched_transfer_cents', 'unmatched_transfer_count', 'unmatched_transfer_cents', 'review_count', 'latest_import_at'];
  function source(value, keys, kind) {
    if (!exact(value, keys)) return null;
    const counts = keys.filter(key => key.endsWith('_count'));
    const amounts = keys.filter(key => key.endsWith('_cents'));
    if (!counts.every(key => integer(value[key])) || value.review_count > value.record_count) return null;
    if (value.record_count === 0) {
      if (!counts.every(key => value[key] === 0) || !amounts.every(key => value[key] === null) || value.latest_import_at !== null) return null;
    } else {
      if (!integer(value.latest_import_at, 9999999999) || value.latest_import_at < 1
        || !amounts.every(key => key === 'transfer_cents'
          ? Number.isSafeInteger(value[key]) && !Object.is(value[key], -0) : integer(value[key]))) return null;
      const positive = kind === 'bank' ? 'credit' : 'positive';
      const negative = kind === 'bank' ? 'debit' : 'negative';
      const matched = kind === 'bank' ? 'credit' : 'transfer';
      if (![positive, negative, 'matched_' + matched, 'unmatched_' + matched].every(prefix =>
        value[prefix + '_count'] === 0 ? value[prefix + '_cents'] === 0 : value[prefix + '_cents'] >= value[prefix + '_count'])) return null;
      if (BigInt(value.record_count) !== BigInt(value[positive + '_count']) + BigInt(value[negative + '_count']) + BigInt(value.zero_count)
        || BigInt(value[positive + '_count']) !== BigInt(value['matched_' + matched + '_count']) + BigInt(value['unmatched_' + matched + '_count'])
        || BigInt(value[positive + '_cents']) !== BigInt(value['matched_' + matched + '_cents']) + BigInt(value['unmatched_' + matched + '_cents'])
        || (kind === 'shopee' && BigInt(value.transfer_cents) !== BigInt(value.positive_cents) - BigInt(value.negative_cents))) return null;
    }
    return Object.fromEntries(keys.map(key => [key, value[key]]));
  }
  function pendingFor(bank, shopee) {
    return ['IMPORTED_COVERAGE_NOT_CONFIRMED',
      ...(!bank.record_count && !shopee.record_count ? ['NO_IMPORTED_RECORDS'] : []),
      ...(!bank.record_count ? ['BANK_RECORDS_NOT_IMPORTED'] : []),
      ...(!shopee.record_count ? ['SHOPEE_TRANSFERS_NOT_IMPORTED'] : []),
      ...(bank.unmatched_credit_count ? ['UNMATCHED_BANK_CREDITS'] : []),
      ...(shopee.unmatched_transfer_count ? ['UNMATCHED_SHOPEE_TRANSFERS'] : []),
      ...(bank.review_count || shopee.review_count ? ['IMPORTED_RECORD_REVIEW_REQUIRED'] : []),
      ...(shopee.negative_count || shopee.zero_count ? ['NONPOSITIVE_SHOPEE_TRANSFERS'] : [])];
  }
  function summary(value) {
    try {
      if (!exact(value, ['schema', 'start_date', 'end_date', 'checked_at', 'revision', 'state', 'currency', 'coverage', 'basis', 'bank', 'shopee', 'pending', 'realized_profit_cents'])
        || value.schema !== 'external_cash_period_summary_v1' || !period(value)
        || !integer(value.checked_at, 9999999999) || value.checked_at < 1 || !integer(value.revision, Number.MAX_SAFE_INTEGER - 1)
        || value.currency !== 'BRL' || value.coverage !== 'IMPORTED_FILES_ONLY'
        || value.basis !== 'IMPORTED_BANK_AND_TRANSFER_CALENDARS' || value.realized_profit_cents !== null) return null;
      const bank = source(value.bank, bankKeys, 'bank'), shopee = source(value.shopee, shopeeKeys, 'shopee');
      if (!bank || !shopee || value.state !== (bank.record_count || shopee.record_count ? 'AVAILABLE' : 'NO_IMPORTED_RECORDS')) return null;
      const pending = pendingFor(bank, shopee);
      if (!Array.isArray(value.pending) || Object.getPrototypeOf(value.pending) !== Array.prototype
        || Reflect.ownKeys(value.pending).length !== pending.length + 1 || value.pending.length !== pending.length
        || !pending.every((key, index) => Object.hasOwn(Object.getOwnPropertyDescriptor(value.pending, String(index)) || {}, 'value') && value.pending[index] === key)) return null;
      return {schema: value.schema, start_date: value.start_date, end_date: value.end_date, checked_at: value.checked_at,
        revision: value.revision, state: value.state, currency: 'BRL', coverage: value.coverage, basis: value.basis,
        bank, shopee, pending, realized_profit_cents: null};
    } catch { return null; }
  }
  function matches(input, value) {
    const projected = request(input), frame = summary(value);
    return Boolean(projected && frame && projected.start_date === frame.start_date && projected.end_date === frame.end_date);
  }
  return {projectExternalCashPeriodRequest: request, projectExternalCashPeriodResponse: summary,
    projectExternalCashPeriodSummary: summary, externalCashPeriodResponseMatches: matches, externalCashPeriodPending: pendingFor};
}

const protocol = createExternalCashPeriodProtocol();
export function projectExternalCashPeriodRequest(value) { return protocol.projectExternalCashPeriodRequest(value); }
export function projectExternalCashPeriodResponse(value) { return protocol.projectExternalCashPeriodResponse(value); }
export function projectExternalCashPeriodSummary(value) { return protocol.projectExternalCashPeriodSummary(value); }
export function externalCashPeriodResponseMatches(input, value) { return protocol.externalCashPeriodResponseMatches(input, value); }
export function externalCashPeriodPending(bank, shopee) { return protocol.externalCashPeriodPending(bank, shopee); }
