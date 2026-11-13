import {projectBusinessPeriodRequest,projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {projectBusinessPeriodVariantsFrame} from '../../finance/src/business-variant-attribution.mjs';

// Only the fixed financial service can supply this private period frame. There
// is no caller-selected shop, provider URL, token, order serial or API path.
export async function getFinanceBusinessPeriod(env,input,options={}){
 const failure=(suffix='UNAVAILABLE',http=null)=>({schema:'finance_business_period_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_BUSINESS_'+suffix,http:Number.isInteger(http)&&http>=100&&http<=599?http:null}});
 let fetchImpl=env?.COMMERCIAL_FETCH??(request=>fetch(request)),timeoutMs=45000,includeVariants=false;
 try{
  if(options===null||typeof options!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(options)))return failure('CONFIGURATION');
  const keys=Reflect.ownKeys(options);if(!keys.every(key=>['fetchImpl','timeoutMs','includeVariants'].includes(key)))return failure('CONFIGURATION');
  for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(options,key);if(!descriptor||!Object.hasOwn(descriptor,'value'))return failure('CONFIGURATION');const value=descriptor.value;if(value===undefined)continue;if(key==='fetchImpl')fetchImpl=value;else if(key==='timeoutMs')timeoutMs=value;else includeVariants=value;}
 }catch{return failure('CONFIGURATION');}
 const body=projectBusinessPeriodRequest(input);
 if(!body||typeof env?.APP_INTERNAL_SECRET!=='string'||!env.APP_INTERNAL_SECRET||typeof fetchImpl!=='function'
   ||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>45000||typeof includeVariants!=='boolean')return failure('CONFIGURATION');
 const maximum=includeVariants?2097152:1048576;
 const controller=new AbortController();let timer,reader,response,stage='FETCH';
 const cancel=()=>{try{(reader?reader.cancel():response?.body?.cancel())?.catch(()=>{});}catch{}};
 const checkDeadline=()=>{if(controller.signal.aborted){cancel();throw Error('deadline');}};
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();cancel();reject(Error('deadline'));},timeoutMs);});
 const run=async()=>{
  response=await fetchImpl(new Request('https://auth.brazacommerce.com.br/internal/shopee/finance/business-period',{
   method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-Braza-App-Key':env.APP_INTERNAL_SECRET,'X-Braza-Daily-Contract':'daily-profit-v1',...(includeVariants?{'X-Braza-Business-Variants-Contract':'single-pair-v1'}:{})},
   body:JSON.stringify(body),redirect:'manual',signal:controller.signal}));
  checkDeadline();
  if(!(response instanceof Response))return failure('RESPONSE_INVALID');
  if(response.redirected||response.status>=300&&response.status<400)return failure('REDIRECT_REJECTED',response.status);
  if(response.status!==200)return failure('HTTP_ERROR',response.status);
  if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(response.headers.get('content-type')||''))return failure('CONTENT_TYPE_INVALID',response.status);
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))))return failure('RESPONSE_INVALID',response.status);
  if(declared!==null&&Number(declared)>maximum)return failure('BODY_LIMIT',response.status);
  if(!response.body)return failure('RESPONSE_INVALID',response.status);
  stage='BODY';
  reader=response.body.getReader();const chunks=[];let length=0;
  try{while(true){checkDeadline();const chunk=await reader.read();checkDeadline();if(chunk.done)break;
   if(!(chunk.value instanceof Uint8Array))return failure('RESPONSE_INVALID',response.status);length+=chunk.value.byteLength;if(length>maximum)return failure('BODY_LIMIT',response.status);chunks.push(chunk.value);}}
  finally{cancel();try{reader.releaseLock();}catch{}reader=undefined;}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return failure('JSON_INVALID',response.status);}
  const variants=includeVariants?await projectBusinessPeriodVariantsFrame(raw):null;
  checkDeadline();
  const frame=variants?.report??projectBusinessPeriodFrame(raw);
  if(!frame)return failure('FRAME_INVALID',response.status);
  if(includeVariants&&new TextEncoder().encode(JSON.stringify(frame)).byteLength>1048576)return failure('BODY_LIMIT',response.status);
  if(body.operation==='start'?(frame.start_date!==body.start_date||frame.end_date!==body.end_date):frame.run_id!==body.run_id)return failure('SCOPE_MISMATCH',response.status);
  return variants??frame;
 };
 try{return await Promise.race([run(),deadline]);}
 catch{return failure(controller.signal.aborted?'TIMEOUT':stage==='FETCH'?'NETWORK_ERROR':'BODY_READ_ERROR',response instanceof Response?response.status:null);}
 finally{clearTimeout(timer);controller.abort();cancel();}
}
