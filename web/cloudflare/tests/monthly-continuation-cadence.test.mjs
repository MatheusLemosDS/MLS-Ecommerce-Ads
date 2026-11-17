import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {continuationCadenceFixture,runContinuationMinute} from './monthly-continuation-cadence-fixture.mjs';
import {acquireBackgroundLane,finishBackgroundLane} from '../src/historical-cost-orchestration.mjs';

test('real SQLite planner and Finance finish the 421-order recapture before illustrative 13h turnover while Finance, all protected budgets and ordinary fronts progress',async t=>{
 const f=await continuationCadenceFixture(t,{bootstrapPending:true}),trace=[],monthly=[];let lastPublication=f.original;
 for(let elapsed=18;elapsed<780;elapsed++){
  const event=await runContinuationMinute(f,elapsed);trace.push({elapsed,kind:event.kind});if(event.kind==='MONTHLY')monthly.push(elapsed);
  const current=await f.state();assert.equal(current.status,'RUNNING');assert.equal(current.failure_count,0);assert.equal(current.last_error,null);assert.equal(current.summary.status,'RUNNING');
  lastPublication=await f.publication();if(lastPublication.row.revision>f.original.row.revision)break;
  assert.deepEqual(lastPublication,f.original,'the prior immutable publication survives every partial continuation');
 }
 const kinds=Object.fromEntries([...new Set(trace.map(row=>row.kind))].map(kind=>[kind,trace.filter(row=>row.kind===kind).length])),last=trace.at(-1).elapsed;
 assert.equal(lastPublication.payload.slots.reduce((sum,slot)=>sum+slot.frame.coverage.orders,0),421);assert.ok(lastPublication.row.revision>f.original.row.revision);assert.ok(last<780);assert.equal(monthly.length,25);assert.ok(lastPublication.payload.slots.every(slot=>f.source.exists(slot.frame.run_id)));assert.ok(f.source.metrics.max_run_count<=60);assert.ok(kinds.FINANCE>4);assert.ok(kinds.SCAN_BUDGET>2);assert.ok(kinds.RETURNS_BUDGET>2);assert.ok(kinds.BOOTSTRAP_BUDGET>2);for(const front of ['CATALOG','REGISTRY','PRODUCTION','COSTS','ORDINARY_HISTORY'])assert.ok(kinds[front]>0,front+' receives a real planner opportunity');
 for(let index=1;index<monthly.length;index++){
  assert.ok(monthly[index]-monthly[index-1]<=30,'healthy cron priority returns within a bounded number of eligible opportunities, without a real-world deadline claim');
  const eligibleAfterCooldown=trace.filter(row=>row.elapsed>=monthly[index-1]+15&&row.elapsed<=monthly[index]&&!['FINANCE','RESERVED_MINUTE'].includes(row.kind));assert.ok(eligibleAfterCooldown.length<=2,'a due healthy monthly continuation wins within two eligible AUX opportunities after cooldown');
  assert.ok(trace.some(row=>row.elapsed>monthly[index-1]&&row.elapsed<monthly[index]&&!['FINANCE','RESERVED_MINUTE','MONTHLY'].includes(row.kind)),'at least one other auxiliary opportunity separates monthly source turns');
 }assert.equal(f.source.calls.payment,0);assert.equal(f.source.calls.external,0);
 t.diagnostic(JSON.stringify({environment:'LOCAL_SYNTHETIC_SQLITE',finished_after_minutes:last,monthly_turns:monthly.length,total_source_turns:monthly.length+1,max_monthly_gap_minutes:Math.max(...monthly.slice(1).map((value,index)=>value-monthly[index])),lane_opportunities:kinds,all_sources_present:true,source_cap:f.source.metrics.max_run_count,external_calls:0}));
});

test('when both current/previous Returns and initial coverage stay due, the two-reservation shared burst offers Returns then bootstrap and releases the ordinary ring',async t=>{
 const f=await continuationCadenceFixture(t,{bootstrapPending:true});await f.advance(23);const options={now:f.source.now,bootstrapCoverage:true,pendingIncomeScan:true,previousMonthReturns:true,monthlyContinuation:true},stamp=Math.floor(f.source.now()/1000);
 f.db.prepare("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=3").run();f.db.prepare('UPDATE background_history_fairness_state SET finance_since_audit=4,last_auxiliary_at=?,reserved_returns_streak=0').run(stamp-301);f.db.prepare('UPDATE background_pending_income_scan_turns SET reserved_streak=2').run();
 let lease=await acquireBackgroundLane(f.env,{month:'2026-11'},options);assert.equal(lease.reserved_returns,true);assert.equal(lease.coverage_bootstrap,false);await finishBackgroundLane(f.env,lease,{now:f.source.now,auditSourceReads:1});
 await f.advance(29);f.db.prepare("UPDATE background_collection_lane_state SET next_lane='AUXILIARY'").run();f.db.prepare('UPDATE background_history_fairness_state SET finance_since_audit=4').run();lease=await acquireBackgroundLane(f.env,{month:'2026-11'},options);assert.equal(lease.reserved_returns,false);assert.equal(lease.coverage_bootstrap,true);await finishBackgroundLane(f.env,lease,{now:f.source.now,auditSourceReads:1});assert.equal(f.db.prepare('SELECT reserved_returns_streak FROM background_history_fairness_state').get().reserved_returns_streak,2);
 // Before the ordinary turn, monthly work may consume one bounded offer but
 // cannot reset either protected burst or move the production cursor.
 await f.advance(36);f.db.prepare("UPDATE background_collection_lane_state SET next_lane='AUXILIARY'").run();f.db.prepare('UPDATE background_history_fairness_state SET finance_since_audit=4').run();lease=await acquireBackgroundLane(f.env,{month:'2026-11'},options);assert.equal(lease.monthly_history_continuation,true);await finishBackgroundLane(f.env,lease,{now:f.source.now});
 await f.advance(41);f.db.prepare("UPDATE background_collection_lane_state SET next_lane='AUXILIARY'").run();f.db.prepare('UPDATE background_history_fairness_state SET finance_since_audit=4').run();lease=await acquireBackgroundLane(f.env,{month:'2026-11'},options);assert.equal(lease.lane,'PRODUCTION');assert.equal(lease.monthly_history_continuation,undefined);await finishBackgroundLane(f.env,lease,{now:f.source.now});assert.equal(f.db.prepare('SELECT auxiliary_index FROM background_collection_lane_state').get().auxiliary_index,4);
});

for(const minify of [false,true])test('generated App uses a priority monthly continuation outside HISTORY index0 and retains the old publication (minify='+minify+')',async t=>{
 const f=await continuationCadenceFixture(t),raw=await readFile(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8'),compiled=await build({stdin:{contents:raw+'\nexport {brazaAdmin as continuationSmoke};',loader:'js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify}),{continuationSmoke}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 await f.advance(38);const stamp=Math.floor(f.source.now()/1000);f.db.prepare("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=3").run();f.db.prepare('UPDATE background_history_fairness_state SET finance_since_audit=4,last_auxiliary_at=?').run(stamp-301);
 f.services.getFinanceReconciliation=async()=>{throw Error('SYNTHETIC_UNEXPECTED_PROTECTED_SOURCE_IN_MONTHLY_TURN');};
 const before=f.calls.monthly,result=await continuationSmoke.scheduledWork(f.env,f.services,f.source.now);assert.equal(result.lane,'HISTORY');assert.equal(result.history_collection,'RUNNING');assert.equal(f.calls.monthly,before+1);assert.equal(f.db.prepare('SELECT auxiliary_index FROM background_collection_lane_state').get().auxiliary_index,3);assert.deepEqual(await f.publication(),f.original);assert.equal((await f.state()).summary.status,'RUNNING');
});
