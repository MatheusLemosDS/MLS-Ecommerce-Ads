import financeWorker from './production-worker.mjs';
import {verifyTenantEnvelope,TENANT_ENVELOPE_HEADER} from '../../cloudflare/src/tenant-envelope.mjs';
import {commercialContextFromPrincipal,bindCommercialEnvironment} from '../../cloudflare/src/commercial-context.mjs';
import {resolveServiceCommercialPrincipal,tenantAuthorizationGuard} from '../../cloudflare/src/account-service.mjs';
import {commercialFinanceCapability} from '../../cloudflare/src/commercial-finance-capability.mjs';

const failure=(code,status=403)=>new Response(JSON.stringify({schema:'commercial_service_error_v1',error:code}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
export async function commercialFinanceRequiredCapability(request){
 const url=new URL(request.url);if(url.origin!=='https://auth.brazacommerce.com.br'||url.search||url.hash)return null;
 if(request.method!==(url.pathname.endsWith('/daily-orders')?'GET':'POST'))return null;
 try{return await commercialFinanceCapability(request);}catch{return null;}
}
// The registry is an explicit server secret, keyed by the application's partner
// ID. No deployment's legacy partner key or a browser field is a fallback.
export function resolveCommercialFinanceProviderEnvironment(env,context){
 if(context.profile===null)return {};
 let registry=env.COMMERCIAL_FINANCE_PROVIDER_KEYS;
 if(registry===undefined||registry===null||registry==='')return {};
 if(typeof registry==='string'){if(registry.length>65536)throw Error('COMMERCIAL_PROVIDER_CONFIGURATION');registry=JSON.parse(registry);}
 if(!registry||typeof registry!=='object'||Array.isArray(registry)||![Object.prototype,null].includes(Object.getPrototypeOf(registry)))throw Error('COMMERCIAL_PROVIDER_CONFIGURATION');
 const descriptor=Object.getOwnPropertyDescriptor(registry,String(context.profile.partner_id));if(!descriptor)return {};
 if(!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='string'||!descriptor.value||descriptor.value.length>4096||/[\u0000-\u001f\u007f]/.test(descriptor.value))throw Error('COMMERCIAL_PROVIDER_CONFIGURATION');
 return {SHOPEE_FINANCE_PARTNER_KEY:descriptor.value};
}
export function createCommercialFinanceWorker({worker=financeWorker,now=()=>Date.now(),resolvePrincipal=resolveServiceCommercialPrincipal,resolveProviderEnvironment=resolveCommercialFinanceProviderEnvironment}={}){
 return {async fetch(request,env,executionContext){
  if(!request.headers.has(TENANT_ENVELOPE_HEADER)){
   if(/(?:^|;\s*)__Host-mls_account=/.test(request.headers.get('cookie')||''))return failure('COMMERCIAL_CONTEXT_REQUIRED');
   return worker.fetch(request,env,executionContext);
  }
  try{
   const initial=await verifyTenantEnvelope(request,{secret:env.FINANCE_ROUTER_SECRET,issuer:'auth',audience:'finance',resolvePrincipal:claims=>resolvePrincipal(env,claims,{now}),now});
   const capability=await commercialFinanceRequiredCapability(request);if(!capability||initial.requiredCapability!==capability)return failure('COMMERCIAL_CAPABILITY_REJECTED');
   const context=await commercialContextFromPrincipal(initial,{requiredCapability:capability}),providerEnvironment=await resolveProviderEnvironment(env,context);
   const scoped=bindCommercialEnvironment(env,context,{authorizationGuard:()=>tenantAuthorizationGuard(context,capability,now()),providerEnvironment});
   const response=await worker.fetch(request,scoped,executionContext);
   const fresh=await resolvePrincipal(env,{sub:context.userId,sid:context.sessionId,mid:context.membershipId,org:context.organizationId,store:context.storeId,revision:context.authorizationRevision,cap:capability},{now});
   if(fresh?.sessionId!==context.sessionId||fresh?.organizationId!==context.organizationId||fresh?.storeId!==context.storeId||fresh?.authorizationRevision!==context.authorizationRevision||!fresh?.capabilities?.includes(capability))return failure('COMMERCIAL_AUTHORIZATION_REVOKED');
   const headers=new Headers(response.headers);headers.set('cache-control','private, no-store');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }catch(error){return failure(error?.status===503?'COMMERCIAL_SERVICE_UNAVAILABLE':'COMMERCIAL_AUTHORIZATION_REJECTED',error?.status===503?503:403);}
 }};
}
export default createCommercialFinanceWorker();
