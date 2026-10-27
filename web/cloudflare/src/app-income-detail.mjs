import {projectIncomeDetailFrame} from '../../finance/src/income-detail-frame.mjs';

export async function getFinanceIncomeDetail(env,{fetchImpl=request=>fetch(request),timeoutMs=45000}={}){
 const failure=(suffix='UNAVAILABLE',http=null)=>({schema:'finance_income_detail_unavailable_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_INCOME_DETAIL_'+suffix,http:Number.isInteger(http)&&http>=100&&http<=599?http:null}});
 if(typeof env?.APP_INTERNAL_SECRET!=='string'||!env.APP_INTERNAL_SECRET||typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>45000)return failure('CONFIGURATION');
 const controller=new AbortController();let timer,reader,response,stage='FETCH';const cancel=()=>{try{(reader?reader.cancel():response?.body?.cancel())?.catch(()=>{});}catch{}};const check=()=>{if(controller.signal.aborted){cancel();throw Error('deadline');}};
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();cancel();reject(Error('deadline'));},timeoutMs);});
 const run=async()=>{
  response=await fetchImpl(new Request('https://auth.brazacommerce.com.br/internal/shopee/finance/income-detail',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-Braza-App-Key':env.APP_INTERNAL_SECRET},body:'{}',redirect:'manual',signal:controller.signal}));
  check();if(!(response instanceof Response))return failure('RESPONSE_INVALID');if(response.redirected||response.status>=300&&response.status<400)return failure('REDIRECT_REJECTED',response.status);if(response.status!==200)return failure('HTTP_ERROR',response.status);
  if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(response.headers.get('content-type')||''))return failure('CONTENT_TYPE_INVALID',response.status);
  const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>262144))return failure('BODY_LIMIT',response.status);if(!response.body)return failure('RESPONSE_INVALID',response.status);
  stage='BODY';reader=response.body.getReader();const chunks=[];let length=0;try{while(true){check();const chunk=await reader.read();check();if(chunk.done)break;if(!(chunk.value instanceof Uint8Array))return failure('RESPONSE_INVALID',response.status);length+=chunk.value.byteLength;if(length>262144)return failure('BODY_LIMIT',response.status);chunks.push(chunk.value);}}finally{cancel();try{reader.releaseLock();}catch{}reader=undefined;}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return failure('JSON_INVALID',response.status);}const frame=projectIncomeDetailFrame(raw);return frame??failure('FRAME_INVALID',response.status);
 };
 try{return await Promise.race([run(),deadline]);}catch{return failure(controller.signal.aborted?'TIMEOUT':stage==='FETCH'?'NETWORK_ERROR':'BODY_READ_ERROR',response instanceof Response?response.status:null);}finally{clearTimeout(timer);controller.abort();cancel();}
}
