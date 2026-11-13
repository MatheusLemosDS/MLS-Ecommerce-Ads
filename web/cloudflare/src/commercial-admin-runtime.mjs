import {hasCommercialAccountCookie,forwardCommercialAccount,resolveAccountViaGateway} from './commercial-account-gateway.mjs';
import {commercialContextFromPrincipal,bindCommercialEnvironment,finalizeCommercialResponse} from './commercial-context.mjs';
import {tenantAuthorizationGuard} from './commercial-authorization.mjs';
import {forwardTenantEnvelope} from './tenant-envelope.mjs';
import {commercialFinanceCapability} from './commercial-finance-capability.mjs';
import {prepareCommercialWorkspace,assertCommercialWorkspaceReady} from './commercial-workspace-setup.mjs';
import {commercialRouteCapabilities,commercialTabAllowed} from './commercial-route-policy.mjs';

const sessions=new WeakMap();
const failure=(code,status=403)=>{throw Object.assign(Error(code),{code,status});};
export function commercialCurrentSession(env){return sessions.get(env)??null;}
export function commercialOwnerAction(current){return current?.role==='owner'||current?.kind==='account';}
function selection(request){
 const url=new URL(request.url),read=(query,header)=>{
  const values=url.searchParams.getAll(query),value=request.headers.get(header);
  if(values.length>1||values.length===1&&value!==null&&value!==values[0])failure('ACCOUNT_CONTEXT_INVALID',400);
  const result=values[0]??value??null;
  if(result!==null&&!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(result))failure('ACCOUNT_CONTEXT_INVALID',400);
  return result;
 };
 return {organizationId:read('company','x-mls-company'),storeId:read('store','x-mls-store')};
}
export async function beginCommercialAdminRequest(request,env,{fetchImpl=value=>fetch(value),local=false,schema=null}={}){
 const forwarded=await forwardCommercialAccount(request,env,{fetchImpl,local});
 if(forwarded){const path=new URL(request.url).pathname;if(request.method==='POST'&&['/api/account/login','/api/account/logout','/api/account/mfa/challenge'].includes(path)&&forwarded.ok){const headers=new Headers(forwarded.headers);for(const name of ['braza_admin','mls_session'])headers.append('set-cookie',name+'=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');return {response:new Response(forwarded.body,{status:forwarded.status,headers})};}return {response:forwarded};}
 if(!hasCommercialAccountCookie(request))return null;
 const url=new URL(request.url),path=url.pathname;
 // Explicit legacy sign-in is retained; the caller clears the personal cookie
 // only after a successful legacy authentication. Private bridge/asset paths
 // never become an alternative commercial authentication mechanism.
 if(['/login','/admin/login'].includes(path))return null;
 if(path==='/'&&request.method==='GET')return {response:new Response(null,{status:303,headers:{location:'/companies','cache-control':'no-store'}})};
 if(['/logout','/admin/logout'].includes(path)){
  if(request.method==='GET')return {response:new Response(null,{status:303,headers:{location:'/account/security','cache-control':'no-store'}})};
  const target=new Request(url.origin+'/api/account/logout',request);
  const response=await forwardCommercialAccount(target,env,{fetchImpl,local});if(!response.ok)return {response};const headers=new Headers(response.headers);for(const name of ['braza_admin','mls_session'])headers.append('set-cookie',name+'=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');return {response:new Response(response.body,{status:response.status,headers})};
 }
 if(!['/admin','/dashboard','/campaigns','/optimization','/integrations'].includes(path)&&!path.startsWith('/api/admin/'))failure('ACCOUNT_ROUTE_FORBIDDEN');
 const required=path==='/admin'?['store.read']:path.startsWith('/api/admin/')?await commercialRouteCapabilities(request,path):['ads.read'];
 if(!required?.length)failure('ACCOUNT_ROUTE_FORBIDDEN');
 const selected=selection(request),capability=required[0],resolve=(original,originalEnv)=>resolveAccountViaGateway(original,originalEnv,{...selected,capability},{fetchImpl,local});
 const principal=await resolve(request,env);
 if(!principal.storeId){if(!path.startsWith('/api/'))return {response:new Response(null,{status:303,headers:{location:'/companies','cache-control':'no-store'}})};failure('ACCOUNT_STORE_SELECTION_REQUIRED',409);}
 if(required.some(cap=>!principal.capabilities.includes(cap)))failure('ACCOUNT_FORBIDDEN');
 if(path==='/admin'&&!commercialTabAllowed(principal,url.searchParams.get('tab')||'overview'))failure('ACCOUNT_PANEL_FORBIDDEN');
 const context=await commercialContextFromPrincipal(principal,{requiredCapability:capability});
 const scoped=bindCommercialEnvironment(env,context,{authorizationGuard:()=>tenantAuthorizationGuard(principal,capability)});
 // A per-request closure signs the actual private target/body. Never install a
 // mutable process-global fetch, accept a browser envelope, or forward to a
 // request-selected service URL.
 const commercialFetch=async (value,init)=>{
  const target=new Request(value,init),u=new URL(target.url);
  if(u.origin!=='https://auth.brazacommerce.com.br')failure('COMMERCIAL_CONNECTOR_NOT_CONFIGURED',409);
  const targetCapability=await commercialFinanceCapability(target),targetContext=await commercialContextFromPrincipal(principal,{requiredCapability:targetCapability});
  return fetchImpl(await forwardTenantEnvelope(target,targetContext,{secret:env.APP_INTERNAL_SECRET,issuer:'app',audience:'auth'}));
 };
 const environment=Object.freeze({...scoped,COMMERCIAL_FETCH:commercialFetch,COMMERCIAL_PREPARE:options=>prepareCommercialWorkspace(scoped,env,principal,schema,options),COMMERCIAL_SETUP_READY:()=>assertCommercialWorkspaceReady(scoped,env,principal,schema)});
 sessions.set(environment,Object.freeze({...principal,user:principal.userId,csrf:principal.csrf,context}));
 return {env:environment,current:commercialCurrentSession(environment),context,finish:response=>finalizeCommercialResponse(request,env,context,response,{resolvePrincipal:resolve})};
}
export function commercialRuntimeError(error){
 const code=typeof error?.code==='string'&&/^(?:ACCOUNT|COMMERCIAL|TENANT)_[A-Z_]{1,100}$/.test(error.code)?error.code:'ACCOUNT_SERVICE_UNAVAILABLE';
 return new Response(JSON.stringify({schema:'account_error_v1',error:code}),{status:Number.isInteger(error?.status)&&error.status>=400&&error.status<=599?error.status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
}
