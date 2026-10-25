import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {SCHEMA} from '../src/admin.mjs';
import {D1} from './sqlite-d1.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {readBackgroundCollectionDiagnostics,projectBackgroundCollectionDiagnostics,BackgroundCollectionDiagnosticsError} from '../src/background-collection-diagnostics.mjs';

const clock=Date.UTC(2026,9,25,12),stamp=clock/1000,month='2026-10',now=()=>clock;
const tokens={sync:'11111111-1111-4111-8111-111111111111',lane:'22222222-2222-4222-8222-222222222222'};
class ObservedD1 extends D1{
 batches=0;outside=0;depth=0;sql=[];
 prepare(sql){this.sql.push(sql);const statement=super.prepare(sql);for(const method of ['run','first','all']){const original=statement[method];statement[method]=async(...args)=>{if(!this.depth)this.outside++;return original.apply(statement,args);};}return statement;}
 async batch(statements){this.batches++;this.depth++;try{return await super.batch(statements);}finally{this.depth--;}}
 reset(){this.batches=0;this.outside=0;this.sql=[];}
}
function source(index,start_date,end_date,cutoff_at,checked_at){
 const frame={schema:'finance_business_period_v1',run_id:'33333333-3333-4333-8333-'+String(index).padStart(12,'0'),revision:index,status:'COMPLETE',start_date,end_date,cutoff_at,checked_at,source_checked_at:{oldest_at:cutoff_at,latest_at:checked_at},currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,page_capacity:20,duplicate_orders:0,coverage:{orders:0,paid:0,completed:0,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:0,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'0',sales_base_raw:'0',known_expected_repass_raw:'0',expected_repass_raw:'0',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:0,unavailable_orders:0,known_base_raw:'0',known_tax_raw:'0'},items:[],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
 assert.ok(projectBusinessPeriodFrame(frame),'cohort evidence must satisfy the actual Finance source contract');return frame;
}
function summary(){return {schema:'business_sync_summary_v1',month,start_date:month+'-01',end_date:month+'-25',status:'COMPLETE',checked_at:stamp-1800,source_checked_at:{finance_oldest_at:stamp-4000,finance_latest_at:stamp-2400,ads_at:stamp-1800},progress:{windows_total:2,windows_complete:2,pages_read:2,order_capacity:40},coverage:{orders:0,paid:0,completed:0,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:0,payment_missing:0,returns:0,returns_unknown:0},pending:['FINANCIAL_SOURCE_STALE'],bindings_revision:1,costs_revision:1,expenses_revision:1,tax_policy_revision:1,ads_status:'AVAILABLE',ads_covered_days:25,ads_total_days:25,net_estimate_cents:null,net_profit_cents:null,basis:'PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE'};}
async function fixture(t,{inline=false}={}){
 const ADMIN_DB=new ObservedD1(),env={ADMIN_DB};t.after(()=>ADMIN_DB.db.close());await ADMIN_DB.batch(SCHEMA.map(sql=>ADMIN_DB.prepare(sql)));
 const frames=[source(1,month+'-01',month+'-15',stamp-4000,stamp-3000),source(2,month+'-16',month+'-25',stamp-3200,stamp-2400)],payload={start_date:month+'-01',end_date:month+'-25',slots:frames.map(frame=>({start_date:frame.start_date,end_date:frame.end_date,frame:inline?frame:{schema:'business_month_frame_ref_v1',run_id:frame.run_id,revision:frame.revision}}))};
 ADMIN_DB.db.prepare('INSERT INTO business_month_runs VALUES(?,?,?,?,?)').run(month,12,JSON.stringify(payload),stamp-600,stamp-300);
 if(!inline)for(const [index,frame]of frames.entries())ADMIN_DB.db.prepare('INSERT INTO business_month_frames VALUES(?,?,?,?,?)').run(month,index,frame.run_id,frame.revision,JSON.stringify(frame));
 ADMIN_DB.db.prepare("UPDATE business_sync_state SET revision=7,enabled=1,status='ERROR',month=?,lease_token=?,lease_expires_at=?,next_run_at=?,failure_count=3,last_attempt_at=?,last_success_at=?,last_error='BUSINESS_SYNC_SOURCE_TIMEOUT',summary=? WHERE id=1").run(month,tokens.sync,stamp-1,stamp+900,stamp-1600,stamp-2000,JSON.stringify(summary()));
 ADMIN_DB.db.prepare("UPDATE background_collection_lane_state SET revision=8,next_lane='AUXILIARY',auxiliary_index=1,analysis_attempt_day=?,lease_token=?,lease_until=? WHERE id=1").run('2026-10-24',tokens.lane,stamp+150);
 const audit=ADMIN_DB.db.prepare('INSERT INTO business_sync_audit(id,kind,month,status,started_at,finished_at,finance_steps,ads_reads,error_code,policy_revision,actor,summary) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
 for(let index=0;index<12;index++)audit.run('PRIVATE_AUDIT_'+index,'RUN',month,index===11?'ERROR':'COMPLETE',stamp-2000+index*10,stamp-1999+index*10,2,index%2,index===11?'BUSINESS_SYNC_SOURCE_TIMEOUT':null,4,'PRIVATE_ACTOR_'+index,index===11?'{PRIVATE_MALFORMED_SUMMARY':JSON.stringify({progress:{pages_read:index+1},coverage:{orders:index*5},access_token:'PRIVATE_PROVIDER_TOKEN'}));
 audit.run('PRIVATE_POLICY','POLICY',month,'PAUSED',stamp-10,stamp-9,0,0,null,5,'PRIVATE_ACTOR_POLICY',null);audit.run('PRIVATE_OTHER_MONTH','RUN','2026-09','COMPLETE',stamp-5,stamp-4,1,0,null,5,'PRIVATE_OTHER_ACTOR',null);
 ADMIN_DB.reset();return {env,db:ADMIN_DB,frames,read:options=>readBackgroundCollectionDiagnostics(env,{month},{now,...options})};
}
const tables=['business_sync_state','business_sync_audit','background_collection_lane_state','business_month_runs','business_month_frames'];
const stored=db=>Object.fromEntries(tables.map(table=>[table,db.db.prepare('SELECT * FROM '+table).all()]));
const fail=code=>error=>error instanceof BackgroundCollectionDiagnosticsError&&error.message===code;

test('a post-deploy diagnostic preserves the older source cohort and distinguishes planned one-minute work from an unobserved trigger',async t=>{
 const f=await fixture(t),before=stored(f.db),originalFetch=globalThis.fetch;let network=0;globalThis.fetch=()=>{network++;throw Error('PRIVATE_NETWORK_MUST_NOT_RUN');};
 let value;try{value=await f.read();}finally{globalThis.fetch=originalFetch;}
 assert.equal(value.schema,'background_collection_diagnostic_v1');assert.equal(value.month,month);assert.equal(value.checked_at,stamp);assert.deepEqual(value.planned,{cron:'* * * * *',running_interval_seconds:60,complete_interval_seconds:300,financial_freshness_seconds:900});assert.equal(value.trigger_observation,'NOT_RECORDED');
 assert.deepEqual(value.cohort,{revision:12,start_date:month+'-01',end_date:month+'-25',app_created_at:stamp-600,app_updated_at:stamp-300,source_oldest_at:stamp-4000,source_latest_at:stamp-2400});assert.ok(value.cohort.source_latest_at<value.cohort.app_created_at,'a reused source observation can predate a newly created App cohort');
 assert.equal(value.sync.summary.checked_at,stamp-1800);assert.equal(value.sync.summary.source_checked_at.finance_oldest_at,stamp-4000);assert.equal(value.sync.last_attempt_at,stamp-1600);assert.equal(value.sync.next_run_at,stamp+900,'the reader must not rewrite an already persisted retry deadline to the planned cadence');assert.equal(value.sync.last_error,'BUSINESS_SYNC_SOURCE_TIMEOUT');
 assert.equal(f.db.batches,1);assert.equal(f.db.outside,0);assert.equal(f.db.sql.length,5);assert.ok(f.db.sql.every(sql=>/^\s*SELECT\b/i.test(sql)),'diagnosis performs no DDL, insert, update or collector advancement');assert.equal(network,0);assert.deepEqual(stored(f.db),before);assert.ok(projectBackgroundCollectionDiagnostics(value));assert.ok(Buffer.byteLength(JSON.stringify(value))<=14*1024);
});

test('recent financial runs are the latest eight scoped RUN records and exclude private IDs, actors, tokens, raw summaries and policy activity',async t=>{
 const f=await fixture(t),value=await f.read();assert.equal(value.recent_finance_runs.length,8);assert.deepEqual(value.recent_finance_runs.map(row=>row.started_at),Array.from({length:8},(_,index)=>stamp-2000+(11-index)*10));
 const latest=value.recent_finance_runs[0];assert.deepEqual(latest,{status:'ERROR',started_at:stamp-1890,finished_at:stamp-1889,finance_steps:2,ads_reads:1,error_code:'BUSINESS_SYNC_SOURCE_TIMEOUT',pages_read:null,orders_seen:null});assert.equal(value.recent_finance_runs[1].pages_read,11);assert.equal(value.recent_finance_runs[1].orders_seen,50);
 for(const row of value.recent_finance_runs)assert.deepEqual(Object.keys(row),['status','started_at','finished_at','finance_steps','ads_reads','error_code','pages_read','orders_seen']);
 const raw=JSON.stringify(value);for(const forbidden of ['PRIVATE_',tokens.sync,tokens.lane,...f.frames.map(row=>row.run_id),'run_id','lease_token','lease_owner','actor','access_token','policy_revision'])assert.equal(raw.includes(forbidden),false,forbidden);
});

test('lease booleans follow the supplied clock without exposing their private identity or changing stored locks',async t=>{
 const f=await fixture(t),before=stored(f.db),active=await f.read();assert.equal(active.sync.lease_active,false);assert.equal(active.sync.lease_expires_at,stamp-1);assert.equal(active.lane.lease_active,true);assert.equal(active.lane.lease_expires_at,stamp+150);assert.equal(active.lane.next_group,'AUXILIARY');assert.equal(active.lane.next_auxiliary,'CATALOG');assert.equal(active.lane.analysis_attempt_day,'2026-10-24');
 const expired=await f.read({now:()=>clock+151000});assert.equal(expired.lane.lease_active,false);assert.equal(expired.lane.lease_expires_at,stamp+150);assert.equal(expired.sync.lease_active,false);assert.deepEqual(stored(f.db),before);
});

test('legacy inline Finance frames retain their original source timestamps and stale normalized references do not import another revision',async t=>{
 const inline=await fixture(t,{inline:true}),value=await inline.read();assert.equal(value.cohort.source_oldest_at,stamp-4000);assert.equal(value.cohort.source_latest_at,stamp-2400);assert.equal(inline.db.batches,1);
 const mismatch=await fixture(t);mismatch.db.db.prepare('UPDATE business_month_frames SET revision=revision+1 WHERE month=?').run(month);const checked=await mismatch.read();assert.equal(checked.cohort.app_created_at,stamp-600);assert.equal(checked.cohort.source_oldest_at,null);assert.equal(checked.cohort.source_latest_at,null);
});

test('global sync scope stays separate from the selected historical cohort and its compact summary does not duplicate a month field',async t=>{
 const f=await fixture(t),old=summary();old.month='2026-09';old.start_date='2026-09-01';old.end_date='2026-09-30';f.db.db.prepare('UPDATE business_sync_state SET month=?,summary=? WHERE id=1').run('2026-09',JSON.stringify(old));const value=await f.read();assert.equal(value.month,'2026-10');assert.equal(value.sync.month,'2026-09');assert.equal(Object.hasOwn(value.sync.summary,'month'),false);assert.equal(value.cohort.start_date,'2026-10-01');
});

test('missing state rows remain explicit nulls without reinitializing policies, leases or a selected cohort',async t=>{
 const f=await fixture(t);for(const table of tables)f.db.db.exec('DELETE FROM '+table);f.db.reset();const value=await f.read();assert.equal(value.sync,null);assert.equal(value.lane,null);assert.equal(value.cohort,null);assert.deepEqual(value.recent_finance_runs,[]);assert.equal(value.trigger_observation,'NOT_RECORDED');assert.equal(f.db.batches,1);for(const table of tables)assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,0);assert.ok(projectBackgroundCollectionDiagnostics(value));
});

test('invalid selectors, getters and clocks fail before the database and malformed stored data yields only a finite error',async t=>{
 const f=await fixture(t);for(const input of [{},{month:'2026-13'},{month,shop_id:1},null]){await assert.rejects(readBackgroundCollectionDiagnostics(f.env,input,{now}),fail('BACKGROUND_DIAGNOSTICS_REQUEST_INVALID'));assert.equal(f.db.batches,0);assert.equal(f.db.sql.length,0);}
 let getters=0;const input={};Object.defineProperty(input,'month',{enumerable:true,get(){getters++;return month;}});await assert.rejects(readBackgroundCollectionDiagnostics(f.env,input,{now}),fail('BACKGROUND_DIAGNOSTICS_REQUEST_INVALID'));assert.equal(getters,0);assert.equal(f.db.sql.length,0);
 for(const now of [()=>0,()=>-1,()=>NaN,()=>Infinity,()=>1.1,()=>{throw Error('PRIVATE_CLOCK');}]){await assert.rejects(readBackgroundCollectionDiagnostics(f.env,{month},{now}),fail('BACKGROUND_DIAGNOSTICS_CLOCK_INVALID'));assert.equal(f.db.batches,0);assert.equal(f.db.sql.length,0);}
 f.db.db.prepare("UPDATE business_sync_state SET last_error='PRIVATE_PROVIDER_ERROR' WHERE id=1").run();await assert.rejects(f.read(),error=>{assert.ok(error instanceof BackgroundCollectionDiagnosticsError);assert.equal(error.message,'BACKGROUND_DIAGNOSTICS_STORAGE_INVALID');assert.ok(!JSON.stringify(error).includes('PRIVATE'));return true;});
});

test('the bounded projector is standalone, detached and refuses unknown fields or getters in every exposed block',async t=>{
 const f=await fixture(t),value=await f.read(),original=structuredClone(value),copy=projectBackgroundCollectionDiagnostics(value);copy.sync.summary.pending.push('ADS_UNAVAILABLE');copy.cohort.source_oldest_at=1;copy.recent_finance_runs.pop();assert.deepEqual(value,original);
 assert.equal(projectBackgroundCollectionDiagnostics({...value,actor:'PRIVATE'}),null);assert.equal(projectBackgroundCollectionDiagnostics({...value,trigger_observation:'CONFIGURED_IN_CLOUDFLARE'}),null);assert.equal(projectBackgroundCollectionDiagnostics({...value,recent_finance_runs:[...value.recent_finance_runs,value.recent_finance_runs[0]]}),null);
 for(const [select,key]of [[row=>row,'planned'],[row=>row.sync,'lease_active'],[row=>row.sync.summary.progress,'pages_read'],[row=>row.lane,'lease_expires_at'],[row=>row.cohort,'source_oldest_at'],[row=>row.recent_finance_runs[0],'error_code']]){let getters=0;const poisoned=structuredClone(value);Object.defineProperty(select(poisoned),key,{enumerable:true,get(){getters++;return 'PRIVATE';}});assert.equal(projectBackgroundCollectionDiagnostics(poisoned),null,key);assert.equal(getters,0,key);}
 const context=vm.createContext({TextEncoder,raw:JSON.stringify(value)});vm.runInContext(projectBackgroundCollectionDiagnostics.toString()+'\nglobalThis.actual=projectBackgroundCollectionDiagnostics(JSON.parse(raw));',context);assert.deepEqual(JSON.parse(JSON.stringify(context.actual)),value);assert.ok(Buffer.byteLength(JSON.stringify(value))<=14*1024);
});
