import {ACCOUNT_BRIDGE_PATH,ACCOUNT_BRIDGE_REQUEST_LIMIT,ACCOUNT_BRIDGE_BODY_LIMIT,ACCOUNT_BRIDGE_RESPONSE_LIMIT,isCommercialAccountPath,projectAccountBridgeRequest,projectAccountBridgeResponse} from './commercial-account-frame.mjs';

function fail(code,status=503){return new Response(JSON.stringify({schema:'account_error_v1',error:code}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});}
async function bodyText(body,limit,signal){
 if(!body)return '';
 const reader=body.getReader(),chunks=[];let length=0;
 // Cancellation cannot depend on a peer settling its underlying cancel hook.
 const cancel=()=>{try{void reader.cancel().catch(()=>{});}catch{}};
 signal.addEventListener('abort',cancel,{once:true});
 try{for(;;){if(signal.aborted)throw Error();const row=await reader.read();if(signal.aborted)throw Error();if(row.done)break;if(!(row.value instanceof Uint8Array)||(length+=row.value.byteLength)>limit||chunks.length>=16384)throw Error();chunks.push(row.value);}}
 finally{signal.removeEventListener('abort',cancel);cancel();try{reader.releaseLock();}catch{}}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export function hasCommercialAccountCookie(req){return /(?:^|;\s*)__Host-mls_account=/.test(req.headers.get('cookie')||'');}
export async function accountBridgeCall(req,env,{operation='forward',selection=null,fetchImpl=value=>fetch(value),local=false,timeoutMs=20000}={}){
 let url;try{url=new URL(req.url);}catch{return fail('ACCOUNT_REQUEST_INVALID',400);}
 if(typeof env?.APP_INTERNAL_SECRET!=='string'||env.APP_INTERNAL_SECRET.length<32||typeof fetchImpl!=='function')return fail('ACCOUNT_SERVICE_CONFIGURATION');
 if(!Number.isInteger(timeoutMs)||timeoutMs<10||timeoutMs>45000)return fail('ACCOUNT_SERVICE_CONFIGURATION');
 const declared=req.headers.get('content-length');if(operation==='forward'&&declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>ACCOUNT_BRIDGE_BODY_LIMIT))return fail('ACCOUNT_BODY_TOO_LARGE',413);
 if(operation==='forward'&&!['GET'].includes(req.method)&&req.headers.get('origin')!==url.origin)return fail('ACCOUNT_ORIGIN_REJECTED',403);
 const headers={};for(const name of ['cookie','origin','content-type','x-csrf-token','user-agent','cf-connecting-ip']){const value=req.headers.get(name);if(value!==null)headers[name]=value;}
 const abort=new AbortController();let timer,res;
 // One deadline covers input, Auth transport and the complete res body.
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{reject(Error('ACCOUNT_SERVICE_TIMEOUT'));abort.abort();},timeoutMs);});
 try{
  const work=(async()=>{
   let body=null;try{if(operation==='forward'&&req.method!=='GET')body=await bodyText(req.body,ACCOUNT_BRIDGE_BODY_LIMIT,abort.signal);}catch(error){if(abort.signal.aborted)throw error;return fail('ACCOUNT_REQUEST_INVALID',400);}
   const input=projectAccountBridgeRequest({schema:'mls_account_bridge_request_v1',operation,origin:url.origin,path:url.pathname+url.search,method:req.method,headers,body,selection},{local});
   if(!input)return fail('ACCOUNT_REQUEST_INVALID',400);
   res=await fetchImpl(new Request('https://auth.brazacommerce.com.br'+ACCOUNT_BRIDGE_PATH,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','x-braza-app-key':env.APP_INTERNAL_SECRET},body:JSON.stringify(input),signal:abort.signal,redirect:'manual'}));
   if(!(res instanceof Response)||res.status!==200||res.redirected||!/^application\/json(?:;|$)/i.test(res.headers.get('content-type')||''))throw Error('ACCOUNT_SERVICE_UNAVAILABLE');
   const size=res.headers.get('content-length');if(size!==null&&(!/^\d+$/.test(size)||Number(size)>ACCOUNT_BRIDGE_RESPONSE_LIMIT+32768))throw Error('ACCOUNT_SERVICE_UNAVAILABLE');
   const value=projectAccountBridgeResponse(JSON.parse(await bodyText(res.body,ACCOUNT_BRIDGE_RESPONSE_LIMIT+32768,abort.signal)));
   if(!value)throw Error('ACCOUNT_SERVICE_RESPONSE_INVALID');
   const out=new Headers(value.headers);out.set('cache-control','private, no-store');out.set('referrer-policy','no-referrer');out.set('x-content-type-options','nosniff');
   return new Response([204,304].includes(value.status)?null:value.body,{status:value.status,headers:out});
  })();
  return await Promise.race([work,deadline]);
 }catch(error){return fail(abort.signal.aborted?'ACCOUNT_SERVICE_TIMEOUT':'ACCOUNT_SERVICE_UNAVAILABLE');}
 finally{clearTimeout(timer);abort.abort();try{void res?.body?.cancel().catch(()=>{});}catch{}}
}
export async function forwardCommercialAccount(req,env,options={}){
 if(!isCommercialAccountPath(new URL(req.url).pathname))return null;
 return accountBridgeCall(req,env,options);
}
export async function resolveAccountViaGateway(req,env,selection,options={}){
 const res=await accountBridgeCall(req,env,{...options,operation:'resolve',selection});
 let value;try{value=await res.json();}catch{throw Object.assign(Error('ACCOUNT_SERVICE_UNAVAILABLE'),{status:503});}
 if(res.status!==200)throw Object.assign(Error(typeof value?.error==='string'?value.error:'ACCOUNT_UNAUTHORIZED'),{status:res.status});
 if(value?.schema!=='commercial_principal_v1'||value.principal?.kind!=='account')throw Object.assign(Error('ACCOUNT_SERVICE_RESPONSE_INVALID'),{status:503});
 return value.principal;
}
