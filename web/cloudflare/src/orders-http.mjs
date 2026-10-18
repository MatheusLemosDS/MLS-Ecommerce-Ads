import {safeOrdersDiagnostic} from './orders-diagnostic.mjs';
// Used only by the orders path; legacy HTTP helpers remain unchanged.
export async function boundedOrdersRead(target,headers,timeoutMs,maxBytes=16384){
 let status=null;
 const failure=(code,upstream=null)=>({ok:false,status:status??502,http:status,body:null,failure_code:code,upstream_diagnostic:safeOrdersDiagnostic(upstream)});
 let signal;
 try{
  if(typeof AbortSignal==='undefined'||typeof AbortSignal.timeout!=='function')return failure('RUNTIME_UNSUPPORTED');
  signal=AbortSignal.timeout(timeoutMs);
  // workerd supports manual/follow, but rejects redirect:"error" before fetching.
  // Manual mode keeps credentials on this destination; non-200 is refused below.
  const response=await fetch(target,{method:'GET',headers,redirect:'manual',signal});
  status=response.status;
  const reader=response.body?.getReader();
  if(!reader)return failure(status===200?'INVALID_JSON':'HTTP_STATUS');
  const chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>maxBytes)return failure(status===200?'BODY_LIMIT':'HTTP_STATUS');chunks.push(value);}}finally{await reader.cancel();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let body;
  try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return failure(status===200?'INVALID_JSON':'HTTP_STATUS');}
  if(status!==200)return failure('HTTP_STATUS',['SHOP_ORDERS_UNAVAILABLE','SHOP_ORDER_ITEMS_UNAVAILABLE'].includes(body?.error)?body.diagnostic:null);
  return {ok:true,status:200,body};
 }catch{return failure(signal?.aborted?'TIMEOUT':'NETWORK_ERROR');}
}
