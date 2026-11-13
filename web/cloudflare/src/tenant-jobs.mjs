import {TenantIsolationError} from './tenant-storage.mjs';
import {assertCommercialCapability,commercialContextFromPrincipal,bindCommercialEnvironment,isCommercialContext} from './commercial-context.mjs';

const fail=()=>{throw new TenantIsolationError('TENANT_JOB_SCOPE_REJECTED');};
const keys=['schema','organization_id','store_id','actor_user_id','session_id','membership_id','authorization_revision','capability','job_id','kind','payload'];
const identity=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
export function createTenantJob(context,{id,kind,payload,capability=context?.requiredCapability}={}){
 assertCommercialCapability(context,capability);if(!identity(id)||!identity(kind)||payload===undefined)fail();
 let normalized;try{const raw=JSON.stringify(payload);if(new TextEncoder().encode(raw).length>1048576)fail();normalized=JSON.parse(raw);}catch{fail();}
 return Object.freeze({schema:'mls_tenant_job_v1',organization_id:context.organizationId,store_id:context.storeId,actor_user_id:context.userId,session_id:context.sessionId,membership_id:context.membershipId,authorization_revision:context.authorizationRevision??null,capability,job_id:id,kind,payload:normalized});
}
export async function validateTenantJob(job,{resolvePrincipal,expectedContext=null}={}){
 if(!job||Array.isArray(job)||Object.keys(job).length!==keys.length||keys.some(k=>!Object.hasOwn(job,k))||job.schema!=='mls_tenant_job_v1'||!identity(job.job_id)||!identity(job.kind)||typeof resolvePrincipal!=='function')fail();
 if(expectedContext&&(!isCommercialContext(expectedContext)||job.organization_id!==expectedContext.organizationId||job.store_id!==expectedContext.storeId))fail();
 const principal=await resolvePrincipal({userId:job.actor_user_id,sessionId:job.session_id,membershipId:job.membership_id,organizationId:job.organization_id,storeId:job.store_id,capability:job.capability});
 if(principal?.userId!==job.actor_user_id||principal?.sessionId!==job.session_id||principal?.membershipId!==job.membership_id||principal?.organizationId!==job.organization_id||principal?.storeId!==job.store_id||(principal?.authorizationRevision??null)!==job.authorization_revision)fail();
 return commercialContextFromPrincipal(principal,{requiredCapability:job.capability});
}
// The job is loaded from scoped persisted storage, never accepted directly
// from an unsigned queue/browser payload. Claims and completion revalidate the
// actor; suspension, revocation or disconnect stops pending/retried work.
export async function runTenantJob(env,job,{resolvePrincipal,authorizationGuard,expectedContext,execute}={}){
 if(typeof execute!=='function')fail();
 const context=await validateTenantJob(job,{resolvePrincipal,expectedContext}),scoped=bindCommercialEnvironment(env,context,{authorizationGuard:authorizationGuard?()=>authorizationGuard(context):null});
 const result=await execute(scoped,job.payload,context);
 await validateTenantJob(job,{resolvePrincipal,expectedContext:context});
 return result;
}
export function tenantJobKey(context,key){if(!isCommercialContext(context)||!identity(key))fail();return context.namespace+key;}
