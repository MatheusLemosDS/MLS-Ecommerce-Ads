import {commercialFinanceCapability} from './commercial-finance-capability.mjs';
import {APP_RELEASE} from './app-release.mjs';
import {handleCommercialAccountBridge} from './commercial-account-service.mjs';
import {resolveServiceCommercialPrincipal} from './account-service.mjs';
import {tenantAuthorizationGuard} from './commercial-authorization.mjs';
import {commercialContextFromPrincipal,bindCommercialEnvironment} from './commercial-context.mjs';
import {TENANT_ENVELOPE_HEADER,verifyTenantEnvelope,forwardTenantEnvelope} from './tenant-envelope.mjs';

const fail=(code,status=403)=>{throw Object.assign(Error(code),{code,status});};
const jsonError=(code,status=503)=>new Response(JSON.stringify({error:code}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
export function createCommercialAuthWorker(legacyWorker,{validateInternalApp,...defaults}={}){
 if(typeof legacyWorker?.fetch!=='function'||typeof validateInternalApp!=='function')fail('COMMERCIAL_AUTH_CONFIGURATION',503);
 return {...legacyWorker,async fetch(request,env,executionContext){
  try{
   const bridge=await handleCommercialAccountBridge(request,env,{...defaults,release:defaults.release??APP_RELEASE,validateInternalApp});if(bridge)return bridge;
   const hasContext=request.headers.has(TENANT_ENVELOPE_HEADER),hasAccount=/(?:^|;\s*)__Host-mls_account=/.test(request.headers.get('cookie')||'');
   if(!hasContext){if(hasAccount)return jsonError('TENANT_ENVELOPE_REQUIRED',403);return legacyWorker.fetch(request,env,executionContext);}
   if(!await validateInternalApp(request,env))return jsonError('COMMERCIAL_INTERNAL_UNAUTHORIZED',401);
   const now=defaults.now??(()=>Date.now());let required,originalClaims,principal;
   await verifyTenantEnvelope(request,{secret:env.APP_INTERNAL_SECRET,issuer:'app',audience:'auth',now,resolvePrincipal:async claims=>{required=await commercialFinanceCapability(request);if(claims.cap!==required)fail('COMMERCIAL_ROUTE_CAPABILITY_MISMATCH');originalClaims=claims;principal=await resolveServiceCommercialPrincipal(env,claims,{now});return principal;}});
   const context=await commercialContextFromPrincipal(principal,{requiredCapability:required}),scoped=bindCommercialEnvironment(env,context,{authorizationGuard:()=>tenantAuthorizationGuard(context,context.requiredCapability,now())});
   const binding=env.SHOPEE_FINANCE_SERVICE;if(typeof binding?.fetch!=='function')return jsonError('COMMERCIAL_FINANCE_CONFIGURATION',503);
   const financeService={async fetch(input,init){
    const actual=input instanceof Request?new Request(input,init):new Request(input,init),capability=await commercialFinanceCapability(actual);
    if(capability!==required)fail('COMMERCIAL_ROUTE_CAPABILITY_MISMATCH');
    const current=await resolveServiceCommercialPrincipal(env,{...originalClaims,cap:capability},{now}),fresh=await commercialContextFromPrincipal(current,{requiredCapability:capability});
    const forwarded=await forwardTenantEnvelope(actual,fresh,{secret:env.FINANCE_ROUTER_SECRET,issuer:'auth',audience:'finance',now});return binding.fetch(forwarded);
   }};
   const result=await legacyWorker.fetch(request,Object.freeze({...scoped,SHOPEE_FINANCE_SERVICE:financeService}),executionContext);
   const current=await resolveServiceCommercialPrincipal(env,{...originalClaims,cap:required},{now});if(current.legacyCashTenant!==principal.legacyCashTenant||current.storeRevision!==principal.storeRevision){try{await result?.body?.cancel();}catch{}fail('COMMERCIAL_AUTHORIZATION_CHANGED');}
   if(!(result instanceof Response))fail('COMMERCIAL_RESPONSE_INVALID',503);const headers=new Headers(result.headers);headers.set('cache-control','private, no-store');return new Response(result.body,{status:result.status,statusText:result.statusText,headers});
  }catch(error){const code=typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{2,100}$/.test(error.code)?error.code:typeof error?.message==='string'&&/^(?:ACCOUNT|TENANT_ENVELOPE|COMMERCIAL)_[A-Z_]+$/.test(error.message)?error.message:'COMMERCIAL_AUTH_UNAVAILABLE',status=Number.isInteger(error?.status)&&[400,401,403,404,409,413,429,503].includes(error.status)?error.status:503;return jsonError(code,status);}
 }};
}
