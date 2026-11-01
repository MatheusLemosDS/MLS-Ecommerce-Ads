import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {scheduledWork} from '../src/admin.mjs';
import {acquireBackgroundLane,finishBackgroundLane,runBackgroundHistoryWork} from '../src/historical-cost-orchestration.mjs';
import {FINANCIAL_AUDIT_SCHEMA,runBusinessFinancialAudits} from '../src/financial-audit-orchestration.mjs';
import {BUSINESS_PENDING_INCOME_SCAN_SCHEMA,readBusinessPendingIncomeScan} from '../src/business-pending-income-scan.mjs';
import {runBusinessIncomeOverview} from '../src/business-income-overview.mjs';
import {projectPendingIncomeScanFrame} from '../../finance/src/pending-income-frame.mjs';
import {publishTrackerMonth} from './m2-release-tracker-fixture.mjs';

const base=Date.UTC(2026,9,31,18),month='2026-10',stamp=base/1000,scanId='11111111-1111-4111-8111-111111111111';
const basis='CURRENT_PENDING_PAGINATED_MUTABLE_SOURCE_NOT_MONTH_OR_BANK_RECEIPT';
const overview=at=>({schema:'finance_income_overview_v1',checked_at:at,region:'BRAZIL',shop_type:'LOCAL',currency_basis:'FIXED_BRAZIL_SHOP_PROFILE',pending:{status:'PENDING',raw:'100',cents:10000},released:{status:'RELEASED',raw:'0',cents:0},to_release:{status:'TO_RELEASE_NOT_APPLICABLE_LOCAL',raw:null,cents:null},basis:'CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH'});
function scanFrame(at,{state='RUNNING',started=at,pages=1}={}){
 const complete=state==='COMPLETE',failed=state==='RETRY_WAIT';
 const report=complete?{scan_id:scanId,started_at:started,completed_at:at,source_oldest_at:started,source_latest_at:at,pages_read:pages,rows:[],unique_orders:0,duplicate_entries:0,conflicting_orders:0,known_amount_cents:0,unknown_amount_count:0,amount_complete:true,basis}:null;
 const value={schema:'finance_pending_income_scan_v1',checked_at:at,scan:{scan_id:scanId,state,started_at:started,updated_at:at,completed_at:complete?at:null,date_from:'2026-10-30',date_to:'2026-10-31',pages_read:pages,unique_entries:0,unique_orders:0,duplicate_entries:0,conflicting_orders:0,next_attempt_at:at+(complete?900:failed?300:60),error:failed?'TIMEOUT':null},report,basis};
 assert.ok(projectPendingIncomeScanFrame(value));return value;
}
async function fixture(t,{busy=false}={}){
 const db=new D1(),env={ADMIN_DB:db},clock={time:base},now=()=>clock.time;t.after(()=>db.db.close());
 assert.equal((await scheduledWork(env,{},now)).lane,'MAINTENANCE');db.db.exec(BUSINESS_PENDING_INCOME_SCAN_SCHEMA.join(';'));
 await runBusinessIncomeOverview(env,async()=>overview(stamp),{now});
 db.db.prepare('UPDATE business_sync_state SET enabled=1,month=?,summary=?,next_run_at=? WHERE id=1').run(month,JSON.stringify({month,status:busy?'RUNNING':'COMPLETE'}),busy?0:stamp+3600);
 db.db.exec("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=1; UPDATE background_history_fairness_state SET finance_since_audit=4,reserved_returns_streak=2,next_history_work='COST'");
 db.db.prepare('UPDATE background_history_fairness_state SET last_auxiliary_at=?').run(stamp-300);
 const cursors=()=>({auxiliary:db.db.prepare('SELECT auxiliary_index FROM background_collection_lane_state').get(),audit:db.db.prepare('SELECT * FROM financial_audit_turns ORDER BY month').all(),coverage:db.db.prepare('SELECT * FROM financial_audit_coverage_turns ORDER BY month').all(),history:db.db.prepare('SELECT next_history_work,reserved_returns_streak FROM background_history_fairness_state').get()});
 const acquire=(extra={})=>acquireBackgroundLane(env,{month},{now,pendingIncomeRecovery:true,pendingIncomeScan:true,...extra});
 return {db,env,clock,now,cursors,acquire};
}
function store(f,status,next=stamp){
 const state=status==='UNAVAILABLE'?'RETRY_WAIT':status,frame=scanFrame(stamp,{state});
 f.db.db.prepare('INSERT OR REPLACE INTO business_pending_income_scan(id,payload,payload_checked_at,last_attempt_at,status,code,next_attempt_at) VALUES(1,?,?,?,?,?,?)').run(JSON.stringify(frame),stamp,stamp,status,status==='UNAVAILABLE'?'FINANCE_PENDING_INCOME_SCAN_TIMEOUT':null,next);
}
async function finish(f,lease,work={}){return finishBackgroundLane(f.env,lease,{now:f.now,auditSourceReads:work.audit_source_reads??0});}
async function financeTurn(f){const lease=await f.acquire();assert.equal(lease.lane,'FINANCE');await finish(f,lease);f.clock.time+=60000;}

test('a first complete-list scan reserves one existing opportunity, suppresses legacy recovery and preserves unrelated cursors',async t=>{
 const f=await fixture(t),before=f.cursors(),calls=[];
 const lease=await f.acquire();assert.equal(lease.lane,'HISTORY');assert.equal(lease.pending_income_scan,true);assert.equal(lease.pending_income_scan_enabled,true);assert.equal(lease.pending_income_recovery,undefined);
 const work=await runBackgroundHistoryWork(f.env,{getFinancePendingIncomeScan:async()=>{calls.push('SCAN');return scanFrame(stamp);},getFinanceIncomeDetail:async()=>{throw Error('legacy first page must not be read');}},{month,lease},{now:f.now});
 assert.equal(work.income_detail,'RUNNING');assert.equal(work.source_reads,1);assert.equal(work.audit_source_reads,1);assert.deepEqual(calls,['SCAN']);assert.equal(await finish(f,lease,work),true);assert.deepEqual(f.cursors(),before);
 const cached=await readBusinessPendingIncomeScan(f.env,{now:f.now});assert.equal(cached.status,'COLLECTING');assert.equal(cached.frame.scan.pages_read,1);
 const turn=f.db.db.prepare('SELECT * FROM background_pending_income_scan_turns').get();assert.equal(turn.reserved_streak,1);assert.equal(turn.next_attempt_at,stamp+60);assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM background_pending_income_recovery_attempts').get().n,0);
});

test('two reserved pages yield to an ordinary auxiliary; Finance turns do not reset the burst',async t=>{
 const f=await fixture(t),source=async()=>scanFrame(f.now()/1000);
 for(let index=0;index<2;index++){
  const lease=await f.acquire();assert.equal(lease.pending_income_scan,true);
  const work=await runBackgroundHistoryWork(f.env,{getFinancePendingIncomeScan:source},{month,lease},{now:f.now});await finish(f,lease,work);
  assert.equal(f.db.db.prepare('SELECT reserved_streak FROM background_pending_income_scan_turns').get().reserved_streak,index+1);await financeTurn(f);
 }
 const ordinary=await f.acquire();assert.equal(ordinary.pending_income_scan,undefined);assert.equal(ordinary.lane,'CATALOG');await finish(f,ordinary);
 assert.equal(f.db.db.prepare('SELECT reserved_streak FROM background_pending_income_scan_turns').get().reserved_streak,0);
 await financeTurn(f);const next=await f.acquire();assert.equal(next.pending_income_scan,true);await finish(f,next);
});

test('existing retries and independent scan attempt cooldowns are honored for every cache state',async t=>{
 for(const status of ['RUNNING','COMPLETE','UNAVAILABLE']){
  const f=await fixture(t);store(f,status,stamp+60);let lease=await f.acquire();assert.equal(lease.pending_income_scan,undefined,status);assert.equal(lease.lane,'CATALOG');await finish(f,lease);
  f.clock.time+=120000;f.db.db.exec("UPDATE background_collection_lane_state SET next_lane='AUXILIARY'");lease=await f.acquire();assert.equal(lease.pending_income_scan,true,status);await finish(f,lease);
 }
 const f=await fixture(t);store(f,'RUNNING');f.db.db.prepare('UPDATE background_pending_income_scan_turns SET next_attempt_at=?').run(stamp+300);
 const lease=await f.acquire();assert.equal(lease.pending_income_scan,undefined);assert.equal(lease.lane,'CATALOG');await finish(f,lease);
});

test('a missing service cannot monopolize auxiliaries or reset its cooldown through month/publication changes',async t=>{
 const f=await fixture(t),lease=await f.acquire(),before=f.cursors();
 const work=await runBackgroundHistoryWork(f.env,{}, {month,lease},{now:f.now});assert.equal(work.income_detail,'NO_SOURCE');assert.equal(work.source_reads,0);await finish(f,lease,work);assert.deepEqual(f.cursors(),before);
 assert.equal(f.db.db.prepare('SELECT next_attempt_at FROM background_pending_income_scan_turns').get().next_attempt_at,stamp+300);
 f.clock.time+=120000;f.db.db.exec("UPDATE background_collection_lane_state SET next_lane='AUXILIARY'");const ordinary=await f.acquire();assert.equal(ordinary.pending_income_scan,undefined);assert.equal(ordinary.lane,'CATALOG');await finish(f,ordinary);
 f.clock.time+=180000;f.db.db.exec("UPDATE background_collection_lane_state SET next_lane='AUXILIARY'");const retry=await f.acquire();assert.equal(retry.pending_income_scan,true);await finish(f,retry);
});

test('busy imports retain their four-Finance and five-minute budgets before scan reservations',async t=>{
 const f=await fixture(t,{busy:true});await publishTrackerMonth(f.env,f.now);f.db.db.prepare('UPDATE background_history_fairness_state SET finance_since_audit=0').run();
 for(let index=0;index<4;index++){const lease=await f.acquire();assert.equal(lease.lane,'FINANCE');assert.equal(lease.pending_income_scan,undefined);await finish(f,lease);f.clock.time+=60000;}
 const reserved=await f.acquire();assert.equal(reserved.pending_income_scan,true);await finish(f,reserved,{audit_source_reads:1});
 const g=await fixture(t,{busy:true});await publishTrackerMonth(g.env,g.now);g.db.db.prepare('UPDATE background_history_fairness_state SET last_auxiliary_at=?').run(stamp-299);
 const waiting=await g.acquire();assert.equal(waiting.lane,'FINANCE');assert.equal(waiting.pending_income_scan,undefined);await finish(g,waiting);
});

test('pause, stolen leases and expiry prevent scan publication and burst advancement',async t=>{
 const f=await fixture(t),lease=await f.acquire();f.db.db.prepare('UPDATE business_sync_state SET enabled=0').run();let calls=0;
 const work=await runBackgroundHistoryWork(f.env,{getFinancePendingIncomeScan:async()=>{calls++;return scanFrame(stamp);}},{month,lease},{now:f.now});assert.equal(work.source_reads,0);assert.equal(calls,0);await finish(f,lease,work);assert.equal(f.db.db.prepare('SELECT reserved_streak FROM background_pending_income_scan_turns').get().reserved_streak,0);
 const g=await fixture(t),stolen=await g.acquire();const old=await runBackgroundHistoryWork(g.env,{getFinancePendingIncomeScan:async()=>{g.db.db.prepare('UPDATE background_collection_lane_state SET revision=revision+1,lease_token=?').run(crypto.randomUUID());return scanFrame(stamp);}},{month,lease:stolen},{now:g.now});assert.equal(old.source_reads,1);assert.equal(old.income_detail,'PAUSED');assert.equal(await finish(g,stolen,old),false);assert.equal(g.db.db.prepare('SELECT COUNT(*) n FROM business_pending_income_scan').get().n,0);assert.equal(g.db.db.prepare('SELECT reserved_streak FROM background_pending_income_scan_turns').get().reserved_streak,0);
 const h=await fixture(t),expired=await h.acquire();h.clock.time+=300000;const late=await runBackgroundHistoryWork(h.env,{getFinancePendingIncomeScan:async()=>{throw Error('expired read');}},{month,lease:expired},{now:h.now});assert.equal(late.source_reads,0);assert.equal(await finish(h,expired,late),false);
});

test('a global Pending scan continues across the Brasília month boundary without advancing a monthly cursor',async t=>{
 const f=await fixture(t);f.clock.time=Date.UTC(2026,10,1,2,59,59);const started=f.now()/1000,before=f.cursors(),lease=await f.acquire();
 const work=await runBackgroundHistoryWork(f.env,{getFinancePendingIncomeScan:async()=>{f.clock.time+=2000;return scanFrame(f.now()/1000,{started});}},{month,lease},{now:f.now});assert.equal(work.source_reads,1);assert.equal(work.income_detail,'RUNNING');await finish(f,lease,work);assert.deepEqual(f.cursors(),before);
 const saved=await readBusinessPendingIncomeScan(f.env,{now:f.now});assert.equal(saved.status,'COLLECTING');assert.equal(saved.frame.scan.date_to,'2026-10-31');assert.equal(saved.frame.scan.scan_id,scanId);
 const next=await acquireBackgroundLane(f.env,{month:'2026-11'},{now:f.now,pendingIncomeScan:true});assert.equal(next.lane,'FINANCE');await finish(f,next);
});

test('the reserved and ordinary audit paths enforce one private source and prefer scan only when available',async t=>{
 const f=await fixture(t),lease=await f.acquire(),calls=[];
 const reserved=await runBackgroundHistoryWork(f.env,{getFinancePendingIncomeScan:async()=>{calls.push('SCAN');return {};}},{month,lease},{now:f.now,runPendingIncomeScan:async(_env,source)=>{await source();await assert.rejects(()=>source(),/BACKGROUND_HISTORY_READ_BUDGET/);return {status:'RUNNING'};}});assert.equal(reserved.source_reads,1);assert.deepEqual(calls,['SCAN']);await finish(f,lease,reserved);
 for(const available of [false,true]){
  const db=new D1();t.after(()=>db.db.close());db.db.exec(FINANCIAL_AUDIT_SCHEMA.join(';'));db.db.prepare("INSERT INTO financial_audit_turns(month,revision,next_work) VALUES(?,1,'INCOME_DETAIL')").run(month);db.db.prepare('INSERT INTO financial_audit_coverage_turns VALUES(?,0)').run(month);
  const actual=[],services={getFinanceIncomeDetail:async()=>{actual.push('LEGACY');return {};},...(available?{getFinancePendingIncomeScan:async()=>{actual.push('SCAN');return {};}}:{})};
  const invoke=kind=>async(_env,source)=>{await source();await assert.rejects(()=>source(),/FINANCIAL_AUDIT_READ_BUDGET/);return {status:'RUNNING',repeat:true};};
  const result=await runBusinessFinancialAudits({ADMIN_DB:db},services,{month},{now:f.now,runIncomeDetail:invoke('LEGACY'),runPendingIncomeScan:invoke('SCAN')});assert.equal(result.selected,'INCOME_DETAIL');assert.equal(result.source_reads,1);assert.deepEqual(actual,[available?'SCAN':'LEGACY']);assert.equal(result.repeat,true);assert.equal(db.db.prepare('SELECT next_work FROM financial_audit_turns').get().next_work,'RELEASES');
 }
});

test('optional scan tables are never referenced by legacy callers and invalid scan selectors fail closed',async t=>{
 const f=await fixture(t);f.db.db.exec('DROP TABLE business_pending_income_scan');let lease=await f.acquire({pendingIncomeScan:false,pendingIncomeRecovery:false});assert.equal(lease.pending_income_scan_enabled,undefined);assert.equal(lease.lane,'CATALOG');await finish(f,lease);
 await assert.rejects(f.acquire({pendingIncomeScan:'yes'}),/BACKGROUND_LANE_REQUEST_INVALID/);
 await assert.rejects(finishBackgroundLane(f.env,{...lease,lane:'HISTORY',pending_income_scan:true,pending_income_scan_enabled:true,reserved_returns:true},{now:f.now}),/BACKGROUND_LANE_REQUEST_INVALID/);
});

for(const minify of [false,true])test('generated cron paginates current Pending with one source and keeps legacy cursors (minify='+minify+')',async t=>{
 const {readFile}=await import('node:fs/promises'),{build}=await import('esbuild');
 const raw=await readFile(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8'),built=await build({stdin:{contents:raw+'\nexport {brazaAdmin as pendingScanSmoke};',loader:'js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const worker=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
 const f=await fixture(t),before=f.cursors();let calls=0;
 const work=await worker.pendingScanSmoke.scheduledWork(f.env,{getFinancePendingIncomeScan:async()=>{calls++;return scanFrame(stamp);}},f.now);
 assert.equal(work.lane,'HISTORY');assert.equal(work.income_detail,'RUNNING');assert.equal(calls,1);assert.deepEqual(f.cursors(),before);assert.equal((await readBusinessPendingIncomeScan(f.env,{now:f.now})).frame.scan.pages_read,1);
});
