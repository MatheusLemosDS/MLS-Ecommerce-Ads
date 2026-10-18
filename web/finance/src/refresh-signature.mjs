import {FINANCE_PROFILE, FinanceConnectionError} from './connection-store.mjs';

// Only the reported refresh signing rule is implemented here. No HTTP/body adapter.
export const FINANCE_REFRESH_PATH = '/api/v2/auth/access_token/get';
const encoder = new TextEncoder();
const invalid = () => new FinanceConnectionError('FINANCE_REFRESH_SIGNING_INPUT_INVALID', 400);

export async function signFinanceRefreshRequest(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).length !== 2 || !Object.hasOwn(options, 'partnerKey') ||
      !Object.hasOwn(options, 'timestamp')) throw invalid();
  const {partnerKey, timestamp} = options;
  // Integer seconds, not Date.now() milliseconds or a formatted/date string.
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp > 9999999999) throw invalid();
  if (typeof partnerKey !== 'string' || partnerKey.length === 0 || partnerKey.length > 4096 ||
      /[\u0000-\u001f\u007f]/.test(partnerKey)) {
    throw new FinanceConnectionError('FINANCE_REFRESH_SIGNING_KEY_CONFIGURATION', 503);
  }
  const rawKey = encoder.encode(partnerKey);
  if (rawKey.byteLength > 8192) {
    rawKey.fill(0);
    throw new FinanceConnectionError('FINANCE_REFRESH_SIGNING_KEY_CONFIGURATION', 503);
  }
  try {
    // partnerKey is UTF-8 text. A key that resembles hexadecimal is not decoded.
    const key = await crypto.subtle.importKey('raw', rawKey,
      {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
    const base = String(FINANCE_PROFILE.partner_id) + FINANCE_REFRESH_PATH + String(timestamp);
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(base)));
    if (digest.byteLength !== 32) throw new Error('UNEXPECTED_DIGEST_LENGTH');
    // 32 bytes are 64 hex characters; preserve leading zeroes and never truncate.
    return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    throw new FinanceConnectionError('FINANCE_REFRESH_SIGNATURE_UNAVAILABLE', 503);
  } finally {
    rawKey.fill(0);
  }
}
