import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {scheduledWork} from '../src/admin.mjs';
import {acquireBackgroundLane,finishBackgroundLane,runBackgroundHistoryWork} from '../src/historical-cost-orchestration.mjs';
import {runBusinessIncomeOverview} from '../src/business-income-overview.mjs';
import {runBusinessIncomeDetail,readBusinessIncomeDetail} from '../src/business-income-detail.mjs';
import {publishTrackerMonth} from './m2-release-tracker-fixture.mjs';

const base=Date.UTC(2026,9,31,18),month='2026-10',stamp=base/1000;
const overview=at=>({schema:'finance_income_overview_v1',checked_at:at,region:'BRAZIL',shop_type:'LOCAL',currency_basis:'FIXED_BRAZIL_SHOP_PROFILE',pending:{status:'PENDING',raw:'100',cents:10000},released:{status:'RELEASED',raw:'0',cents:0},to_release:{status:'TO_RELEASE_NOT_APPLICABLE_LOCAL',raw:null,cents:null},basis:'CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH'});
const detail=at=>({schema:'finance_income_detail_v1',checked_at:at,region:'BRAZIL',shop_type:'LOCAL',income_status:'PENDING',page_size:100,returned_count:1,has_more:false,next_cursor_present:false,rows:[{entry_hash:'a'.repeat(64),order_hash:'b'.repeat(64),currency:'BRL',status:'Pendente',description:'Order Income',payment_method:'PIX',estimated_escrow_raw:'100',estimated_escrow_cents:10000,estimated_payout_time:at+3600,creation_time:at-3600}],basis:'CURRENT_PENDING_PROVIDER_INCOME_DETAIL_NOT_MONTH_OR_BANK_RECEIPT'});
const unavailable=()=>({schema:'finance_income_detail_unavailable_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_INCOME_DETAIL_HTTP_ERROR',http:502}});
async function fixture(t,{first=false,oldPayload=false}={}){
 const db=new D1(),env={ADMIN_DB:db},clock={time:base-3600000},now=()=>clock.time;t.after(()=>db.db.close());
 assert.equal((await scheduledWork(env,{},now)).lane,'MAINTENANCE');
 await runBusinessIncomeOverview(env,async()=>overview(clock.time/1000),{now});
 if(oldPayload){await runBusinessIncomeDetail(env,async()=>detail(clock.time/1000),{now});clock.time+=901000;}
 if(!first)await runBusinessIncomeDetail(env,unavailable,{now});
 clock.time=base;await publishTrackerMonth(env,now);
 db.db.prepare("UPDATE business_sync_state SET enabled=1,month=?,summary=?,next_run_at=0 WHERE id=1").run(month,JSON.stringify({month,status:'RUNNING'}));
 db.db.exec("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=3; UPDATE background_history_fairness_state SET finance_since_audit=4,reserved_returns_streak=2,next_history_work='COST'");
 db.db.prepare('UPDATE background_history_fairness_state SET last_auxiliary_at=?').run(stamp-300);
 db.db.prepare("INSERT INTO financial_audit_turns(month,revision,next_work,lease_token,lease_until) VALUES(?,7,'RETURNS',NULL,NULL)").run(month);
 db.db.prepare('INSERT INTO financial_audit_coverage_turns(month,pending) VALUES(?,1)').run(month);
 const cursors=()=>({lane:db.db.prepare('SELECT auxiliary_index FROM background_collection_lane_state').get(),fair:db.db.prepare('SELECT next_history_work,reserved_returns_streak FROM background_history_fairness_state').get(),audit:db.db.prepare('SELECT * FROM financial_audit_turns').get(),coverage:db.db.prepare('SELECT * FROM financial_audit_coverage_turns').get()});
 return {db,env,clock,now,cursors};
}

test('actual cron recovers a long failed Pending before unrelated auxiliaries using exactly one source and preserving all cursors',async t=>{
 const f=await fixture(t),before=f.cursors(),calls=[];
 const result=await scheduledWork(f.env,{getFinanceIncomeDetail:async()=>{calls.push('DETAIL');return detail(stamp);},getFinanceReconciliation:async()=>{throw Error('must not visit other source');},getFinanceBusinessPeriod:async()=>{throw Error('must preserve Finance budget');}},f.now);
 assert.equal(result.lane,'HISTORY');assert.equal(result.income_detail,'CHECKED');assert.deepEqual(calls,['DETAIL']);assert.deepEqual(f.cursors(),before);
 const value=await readBusinessIncomeDetail(f.env,{now:f.now});assert.equal(value.status,'AVAILABLE');assert.equal(value.report.rows.length,1);
 const cooldown=f.db.db.prepare('SELECT * FROM background_pending_income_recovery_attempts').get();assert.equal(cooldown.next_attempt_at,stamp+900);
 assert.equal(f.db.db.prepare('SELECT finance_since_audit FROM background_history_fairness_state').get().finance_since_audit,0);
});

test('a first Pending snapshot has a bounded reservation without waiting for the full financial audit ring',async t=>{
 const f=await fixture(t,{first:true});
 // A fresh positive Overview is enough for a first page, even on a new store.
 f.db.db.prepare('DELETE FROM business_income_overview').run();await runBusinessIncomeOverview(f.env,async()=>overview(stamp),{now:f.now});
 const lease=await acquireBackgroundLane(f.env,{month},{now:f.now,pendingIncomeRecovery:true});assert.equal(lease.pending_income_recovery,true);assert.equal(lease.lane,'HISTORY');
 let calls=0;const work=await runBackgroundHistoryWork(f.env,{getFinanceIncomeDetail:async()=>{calls++;return detail(stamp);}},{month,lease},{now:f.now});assert.equal(work.income_detail,'CHECKED');assert.equal(work.source_reads,1);assert.equal(calls,1);
 await finishBackgroundLane(f.env,lease,{now:f.now,auditSourceReads:work.audit_source_reads});
});

test('failed refreshes keep old rows but receive recovery; a successful snapshot keeps ordinary low frequency',async t=>{
 const f=await fixture(t,{oldPayload:true});assert.equal((await readBusinessIncomeDetail(f.env,{now:f.now})).status,'PARTIAL_UNAVAILABLE');
 let lease=await acquireBackgroundLane(f.env,{month},{now:f.now,pendingIncomeRecovery:true});assert.equal(lease.pending_income_recovery,true);
 const work=await runBackgroundHistoryWork(f.env,{getFinanceIncomeDetail:async()=>detail(stamp)},{month,lease},{now:f.now});await finishBackgroundLane(f.env,lease,{now:f.now,auditSourceReads:work.audit_source_reads});
 f.clock.time+=901000;f.db.db.exec("UPDATE background_collection_lane_state SET next_lane='AUXILIARY'; UPDATE background_history_fairness_state SET finance_since_audit=4");
 lease=await acquireBackgroundLane(f.env,{month},{now:f.now,pendingIncomeRecovery:true});assert.equal(lease.pending_income_recovery,undefined);assert.equal(lease.lane,'PRODUCTION');await finishBackgroundLane(f.env,lease,{now:f.now});
});

test('missing service has a global cooldown that publication changes cannot reset, leaving ordinary auxiliary work available',async t=>{
 const f=await fixture(t),before=f.cursors();let lease=await acquireBackgroundLane(f.env,{month},{now:f.now,pendingIncomeRecovery:true});
 const work=await runBackgroundHistoryWork(f.env,{}, {month,lease},{now:f.now});assert.equal(work.income_detail,'NO_SOURCE');assert.equal(work.source_reads,0);await finishBackgroundLane(f.env,lease,{now:f.now});assert.deepEqual(f.cursors(),before);
 f.clock.time+=600000;await publishTrackerMonth(f.env,f.now,{revision:8});f.db.db.exec("UPDATE background_collection_lane_state SET next_lane='AUXILIARY'; UPDATE background_history_fairness_state SET finance_since_audit=4");
 lease=await acquireBackgroundLane(f.env,{month},{now:f.now,pendingIncomeRecovery:true});assert.equal(lease.pending_income_recovery,undefined);assert.equal(lease.lane,'PRODUCTION');await finishBackgroundLane(f.env,lease,{now:f.now});
 f.clock.time+=300000;f.db.db.exec("UPDATE background_collection_lane_state SET next_lane='AUXILIARY'; UPDATE background_history_fairness_state SET finance_since_audit=4");
 lease=await acquireBackgroundLane(f.env,{month},{now:f.now,pendingIncomeRecovery:true});assert.equal(lease.pending_income_recovery,true);await finishBackgroundLane(f.env,lease,{now:f.now});
});

test('recovery never overtakes busy Finance until four opportunities and the existing five minute budget both hold',async t=>{
 const f=await fixture(t);f.db.db.prepare('UPDATE background_history_fairness_state SET finance_since_audit=0').run();
 for(let index=0;index<4;index++){
  const lease=await acquireBackgroundLane(f.env,{month},{now:f.now,pendingIncomeRecovery:true});assert.equal(lease.lane,'FINANCE');await finishBackgroundLane(f.env,lease,{now:f.now});f.clock.time+=60000;
 }
 const lease=await acquireBackgroundLane(f.env,{month},{now:f.now,pendingIncomeRecovery:true});assert.equal(lease.pending_income_recovery,true);await finishBackgroundLane(f.env,lease,{now:f.now});
 const g=await fixture(t);g.db.db.prepare('UPDATE background_history_fairness_state SET last_auxiliary_at=?').run(stamp-299);
 const waiting=await acquireBackgroundLane(g.env,{month},{now:g.now,pendingIncomeRecovery:true});assert.equal(waiting.lane,'FINANCE');assert.equal(waiting.pending_income_recovery,undefined);await finishBackgroundLane(g.env,waiting,{now:g.now});
});

test('a quiet future Finance retry cannot postpone Pending recovery by repeatedly refreshing ordinary auxiliary time',async t=>{
 const f=await fixture(t),before=f.cursors(),calls=[];
 // A RUNNING import can be waiting on its next retry. Normal auxiliary work is
 // allowed then, and may have run just one second ago, as in the Live failure.
 f.db.db.prepare('UPDATE business_sync_state SET next_run_at=?').run(stamp+3600);
 f.db.db.prepare('UPDATE background_history_fairness_state SET last_auxiliary_at=?,finance_since_audit=0').run(stamp-1);
 const work=await scheduledWork(f.env,{getFinanceIncomeDetail:async()=>{calls.push('DETAIL');return unavailable();}},f.now);
 assert.equal(work.lane,'HISTORY');assert.equal(work.income_detail,'UNAVAILABLE');assert.deepEqual(calls,['DETAIL']);assert.deepEqual(f.cursors(),before);
 assert.equal(f.db.db.prepare('SELECT next_attempt_at FROM background_pending_income_recovery_attempts WHERE id=1').get().next_attempt_at,stamp+900);
 // Another quiet auxiliary opportunity still has its normal destination. The
 // failed source and a new ordinary timestamp cannot consume another recovery.
 f.clock.time+=120000;f.db.db.exec("UPDATE background_collection_lane_state SET next_lane='AUXILIARY'");
 f.db.db.prepare('UPDATE background_history_fairness_state SET last_auxiliary_at=?').run(f.clock.time/1000-1);
 const lease=await acquireBackgroundLane(f.env,{month},{now:f.now,pendingIncomeRecovery:true});
 assert.equal(lease.pending_income_recovery,undefined);assert.equal(lease.lane,'PRODUCTION');await finishBackgroundLane(f.env,lease,{now:f.now});assert.deepEqual(calls,['DETAIL']);
});

test('pause and stolen/expired global leases prevent both Pending writes and recovery cooldown advancement',async t=>{
 const f=await fixture(t);let lease=await acquireBackgroundLane(f.env,{month},{now:f.now,pendingIncomeRecovery:true}),calls=0;
 f.db.db.prepare('UPDATE business_sync_state SET enabled=0').run();let work=await runBackgroundHistoryWork(f.env,{getFinanceIncomeDetail:async()=>{calls++;return detail(stamp);}},{month,lease},{now:f.now});assert.equal(work.source_reads,0);assert.equal(calls,0);await finishBackgroundLane(f.env,lease,{now:f.now});assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM background_pending_income_recovery_attempts').get().n,0);
 f.db.db.exec("UPDATE business_sync_state SET enabled=1; UPDATE background_collection_lane_state SET next_lane='AUXILIARY'; UPDATE background_history_fairness_state SET finance_since_audit=4");
 lease=await acquireBackgroundLane(f.env,{month},{now:f.now,pendingIncomeRecovery:true});
 work=await runBackgroundHistoryWork(f.env,{getFinanceIncomeDetail:async()=>{calls++;f.db.db.prepare('UPDATE background_collection_lane_state SET revision=revision+1,lease_token=?').run(crypto.randomUUID());return detail(stamp);}},{month,lease},{now:f.now});assert.equal(work.source_reads,1);assert.equal(await finishBackgroundLane(f.env,lease,{now:f.now}),false);assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM background_pending_income_recovery_attempts').get().n,0);assert.equal((await readBusinessIncomeDetail(f.env,{now:f.now})).status,'UNAVAILABLE');
});

test('positive Pending does not bypass provider retry, zero amount, a global recovery cooldown, or a paused policy',async t=>{
 for(const scenario of ['retry','zero','cooldown','paused']){
  const f=await fixture(t);
  if(scenario==='retry')f.db.db.prepare('UPDATE business_income_detail SET next_attempt_at=?').run(stamp+60);
  if(scenario==='zero')f.db.db.prepare("UPDATE business_income_overview SET payload=json_set(payload,'$.pending.raw','0','$.pending.cents',0)").run();
  if(scenario==='cooldown')f.db.db.prepare('INSERT INTO background_pending_income_recovery_attempts(id,month,last_attempt_at,next_attempt_at) VALUES(1,?,?,?)').run(month,stamp-100,stamp+800);
  if(scenario==='paused')f.db.db.prepare('UPDATE business_sync_state SET enabled=0').run();
  const lease=await acquireBackgroundLane(f.env,{month},{now:f.now,pendingIncomeRecovery:true});assert.equal(lease.pending_income_recovery,undefined,scenario);if(scenario==='paused')assert.equal(lease.lane,'PAUSED');await finishBackgroundLane(f.env,lease,{now:f.now});
 }
});

test('an ordinary failed read does not extend a due recovery cooldown beyond the original source retry',async t=>{
 const f=await fixture(t),calls=[];
 f.db.db.prepare('INSERT INTO background_pending_income_recovery_attempts(id,month,last_attempt_at,next_attempt_at) VALUES(1,?,?,?)').run(month,stamp-901,stamp-1);
 const previous=f.db.db.prepare('SELECT * FROM background_pending_income_recovery_attempts').get();
 // This is a real ordinary runner attempt ten minutes after the last recovery;
 // its existing five-minute source retry has elapsed at the next cron below.
 f.clock.time=base-600000;
 const ordinary=await runBusinessIncomeDetail(f.env,async()=>{calls.push('ORDINARY');return unavailable();},{now:f.now});assert.equal(ordinary.source_reads,1);
 assert.deepEqual(f.db.db.prepare('SELECT * FROM background_pending_income_recovery_attempts').get(),previous,'ordinary attempts do not reschedule reserved recovery');
 f.clock.time=base;const stored=f.db.db.prepare('SELECT last_attempt_at,next_attempt_at FROM business_income_detail').get();
 assert.equal(stored.last_attempt_at,stamp-600);assert.equal(stored.next_attempt_at,stamp-300);assert.ok(stamp-stored.last_attempt_at<900);
 const before=f.cursors();const result=await scheduledWork(f.env,{getFinanceIncomeDetail:async()=>{calls.push('RECOVERY');return detail(stamp);}},f.now);
 assert.equal(result.lane,'HISTORY');assert.equal(result.income_detail,'CHECKED');assert.deepEqual(calls,['ORDINARY','RECOVERY']);assert.deepEqual(f.cursors(),before);
 assert.equal(f.db.db.prepare('SELECT next_attempt_at FROM background_pending_income_recovery_attempts').get().next_attempt_at,stamp+900);
});

test('a month rollover during a Pending response cannot publish the expired context',async t=>{
 const f=await fixture(t);f.clock.time=Date.UTC(2026,10,1,2,59,59);
 const lease=await acquireBackgroundLane(f.env,{month},{now:f.now,pendingIncomeRecovery:true}),before=f.db.db.prepare('SELECT * FROM business_income_detail').get();
 const work=await runBackgroundHistoryWork(f.env,{getFinanceIncomeDetail:async()=>{f.clock.time+=2000;return detail(f.clock.time/1000);}},{month,lease},{now:f.now});assert.equal(work.source_reads,1);assert.equal(work.income_detail,'PAUSED');assert.deepEqual(f.db.db.prepare('SELECT * FROM business_income_detail').get(),before);
 await finishBackgroundLane(f.env,lease,{now:f.now});
 await assert.rejects(acquireBackgroundLane(f.env,{month},{now:f.now,pendingIncomeRecovery:true}),/BACKGROUND_LANE_REQUEST_INVALID/);
});

for(const minify of [false,true])test('generated cron preserves one-RPC Pending recovery and legacy ring cursors (minify='+minify+')',async t=>{
 const {readFile}=await import('node:fs/promises'),{build}=await import('esbuild');
 const raw=await readFile(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8'),built=await build({stdin:{contents:raw+'\nexport {brazaAdmin as pendingRecoverySmoke};',loader:'js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const worker=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
 const f=await fixture(t),before=f.cursors();let calls=0;
 const work=await worker.pendingRecoverySmoke.scheduledWork(f.env,{getFinanceIncomeDetail:async()=>{calls++;return detail(stamp);}},f.now);
 assert.equal(work.lane,'HISTORY');assert.equal(work.income_detail,'CHECKED');assert.equal(calls,1);assert.deepEqual(f.cursors(),before);assert.equal((await readBusinessIncomeDetail(f.env,{now:f.now})).report.returned_count,1);
});
