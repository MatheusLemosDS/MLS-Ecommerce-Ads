import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildBusinessMonthProducts,projectBusinessMonthProducts} from '../src/business-month-products.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';

const copy=value=>structuredClone(value);
const money=(sales,repass,tax,adjustment='0')=>Object.fromEntries([['sales_base',sales],['expected_repass',repass],['invoice_tax',tax],['ads_adjustment',adjustment]].flatMap(([name,value])=>[['known_exclusive_'+name+'_raw',value],['exclusive_'+name+'_raw',value]]));
function fixture(){
 const coverage={orders:5,paid:3,completed:2,ongoing:1,cancelled:1,cancel_pending:0,unpaid:1,other:0,unknown:0,payment_covered:3,payment_missing:0,returns:0,returns_unknown:0};
 const breakdown={schema:'business_product_breakdown_v1',mixed_orders:1,mixed_payment_covered:1,mixed_payment_missing:0,known_mixed_sales_base_raw:'100',known_mixed_expected_repass_raw:'75',known_mixed_ads_adjustment_raw:'0',known_mixed_invoice_tax_raw:'2',products:[
  {item_id:'201',quantity:3,orders:2,exclusive_orders:1,mixed_orders:1,exclusive_payment_covered:1,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,...money('100','80','2'),items:[{model_id:'10',exclusive_quantity:1,mixed_quantity:0},{model_id:'11',exclusive_quantity:0,mixed_quantity:2}]},
  {item_id:'202',quantity:2,orders:2,exclusive_orders:1,mixed_orders:1,exclusive_payment_covered:1,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,...money('60','45','1.2'),items:[{model_id:'0',exclusive_quantity:1,mixed_quantity:1}]},
 ]};
 const source={schema:'finance_business_period_v1',run_id:'11111111-1111-4111-8111-111111111111',revision:2,status:'COMPLETE',start_date:'2026-10-01',end_date:'2026-10-15',cutoff_at:1792405600,checked_at:1792405689,currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage,known_sales_base_raw:'260',sales_base_raw:'260',known_expected_repass_raw:'200',expected_repass_raw:'200',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:3,unavailable_orders:0,known_base_raw:'260',known_tax_raw:'5.2'},items:[{item_id:'201',model_id:'10',quantity:1},{item_id:'201',model_id:'11',quantity:2},{item_id:'202',model_id:'0',quantity:2}],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED',product_breakdown:breakdown};
 assert.ok(projectBusinessPeriodFrame(source),'source fixture must satisfy the private Finance contract');
 const frame={status:'COMPLETE',progress:{windows_total:1,windows_complete:1,pages_read:1},coverage:copy(coverage),known_sales_cents:26000,known_expected_repass_cents:20000,known_invoice_tax_cents:520,known_production_cost_cents:7400,production_cost_cents:7400,ads_adjustment_cents:0,result:{pending:[]},unmapped_variants:[],bindings_revision:3,costs_revision:7};
 const refs=[{item_id:'201',model_id:'10',quantity:1,unit_cost_cents:1000,production_cost_cents:1000},{item_id:'201',model_id:'11',quantity:2,unit_cost_cents:1200,production_cost_cents:2400},{item_id:'202',model_id:'0',quantity:2,unit_cost_cents:2000,production_cost_cents:4000}];
 const bindings={revision:3,bindings:[{item_id:'201',model_id:'10',selling_unit:'SINGLE_GARMENT',size:'P'},{item_id:'201',model_id:'11',selling_unit:'SINGLE_GARMENT',size:'GG'},{item_id:'202',model_id:'0',male_size:'P',female_size:'M'}]};
 return {source,frame,refs,bindings};
}
const build=f=>buildBusinessMonthProducts([f.source],f.frame,f.refs,f.bindings);

test('monthly products separate all sold production from exclusive-order contribution and retain unallocated mixed totals',()=>{
 const f=fixture(),value=build(f);assert.ok(value);assert.equal(value.mixed_orders,1);assert.equal(value.known_mixed_sales_cents,10000);assert.equal(value.known_mixed_repass_cents,7500);assert.equal(value.known_mixed_tax_cents,200);
 const [a,b]=value.products;assert.equal(a.quantity,3);assert.equal(a.orders,2);assert.equal(a.production_cost_cents,3400);assert.equal(a.exclusive_production_cost_cents,1000);assert.equal(a.exclusive_after_costs_cents,6800);assert.equal(a.exclusive_margin_bps,6800);assert.equal(b.production_cost_cents,4000);assert.equal(b.exclusive_after_costs_cents,2380);assert.equal(b.exclusive_margin_bps,3966);assert.deepEqual(a.pending,[]);assert.equal(b.variants[0].selling_unit,'ONE_MALE_ONE_FEMALE_KIT');
 assert.deepEqual(projectBusinessMonthProducts(value,f.frame),value);
});

test('disjoint monthly windows merge the same product/model before matching cost reference quantities',()=>{
 const f=fixture(),source=copy(f.source);source.run_id='22222222-2222-4222-8222-222222222222';source.start_date='2026-10-16';source.end_date='2026-10-30';
 const frame=copy(f.frame);frame.progress={windows_total:2,windows_complete:2,pages_read:2};for(const key of Object.keys(frame.coverage))frame.coverage[key]*=2;for(const key of ['known_sales_cents','known_expected_repass_cents','known_invoice_tax_cents','known_production_cost_cents','production_cost_cents'])frame[key]*=2;
 const refs=f.refs.map(row=>({...row,quantity:row.quantity*2,production_cost_cents:row.production_cost_cents*2}));
 const value=buildBusinessMonthProducts([f.source,source],frame,refs,f.bindings);assert.ok(value);assert.equal(value.products.length,2);assert.equal(value.products[0].quantity,6);assert.equal(value.products[0].exclusive_after_costs_cents,13600);assert.equal(value.products[1].exclusive_after_costs_cents,4760);assert.equal(value.mixed_orders,2);
});

test('an unmapped variant sold only in mixed orders keeps all-production pending without blocking the exclusive subset',()=>{
 const f=fixture();f.refs[1].unit_cost_cents=null;f.refs[1].production_cost_cents=null;f.bindings.bindings.splice(1,1);f.frame.known_production_cost_cents=5000;f.frame.production_cost_cents=null;f.frame.unmapped_variants=[{item_id:'201',model_id:'11',quantity:2}];f.frame.result.pending=['PRODUCTION_COST_INCOMPLETE'];
 const value=build(f);assert.ok(value);const row=value.products[0];assert.equal(row.known_production_cost_cents,1000);assert.equal(row.production_cost_cents,null);assert.equal(row.exclusive_production_cost_cents,1000);assert.equal(row.exclusive_after_costs_cents,6800);assert.deepEqual(row.pending,[]);assert.equal(row.variants[1].exclusive_production_cost_cents,0);assert.equal(row.variants[1].size,null);
});

test('missing exclusive Payment preserves its quantity and cost but never creates zero sales or a complete contribution',()=>{
 const f=fixture(),row=f.source.product_breakdown.products[0];row.exclusive_payment_covered=0;row.exclusive_payment_missing=1;row.exclusive_returns_unknown=1;for(const name of ['sales_base','expected_repass','invoice_tax','ads_adjustment']){row['known_exclusive_'+name+'_raw']='0';row['exclusive_'+name+'_raw']=null;}
 f.source.coverage.payment_covered=2;f.source.coverage.payment_missing=1;f.source.coverage.returns_unknown=1;f.frame.coverage=copy(f.source.coverage);f.frame.known_sales_cents=16000;f.frame.known_expected_repass_cents=12000;f.frame.known_invoice_tax_cents=320;f.frame.ads_adjustment_cents=null;f.frame.result.pending=['PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED'];
 const value=build(f);assert.ok(value);const out=value.products[0];assert.equal(out.quantity,3);assert.equal(out.production_cost_cents,3400);assert.equal(out.known_exclusive_sales_cents,0);assert.equal(out.exclusive_sales_cents,null);assert.equal(out.exclusive_after_costs_cents,null);assert.deepEqual(out.pending,['PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED']);
});

test('returns and unclassified or cancelling orders block contribution without hiding known values',()=>{
 for(const field of ['exclusive_returns','exclusive_returns_unknown']){const f=fixture();f.source.product_breakdown.products[0][field]=1;f.frame.coverage[field==='exclusive_returns'?'returns':'returns_unknown']=1;const value=build(f);assert.ok(value);assert.equal(value.products[0].exclusive_repass_cents,8000);assert.equal(value.products[0].exclusive_after_costs_cents,null);assert.deepEqual(value.products[0].pending,['RETURNS_NOT_RECONCILED']);assert.equal(value.products[1].exclusive_after_costs_cents,2380);}
 for(const field of ['cancel_pending','other','unknown']){const f=fixture();f.frame.coverage[field]=1;f.frame.coverage.orders++;const value=build(f);assert.ok(value);assert.ok(value.products.every(row=>row.exclusive_after_costs_cents===null&&row.pending.includes('STATUS_REVIEW_REQUIRED')));}
 const f=fixture();f.frame.result.pending=['SOURCE_UNAVAILABLE'];assert.ok(build(f).products.every(row=>row.pending.includes('SOURCE_UNAVAILABLE')));
});

test('mixed-only products never claim a zero or allocated contribution',()=>{
 const f=fixture(),row=f.source.product_breakdown.products[0];row.exclusive_orders=0;row.orders=1;row.quantity=2;row.exclusive_payment_covered=0;row.items.splice(0,1);for(const [key] of Object.entries(money('0','0','0')))row[key]='0';
 f.frame.coverage.paid=2;f.frame.coverage.completed=1;f.frame.coverage.payment_covered=2;f.frame.coverage.orders=4;f.frame.known_sales_cents=16000;f.frame.known_expected_repass_cents=12000;f.frame.known_invoice_tax_cents=320;f.frame.known_production_cost_cents=6400;f.frame.production_cost_cents=6400;f.refs.splice(0,1);
 const value=build(f);assert.ok(value);assert.equal(value.products[0].exclusive_repass_cents,0);assert.equal(value.products[0].exclusive_after_costs_cents,null);assert.equal(value.products[0].exclusive_margin_bps,null);assert.deepEqual(value.products[0].pending,['NO_EXCLUSIVE_ORDERS']);
});

test('legacy/incomplete frames and mismatched snapshots stay unavailable instead of becoming an empty product report',()=>{
 for(const change of [f=>delete f.source.product_breakdown,f=>f.source.status='RUNNING',f=>f.frame.status='RUNNING',f=>f.frame.progress.windows_total=2,f=>f.refs[0].quantity++,f=>f.bindings.revision++,f=>f.refs.push(copy(f.refs[0]))]){const f=fixture();change(f);assert.equal(build(f),null);}
});

test('a verified month with no paid orders has an explicit empty product report, while unsafe cost references are unavailable',()=>{
 const f=fixture();for(const key of Object.keys(f.frame.coverage))f.frame.coverage[key]=0;
 for(const key of ['known_sales_cents','known_expected_repass_cents','known_invoice_tax_cents','known_production_cost_cents','production_cost_cents'])f.frame[key]=0;
 const empty={status:'COMPLETE',product_breakdown:{schema:'business_product_breakdown_v1',mixed_orders:0,mixed_payment_covered:0,mixed_payment_missing:0,known_mixed_sales_base_raw:'0',known_mixed_expected_repass_raw:'0',known_mixed_ads_adjustment_raw:'0',known_mixed_invoice_tax_raw:'0',products:[]}};
 const value=buildBusinessMonthProducts([empty],f.frame,[],f.bindings);assert.ok(value);assert.deepEqual(value.products,[]);assert.equal(value.mixed_orders,0);
 const unsafe=fixture();unsafe.refs[1].unit_cost_cents=Number.MAX_SAFE_INTEGER;unsafe.refs[1].production_cost_cents=null;assert.equal(build(unsafe),null);
});

test('strict projection rejects fabricated costs, contribution, tax, population, identities, blockers and private fields',()=>{
 const f=fixture(),value=build(f);
 const mutations=[v=>v.private_token='PRIVATE',v=>v.products[0].private='PRIVATE',v=>v.products[0].quantity++,v=>v.products[0].exclusive_orders++,v=>v.products[0].known_exclusive_repass_cents++,v=>v.products[0].exclusive_after_costs_cents++,v=>v.products[0].exclusive_margin_bps++,v=>v.products[0].known_exclusive_tax_cents++,v=>v.products[0].variants[0].unit_cost_cents++,v=>v.products[0].variants[0].selling_unit='SINGLE_GARMENT_FAKE',v=>v.products[0].variants[0].model_id='011',v=>v.products[1].item_id=v.products[0].item_id,v=>v.products[0].pending.push('PAYMENT_INCOMPLETE'),v=>v.mixed_orders++,v=>v.known_mixed_sales_cents++,v=>v.products.reverse().push(copy(v.products[0]))];
 for(const mutate of mutations){const altered=copy(value);mutate(altered);assert.equal(projectBusinessMonthProducts(altered,f.frame),null);}
 let reads=0;const accessor=copy(value);Object.defineProperty(accessor.products[0].variants[0],'unit_cost_cents',{enumerable:true,get(){reads++;return 1000;}});assert.equal(projectBusinessMonthProducts(accessor,f.frame),null);assert.equal(reads,0);
});

test('browser source is closure-free and returns detached data with the same validated equations',()=>{
 const f=fixture(),value=build(f),context=vm.createContext();context.serialized=JSON.stringify({value,frame:f.frame});new vm.Script(projectBusinessMonthProducts.toString()+'\nconst input=JSON.parse(serialized);globalThis.actual=projectBusinessMonthProducts(input.value,input.frame);').runInContext(context);assert.deepEqual(JSON.parse(JSON.stringify(context.actual)),value);
 const result=projectBusinessMonthProducts(value,f.frame);result.products[0].variants[0].quantity=99;result.products[0].pending.push('PRIVATE');assert.equal(value.products[0].variants[0].quantity,1);assert.deepEqual(value.products[0].pending,[]);
});
