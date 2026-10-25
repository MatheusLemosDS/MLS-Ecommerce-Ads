import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {businessMonth} from '../src/business-month.mjs';
import {scheduledWork} from '../src/admin.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {runBusinessSync,readBusinessSyncState,saveBusinessSyncPolicy,BusinessSyncError} from '../src/business-sync.mjs';

const clock=Date.UTC(2026,9,24,12),stamp=clock/1000,now=()=>clock;
function environment(){
 const ADMIN_DB=new D1();ADMIN_DB.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);CREATE TABLE hermes_jobs(id TEXT PRIMARY KEY,payload TEXT)');
 ADMIN_DB.db.prepare('INSERT INTO variant_bindings_state VALUES(1,3,?,?)').run('[]',new Date(clock).toISOString());
 ADMIN_DB.db.prepare('INSERT INTO production_costs_state VALUES(1,7,?,?)').run(JSON.stringify(COST_DEFAULTS),new Date(clock).toISOString());return {ADMIN_DB};
}
function finance(selection,index,{running=false,at=stamp}={}){
 const value={schema:'finance_business_period_v1',run_id:'11111111-1111-4111-8111-'+String(index).padStart(12,'0'),revision:1,status:running?'RUNNING':'COMPLETE',start_date:selection.start_date,end_date:selection.end_date,cutoff_at:at-2,checked_at:at,currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:running?0:1,duplicate_orders:0,coverage:{orders:0,paid:0,completed:0,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:0,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'0',sales_base_raw:'0',known_expected_repass_raw:'0',expected_repass_raw:'0',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:0,unavailable_orders:0,known_base_raw:'0',known_tax_raw:'0'},items:[],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED',product_breakdown:{schema:'business_product_breakdown_v1',mixed_orders:0,mixed_payment_covered:0,mixed_payment_missing:0,known_mixed_sales_base_raw:'0',known_mixed_expected_repass_raw:'0',known_mixed_ads_adjustment_raw:'0',known_mixed_invoice_tax_raw:'0',products:[]}};
 assert.ok(projectBusinessPeriodFrame(value));return value;
}
function calendar(selection,at=stamp,missing=null){
 const days=[];for(let day=Date.parse(selection.start_date+'T00:00:00Z');day<=Date.parse(selection.end_date+'T00:00:00Z');day+=86400000)days.push(new Date(day).toISOString().slice(0,10));
 const children=[];for(let index=0;index<days.length;index+=15){const dates=days.slice(index,index+15),range={start_date:dates[0],end_date:dates.at(-1)};children.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:range,balance:31.07,daily:dates.filter(day=>day!==missing).map(date=>({date,expense:0,broad_gmv:0,broad_order:0,broad_roas:0,direct_gmv:0,direct_order:0,direct_roas:0}))},range,at));}
 return buildAdsCalendar(children,selection,at);
}
function source({running=false,time=now,missing=null}={}){
 const calls={finance:[],ads:[]},frames=new Map();let sequence=0;
 return {calls,frames,getFinanceBusinessPeriod:async(_,selection,options)=>{assert.equal(options.timeoutMs,45000);calls.finance.push(selection);if(selection.operation==='start'){const value=finance(selection,++sequence,{running,at:Math.floor(time()/1000)});frames.set(value.run_id,value);return structuredClone(value);}return structuredClone(frames.get(selection.run_id));},getAdsCalendar:async(_,selection,options)=>{assert.equal(options.timeoutMs,10000);calls.ads.push(selection);return calendar(selection,Math.floor(time()/1000),missing);}};
}
const run=(env,services,options={})=>runBusinessSync(env,services,{now,...options});
const rows=(env,table)=>env.ADMIN_DB.db.prepare('SELECT * FROM '+table).all();
const privateRows=env=>['business_sync_state','business_sync_audit','business_month_runs','business_month_frames','business_month_ads'].flatMap(table=>rows(env,table));

test('default unattended collection uses the current BRT month, preserves expenses and costs, and stores compact estimate metadata',async()=>{
 const env=environment(),services=source();await businessMonth(env,{operation:'expenses',month:'2026-10',revision:0,external_expenses_cents:12345,recharge_treatment:'UNCONFIRMED'},services,{now});
 const expenses=rows(env,'business_month_expenses'),expenseAudit=rows(env,'business_month_expenses_audit'),costs=rows(env,'production_costs_state'),bindings=rows(env,'variant_bindings_state');
 const result=await run(env,services);assert.equal(result.status,'COMPLETE');assert.equal(result.finance_steps,2);assert.equal(result.ads_reads,1);
 assert.equal(result.state.enabled,true);assert.equal(result.state.mode,'READ_ONLY');assert.equal(result.state.last_success_at,stamp);assert.equal(result.state.next_run_at,stamp+300);
 assert.deepEqual(services.calls.finance,[{operation:'start',start_date:'2026-10-01',end_date:'2026-10-15'},{operation:'start',start_date:'2026-10-16',end_date:'2026-10-24'}]);
 const summary=result.state.summary;assert.equal(summary.month,'2026-10');assert.equal(summary.net_estimate_cents,-20950);assert.equal(summary.net_profit_cents,null);assert.equal(summary.expenses_revision,1);assert.equal(summary.tax_policy_revision,1);assert.equal(summary.bindings_revision,3);assert.equal(summary.costs_revision,7);assert.equal(summary.source_checked_at.finance_oldest_at,stamp-2);assert.equal(summary.source_checked_at.ads_at,stamp);assert.equal(summary.ads_covered_days,24);assert.equal(summary.ads_total_days,24);assert.equal(summary.basis,'PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE');
 assert.deepEqual(rows(env,'business_month_expenses'),expenses);assert.deepEqual(rows(env,'business_month_expenses_audit'),expenseAudit);assert.deepEqual(rows(env,'production_costs_state'),costs);assert.deepEqual(rows(env,'variant_bindings_state'),bindings);assert.equal(rows(env,'hermes_jobs').length,0);
 const audit=rows(env,'business_sync_audit');assert.equal(audit.length,1);assert.equal(audit[0].kind,'RUN');assert.ok(Buffer.byteLength(audit[0].summary)<3000);assert.ok(!audit[0].summary.includes('product_breakdown'));assert.ok(!audit[0].summary.includes('run_id'));assert.equal(result.state.lease_expires_at,null);
 const recorded=rows(env,'business_checkpoint_state');assert.equal(recorded.length,1);
 const checkpoint=JSON.parse(recorded[0].payload);assert.equal(checkpoint.month,'2026-10');assert.equal(checkpoint.result.expected_net_cents,summary.net_estimate_cents);assert.equal(checkpoint.result.realized_net_cents,null);assert.equal(checkpoint.versions.costs,7);assert.equal(checkpoint.versions.expenses,1);
 assert.ok(rows(env,'business_checkpoint_history').length>0,'unattended collection records the explanation without an open browser');
 assert.equal((await run(env,services)).status,'NOT_DUE');assert.equal(services.calls.finance.length,2);assert.equal(rows(env,'business_sync_audit').length,1);
});

test('an atomic lease excludes overlapping schedulers and resumes a running provider run on the following tick',async()=>{
 const env=environment(),services=source({running:true});let entered,release;
 const blocked=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve),provider=services.getFinanceBusinessPeriod;
 services.getFinanceBusinessPeriod=async(...args)=>{entered();await blocked;return provider(...args);};
 const first=run(env,services);await started;const duplicate=await run(env,services);assert.equal(duplicate.status,'LEASED');assert.equal(duplicate.finance_steps,0);assert.equal(services.calls.finance.length,0);
 release();const initial=await first;assert.equal(initial.status,'RUNNING');assert.equal(initial.finance_steps,4);assert.equal(initial.ads_reads,0);assert.equal(initial.state.summary.net_estimate_cents,null);assert.equal(initial.state.summary.net_profit_cents,null);assert.ok(initial.state.summary.pending.includes('COLLECTING'));assert.equal(initial.state.summary.progress.windows_complete,0);
 const id=[...services.frames.keys()][0];assert.deepEqual(services.calls.finance.slice(1),Array.from({length:3},()=>({operation:'step',run_id:id})));
 services.getFinanceBusinessPeriod=provider;const resumed=await run(env,services,{now:()=>clock+300000,maxSteps:1});assert.equal(resumed.status,'RUNNING');assert.equal(resumed.finance_steps,1);assert.deepEqual(services.calls.finance.at(-1),{operation:'step',run_id:id});assert.equal(resumed.state.failure_count,0);assert.equal(rows(env,'business_sync_audit').length,2);
});

test('simultaneous first cron ticks race through one atomic lease and never duplicate source reads',async()=>{
 const env=environment(),services=source();let entered,release;
 const blocked=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve),provider=services.getFinanceBusinessPeriod;
 services.getFinanceBusinessPeriod=async(...args)=>{entered();await blocked;return provider(...args);};
 const first=run(env,services),second=run(env,services);await started;
 const skipped=await Promise.race([first,second]);assert.equal(skipped.status,'LEASED');assert.equal(skipped.finance_steps,0);
 release();const results=await Promise.all([first,second]);assert.deepEqual(results.map(result=>result.status).sort(),['COMPLETE','LEASED']);assert.equal(services.calls.finance.length,2);assert.equal(services.calls.ads.length,1);assert.equal(rows(env,'business_sync_audit').length,1);
});

test('pause and resume are explicit versioned policy changes and paused ticks never read providers',async()=>{
 const env=environment(),services=source(),state=await readBusinessSyncState(env);assert.equal(state.enabled,true);
 const paused=await saveBusinessSyncPolicy(env,{revision:state.revision,enabled:false},'fixture-admin',{now});assert.equal(paused.status,'PAUSED');assert.equal(paused.revision,2);
 assert.equal((await run(env,services)).status,'PAUSED');assert.equal(services.calls.finance.length,0);assert.equal(services.calls.ads.length,0);
 await assert.rejects(saveBusinessSyncPolicy(env,{revision:1,enabled:true},'fixture-admin',{now}),error=>error instanceof BusinessSyncError&&error.status===409);
 const enabled=await saveBusinessSyncPolicy(env,{revision:2,enabled:true},'fixture-admin',{now});assert.equal(enabled.enabled,true);assert.equal(enabled.revision,3);assert.equal(enabled.next_run_at,0);
 assert.equal((await run(env,services)).status,'COMPLETE');assert.equal(rows(env,'business_sync_audit').filter(row=>row.kind==='POLICY').length,2);
});

test('a policy pause during a provider call stops the following step and keeps the running lease exclusive',async()=>{
 const env=environment(),services=source({running:true}),provider=services.getFinanceBusinessPeriod;let paused=false;
 services.getFinanceBusinessPeriod=async(...args)=>{const value=await provider(...args);if(!paused){paused=true;const current=await readBusinessSyncState(env);const policy=await saveBusinessSyncPolicy(env,{revision:current.revision,enabled:false},'fixture-admin',{now});assert.equal(policy.status,'PAUSED');assert.equal(policy.lease_expires_at,stamp+300);assert.equal((await run(env,services)).status,'PAUSED');}return value;};
 const result=await run(env,services);assert.equal(result.status,'PAUSED');assert.equal(result.finance_steps,1);assert.equal(result.ads_reads,0);assert.equal(result.state.lease_expires_at,null);assert.equal(services.calls.finance.length,1);
});

test('a pause after the final financial response prevents the Ads read and a pause during Ads is honored after its response',async()=>{
 for(const pauseAt of ['FINANCE','ADS']){
  const env=environment(),services=source(),financeProvider=services.getFinanceBusinessPeriod,adsProvider=services.getAdsCalendar;
  const pause=async()=>{const current=await readBusinessSyncState(env);await saveBusinessSyncPolicy(env,{revision:current.revision,enabled:false},'fixture-admin',{now});};
  services.getFinanceBusinessPeriod=async(...args)=>{const frame=await financeProvider(...args);if(pauseAt==='FINANCE'&&services.calls.finance.length===2)await pause();return frame;};
  services.getAdsCalendar=async(...args)=>{const frame=await adsProvider(...args);if(pauseAt==='ADS')await pause();return frame;};
  const result=await run(env,services);assert.equal(result.status,'PAUSED',pauseAt);assert.equal(result.state.enabled,false);assert.equal(result.finance_steps,2);assert.equal(result.ads_reads,pauseAt==='ADS'?1:0);assert.equal(services.calls.ads.length,result.ads_reads);assert.equal(result.state.lease_expires_at,null);assert.equal(result.state.failure_count,0);assert.equal(result.state.last_success_at,null);
  assert.equal((await run(env,services)).status,'PAUSED');assert.equal(services.calls.ads.length,result.ads_reads);
 }
});

test('a deleted paused state with policy history fails closed when the database is reopened',async()=>{
 const env=environment(),current=await readBusinessSyncState(env);
 await saveBusinessSyncPolicy(env,{revision:current.revision,enabled:false},'fixture-admin',{now});
 env.ADMIN_DB.db.exec('DELETE FROM business_sync_state');
 const reopened={ADMIN_DB:Object.create(env.ADMIN_DB)},services=source();
 await assert.rejects(readBusinessSyncState(reopened),error=>error instanceof BusinessSyncError&&error.message==='BUSINESS_SYNC_STATE_INVALID');
 await assert.rejects(run(reopened,services),error=>error instanceof BusinessSyncError&&error.message==='BUSINESS_SYNC_STATE_INVALID');
 assert.equal(rows(env,'business_sync_state').length,0);assert.equal(rows(env,'business_sync_audit').length,1);assert.equal(services.calls.finance.length,0);assert.equal(services.calls.ads.length,0);
});

test('a completed resumed month with stale financial windows never records collection success',async()=>{
 const env=environment();let time=clock;const services=source({time:()=>time});
 const first=await run(env,services,{now:()=>time,maxSteps:1});assert.equal(first.status,'RUNNING');assert.equal(first.state.summary.progress.windows_complete,1);assert.equal(first.state.last_success_at,null);
 time+=1000000;
 const result=await run(env,services,{now:()=>time});assert.equal(result.state.summary.status,'COMPLETE');assert.ok(result.state.summary.pending.includes('FINANCIAL_SOURCE_STALE'));assert.equal(result.status,'ERROR');assert.equal(result.state.last_error,'BUSINESS_SYNC_COLLECTION_UNAVAILABLE');assert.equal(result.state.last_success_at,null);assert.equal(result.state.failure_count,1);assert.equal(result.state.summary.net_estimate_cents,null);assert.equal(rows(env,'business_sync_audit').at(-1).status,'ERROR');
});

test('a stale month still collecting pages resumes at the normal interval and clears obsolete failure backoff',async()=>{
 const env=environment();let time=clock,page=0;const services=source({running:true,time:()=>time}),provider=services.getFinanceBusinessPeriod;
 services.getFinanceBusinessPeriod=async(...args)=>{
  const value=await provider(...args);value.pages_read=++page;value.revision=page;value.checked_at=Math.floor(time/1000);return value;
 };
 const first=await run(env,services,{now:()=>time,maxSteps:1});assert.equal(first.status,'RUNNING');assert.equal(first.state.summary.progress.pages_read,1);
 env.ADMIN_DB.db.prepare("UPDATE business_sync_state SET status='ERROR',failure_count=4,last_error='BUSINESS_SYNC_COLLECTION_UNAVAILABLE',next_run_at=? WHERE id=1").run(stamp+1800);
 time+=2268000;
 const result=await run(env,services,{now:()=>time,maxSteps:2});
 assert.equal(result.status,'RUNNING');assert.equal(result.finance_steps,2);assert.equal(result.state.summary.progress.pages_read,3);
 assert.ok(result.state.summary.pending.includes('COLLECTING'));assert.ok(result.state.summary.pending.includes('FINANCIAL_SOURCE_STALE'));
 assert.equal(result.state.failure_count,0);assert.equal(result.state.last_error,null);assert.equal(result.state.next_run_at,Math.floor(time/1000)+300);
 assert.equal(result.state.last_success_at,null);assert.equal(result.state.summary.net_estimate_cents,null);assert.equal(result.state.summary.net_profit_cents,null);
 const audit=rows(env,'business_sync_audit').at(-1);assert.equal(audit.status,'RUNNING');assert.equal(audit.error_code,null);
});

test('a stale running month with an actual source failure still backs off and preserves its pending financial result',async()=>{
 const env=environment();let time=clock;const services=source({running:true,time:()=>time}),provider=services.getFinanceBusinessPeriod;
 await run(env,services,{now:()=>time,maxSteps:1});time+=1000000;
 services.getFinanceBusinessPeriod=async(...args)=>({...await provider(...args),diagnostic:'BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE'});
 const result=await run(env,services,{now:()=>time,maxSteps:1});
 assert.equal(result.status,'ERROR');assert.equal(result.state.failure_count,1);assert.equal(result.state.last_error,'BUSINESS_SYNC_COLLECTION_UNAVAILABLE');
 assert.ok(result.state.summary.pending.includes('SOURCE_UNAVAILABLE'));assert.ok(result.state.summary.pending.includes('FINANCIAL_SOURCE_STALE'));
 assert.equal(result.state.summary.net_estimate_cents,null);assert.equal(result.state.last_success_at,null);
});

test('an unavailable financial source is tried once per tick and retains the already imported partial collection',async()=>{
 for(const outcome of ['DIAGNOSTIC','THROW']){
  const env=environment();let time=clock,failed=false;const services=source({running:true,time:()=>time}),provider=services.getFinanceBusinessPeriod;
  services.getFinanceBusinessPeriod=async(...args)=>{
   const value=await provider(...args);value.pages_read=2;value.revision=2;value.coverage.orders=value.coverage.cancelled=5;
   if(failed){if(outcome==='THROW')throw Error('PRIVATE_PROVIDER_FAILURE');value.diagnostic='BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE';}
   return value;
  };
  const first=await run(env,services,{now:()=>time,maxSteps:1});assert.equal(first.state.summary.coverage.orders,5);assert.equal(first.state.summary.progress.pages_read,2);
  failed=true;time+=300000;const before=services.calls.finance.length;
  const result=await run(env,services,{now:()=>time});
  assert.equal(result.finance_steps,1,outcome);assert.equal(services.calls.finance.length,before+1);assert.equal(result.status,'ERROR');assert.equal(result.state.failure_count,1);assert.equal(result.state.last_error,'BUSINESS_SYNC_COLLECTION_UNAVAILABLE');
  assert.equal(result.state.summary.coverage.orders,5);assert.equal(result.state.summary.progress.pages_read,2);assert.equal(result.state.summary.net_estimate_cents,null);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_PROVIDER_FAILURE'));
 }
});

test('a persisted stale-only error from the same attempt resumes before its old thirty-minute retry deadline',async()=>{
 const env=environment();let time=clock;const services=source({running:true,time:()=>time});
 await run(env,services,{now:()=>time,maxSteps:1});time+=2268000;
 const partial=await run(env,services,{now:()=>time,maxSteps:1});assert.ok(partial.state.summary.pending.includes('FINANCIAL_SOURCE_STALE'));
 env.ADMIN_DB.db.prepare("UPDATE business_sync_state SET status='ERROR',failure_count=4,last_error='BUSINESS_SYNC_COLLECTION_UNAVAILABLE',next_run_at=? WHERE id=1").run(Math.floor(time/1000)+1800);
 const before=services.calls.finance.length;time+=1000;
 const resumed=await run(env,services,{now:()=>time,maxSteps:1});
 assert.equal(resumed.status,'RUNNING');assert.equal(services.calls.finance.length,before+1);assert.equal(resumed.state.failure_count,0);assert.equal(resumed.state.last_error,null);assert.equal(resumed.state.next_run_at,Math.floor(time/1000)+300);
 assert.ok(resumed.state.summary.pending.includes('FINANCIAL_SOURCE_STALE'));assert.equal(resumed.state.summary.net_estimate_cents,null);assert.equal(resumed.state.last_success_at,null);
});

test('a genuine source failure or an older retained summary cannot bypass the saved retry deadline',async()=>{
 for(const cause of ['SOURCE_UNAVAILABLE','OLDER_SUMMARY']){
  const env=environment();let time=clock;const services=source({running:true,time:()=>time});
  await run(env,services,{now:()=>time,maxSteps:1});time+=1000000;
  const partial=await run(env,services,{now:()=>time,maxSteps:1}),summary=structuredClone(partial.state.summary);
  if(cause==='SOURCE_UNAVAILABLE')summary.pending.push('SOURCE_UNAVAILABLE');
  const attempt=Math.floor(time/1000)+(cause==='OLDER_SUMMARY'?1:0);
  env.ADMIN_DB.db.prepare("UPDATE business_sync_state SET status='ERROR',failure_count=4,last_error='BUSINESS_SYNC_COLLECTION_UNAVAILABLE',next_run_at=?,last_attempt_at=?,summary=? WHERE id=1").run(attempt+1800,attempt,JSON.stringify(summary));
  const before=services.calls.finance.length;time+=2000;
  const skipped=await run(env,services,{now:()=>time,maxSteps:1});assert.equal(skipped.status,'NOT_DUE',cause);assert.equal(services.calls.finance.length,before);assert.equal(skipped.state.failure_count,4);
 }
});

test('stored collection summaries accept legacy five-order pages and explicit mixed page capacities without accepting invented coverage',async()=>{
 const env=environment();await run(env,source());const row=env.ADMIN_DB.db.prepare('SELECT summary FROM business_sync_state WHERE id=1').get(),original=JSON.parse(row.summary),pages=original.progress.pages_read;
 const persist=value=>env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET summary=? WHERE id=1').run(JSON.stringify(value));
 const legacy=structuredClone(original);delete legacy.progress.order_capacity;persist(legacy);
 assert.deepEqual((await readBusinessSyncState(env)).summary.progress,legacy.progress);
 for(const capacity of [pages*5,pages*5+15,pages*20]){
  const current=structuredClone(original);current.progress.order_capacity=capacity;persist(current);
  assert.equal((await readBusinessSyncState(env)).summary.progress.order_capacity,capacity);
 }
 for(const capacity of [null,-1,pages*5-1,pages*5+1,pages*20+15,12001]){
  const current=structuredClone(original);current.progress.order_capacity=capacity;persist(current);
  await assert.rejects(readBusinessSyncState(env),error=>error instanceof BusinessSyncError&&error.message==='BUSINESS_SYNC_STATE_INVALID');
 }
 const excess=structuredClone(legacy);excess.coverage.orders=excess.coverage.paid=excess.coverage.completed=excess.coverage.payment_covered=pages*5+1;persist(excess);
 await assert.rejects(readBusinessSyncState(env),error=>error instanceof BusinessSyncError&&error.message==='BUSINESS_SYNC_STATE_INVALID');
});

test('provider failures store safe errors and back off by five, ten, twenty and at most thirty minutes',async()=>{
 const env=environment();let time=clock,calls=0;
 const services={getFinanceBusinessPeriod:async()=>{calls++;throw Error('PRIVATE_ACCESS_TOKEN_PRIVATE_BUYER');}};
 for(const [index,delay] of [300,600,1200,1800,1800].entries()){
  const result=await run(env,services,{now:()=>time});assert.equal(result.status,'ERROR');assert.equal(result.state.failure_count,index+1);assert.equal(result.state.next_run_at,Math.floor(time/1000)+delay);assert.equal(result.state.last_error,'BUSINESS_SYNC_COLLECTION_UNAVAILABLE');assert.equal(result.state.last_success_at,null);assert.equal(result.state.lease_expires_at,null);assert.equal(result.state.summary,null);assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.ok(!JSON.stringify(privateRows(env)).includes('PRIVATE'));
  assert.equal((await run(env,services,{now:()=>time+1000})).status,'NOT_DUE');time+=delay*1000;
 }
 assert.equal(calls,5);assert.equal(rows(env,'business_sync_audit').length,5);
 const good=source({time:()=>time});const recovered=await run(env,good,{now:()=>time});assert.equal(recovered.status,'COMPLETE');assert.equal(recovered.state.failure_count,0);assert.equal(recovered.state.last_error,null);
});

test('partial Ads never become a zero total or a liquidated profit and are retried',async()=>{
 const env=environment(),services=source({missing:'2026-10-03'}),result=await run(env,services);
 assert.equal(result.status,'PARTIAL');assert.equal(result.state.summary.ads_status,'PARTIAL');assert.equal(result.state.summary.ads_covered_days,23);assert.equal(result.state.summary.ads_total_days,24);assert.ok(result.state.summary.pending.includes('ADS_UNAVAILABLE'));assert.ok(result.state.summary.pending.includes('EXTERNAL_EXPENSES_REQUIRED'));assert.equal(result.state.summary.net_estimate_cents,null);assert.equal(result.state.summary.net_profit_cents,null);assert.equal(result.state.last_success_at,null);assert.equal(result.state.failure_count,1);assert.equal(result.state.last_error,'BUSINESS_SYNC_ADS_INCOMPLETE');
});

test('strict source projection rejects provider extras without persisting their private fields',async()=>{
 const env=environment(),services=source(),provider=services.getFinanceBusinessPeriod;
 services.getFinanceBusinessPeriod=async(...args)=>({...await provider(...args),access_token:'PRIVATE_PROVIDER_TOKEN'});
 const result=await run(env,services);assert.equal(result.status,'ERROR');assert.equal(result.ads_reads,0);assert.equal(result.state.summary,null);assert.ok(!JSON.stringify(privateRows(env)).includes('PRIVATE'));assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('remaining request budget is checked before starting Ads and before every financial operation',async()=>{
 const env=environment();let time=clock;const services=source({time:()=>time}),provider=services.getFinanceBusinessPeriod;
 services.getFinanceBusinessPeriod=async(...args)=>{const value=await provider(...args);time+=115000;return value;};
 const result=await run(env,services,{now:()=>time});assert.equal(result.finance_steps,2);assert.equal(result.ads_reads,0);assert.equal(result.status,'PARTIAL');assert.equal(result.state.summary.ads_status,null);assert.equal(result.state.summary.net_estimate_cents,null);assert.equal(time,clock+230000);
 const runningEnv=environment();time=clock;const pending=source({running:true,time:()=>time}),step=pending.getFinanceBusinessPeriod;pending.getFinanceBusinessPeriod=async(...args)=>{const value=await step(...args);time+=115000;return value;};
 const stopped=await run(runningEnv,pending,{now:()=>time});assert.equal(stopped.finance_steps,2);assert.equal(stopped.status,'RUNNING');assert.equal(stopped.ads_reads,0);assert.equal(stopped.state.summary.net_estimate_cents,null);assert.equal(stopped.state.failure_count,0);
});

test('the BRT boundary chooses the previous UTC month and an expired lease can be recovered',async()=>{
 const env=environment(),time=Date.UTC(2026,10,1,1),services=source({time:()=>time});await readBusinessSyncState(env);
 env.ADMIN_DB.db.prepare("UPDATE business_sync_state SET lease_token='22222222-2222-4222-8222-222222222222',lease_expires_at=?,status='RUNNING'").run(time/1000-1);
 const result=await run(env,services,{now:()=>time});assert.equal(result.state.month,'2026-10');assert.equal(result.status,'COMPLETE');assert.equal(result.finance_steps,3);assert.equal(result.state.summary.end_date,'2026-10-31');assert.equal(result.state.lease_expires_at,null);
});

test('unattended catalogue discovery corrects an already priced adult binding to the child rule without opening the UI',async()=>{
 const env=environment(),services=source(),provider=services.getFinanceBusinessPeriod,catalogCalls=[];
 const binding={item_id:'201',model_id:'0',selling_unit:'SINGLE_GARMENT',size:'P',operator_confirmed:true};
 env.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET payload=? WHERE id=1').run(JSON.stringify([binding]));
 services.getFinanceBusinessPeriod=async(...args)=>{
  const value=await provider(...args);
  value.coverage={...value.coverage,orders:2,paid:2,completed:2,payment_covered:2};
  value.known_sales_base_raw=value.sales_base_raw='100';value.known_expected_repass_raw=value.expected_repass_raw='80';
  value.invoice_tax={...value.invoice_tax,covered_orders:2,known_base_raw:'100',known_tax_raw:'2'};
  value.items=[{item_id:'201',model_id:'0',quantity:2}];
  value.product_breakdown.products=[{item_id:'201',quantity:2,orders:2,exclusive_orders:2,mixed_orders:0,exclusive_payment_covered:2,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,known_exclusive_sales_base_raw:'100',exclusive_sales_base_raw:'100',known_exclusive_expected_repass_raw:'80',exclusive_expected_repass_raw:'80',known_exclusive_ads_adjustment_raw:'0',exclusive_ads_adjustment_raw:'0',known_exclusive_invoice_tax_raw:'2',exclusive_invoice_tax_raw:'2',items:[{model_id:'0',exclusive_quantity:2,mixed_quantity:0}]}];
  assert.ok(projectBusinessPeriodFrame(value));return value;
 };
 services.getFinanceVariantCatalog=async(_,selection)=>{
  catalogCalls.push(selection);
  assert.deepEqual(selection,{item_ids:['201'],selling_unit:'AUTO',include_cost_catalog:true});
  const before=await businessMonth(env,{operation:'read',month:'2026-10'},services,{now});
  assert.equal(before.production_cost_cents,6360);assert.deepEqual(before.unmapped_variants,[]);
  return {schema:'variant_catalog_v1',checked_at:stamp,products:[{item_id:'201',catalog_fingerprint:'b'.repeat(64),bindings:[],unresolved_count:1,cost_catalog:{schema:'product_cost_catalog_v1',product_name:'Camiseta Infantil Estrela',variants:[{model_id:'0',attributes:[{name:'Tamanho',value:'4'}]}]}}]};
 };
 await businessMonth(env,{operation:'expenses',month:'2026-10',revision:0,external_expenses_cents:0,recharge_treatment:'UNCONFIRMED'},services,{now});
 const savedBindings=rows(env,'variant_bindings_state'),savedCosts=rows(env,'production_costs_state');
 const result=await run(env,services);
 assert.equal(catalogCalls.length,0,'financial pagination discovers products without running a second catalogue pipeline');
 const scheduled=await scheduledWork(env,services,now),month=await businessMonth(env,{operation:'read',month:'2026-10'},services,{now});
 assert.equal(scheduled.classification,'PROGRESSED');
 assert.equal(result.status,'COMPLETE');assert.equal(catalogCalls.length,1);assert.equal(result.finance_steps,2);assert.equal(result.ads_reads,1);
 assert.equal(month.production_cost_cents,5000);assert.equal(month.result.net_estimate_cents,2395);assert.deepEqual(month.unmapped_variants,[]);
 assert.equal(month.product_summary.products[0].variants[0].unit_cost_cents,1250);assert.equal(month.product_summary.products[0].quantity,4);
 assert.deepEqual(rows(env,'variant_bindings_state'),savedBindings);assert.deepEqual(rows(env,'production_costs_state'),savedCosts);assert.equal(rows(env,'hermes_jobs').length,0);
});
