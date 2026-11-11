import {FinanceConnectionError} from './connection-store.mjs';
import {EXTERNAL_CASH_PATH,EXTERNAL_CASH_REQUEST_MAXIMUM,EXTERNAL_CASH_RESPONSE_MAXIMUM,projectExternalCashRequest,projectExternalCashResponse,externalCashResponseMatches,externalCashErrorStatus} from './external-cash-frame.mjs';
import {EXTERNAL_CASH_PERIOD_PATH,EXTERNAL_CASH_PERIOD_REQUEST_MAXIMUM,EXTERNAL_CASH_PERIOD_RESPONSE_MAXIMUM,projectExternalCashPeriodRequest,projectExternalCashPeriodResponse,externalCashPeriodResponseMatches} from './external-cash-period-frame.mjs';

const ORIGIN='https://auth.brazacommerce.com.br';
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store, max-age=0','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; frame-ancestors 'none'"};
function failure(code='FINANCE_EXTERNAL_CASH_UNAVAILABLE'){
 const status=externalCashErrorStatus(code);return new Response(JSON.stringify({schema:'external_cash_error_v1',error:status===null?'FINANCE_EXTERNAL_CASH_UNAVAILABLE':code}),{status:status??502,headers:HEADERS});
}
async function trusted(request,env){
 const secret=env?.FINANCE_ROUTER_SECRET,actual=request.headers.get('X-Braza-Finance-Router');
 if(typeof secret!=='string'||! /^[\x21-\x7e]{32,256}$/.test(secret))return 'FINANCE_EXTERNAL_CASH_CONFIGURATION';
 if(typeof actual!=='string'||actual.length>256)return 'FINANCE_EXTERNAL_CASH_FORBIDDEN';
 const encoder=new TextEncoder(),[a,b]=await Promise.all([secret,actual].map(value=>crypto.subtle.digest('SHA-256',encoder.encode(value))));
 const left=new Uint8Array(a),right=new Uint8Array(b);let mismatch=0;for(let index=0;index<left.length;index++)mismatch|=left[index]^right[index];
 return mismatch?'FINANCE_EXTERNAL_CASH_FORBIDDEN':null;
}
async function readInput(request){
 const media=request.headers.get('content-type')||'',declared=request.headers.get('content-length');
 if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(media)||declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>EXTERNAL_CASH_REQUEST_MAXIMUM)||!request.body)return null;
 const reader=request.body.getReader();let timer;
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{try{reader.cancel().catch(()=>{});}catch{}reject(Error('DEADLINE'));},5000);});
 const read=async()=>{
  const chunks=[];let size=0;while(true){const chunk=await reader.read();if(chunk.done)break;if(!(chunk.value instanceof Uint8Array))return null;size+=chunk.value.byteLength;if(size>EXTERNAL_CASH_REQUEST_MAXIMUM)return null;chunks.push(chunk.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return projectExternalCashRequest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
 };
 try{return await Promise.race([read(),deadline]);}catch{return null;}finally{clearTimeout(timer);try{reader.cancel().catch(()=>{});}catch{}try{reader.releaseLock();}catch{}}
}

// No OAuth gate, provider transport, encryption key or caller-selected tenant.
export function createExternalCashWorker({readWorkspace,previewImport,mutate}={}){
 return {async fetch(request,env){
  let url;try{if(typeof request.url!=='string'||request.url.length>4096)return failure('FINANCE_EXTERNAL_CASH_REQUEST_INVALID');url=new URL(request.url);}catch{return failure('FINANCE_EXTERNAL_CASH_REQUEST_INVALID');}
  if(url.origin!==ORIGIN||url.username||url.password||url.hash||url.pathname!==EXTERNAL_CASH_PATH)return failure('FINANCE_EXTERNAL_CASH_NOT_FOUND');
  if(request.method!=='POST')return failure('FINANCE_EXTERNAL_CASH_METHOD_NOT_ALLOWED');
  if(url.search)return failure('FINANCE_EXTERNAL_CASH_REQUEST_INVALID');
  try{
   const denied=await trusted(request,env);if(denied)return failure(denied);
   const input=await readInput(request);if(!input)return failure('FINANCE_EXTERNAL_CASH_REQUEST_INVALID');
   const capability=input.operation==='read'?readWorkspace:input.operation==='preview'?previewImport:mutate;
   if(typeof capability!=='function')return failure('FINANCE_EXTERNAL_CASH_CONFIGURATION');
   const frame=projectExternalCashResponse(await capability(env,input));if(!frame||!externalCashResponseMatches(input,frame))return failure();
   const body=JSON.stringify(frame);if(new TextEncoder().encode(body).byteLength>EXTERNAL_CASH_RESPONSE_MAXIMUM)return failure();
   return new Response(body,{headers:HEADERS});
  }catch(error){return failure(error instanceof FinanceConnectionError&&externalCashErrorStatus(error.code)!==null?error.code:undefined);}
 }};
}

// A separate read capability: no legacy mutation operation can reach it.
export function createExternalCashPeriodWorker({readPeriodSummary}={}){
 return {async fetch(request,env){
  let url;try{if(typeof request.url!=='string'||request.url.length>4096)return failure('FINANCE_EXTERNAL_CASH_REQUEST_INVALID');url=new URL(request.url);}catch{return failure('FINANCE_EXTERNAL_CASH_REQUEST_INVALID');}
  if(url.origin!==ORIGIN||url.username||url.password||url.hash||url.pathname!==EXTERNAL_CASH_PERIOD_PATH)return failure('FINANCE_EXTERNAL_CASH_NOT_FOUND');
  if(request.method!=='POST')return failure('FINANCE_EXTERNAL_CASH_METHOD_NOT_ALLOWED');
  if(url.search)return failure('FINANCE_EXTERNAL_CASH_REQUEST_INVALID');
  try{
   const denied=await trusted(request,env);if(denied)return failure(denied);
   const media=request.headers.get('content-type')||'',declared=request.headers.get('content-length');
   if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(media)||declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>EXTERNAL_CASH_PERIOD_REQUEST_MAXIMUM)||!request.body)return failure('FINANCE_EXTERNAL_CASH_REQUEST_INVALID');
   const reader=request.body.getReader();let timer,input;
   const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{try{reader.cancel().catch(()=>{});}catch{}reject(Error('DEADLINE'));},5000);});
   const read=async()=>{
    const chunks=[];let size=0;while(true){const chunk=await reader.read();if(chunk.done)break;if(!(chunk.value instanceof Uint8Array)||chunks.length>=1024)return null;size+=chunk.value.byteLength;if(size>EXTERNAL_CASH_PERIOD_REQUEST_MAXIMUM)return null;chunks.push(chunk.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return projectExternalCashPeriodRequest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
   };
   try{input=await Promise.race([read(),deadline]);}catch{input=null;}finally{clearTimeout(timer);try{reader.cancel().catch(()=>{});}catch{}try{reader.releaseLock();}catch{}}
   if(!input)return failure('FINANCE_EXTERNAL_CASH_REQUEST_INVALID');
   if(typeof readPeriodSummary!=='function')return failure('FINANCE_EXTERNAL_CASH_CONFIGURATION');
   const frame=projectExternalCashPeriodResponse(await readPeriodSummary(env,input));if(!frame||!externalCashPeriodResponseMatches(input,frame))return failure();
   const body=JSON.stringify(frame);if(new TextEncoder().encode(body).byteLength>EXTERNAL_CASH_PERIOD_RESPONSE_MAXIMUM)return failure();
   return new Response(body,{headers:HEADERS});
  }catch(error){return failure(error instanceof FinanceConnectionError&&externalCashErrorStatus(error.code)!==null?error.code:undefined);}
 }};
}
