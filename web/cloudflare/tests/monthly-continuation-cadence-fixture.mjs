import assert from 'node:assert/strict';
import {collectionFixture} from './business-collection-fixture.mjs';
import {monthlySourceThroughputFixture} from '../../finance/tests/monthly-source-throughput-fixture.mjs';
import {SCHEMA,scheduledWork} from '../src/admin.mjs';
import {businessMonth} from '../src/business-month.mjs';
import {readCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {runBusinessSync,readBusinessSyncState} from '../src/business-sync.mjs';
import {runBusinessHistorySync} from '../src/business-history-sync.mjs';
import {acquireBackgroundLane,finishBackgroundLane} from '../src/historical-cost-orchestration.mjs';

export async function continuationCadenceFixture(t,{bootstrapPending=false}={}){
 const source=await monthlySourceThroughputFixture(t),app=await collectionFixture({windowCounts:[0,0]});
 t.after(()=>{app.env.ADMIN_DB.db.close();app.financeEnv.FINANCE_DB.db.close();});
 const env=app.env,db=env.ADMIN_DB.db,calls={monthly:0,currentReads:0},services={getFinanceBusinessPeriod:async(_,input)=>{
  const month=input.operation==='start'?input.start_date.slice(0,7):source.db.db.prepare('SELECT start_date FROM finance_business_period_runs WHERE run_id=?').get(input.run_id)?.start_date.slice(0,7);
  if(month==='2026-11'){calls.currentReads++;return source.run(input.operation==='step'?{operation:'read',run_id:input.run_id}:input);}
  calls.monthly++;return source.run(input);
 }};
 await env.ADMIN_DB.batch(SCHEMA.map(sql=>env.ADMIN_DB.prepare(sql)));
 await source.advanceTo(1);assert.equal((await scheduledWork(env,{},source.now)).collection,'MAINTENANCE');
 let frame=await businessMonth(env,{operation:'start',month:'2026-10'},services,{now:source.now});for(let turn=0;frame.status==='RUNNING'&&turn<30;turn++)frame=await businessMonth(env,{operation:'step',month:'2026-10'},services,{now:source.now});assert.equal(frame.status,'COMPLETE');assert.equal(frame.coverage.orders,421);
 const original=await readCompletedBusinessMonth(env,'2026-10',{now:source.now});await source.advanceTo(17);await businessMonth(env,{operation:'start',month:'2026-10'},services,{now:source.now});
 const stamp=Math.floor(source.now()/1000);db.prepare("INSERT INTO business_history_sync_state VALUES(?,'RUNNING',?,0,?,NULL,NULL)").run('2026-10',stamp+60,stamp);
 const current=await runBusinessSync(env,services,{now:source.now});assert.equal(current.status,'RUNNING');assert.equal(current.state.summary.status,'RUNNING');assert.equal(source.calls.list,23,'current Finance uses only a genuine START and READ of a saved RUNNING source');
 db.prepare("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=3").run();
 db.prepare("INSERT INTO business_pending_income_scan(id,payload,last_attempt_at,status,next_attempt_at) VALUES(1,NULL,?,'RUNNING',0)").run(stamp);
 // These are controlled scheduling cues. No Pending/Returns result or financial
 // coverage is fabricated: the model counts only their offered source budgets.
 if(!bootstrapPending)db.prepare("INSERT INTO financial_audit_coverage_turns(month,pending) VALUES('2026-11',0)").run();
 const state=()=>readBusinessSyncState(env),publication=()=>readCompletedBusinessMonth(env,'2026-10',{now:source.now});
 const advance=elapsed=>source.advanceTo(elapsed);
 return {env,db,source,services,calls,original,state,publication,advance};
}

export async function runContinuationMinute(f,elapsed,{scheduled=scheduledWork}={}){
 await f.advance(elapsed);const minute=new Date(f.source.now()).getUTCMinutes()%10,before=f.calls.monthly;
 if([0,2,5,7].includes(minute)){
  const result=await scheduled(f.env,{},f.source.now);assert.equal(f.calls.monthly,before);assert.ok(['MAINTENANCE','FINANCIAL_AUTOMATION','FINANCIAL_RETURNS'].includes(result.lane));return {kind:'RESERVED_MINUTE',minute};
 }
 const lease=await acquireBackgroundLane(f.env,{month:'2026-11'},{now:f.source.now,bootstrapCoverage:true,pendingIncomeScan:true,previousMonthReturns:true,monthlyContinuation:true});
 let auditSourceReads=0,result=null,kind=lease.lane;
 if(lease.lane==='FINANCE'){
  result=await runBusinessSync(f.env,f.services,{now:f.source.now});assert.equal(result.status,'RUNNING');
 }else if(lease.monthly_history_continuation){
  kind='MONTHLY';const index=lease.auxiliary_index,prior=f.db.prepare('SELECT reserved_returns_streak FROM background_history_fairness_state').get().reserved_returns_streak,scan=f.db.prepare('SELECT reserved_streak FROM background_pending_income_scan_turns').get().reserved_streak;
  result=await runBusinessHistorySync(f.env,f.services,{now:f.source.now,monthlyContinuation:true,backgroundLease:{token:lease.token,revision:lease.revision,auxiliary_index:index}});assert.equal(result.finance_steps,1);assert.equal(f.calls.monthly,before+1);assert.ok(['RUNNING','COMPLETE'].includes(result.status));
  await finishBackgroundLane(f.env,lease,{now:f.source.now});assert.equal(f.db.prepare('SELECT auxiliary_index FROM background_collection_lane_state').get().auxiliary_index,index);assert.equal(f.db.prepare('SELECT reserved_returns_streak FROM background_history_fairness_state').get().reserved_returns_streak,prior);assert.equal(f.db.prepare('SELECT reserved_streak FROM background_pending_income_scan_turns').get().reserved_streak,scan);return {kind,minute,result};
 }else if(lease.pending_income_scan){kind='SCAN_BUDGET';auditSourceReads=1;}
 else if(lease.reserved_returns){kind='RETURNS_BUDGET';auditSourceReads=1;}
 else if(lease.coverage_bootstrap){kind='BOOTSTRAP_BUDGET';auditSourceReads=1;}
 else if(lease.lane==='HISTORY'){
  const monthly=await runBusinessHistorySync(f.env,f.services,{now:f.source.now,backgroundLease:{token:lease.token,revision:lease.revision}});
  if(monthly.finance_steps){kind='MONTHLY';result=monthly;assert.equal(f.calls.monthly,before+1);}
  else kind='ORDINARY_HISTORY';
 }
 assert.ok(f.calls.monthly-before<=1);await finishBackgroundLane(f.env,lease,{now:f.source.now,auditSourceReads});return {kind,minute,result};
}
