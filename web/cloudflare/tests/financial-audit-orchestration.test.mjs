import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {runBusinessFinancialAudits} from '../src/financial-audit-orchestration.mjs';

const month='2026-10',time=Date.UTC(2026,9,25,15);
function fixture(t){
 const db=new D1();t.after(()=>db.db.close());const env={ADMIN_DB:db},calls=[],state={enabled:true};
 const services={getFinanceReconciliation:async()=>{calls.push('RETURNS');return {};},getFinanceEscrowReleases:async()=>{calls.push('RELEASES');return {};},getFinanceIncomeOverview:async()=>{calls.push('INCOME');return {};}};
 const runner=async(_,source)=>{await source();return {status:'CHECKED',source_reads:999,repeat:false};};
 const options={now:()=>time,canRun:async()=>state.enabled,runReturns:runner,runReleases:runner,runIncome:runner};
 return {env,db,calls,state,services,options,run:more=>runBusinessFinancialAudits(env,services,{month},{...options,...more})};
}

test('persistent audit turns rotate releases, returns and current income with exactly one actual private call per opportunity',async t=>{
 const f=fixture(t),first=await f.run(),second=await f.run(),third=await f.run();
 assert.deepEqual(f.calls,['RELEASES','RETURNS','INCOME']);
 for(const value of [first,second,third])assert.equal(value.source_reads,1,'child-reported call counts cannot inflate or hide actual calls');
 assert.equal(f.db.db.prepare('SELECT next_work FROM financial_audit_turns').get().next_work,'RELEASES');
});

test('a locally waiting queue yields to the other eligible queue without spending two source calls',async t=>{
 const f=fixture(t),value=await f.run({runReleases:async()=>({status:'RETRY_WAIT',source_reads:0,repeat:false})});
 assert.equal(value.selected,'RETURNS');assert.equal(value.releases_status,'RETRY_WAIT');assert.equal(value.source_reads,1);assert.deepEqual(f.calls,['RETURNS']);assert.equal(value.income_status,'DEFERRED');
});

test('failure after a source request cannot replay another queue and cannot pin the history lane',async t=>{
 const f=fixture(t),value=await f.run({runReleases:async(_,source)=>{await source();throw Error('private failure');}});
 assert.deepEqual(f.calls,['RELEASES']);assert.equal(value.source_reads,1);assert.equal(value.status,'ERROR');assert.equal(value.repeat,false);
 assert.equal((await f.run()).selected,'RETURNS');
});

test('the private-call budget rejects a second call even when a child swallows its first failure',async t=>{
 const f=fixture(t),value=await f.run({runReleases:async(_,source)=>{await source();await assert.rejects(async()=>source(),/FINANCIAL_AUDIT_READ_BUDGET/);return {status:'CHECKED',repeat:true};}});
 assert.deepEqual(f.calls,['RELEASES']);assert.equal(value.source_reads,1);assert.equal(value.repeat,true);
});

test('paused and concurrently leased audits never start another source; a pause during the response preserves the lease fence',async t=>{
 const f=fixture(t);f.state.enabled=false;assert.equal((await f.run()).status,'PAUSED');assert.deepEqual(f.calls,[]);f.state.enabled=true;
 let release,entered;const waiting=new Promise(resolve=>entered=resolve),pending=f.run({runReleases:async(_,source)=>{await source();entered();await new Promise(resolve=>release=resolve);return {status:'CHECKED',repeat:true};}});
 await waiting;assert.equal((await f.run()).status,'LEASED');assert.deepEqual(f.calls,['RELEASES']);f.state.enabled=false;release();const done=await pending;
 assert.equal(done.status,'PAUSED');assert.equal(done.repeat,false);assert.equal(f.db.db.prepare('SELECT lease_token FROM financial_audit_turns').get().lease_token,null);
});

test('eligible progress keeps a continuation while genuine waits, unavailable sources and invalid selectors remain bounded',async t=>{
 const f=fixture(t),progress=await f.run({runReleases:async(_,source)=>{await source();return {status:'RUNNING',repeat:true};}});assert.equal(progress.repeat,true);
 for(const status of ['UNAVAILABLE','BLOCKED','RETRY_WAIT']){const value=await f.run({runReturns:async(_,source)=>{await source();return {status,repeat:true};},runReleases:async(_,source)=>{await source();return {status,repeat:true};}});assert.equal(value.repeat,false);}
 const absent=await runBusinessFinancialAudits(f.env,{}, {month},f.options);assert.equal(absent.source_reads,0);assert.equal(absent.status,'NO_SOURCE');
 let accessed=false;const bad={};Object.defineProperty(bad,'month',{get(){accessed=true;return month;}});await assert.rejects(runBusinessFinancialAudits(f.env,f.services,bad,f.options));assert.equal(accessed,false);
 await assert.rejects(runBusinessFinancialAudits(f.env,f.services,{month:'2026-11'},f.options));
});

test('local work outliving its lease cannot start a source request after a newer owner has completed the same turn',async t=>{
 const f=fixture(t),clock={time};let release,entered;const waiting=new Promise(resolve=>entered=resolve),now=()=>clock.time;
 const old=f.run({now,runReleases:async(_,source)=>{entered();await new Promise(resolve=>release=resolve);await source();return {status:'CHECKED',repeat:true};}});
 await waiting;clock.time+=91000;const winner=await f.run({now});assert.equal(winner.selected,'RELEASES');assert.equal(winner.source_reads,1);
 release();const stale=await old;assert.equal(stale.source_reads,0);assert.equal(stale.status,'LEASED');assert.equal(stale.repeat,false);assert.deepEqual(f.calls,['RELEASES']);
 assert.equal(f.db.db.prepare('SELECT next_work FROM financial_audit_turns').get().next_work,'RETURNS');
});


test('income overview participates in the one-read budget and a local retry wait yields without starving releases',async t=>{
 const f=fixture(t);await f.run();await f.run();const income=await f.run();assert.equal(income.selected,'INCOME');assert.equal(income.income_status,'CHECKED');assert.equal(income.source_reads,1);assert.deepEqual(f.calls,['RELEASES','RETURNS','INCOME']);
 const next=await f.run({runReleases:async()=>({status:'RETRY_WAIT',source_reads:0,repeat:false})});assert.ok(['RETURNS','INCOME'].includes(next.selected));assert.equal(next.source_reads,1);
});
