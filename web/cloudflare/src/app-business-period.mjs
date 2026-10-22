import {projectBusinessPeriodRequest,projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';

// Only the fixed financial service can supply this private period frame. There
// is no caller-selected shop, provider URL, token, order serial or API path.
export async function getFinanceBusinessPeriod(env,input,{fetchImpl=request=>fetch(request),timeoutMs=45000}={}){
 const failure=()=>({schema:'finance_business_period_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_BUSINESS_UNAVAILABLE',http:null}});
 const body=projectBusinessPeriodRequest(input);
 if(!body||typeof env?.APP_INTERNAL_SECRET!=='string'||!env.APP_INTERNAL_SECRET||typeof fetchImpl!=='function'
   ||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>45000)return failure();
 const controller=new AbortController();let timer,reader,response;
 const cancel=()=>{try{(reader?reader.cancel():response?.body?.cancel())?.catch(()=>{});}catch{}};
 const checkDeadline=()=>{if(controller.signal.aborted){cancel();throw Error('deadline');}};
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();cancel();reject(Error('deadline'));},timeoutMs);});
 const run=async()=>{
  response=await fetchImpl(new Request('https://auth.brazacommerce.com.br/internal/shopee/finance/business-period',{
   method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-Braza-App-Key':env.APP_INTERNAL_SECRET},
   body:JSON.stringify(body),redirect:'manual',signal:controller.signal}));
  checkDeadline();
  if(!(response instanceof Response)||response.redirected||response.status!==200
    ||!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(response.headers.get('content-type')||''))return failure();
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>524288))return failure();
  if(!response.body)return failure();
  reader=response.body.getReader();const chunks=[];let length=0;
  try{while(true){checkDeadline();const chunk=await reader.read();checkDeadline();if(chunk.done)break;
   if(!(chunk.value instanceof Uint8Array))return failure();length+=chunk.value.byteLength;if(length>524288)return failure();chunks.push(chunk.value);}}
  finally{cancel();try{reader.releaseLock();}catch{}reader=undefined;}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return failure();}
  const frame=projectBusinessPeriodFrame(raw);
  if(!frame)return failure();
  if(body.operation==='start'?(frame.start_date!==body.start_date||frame.end_date!==body.end_date):frame.run_id!==body.run_id)return failure();
  return frame;
 };
 try{return await Promise.race([run(),deadline]);}
 catch{return failure();}
 finally{clearTimeout(timer);controller.abort();cancel();}
}
