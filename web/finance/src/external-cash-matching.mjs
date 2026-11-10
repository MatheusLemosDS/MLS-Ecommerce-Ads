// Suggestions are evidence for owner review. This module never confirms a link.
const DAY_MS = 86400000;
const FIELDS = ['record_id', 'source', 'date', 'amount_cents', 'currency', 'status', 'reference', 'match_id'];

function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const stamp = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) return null;
  return stamp / DAY_MS;
}

function eligibleRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value), row = {};
  for (const field of FIELDS) {
    const descriptor = descriptors[field];
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
    row[field] = descriptor.value;
  }
  const day = calendarDay(row.date);
  if (typeof row.record_id !== 'string' || !row.record_id.length || day === null
    || !Number.isSafeInteger(row.amount_cents) || row.amount_cents <= 0
    || row.currency !== 'BRL' || row.match_id !== null
    || row.reference !== null && typeof row.reference !== 'string'
    || !(row.source === 'NUBANK' && row.status === 'POSTED'
      || row.source === 'SHOPEE' && row.status === 'COMPLETED')) return null;
  return {...row, day};
}

const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
function compareSuggestions(left, right) {
  return Number(left.confidence !== 'SHARED_REFERENCE') - Number(right.confidence !== 'SHARED_REFERENCE')
    || left.day_distance - right.day_distance
    || compareText(left.bank_record_id, right.bank_record_id)
    || compareText(left.transfer_record_id, right.transfer_record_id);
}

// A max heap keeps only the best bounded page, even when many equal amounts
// produce candidates. There is no unbounded materialization of the cross join.
function keepSuggestion(heap, candidate, limit) {
  if (heap.length < limit) {
    heap.push(candidate);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareSuggestions(heap[parent], heap[index]) >= 0) break;
      [heap[parent], heap[index]] = [heap[index], heap[parent]];
      index = parent;
    }
    return;
  }
  if (compareSuggestions(candidate, heap[0]) >= 0) return;
  heap[0] = candidate;
  let index = 0;
  for (;;) {
    const left = index * 2 + 1, right = left + 1;
    let worst = index;
    if (left < heap.length && compareSuggestions(heap[left], heap[worst]) > 0) worst = left;
    if (right < heap.length && compareSuggestions(heap[right], heap[worst]) > 0) worst = right;
    if (worst === index) break;
    [heap[worst], heap[index]] = [heap[index], heap[worst]];
    index = worst;
  }
}

export function suggestExternalCashPairs(records, {limit = 100} = {}) {
  if (!Array.isArray(records) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError('EXTERNAL_CASH_MATCHING_INPUT_INVALID');
  }
  const unique = new Map(), repeatedIds = new Set();
  for (const value of records) {
    const row = eligibleRecord(value);
    if (!row) continue;
    if (unique.has(row.record_id)) repeatedIds.add(row.record_id);
    else unique.set(row.record_id, row);
  }
  for (const id of repeatedIds) unique.delete(id);
  const banks = [], transferDaysByAmount = new Map();
  const bankReferences = new Map(), transferReferences = new Map();
  for (const row of unique.values()) {
    const references = row.source === 'NUBANK' ? bankReferences : transferReferences;
    if (row.reference) references.set(row.reference, (references.get(row.reference) || 0) + 1);
    if (row.source === 'NUBANK') banks.push(row);
    else {
      if (!transferDaysByAmount.has(row.amount_cents)) transferDaysByAmount.set(row.amount_cents, new Map());
      const days = transferDaysByAmount.get(row.amount_cents);
      if (!days.has(row.day)) days.set(row.day, []);
      days.get(row.day).push(row);
    }
  }
  const suggestions = [];
  let candidates = 0;
  for (const bank of banks) {
    const days = transferDaysByAmount.get(bank.amount_cents);
    if (!days) continue;
    for (let day = bank.day - 7; day <= bank.day + 7; day++) {
      for (const transfer of days.get(day) || []) {
        const sharedReference = Boolean(bank.reference && bank.reference === transfer.reference
          && bankReferences.get(bank.reference) === 1 && transferReferences.get(bank.reference) === 1);
        keepSuggestion(suggestions, {
          bank_record_id: bank.record_id,
          transfer_record_id: transfer.record_id,
          amount_cents: bank.amount_cents,
          day_distance: Math.abs(bank.day - transfer.day),
          confidence: sharedReference ? 'SHARED_REFERENCE' : 'AMOUNT_DATE',
          state: 'SUGGESTED',
        }, limit);
        candidates++;
      }
    }
  }
  suggestions.sort(compareSuggestions);
  return {suggestions, truncated: candidates > limit};
}
