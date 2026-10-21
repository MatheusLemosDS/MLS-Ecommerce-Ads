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
const taxRaw=cents=>{
 const value=BigInt(cents),whole=value/100n,fraction=(value%100n).toString().padStart(2,'0').replace(/0+$/,'');
 return String(whole)+(fraction?'.'+fraction:'');
};
// Each fixture order has a goods base of R$100.25 and already-rounded tax
// of R$2.01. The product summary must preserve those imported amounts.
const withTax=(source=frame(),{invoice={},allocation={}}={})=>{
 const breakdown=source.product_breakdown,total=source.order_count;
 return {...source,invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,
  basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',
  covered_orders:total,unavailable_orders:0,known_base_raw:taxRaw(BigInt(total)*10025n),
  known_tax_raw:taxRaw(BigInt(total)*201n),...invoice},
  product_invoice_tax:{schema:'store_product_invoice_tax_v1',exclusive_covered_orders:breakdown.exclusive_order_count,
   mixed_covered_orders:breakdown.mixed_order_count,known_exclusive_tax_raw:taxRaw(BigInt(breakdown.exclusive_order_count)*201n),
   known_mixed_tax_raw:taxRaw(BigInt(breakdown.mixed_order_count)*201n),
   products:breakdown.products.map(row=>({item_id:row.item_id,exclusive_covered_orders:row.exclusive_order_count,
    known_exclusive_tax_raw:taxRaw(BigInt(row.exclusive_order_count)*201n)})),...allocation}};
};

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

test('exclusive product tax follows the whole invoice across models and is deducted once after all production costs',()=>{
 const value=report(withTax()),[kitResult,garment]=value.products;
 assert.deepEqual(value.invoice_tax_allocation,{schema:'store_product_invoice_tax_result_v1',
  exclusive_covered_orders:2,exclusive_unavailable_orders:0,mixed_covered_orders:0,mixed_unavailable_orders:0,
  known_exclusive_tax_cents:402,exclusive_tax_cents:402,known_mixed_tax_cents:0,mixed_tax_cents:0});
 assert.equal(kitResult.quantity,4);assert.equal(kitResult.exclusive_tax_covered_orders,1);
 assert.equal(kitResult.known_exclusive_tax_cents,201);assert.equal(kitResult.invoice_tax_cents,201);
 assert.equal(kitResult.expected_after_production_cents,6390);assert.equal(kitResult.expected_after_production_and_tax_cents,6189);
 assert.equal(garment.invoice_tax_cents,201);assert.equal(garment.expected_after_production_and_tax_cents,3639);
 for(const row of value.products){assert.equal(row.net_profit_cents,null);assert.equal(row.pending.includes('INVOICE_TAX_UNAVAILABLE'),false);}
 assert.equal(Object.hasOwn(value,'ads_spend_cents'),false);
});

test('already-rounded invoice taxes are summed without recomputing tax from a product base or multiplying by units',()=>{
 const source=one('50',{order_count:2});source.product_breakdown.exclusive_order_count=2;
 source.product_breakdown.products[0].order_count=2;source.product_breakdown.products[0].exclusive_order_count=2;
 const value=report(withTax(source,{invoice:{known_base_raw:'0.5',known_tax_raw:'0.02'},
  allocation:{known_exclusive_tax_raw:'0.02',products:[{item_id:'201',exclusive_covered_orders:2,known_exclusive_tax_raw:'0.02'}]}}));
 assert.equal(value.products[0].invoice_tax_cents,2);assert.equal(value.invoice_tax_allocation.exclusive_tax_cents,2);
 assert.equal(value.products[0].expected_after_production_and_tax_cents,1818);
});

test('mixed invoice tax remains unallocated and exclusive subsets do not pay for a whole mixed product cohort',()=>{
 const value=report(withTax(mixed()));
 assert.equal(value.invoice_tax_allocation.exclusive_tax_cents,402);assert.equal(value.invoice_tax_allocation.mixed_tax_cents,201);
 for(const row of value.products){
  assert.equal(row.known_exclusive_tax_cents,201);assert.equal(row.exclusive_tax_covered_orders,1);
  assert.equal(row.invoice_tax_cents,null);assert.equal(row.expected_after_production_and_tax_cents,null);
  assert.ok(row.pending.includes('MIXED_PRODUCT_ORDERS'));assert.ok(row.pending.includes('INVOICE_TAX_UNAVAILABLE'));
 }
 const onlyMixed=frame({order_count:1,escrow_amount_raw:'80',
  product_breakdown:{schema:'store_product_breakdown_v1',exclusive_order_count:0,mixed_order_count:1,
   exclusive_payout_raw:'0',mixed_payout_raw:'80',products:[product('101','0',{exclusive_order_count:0,mixed_order_count:1}),product('201','0',{exclusive_order_count:0,mixed_order_count:1})]}});
 const mixedReport=report(withTax(onlyMixed));assert.equal(mixedReport.invoice_tax_allocation.exclusive_tax_cents,0);
 assert.equal(mixedReport.invoice_tax_allocation.mixed_tax_cents,201);
 for(const row of mixedReport.products){assert.equal(row.known_exclusive_tax_cents,0);assert.equal(row.invoice_tax_cents,null);assert.equal(row.expected_after_production_and_tax_cents,null);}
});

test('one product can have complete tax while another product has an unavailable invoice base',()=>{
 const value=report(withTax(frame(),{invoice:{covered_orders:1,unavailable_orders:1,known_base_raw:'100.25',known_tax_raw:'2.01'},
  allocation:{exclusive_covered_orders:1,known_exclusive_tax_raw:'2.01',products:[
   {item_id:'101',exclusive_covered_orders:1,known_exclusive_tax_raw:'2.01'},
   {item_id:'201',exclusive_covered_orders:0,known_exclusive_tax_raw:'0'}]}}));
 assert.equal(value.invoice_tax_allocation.exclusive_tax_cents,null);assert.equal(value.invoice_tax_allocation.known_exclusive_tax_cents,201);
 assert.equal(value.invoice_tax_allocation.exclusive_unavailable_orders,1);
 assert.equal(value.products[0].invoice_tax_cents,201);assert.equal(value.products[0].expected_after_production_and_tax_cents,6189);
 assert.equal(value.products[1].known_exclusive_tax_cents,0);assert.equal(value.products[1].invoice_tax_cents,null);
 assert.equal(value.products[1].expected_after_production_and_tax_cents,null);assert.ok(value.products[1].pending.includes('INVOICE_TAX_UNAVAILABLE'));
});

test('partial cohorts retain known invoice subsets without promoting them to full product tax or balance totals',()=>{
 for(const change of [{status:'RUNNING'},{status:'LIMIT_REACHED',pages_read:200},{status:'RUNNING',diagnostic:'STORE_PERIOD_UPSTREAM_UNAVAILABLE'}]){
  const value=report(withTax(frame(change)));assert.equal(value.invoice_tax_allocation.known_exclusive_tax_cents,402);
  assert.equal(value.invoice_tax_allocation.exclusive_tax_cents,null);assert.equal(value.invoice_tax_allocation.mixed_tax_cents,null);
  for(const row of value.products){assert.equal(row.known_exclusive_tax_cents,201);assert.equal(row.invoice_tax_cents,null);assert.equal(row.expected_after_production_and_tax_cents,null);assert.ok(row.pending.includes('INVOICE_TAX_UNAVAILABLE'));}
 }
});

test('tax availability is independent of payout, mappings and returns, while balances keep their existing prerequisites',()=>{
 const noMoney=report(withTax(one(null))).products[0];assert.equal(noMoney.invoice_tax_cents,201);
 assert.equal(noMoney.expected_after_production_and_tax_cents,null);assert.ok(noMoney.pending.includes('MONEY_UNAVAILABLE'));
 const noCost=report(withTax(),bindings([single()]));assert.equal(noCost.products[0].invoice_tax_cents,201);
 assert.equal(noCost.products[0].expected_after_production_and_tax_cents,null);assert.ok(noCost.products[0].pending.includes('PRODUCTION_COST_INCOMPLETE'));
 const returned=one('50',{returns_orders:1});returned.product_breakdown.products[0].returns_orders=1;
 const value=report(withTax(returned)).products[0];assert.equal(value.invoice_tax_cents,201);
 assert.equal(value.expected_after_production_and_tax_cents,1619);assert.equal(value.net_profit_cents,null);
 assert.ok(value.pending.includes('RETURNS_NOT_RECONCILED'));assert.ok(value.pending.includes('SETTLEMENT_NOT_RECONCILED'));
});

test('explicit zero invoice tax is known and negative after-tax balances remain exact instead of being clamped',()=>{
 const zero=report(withTax(one('50'),{invoice:{known_base_raw:'0',known_tax_raw:'0'},
  allocation:{known_exclusive_tax_raw:'0',products:[{item_id:'201',exclusive_covered_orders:1,known_exclusive_tax_raw:'0'}]}})).products[0];
 assert.equal(zero.invoice_tax_cents,0);assert.equal(zero.expected_after_production_and_tax_cents,1820);
 const loss=report(withTax(one('0'))).products[0];assert.equal(loss.invoice_tax_cents,201);
 assert.equal(loss.expected_after_production_and_tax_cents,-3381);assert.equal(loss.net_profit_cents,null);
});

test('invoice tax outside the monetary projection bound remains unknown instead of being rounded into a plausible product balance',()=>{
 const source=one('50',{order_count:100,pages_read:20});source.items[0].quantity=100;
 source.product_breakdown.exclusive_order_count=100;source.product_breakdown.products[0].order_count=100;
 source.product_breakdown.products[0].exclusive_order_count=100;
 const value=report(withTax(source,{invoice:{known_base_raw:'100000000000000',known_tax_raw:'2000000000000'},
  allocation:{known_exclusive_tax_raw:'2000000000000',products:[{item_id:'201',exclusive_covered_orders:100,known_exclusive_tax_raw:'2000000000000'}]}}));
 assert.equal(value.invoice_tax_allocation.known_exclusive_tax_cents,null);assert.equal(value.invoice_tax_allocation.exclusive_tax_cents,null);
 assert.equal(value.products[0].known_exclusive_tax_cents,null);assert.equal(value.products[0].invoice_tax_cents,null);
 assert.equal(value.products[0].expected_after_production_and_tax_cents,null);assert.ok(value.products[0].pending.includes('INVOICE_TAX_UNAVAILABLE'));
});

test('legacy product summaries keep their serialized shape when global tax exists without a product allocation',()=>{
 const source=withTax(),withGlobalOnly=structuredClone(source);delete withGlobalOnly.product_invoice_tax;
 assert.equal(JSON.stringify(report(frame())),JSON.stringify(report(withGlobalOnly)));
 const empty=frame({order_count:0,items:[],escrow_amount_raw:'0',product_breakdown:{schema:'store_product_breakdown_v1',exclusive_order_count:0,mixed_order_count:0,exclusive_payout_raw:'0',mixed_payout_raw:'0',products:[]}});
 const value=report(withTax(empty),bindings([]));assert.deepEqual(value.products,[]);
 assert.equal(value.invoice_tax_allocation.exclusive_tax_cents,0);assert.equal(value.invoice_tax_allocation.mixed_tax_cents,0);
 const before=structuredClone(source),projection=report(source);projection.invoice_tax_allocation.known_exclusive_tax_cents=999;
 projection.products[0].invoice_tax_cents=999;assert.deepEqual(source,before);
});

test('invalid product invoice allocation identities, coverage, sums and private extras fail before a product result can be built',()=>{
 const invalid=[
  source=>{source.product_invoice_tax.products[0].item_id='999';},
  source=>{source.product_invoice_tax.exclusive_covered_orders=1;},
  source=>{source.product_invoice_tax.known_mixed_tax_raw='0.01';},
  source=>{source.product_invoice_tax.products[0].known_exclusive_tax_raw='2.001';},
  source=>{source.product_invoice_tax.products[0].exclusive_covered_orders=2;},
  source=>{source.product_invoice_tax.order_sn='PRIVATE_ORDER';},
  source=>{delete source.invoice_tax;},
 ];
 for(const mutate of invalid){const source=withTax();mutate(source);assert.throws(()=>report(source),error=>error instanceof StoreSummaryError&&error.message==='STORE_PRODUCT_FRAME_INVALID');}
});
