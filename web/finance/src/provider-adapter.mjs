import {FINANCE_PROFILE, FinanceConnectionError} from './connection-store.mjs';
import {requestFinanceInitialExchange} from './initial-exchange.mjs';

export const FINANCE_AUTHORIZATION_PATH = '/api/v2/shop/auth_partner';
export const FINANCE_CALLBACK = 'https://auth.brazacommerce.com.br/shopee/finance/callback';
const ORIGIN = 'https://partner.shopeemobile.com';
const encoder = new TextEncoder();
const fail = () => new FinanceConnectionError('FINANCE_PROVIDER_CONFIGURATION', 503);
const validKey = key => typeof key === 'string' && key.length > 0 && key.length <= 4096
  && !/[\u0000-\u001f\u007f]/.test(key) && encoder.encode(key).length <= 8192;
const fields = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));

// Explicitly injected transport; the factory does not authorize, fetch or persist.
export function createFinanceProviderAdapter({fetchImpl, now = () => Date.now()} = {}) {
  const epoch = () => {
    const value = now();
    if (!Number.isSafeInteger(value) || value <= 0 || Math.floor(value / 1000) > 9999999999) throw fail();
    return Math.floor(value / 1000);
  };
  const isReady = env => env?.FINANCE_CONNECTION_ENABLED === 'true'
    && typeof fetchImpl === 'function' && typeof now === 'function'
    && validKey(env?.SHOPEE_FINANCE_PARTNER_KEY);
  return Object.freeze({
    isReady,
    async authorizationUrl(params, env) {
      if (!isReady(env) || !fields(params, ['state', 'redirect_uri', 'partner_id', 'shop_id'])
        || params.partner_id !== FINANCE_PROFILE.partner_id || params.shop_id !== FINANCE_PROFILE.shop_id
        || params.redirect_uri !== FINANCE_CALLBACK || typeof params.state !== 'string'
        || !/^[A-Za-z0-9_-]{43}$/.test(params.state)) throw fail();
      const redirect = new URL(FINANCE_CALLBACK);
      redirect.searchParams.set('state', params.state);
      const timestamp = epoch();
      const rawKey = encoder.encode(env.SHOPEE_FINANCE_PARTNER_KEY);
      let signature;
      try {
        const key = await crypto.subtle.importKey('raw', rawKey, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
        const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key,
          encoder.encode(String(FINANCE_PROFILE.partner_id) + FINANCE_AUTHORIZATION_PATH + timestamp)));
        signature = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      } catch { throw fail(); } finally { rawKey.fill(0); }
      const url = new URL(FINANCE_AUTHORIZATION_PATH, ORIGIN);
      url.searchParams.set('partner_id', String(FINANCE_PROFILE.partner_id));
      url.searchParams.set('timestamp', String(timestamp));
      url.searchParams.set('sign', signature);
      url.searchParams.set('redirect', redirect.href);
      return url.href;
    },
    async exchange(params, env) {
      if (!isReady(env) || !fields(params, ['code', 'shop_id', 'partner_id'])
        || params.partner_id !== FINANCE_PROFILE.partner_id || params.shop_id !== FINANCE_PROFILE.shop_id) throw fail();
      return requestFinanceInitialExchange({partnerKey: env.SHOPEE_FINANCE_PARTNER_KEY,
        code: params.code, timestamp: epoch()}, {fetchImpl, now});
    },
  });
}
