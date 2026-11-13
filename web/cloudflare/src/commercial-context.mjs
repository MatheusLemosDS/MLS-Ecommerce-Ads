import {TenantIsolationError,tenantNamespace,createTenantDatabase,createTenantKeyValue} from './tenant-storage.mjs';

const fail=(code,status=403)=>{throw new TenantIsolationError('COMMERCIAL_'+code,status);};
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
const capability=value=>typeof value==='string'&&/^[a-z][a-z0-9_.:-]{1,79}$/.test(value);
const contexts=new WeakSet();
export const COMMERCIAL_ENVIRONMENT_ALLOWED_KEYS=Object.freeze(['ASSETS','APP_INTERNAL_SECRET','FINANCE_ROUTER_SECRET','FINANCE_CONNECTION_ENABLED','FINANCE_TOKEN_ENCRYPTION_KEY','SHOPEE_FINANCE_SERVICE','MLS_AI_SALES_OWNER_PREVIEW','MLS_V36_OWNER_PREVIEW','ACCOUNT_SUPPORT_URL']);
// Only a trusted server resolver may produce this object. No context is ever
// read from x-tenant, x-role, URL, request body, imported file or browser state.
export async function commercialContextFromPrincipal(principal,{requiredCapability=null}={}){
 if(!principal||principal.kind!=='account'||!validId(principal.userId)||!validId(principal.organizationId)||!validId(principal.storeId)||!validId(principal.sessionId)||!validId(principal.membershipId)||!['OWNER','ADMIN','FINANCE','OPERATIONS','VIEWER'].includes(principal.role)||!Number.isSafeInteger(principal.authorizationRevision)||principal.authorizationRevision<1||!Array.isArray(principal.capabilities)||principal.capabilities.some(c=>!capability(c)))fail('CONTEXT_INVALID');
 if(requiredCapability!==null&&(!capability(requiredCapability)||!principal.capabilities.includes(requiredCapability)))fail('CAPABILITY_REQUIRED');
 if(principal.active===false||principal.status&&principal.status!=='ACTIVE')fail('AUTHORIZATION_REVOKED');
 if(principal.legacyCashTenant!==undefined&&principal.legacyCashTenant!==null&&(typeof principal.legacyCashTenant!=='string'||! /^[A-Za-z0-9:_-]{1,256}$/.test(principal.legacyCashTenant)))fail('CONTEXT_INVALID');
 const namespace=await tenantNamespace(principal.organizationId,principal.storeId);
 const context=Object.freeze({kind:'account',userId:principal.userId,organizationId:principal.organizationId,storeId:principal.storeId,sessionId:principal.sessionId,membershipId:principal.membershipId,role:principal.role,
  authorizationRevision:principal.authorizationRevision,sessionRevision:principal.sessionRevision,userRevision:principal.userRevision,membershipRevision:principal.membershipRevision,storeRevision:principal.storeRevision,organizationRevision:principal.organizationRevision,
  capabilities:Object.freeze([...new Set(principal.capabilities)]),namespace,requiredCapability,legacyCashTenant:principal.legacyCashTenant??null,profile:principal.profile?Object.freeze({...principal.profile}):null});
 contexts.add(context);return context;
}
export function isCommercialContext(context){return contexts.has(context);}
export async function resolveCommercialContext(request,env,{resolvePrincipal,capability:requiredCapability}={}){
 if(typeof resolvePrincipal!=='function'||!capability(requiredCapability))fail('RESOLVER_CONFIGURATION',503);
 const principal=await resolvePrincipal(request,env,{capability:requiredCapability});
 return commercialContextFromPrincipal(principal,{requiredCapability});
}
export function assertCommercialCapability(context,requiredCapability){
 if(!contexts.has(context)||!capability(requiredCapability)||!context.capabilities.includes(requiredCapability))fail('CAPABILITY_REQUIRED');return context;
}
export function bindCommercialEnvironment(env,context,{authorizationGuard=null,kvBindings=[],providerEnvironment={}}={}){
 if(!contexts.has(context)||!env?.ACCOUNT_DB?.prepare||env.ACCOUNT_DB===env.ADMIN_DB||env.ACCOUNT_DB===env.FINANCE_DB)fail('STORAGE_CONFIGURATION',503);
 const writeGuard=authorizationGuard??(()=>{fail('WRITE_AUTHORIZATION_GUARD_REQUIRED');});
 const scoped={...Object.fromEntries(COMMERCIAL_ENVIRONMENT_ALLOWED_KEYS.filter(key=>Object.hasOwn(env,key)).map(key=>[key,env[key]])),COMMERCIAL_CONTEXT:context,
  ADMIN_DB:createTenantDatabase(env.ACCOUNT_DB,context,{domain:'app',authorizationGuard:writeGuard}),
  FINANCE_DB:createTenantDatabase(env.ACCOUNT_DB,context,{domain:'finance',authorizationGuard:writeGuard})};
 // A connector credential must be supplied explicitly by the trusted server
 // registry. Deployment login/Ads/OAuth credentials are never inherited.
 for(const [key,value] of Object.entries(providerEnvironment)){if(key!=='SHOPEE_FINANCE_PARTNER_KEY'||context.profile===null||typeof value!=='string'||!value||value.length>4096)fail('PROVIDER_CONFIGURATION',503);scoped[key]=value;}
 // Domain modules cannot accidentally use the deployment's unscoped account
 // registry. Authentication keeps its original env, held by the gateway.
 delete scoped.ACCOUNT_DB;
 for(const name of kvBindings){if(!/^[A-Z][A-Z0-9_]*$/.test(name)||!env[name])fail('KV_CONFIGURATION',503);scoped[name]=createTenantKeyValue(env[name],context);}
 return Object.freeze(scoped);
}
export async function finalizeCommercialResponse(request,env,context,response,{resolvePrincipal}={}){
 if(!contexts.has(context)||typeof resolvePrincipal!=='function')fail('RESOLVER_CONFIGURATION',503);
 const current=await resolvePrincipal(request,env,{capability:context.requiredCapability});
 if(current?.userId!==context.userId||current?.organizationId!==context.organizationId||current?.storeId!==context.storeId||current?.sessionId!==context.sessionId||current?.membershipId!==context.membershipId||current?.active===false||!current?.capabilities?.includes(context.requiredCapability)||current.authorizationRevision!==context.authorizationRevision)fail('AUTHORIZATION_REVOKED');
 const headers=new Headers(response.headers);headers.set('cache-control','private, no-store');headers.set('vary','Cookie');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export function stripUntrustedCommercialHeaders(request){
 const headers=new Headers(request.headers);
 for(const name of [...headers.keys()])if(/^x-(?:mls-(?:context|tenant|organization|store|role|user|capability)|tenant|organization|store|role|user)(?:-|$)/i.test(name))headers.delete(name);
 return new Request(request,{headers});
}
