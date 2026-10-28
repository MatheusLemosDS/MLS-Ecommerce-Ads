import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildMlsProductIntelligence,simulateMlsPricingScenario} from '../src/mls-product-intelligence.mjs';
import {businessMonthBody} from '../src/business-month-view.mjs';
import {BUSINESS_MONTH_CLIENT} from '../src/business-month-client.mjs';
import {missionWorkspacesBody} from '../src/mission-control.mjs';

const row=(id,quantity,sales,contribution)=>({
 item_id:id,quantity,orders:1,exclusive_orders:1,mixed_orders:0,pending:[],
 exclusive_sales_cents:sales,exclusive_after_costs_cents:contribution,
 exclusive_margin_bps:2400,
 variants:[{model_id:'1',quantity,unit_cost_cents:1200}]
});
const source=()=>({
 month:'2026-10',status:'COMPLETE',result:{pending:[]},
 product_summary:{schema:'business_month_products_v1',mixed_orders:0,products:[
  row('301',80,80000,20000),row('302',15,15000,3500),row('303',5,5000,-400)
 ]}
});

test('M3 ABC groups already saved sold units and separates them from inventory',()=>{
 const result=buildMlsProductIntelligence(source());
 assert.ok(result);assert.equal(result.total_units,100);assert.equal(result.total_products,3);
 assert.deepEqual(result.products.map(p=>[p.item_id,p.abc_units,p.abc_revenue]),[
  ['301','A','A'],['302','B','B'],['303','C','C']
 ]);
 assert.equal(result.units_abc_basis,'SOLD_UNITS_NOT_INVENTORY');
 assert.equal(result.inventory_verified,false);
 assert.equal(result.safe_sku_net_profit_cents,null);
 assert.equal(result.safe_price_cents,null);
 assert.equal(result.execution_allowed,false);
 assert.equal(result.covered_exclusive_balance_cents,23100);
});

test('mixed orders explicitly block revenue ABC and do not get allocated to products',()=>{
 const f=source();f.product_summary.mixed_orders=1;f.product_summary.products[0].mixed_orders=1;
 f.product_summary.products[0].orders=2;
 const r=buildMlsProductIntelligence(f);assert.ok(r);
 assert.equal(r.revenue_abc_status,'BLOCKED_INCOMPLETE_OR_MIXED_ORDERS');
 assert.equal(r.products[0].abc_revenue,null);
 assert.equal(r.products[0].abc_units,'A');
});

test('partial returns/payment/source evidence never becomes final SKU profit or sales ABC',()=>{
 const f=source();
 f.product_summary.products[1].pending=['RETURNS_NOT_RECONCILED'];
 f.product_summary.products[1].exclusive_after_costs_cents=null;
 f.product_summary.products[1].exclusive_margin_bps=null;
 const r=buildMlsProductIntelligence(f);
 assert.equal(r.exclusive_balance_covered_products,2);
 assert.equal(r.exclusive_balance_unverified_products,1);
 assert.equal(r.products[1].exclusive_after_costs_cents,null);
 assert.equal(r.revenue_abc_status,'BLOCKED_INCOMPLETE_OR_MIXED_ORDERS');
 assert.equal(r.safe_sku_net_profit_cents,null);
});

test('M3 refuses active, missing, malformed and duplicate sources without inventing zero',()=>{
 for(const value of [null,{}, {...source(),status:'RUNNING'},
   {...source(),product_summary:null},
   {...source(),product_summary:{schema:'wrong',mixed_orders:0,products:[]}},
   {...source(),product_summary:{schema:'business_month_products_v1',mixed_orders:0,products:[row('301',1,100,4),row('301',2,100,5)]}},
   {...source(),product_summary:{schema:'business_month_products_v1',mixed_orders:0,products:[row('301',-1,100,4)]}}
 ])assert.equal(buildMlsProductIntelligence(value),null);
});

test('zero observed products returns zero units without implying stock or pricing authorization',()=>{
 const f=source();f.product_summary.products=[];
 const r=buildMlsProductIntelligence(f);assert.ok(r);
 assert.equal(r.total_units,0);assert.equal(r.total_products,0);
 assert.equal(r.revenue_abc_status,'BLOCKED_INCOMPLETE_OR_MIXED_ORDERS');
 assert.equal(r.execution_allowed,false);
});

test('pricing scenario rounds upward in integer cents with only explicit assumptions',()=>{
 const input={unit_cost_cents:1000,extra_cost_cents:200,
  fee_bps:1000,ads_bps:500,target_margin_bps:2000};
 const r=simulateMlsPricingScenario(input);
 assert.equal(r.calculated_scenario_price_cents,1847);
 assert.equal(r.supplied_cost_base_cents,1200);
 assert.equal(r.status,'SIMULATION_ONLY');assert.equal(r.not_a_safe_price,true);
 assert.equal(r.may_publish,false);assert.equal(r.may_modify_ads,false);
 assert.ok(r.warnings.includes('M2_NOT_CLOSED'));
});

test('pricing refuses absent fees, zero unit cost, impossible percentages, negatives and fractional cents',()=>{
 const base={unit_cost_cents:1000,extra_cost_cents:0,fee_bps:1500,
  ads_bps:1000,target_margin_bps:2000};
 for(const bad of [{...base,unit_cost_cents:0},{...base,extra_cost_cents:-1},
  {...base,ads_bps:9000},{...base,fee_bps:9000},{...base,fee_bps:1.5},
  {...base,ads_bps:undefined},{...base,extra:'unexpected'},
  {unit_cost_cents:1000,extra_cost_cents:0,ads_bps:1000,target_margin_bps:2000}])
  assert.equal(simulateMlsPricingScenario(bad),null);
});

test('pricing and M3 processors can be embedded unchanged in a browser inline script',()=>{
 const context=vm.createContext({value:JSON.stringify(source()),input:JSON.stringify({
  unit_cost_cents:1000,extra_cost_cents:0,fee_bps:1000,ads_bps:0,target_margin_bps:2000
 })});
 new vm.Script(buildMlsProductIntelligence.toString()+
  '\n'+simulateMlsPricingScenario.toString()+
  '\nresult=buildMlsProductIntelligence(JSON.parse(value));'+
  '\nprice=simulateMlsPricingScenario(JSON.parse(input));'
 ).runInContext(context);
 assert.equal(context.result.total_products,3);
 assert.equal(context.price.calculated_scenario_price_cents,1429);
});

test('M3 observer UI is mounted in the existing protected monthly workspace',()=>{
 const html=businessMonthBody();
 for(const id of ['businessMonthPricingObserver','businessMonthPricingScope',
  'businessMonthPricingStats','businessMonthPricingRows','businessMonthPricingVariant',
  'businessMonthPricingExtra','businessMonthPricingFee','businessMonthPricingAds',
  'businessMonthPricingMargin','businessMonthPricingCalculate','businessMonthPricingResult'])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/Simulação sem alterar anúncios|simulação sem alterar anúncios|Simulador ilustrativo/);
 assert.match(BUSINESS_MONTH_CLIENT,/function buildMlsProductIntelligence\(/);
 assert.match(BUSINESS_MONTH_CLIENT,/function simulateMlsPricingScenario\(/);
 assert.match(BUSINESS_MONTH_CLIENT,/drawPricingObserver\(\);drawCatalogStatus\(\)/);
 assert.doesNotThrow(()=>new vm.Script(BUSINESS_MONTH_CLIENT),
   'compiled inline script must remain valid JavaScript');
 assert.match(missionWorkspacesBody(''),/Curva ABC e cenário de preço/);
});

test('Python paste-ready Worker builder freezes BOTH M3 browser helpers rather than leaving unresolved imports',()=>{
 const buildFile=readFileSync(new URL('../build.py',import.meta.url),'utf8');
 for(const entry of ["'buildMlsProductIntelligence':'mls-product-intelligence.mjs'",
  "'simulateMlsPricingScenario':'mls-product-intelligence.mjs'"])
   assert.ok(buildFile.includes(entry),entry);
 const month=readFileSync(new URL('../src/business-month-client.mjs',import.meta.url),'utf8');
 assert.match(month,/\$\{buildMlsProductIntelligence\.toString\(\)\}/);
 assert.match(month,/\$\{simulateMlsPricingScenario\.toString\(\)\}/);
});
