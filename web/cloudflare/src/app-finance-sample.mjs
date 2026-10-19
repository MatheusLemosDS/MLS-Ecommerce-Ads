import {projectFinanceSample,financeSampleDiagnostic} from './finance-sample-frame.mjs';

// Explicit admin action only. No cookies, caller paths or order identifiers.
export async function getFinancePaymentSample(env,{fetchImpl=request=>fetch(request),timeoutMs=45000}={}){
 const failure=(code,http=null)=>({schema_version:1,status:'UNAVAILABLE',diagnostic:financeSampleDiagnostic({code,http})});
 if(typeof env.APP_INTERNAL_SECRET!=='string'||!env.APP_INTERNAL_SECRET||typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>45000)return failure('FINANCE_SAMPLE_APP_CONFIGURATION');
 const controller=new AbortController();let timer,reader,response;
 const cancel=()=>{try{(reader?reader.cancel():response?.body?.cancel())?.catch(()=>{});}catch{}};
 const checkDeadline=()=>{if(controller.signal.aborted){cancel();throw Error('deadline');}};
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{reject(Error('deadline'));controller.abort();cancel();},timeoutMs);});
 const run=async()=>{
  response=await fetchImpl(new Request('https://auth.brazacommerce.com.br/internal/shopee/finance/payment-sample',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-Braza-App-Key':env.APP_INTERNAL_SECRET},body:'{}',redirect:'manual',signal:controller.signal}));
  checkDeadline();
  if(!(response instanceof Response)||response.redirected||!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(response.headers.get('content-type')||''))return failure('FINANCE_SAMPLE_APP_RESPONSE_INVALID');
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>65536))return failure('FINANCE_SAMPLE_APP_RESPONSE_INVALID');
  if(!response.body)return failure('FINANCE_SAMPLE_APP_RESPONSE_INVALID');
  reader=response.body.getReader();const chunks=[];let length=0;
  try{while(true){checkDeadline();const chunk=await reader.read();checkDeadline();if(chunk.done)break;if(!(chunk.value instanceof Uint8Array))return failure('FINANCE_SAMPLE_APP_RESPONSE_INVALID');length+=chunk.value.byteLength;if(length>65536)return failure('FINANCE_SAMPLE_APP_RESPONSE_INVALID');chunks.push(chunk.value);}}
  finally{cancel();try{reader.releaseLock();}catch{}reader=undefined;}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return failure('FINANCE_SAMPLE_APP_RESPONSE_INVALID');}
  if(response.status!==200)return failure(raw?.error==='FINANCE_SAMPLE_UNAVAILABLE'?raw?.diagnostic?.code:'FINANCE_SAMPLE_UNAVAILABLE',raw?.error==='FINANCE_SAMPLE_UNAVAILABLE'?raw?.diagnostic?.http:response.status);
  return projectFinanceSample(raw);
 };
 try{return await Promise.race([run(),deadline]);}
 catch{return failure(controller.signal.aborted?'FINANCE_SAMPLE_APP_TIMEOUT':'FINANCE_SAMPLE_APP_UPSTREAM_FAILED');}
 finally{clearTimeout(timer);controller.abort();cancel();}
}
