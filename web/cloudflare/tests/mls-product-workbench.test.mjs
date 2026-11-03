import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildMlsProductIntelligence,simulateMlsPricingScenario} from '../src/mls-product-intelligence.mjs';
import {buildMlsProductWorkbench,simulateMlsPricingWorkbench} from '../src/mls-product-workbench.mjs';

const row=(item_id,quantity,sales,balance,cost)=>({item_id,quantity,orders:1,exclusive_orders:1,mixed_orders:0,pending:[],exclusive_sales_cents:sales,exclusive_after_costs_cents:balance,exclusive_margin_bps:Number(BigInt(balance)*10000n/BigInt(sales)),variants:[{model_id:'1',quantity,unit_cost_cents:cost}]});
const source=()=>({status:'COMPLETE',month:'2026-10',result:{pending:[]},product_summary:{schema:'business_month_products_v1',mixed_orders:0,products:[row('301',80,80000,20000,500),row('302',15,15000,3500,700),row('303',5,5000,-400,1200)]}});
const report=()=>buildMlsProductIntelligence(source());
const catalog=()=>[{item_id:'301',product_name:'Camiseta Universo',variants:[{model_id:'1',model_name:'Preto / M',attributes:[{name:'Cor',value:'Preto'},{name:'Tamanho',value:'M'}]}]}];
const input=()=>({unit_cost_cents:1000,extra_cost_cents:200,fee_bps:1000,ads_bps:500,target_margin_bps:2000});
const deepFreeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;};

test('workbench derives quantity ABC coverage and current labels without manufacturing or variant-profit inference',()=>{
 const result=buildMlsProductWorkbench(report(),catalog());assert.ok(result);
 assert.equal(result.schema,'mls_product_workbench_v1');assert.equal(result.total_products,3);assert.equal(result.total_variants,3);
 assert.deepEqual(result.products.map(p=>[p.item_id,p.abc_units,p.quantity_share_bps,p.cumulative_quantity_bps]),[['301','A',8000,8000],['302','B',1500,9500],['303','C',500,10000]]);
 assert.deepEqual(result.coverage,{total_units:100,total_variants:3,known_units:100,pending_units:0,known_variants:3,pending_variants:0,known_production_cost_cents:56500,production_complete:true});
 assert.equal(result.products[0].product_name,'Camiseta Universo');assert.equal(result.products[0].variants[0].model_name,'Preto / M');assert.deepEqual(result.products[0].variants[0].attributes,[{name:'Cor',value:'Preto'},{name:'Tamanho',value:'M'}]);
 assert.equal(result.products[2].exclusive_after_costs_cents,-400);assert.equal(result.products[2].exclusive_margin_bps,-800);
 assert.equal(result.covered_exclusive_balance_cents,23100);assert.equal(result.inventory_verified,false);assert.equal(result.execution_allowed,false);assert.equal(result.safe_price_cents,null);assert.equal(result.safe_sku_net_profit_cents,null);
 assert.match(result.cost_basis,/REFERENCE_NOT_MANUFACTURING_LEDGER/);
 for(const product of result.products)for(const variant of product.variants){assert.equal(variant.margin_bps,null);assert.equal(variant.net_profit_cents,null);assert.equal(variant.safe_price_cents,null);}
});

test('unknown mixed-order costs remain pending while the separately covered exclusive subset is preserved',()=>{
 const frame=source(),p=frame.product_summary.products[0];frame.product_summary.mixed_orders=1;p.mixed_orders=1;p.orders=2;p.variants=[{model_id:'1',quantity:77,unit_cost_cents:500},{model_id:'2',quantity:3,unit_cost_cents:null}];
 const result=buildMlsProductWorkbench(buildMlsProductIntelligence(frame));assert.ok(result);
 assert.equal(result.ranking.revenue_abc_status,'BLOCKED_INCOMPLETE_OR_MIXED_ORDERS');assert.ok(result.products.every(p=>p.abc_revenue===null));
 assert.equal(result.products[0].exclusive_after_costs_cents,20000);assert.deepEqual(result.products[0].pending,[]);assert.deepEqual(result.products[0].pending_reasons,['PRODUCTION_COST_INCOMPLETE']);
 assert.equal(result.coverage.pending_units,3);assert.equal(result.coverage.known_units,97);assert.equal(result.coverage.pending_variants,1);assert.equal(result.coverage.known_production_cost_cents,55000);
 assert.equal(result.products[0].production_cost_cents,null);assert.equal(result.products[0].known_production_cost_cents,38500);assert.equal(result.products[0].variants[1].production_cost_cents,null);
});

test('returns and financial-review nulls stay unknown; no shop fees, Ads or monthly tax are allocated to variants',()=>{
 const frame=source();frame.product_summary.products[0].pending=['RETURNS_NOT_RECONCILED'];
 let result=buildMlsProductWorkbench(buildMlsProductIntelligence(frame));assert.equal(result.products[0].exclusive_after_costs_cents,null);assert.equal(result.products[0].exclusive_margin_bps,null);assert.deepEqual(result.products[0].pending_reasons,['RETURNS_NOT_RECONCILED']);assert.equal(result.exclusive_balance_covered_products,2);assert.equal(result.covered_exclusive_balance_cents,3100);
 frame.result.pending=['STATUS_REVIEW_REQUIRED'];result=buildMlsProductWorkbench(buildMlsProductIntelligence(frame));assert.ok(result.products.every(p=>p.exclusive_after_costs_cents===null&&p.exclusive_margin_bps===null));assert.equal(result.exclusive_balance_covered_products,0);assert.equal(result.exclusive_balance_unverified_products,3);
 assert.equal(result.safe_sku_net_profit_cents,null);assert.ok(result.blockers.includes('ADS_ATTRIBUTION_NOT_VERIFIED'));assert.ok(result.blockers.includes('OFFICIAL_FEE_CONTRACT_NOT_VERIFIED'));
 assert.ok(result.products.flatMap(p=>p.variants).every(v=>v.margin_bps===null));
});

test('a kit cost is multiplied once by its listing quantity and zero references are distinct from missing costs',()=>{
 const frame=source();frame.product_summary.products=[row('9',3,20000,1000,3180)];
 let result=buildMlsProductWorkbench(buildMlsProductIntelligence(frame),[{item_id:'9',product_name:'Kit duas camisetas',variants:[{model_id:'1',model_name:'P + M',attributes:[]}]}]);
 assert.equal(result.total_units,3);assert.equal(result.coverage.known_production_cost_cents,9540);assert.equal(result.products[0].variants[0].production_cost_cents,9540);
 frame.product_summary.products[0].variants[0].unit_cost_cents=0;result=buildMlsProductWorkbench(buildMlsProductIntelligence(frame));assert.equal(result.coverage.known_units,3);assert.equal(result.coverage.pending_units,0);assert.equal(result.coverage.known_production_cost_cents,0);assert.equal(result.coverage.production_complete,true);
});

test('empty observed report and the 3000-variant boundary remain bounded',()=>{
 const frame=source();frame.product_summary.products=[];let result=buildMlsProductWorkbench(buildMlsProductIntelligence(frame));assert.equal(result.total_units,0);assert.equal(result.total_variants,0);assert.deepEqual(result.products,[]);assert.equal(result.execution_allowed,false);
 frame.product_summary.products=[row('1',3000,30000,0,1)];frame.product_summary.products[0].variants=Array.from({length:3000},(_,n)=>({model_id:String(n),quantity:1,unit_cost_cents:1}));
 const value=buildMlsProductIntelligence(frame);result=buildMlsProductWorkbench(value);assert.equal(result.total_variants,3000);assert.equal(result.coverage.known_production_cost_cents,3000);
 const bad=structuredClone(value);bad.variants.push({item_id:'1',model_id:'3000',quantity:1,unit_cost_cents:1});assert.equal(buildMlsProductWorkbench(bad),null);
});

test('financial report inconsistencies, duplicate identities, forged classes and unsafe arithmetic are rejected',()=>{
 for(const change of [
  r=>{r.total_units++;},r=>{r.total_products++;},r=>{r.exclusive_balance_covered_products--;},r=>{r.covered_exclusive_balance_cents++;},
  r=>{r.products[0].quantity=-0;},r=>{r.variants[0].quantity--;},r=>{r.variants[0].item_id='999';},r=>{r.variants.push({...r.variants[0]});},
  r=>{r.products[1].item_id=r.products[0].item_id;},r=>{r.products[0].exclusive_margin_bps++;},r=>{r.products[0].abc_units='B';},r=>{r.products[0].abc_revenue='C';},
  r=>{r.products[0].orders++;},r=>{r.variants[0].unit_cost_cents=NaN;},r=>{r.execution_allowed=true;},r=>{r.safe_price_cents=100;},
  r=>{r.blockers=[];},r=>{r.incurred_production_cost_cents=999;},r=>{r.products.length++;},r=>{Object.setPrototypeOf(r,{});}
 ]){const value=report();change(value);assert.equal(buildMlsProductWorkbench(value),null,change.toString());}
 const frame=source();frame.product_summary.products=[row('1',Number.MAX_SAFE_INTEGER,10000,0,1)];let value=buildMlsProductIntelligence(frame);assert.ok(buildMlsProductWorkbench(value));value.variants[0].unit_cost_cents=2;assert.equal(buildMlsProductWorkbench(value),null);
 frame.product_summary.products=[row('1',50000000,10000,0,100000000),row('2',50000000,10000,0,100000000)];value=buildMlsProductIntelligence(frame);assert.equal(buildMlsProductWorkbench(value),null,'sums across individually safe products must also fit');
});

test('optional catalogue labels cannot override costs or execute accessors',()=>{
 let reads=0;const metadata=catalog();Object.defineProperty(metadata[0],'product_name',{enumerable:true,get(){reads++;return 'Untrusted';}});let result=buildMlsProductWorkbench(report(),metadata);assert.ok(result);assert.equal(result.products[0].product_name,null);assert.equal(reads,0);
 const extra=catalog();Object.defineProperty(extra[0],'unit_cost_cents',{enumerable:true,get(){reads++;return 1;}});result=buildMlsProductWorkbench(report(),extra);assert.equal(result.products[0].product_name,null);assert.equal(result.products[0].variants[0].unit_cost_cents,500);assert.equal(reads,0);
 const model=catalog();Object.defineProperty(model[0].variants[0],'model_name',{enumerable:true,get(){reads++;return 'Wrong';}});result=buildMlsProductWorkbench(report(),model);assert.equal(result.products[0].product_name,'Camiseta Universo');assert.equal(result.products[0].variants[0].model_name,null);assert.equal(reads,0);
 for(const mutate of [r=>Object.defineProperty(r,'total_units',{enumerable:true,get(){reads++;return 100;}}),r=>Object.defineProperty(r.products[0],'quantity',{enumerable:true,get(){reads++;return 80;}}),r=>Object.defineProperty(r.variants[0],'unit_cost_cents',{enumerable:true,get(){reads++;return 500;}})]){const value=report();mutate(value);assert.equal(buildMlsProductWorkbench(value),null);assert.equal(reads,0);}
});

test('ambiguous, excessive or malformed metadata loses labels while financial coverage remains unchanged',()=>{
 const first=catalog()[0],conflict={...structuredClone(first),product_name:'Outro produto'};
 let result=buildMlsProductWorkbench(report(),[first,conflict]);assert.equal(result.products[0].product_name,null);assert.equal(result.coverage.known_production_cost_cents,56500);
 const duplicate=catalog();duplicate[0].variants.push({...duplicate[0].variants[0],model_name:'Outra variação'});result=buildMlsProductWorkbench(report(),duplicate);assert.equal(result.products[0].variants[0].model_name,null);assert.deepEqual(result.products[0].variants[0].attributes,[]);
 const wrong=catalog();wrong[0].variants[0].attributes.push({name:'cor',value:'Azul'});result=buildMlsProductWorkbench(report(),wrong);assert.equal(result.products[0].variants[0].model_name,null);
 result=buildMlsProductWorkbench(report(),new Array(3001).fill(first));assert.equal(result.products[0].product_name,null);assert.equal(result.total_units,100);
 const html=catalog();html[0].product_name='Camiseta <img src=x>';result=buildMlsProductWorkbench(report(),html);assert.equal(result.products[0].product_name,'Camiseta <img src=x>','labels remain text; the view must use textContent');
});

test('workbench inputs and detached outputs are immutable, including nested metadata and assumptions',()=>{
 const value=deepFreeze(report()),metadata=deepFreeze(catalog()),before=JSON.stringify({value,metadata});const result=buildMlsProductWorkbench(value,metadata);
 assert.equal(JSON.stringify({value,metadata}),before);assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.products)&&Object.isFrozen(result.products[0].variants[0].attributes));assert.throws(()=>{result.products[0].quantity=1;},TypeError);
 const mutable=catalog(),detached=buildMlsProductWorkbench(report(),mutable);mutable[0].product_name='Changed';mutable[0].variants[0].attributes[0].value='Changed';assert.equal(detached.products[0].product_name,'Camiseta Universo');assert.equal(detached.products[0].variants[0].attributes[0].value,'Preto');
});

test('validated non-enumerable data fields retain the complete detached product and variant contract',()=>{
 const value=report();Object.defineProperty(value.products[0],'exclusive_margin_bps',{enumerable:false});
 for(const key of ['item_id','model_id','quantity','unit_cost_cents'])Object.defineProperty(value.variants[0],key,{enumerable:false});
 const result=buildMlsProductWorkbench(value,catalog());assert.ok(result);
 assert.equal(result.products[0].exclusive_margin_bps,2500);assert.ok(Object.keys(result.products[0]).includes('exclusive_margin_bps'));
 assert.deepEqual(result.products[0].variants[0],{item_id:'301',model_id:'1',quantity:80,unit_cost_cents:500,model_name:'Preto / M',attributes:[{name:'Cor',value:'Preto'},{name:'Tamanho',value:'M'}],production_cost_cents:40000,margin_bps:null,net_profit_cents:null,safe_price_cents:null});
 assert.equal(Object.getOwnPropertyDescriptor(value.products[0],'exclusive_margin_bps').enumerable,false);assert.equal(Object.getOwnPropertyDescriptor(value.variants[0],'unit_cost_cents').enumerable,false);
 assert.equal(result.coverage.known_production_cost_cents,56500);assert.ok(Object.isFrozen(result.products[0].variants[0]));
});

test('pricing workbench delegates two exact explicit scenarios with integer-ceiling equilibrium and target',()=>{
 const value=deepFreeze(input()),calls=[];const simulate=arg=>{calls.push(arg);return simulateMlsPricingScenario(arg);};const result=simulateMlsPricingWorkbench(value,simulate);
 assert.ok(result);assert.equal(result.equilibrium_price_cents,1412);assert.equal(result.target_price_cents,1847);assert.equal(result.supplied_cost_base_cents,1200);assert.equal(result.unit_cost_cents,1000);
 assert.deepEqual(calls.map(x=>x.target_margin_bps),[0,2000]);assert.ok(calls.every(Object.isFrozen));assert.deepEqual(Object.keys(calls[0]),Object.keys(value));
 assert.deepEqual(result.operator_assumptions,{fee_bps:1000,ads_bps:500,target_margin_bps:2000,extra_cost_cents:200});assert.equal(result.status,'SIMULATION_ONLY');assert.equal(result.safe_price_cents,null);assert.equal(result.may_publish,false);assert.equal(result.may_modify_ads,false);assert.equal(result.not_a_safe_price,true);assert.ok(result.warnings.includes('M2_NOT_CLOSED'));
 assert.ok(Object.isFrozen(result.operator_assumptions));assert.throws(()=>{result.operator_assumptions.fee_bps=1;},TypeError);
 const zero=simulateMlsPricingWorkbench({...value,extra_cost_cents:0,fee_bps:0,ads_bps:0,target_margin_bps:0},simulateMlsPricingScenario);assert.equal(zero.equilibrium_price_cents,1000);assert.equal(zero.target_price_cents,1000);
 const edge=simulateMlsPricingWorkbench({unit_cost_cents:100000000,extra_cost_cents:100000000,fee_bps:9000,ads_bps:999,target_margin_bps:0},simulateMlsPricingScenario);assert.equal(edge.target_price_cents,2000000000000);
});

test('missing assumptions, invalid delegates, forged prices or commercial flags never produce a pricing result',()=>{
 for(const change of [v=>{delete v.extra_cost_cents;},v=>{v.ads_bps=null;},v=>{v.unit_cost_cents=0;},v=>{v.extra_cost_cents=-0;},v=>{v.fee_bps=9001;},v=>{v.fee_bps=9000;v.ads_bps=1000;v.target_margin_bps=0;},v=>{v.fee_bps=0.5;},v=>{v.extra=true;}]){const value=input();change(value);assert.equal(simulateMlsPricingWorkbench(value,simulateMlsPricingScenario),null);}
 assert.equal(simulateMlsPricingWorkbench(input()),null);assert.equal(simulateMlsPricingWorkbench(input(),()=>{throw Error('unavailable');}),null);
 for(const mutate of [r=>{r.may_publish=true;},r=>{r.calculated_scenario_price_cents++;},r=>{r.supplied_cost_base_cents++;},r=>{r.warnings=[];},r=>{r.operator_assumptions.ads_bps++;}])assert.equal(simulateMlsPricingWorkbench(input(),arg=>{const result=simulateMlsPricingScenario(arg);mutate(result);return result;}),null);
 let reads=0;const value=input();Object.defineProperty(value,'fee_bps',{enumerable:true,get(){reads++;return 1000;}});assert.equal(simulateMlsPricingWorkbench(value,simulateMlsPricingScenario),null);assert.equal(reads,0);
 assert.equal(simulateMlsPricingWorkbench(input(),()=>Object.defineProperty({},'schema',{get(){reads++;return 'mls_pricing_simulation_v1';}})),null);assert.equal(reads,0);
});

test('both workbench functions run in isolated generated-script scopes with explicit dependencies only',()=>{
 const context=vm.createContext({serialized:JSON.stringify(report()),labels:JSON.stringify(catalog()),pricing:JSON.stringify(input())});
 vm.runInContext(buildMlsProductWorkbench.toString()+'\n'+simulateMlsPricingWorkbench.toString()+'\n'+simulateMlsPricingScenario.toString()+'\nresult=buildMlsProductWorkbench(JSON.parse(serialized),JSON.parse(labels));price=simulateMlsPricingWorkbench(JSON.parse(pricing),simulateMlsPricingScenario);',context);
 assert.equal(context.result.total_units,100);assert.equal(context.result.products[0].product_name,'Camiseta Universo');assert.equal(context.price.target_price_cents,1847);assert.equal(context.price.may_publish,false);
});
