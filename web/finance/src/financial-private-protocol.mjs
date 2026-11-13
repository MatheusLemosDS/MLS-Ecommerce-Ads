import {FINANCIAL_SOURCE_PATH,FINANCIAL_SOURCE_REQUEST_MAXIMUM,FINANCIAL_SOURCE_RESPONSE_MAXIMUM,projectFinancialSourceRequest,projectFinancialSourceResponse,financialSourceResponseMatches} from './financial-source-frame.mjs';
import {FINANCIAL_ALLOCATION_PATH,FINANCIAL_ALLOCATION_REQUEST_MAXIMUM,FINANCIAL_ALLOCATION_RESPONSE_MAXIMUM,projectFinancialAllocationRequest,projectFinancialAllocationResponse,financialAllocationResponseMatches} from './financial-allocation-frame.mjs';
import {FINANCIAL_OBLIGATION_PATH,FINANCIAL_OBLIGATION_REQUEST_MAXIMUM,FINANCIAL_OBLIGATION_RESPONSE_MAXIMUM,projectFinancialObligationRequest,projectFinancialObligationResponse,financialObligationResponseMatches} from './financial-obligation-frame.mjs';

export function financialPrivateProtocol(kind){
 if(kind==='sources')return {path:FINANCIAL_SOURCE_PATH,requestMaximum:FINANCIAL_SOURCE_REQUEST_MAXIMUM,responseMaximum:FINANCIAL_SOURCE_RESPONSE_MAXIMUM,request:projectFinancialSourceRequest,response:projectFinancialSourceResponse};
 if(kind==='allocations')return {path:FINANCIAL_ALLOCATION_PATH,requestMaximum:FINANCIAL_ALLOCATION_REQUEST_MAXIMUM,responseMaximum:FINANCIAL_ALLOCATION_RESPONSE_MAXIMUM,request:projectFinancialAllocationRequest,response:projectFinancialAllocationResponse};
 if(kind==='obligations')return {path:FINANCIAL_OBLIGATION_PATH,requestMaximum:FINANCIAL_OBLIGATION_REQUEST_MAXIMUM,responseMaximum:FINANCIAL_OBLIGATION_RESPONSE_MAXIMUM,request:projectFinancialObligationRequest,response:projectFinancialObligationResponse};
 return null;
}
export function financialPrivateKind(path){return path===FINANCIAL_SOURCE_PATH?'sources':path===FINANCIAL_ALLOCATION_PATH?'allocations':path===FINANCIAL_OBLIGATION_PATH?'obligations':null;}
export async function readFinancialPrivateJson(response,maximum,signal){
 if(!(response instanceof Response)||response.redirected||!response.body||!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(response.headers.get('content-type')||''))throw Error('FINANCIAL_PRIVATE_RESPONSE_INVALID');
 const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>maximum))throw Error('FINANCIAL_PRIVATE_RESPONSE_LIMIT');
 const reader=response.body.getReader(),chunks=[];let size=0;const cancel=()=>{try{void reader.cancel().catch(()=>{});}catch{}};signal?.addEventListener('abort',cancel,{once:true});
 try{for(;;){if(signal?.aborted)throw Error('FINANCIAL_PRIVATE_TIMEOUT');const next=await reader.read();if(signal?.aborted)throw Error('FINANCIAL_PRIVATE_TIMEOUT');if(next.done)break;if(!(next.value instanceof Uint8Array)||(size+=next.value.byteLength)>maximum||chunks.length>=16384)throw Error('FINANCIAL_PRIVATE_RESPONSE_LIMIT');chunks.push(next.value);}const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 finally{signal?.removeEventListener('abort',cancel);cancel();try{reader.releaseLock();}catch{}}
}
export function financialPrivateResponseMatches(command,value){
 if(['financial_source_request_v1','financial_source_request_v2','financial_source_request_v3'].includes(command?.schema))return financialSourceResponseMatches(command,value);
 if(command?.schema==='financial_cash_allocation_request_v1')return financialAllocationResponseMatches(command,value);
 if(command?.schema==='financial_obligation_source_request_v1')return financialObligationResponseMatches(command,value);
 return false;
}
export function financialPrivateFailure(code='FINANCIAL_PRIVATE_UNAVAILABLE',status=503){return {status,body:{schema:'financial_private_error_v1',error:code}};}
export async function exchangeFinancialPrivate(target,protocol,command,{send,headers,timeoutMs=20000}={}){
 if(!protocol||typeof send!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<5||timeoutMs>45000)return financialPrivateFailure('FINANCIAL_PRIVATE_CONFIGURATION');
 const input=protocol.request(command);if(!input)return financialPrivateFailure('FINANCIAL_PRIVATE_REQUEST_INVALID',400);
 const body=JSON.stringify(input);if(new TextEncoder().encode(body).byteLength>protocol.requestMaximum)return financialPrivateFailure('FINANCIAL_PRIVATE_REQUEST_LIMIT',413);
 const controller=new AbortController();let response,timer;
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();try{void response?.body?.cancel()?.catch(()=>{});}catch{}reject(Error('FINANCIAL_PRIVATE_TIMEOUT'));},timeoutMs);});
 try{return await Promise.race([(async()=>{
  response=await send(new Request(target,{method:'POST',headers:{'content-type':'application/json','accept':'application/json',...headers},body,redirect:'manual',signal:controller.signal}));
  const raw=await readFinancialPrivateJson(response,protocol.responseMaximum,controller.signal);
  if(response.status!==200){const code=typeof raw?.error==='string'&&/^(?:FINANCIAL|FINANCE|COMMERCIAL|TENANT)_[A-Z_]{1,100}$/.test(raw.error)?raw.error:'FINANCIAL_PRIVATE_UNAVAILABLE';return financialPrivateFailure(code,[400,401,403,404,409,413,429,502,503,504].includes(response.status)?response.status:502);}
  const frame=protocol.response(raw);return frame&&financialPrivateResponseMatches(input,frame)?{status:200,body:frame}:financialPrivateFailure('FINANCIAL_PRIVATE_RESPONSE_INVALID',502);
 })(),deadline]);}catch{return financialPrivateFailure(controller.signal.aborted?'FINANCIAL_PRIVATE_TIMEOUT':'FINANCIAL_PRIVATE_UNAVAILABLE',controller.signal.aborted?504:502);}
 finally{clearTimeout(timer);try{void response?.body?.cancel()?.catch(()=>{});}catch{}}
}
