// Account-level CPC reporting is a calendar-period source, not an order cohort.
// Direct and broad attribution remain separate throughout this projection.
const units = 'OPERATOR_CONFIRMED_BRL_2026_10_20';
const basis = 'CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION';
const plain = value => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const own = (value, key) => plain(value) ? Object.getOwnPropertyDescriptor(value, key) : undefined;
const read = (value, key) => { const descriptor = own(value, key); return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined; };
const exact = (value, keys) => plain(value) && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(own(value, key) || {}, 'value'));
const array = (value, max) => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype && value.length <= max && Reflect.ownKeys(value).length === value.length + 1 && Array.from({length: value.length}, (_, index) => Object.getOwnPropertyDescriptor(value, String(index))).every(descriptor => descriptor && Object.hasOwn(descriptor, 'value'));
const integer = (value, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= 0 && value <= max && !Object.is(value, -0);
const isoDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const today = stamp => new Intl.DateTimeFormat('sv-SE', {timeZone: 'America/Sao_Paulo'}).format(new Date(stamp * 1000));

function sourceDay(value) {
  if (isoDay(value)) return value;
  const match = typeof value === 'string' && /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(value);
  const result = match ? match[3] + '-' + match[2] + '-' + match[1] : null;
  return isoDay(result) ? result : null;
}

function datesFor(start, end) {
  if (!isoDay(start) || !isoDay(end)) return null;
  const count = (Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000 + 1;
  if (count < 1 || count > 15) return null;
  return Array.from({length: count}, (_, index) => new Date(Date.parse(start + 'T00:00:00Z') + index * 86400000).toISOString().slice(0, 10));
}

function cents(value) {
  const numeric = typeof value === 'number';
  // JSON numbers at larger magnitudes may already have lost a cent.
  if (numeric) {
    if (!Number.isFinite(value) || value < 0 || value > 1000000000000 || Object.is(value, -0)) return null;
    value = String(value);
  }
  if (typeof value !== 'string' || value.length > 96 || !/^(0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]{1,3})?$/.test(value) || !numeric && /[eE]/.test(value)) return null;
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
  let digits = (match[1] + (match[2] || '')).replace(/^0+/, '') || '0';
  let scale = (match[2] || '').length - Number(match[3] || 0);
  while (scale > 0 && digits.endsWith('0')) { digits = digits.slice(0, -1) || '0'; scale--; }
  if (scale > 2 || scale < -20 || digits.length > 20) return null;
  if (scale < 0) { digits += '0'.repeat(-scale); scale = 0; }
  if (digits.length > 20) return null;
  const result = BigInt(digits) * 10n ** BigInt(2 - scale);
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
}

function count(value) {
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 16) value = Number(value);
  return integer(value) ? value : null;
}

function reportedRoas(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && value <= 1000000000000 && !Object.is(value, -0) ? value : null;
  if (typeof value === 'string' && value.length <= 96 && /^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value) && Number(value) <= 1000000000000) return value;
  return null;
}

function ratio(gmv, expense) {
  if (gmv === null || expense === null || expense === 0) return null;
  const numerator = BigInt(gmv) * 1000000n, denominator = BigInt(expense);
  let rounded = numerator / denominator;
  if (numerator % denominator * 2n >= denominator) rounded++;
  return (rounded / 1000000n).toString() + '.' + (rounded % 1000000n).toString().padStart(6, '0');
}

const emptyMetric = () => ({gmv_cents: null, orders: null, reported_roas_raw: null, calculated_roas_raw: null});

/** Project a validated frame without relying on module closures (also used in the browser). */
export function projectAdsMeasurement(value) {
  // Keep helpers local: the client embeds this function via .toString().
  const keys = ['schema', 'status', 'start_date', 'end_date', 'fetched_at', 'covered_days', 'total_days', 'missing_dates', 'expense_cents', 'known_expense_cents', 'balance_cents', 'days', 'day_partial', 'unit_confirmation', 'source_timezone', 'basis', 'diagnostic', 'totals'];
  const metrics = ['gmv_cents', 'orders', 'reported_roas_raw', 'calculated_roas_raw'];
  const isPlain = item => item !== null && typeof item === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(item));
  const isExact = (item, names) => isPlain(item) && Reflect.ownKeys(item).length === names.length && names.every(name => Object.hasOwn(Object.getOwnPropertyDescriptor(item, name) || {}, 'value'));
  const isArray = (item, max) => Array.isArray(item) && Object.getPrototypeOf(item) === Array.prototype && item.length <= max && Reflect.ownKeys(item).length === item.length + 1 && Array.from({length: item.length}, (_, index) => Object.getOwnPropertyDescriptor(item, String(index))).every(descriptor => descriptor && Object.hasOwn(descriptor, 'value'));
  const isInteger = (item, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(item) && item >= 0 && item <= max && !Object.is(item, -0);
  const isDay = item => typeof item === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item) && Number.isFinite(Date.parse(item + 'T00:00:00Z')) && new Date(item + 'T00:00:00Z').toISOString().slice(0, 10) === item;
  const currentDay = stamp => new Intl.DateTimeFormat('sv-SE', {timeZone: 'America/Sao_Paulo'}).format(new Date(stamp * 1000));
  const validReported = item => item === null || typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 1000000000000 && !Object.is(item, -0) || typeof item === 'string' && item.length <= 96 && /^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(item) && Number(item) <= 1000000000000;
  const calculated = (gmv, expense) => {
    if (gmv === null || expense === null || expense === 0) return null;
    const numerator = BigInt(gmv) * 1000000n, denominator = BigInt(expense);
    let rounded = numerator / denominator;
    if (numerator % denominator * 2n >= denominator) rounded++;
    return (rounded / 1000000n).toString() + '.' + (rounded % 1000000n).toString().padStart(6, '0');
  };
  const metricValid = (item, expense) => isExact(item, metrics) && (item.gmv_cents === null || isInteger(item.gmv_cents)) && (item.orders === null || isInteger(item.orders)) && validReported(item.reported_roas_raw) && item.calculated_roas_raw === calculated(item.gmv_cents, expense);
  const metricEmpty = item => metrics.every(key => item[key] === null);
  const equalDates = (left, right) => left.length === right.length && left.every((date, index) => date === right[index]);
  const diagnostics = ['ADS_MEASUREMENT_CONFIGURATION', 'ADS_MEASUREMENT_UNAVAILABLE', 'ADS_MEASUREMENT_DATE_COVERAGE_PARTIAL', 'ADS_MEASUREMENT_EXPENSE_INVALID', 'ADS_MEASUREMENT_ARITHMETIC_UNSAFE'];
  try {
    if (!isExact(value, keys) || value.schema !== 'ads_measurement_v1' || !['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'].includes(value.status) || !isInteger(value.fetched_at, 9999999999) || !isInteger(value.covered_days, 15) || !isInteger(value.total_days, 15) || !isArray(value.missing_dates, 15) || !value.missing_dates.every(isDay) || !isArray(value.days, 15) || typeof value.day_partial !== 'boolean' || value.unit_confirmation !== 'OPERATOR_CONFIRMED_BRL_2026_10_20' || value.source_timezone !== 'UNCONFIRMED' || value.basis !== 'CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION' || value.diagnostic !== null && !diagnostics.includes(value.diagnostic) || !isInteger(value.known_expense_cents) || value.expense_cents !== null && !isInteger(value.expense_cents) || value.balance_cents !== null && !isInteger(value.balance_cents) || !isExact(value.totals, ['direct', 'broad'])) return null;
    let dates = [];
    if (isDay(value.start_date) && isDay(value.end_date)) {
      const length = (Date.parse(value.end_date + 'T00:00:00Z') - Date.parse(value.start_date + 'T00:00:00Z')) / 86400000 + 1;
      if (length < 1 || length > 15 || value.fetched_at === 0 || value.end_date > currentDay(value.fetched_at)) return null;
      dates = Array.from({length}, (_, index) => new Date(Date.parse(value.start_date + 'T00:00:00Z') + index * 86400000).toISOString().slice(0, 10));
    } else if (value.start_date !== null || value.end_date !== null || value.diagnostic !== 'ADS_MEASUREMENT_CONFIGURATION') return null;
    if (value.total_days !== dates.length || value.day_partial !== (dates.length > 0 && value.end_date === currentDay(value.fetched_at))) return null;
    if (value.status === 'UNAVAILABLE') {
      if (value.covered_days !== 0 || value.days.length || value.expense_cents !== null || value.known_expense_cents !== 0 || value.balance_cents !== null || !equalDates(value.missing_dates, dates) || !['ADS_MEASUREMENT_CONFIGURATION', 'ADS_MEASUREMENT_UNAVAILABLE', 'ADS_MEASUREMENT_ARITHMETIC_UNSAFE'].includes(value.diagnostic)) return null;
      for (const attribution of ['direct', 'broad']) if (!metricValid(value.totals[attribution], null) || !metricEmpty(value.totals[attribution])) return null;
    } else {
      if (!dates.length || value.days.length !== dates.length) return null;
      let total = 0n;
      const missing = [];
      for (let index = 0; index < dates.length; index++) {
        const day = value.days[index];
        if (!isExact(day, ['date', 'expense_cents', 'direct', 'broad']) || day.date !== dates[index] || day.expense_cents !== null && !isInteger(day.expense_cents) || !metricValid(day.direct, day.expense_cents) || !metricValid(day.broad, day.expense_cents)) return null;
        if (day.expense_cents === null) missing.push(day.date); else total += BigInt(day.expense_cents);
      }
      if (total > BigInt(Number.MAX_SAFE_INTEGER) || value.covered_days !== dates.length - missing.length || !equalDates(value.missing_dates, missing) || value.known_expense_cents !== Number(total)) return null;
      if (value.status === 'AVAILABLE' ? missing.length !== 0 || value.expense_cents !== Number(total) || value.diagnostic !== null : missing.length === 0 || value.expense_cents !== null || !['ADS_MEASUREMENT_DATE_COVERAGE_PARTIAL', 'ADS_MEASUREMENT_EXPENSE_INVALID'].includes(value.diagnostic)) return null;
      for (const attribution of ['direct', 'broad']) {
        const aggregate = value.totals[attribution];
        if (!metricValid(aggregate, value.expense_cents)) return null;
        for (const field of ['gmv_cents', 'orders']) {
          const amounts = value.days.map(day => day[attribution][field]);
          const sum = amounts.some(amount => amount === null) ? null : amounts.reduce((sum, amount) => sum + BigInt(amount), 0n);
          if (sum !== null && sum > BigInt(Number.MAX_SAFE_INTEGER) || aggregate[field] !== (sum === null ? null : Number(sum))) return null;
        }
        if (aggregate.reported_roas_raw !== (dates.length === 1 ? value.days[0][attribution].reported_roas_raw : null)) return null;
      }
    }
    return Object.fromEntries(keys.map(key => [key, key === 'days' ? value.days.map(day => ({date: day.date, expense_cents: day.expense_cents, direct: {...day.direct}, broad: {...day.broad}})) : key === 'missing_dates' ? [...value.missing_dates] : key === 'totals' ? {direct: {...value.totals.direct}, broad: {...value.totals.broad}} : value[key]]));
  } catch { return null; }
}

/** Normalize the private Auth HTTP JSON; ignored raw extras never enter this frame. */
export function buildAdsMeasurement(raw, selection, fetchedAtEpoch) {
  let input = null, stamp = 0;
  const failure = diagnostic => {
    const dates = input ? datesFor(input.start_date, input.end_date) : [];
    return {schema: 'ads_measurement_v1', status: 'UNAVAILABLE', start_date: input?.start_date ?? null, end_date: input?.end_date ?? null, fetched_at: stamp, covered_days: 0, total_days: dates.length, missing_dates: [...dates], expense_cents: null, known_expense_cents: 0, balance_cents: null, days: [], day_partial: !!(input && input.end_date === today(stamp)), unit_confirmation: units, source_timezone: 'UNCONFIRMED', basis, diagnostic, totals: {direct: emptyMetric(), broad: emptyMetric()}};
  };
  try {
    if (integer(fetchedAtEpoch, 9999999999) && fetchedAtEpoch > 0) stamp = fetchedAtEpoch;
    if (!stamp || !exact(selection, ['start_date', 'end_date']) || !datesFor(selection.start_date, selection.end_date) || selection.end_date > today(stamp)) return failure('ADS_MEASUREMENT_CONFIGURATION');
    input = {start_date: selection.start_date, end_date: selection.end_date};
    const dates = datesFor(input.start_date, input.end_date), shop = read(raw, 'shop'), period = read(raw, 'period'), daily = read(raw, 'daily');
    if (!plain(raw) || read(raw, 'status') !== 'ok' || read(raw, 'connected') !== true || own(raw, 'ok') && read(raw, 'ok') !== true || ![1178167501, '1178167501'].includes(read(shop, 'id')) || sourceDay(read(period, 'start_date')) !== input.start_date || sourceDay(read(period, 'end_date')) !== input.end_date || !array(daily, 15)) return failure('ADS_MEASUREMENT_UNAVAILABLE');
    const byDate = new Map();
    let invalidExpense = false;
    for (const source of daily) {
      if (!plain(source)) return failure('ADS_MEASUREMENT_UNAVAILABLE');
      const date = sourceDay(read(source, 'date'));
      if (!date || !dates.includes(date) || byDate.has(date)) return failure('ADS_MEASUREMENT_UNAVAILABLE');
      const expense = cents(read(source, 'expense'));
      if (expense === null) invalidExpense = true;
      const metric = attribution => {
        const gmv = cents(read(source, attribution + '_gmv'));
        return {gmv_cents: gmv, orders: count(read(source, attribution + '_order')), reported_roas_raw: reportedRoas(read(source, attribution + '_roas')), calculated_roas_raw: ratio(gmv, expense)};
      };
      byDate.set(date, {date, expense_cents: expense, direct: metric('direct'), broad: metric('broad')});
    }
    const days = dates.map(date => byDate.get(date) ?? {date, expense_cents: null, direct: emptyMetric(), broad: emptyMetric()});
    const missing_dates = days.filter(day => day.expense_cents === null).map(day => day.date);
    const known = days.reduce((sum, day) => sum + BigInt(day.expense_cents ?? 0), 0n);
    if (known > BigInt(Number.MAX_SAFE_INTEGER)) return failure('ADS_MEASUREMENT_ARITHMETIC_UNSAFE');
    const expense_cents = missing_dates.length ? null : Number(known);
    const totals = {};
    for (const attribution of ['direct', 'broad']) {
      const result = emptyMetric();
      for (const field of ['gmv_cents', 'orders']) {
        const values = days.map(day => day[attribution][field]);
        if (!values.some(value => value === null)) {
          const sum = values.reduce((sum, value) => sum + BigInt(value), 0n);
          if (sum > BigInt(Number.MAX_SAFE_INTEGER)) return failure('ADS_MEASUREMENT_ARITHMETIC_UNSAFE');
          result[field] = Number(sum);
        }
      }
      result.reported_roas_raw = dates.length === 1 ? days[0][attribution].reported_roas_raw : null;
      result.calculated_roas_raw = ratio(result.gmv_cents, expense_cents);
      totals[attribution] = result;
    }
    return projectAdsMeasurement({schema: 'ads_measurement_v1', status: missing_dates.length ? 'PARTIAL' : 'AVAILABLE', ...input, fetched_at: stamp, covered_days: dates.length - missing_dates.length, total_days: dates.length, missing_dates, expense_cents, known_expense_cents: Number(known), balance_cents: cents(read(raw, 'balance')), days, day_partial: input.end_date === today(stamp), unit_confirmation: units, source_timezone: 'UNCONFIRMED', basis, diagnostic: missing_dates.length ? invalidExpense ? 'ADS_MEASUREMENT_EXPENSE_INVALID' : 'ADS_MEASUREMENT_DATE_COVERAGE_PARTIAL' : null, totals}) || failure('ADS_MEASUREMENT_UNAVAILABLE');
  } catch { return failure('ADS_MEASUREMENT_UNAVAILABLE'); }
}
