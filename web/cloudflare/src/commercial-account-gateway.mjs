import {ACCOUNT_BRIDGE_PATH,ACCOUNT_BRIDGE_REQUEST_LIMIT,ACCOUNT_BRIDGE_BODY_LIMIT,ACCOUNT_BRIDGE_RESPONSE_LIMIT,isCommercialAccountPath,projectAccountBridgeRequest,projectAccountBridgeResponse} from './commercial-account-frame.mjs';

function accountGatewayFailure(code,status=503){return new Response(JSON.stringify({schema:'account_error_v1',error:code}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});}
async function accountGatewayText(body,limit){
 if(!body)return '';
 const reader=body.getReader(),chunks=[];let length=0;
 try{for(;;){const row=await reader.read();if(row.done)break;length+=row.value.byteLength;if(length>limit)throw Error('ACCOUNT_BODY_TOO_LARGE');chunks.push(row.value);}}
 finally{try{await reader.cancel();}catch{}reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export function hasCommercialAccountCookie(request){return /(?:^|;\s*)__Host-mls_account=/.test(request.headers.get('cookie')||'');}
export async function accountBridgeCall(request,env,{operation='forward',selection=null,fetchImpl=value=>fetch(value),local=false,timeoutMs=20000}={}){
 let url;try{url=new URL(request.url);}catch{return accountGatewayFailure('ACCOUNT_REQUEST_INVALID',400);}
 if(typeof env?.APP_INTERNAL_SECRET!=='string'||env.APP_INTERNAL_SECRET.length<32||typeof fetchImpl!=='function')return accountGatewayFailure('ACCOUNT_SERVICE_CONFIGURATION');
 if(!Number.isInteger(timeoutMs)||timeoutMs<10||timeoutMs>45000)return accountGatewayFailure('ACCOUNT_SERVICE_CONFIGURATION');
 const declared=request.headers.get('content-length');if(operation==='forward'&&declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>ACCOUNT_BRIDGE_BODY_LIMIT))return accountGatewayFailure('ACCOUNT_BODY_TOO_LARGE',413);
 if(operation==='forward'&&!['GET'].includes(request.method)&&request.headers.get('origin')!==url.origin)return accountGatewayFailure('ACCOUNT_ORIGIN_REJECTED',403);
 const headers={};for(const name of ['cookie','origin','content-type','x-csrf-token','user-agent','cf-connecting-ip']){const value=request.headers.get(name);if(value!==null)headers[name]=value;}
 let body=null;try{if(operation==='forward'&&request.method!=='GET')body=await accountGatewayText(request.body,ACCOUNT_BRIDGE_BODY_LIMIT);}catch{return accountGatewayFailure('ACCOUNT_REQUEST_INVALID',400);}
 const input=projectAccountBridgeRequest({schema:'mls_account_bridge_request_v1',operation,origin:url.origin,path:url.pathname+url.search,method:request.method,headers,body,selection},{local});
 if(!input)return accountGatewayFailure('ACCOUNT_REQUEST_INVALID',400);
 const controller=new AbortController();let timer,response;
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('ACCOUNT_SERVICE_TIMEOUT'));},timeoutMs);});
 try{
  const work=(async()=>{
   response=await fetchImpl(new Request('https://auth.brazacommerce.com.br'+ACCOUNT_BRIDGE_PATH,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','x-braza-app-key':env.APP_INTERNAL_SECRET},body:JSON.stringify(input),signal:controller.signal,redirect:'manual'}));
   if(!(response instanceof Response)||response.status!==200||response.redirected||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||''))throw Error('ACCOUNT_SERVICE_UNAVAILABLE');
   const size=response.headers.get('content-length');if(size!==null&&(!/^\d+$/.test(size)||Number(size)>ACCOUNT_BRIDGE_RESPONSE_LIMIT+32768))throw Error('ACCOUNT_SERVICE_UNAVAILABLE');
   const projected=projectAccountBridgeResponse(JSON.parse(await accountGatewayText(response.body,ACCOUNT_BRIDGE_RESPONSE_LIMIT+32768)));
   if(!projected)throw Error('ACCOUNT_SERVICE_RESPONSE_INVALID');
   const outputHeaders=new Headers(projected.headers);outputHeaders.set('cache-control','private, no-store');outputHeaders.set('referrer-policy','no-referrer');outputHeaders.set('x-content-type-options','nosniff');
   return new Response([204,304].includes(projected.status)?null:projected.body,{status:projected.status,headers:outputHeaders});
  })();
  return await Promise.race([work,deadline]);
 }catch(error){try{response?.body?.cancel().catch(()=>{});}catch{}return accountGatewayFailure(controller.signal.aborted?'ACCOUNT_SERVICE_TIMEOUT':'ACCOUNT_SERVICE_UNAVAILABLE');}
 finally{clearTimeout(timer);controller.abort();}
}
export async function forwardCommercialAccount(request,env,options={}){
 if(!isCommercialAccountPath(new URL(request.url).pathname))return null;
 return accountBridgeCall(request,env,options);
}
export async function resolveAccountViaGateway(request,env,selection,options={}){
 const response=await accountBridgeCall(request,env,{...options,operation:'resolve',selection});
 let value;try{value=await response.json();}catch{throw Object.assign(Error('ACCOUNT_SERVICE_UNAVAILABLE'),{status:503});}
 if(response.status!==200)throw Object.assign(Error(typeof value?.error==='string'?value.error:'ACCOUNT_UNAUTHORIZED'),{status:response.status});
 if(value?.schema!=='commercial_principal_v1'||value.principal?.kind!=='account')throw Object.assign(Error('ACCOUNT_SERVICE_RESPONSE_INVALID'),{status:503});
 return value.principal;
}
