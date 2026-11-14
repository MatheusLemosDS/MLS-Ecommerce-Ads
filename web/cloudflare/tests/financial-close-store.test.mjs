import test from 'node:test';
import assert from 'node:assert/strict';
import {mutateFinancialClose,readFinancialClose,normalizeFinancialPeriod,financialCloseIdentity,financialCloseGates} from '../src/financial-close-store.mjs';
import {appendFinancialEvent,readFinancialEvents,financialScopeKey} from '../src/financial-event-store.mjs';
import {financialCanonicalJSON} from '../src/financial-event-ledger.mjs';
import {financialTestFixture,financialTestScope,financialTestPeriod,financialTestEvent} from './financial-ledger-fixture.mjs';

const gates=(patch={})=>({coverage_complete:true,consistent:true,costs_complete:true,taxes_complete:true,policy_complete:true,comparisons_complete:true,blocking_pending_count:0,receivables_verified:true,cash_verified:false,...patch});
const command=(patch={})=>({scope:financialTestScope(),period:financialTestPeriod(),basis:'ACCRUAL',action:'prepare',expected_version:0,request_id:crypto.randomUUID(),reason:'synthetic-close-review',...patch});
function closingFixture(){
 const f=financialTestFixture();let gate=gates(),policy=1,cost=1590;
 const options={...f.options,buildSnapshot:async({scope,period,basis})=>{
  const source=await readFinancialEvents(f.env,{scope},f.options);
  return {ledger_revision:source.ledger_revision,snapshot:{scope,period,basis,policy_revision:policy,cost_cents:cost,event_refs:source.events.map(e=>({event_id:e.event_id,version:e.version})),known_revenue_cents:source.events.filter(e=>e.quality==='CONFIRMED').reduce((sum,e)=>sum-e.postings.filter(p=>p.account==='REVENUE').reduce((n,p)=>n+p.amount_cents,0),0)},gates:gate};
 }};
 return {...f,options,setGates(v){gate=gates(v);},setPolicy(v){policy=v;},setCost(v){cost=v;}};
}

test('cold close reads do not create tables or certify an empty financial period',async()=>{
 const f=closingFixture();try{const value=await readFinancialClose(f.env,command(),f.options);assert.equal(value.current,null);assert.equal(value.closed,null);assert.deepEqual(value.versions,[]);assert.equal(f.env.ADMIN_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);}finally{f.close();}
});

test('accrual can close a proved receivable without claiming verified bank cash',async()=>{
 const f=closingFixture();try{const first=await mutateFinancialClose(f.env,command(),f.options);assert.equal(first.close.status,'PRONTO');assert.equal(first.close.gates.cash_verified,false);const final=await mutateFinancialClose(f.env,command({action:'finalize',expected_version:1}),f.options);assert.equal(final.close.status,'FECHADO');assert.equal(final.close.version,2);assert.equal(financialCloseGates(gates(),'ACCRUAL').ready,true);assert.equal(financialCloseGates(gates(),'BANK_CASH').ready,false);
  const bank=await mutateFinancialClose(f.env,command({basis:'BANK_CASH'}),f.options);assert.equal(bank.close.status,'PROVISORIO');await assert.rejects(mutateFinancialClose(f.env,command({basis:'BANK_CASH',action:'finalize',expected_version:1}),f.options),/NOT_READY/);
 }finally{f.close();}
});

test('unknown coverage costs tax policy or unresolved differences block definitive closure',async()=>{
 for(const patch of [{coverage_complete:false},{costs_complete:false},{taxes_complete:false},{policy_complete:false},{comparisons_complete:false},{consistent:false},{receivables_verified:false},{blocking_pending_count:1}]){
  const f=closingFixture();try{f.setGates(patch);const state=await mutateFinancialClose(f.env,command(),f.options);assert.equal(state.close.status,'PROVISORIO',JSON.stringify(patch));await assert.rejects(mutateFinancialClose(f.env,command({action:'finalize',expected_version:1}),f.options),/NOT_READY/);}finally{f.close();}
 }
});

test('clock cannot finalize an unended month and unknown calendar labels are rejected',async()=>{
 const f=closingFixture();try{const period=financialTestPeriod({start_at:'2026-11-01T03:00:00.000Z',end_at:'2026-12-01T03:00:00.000Z'}),state=await mutateFinancialClose(f.env,command({period}),f.options);assert.equal(state.close.status,'ABERTO');await assert.rejects(mutateFinancialClose(f.env,command({period,action:'finalize',expected_version:1}),f.options),/NOT_READY/);
  assert.throws(()=>normalizeFinancialPeriod(financialTestPeriod({calendar_id:'UNVERIFIED_CALENDAR'})),/PERIOD_INVALID/);assert.throws(()=>normalizeFinancialPeriod({kind:'WEEK',start_at:'2026-11-06T16:00:00.000Z',end_at:'2026-11-13T16:00:00.000Z',timezone:'America/Sao_Paulo',calendar_id:'FRIDAY_13_TO_FRIDAY_13'}),/PERIOD_INVALID/);
  assert.deepEqual(normalizeFinancialPeriod(financialTestPeriod()),normalizeFinancialPeriod(financialTestPeriod({calendar_id:'CIVIL_MONTH'})));
 }finally{f.close();}
});

test('retries and no-op prepare requests return their immutable version after later changes',async()=>{
 const f=closingFixture();try{const body=command(),first=await mutateFinancialClose(f.env,body,f.options);assert.equal((await mutateFinancialClose(f.env,body,f.options)).close.version,first.close.version);
  const noOp=command({expected_version:1}),same=await mutateFinancialClose(f.env,noOp,f.options);assert.equal(same.changed,false);assert.equal(same.close.version,1);f.setCost(1350);
  const later=await mutateFinancialClose(f.env,command({expected_version:1}),f.options);assert.equal(later.close.version,2);assert.equal((await mutateFinancialClose(f.env,noOp,f.options)).close.version,1,'an acknowledged no-op cannot become a new close after source changes');
  await assert.rejects(mutateFinancialClose(f.env,{...body,reason:'changed request meaning'},f.options),/REQUEST_CONFLICT/);
 }finally{f.close();}
});

test('a closed snapshot survives cost policy and source changes until explicit versioned rectification',async()=>{
 const f=closingFixture();try{const event=await financialTestEvent();await appendFinancialEvent(f.env,{scope:event.scope,event,expected_revision:0,request_id:crypto.randomUUID()},f.options);await mutateFinancialClose(f.env,command(),f.options);const closed=await mutateFinancialClose(f.env,command({action:'finalize',expected_version:1}),f.options),bytes=financialCanonicalJSON(closed.close);
  f.setCost(1350);f.setPolicy(2);const body=command({expected_version:2}),unchanged=await mutateFinancialClose(f.env,body,f.options);assert.equal(unchanged.needs_rectification,true);assert.equal(financialCanonicalJSON(unchanged.close),bytes);
  const corrected=await mutateFinancialClose(f.env,command({action:'rectify',expected_version:2,reason:'synthetic-documented-correction'}),f.options);assert.equal(corrected.close.status,'RETIFICADO');assert.equal(corrected.close.version,3);assert.equal(corrected.close.replaces_closed_version,2);assert.equal(corrected.close.snapshot.cost_cents,1350);
  const replay=await mutateFinancialClose(f.env,body,f.options);assert.equal(replay.close.version,2);assert.equal(replay.needs_rectification,true);const history=await readFinancialClose(f.env,command(),f.options);assert.equal(financialCanonicalJSON(history.versions[1]),bytes);assert.equal(history.closed.version,3);assert.equal(history.versions[2].previous_version,2);
  assert.throws(()=>f.env.ADMIN_DB.db.prepare('UPDATE financial_close_revisions SET snapshot_hash=?').run('a'.repeat(64)),/immutable/);assert.throws(()=>f.env.ADMIN_DB.db.prepare('DELETE FROM financial_close_revisions').run(),/immutable/);
 }finally{f.close();}
});

test('late event creates one rectified version and replay does not duplicate it',async()=>{
 const f=closingFixture();try{await mutateFinancialClose(f.env,command(),f.options);await mutateFinancialClose(f.env,command({action:'finalize',expected_version:1}),f.options);const late=await financialTestEvent();await appendFinancialEvent(f.env,{scope:late.scope,event:late,expected_revision:0,request_id:crypto.randomUUID()},f.options);
  const body=command({action:'rectify',expected_version:2,reason:'synthetic-late-settlement'}),corrected=await mutateFinancialClose(f.env,body,f.options),retry=await mutateFinancialClose(f.env,body,f.options);assert.equal(corrected.close.version,3);assert.equal(retry.close.version,3);assert.equal(corrected.close.snapshot.known_revenue_cents,10000);assert.equal(f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM financial_close_revisions').get().n,3);
 }finally{f.close();}
});

test('server snapshots cannot certify another tenant or accept client-supplied totals',async()=>{
 const f=closingFixture();try{await assert.rejects(mutateFinancialClose(f.env,{...command(),snapshot:{net_cents:10000}},f.options),/REQUEST_INVALID/);await assert.rejects(mutateFinancialClose(f.env,command(),{...f.options,buildSnapshot:async input=>({ledger_revision:0,snapshot:{...input,scope:financialTestScope({organization_id:'other-company'})},gates:gates()})}),/SCOPE_MISMATCH/);
  const scopeB=financialTestScope({organization_id:'synthetic-org-b'}),first=await mutateFinancialClose(f.env,command(),f.options),other=await readFinancialClose(f.env,command({scope:scopeB}),f.options);assert.notEqual(first.close.close_id,other.close_id);assert.equal(other.current,null);f.revoke();await assert.rejects(readFinancialClose(f.env,command(),f.options),e=>e.status===403);
 }finally{f.close();}
});

test('a concurrent ledger revision aborts a close snapshot without creating a partial version',async()=>{
 const f=closingFixture();try{const base=f.options.buildSnapshot;let armed=true;const options={...f.options,buildSnapshot:async input=>{const built=await base(input);if(armed){armed=false;const event=await financialTestEvent();await appendFinancialEvent(f.env,{scope:event.scope,event,expected_revision:0,request_id:crypto.randomUUID()},f.options);}return built;}};
  await assert.rejects(mutateFinancialClose(f.env,command(),options),/SOURCE_CHANGED/);const read=await readFinancialClose(f.env,command(),f.options);assert.equal(read.current,null);assert.equal(f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM financial_close_revisions').get().n,0);
 }finally{f.close();}
});

test('dropping the request audit rolls back both close head and immutable history',async()=>{
 const f=closingFixture();try{const db=f.env.ADMIN_DB,prepare=db.prepare.bind(db);let armed=true;db.prepare=sql=>armed&&sql.startsWith('INSERT INTO financial_close_requests')?(armed=false,prepare('SELECT 0 dropped_audit')):prepare(sql);await assert.rejects(mutateFinancialClose(f.env,command(),f.options),e=>e.status===503);const read=await readFinancialClose(f.env,command(),f.options);assert.equal(read.current,null);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM financial_close_revisions').get().n,0);
 }finally{f.close();}
});

test('revoking automatic-close approval during a job defeats the same transactional snapshot fence',async()=>{
 const f=closingFixture();try{
  const key=await financialScopeKey(financialTestScope()),raw=f.env.ADMIN_DB.db;raw.exec('CREATE TABLE financial_automation_heads(scope_key TEXT,kind TEXT,version INTEGER,PRIMARY KEY(scope_key,kind))');raw.prepare('INSERT INTO financial_automation_heads VALUES(?,?,?)').run(key,'CONFIG',1);
  const base=f.options.buildSnapshot;let race=false;const options={...f.options,buildSnapshot:async input=>{const built=await base(input);built.snapshot.automation_state_fences=[{kind:'CONFIG',revision:1}];if(race)raw.prepare('UPDATE financial_automation_heads SET version=2 WHERE scope_key=?').run(key);return built;}};
  await mutateFinancialClose(f.env,command(),options);race=true;await assert.rejects(mutateFinancialClose(f.env,command({action:'finalize',expected_version:1}),options),/SOURCE_CHANGED/);const state=await readFinancialClose(f.env,command(),f.options);assert.equal(state.current.version,1);assert.equal(state.current.status,'PRONTO');assert.equal(state.closed,null);
 }finally{f.close();}
});

test('another competence changing the global journal revision does not falsely require rectifying an unchanged snapshot',async()=>{
 const f=closingFixture();try{const base=f.options.buildSnapshot,options={...f.options,buildSnapshot:async input=>{const built=await base(input);built.snapshot.event_refs=[];built.snapshot.known_revenue_cents=0;return built;}};
  await mutateFinancialClose(f.env,command(),options);const original=await mutateFinancialClose(f.env,command({action:'finalize',expected_version:1}),options),later=await financialTestEvent({event_at:'2026-11-05T12:00:00.000Z',competence_at:'2026-11-05T12:00:00.000Z',source_updated_at:'2026-11-05T12:00:00.000Z'});await appendFinancialEvent(f.env,{scope:later.scope,event:later,expected_revision:0,request_id:crypto.randomUUID()},f.options);
  const read=await mutateFinancialClose(f.env,command({expected_version:2}),options);assert.equal(read.needs_rectification,false);assert.equal(read.close.snapshot_hash,original.close.snapshot_hash);assert.equal(read.close.version,2);
 }finally{f.close();}
});
