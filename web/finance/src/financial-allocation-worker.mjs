import {isCommercialContext} from '../../cloudflare/src/commercial-context.mjs';
import {tenantDatabaseHasContext} from '../../cloudflare/src/tenant-storage.mjs';
import {FinancialCashAllocationError,financialAllocationScope} from './financial-cash-allocation.mjs';
import {createFinancialCashAllocationStore} from '../../cloudflare/src/financial-cash-allocation-store.mjs';
import {isFinancialObligationRecordId,resolveFinancialObligationRecords,financialObligationRecordGuards} from './financial-obligation-worker.mjs';
import {readExternalCashStorageContext} from './external-cash-store.mjs';
import {FINANCIAL_ALLOCATION_PATH,FINANCIAL_ALLOCATION_REQUEST_MAXIMUM,FINANCIAL_ALLOCATION_RESPONSE_MAXIMUM,projectFinancialAllocationRequest,projectFinancialAllocationResponse,financialAllocationResponseMatches} from './financial-allocation-frame.mjs';

export {FINANCIAL_ALLOCATION_PATH,FINANCIAL_ALLOCATION_REQUEST_MAXIMUM,FINANCIAL_ALLOCATION_RESPONSE_MAXIMUM};
const ORIGIN='https://auth.brazacommerce.com.br';
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; frame-ancestors 'none'"};
const own=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
const fail=(code,status=503)=>{throw new FinancialCashAllocationError(code,status);};
function errorResponse(error){
 const valid=error instanceof FinancialCashAllocationError&&/^FINANCIAL_CASH_[A-Z_]{2,70}$/.test(error.code),code=valid?error.code:'FINANCIAL_CASH_UNAVAILABLE';
 const status=valid&&[400,403,404,405,409,413,503].includes(error.status)?error.status:503;
 return new Response(JSON.stringify({schema:'financial_cash_error_v1',error:code}),{status,headers:HEADERS});
}
async function routerAuthorized(request,env){
 const expected=env?.FINANCE_ROUTER_SECRET,provided=request.headers.get('x-braza-finance-router');
 if(typeof expected!=='string'||! /^[\x21-\x7e]{32,256}$/.test(expected))fail('CONFIGURATION');
 if(typeof provided!=='string'||provided.length>256)fail('FORBIDDEN',403);
 const a=await hash(expected),b=await hash(provided);let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);if(mismatch)fail('FORBIDDEN',403);
}
async function readCommand(request){
 const type=request.headers.get('content-type')??'',size=request.headers.get('content-length');
 if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(type)||!request.body)fail('REQUEST_INVALID',400);
 if(size!==null&&(!/^(0|[1-9][0-9]*)$/.test(size)||!Number.isSafeInteger(Number(size))))fail('REQUEST_INVALID',400);
 if(size!==null&&Number(size)>FINANCIAL_ALLOCATION_REQUEST_MAXIMUM)fail('BODY_TOO_LARGE',413);
 const reader=request.body.getReader();let timer;
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(new FinancialCashAllocationError('REQUEST_TIMEOUT',400));},5000);});
 try{return await Promise.race([(async()=>{let total=0;const chunks=[];for(;;){const part=await reader.read();if(part.done)break;if(!(part.value instanceof Uint8Array)||chunks.length>=1024)fail('REQUEST_INVALID',400);total+=part.value.byteLength;if(total>FINANCIAL_ALLOCATION_REQUEST_MAXIMUM)fail('BODY_TOO_LARGE',413);chunks.push(part.value);}const bytes=new Uint8Array(total);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}let input;try{input=projectFinancialAllocationRequest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}catch{fail('REQUEST_INVALID',400);}if(!input)fail('REQUEST_INVALID',400);return input;})(),deadline]);}
 finally{clearTimeout(timer);try{void reader.cancel().catch(()=>{});reader.releaseLock();}catch{}}
}
function trustedScope(env){
 const context=env.COMMERCIAL_CONTEXT;
 if(context!==undefined&&context!==null){if(!isCommercialContext(context)||!tenantDatabaseHasContext(env.FINANCE_DB,context,{domain:'finance'}))fail('FORBIDDEN',403);return financialAllocationScope({organization_id:context.organizationId,store_id:context.storeId,currency:'BRL'});}
 // This mapper addresses only the existing deployment's legacy store. It is
 // never assigned to a newly registered company or selected by a request body.
 return financialAllocationScope({organization_id:'legacy-brazacommerce',store_id:'legacy-shopee',currency:'BRL'});
}
/** Existing imported rows are immutable, scoped evidence, not verified balances. */
export async function resolveFinancialAllocationCashRecords(env,ids,{scope,storageContext,now=Date.now}={}){
 const context=storageContext??await readExternalCashStorageContext(env),selected=financialAllocationScope(scope);
 if(!Array.isArray(ids)||ids.length>220||ids.some(v=>typeof v!=='string'||! /^[a-f0-9]{64}$/.test(v)&&!isFinancialObligationRecordId(v)))fail('REQUEST_INVALID',400);
 const obligationIds=ids.filter(isFinancialObligationRecordId),obligations=obligationIds.length?await resolveFinancialObligationRecords(env,obligationIds,{scope:selected,now}):[];
 if(!context.schemaPresent)return obligations;
 const cashIds=ids.filter(v=>!isFinancialObligationRecordId(v));
 const rows=await context.db.prepare('SELECT record_id,source,date,amount_cents,currency,status,import_id FROM finance_external_cash_records WHERE tenant=? AND record_id IN(SELECT value FROM json_each(?)) ORDER BY record_id').bind(context.tenant,JSON.stringify(cashIds)).all();
 if(!Array.isArray(rows?.results))fail('STORAGE_INVALID');
 return [...obligations,...rows.results.map(row=>{
  if(!['NUBANK','SHOPEE'].includes(row.source)||row.currency!=='BRL'||!Number.isSafeInteger(row.amount_cents)||typeof row.import_id!=='string')fail('STORAGE_INVALID');
  return {...selected,record_id:row.record_id,revision:1,legacy_record_id:row.record_id,account_id:row.source==='NUBANK'?'legacy-nubank-imports':'shopee-transfer-imports',kind:row.source==='NUBANK'?'BANK_TRANSACTION':'TRANSFER',amount_cents:row.amount_cents,status:row.status,date:row.date,evidence_id:'cash-evidence:'+row.record_id,native_reference:null,identity_unique:false};
 })];
}
export function createFinancialAllocationWorker({authorize=null,resolveRecords=null,resolveAutomaticRule=null,now=Date.now}={}){
 if(authorize!==null&&typeof authorize!=='function'||resolveRecords!==null&&typeof resolveRecords!=='function'||resolveAutomaticRule!==null&&typeof resolveAutomaticRule!=='function'||typeof now!=='function')fail('CONFIGURATION');
 return {async fetch(request,env){
  try{
   let url;try{url=new URL(request.url);}catch{fail('REQUEST_INVALID',400);}
   if(url.origin!==ORIGIN||url.username||url.password||url.pathname!==FINANCIAL_ALLOCATION_PATH)fail('NOT_FOUND',404);
   if(request.method!=='POST')fail('METHOD_NOT_ALLOWED',405);if(url.search||url.hash||request.url.length>4096)fail('REQUEST_INVALID',400);
   await routerAuthorized(request,env);const command=await readCommand(request),scope=trustedScope(env),context=env.COMMERCIAL_CONTEXT;
   const required=['read','preview'].includes(command.operation)?'bank.read':'bank.write';
   const allowed=async phase=>{await routerAuthorized(request,env);if(context&&(!context.capabilities.includes(required)||!context.capabilities.includes('finance.read')))fail('FORBIDDEN',403);if(authorize!==null&&await authorize({env,request,scope,operation:command.operation,capability:required,phase})!==true)fail('AUTHORIZATION_REVOKED',403);return true;};
   await allowed('before-source');const storageContext=await readExternalCashStorageContext(env);await allowed('after-source');
   const store=createFinancialCashAllocationStore(storageContext.db,{scope,actor_id:context?.userId??'legacy-owner',authorize:({phase})=>allowed(phase),legacy_cash_tenant:storageContext.tenant,now,resolveRecords:ids=>resolveRecords===null?resolveFinancialAllocationCashRecords(env,ids,{scope,storageContext,now}):resolveRecords({env,ids,scope,storageContext}),guardRecords:records=>financialObligationRecordGuards(storageContext.db,records,{scope,now}),resolveAutomaticRule:resolveAutomaticRule===null?null:rule_id=>resolveAutomaticRule({env,scope,rule_id})});
   const {schema,operation,...body}=command;let result;
   if(operation==='read')result=await store.read(body);else if(operation==='preview')result=await store.preview(body);else if(operation==='confirm')result=await store.confirm(body);else result=await store.reverse(body);
   await allowed('before-response');const frame=projectFinancialAllocationResponse(result);if(!frame||!financialAllocationResponseMatches(command,frame))fail('RESPONSE_INVALID');
   const text=JSON.stringify(frame);if(new TextEncoder().encode(text).byteLength>FINANCIAL_ALLOCATION_RESPONSE_MAXIMUM)fail('RESPONSE_TOO_LARGE');return new Response(text,{headers:HEADERS});
  }catch(error){return errorResponse(error);}
 }};
}
