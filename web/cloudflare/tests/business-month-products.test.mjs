import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildBusinessMonthProducts,projectBusinessMonthProducts} from '../src/business-month-products.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {productionCostReference,COST_DEFAULTS} from '../src/production-costs.mjs';

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
function meiFixture({pending=false}={}){
 const f=fixture();
 f.frame.tax={schema:'business_month_tax_v1',regime:'MEI',year:2026,policy_revision:pending?0:1,monthly_das_cents:pending?null:8605,tax_cents:pending?null:8605,status:pending?'PENDING':'DECLARED',source:pending?'DAS_REQUIRED':'OPERATOR_DECLARED_DAS',basis:'MONTHLY_COMPETENCE_NO_PRORATION'};
 f.frame.known_invoice_tax_cents=pending?null:8605;
 if(pending)f.frame.result.pending=['TAX_POLICY_REQUIRED'];
 return f;
}

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

test('explicit order capacity admits twenty-order and mixed legacy/current page imports without changing product money',()=>{
 const f=fixture(),legacy=build(f);assert.ok(legacy);
 f.frame.progress.order_capacity=20;f.frame.coverage.cancelled+=15;f.frame.coverage.orders+=15;
 assert.deepEqual(projectBusinessMonthProducts(legacy,f.frame),legacy,'a twenty-order page can contain the same paid subset and more cancelled orders');
 assert.deepEqual(build(f),legacy);
 f.frame.progress.pages_read=2;f.frame.progress.order_capacity=25;
 assert.deepEqual(projectBusinessMonthProducts(legacy,f.frame),legacy,'one legacy page and one current page retain their summed capacity');
 const context=vm.createContext();context.serialized=JSON.stringify({value:legacy,frame:f.frame});
 new vm.Script(projectBusinessMonthProducts.toString()+'\nconst input=JSON.parse(serialized);globalThis.actual=projectBusinessMonthProducts(input.value,input.frame);').runInContext(context);
 assert.deepEqual(JSON.parse(JSON.stringify(context.actual)),legacy,'the browser projector preserves optional progress capacity');
});

test('optional order capacity rejects malformed values, impossible bounds and accessors before releasing a product report',()=>{
 const f=fixture(),value=build(f);
 for(const capacity of [undefined,null,-0,-1,4,21,5.5,'20',NaN,Infinity,Number.MAX_SAFE_INTEGER]){
  const frame=copy(f.frame);frame.progress.order_capacity=capacity;
  assert.equal(projectBusinessMonthProducts(value,frame),null,String(capacity));
 }
 for(const mutate of [
  frame=>{frame.progress.pages_read=2;frame.progress.order_capacity=9;},
  frame=>{frame.progress.pages_read=2;frame.progress.order_capacity=41;},
  frame=>{frame.progress.order_capacity=20;frame.coverage.orders=21;frame.coverage.cancelled=17;},
  frame=>{frame.progress.pages_read=-1;frame.progress.order_capacity=20;},
  frame=>{frame.progress.pages_read=201;frame.progress.order_capacity=1005;},
  frame=>{frame.progress.pages_read='1';frame.progress.order_capacity=20;},
  frame=>{frame.progress.order_capacity=20;frame.progress.extra=1;},
 ]){const frame=copy(f.frame);mutate(frame);assert.equal(projectBusinessMonthProducts(value,frame),null);}
 let reads=0;const frame=copy(f.frame);Object.defineProperty(frame.progress,'order_capacity',{enumerable:true,get(){reads++;return 20;}});
 assert.equal(projectBusinessMonthProducts(value,frame),null);assert.equal(reads,0);
 assert.deepEqual(projectBusinessMonthProducts(value,f.frame),value,'old three-field progress remains supported');
});

test('an unmapped variant sold only in mixed orders keeps all-production pending without blocking the exclusive subset',()=>{
 const f=fixture();f.refs[1].unit_cost_cents=null;f.refs[1].production_cost_cents=null;f.bindings.bindings.splice(1,1);f.frame.known_production_cost_cents=5000;f.frame.production_cost_cents=null;f.frame.unmapped_variants=[{item_id:'201',model_id:'11',quantity:2}];f.frame.result.pending=['PRODUCTION_COST_INCOMPLETE'];
 const value=build(f);assert.ok(value);const row=value.products[0];assert.equal(row.known_production_cost_cents,1000);assert.equal(row.production_cost_cents,null);assert.equal(row.exclusive_production_cost_cents,1000);assert.equal(row.exclusive_after_costs_cents,6800);assert.deepEqual(row.pending,[]);assert.equal(row.variants[1].exclusive_production_cost_cents,0);assert.equal(row.variants[1].size,null);
});

test('missing exclusive Payment preserves its quantity and cost but never creates zero sales or a complete contribution',()=>{
 const f=fixture(),row=f.source.product_breakdown.products[0];row.exclusive_payment_covered=0;row.exclusive_payment_missing=1;row.exclusive_returns_unknown=1;for(const name of ['sales_base','expected_repass','invoice_tax','ads_adjustment']){row['known_exclusive_'+name+'_raw']='0';row['exclusive_'+name+'_raw']=null;}
 f.source.coverage.payment_covered=2;f.source.coverage.payment_missing=1;f.source.coverage.returns_unknown=1;f.frame.coverage=copy(f.source.coverage);f.frame.known_sales_cents=16000;f.frame.known_expected_repass_cents=12000;f.frame.known_invoice_tax_cents=320;f.frame.ads_adjustment_cents=null;f.frame.result.pending=['PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED'];
 const value=build(f);assert.ok(value);const out=value.products[0];assert.equal(out.quantity,3);assert.equal(out.production_cost_cents,3400);assert.equal(out.known_exclusive_sales_cents,0);assert.equal(out.exclusive_sales_cents,null);assert.equal(out.exclusive_after_costs_cents,null);assert.equal(out.known_exclusive_after_costs_cents,null);assert.deepEqual(out.pending,['PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED']);
});

test('returns and unclassified or cancelling orders block contribution without hiding known values',()=>{
 for(const field of ['exclusive_returns','exclusive_returns_unknown']){const f=fixture();f.source.product_breakdown.products[0][field]=1;f.frame.coverage[field==='exclusive_returns'?'returns':'returns_unknown']=1;const value=build(f);assert.ok(value);assert.equal(value.products[0].exclusive_repass_cents,8000);assert.equal(value.products[0].exclusive_after_costs_cents,null);assert.equal(value.products[0].known_exclusive_after_costs_cents,null);assert.deepEqual(value.products[0].pending,['RETURNS_NOT_RECONCILED']);assert.equal(value.products[1].exclusive_after_costs_cents,2380);}
 for(const field of ['cancel_pending','other','unknown']){const f=fixture();f.frame.coverage[field]=1;f.frame.coverage.orders++;const value=build(f);assert.ok(value);assert.ok(value.products.every(row=>row.exclusive_after_costs_cents===null&&row.pending.includes('STATUS_REVIEW_REQUIRED')));}
 const f=fixture();f.frame.result.pending=['SOURCE_UNAVAILABLE'];assert.ok(build(f).products.every(row=>row.pending.includes('SOURCE_UNAVAILABLE')));
});

test('mixed-only products never claim a zero or allocated contribution',()=>{
 const f=fixture(),row=f.source.product_breakdown.products[0];row.exclusive_orders=0;row.orders=1;row.quantity=2;row.exclusive_payment_covered=0;row.items.splice(0,1);for(const [key] of Object.entries(money('0','0','0')))row[key]='0';
 f.frame.coverage.paid=2;f.frame.coverage.completed=1;f.frame.coverage.payment_covered=2;f.frame.coverage.orders=4;f.frame.known_sales_cents=16000;f.frame.known_expected_repass_cents=12000;f.frame.known_invoice_tax_cents=320;f.frame.known_production_cost_cents=6400;f.frame.production_cost_cents=6400;f.refs.splice(0,1);
 const value=build(f);assert.ok(value);assert.equal(value.products[0].exclusive_repass_cents,0);assert.equal(value.products[0].exclusive_after_costs_cents,null);assert.equal(value.products[0].known_exclusive_after_costs_cents,null);assert.equal(value.products[0].exclusive_margin_bps,null);assert.deepEqual(value.products[0].pending,['NO_EXCLUSIVE_ORDERS']);
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

test('custom products without garment bindings use one full cost per sold unit and preserve exclusive versus mixed quantities',()=>{
 const f=fixture();f.bindings.bindings=[];
 f.refs=f.refs.map((row,index)=>({...row,cost_source:'CUSTOM_PROFILE',cost_profile_id:['calca','moletom','kit-casal'][index],cost_profile_label:['Calça','Moletom','Kit casal'][index]}));
 const value=build(f);assert.ok(value);const [a,b]=value.products;
 assert.equal(a.production_cost_cents,3400);assert.equal(a.exclusive_production_cost_cents,1000);assert.equal(a.exclusive_after_costs_cents,6800);
 assert.equal(b.production_cost_cents,4000);assert.equal(b.exclusive_production_cost_cents,2000);assert.equal(b.exclusive_after_costs_cents,2380);
 for(const product of value.products)for(const variant of product.variants){assert.equal(variant.selling_unit,'CUSTOM_PRODUCT');assert.equal(variant.size,null);assert.equal(variant.male_size,null);assert.equal(variant.female_size,null);assert.ok(variant.cost_profile_id);assert.ok(variant.cost_profile_label);}
 assert.deepEqual(projectBusinessMonthProducts(value,f.frame),value);
 const context=vm.createContext();context.serialized=JSON.stringify({value,frame:f.frame});new vm.Script(projectBusinessMonthProducts.toString()+'\nconst input=JSON.parse(serialized);globalThis.actual=projectBusinessMonthProducts(input.value,input.frame);').runInContext(context);assert.deepEqual(JSON.parse(JSON.stringify(context.actual)),value);
 const detached=projectBusinessMonthProducts(value,f.frame);detached.products[0].variants[0].cost_profile_label='Alterado';assert.equal(value.products[0].variants[0].cost_profile_label,'Calça');
});

test('custom cost references take precedence over existing garment compositions without inheriting shirt or kit sizes',()=>{
 const f=fixture();f.refs[2]={...f.refs[2],cost_source:'CUSTOM_PROFILE',cost_profile_id:'moletom',cost_profile_label:'Moletom'};
 const value=build(f);assert.ok(value);const row=value.products[1];
 assert.equal(row.variants[0].selling_unit,'CUSTOM_PRODUCT');assert.equal(row.variants[0].male_size,null);assert.equal(row.variants[0].female_size,null);assert.equal(row.variants[0].cost_profile_label,'Moletom');assert.equal(row.production_cost_cents,4000);
 assert.equal(value.products[0].variants[0].selling_unit,'SINGLE_GARMENT');assert.equal(Object.hasOwn(value.products[0].variants[0],'cost_profile_id'),false);
});

test('custom monthly variants require exact bounded profile metadata and cannot add metadata to legacy shapes',()=>{
 const f=fixture();f.bindings.bindings=[];f.refs=f.refs.map(row=>({...row,cost_source:'CUSTOM_PROFILE',cost_profile_id:'calca',cost_profile_label:'Calça'}));
 const value=build(f);assert.ok(value);
 const mutations=[v=>delete v.cost_profile_id,v=>v.cost_profile_id='CALCA',v=>v.cost_profile_id='a'.repeat(65),v=>v.cost_profile_label='',v=>v.cost_profile_label=' Calça',v=>v.cost_profile_label='x'.repeat(61),v=>v.cost_profile_label='Calça\u0000',v=>v.size='P',v=>v.male_size='M',v=>v.unit_cost_cents=0,v=>v.unit_cost_cents=1000001,v=>v.selling_unit='SINGLE_GARMENT',v=>v.access_token='PRIVATE'];
 for(const mutate of mutations){const altered=copy(value);mutate(altered.products[0].variants[0]);assert.equal(projectBusinessMonthProducts(altered,f.frame),null);}
 let reads=0;for(const field of ['cost_profile_id','cost_profile_label','selling_unit']){const altered=copy(value);Object.defineProperty(altered.products[0].variants[0],field,{enumerable:true,get(){reads++;return 'PRIVATE';}});assert.equal(projectBusinessMonthProducts(altered,f.frame),null);}assert.equal(reads,0);
 const legacy=build(fixture());legacy.products[0].variants[0].cost_profile_id='calca';assert.equal(projectBusinessMonthProducts(legacy,f.frame),null);
});

test('product-wide profiles and variation overrides flow from the actual cost reference into the monthly sidecar without bindings',()=>{
 const f=fixture();f.bindings.bindings=[];
 const costs={revision:f.frame.costs_revision,values:{...COST_DEFAULTS,components:[],custom_profiles:[{id:'calca',label:'Calça moletom',unit_cost_cents:1000},{id:'calca-gg',label:'Calça GG',unit_cost_cents:1200},{id:'kit-casal',label:'Kit casal',unit_cost_cents:2000}],custom_assignments:[{item_id:'201',model_id:null,profile_id:'calca'},{item_id:'201',model_id:'11',profile_id:'calca-gg'},{item_id:'202',model_id:null,profile_id:'kit-casal'}]}};
 const reference=productionCostReference({status:'AVAILABLE',rows:f.source.items},f.bindings,costs);assert.equal(reference.total_cents,7400);assert.equal(reference.unmapped_quantity,0);
 f.refs=reference.variants;const value=build(f);assert.ok(value);assert.equal(value.products[0].variants[0].cost_profile_label,'Calça moletom');assert.equal(value.products[0].variants[1].cost_profile_label,'Calça GG');assert.equal(value.products[1].variants[0].cost_profile_label,'Kit casal');assert.equal(value.products[0].exclusive_after_costs_cents,6800);assert.equal(value.products[1].exclusive_after_costs_cents,2380);
});

test('MEI product balances exclude the old per-order estimate and never allocate the monthly DAS to products',()=>{
 const f=meiFixture(),value=build(f);assert.ok(value);
 assert.equal(value.tax_treatment,'MONTHLY_DAS_NOT_ALLOCATED');assert.equal(value.known_mixed_tax_cents,0);
 const [a,b]=value.products;
 assert.equal(a.known_exclusive_tax_cents,0);assert.equal(a.exclusive_tax_cents,0);assert.equal(a.exclusive_after_costs_cents,7000);assert.equal(a.exclusive_margin_bps,7000);
 assert.equal(b.known_exclusive_tax_cents,0);assert.equal(b.exclusive_tax_cents,0);assert.equal(b.exclusive_after_costs_cents,2500);assert.equal(b.exclusive_margin_bps,4166);
 // The remaining mixed-order payout less its production is 3100. The three
 // subsets reconcile before deducting DAS exactly once at the monthly level.
 assert.equal(a.exclusive_after_costs_cents+b.exclusive_after_costs_cents+3100,f.frame.known_expected_repass_cents-f.frame.production_cost_cents);
 assert.equal(f.frame.known_expected_repass_cents-f.frame.production_cost_cents-f.frame.tax.tax_cents,3995);
 assert.deepEqual(projectBusinessMonthProducts(value,f.frame),value);
 const legacy=build(fixture());assert.equal(Object.hasOwn(legacy,'tax_treatment'),false);assert.equal(legacy.products[0].exclusive_tax_cents,200);
});

test('more MEI orders or disjoint windows do not multiply the fixed monthly DAS or create product tax',()=>{
 const f=meiFixture(),source=copy(f.source);source.run_id='22222222-2222-4222-8222-222222222222';source.start_date='2026-10-16';source.end_date='2026-10-30';
 const frame=copy(f.frame);frame.progress={windows_total:2,windows_complete:2,pages_read:2};for(const key of Object.keys(frame.coverage))frame.coverage[key]*=2;for(const key of ['known_sales_cents','known_expected_repass_cents','known_production_cost_cents','production_cost_cents'])frame[key]*=2;
 const refs=f.refs.map(row=>({...row,quantity:row.quantity*2,production_cost_cents:row.production_cost_cents*2}));
 const value=buildBusinessMonthProducts([f.source,source],frame,refs,f.bindings);assert.ok(value);
 assert.equal(frame.known_invoice_tax_cents,8605);assert.equal(value.known_mixed_tax_cents,0);assert.equal(value.products[0].exclusive_after_costs_cents,14000);assert.equal(value.products[1].exclusive_after_costs_cents,5000);
 assert.ok(value.products.every(row=>row.exclusive_tax_cents===0&&row.known_exclusive_tax_cents===0));
});

test('a zero-sales MEI month keeps its full monthly DAS while the product report remains empty',()=>{
 const f=meiFixture();for(const key of Object.keys(f.frame.coverage))f.frame.coverage[key]=0;
 for(const key of ['known_sales_cents','known_expected_repass_cents','known_production_cost_cents','production_cost_cents'])f.frame[key]=0;
 const empty={status:'COMPLETE',product_breakdown:{schema:'business_product_breakdown_v1',mixed_orders:0,mixed_payment_covered:0,mixed_payment_missing:0,known_mixed_sales_base_raw:'0',known_mixed_expected_repass_raw:'0',known_mixed_ads_adjustment_raw:'0',known_mixed_invoice_tax_raw:'0',products:[]}};
 const value=buildBusinessMonthProducts([empty],f.frame,[],f.bindings);assert.ok(value);assert.deepEqual(value.products,[]);assert.equal(value.known_mixed_tax_cents,0);assert.equal(value.tax_treatment,'MONTHLY_DAS_NOT_ALLOCATED');assert.equal(f.frame.known_invoice_tax_cents,8605);
});

test('an unknown MEI DAS remains pending in the month without inventing a tax charge for products',()=>{
 const f=meiFixture({pending:true}),value=build(f);assert.ok(value);
 assert.equal(f.frame.known_invoice_tax_cents,null);assert.equal(value.tax_treatment,'MONTHLY_DAS_NOT_ALLOCATED');assert.equal(value.known_mixed_tax_cents,0);assert.equal(value.products[0].exclusive_after_costs_cents,7000);assert.equal(value.products[1].exclusive_after_costs_cents,2500);
 const context=vm.createContext();context.serialized=JSON.stringify({value,frame:f.frame});new vm.Script(projectBusinessMonthProducts.toString()+'\nconst input=JSON.parse(serialized);globalThis.actual=projectBusinessMonthProducts(input.value,input.frame);').runInContext(context);assert.deepEqual(JSON.parse(JSON.stringify(context.actual)),value);
});

test('stale monthly financial readings retain known product values but block a newly claimed exclusive balance',()=>{
 for(const codes of [['FINANCIAL_SOURCE_STALE'],['SOURCE_UNAVAILABLE','FINANCIAL_SOURCE_STALE']]){
  const f=meiFixture();f.frame.result.pending=codes;const value=build(f);assert.ok(value);
  assert.ok(value.products.every(row=>row.exclusive_after_costs_cents===null&&row.exclusive_margin_bps===null));
  assert.ok(value.products.every(row=>row.pending.length===1&&row.pending[0]==='SOURCE_UNAVAILABLE'));
  assert.equal(value.products[0].exclusive_repass_cents,8000);assert.equal(value.products[0].exclusive_production_cost_cents,1000);
  assert.deepEqual(projectBusinessMonthProducts(value,f.frame),value);
 }
});

test('MEI projection rejects invented allocation, mismatched treatment and tax metadata without executing accessors',()=>{
 const f=meiFixture(),value=build(f);assert.ok(value);
 for(const mutate of [v=>delete v.tax_treatment,v=>v.tax_treatment='PER_PRODUCT_DAS',v=>v.known_mixed_tax_cents=1,v=>v.products[0].known_exclusive_tax_cents=200,v=>v.products[0].exclusive_tax_cents=200]){const altered=copy(value);mutate(altered);assert.equal(projectBusinessMonthProducts(altered,f.frame),null);}
 const legacy=fixture();assert.equal(projectBusinessMonthProducts(value,legacy.frame),null);
 for(const mutate of [t=>t.regime='SIMPLES',t=>t.schema='unknown',t=>t.year=0,t=>t.policy_revision=0,t=>t.monthly_das_cents=0,t=>t.tax_cents=8606,t=>t.source='GUESSED_DAS',t=>t.status='PENDING',t=>t.basis='PER_ORDER',t=>t.private='PRIVATE']){const frame=copy(f.frame);mutate(frame.tax);assert.equal(projectBusinessMonthProducts(value,frame),null);}
 let reads=0;
 for(const field of ['schema','regime','tax_cents']){const frame=copy(f.frame);Object.defineProperty(frame.tax,field,{enumerable:true,get(){reads++;return 'PRIVATE';}});assert.equal(projectBusinessMonthProducts(value,frame),null);assert.equal(buildBusinessMonthProducts([f.source],frame,f.refs,f.bindings),null);}
 const frame=copy(f.frame);Object.defineProperty(frame,'tax',{enumerable:true,get(){reads++;return f.frame.tax;}});assert.equal(projectBusinessMonthProducts(value,frame),null);assert.equal(buildBusinessMonthProducts([f.source],frame,f.refs,f.bindings),null);
 const altered=copy(value);Object.defineProperty(altered,'tax_treatment',{enumerable:true,get(){reads++;return 'MONTHLY_DAS_NOT_ALLOCATED';}});assert.equal(projectBusinessMonthProducts(altered,f.frame),null);assert.equal(reads,0);
 const source=copy(f.source);source.product_breakdown.known_mixed_invoice_tax_raw='not-money';assert.equal(buildBusinessMonthProducts([source],f.frame,f.refs,f.bindings),null);
});

test('a fully covered product retains its observed exclusive subtotal when other month statuses and source age block the final balance',()=>{
 const f=meiFixture(),itemId='58217763082';
 for(const row of f.source.product_breakdown.products)if(row.item_id==='201')Object.assign(row,{item_id:itemId,known_exclusive_expected_repass_raw:'21.98',exclusive_expected_repass_raw:'21.98'});
 for(const row of f.source.items)if(row.item_id==='201')row.item_id=itemId;
 for(const row of f.refs)if(row.item_id==='201')row.item_id=itemId;
 for(const row of f.bindings.bindings)if(row.item_id==='201')row.item_id=itemId;
 Object.assign(f.refs[0],{unit_cost_cents:1590,production_cost_cents:1590});
 f.source.known_expected_repass_raw=f.source.expected_repass_raw='141.98';f.source.coverage.cancel_pending=1;f.source.coverage.orders++;f.source.pages_read=2;f.frame.progress.pages_read=2;
 f.frame.coverage=copy(f.source.coverage);f.frame.known_expected_repass_cents=14198;f.frame.known_production_cost_cents=f.frame.production_cost_cents=7990;
 f.frame.result.pending=['STATUS_REVIEW_REQUIRED','FINANCIAL_SOURCE_STALE'];
 assert.ok(projectBusinessPeriodFrame(f.source));
 const value=build(f);assert.ok(value);const product=value.products.find(row=>row.item_id===itemId);
 assert.equal(product.exclusive_repass_cents,2198);assert.equal(product.exclusive_production_cost_cents,1590);
 assert.equal(product.known_exclusive_after_costs_cents,608);assert.equal(product.exclusive_after_costs_cents,null);
 assert.equal(product.exclusive_margin_bps,null);assert.deepEqual(product.pending,['STATUS_REVIEW_REQUIRED','SOURCE_UNAVAILABLE']);
 assert.equal(f.frame.tax.tax_cents,8605);assert.equal(product.exclusive_tax_cents,0,'the monthly DAS is not assigned to an observed product subset');
 const context=vm.createContext();context.serialized=JSON.stringify({value,frame:f.frame});new vm.Script(projectBusinessMonthProducts.toString()+'\nconst input=JSON.parse(serialized);globalThis.actual=projectBusinessMonthProducts(input.value,input.frame);').runInContext(context);assert.deepEqual(JSON.parse(JSON.stringify(context.actual)),value);
});

test('the observed subtotal uses only complete exclusive costs, keeps mixed quantities separate and never pairs partial payments with all costs',()=>{
 const f=meiFixture();f.frame.result.pending=['SOURCE_UNAVAILABLE'];
 f.refs[1].unit_cost_cents=null;f.refs[1].production_cost_cents=null;f.bindings.bindings.splice(1,1);f.frame.known_production_cost_cents=5000;f.frame.production_cost_cents=null;f.frame.unmapped_variants=[{item_id:'201',model_id:'11',quantity:2}];
 let value=build(f);assert.ok(value);assert.equal(value.products[0].production_cost_cents,null);assert.equal(value.products[0].known_exclusive_after_costs_cents,7000,'a missing mixed-only cost does not change the complete exclusive subtotal');assert.equal(value.products[0].exclusive_after_costs_cents,null);
 f.refs[0].unit_cost_cents=null;f.refs[0].production_cost_cents=null;f.frame.known_production_cost_cents=4000;f.frame.unmapped_variants.push({item_id:'201',model_id:'10',quantity:1});
 value=build(f);assert.ok(value);assert.equal(value.products[0].known_exclusive_after_costs_cents,null,'an exclusive cost gap blocks even the observed subtotal');
});

test('legacy product rows remain compatible while optional observed subtotals reject forged values, negative zero and getters',()=>{
 const f=fixture(),value=build(f);assert.ok(value);assert.equal(value.products[0].known_exclusive_after_costs_cents,6800,'legacy percentage tax stays in the legacy equation');
 const legacy=copy(value);for(const row of legacy.products)delete row.known_exclusive_after_costs_cents;assert.deepEqual(projectBusinessMonthProducts(legacy,f.frame),legacy);
 for(const amount of [null,6799,6801,'6800',NaN,Infinity]){const forged=copy(value);forged.products[0].known_exclusive_after_costs_cents=amount;assert.equal(projectBusinessMonthProducts(forged,f.frame),null);}
 let reads=0;const getter=copy(value);Object.defineProperty(getter.products[0],'known_exclusive_after_costs_cents',{enumerable:true,get(){reads++;return 6800;}});assert.equal(projectBusinessMonthProducts(getter,f.frame),null);assert.equal(reads,0);
 const zero=fixture();Object.assign(zero.source.product_breakdown.products[0],{known_exclusive_expected_repass_raw:'12',exclusive_expected_repass_raw:'12'});zero.frame.known_expected_repass_cents=13200;
 const zeroValue=build(zero);assert.ok(zeroValue);assert.equal(zeroValue.products[0].known_exclusive_after_costs_cents,0);
 zeroValue.products[0].known_exclusive_after_costs_cents=-0;assert.equal(projectBusinessMonthProducts(zeroValue,zero.frame),null);
});

const catalogBinding=(row,unit='SINGLE_GARMENT')=>({item_id:row.item_id,model_id:row.model_id,selling_unit:unit,...(unit==='SINGLE_GARMENT'?{size:'M'}:{male_size:'G',female_size:'P'}),operator_confirmed:false,source:unit==='SINGLE_GARMENT'?'CATALOG_SIZE_AXIS':'CATALOG_VARIATION_AXES',catalog_fingerprint:'d'.repeat(64)});
test('normalized automatic garment classifications render without a global binding array and preserve explicit manual compositions',()=>{
 const f=fixture();f.bindings.bindings=[];for(const [index,row] of f.refs.entries())row.catalog_binding=catalogBinding(row,index===2?'ONE_MALE_ONE_FEMALE_KIT':'SINGLE_GARMENT');
 const value=build(f);assert.ok(value);assert.equal(value.products[0].variants[0].selling_unit,'SINGLE_GARMENT');assert.equal(value.products[0].variants[0].size,'M');assert.equal(value.products[1].variants[0].selling_unit,'ONE_MALE_ONE_FEMALE_KIT');assert.equal(value.products[1].variants[0].male_size,'G');assert.equal(value.products[1].variants[0].female_size,'P');assert.equal(Object.hasOwn(value.products[0].variants[0],'catalog_binding'),false);assert.equal(value.products[0].known_exclusive_after_costs_cents,6800);
 const manual=fixture();manual.bindings.bindings[0].operator_confirmed=true;manual.refs[0].catalog_binding=catalogBinding(manual.refs[0]);assert.equal(build(manual).products[0].variants[0].size,'P');
 const previous=fixture();previous.bindings.bindings[0].operator_confirmed=false;previous.refs[0].catalog_binding=catalogBinding(previous.refs[0]);assert.equal(build(previous).products[0].variants[0].size,'M');
});

test('normalized catalog binding provenance, identity and composition are checked without evaluating accessors',()=>{
 const mutations=[binding=>binding.item_id='999',binding=>binding.model_id='99',binding=>binding.operator_confirmed=true,binding=>binding.catalog_fingerprint='bad',binding=>binding.source='GUESS',binding=>binding.size='4',binding=>binding.selling_unit='CUSTOM_PRODUCT',binding=>binding.private='PRIVATE'];
 for(const mutate of mutations){const f=fixture();f.bindings.bindings=[];for(const [index,row] of f.refs.entries())row.catalog_binding=catalogBinding(row,index===2?'ONE_MALE_ONE_FEMALE_KIT':'SINGLE_GARMENT');mutate(f.refs[0].catalog_binding);assert.equal(build(f),null);}
 let reads=0;
 for(const field of ['catalog_binding','size']){const f=fixture();f.bindings.bindings=[];for(const [index,row] of f.refs.entries())row.catalog_binding=catalogBinding(row,index===2?'ONE_MALE_ONE_FEMALE_KIT':'SINGLE_GARMENT');if(field==='catalog_binding')Object.defineProperty(f.refs[0],field,{enumerable:true,get(){reads++;return catalogBinding(f.refs[0]);}});else Object.defineProperty(f.refs[0].catalog_binding,field,{enumerable:true,get(){reads++;return 'M';}});assert.equal(build(f),null);assert.equal(reads,0);}
});
