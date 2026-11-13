import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFinancialEvent,readFinancialEvents,readFinancialEventHistory,financialDatabase} from '../src/financial-event-store.mjs';
import {commercialContextFromPrincipal} from '../src/commercial-context.mjs';
import {createTenantDatabase} from '../src/tenant-storage.mjs';
import {financialTestEvent,financialTestScope,financialTestFixture} from './financial-ledger-fixture.mjs';

const input=(event,revision=0,request_id=crypto.randomUUID())=>({scope:event.scope,event,expected_revision:revision,request_id});
test('cold ledger reads are read-only and require a trusted authorization callback',async()=>{
 const f=financialTestFixture();try{assert.equal(f.env.ADMIN_DB.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n,0);const result=await readFinancialEvents(f.env,{scope:financialTestScope()},f.options);assert.equal(result.initialized,false);assert.deepEqual(result.events,[]);assert.equal(f.env.ADMIN_DB.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n,0);await assert.rejects(readFinancialEvents(f.env,{scope:financialTestScope()}),e=>e.status===403);}finally{f.close();}
});

test('retries and later observation of the same native fact do not duplicate revenue or journal revisions',async()=>{
 const f=financialTestFixture();try{const event=await financialTestEvent(),body=input(event),first=await appendFinancialEvent(f.env,body,f.options),same=await appendFinancialEvent(f.env,body,f.options);assert.equal(first.ledger_revision,1);assert.equal(same.replayed,true);
  f.setTime('2026-11-13T17:01:00Z');const next=await appendFinancialEvent(f.env,input({...event,observed_at:'2026-11-13T17:01:00.000Z'},0),f.options);assert.equal(next.changed,false);assert.equal(next.ledger_revision,1);
  assert.equal((await readFinancialEvents(f.env,{scope:event.scope},f.options)).events.length,1);assert.equal(f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM financial_event_revisions').get().n,1);
 }finally{f.close();}
});

test('API and file observations sharing native identity append evidence without recognizing the sale twice',async()=>{
 const f=financialTestFixture();try{const event=await financialTestEvent();await appendFinancialEvent(f.env,input(event),f.options);const imported=await financialTestEvent({evidence:[{kind:'FILE_LINE',reference:'synthetic-import',sha256:'b'.repeat(64)}]});await appendFinancialEvent(f.env,input(imported,1),f.options);const read=await readFinancialEvents(f.env,{scope:event.scope},f.options);assert.equal(read.events.length,1);assert.equal(read.events[0].version,2);assert.equal(read.events[0].postings.find(x=>x.account==='REVENUE').amount_cents,-10000);const history=await readFinancialEventHistory(f.env,{scope:event.scope,event_id:event.event_id},f.options);assert.deepEqual(history.versions[1].delta,[]);assert.equal(history.versions[1].previous_hash,history.versions[0].payload_hash);}finally{f.close();}
});

test('revision changes are immutable, delta-backed, request-fenced and reject stale source data',async()=>{
 const f=financialTestFixture();try{const event=await financialTestEvent(),first=input(event);await appendFinancialEvent(f.env,first,f.options);const corrected={...event,postings:event.postings.map(x=>({...x,amount_cents:x.amount_cents/2}))};await assert.rejects(appendFinancialEvent(f.env,input(corrected),f.options),e=>e.status===409);await assert.rejects(appendFinancialEvent(f.env,{...first,event:corrected},f.options),/REQUEST_CONFLICT/);const result=await appendFinancialEvent(f.env,input(corrected,1),f.options);assert.equal(result.event.version,2);
  const history=await readFinancialEventHistory(f.env,{scope:event.scope,event_id:event.event_id},f.options);assert.equal(history.versions.length,2);assert.equal(history.versions[1].delta[0].amount_cents,-5000);assert.throws(()=>f.env.ADMIN_DB.db.prepare('UPDATE financial_event_revisions SET content_hash=?').run('a'.repeat(64)),/immutable/);assert.throws(()=>f.env.ADMIN_DB.db.prepare('DELETE FROM financial_event_revisions').run(),/immutable/);
  await assert.rejects(appendFinancialEvent(f.env,input({...event,observed_at:'2026-11-12T17:00:00.000Z'},2),f.options),/STALE_SOURCE/);
  assert.equal((await appendFinancialEvent(f.env,first,f.options)).event.version,1,'replay returns the exact immutable result, not a rewritten past response');
 }finally{f.close();}
});

test('pagination has explicit continuation and stale-page revision fences',async()=>{
 const f=financialTestFixture();try{for(let n=0;n<3;n++){const event=await financialTestEvent({source:{provider:'SHOPEE',family:'ORDER',native_id:'synthetic-order-'+n,identity:'NATIVE_ID',identity_key:null}});await appendFinancialEvent(f.env,input(event,n),f.options);}const first=await readFinancialEvents(f.env,{scope:financialTestScope(),limit:2},f.options);assert.equal(first.complete,false);assert.equal(first.events.length,2);const second=await readFinancialEvents(f.env,{scope:financialTestScope(),limit:2,after_event_id:first.next_cursor,expected_revision:first.ledger_revision},f.options);assert.equal(second.events.length,1);assert.equal(second.next_cursor,null);await assert.rejects(readFinancialEvents(f.env,{scope:financialTestScope(),expected_revision:2},f.options),/SOURCE_CHANGED/);}finally{f.close();}
});

test('identical external IDs in different organizations books or currencies cannot cross-read',async()=>{
 const f=financialTestFixture();try{for(const scope of [financialTestScope(),financialTestScope({organization_id:'synthetic-org-b'}),financialTestScope({account_id:'second-book'}),financialTestScope({currency:'USD'})]){const event=await financialTestEvent({scope});await appendFinancialEvent(f.env,input(event),f.options);}for(const scope of [financialTestScope(),financialTestScope({organization_id:'synthetic-org-b'}),financialTestScope({account_id:'second-book'}),financialTestScope({currency:'USD'})]){const result=await readFinancialEvents(f.env,{scope},f.options);assert.equal(result.events.length,1);assert.deepEqual(result.events[0].scope,scope);assert.equal(result.ledger_revision,1);}}finally{f.close();}
});

test('revocation before processing and during the final response prevents disclosure or further processing',async()=>{
 const f=financialTestFixture();try{const event=await financialTestEvent();await appendFinancialEvent(f.env,input(event),f.options);let calls=0;const options={...f.options,assertAuthorized:async()=>{if(++calls===2)throw Object.assign(Error('revoked'),{status:403});}};await assert.rejects(readFinancialEvents(f.env,{scope:event.scope},options),e=>e.status===403);f.revoke();await assert.rejects(appendFinancialEvent(f.env,input(event,1),f.options),e=>e.status===403);}finally{f.close();}
});

test('losing an audit statement rolls the complete D1 batch back',async()=>{
 const f=financialTestFixture();try{const event=await financialTestEvent(),db=f.env.ADMIN_DB,prepare=db.prepare.bind(db);let armed=true;db.prepare=sql=>armed&&sql.startsWith('INSERT INTO financial_event_requests')?(armed=false,prepare('SELECT 0 AS dropped_audit')):prepare(sql);await assert.rejects(appendFinancialEvent(f.env,input(event),f.options),e=>e.status===503);const read=await readFinancialEvents(f.env,{scope:event.scope},f.options);assert.equal(read.ledger_revision,0);assert.equal(read.events.length,0);assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM financial_event_heads').get().n,0);assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM financial_event_revisions').get().n,0);}finally{f.close();}
});

test('a concurrent source update defeats the outer CAS without partially inserting its event',async()=>{
 const f=financialTestFixture();try{const first=await financialTestEvent(),other=await financialTestEvent({source:{...first.source,native_id:'synthetic-racing-order'}}),db=f.env.ADMIN_DB,batch=db.batch.bind(db),prepare=db.prepare.bind(db),sqls=new WeakMap();let armed=true;db.prepare=sql=>{const s=prepare(sql);sqls.set(s,sql);return s;};db.batch=async statements=>{if(armed&&statements.some(s=>sqls.get(s)?.startsWith('UPDATE financial_ledger_state'))){armed=false;await appendFinancialEvent(f.env,input(other),f.options);}return batch(statements);};await assert.rejects(appendFinancialEvent(f.env,input(first),f.options),/REVISION_CONFLICT/);const read=await readFinancialEvents(f.env,{scope:first.scope},f.options);assert.equal(read.events.length,1);assert.equal(read.events[0].event_id,other.event_id);assert.equal(read.ledger_revision,1);}finally{f.close();}
});

test('commercial books reject a valid tenant wrapper from another organization or storage domain',async()=>{
 const f=financialTestFixture();try{
  const principal={kind:'account',userId:'synthetic-user',organizationId:'synthetic-org-a',storeId:'synthetic-store-a',sessionId:'synthetic-session',membershipId:'synthetic-membership',role:'OWNER',authorizationRevision:1,capabilities:['finance.read','finance.write']},a=await commercialContextFromPrincipal(principal),b=await commercialContextFromPrincipal({...principal,organizationId:'synthetic-org-b'}),own=createTenantDatabase(f.env.ADMIN_DB,a),foreign=createTenantDatabase(f.env.ADMIN_DB,b),finance=createTenantDatabase(f.env.ADMIN_DB,a,{domain:'finance'});
  assert.equal(financialDatabase({ADMIN_DB:own,COMMERCIAL_CONTEXT:a}),own);assert.throws(()=>financialDatabase({ADMIN_DB:foreign,COMMERCIAL_CONTEXT:a}),/UNSCOPED_COMMERCIAL_DATABASE/);assert.throws(()=>financialDatabase({ADMIN_DB:finance,COMMERCIAL_CONTEXT:a}),/UNSCOPED_COMMERCIAL_DATABASE/);
 }finally{f.close();}
});
