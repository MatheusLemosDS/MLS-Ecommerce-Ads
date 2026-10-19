import {FINANCE_PROFILE, FinanceConnectionError} from './connection-store.mjs';
import {ensureFinanceAccessToken} from './refresh-coordinator.mjs';
import {requestFinanceAuthJson} from './auth-json-transport.mjs';

const ORIGIN = 'https://partner.shopeemobile.com';
const LIST_PATH = '/api/v2/order/get_order_list';
const DETAIL_PATH = '/api/v2/order/get_order_detail';
const PAYMENT_PATH = '/api/v2/payment/get_escrow_detail';
const encoder = new TextEncoder();
const fail = (suffix, status = 502) => new FinanceConnectionError('FINANCE_SAMPLE_' + suffix, status);
const plain = value => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const serialValid = value => typeof value === 'string' && value.length > 0 && value.length <= 128
  && !/[^\x21-\x7e]|,/.test(value);
const privateToken = value => typeof value === 'string' && value.length > 0 && value.length <= 8192
  && !/[\u0000-\u001f\u007f]/.test(value);

// Only these fixed public schema names and type labels may leave the sample.
// Amounts, order/product identifiers, buyer fields and arbitrary keys are omitted.
export const FINANCE_SAMPLE_FIELDS = Object.freeze([
  'escrow_amount', 'original_cost_of_goods_sold', 'buyer_total_amount',
  'commission_fee', 'service_fee', 'seller_transaction_fee', 'actual_shipping_fee',
  'ads_escrow_top_up_fee_or_technical_support_fee', 'items',
]);
export const FINANCE_SAMPLE_ITEM_FIELDS = Object.freeze([
  'item_id', 'model_id', 'line_item_id', 'quantity_purchased', 'original_price',
  'selling_price', 'order_discounted_price', 'is_kit', 'kit_items',
]);
export const FINANCE_SAMPLE_TYPES = Object.freeze([
  'number', 'string', 'boolean', 'object', 'array', 'null', 'mixed',
]);
const API_ERRORS = new Map([
  ['error_sign', 'API_SIGNATURE_REJECTED'],
  ['error_param', 'API_PARAMETER_REJECTED'],
  ['error_auth', 'API_AUTHORIZATION_REJECTED'],
  ['error_api_permission', 'API_PERMISSION_REJECTED'],
  ['error_partner_id', 'API_PARTNER_REJECTED'],
  ['order_not_found', 'API_ORDER_NOT_FOUND'],
  ['common.error_not_found', 'API_ORDER_NOT_FOUND'],
]);
const FORBIDDEN_API_ERRORS = new Map([
  ['JSON_SIGNATURE_REJECTED', 'API_SIGNATURE_REJECTED'],
  ['JSON_PARAMETER_REJECTED', 'API_PARAMETER_REJECTED'],
  ['JSON_AUTHORIZATION_REJECTED', 'API_AUTHORIZATION_REJECTED'],
  ['JSON_PERMISSION_REJECTED', 'API_PERMISSION_REJECTED'],
  ['JSON_PARTNER_REJECTED', 'API_PARTNER_REJECTED'],
]);

function envelope(payload, stage) {
  if (!plain(payload) || typeof payload.error !== 'string' || payload.error.length > 8192) {
    throw fail(stage + '_RESPONSE_INVALID');
  }
  if (payload.error !== '') throw fail(stage + '_' + (API_ERRORS.get(payload.error) || 'API_ERROR'));
  if (!plain(payload.response)) throw fail(stage + '_RESPONSE_INVALID');
  // Some providers echo scope at either envelope level. It must never choose
  // another connection, even when the requested order happens to match.
  for (const container of [payload, payload.response]) {
    for (const field of ['partner_id', 'shop_id']) {
      if (Object.hasOwn(container, field) && container[field] !== FINANCE_PROFILE[field]) {
        throw fail(stage + '_IDENTITY_MISMATCH');
      }
    }
  }
  return payload.response;
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isFinite(value)) return 'number';
  if (typeof value === 'string' || typeof value === 'boolean') return typeof value;
  if (plain(value)) return 'object';
  throw fail('PAYMENT_RESPONSE_INVALID');
}

function schemaOf(income) {
  const fields = FINANCE_SAMPLE_FIELDS.filter(name => Object.hasOwn(income, name))
    .map(name => ({name, type: typeOf(income[name])}));
  const items = Object.hasOwn(income, 'items') ? income.items : [];
  if (!Array.isArray(items) || items.length > 1000 || !items.every(plain)) {
    throw fail('PAYMENT_RESPONSE_INVALID');
  }
  const item_fields = [];
  for (const name of FINANCE_SAMPLE_ITEM_FIELDS) {
    const types = new Set(items.filter(item => Object.hasOwn(item, name)).map(item => typeOf(item[name])));
    if (types.size) item_fields.push({name, type: types.size === 1 ? [...types][0] : 'mixed'});
  }
  return {fields, item_fields, item_count: items.length};
}

function windowStart(epoch) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(epoch * 1000))
    .filter(part => ['year', 'month', 'day'].includes(part.type)).map(part => [part.type, Number(part.value)]));
  const midnight = Date.UTC(parts.year, parts.month - 1, parts.day - 6);
  // Resolve midnight in the named zone instead of using the host timezone or a
  // fixed offset. Two passes also handle historical daylight-saving offsets.
  const offsetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', timeZoneName: 'longOffset',
  });
  let candidate = midnight;
  for (let index = 0; index < 2; index++) {
    const offset = offsetFormatter.formatToParts(new Date(candidate))
      .find(part => part.type === 'timeZoneName')?.value;
    const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset || '');
    if (!match) throw fail('CLOCK_CONFIGURATION', 503);
    const seconds = (Number(match[2]) * 3600 + Number(match[3]) * 60) * (match[1] === '+' ? 1 : -1);
    candidate = midnight - seconds * 1000;
  }
  return Math.floor(candidate / 1000);
}

// Exactly one automatic sample, with no serial supplied by the browser. The
// rotating token pair remains owned exclusively by the refresh coordinator.
export async function runFinancePaymentSample(env, options = {}) {
  if (!plain(options)) throw fail('CONFIGURATION', 503);
  const {fetchImpl, now = () => Date.now(), timeoutMs = 10000} = options;
  if (typeof fetchImpl !== 'function' || typeof now !== 'function'
    || !Number.isInteger(timeoutMs) || timeoutMs < 5 || timeoutMs > 10000
    || env?.FINANCE_CONNECTION_ENABLED !== 'true') throw fail('CONFIGURATION', 503);
  const epoch = () => {
    let value;
    try { value = now(); } catch { throw fail('CLOCK_CONFIGURATION', 503); }
    if (!Number.isSafeInteger(value) || value <= 0 || Math.floor(value / 1000) > 9999999999) {
      throw fail('CLOCK_CONFIGURATION', 503);
    }
    return Math.floor(value / 1000);
  };
  epoch();
  let partnerKey;
  try { partnerKey = env.SHOPEE_FINANCE_PARTNER_KEY; } catch { throw fail('SIGNING_KEY_CONFIGURATION', 503); }
  if (typeof partnerKey !== 'string' || !partnerKey.length || partnerKey.length > 4096
    || /[\u0000-\u001f\u007f]/.test(partnerKey)) throw fail('SIGNING_KEY_CONFIGURATION', 503);
  const rawKey = encoder.encode(partnerKey);
  if (rawKey.byteLength > 8192) {
    rawKey.fill(0);
    throw fail('SIGNING_KEY_CONFIGURATION', 503);
  }
  let signingKey;
  try {
    signingKey = await crypto.subtle.importKey('raw', rawKey, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  } catch { throw fail('SIGNATURE_UNAVAILABLE', 503); }
  finally { rawKey.fill(0); }

  const tokens = await ensureFinanceAccessToken(env, {fetchImpl, now, timeoutMs});
  if (!privateToken(tokens.access_token) || !Number.isSafeInteger(tokens.revision) || tokens.revision < 1
    || !Number.isSafeInteger(tokens.expires_at)) throw fail('CONFIGURATION', 503);

  const get = async (stage, path, query) => {
    const timestamp = epoch();
    if (tokens.expires_at <= timestamp) throw fail('AUTHORIZATION_EXPIRED', 409);
    const input = {timestamp};
    try {
      return await requestFinanceAuthJson({input, options: {fetchImpl, now, timeoutMs},
      prefix: 'FINANCE_SAMPLE_' + stage,
      buildRequest: async () => {
        const base = String(FINANCE_PROFILE.partner_id) + path + String(timestamp)
          + tokens.access_token + String(FINANCE_PROFILE.shop_id);
        let signature;
        try {
          const digest = new Uint8Array(await crypto.subtle.sign('HMAC', signingKey, encoder.encode(base)));
          if (digest.byteLength !== 32) throw fail('SIGNATURE_UNAVAILABLE', 503);
          signature = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
        } catch { throw fail('SIGNATURE_UNAVAILABLE', 503); }
        const url = new URL(path, ORIGIN);
        url.searchParams.set('partner_id', String(FINANCE_PROFILE.partner_id));
        url.searchParams.set('timestamp', String(timestamp));
        url.searchParams.set('access_token', tokens.access_token);
        url.searchParams.set('shop_id', String(FINANCE_PROFILE.shop_id));
        url.searchParams.set('sign', signature);
        for (const [name, value] of Object.entries(query)) url.searchParams.set(name, String(value));
        return new Request(url.href, {method: 'GET', redirect: 'manual', headers: {accept: 'application/json'}});
      },
      normalizeResponse: payload => envelope(payload, stage),
      });
    } catch (failure) {
      // The shared transport has already parsed a bounded HTTP 403 body and
      // reduced its error to a fixed enum. Preserve only known API categories;
      // never inspect messages or turn arbitrary provider strings into codes.
      const suffix = failure instanceof FinanceConnectionError
        && failure.code === 'FINANCE_SAMPLE_' + stage + '_UPSTREAM_HTTP'
        && failure.upstream_status === 403
        ? FORBIDDEN_API_ERRORS.get(failure.upstream_diagnostic) : undefined;
      if (suffix) {
        const projected = fail(stage + '_' + suffix, failure.status);
        Object.defineProperty(projected, 'upstream_status', {value: 403, enumerable: true});
        throw projected;
      }
      throw failure;
    }
  };

  const nowEpoch = epoch();
  const listing = await get('LIST', LIST_PATH, {time_range_field: 'create_time', time_from: windowStart(nowEpoch),
    time_to: nowEpoch, order_status: 'COMPLETED', page_size: 1, cursor: ''});
  if (!Array.isArray(listing.order_list) || listing.order_list.length > 1) throw fail('LIST_RESPONSE_INVALID');
  const base = () => ({schema_version: 1, status: 'EMPTY', checked_at: epoch(), token_revision: tokens.revision,
    fields: [], item_fields: [], item_count: 0});
  if (!listing.order_list.length) return base();
  const selection = listing.order_list[0];
  if (!plain(selection) || !serialValid(selection.order_sn)) throw fail('LIST_RESPONSE_INVALID');
  const serial = selection.order_sn;
  const detail = await get('DETAIL', DETAIL_PATH, {order_sn_list: serial, response_optional_fields: 'item_list'});
  if (!Array.isArray(detail.order_list) || detail.order_list.length !== 1 || !plain(detail.order_list[0])) {
    throw fail('DETAIL_RESPONSE_INVALID');
  }
  const order = detail.order_list[0];
  if (order.order_sn !== serial) throw fail('DETAIL_IDENTITY_MISMATCH');
  if (order.order_status !== 'COMPLETED') throw fail('DETAIL_STATUS_MISMATCH');
  if (order.currency !== 'BRL') throw fail('DETAIL_CURRENCY_MISMATCH');
  const payment = await get('PAYMENT', PAYMENT_PATH, {order_sn: serial});
  if (!plain(payment.order_income)) throw fail('PAYMENT_RESPONSE_INVALID');
  const echoes = [payment, payment.order_income].filter(container => Object.hasOwn(container, 'order_sn'));
  if (!echoes.length || echoes.some(container => container.order_sn !== serial)) throw fail('PAYMENT_IDENTITY_MISMATCH');
  return {...base(), status: 'VALIDATED', identity_match: true, ...schemaOf(payment.order_income)};
}
