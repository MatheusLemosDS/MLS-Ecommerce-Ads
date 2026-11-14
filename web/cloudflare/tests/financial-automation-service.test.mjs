import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {createFinancialEvent,financialDigest} from '../src/financial-event-ledger.mjs';
import {FINANCIAL_ACCOUNTING_COVERAGE_FAMILIES} from '../src/financial-accounting-projection.mjs';
import {handleFinancialAutomation,financialAutomationScope,readFinancialAutomationWorkspace} from '../src/financial-automation-service.mjs';
import {financialAccountingPeriod} from '../src/financial-accounting-schedule.mjs';
import {ingestFinancialAutomationSources} from '../src/financial-automation-bridge.mjs';
import {readFinancialAutomationState,writeFinancialAutomationState} from '../src/financial-automation-store.mjs';
import {runFinancialAutomationJobs} from '../src/financial-automation-jobs.mjs';
import {readFinancialEvents} from '../src/financial-event-store.mjs';
import {readFinancialAutomationSavedAds} from '../src/financial-automation-ads-sources.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {FINANCE_PROFILE} from '../../finance/src/connection-store.mjs';

const origin='https://synthetic.invalid',current={role:'owner',csrf:'synthetic-csrf'},fixed=Date.parse('2026-11-13T18:00:00Z'),now=()=>fixed;
function fixture(){let permitted=true;const env={ADMIN_DB:new D1()},scope=financialAutomationScope(env,current),options={current,now,actor:'synthetic-owner',assertAuthorized:async()=>{assert.equal(permitted,true,'authorization remains current');return true;},services:{}};return {env,scope,options,revoke(){permitted=false;},close(){env.ADMIN_DB.db.close();}};}
async function request(f,suffix='',body=null,patch={}){return handleFinancialAutomation(new Request(origin+'/api/admin/finance/automation'+suffix,{method:body===null?'GET':'POST',...(body===null?{}:{headers:{'content-type':'application/json',origin, 'x-csrf-token':current.csrf},body:JSON.stringify(body)}),...patch}),f.env,f.options);}
const approve=(patch={})=>({month:'2026-10',expected_revision:0,request_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',effective_from:'2026-10-01',financial_week:'CIVIL_FRIDAY_THURSDAY',auto_close:false,reason:'Synthetic policy reviewed',confirmed:true,...patch});
async function observedEvent(scope,id,cents,extra={}){return createFinancialEvent({scope,event_type:'SALE_RECOGNIZED',event_at:'2026-10-10T12:00:00.000Z',competence_at:'2026-10-10T12:00:00.000Z',settlement_at:null,source_updated_at:'2026-10-10T12:00:00.000Z',observed_at:new Date(fixed).toISOString(),source:{provider:'SHOPEE',family:'SYNTHETIC_ORDER',native_id:id,identity:'NATIVE_ID',identity_key:null},evidence:[{kind:'TEST_EVIDENCE',reference:id,sha256:'a'.repeat(64)}],causal_event_id:null,quality:'CONFIRMED',postings:[{account:'RECEIVABLE',account_ref:'receivable',amount_cents:cents},{account:'REVENUE',account_ref:'sales',amount_cents:-cents}],...extra});}
function installSources(f,events){
 f.options.services.readFinancialAutomationTaxPolicy=async()=>({regime:'SYNTHETIC_DECLARATION',mode:'FIXED_MONTHLY',monthly_cents:0,recognition:'MONTH_END',source_ref:'synthetic-tax-zero',revision:1});
 f.options.services.readFinancialAutomationSources=async({scope,period})=>{
  const refs={RECEIVABLES:['receivable'],WALLET:['wallet-available','wallet-held'],PAYOUTS:['transit'],BANK:['bank'],ADS:['ads-prepaid'],INVENTORY:['stock']};
  const coverage=FINANCIAL_ACCOUNTING_COVERAGE_FAMILIES.map(family=>({family,scope,state:'COMPLETE',start_at:period.start_at,end_at:period.end_at,timezone_confirmed:true,comparison:'MATCHED',account_refs:refs[family]??[],pending:[]}));
  const balances=[];for(const [account,account_ref,opening,closing] of [['RECEIVABLE','receivable',0,10000],['WALLET_AVAILABLE','wallet-available',0,0],['WALLET_HELD','wallet-held',0,0],['TRANSFER_IN_TRANSIT','transit',0,0],['BANK','bank',0,0],['ADS_PREPAID','ads-prepaid',0,0],['INVENTORY','stock',5000,events.length>1?0:5000]])for(const [as_of,amount_cents] of [[period.start_at,opening],[period.end_at,closing]])balances.push({scope,account,account_ref,as_of,amount_cents,confirmed:true,evidence_ref:'synthetic-balance'});
  return {events,coverage,balances,obligations:[],reserve:{scope,amount_cents:0,confirmed:true,evidence_ref:'synthetic-reserve'},capabilities:[],pending:[],cutoff_at:new Date(fixed).toISOString(),checkpoint:{page:1},has_more:false};
 };
}

test('cold authorized workspace is read-only, scoped and never displays a final zero',async()=>{
 const f=fixture();try{const response=await request(f,'?month=2026-10');assert.equal(response.status,200);const value=await response.json();assert.equal(value.schema,'financial_automation_workspace_v1');assert.deepEqual(value.scope,f.scope);assert.equal(value.projection.result.amount_cents,null);assert.equal(value.projection_source.kind,'CURRENT_JOURNAL');assert.ok(value.pending.includes('WALLET_COVERAGE_INCOMPLETE'));assert.equal(value.configuration.revision,0);assert.equal(value.configuration.policy,null);assert.equal(value.configuration.proposed_policy.approval.state,'DRAFT');assert.equal(value.configuration.proposed_policy.recognition,'COMPLETED_ORDER');assert.equal(value.configuration.proposed_policy.tax.mode,'UNCONFIGURED');assert.equal((await f.env.ADMIN_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'financial_%'").all()).results.length,0);}finally{f.close();}
});
test('policy approval is CSRF protected, server-authored, versioned and retry-idempotent',async()=>{
 const f=fixture();try{
  assert.equal((await request(f,'/policy',approve(),{headers:{'content-type':'application/json',origin}})).status,403);
  assert.equal((await request(f,'/policy',{...approve(),scope:{organization_id:'forged'}})).status,400);
  const first=await request(f,'/policy',approve({reserve_cents:0}));assert.equal(first.status,200);const saved=await first.json();assert.equal(saved.revision,1);assert.equal(saved.policy.approval.actor_ref,'legacy-owner');assert.equal(saved.policy.approval.at,new Date(fixed).toISOString());assert.equal(saved.policy.tax.monthly_cents,null);assert.equal(saved.reserve.amount_cents,0);
  const replay=await request(f,'/policy',approve({reserve_cents:0}));assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);
  const conflict=await request(f,'/policy',approve({request_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}));assert.equal(conflict.status,409);
  const versions=await readFinancialAutomationState(f.env,{scope:f.scope,kind:'CONFIG',history:true},f.options);assert.equal(versions.history.length,1);
 }finally{f.close();}
});
test('durable source checkpoint advances after journals and retries conserve values',async()=>{
 const f=fixture();try{const period=financialAccountingPeriod({kind:'MONTH',anchor:'2026-10'}),events=[];for(let i=0;i<3;i++)events.push(await observedEvent(f.scope,'synthetic-'+i,100));
  let observedCheckpoint=null;f.options.services.readFinancialAutomationSources=async({checkpoint})=>{observedCheckpoint=checkpoint;return {events,coverage:[],balances:[],obligations:[],reserve:null,capabilities:[],pending:[],cutoff_at:new Date(fixed).toISOString(),checkpoint:{after:'opaque-cursor'},has_more:false};};
  const first=await ingestFinancialAutomationSources(f.env,{scope:f.scope,period,maximum_events:2},f.options);assert.equal(first.complete,false);assert.equal(first.ingested,2);assert.equal(observedCheckpoint,null);
  const second=await ingestFinancialAutomationSources(f.env,{scope:f.scope,period,maximum_events:2},f.options);assert.equal(second.complete,true);assert.equal(second.ingested,1);assert.equal(observedCheckpoint,null);
  const third=await ingestFinancialAutomationSources(f.env,{scope:f.scope,period,maximum_events:100},f.options);assert.equal(third.complete,true);assert.deepEqual(observedCheckpoint,{after:'opaque-cursor'});
  const workspace=await readFinancialAutomationWorkspace(f.env,{scope:f.scope,month:'2026-10'},f.options);assert.equal(workspace.projection.events.length,3);assert.equal(workspace.projection.result.known_amount_cents,300);assert.equal(workspace.projection.result.amount_cents,null);
 }finally{f.close();}
});
test('closed month keeps its figures; late costs require a new immutable version',async()=>{
 const f=fixture();try{
  const sale=await observedEvent(f.scope,'synthetic-sale',10000),events=[sale];installSources(f,events);
  assert.equal((await request(f,'/policy',approve())).status,200);
  assert.equal((await request(f,'/sync',{month:'2026-10',request_id:'cccccccc-cccc-cccc-cccc-cccccccccccc',confirmed:true})).status,200);
  const body={operation:'prepare',kind:'MONTH',anchor:'2026-10-01',basis:'ACCRUAL',close_id:null,expected_revision:0,request_id:'dddddddd-dddd-dddd-dddd-dddddddddddd',reason:'Synthetic equivalent sources checked',confirmed:true};
  const prepared=await request(f,'/close',body);assert.equal(prepared.status,200);const ready=await prepared.json();assert.equal(ready.close.status,'PRONTO');
  const finalized=await request(f,'/close',{...body,operation:'finalize',close_id:ready.close.close_id,expected_revision:ready.close.version,request_id:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'});assert.equal(finalized.status,200);const closed=(await finalized.json()).close;assert.equal(closed.status,'FECHADO');assert.equal(closed.snapshot.projection.result.amount_cents,10000);const frozen=JSON.stringify(closed);
  f.options.now=()=>fixed+60000;
  assert.equal((await request(f,'/sync',{month:'2026-10',request_id:'99999999-9999-9999-9999-999999999999',confirmed:true})).status,200);
  const repeatedPrepare=await request(f,'/close',{...body,expected_revision:closed.version,close_id:closed.close_id,request_id:'88888888-8888-8888-8888-888888888888'});assert.equal(repeatedPrepare.status,200);const sameClose=await repeatedPrepare.json();assert.equal(sameClose.needs_rectification,false);assert.equal(sameClose.changed,false);assert.equal(sameClose.close.version,closed.version);assert.equal(sameClose.close.snapshot_hash,closed.snapshot_hash);
  events.push(await observedEvent(f.scope,'synthetic-cost',5000,{event_type:'GOODS_CONSUMED',source:{provider:'OPERATOR',family:'HISTORICAL_STOCK_ALLOCATION',native_id:'synthetic-allocation',identity:'NATIVE_ID',identity_key:null},postings:[{account:'COGS',account_ref:'consumption',amount_cents:5000},{account:'INVENTORY',account_ref:'stock',amount_cents:-5000}]}));
  assert.equal((await request(f,'/sync',{month:'2026-10',request_id:'ffffffff-ffff-ffff-ffff-ffffffffffff',confirmed:true})).status,200);
  const after=await (await request(f,'?month=2026-10')).json();assert.equal(after.projection_source.kind,'CLOSED_VERSION');assert.equal(after.projection.result.amount_cents,10000);assert.ok(after.pending.includes('FINANCIAL_LATE_EVENTS_REQUIRE_RECTIFICATION'));
  const rectified=await request(f,'/close',{...body,operation:'rectify',close_id:closed.close_id,expected_revision:closed.version,request_id:'11111111-1111-1111-1111-111111111111',reason:'Synthetic late allocation evidence'});assert.equal(rectified.status,200);const corrected=(await rectified.json()).close;assert.equal(corrected.status,'RETIFICADO');assert.equal(corrected.version,closed.version+1);assert.equal(corrected.snapshot.projection.result.amount_cents,5000);assert.equal(JSON.stringify(closed),frozen);
 }finally{f.close();}
});
test('scheduled preparation records provisional state instead of closing by the clock',async()=>{
 const f=fixture();try{
  const result=await runFinancialAutomationJobs(f.env,{current,services:{readFinancialAutomationSources:async()=>({events:[],coverage:[],balances:[],obligations:[],reserve:null,capabilities:[],pending:['WALLET_GRANT_NOT_VERIFIED'],cutoff_at:null,checkpoint:null,has_more:false})},assertAuthorized:f.options.assertAuthorized,now});
  assert.equal(result.status,'PROCESSED');assert.equal(result.results.length,1);assert.equal(result.results[0].status,'COLLECTED');
  for(let run=1;run<=8;run++)await runFinancialAutomationJobs(f.env,{current,services:{readFinancialAutomationSources:async()=>({events:[],coverage:[],balances:[],obligations:[],reserve:null,capabilities:[],pending:['WALLET_GRANT_NOT_VERIFIED'],cutoff_at:null,checkpoint:null,has_more:false})},assertAuthorized:f.options.assertAuthorized,now:()=>fixed+run*600000});assert.ok(result.results[0].close_refs.every(x=>!['FECHADO','RETIFICADO'].includes(x.status)));
  const workspace=await readFinancialAutomationWorkspace(f.env,{scope:f.scope,month:'2026-11'},f.options);assert.ok(workspace.closings.length>=2);assert.ok(workspace.closings.every(x=>x.amount_cents===null));
 }finally{f.close();}
});
test('new endpoint rejects untrusted owner, query scope injection and auth revocation',async()=>{
 const f=fixture();try{assert.equal((await request(f,'?month=2026-10&company=forged')).status,400);assert.equal((await handleFinancialAutomation(new Request(origin+'/api/admin/finance/automation?month=2026-10'),f.env,{...f.options,current:{role:'viewer'}})).status,403);f.options.assertAuthorized=async()=>false;assert.equal((await request(f,'?month=2026-10')).status,403);}finally{f.close();}
});

test('an explicit company tax declaration is scoped, validated and versioned',async()=>{
 const f=fixture();try{
  const result=await request(f,'/policy',approve({tax_declaration:{regime:'SIMPLES',mode:'FIXED_MONTHLY',monthly_cents:0}}));assert.equal(result.status,200);const saved=await result.json();assert.equal(saved.policy.tax.regime,'SIMPLES');assert.equal(saved.policy.tax.monthly_cents,0);assert.equal(saved.policy.tax.recognition,'MONTH_END');assert.equal(saved.policy.tax.revision,1);assert.equal(saved.policy.tax.source_ref,'policy-tax-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  const bad=await request(f,'/policy',approve({expected_revision:1,request_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',tax_declaration:{regime:'MEI',mode:'EXPLICIT_EVENTS',monthly_cents:100}}));assert.equal(bad.status,400);
  const clear=await request(f,'/policy',approve({expected_revision:1,request_id:'cccccccc-cccc-cccc-cccc-cccccccccccc',tax_declaration:{regime:null,mode:'UNCONFIGURED',monthly_cents:null}}));assert.equal(clear.status,200);assert.equal((await clear.json()).policy.tax.mode,'UNCONFIGURED');
 }finally{f.close();}
});

test('persisted inventory source fences reject changed state atomically',async()=>{
 const f=fixture();try{
  await f.env.ADMIN_DB.prepare('CREATE TABLE incurred_production_state(id INTEGER PRIMARY KEY,revision INTEGER)').run();await f.env.ADMIN_DB.prepare('INSERT INTO incurred_production_state VALUES(1,2)').run();
  const input={scope:f.scope,kind:'INVENTORY',payload:{schema:'synthetic_inventory_test_v1'},expected_revision:0,request_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'};
  await assert.rejects(writeFinancialAutomationState(f.env,input,{...f.options,sourceStateFences:[{table:'incurred_production_state',revision:1}]}),error=>error.status===409&&error.code==='FINANCIAL_AUTOMATION_SOURCE_CHANGED');
  const before=await readFinancialAutomationState(f.env,{scope:f.scope,kind:'INVENTORY',history:true},f.options);assert.equal(before.revision,0);assert.equal(before.history.length,0);
  const saved=await writeFinancialAutomationState(f.env,input,{...f.options,sourceStateFences:[{table:'incurred_production_state',revision:2}]});assert.equal(saved.revision,1);
  await assert.rejects(writeFinancialAutomationState(f.env,{...input,expected_revision:1,request_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'},{...f.options,sourceStateFences:[{table:'arbitrary_table',revision:2}]}),error=>error.code==='FINANCIAL_AUTOMATION_SOURCE_FENCE_INVALID');
 }finally{f.close();}
});

test('dropping a generic audit statement rolls back configuration and inventory heads',async()=>{
 const f=fixture();try{const db=f.env.ADMIN_DB,prepare=db.prepare.bind(db),batch=db.batch.bind(db);db.prepare=sql=>{const statement=prepare(sql);statement.taskSQL=sql;return statement;};db.batch=statements=>batch(statements.filter(row=>!row.taskSQL.startsWith('INSERT INTO financial_automation_requests')));
  const response=await request(f,'/policy',approve());assert.equal(response.status,503);const saved=await readFinancialAutomationState(f.env,{scope:f.scope,kind:'CONFIG',history:true},f.options);assert.equal(saved.revision,0);assert.equal(saved.history.length,0);
 }finally{f.close();}
});

test('an advancing clock accepts real saved Ads observations and advances the durable source cursor',async()=>{
 const f=fixture();try{
  let clock=fixed;f.options.now=()=>clock+=10;
  const period=financialAccountingPeriod({kind:'MONTH',anchor:'2026-10'}),selection={start_date:'2026-10-01',end_date:'2026-10-01'},fetched_at=fixed/1000-60;
  const report=buildAdsCalendar([buildAdsMeasurement({status:'ok',connected:true,shop:{id:FINANCE_PROFILE.shop_id},period:selection,balance:'1.00',daily:[{date:'2026-10-01',expense:'1.23',broad_gmv:'0',broad_order:0,broad_roas:'0',direct_gmv:'0',direct_order:0,direct_roas:'0'}]},selection,fetched_at)],selection,fetched_at);
  const order=await observedEvent(f.scope,'clock-initial-order',100);let adsObservation=null;
  f.options.services.readFinancialAutomationSources=async({scope,period,now,checkpoint})=>{
   if(checkpoint===null)return {events:[order],coverage:[],capabilities:[],pending:[],cutoff_at:order.observed_at,checkpoint:{next_lane:1},has_more:true};
   assert.deepEqual(checkpoint,{next_lane:1});
   const ads=await readFinancialAutomationSavedAds(f.env,{scope,period,now,readMonth:async()=>({display:{month:'2026-10',ads:report},active:null})});
   assert.equal(ads.events.length,1);adsObservation=ads.events[0].observed_at;
   return {...ads,cutoff_at:adsObservation,checkpoint:{next_lane:2},has_more:true};
  };
  const first=await ingestFinancialAutomationSources(f.env,{scope:f.scope,period},f.options);assert.equal(first.ingested,1);assert.equal(first.source_revision,1);
  const second=await ingestFinancialAutomationSources(f.env,{scope:f.scope,period},f.options);assert.equal(second.ingested,1);assert.equal(second.source_revision,2);
  const saved=await readFinancialAutomationState(f.env,{scope:f.scope,kind:'SOURCES:MONTH:2026-10-01:CIVIL_MONTH'},f.options);
  assert.deepEqual(saved.payload.checkpoint,{next_lane:2});assert.ok(saved.payload.checked_at>=adsObservation);assert.ok(adsObservation>order.observed_at);
  const ledger=await readFinancialEvents(f.env,{scope:f.scope,limit:100},f.options);assert.equal(ledger.events.length,2);
  const ads=ledger.events.find(event=>event.source.family==='ADS_DAILY_CONSUMPTION');assert.equal(ads.quality,'REVIEW');assert.equal(ads.postings[0].amount_cents,123);
 }finally{f.close();}
});

test('future source observations and cutoffs still reject atomically with an advancing clock',async()=>{
 const f=fixture();try{
  let clock=fixed;f.options.now=()=>clock+=10;
  const period=financialAccountingPeriod({kind:'MONTH',anchor:'2026-10'}),event=await observedEvent(f.scope,'clock-stable-order',100);
  f.options.services.readFinancialAutomationSources=async()=>({events:[event],coverage:[],capabilities:[],pending:[],cutoff_at:event.observed_at,checkpoint:{next_lane:1},has_more:true});
  await ingestFinancialAutomationSources(f.env,{scope:f.scope,period},f.options);
  const stateInput={scope:f.scope,kind:'SOURCES:MONTH:2026-10-01:CIVIL_MONTH',history:true},before=await readFinancialAutomationState(f.env,stateInput,f.options),ledgerBefore=await readFinancialEvents(f.env,{scope:f.scope,limit:100},f.options);
  for(const mode of ['observation','cutoff']){
   f.options.services.readFinancialAutomationSources=async({now,checkpoint})=>{
    assert.deepEqual(checkpoint,{next_lane:1});const future=new Date(now()+60000).toISOString();
    return {events:[mode==='observation'?{...event,observed_at:future}:event],coverage:[],capabilities:[],pending:[],cutoff_at:mode==='cutoff'?future:event.observed_at,checkpoint:{next_lane:2},has_more:false};
   };
   await assert.rejects(ingestFinancialAutomationSources(f.env,{scope:f.scope,period},f.options),error=>error.code===(mode==='observation'?'FINANCIAL_AUTOMATION_SOURCE_INVALID':'FINANCIAL_AUTOMATION_SOURCE_CUTOFF_INVALID'));
   assert.deepEqual(await readFinancialAutomationState(f.env,stateInput,f.options),before);
   assert.deepEqual(await readFinancialEvents(f.env,{scope:f.scope,limit:100},f.options),ledgerBefore);
  }
 }finally{f.close();}
});
