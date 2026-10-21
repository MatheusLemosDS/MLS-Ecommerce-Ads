import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStoreInvoiceTax} from '../src/store-invoice-tax.mjs';
import {StoreSummaryError} from '../src/store-summary.mjs';

const tax=changes=>({schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',
  rounding:'HALF_UP_PER_ORDER',covered_orders:2,unavailable_orders:0,known_base_raw:'200',known_tax_raw:'4',...changes});
const frame=changes=>({schema:'finance_store_period_v1',run_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',revision:3,status:'COMPLETE',
  start_date:'2026-10-13',end_date:'2026-10-20',cutoff_at:1792510000,checked_at:1792510100,
  currency:'BRL',monetary_unit:'UNCONFIRMED',order_count:2,pages_read:1,duplicate_orders:0,returns_orders:0,
  escrow_amount_raw:'150.25',ads_recharge_or_support_raw:'0',items:[{item_id:'101',model_id:'1',quantity:2}],
  diagnostic:null,invoice_tax:tax(),...changes});
const invalid=source=>assert.throws(()=>buildStoreInvoiceTax(source),error=>error instanceof StoreSummaryError
  &&error.message==='STORE_INVOICE_TAX_FRAME_INVALID'&&error.status===502);

test('complete invoice tax exposes the exact product-value base and 2% estimate contract',()=>{
  assert.deepEqual(buildStoreInvoiceTax(frame()),{schema:'store_invoice_tax_result_v1',rate_bps:200,
    basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:2,unavailable_orders:0,
    known_base_cents:20000,base_cents:20000,known_tax_cents:400,tax_cents:400});
});

test('tax preserves the sum of half-up per-order estimates instead of rounding the aggregate base',()=>{
  // Two BRL 0.25 orders each estimate BRL 0.005, rounded half up to BRL 0.01.
  const result=buildStoreInvoiceTax(frame({invoice_tax:tax({known_base_raw:'0.5',known_tax_raw:'0.02'})}));
  assert.equal(result.base_cents,50);assert.equal(result.tax_cents,2);
  assert.notEqual(result.tax_cents,Math.round(result.base_cents*0.02));
});

test('partial or limited collection retains known estimates without claiming full-period tax',()=>{
  for(const changes of [{status:'RUNNING'},{status:'LIMIT_REACHED'},
    {status:'RUNNING',diagnostic:'STORE_PERIOD_UPSTREAM_UNAVAILABLE'}]){
    const result=buildStoreInvoiceTax(frame(changes));
    assert.equal(result.known_base_cents,20000);assert.equal(result.known_tax_cents,400);
    assert.equal(result.base_cents,null);assert.equal(result.tax_cents,null);
  }
});

test('one unavailable order leaves covered subtotals visible and both full totals unknown',()=>{
  const result=buildStoreInvoiceTax(frame({invoice_tax:tax({covered_orders:1,unavailable_orders:1,
    known_base_raw:'100',known_tax_raw:'2'})}));
  assert.equal(result.covered_orders,1);assert.equal(result.unavailable_orders,1);
  assert.equal(result.known_base_cents,10000);assert.equal(result.known_tax_cents,200);
  assert.equal(result.base_cents,null);assert.equal(result.tax_cents,null);
});

test('zero coverage retains zero known subsets without treating unavailable tax as zero',()=>{
  const result=buildStoreInvoiceTax(frame({invoice_tax:tax({covered_orders:0,unavailable_orders:2,
    known_base_raw:'0',known_tax_raw:'0'})}));
  assert.equal(result.known_base_cents,0);assert.equal(result.known_tax_cents,0);
  assert.equal(result.base_cents,null);assert.equal(result.tax_cents,null);
});

test('a genuinely empty completed cohort has explicit zero base and tax',()=>{
  const result=buildStoreInvoiceTax(frame({order_count:0,items:[],escrow_amount_raw:'0',
    invoice_tax:tax({covered_orders:0,known_base_raw:'0',known_tax_raw:'0'})}));
  assert.equal(result.base_cents,0);assert.equal(result.tax_cents,0);
});

test('exact monetary bounds remain known while larger summed amounts stay unknown without rounding',()=>{
  const boundary=buildStoreInvoiceTax(frame({invoice_tax:tax({known_base_raw:'1000000000000',known_tax_raw:'20000000000'})}));
  assert.equal(boundary.base_cents,100000000000000);assert.equal(boundary.tax_cents,2000000000000);
  const largeBase=buildStoreInvoiceTax(frame({invoice_tax:tax({known_base_raw:'1000000000000.01',known_tax_raw:'20000000000'})}));
  assert.equal(largeBase.known_base_cents,null);assert.equal(largeBase.base_cents,null);
  assert.equal(largeBase.known_tax_cents,2000000000000);assert.equal(largeBase.tax_cents,2000000000000);
  const largeTax=buildStoreInvoiceTax(frame({order_count:1000,pages_read:200,
    items:[{item_id:'101',model_id:'1',quantity:1000}],
    invoice_tax:tax({covered_orders:1000,known_base_raw:'1000000000000000',known_tax_raw:'20000000000000'})}));
  assert.equal(largeTax.known_base_cents,null);assert.equal(largeTax.base_cents,null);
  assert.equal(largeTax.known_tax_cents,null);assert.equal(largeTax.tax_cents,null);
});

test('legacy fallback validates the entire frame before returning null',()=>{
  const legacy=frame();delete legacy.invoice_tax;
  assert.equal(buildStoreInvoiceTax(legacy),null);
  invalid({...legacy,escrow_amount_raw:'1.00'});invalid({...legacy,unexpected:true});invalid(null);
});

test('unsafe tax sidecars are rejected instead of accepting forged rate, coverage or metadata',()=>{
  for(const changes of [{schema:'store_invoice_tax_v2'},{rate_bps:201},{basis:'ESCROW_AMOUNT'},
    {rounding:'HALF_UP_PERIOD'},{covered_orders:3},{unavailable_orders:-1},{covered_orders:1},
    {known_base_raw:'1e2'},{known_base_raw:'200.001'},{known_tax_raw:'4.001'},
    {known_tax_raw:'4.00'},{known_tax_raw:'-1'},{extra:1}]){
    invalid(frame({invoice_tax:tax(changes)}));
  }
  const getter=tax();let reads=0;
  Object.defineProperty(getter,'known_base_raw',{get(){reads++;return '200';}});
  invalid(frame({invoice_tax:getter}));assert.equal(reads,0);
});

test('returned values are detached and do not expose source fields or change stored money',()=>{
  const source=frame(),before=structuredClone(source),result=buildStoreInvoiceTax(source);
  result.known_tax_cents=0;assert.deepEqual(source,before);
  assert.equal(Object.hasOwn(result,'escrow_amount_raw'),false);
  assert.equal(Object.hasOwn(result,'net_profit_cents'),false);
});
