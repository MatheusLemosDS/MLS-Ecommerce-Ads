import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {createFinancialSourceWorker,readFinancialSourceEvidence,readFinancialSourceOriginalItems} from '../../finance/src/financial-source-worker.mjs';
import {FINANCIAL_ORDER_COMPONENT_FIELDS} from '../../finance/src/financial-order-components.mjs';
import {createFinancialAutomationServices} from '../src/financial-automation-sources.mjs';
import {financialEventContentHash} from '../src/financial-event-ledger.mjs';
import {FINANCIAL_ACCOUNTING_COVERAGE_FAMILIES,projectFinancialAccounting} from '../src/financial-accounting-projection.mjs';
import {financialTestPolicy} from './financial-ledger-fixture.mjs';
import {financialAccountingPeriod} from '../src/financial-accounting-schedule.mjs';
import {financialAutomationScope} from '../src/financial-automation-service.mjs';
import {ingestFinancialAutomationSources,readFinancialAutomationLedger} from '../src/financial-automation-bridge.mjs';
const fixed=Date.parse('2026-11-13T18:00:00Z'),now=()=>fixed,stamp=fixed/1000;
const scope={organization_id:'synthetic-company',store_id:'synthetic-shop',account_id:'operating-book',currency:'BRL'};
const period=financialAccountingPeriod({kind:'MONTH',anchor:'2026-10'}),run_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const policy={policy_id:'synthetic-policy',revision:1,approval:{state:'APPROVED'},recognition:'COMPLETED_ORDER',revenue_base:'NET_PAYOUT'};
const unknownCapabilities=()=>({sources:['ORDERS','ESCROW','INCOME_OVERVIEW','PENDING','RELEASES','RETURNS','RETURN_DISCOVERY','WALLET','PAYOUTS'].map(source=>({source,state:'UNKNOWN',reason:'CAPABILITY_NOT_VERIFIED',collection_allowed:false,checked_at:null}))});
const fact=(i=1,patch={})=>({event_key:i.toString(16).padStart(64,'0'),source_hash:'b'.repeat(64),bucket:'completed',create_time:Date.parse('2026-10-10T12:00Z')/1000,checked_at:stamp,currency:'BRL',escrow_amount_cents:9000,after_adjustment_cents:9000,total_adjustment_cents:0,return_count:1,diagnostic:null,payment_covered:true,components:{dates:{created_at:'2026-10-10T12:00:00.000Z',updated_at:'2026-10-21T12:00:00.000Z',paid_at:null,completed_at:'2026-10-20T12:00:00.000Z'},amounts:{original_cost_of_goods_sold_cents:12000,ads_escrow_top_up_fee_or_technical_support_fee_cents:0}},...patch});
function frame(facts,{complete=true,more=false,cursor=null,next=null}={}){return {schema:'financial_source_evidence_v2',scope,run:{run_id,revision:1,status:'COMPLETE',start_date:'2026-10-01',end_date:'2026-10-31',cutoff_at:stamp-10,checked_at:stamp},facts,coverage:{complete:false,base_complete:complete,window_complete:true,page_complete:!more},capabilities:unknownCapabilities(),cursor,next_cursor:next,has_more:more};}
const explicitZero={mode:'MANUAL',expenses_revision:1,current_external_expenses_cents:0,unallocated_cents:0,items:[]};
function services(privateRead,expenses=explicitZero){return createFinancialAutomationServices({}, {readFinancialSavedMonth:async()=>({audit_scope:{sources:[{run_id,source_revision:1}]}}),readFinancialSavedExpenses:async()=>expenses,readFinancialPrivate:privateRead,readFinancialSavedAds:async({scope,period})=>({events:[],coverage:[{family:'ADS',scope,state:'UNKNOWN',start_at:period.start_at,end_at:period.end_at,timezone_confirmed:false,comparison:'NOT_COMPARED',account_refs:[],pending:['ADS_SOURCE_TIMEZONE_UNCONFIRMED']}],pending:['ADS_SOURCE_TIMEZONE_UNCONFIRMED'],known_expense_cents:null,covered_days:0,missing_days:[],partial_days:[]}),readFinancialSavedInventory:async({scope})=>({events:[],coverage:[],pending:[],inventory_revision:0,inventory:{schema:'financial_inventory_projection_v1',scope,state:'PARTIAL',remaining_quantity:null,known_inventory_value_cents:null}}),readFinancialSavedReturns:async()=>({revision:0,checked_at:null,state:'UNKNOWN',counts:{known:0},pending:['RETURNS_FINANCIAL_COVERAGE_UNCONFIRMED']}),readFinancialSavedCash:async({scope,source})=>({events:[],coverage:[{family:source==='NUBANK'?'BANK':'PAYOUTS',scope,state:'UNAVAILABLE',start_at:null,end_at:null,timezone_confirmed:false,comparison:'NOT_COMPARED',account_refs:[],pending:['IMPORTED_CASH_SOURCE_UNAVAILABLE']}],pending:['IMPORTED_CASH_SOURCE_UNAVAILABLE'],checkpoint:null,has_more:false,counts:{records_read:0}})});}
test('V2 consumes actual normalized completion timestamp, keeps net once and never infers CMV or recharge',async()=>{
 let count=0;const adapter=services(async input=>{count++;assert.equal(input.schema,'financial_source_request_v2');return {status:200,body:frame([fact()])};});
 const result=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync'});
 assert.equal(result.events.length,1);const event=result.events[0];assert.equal(event.competence_at,'2026-10-20T12:00:00.000Z');assert.equal(event.source_updated_at,'2026-10-21T12:00:00.000Z');assert.equal(event.quality,'CONFIRMED');assert.deepEqual(event.postings.map(p=>p.account),['RECEIVABLE','REVENUE']);assert.equal(event.postings[0].amount_cents,9000);
 assert.ok(result.pending.includes('ORDERS_COMPETENCE_COHORT_COVERAGE_REQUIRED'));assert.equal(result.coverage.find(r=>r.family==='ORDERS').state,'PARTIAL');assert.equal(result.coverage.find(r=>r.family==='EXPENSES').state,'COMPLETE');assert.equal(result.capabilities.find(r=>r.source==='WALLET').state,'UNKNOWN');
 const repeated=await adapter.readFinancialAutomationSources({scope,period,policy,now,checkpoint:result.checkpoint,mode:'sync'});assert.equal(count,1);assert.equal(repeated.capabilities,undefined);assert.deepEqual(repeated.checkpoint.order_checkpoint.capabilities,result.capabilities);assert.equal(repeated.has_more,true);
});
test('a later complete page cannot erase an earlier incomplete observation',async()=>{
 let calls=0;const cursor='c'.repeat(64),adapter=services(async input=>({status:200,body:calls++===0?frame([fact()],{complete:false,more:true,next:cursor}):frame([fact(2)],{complete:true,cursor})}));
 const first=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync'});assert.equal(first.has_more,true);assert.equal(first.checkpoint.order_checkpoint.complete,false);
 let second=first;for(let n=0;n<5;n++)second=await adapter.readFinancialAutomationSources({scope,period,policy,now,checkpoint:second.checkpoint,mode:'sync'});assert.equal(second.checkpoint.order_checkpoint.complete,false);assert.ok(second.pending.includes('ORDER_EVIDENCE_COLLECTION_INCOMPLETE'));assert.equal(second.checkpoint.order_done,true);
});
test('missing actual completion date and gross policy retain review without invented amount',async()=>{
 for(const [selected,input] of [[policy,fact(1,{components:null})],[{...policy,revenue_base:'GROSS_COMPONENTS'},fact()]]){const result=await services(async()=>({status:200,body:frame([input])})).readFinancialAutomationSources({scope,period,policy:selected,now,mode:'sync'});assert.equal(result.events[0].quality,'REVIEW');assert.equal(result.events[0].postings.length,0);assert.ok(result.pending.includes('ORDER_RECOGNITION_EVIDENCE_REQUIRED'));}
});
test('more than100 source events survive the journal budget before advancing source cursor',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());const selected=financialAutomationScope(env,{role:'owner'}),facts=Array.from({length:100},(_,i)=>fact(i+1));
 const items=Array.from({length:3},(_,i)=>({id:'synthetic-expense-'+i,status:'OPEN',amount_cents:100,competence_month:'2026-10',created_at:'2026-10-01T12:00:00.000Z',updated_at:'2026-10-01T12:00:00.000Z',category:'OTHER',due_date:'2026-10-31'}));
 let calls=0;const adapter=services(async()=>{calls++;return {status:200,body:{...frame(facts),scope:selected}};},{...explicitZero,mode:'CONFIRMED',items});
 const options={now,actor:'synthetic-operator',assertAuthorized:async()=>true,services:adapter,policy};
 const first=await ingestFinancialAutomationSources(env,{scope:selected,period},options);assert.equal(first.complete,false);assert.equal(first.ingested,100);
 const second=await ingestFinancialAutomationSources(env,{scope:selected,period},options);assert.equal(second.complete,false);assert.equal(second.ingested,3);assert.equal(calls,2);
 const third=await ingestFinancialAutomationSources(env,{scope:selected,period},options);assert.equal(third.ingested,0);assert.equal(calls,2);const ledger=await readFinancialAutomationLedger(env,selected,{...options,period});assert.equal(ledger.events.length,103);assert.equal(ledger.events.filter(e=>e.postings.some(p=>p.account==='REVENUE')).length,100);
});
test('default original-item helpers list bounded V3 choices and resolve the exact sold source',async()=>{
 const seen=[],proof={scope,run_id,order_hash:'a'.repeat(64),item_id:'123',model_id:'456',quantity:3,source_hash:'b'.repeat(64),run_revision:1,checked_at:new Date(fixed).toISOString()};
 const adapter=services(async input=>{seen.push(input);return {status:200,body:{schema:'financial_source_original_items_v3',scope,run:{run_id,revision:1},items:[proof]}};});
 assert.deepEqual(await adapter.listFinancialOriginalItems({scope,month:'2026-10',now}),[proof]);assert.equal(seen[0].schema,'financial_source_request_v3');assert.equal(seen[0].operation,'original-items');assert.equal(seen[0].order_hash,null);assert.equal(seen[0].expected_revision,1);assert.equal(seen[0].limit,100);
 const selected=await adapter.resolveFinancialOriginalItem({scope,run_id,order_hash:proof.order_hash,item_id:proof.item_id,model_id:proof.model_id});assert.deepEqual(selected,proof);assert.equal(seen[1].order_hash,proof.order_hash);assert.equal(seen[1].limit,1);assert.equal(selected.quantity,3,'original sold units are preserved, never multiplied into kit pieces');
 const wrong=services(async()=>({status:200,body:{schema:'financial_source_original_items_v3',scope:{...scope,store_id:'other'},run:{run_id},items:[proof]}}));await assert.rejects(wrong.resolveFinancialOriginalItem({scope,run_id,order_hash:proof.order_hash,item_id:'123',model_id:'456'}),error=>error.status===403);
});

test('a new source observation without economic change does not version the order journal',async()=>{
 const before=fact(1,{order_items_hash:'e'.repeat(64)}),after={...before,checked_at:stamp+60,source_hash:'d'.repeat(64),components:{...before.components,checked_at:stamp+60,source_hash:'d'.repeat(64)}};
 const first=await services(async()=>({status:200,body:frame([before])})).readFinancialAutomationSources({scope,period,policy,now,mode:'sync'});
 const nextNow=()=>fixed+60000,second=await services(async()=>({status:200,body:{...frame([after]),run:{...frame([after]).run,checked_at:stamp+60}}})).readFinancialAutomationSources({scope,period,policy,now:nextNow,mode:'sync'});
 assert.equal(await financialEventContentHash(first.events[0]),await financialEventContentHash(second.events[0]));assert.notEqual(first.observations.orders.sha256,second.observations.orders.sha256);assert.notEqual(first.observations.orders.checked_at,second.observations.orders.checked_at);
 const changed={...after,escrow_amount_cents:8000,after_adjustment_cents:8000,total_adjustment_cents:0};const third=await services(async()=>({status:200,body:{...frame([changed]),run:{...frame([changed]).run,checked_at:stamp+60}}})).readFinancialAutomationSources({scope,period,policy,now:nextNow,mode:'sync'});assert.notEqual(await financialEventContentHash(second.events[0]),await financialEventContentHash(third.events[0]));
 const quantityChanged={...after,order_items_hash:'f'.repeat(64)},fourth=await services(async()=>({status:200,body:{...frame([quantityChanged]),run:{...frame([quantityChanged]).run,checked_at:stamp+60}}})).readFinancialAutomationSources({scope,period,policy,now:nextNow,mode:'sync'});assert.deepEqual(fourth.events[0].postings,second.events[0].postings);assert.notEqual(await financialEventContentHash(second.events[0]),await financialEventContentHash(fourth.events[0]));
});

test('real strict V2/V3 worker feeds the App defaults without leaking native orders or inventing kit quantity',async()=>{
 const selected=financialAutomationScope({}, {role:'owner'}),order_hash='a'.repeat(64),source_hash='b'.repeat(64),source={schema:'financial_order_evidence_snapshot_v1',run:{run_id,revision:1,status:'COMPLETE',start_date:'2026-10-01',end_date:'2026-10-31',cutoff_at:stamp-60,checked_at:stamp},missing_orders:0,invalid_orders:0,orders:[{order_hash,source_hash,bucket:'completed',payment_covered:1,checked_at:stamp,items:[{item_id:'123',model_id:'456',quantity:3}],evidence:{schema:'financial_order_evidence_v2',order_sn:'SYNTHETIC_PRIVATE_ORDER_ONLY_SERVER',order_status:'COMPLETED',currency:'BRL',create_time:Date.parse('2026-10-10T12:00Z')/1000,diagnostic:null,return_order_sn_list:[],amounts:{escrow_amount_raw:'80',escrow_amount_after_adjustment_raw:'80',total_adjustment_amount_raw:'0'}}}]};
 const component={schema:'financial_order_components_v1',order_hash,source_hash,checked_at:stamp,currency:'BRL',source_status:'COMPLETED',status:'AVAILABLE',dates:{created_at:'2026-10-10T12:00:00.000Z',updated_at:'2026-10-21T12:00:00.000Z',paid_at:'2026-10-10T13:00:00.000Z',completed_at:'2026-10-20T12:00:00.000Z'},amounts:Object.fromEntries(FINANCIAL_ORDER_COMPONENT_FIELDS.map(key=>[key+'_cents',key==='escrow_amount'?8000:key==='escrow_amount_after_adjustment'?8000:key==='total_adjustment_amount'||key==='ads_escrow_top_up_fee_or_technical_support_fee'?0:100])),missing_fields:[],invalid_fields:[],basis:'OBSERVED_ORDER_INCOME_FIELDS_NO_INFERRED_RECONCILIATION'};
 const readEvidence=async()=>source,readComponents=async()=>({schema:'financial_order_components_snapshot_v1',status:'AVAILABLE',run_id,source_revision:1,checked_at:stamp,missing_orders:0,invalid_orders:0,orders:[{order_hash,source_hash,checked_at:stamp,payload_hash:'c'.repeat(64),components:component}]}),financeEnv={FINANCE_ROUTER_SECRET:'synthetic-router-secret-'.repeat(3)};
 const worker=createFinancialSourceWorker({now,readEvidence:(env,input,options)=>readFinancialSourceEvidence(env,input,{...options,readEvidence,readComponents}),readOriginalItems:(env,input,options)=>readFinancialSourceOriginalItems(env,input,{...options,readEvidence})});
 const adapter=createFinancialAutomationServices({}, {readFinancialSavedMonth:async()=>({audit_scope:{sources:[{run_id,source_revision:1}]}}),readFinancialSavedExpenses:async()=>explicitZero,readFinancialPrivate:async command=>{const response=await worker.fetch(new Request('https://auth.brazacommerce.com.br/internal/finance/financial-sources-v1',{method:'POST',headers:{'content-type':'application/json','X-Braza-Finance-Router':financeEnv.FINANCE_ROUTER_SECRET},body:JSON.stringify(command)}),financeEnv);return {status:response.status,body:await response.json()};}});
 const items=await adapter.listFinancialOriginalItems({scope:selected,month:'2026-10',now});assert.equal(items.length,1);assert.equal(items[0].quantity,3);const proof=await adapter.resolveFinancialOriginalItem({scope:selected,run_id,order_hash,item_id:'123',model_id:'456'});assert.deepEqual(proof,items[0]);assert.equal(proof.source_hash,source_hash);
 const observed=await adapter.readFinancialAutomationSources({scope:selected,period,policy,now,mode:'sync'});assert.equal(observed.events[0].quality,'CONFIRMED');assert.equal(observed.events[0].postings[0].amount_cents,8000);assert.equal(observed.events[0].competence_at,component.dates.completed_at);assert.doesNotMatch(JSON.stringify({items,proof,observed}),/SYNTHETIC_PRIVATE_ORDER|order_sn|access_token/);
});

test('unclassified adjustments and unknown or nonzero topups cannot become revenue or a closeable result',async()=>{
 const refs={RECEIVABLES:['shopee-receivables'],WALLET:['synthetic-wallet','synthetic-held'],PAYOUTS:['synthetic-transit'],BANK:['synthetic-bank'],ADS:['synthetic-ads'],INVENTORY:['synthetic-stock']};
 function financialProjection(event,pending=[]){
  // All unrelated evidence is explicitly complete in this isolated fixture;
  // the actual source adapter's adjustment classification remains unresolved.
  const coverage=FINANCIAL_ACCOUNTING_COVERAGE_FAMILIES.map(family=>({family,scope,state:'COMPLETE',start_at:period.start_at,end_at:period.end_at,timezone_confirmed:true,comparison:'MATCHED',account_refs:refs[family]??[],pending:family==='ORDERS'?pending:[]}));
  const balances=[];for(const [account,account_ref,closing] of [['RECEIVABLE','shopee-receivables',9000],['WALLET_AVAILABLE','synthetic-wallet',0],['WALLET_HELD','synthetic-held',0],['TRANSFER_IN_TRANSIT','synthetic-transit',0],['BANK','synthetic-bank',0],['ADS_PREPAID','synthetic-ads',0],['INVENTORY','synthetic-stock',0]])for(const [as_of,amount_cents] of [[period.start_at,0],[period.end_at,closing]])balances.push({scope,account,account_ref,as_of,amount_cents,confirmed:true,evidence_ref:'synthetic-complete-balance'});
  return projectFinancialAccounting({scope,period,policy:financialTestPolicy({scope,recognition:'COMPLETED_ORDER'}),events:[event],coverage,balances,obligations:[],reserve:{scope,amount_cents:0,confirmed:true,evidence_ref:'synthetic-reserve'},checked_at:new Date(fixed).toISOString()});
 }
 const read=async input=>services(async()=>({status:200,body:frame([input])})).readFinancialAutomationSources({scope,period,policy,now,mode:'sync'}),clean=await read(fact()),verified=financialProjection(clean.events[0]);
 assert.equal(verified.result.amount_cents,9000);assert.equal(verified.close_readiness.ACCRUAL.ready,true,'the synthetic controls can otherwise close with the same payout');
 const topup='ads_escrow_top_up_fee_or_technical_support_fee_cents',missing=fact();delete missing.components.amounts[topup];const absent=fact(1,{components:null});
 const cases=[['ORDER_ADJUSTMENT_CLASSIFICATION_REQUIRED',fact(1,{escrow_amount_cents:10000,total_adjustment_cents:-1000})],['ORDER_ADJUSTMENT_CLASSIFICATION_REQUIRED',fact(1,{escrow_amount_cents:8000,total_adjustment_cents:1000})],['ORDER_ADJUSTMENT_CLASSIFICATION_REQUIRED',fact(1,{components:{...fact().components,amounts:{...fact().components.amounts,[topup]:300}}})],['ORDER_TOPUP_COMPONENT_REQUIRED',missing],['ORDER_TOPUP_COMPONENT_REQUIRED',fact(1,{components:{...fact().components,amounts:{...fact().components.amounts,[topup]:null}}})],['ORDER_TOPUP_COMPONENT_REQUIRED',absent]];
 for(const [code,input] of cases){const result=await read(input),event=result.events[0];assert.equal(event.event_id,clean.events[0].event_id,'source identity stays native and stable');assert.equal(event.quality,'REVIEW');assert.deepEqual(event.postings,[]);assert.ok(result.pending.includes(code));assert.ok(result.coverage.find(row=>row.family==='ORDERS').pending.includes(code));const projected=financialProjection(event,result.pending.filter(value=>value===code));assert.equal(projected.result.amount_cents,null);assert.equal(projected.close_readiness.ACCRUAL.ready,false);assert.ok(projected.result.pending.includes(code));}
});

test('classification pending from an earlier page survives a later clean order page',async()=>{
 const cursor='c'.repeat(64);let calls=0;const adapter=services(async()=>({status:200,body:calls++===0?frame([fact(1,{escrow_amount_cents:10000,total_adjustment_cents:-1000})],{more:true,next:cursor}):frame([fact(2)],{cursor})}));
 let result=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync'});assert.ok(result.pending.includes('ORDER_ADJUSTMENT_CLASSIFICATION_REQUIRED'));for(let turn=0;turn<5;turn++)result=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync',checkpoint:result.checkpoint});
 assert.equal(calls,2);assert.equal(result.events[0].quality,'CONFIRMED');assert.ok(result.pending.includes('ORDER_ADJUSTMENT_CLASSIFICATION_REQUIRED'));assert.ok(result.checkpoint.order_checkpoint.classification_pending.includes('ORDER_ADJUSTMENT_CLASSIFICATION_REQUIRED'));
});

test('historical monthly expense competence uses the actual Sao Paulo DST boundary',async()=>{
 const historical=financialAccountingPeriod({kind:'MONTH',anchor:'2015-10'}),expense={...explicitZero,mode:'CONFIRMED',items:[{id:'synthetic-historical-expense',status:'OPEN',amount_cents:1350,competence_month:'2015-10',created_at:'2015-10-01T12:00:00.000Z',updated_at:'2015-10-01T12:00:00.000Z',category:'OTHER',due_date:'2015-10-31'}]},result=await services(async()=>({status:200,body:frame([])}),expense).readFinancialAutomationSources({scope,period:historical,policy,now,mode:'sync'}),event=result.events.find(row=>row.event_type==='EXPENSE_RECOGNIZED');
 assert.ok(event);assert.equal(event.competence_at,'2015-11-01T01:59:59.999Z');assert.ok(event.competence_at<historical.end_at);assert.equal(event.postings.find(row=>row.account==='OPERATING_EXPENSE').amount_cents,1350);
});

function refreshingServices(privateRead,readMonth){
 const dependencies={...services(privateRead),readFinancialSavedMonth:readMonth};delete dependencies.readFinancialAutomationSources;
 return createFinancialAutomationServices({},dependencies);
}
test('saved source pagination finishes its exact cohort when the publication refreshes between every turn',async()=>{
 const replacement='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',cursor='c'.repeat(64),seen=[];let publication=1;
 const adapter=refreshingServices(async input=>{seen.push(input);return {status:200,body:input.run_id===run_id?frame([fact(seen.length)],{more:input.cursor===null,next:input.cursor===null?cursor:null,cursor:input.cursor}):{...frame([fact(9)]),run:{...frame([]).run,run_id:replacement,revision:publication}}};},async()=>({audit_scope:{sources:[{run_id:publication===1?run_id:replacement,source_revision:publication}]}}));
 let result=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync'});publication++;
 for(let turn=0;turn<12&&!result.checkpoint.completed;turn++){publication++;result=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync',checkpoint:result.checkpoint});}
 assert.equal(result.checkpoint.completed,true);assert.equal(result.checkpoint.order_done,true);assert.equal(seen.length,2);assert.deepEqual(seen.map(row=>[row.run_id,row.expected_revision,row.cursor]),[[run_id,1,null],[run_id,1,cursor]]);
 assert.equal(result.checkpoint.order_checkpoint.schema,'financial_saved_source_cursor_v3');assert.equal(result.checkpoint.order_checkpoint.runs[0].run_id,run_id);
 // Completion releases only the cursor, never claims a completed-date cohort
 // from creation-date windows. A later pass then observes the new publication.
 assert.equal(result.coverage.find(row=>row.family==='ORDERS').state,'PARTIAL');assert.ok(result.pending.includes('ORDERS_COMPETENCE_COHORT_COVERAGE_REQUIRED'));
 const next=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync',checkpoint:result.checkpoint});assert.equal(seen.length,3);assert.equal(seen[2].run_id,replacement);assert.equal(next.checkpoint.order_checkpoint.runs[0].source_revision,publication);
});
test('a revision conflict invalidates the pinned cohort without mixing facts or claiming completeness',async()=>{
 const replacement='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',cursor='c'.repeat(64),seen=[];let published=false;
 const adapter=refreshingServices(async input=>{seen.push(input);if(input.run_id===run_id&&input.cursor!==null)return {status:409,body:{error:'FINANCIAL_SOURCE_CURSOR_STALE'}};return {status:200,body:input.run_id===run_id?frame([fact()],{more:true,next:cursor}):{...frame([fact(2)]),run:{...frame([]).run,run_id:replacement,revision:2}}};},async()=>({audit_scope:{sources:[{run_id:published?replacement:run_id,source_revision:published?2:1}]}}));
 let result=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync'});published=true;
 for(let turn=0;turn<10&&seen.length<2;turn++)result=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync',checkpoint:result.checkpoint});
 assert.equal(result.events.length,0);assert.equal(result.checkpoint.order_checkpoint.invalidated,true);assert.equal(result.checkpoint.order_done,false);assert.equal(result.coverage.find(row=>row.family==='ORDERS').state,'PARTIAL');assert.ok(result.pending.includes('FINANCIAL_SOURCE_CURSOR_STALE'));
 for(let turn=0;turn<10&&seen.length<3;turn++)result=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync',checkpoint:result.checkpoint});
 assert.equal(seen.length,3);assert.equal(seen[2].run_id,replacement);assert.equal(seen[2].cursor,null);assert.equal(seen[2].expected_revision,2);
});
test('cohort checkpoints remain scoped to the exact policy and upgrade only a matching legacy cursor',async()=>{
 const cursor='c'.repeat(64),seen=[],adapter=services(async input=>{seen.push(input);return {status:200,body:frame([fact()],{more:true,next:cursor,cursor:input.cursor})};});
 let first=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync'}),legacy=structuredClone(first.checkpoint);legacy.lane=0;legacy.order_checkpoint.schema='financial_saved_source_cursor_v2';delete legacy.order_checkpoint.context_signature;delete legacy.order_checkpoint.runs;
 const migrated=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync',checkpoint:legacy});assert.equal(seen[1].cursor,cursor);assert.equal(migrated.checkpoint.order_checkpoint.schema,'financial_saved_source_cursor_v3');
 const changed=await adapter.readFinancialAutomationSources({scope,period,policy:{...policy,revision:2},now,mode:'sync',checkpoint:migrated.checkpoint});assert.equal(seen[2].cursor,null);assert.equal(changed.checkpoint.order_checkpoint.index,0);assert.notEqual(changed.checkpoint.order_checkpoint.context_signature,first.checkpoint.order_checkpoint.context_signature);
});
test('production publication metadata renews one exact cohort lease in the evidence POST',async()=>{
 const cursor='c'.repeat(64),seen=[];let revision=7;
 const adapter=refreshingServices(async input=>{seen.push(input);return {status:200,body:frame([fact(seen.length)],{more:input.cursor===null,next:input.cursor===null?cursor:null,cursor:input.cursor})};},async()=>({audit_scope:{sources:[{run_id,source_revision:1,start_date:'2026-10-01',end_date:'2026-10-31',slot_index:0,publication_revision:revision}]}}));
 let result=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync'});revision++;
 for(let turn=0;turn<10&&seen.length<2;turn++)result=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync',checkpoint:result.checkpoint});
 assert.equal(seen.length,2);assert.equal(seen[0].schema,'financial_source_request_v4');assert.deepEqual(seen[0].retention,seen[1].retention);assert.equal(seen[0].retention.kind,'COHORT');assert.equal(seen[0].retention.publication_revision,7);assert.equal(seen[0].retention.month,'2026-10');assert.match(seen[0].retention.lease_id,/^[a-f0-9-]{36}$/);assert.deepEqual(seen[0].retention.slots,[{slot_index:0,run_id,revision:1,start_date:'2026-10-01',end_date:'2026-10-31'}]);assert.equal(seen[1].cursor,cursor);
});
test('verified missing source abandons its unavailable cohort and adopts the next real publication',async()=>{
 const replacement='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',cursor='c'.repeat(64),seen=[];let published=false;
 const adapter=refreshingServices(async input=>{seen.push(input);if(input.run_id===run_id&&input.cursor!==null)return {status:404,body:{schema:'financial_source_error_v1',error:'FINANCIAL_SOURCE_RUN_NOT_FOUND'}};return {status:200,body:input.run_id===run_id?frame([fact()],{more:true,next:cursor}):{...frame([fact(2)]),run:{...frame([]).run,run_id:replacement,revision:2}}};},async()=>({audit_scope:{sources:[{run_id:published?replacement:run_id,source_revision:published?2:1}]}}));
 let result=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync'});
 for(let turn=0;turn<10&&seen.length<2;turn++)result=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync',checkpoint:result.checkpoint});
 assert.equal(result.checkpoint.order_checkpoint.invalidated,true);assert.equal(result.checkpoint.order_done,false);assert.equal(result.events.length,0);assert.equal(result.coverage.find(row=>row.family==='ORDERS').state,'PARTIAL');assert.ok(result.pending.includes('FINANCIAL_SOURCE_RUN_NOT_FOUND'));
 published=true;for(let turn=0;turn<10&&seen.length<3;turn++)result=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync',checkpoint:result.checkpoint});
 assert.equal(seen.length,3);assert.equal(seen[2].run_id,replacement);assert.equal(seen[2].cursor,null);assert.equal(seen[2].expected_revision,2);assert.equal(result.events.length,1);
});
test('a generic404 cannot authorize a source cohort replacement',async()=>{
 const adapter=services(async()=>({status:404,body:{schema:'financial_source_error_v1',error:'FINANCIAL_SOURCE_NOT_FOUND'}})),result=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync'});
 assert.notEqual(result.checkpoint.order_checkpoint.invalidated,true);assert.equal(result.coverage.find(row=>row.family==='ORDERS').state,'PARTIAL');assert.equal(result.events.length,0);
});
test('an unavailable order dependency cannot prevent independent source lanes from refreshing',async()=>{
 const counts={orders:0,ads:0,cash:0,inventory:0,returns:0},base=services(async()=>{counts.orders++;return {status:503,body:{schema:'financial_source_error_v1',error:'FINANCIAL_SOURCE_STORAGE_UNAVAILABLE'}};}),dependencies={...base};delete dependencies.readFinancialAutomationSources;
 for(const [name,key] of [['readFinancialSavedAds','ads'],['readFinancialSavedCash','cash'],['readFinancialSavedInventory','inventory'],['readFinancialSavedReturns','returns']])dependencies[name]=async(...args)=>{counts[key]++;return base[name](...args);};
 const adapter=createFinancialAutomationServices({},dependencies);let result=null;
 for(let turn=0;turn<20;turn++)result=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync',checkpoint:result?.checkpoint??null});
 assert.ok(counts.ads>=2,JSON.stringify(counts));assert.ok(counts.inventory>=2,JSON.stringify(counts));assert.ok(counts.returns>=2,JSON.stringify(counts));assert.ok(counts.orders>=2);assert.equal(result.coverage.find(row=>row.family==='ORDERS').state,'PARTIAL');assert.ok(result.pending.includes('FINANCIAL_SOURCE_STORAGE_UNAVAILABLE'));assert.deepEqual(result.events,[]);
});
test('a deferred transport failure resumes the exact saved page after independent lanes run',async()=>{
 const replacement='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',cursor='c'.repeat(64),seen=[];let publicationChanged=false;
 const adapter=refreshingServices(async input=>{seen.push(input);if(seen.length===2){publicationChanged=true;return {status:503,body:{error:'FINANCIAL_SOURCE_STORAGE_UNAVAILABLE'}};}return {status:200,body:frame([fact(seen.length)],{more:seen.length===1,next:seen.length===1?cursor:null,cursor:input.cursor})};},async()=>({audit_scope:{sources:[{run_id:publicationChanged?replacement:run_id,source_revision:1}]}}));
 let result=null;for(let turn=0;turn<20&&seen.length<3;turn++)result=await adapter.readFinancialAutomationSources({scope,period,policy,now,mode:'sync',checkpoint:result?.checkpoint??null});
 assert.equal(seen.length,3);assert.equal(seen[2].run_id,run_id);assert.equal(seen[2].cursor,cursor);assert.equal(seen[2].expected_revision,1);assert.equal(result.checkpoint.order_done,true);assert.ok(!result.pending.includes('FINANCIAL_SOURCE_STORAGE_UNAVAILABLE'));
});
test('complete creation-window pages cannot claim the uncovered remainder of an accounting period',async()=>{
 const runIds=[run_id,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc'],estimate={...policy,recognition:'PAID_ORDER_CREATE_ESTIMATE'};
 async function collect(windows,observed=stamp,cutoff=stamp-10){
  const refs=windows.map(([start_date,end_date],index)=>({run_id:runIds[index],source_revision:1,start_date,end_date})),seen=[];
  const adapter=refreshingServices(async input=>{seen.push(input);const index=refs.findIndex(row=>row.run_id===input.run_id),ref=refs[index];return {status:200,body:{...frame([]),run:{...frame([]).run,run_id:ref.run_id,start_date:ref.start_date,end_date:ref.end_date,checked_at:Array.isArray(observed)?observed[index]:observed,cutoff_at:Array.isArray(cutoff)?cutoff[index]:cutoff}}};},async()=>({audit_scope:{sources:refs}}));
  let result=await adapter.readFinancialAutomationSources({scope,period,policy:estimate,now,mode:'sync'});
  for(let turn=0;turn<20&&!result.checkpoint.completed;turn++)result=await adapter.readFinancialAutomationSources({scope,period,policy:estimate,now,mode:'sync',checkpoint:result.checkpoint});
  assert.equal(result.checkpoint.completed,true);assert.equal(seen.length,windows.length);return result;
 }
 for(const windows of [[['2026-10-01','2026-10-15']],[['2026-10-01','2026-10-15'],['2026-10-17','2026-10-31']],[['2026-10-02','2026-10-15'],['2026-10-16','2026-10-31']],[['2026-10-01','2026-10-15'],['2026-10-16','2026-10-30']]]){
  const result=await collect(windows);assert.equal(result.coverage.find(row=>row.family==='ORDERS').state,'PARTIAL');assert.ok(result.pending.includes('ORDER_CREATION_WINDOW_COVERAGE_REQUIRED'));
 }
 const complete=await collect([['2026-10-01','2026-10-15'],['2026-10-16','2026-10-30'],['2026-10-31','2026-10-31']]);assert.equal(complete.coverage.find(row=>row.family==='ORDERS').state,'COMPLETE');assert.ok(!complete.pending.includes('ORDER_CREATION_WINDOW_COVERAGE_REQUIRED'));
 const windows=[['2026-10-01','2026-10-15'],['2026-10-16','2026-10-30'],['2026-10-31','2026-10-31']],cutoffs=['2026-10-16T03:00:00Z','2026-10-31T03:00:00Z','2026-11-01T03:00:00Z'].map(value=>Date.parse(value)/1000);
 const independent=await collect(windows,cutoffs.map(value=>value+60),cutoffs);assert.equal(independent.coverage.find(row=>row.family==='ORDERS').state,'COMPLETE','each earlier window need only observe its own end, not the entire month end');
 const lateFinish=await collect(windows,cutoffs.map(()=>stamp),[...cutoffs.slice(0,2),Date.parse('2026-10-31T12:00:00Z')/1000]);assert.equal(lateFinish.coverage.find(row=>row.family==='ORDERS').state,'PARTIAL','a late completion timestamp cannot fill orders excluded by the run cutoff');assert.ok(lateFinish.pending.includes('ORDER_CREATION_WINDOW_CUTOFF_REQUIRED'));
 const beforeEnd=await collect([['2026-10-01','2026-10-31']],Date.parse('2026-10-31T12:00:00Z')/1000,Date.parse('2026-10-31T11:00:00Z')/1000);assert.equal(beforeEnd.coverage.find(row=>row.family==='ORDERS').state,'PARTIAL');assert.ok(beforeEnd.pending.includes('ORDER_CREATION_WINDOW_CUTOFF_REQUIRED'));
});
