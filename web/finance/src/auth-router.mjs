import {projectDailyOrdersFrame} from './daily-orders-frame.mjs';
import {projectFinancePaymentPreview} from './payment-preview-frame.mjs';
import {projectVariantCatalog,projectVariantCatalogRequest} from './variant-catalog-frame.mjs';
import {projectStorePeriodRequest,projectStorePeriodFrame} from './store-period-frame.mjs';
import {projectBusinessPeriodRequest,projectBusinessPeriodFrame} from './business-period-frame.mjs';

// Candidate router: only the isolated financial Service Binding can handle these paths.
const FINANCE_ORIGIN = 'https://auth.brazacommerce.com.br';
const FINANCE_ROUTES = new Set(['/shopee/finance/connect','/shopee/finance/callback','/shopee/finance/status']);
const AUTHORIZATION_HOSTS = new Set(['open.shopee.com','open.shopee.com.br','partner.shopeemobile.com','openplatform.shopee.com.br']);
const PRIVATE_HEADERS = {'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
const PAYMENT_SAMPLE_PATH = '/internal/shopee/finance/payment-sample';
const PAYMENT_PREVIEW_PATH = '/internal/shopee/finance/payment-preview';
const VARIANT_CATALOG_PATH = '/internal/shopee/finance/variant-catalog';
const STORE_PERIOD_PATH = '/internal/shopee/finance/store-period';
const BUSINESS_PERIOD_PATH = '/internal/shopee/finance/business-period';
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

function sampleFailure(code='FINANCE_SAMPLE_UNAVAILABLE',status=502,http=null){
 return new Response(JSON.stringify({error:'FINANCE_SAMPLE_UNAVAILABLE',diagnostic:{code:SAMPLE_FAILURES.has(code)?code:'FINANCE_SAMPLE_UNAVAILABLE',http:Number.isInteger(http)&&http>=100&&http<=599?http:null}}),{status,headers:{...PRIVATE_HEADERS,'content-type':'application/json; charset=utf-8'}});
}

function catalogFailure(status=502){
 return new Response(JSON.stringify({error:'FINANCE_CATALOG_UNAVAILABLE',diagnostic:{code:'FINANCE_CATALOG_UNAVAILABLE',http:null}}),{status,headers:{...PRIVATE_HEADERS,'content-type':'application/json; charset=utf-8'}});
}

function storePeriodFailure(status=502){
 return new Response(JSON.stringify({error:'FINANCE_STORE_UNAVAILABLE',diagnostic:{code:'FINANCE_STORE_UNAVAILABLE',http:null}}),{status,headers:{...PRIVATE_HEADERS,'content-type':'application/json; charset=utf-8'}});
}

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

async function readSampleBody(body,maximum,controller,onReader){
 if(!body)throw Error('INVALID_BODY');
 if(controller.signal.aborted){try{body.cancel().catch(()=>{});}catch{}throw Error('DEADLINE');}
 const reader=body.getReader();onReader(reader);const chunks=[];let length=0;
 try{while(true){if(controller.signal.aborted)throw Error('DEADLINE');const chunk=await reader.read();if(chunk.done)break;if(!(chunk.value instanceof Uint8Array))throw Error('INVALID_BODY');length+=chunk.value.byteLength;if(length>maximum)throw Error('BODY_LIMIT');chunks.push(chunk.value);}}
 finally{try{reader.cancel().catch(()=>{});}catch{}reader.releaseLock();onReader(null);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}

// This private action is deliberately separate from the public OAuth router.
export async function forwardFinancePaymentSample(request,env,{validateInternalApp}={}){
 let url;try{url=new URL(request.url);}catch{return routerFailure('INVALID_REQUEST',400);}
 if(url.origin!==FINANCE_ORIGIN||url.username||url.password||url.hash||![PAYMENT_SAMPLE_PATH,PAYMENT_PREVIEW_PATH,VARIANT_CATALOG_PATH,STORE_PERIOD_PATH,BUSINESS_PERIOD_PATH].includes(url.pathname))return routerFailure('NOT_FOUND',404);
 const catalog=url.pathname===VARIANT_CATALOG_PATH,business=url.pathname===BUSINESS_PERIOD_PATH,storePeriod=business||url.pathname===STORE_PERIOD_PATH,maximum=storePeriod?524288:catalog?262144:65536,maximumInput=storePeriod?256:128;
 const unavailable=()=>storePeriod?storePeriodFailure():catalog?catalogFailure():sampleFailure();
 if(request.method!=='POST')return routerFailure('METHOD_NOT_ALLOWED',405);
 if(url.search||request.url.length>4096)return routerFailure('INVALID_REQUEST',400);
 try{if(typeof validateInternalApp!=='function'||!await validateInternalApp(request,env))return routerFailure('UNAUTHORIZED',401);}catch{return unavailable();}
 const secret=env?.FINANCE_ROUTER_SECRET;
 if(typeof secret!=='string'||! /^[\x21-\x7e]{32,256}$/.test(secret)||typeof env?.SHOPEE_FINANCE_SERVICE?.fetch!=='function')return routerFailure('FINANCE_CONFIGURATION_PENDING',503);
 if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(request.headers.get('content-type')||''))return routerFailure('INVALID_REQUEST',400);
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maximumInput))return routerFailure('INVALID_REQUEST',400);
 const controller=new AbortController();let reader,timer;
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();try{reader?.cancel().catch(()=>{});}catch{}reject(Error('DEADLINE'));},45000);});
 const work=async()=>{
  let body;try{body=await readSampleBody(request.body,maximumInput,controller,value=>{reader=value;});}catch{return routerFailure('INVALID_REQUEST',400);}
  const input=storePeriod?(business?projectBusinessPeriodRequest(body):projectStorePeriodRequest(body)):catalog?projectVariantCatalogRequest(body):body;
  if(!input||(!catalog&&!storePeriod&&(typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==0)))return routerFailure('INVALID_REQUEST',400);
  if(controller.signal.aborted)return unavailable();
  const headers={'content-type':'application/json',accept:'application/json','X-Braza-Finance-Router':secret};
  const upstream=await env.SHOPEE_FINANCE_SERVICE.fetch(new Request(FINANCE_ORIGIN+url.pathname,{method:'POST',headers,body:JSON.stringify(input),redirect:'manual',signal:controller.signal}));
  // A service binding may finish after our deadline despite its aborted signal.
  // Its late response must be canceled before acquiring a stalled body reader.
  if(controller.signal.aborted){try{upstream?.body?.cancel().catch(()=>{});}catch{}return unavailable();}
  if(!(upstream instanceof Response)||upstream.redirected||upstream.status>=300&&upstream.status<400){try{upstream?.body?.cancel().catch(()=>{});}catch{}return unavailable();}
  const media=upstream.headers.get('content-type')||'',size=upstream.headers.get('content-length');
  if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(media)||(size!==null&&(!/^\d+$/.test(size)||Number(size)>maximum))){try{upstream.body?.cancel().catch(()=>{});}catch{}return unavailable();}
  const value=await readSampleBody(upstream.body,maximum,controller,current=>{reader=current;});
  if(controller.signal.aborted)return unavailable();
  if(upstream.status!==200){
   if(storePeriod)return storePeriodFailure([400,401,403,409,429,502,503,504].includes(upstream.status)?upstream.status:502);
   if(catalog)return catalogFailure([400,401,403,409,429,502,503,504].includes(upstream.status)?upstream.status:502);
   const code=value?.error==='FINANCE_SAMPLE_UNAVAILABLE'&&SAMPLE_FAILURES.has(value?.diagnostic?.code)?value.diagnostic.code:'FINANCE_SAMPLE_UNAVAILABLE';
   return sampleFailure(code,[400,401,403,409,429,502,503,504].includes(upstream.status)?upstream.status:502,value?.diagnostic?.http);
  }
  const preview=url.pathname===PAYMENT_PREVIEW_PATH;
  const frame=storePeriod?(business?projectBusinessPeriodFrame(value):projectStorePeriodFrame(value)):catalog?projectVariantCatalog(value):preview?projectFinancePaymentPreview(value):sampleFrame(value);
  if(storePeriod&&frame&&!storePeriodRequestMatches(input,frame))return storePeriodFailure();
  if(catalog&&frame&&!catalogRequestMatches(input,frame))return catalogFailure();
  return frame?new Response(JSON.stringify(frame),{headers:{...PRIVATE_HEADERS,'content-type':'application/json; charset=utf-8'}}):storePeriod?storePeriodFailure():catalog?catalogFailure():sampleFailure(preview?'FINANCE_SAMPLE_PREVIEW_RESPONSE_INVALID':'FINANCE_SAMPLE_UNAVAILABLE');
 };
 try{return await Promise.race([work(),deadline]);}catch{return unavailable();}finally{clearTimeout(timer);controller.abort();try{reader?.cancel().catch(()=>{});}catch{}}
}

function storePeriodRequestMatches(input,frame){
 return input.operation==='start'?frame.start_date===input.start_date&&frame.end_date===input.end_date:frame.run_id===input.run_id;
}

function catalogRequestMatches(input,frame){
 return Array.isArray(frame.products)&&frame.products.length===input.item_ids.length&&frame.products.every(item=>input.item_ids.includes(item.item_id)&&(input.selling_unit==='AUTO'||(item.selling_unit||'ONE_MALE_ONE_FEMALE_KIT')===(input.selling_unit||'ONE_MALE_ONE_FEMALE_KIT')));
}

function routerFailure(code,status){return new Response(JSON.stringify({error:code}),{status,headers:{...PRIVATE_HEADERS,'content-type':'application/json; charset=utf-8'}});}
function safeRedirect(value){
 try {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)return false;
  if(AUTHORIZATION_HOSTS.has(url.hostname))return true;
  return url.origin===FINANCE_ORIGIN&&url.pathname==='/shopee/finance/status'&&!url.search;
 } catch {return false;}
}

export async function forwardFinanceConnection(request,env){
 let url;try{url=new URL(request.url);}catch{return routerFailure('INVALID_REQUEST',400);}
 if(url.origin!==FINANCE_ORIGIN||url.username||url.password||url.hash||!FINANCE_ROUTES.has(url.pathname))return routerFailure('NOT_FOUND',404);
 if(request.method!=='GET')return routerFailure('METHOD_NOT_ALLOWED',405);
 if(request.url.length>8192)return routerFailure('INVALID_REQUEST',400);
 const secret=env.FINANCE_ROUTER_SECRET;
 if(typeof secret!=='string'||secret.length<32||secret.length>256||/[\r\n]/.test(secret)||!env.SHOPEE_FINANCE_SERVICE||typeof env.SHOPEE_FINANCE_SERVICE.fetch!=='function')return routerFailure('FINANCE_CONFIGURATION_PENDING',503);
 const headers=new Headers({'accept':url.pathname.endsWith('/status')?'application/json':'text/html','X-Braza-Finance-Router':secret});
 // The financial worker never receives Ads/admin session cookies or caller authorization.
 const cookies=(request.headers.get('cookie')||'').split(';').map(part=>part.trim()).filter(part=>part.startsWith('braza_finance_oauth='));
 if(cookies.length)headers.set('cookie',cookies.join('; '));
 let upstream;
 try{upstream=await env.SHOPEE_FINANCE_SERVICE.fetch(new Request(url.href,{method:'GET',headers,redirect:'manual'}));}
 catch{return routerFailure('FINANCE_UNAVAILABLE',502);}
 if(!upstream||!Number.isInteger(upstream.status)||upstream.status<200||upstream.status>599)return routerFailure('FINANCE_UNAVAILABLE',502);
 if(upstream.status>=300&&upstream.status<400&&(![302,303].includes(upstream.status)||!safeRedirect(upstream.headers.get('location'))))return routerFailure('FINANCE_UNAVAILABLE',502);
 const outputHeaders=new Headers(PRIVATE_HEADERS);
 for(const name of ['content-type','content-security-policy','location','set-cookie']){
  const value=upstream.headers.get(name);if(value)outputHeaders.set(name,value);
 }
 const cookie=outputHeaders.get('set-cookie');
 if(cookie&&(!cookie.startsWith('braza_finance_oauth=')||/;\s*domain\s*=/i.test(cookie)||!/(?:^|;)\s*Path=\/shopee\/finance(?:;|$)/i.test(cookie)))return routerFailure('FINANCE_UNAVAILABLE',502);
 return new Response(upstream.body,{status:upstream.status,headers:outputHeaders});
}


// Daily sales have a distinct read-only capability. The browser cannot select
// a shop, date, status, gateway host or arbitrary provider endpoint.
export async function forwardFinanceDailyOrders(request,env,{validateInternalApp}={}){
 const unavailable=()=>new Response(JSON.stringify({error:'SHOP_ORDERS_UNAVAILABLE',diagnostic:{stage:'AUTH_VALIDATION',code:'INVALID_RESPONSE',http:null}}),{status:502,headers:{...PRIVATE_HEADERS,'content-type':'application/json; charset=utf-8'}});
 let url;try{url=new URL(request.url);}catch{return routerFailure('INVALID_REQUEST',400);}
 if(url.origin!==FINANCE_ORIGIN||url.username||url.password||url.hash||url.pathname!=='/internal/shopee/finance/daily-orders')return routerFailure('NOT_FOUND',404);
 if(request.method!=='GET')return routerFailure('METHOD_NOT_ALLOWED',405);
 if(url.search||request.url.length>4096)return routerFailure('INVALID_REQUEST',400);
 try{if(typeof validateInternalApp!=='function'||!await validateInternalApp(request,env))return routerFailure('UNAUTHORIZED',401);}catch{return unavailable();}
 const secret=env?.FINANCE_ROUTER_SECRET;
 if(typeof secret!=='string'||! /^[\x21-\x7e]{32,256}$/.test(secret)||typeof env?.SHOPEE_FINANCE_SERVICE?.fetch!=='function')return routerFailure('FINANCE_CONFIGURATION_PENDING',503);
 const controller=new AbortController();let reader,timer;
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();try{reader?.cancel().catch(()=>{});}catch{}reject(Error('DEADLINE'));},45000);});
 const work=async()=>{
  const upstream=await env.SHOPEE_FINANCE_SERVICE.fetch(new Request(FINANCE_ORIGIN+url.pathname,{method:'GET',headers:{accept:'application/json','X-Braza-Finance-Router':secret},redirect:'manual',signal:controller.signal}));
  if(controller.signal.aborted||!(upstream instanceof Response)||upstream.redirected||upstream.status!==200){try{upstream?.body?.cancel().catch(()=>{});}catch{}return unavailable();}
  const media=upstream.headers.get('content-type')||'',size=upstream.headers.get('content-length');
  if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(media)||(size!==null&&(!/^\d+$/.test(size)||Number(size)>4096))){try{upstream.body?.cancel().catch(()=>{});}catch{}return unavailable();}
  const value=await readSampleBody(upstream.body,4096,controller,current=>{reader=current;});
  const frame=projectDailyOrdersFrame(value),currentDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
  if(controller.signal.aborted||!frame||frame.date!==currentDay||Date.parse(frame.through_at)>Date.now()+60000||Date.now()-Date.parse(frame.through_at)>120000)return unavailable();
  return new Response(JSON.stringify(frame),{headers:{...PRIVATE_HEADERS,'content-type':'application/json; charset=utf-8'}});
 };
 try{return await Promise.race([work(),deadline]);}catch{return unavailable();}finally{clearTimeout(timer);controller.abort();try{reader?.cancel().catch(()=>{});}catch{}}
}
