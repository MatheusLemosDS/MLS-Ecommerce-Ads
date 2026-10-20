import {FINANCE_PROFILE, FinanceConnectionError, createFinanceStore} from './connection-store.mjs';
import {projectFinancePaymentPreview} from './payment-preview-frame.mjs';
import {projectVariantCatalog,projectVariantCatalogRequest} from './variant-catalog-frame.mjs';
import {projectStorePeriodRequest,projectStorePeriodFrame} from './store-period-frame.mjs';

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

const PAYMENT_SAMPLE_PATH = '/internal/shopee/finance/payment-sample';
const PAYMENT_PREVIEW_PATH = '/internal/shopee/finance/payment-preview';
const VARIANT_CATALOG_PATH = '/internal/shopee/finance/variant-catalog';
const STORE_PERIOD_PATH = '/internal/shopee/finance/store-period';
const SAMPLE_FIELDS = ['escrow_amount','original_cost_of_goods_sold','buyer_total_amount','commission_fee','service_fee','seller_transaction_fee','actual_shipping_fee','ads_escrow_top_up_fee_or_technical_support_fee','items'];
const SAMPLE_ITEM_FIELDS = ['item_id','model_id','line_item_id','quantity_purchased','original_price','selling_price','order_discounted_price','is_kit','kit_items'];
const SAMPLE_TYPES = new Set(['number','string','boolean','object','array','null','mixed']);
const SAMPLE_FAILURES = new Set([
 'FINANCE_SAMPLE_UNAVAILABLE','FINANCE_SAMPLE_PREVIEW_RESPONSE_INVALID','FINANCE_SAMPLE_CONFIGURATION','FINANCE_SAMPLE_SIGNING_KEY_CONFIGURATION','FINANCE_SAMPLE_SIGNATURE_UNAVAILABLE','FINANCE_SAMPLE_CLOCK_CONFIGURATION','FINANCE_SAMPLE_AUTHORIZATION_EXPIRED',
 'FINANCE_AUTHORIZATION_REQUIRED','FINANCE_AUTHORIZATION_IN_PROGRESS','FINANCE_AUTHORIZATION_CONFLICT',
 'FINANCE_REFRESH_CONFLICT','FINANCE_REFRESH_IN_PROGRESS','FINANCE_REFRESH_FAILED','FINANCE_REFRESH_COORDINATOR_CONFIGURATION',
 'FINANCE_CLOCK_CONFIGURATION','FINANCE_DATABASE_CONFIGURATION','FINANCE_ENCRYPTION_CONFIGURATION','FINANCE_ENCRYPTION_FAILED',
 'FINANCE_ENCRYPTION_KEY_MISMATCH','FINANCE_INVALID_ENCODING','FINANCE_INVALID_LEASE','FINANCE_INVALID_REVISION','FINANCE_INVALID_TOKENS',
 'FINANCE_REVISION_CONFLICT','FINANCE_STORAGE_UNAVAILABLE','FINANCE_TOKEN_DECRYPT_FAILED',
 ...['TRANSPORT_CONFIGURATION','TRANSPORT_UNAVAILABLE','REQUEST_STALE','TIMEOUT','UPSTREAM_FAILED','UPSTREAM_HTTP','UPSTREAM_BODY_TOO_LARGE','UPSTREAM_INVALID_JSON','UPSTREAM_CONTENT_TYPE',
 'RESPONSE_INVALID','IDENTITY_MISMATCH','STATUS_MISMATCH','CURRENCY_MISMATCH','API_SIGNATURE_REJECTED','API_PARAMETER_REJECTED','API_AUTHORIZATION_REJECTED','API_PERMISSION_REJECTED','API_PARTNER_REJECTED','API_ORDER_NOT_FOUND','API_ERROR']
 .flatMap(suffix=>['LIST','DETAIL','PAYMENT'].map(scope=>'FINANCE_SAMPLE_'+scope+'_'+suffix)),
 ...['TRANSPORT_CONFIGURATION','TRANSPORT_UNAVAILABLE','REQUEST_STALE','TIMEOUT','UPSTREAM_FAILED','UPSTREAM_HTTP','UPSTREAM_BODY_TOO_LARGE','UPSTREAM_INVALID_JSON','UPSTREAM_CONTENT_TYPE',
 'REQUEST_INVALID','TOKEN_INVALID','SIGNING_INPUT_INVALID','SIGNING_KEY_CONFIGURATION','SIGNATURE_UNAVAILABLE','API_ERROR','IDENTITY_MISMATCH','RESPONSE_CONTEXT_INVALID','RESPONSE_EXPIRED','RESPONSE_INVALID','TOKEN_NOT_ROTATED']
 .map(suffix=>'FINANCE_REFRESH_'+suffix),
]);

function sampleFrame(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const keys=['schema_version','status','checked_at','token_revision','fields','item_fields','item_count'];
 const valid=value.status==='VALIDATED';
 if(valid)keys.push('identity_match');
 if(Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key))||value.schema_version!==1||(!valid&&value.status!=='EMPTY')||
 !Number.isSafeInteger(value.checked_at)||value.checked_at<=0||value.checked_at>9999999999||!Number.isSafeInteger(value.token_revision)||value.token_revision<1||
 !Number.isSafeInteger(value.item_count)||value.item_count<0||value.item_count>1000||(valid&&value.identity_match!==true))return null;
 const fields=(rows,names)=>{
  if(!Array.isArray(rows)||rows.length>names.length)return null;
  const seen=new Set(),result=[];
  for(const row of rows){if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==2||!Object.hasOwn(row,'name')||!Object.hasOwn(row,'type')||!names.includes(row.name)||!SAMPLE_TYPES.has(row.type)||seen.has(row.name))return null;seen.add(row.name);result.push({name:row.name,type:row.type});}
  return result;
 };
 const projected=fields(value.fields,SAMPLE_FIELDS),items=fields(value.item_fields,SAMPLE_ITEM_FIELDS);
 if(!projected||!items||(!valid&&(projected.length||items.length||value.item_count!==0)))return null;
 return {schema_version:1,status:value.status,checked_at:value.checked_at,token_revision:value.token_revision,fields:projected,item_fields:items,item_count:value.item_count,...(valid?{identity_match:true}:{})};
}

function paymentFailure(error) {
  const code = error instanceof FinanceConnectionError && SAMPLE_FAILURES.has(error.code)
    ? error.code : 'FINANCE_SAMPLE_UNAVAILABLE';
  const http = error instanceof FinanceConnectionError
    ? Object.getOwnPropertyDescriptor(error, 'upstream_status')?.value : null;
  const status = error instanceof FinanceConnectionError && [400, 401, 403, 409, 429, 502, 503, 504].includes(error.status)
    ? error.status : 502;
  return response({error: 'FINANCE_SAMPLE_UNAVAILABLE', diagnostic: {
    code, http: Number.isInteger(http) && http >= 100 && http <= 599 ? http : null,
  }}, status, {json: true});
}

async function privateFinanceBody(request, catalog = false, storePeriod = false) {
  const maximum=storePeriod?256:128;
  const media = request.headers.get('content-type') || '';
  const declared = request.headers.get('content-length');
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(media)
      || (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) || !request.body) return false;
  const reader = request.body.getReader();
  let timer;
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => { try { reader.cancel().catch(() => {}); } catch {} reject(Error('DEADLINE')); }, 5000);
  });
  const read = async () => {
    const chunks = []; let length = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) return false;
      length += chunk.value.byteLength;
      if (length > maximum) return false;
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    if (storePeriod) return projectStorePeriodRequest(value);
    if (catalog) return projectVariantCatalogRequest(value);
    return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0 ? value : null;
  };
  try { return await Promise.race([read(), deadline]); }
  catch { return false; }
  finally { clearTimeout(timer); try { reader.cancel().catch(() => {}); } catch {} }
}

const EXPIRED_COOKIE = `${COOKIE}=; Path=${PREFIX}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
const HTTP_403_DIAGNOSTICS = new Set([
  'JSON_SIGNATURE_REJECTED', 'JSON_CODE_REJECTED', 'JSON_PARAMETER_REJECTED', 'JSON_AUTHORIZATION_REJECTED',
  'JSON_PERMISSION_REJECTED', 'JSON_PARTNER_REJECTED', 'JSON_IP_REJECTED',
  'JSON_UNRECOGNIZED', 'JSON_INVALID', 'JSON_BODY_TOO_LARGE',
  'HTML_CONTENT_TYPE', 'OTHER_CONTENT_TYPE',
]);
const CALLBACK_DIAGNOSTICS = new Set([
  'INVALID_CALLBACK', 'AUTHORIZATION_DENIED', 'CONFIGURATION_PENDING', 'FORBIDDEN',
  'FINANCE_INITIAL_EXCHANGE_API_SIGNATURE_REJECTED',
  'FINANCE_INITIAL_EXCHANGE_API_CODE_REJECTED',
  'FINANCE_INITIAL_EXCHANGE_API_PARAMETER_REJECTED',
  'FINANCE_INITIAL_EXCHANGE_API_AUTHORIZATION_REJECTED',
  'FINANCE_INITIAL_EXCHANGE_API_PERMISSION_REJECTED',
  'FINANCE_INITIAL_EXCHANGE_API_PARTNER_REJECTED',
  'FINANCE_INITIAL_EXCHANGE_API_ERROR',
  'FINANCE_INITIAL_EXCHANGE_UPSTREAM_HTTP',
  'FINANCE_INITIAL_EXCHANGE_HTTP_400', 'FINANCE_INITIAL_EXCHANGE_HTTP_401',
  'FINANCE_INITIAL_EXCHANGE_HTTP_403', 'FINANCE_INITIAL_EXCHANGE_HTTP_429',
  'FINANCE_INITIAL_EXCHANGE_HTTP_REDIRECT', 'FINANCE_INITIAL_EXCHANGE_HTTP_SERVER',
  'FINANCE_INITIAL_EXCHANGE_UPSTREAM_FAILED', 'FINANCE_INITIAL_EXCHANGE_TIMEOUT',
  'FINANCE_INITIAL_EXCHANGE_UPSTREAM_CONTENT_TYPE',
  'FINANCE_INITIAL_EXCHANGE_UPSTREAM_BODY_TOO_LARGE',
  'FINANCE_INITIAL_EXCHANGE_UPSTREAM_INVALID_JSON',
  'FINANCE_INITIAL_EXCHANGE_RESPONSE_INVALID', 'FINANCE_INITIAL_EXCHANGE_IDENTITY_MISMATCH',
  'FINANCE_INITIAL_EXCHANGE_RESPONSE_EXPIRED', 'FINANCE_INITIAL_EXCHANGE_RESPONSE_CONTEXT_INVALID',
  'FINANCE_INITIAL_EXCHANGE_REQUEST_INVALID', 'FINANCE_INITIAL_EXCHANGE_REQUEST_STALE',
  'FINANCE_INITIAL_EXCHANGE_SIGNING_KEY_CONFIGURATION', 'FINANCE_INITIAL_EXCHANGE_SIGNATURE_UNAVAILABLE',
  'FINANCE_STORAGE_UNAVAILABLE', 'FINANCE_INVALID_TOKENS', 'FINANCE_AUTHORIZATION_CONFLICT',
  ...[...HTTP_403_DIAGNOSTICS].map(value => 'FINANCE_INITIAL_EXCHANGE_HTTP_403_' + value),
]);

function callbackDiagnostic(error) {
  if (!(error instanceof FinanceConnectionError)) return 'CONNECTION_UNAVAILABLE';
  const code = Object.getOwnPropertyDescriptor(error, 'code')?.value;
  if (code === 'FINANCE_INITIAL_EXCHANGE_UPSTREAM_HTTP') {
    const status = Object.getOwnPropertyDescriptor(error, 'upstream_status')?.value;
    const detail = Object.getOwnPropertyDescriptor(error, 'upstream_diagnostic')?.value;
    if (status === 403 && HTTP_403_DIAGNOSTICS.has(detail)) return 'FINANCE_INITIAL_EXCHANGE_HTTP_403_' + detail;
    if ([400, 401, 403, 429].includes(status)) return 'FINANCE_INITIAL_EXCHANGE_HTTP_' + status;
    if (Number.isInteger(status) && status >= 300 && status <= 399) return 'FINANCE_INITIAL_EXCHANGE_HTTP_REDIRECT';
    if (Number.isInteger(status) && status >= 500 && status <= 599) return 'FINANCE_INITIAL_EXCHANGE_HTTP_SERVER';
  }
  return CALLBACK_DIAGNOSTICS.has(code) ? code : 'CONNECTION_UNAVAILABLE';
}

function response(body, status, {json = false, callback = false, headers = {}} = {}) {
  const resultHeaders = new Headers({...SECURITY_HEADERS, ...headers});
  resultHeaders.set('Content-Type', json ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8');
  if (callback) resultHeaders.set('Set-Cookie', EXPIRED_COOKIE);
  return new Response(json ? JSON.stringify(body) : body, {status, headers: resultHeaders});
}

function failure(code, status = 503, callback = false) {
  if (callback) {
    const diagnostic = CALLBACK_DIAGNOSTICS.has(code) ? code : 'CONNECTION_UNAVAILABLE';
    return response('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Conexão financeira</title><h1>Não foi possível concluir a conexão financeira</h1><p>Inicie uma nova autorização pelo painel.</p><p>Código de diagnóstico: <code>' + diagnostic + '</code></p></html>', status, {callback: true});
  }
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

// The Global browser authorization must return the outer OAuth state unchanged.
// Keep its fixed callback and browser-bound nonce separate from the API routes.
function checkedAuthorizationUrl(raw, state) {
  if (typeof raw !== 'string' || raw.length > MAX_URL_LENGTH || /[\x00-\x20\x7f]/.test(raw)) throw new Error('INVALID_AUTHORIZATION_URL');
  const url = new URL(raw);
  const expectedFields = new Set(['partner_id', 'auth_type', 'redirect_uri', 'response_type', 'state']);
  if (url.origin !== 'https://open.shopee.com' || url.pathname !== '/auth' ||
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

export function createFinanceWorker({adapter, paymentSample, paymentPreview, variantCatalog, storePeriod, fetchImpl, now = () => Date.now()} = {}) {
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
      if ([PAYMENT_SAMPLE_PATH, PAYMENT_PREVIEW_PATH, VARIANT_CATALOG_PATH, STORE_PERIOD_PATH].includes(url.pathname)) {
        if (request.method !== 'POST') return failure('METHOD_NOT_ALLOWED', 405);
        if (url.search !== '') return failure('INVALID_REQUEST', 400);
        const routerError = await trustedRouter(request, env);
        if (routerError) return failure(routerError, routerError === 'FORBIDDEN' ? 403 : 503);
        // The offline/default worker has no injected Payment capability.
        const preview = url.pathname === PAYMENT_PREVIEW_PATH;
        const catalog = url.pathname === VARIANT_CATALOG_PATH;
        const period = url.pathname === STORE_PERIOD_PATH;
        const capability = period ? storePeriod : catalog ? variantCatalog : preview ? paymentPreview : paymentSample;
        if (env?.FINANCE_CONNECTION_ENABLED !== 'true' || typeof capability !== 'function'
            || typeof fetchImpl !== 'function' || typeof now !== 'function') return failure('CONFIGURATION_PENDING', 503);
        const input = await privateFinanceBody(request, catalog, period);
        if (!input) return failure('INVALID_REQUEST', 400);
        try {
          const result = await capability(env, {fetchImpl, now, ...(catalog || period ? input : {})});
          const frame = period ? projectStorePeriodFrame(result) : catalog ? projectVariantCatalog(result) : preview ? projectFinancePaymentPreview(result) : sampleFrame(result);
          if (period && (!frame || (input.operation === 'start' ? frame.start_date !== input.start_date || frame.end_date !== input.end_date : frame.run_id !== input.run_id))) return response({error:'FINANCE_STORE_UNAVAILABLE',diagnostic:{code:'FINANCE_STORE_UNAVAILABLE',http:null}},502,{json:true});
          if (catalog && (!frame || frame.products.length !== input.item_ids.length || frame.products.some(product => !input.item_ids.includes(product.item_id) || input.selling_unit !== 'AUTO' && (product.selling_unit || 'ONE_MALE_ONE_FEMALE_KIT') !== (input.selling_unit || 'ONE_MALE_ONE_FEMALE_KIT')))) return response({error:'FINANCE_CATALOG_UNAVAILABLE',diagnostic:{code:'FINANCE_CATALOG_UNAVAILABLE',http:null}},502,{json:true});
          if (!frame) return paymentFailure(preview ? new FinanceConnectionError('FINANCE_SAMPLE_PREVIEW_RESPONSE_INVALID', 502) : undefined);
          return response(frame, 200, {json: true});
        } catch (error) { return period ? response({error:'FINANCE_STORE_UNAVAILABLE',diagnostic:{code:'FINANCE_STORE_UNAVAILABLE',http:null}},502,{json:true}) : catalog ? response({error:'FINANCE_CATALOG_UNAVAILABLE',diagnostic:{code:'FINANCE_CATALOG_UNAVAILABLE',http:null}},502,{json:true}) : paymentFailure(error); }
      }
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
        return failure(callbackDiagnostic(error), status, true);
      }
    },
  };
}

export default createFinanceWorker();
