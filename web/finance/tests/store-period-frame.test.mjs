import test from 'node:test';
import assert from 'node:assert/strict';
import {projectStorePeriodRequest,projectStorePeriodFrame,normalizeStoreDecimal,addStoreDecimals} from '../src/store-period-frame.mjs';

const run='12345678-1234-4123-8123-123456789abc';
const frame=()=>({schema:'finance_store_period_v1',run_id:run,revision:1,status:'RUNNING',start_date:'2026-10-14',end_date:'2026-10-20',cutoff_at:1792510733,checked_at:1792510733,currency:'BRL',monetary_unit:'UNCONFIRMED',order_count:0,pages_read:0,duplicate_orders:0,returns_orders:0,escrow_amount_raw:'0',ads_recharge_or_support_raw:'0',items:[],diagnostic:null});

test('store request union is exact, calendar-valid and bounded to fifteen inclusive days',()=>{
 assert.deepEqual(projectStorePeriodRequest({operation:'start',start_date:'2026-10-06',end_date:'2026-10-20'}),{operation:'start',start_date:'2026-10-06',end_date:'2026-10-20'});
 for(const operation of ['step','read'])assert.deepEqual(projectStorePeriodRequest({operation,run_id:run}),{operation,run_id:run});
 for(const value of [{operation:'start',start_date:'2026-10-05',end_date:'2026-10-20'},{operation:'start',start_date:'2026-02-30',end_date:'2026-03-01'},{operation:'start',start_date:'2026-10-21',end_date:'2026-10-20'},{operation:'step',run_id:run.toUpperCase()},{operation:'read',run_id:run,order_sn:'PRIVATE_ORDER'},{operation:'step',run_id:run,cursor:'PRIVATE_CURSOR'},null,[]])assert.equal(projectStorePeriodRequest(value),null);
 let getters=0;assert.equal(projectStorePeriodRequest({get operation(){getters++;return 'start';},start_date:'2026-10-20',end_date:'2026-10-20'}),null);assert.equal(getters,0);
});

test('raw decimal normalization and summing use exact integer arithmetic without rounding or binary addition',()=>{
 for(const [input,output] of [[0,'0'],[-0,'0'],[-12.34,'-12.34'],[1e-7,'0.0000001'],[1e12,'1000000000000'],['001.2300','1.23'],['12e2','1200'],['-0.0000','0']])assert.equal(normalizeStoreDecimal(input),output);
 assert.equal(addStoreDecimals(['0.1','0.2','-0.05']),'0.25');assert.equal(addStoreDecimals(['999999999999.999999999999','0.000000000001']),'1000000000000');
 assert.equal(addStoreDecimals([]),'0');
 for(const input of [Infinity,NaN,1e-13,'1.0000000000001',' 1','1 ','1,23','+1','1e999','0x10',{},null])assert.equal(normalizeStoreDecimal(input),null);
 assert.equal(normalizeStoreDecimal(1000000000001,'1000000000000'),null);assert.equal(addStoreDecimals(['1000000000000000','0.1']),null);
});

test('store frame projects independent bounded aggregates while preserving unknown amounts and returns coverage',()=>{
 const empty=frame();assert.deepEqual(projectStorePeriodFrame(empty),empty);
 const value={...frame(),revision:2,status:'COMPLETE',pages_read:1,order_count:2,returns_orders:null,escrow_amount_raw:'123.456',ads_recharge_or_support_raw:null,items:[{item_id:'20',model_id:'0',quantity:3},{item_id:'1',model_id:'1',quantity:2}]};
 const result=projectStorePeriodFrame(value);assert.deepEqual(result.items,[value.items[1],value.items[0]]);assert.equal(result.returns_orders,null);assert.equal(result.ads_recharge_or_support_raw,null);assert.equal(result.escrow_amount_raw,'123.456');
 value.items[0].quantity=50;assert.equal(result.items[1].quantity,3);assert.equal(Object.hasOwn(result,'net_profit_cents'),false);
});

test('store frame refuses extra fields, noncanonical values, unbounded groups and inconsistent coverage',()=>{
 const populated={...frame(),revision:2,pages_read:1,order_count:1,items:[{item_id:'1',model_id:'0',quantity:1}],escrow_amount_raw:null,returns_orders:null};
 for(const value of [{...populated,order_sn:'PRIVATE_ORDER'},{...populated,status:'COMPLETE',diagnostic:'STORE_PERIOD_UPSTREAM_UNAVAILABLE'},{...populated,monetary_unit:'BRL'},{...populated,currency:'USD'},{...populated,returns_orders:2},{...populated,escrow_amount_raw:'1.00'},{...populated,escrow_amount_raw:'1e2'},{...populated,escrow_amount_raw:100},{...populated,items:[...populated.items,...populated.items]},{...populated,items:[{...populated.items[0],buyer:'PRIVATE_BUYER'}]},{...populated,diagnostic:'PRIVATE_ERROR'},{...populated,pages_read:201},{...populated,order_count:1001},{...frame(),status:'COMPLETE'}])assert.equal(projectStorePeriodFrame(value),null,JSON.stringify(value));
 let getters=0;assert.equal(projectStorePeriodFrame({...frame(),get items(){getters++;return [];}}),null);assert.equal(getters,0);
 const sparse=Array(1);assert.equal(projectStorePeriodFrame({...populated,items:sparse}),null);
});

const productFrame=()=>({...frame(),revision:2,status:'COMPLETE',pages_read:1,order_count:3,returns_orders:0,
 escrow_amount_raw:'0.25',ads_recharge_or_support_raw:'0',
 items:[{item_id:'1',model_id:'0',quantity:2},{item_id:'1',model_id:'1',quantity:1},{item_id:'20',model_id:'0',quantity:2}],
 product_breakdown:{schema:'store_product_breakdown_v1',exclusive_order_count:2,mixed_order_count:1,
  exclusive_payout_raw:'0.05',mixed_payout_raw:'0.2',products:[
   {item_id:'20',order_count:2,exclusive_order_count:1,mixed_order_count:1,exclusive_payout_raw:'-0.05',returns_orders:0},
   {item_id:'1',order_count:2,exclusive_order_count:1,mixed_order_count:1,exclusive_payout_raw:'0.1',returns_orders:0},
  ]}});

test('optional product breakdown preserves legacy frames, sorts and clones exact no-rateio aggregates',()=>{
 const legacy=frame();assert.equal(JSON.stringify(projectStorePeriodFrame(legacy)),JSON.stringify(legacy));
 const value=productFrame(),result=projectStorePeriodFrame(value);assert.ok(result);
 assert.deepEqual(result.product_breakdown.products.map(row=>row.item_id),['1','20']);
 assert.equal(result.product_breakdown.exclusive_payout_raw,'0.05');assert.equal(result.product_breakdown.mixed_payout_raw,'0.2');
 assert.equal(result.product_breakdown.products[0].order_count,2);assert.equal(result.order_count,3);
 value.product_breakdown.products[1].exclusive_payout_raw='900';assert.equal(result.product_breakdown.products[0].exclusive_payout_raw,'0.1');
 const empty={...frame(),product_breakdown:{schema:'store_product_breakdown_v1',exclusive_order_count:0,mixed_order_count:0,exclusive_payout_raw:'0',mixed_payout_raw:'0',products:[]}};
 assert.deepEqual(projectStorePeriodFrame(empty),empty);
});

test('product breakdown preserves missing money and returns without turning either into zero',()=>{
 const value=productFrame();value.escrow_amount_raw=null;value.returns_orders=null;
 value.product_breakdown.exclusive_payout_raw=null;value.product_breakdown.products[0].exclusive_payout_raw=null;
 value.product_breakdown.products[0].returns_orders=null;
 const result=projectStorePeriodFrame(value);assert.ok(result);assert.equal(result.product_breakdown.exclusive_payout_raw,null);
 assert.equal(result.product_breakdown.mixed_payout_raw,'0.2');assert.equal(result.product_breakdown.products[0].exclusive_payout_raw,'0.1');
 assert.equal(result.product_breakdown.products[1].returns_orders,null);
 const onlyMixed=productFrame();onlyMixed.order_count=1;onlyMixed.escrow_amount_raw='-0.15';onlyMixed.items=onlyMixed.items.filter(row=>row.model_id==='0').map(row=>({...row,quantity:1}));
 Object.assign(onlyMixed.product_breakdown,{exclusive_order_count:0,mixed_order_count:1,exclusive_payout_raw:'0',mixed_payout_raw:'-0.15'});
 onlyMixed.product_breakdown.products=onlyMixed.product_breakdown.products.map(row=>({...row,order_count:1,exclusive_order_count:0,mixed_order_count:1,exclusive_payout_raw:'0'}));
 assert.ok(projectStorePeriodFrame(onlyMixed));
});

test('product breakdown refuses poisoned identity, overlapping totals, fabricated coverage and private fields',()=>{
 const mutations=[
  value=>value.product_breakdown.order_hash='PRIVATE_HASH',
  value=>value.product_breakdown.products[0].order_sn='PRIVATE_ORDER',
  value=>value.product_breakdown.products.pop(),
  value=>value.product_breakdown.products.push({...value.product_breakdown.products[0]}),
  value=>value.product_breakdown.products[0].item_id='999',
  value=>value.product_breakdown.products[0].item_id='020',
  value=>value.product_breakdown.products[0].order_count=1,
  value=>value.product_breakdown.exclusive_order_count=1,
  value=>value.product_breakdown.mixed_order_count=2,
  value=>value.product_breakdown.products[0].mixed_order_count=0,
  value=>value.product_breakdown.products[0].exclusive_payout_raw='0.1',
  value=>value.product_breakdown.exclusive_payout_raw='0.15',
  value=>value.product_breakdown.mixed_payout_raw='0.3',
  value=>value.product_breakdown.exclusive_payout_raw=null,
  value=>value.escrow_amount_raw=null,
  value=>value.product_breakdown.products[0].exclusive_payout_raw=null,
  value=>value.product_breakdown.products[0].exclusive_payout_raw='-0.050',
  value=>value.product_breakdown.products[0].returns_orders=1,
  value=>value.product_breakdown.products[0].returns_orders=null,
  value=>value.returns_orders=null,
  value=>value.product_breakdown.products=Array(2),
 ];
 for(const mutate of mutations){const value=productFrame();mutate(value);assert.equal(projectStorePeriodFrame(value),null);}
 let getters=0;const value=productFrame();Object.defineProperty(value,'product_breakdown',{get(){getters++;return {};},enumerable:true});
 assert.equal(projectStorePeriodFrame(value),null);assert.equal(getters,0);
});

test('product breakdown supports a thousand bounded products and refuses an additional product',()=>{
 const value={...frame(),revision:2,status:'COMPLETE',pages_read:200,order_count:1000,escrow_amount_raw:'1000000000000000',items:[],product_breakdown:{schema:'store_product_breakdown_v1',exclusive_order_count:1000,mixed_order_count:0,exclusive_payout_raw:'1000000000000000',mixed_payout_raw:'0',products:[]}};
 for(let index=0;index<1000;index++){
  const item_id=String(10000000000000000000n+BigInt(index));
  value.items.push({item_id,model_id:'0',quantity:1});
  value.product_breakdown.products.push({item_id,order_count:1,exclusive_order_count:1,mixed_order_count:0,exclusive_payout_raw:'1000000000000',returns_orders:0});
 }
 assert.ok(projectStorePeriodFrame(value));
 value.product_breakdown.products.push({...value.product_breakdown.products[0],item_id:'99999999999999999999'});
 assert.equal(projectStorePeriodFrame(value),null);
});

const returnsFrame=()=>{
 const value=productFrame();value.returns_orders=null;
 value.product_breakdown.products[0].returns_orders=null;
 value.product_breakdown.products[1].returns_orders=1;
 value.returns_breakdown={schema:'store_returns_breakdown_v1',
  with_return:{order_count:1,payout_raw:'0.2'},without_reported_return:{order_count:1,payout_raw:'0.1'},unknown:{order_count:1,payout_raw:'-0.05'},
  products:[{item_id:'20',order_count:2,with_return_orders:1,without_reported_return_orders:0,unknown_orders:1},
   {item_id:'1',order_count:2,with_return_orders:1,without_reported_return_orders:1,unknown_orders:0}]};
 return value;
};

test('optional return coverage preserves legacy bytes and known occurrences even when another order is unknown',()=>{
 const legacy=projectStorePeriodFrame(productFrame());assert.equal(JSON.stringify(projectStorePeriodFrame(legacy)),JSON.stringify(legacy));
 const value=returnsFrame(),result=projectStorePeriodFrame(value);assert.ok(result);
 assert.equal(result.returns_orders,null);assert.equal(result.returns_breakdown.with_return.order_count,1);
 assert.equal(result.returns_breakdown.unknown.payout_raw,'-0.05');
 assert.deepEqual(result.returns_breakdown.products.map(row=>row.item_id),['1','20']);
 assert.equal(result.returns_breakdown.products.reduce((sum,row)=>sum+row.with_return_orders,0),2);
 assert.equal(result.returns_breakdown.with_return.order_count,1);
 value.returns_breakdown.with_return.payout_raw='999';value.returns_breakdown.products[1].unknown_orders=99;
 assert.equal(result.returns_breakdown.with_return.payout_raw,'0.2');assert.equal(result.returns_breakdown.products[0].unknown_orders,0);
 const withoutProduct=returnsFrame();delete withoutProduct.product_breakdown;assert.ok(projectStorePeriodFrame(withoutProduct));
 const empty={...frame(),returns_breakdown:{schema:'store_returns_breakdown_v1',with_return:{order_count:0,payout_raw:'0'},without_reported_return:{order_count:0,payout_raw:'0'},unknown:{order_count:0,payout_raw:'0'},products:[]}};
 assert.deepEqual(projectStorePeriodFrame(empty),empty);
});

test('return exposure keeps a missing partition amount null while retaining the other known raw payouts',()=>{
 const value=returnsFrame();value.escrow_amount_raw=null;value.product_breakdown.mixed_payout_raw=null;
 value.returns_breakdown.with_return.payout_raw=null;
 const result=projectStorePeriodFrame(value);assert.ok(result);
 assert.equal(result.returns_breakdown.with_return.payout_raw,null);
 assert.equal(result.returns_breakdown.without_reported_return.payout_raw,'0.1');
 assert.equal(result.returns_breakdown.unknown.payout_raw,'-0.05');
 const allKnown=returnsFrame();allKnown.returns_orders=1;
 Object.assign(allKnown.returns_breakdown.without_reported_return,{order_count:2,payout_raw:'0.05'});
 Object.assign(allKnown.returns_breakdown.unknown,{order_count:0,payout_raw:'0'});
 Object.assign(allKnown.returns_breakdown.products[0],{without_reported_return_orders:1,unknown_orders:0});
 allKnown.product_breakdown.products[0].returns_orders=1;
 assert.ok(projectStorePeriodFrame(allKnown));
});

test('return coverage refuses fabricated totals, unknown-to-zero changes, foreign identities and private fields',()=>{
 const mutations=[
  value=>value.returns_breakdown.order_hash='PRIVATE_HASH',
  value=>value.returns_breakdown.with_return.refund_amount='123',
  value=>value.returns_breakdown.products[0].order_sn='PRIVATE_ORDER',
  value=>value.returns_breakdown.with_return.order_count=2,
  value=>value.returns_orders=1,
  value=>value.returns_breakdown.with_return.payout_raw='0.3',
  value=>value.returns_breakdown.with_return.payout_raw='0.20',
  value=>value.returns_breakdown.with_return.payout_raw=null,
  value=>value.escrow_amount_raw=null,
  value=>value.returns_breakdown.products.pop(),
  value=>value.returns_breakdown.products.push({...value.returns_breakdown.products[0]}),
  value=>value.returns_breakdown.products[0].item_id='999',
  value=>value.returns_breakdown.products[0].item_id='020',
  value=>value.returns_breakdown.products[0].unknown_orders=2,
  value=>value.returns_breakdown.products[0].order_count=1,
  value=>value.product_breakdown.products[0].returns_orders=1,
 ];
 for(const mutate of mutations){const value=returnsFrame();mutate(value);assert.equal(projectStorePeriodFrame(value),null);}
 let getters=0;const getter=returnsFrame();Object.defineProperty(getter.returns_breakdown.with_return,'payout_raw',{enumerable:true,get(){getters++;return '0.2';}});
 assert.equal(projectStorePeriodFrame(getter),null);assert.equal(getters,0);
 const sparse=returnsFrame();sparse.returns_breakdown.products=Array(2);assert.equal(projectStorePeriodFrame(sparse),null);
 const empty=frame();empty.returns_breakdown={schema:'store_returns_breakdown_v1',with_return:{order_count:0,payout_raw:null},without_reported_return:{order_count:0,payout_raw:'0'},unknown:{order_count:0,payout_raw:'0'},products:[]};
 assert.equal(projectStorePeriodFrame(empty),null);
 const uncovered=returnsFrame();delete uncovered.product_breakdown;
 uncovered.returns_breakdown.products=uncovered.returns_breakdown.products.map(row=>({...row,with_return_orders:0,without_reported_return_orders:1,unknown_orders:1}));
 assert.equal(projectStorePeriodFrame(uncovered),null);
});

test('return coverage bounds one thousand product memberships and rejects a thousand-and-first product',()=>{
 const value={...frame(),status:'COMPLETE',order_count:1000,pages_read:200,
  items:Array.from({length:1000},(_,index)=>({item_id:String(index+1),model_id:'0',quantity:1})),
  returns_breakdown:{schema:'store_returns_breakdown_v1',with_return:{order_count:0,payout_raw:'0'},
   without_reported_return:{order_count:1000,payout_raw:'0'},unknown:{order_count:0,payout_raw:'0'},
   products:Array.from({length:1000},(_,index)=>({item_id:String(index+1),order_count:1,with_return_orders:0,without_reported_return_orders:1,unknown_orders:0}))}};
 assert.ok(projectStorePeriodFrame(value));
 value.returns_breakdown.products.push({item_id:'1001',order_count:1,with_return_orders:0,without_reported_return_orders:1,unknown_orders:0});
 assert.equal(projectStorePeriodFrame(value),null);
});

const invoiceFrame=()=>({...frame(),status:'COMPLETE',pages_read:1,order_count:3,
 items:[{item_id:'1',model_id:'0',quantity:3}],invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,
  basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:2,unavailable_orders:1,
  known_base_raw:'0.5',known_tax_raw:'0.02'}});

test('optional invoice tax preserves legacy frames and accepts sums of independently rounded invoices without re-rounding',()=>{
 const legacy=projectStorePeriodFrame(returnsFrame());assert.equal(JSON.stringify(projectStorePeriodFrame(legacy)),JSON.stringify(legacy));
 const value=invoiceFrame(),result=projectStorePeriodFrame(value);assert.ok(result);
 assert.equal(result.invoice_tax.known_tax_raw,'0.02');assert.equal(result.invoice_tax.unavailable_orders,1);
 value.invoice_tax.known_base_raw='999';assert.equal(result.invoice_tax.known_base_raw,'0.5');
 const zero={...frame(),invoice_tax:{...invoiceFrame().invoice_tax,covered_orders:0,unavailable_orders:0,known_base_raw:'0',known_tax_raw:'0'}};
 assert.deepEqual(projectStorePeriodFrame(zero),zero);
 const missing=invoiceFrame();Object.assign(missing.invoice_tax,{covered_orders:0,unavailable_orders:3,known_base_raw:'0',known_tax_raw:'0'});assert.ok(projectStorePeriodFrame(missing));
 const threshold=invoiceFrame();threshold.order_count=1;threshold.items[0].quantity=1;
 Object.assign(threshold.invoice_tax,{covered_orders:1,unavailable_orders:0,known_base_raw:'0.25',known_tax_raw:'0.01'});
 assert.ok(projectStorePeriodFrame(threshold));threshold.invoice_tax.known_tax_raw='0';assert.equal(projectStorePeriodFrame(threshold),null);
});

test('invoice tax refuses wrong rate or basis, missing coverage, sub-cent values, impossible totals and private extras',()=>{
 const mutations=[
  value=>value.invoice_tax.rate_bps=2,
  value=>value.invoice_tax.basis='ESCROW_AMOUNT',
  value=>value.invoice_tax.rounding='AGGREGATE_HALF_UP',
  value=>value.invoice_tax.covered_orders=3,
  value=>value.invoice_tax.unavailable_orders=-1,
  value=>value.invoice_tax.known_base_raw=null,
  value=>value.invoice_tax.known_base_raw='-1',
  value=>value.invoice_tax.known_base_raw='0.50',
  value=>value.invoice_tax.known_base_raw='0.501',
  value=>value.invoice_tax.known_base_raw='2000000000000.01',
  value=>value.invoice_tax.known_tax_raw='0.03',
  value=>value.invoice_tax.known_tax_raw='-0.01',
  value=>value.invoice_tax.known_tax_raw='0.021',
  value=>value.invoice_tax.order_hash='PRIVATE_HASH',
 ];
 for(const mutate of mutations){const value=invoiceFrame();mutate(value);assert.equal(projectStorePeriodFrame(value),null);}
 let getters=0;const value=invoiceFrame();Object.defineProperty(value.invoice_tax,'known_base_raw',{enumerable:true,get(){getters++;return '0.5';}});
 assert.equal(projectStorePeriodFrame(value),null);assert.equal(getters,0);
 const fabricated=invoiceFrame();Object.assign(fabricated.invoice_tax,{covered_orders:3,unavailable_orders:0,known_base_raw:'0',known_tax_raw:'0.01'});assert.equal(projectStorePeriodFrame(fabricated),null);
});

test('invoice tax aggregate bounds retain exact cents for one thousand maximum allowed source bases',()=>{
 const value={...invoiceFrame(),order_count:1000,pages_read:200,items:[{item_id:'1',model_id:'0',quantity:1000}],
  invoice_tax:{...invoiceFrame().invoice_tax,covered_orders:1000,unavailable_orders:0,known_base_raw:'1000000000000000',known_tax_raw:'20000000000000'}};
 assert.ok(projectStorePeriodFrame(value));value.invoice_tax.known_base_raw='1000000000000000.01';assert.equal(projectStorePeriodFrame(value),null);
});

const productInvoiceFrame=()=>({...productFrame(),invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,
 basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:3,unavailable_orders:0,
 known_base_raw:'1.25',known_tax_raw:'0.04'},product_invoice_tax:{schema:'store_product_invoice_tax_v1',
 exclusive_covered_orders:2,mixed_covered_orders:1,known_exclusive_tax_raw:'0.02',known_mixed_tax_raw:'0.02',
 products:[{item_id:'20',exclusive_covered_orders:1,known_exclusive_tax_raw:'0.01'},
  {item_id:'1',exclusive_covered_orders:1,known_exclusive_tax_raw:'0.01'}]}});

test('optional product invoice tax preserves legacy bytes and projects independent exclusive and unallocated mixed sums',()=>{
 const legacy=projectStorePeriodFrame(productFrame());assert.equal(JSON.stringify(projectStorePeriodFrame(legacy)),JSON.stringify(legacy));
 const value=productInvoiceFrame(),result=projectStorePeriodFrame(value);assert.ok(result);
 assert.deepEqual(result.product_invoice_tax.products.map(row=>row.item_id),['1','20']);
 assert.equal(result.product_invoice_tax.known_exclusive_tax_raw,'0.02');
 assert.equal(result.product_invoice_tax.known_mixed_tax_raw,'0.02');
 value.product_invoice_tax.products[0].known_exclusive_tax_raw='99';assert.equal(result.product_invoice_tax.products[1].known_exclusive_tax_raw,'0.01');
 for(const key of ['product_breakdown','invoice_tax']){const missing=productInvoiceFrame();delete missing[key];assert.equal(projectStorePeriodFrame(missing),null);}
 const empty={...frame(),product_breakdown:{schema:'store_product_breakdown_v1',exclusive_order_count:0,mixed_order_count:0,exclusive_payout_raw:'0',mixed_payout_raw:'0',products:[]},
  invoice_tax:{...productInvoiceFrame().invoice_tax,covered_orders:0,unavailable_orders:0,known_base_raw:'0',known_tax_raw:'0'},
  product_invoice_tax:{schema:'store_product_invoice_tax_v1',exclusive_covered_orders:0,mixed_covered_orders:0,known_exclusive_tax_raw:'0',known_mixed_tax_raw:'0',products:[]}};
 assert.deepEqual(projectStorePeriodFrame(empty),empty);
});

test('product invoice coverage retains complete individual products when other exclusive or mixed bases are unknown',()=>{
 const value=productInvoiceFrame();Object.assign(value.invoice_tax,{covered_orders:1,unavailable_orders:2,known_base_raw:'0.25',known_tax_raw:'0.01'});
 Object.assign(value.product_invoice_tax,{exclusive_covered_orders:1,mixed_covered_orders:0,known_exclusive_tax_raw:'0.01',known_mixed_tax_raw:'0'});
 Object.assign(value.product_invoice_tax.products[0],{exclusive_covered_orders:0,known_exclusive_tax_raw:'0'});
 const result=projectStorePeriodFrame(value);assert.ok(result);
 assert.equal(result.product_invoice_tax.products[0].exclusive_covered_orders,1);
 assert.equal(result.product_invoice_tax.products[0].known_exclusive_tax_raw,'0.01');
 assert.equal(result.product_invoice_tax.products[1].exclusive_covered_orders,0);
 const mixed=productInvoiceFrame();mixed.order_count=1;mixed.items=mixed.items.filter(row=>row.model_id==='0').map(row=>({...row,quantity:1}));
 Object.assign(mixed.product_breakdown,{exclusive_order_count:0,mixed_order_count:1,exclusive_payout_raw:'0',mixed_payout_raw:'0.25'});
 mixed.product_breakdown.products=mixed.product_breakdown.products.map(row=>({...row,order_count:1,exclusive_order_count:0,mixed_order_count:1,exclusive_payout_raw:'0'}));
 Object.assign(mixed.invoice_tax,{covered_orders:1,unavailable_orders:0,known_base_raw:'0.75',known_tax_raw:'0.02'});
 Object.assign(mixed.product_invoice_tax,{exclusive_covered_orders:0,mixed_covered_orders:1,known_exclusive_tax_raw:'0',known_mixed_tax_raw:'0.02'});
 mixed.product_invoice_tax.products=mixed.product_invoice_tax.products.map(row=>({...row,exclusive_covered_orders:0,known_exclusive_tax_raw:'0'}));
 const resultMixed=projectStorePeriodFrame(mixed);assert.ok(resultMixed);
 assert.equal(resultMixed.product_invoice_tax.known_mixed_tax_raw,'0.02');
 assert.ok(resultMixed.product_invoice_tax.products.every(row=>row.exclusive_covered_orders===0&&row.known_exclusive_tax_raw==='0'));
});

test('product invoice tax refuses fabricated allocations, impossible coverage, noncanonical money and private extras',()=>{
 const mutations=[
  value=>value.product_invoice_tax.schema='store_product_invoice_tax_v2',
  value=>value.product_invoice_tax.order_hash='PRIVATE_HASH',
  value=>value.product_invoice_tax.exclusive_covered_orders=3,
  value=>value.product_invoice_tax.mixed_covered_orders=0,
  value=>value.product_invoice_tax.known_exclusive_tax_raw='0.03',
  value=>value.product_invoice_tax.known_mixed_tax_raw='0.01',
  value=>value.product_invoice_tax.known_exclusive_tax_raw=null,
  value=>value.product_invoice_tax.known_exclusive_tax_raw='-0.01',
  value=>value.product_invoice_tax.known_exclusive_tax_raw='0.020',
  value=>value.product_invoice_tax.known_exclusive_tax_raw='0.021',
  value=>value.product_invoice_tax.products.pop(),
  value=>value.product_invoice_tax.products.push({...value.product_invoice_tax.products[0]}),
  value=>value.product_invoice_tax.products[0].item_id='999',
  value=>value.product_invoice_tax.products[0].item_id='020',
  value=>value.product_invoice_tax.products[0].exclusive_covered_orders=2,
  value=>value.product_invoice_tax.products[0].exclusive_covered_orders='1',
  value=>value.product_invoice_tax.products[0].known_exclusive_tax_raw='0.02',
  value=>value.product_invoice_tax.products[0].known_exclusive_tax_raw='0.011',
  value=>value.product_invoice_tax.products[0].order_sn='PRIVATE_ORDER',
  value=>value.product_invoice_tax.products=Array(2),
 ];
 for(const mutate of mutations){const value=productInvoiceFrame();mutate(value);assert.equal(projectStorePeriodFrame(value),null);}
 let getters=0;const getter=productInvoiceFrame();Object.defineProperty(getter.product_invoice_tax.products[0],'known_exclusive_tax_raw',{enumerable:true,get(){getters++;return '0.01';}});
 assert.equal(projectStorePeriodFrame(getter),null);assert.equal(getters,0);
 const unavailable=productInvoiceFrame();Object.assign(unavailable.invoice_tax,{covered_orders:0,unavailable_orders:3,known_base_raw:'0',known_tax_raw:'0'});
 Object.assign(unavailable.product_invoice_tax,{exclusive_covered_orders:0,mixed_covered_orders:0,known_exclusive_tax_raw:'0.01',known_mixed_tax_raw:'0'});
 unavailable.product_invoice_tax.products=unavailable.product_invoice_tax.products.map(row=>({...row,exclusive_covered_orders:0,known_exclusive_tax_raw:'0'}));
 assert.equal(projectStorePeriodFrame(unavailable),null);
});

test('product invoice tax supports a thousand compact maximum-size products and bounds each covered order tax',()=>{
 const ids=Array.from({length:1000},(_,index)=>String(99999999999999999000n+BigInt(index)));
 const value={...frame(),status:'COMPLETE',order_count:1000,pages_read:200,escrow_amount_raw:'1000000000000000',
  items:ids.map(item_id=>({item_id,model_id:'0',quantity:1})),
  product_breakdown:{schema:'store_product_breakdown_v1',exclusive_order_count:1000,mixed_order_count:0,exclusive_payout_raw:'1000000000000000',mixed_payout_raw:'0',
   products:ids.map(item_id=>({item_id,order_count:1,exclusive_order_count:1,mixed_order_count:0,exclusive_payout_raw:'1000000000000',returns_orders:0}))},
  invoice_tax:{...productInvoiceFrame().invoice_tax,covered_orders:1000,unavailable_orders:0,known_base_raw:'1000000000000000',known_tax_raw:'20000000000000'},
  product_invoice_tax:{schema:'store_product_invoice_tax_v1',exclusive_covered_orders:1000,mixed_covered_orders:0,known_exclusive_tax_raw:'20000000000000',known_mixed_tax_raw:'0',
   products:ids.map(item_id=>({item_id,exclusive_covered_orders:1,known_exclusive_tax_raw:'20000000000'}))}};
 assert.ok(projectStorePeriodFrame(value));
 const excessive=structuredClone(value);excessive.product_invoice_tax.products[0].known_exclusive_tax_raw='20000000000.01';assert.equal(projectStorePeriodFrame(excessive),null);
 value.product_invoice_tax.products.push({...value.product_invoice_tax.products[0],item_id:'1001'});assert.equal(projectStorePeriodFrame(value),null);
});
