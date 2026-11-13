import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {commercialContextFromPrincipal,resolveCommercialContext,bindCommercialEnvironment,finalizeCommercialResponse,stripUntrustedCommercialHeaders} from '../src/commercial-context.mjs';
import {signTenantEnvelope,verifyTenantEnvelope,forwardTenantEnvelope,TENANT_ENVELOPE_HEADER} from '../src/tenant-envelope.mjs';
import {createTenantJob,runTenantJob,validateTenantJob,tenantJobKey} from '../src/tenant-jobs.mjs';
import {TenantIsolationError} from '../src/tenant-storage.mjs';
import {tenantArtworkDatabaseName,createTenantDraftStorage,createTenantBrowserLifecycle} from '../src/tenant-browser-storage.mjs';

const now=()=>Date.parse('2026-11-11T15:00:00Z'),secret='synthetic-local-service-context-key-'.repeat(2),capability='finance.read';
const principal=(suffix,extra={})=>({kind:'account',userId:'synthetic-user-'+suffix,organizationId:'synthetic-org-'+suffix,storeId:'same-store',sessionId:'synthetic-session-'+suffix,membershipId:'synthetic-user-'+suffix,role:'OWNER',capabilities:[capability,'production.write'],authorizationRevision:1,active:true,profile:null,...extra});
const authorizationGuard=()=>({sql:'SELECT 1',bindings:[]});
async function fixture(t){
 const db=new D1(),legacy=new D1();t.after(()=>{db.db.close();legacy.db.close();});
 db.db.exec('CREATE TABLE mls_account_records(kind TEXT,scope TEXT,id TEXT,revision INTEGER,payload TEXT,PRIMARY KEY(kind,scope,id)); CREATE TABLE mls_account_guard(ok INTEGER CHECK(ok=1))');
 const seed=p=>db.prepare("INSERT INTO mls_account_records VALUES('principal','global',?,1,?)").bind(p.sessionId,JSON.stringify(p)).run();
 await seed(principal('a'));await seed(principal('b'));
 const resolve=async claims=>{const id=claims.sid||claims.sessionId;const row=await db.prepare("SELECT payload FROM mls_account_records WHERE kind='principal' AND scope='global' AND id=?").bind(id).first();if(!row)return null;const p=JSON.parse(row.payload);return p.active?p:null;};
 const revoke=async id=>db.prepare("UPDATE mls_account_records SET payload=json_set(payload,'$.active',0) WHERE kind='principal' AND id=?").bind(id).run();
 return {db,legacy,env:{ACCOUNT_DB:db,ADMIN_DB:legacy},resolve,revoke,a:await commercialContextFromPrincipal(principal('a'),{requiredCapability:capability}),b:await commercialContextFromPrincipal(principal('b'),{requiredCapability:capability})};
}

test('only a trusted resolver chooses context; hostile identity headers and absent bindings never select legacy storage',async t=>{
 const {env,a,b}=await fixture(t),request=new Request('https://app.invalid/api/admin/live',{headers:{'x-tenant':b.organizationId,'x-role':'owner','x-mls-context':'forged','x-store-id':b.storeId,'x-mls-user':b.userId}});
 const context=await resolveCommercialContext(request,env,{capability,resolvePrincipal:async()=>principal('a')});assert.equal(context.organizationId,a.organizationId);
 const clean=stripUntrustedCommercialHeaders(request);for(const header of ['x-tenant','x-role','x-mls-context','x-store-id','x-mls-user'])assert.equal(clean.headers.get(header),null);
 const scoped=bindCommercialEnvironment(env,context);assert.notEqual(scoped.ADMIN_DB,env.ADMIN_DB);assert.notEqual(scoped.FINANCE_DB,env.ADMIN_DB);assert.equal(scoped.ACCOUNT_DB,undefined);assert.equal(scoped.COMMERCIAL_CONTEXT.profile,null);
 await assert.rejects(scoped.ADMIN_DB.prepare('CREATE TABLE admin_settings(id INTEGER PRIMARY KEY,payload TEXT)').run(),/WRITE_AUTHORIZATION_GUARD_REQUIRED/);
 assert.throws(()=>bindCommercialEnvironment({ADMIN_DB:env.ADMIN_DB},context),TenantIsolationError);
 await assert.rejects(resolveCommercialContext(request,env,{capability:'finance.write',resolvePrincipal:async()=>principal('a')}),TenantIsolationError);
 await assert.rejects(commercialContextFromPrincipal({...principal('a'),kind:'legacy'}),TenantIsolationError);
});

test('envelope v2 binds method, exact path/query, body, issuer/audience and fresh persisted authorization',async t=>{
 const {a,resolve,revoke}=await fixture(t),request=new Request('https://finance.invalid/internal/cash?month=2026-11',{method:'POST',body:'{"same_id":"synthetic"}',headers:{'content-type':'application/json'}});
 const signed=await forwardTenantEnvelope(request,a,{secret,issuer:'auth',audience:'finance',now});
 const verified=await verifyTenantEnvelope(signed,{secret,issuer:'auth',audience:'finance',resolvePrincipal:resolve,now});assert.equal(verified.organizationId,a.organizationId);assert.equal(verified.profile,null);
 for(const changed of [new Request('https://finance.invalid/internal/other',{method:'POST',body:'{"same_id":"synthetic"}',headers:signed.headers}),new Request(signed.url,{method:'POST',body:'{"same_id":"changed"}',headers:signed.headers}),new Request(signed.url,{headers:signed.headers})])await assert.rejects(verifyTenantEnvelope(changed,{secret,issuer:'auth',audience:'finance',resolvePrincipal:resolve,now}),TenantIsolationError);
 await assert.rejects(verifyTenantEnvelope(signed,{secret,issuer:'app',audience:'auth',resolvePrincipal:resolve,now}),TenantIsolationError);
 await assert.rejects(verifyTenantEnvelope(signed,{secret,issuer:'auth',audience:'finance',resolvePrincipal:resolve,now:()=>now()+30000}),TenantIsolationError);
 await revoke(a.sessionId);await assert.rejects(verifyTenantEnvelope(signed,{secret,issuer:'auth',audience:'finance',resolvePrincipal:resolve,now}),TenantIsolationError);
});

test('a forged or stale signed service claim cannot inherit a different tenant, capability or session',async t=>{
 const {a,b,resolve}=await fixture(t),request=new Request('https://auth.invalid/internal/read');
 const token=await signTenantEnvelope(request,a,{secret,issuer:'app',audience:'auth',now});
 const signed=new Request(request,{headers:{[TENANT_ENVELOPE_HEADER]:token}});
 await assert.rejects(verifyTenantEnvelope(signed,{secret,issuer:'app',audience:'auth',resolvePrincipal:async()=>principal('b'),now}),TenantIsolationError);
 await assert.rejects(verifyTenantEnvelope(signed,{secret,issuer:'app',audience:'auth',resolvePrincipal:async()=>principal('a',{capabilities:[]}),now}),TenantIsolationError);
 const payload=JSON.parse(Buffer.from(token.split('.')[0],'base64url'));payload.org=b.organizationId;
 await assert.rejects(verifyTenantEnvelope(new Request(request,{headers:{[TENANT_ENVELOPE_HEADER]:Buffer.from(JSON.stringify(payload)).toString('base64url')+'.'+token.split('.')[1]}}),{secret,issuer:'app',audience:'auth',resolvePrincipal:resolve,now}),TenantIsolationError);
});

test('read response is withheld if persisted membership is revoked in flight',async t=>{
 const {env,a,resolve,revoke}=await fixture(t),request=new Request('https://app.invalid/api/admin/live');
 const resolveRequest=()=>resolve({sessionId:a.sessionId});
 const allowed=await finalizeCommercialResponse(request,env,a,new Response('synthetic-a'),{resolvePrincipal:resolveRequest});assert.equal(await allowed.text(),'synthetic-a');assert.equal(allowed.headers.get('cache-control'),'private, no-store');
 await revoke(a.sessionId);await assert.rejects(finalizeCommercialResponse(request,env,a,new Response('must never be sent'),{resolvePrincipal:resolveRequest}),TenantIsolationError);
});

test('jobs with equal IDs and leases persist in independent namespaces and revalidate actor before completion',async t=>{
 const {env,a,b,resolve,revoke}=await fixture(t),A=bindCommercialEnvironment(env,a,{authorizationGuard}),B=bindCommercialEnvironment(env,b,{authorizationGuard});
 for(const scoped of [A,B])await scoped.ADMIN_DB.prepare('CREATE TABLE hermes_jobs(id TEXT PRIMARY KEY,status TEXT,lease TEXT,result TEXT)').run();
 const ja=createTenantJob(a,{id:'same-job',kind:'saved-collection',payload:{value:'synthetic-a'}}),jb=createTenantJob(b,{id:'same-job',kind:'saved-collection',payload:{value:'synthetic-b'}});
 assert.notEqual(tenantJobKey(a,ja.job_id),tenantJobKey(b,jb.job_id));
 for(const [context,job] of [[a,ja],[b,jb]])await runTenantJob(env,job,{resolvePrincipal:resolve,authorizationGuard,expectedContext:context,execute:(scoped,payload)=>scoped.ADMIN_DB.prepare('INSERT INTO hermes_jobs VALUES(?,?,?,?)').bind(job.job_id,'completed','same-lease',payload.value).run()});
 assert.equal((await A.ADMIN_DB.prepare('SELECT result FROM hermes_jobs WHERE id=?').bind('same-job').first()).result,'synthetic-a');
 assert.equal((await B.ADMIN_DB.prepare('SELECT result FROM hermes_jobs WHERE id=?').bind('same-job').first()).result,'synthetic-b');
 await assert.rejects(validateTenantJob(ja,{resolvePrincipal:resolve,expectedContext:b}),TenantIsolationError);
 await revoke(a.sessionId);await assert.rejects(runTenantJob(env,ja,{resolvePrincipal:resolve,execute:()=>{throw new Error('must not run');}}),TenantIsolationError);
});

test('browser drafts/media are separated by user, company and store; switching aborts stale responses and revokes blobs',()=>{
 const a=principal('a'),b=principal('b'),otherUser={...a,userId:'synthetic-other-user'};assert.notEqual(tenantArtworkDatabaseName(a),tenantArtworkDatabaseName(b));assert.notEqual(tenantArtworkDatabaseName(a),tenantArtworkDatabaseName(otherUser));
 const data=new Map(),storage={get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const A=createTenantDraftStorage(storage,a),B=createTenantDraftStorage(storage,b);A.setItem('2026-11','synthetic-a');B.setItem('2026-11','synthetic-b');assert.equal(A.getItem('2026-11'),'synthetic-a');A.clear();assert.equal(B.getItem('2026-11'),'synthetic-b');
 const revoked=[];let clears=0,stops=0;const life=createTenantBrowserLifecycle({clear:()=>clears++,stop:()=>stops++,revokeObjectURL:url=>revoked.push(url)}),ticket=life.begin(a),controller=life.controller();life.trackObjectURL('blob:synthetic-a');life.begin(b);assert.equal(controller.signal.aborted,true);assert.equal(life.isCurrent(ticket),false);assert.deepEqual(revoked,['blob:synthetic-a']);assert.equal(clears,2);assert.equal(stops,2);life.stop();assert.equal(life.isCurrent(ticket),false);
});
