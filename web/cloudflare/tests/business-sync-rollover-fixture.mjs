import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {SCHEMA} from '../src/admin.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {businessMonth} from '../src/business-month.mjs';
import {readCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';

const month='2026-10',beforeMidnight=Date.UTC(2026,9,31,2,59,52),afterMidnight=Date.UTC(2026,9,31,3,0,1);
function frame(selection,index,at,status){
 const value={schema:'finance_business_period_v1',run_id:'11111111-1111-4111-8111-'+String(index).padStart(12,'0'),revision:1,status,start_date:selection.start_date,end_date:selection.end_date,cutoff_at:at-1,checked_at:at,source_checked_at:{oldest_at:at-1,latest_at:at},currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:0,paid:0,completed:0,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:0,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'0',sales_base_raw:'0',known_expected_repass_raw:'0',expected_repass_raw:'0',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:0,unavailable_orders:0,known_base_raw:'0',known_tax_raw:'0'},items:[],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED',product_breakdown:{schema:'business_product_breakdown_v1',mixed_orders:0,mixed_payment_covered:0,mixed_payment_missing:0,known_mixed_sales_base_raw:'0',known_mixed_expected_repass_raw:'0',known_mixed_ads_adjustment_raw:'0',known_mixed_invoice_tax_raw:'0',products:[]}};
 assert.ok(projectBusinessPeriodFrame(value));return value;
}
function ads(selection,at){
 const children=[];
 for(let first=1;first<=Number(selection.end_date.slice(8));first+=15){
  const last=Math.min(first+14,Number(selection.end_date.slice(8))),range={start_date:selection.start_date.slice(0,8)+String(first).padStart(2,'0'),end_date:selection.end_date.slice(0,8)+String(last).padStart(2,'0')};
  children.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:range,balance:0,daily:Array.from({length:last-first+1},(_,i)=>({date:selection.start_date.slice(0,8)+String(first+i).padStart(2,'0'),expense:0,broad_gmv:0,broad_order:0,broad_roas:0,direct_gmv:0,direct_order:0,direct_roas:0}))},range,at));
 }
 return buildAdsCalendar(children,selection,at);
}
async function fixture(t,api){
 const db=new D1(),env={ADMIN_DB:db},clock={time:Date.UTC(2026,9,30,15),transition:null,reads:0},now=()=>{if(clock.transition!==null&&++clock.reads>=clock.transition){clock.time=afterMidnight;clock.transition=null;}return clock.time;};
 t.after(()=>db.db.close());
 db.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)');
 db.db.prepare('INSERT INTO variant_bindings_state VALUES(1,1,?,?)').run('[]',new Date(clock.time).toISOString());db.db.prepare('INSERT INTO production_costs_state VALUES(1,1,?,?)').run(JSON.stringify(COST_DEFAULTS),new Date(clock.time).toISOString());
 await db.batch(SCHEMA.map(sql=>db.prepare(sql)));
 const calls={finance:[],ads:[]},frames=new Map(),control={status:'COMPLETE',financeHook:null,adsHook:null};let sequence=0;
 const services={getFinanceBusinessPeriod:async(_,selection)=>{
  calls.finance.push({...selection});let value;
  if(selection.operation==='start'){value=frame(selection,++sequence,Math.floor(now()/1000),control.status);frames.set(value.run_id,value);}else value=structuredClone(frames.get(selection.run_id));
  if(control.financeHook)return control.financeHook(value,selection);return value;
 },getAdsCalendar:async(_,selection)=>{calls.ads.push({...selection});const value=ads(selection,Math.floor(now()/1000));return control.adsHook?control.adsHook(value,selection):value;}};
 let seeded=await businessMonth(env,{operation:'start',month},services,{now});while(seeded.status==='RUNNING')seeded=await businessMonth(env,{operation:'step',month},services,{now});await businessMonth(env,{operation:'ads',month},services,{now});
 assert.ok(await readCompletedBusinessMonth(env,month,{now}));await api.readBusinessSyncState(env);
 calls.finance=[];calls.ads=[];clock.time=beforeMidnight;
 return {db,env,clock,now,calls,control,services,run:options=>api.runBusinessSync(env,services,{now,...options})};
}
const publication=f=>f.db.db.prepare('SELECT * FROM business_month_publications WHERE month=?').get(month);
const adsRows=f=>f.db.db.prepare('SELECT * FROM business_month_ads ORDER BY month').all();
const runAudit=f=>f.db.db.prepare("SELECT * FROM business_sync_audit WHERE kind='RUN' ORDER BY finished_at").all();
function yielded(value,f){assert.equal(value.status,'RUNNING');assert.equal(value.finance_steps,1);assert.equal(value.ads_reads,0);assert.equal(value.state.failure_count,0);assert.equal(value.state.last_error,null);assert.equal(value.state.last_success_at,null);assert.equal(value.state.lease_expires_at,null);assert.equal(value.state.next_run_at,Math.floor(f.now()/1000));assert.equal(runAudit(f).at(-1).error_code,null);assert.equal(value.state.summary.end_date,'2026-10-30');assert.ok(!value.state.summary.pending.includes('SOURCE_UNAVAILABLE'));}

export async function runRolloverScenario(t,api,scenario){
 const f=await fixture(t,api),published=publication(f),savedAds=adsRows(f);
 if(scenario==='running-response'){
  f.control.status='RUNNING';f.control.financeHook=value=>{f.clock.time=afterMidnight;return value;};
  const result=await f.run();yielded(result,f);assert.equal(result.state.summary.progress.pages_read,1);assert.deepEqual(publication(f),published);assert.deepEqual(adsRows(f),savedAds);
  f.control.status='COMPLETE';f.control.financeHook=null;const resumed=await f.run();assert.equal(resumed.status,'COMPLETE');assert.equal(resumed.finance_steps,3);assert.equal(resumed.ads_reads,1);assert.equal(resumed.state.summary.end_date,'2026-10-31');assert.equal(f.calls.finance[1].operation,'start');assert.equal(f.calls.finance[1].start_date,'2026-10-01');assert.equal(f.calls.ads[0].end_date,'2026-10-31');assert.equal(resumed.state.failure_count,0);assert.equal(resumed.state.last_error,null);
 }else if(scenario==='complete-before-ads'){
  f.control.financeHook=value=>{if(f.calls.finance.length===2)f.clock.time=afterMidnight;return value;};
  const result=await f.run();assert.equal(result.status,'RUNNING');assert.equal(result.finance_steps,2);assert.equal(result.ads_reads,0);assert.equal(result.state.last_error,null);assert.equal(result.state.failure_count,0);assert.equal(result.state.next_run_at,Math.floor(f.now()/1000));assert.equal(result.state.summary.status,'COMPLETE');assert.equal(result.state.summary.end_date,'2026-10-30');assert.deepEqual(adsRows(f),savedAds);
 }else if(scenario==='scope-read-race'){
  f.control.status='RUNNING';f.control.financeHook=value=>{f.clock.reads=0;f.clock.transition=2;return value;};
  const result=await f.run();yielded(result,f);assert.equal(f.calls.finance.length,1);assert.deepEqual(publication(f),published);assert.deepEqual(adsRows(f),savedAds);
 }else if(scenario==='provider-read-race'||scenario==='real-finance-error-before-ads-yield'){
  const prepare=f.db.prepare.bind(f.db);let armed=false,reads=0;
  f.db.prepare=sql=>{const statement=prepare(sql);if(sql==='SELECT * FROM business_sync_state WHERE id=1'){const first=statement.first.bind(statement);statement.first=async()=>{const row=await first();if(armed&&++reads===1)f.clock.time=afterMidnight;return row;};}return statement;};
  f.control.status='RUNNING';f.control.financeHook=value=>{armed=true;if(scenario==='real-finance-error-before-ads-yield')value.diagnostic='BUSINESS_PERIOD_RATE_LIMIT';return value;};
  const result=await f.run();
  if(scenario==='provider-read-race')yielded(result,f);
  else{assert.equal(result.status,'ERROR');assert.equal(result.finance_steps,1);assert.equal(result.ads_reads,0);assert.equal(result.state.failure_count,1);assert.equal(result.state.last_error,'BUSINESS_SYNC_SOURCE_RATE_LIMIT');assert.equal(result.state.next_run_at,Math.floor(f.now()/1000)+300);assert.ok(result.state.summary.pending.includes('SOURCE_UNAVAILABLE'));assert.equal(runAudit(f).at(-1).error_code,'BUSINESS_SYNC_SOURCE_RATE_LIMIT');}
  assert.equal(f.calls.finance.length,1);assert.deepEqual(publication(f),published);
 }else if(scenario==='real-source-error'){
  f.control.financeHook=()=>{f.clock.time=afterMidnight;throw Error('REAL_PRIVATE_SOURCE_FAILURE');};
  const result=await f.run();assert.equal(result.status,'ERROR');assert.equal(result.finance_steps,1);assert.equal(result.ads_reads,0);assert.equal(result.state.failure_count,1);assert.equal(result.state.last_error,'BUSINESS_SYNC_COLLECTION_UNAVAILABLE');assert.equal(result.state.next_run_at,Math.floor(f.now()/1000)+300);assert.equal(runAudit(f).at(-1).error_code,'BUSINESS_SYNC_COLLECTION_UNAVAILABLE');assert.deepEqual(publication(f),published);assert.deepEqual(adsRows(f),savedAds);
 }else if(scenario==='real-ads-error'){
  f.control.adsHook=()=>{f.clock.time=afterMidnight;throw Error('REAL_PRIVATE_ADS_FAILURE');};
  const result=await f.run();assert.equal(result.status,'PARTIAL');assert.equal(result.ads_reads,1);assert.equal(result.state.failure_count,1);assert.equal(result.state.last_error,'BUSINESS_SYNC_ADS_INCOMPLETE');assert.equal(result.state.next_run_at,Math.floor(f.now()/1000)+300);
 }else if(scenario==='month-boundary'){
  f.clock.time=Date.UTC(2026,10,1,2,59,52);f.control.status='RUNNING';f.control.financeHook=value=>{f.clock.time=Date.UTC(2026,10,1,3,0,1);return value;};
  const result=await f.run();assert.equal(result.status,'RUNNING');assert.equal(result.state.month,'2026-10');assert.equal(result.finance_steps,1);assert.equal(result.ads_reads,0);assert.equal(result.state.next_run_at,Math.floor(f.now()/1000));assert.equal(result.state.failure_count,0);assert.deepEqual(publication(f),published);
 }else if(scenario==='policy-pause'||scenario==='policy-resume'){
  f.control.status='RUNNING';let policy;
  f.control.financeHook=async value=>{f.clock.time=afterMidnight;const state=await api.readBusinessSyncState(f.env);policy=await api.saveBusinessSyncPolicy(f.env,{revision:state.revision,enabled:false},'rollover-owner',{now:f.now});if(scenario==='policy-resume')policy=await api.saveBusinessSyncPolicy(f.env,{revision:policy.revision,enabled:true},'rollover-owner',{now:f.now});return value;};
  const result=await f.run();assert.equal(result.status,scenario==='policy-pause'?'PAUSED':'RUNNING');assert.equal(result.state.revision,policy.revision);assert.equal(result.state.next_run_at,policy.next_run_at);assert.equal(result.state.lease_expires_at,null);assert.equal(result.state.failure_count,0);assert.equal(result.state.last_error,null);assert.equal(result.ads_reads,0);assert.deepEqual(publication(f),published);
 }else assert.fail('unknown rollover scenario');
 assert.equal(f.calls.ads.length,scenario==='running-response'?1:scenario==='real-ads-error'?1:0);
 assert.doesNotMatch(JSON.stringify(runAudit(f)),/REAL_PRIVATE|access_token|order_sn/);
}
export const rolloverScenarios=['running-response','complete-before-ads','scope-read-race','provider-read-race','real-source-error','real-ads-error','real-finance-error-before-ads-yield','month-boundary','policy-pause','policy-resume'];
