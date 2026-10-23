import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {projectBusinessPeriodRequest,projectBusinessPeriodFrame} from '../src/business-period-frame.mjs';

const run='11111111-1111-4111-8111-111111111111';
const empty=changes=>({schema:'finance_business_period_v1',run_id:run,revision:1,status:'RUNNING',start_date:'2026-10-01',end_date:'2026-10-15',cutoff_at:1792510733,checked_at:1792510733,currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:0,duplicate_orders:0,coverage:{orders:0,paid:0,completed:0,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:0,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'0',sales_base_raw:'0',known_expected_repass_raw:'0',expected_repass_raw:'0',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:0,unavailable_orders:0,known_base_raw:'0',known_tax_raw:'0'},items:[],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED',...changes});
const mixed=changes=>empty({revision:2,status:'COMPLETE',pages_read:2,
 coverage:{orders:7,paid:2,completed:1,ongoing:1,cancelled:1,cancel_pending:1,unpaid:1,other:1,unknown:1,payment_covered:1,payment_missing:1,returns:0,returns_unknown:1},
 known_sales_base_raw:'100',sales_base_raw:null,known_expected_repass_raw:'80',expected_repass_raw:null,known_ads_adjustment_raw:'0',ads_adjustment_raw:null,
 invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:1,known_base_raw:'100',known_tax_raw:'2'},
 items:[{item_id:'201',model_id:'0',quantity:2}],...changes});
const covered=changes=>{
 const value=mixed();
 value.coverage={...value.coverage,payment_covered:2,payment_missing:0,returns_unknown:0};
 Object.assign(value,{known_sales_base_raw:'245.5',sales_base_raw:'245.5',known_expected_repass_raw:'173.37',expected_repass_raw:'173.37',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0'});
 value.invoice_tax={...value.invoice_tax,covered_orders:2,unavailable_orders:0,known_base_raw:'245.5',known_tax_raw:'4.91'};
 return {...value,...changes};
};

test('business request union has exact operations, canonical IDs and at most fifteen inclusive calendar days',()=>{
 assert.deepEqual(projectBusinessPeriodRequest({operation:'start',start_date:'2026-10-01',end_date:'2026-10-15'}),{operation:'start',start_date:'2026-10-01',end_date:'2026-10-15'});
 assert.deepEqual(projectBusinessPeriodRequest({operation:'start',start_date:'2024-02-29',end_date:'2024-02-29'}),{operation:'start',start_date:'2024-02-29',end_date:'2024-02-29'});
 for(const operation of ['read','step'])assert.deepEqual(projectBusinessPeriodRequest({operation,run_id:run}),{operation,run_id:run});
 for(const value of [null,[],{}, {operation:'start',start_date:'2026-10-01',end_date:'2026-10-16'},{operation:'start',start_date:'2026-02-29',end_date:'2026-03-01'},{operation:'start',start_date:'2026-10-02',end_date:'2026-10-01'},{operation:'start',start_date:'2026-10-01',end_date:'2026-10-15',shop_id:999},{operation:'delete',run_id:run},{operation:'read',run_id:run,cursor:'PRIVATE_CURSOR'},{operation:'step',run_id:'01111111-1111-3111-8111-111111111111'}])assert.equal(projectBusinessPeriodRequest(value),null);
 // This fixture contains only digits; test a letter-bearing UUID as well.
 assert.equal(projectBusinessPeriodRequest({operation:'read',run_id:'abcdefab-abcd-4abc-8abc-abcdefabcdef'.toUpperCase()}),null);
});

test('paid, cancelled, unpaid and uncertain status groups remain separate, with missing Payment totals explicit',()=>{
 const value=mixed(),result=projectBusinessPeriodFrame(value);
 assert.ok(result);assert.equal(result.coverage.orders,7);assert.equal(result.coverage.paid,2);
 assert.equal(result.coverage.completed,1);assert.equal(result.coverage.ongoing,1);
 assert.equal(result.coverage.payment_missing,1);assert.equal(result.sales_base_raw,null);
 assert.equal(result.expected_repass_raw,null);assert.equal(result.ads_adjustment_raw,null);
 assert.equal(result.known_sales_base_raw,'100');assert.equal(result.known_expected_repass_raw,'80');
 assert.equal(result.invoice_tax.covered_orders,1);assert.equal(result.invoice_tax.unavailable_orders,1);
 assert.equal(Object.hasOwn(result,'net_profit_cents'),false);
 assert.equal(Object.hasOwn(result,'order_sn'),false);
});

test('zero paid orders are valid only with empty quantities and zero known financial amounts',()=>{
 assert.deepEqual(projectBusinessPeriodFrame(empty()),empty());
 const finished=empty({revision:2,status:'COMPLETE',pages_read:1});
 assert.deepEqual(projectBusinessPeriodFrame(finished),finished);
 const onlyCancelled=empty({revision:2,status:'COMPLETE',pages_read:1,coverage:{...empty().coverage,orders:2,cancelled:1,unpaid:1}});
 assert.ok(projectBusinessPeriodFrame(onlyCancelled));
 for(const mutate of [v=>v.items.push({item_id:'201',model_id:'0',quantity:1}),v=>v.known_sales_base_raw='1',v=>v.sales_base_raw=null,v=>v.expected_repass_raw=null,v=>v.coverage.returns_unknown=1,v=>v.invoice_tax.known_tax_raw='0.01']){
  const value=structuredClone(finished);mutate(value);assert.equal(projectBusinessPeriodFrame(value),null);
 }
});

test('a fully covered paid cohort retains exact goods, expected payout and per-invoice tax',()=>{
 const value=covered(),result=projectBusinessPeriodFrame(value);assert.ok(result);
 assert.equal(result.sales_base_raw,'245.5');assert.equal(result.expected_repass_raw,'173.37');
 assert.equal(result.invoice_tax.known_tax_raw,'4.91');assert.equal(result.coverage.ongoing,1);
 value.coverage.paid=999;value.invoice_tax.known_base_raw='999';value.items[0].quantity=999;
 assert.equal(result.coverage.paid,2);assert.equal(result.invoice_tax.known_base_raw,'245.5');assert.equal(result.items[0].quantity,2);
});

test('tax is rounded per invoice rather than from a period-wide base, with bounded HALF_UP ties',()=>{
 // Two R$0.25 invoices each have R$0.01 tax; rounding the sum yields only R$0.01.
 const perInvoice=covered({known_sales_base_raw:'0.5',sales_base_raw:'0.5'});
 perInvoice.invoice_tax={...perInvoice.invoice_tax,known_base_raw:'0.5',known_tax_raw:'0.02'};
 assert.ok(projectBusinessPeriodFrame(perInvoice));
 for(const raw of ['0.03','-0.01','0.001','0.020'])assert.equal(projectBusinessPeriodFrame({...perInvoice,invoice_tax:{...perInvoice.invoice_tax,known_tax_raw:raw}}),null);
 const down=covered({known_sales_base_raw:'0.48',sales_base_raw:'0.48'});down.invoice_tax={...down.invoice_tax,known_base_raw:'0.48',known_tax_raw:'0'};
 assert.ok(projectBusinessPeriodFrame(down));
 const one=covered({known_sales_base_raw:'0.25',sales_base_raw:'0.25',coverage:{...covered().coverage,paid:1,completed:1,ongoing:0,payment_covered:1,orders:6}});
 one.invoice_tax={...one.invoice_tax,covered_orders:1,known_base_raw:'0.25',known_tax_raw:'0.01'};
 assert.ok(projectBusinessPeriodFrame(one));
 one.invoice_tax.known_tax_raw='0';assert.equal(projectBusinessPeriodFrame(one),null);
});

test('signed payout and Ads adjustments are preserved without turning them into goods revenue',()=>{
 const value=covered({known_expected_repass_raw:'-0.05',expected_repass_raw:'-0.05',known_ads_adjustment_raw:'-10.2',ads_adjustment_raw:'-10.2'});
 assert.ok(projectBusinessPeriodFrame(value));
 const negativeGoods={...value,known_sales_base_raw:'-0.01',sales_base_raw:'-0.01',invoice_tax:{...value.invoice_tax,known_base_raw:'-0.01'}};
 assert.equal(projectBusinessPeriodFrame(negativeGoods),null);
 for(const [known,total] of [['known_expected_repass_raw','expected_repass_raw'],['known_ads_adjustment_raw','ads_adjustment_raw']])for(const raw of ['-0','1.00','1.20','01','1e2','1.001',100,NaN,Infinity,'1000000000000000.01'])assert.equal(projectBusinessPeriodFrame({...value,[known]:raw,[total]:raw}),null);
});

test('coverage equations reject invented sales, missing returns coverage and inconsistent monetary completeness',()=>{
 const mutations=[
  v=>v.coverage.orders++,v=>v.coverage.paid++,v=>v.coverage.completed++,v=>v.coverage.cancelled++,v=>v.coverage.payment_covered++,v=>v.coverage.payment_missing=0,v=>v.coverage.payment_missing=true,v=>v.coverage.returns=2,v=>v.coverage.returns_unknown=0,v=>v.coverage.returns_unknown=3,v=>v.coverage.unknown=-1,
  v=>v.sales_base_raw='100',v=>v.expected_repass_raw='80',v=>v.ads_adjustment_raw='0',v=>v.invoice_tax.covered_orders=2,v=>v.invoice_tax.unavailable_orders=0,v=>v.invoice_tax.known_base_raw='200',v=>v.invoice_tax.rate_bps=300,
 ];
 for(const mutate of mutations){const value=mixed();mutate(value);assert.equal(projectBusinessPeriodFrame(value),null);}
 const missing=empty({revision:2,pages_read:1,coverage:{...empty().coverage,orders:1,paid:1,ongoing:1,payment_missing:1,returns_unknown:1},sales_base_raw:null,expected_repass_raw:null,ads_adjustment_raw:null,items:[{item_id:'201',model_id:'0',quantity:1}],invoice_tax:{...empty().invoice_tax,unavailable_orders:1}});
 assert.ok(projectBusinessPeriodFrame(missing));missing.known_expected_repass_raw='1';assert.equal(projectBusinessPeriodFrame(missing),null);
});

test('page limits, diagnostic state and current quantity coverage cannot masquerade as complete totals',()=>{
 const limit=empty({revision:2,status:'LIMIT_REACHED'});assert.ok(projectBusinessPeriodFrame(limit));
 const interrupted=empty({diagnostic:'BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE'});assert.ok(projectBusinessPeriodFrame(interrupted));
 for(const mutate of [v=>v.status='COMPLETE',v=>v.status='UNKNOWN',v=>v.pages_read=201,v=>v.duplicate_orders=1,v=>v.checked_at--,v=>v.currency='USD',v=>v.monetary_unit='BRL',v=>v.diagnostic='PRIVATE_PROVIDER_MESSAGE',v=>v.basis='SETTLED_REVENUE',v=>v.revision=0,v=>v.start_date='2026-09-30']){
  const value=empty();mutate(value);assert.equal(projectBusinessPeriodFrame(value),null);
 }
 for(const diagnostic of ['BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE','BUSINESS_PERIOD_CONFLICT'])assert.equal(projectBusinessPeriodFrame(covered({diagnostic})),null);
 const many=covered({items:[{item_id:'201',model_id:'0',quantity:1}]});assert.equal(projectBusinessPeriodFrame(many),null);
});

test('catalogue identities are canonical, quantities bounded, duplicate groups rejected and output sorted',()=>{
 const value=covered({items:[{item_id:'20',model_id:'1',quantity:1},{item_id:'2',model_id:'0',quantity:1}]}),result=projectBusinessPeriodFrame(value);
 assert.deepEqual(result.items.map(row=>row.item_id),['2','20']);
 for(const row of [{item_id:'02',model_id:'0',quantity:2},{item_id:'2',model_id:'00',quantity:2},{item_id:'0',model_id:'0',quantity:2},{item_id:'2',model_id:'0',quantity:0},{item_id:'2',model_id:'0',quantity:1.5},{item_id:'2',model_id:'0',quantity:1000000000001},{item_id:'2',model_id:0,quantity:2}])assert.equal(projectBusinessPeriodFrame(covered({items:[row]})),null);
 assert.equal(projectBusinessPeriodFrame(covered({items:[value.items[0],value.items[0]]})),null);
 assert.equal(projectBusinessPeriodFrame(covered({items:Array(1)})),null);
 const thousand=covered({pages_read:200,coverage:{...covered().coverage,orders:1000,paid:1000,completed:1000,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1000},invoice_tax:{...covered().invoice_tax,covered_orders:1000},items:Array.from({length:1000},(_,index)=>({item_id:String(index+1),model_id:'0',quantity:1}))});
 assert.ok(projectBusinessPeriodFrame(thousand));thousand.items.push({item_id:'1001',model_id:'0',quantity:1});assert.equal(projectBusinessPeriodFrame(thousand),null);
});

test('private extras, own accessors and sparse arrays are rejected without evaluating them',()=>{
 for(const mutate of [v=>v.order_sn='PRIVATE_ORDER',v=>v.coverage.email='PRIVATE_BUYER',v=>v.invoice_tax.access_token='PRIVATE_TOKEN',v=>v.items[0].sku='PRIVATE_SKU',v=>v[Symbol('private')]='PRIVATE']){
  const value=covered();mutate(value);assert.equal(projectBusinessPeriodFrame(value),null);
 }
 let invoked=0;
 for(const key of ['coverage','invoice_tax','items']){
  const value=covered();Object.defineProperty(value,key,{get(){invoked++;return {};},enumerable:true});assert.equal(projectBusinessPeriodFrame(value),null);
 }
 const nested=covered();Object.defineProperty(nested.coverage,'paid',{get(){invoked++;return 2;},enumerable:true});assert.equal(projectBusinessPeriodFrame(nested),null);
 const item=covered();Object.defineProperty(item.items[0],'quantity',{get(){invoked++;return 2;},enumerable:true});assert.equal(projectBusinessPeriodFrame(item),null);
 const request={start_date:'2026-10-01',end_date:'2026-10-15'};Object.defineProperty(request,'operation',{get(){invoked++;return 'start';},enumerable:true});assert.equal(projectBusinessPeriodRequest(request),null);
 assert.equal(invoked,0);
});

test('the exact frame projector works when embedded alone in a fresh browser realm',()=>{
 const context=vm.createContext({serialized:JSON.stringify(covered())});
 const result=new vm.Script('const project='+projectBusinessPeriodFrame.toString()+';project(JSON.parse(serialized));').runInContext(context);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),projectBusinessPeriodFrame(covered()));
 context.serialized=JSON.stringify({...covered(),order_sn:'PRIVATE_ORDER'});
 assert.equal(new vm.Script('project(JSON.parse(serialized))').runInContext(context),null);
});

function productFrame(){
 const value=empty({revision:2,status:'COMPLETE',pages_read:1,
  coverage:{orders:5,paid:3,completed:2,ongoing:1,cancelled:1,cancel_pending:0,unpaid:1,other:0,unknown:0,payment_covered:2,payment_missing:1,returns:0,returns_unknown:1},
  known_sales_base_raw:'150',sales_base_raw:null,known_expected_repass_raw:'105',expected_repass_raw:null,known_ads_adjustment_raw:'5',ads_adjustment_raw:null,
  invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:2,unavailable_orders:1,known_base_raw:'150',known_tax_raw:'3'},
  items:[{item_id:'201',model_id:'0',quantity:3},{item_id:'202',model_id:'10',quantity:2},{item_id:'202',model_id:'11',quantity:1}]});
 const product=(item_id,quantity,covered,items)=>({item_id,quantity,orders:2,exclusive_orders:1,mixed_orders:1,exclusive_payment_covered:covered,exclusive_payment_missing:1-covered,exclusive_returns:0,exclusive_returns_unknown:1-covered,...Object.fromEntries(['sales_base','expected_repass','ads_adjustment','invoice_tax'].flatMap((name,index)=>{const raw=covered?['100','80','3','2'][index]:'0';return [['known_exclusive_'+name+'_raw',raw],['exclusive_'+name+'_raw',covered?raw:null]];})),items});
 value.product_breakdown={schema:'business_product_breakdown_v1',mixed_orders:1,mixed_payment_covered:1,mixed_payment_missing:0,known_mixed_sales_base_raw:'50',known_mixed_expected_repass_raw:'25',known_mixed_ads_adjustment_raw:'2',known_mixed_invoice_tax_raw:'1',products:[
  product('201',3,1,[{model_id:'0',exclusive_quantity:2,mixed_quantity:1}]),
  product('202',3,0,[{model_id:'10',exclusive_quantity:0,mixed_quantity:2},{model_id:'11',exclusive_quantity:1,mixed_quantity:0}]),
 ]};return value;
}

test('product sidecar conserves exclusive money and mixed unallocated money without losing missing-payment quantities',()=>{
 const value=productFrame(),result=projectBusinessPeriodFrame(value);assert.ok(result);
 assert.equal(result.product_breakdown.mixed_orders,1);assert.equal(result.product_breakdown.known_mixed_expected_repass_raw,'25');
 const first=result.product_breakdown.products[0],second=result.product_breakdown.products[1];
 assert.equal(first.exclusive_expected_repass_raw,'80');assert.equal(first.quantity,3);assert.equal(first.items[0].exclusive_quantity,2);assert.equal(first.items[0].mixed_quantity,1);
 assert.equal(second.known_exclusive_expected_repass_raw,'0');assert.equal(second.exclusive_expected_repass_raw,null);assert.equal(second.exclusive_payment_missing,1);assert.equal(second.items[1].exclusive_quantity,1);
 // The known mixed payout is kept once, rather than allocated or duplicated
 // into either product's exclusive estimate.
 assert.equal(first.known_exclusive_expected_repass_raw,'80');assert.equal(result.known_expected_repass_raw,'105');
 value.product_breakdown.products[0].items[0].exclusive_quantity=999;value.product_breakdown.products[0].known_exclusive_expected_repass_raw='999';
 assert.equal(first.items[0].exclusive_quantity,2);assert.equal(first.known_exclusive_expected_repass_raw,'80');
});

test('product identities, quantities, coverage, money completeness and tax are independently reconciled with the parent frame',()=>{
 const mutations=[
  v=>v.product_breakdown.mixed_orders=0,v=>v.product_breakdown.mixed_payment_covered=0,v=>v.product_breakdown.known_mixed_expected_repass_raw='26',v=>v.product_breakdown.known_mixed_invoice_tax_raw='1.01',
  v=>v.product_breakdown.products.pop(),v=>v.product_breakdown.products.push(structuredClone(v.product_breakdown.products[0])),
  v=>v.product_breakdown.products[0].item_id='999',v=>v.product_breakdown.products[0].quantity++,v=>v.product_breakdown.products[0].orders++,v=>v.product_breakdown.products[0].mixed_orders=0,
  v=>v.product_breakdown.products[0].exclusive_payment_missing++,v=>v.product_breakdown.products[0].exclusive_returns_unknown=2,v=>v.product_breakdown.products[1].exclusive_returns_unknown=0,
  v=>v.product_breakdown.products[0].known_exclusive_sales_base_raw='-100',v=>v.product_breakdown.products[0].exclusive_expected_repass_raw=null,v=>v.product_breakdown.products[1].exclusive_expected_repass_raw='0',
  v=>v.product_breakdown.products[0].items[0].model_id='999',v=>v.product_breakdown.products[0].items[0].exclusive_quantity++,v=>v.product_breakdown.products[1].items.pop(),
  v=>v.product_breakdown.products[0].items.push(structuredClone(v.product_breakdown.products[0].items[0])),
 ];
 for(const mutate of mutations){const value=productFrame();mutate(value);assert.equal(projectBusinessPeriodFrame(value),null);}
 const mixedOnly=productFrame();mixedOnly.product_breakdown.products[0].exclusive_orders=0;assert.equal(projectBusinessPeriodFrame(mixedOnly),null);
});

test('empty product sidecar is explicit only for empty paid quantities and old frames remain compatible',()=>{
 const old=empty();assert.equal(Object.hasOwn(projectBusinessPeriodFrame(old),'product_breakdown'),false);
 const value={...old,product_breakdown:{schema:'business_product_breakdown_v1',mixed_orders:0,mixed_payment_covered:0,mixed_payment_missing:0,known_mixed_sales_base_raw:'0',known_mixed_expected_repass_raw:'0',known_mixed_ads_adjustment_raw:'0',known_mixed_invoice_tax_raw:'0',products:[]}};
 assert.deepEqual(projectBusinessPeriodFrame(value),value);
 assert.equal(projectBusinessPeriodFrame({...value,product_breakdown:null}),null);
 const nonempty=productFrame();nonempty.product_breakdown=value.product_breakdown;assert.equal(projectBusinessPeriodFrame(nonempty),null);
});

test('conserving positive and negative offsets cannot exceed the source bound for the covered exclusive or mixed orders',()=>{
 for(const [name,mixed] of [['expected_repass','-999999999999895'],['ads_adjustment','-999999999999995']]){
  const value=productFrame(),row=value.product_breakdown.products[0];
  row['known_exclusive_'+name+'_raw']='1000000000000000';row['exclusive_'+name+'_raw']='1000000000000000';value.product_breakdown['known_mixed_'+name+'_raw']=mixed;
  assert.equal(projectBusinessPeriodFrame(value),null);
 }
});

test('optional product projection remains standalone, rejects private extras and accessors without executing them',()=>{
 let invoked=0;
 for(const location of ['frame','breakdown','product','item']){
  const value=productFrame(),target=location==='frame'?value:location==='breakdown'?value.product_breakdown:location==='product'?value.product_breakdown.products[0]:value.product_breakdown.products[0].items[0],key=location==='frame'?'product_breakdown':location==='breakdown'?'products':location==='product'?'items':'exclusive_quantity';
  Object.defineProperty(target,key,{get(){invoked++;return null;},enumerable:true});assert.equal(projectBusinessPeriodFrame(value),null);
 }
 assert.equal(invoked,0);
 for(const mutate of [v=>v.product_breakdown.access_token='PRIVATE',v=>v.product_breakdown.products[0].order_sn='PRIVATE',v=>v.product_breakdown.products[0].items[0].sku='PRIVATE',v=>v.product_breakdown.products=Array(2)]){const value=productFrame();mutate(value);assert.equal(projectBusinessPeriodFrame(value),null);}
 const context=vm.createContext({serialized:JSON.stringify(productFrame())});
 const result=new vm.Script('const project='+projectBusinessPeriodFrame.toString()+';project(JSON.parse(serialized));').runInContext(context);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),projectBusinessPeriodFrame(productFrame()));
});

test('a maximal thousand-variant product sidecar remains bounded without truncating identities or amounts',()=>{
 const value=empty({revision:201,status:'COMPLETE',pages_read:200,
  coverage:{...empty().coverage,orders:1000,paid:1000,completed:1000,payment_covered:1000},
  known_sales_base_raw:'1000000000000000',sales_base_raw:'1000000000000000',known_expected_repass_raw:'-1000000000000000',expected_repass_raw:'-1000000000000000',known_ads_adjustment_raw:'-1000000000000000',ads_adjustment_raw:'-1000000000000000',
  invoice_tax:{...empty().invoice_tax,covered_orders:1000,known_base_raw:'1000000000000000',known_tax_raw:'20000000000000'},
  items:Array.from({length:1000},(_,index)=>({item_id:String(10000000000000000000n+BigInt(index)),model_id:'99999999999999999999',quantity:1000000000000}))});
 value.product_breakdown={schema:'business_product_breakdown_v1',mixed_orders:0,mixed_payment_covered:0,mixed_payment_missing:0,known_mixed_sales_base_raw:'0',known_mixed_expected_repass_raw:'0',known_mixed_ads_adjustment_raw:'0',known_mixed_invoice_tax_raw:'0',products:value.items.map(row=>({item_id:row.item_id,quantity:row.quantity,orders:1,exclusive_orders:1,mixed_orders:0,exclusive_payment_covered:1,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,...Object.fromEntries(['sales_base','expected_repass','ads_adjustment','invoice_tax'].flatMap((name,index)=>{const raw=['1000000000000','-1000000000000','-1000000000000','20000000000'][index];return [['known_exclusive_'+name+'_raw',raw],['exclusive_'+name+'_raw',raw]];})),items:[{model_id:row.model_id,exclusive_quantity:row.quantity,mixed_quantity:0}]}))};
 const result=projectBusinessPeriodFrame(value);assert.ok(result);
 const bytes=Buffer.byteLength(JSON.stringify(result));assert.ok(bytes>524288);assert.ok(bytes<1048576);
 assert.equal(result.product_breakdown.products.length,1000);assert.equal(result.product_breakdown.products.at(-1).item_id,'10000000000000000999');
});
