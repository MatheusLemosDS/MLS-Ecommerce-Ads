import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStoreSummary,validateStoreAdjustments,StoreSummaryError} from '../src/store-summary.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';

const runId='a'.repeat(8)+'-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const frame=changes=>({schema:'finance_store_period_v1',run_id:runId,revision:3,status:'COMPLETE',
 start_date:'2026-10-13',end_date:'2026-10-20',cutoff_at:1792510000,checked_at:1792510100,
 currency:'BRL',monetary_unit:'UNCONFIRMED',order_count:2,pages_read:1,duplicate_orders:0,returns_orders:0,
 escrow_amount_raw:'150.25',ads_recharge_or_support_raw:'0',items:[{item_id:'101',model_id:'1',quantity:1},{item_id:'201',model_id:'0',quantity:2}],diagnostic:null,...changes});
const kit={item_id:'101',model_id:'1',male_size:'M',female_size:'G1',selling_unit:'ONE_MALE_ONE_FEMALE_KIT',operator_confirmed:true};
const garment={item_id:'201',model_id:'0',size:'P',selling_unit:'SINGLE_GARMENT',operator_confirmed:false,source:'CATALOG_SIZE_AXIS',catalog_fingerprint:'a'.repeat(64)};
const bindings=rows=>({revision:7,bindings:rows||[kit,garment]});
const costs=()=>({revision:4,values:{...COST_DEFAULTS,components:[]}});
const adjustments=changes=>({ads_spend_cents:1000,external_expenses_cents:250,recharge_treatment:'UNCONFIRMED',...changes});
const summary=(changes={},bindingRows,declared=adjustments())=>buildStoreSummary(frame(changes),bindings(bindingRows),costs(),declared);
const has=(actual,...codes)=>{for(const code of codes)assert.ok(actual.pending.includes(code),code);};

test('whole completed cohort uses actual expected repass and one-piece/two-piece costs, never legacy kit margins',()=>{
 const value=summary();
 assert.equal(value.complete,true);assert.equal(value.expected_repass_cents,15025);assert.equal(value.production_cost_cents,6660);
 assert.equal(value.known_production_cost_cents,6660);assert.equal(value.expected_after_production_cents,8365);assert.equal(value.net_estimate_cents,7115);
 assert.equal(value.net_profit_cents,null);assert.deepEqual(value.pending,['SETTLEMENT_NOT_RECONCILED']);assert.deepEqual(value.unmapped_variants,[]);
 assert.equal(value.bindings_revision,7);assert.equal(value.costs_revision,4);assert.equal(value.net_basis,'EXPECTED_REPASS_CURRENT_STANDARD_COSTS_NOT_SETTLED');
 assert.equal(value.unit_confirmation,'OPERATOR_CONFIRMED_BRL_2026_10_20');
});

test('running, limited and diagnostic cohorts expose only known collected subtotals and never period totals',()=>{
 for(const change of [{status:'RUNNING'},{status:'LIMIT_REACHED',pages_read:200},{status:'RUNNING',diagnostic:'STORE_PERIOD_UPSTREAM_UNAVAILABLE'}]){
  const value=summary(change);assert.equal(value.complete,false);assert.equal(value.known_expected_repass_cents,15025);assert.equal(value.known_production_cost_cents,6660);
  for(const key of ['expected_repass_cents','production_cost_cents','expected_after_production_cents','ads_recharge_or_support_cents','net_estimate_cents','net_profit_cents'])assert.equal(value[key],null,key);
  has(value,change.status==='LIMIT_REACHED'?'PERIOD_LIMIT_REACHED':'COLLECTING','SETTLEMENT_NOT_RECONCILED');if(change.diagnostic)has(value,'PERIOD_DIAGNOSTIC');
 }
});

test('missing mappings leave expected repass known while production total and estimates stay unknown',()=>{
 const value=summary({},[kit]);assert.equal(value.expected_repass_cents,15025);assert.equal(value.known_production_cost_cents,3480);assert.equal(value.production_cost_cents,null);
 assert.equal(value.expected_after_production_cents,null);assert.equal(value.net_estimate_cents,null);has(value,'PRODUCTION_COST_INCOMPLETE');
 assert.deepEqual(value.unmapped_variants,[{item_id:'201',model_id:'0',quantity:2}]);
});

test('missing and sub-cent monetary amounts are unknown instead of zero or rounded',()=>{
 for(const raw of [null,'50.001','1000000000001','1000000000000.01','-1000000000000.01']){
  const value=summary({escrow_amount_raw:raw});assert.equal(value.known_expected_repass_cents,null);assert.equal(value.expected_repass_cents,null);
  assert.equal(value.production_cost_cents,6660);assert.equal(value.expected_after_production_cents,null);assert.equal(value.net_estimate_cents,null);has(value,'MONEY_UNAVAILABLE');
 }
 const exact=summary({escrow_amount_raw:'1000000000000'});assert.equal(exact.expected_repass_cents,100000000000000);assert.equal(exact.expected_after_production_cents,99999999993340);
});

test('noncanonical, exponent, non-string and unsupported values cannot enter a summary through the strict frame',()=>{
 for(const raw of ['01','+1',' 1','1 ','1.','1e2','NaN','Infinity','-0','50.00','50.0','9007199254740991',50,Infinity]){
  assert.throws(()=>summary({escrow_amount_raw:raw}),error=>error instanceof StoreSummaryError&&error.message==='STORE_SUMMARY_FRAME_INVALID',String(raw));
 }
});

test('exact canonical cents preserve decimals, negative payout and genuine zero without floating rounding',()=>{
 for(const [raw,cents] of [['0',0],['0.01',1],['0.1',10],['1.23',123],['-0.01',-1],['-80.5',-8050],['999999999999.99',99999999999999]]){
  const value=summary({escrow_amount_raw:raw});assert.equal(value.expected_repass_cents,cents);assert.equal(value.expected_after_production_cents,cents-6660);
 }
 const negative=summary({escrow_amount_raw:'1'});assert.equal(negative.net_estimate_cents,-7810);assert.equal(negative.net_profit_cents,null);
});

test('a genuine empty completed cohort is zero with explicit zero expenses, while absent declarations remain unknown',()=>{
 const empty={order_count:0,items:[],escrow_amount_raw:'0',ads_recharge_or_support_raw:'0'};
 const value=summary(empty,[],adjustments({ads_spend_cents:0,external_expenses_cents:0}));
 assert.equal(value.expected_repass_cents,0);assert.equal(value.production_cost_cents,0);assert.equal(value.expected_after_production_cents,0);assert.equal(value.net_estimate_cents,0);assert.equal(value.net_profit_cents,null);
 const undeclared=summary(empty,[],null);assert.equal(undeclared.net_estimate_cents,null);has(undeclared,'ADJUSTMENTS_REQUIRED');
});

test('already-net Shopee fees are not subtracted a second time and the original-cost field cannot replace manufacturing costs',()=>{
 const value=summary({escrow_amount_raw:'100'});assert.equal(value.expected_after_production_cents,3340);
 for(const field of ['commission_fee','service_fee','original_cost_of_goods_sold','legacy_kit_margin'])assert.throws(()=>summary({[field]:999999}),StoreSummaryError);
});

test('recharge and technical support interpretations have different explicit add-back behavior',()=>{
 const raw={escrow_amount_raw:'100',ads_recharge_or_support_raw:'20'};
 const unknown=summary(raw);assert.equal(unknown.expected_after_production_cents,3340);assert.equal(unknown.net_estimate_cents,null);has(unknown,'RECHARGE_TREATMENT_REQUIRED');
 const recharge=summary(raw,undefined,adjustments({recharge_treatment:'ADS_RECHARGE'}));assert.equal(recharge.net_estimate_cents,4090);
 const support=summary(raw,undefined,adjustments({recharge_treatment:'TECH_SUPPORT'}));assert.equal(support.net_estimate_cents,2090);
 assert.equal(recharge.ads_recharge_or_support_cents,2000);assert.equal(support.ads_recharge_or_support_cents,2000);
 const zero=summary({ads_recharge_or_support_raw:'0'});assert.equal(zero.net_estimate_cents,7115);assert.ok(!zero.pending.includes('RECHARGE_TREATMENT_REQUIRED'));
});

test('unknown, negative or sub-cent combined components block net estimates without discarding independent repass/cost totals',()=>{
 for(const raw of [null,'-1','1.001']){
  const value=summary({ads_recharge_or_support_raw:raw},undefined,adjustments({recharge_treatment:'ADS_RECHARGE'}));
  assert.equal(value.expected_repass_cents,15025);assert.equal(value.production_cost_cents,6660);assert.equal(value.net_estimate_cents,null);has(value,'RECHARGE_COMPONENT_UNAVAILABLE');
 }
});

test('unknown or present returns preserve expected references but block the purported net estimate',()=>{
 for(const returns_orders of [null,1,2]){
  const value=summary({returns_orders});assert.equal(value.expected_after_production_cents,8365);assert.equal(value.net_estimate_cents,null);assert.equal(value.net_profit_cents,null);has(value,'RETURNS_NOT_RECONCILED');
 }
});

test('adjustments are explicit nonnegative safe integer cents with a fixed treatment and detached copies',()=>{
 const input=adjustments(),copy=validateStoreAdjustments(input);assert.deepEqual(copy,input);copy.ads_spend_cents=0;assert.equal(input.ads_spend_cents,1000);
 for(const value of [null,[],{},adjustments({extra:1}),adjustments({ads_spend_cents:-1}),adjustments({external_expenses_cents:0.1}),adjustments({ads_spend_cents:'0'}),adjustments({ads_spend_cents:Number.MAX_SAFE_INTEGER+1}),adjustments({recharge_treatment:'AUTO'}),adjustments({external_expenses_cents:NaN})])assert.throws(()=>validateStoreAdjustments(value),error=>error instanceof StoreSummaryError&&error.message==='STORE_ADJUSTMENTS_INVALID');
 let reads=0;const getter=adjustments();Object.defineProperty(getter,'ads_spend_cents',{get(){reads++;return 0;}});assert.throws(()=>validateStoreAdjustments(getter),StoreSummaryError);assert.equal(reads,0);
});

test('unsafe final arithmetic never produces an imprecise number and a negative estimate remains legitimate',()=>{
 const value=summary({},undefined,adjustments({ads_spend_cents:Number.MAX_SAFE_INTEGER,external_expenses_cents:Number.MAX_SAFE_INTEGER}));assert.equal(value.net_estimate_cents,null);has(value,'ARITHMETIC_UNSAFE');
 const loss=summary({},undefined,adjustments({ads_spend_cents:20000,external_expenses_cents:0}));assert.equal(loss.net_estimate_cents,-11635);assert.equal(loss.net_profit_cents,null);
 const unsafeItems=frame({items:[{item_id:'201',model_id:'0',quantity:1000000000000}]}),unsafeCost=costs();unsafeCost.values.inclusive_regular_cents=1000000;assert.throws(()=>buildStoreSummary(unsafeItems,bindings(),unsafeCost,adjustments()),StoreSummaryError);
});

test('inputs are preserved and returned missing variants and lists cannot mutate the original source or policy',()=>{
 const source=frame(),mapped=bindings([kit]),cost=costs(),declared=adjustments(),before=structuredClone({source,mapped,cost,declared});
 const value=buildStoreSummary(source,mapped,cost,declared);value.unmapped_variants[0].quantity=999;value.pending.push('MODIFIED_BY_CALLER');
 assert.deepEqual({source,mapped,cost,declared},before);assert.equal(source.items[1].quantity,2);
});
