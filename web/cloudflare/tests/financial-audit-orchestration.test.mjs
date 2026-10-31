import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {FINANCIAL_AUDIT_SCHEMA,runBusinessFinancialAudits} from '../src/financial-audit-orchestration.mjs';

const month='2026-10',time=Date.UTC(2026,9,25,15);
function fixture(t){
 const db=new D1();t.after(()=>db.db.close());db.db.exec(FINANCIAL_AUDIT_SCHEMA.join(';'));db.db.prepare("INSERT INTO financial_audit_turns(month,revision,next_work) VALUES(?,1,'RELEASES')").run(month);db.db.prepare('INSERT INTO financial_audit_coverage_turns VALUES(?,0)').run(month);const env={ADMIN_DB:db},calls=[],state={enabled:true};
 const services={getFinanceReconciliation:async()=>{calls.push('RETURNS');return {};},getFinanceEscrowReleases:async()=>{calls.push('RELEASES');return {};},getFinanceIncomeOverview:async()=>{calls.push('INCOME');return {};},getFinanceIncomeDetail:async()=>{calls.push('INCOME_DETAIL');return {};},getFinanceEscrowReleaseCoverage:async()=>{calls.push('COVERAGE');return {};}};
 const runner=async(_,source)=>{await source();return {status:'CHECKED',source_reads:999,repeat:false};};
 const options={now:()=>time,canRun:async()=>state.enabled,runReturns:runner,runReleases:runner,runIncome:runner,runIncomeDetail:runner,runCoverage:runner};
 return {env,db,calls,state,services,options,run:more=>runBusinessFinancialAudits(env,services,{month},{...options,...more})};
}

test('persistent audit turns rotate all five financial audits with exactly one private call per opportunity',async t=>{
 const f=fixture(t),first=await f.run(),second=await f.run(),third=await f.run(),fourth=await f.run(),fifth=await f.run();
 assert.deepEqual(f.calls,['RELEASES','RETURNS','INCOME','INCOME_DETAIL','COVERAGE']);
 for(const value of [first,second,third,fourth,fifth])assert.equal(value.source_reads,1,'child-reported call counts cannot inflate or hide actual calls');
 assert.equal(f.db.db.prepare('SELECT next_work FROM financial_audit_turns').get().next_work,'RELEASES');
});

test('a locally waiting queue yields to the other eligible queue without spending two source calls',async t=>{
 const f=fixture(t),value=await f.run({runReleases:async()=>({status:'RETRY_WAIT',source_reads:0,repeat:false})});
 assert.equal(value.selected,'RETURNS');assert.equal(value.releases_status,'RETRY_WAIT');assert.equal(value.source_reads,1);assert.deepEqual(f.calls,['RETURNS']);assert.equal(value.income_status,'DEFERRED');assert.equal(value.income_detail_status,'DEFERRED');
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
 const next=await f.run({runReleases:async()=>({status:'RETRY_WAIT',source_reads:0,repeat:false})});assert.ok(['RETURNS','INCOME','INCOME_DETAIL','COVERAGE'].includes(next.selected));assert.equal(next.source_reads,1);
});


test('Pending detail can yield locally when overview is empty and cannot spend a second provider read',async t=>{
 const f=fixture(t);await f.run();await f.run();await f.run();
 const value=await f.run({runIncomeDetail:async()=>({status:'NO_PENDING',source_reads:0,repeat:false})});
 assert.equal(value.selected,'RELEASES');assert.equal(value.income_detail_status,'NO_PENDING');assert.equal(value.source_reads,1);assert.equal(f.calls.at(-1),'RELEASES');assert.equal(f.db.db.prepare('SELECT pending FROM financial_audit_coverage_turns').get().pending,1);
});


test('coverage uses its dedicated service and a local retry yields to the next eligible audit',async t=>{
 const f=fixture(t);for(let index=0;index<4;index++)await f.run();
 const value=await f.run({runCoverage:async(_,source,input)=>{assert.deepEqual(input,{through_month:'2026-10'});return {status:'RETRY_WAIT',service_reads:0};}});
 assert.equal(value.coverage_status,'RETRY_WAIT');assert.equal(value.selected,'RELEASES');assert.equal(value.source_reads,1);assert.equal(f.calls.at(-1),'RELEASES');
});

test('coverage cannot hide extra private reads or pin the audit ring after a failure',async t=>{
 const f=fixture(t);for(let index=0;index<4;index++)await f.run();
 const value=await f.run({runCoverage:async(_,source)=>{await source();await assert.rejects(()=>source(),/FINANCIAL_AUDIT_READ_BUDGET/);throw Error('coverage failure');}});
 assert.equal(value.selected,'COVERAGE');assert.equal(value.coverage_status,'ERROR');assert.equal(value.source_reads,1);assert.equal(value.repeat,false);assert.equal(f.calls.at(-1),'COVERAGE');assert.equal((await f.run()).selected,'RELEASES');
});


test('the additive cold-start coverage turn preserves the legacy cursor and does not bootstrap repeatedly',async t=>{
 const f=fixture(t);f.db.db.prepare('DELETE FROM financial_audit_coverage_turns').run();
 const first=await f.run();assert.equal(first.selected,'COVERAGE');assert.equal(first.source_reads,1);assert.equal(first.repeat,false);assert.equal(f.db.db.prepare('SELECT next_work FROM financial_audit_turns').get().next_work,'RELEASES');
 assert.equal(f.db.db.prepare('SELECT pending FROM financial_audit_coverage_turns').get().pending,0);
 const second=await f.run();assert.equal(second.selected,'RELEASES');assert.deepEqual(f.calls,['COVERAGE','RELEASES']);
});

test('every persisted turn remains accepted by the four-work rollback Worker',async t=>{
 const f=fixture(t);
 for(let index=0;index<12;index++){await f.run();assert.ok(['RELEASES','RETURNS','INCOME','INCOME_DETAIL'].includes(f.db.db.prepare('SELECT next_work FROM financial_audit_turns').get().next_work));}
 assert.equal(f.calls.filter(kind=>kind==='COVERAGE').length,2);
});

test('pausing before a pending coverage opportunity retains it for the next invocation',async t=>{
 const f=fixture(t);f.db.db.prepare('UPDATE financial_audit_coverage_turns SET pending=1').run();let checks=0;
 const paused=await f.run({canRun:async()=>++checks<2});assert.equal(paused.status,'PAUSED');assert.equal(paused.source_reads,0);assert.equal(f.db.db.prepare('SELECT pending FROM financial_audit_coverage_turns').get().pending,1);
 assert.equal((await f.run()).selected,'COVERAGE');
});

test('an expired audit cannot overwrite the coverage pending flag committed by the lease winner',async t=>{
 const f=fixture(t),clock={value:time};f.db.db.prepare('UPDATE financial_audit_coverage_turns SET pending=1').run();let resume,entered;const waiting=new Promise(resolve=>entered=resolve);
 const old=f.run({now:()=>clock.value,runCoverage:async(_,source)=>{entered();await new Promise(resolve=>resume=resolve);await source();return {status:'CHECKED'};}});
 await waiting;clock.value+=91000;const winner=await f.run({now:()=>clock.value});assert.equal(winner.selected,'COVERAGE');assert.equal(f.db.db.prepare('SELECT pending FROM financial_audit_coverage_turns').get().pending,0);
 resume();const stale=await old;assert.equal(stale.source_reads,0);assert.equal(stale.status,'LEASED');assert.equal(f.db.db.prepare('SELECT pending FROM financial_audit_coverage_turns').get().pending,0);assert.equal(f.db.db.prepare('SELECT next_work FROM financial_audit_turns').get().next_work,'RELEASES');
});
