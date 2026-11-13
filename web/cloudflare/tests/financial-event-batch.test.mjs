import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFinancialEvents,appendFinancialEvent,readFinancialEvents,readFinancialEventHistory,ensureFinancialEventSchema} from '../src/financial-event-store.mjs';
import {financialTestEvent,financialTestScope,financialTestFixture} from './financial-ledger-fixture.mjs';

const events=async count=>Promise.all(Array.from({length:count},(_,n)=>financialTestEvent({source:{provider:'SHOPEE',family:'ORDER',native_id:'synthetic-bulk-'+n,identity:'NATIVE_ID',identity_key:null}})));
const input=(events,expected_revision=0,request_id=crypto.randomUUID())=>({scope:financialTestScope(),events,expected_revision,request_id});

test('100 events use two bounded warm D1 batches rather than per-order roundtrips',async()=>{
 const f=financialTestFixture();try{await ensureFinancialEventSchema(f.env,financialTestScope(),f.options);const db=f.env.ADMIN_DB,batch=db.batch.bind(db),counts=[];db.batch=async rows=>{counts.push(rows.length);return batch(rows);};
  const facts=await events(100),result=await appendFinancialEvents(f.env,input(facts),f.options);assert.equal(result.changed_count,100);assert.equal(result.ledger_revision,100);assert.equal(result.event_refs.length,100);assert.deepEqual(counts,[3,8]);assert.ok(counts.reduce((a,b)=>a+b,0)<=20);
  const read=await readFinancialEvents(f.env,{scope:financialTestScope(),limit:500},f.options);assert.equal(read.events.length,100);assert.equal(read.events.reduce((sum,e)=>sum-e.postings.find(p=>p.account==='REVENUE').amount_cents,0),1000000);
 }finally{f.close();}
});

test('lost acknowledgement replay ignores a newer caller revision and observation clock',async()=>{
 const f=financialTestFixture();try{await ensureFinancialEventSchema(f.env,financialTestScope(),f.options);const db=f.env.ADMIN_DB,batch=db.batch.bind(db),prepare=db.prepare.bind(db),sqls=new WeakMap();let armed=true;db.prepare=sql=>{const s=prepare(sql);sqls.set(s,sql);return s;};db.batch=async statements=>{const result=await batch(statements);if(armed&&statements.some(s=>sqls.get(s)?.startsWith('INSERT INTO financial_event_batches'))){armed=false;throw Error('synthetic lost acknowledgement after commit');}return result;};
  const facts=await events(2),body=input(facts),first=await appendFinancialEvents(f.env,body,f.options);assert.equal(first.replayed,true);assert.equal(first.ledger_revision,2);
  f.setTime('2026-11-13T17:01:00Z');const repeated=await appendFinancialEvents(f.env,{...body,expected_revision:2,events:[...facts].reverse().map(e=>({...e,observed_at:'2026-11-13T17:01:00.000Z'}))},f.options);assert.equal(repeated.replayed,true);assert.equal(repeated.ledger_revision,2);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM financial_event_revisions').get().n,2);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM financial_event_batches').get().n,1);
 }finally{f.close();}
});

test('mixed changed and unchanged observations persist only balanced replacement deltas',async()=>{
 const f=financialTestFixture();try{const facts=await events(2);await appendFinancialEvents(f.env,input(facts),f.options);const changed={...facts[0],postings:facts[0].postings.map(p=>({...p,amount_cents:p.amount_cents/2}))},result=await appendFinancialEvents(f.env,input([changed,facts[1]],2),f.options);assert.equal(result.changed_count,1);assert.equal(result.unchanged_count,1);assert.equal(result.ledger_revision,3);
  const history=await readFinancialEventHistory(f.env,{scope:changed.scope,event_id:changed.event_id},f.options);assert.equal(history.versions.length,2);assert.equal(history.versions[1].delta[0].amount_cents,-5000);
  const noOp=await appendFinancialEvents(f.env,input([changed,facts[1]],0),f.options);assert.equal(noOp.changed_count,0);assert.equal(noOp.ledger_revision,3);assert.equal(f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM financial_event_revisions').get().n,3);
 }finally{f.close();}
});

test('a concurrent single-event mutation defeats the whole bulk CAS without partial facts',async()=>{
 const f=financialTestFixture();try{await ensureFinancialEventSchema(f.env,financialTestScope(),f.options);const db=f.env.ADMIN_DB,batch=db.batch.bind(db),prepare=db.prepare.bind(db),sqls=new WeakMap();let armed=true;db.prepare=sql=>{const s=prepare(sql);sqls.set(s,sql);return s;};
  const facts=await events(2),racing=await financialTestEvent({source:{...facts[0].source,native_id:'synthetic-other-order'}});db.batch=async statements=>{if(armed&&statements.some(s=>sqls.get(s)?.startsWith('UPDATE financial_ledger_state'))){armed=false;await appendFinancialEvent(f.env,{scope:racing.scope,event:racing,expected_revision:0,request_id:crypto.randomUUID()},f.options);}return batch(statements);};
  await assert.rejects(appendFinancialEvents(f.env,input(facts),f.options),/REVISION_CONFLICT/);const read=await readFinancialEvents(f.env,{scope:racing.scope},f.options);assert.equal(read.ledger_revision,1);assert.deepEqual(read.events.map(e=>e.event_id),[racing.event_id]);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM financial_event_batches').get().n,0);
 }finally{f.close();}
});

test('missing a bulk head or audit statement rolls back the complete batch',async()=>{
 for(const dropped of ['INSERT INTO financial_event_heads','INSERT INTO financial_event_batches']){
  const f=financialTestFixture();try{await ensureFinancialEventSchema(f.env,financialTestScope(),f.options);const db=f.env.ADMIN_DB,prepare=db.prepare.bind(db);let armed=true;db.prepare=sql=>armed&&sql.startsWith(dropped)?(armed=false,prepare('SELECT 0 synthetic_missing_statement')):prepare(sql);
   await assert.rejects(appendFinancialEvents(f.env,input(await events(2)),f.options),e=>e.status===503);const read=await readFinancialEvents(f.env,{scope:financialTestScope()},f.options);assert.equal(read.ledger_revision,0);assert.deepEqual(read.events,[]);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM financial_event_revisions').get().n,0);
  }finally{f.close();}
 }
});

test('duplicate native facts, foreign scopes and changed request meaning are rejected',async()=>{
 const f=financialTestFixture();try{const facts=await events(2);await assert.rejects(appendFinancialEvents(f.env,input([facts[0],facts[0]]),f.options),/IDENTITY_INVALID/);const body=input(facts);await appendFinancialEvents(f.env,body,f.options);
  await assert.rejects(appendFinancialEvents(f.env,{...body,events:[facts[0]]},f.options),/REQUEST_CONFLICT/);await assert.rejects(appendFinancialEvents(f.env,input([{...facts[0],scope:financialTestScope({organization_id:'foreign-company'})}],2),f.options),/SCOPE_MISMATCH/);f.revoke();await assert.rejects(appendFinancialEvents(f.env,input(facts,2),f.options),e=>e.status===403);
 }finally{f.close();}
});
