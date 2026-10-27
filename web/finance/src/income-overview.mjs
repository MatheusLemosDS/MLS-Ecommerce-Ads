import {FINANCE_PROFILE,FinanceConnectionError} from './connection-store.mjs';
import {ensureFinanceAccessToken} from './refresh-coordinator.mjs';
import {requestFinanceAuthJson} from './auth-json-transport.mjs';
import {projectIncomeOverviewFrame} from './income-overview-frame.mjs';

const origin='https://partner.shopeemobile.com',path='/api/v2/payment/get_income_overview',encoder=new TextEncoder();
const fail=(suffix,status=503)=>{throw new FinanceConnectionError('FINANCE_INCOME_OVERVIEW_'+suffix,status);};
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
function providerRaw(value){
 if(value===null||value===undefined)return null;
 if(typeof value!=='number'||!Number.isFinite(value)||Object.is(value,-0)||Math.abs(value)>1000000000000)return null;
 const match=/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));if(!match)return null;
 let digits=(match[2]+(match[3]??'')).replace(/^0+/,'')||'0',scale=(match[3]??'').length-Number(match[4]??0);
 if(scale<0){digits+='0'.repeat(-scale);scale=0;}if(scale>12)return null;
 if(scale>0){digits=digits.padStart(scale+1,'0');digits=digits.slice(0,-scale)+'.'+digits.slice(-scale);digits=digits.replace(/0+$/,'').replace(/\.$/,'');}
 return (match[1]&&digits!=='0'?'-':'')+digits;
}
function cents(raw){
 if(raw===null)return null;const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(raw);if(!match)return null;
 const value=(BigInt(match[2])*100n+BigInt((match[3]??'').padEnd(2,'0')))*(match[1]?-1n:1n);
 return value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
}
function envelope(value){
 if(!plain(value)||typeof value.error!=='string')fail('INVALID_RESPONSE',502);
 for(const row of [value,...(plain(value.response)?[value.response]:[])])for(const name of ['partner_id','shop_id'])if(Object.hasOwn(row,name)&&row[name]!==FINANCE_PROFILE[name])fail('INVALID_RESPONSE',502);
 if(value.error!=='')fail(['error_api_permission','error_auth','error_sign','error_partner_id','error_ip'].includes(value.error)?'PERMISSION_DENIED':['error_limit','error_rate_limit'].includes(value.error)?'RATE_LIMIT':'UNAVAILABLE',502);
 if(!plain(value.response)||!plain(value.response.total_income))fail('INVALID_RESPONSE',502);
 const source=value.response.total_income,pending=providerRaw(source.pending_amount),released=providerRaw(source.released_amount),toRelease=Object.hasOwn(source,'to_release_amount')?providerRaw(source.to_release_amount):null;
 if((Object.hasOwn(source,'pending_amount')&&pending===null)||(Object.hasOwn(source,'released_amount')&&released===null)||(Object.hasOwn(source,'to_release_amount')&&source.to_release_amount!==null&&toRelease===null))fail('INVALID_RESPONSE',502);
 return {pending,released,toRelease};
}
export async function readFinanceIncomeOverview(env,{fetchImpl=request=>fetch(request),now=()=>Date.now(),timeoutMs=5000}={}){
 const rawNow=now();if(!integer(rawNow,1,9999999999999)||typeof fetchImpl!=='function'||!integer(timeoutMs,5,5000)||env?.FINANCE_CONNECTION_ENABLED!=='true')fail('CONFIGURATION');
 const checkedAt=Math.floor(rawNow/1000),keyText=env.SHOPEE_FINANCE_PARTNER_KEY;if(typeof keyText!=='string'||!keyText.length||keyText.length>4096||/[\u0000-\u001f\u007f]/.test(keyText))fail('SIGNING_CONFIGURATION');
 const bytes=encoder.encode(keyText);let key;try{key=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);}finally{bytes.fill(0);}
 let calls=0;const bounded=async request=>{if(calls>=2)fail('UNAVAILABLE');calls++;return fetchImpl(request);},tokens=await ensureFinanceAccessToken(env,{fetchImpl:bounded,now,timeoutMs});
 const timestamp=Math.floor(now()/1000);if(tokens.expires_at<=timestamp)fail('UNAVAILABLE');
 const observed=await requestFinanceAuthJson({input:{timestamp},options:{fetchImpl:bounded,now,timeoutMs},prefix:'FINANCE_INCOME_OVERVIEW',maximumBodyBytes:65536,buildRequest:async()=>{
  const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(String(FINANCE_PROFILE.partner_id)+path+timestamp+tokens.access_token+FINANCE_PROFILE.shop_id)))].map(byte=>byte.toString(16).padStart(2,'0')).join(''),url=new URL(path,origin);
  for(const [name,value] of Object.entries({partner_id:FINANCE_PROFILE.partner_id,shop_id:FINANCE_PROFILE.shop_id,timestamp,access_token:tokens.access_token,sign:signature}))url.searchParams.set(name,String(value));
  return new Request(url,{method:'GET',redirect:'manual',headers:{Accept:'application/json'}});
 },normalizeResponse:envelope});
 const value={schema:'finance_income_overview_v1',checked_at:Math.max(checkedAt,Math.floor(now()/1000)),region:'BRAZIL',shop_type:'LOCAL',currency_basis:'FIXED_BRAZIL_SHOP_PROFILE',pending:{status:'PENDING',raw:observed.pending,cents:cents(observed.pending)},released:{status:'RELEASED',raw:observed.released,cents:cents(observed.released)},to_release:{status:'TO_RELEASE_NOT_APPLICABLE_LOCAL',raw:observed.toRelease,cents:cents(observed.toRelease)},basis:'CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH'};
 const frame=projectIncomeOverviewFrame(value);if(!frame)fail('RESULT_INVALID');return frame;
}
