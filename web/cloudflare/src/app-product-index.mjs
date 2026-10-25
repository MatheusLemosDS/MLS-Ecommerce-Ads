import {projectProductIndexRequest,projectProductIndexFrame,productIndexRequestMatches} from '../../finance/src/product-index-frame.mjs';

export async function getFinanceProductIndex(env,input,{fetchImpl=request=>fetch(request),timeoutMs=45000}={}){
 const requestBody=projectProductIndexRequest(input),failure=(code,http=null)=>({schema:'product_index_v1',status:'UNAVAILABLE',diagnostic:{code,http}});
 if(!requestBody||typeof env?.APP_INTERNAL_SECRET!=='string'||!env.APP_INTERNAL_SECRET||typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>45000)return failure('FINANCE_PRODUCT_INDEX_APP_CONFIGURATION');
 const controller=new AbortController();let timer,response,reader;
 const cancel=()=>{try{(reader?reader.cancel():response?.body?.cancel())?.catch(()=>{});}catch{}};
 const check=()=>{if(controller.signal.aborted){cancel();throw Error('deadline');}};
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();cancel();reject(Error('deadline'));},timeoutMs);});
 const run=async()=>{
  response=await fetchImpl(new Request('https://auth.brazacommerce.com.br/internal/shopee/finance/product-index',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-Braza-App-Key':env.APP_INTERNAL_SECRET},body:JSON.stringify(requestBody),redirect:'manual',signal:controller.signal}));check();
  if(!(response instanceof Response)||response.redirected||!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(response.headers.get('content-type')||''))return failure('FINANCE_PRODUCT_INDEX_APP_RESPONSE_INVALID');
  const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>32768)||!response.body)return failure('FINANCE_PRODUCT_INDEX_APP_RESPONSE_INVALID');
  reader=response.body.getReader();const chunks=[];let length=0;
  try{while(true){check();const piece=await reader.read();check();if(piece.done)break;if(!(piece.value instanceof Uint8Array))return failure('FINANCE_PRODUCT_INDEX_APP_RESPONSE_INVALID');length+=piece.value.byteLength;if(length>32768)return failure('FINANCE_PRODUCT_INDEX_APP_RESPONSE_INVALID');chunks.push(piece.value);}}
  finally{cancel();try{reader.releaseLock();}catch{}reader=undefined;}
  const raw=new Uint8Array(length);let offset=0;for(const piece of chunks){raw.set(piece,offset);offset+=piece.length;}
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{return failure('FINANCE_PRODUCT_INDEX_APP_RESPONSE_INVALID');}
  if(response.status!==200)return failure('FINANCE_PRODUCT_INDEX_APP_HTTP_ERROR',response.status);
  const frame=projectProductIndexFrame(value);return frame&&productIndexRequestMatches(requestBody,frame)?frame:failure('FINANCE_PRODUCT_INDEX_APP_RESPONSE_INVALID');
 };
 try{return await Promise.race([run(),deadline]);}catch{return failure(controller.signal.aborted?'FINANCE_PRODUCT_INDEX_APP_TIMEOUT':'FINANCE_PRODUCT_INDEX_APP_UPSTREAM_FAILED');}finally{clearTimeout(timer);controller.abort();cancel();}
}
