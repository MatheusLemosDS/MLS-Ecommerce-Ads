import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHEMA} from '../src/admin.mjs';
import {acquireBackgroundLane,finishBackgroundLane,runBackgroundHistoryWork} from '../src/historical-cost-orchestration.mjs';
import {runBusinessFinancialAudits} from '../src/financial-audit-orchestration.mjs';
import {runBusinessIncomeOverview} from '../src/business-income-overview.mjs';
import {saveCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';
import {TrackerD1,publishTrackerMonth,trackerUuid as uuid,trackerTime,trackerMonth as previous,trackerThrough as month} from './m2-release-tracker-fixture.mjs';

const stamp=trackerTime/1000;
function report(frame,at=stamp){
 const c=frame.coverage,value={schema:'finance_reconciliation_v1',run_id:frame.run_id,source_revision:frame.revision,start_date:frame.start_date,end_date:frame.end_date,checked_at:at,status:'CHECKED',source_checked_at:{finance_oldest_at:frame.source_checked_at.oldest_at,finance_latest_at:frame.source_checked_at.latest_at,returns_oldest_at:null,returns_latest_at:null},coverage:{orders:c.orders,evidence_orders:c.orders,missing_evidence_orders:0,paid_orders:c.paid,review_orders:c.cancel_pending+c.other+c.unknown,return_orders:c.returns,return_unknown_orders:c.returns_unknown},adjustments:{reported_orders:c.paid,missing_orders:0,conflicting_orders:0,known_adjustment_cents:0,base_repass_cents:8000,after_adjustment_repass_cents:8000},returns:{reference_count:0,checked_count:0,pending_count:0,known_requested_refund_cents:0,requested_amount_complete:true,permission:'UNKNOWN'},cases:[],truncation:{truncated:false,cases_total:0,cases_included:0},pending:['SETTLEMENT_NOT_RECONCILED'],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};assert.ok(projectReconciliationFrame(value));return value;
}
async function fixture(t,{current=false,busy=false}={}){
 const db=new TrackerD1(),env={ADMIN_DB:db},clock={time:trackerTime},now=()=>clock.time;t.after(()=>db.db.close());await db.batch(SCHEMA.map(sql=>db.prepare(sql)));const prior=await publishTrackerMonth(env,now),frames=new Map(prior.map(frame=>[frame.run_id,frame]));
 let currentFrame=null;
 if(current){currentFrame=structuredClone(prior[0]);Object.assign(currentFrame,{run_id:uuid(101),start_date:month+'-01',end_date:month+'-10'});assert.ok(projectBusinessPeriodFrame(currentFrame));const payload={start_date:month+'-01',end_date:month+'-10',slots:[{start_date:currentFrame.start_date,end_date:currentFrame.end_date,frame:currentFrame}]},row={revision:7,payload:JSON.stringify(payload),created_at:stamp-1200,updated_at:stamp-900};db.db.prepare('INSERT OR REPLACE INTO business_month_runs VALUES(?,?,?,?,?)').run(month,row.revision,row.payload,row.created_at,row.updated_at);assert.ok(await saveCompletedBusinessMonth(env,month,{row,payload,complete:true},{now}));frames.set(currentFrame.run_id,currentFrame);}
 db.db.prepare('UPDATE business_sync_state SET enabled=1,month=?,summary=?,next_run_at=? WHERE id=1').run(month,JSON.stringify({month,status:busy?'RUNNING':'COMPLETE'}),busy?0:stamp+3600);
 db.db.exec("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=1,lease_token=NULL,lease_until=NULL;UPDATE background_history_fairness_state SET finance_since_audit=4,reserved_returns_streak=0,returns_retry_at=0,next_history_work='AUDIT'");db.db.prepare('UPDATE background_history_fairness_state SET last_auxiliary_at=?').run(stamp-300);
 const acquire=(extra={})=>acquireBackgroundLane(env,{month},{now,previousMonthReturns:true,...extra});
 const audit=()=>{db.db.prepare("INSERT OR REPLACE INTO financial_audit_turns(month,revision,next_work,lease_token,lease_until) VALUES(?,1,'RETURNS',NULL,NULL)").run(month);db.db.prepare('INSERT OR REPLACE INTO financial_audit_coverage_turns(month,pending) VALUES(?,0)').run(month);};
 return {db,env,clock,now,prior,currentFrame,frames,acquire,audit};
}
const cursors=f=>({audit:f.db.db.prepare('SELECT * FROM financial_audit_turns ORDER BY month').all(),coverage:f.db.db.prepare('SELECT * FROM financial_audit_coverage_turns ORDER BY month').all(),auxiliary:f.db.db.prepare('SELECT auxiliary_index FROM background_collection_lane_state').get()});
async function finish(f,lease,work={}){return finishBackgroundLane(f.env,lease,{now:f.now,auditSourceReads:work.audit_source_reads??0});}
async function nextAuxiliary(f){const finance=await f.acquire();assert.equal(finance.lane,'FINANCE');await finish(f,finance);f.clock.time+=60000;}
function source(f,calls){return async(_env,input)=>{calls.push(input);return report(f.frames.get(input.run_id),Math.floor(f.now()/1000));};}
function hold(f,frames=f.prior,until=stamp+900){for(const frame of frames)f.db.db.prepare('INSERT OR REPLACE INTO business_reconciliation_attempts(run_id,source_revision,checked_at,status,code,next_attempt_at) VALUES(?,?,?,\'SUCCESS\',NULL,?)').run(frame.run_id,frame.revision,stamp,until);}

// The cue is deliberately coarse; the frozen-publication selector/runner still
// owns frame validity and source/report identity before every private request.
test('a previous full publication gets a reserved Returns turn without a current publication or legacy cursor changes',async t=>{
 const f=await fixture(t),before=cursors(f),legacy=await f.acquire({previousMonthReturns:false});assert.equal(legacy.reserved_returns,false);assert.equal(legacy.lane,'CATALOG');await finish(f,legacy);
 f.db.db.exec("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=1");const lease=await f.acquire();assert.equal(lease.lane,'HISTORY');assert.equal(lease.reserved_returns,true);const calls=[];
 const work=await runBackgroundHistoryWork(f.env,{getFinanceReconciliation:source(f,calls)},{month,lease},{now:f.now,previousMonthReturns:true});assert.equal(work.reconciliation,'CHECKED');assert.equal(work.source_reads,1);assert.equal(work.audit_source_reads,1);assert.equal(calls.length,1);assert.equal(calls[0].run_id,f.prior[0].run_id);assert.equal(await finish(f,lease,work),true);assert.deepEqual(cursors(f),before);assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM business_reconciliation_reports').get().n,1);
});

test('reserved Returns alternates actual CURRENT/PREVIOUS calls while both published cohorts remain eligible',async t=>{
 const f=await fixture(t,{current:true}),calls=[];
 for(let index=0;index<2;index++){
  const lease=await f.acquire();assert.equal(lease.reserved_returns,true);const work=await runBackgroundHistoryWork(f.env,{getFinanceReconciliation:source(f,calls)},{month,lease},{now:f.now,previousMonthReturns:true});assert.equal(work.source_reads,1);assert.equal(work.reconciliation,'CHECKED');await finish(f,lease,work);if(index===0)f.clock.time+=60000;
 }
 assert.equal(calls.length,2);assert.deepEqual(calls.map(row=>f.frames.get(row.run_id).start_date.slice(0,7)).sort(),[previous,month].sort());assert.equal(f.db.db.prepare('SELECT reserved_returns_streak FROM background_history_fairness_state').get().reserved_returns_streak,2);
 await nextAuxiliary(f);const other=await f.acquire();assert.equal(other.reserved_returns,false);assert.equal(other.lane,'CATALOG');await finish(f,other);assert.equal(f.db.db.prepare('SELECT reserved_returns_streak FROM background_history_fairness_state').get().reserved_returns_streak,0);
});

test('ordinary RETURNS uses the same historical wrapper with audit and background guards, retaining one private read',async t=>{
 const f=await fixture(t);f.audit();const lease=await f.acquire();assert.equal(lease.reserved_returns,true);const calls=[];
 const work=await runBusinessFinancialAudits(f.env,{getFinanceReconciliation:source(f,calls)},{month},{now:f.now,previousMonthReturns:true,backgroundLease:{token:lease.token,revision:lease.revision}});assert.equal(work.selected,'RETURNS');assert.equal(work.returns_status,'CHECKED');assert.equal(work.source_reads,1);assert.equal(calls.length,1);assert.equal(calls[0].run_id,f.prior[0].run_id);assert.equal(f.db.db.prepare('SELECT next_work FROM financial_audit_turns WHERE month=?').get(month).next_work,'INCOME');await finish(f,lease);
});

test('due matching attempts, target leases and prior full-calendar coverage control reservations',async t=>{
 for(const mode of ['backoff','lease','partial'])await t.test(mode,async child=>{
  const f=await fixture(child);if(mode==='backoff')hold(f);else if(mode==='lease')f.db.db.prepare('INSERT INTO business_reconciliation_leases VALUES(?,?,?)').run(previous,uuid(700),stamp+90);else f.db.db.prepare("UPDATE business_month_publications SET payload=json_set(payload,'$.end_date','2026-10-30') WHERE month=?").run(previous);
  const lease=await f.acquire();assert.equal(lease.reserved_returns,false);assert.equal(lease.lane,'CATALOG');await finish(f,lease);
 });
 const f=await fixture(t,{current:true});hold(f);hold(f,[f.currentFrame]);f.db.db.prepare('UPDATE business_reconciliation_attempts SET next_attempt_at=? WHERE run_id=?').run(stamp,f.prior[1].run_id);const due=await f.acquire();assert.equal(due.reserved_returns,true);await finish(f,due);
});

test('a future current attempt cannot hide a due previous source and missing reports are not required for a due refresh',async t=>{
 const f=await fixture(t,{current:true});hold(f,[f.currentFrame]);const frame=f.prior[0],value=report(frame);f.db.db.prepare('INSERT INTO business_reconciliation_reports VALUES(?,?,?,?,?,?)').run(frame.run_id,frame.revision,frame.start_date,frame.end_date,JSON.stringify(value),stamp);hold(f);f.db.db.prepare('UPDATE business_reconciliation_attempts SET next_attempt_at=? WHERE run_id=?').run(stamp,frame.run_id);
 const lease=await f.acquire();assert.equal(lease.reserved_returns,true);const calls=[],work=await runBackgroundHistoryWork(f.env,{getFinanceReconciliation:source(f,calls)},{month,lease},{now:f.now,previousMonthReturns:true});assert.equal(work.source_reads,1);assert.equal(calls[0].run_id,frame.run_id);await finish(f,lease,work);
});

test('busy first imports still permit prior Returns only after the four-Finance and five-minute budget',async t=>{
 const f=await fixture(t,{busy:true});f.db.db.prepare('UPDATE background_history_fairness_state SET finance_since_audit=0').run();
 for(let index=0;index<4;index++){const lease=await f.acquire();assert.equal(lease.lane,'FINANCE');await finish(f,lease);f.clock.time+=60000;}
 const eligible=await f.acquire();assert.equal(eligible.reserved_returns,true);await finish(f,eligible);
 const g=await fixture(t,{busy:true});g.db.db.prepare('UPDATE background_history_fairness_state SET last_auxiliary_at=?').run(stamp-299);const tooSoon=await g.acquire();assert.equal(tooSoon.lane,'FINANCE');assert.equal(tooSoon.reserved_returns,false);await finish(g,tooSoon);
});

test('missing services consume no source and retain the bounded reserved retry without pinning auxiliaries',async t=>{
 const f=await fixture(t),lease=await f.acquire(),before=cursors(f);let wrapped=0;
 const work=await runBackgroundHistoryWork(f.env,{}, {month,lease},{now:f.now,previousMonthReturns:true,runHistoricalReturns:async()=>{wrapped++;throw Error('no source must not select');}});assert.equal(work.reconciliation,'NO_SOURCE');assert.equal(work.source_reads,0);assert.equal(wrapped,0);await finish(f,lease,work);assert.deepEqual(cursors(f),before);assert.equal(f.db.db.prepare('SELECT returns_retry_at FROM background_history_fairness_state').get().returns_retry_at,stamp+300);
 f.clock.time+=120000;f.db.db.exec("UPDATE background_collection_lane_state SET next_lane='AUXILIARY'");const next=await f.acquire();assert.equal(next.reserved_returns,false);assert.equal(next.lane,'CATALOG');await finish(f,next);
});

test('publication replacement, policy pause, lease loss and month rollover block report/attempt and ordinary-cursor commits',async t=>{
 for(const mode of ['publication','pause','audit','background','rollover','expiry'])await t.test(mode,async child=>{
  const f=await fixture(child);f.audit();const lease=await f.acquire(),calls=[];
  const work=await runBusinessFinancialAudits(f.env,{getFinanceReconciliation:async(_env,input)=>{
   calls.push(input);if(mode==='publication')f.db.db.prepare('UPDATE business_month_publications SET write_token=? WHERE month=?').run(uuid(999),previous);else if(mode==='pause')f.db.db.exec('UPDATE business_sync_state SET enabled=0');else if(mode==='audit')f.db.db.prepare('UPDATE financial_audit_turns SET revision=revision+1 WHERE month=?').run(month);else if(mode==='background')f.db.db.exec('UPDATE background_collection_lane_state SET revision=revision+1');else if(mode==='rollover')f.clock.time=Date.UTC(2026,11,1,3);else f.clock.time+=91000;return report(f.frames.get(input.run_id),Math.floor(f.now()/1000));
  }},{month},{now:f.now,previousMonthReturns:true,backgroundLease:{token:lease.token,revision:lease.revision}});
  assert.equal(work.source_reads,1);assert.equal(calls.length,1);assert.notEqual(work.returns_status,'CHECKED');assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM business_reconciliation_reports').get().n,0);assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM business_reconciliation_attempts').get().n,0);assert.equal(f.db.db.prepare('SELECT next_work FROM financial_audit_turns WHERE month=?').get(month).next_work,'RETURNS');await finish(f,lease);
 });
});

test('the ordinary source fence rejects a BRT-month transition before RPC and cannot spend a second source',async t=>{
 const f=await fixture(t);f.audit();const lease=await f.acquire();let calls=0;
 const stopped=await runBusinessFinancialAudits(f.env,{getFinanceReconciliation:async()=>{calls++;return {};}},{month},{now:f.now,previousMonthReturns:true,backgroundLease:{token:lease.token,revision:lease.revision},runHistoricalReturns:async(_env,source)=>{f.clock.time=Date.UTC(2026,11,1,3);await source();return {status:'CHECKED'};}});assert.equal(stopped.source_reads,0);assert.equal(calls,0);assert.equal(f.db.db.prepare('SELECT next_work FROM financial_audit_turns WHERE month=?').get(month).next_work,'RETURNS');await finish(f,lease);
 const g=await fixture(t),reserved=await g.acquire(),reads=[];
 const bounded=await runBackgroundHistoryWork(g.env,{getFinanceReconciliation:async()=>{reads.push('RETURNS');return {};}},{month,lease:reserved},{now:g.now,previousMonthReturns:true,runHistoricalReturns:async(_env,source)=>{await source();await assert.rejects(()=>source(),/BACKGROUND_HISTORY_READ_BUDGET/);return {status:'CHECKED'};}});assert.equal(bounded.source_reads,1);assert.deepEqual(reads,['RETURNS']);await finish(g,reserved,bounded);
});

test('Pending scan priority and the opt-in legacy defaults remain unchanged',async t=>{
 const f=await fixture(t);const value={schema:'finance_income_overview_v1',checked_at:stamp,region:'BRAZIL',shop_type:'LOCAL',currency_basis:'FIXED_BRAZIL_SHOP_PROFILE',pending:{status:'PENDING',raw:'100',cents:10000},released:{status:'RELEASED',raw:'0',cents:0},to_release:{status:'TO_RELEASE_NOT_APPLICABLE_LOCAL',raw:null,cents:null},basis:'CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH'};await runBusinessIncomeOverview(f.env,async()=>value,{now:f.now});const scan=await f.acquire({pendingIncomeScan:true});assert.equal(scan.pending_income_scan,true);assert.equal(scan.reserved_returns,false);await finish(f,scan);
 const g=await fixture(t,{current:true});g.audit();const lease=await g.acquire();let historical=0,legacy=0;const old=await runBusinessFinancialAudits(g.env,{getFinanceReconciliation:async()=>({})},{month},{now:g.now,runHistoricalReturns:async()=>{historical++;throw Error('legacy opt-out');},runReturns:async(_env,source,input)=>{legacy++;assert.equal(input.month,month);await source();return {status:'CHECKED'};}});assert.equal(old.source_reads,1);assert.equal(historical,0);assert.equal(legacy,1);await finish(g,lease);
 await assert.rejects(g.acquire({previousMonthReturns:'true'}),/BACKGROUND_LANE_REQUEST_INVALID/);await assert.rejects(runBusinessFinancialAudits(g.env,{}, {month},{now:g.now,previousMonthReturns:true}),/FINANCIAL_AUDIT_CONFIGURATION/);
});
