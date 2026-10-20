import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStoreProductSummary} from '../src/store-product-summary.mjs';
import {StoreSummaryError} from '../src/store-summary.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';

const runId='a'.repeat(8)+'-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const kit=(model_id='1',male_size='M',female_size='G1')=>({item_id:'101',model_id,male_size,female_size,selling_unit:'ONE_MALE_ONE_FEMALE_KIT',operator_confirmed:true});
const single=(item_id='201',model_id='0',size='P')=>({item_id,model_id,size,selling_unit:'SINGLE_GARMENT',operator_confirmed:true});
const bindings=rows=>({revision:7,bindings:rows||[kit(),kit('2','P','GG'),single()]});
const costs=values=>({revision:4,values:{...COST_DEFAULTS,components:[],...values}});
const product=(item_id,exclusive_payout_raw,changes={})=>({item_id,order_count:1,exclusive_order_count:1,mixed_order_count:0,exclusive_payout_raw,returns_orders:0,...changes});
const frame=changes=>({schema:'finance_store_period_v1',run_id:runId,revision:3,status:'COMPLETE',
 start_date:'2026-10-13',end_date:'2026-10-20',cutoff_at:1792510000,checked_at:1792510100,
 currency:'BRL',monetary_unit:'UNCONFIRMED',order_count:2,pages_read:1,duplicate_orders:0,returns_orders:0,
 escrow_amount_raw:'270.3',ads_recharge_or_support_raw:'0',
 items:[{item_id:'101',model_id:'1',quantity:3},{item_id:'101',model_id:'2',quantity:1},{item_id:'201',model_id:'0',quantity:2}],diagnostic:null,
 product_breakdown:{schema:'store_product_breakdown_v1',exclusive_order_count:2,mixed_order_count:0,
  exclusive_payout_raw:'270.3',mixed_payout_raw:'0',products:[product('101','200.1'),product('201','70.2')]},...changes});
const one=(raw='50',changes={})=>frame({order_count:1,items:[{item_id:'201',model_id:'0',quantity:2}],escrow_amount_raw:raw,
 product_breakdown:{schema:'store_product_breakdown_v1',exclusive_order_count:1,mixed_order_count:0,
  exclusive_payout_raw:raw,mixed_payout_raw:'0',products:[product('201',raw)]},...changes});
const mixed=changes=>frame({order_count:3,escrow_amount_raw:'350.3',
 product_breakdown:{schema:'store_product_breakdown_v1',exclusive_order_count:2,mixed_order_count:1,
  exclusive_payout_raw:'270.3',mixed_payout_raw:'80',products:[product('101','200.1',{order_count:2,mixed_order_count:1}),product('201','70.2',{order_count:2,mixed_order_count:1})]},...changes});
const report=(source=frame(),mapped=bindings(),cfg=costs())=>buildStoreProductSummary(source,mapped,cfg);

test('single-product orders attribute the whole repass by product even across several models, with actual one/two-piece standard costs',()=>{
 const value=report();
 assert.deepEqual(Object.keys(value),['schema','run_id','revision','start_date','end_date','complete','currency','bindings_revision','costs_revision','exclusive_order_count','mixed_order_count','exclusive_payout_cents','mixed_payout_cents','products']);
 assert.equal(value.schema,'store_product_result_v1');assert.equal(value.run_id,runId);assert.equal(value.complete,true);
 assert.equal(value.bindings_revision,7);assert.equal(value.costs_revision,4);assert.equal(value.exclusive_payout_cents,27030);assert.equal(value.mixed_payout_cents,0);
 const [kitResult,garment]=value.products;
 assert.equal(kitResult.quantity,4);assert.equal(kitResult.expected_repass_cents,20010);assert.equal(kitResult.production_cost_cents,13620);assert.equal(kitResult.expected_after_production_cents,6390);
 assert.equal(garment.quantity,2);assert.equal(garment.expected_repass_cents,7020);assert.equal(garment.production_cost_cents,3180);assert.equal(garment.expected_after_production_cents,3840);
 for(const row of value.products){assert.equal(row.net_profit_cents,null);assert.deepEqual(row.pending,['SETTLEMENT_NOT_RECONCILED']);}
});

test('mixed orders preserve identified exclusive subsets but never subtract all product costs from a partial repass',()=>{
 const value=report(mixed());assert.equal(value.exclusive_order_count,2);assert.equal(value.mixed_order_count,1);
 assert.equal(value.exclusive_payout_cents,27030);assert.equal(value.mixed_payout_cents,8000);
 assert.deepEqual(value.products.map(row=>row.known_exclusive_payout_cents),[20010,7020]);
 assert.deepEqual(value.products.map(row=>row.production_cost_cents),[13620,3180]);
 for(const row of value.products){assert.equal(row.expected_repass_cents,null);assert.equal(row.expected_after_production_cents,null);assert.equal(row.order_count,2);assert.equal(row.exclusive_order_count,1);assert.equal(row.mixed_order_count,1);assert.ok(row.pending.includes('MIXED_PRODUCT_ORDERS'));assert.equal(row.net_profit_cents,null);}
 assert.equal(value.products.reduce((sum,row)=>sum+row.order_count,0),4); // Product order participation overlaps; store unique count is three.
});

test('running, limited and diagnostic cohorts keep only known collected subsets instead of full-period product totals',()=>{
 for(const change of [{status:'RUNNING'},{status:'LIMIT_REACHED',pages_read:200},{status:'RUNNING',diagnostic:'STORE_PERIOD_UPSTREAM_UNAVAILABLE'}]){
  const value=report(frame(change));assert.equal(value.complete,false);assert.equal(value.exclusive_payout_cents,null);assert.equal(value.mixed_payout_cents,null);
  for(const row of value.products){assert.notEqual(row.known_exclusive_payout_cents,null);assert.notEqual(row.known_production_cost_cents,null);for(const key of ['expected_repass_cents','production_cost_cents','expected_after_production_cents','net_profit_cents'])assert.equal(row[key],null,key);assert.ok(row.pending.includes(change.status==='LIMIT_REACHED'?'PERIOD_LIMIT_REACHED':'COLLECTING'));if(change.diagnostic)assert.ok(row.pending.includes('PERIOD_DIAGNOSTIC'));}
 }
});

test('missing model mappings leave repass independent and expose a known production subset without pretending to know total cost',()=>{
 const value=report(frame(),bindings([kit(),single()])),[kitResult,garment]=value.products;
 assert.equal(kitResult.expected_repass_cents,20010);assert.equal(kitResult.known_production_cost_cents,10440);assert.equal(kitResult.production_cost_cents,null);assert.equal(kitResult.expected_after_production_cents,null);assert.ok(kitResult.pending.includes('PRODUCTION_COST_INCOMPLETE'));
 assert.equal(garment.expected_after_production_cents,3840);
});

test('missing and exact sub-cent Payment amounts remain unknown while zero, cents and negative expected balances stay exact',()=>{
 for(const raw of [null,'50.001','1000000000001']){
  const value=report(one(raw));assert.equal(value.exclusive_payout_cents,null);const row=value.products[0];assert.equal(row.known_exclusive_payout_cents,null);assert.equal(row.expected_repass_cents,null);assert.equal(row.production_cost_cents,3180);assert.equal(row.expected_after_production_cents,null);assert.ok(row.pending.includes('MONEY_UNAVAILABLE'));
 }
 for(const [raw,cents] of [['0',0],['0.01',1],['0.1',10],['-0.01',-1],['-80.5',-8050],['999999999999.99',99999999999999]]){
  const row=report(one(raw)).products[0];assert.equal(row.expected_repass_cents,cents);assert.equal(row.expected_after_production_cents,cents-3180);assert.equal(row.net_profit_cents,null);
 }
});

test('unknown or present returns add a reconciliation pending state without calling a forecast settled profit',()=>{
 for(const returns_orders of [null,1]){
  const source=one('50',{returns_orders});source.product_breakdown.products[0].returns_orders=returns_orders;
  const row=report(source).products[0];assert.equal(row.returns_orders,returns_orders);assert.equal(row.expected_repass_cents,5000);assert.equal(row.expected_after_production_cents,1820);assert.equal(row.net_profit_cents,null);assert.ok(row.pending.includes('RETURNS_NOT_RECONCILED'));assert.ok(row.pending.includes('SETTLEMENT_NOT_RECONCILED'));
 }
});

test('empty complete source reports explicit zero with no product rows; older valid frames without breakdown remain compatible',()=>{
 const empty=frame({order_count:0,items:[],escrow_amount_raw:'0',product_breakdown:{schema:'store_product_breakdown_v1',exclusive_order_count:0,mixed_order_count:0,exclusive_payout_raw:'0',mixed_payout_raw:'0',products:[]}}),value=report(empty,bindings([]));
 assert.deepEqual(value.products,[]);assert.equal(value.exclusive_payout_cents,0);assert.equal(value.mixed_payout_cents,0);
 const legacy=frame();delete legacy.product_breakdown;assert.equal(buildStoreProductSummary(legacy,null,null),null);
});

test('current itemized profiles count per-piece components once for singles and twice for kits, with per-kit charges limited to kits',()=>{
 const cfg=costs({mode:'itemized',base_regular_cents:1000,base_plus_cents:1400,components:[{id:'print',label:'Estampa',basis:'per_piece',amount_cents:150},{id:'pack',label:'Embalagem',basis:'per_kit',amount_cents:100}]}),value=report(frame(),bindings(),cfg);
 assert.deepEqual(value.products.map(row=>row.production_cost_cents),[10800,2300]);
 assert.deepEqual(value.products.map(row=>row.expected_after_production_cents),[9210,4720]);
});

test('unsafe cost arithmetic fails closed and an unsafe negative balance remains unknown rather than imprecise',()=>{
 const huge=one('50');huge.items[0].quantity=1000000000000;
 assert.throws(()=>report(huge,bindings([single()]),costs({inclusive_regular_cents:1000000})),error=>error instanceof StoreSummaryError&&error.message==='STORE_PRODUCT_COST_INVALID');
 const negative=one('-1000000000000');negative.items[0].quantity=9007199254;
 const row=report(negative,bindings([single()]),costs({inclusive_regular_cents:1000000})).products[0];assert.equal(row.expected_after_production_cents,null);assert.ok(row.pending.includes('MONEY_UNAVAILABLE'));assert.equal(row.net_profit_cents,null);
});

test('poisoned financial frames or cost state cannot create plausible product balances',()=>{
 for(const source of [frame({private_order_sn:'PRIVATE'}),frame({escrow_amount_raw:'270.30'}),frame({product_breakdown:{}})])assert.throws(()=>report(source),error=>error instanceof StoreSummaryError&&error.message==='STORE_PRODUCT_FRAME_INVALID');
 assert.throws(()=>report(frame(),bindings(),costs({inclusive_regular_cents:-1})),error=>error instanceof StoreSummaryError&&error.message==='STORE_PRODUCT_COST_INVALID');
 const wrong=frame();wrong.product_breakdown.products[0].item_id='999';assert.throws(()=>report(wrong),StoreSummaryError);
});

test('no source data, cost profile, saved mappings or policy objects are mutated or exposed through returned lists',()=>{
 const source=mixed(),mapped=bindings(),cfg=costs(),before=structuredClone({source,mapped,cfg}),value=report(source,mapped,cfg);
 value.products[0].pending.push('CALLER_CHANGED');value.products[0].quantity=999;value.products.push({item_id:'PRIVATE'});
 assert.deepEqual({source,mapped,cfg},before);assert.equal(Object.hasOwn(value,'ads_spend_cents'),false);assert.equal(Object.hasOwn(value,'legacy_margin_cents'),false);
});
