import {FINANCE_PROFILE, FinanceConnectionError} from './connection-store.mjs';
import {ensureFinanceAccessToken} from './refresh-coordinator.mjs';
import {requestFinanceAuthJson} from './auth-json-transport.mjs';
import {deriveCatalogProduct, projectVariantCatalog, projectVariantCatalogRequest} from './variant-catalog-frame.mjs';

const CATALOG_PATH = '/api/v2/product/get_model_list';
const catalogEncoder = new TextEncoder();
const catalogFailure = (suffix, status = 502) => new FinanceConnectionError('FINANCE_CATALOG_' + suffix, status);
const catalogPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

// An authenticated synchronization reads at most three products. The shop, host,
// route and credentials are fixed; neither titles nor SKU guesses choose sizes.
export async function runFinanceVariantCatalog(env, options = {}) {
  const input = projectVariantCatalogRequest({item_ids: options.item_ids,
    ...(Object.hasOwn(options, 'selling_unit') ? {selling_unit: options.selling_unit} : {})});
  const {fetchImpl, now = () => Date.now(), timeoutMs = 10000} = options;
  if (!input) throw catalogFailure('REQUEST_INVALID', 400);
  if (env?.FINANCE_CONNECTION_ENABLED !== 'true' || typeof fetchImpl !== 'function'
    || typeof now !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 5 || timeoutMs > 10000) {
    throw catalogFailure('CONFIGURATION', 503);
  }
  const epoch = () => {
    const value = now();
    if (!Number.isSafeInteger(value) || value <= 0 || Math.floor(value / 1000) > 9999999999) {
      throw catalogFailure('CLOCK_CONFIGURATION', 503);
    }
    return Math.floor(value / 1000);
  };
  epoch();
  const partnerKey = env.SHOPEE_FINANCE_PARTNER_KEY;
  if (typeof partnerKey !== 'string' || !partnerKey.length || partnerKey.length > 4096
    || /[\u0000-\u001f\u007f]/.test(partnerKey)) throw catalogFailure('SIGNING_KEY_CONFIGURATION', 503);
  const rawKey = catalogEncoder.encode(partnerKey);
  if (rawKey.byteLength > 8192) {rawKey.fill(0); throw catalogFailure('SIGNING_KEY_CONFIGURATION', 503);}
  let signingKey;
  try { signingKey = await crypto.subtle.importKey('raw', rawKey, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']); }
  catch { throw catalogFailure('SIGNING_KEY_CONFIGURATION', 503); }
  finally { rawKey.fill(0); }
  const tokens = await ensureFinanceAccessToken(env, {fetchImpl, now, timeoutMs});
  if (typeof tokens.access_token !== 'string' || !tokens.access_token.length
    || tokens.access_token.length > 8192 || /[\u0000-\u001f\u007f]/.test(tokens.access_token)
    || !Number.isSafeInteger(tokens.expires_at)) throw catalogFailure('CONFIGURATION', 503);
  const products = [];
  for (const item_id of input.item_ids) {
    const timestamp = epoch();
    if (tokens.expires_at <= timestamp) throw catalogFailure('AUTHORIZATION_EXPIRED', 409);
    const product = await requestFinanceAuthJson({input: {timestamp}, prefix: 'FINANCE_CATALOG',
      options: {fetchImpl, now, timeoutMs},
      buildRequest: async () => {
        const base = String(FINANCE_PROFILE.partner_id) + CATALOG_PATH + timestamp
          + tokens.access_token + FINANCE_PROFILE.shop_id;
        const digest = new Uint8Array(await crypto.subtle.sign('HMAC', signingKey, catalogEncoder.encode(base)));
        const sign = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
        const url = new URL(CATALOG_PATH, 'https://partner.shopeemobile.com');
        for (const [key, value] of Object.entries({partner_id: FINANCE_PROFILE.partner_id, timestamp,
          access_token: tokens.access_token, shop_id: FINANCE_PROFILE.shop_id, sign, item_id})) {
          url.searchParams.set(key, String(value));
        }
        return new Request(url, {method: 'GET', redirect: 'manual', headers: {Accept: 'application/json'}});
      },
      normalizeResponse: async payload => {
        if (!catalogPlain(payload) || typeof payload.error !== 'string') throw catalogFailure('RESPONSE_INVALID');
        if (payload.error !== '') throw catalogFailure(payload.error === 'error_api_permission' ? 'PERMISSION_REQUIRED' : 'API_REJECTED');
        if (!catalogPlain(payload.response)) throw catalogFailure('RESPONSE_INVALID');
        for (const container of [payload, payload.response]) {
          for (const field of ['shop_id', 'partner_id']) {
            if (Object.hasOwn(container, field) && container[field] !== FINANCE_PROFILE[field]) throw catalogFailure('IDENTITY_MISMATCH');
          }
          if (Object.hasOwn(container, 'item_id') && ((typeof container.item_id !== 'string'
            && !Number.isSafeInteger(container.item_id)) || String(container.item_id) !== item_id)) throw catalogFailure('IDENTITY_MISMATCH');
        }
        try { return await deriveCatalogProduct(item_id, payload.response,
          {selling_unit: input.selling_unit || 'ONE_MALE_ONE_FEMALE_KIT'}); }
        catch { throw catalogFailure('RESPONSE_INVALID'); }
      },
    });
    products.push(product);
  }
  const result = projectVariantCatalog({schema: 'variant_catalog_v1', checked_at: epoch(), products});
  if (!result) throw catalogFailure('RESPONSE_INVALID');
  return result;
}
