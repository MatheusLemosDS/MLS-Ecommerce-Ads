import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {SCHEMA} from '../src/admin.mjs';
import {migrateAccountDatabase,accountChange,accountCommit,accountGet} from '../src/account-store.mjs';
import {resolveServiceCommercialPrincipal,tenantAuthorizationGuard} from '../src/account-service.mjs';
import {commercialContextFromPrincipal,bindCommercialEnvironment} from '../src/commercial-context.mjs';
import {prepareCommercialWorkspace,assertCommercialWorkspaceReady,COMMERCIAL_WORKSPACE_DDL_CHUNK} from '../src/commercial-workspace-setup.mjs';

class SerialD1 extends D1{
 constructor(){super();this.serial=Promise.resolve();this.batches=[];this.failNext=false;}
 prepare(sql){const result=super.prepare(sql);result.testSql=sql;return result;}
 batch(statements){const work=this.serial.then(async()=>{if(this.failNext){this.failNext=false;throw Error('synthetic-interruption');}this.batches.push(statements.map(row=>row.testSql));return super.batch(statements);});this.serial=work.catch(()=>{});return work;}
}
async function fixture(t){
 const raw=new SerialD1(),legacy=new D1();t.after(()=>{raw.db.close();legacy.db.close();});const env={ACCOUNT_DB:raw,ADMIN_DB:legacy},now=()=>Date.parse('2026-11-12T01:00:00Z'),stamp=now()/1000,entries=[];await migrateAccountDatabase(env,{now});
 for(const suffix of ['a','b']){
  const uid='setup-user-'+suffix,org='setup-org-'+suffix,sid='setup-session-'+suffix,store='same-store';
  await accountCommit(raw,[accountChange('user','global',{id:uid,name:'Synthetic',email:suffix+'@example.invalid',state:'ACTIVE',auth_revision:1,preferences:{theme:'system',language:'pt-BR'}}),accountChange('session','global',{id:sid,user_id:uid,created_at:stamp,last_activity_at:stamp,expires_at:stamp+28800,revoked_at:null,mfa_complete:true,auth_revision:1}),accountChange('organization','global',{id:org,state:'ACTIVE'}),accountChange('membership',org,{id:uid,user_id:uid,organization_id:org,role:'VIEWER',state:'ACTIVE',store_ids:null,capabilities:['store.read']}),accountChange('store',org,{id:store,organization_id:org,state:'ACTIVE',profile:null})]);
  const principal=await resolveServiceCommercialPrincipal(env,{sub:uid,sid,mid:uid,org,store,revision:1,cap:'store.read'},{now}),context=await commercialContextFromPrincipal(principal,{requiredCapability:'store.read'}),scoped=bindCommercialEnvironment(env,context,{authorizationGuard:()=>tenantAuthorizationGuard(principal,'store.read',now())});entries.push({principal,context,scoped});
 }
 raw.batches=[];return {raw,legacy,env,now,A:entries[0],B:entries[1]};
}
test('cold root schema advances in bounded persisted chunks and creates no legacy financial defaults or facts',async t=>{
 const f=await fixture(t);let result,steps=0;
 await assert.rejects(assertCommercialWorkspaceReady(f.A.scoped,f.env,f.A.principal,SCHEMA),/PREPARATION_REQUIRED/);
 do{result=await prepareCommercialWorkspace(f.A.scoped,f.env,f.A.principal,SCHEMA,{now:f.now,cursor:result?.completed??0});assert.equal(result.schema,'commercial_workspace_setup_v1');assert.ok(++steps<30);}while(result.state!=='READY');
 assert.ok(steps>1);assert.equal(result.completed,result.total);assert.equal(result.remaining,0);assert.equal((await assertCommercialWorkspaceReady(f.A.scoped,f.env,f.A.principal,SCHEMA)).state,'READY');
 for(const batch of f.raw.batches){assert.ok(batch.filter(sql=>/^\s*CREATE/i.test(sql)).length<=COMMERCIAL_WORKSPACE_DDL_CHUNK);assert.ok(batch.length<=19,'actual D1 batch size '+batch.length);}
 assert.deepEqual(JSON.parse((await f.A.scoped.ADMIN_DB.prepare('SELECT payload FROM variant_bindings_state WHERE id=1').first()).payload),[]);assert.deepEqual(JSON.parse((await f.A.scoped.ADMIN_DB.prepare('SELECT payload FROM production_cost_rules_state WHERE id=1').first()).payload),{rules:[]});
 for(const table of ['production_costs_state','admin_settings','business_tax_policy_state','hermes_jobs','operator_cost_corrections'])assert.equal((await f.A.scoped.ADMIN_DB.prepare('SELECT count(*) AS n FROM '+table).first()).n,0,table);
 assert.equal((await f.B.scoped.ADMIN_DB.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").first()).n,0);assert.equal(f.legacy.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n,0);
 const replay=await prepareCommercialWorkspace(f.A.scoped,f.env,f.A.principal,SCHEMA,{now:f.now});assert.equal(replay.replayed,true);assert.equal(replay.revision,result.revision);t.diagnostic(JSON.stringify({schemaStatements:SCHEMA.length,technicalCreates:result.total,steps,maximumBatch:Math.max(...f.raw.batches.map(batch=>batch.length)),maximumCreates:Math.max(...f.raw.batches.map(batch=>batch.filter(sql=>/^\s*CREATE/i.test(sql)).length))}));
});
test('concurrent retries share one CAS cursor and an interrupted request resumes without duplicate advance',async t=>{
 const f=await fixture(t),first=await Promise.all([prepareCommercialWorkspace(f.A.scoped,f.env,f.A.principal,SCHEMA,{now:f.now}),prepareCommercialWorkspace(f.A.scoped,f.env,f.A.principal,SCHEMA,{now:f.now})]);assert.equal(first[0].completed,12);assert.equal(first[1].completed,12);assert.equal(first[0].revision,first[1].revision);assert.ok(first.some(row=>row.replayed));
 f.raw.failNext=true;await assert.rejects(prepareCommercialWorkspace(f.A.scoped,f.env,f.A.principal,SCHEMA,{now:f.now,cursor:12}),/PREPARATION_CONFLICT/);const state=await accountGet(f.raw,'workspace_setup',f.A.principal.organizationId,f.A.principal.storeId);assert.equal(state.cursor,12);
 const resumed=await prepareCommercialWorkspace(f.A.scoped,f.env,f.A.principal,SCHEMA,{now:f.now,cursor:12});assert.equal(resumed.completed,24);assert.equal(resumed.revision,2);
});
test('revoked membership, cross-company wrappers and changed schema cannot prepare another store or advance progress',async t=>{
 const f=await fixture(t);await prepareCommercialWorkspace(f.A.scoped,f.env,f.A.principal,SCHEMA,{now:f.now});
 await assert.rejects(prepareCommercialWorkspace({...f.A.scoped,ADMIN_DB:f.B.scoped.ADMIN_DB},f.env,f.A.principal,SCHEMA,{now:f.now}),/FORBIDDEN/);assert.equal(await accountGet(f.raw,'workspace_setup',f.B.principal.organizationId,f.B.principal.storeId),null);
 const member=await accountGet(f.raw,'membership',f.A.principal.organizationId,f.A.principal.userId);await accountCommit(f.raw,[accountChange('membership',f.A.principal.organizationId,{...member,state:'REMOVED'},member.revision)]);await assert.rejects(prepareCommercialWorkspace(f.A.scoped,f.env,f.A.principal,SCHEMA,{now:f.now,cursor:12}),/PREPARATION_CONFLICT/);assert.equal((await accountGet(f.raw,'workspace_setup',f.A.principal.organizationId,f.A.principal.storeId)).cursor,12);
 await assert.rejects(prepareCommercialWorkspace(f.B.scoped,f.env,f.B.principal,[...SCHEMA,'CREATE TABLE IF NOT EXISTS unknown_commercial_table(id TEXT)'],{now:f.now}),/SQL_TABLE_FORBIDDEN/);assert.equal(await accountGet(f.raw,'workspace_setup',f.B.principal.organizationId,f.B.principal.storeId),null);
});
