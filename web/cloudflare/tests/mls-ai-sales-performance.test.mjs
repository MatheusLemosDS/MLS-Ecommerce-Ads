import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiSalesPerformanceLedger,validateAiSalesManualPerformanceRecord,validateAiSalesPerformanceLedger,importAiSalesPerformance,exportAiSalesPerformance,buildAiSalesPerformanceReport} from '../src/mls-ai-sales-performance.mjs';

const at=1793300000,window={start_date:'2026-10-01',end_date:'2026-10-30'};
const evidence=(patch={})=>({source:'OFFICIAL_REPORT',reference:'synthetic-report-row',observed_at:at,status:'VERIFIED',marketplace:'SHOPEE_BR',shop_ref:'shop-test',currency:'BRL',basis:'PAID_GROSS_AND_REPORTED_COSTS',...patch});
const row=(patch={})=>({schema:'mls_ai_sales_manual_performance_record_v1',record_id:'metric-a',revision:1,kind:'METRICS',provider:'SHOPEE_BR',shop_ref:'shop-test',currency:'BRL',source:'OFFICIAL_REPORT',source_evidence:evidence(),observed_at:at,period:{...window},campaign_ref:'campaign-a',creative_ref:'creative-a',product_ref:'SHOPEE_BR:shop-test:p001:v001',creator_ref:'creator-a',coverage_status:'COMPLETE',attribution_status:'SOURCE_REPORTED',order_status:null,views:1000,clicks:100,attributed_orders:30,sales_cents:100000,refunds_cents:10000,commission_cents:5000,cost_cents:40000,fees_cents:10000,tax_cents:5000,external_expenses_cents:1000,attributable_ad_spend_cents:20000,adjustment_cents:-1000,...patch});
const batch=records=>JSON.stringify({schema:'mls_ai_sales_performance_import_v1',records});
const load=records=>importAiSalesPerformance(createAiSalesPerformanceLedger(),batch(records),{imported_at:at}).ledger;
const scope=patch=>({provider:'SHOPEE_BR',shop_ref:'shop-test',source:'OFFICIAL_REPORT',currency:'BRL',period:{...window},min_sample_orders:20,...patch});
const report=records=>buildAiSalesPerformanceReport(load(records),scope());

test('complete reported metrics calculate observed ratios and signed contribution without claiming bank profit or a proven winner',()=>{
 const result=report([row()]),group=result.groups[0];
 assert.equal(group.ctr_bps,1000);assert.equal(group.conversion_bps,3000);assert.equal(group.roas_micros,5000000);assert.equal(group.net_roas_after_refunds_micros,4500000);
 assert.equal(group.contribution_estimate_cents,8000);assert.equal(group.net_profit_cents,null);assert.equal(result.net_profit_cents,null);assert.equal(result.proven_winner,null);
 assert.equal(group.truth_status,'OPERATOR_DECLARED');assert.equal(group.state,'DECLARED_COMPLETE');assert.equal(result.recommendations[0].code,'VERIFY_REPORTED_PERFORMER');assert.equal(result.commercial_writes,false);assert.ok(Object.isFrozen(result.groups[0]));
});
test('repeated records and exports are idempotent; corrections replace revisions atomically and older imports cannot restore a cancellation',()=>{
 const first=importAiSalesPerformance(createAiSalesPerformanceLedger(),batch([row(),row()]),{imported_at:at});
 assert.equal(first.ledger.records.length,1);assert.equal(first.summary.duplicate,1);
 const repeated=importAiSalesPerformance(first.ledger,exportAiSalesPerformance(first.ledger),{imported_at:at+1});assert.equal(repeated.summary.changed,false);assert.deepEqual(repeated.ledger,first.ledger);
 const corrected=row({revision:2,sales_cents:90000,observed_at:at+2}),second=importAiSalesPerformance(first.ledger,batch([corrected]),{imported_at:at+2});
 assert.equal(second.ledger.records.length,1);assert.equal(second.summary.updated,1);assert.equal(second.ledger.records[0].sales_cents,90000);
 assert.equal(importAiSalesPerformance(second.ledger,batch([row()]),{imported_at:at+3}).summary.changed,false);
 assert.throws(()=>importAiSalesPerformance(second.ledger,batch([{...corrected,sales_cents:1}]),{imported_at:at+3}),/REVISION_CONFLICT/);
 assert.throws(()=>importAiSalesPerformance(second.ledger,batch([{...corrected,revision:3,currency:'USD',source_evidence:evidence({currency:'USD'})}]),{imported_at:at+3}),/SCOPE_CHANGED/);
 assert.equal(second.ledger.records[0].sales_cents,90000,'conflicts never partially mutate the current ledger');
});
test('cancelled and refunded orders reconcile exactly once while explicit incurred costs remain expenses',()=>{
 const order=(id,status,patch={})=>row({record_id:id,kind:'ORDER',order_status:status,views:null,clicks:null,attributed_orders:null,sales_cents:10000,refunds_cents:0,cost_cents:3000,fees_cents:1000,tax_cents:500,external_expenses_cents:0,commission_cents:500,attributable_ad_spend_cents:1000,adjustment_cents:0,...patch});
 const paid=order('order-a','PAID'),initial=load([paid,order('order-b','PAID'),order('order-c','REFUNDED',{refunds_cents:8000,commission_cents:0,attributable_ad_spend_cents:0})]);
 const cancelled=order('order-a','CANCELLED',{revision:2,observed_at:at+1,refunds_cents:10000,commission_cents:0,attributable_ad_spend_cents:0});
 const corrected=importAiSalesPerformance(initial,batch([cancelled,cancelled]),{imported_at:at+1}).ledger;
 const group=buildAiSalesPerformanceReport(corrected,scope()).groups[0];
 assert.equal(group.paid_orders,2);assert.equal(group.cancelled_orders,1);assert.equal(group.refunded_orders,1);
 assert.equal(group.reported_sales_cents,30000);assert.equal(group.reported_refunds_cents,18000);
 assert.equal(group.observed.sales_cents,20000);assert.equal(group.observed.refunds_cents,8000);
 assert.equal(group.contribution_estimate_cents,-3000,'cancellation removes revenue but does not discard incurred production/fees or subtract its refund twice');
});
test('unknown values differ from explicit zero; incomplete costs, coverage or attribution block ratio and profit claims',()=>{
 const zeros=row(Object.fromEntries(['views','clicks','attributed_orders','sales_cents','refunds_cents','commission_cents','cost_cents','fees_cents','tax_cents','external_expenses_cents','attributable_ad_spend_cents','adjustment_cents'].map(key=>[key,0])));
 const complete=report([zeros]).groups[0];assert.equal(complete.observed.sales_cents,0);assert.equal(complete.contribution_estimate_cents,0);assert.equal(complete.roas_micros,null);assert.equal(complete.conversion_bps,null);assert.equal(complete.ctr_bps,null);
 const unknown=report([row({cost_cents:null})]).groups[0];assert.equal(unknown.contribution_estimate_cents,null);assert.ok(unknown.pending.includes('COST_OR_AMOUNT_UNKNOWN'));
 for(const patch of [{coverage_status:'PARTIAL'},{attribution_status:'UNKNOWN'},{source_evidence:evidence({status:'UNKNOWN'})}]){
  const group=report([row(patch)]).groups[0];assert.equal(group.roas_micros,null);assert.equal(group.contribution_estimate_cents,null);assert.equal(group.sample_sufficient,false);
 }
 const empty=buildAiSalesPerformanceReport(createAiSalesPerformanceLedger(),scope());assert.equal(empty.state,'EMPTY');assert.deepEqual(empty.groups,[]);assert.equal(empty.net_profit_cents,null);
});
test('overlapping metric totals never double count or create a performer, and missing dates stay incomplete',()=>{
 const overlapping=report([row(),row({record_id:'metric-duplicate-window'})]).groups[0];
 assert.equal(overlapping.observed,null);assert.equal(overlapping.reported_sales_cents,null);assert.equal(overlapping.roas_micros,null);assert.equal(overlapping.sample_sufficient,false);assert.ok(overlapping.pending.includes('OVERLAPPING_METRIC_PERIODS'));
 const ledger=load([row({period:{start_date:'2026-10-01',end_date:'2026-10-01'}}),row({record_id:'metric-day-3',period:{start_date:'2026-10-03',end_date:'2026-10-03'}})]);
 const group=buildAiSalesPerformanceReport(ledger,scope({period:{start_date:'2026-10-01',end_date:'2026-10-03'}})).groups[0];assert.equal(group.roas_micros,null);assert.ok(group.pending.includes('PERIOD_COVERAGE_INCOMPLETE'));
 const crossing=buildAiSalesPerformanceReport(load([row()]),scope({period:{start_date:'2026-10-01',end_date:'2026-10-05'}}));assert.equal(crossing.excluded_partial_period_records,1);assert.deepEqual(crossing.groups,[]);
});
test('store, provider, source, currency and record kind stay separate; comparisons require the same product and campaign',()=>{
 const otherShop=row({shop_ref:'other-shop',product_ref:'SHOPEE_BR:other-shop:p001:v001',source_evidence:evidence({shop_ref:'other-shop'})});
 const otherProvider=row({provider:'TIKTOK_SHOP_BR',product_ref:'TIKTOK_SHOP_BR:shop-test:p001:v001',source_evidence:evidence({marketplace:'TIKTOK_SHOP_BR'})});
 const a=row(),b=row({record_id:'metric-b',creative_ref:'creative-b',clicks:200,attributed_orders:40,sales_cents:120000}),differentProduct=row({record_id:'metric-c',creative_ref:'creative-c',product_ref:'SHOPEE_BR:shop-test:p002:v002'});
 const result=report([a,b,differentProduct,otherShop,otherProvider]);
 assert.equal(result.groups.length,3);assert.equal(result.comparisons.length,1);assert.equal(result.comparisons[0].roas_delta_micros,1000000);assert.equal(result.comparisons[0].conversion_delta_bps,-1000);assert.equal(result.comparisons[0].proven_winner,null);
 assert.ok(result.groups.every(group=>group.product_ref.startsWith('SHOPEE_BR:shop-test:')));
});
test('closed records reject PII extras, getter/sparse inputs, invalid money and unsafe sums; normalized CSV round trips',()=>{
 for(const patch of [{buyer_email:'not-accepted'},{sales_cents:1.1},{adjustment_cents:-0},{observed_at:at-1,source_evidence:evidence()},{currency:'USD'}])assert.throws(()=>validateAiSalesManualPerformanceRecord(row(patch)),/AI_SALES_/);
 const getter=row();Object.defineProperty(getter,'sales_cents',{enumerable:true,get(){throw Error('must not execute getter');}});assert.throws(()=>validateAiSalesManualPerformanceRecord(getter),/RECORD_INVALID/);
 const sparse=createAiSalesPerformanceLedger();assert.throws(()=>validateAiSalesPerformanceLedger({...sparse,records:Array(1)}),/AI_SALES_/);
 const ledger=load([row()]),csv=exportAiSalesPerformance(ledger,{format:'csv'}),roundtrip=importAiSalesPerformance(createAiSalesPerformanceLedger(),csv,{format:'csv',imported_at:at}).ledger;
 assert.equal(ledger.records[0].source_evidence.status,'DECLARED','a file cannot grant itself provider-verified evidence');
 assert.equal(ledger.records[0].source_evidence.source,'OPERATOR_IMPORTED');assert.equal(ledger.records[0].source,'OFFICIAL_REPORT','the named report source remains separate from import provenance');
 assert.deepEqual(roundtrip.records,ledger.records);assert.equal(roundtrip.records[0].adjustment_cents,-1000);
 assert.throws(()=>importAiSalesPerformance(createAiSalesPerformanceLedger(),csv.replace('100000','=1+2'),{format:'csv',imported_at:at}),/INTEGER_INVALID/);
 const unsafe=report([row({record_id:'day-a',sales_cents:Number.MAX_SAFE_INTEGER,period:{start_date:'2026-10-01',end_date:'2026-10-15'}}),row({record_id:'day-b',sales_cents:Number.MAX_SAFE_INTEGER,period:{start_date:'2026-10-16',end_date:'2026-10-30'}})]).groups[0];
 assert.equal(unsafe.observed.sales_cents,null);assert.equal(unsafe.contribution_estimate_cents,null);assert.ok(unsafe.pending.includes('ARITHMETIC_UNSAFE'));
});
test('a crossing-period record for the same creative prevents a complete-looking subset from recommending a performer',()=>{
 const contained=row({period:{start_date:'2026-10-01',end_date:'2026-10-10'}}),crossing=row({record_id:'crossing',period:{start_date:'2026-09-30',end_date:'2026-10-02'}});
 const result=buildAiSalesPerformanceReport(load([contained,crossing]),scope({period:{start_date:'2026-10-01',end_date:'2026-10-10'}}));
 assert.equal(result.groups[0].roas_micros,null);assert.equal(result.groups[0].sample_sufficient,false);assert.ok(result.groups[0].pending.includes('RECORD_PERIOD_CROSSES_SELECTION'));assert.equal(result.recommendations[0].code,'VERIFY_SOURCE_AND_COSTS');
});
