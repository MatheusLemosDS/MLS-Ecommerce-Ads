import {FINANCE_PROFILE, FinanceConnectionError} from './connection-store.mjs';
import {FINANCE_REFRESH_PATH, signFinanceRefreshRequest} from './refresh-signature.mjs';

// RefreshAccessToken uses the documented production Auth origin, matching
// initial exchange and Global browser flow independently of Payment routing.
export const FINANCE_REFRESH_ORIGIN = 'https://partner.shopeemobile.com';

// Private request construction only. No fetch, response parser, retry or rotation.
export async function buildFinanceRefreshRequest(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).length !== 3 || !Object.hasOwn(options, 'partnerKey') ||
      !Object.hasOwn(options, 'refreshToken') || !Object.hasOwn(options, 'timestamp')) {
    throw new FinanceConnectionError('FINANCE_REFRESH_REQUEST_INVALID', 400);
  }
  const {partnerKey, refreshToken, timestamp} = options;
  if (typeof refreshToken !== 'string' || refreshToken.length === 0 || refreshToken.length > 8192 ||
      /[\u0000-\u001f\u007f]/.test(refreshToken)) {
    throw new FinanceConnectionError('FINANCE_REFRESH_TOKEN_INVALID', 400);
  }
  const signature = await signFinanceRefreshRequest({partnerKey, timestamp});
  const url = new URL(FINANCE_REFRESH_PATH, FINANCE_REFRESH_ORIGIN);
  url.searchParams.set('partner_id', String(FINANCE_PROFILE.partner_id));
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', signature);
  return new Request(url.href, {
    method: 'POST',
    headers: {'content-type': 'application/json', accept: 'application/json'},
    redirect: 'manual',
    body: JSON.stringify({
      refresh_token: refreshToken,
      partner_id: FINANCE_PROFILE.partner_id,
      // The documented choice is shop_id OR merchant_id, never both.
      shop_id: FINANCE_PROFILE.shop_id,
    }),
  });
}
