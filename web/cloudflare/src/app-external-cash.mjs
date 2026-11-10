import {EXTERNAL_CASH_PATH,EXTERNAL_CASH_REQUEST_MAXIMUM,EXTERNAL_CASH_RESPONSE_MAXIMUM,projectExternalCashRequest,projectExternalCashResponse,externalCashResponseMatches,projectExternalCashError,externalCashErrorStatus} from '../../finance/src/external-cash-frame.mjs';

// This route accepts normalized file evidence only. Tenant and actor are derived
// privately by Finance; no browser-selected provider, account or URL is forwarded.
export async function getFinanceExternalCash(env,input,options={}){
 const failure=suffix=>({status:externalCashErrorStatus('FINANCE_EXTERNAL_CASH_'+suffix),body:{schema:'external_cash_error_v1',error:'FINANCE_EXTERNAL_CASH_'+suffix}});
 let fetchImpl=request=>fetch(request),timeoutMs=20000;
 try{
  if(!options||![Object.prototype,null].includes(Object.getPrototypeOf(options)))return failure('CONFIGURATION');
  for(const key of Reflect.ownKeys(options)){
   const descriptor=Object.getOwnPropertyDescriptor(options,key);
   if(!['fetchImpl','timeoutMs'].includes(key)||!descriptor||!Object.hasOwn(descriptor,'value'))return failure('CONFIGURATION');
   if(descriptor.value!==undefined){if(key==='fetchImpl')fetchImpl=descriptor.value;else timeoutMs=descriptor.value;}
  }
 }catch{return failure('CONFIGURATION');}
 const command=projectExternalCashRequest(input);
 if(!command)return failure('REQUEST_INVALID');
 if(typeof env?.APP_INTERNAL_SECRET!=='string'||!env.APP_INTERNAL_SECRET||typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>45000)return failure('CONFIGURATION');
 const body=JSON.stringify(command);
 if(new TextEncoder().encode(body).byteLength>EXTERNAL_CASH_REQUEST_MAXIMUM)return failure('BODY_TOO_LARGE');
 const controller=new AbortController();let timer,reader,response;
 const cancel=()=>{try{(reader?reader.cancel():response?.body?.cancel())?.catch(()=>{});}catch{}};
 const check=()=>{if(controller.signal.aborted){cancel();throw Error('deadline');}};
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();cancel();reject(Error('deadline'));},timeoutMs);});
 const run=async()=>{
  response=await fetchImpl(new Request('https://auth.brazacommerce.com.br'+EXTERNAL_CASH_PATH,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-Braza-App-Key':env.APP_INTERNAL_SECRET},body,redirect:'manual',signal:controller.signal}));check();
  if(!(response instanceof Response)||response.redirected||response.status>=300&&response.status<400||!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(response.headers.get('content-type')||''))return failure('UNAVAILABLE');
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>EXTERNAL_CASH_RESPONSE_MAXIMUM)||!response.body)return failure('UNAVAILABLE');
  reader=response.body.getReader();let size=0;const chunks=[];
  try{while(true){check();const chunk=await reader.read();check();if(chunk.done)break;if(!(chunk.value instanceof Uint8Array))return failure('UNAVAILABLE');size+=chunk.value.byteLength;if(size>EXTERNAL_CASH_RESPONSE_MAXIMUM)return failure('UNAVAILABLE');chunks.push(chunk.value);}}
  finally{cancel();try{reader.releaseLock();}catch{}reader=undefined;}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return failure('UNAVAILABLE');}
  if(response.status!==200){const error=projectExternalCashError(raw);return error&&externalCashErrorStatus(error.error)===response.status?{status:response.status,body:error}:failure('UNAVAILABLE');}
  const frame=projectExternalCashResponse(raw);
  return frame&&externalCashResponseMatches(command,frame)?{status:200,body:frame}:failure('UNAVAILABLE');
 };
 try{return await Promise.race([run(),deadline]);}catch{return failure(controller.signal.aborted?'TIMEOUT':'UNAVAILABLE');}
 finally{clearTimeout(timer);cancel();}
}
