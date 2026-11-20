import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {D1} from './sqlite-d1.mjs';
import {SCHEMA,scheduledWork} from '../src/admin.mjs';
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

test('the exact main4cf workspace schema keeps previously READY stores valid while collector metadata initializes outside its identity',async t=>{
 assert.equal(SCHEMA.length,114);assert.equal(createHash('sha256').update(JSON.stringify(SCHEMA)).digest('hex'),'8731b21c0b4b7d0650b245bcbe2ae0c1d2898822fc8ff6e4e0051e769c3ea066');
 const lazy=['business_month_source_recoveries','business_month_cohort_source_recoveries','business_history_sync_fairness'];for(const table of lazy)assert.ok(SCHEMA.every(sql=>!sql.includes('CREATE TABLE IF NOT EXISTS '+table+'(')),table+' cannot alter the existing commercial setup hash');
 const f=await fixture(t);let prepared;do{prepared=await prepareCommercialWorkspace(f.A.scoped,f.env,f.A.principal,SCHEMA,{now:f.now,cursor:prepared?.completed??0});}while(prepared.state!=='READY');
 const prior=await accountGet(f.raw,'workspace_setup',f.A.principal.organizationId,f.A.principal.storeId);assert.equal(prior.schema_hash,'6f76c6aae021f0d3437e949ae84cb05028a90d3a522d81f51ce3fdcd82022f75');assert.equal(prior.total,98);const writes=f.raw.batches.length;
 assert.equal((await assertCommercialWorkspaceReady(f.A.scoped,f.env,f.A.principal,SCHEMA)).state,'READY');assert.equal((await prepareCommercialWorkspace(f.A.scoped,f.env,f.A.principal,SCHEMA,{now:f.now})).replayed,true);assert.equal(f.raw.batches.length,writes,'accepting the prior READY hash performs no migration or implicit schema bypass');
 const db=new D1();t.after(()=>db.db.close());let providerReads=0;const result=await scheduledWork({ADMIN_DB:db},{getFinanceBusinessPeriod:async()=>{providerReads++;throw Error('NO_PROVIDER_IN_SCHEMA_SETUP');}},()=>Date.parse('2026-11-20T12:01:00.000Z'));assert.equal(result.collection,'MAINTENANCE');assert.equal(providerReads,0);
 for(const table of lazy){assert.ok(db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,0,'technical metadata initialization never creates a historical fact');}
});
