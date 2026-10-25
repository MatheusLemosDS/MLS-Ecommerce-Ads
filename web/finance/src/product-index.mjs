import {FINANCE_PROFILE,FinanceConnectionError} from './connection-store.mjs';
import {ensureFinanceAccessToken} from './refresh-coordinator.mjs';
import {requestFinanceAuthJson} from './auth-json-transport.mjs';
import {projectProductIndexRequest,projectProductIndexFrame} from './product-index-frame.mjs';

const PATH='/api/v2/product/get_item_list',ORIGIN='https://partner.shopeemobile.com',encoder=new TextEncoder();
const failure=(suffix,status=502)=>new FinanceConnectionError('FINANCE_PRODUCT_INDEX_'+suffix,status);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));

// Official endpoint reference: https://open.shopee.com/developer-guide/221
// and /documents/v2/v2.product.get_item_list?module=89&type=1. The public SDK
// schemas/product.ts corroborates response.item, update_time, total_count,
// has_next_page, next_offset and all six exact provider status names.
// One invocation reads exactly one bounded page; no listing writes are exposed.
export async function runFinanceProductIndex(env,options={}){
 if(!plain(options)||Reflect.ownKeys(options).some(key=>!['offset','page_size','item_status','fetchImpl','now','timeoutMs'].includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(options,key)||{},'value')))throw failure('REQUEST_INVALID',400);
 const input=projectProductIndexRequest({offset:options.offset,page_size:options.page_size,item_status:options.item_status});
 if(!input)throw failure('REQUEST_INVALID',400);
 const {fetchImpl,now=()=>Date.now(),timeoutMs=10000}=options;
 if(env?.FINANCE_CONNECTION_ENABLED!=='true'||typeof fetchImpl!=='function'||typeof now!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>10000)throw failure('CONFIGURATION',503);
 const epoch=()=>{let value;try{value=now();}catch{throw failure('CLOCK_CONFIGURATION',503);}if(!Number.isSafeInteger(value)||value<=0||Math.floor(value/1000)>9999999999)throw failure('CLOCK_CONFIGURATION',503);return Math.floor(value/1000);};
 epoch();const partnerKey=env.SHOPEE_FINANCE_PARTNER_KEY;
 if(typeof partnerKey!=='string'||!partnerKey.length||partnerKey.length>4096||/[\u0000-\u001f\u007f]/.test(partnerKey))throw failure('SIGNING_KEY_CONFIGURATION',503);
 const rawKey=encoder.encode(partnerKey);let signingKey;
 try{if(rawKey.byteLength>8192)throw failure('SIGNING_KEY_CONFIGURATION',503);signingKey=await crypto.subtle.importKey('raw',rawKey,{name:'HMAC',hash:'SHA-256'},false,['sign']);}finally{rawKey.fill(0);}
 const tokens=await ensureFinanceAccessToken(env,{fetchImpl,now,timeoutMs}),timestamp=epoch();if(tokens.expires_at<=timestamp)throw failure('AUTHORIZATION_EXPIRED',409);
 return requestFinanceAuthJson({input:{timestamp},prefix:'FINANCE_PRODUCT_INDEX',options:{fetchImpl,now,timeoutMs},buildRequest:async()=>{
  const base=String(FINANCE_PROFILE.partner_id)+PATH+timestamp+tokens.access_token+FINANCE_PROFILE.shop_id,digest=new Uint8Array(await crypto.subtle.sign('HMAC',signingKey,encoder.encode(base))),sign=Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join(''),url=new URL(PATH,ORIGIN);
  for(const [name,value] of Object.entries({partner_id:FINANCE_PROFILE.partner_id,timestamp,access_token:tokens.access_token,shop_id:FINANCE_PROFILE.shop_id,sign,...input}))url.searchParams.set(name,String(value));
  return new Request(url,{method:'GET',redirect:'manual',headers:{Accept:'application/json'}});
 },normalizeResponse:payload=>{
  if(!plain(payload)||typeof payload.error!=='string')throw failure('RESPONSE_INVALID');
  for(const row of [payload,plain(payload.response)?payload.response:{}])for(const field of ['partner_id','shop_id'])if(Object.hasOwn(row,field)&&row[field]!==FINANCE_PROFILE[field])throw failure('IDENTITY_MISMATCH');
  if(payload.error!=='')throw failure(payload.error==='error_token'?'AUTH_REQUIRED':payload.error==='error_api_permission'?'PERMISSION_REQUIRED':['error_rate_limit','error_limit'].includes(payload.error)?'RATE_LIMIT':'API_ERROR',['error_rate_limit','error_limit'].includes(payload.error)?429:502);
  const raw=payload.response;if(!plain(raw)||!Array.isArray(raw.item)||raw.item.length>input.page_size||typeof raw.has_next_page!=='boolean'||!Number.isSafeInteger(raw.total_count)||raw.total_count<0||raw.total_count>1000000)throw failure('RESPONSE_INVALID');
  if(Object.hasOwn(raw,'next_offset')&&raw.next_offset!==null&&(!Number.isSafeInteger(raw.next_offset)||raw.next_offset<0||raw.next_offset>1000000))throw failure('RESPONSE_INVALID');
  if(raw.has_next_page&&(!Number.isSafeInteger(raw.next_offset)||raw.next_offset<=input.offset||raw.next_offset>Math.min(1000000,input.offset+input.page_size)))throw failure('RESPONSE_INVALID');
  const items=raw.item.map(row=>{
   if(!plain(row))throw failure('RESPONSE_INVALID');const item_id=typeof row.item_id==='number'&&Number.isSafeInteger(row.item_id)?String(row.item_id):row.item_id;
   return {item_id,item_status:row.item_status,source_update_time:Object.hasOwn(row,'update_time')?row.update_time:null};
  });
  const frame=projectProductIndexFrame({schema:'product_index_v1',status:'AVAILABLE',shop_id:FINANCE_PROFILE.shop_id,checked_at:epoch(),...input,total_count:raw.total_count,has_more:raw.has_next_page,next_offset:raw.has_next_page?raw.next_offset:null,items});
  if(!frame)throw failure('RESPONSE_INVALID');return frame;
 }});
}
