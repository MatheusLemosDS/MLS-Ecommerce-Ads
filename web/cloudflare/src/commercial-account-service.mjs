import {ACCOUNT_BRIDGE_PATH,ACCOUNT_BRIDGE_REQUEST_LIMIT,ACCOUNT_BRIDGE_RESPONSE_LIMIT,projectAccountBridgeRequest,projectAccountBridgeResponse} from './commercial-account-frame.mjs';
import {handleAccountRequest} from './account-worker.mjs';
import {resolveAccountSession,resolveCommercialPrincipal,requireAccount} from './account-service.mjs';
import {AccountError} from './account-store.mjs';
import {renderCommercialAccountPage,commercialAccountRoute} from './commercial-account-view.mjs';

const privateHeaders={'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
function innerError(error,status=503){return new Response(JSON.stringify({error}),{status,headers:privateHeaders});}
function publicPrincipal(p){
 const profile=p.profile===null?null:{partner_id:p.profile.partner_id,shop_id:p.profile.shop_id,environment:p.profile.environment,region:p.profile.region};
 return {kind:'account',userId:p.userId,organizationId:p.organizationId,storeId:p.storeId,sessionId:p.sessionId,membershipId:p.membershipId,role:p.role,capabilities:[...p.capabilities],authorizationRevision:p.authorizationRevision,sessionRevision:p.sessionRevision,userRevision:p.userRevision,membershipRevision:p.membershipRevision,storeRevision:p.storeRevision,organizationRevision:p.organizationRevision,profile,legacyCashTenant:p.legacyCashTenant??null,csrf:p.session.csrf,reauthenticatedAt:p.session.reauthenticated_at,organizationName:p.organization.name,storeName:p.store?.name??null,user:{...p.user}};
}
async function boundedText(stream,maximum,timeout=5000){
 const reader=stream?.getReader();if(!reader)return '';let timer,size=0;const chunks=[];
 const read=async()=>{for(;;){const row=await reader.read();if(row.done)break;size+=row.value.byteLength;if(size>maximum)throw new AccountError('ACCOUNT_BRIDGE_BODY_TOO_LARGE',413);chunks.push(row.value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);};
 try{return await Promise.race([read(),new Promise((_,reject)=>{timer=setTimeout(()=>{try{reader.cancel().catch(()=>{});}catch{}reject(new AccountError('ACCOUNT_BRIDGE_TIMEOUT',503));},timeout);})]);}finally{clearTimeout(timer);try{await reader.cancel();}catch{}}
}
async function framed(response){
 const headers={};for(const [name,value] of response.headers)headers[name]=value;
 const body=await boundedText(response.body,ACCOUNT_BRIDGE_RESPONSE_LIMIT),frame=projectAccountBridgeResponse({schema:'mls_account_bridge_response_v1',status:response.status,headers,body});
 if(!frame)return new Response(JSON.stringify({schema:'mls_account_bridge_response_v1',status:503,headers:privateHeaders,body:JSON.stringify({error:'ACCOUNT_BRIDGE_RESPONSE_INVALID'})}),{headers:privateHeaders});
 return new Response(JSON.stringify(frame),{status:200,headers:privateHeaders});
}
export async function handleCommercialAccountBridge(request,env,{validateInternalApp,local=false,now,...options}={}){
 let url;try{url=new URL(request.url);}catch{return null;}if(url.pathname!==ACCOUNT_BRIDGE_PATH)return null;
 try{
  if(url.origin!=='https://auth.brazacommerce.com.br'||url.search||url.hash)return framed(innerError('ACCOUNT_BRIDGE_REQUEST_INVALID',400));
  if(typeof validateInternalApp!=='function')return framed(innerError('ACCOUNT_BRIDGE_CONFIGURATION',503));
  if(!await validateInternalApp(request,env))return framed(innerError('ACCOUNT_BRIDGE_UNAUTHORIZED',401));
  if(request.method!=='POST')return framed(innerError('ACCOUNT_METHOD_NOT_ALLOWED',405));
  if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(request.headers.get('content-type')||''))return framed(innerError('ACCOUNT_JSON_REQUIRED',415));
  const declared=request.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>ACCOUNT_BRIDGE_REQUEST_LIMIT))return framed(innerError('ACCOUNT_BRIDGE_BODY_TOO_LARGE',413));
  let raw;try{raw=JSON.parse(await boundedText(request.body,ACCOUNT_BRIDGE_REQUEST_LIMIT));}catch(error){return framed(innerError(error instanceof AccountError?error.code:'ACCOUNT_BRIDGE_REQUEST_INVALID',error instanceof AccountError?error.status:400));}
  const input=projectAccountBridgeRequest(raw,{local});if(!input)return framed(innerError('ACCOUNT_BRIDGE_REQUEST_INVALID',400));
  const original=new Request(input.origin+input.path,{method:input.method,headers:input.headers,...(input.body===null?{}:{body:input.body})}),serviceOptions={...options,local,...(now?{now}:{}),publicOrigin:input.origin};
  if(input.operation==='resolve'){
   const p=await resolveCommercialPrincipal(original,env,{...serviceOptions,...input.selection});return framed(new Response(JSON.stringify({schema:'commercial_principal_v1',principal:publicPrincipal(p)}),{headers:privateHeaders}));
  }
  if(new URL(original.url).pathname.startsWith('/api/'))return framed(await handleAccountRequest(original,env,serviceOptions)??innerError('ACCOUNT_NOT_FOUND',404));
  const route=commercialAccountRoute(new URL(original.url).pathname);if(!route)return framed(innerError('ACCOUNT_NOT_FOUND',404));
  if(original.method!=='GET')return framed(innerError('ACCOUNT_METHOD_NOT_ALLOWED',405));
  const publicPages=['login','register','verify','forgot','reset','invitation'],ctx=await resolveAccountSession(original,env,serviceOptions);
  if(!publicPages.includes(route.page)){
   if(!ctx)return framed(new Response(null,{status:303,headers:{location:'/account/login','cache-control':'no-store'}}));
   if(ctx.user.state!=='ACTIVE')return framed(new Response(null,{status:303,headers:{location:'/verify-email','cache-control':'no-store'}}));
   requireAccount(ctx);
   if(route.company){const capability=route.page==='team'?'team.read':route.page==='stores'?'store.read':route.page==='billing'?'billing.read':route.page==='audit'?'audit.read':route.page==='data'?'organization.transfer':'organization.read';await resolveCommercialPrincipal(original,env,{...serviceOptions,organizationId:route.company,capability});}
  }
  return framed(renderCommercialAccountPage(original,options)??innerError('ACCOUNT_NOT_FOUND',404));
 }catch(error){return framed(innerError(error instanceof AccountError?error.code:typeof error?.code==='string'&&/^ACCOUNT_[A-Z_]+$/.test(error.code)?error.code:'ACCOUNT_BRIDGE_UNAVAILABLE',error instanceof AccountError?error.status:503));}
}
