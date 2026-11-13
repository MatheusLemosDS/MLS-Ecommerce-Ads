import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {D1} from './sqlite-d1.mjs';
import {migrateAccountDatabase,accountChange,accountCommit,accountGet} from '../src/account-store.mjs';
import {resolveServiceCommercialPrincipal} from '../src/account-service.mjs';

class CountedD1 extends D1{
 constructor(){super();this.executions=[];}
 prepare(sql){const statement=super.prepare(sql),db=this,wrapped={bind(...args){statement.bind(...args);return wrapped;},async first(){db.executions.push(sql);return statement.first();},async all(){db.executions.push(sql);return statement.all();},async run(){db.executions.push(sql);return statement.run();}};return wrapped;}
}
const stamp=Date.UTC(2026,10,11,18)/1000;
async function fixture(){
 const db=new CountedD1(),env={ACCOUNT_DB:db},options={now:()=>stamp*1000},ids={user:'synthetic-user-a',session:'a'.repeat(64),organization:'synthetic-organization-a',store:'synthetic-store-a'},claims={sub:ids.user,sid:ids.session,mid:ids.user,org:ids.organization,store:ids.store,cap:'bank.read',revision:1};await migrateAccountDatabase(env,options);
 await accountCommit(db,[accountChange('user','global',{id:ids.user,name:'Pessoa sintética',email:'snapshot@example.test',state:'ACTIVE',auth_revision:1,preferences:{theme:'system',language:'pt-BR'}}),accountChange('session','global',{id:ids.session,user_id:ids.user,created_at:stamp,last_activity_at:stamp,expires_at:stamp+28800,revoked_at:null,auth_revision:1,mfa_complete:true,csrf:'s'.repeat(43),reauthenticated_at:stamp,organization_id:ids.organization,store_id:ids.store}),accountChange('organization','global',{id:ids.organization,name:'Empresa sintética',state:'ACTIVE',currency:'BRL',timezone:'America/Sao_Paulo'}),accountChange('membership',ids.organization,{id:ids.user,user_id:ids.user,organization_id:ids.organization,role:'OWNER',state:'ACTIVE',capabilities:null,store_ids:null}),accountChange('store',ids.organization,{id:ids.store,organization_id:ids.organization,state:'ACTIVE',profile:null})]);
 return {db,env,options,ids,claims};
}
async function change(f,kind,patch){const scope=['membership','store'].includes(kind)?f.ids.organization:'global',id=kind==='user'||kind==='membership'?f.ids.user:kind==='organization'?f.ids.organization:kind==='store'?f.ids.store:f.ids.session,record=await accountGet(f.db,kind,scope,id);await accountCommit(f.db,[accountChange(kind,scope,{...record,...patch},record.revision)]);return record.revision+1;}
async function resolveOnce(f,claims=f.claims,options=f.options){f.db.executions=[];try{return await resolveServiceCommercialPrincipal(f.env,claims,options);}finally{assert.equal(f.db.executions.length,1,'every fresh authorization, including denial, must execute exactly one SQL statement');assert.match(f.db.executions[0],/^SELECT\s/);}}

test('one joined SQL snapshot returns every authorization revision and rereads changes without caching',async()=>{
 const f=await fixture(),first=await resolveOnce(f);assert.equal(first.userId,f.ids.user);assert.equal(first.sessionRevision,1);assert.equal(first.membershipRevision,1);assert.equal(first.storeRevision,1);assert.equal(first.organizationRevision,1);assert.equal(first.legacyCashTenant,null);
 await change(f,'user',{name:'Nome alterado nesta leitura'});const latest=await resolveOnce(f);assert.equal(latest.userRevision,2);assert.equal(latest.user.name,'Nome alterado nesta leitura');const membershipRevision=await change(f,'membership',{role:'FINANCE'});await assert.rejects(resolveOnce(f),e=>e.code==='ACCOUNT_FORBIDDEN');const granted=await resolveOnce(f,{...f.claims,revision:membershipRevision});assert.equal(granted.role,'FINANCE');assert.ok(granted.capabilities.includes('bank.read'));assert.ok(!granted.capabilities.includes('organization.transfer'));
});

test('single-query authorization retains user/session/MFA, membership, store and claim checks',async()=>{
 const cases=[
  ['user',{state:'PENDING_VERIFICATION'}],['user',{state:'SUSPENDED'}],['user',{state:'DELETION_REQUESTED'}],['user',{auth_revision:2}],
  ['session',{revoked_at:stamp}],['session',{expires_at:stamp}],['session',{last_activity_at:stamp-1800}],['session',{mfa_complete:false}],['session',{user_id:'another-user'}],
  ['organization',{state:'CLOSED'}],['membership',{state:'REMOVED'}],['membership',{role:'OPERATIONS'}],['membership',{capabilities:['store.read']}],['membership',{store_ids:[]}],
  ['store',{state:'SUSPENDED'}],['store',{organization_id:'another-organization'}],
 ];
 for(const [kind,patch] of cases){const f=await fixture(),revision=await change(f,kind,patch),claims={...f.claims,...(kind==='membership'?{revision}:{})};await assert.rejects(resolveOnce(f,claims),e=>e.code==='ACCOUNT_FORBIDDEN',kind+' '+JSON.stringify(patch));}
 for(const patch of [{sub:'other-user'},{mid:'other-member'},{org:'other-organization'},{store:'other-store'},{revision:2},{cap:'*'}]){const f=await fixture();await assert.rejects(resolveOnce(f,{...f.claims,...patch}),e=>e.code==='ACCOUNT_FORBIDDEN');}
});

test('absolute eight-hour and idle thirty-minute boundaries survive the snapshot optimization',async()=>{
 const f=await fixture();await resolveOnce(f,f.claims,{now:()=>(stamp+1799)*1000});await assert.rejects(resolveOnce(f,f.claims,{now:()=>(stamp+1800)*1000}),e=>e.code==='ACCOUNT_FORBIDDEN');await change(f,'session',{last_activity_at:stamp+28799});await resolveOnce(f,f.claims,{now:()=>(stamp+28799)*1000});await assert.rejects(resolveOnce(f,f.claims,{now:()=>(stamp+28800)*1000}),e=>e.code==='ACCOUNT_FORBIDDEN');
});

test('receipt state and version are read in the same snapshot; missing migration fails closed without data writes',async()=>{
 const f=await fixture(),alias='synthetic:legacy:cash';f.db.db.prepare('INSERT INTO mls_tenant_migrations(organization_id,store_id,domain,migration_version,source_digest,owner_user_id,state,legacy_cash_tenant) VALUES(?,?,?,1,?,?,?,?)').run(f.ids.organization,f.ids.store,'finance','d'.repeat(64),f.ids.user,'COMPLETE',alias);assert.equal((await resolveOnce(f)).legacyCashTenant,alias);
 f.db.db.exec("UPDATE mls_tenant_migrations SET state='COPYING'");await assert.rejects(resolveOnce(f),e=>e.code==='ACCOUNT_MIGRATION_INCOMPLETE');f.db.db.exec("UPDATE mls_tenant_migrations SET state='COMPLETE',migration_version=2");await assert.rejects(resolveOnce(f),e=>e.code==='ACCOUNT_MIGRATION_INCOMPLETE');f.db.db.exec("UPDATE mls_tenant_migrations SET migration_version=1,legacy_cash_tenant='invalid?alias'");await assert.rejects(resolveOnce(f),e=>e.code==='ACCOUNT_MIGRATION_INVALID');
 const before=f.db.db.prepare("SELECT payload FROM mls_account_records WHERE kind='user'").get().payload;f.db.db.exec('DROP TABLE mls_tenant_migrations');await assert.rejects(resolveOnce(f),e=>e.code==='ACCOUNT_MIGRATION_REQUIRED'&&e.status===503);assert.equal(f.db.db.prepare("SELECT payload FROM mls_account_records WHERE kind='user'").get().payload,before);f.db.db.exec(readFileSync(new URL('../../../migrations/account-0002.sql',import.meta.url),'utf8'));assert.equal((await resolveOnce(f)).legacyCashTenant,null);
});
