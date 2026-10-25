import {FINANCE_PROFILE,FinanceConnectionError} from './connection-store.mjs';
import {ensureFinanceAccessToken} from './refresh-coordinator.mjs';
import {requestFinanceAuthJson} from './auth-json-transport.mjs';
import {projectHistoricalVariantEvidenceRequest,projectHistoricalVariantEvidenceFrame} from './historical-variant-evidence-frame.mjs';

const encoder=new TextEncoder(),ORIGIN='https://partner.shopeemobile.com',LIST='/api/v2/order/get_order_list',DETAIL='/api/v2/order/get_order_detail';
const failure=(suffix,status=502)=>new FinanceConnectionError('FINANCE_HISTORICAL_EVIDENCE_'+suffix,status);
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const id=(value,zero=false)=>{if(typeof value==='number'&&Number.isSafeInteger(value))value=String(value);return typeof value==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(value)?value:null;};
const serial=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const statuses=['UNPAID','READY_TO_SHIP','PROCESSED','RETRY_SHIP','SHIPPED','TO_CONFIRM_RECEIVE','COMPLETED','IN_CANCEL','CANCELLED','INVOICE_PENDING','TO_RETURN','UNKNOWN'];
const order=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);
function midnight(day){
 const target=Date.parse(day+'T00:00:00Z'),formatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',timeZoneName:'longOffset'});let candidate=target;
 for(let i=0;i<2;i++){const label=formatter.formatToParts(new Date(candidate)).find(part=>part.type==='timeZoneName')?.value,match=/^GMT([+-])(\d{2}):(\d{2})$/.exec(label||'');if(!match)throw failure('CLOCK_CONFIGURATION',503);candidate=target-(Number(match[2])*3600+Number(match[3])*60)*(match[1]==='+'?1:-1)*1000;}
 return candidate/1000;
}

// Each invocation reads one order-list page and its exact detail set. The
// caller checkpoints only the opaque cursor; historical names never establish
// a cost or composition by themselves. No Payment or product-write API runs.
export async function runFinanceHistoricalVariantEvidence(env,options={}){
 if(!plain(options)||Reflect.ownKeys(options).some(key=>!['start_date','end_date','item_ids','cursor','fetchImpl','now','timeoutMs'].includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(options,key)||{},'value')))throw failure('REQUEST_INVALID',400);
 const input=projectHistoricalVariantEvidenceRequest({start_date:options.start_date,end_date:options.end_date,item_ids:options.item_ids,cursor:options.cursor});if(!input)throw failure('REQUEST_INVALID',400);
 const {fetchImpl,now=()=>Date.now(),timeoutMs=10000}=options;
 if(env?.FINANCE_CONNECTION_ENABLED!=='true'||typeof fetchImpl!=='function'||typeof now!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>10000)throw failure('CONFIGURATION',503);
 const clock=()=>{let value;try{value=now();}catch{throw failure('CLOCK_CONFIGURATION',503);}if(!Number.isSafeInteger(value)||value<1||value>9999999999999)throw failure('CLOCK_CONFIGURATION',503);return value;};
 const start=clock(),wall=Date.now(),cutoff=Math.floor(start/1000),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(start));
 if(input.end_date>today)throw failure('REQUEST_INVALID',400);
 const from=midnight(input.start_date),nextDay=new Date(Date.parse(input.end_date+'T00:00:00Z')+86400000).toISOString().slice(0,10),to=Math.min(cutoff,midnight(nextDay)-1);
 const remaining=()=>{const left=20000-Math.max(0,Date.now()-wall,clock()-start);if(left<5)throw failure('READ_BUDGET',504);return Math.min(timeoutMs,Math.floor(left));};
 const partnerKey=env.SHOPEE_FINANCE_PARTNER_KEY;if(typeof partnerKey!=='string'||!partnerKey.length||partnerKey.length>4096||/[\u0000-\u001f\u007f]/.test(partnerKey))throw failure('SIGNING_KEY_CONFIGURATION',503);
 const rawKey=encoder.encode(partnerKey);let signingKey;
 try{if(rawKey.byteLength>8192)throw failure('SIGNING_KEY_CONFIGURATION',503);signingKey=await crypto.subtle.importKey('raw',rawKey,{name:'HMAC',hash:'SHA-256'},false,['sign']);}catch(error){if(error instanceof FinanceConnectionError)throw error;throw failure('SIGNING_KEY_CONFIGURATION',503);}finally{rawKey.fill(0);}
 const tokens=await ensureFinanceAccessToken(env,{fetchImpl,now,timeoutMs:remaining()});
 if(typeof tokens.access_token!=='string'||!tokens.access_token.length||tokens.access_token.length>8192||/[\u0000-\u001f\u007f]/.test(tokens.access_token)||!Number.isSafeInteger(tokens.expires_at))throw failure('CONFIGURATION',503);
 const get=async(path,query,phase)=>{
  const timestamp=Math.floor(clock()/1000);if(tokens.expires_at<=timestamp)throw failure('AUTHORIZATION_EXPIRED',409);
  return requestFinanceAuthJson({input:{timestamp},prefix:'FINANCE_HISTORICAL_EVIDENCE_'+phase,maximumBodyBytes:path===DETAIL?1048576:65536,options:{fetchImpl,now,timeoutMs:remaining()},buildRequest:async()=>{
   remaining();const digest=new Uint8Array(await crypto.subtle.sign('HMAC',signingKey,encoder.encode(String(FINANCE_PROFILE.partner_id)+path+timestamp+tokens.access_token+FINANCE_PROFILE.shop_id))),sign=Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join(''),url=new URL(path,ORIGIN);
   for(const [name,value]of Object.entries({partner_id:FINANCE_PROFILE.partner_id,timestamp,access_token:tokens.access_token,shop_id:FINANCE_PROFILE.shop_id,sign,...query}))url.searchParams.set(name,String(value));
   return new Request(url,{method:'GET',redirect:'manual',headers:{Accept:'application/json'}});
  },normalizeResponse:payload=>{
   remaining();if(!plain(payload)||typeof payload.error!=='string')throw failure(phase+'_RESPONSE_INVALID');
   for(const row of [payload,plain(payload.response)?payload.response:{}])for(const field of ['partner_id','shop_id'])if(Object.hasOwn(row,field)&&row[field]!==FINANCE_PROFILE[field])throw failure('IDENTITY_MISMATCH');
   if(payload.error!=='')throw failure(phase+'_'+(payload.error==='error_token'?'AUTH_REQUIRED':payload.error==='error_api_permission'?'PERMISSION_REQUIRED':['error_rate_limit','error_limit'].includes(payload.error)?'RATE_LIMIT':'API_REJECTED'),['error_rate_limit','error_limit'].includes(payload.error)?429:502);
   if(!plain(payload.response))throw failure(phase+'_RESPONSE_INVALID');return payload.response;
  }});
 };
 const listing=await get(LIST,{time_range_field:'create_time',time_from:from,time_to:to,page_size:50,cursor:input.cursor??''},'LIST');
 if(!Array.isArray(listing.order_list)||listing.order_list.length>50||typeof listing.more!=='boolean')throw failure('LIST_INVALID');
 const selected=[],seen=new Set();for(const row of listing.order_list){if(!plain(row)||!serial(row.order_sn))throw failure('LIST_INVALID');if(!seen.has(row.order_sn)){seen.add(row.order_sn);selected.push(row.order_sn);}}
 let nextCursor=null;
 if(listing.more){nextCursor=listing.next_cursor;if(!selected.length||typeof nextCursor!=='string'||!nextCursor.length||nextCursor.length>1024||/[^\x21-\x7e]/.test(nextCursor)||nextCursor===input.cursor)throw failure('CURSOR_INVALID');}
 // Cursors remain opaque. Refuse a provider cursor that directly reproduces
 // any order serial from this page rather than exporting that identifier.
 if(selected.some(value=>input.cursor?.includes(value)||nextCursor?.includes(value)))throw failure('CURSOR_INVALID');
 const products=new Map(input.item_ids.map(item_id=>[item_id,new Map()])),coverage={orders_seen:selected.length,target_orders:0,target_lines:0,target_units:0};
 if(selected.length){
  const detail=await get(DETAIL,{order_sn_list:selected.join(','),response_optional_fields:'item_list'},'DETAIL');
  if(!Array.isArray(detail.order_list)||detail.order_list.length!==selected.length)throw failure('DETAIL_INVALID');
  const found=new Set();
  const metadata=(line,key,max)=>{const value=line[key];if(value===undefined||value===null||value==='')return null;if(typeof value!=='string'||!value.trim().length||encoder.encode(value).byteLength>max||/[\u0000-\u001f\u007f-\u009f]/.test(value))throw failure('METADATA_INVALID');return value;};
  for(const row of detail.order_list){
   if(!plain(row)||!selected.includes(row.order_sn)||found.has(row.order_sn)||!Number.isSafeInteger(row.create_time)||row.create_time<from||row.create_time>to||!Array.isArray(row.item_list)||row.item_list.length>200)throw failure('DETAIL_INVALID');found.add(row.order_sn);
   for(const field of ['shop_id','partner_id'])if(Object.hasOwn(row,field)&&row[field]!==FINANCE_PROFILE[field])throw failure('IDENTITY_MISMATCH');
   const status=statuses.includes(row.order_status)?row.order_status:'UNKNOWN';let target=false;
   for(const line of row.item_list){
    if(!plain(line))throw failure('DETAIL_INVALID');const itemId=id(line.item_id);if(!itemId)throw failure('DETAIL_INVALID');if(!products.has(itemId))continue;
    const modelId=id(line.model_id,true),quantity=line.model_quantity_purchased;if(!modelId||!Number.isSafeInteger(quantity)||quantity<1||quantity>10000)throw failure('DETAIL_INVALID');
    const itemName=metadata(line,'item_name',1024),modelName=metadata(line,'model_name',512),variants=products.get(itemId);let variant=variants.get(modelId);
    if(!variant){variant={model_id:modelId,line_count:0,quantity:0,item_names:new Set(),model_names:new Set(),missing_item_name_lines:0,missing_model_name_lines:0,status_counts:new Map()};variants.set(modelId,variant);}
    target=true;coverage.target_lines++;coverage.target_units+=quantity;variant.line_count++;variant.quantity+=quantity;
    if(itemName===null)variant.missing_item_name_lines++;else variant.item_names.add(itemName);
    if(modelName===null)variant.missing_model_name_lines++;else variant.model_names.add(modelName);
    const tally=variant.status_counts.get(status)||{status,line_count:0,quantity:0};tally.line_count++;tally.quantity+=quantity;variant.status_counts.set(status,tally);
    if(variant.item_names.size>5||variant.model_names.size>5)throw failure('EVIDENCE_LIMIT',409);
   }
   if(target)coverage.target_orders++;
  }
 }
 remaining();const result={schema:'historical_variant_evidence_v1',shop_id:FINANCE_PROFILE.shop_id,checked_at:Math.floor(clock()/1000),start_date:input.start_date,end_date:input.end_date,item_ids:[...input.item_ids],cursor:input.cursor,has_more:listing.more,next_cursor:nextCursor,coverage,evidence_complete:true,products:[...products].map(([item_id,variants])=>({item_id,variants:[...variants.values()].sort((a,b)=>order(a.model_id,b.model_id)).map(variant=>({...variant,item_names:[...variant.item_names].sort(),model_names:[...variant.model_names].sort(),status_counts:[...variant.status_counts.values()].sort((a,b)=>statuses.indexOf(a.status)-statuses.indexOf(b.status)),conflict:variant.item_names.size>1||variant.model_names.size>1}))})),omitted:{target_lines:0,target_units:0}};
 if(encoder.encode(JSON.stringify(result)).byteLength>65536)throw failure('EVIDENCE_LIMIT',409);
 const frame=projectHistoricalVariantEvidenceFrame(result);if(!frame)throw failure('RESPONSE_INVALID');return frame;
}
