import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHEMA} from '../src/admin.mjs';
import {acquireBackgroundLane,finishBackgroundLane,runBackgroundHistoryWork} from '../src/historical-cost-orchestration.mjs';
import {TrackerD1,trackerThrough as month,trackerTime as base,trackerStamp as stamp,publishTrackerMonth,trackerCoverage,trackerUuid} from './m2-release-tracker-fixture.mjs';

async function fixture(t,{importing=true}={}){
 const db=new TrackerD1(),env={ADMIN_DB:db},clock={value:base},now=()=>clock.value;t.after(()=>db.db.close());await db.batch(SCHEMA.map(sql=>db.prepare(sql)));const frames=await publishTrackerMonth(env,now);
 db.db.prepare("UPDATE business_sync_state SET enabled=1,status='RUNNING',month=?,next_run_at=?,summary=?").run(month,importing?0:stamp+3600,JSON.stringify({month,status:importing?'RUNNING':'COMPLETE'}));
 db.db.prepare("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=2").run();db.db.prepare("UPDATE background_history_fairness_state SET finance_since_audit=4,next_history_work='COST'").run();
 return {db,env,clock,now,frames};
}
const acquire=f=>acquireBackgroundLane(f.env,{month},{now:f.now,bootstrapCoverage:true});
const finish=(f,lease,work={})=>finishBackgroundLane(f.env,lease,{now:f.now,auditSourceReads:work.audit_source_reads??0,repeatHistory:work.repeatHistory??false,historyNextWork:work.historyNextWork??null});

test('a pending first coverage audit preempts Registry without losing its auxiliary slot or pending COST work',async t=>{
 const f=await fixture(t),lease=await acquire(f);assert.equal(lease.lane,'HISTORY');assert.equal(lease.coverage_bootstrap,true);assert.equal(lease.reserved_returns,false);let calls=0;f.db.rpc=0;
 const work=await runBackgroundHistoryWork(f.env,{getFinanceEscrowReleaseCoverage:async(_,input)=>{calls++;assert.equal(input.operation,'coverage');return trackerCoverage(f.frames);}},{month,lease},{now:f.now,readCandidates:async()=>{throw Error('COST_MUST_NOT_RUN');}});
 assert.equal(work.release_coverage,'COLLECTING');assert.equal(work.source_reads,1);assert.equal(work.audit_source_reads,1);assert.equal(work.historyNextWork,null);assert.equal(work.repeatHistory,false);assert.equal(calls,1);assert.ok(f.db.rpc+1<=50,`bootstrap D1/private budget ${f.db.rpc}+1`);
 await finish(f,lease,work);assert.equal(f.db.db.prepare('SELECT auxiliary_index FROM background_collection_lane_state').get().auxiliary_index,2);assert.equal(f.db.db.prepare('SELECT next_history_work FROM background_history_fairness_state').get().next_history_work,'COST');assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM financial_audit_coverage_turns WHERE month=?').get(month).n,1);
 f.clock.value+=300000;f.db.db.prepare('UPDATE business_sync_state SET next_run_at=?,summary=?').run(Math.floor(f.now()/1000)+3600,JSON.stringify({month,status:'COMPLETE'}));f.db.db.prepare("UPDATE background_collection_lane_state SET next_lane='AUXILIARY'").run();f.db.db.prepare('UPDATE background_history_fairness_state SET finance_since_audit=4').run();const next=await acquire(f);assert.equal(next.coverage_bootstrap,false);assert.equal(next.lane,'REGISTRY');await finish(f,next);
});

test('continuous imports retain four Finance opportunities before the single bootstrap audit',async t=>{
 const f=await fixture(t);f.db.db.prepare("UPDATE background_collection_lane_state SET next_lane='FINANCE'").run();f.db.db.prepare('UPDATE background_history_fairness_state SET finance_since_audit=0').run();const lanes=[];
 for(let index=0;index<5;index++){const lease=await acquire(f);lanes.push(lease.lane);await finish(f,lease);f.clock.value+=60000;}
 assert.deepEqual(lanes,['FINANCE','FINANCE','FINANCE','FINANCE','HISTORY']);assert.equal(f.db.db.prepare('SELECT auxiliary_index FROM background_collection_lane_state').get().auxiliary_index,2);
});

test('not-due Finance can yield one bootstrap even while next_lane remains FINANCE',async t=>{
 const f=await fixture(t,{importing:false});f.db.db.prepare("UPDATE background_collection_lane_state SET next_lane='FINANCE'").run();f.db.db.prepare('UPDATE background_history_fairness_state SET finance_since_audit=0').run();const lease=await acquire(f);assert.equal(lease.lane,'HISTORY');assert.equal(lease.coverage_bootstrap,true);await finish(f,lease);
});

test('Returns reservations retain priority over the first coverage audit',async t=>{
 const f=await fixture(t,{importing:false});f.db.db.prepare('INSERT INTO business_month_publications SELECT ?,1,1,1,1,?,?').run(month,trackerUuid(90),JSON.stringify({slots:[{start_date:month+'-01',end_date:month+'-10',frame:{run_id:trackerUuid(91),revision:1}}]}));const lease=await acquire(f);assert.equal(lease.lane,'HISTORY');assert.equal(lease.reserved_returns,true);assert.equal(lease.coverage_bootstrap,false);await finish(f,lease);
});

test('a marker initialized without any available service prevents repeated global bootstrap reservations',async t=>{
 const f=await fixture(t,{importing:false}),lease=await acquire(f);const work=await runBackgroundHistoryWork(f.env,{}, {month,lease},{now:f.now,readCandidates:async()=>{throw Error('COST_MUST_YIELD');}});assert.equal(work.release_coverage,'NO_SOURCE');assert.equal(work.source_reads,0);await finish(f,lease,work);
 f.clock.value+=60000;const next=await acquire(f);assert.equal(next.coverage_bootstrap,false);assert.equal(next.lane,'FINANCE');await finish(f,next);f.clock.value+=60000;const registry=await acquire(f);assert.equal(registry.lane,'REGISTRY');await finish(f,registry);
});

test('failure before marker initialization is cooled down and cannot consume Registry indefinitely',async t=>{
 const f=await fixture(t,{importing:false});f.db.db.prepare('UPDATE background_history_fairness_state SET returns_retry_at=?').run(stamp+9999);const failing=async()=>{throw Error('AUDIT_INIT_FAILED');};
 for(let index=0;index<2;index++){const lease=await acquire(f);assert.equal(lease.coverage_bootstrap,true);const work=await runBackgroundHistoryWork(f.env,{}, {month,lease},{now:f.now,runAudits:failing});assert.equal(work.history,'ERROR');await finish(f,lease,work);assert.equal(f.db.db.prepare('SELECT returns_retry_at FROM background_history_fairness_state').get().returns_retry_at,stamp+9999);f.clock.value+=300000;}
 const blocked=await acquire(f);assert.equal(blocked.coverage_bootstrap,false);assert.equal(blocked.lane,'FINANCE');await finish(f,blocked);f.clock.value+=60000;const registry=await acquire(f);assert.equal(registry.lane,'REGISTRY');assert.equal(registry.coverage_bootstrap,false);await finish(f,registry);
 assert.equal(f.db.db.prepare('SELECT auxiliary_index FROM background_collection_lane_state').get().auxiliary_index,3);
});

test('bootstrap failure cannot immediately repeat before its five-minute auxiliary cooldown',async t=>{
 const f=await fixture(t,{importing:false}),lease=await acquire(f),work=await runBackgroundHistoryWork(f.env,{}, {month,lease},{now:f.now,runAudits:async()=>{throw Error('INIT');}});await finish(f,lease,work);f.clock.value+=60000;const next=await acquire(f);assert.equal(next.coverage_bootstrap,false);await finish(f,next);
});

test('default callers never query the optional coverage marker table',async t=>{
 const f=await fixture(t);f.db.db.exec('DROP TABLE financial_audit_coverage_turns');const lease=await acquireBackgroundLane(f.env,{month},{now:f.now});assert.equal(lease.coverage_bootstrap,false);await finish(f,lease);
});

test('only a published cohort in the preceding three months makes bootstrap eligible',async t=>{
 const f=await fixture(t);f.db.db.prepare('UPDATE business_month_publications SET month=?').run('2026-07');const lease=await acquire(f);assert.equal(lease.coverage_bootstrap,false);assert.equal(lease.lane,'FINANCE');await finish(f,lease);
 await assert.rejects(()=>acquireBackgroundLane(f.env,{month:'2026-10'},{now:f.now,bootstrapCoverage:true}),/BACKGROUND_LANE_REQUEST_INVALID/);
});

for(const fence of ['pause','replacement','expiry'])test(`a ${fence} fence prevents bootstrap IO and stale fairness updates`,async t=>{
 const f=await fixture(t),lease=await acquire(f),before={...f.db.db.prepare('SELECT * FROM background_history_fairness_state').get()};let calls=0;
 if(fence==='pause')f.db.db.prepare('UPDATE business_sync_state SET enabled=0').run();if(fence==='replacement')f.db.db.prepare('UPDATE background_collection_lane_state SET revision=revision+1,lease_token=?').run(trackerUuid(99));if(fence==='expiry')f.clock.value+=291000;
 const work=await runBackgroundHistoryWork(f.env,{getFinanceEscrowReleaseCoverage:async()=>{calls++;}},{month,lease},{now:f.now});assert.equal(work.history,'PAUSED');assert.equal(calls,0);await finish(f,lease,work);assert.deepEqual({...f.db.db.prepare('SELECT * FROM background_history_fairness_state').get()},before);
});

test('bootstrap source wrappers reject a second private read even when a child continues',async t=>{
 const f=await fixture(t),lease=await acquire(f);let calls=0;const work=await runBackgroundHistoryWork(f.env,{getFinanceEscrowReleaseCoverage:async()=>{calls++;}},{month,lease},{now:f.now,runAudits:async(_,services)=>{await services.getFinanceEscrowReleaseCoverage();await services.getFinanceEscrowReleaseCoverage();}});assert.equal(work.source_reads,1);assert.equal(work.audit_source_reads,1);assert.equal(work.history,'ERROR');assert.equal(calls,1);await finish(f,lease,work);
});

test('a bootstrap source cannot use the previous month after Brasília midnight while its lease is still live',async t=>{
 const f=await fixture(t,{importing:false});f.clock.value=Date.UTC(2026,10,30,23,59,59)+3*3600000;f.db.db.prepare('UPDATE business_sync_state SET next_run_at=?').run(Math.floor(f.now()/1000)+3600);const lease=await acquire(f);assert.equal(lease.coverage_bootstrap,true);let calls=0;
 const work=await runBackgroundHistoryWork(f.env,{getFinanceEscrowReleaseCoverage:async()=>{calls++;}},{month,lease},{now:f.now,runAudits:async(_,services)=>{f.clock.value+=2000;await assert.rejects(()=>services.getFinanceEscrowReleaseCoverage(),/BACKGROUND_HISTORY_LEASE_EXPIRED/);return {coverage_status:'PAUSED'};}});
 assert.equal(work.history,'PAUSED');assert.equal(work.source_reads,0);assert.equal(calls,0);await finish(f,lease,work);
});
