import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduledWork} from '../src/admin.mjs';
import {acquireBackgroundLane,finishBackgroundLane,readHistoricalCostCandidates,runBackgroundHistoryWork} from '../src/historical-cost-orchestration.mjs';
import {readBusinessReconciliation} from '../src/business-reconciliation.mjs';
import {runBusinessFinancialAudits} from '../src/financial-audit-orchestration.mjs';
import {MeteredHistoryD1,base,stamp,month,uuid,historyReturnsReport,publishHistoryMonth,fairnessSnapshot} from './m2-history-fixture.mjs';

async function fixture(t,{published=true}={}){
 const db=new MeteredHistoryD1(),env={ADMIN_DB:db},clock={time:base},now=()=>clock.time,calls=[];
 t.after(()=>db.db.close());assert.equal((await scheduledWork(env,{},now)).lane,'MAINTENANCE');
 const frames=published?await publishHistoryMonth(env,now):[];
 db.db.prepare('UPDATE business_sync_state SET next_run_at=?,summary=?').run(stamp+3600,JSON.stringify({month,status:'COMPLETE'}));
 const source=async(_,input)=>{calls.push({...input});return historyReturnsReport(frames.find(frame=>frame.run_id===input.run_id),Math.floor(now()/1000));};
 return {db,env,clock,now,frames,calls,source};
}
async function finish(f,lease,work={}){return finishBackgroundLane(f.env,lease,{now:f.now,repeatHistory:work.repeatHistory??false,auditSourceReads:work.audit_source_reads??0,historyNextWork:work.historyNextWork??null});}
const historyLease=async f=>{f.db.db.prepare("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=0").run();return acquireBackgroundLane(f.env,{month},{now:f.now});};

test('two missing published Returns reports outrank permanently ready historical costs and survive an active partial replacement',async t=>{
 const f=await fixture(t),publication=f.db.db.prepare('SELECT * FROM business_month_publications').get();
 assert.equal((await readHistoricalCostCandidates(f.env,month,{now:f.now})).ready,true);
 const forbidden=[];
 for(let tick=0;tick<2;tick++){
  f.db.rpc=0;const work=await scheduledWork(f.env,{getFinanceReconciliation:f.source,getFinanceHistoricalVariantEvidence:async()=>{forbidden.push('cost');throw Error('COST_MUST_YIELD');},getFinanceBusinessPeriod:async()=>{forbidden.push('finance');throw Error('NO_MIXED_FINANCE');}},f.now);
  assert.equal(work.lane,'HISTORY');assert.equal(work.reconciliation,'CHECKED');assert.equal(f.calls.length,tick+1);assert.ok(f.db.rpc+1<=50,`Returns HISTORY binding budget: ${f.db.rpc}+1`);f.clock.time+=60000;
  // A new active partial import between audits cannot replace the frozen
  // source identity selected by the second reservation.
  if(tick===0)f.db.db.prepare('UPDATE business_month_runs SET revision=99,payload=?').run(JSON.stringify({start_date:month+'-01',end_date:month+'-25',slots:[{start_date:month+'-01',end_date:month+'-15',frame:{schema:'business_month_frame_ref_v1',run_id:uuid(99),revision:1}}]}));
 }
 const report=await readBusinessReconciliation(f.env,{month},{now:f.now});assert.equal(report.reports.length,2);assert.deepEqual(report.sources.map(row=>row.run_id),f.frames.map(row=>row.run_id));
 assert.deepEqual(f.calls.map(row=>row.run_id),f.frames.map(row=>row.run_id));assert.ok(report.reports.every(row=>row.pending.includes('SETTLEMENT_NOT_RECONCILED')));assert.deepEqual(forbidden,[]);
 assert.deepEqual(f.db.db.prepare('SELECT * FROM business_month_publications').get(),publication);assert.equal(f.db.db.prepare('SELECT revision FROM business_month_runs').get().revision,99);
 const before=fairnessSnapshot(f.db),callCount=f.calls.length;await readBusinessReconciliation(f.env,{month},{now:f.now});await readBusinessReconciliation(f.env,{month},{now:f.now});assert.deepEqual(fairnessSnapshot(f.db),before);assert.equal(f.calls.length,callCount);
});

test('a continuously due import retains four of every five ticks and two reserved reports yield to normal auxiliaries',async t=>{
 const f=await fixture(t);f.db.db.prepare('UPDATE business_sync_state SET next_run_at=0,summary=?').run(JSON.stringify({month,status:'RUNNING'}));
 const lanes=[];for(let tick=0;tick<25;tick++){
  const lease=await acquireBackgroundLane(f.env,{month},{now:f.now});lanes.push(lease.lane);let work={};
  if(lease.lane==='HISTORY'&&lease.reserved_returns)work=await runBackgroundHistoryWork(f.env,{getFinanceReconciliation:f.source},{month,lease},{now:f.now});
  await finish(f,lease,work);f.clock.time+=60000;
 }
 assert.deepEqual(lanes.slice(0,5),['FINANCE','FINANCE','FINANCE','FINANCE','HISTORY']);assert.equal(lanes.filter(lane=>lane==='FINANCE').length,20);assert.equal(f.calls.length,2);assert.ok(lanes.includes('CATALOG'));assert.ok(lanes.includes('REGISTRY'));
 assert.ok((await readBusinessReconciliation(f.env,{month},{now:f.now})).reports.length===2);
});

test('normal HISTORY alternates a perpetual cost continuation with one audit then advances other auxiliaries',async t=>{
 const f=await fixture(t,{published:false}),calls=[];
 const readCandidates=async()=>({status:'READY',ready:true,item_ids:['100']}),runCost=async(_,__,source)=>{await source();return {work:'PROGRESSED',scan:{complete:false}};};
 const runAudit=async(_,sources,selection,options)=>runBusinessFinancialAudits(f.env,sources,selection,{...options,runReleases:async(_,source)=>{await source();return {status:'CHECKED',repeat:true};}});
 const sources={getFinanceHistoricalVariantEvidence:async()=>calls.push('COST'),getFinanceEscrowReleases:async()=>calls.push('AUDIT')};
 let lease=await historyLease(f),work=await runBackgroundHistoryWork(f.env,sources,{month,lease},{now:f.now,readCandidates,runCost,runAudits:runAudit});assert.equal(work.repeatHistory,true);assert.equal(work.source_reads,1);assert.equal(work.audit_source_reads,0);await finish(f,lease,work);
 lease=await acquireBackgroundLane(f.env,{month},{now:f.now});assert.equal(lease.lane,'FINANCE');await finish(f,lease);
 lease=await acquireBackgroundLane(f.env,{month},{now:f.now});assert.equal(lease.lane,'HISTORY');assert.equal(lease.history_turn,'AUDIT');work=await runBackgroundHistoryWork(f.env,sources,{month,lease},{now:f.now,readCandidates,runCost,runAudits:runAudit});assert.equal(work.repeatHistory,false,'an audit continuation cannot pin HISTORY');assert.equal(work.source_reads,1);assert.equal(work.audit_source_reads,1);await finish(f,lease,work);
 lease=await acquireBackgroundLane(f.env,{month},{now:f.now});await finish(f,lease);lease=await acquireBackgroundLane(f.env,{month},{now:f.now});assert.equal(lease.lane,'CATALOG');await finish(f,lease);assert.deepEqual(calls,['COST','AUDIT']);assert.equal(fairnessSnapshot(f.db).next_history_work,'COST');
});

test('a reserved burst of two still releases a normal auxiliary when each publication becomes obsolete',async t=>{
 const f=await fixture(t);f.db.db.prepare("UPDATE background_collection_lane_state SET auxiliary_index=1").run();
 const lanes=[];for(let tick=0;tick<4;tick++){
  // Keep reporting gaps eligible to model successive immutable publications.
  const lease=await acquireBackgroundLane(f.env,{month},{now:f.now});lanes.push([lease.lane,lease.reserved_returns]);
  if(lease.reserved_returns)await finishBackgroundLane(f.env,lease,{now:f.now,auditSourceReads:1});else await finish(f,lease);
  f.clock.time+=60000;
 }
 assert.deepEqual(lanes,[['HISTORY',true],['HISTORY',true],['FINANCE',false],['CATALOG',false]]);assert.equal(fairnessSnapshot(f.db).reserved_returns_streak,0);
});

test('Returns backoff and mismatched old reports do not masquerade as current publication coverage',async t=>{
 const f=await fixture(t);
 for(const frame of f.frames){const old=historyReturnsReport(frame);f.db.db.prepare('INSERT INTO business_reconciliation_reports VALUES(?,?,?,?,?,?)').run(frame.run_id,frame.revision-1,frame.start_date,frame.end_date,JSON.stringify(old),stamp);f.db.db.prepare('INSERT INTO business_reconciliation_attempts VALUES(?,?,?,?,?,?)').run(frame.run_id,frame.revision,stamp,'UNAVAILABLE','FINANCE_RECONCILIATION_PERMISSION_REQUIRED',stamp+3600);}
 let lease=await acquireBackgroundLane(f.env,{month},{now:f.now});assert.equal(lease.reserved_returns,false);await finish(f,lease);
 f.db.db.prepare('UPDATE business_sync_state SET next_run_at=?').run(stamp+7200);
 f.clock.time+=3601000;lease=await acquireBackgroundLane(f.env,{month},{now:f.now});assert.equal(lease.reserved_returns,true);await finish(f,lease);
});

test('a corrupt or out-of-range retry timestamp cannot suppress missing-report scheduling indefinitely',async t=>{
 for(const invalid of ['not-a-timestamp',10000000000]){
  const f=await fixture(t);
  for(const frame of f.frames)f.db.db.prepare('INSERT INTO business_reconciliation_attempts VALUES(?,?,?,?,?,?)').run(frame.run_id,frame.revision,stamp,'UNAVAILABLE','FINANCE_RECONCILIATION_RESPONSE_INVALID',invalid);
  const lease=await acquireBackgroundLane(f.env,{month},{now:f.now});assert.equal(lease.reserved_returns,true);await finish(f,lease);
 }
});

test('persistent local cost-selection errors still yield the next HISTORY opportunity to auditing',async t=>{
 const f=await fixture(t,{published:false});let lease=await historyLease(f),called=0;
 const first=await runBackgroundHistoryWork(f.env,{}, {month,lease},{now:f.now,readCandidates:async()=>{throw Error('LOCAL_COST_STORAGE_ERROR');}});assert.equal(first.history,'ERROR');assert.equal(first.historyNextWork,'AUDIT');await finish(f,lease,first);
 lease=await historyLease(f);assert.equal(lease.history_turn,'AUDIT');const second=await runBackgroundHistoryWork(f.env,{getFinanceReconciliation:async()=>called++},{month,lease},{now:f.now,readCandidates:async()=>{throw Error('MUST_NOT_READ_COSTS');},runAudits:async(_,services)=>{await services.getFinanceReconciliation();return {returns_status:'CHECKED',releases_status:'DEFERRED',income_status:'DEFERRED',income_detail_status:'DEFERRED'};}});
 assert.equal(called,1);assert.equal(second.audit_source_reads,1);assert.equal(second.historyNextWork,'COST');await finish(f,lease,second);
});

test('local source absence defers urgent retries but does not forgive accumulated Finance debt',async t=>{
 const f=await fixture(t);f.db.db.prepare('UPDATE background_history_fairness_state SET finance_since_audit=4').run();
 const lease=await acquireBackgroundLane(f.env,{month},{now:f.now}),work=await runBackgroundHistoryWork(f.env,{}, {month,lease},{now:f.now});assert.equal(work.reconciliation,'NO_SOURCE');assert.equal(work.source_reads,0);await finish(f,lease,work);
 const saved=fairnessSnapshot(f.db);assert.equal(saved.finance_since_audit,4);assert.equal(saved.returns_retry_at,stamp+300);assert.equal(saved.reserved_returns_streak,1);
 f.clock.time+=60000;const next=await acquireBackgroundLane(f.env,{month},{now:f.now});assert.equal(next.reserved_returns,false);await finish(f,next);
});

test('permanent zero-read Returns reservations cannot consume every auxiliary opportunity during a busy import',async t=>{
 const f=await fixture(t);f.db.db.prepare('UPDATE business_sync_state SET next_run_at=0,summary=?').run(JSON.stringify({month,status:'RUNNING'}));
 const lanes=[],reserved=[];for(let tick=0;tick<45;tick++){
  const lease=await acquireBackgroundLane(f.env,{month},{now:f.now});lanes.push(lease.lane);reserved.push(lease.reserved_returns);let work={};
  if(lease.reserved_returns)work=await runBackgroundHistoryWork(f.env,{}, {month,lease},{now:f.now});
  await finish(f,lease,work);f.clock.time+=60000;
 }
 assert.equal(lanes.filter(value=>value==='FINANCE').length,36);assert.ok(lanes.includes('CATALOG'),'failed priority work must still release normal auxiliary turns');assert.ok(lanes.includes('REGISTRY'));assert.equal(fairnessSnapshot(f.db).finance_since_audit,4,'zero private audit reads never forgive Finance debt');assert.equal(f.calls.length,0);
 assert.equal(reserved.filter(Boolean).length,6);
});

for(const fence of ['pause','replacement','expiry'])test(`a ${fence} fence prevents sources and stale fairness metadata commits`,async t=>{
 const f=await fixture(t),lease=await acquireBackgroundLane(f.env,{month},{now:f.now}),before=fairnessSnapshot(f.db);let called=0;
 if(fence==='pause')f.db.db.prepare('UPDATE business_sync_state SET enabled=0').run();
 if(fence==='replacement')f.db.db.prepare('UPDATE background_collection_lane_state SET revision=revision+1,lease_token=?').run(crypto.randomUUID());
 if(fence==='expiry')f.clock.time+=291000;
 const work=await runBackgroundHistoryWork(f.env,{getFinanceReconciliation:async()=>{called++;}}, {month,lease},{now:f.now});assert.equal(work.history,'PAUSED');assert.equal(called,0);
 await finishBackgroundLane(f.env,lease,{now:f.now,auditSourceReads:1,historyNextWork:'AUDIT'});assert.deepEqual(fairnessSnapshot(f.db),before);
});

test('the combined history budget rejects a second private source even if a child continues after failure',async t=>{
 const f=await fixture(t,{published:false}),lease=await historyLease(f),calls=[];
 const work=await runBackgroundHistoryWork(f.env,{getFinanceHistoricalVariantEvidence:async()=>{calls.push('cost');throw Error('PRIVATE_FAILURE');}},{month,lease},{now:f.now,readCandidates:async()=>({status:'READY',ready:true,item_ids:['100']}),runCost:async(_,__,source)=>{try{await source();}catch{}await source();}});
 assert.equal(work.history,'ERROR');assert.equal(work.source_reads,1);assert.equal(work.audit_source_reads,0);assert.deepEqual(calls,['cost']);await finish(f,lease,work);
});
