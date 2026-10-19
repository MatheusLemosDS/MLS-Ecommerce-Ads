import {FINANCE_PROFILE, FinanceConnectionError, createFinanceStore} from './connection-store.mjs';

const ORIGIN = 'https://auth.brazacommerce.com.br';
const PREFIX = '/shopee/finance';
const CALLBACK = ORIGIN + PREFIX + '/callback';
const COOKIE = 'braza_finance_oauth';
const ROUTER_HEADER = 'X-Braza-Finance-Router';
const MAX_URL_LENGTH = 4096;
const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
});
const EXPIRED_COOKIE = `${COOKIE}=; Path=${PREFIX}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

function response(body, status, {json = false, callback = false, headers = {}} = {}) {
  const resultHeaders = new Headers({...SECURITY_HEADERS, ...headers});
  resultHeaders.set('Content-Type', json ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8');
  if (callback) resultHeaders.set('Set-Cookie', EXPIRED_COOKIE);
  return new Response(json ? JSON.stringify(body) : body, {status, headers: resultHeaders});
}

function failure(code, status = 503, callback = false) {
  if (callback) return response('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Conexão financeira</title><h1>Não foi possível concluir a conexão financeira</h1><p>Inicie uma nova autorização pelo painel.</p></html>', status, {callback: true});
  return response({error: code}, status, {json: true});
}

async function trustedRouter(request, env) {
  const expected = env?.FINANCE_ROUTER_SECRET;
  if (typeof expected !== 'string' || !/^[\x21-\x7e]{32,512}$/.test(expected)) return 'CONFIGURATION_PENDING';
  const actual = request.headers.get(ROUTER_HEADER);
  if (typeof actual !== 'string' || actual.length > 512) return 'FORBIDDEN';
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
  ]);
  const a = new Uint8Array(left), b = new Uint8Array(right);
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0 ? null : 'FORBIDDEN';
}

function adapterReady(adapter, env) {
  try {
    return typeof adapter?.isReady === 'function' && adapter.isReady(env) === true &&
      typeof adapter.authorizationUrl === 'function' && typeof adapter.exchange === 'function';
  } catch {
    return false;
  }
}

// The Brazilian browser authorization returns the outer OAuth state unchanged.
// Keep its fixed callback and browser-bound nonce separate from the API routes.
function checkedAuthorizationUrl(raw, state) {
  if (typeof raw !== 'string' || raw.length > MAX_URL_LENGTH || /[\x00-\x20\x7f]/.test(raw)) throw new Error('INVALID_AUTHORIZATION_URL');
  const url = new URL(raw);
  const expectedFields = new Set(['partner_id', 'auth_type', 'redirect_uri', 'response_type', 'state']);
  if (url.origin !== 'https://open.shopee.com.br' || url.pathname !== '/auth' ||
      (url.port !== '' && url.port !== '443') || url.username || url.password || url.hash ||
      [...expectedFields].some(key => url.searchParams.getAll(key).length !== 1) ||
      [...url.searchParams.keys()].some(key => !expectedFields.has(key)) ||
      url.searchParams.get('partner_id') !== String(FINANCE_PROFILE.partner_id) ||
      url.searchParams.get('auth_type') !== 'seller' ||
      url.searchParams.get('redirect_uri') !== CALLBACK ||
      url.searchParams.get('response_type') !== 'code' ||
      url.searchParams.get('state') !== state) {
    throw new Error('INVALID_AUTHORIZATION_URL');
  }
  return url.toString();
}

function callbackParams(url) {
  const allowed = new Set(['state', 'code', 'shop_id', 'main_account_id', 'error']);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) throw new Error('INVALID_CALLBACK');
  }
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const shop = url.searchParams.get('shop_id');
  const account = url.searchParams.get('main_account_id');
  const error = url.searchParams.get('error');
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      shop !== String(FINANCE_PROFILE.shop_id) ||
      (account !== null && !/^[1-9][0-9]{0,19}$/.test(account)) ||
      (error !== null && !/^[A-Za-z0-9_.-]{1,80}$/.test(error))) throw new Error('INVALID_CALLBACK');
  if (error !== null) {
    if (code !== null) throw new Error('INVALID_CALLBACK');
    return {state, denied: true};
  }
  if (typeof code !== 'string' || !/^[\x21-\x7e]{1,1024}$/.test(code)) throw new Error('INVALID_CALLBACK');
  return {state, code, denied: false};
}

function browserSecret(request) {
  const raw = request.headers.get('Cookie');
  if (typeof raw !== 'string' || raw.length > 4096 || /[\x00-\x1f\x7f]/.test(raw)) throw new Error('INVALID_COOKIE');
  const matches = raw.split(';').map(part => part.trim()).filter(part => part.split('=', 1)[0] === COOKIE);
  if (matches.length !== 1) throw new Error('INVALID_COOKIE');
  const secret = matches[0].slice(COOKIE.length + 1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error('INVALID_COOKIE');
  return secret;
}

function safeStatus(value) {
  return {
    connected: value.connected,
    status: value.status,
    revision: value.revision,
    expires_at: value.expires_at,
    partner_id: FINANCE_PROFILE.partner_id,
    shop_id: FINANCE_PROFILE.shop_id,
  };
}

export function createFinanceWorker({adapter, now = () => Date.now()} = {}) {
  return {
    async fetch(request, env) {
      let url;
      try {
        if (typeof request.url !== 'string' || request.url.length > MAX_URL_LENGTH) return failure('INVALID_REQUEST', 400);
        url = new URL(request.url);
      } catch {
        return failure('INVALID_REQUEST', 400);
      }
      const callback = url.pathname === PREFIX + '/callback';
      if (url.origin !== ORIGIN || url.username || url.password || url.hash) return failure('NOT_FOUND', 404, callback);
      if (![PREFIX + '/connect', PREFIX + '/callback', PREFIX + '/status'].includes(url.pathname)) return failure('NOT_FOUND', 404);
      if (request.method !== 'GET') return failure('METHOD_NOT_ALLOWED', 405, callback);
      const routerError = await trustedRouter(request, env);
      if (routerError) return failure(routerError, routerError === 'FORBIDDEN' ? 403 : 503, callback);
      if (!callback && url.search !== '') return failure('INVALID_REQUEST', 400);

      if (url.pathname === PREFIX + '/status') {
        try {
          const store = await createFinanceStore(env, {now});
          await store.setup();
          return response(safeStatus(await store.status()), 200, {json: true});
        } catch {
          return failure('CONFIGURATION_PENDING');
        }
      }

      // Fail closed before nonce issuance/consumption, storage, or any provider call.
      if (!adapterReady(adapter, env)) return failure('CONFIGURATION_PENDING', 503, callback);

      if (!callback) {
        try {
          const store = await createFinanceStore(env, {now});
          await store.setup();
          const issued = await store.issueState();
          const location = checkedAuthorizationUrl(await adapter.authorizationUrl({
            state: issued.state,
            redirect_uri: CALLBACK,
            partner_id: FINANCE_PROFILE.partner_id,
            shop_id: FINANCE_PROFILE.shop_id,
          }, env), issued.state);
          return response('', 302, {headers: {
            Location: location,
            'Set-Cookie': `${COOKIE}=${issued.browser_secret}; Path=${PREFIX}; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
          }});
        } catch {
          return failure('CONFIGURATION_PENDING');
        }
      }

      let params, secret;
      try {
        params = callbackParams(url);
        secret = browserSecret(request);
      } catch {
        return failure('INVALID_CALLBACK', 400, true);
      }
      let store, lease;
      try {
        store = await createFinanceStore(env, {now});
        await store.setup();
        await store.consumeState(params.state, secret);
        if (params.denied) return failure('AUTHORIZATION_DENIED', 400, true);
        const prior = await store.status();
        // Serialize token issuance itself, not only persistence: a second token
        // exchange could invalidate the first provider result before its CAS.
        lease = await store.claimAuthorization(prior.revision ?? 0);
        const tokens = await adapter.exchange({
          code: params.code,
          shop_id: FINANCE_PROFILE.shop_id,
          partner_id: FINANCE_PROFILE.partner_id,
        }, env);
        await store.completeAuthorization(lease, tokens);
        lease = null;
        return response('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Conexão financeira</title><h1>Conexão financeira concluída</h1><p>Volte ao painel para continuar.</p></html>', 200, {callback: true});
      } catch (error) {
        if (store && lease) {
          try { await store.failAuthorization(lease); } catch { /* A stale lease must never invalidate a newer connection. */ }
        }
        const status = error instanceof FinanceConnectionError && [400, 401, 409].includes(error.status) ? error.status : 503;
        return failure('CONNECTION_UNAVAILABLE', status, true);
      }
    },
  };
}

export default createFinanceWorker();
