import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {collectionFixture} from './business-collection-fixture.mjs';
import {createFinanceStore} from '../../finance/src/connection-store.mjs';
import {SCHEMA,scheduledWork} from '../src/admin.mjs';
import {readBusinessMonthDisplay} from '../src/business-month.mjs';
import {readBusinessSyncState,saveBusinessSyncPolicy,runBusinessSync} from '../src/business-sync.mjs';
import {runBusinessHistorySync} from '../src/business-history-sync.mjs';
import {buildBusinessMonthView} from '../src/business-month-view-state.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {readCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';
import {readFinanceEscrowReleaseCoverage} from '../../finance/src/escrow-releases.mjs';

const previousMonth='2026-10',currentMonth='2026-11';
const currentRow=f=>f.env.ADMIN_DB.db.prepare('SELECT * FROM business_sync_state WHERE id=1').get();
const historyRow=f=>f.env.ADMIN_DB.db.prepare('SELECT * FROM business_history_sync_state WHERE month=?').get(previousMonth)||null;
const counts=f=>({finance:f.calls.finance.length,ads:f.calls.ads.length,list:f.calls.list.length,detail:f.calls.detail.length,payment:f.calls.payment.length});
const read=async f=>{
 const observed=await readBusinessMonthDisplay(f.env,{month:previousMonth},{now:f.now});
 return buildBusinessMonthView(observed,await readBusinessSyncState(f.env),{now:f.now,contract:'business-month-view-v3'});
};
const run=f=>runBusinessHistorySync(f.env,f.services,{now:f.now,currentStatus:'NOT_DUE'});
async function tokens(f){
 const store=await createFinanceStore(f.financeEnv,{now:f.now});
 const row=f.financeEnv.FINANCE_DB.db.prepare('SELECT revision FROM finance_connections').get();
 await store.saveTokens({access_token:'PRIVATE_HISTORY_FIXTURE_ACCESS',refresh_token:'PRIVATE_HISTORY_FIXTURE_REFRESH',expires_at:Math.floor(f.now()/1000)+14400},{expectedRevision:row.revision});
}
function ads(selection,stamp){
 const children=[];
 for(let date=selection.start_date;date<=selection.end_date;){
  const start=Date.parse(date+'T00:00:00Z'),end=Math.min(start+14*86400000,Date.parse(selection.end_date+'T00:00:00Z')),range={start_date:date,end_date:new Date(end).toISOString().slice(0,10)},daily=[];
  for(let at=start;at<=end;at+=86400000)daily.push({date:new Date(at).toISOString().slice(0,10),expense:1.25,broad_gmv:12.5,broad_order:1,broad_roas:10,direct_gmv:0,direct_order:0,direct_roas:0});
  children.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:range,balance:30,daily},range,stamp));date=new Date(end+86400000).toISOString().slice(0,10);
 }
 return buildAdsCalendar(children,selection,stamp);
}
async function fixture(t,{full=true,ongoing=true}={}){
 const f=await collectionFixture({daily:true,allPaid:true,windowCounts:[2,1],paymentDelayMs:0});
 t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 await f.env.ADMIN_DB.batch(SCHEMA.map(sql=>f.env.ADMIN_DB.prepare(sql)));
 f.changed=false;
 f.state.detailHook=({ids})=>f.provider({order_list:ids.map(index=>({order_sn:f.serial(index),order_status:index===0&&f.changed?'CANCELLED':index===0&&ongoing?'SHIPPED':'COMPLETED',currency:'BRL',create_time:Date.UTC(2026,9,index<60?10:20,12)/1000,item_list:[{item_id:f.item(index),model_id:0,model_quantity_purchased:1}]}))});
 f.state.listHook=({request})=>Number(new URL(request.url).searchParams.get('time_from'))>=Date.UTC(2026,9,31,3)/1000?f.provider({order_list:[],more:false,next_cursor:''}):undefined;
 f.services.getAdsCalendar=async(_,selection)=>{f.calls.ads.push(selection);return ads(selection,Math.floor(f.now()/1000));};
 f.clock.time=Date.UTC(2026,9,full?31:24,12);await tokens(f);
 let frame=await f.invoke('start');for(let n=0;frame.status==='RUNNING'&&n<20;n++)frame=await f.invoke('step');assert.equal(frame.status,'COMPLETE');await f.invoke('ads');
 f.clock.time=Date.UTC(2026,10,1,12);await tokens(f);
 const current=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(current.status,'COMPLETE');assert.equal(current.state.month,currentMonth);
 const provider=f.services.getFinanceBusinessPeriod;f.options=[];
 f.services.getFinanceBusinessPeriod=async(binding,input,options)=>{f.options.push(options);return provider(binding,input,options);};
 return f;
}
async function opportunity(f,seconds=61){
 f.clock.time+=seconds*1000;
 // Simulate a later idle Finance opportunity after the primary collector has
 // renewed its normal five-minute schedule; do not bypass its priority gate.
 f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET next_run_at=? WHERE id=1').run(Math.floor(f.now()/1000)+300);
 const before=currentRow(f),called=counts(f),result=await run(f);
 assert.deepEqual(currentRow(f),before,'historical work must leave the current singleton unchanged');
 assert.ok(counts(f).finance-called.finance<=1);assert.equal(counts(f).ads,called.ads);
 return result;
}

// The current November publication is an observed empty cohort, so its first
// natural cron opportunity now audits Returns before idle Finance maintenance.
// Complete that real reservation rather than changing the scheduler's state.
async function currentReturnsReservation(f,schedule=scheduledWork){
 const publication=await readCompletedBusinessMonth(f.env,currentMonth,{now:f.now});assert.equal(publication.payload.slots.length,1);
 const frame=publication.payload.slots[0].frame;assert.equal(frame.coverage.orders,0);let reads=0;
 const before=currentRow(f),called=counts(f),checked_at=Math.floor(f.now()/1000);
 const getFinanceReconciliation=async(_,input)=>{
  reads++;assert.deepEqual(input,{operation:'step',run_id:frame.run_id});
  const report={schema:'finance_reconciliation_v1',run_id:frame.run_id,source_revision:frame.revision,start_date:frame.start_date,end_date:frame.end_date,checked_at,status:'CHECKED',source_checked_at:{finance_oldest_at:null,finance_latest_at:null,returns_oldest_at:null,returns_latest_at:null},coverage:{orders:0,evidence_orders:0,missing_evidence_orders:0,paid_orders:0,review_orders:0,return_orders:0,return_unknown_orders:0},adjustments:{reported_orders:0,missing_orders:0,conflicting_orders:0,known_adjustment_cents:0,base_repass_cents:0,after_adjustment_repass_cents:0},returns:{reference_count:0,checked_count:0,pending_count:0,known_requested_refund_cents:0,requested_amount_complete:true,permission:'UNKNOWN'},cases:[],truncation:{truncated:false,cases_total:0,cases_included:0},pending:['SETTLEMENT_NOT_RECONCILED'],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};
  assert.ok(projectReconciliationFrame(report));return report;
 };
 const result=await schedule(f.env,{...f.services,getFinanceReconciliation},f.now);assert.equal(result.lane,'HISTORY');assert.equal(result.reconciliation,'CHECKED');assert.equal(result.collection,'DEFERRED');assert.equal(reads,1);
 assert.deepEqual(currentRow(f),before);assert.deepEqual(counts(f),called,'the reserved audit does not import Finance, Ads or previous-month orders');assert.equal(historyRow(f),null);
}


// Once current Returns is checked, the first coverage audit gets one bounded
// opportunity even while the normal lane still says FINANCE. Use the actual
// saved Finance evidence reader; it must not import either month's orders.
async function firstCoverageReservation(f,schedule=scheduledWork){
 const publication=await readCompletedBusinessMonth(f.env,previousMonth,{now:f.now}),before=currentRow(f),called=counts(f),options=f.options.length;let reads=0;
 const getFinanceEscrowReleaseCoverage=async(_,input)=>{
  reads++;assert.equal(input.operation,'coverage');assert.equal(input.cohort_month,previousMonth);assert.equal(input.through_month,currentMonth);
  const references=value=>value.map(row=>({run_id:row.run_id,source_revision:row.source_revision})).sort((a,b)=>a.run_id.localeCompare(b.run_id));
  assert.deepEqual(references(input.sources),references(publication.payload.slots.map(({frame})=>({run_id:frame.run_id,source_revision:frame.revision}))));
  return readFinanceEscrowReleaseCoverage(f.financeEnv,{...input,now:f.now});
 };
 const result=await schedule(f.env,{...f.services,getFinanceEscrowReleaseCoverage},f.now);
 assert.equal(result.lane,'HISTORY');assert.equal(result.release_coverage,'COLLECTING');assert.equal(result.collection,'DEFERRED');assert.equal(result.history,'DEFERRED');assert.equal(reads,1);
 assert.deepEqual(currentRow(f),before,'initial coverage cannot change the current-month singleton');assert.deepEqual(counts(f),called,'saved coverage cannot call Finance import, Ads or the provider');assert.equal(f.options.length,options);assert.equal(historyRow(f),null);
 assert.equal(f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM financial_audit_coverage_turns WHERE month=?').get(currentMonth).n,1,'the real bootstrap, not a fixture marker, enables the following Finance opportunity');
 const stored=f.env.ADMIN_DB.db.prepare('SELECT payload FROM business_escrow_release_coverage WHERE cohort_month=?').get(previousMonth);assert.ok(stored);assert.ok(JSON.parse(stored.payload).sources.every(row=>row.status==='AVAILABLE'));
}

test('previous-month paid cancellation leaves its original daily profit only after a complete coherent publication',async t=>{
 const f=await fixture(t),before=await read(f),original=before.daily_summary.days[9],source=before.audit_scope;
 assert.equal(before.display.coverage.ongoing,1);assert.equal(original.coverage.paid,2);assert.equal(original.estimate_cents!==null,true);
 f.changed=true;const first=await opportunity(f,0);assert.equal(first.status,'RUNNING');
 assert.deepEqual((await read(f)).audit_scope,source);
 const second=await opportunity(f);assert.equal(second.status,'RUNNING');
 const during=await read(f);assert.deepEqual(during.audit_scope,source);assert.equal(during.daily_summary.days[9].coverage.paid,2);
 let result=second;for(let n=0;result.status==='RUNNING'&&n<12;n++)result=await opportunity(f);
 assert.equal(result.status,'COMPLETE');const after=await read(f),updated=after.daily_summary.days[9];
 assert.ok(after.audit_scope.publication_revision>source.publication_revision);assert.equal(after.display.coverage.paid,2);assert.equal(after.display.coverage.cancelled,1);
 assert.equal(updated.coverage.paid,1);assert.equal(updated.coverage.cancelled,1);
 assert.equal(updated.sales_cents,original.sales_cents-6525);assert.equal(updated.payout_cents,original.payout_cents-4751);assert.equal(updated.production_cost_cents,original.production_cost_cents-1590);assert.equal(updated.estimate_cents,original.estimate_cents-3161);
 assert.ok(f.options.length>0);assert.ok(f.options.every(options=>options.timeoutMs===45000));
 assert.equal(historyRow(f).last_error,null);assert.equal(historyRow(f).failure_count,0);
 assert.doesNotMatch(JSON.stringify(historyRow(f)),/PRIVATE|token|order_sn|buyer/);
 const calls=counts(f);assert.equal((await run(f)).status,'NOT_DUE');assert.deepEqual(counts(f),calls);
 assert.equal((await opportunity(f,901)).status,'IDLE');assert.deepEqual(counts(f),calls,'terminal fully covered months stop refreshing');
});

test('a terminal publication ending before month-end is closed through the last calendar day without an Ads read',async t=>{
 const f=await fixture(t,{full:false,ongoing:false});assert.equal((await read(f)).display.end_date,'2026-10-24');
 let result=await opportunity(f,0);for(let n=0;result.status==='RUNNING'&&n<12;n++)result=await opportunity(f);
 assert.equal(result.status,'COMPLETE');const closed=await read(f);assert.equal(closed.display.end_date,'2026-10-31');
 assert.ok(closed.display.result.pending.includes('ADS_UNAVAILABLE'));assert.equal(closed.daily_summary.days[9].estimate_cents,null,'an older partial Ads calendar cannot masquerade as complete month-end coverage');
 const selected=f.calls.finance.filter(call=>call.operation==='start'&&call.start_date==='2026-10-31');assert.equal(selected.length,1);
});

test('current-month work, failures, pause, near due time and a live lease prevent historical provider calls',async t=>{
 const f=await fixture(t),initial=currentRow(f),before=counts(f);
 for(const currentStatus of ['COMPLETE','RUNNING','ERROR','PARTIAL','LEASED'])assert.equal((await runBusinessHistorySync(f.env,f.services,{now:f.now,currentStatus})).status,'DEFERRED');
 for(const patch of [
  {next_run_at:Math.floor(f.now()/1000)+50},
  {status:'RUNNING'},
  {last_error:'BUSINESS_SYNC_COLLECTION_UNAVAILABLE',failure_count:1},
  {month:'2026-10'},
  {summary:JSON.stringify({...JSON.parse(initial.summary),month:'2026-10',start_date:'2026-10-01',end_date:'2026-10-01'})},
 ]){
  const fields=Object.keys(patch);f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET '+fields.map(key=>key+'=?').join(',')+' WHERE id=1').run(...Object.values(patch));
  assert.equal((await run(f)).status,'DEFERRED');f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET '+fields.map(key=>key+'=?').join(',')+' WHERE id=1').run(...fields.map(key=>initial[key]));
 }
 f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET lease_token=?,lease_expires_at=?').run(crypto.randomUUID(),Math.floor(f.now()/1000)+120);assert.equal((await run(f)).status,'LEASED');
 f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET lease_token=NULL,lease_expires_at=NULL').run();
 const state=await readBusinessSyncState(f.env);await saveBusinessSyncPolicy(f.env,{revision:state.revision,enabled:false},'fixture-owner',{now:f.now});assert.equal((await run(f)).status,'PAUSED');
 assert.deepEqual(counts(f),before);assert.equal(historyRow(f),null);
});

test('a slow but complete current cohort does not add an artificial stale-age blocker to historical maintenance',async t=>{
 const f=await fixture(t),row=currentRow(f),summary=JSON.parse(row.summary),stamp=Math.floor(f.now()/1000);
 summary.source_checked_at.finance_oldest_at=stamp-1000;summary.source_checked_at.finance_latest_at=stamp;summary.pending.push('FINANCIAL_SOURCE_STALE');summary.net_estimate_cents=null;
 f.env.ADMIN_DB.db.prepare("UPDATE business_sync_state SET status='PARTIAL',summary=?").run(JSON.stringify(summary));
 assert.equal((await opportunity(f,0)).status,'RUNNING');
});

test('historical source failures retain the publication and back off independently of current-month state',async t=>{
 const f=await fixture(t),before=await read(f),provider=f.services.getFinanceBusinessPeriod;
 f.services.getFinanceBusinessPeriod=async()=>{throw Error('PRIVATE_HISTORY_PROVIDER_FAILURE');};
 for(const [index,delay] of [300,600,1200,1800].entries()){
  const result=await opportunity(f,index?historyRow(f).next_run_at-Math.floor(f.now()/1000):0);
  assert.equal(result.status,'ERROR');assert.equal(historyRow(f).failure_count,index+1);assert.equal(historyRow(f).next_run_at,Math.floor(f.now()/1000)+delay);
  assert.equal(historyRow(f).last_error,'BUSINESS_HISTORY_COLLECTION_UNAVAILABLE');assert.deepEqual((await read(f)).audit_scope,before.audit_scope);
  assert.doesNotMatch(JSON.stringify(historyRow(f)),/PRIVATE/);
 }
 f.services.getFinanceBusinessPeriod=provider;
 assert.equal((await opportunity(f,1801)).status,'RUNNING');assert.equal(historyRow(f).failure_count,0);
});

test('overlapping history and current collectors respect the same lease while paused responses cannot advance the publication',async t=>{
 const f=await fixture(t),provider=f.services.getFinanceBusinessPeriod,source=(await read(f)).audit_scope;
 let release,entered;const wait=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 f.services.getFinanceBusinessPeriod=async(...args)=>{entered();await wait;return provider(...args);};
 const first=run(f);await started;
 assert.equal((await run(f)).status,'LEASED');assert.equal((await runBusinessSync(f.env,f.services,{now:f.now})).status,'LEASED');
 const state=await readBusinessSyncState(f.env),paused=await saveBusinessSyncPolicy(f.env,{revision:state.revision,enabled:false},'fixture-owner',{now:f.now});
 release();assert.equal((await first).status,'PAUSED');assert.deepEqual((await read(f)).audit_scope,source);assert.equal(historyRow(f),null);
 const after=await readBusinessSyncState(f.env);assert.equal(after.enabled,false);assert.equal(after.revision,paused.revision);assert.equal(after.status,'PAUSED');assert.equal(after.lease_expires_at,null);
});

for(const interrupted of ['rollover','expiry','replacement'])test(`a historical ${interrupted} fences late responses and preserves the previous publication`,async t=>{
 const f=await fixture(t),provider=f.services.getFinanceBusinessPeriod,source=(await read(f)).audit_scope;
 const replacement=crypto.randomUUID();
 f.services.getFinanceBusinessPeriod=async(...args)=>{
  const value=await provider(...args);
  if(interrupted==='rollover')f.clock.time=Date.UTC(2026,11,1,3);
  else if(interrupted==='expiry')f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET lease_expires_at=?').run(Math.floor(f.now()/1000)-1);
  else f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET lease_token=?,lease_expires_at=?').run(replacement,Math.floor(f.now()/1000)+120);
  return value;
 };
 const result=await run(f);assert.equal(result.status,interrupted==='replacement'?'LEASED':'DEFERRED');assert.equal(result.finance_steps,1);assert.equal(historyRow(f),null);
 assert.deepEqual((await read(f)).audit_scope,source);
 if(interrupted==='replacement')assert.equal(currentRow(f).lease_token,replacement);else assert.equal(currentRow(f).lease_token,null);
});

test('the scheduled Finance lane attempts historical maintenance only after current Finance returns NOT_DUE',async t=>{
 const f=await fixture(t);assert.equal((await scheduledWork(f.env,f.services,f.now)).collection,'MAINTENANCE');
 await currentReturnsReservation(f);await firstCoverageReservation(f);
 const before=currentRow(f),calls=counts(f);
 const value=await scheduledWork(f.env,f.services,f.now);
 assert.equal(value.lane,'FINANCE');assert.equal(value.collection,'NOT_DUE');assert.equal(value.history_collection,'RUNNING');
 assert.deepEqual(currentRow(f),before);assert.equal(counts(f).finance,calls.finance+1);assert.equal(counts(f).ads,calls.ads);
});

for(const minify of [false,true])test(`the generated App cron runs previous-month maintenance with an unchanged current singleton (minify=${minify})`,async t=>{
 const source=await readFile(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8');
 // Export only the generated admin test seam in memory; neither the deployed
 // Worker nor its public routes gain an export or a diagnostic bypass.
 const compiled=await build({stdin:{contents:source+'\nexport {brazaAdmin as historySmoke};',loader:'js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const {historySmoke}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const f=await fixture(t);assert.equal((await historySmoke.scheduledWork(f.env,f.services,f.now)).collection,'MAINTENANCE');
 await currentReturnsReservation(f,historySmoke.scheduledWork);await firstCoverageReservation(f,historySmoke.scheduledWork);
 const before=currentRow(f),calls=counts(f),value=await historySmoke.scheduledWork(f.env,f.services,f.now);
 assert.equal(value.lane,'FINANCE');assert.equal(value.collection,'NOT_DUE');assert.equal(value.history_collection,'RUNNING');
 assert.equal(historyRow(f).status,'RUNNING');assert.equal(historyRow(f).failure_count,0);
 assert.deepEqual(currentRow(f),before);assert.equal(counts(f).finance,calls.finance+1);assert.equal(counts(f).ads,calls.ads);
 assert.deepEqual(f.options,[{timeoutMs:45000}]);
});
