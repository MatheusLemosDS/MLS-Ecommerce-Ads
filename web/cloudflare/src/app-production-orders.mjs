import {projectProductionOrdersRequest,projectProductionOrdersFrame,productionOrdersRequestMatches} from '../../finance/src/production-orders-frame.mjs';

export async function getFinanceProductionOrders(env,input,{fetchImpl=request=>fetch(request),timeoutMs=45000}={}){
 const failure=()=>({schema:'production_orders_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_PRODUCTION_UNAVAILABLE',http:null}}),body=projectProductionOrdersRequest(input);
 if(!body||typeof env?.APP_INTERNAL_SECRET!=='string'||!env.APP_INTERNAL_SECRET||typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>45000)return failure();
 const controller=new AbortController();let reader,response,timer;
 const cancel=()=>{try{(reader?reader.cancel():response?.body?.cancel())?.catch(()=>{});}catch{}};
 const check=()=>{if(controller.signal.aborted){cancel();throw Error('deadline');}};
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();cancel();reject(Error('deadline'));},timeoutMs);});
 const work=async()=>{
  response=await fetchImpl(new Request('https://auth.brazacommerce.com.br/internal/shopee/finance/production-orders',{method:'POST',headers:{'content-type':'application/json',accept:'application/json','X-Braza-App-Key':env.APP_INTERNAL_SECRET},body:JSON.stringify(body),redirect:'manual',signal:controller.signal}));
  check();if(!(response instanceof Response)||response.status!==200||response.redirected||!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(response.headers.get('content-type')||''))return failure();
  const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>1048576)||!response.body)return failure();
  reader=response.body.getReader();const chunks=[];let length=0;
  try{while(true){check();const chunk=await reader.read();check();if(chunk.done)break;if(!(chunk.value instanceof Uint8Array))return failure();length+=chunk.value.byteLength;if(length>1048576)return failure();chunks.push(chunk.value);}}
  finally{cancel();try{reader.releaseLock();}catch{}reader=undefined;}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const frame=projectProductionOrdersFrame(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  return frame&&productionOrdersRequestMatches(body,frame)?frame:failure();
 };
 try{return await Promise.race([work(),deadline]);}catch{return failure();}finally{clearTimeout(timer);controller.abort();cancel();}
}
