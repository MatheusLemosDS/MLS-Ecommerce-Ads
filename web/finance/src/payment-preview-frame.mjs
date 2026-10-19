// This frame is private administrator data. Its numbers retain the provider's
// original units: there is no cent conversion, total, settlement or profit.
export const FINANCE_PREVIEW_SCHEMA = 'finance_payment_preview_v1';
export const FINANCE_PREVIEW_AMOUNT_FIELDS = Object.freeze([
  'escrow_amount', 'original_cost_of_goods_sold', 'buyer_total_amount',
  'commission_fee', 'service_fee', 'seller_transaction_fee', 'actual_shipping_fee',
  'ads_escrow_top_up_fee_or_technical_support_fee',
]);

const previewPlain = value => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const previewExact = (value, names) => previewPlain(value)
  && Reflect.ownKeys(value).length === names.length
  && names.every(name => {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    return descriptor && Object.hasOwn(descriptor, 'value');
  });
const previewArray = (value, maximum) => Array.isArray(value) && value.length <= maximum
  && Reflect.ownKeys(value).length === value.length + 1
  && Array.from({length: value.length}, (_, index) => index)
    .every(index => Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(index)) || {}, 'value'));
const previewAmount = value => value === null
  || typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e12;
const previewQuantity = value => value === null
  || Number.isSafeInteger(value) && value > 0 && value <= 1e9;
const previewSerial = value => typeof value === 'string' && value.length > 0 && value.length <= 128
  && !/[^\x21-\x7e]|,/.test(value);

// Independent boundaries use the same strict public contract. Return a new
// object with only fixed fields; arbitrary extra fields invalidate the frame.
export function projectFinancePaymentPreview(value) {
  try {
    const keys = ['schema', 'status', 'checked_at', 'token_revision', 'currency', 'monetary_unit',
      'order_sn', 'identity_match', 'amounts', 'items', 'item_count'];
    if (!previewExact(value, keys) || value.schema !== FINANCE_PREVIEW_SCHEMA
      || !['AVAILABLE', 'EMPTY'].includes(value.status) || value.currency !== 'BRL'
      || value.monetary_unit !== 'UNCONFIRMED' || !Number.isSafeInteger(value.checked_at)
      || value.checked_at <= 0 || value.checked_at > 9999999999
      || !Number.isSafeInteger(value.token_revision) || value.token_revision < 1
      || !previewArray(value.amounts, FINANCE_PREVIEW_AMOUNT_FIELDS.length)
      || value.amounts.length !== FINANCE_PREVIEW_AMOUNT_FIELDS.length
      || !previewArray(value.items, 100) || !Number.isSafeInteger(value.item_count)
      || value.item_count !== value.items.length) return null;
    const available = value.status === 'AVAILABLE';
    if (available ? !previewSerial(value.order_sn) || value.identity_match !== true
      : value.order_sn !== null || value.identity_match !== false || value.item_count !== 0) return null;
    const amounts = [];
    for (let index = 0; index < FINANCE_PREVIEW_AMOUNT_FIELDS.length; index++) {
      const row = value.amounts[index];
      if (!previewExact(row, ['name', 'value']) || row.name !== FINANCE_PREVIEW_AMOUNT_FIELDS[index]
        || !previewAmount(row.value) || !available && row.value !== null) return null;
      amounts.push({name: row.name, value: row.value});
    }
    const items = [];
    for (const row of value.items) {
      if (!previewExact(row, ['quantity_purchased', 'original_price', 'selling_price', 'is_kit'])
        || !previewQuantity(row.quantity_purchased) || !previewAmount(row.original_price)
        || !previewAmount(row.selling_price) || row.is_kit !== null && typeof row.is_kit !== 'boolean') return null;
      items.push({quantity_purchased: row.quantity_purchased, original_price: row.original_price,
        selling_price: row.selling_price, is_kit: row.is_kit});
    }
    return {schema: FINANCE_PREVIEW_SCHEMA, status: value.status, checked_at: value.checked_at,
      token_revision: value.token_revision, currency: 'BRL', monetary_unit: 'UNCONFIRMED',
      order_sn: value.order_sn, identity_match: value.identity_match, amounts, items, item_count: items.length};
  } catch { return null; }
}
