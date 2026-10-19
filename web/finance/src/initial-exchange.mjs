import {FINANCE_PROFILE, FinanceConnectionError} from './connection-store.mjs';
import {requestFinanceAuthJson} from './auth-json-transport.mjs';

// Auth uses the production origin documented for GetAccessToken. The Brazilian
// browser authorization frontend and Payment API have independent origins.
const ORIGIN = 'https://partner.shopeemobile.com';
const PATH = '/api/v2/auth/token/get';
const encoder = new TextEncoder();
const fail = (suffix, status = 502) => new FinanceConnectionError('FINANCE_INITIAL_EXCHANGE_' + suffix, status);
// Copy only fixed categories from known API error codes. Provider messages and
// arbitrary error strings may contain private data and must never leave here.
const API_ERROR_SUFFIXES = new Map([
  ['error_sign', 'API_SIGNATURE_REJECTED'],
  ['invalid_code', 'API_CODE_REJECTED'],
  ['error_param', 'API_PARAMETER_REJECTED'],
  ['error_auth', 'API_AUTHORIZATION_REJECTED'],
  ['error_api_permission', 'API_PERMISSION_REJECTED'],
  ['error_partner_id', 'API_PARTNER_REJECTED'],
]);
const isPlainObject = value => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const isPrivateString = value => typeof value === 'string' && value.length <= 8192;
const isToken = value => isPrivateString(value) && value.length > 0 && !/[\u0000-\u001f\u007f]/.test(value);
const ownValue = (object, field) => {
  const descriptor = Object.getOwnPropertyDescriptor(object, field);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw fail('REQUEST_INVALID', 400);
  return descriptor.value;
};

async function buildRequest(input) {
  let partnerKey;
  let code;
  let timestamp;
  try {
    if (!isPlainObject(input) || Object.keys(input).length !== 3) throw fail('REQUEST_INVALID', 400);
    partnerKey = ownValue(input, 'partnerKey');
    code = ownValue(input, 'code');
    timestamp = ownValue(input, 'timestamp');
  } catch {
    throw fail('REQUEST_INVALID', 400);
  }
  if (!isToken(code)) throw fail('CODE_INVALID', 400);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp > 9999999999) throw fail('REQUEST_INVALID', 400);
  if (typeof partnerKey !== 'string' || partnerKey.length === 0 || partnerKey.length > 4096 ||
      /[\u0000-\u001f\u007f]/.test(partnerKey)) throw fail('SIGNING_KEY_CONFIGURATION', 503);
  const rawKey = encoder.encode(partnerKey);
  if (rawKey.byteLength > 8192) {
    rawKey.fill(0);
    throw fail('SIGNING_KEY_CONFIGURATION', 503);
  }
  let signature;
  try {
    const key = await crypto.subtle.importKey('raw', rawKey, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
    const base = String(FINANCE_PROFILE.partner_id) + PATH + String(timestamp);
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(base)));
    if (digest.byteLength !== 32) throw fail('SIGNATURE_UNAVAILABLE', 503);
    signature = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    throw fail('SIGNATURE_UNAVAILABLE', 503);
  } finally {
    rawKey.fill(0);
  }
  const url = new URL(PATH, ORIGIN);
  url.searchParams.set('partner_id', String(FINANCE_PROFILE.partner_id));
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', signature);
  return new Request(url.href, {
    method: 'POST', redirect: 'manual',
    headers: {'content-type': 'application/json', accept: 'application/json'},
    body: JSON.stringify({shop_id: FINANCE_PROFILE.shop_id, code, partner_id: FINANCE_PROFILE.partner_id}),
  });
}

function normalizeResponse(payload, {requestedAt, receivedAt}) {
  if (!Number.isSafeInteger(requestedAt) || !Number.isSafeInteger(receivedAt) ||
      requestedAt < 0 || receivedAt < requestedAt) throw fail('RESPONSE_CONTEXT_INVALID', 503);
  if (!isPlainObject(payload) || !isPrivateString(payload.error)) throw fail('RESPONSE_INVALID');
  if (payload.error !== '') throw fail(API_ERROR_SUFFIXES.get(payload.error) || 'API_ERROR');
  if (!isPrivateString(payload.request_id) || !isPrivateString(payload.message)) throw fail('RESPONSE_INVALID');
  // The documented shop success example omits identity echoes. If scalar echoes
  // are returned, they must agree with the fixed request/callback shop. Other
  // account metadata never selects a scope or creates additional connections.
  for (const field of ['partner_id', 'shop_id']) {
    if (Object.hasOwn(payload, field) && payload[field] !== FINANCE_PROFILE[field]) throw fail('IDENTITY_MISMATCH');
  }
  if (!isToken(payload.access_token) || !isToken(payload.refresh_token) ||
      !Number.isSafeInteger(payload.expire_in) || payload.expire_in < 1 || payload.expire_in > 14400) {
    throw fail('RESPONSE_INVALID');
  }
  const expiresAt = requestedAt + payload.expire_in;
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= receivedAt) throw fail('RESPONSE_EXPIRED');
  return {access_token: payload.access_token, refresh_token: payload.refresh_token, expires_at: expiresAt};
}

// The code is exchanged once through an explicitly injected transport. This
// module has no authorization URL, callback route, persistence or production fetch.
export async function requestFinanceInitialExchange(input, options = {}) {
  return requestFinanceAuthJson({
    input, options, prefix: 'FINANCE_INITIAL_EXCHANGE',
    buildRequest: () => buildRequest(input),
    normalizeResponse,
  });
}
