import {FINANCE_PROFILE,FinanceConnectionError} from './connection-store.mjs';
import {ensureFinanceAccessToken} from './refresh-coordinator.mjs';
import {requestFinanceAuthJson} from './auth-json-transport.mjs';
import {projectIncomeDetailFrame} from './income-detail-frame.mjs';
import {incomeDetailFailureDiagnostic} from './income-detail-diagnostic.mjs';

const origin='https://partner.shopeemobile.com',path='/api/v2/payment/get_income_detail',encoder=new TextEncoder();
const fail=(suffix,status=503,kind=null)=>{const error=new FinanceConnectionError('FINANCE_INCOME_DETAIL_'+suffix,status);if(kind!==null)Object.defineProperty(error,'upstream_diagnostic',{value:kind});throw error;};
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const serial=value=>typeof value==='string'&&value.length>0&&value.length<=128&&!/[^\x21-\x7e]|,/.test(value);
const clean=(value,max=160)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value)?value:null;
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
function providerRaw(value){
 if(value===null||value===undefined)return null;if(typeof value!=='number'||!Number.isFinite(value)||Object.is(value,-0)||Math.abs(value)>1000000000000)return null;
 const match=/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));if(!match)return null;let digits=(match[2]+(match[3]??'')).replace(/^0+/,'')||'0',scale=(match[3]??'').length-Number(match[4]??0);
 if(scale<0){digits+='0'.repeat(-scale);scale=0;}if(scale>12)return null;if(scale>0){digits=digits.padStart(scale+1,'0');digits=digits.slice(0,-scale)+'.'+digits.slice(-scale);digits=digits.replace(/0+$/,'').replace(/\.$/,'');}
 return (match[1]&&digits!=='0'?'-':'')+digits;
}
function cents(raw){if(raw===null)return null;const m=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(raw);if(!m)return null;const n=(BigInt(m[2])*100n+BigInt((m[3]??'').padEnd(2,'0')))*(m[1]?-1n:1n);return n>=BigInt(Number.MIN_SAFE_INTEGER)&&n<=BigInt(Number.MAX_SAFE_INTEGER)?Number(n):null;}
function localDay(stamp){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));}
function previousDay(day){return new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);}
async function envelope(value,checkedAt){
 if(!plain(value)||typeof value.error!=='string')fail('INVALID_RESPONSE',502,'ROOT_INVALID');for(const row of [value,...(plain(value.response)?[value.response]:[])])for(const name of ['partner_id','shop_id'])if(Object.hasOwn(row,name)&&row[name]!==FINANCE_PROFILE[name])fail('INVALID_RESPONSE',502,'IDENTITY_MISMATCH');
 if(value.error!==''){
  const suffix=['error_api_permission','error_auth','error_sign','error_partner_id','error_ip'].includes(value.error)?'PERMISSION_DENIED':['error_limit','error_rate_limit'].includes(value.error)?'RATE_LIMIT':'UNAVAILABLE',error=new FinanceConnectionError('FINANCE_INCOME_DETAIL_'+suffix,502),safe=incomeDetailFailureDiagnostic({code:error.code,provider_code:value.error,upstream_status:200});
  Object.defineProperties(error,{provider_code:{value:safe.provider_code},upstream_status:{value:200},upstream_diagnostic:{value:'PROVIDER_ERROR'}});throw error;
 }
 const box=value.income_detail_list;if(!plain(box))fail('INVALID_RESPONSE',502,'INCOME_CONTAINER_MISSING');if(!Array.isArray(box.list)||box.list.length>100)fail('INVALID_RESPONSE',502,'INCOME_LIST_INVALID');const next=plain(box.next_page)?box.next_page:null,cursor=next&&typeof next.cursor==='string'&&next.cursor.length<=512?next.cursor:'';
 if(next&&Object.hasOwn(next,'cursor')&&(typeof next.cursor!=='string'||next.cursor.length>512))fail('INVALID_RESPONSE',502,'PAGE_CURSOR_INVALID');if(next&&Object.hasOwn(next,'page_size')&&next.page_size!==100)fail('INVALID_RESPONSE',502,'PAGE_SIZE_INVALID');
 const rows=[];
 for(const item of box.list){
  if(!plain(item)||!serial(item.order_sn))fail('INVALID_RESPONSE',502,'ROW_IDENTITY_INVALID');if(item.currency!=='BRL')fail('INVALID_RESPONSE',502,'ROW_CURRENCY_INVALID');const raw=providerRaw(item.estimated_escrow_amount);
  if(Object.hasOwn(item,'estimated_escrow_amount')&&item.estimated_escrow_amount!==null&&raw===null)fail('INVALID_RESPONSE',502,'ROW_AMOUNT_INVALID');
  const estimated=Object.hasOwn(item,'estimated_payout_time')&&integer(item.estimated_payout_time,1,9999999999)?item.estimated_payout_time:null,created=Object.hasOwn(item,'creation_date')&&integer(item.creation_date,1,9999999999)?item.creation_date:null;
  const status=clean(item.status);if(status===null)fail('INVALID_RESPONSE',502,'ROW_STATUS_INVALID');const description=Object.hasOwn(item,'description')?clean(item.description):null,payment=Object.hasOwn(item,'payment_method')?clean(item.payment_method):null;if(Object.hasOwn(item,'description')&&description===null||Object.hasOwn(item,'payment_method')&&payment===null)fail('INVALID_RESPONSE',502,'ROW_TEXT_INVALID');
  const orderHash=await hash(item.order_sn),entryHash=await hash(JSON.stringify({order_sn:item.order_sn,status,description,payment,estimated_escrow_raw:raw,estimated_payout_time:estimated,creation_time:created}));
  rows.push({entry_hash:entryHash,order_hash:orderHash,currency:'BRL',status,description,payment_method:payment,estimated_escrow_raw:raw,estimated_escrow_cents:cents(raw),estimated_payout_time:estimated,creation_time:created});
 }
 return {schema:'finance_income_detail_v1',checked_at:checkedAt,region:'BRAZIL',shop_type:'LOCAL',income_status:'PENDING',page_size:100,returned_count:rows.length,has_more:cursor.length>0,next_cursor_present:cursor.length>0,rows,basis:'CURRENT_PENDING_PROVIDER_INCOME_DETAIL_NOT_MONTH_OR_BANK_RECEIPT'};
}
export async function readFinanceIncomeDetail(env,{fetchImpl=request=>fetch(request),now=()=>Date.now(),timeoutMs=5000}={}){
 const rawNow=now();if(!integer(rawNow,1,9999999999999)||typeof fetchImpl!=='function'||!integer(timeoutMs,5,5000)||env?.FINANCE_CONNECTION_ENABLED!=='true')fail('CONFIGURATION');const started=Math.floor(rawNow/1000);
 const keyText=env.SHOPEE_FINANCE_PARTNER_KEY;if(typeof keyText!=='string'||!keyText.length||keyText.length>4096||/[\u0000-\u001f\u007f]/.test(keyText))fail('SIGNING_CONFIGURATION');const bytes=encoder.encode(keyText);let key;try{key=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);}finally{bytes.fill(0);}
 let calls=0;const bounded=async request=>{if(calls>=2)fail('UNAVAILABLE');calls++;return fetchImpl(request);},tokens=await ensureFinanceAccessToken(env,{fetchImpl:bounded,now,timeoutMs});const timestamp=Math.floor(now()/1000);if(tokens.expires_at<=timestamp)fail('UNAVAILABLE');
 const today=localDay(timestamp),body={cursor:'',date_from:previousDay(today),date_to:today,income_status:2,page_size:100};
 const observed=await requestFinanceAuthJson({input:{timestamp},options:{fetchImpl:bounded,now,timeoutMs},prefix:'FINANCE_INCOME_DETAIL',maximumBodyBytes:262144,buildRequest:async()=>{
  const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(String(FINANCE_PROFILE.partner_id)+path+timestamp+tokens.access_token+FINANCE_PROFILE.shop_id)))].map(byte=>byte.toString(16).padStart(2,'0')).join(''),url=new URL(path,origin);
  for(const [name,value] of Object.entries({partner_id:FINANCE_PROFILE.partner_id,shop_id:FINANCE_PROFILE.shop_id,timestamp,access_token:tokens.access_token,sign:signature}))url.searchParams.set(name,String(value));
  return new Request(url,{method:'POST',redirect:'manual',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body)});
 },normalizeResponse:value=>envelope(value,Math.max(started,Math.floor(now()/1000)))});
 const frame=projectIncomeDetailFrame(await observed);if(!frame)fail('RESULT_INVALID');return frame;
}
