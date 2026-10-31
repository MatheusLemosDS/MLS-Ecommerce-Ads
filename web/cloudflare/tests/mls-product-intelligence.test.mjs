import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildMlsProductIntelligence,simulateMlsPricingScenario} from '../src/mls-product-intelligence.mjs';
import {businessMonthBody} from '../src/business-month-view.mjs';
import {BUSINESS_MONTH_CLIENT} from '../src/business-month-client.mjs';

const row=(item_id,quantity,sales,balance)=>({item_id,quantity,orders:1,exclusive_orders:1,mixed_orders:0,
 pending:[],exclusive_sales_cents:sales,exclusive_after_costs_cents:balance,
 exclusive_margin_bps:sales?Number(BigInt(balance)*10000n/BigInt(sales)):null,
 variants:[{model_id:'1',quantity,unit_cost_cents:1200}]});
const source=()=>({month:'2026-10',status:'COMPLETE',result:{pending:[]},
 product_summary:{schema:'business_month_products_v1',mixed_orders:0,products:[
  row('301',80,80000,20000),row('302',15,15000,3500),row('303',5,5000,-400)]}});

test('ABC uses sold units, with explicit inventory/net/pricing/commercial gates',()=>{
 const result=buildMlsProductIntelligence(source());assert.ok(result);
 assert.deepEqual(result.products.map(p=>[p.item_id,p.abc_units,p.abc_revenue]),[['301','A','A'],['302','B','B'],['303','C','C']]);
 assert.equal(result.total_units,100);assert.equal(result.covered_exclusive_balance_cents,23100);
 assert.equal(result.inventory_verified,false);assert.equal(result.safe_sku_net_profit_cents,null);
 assert.equal(result.safe_price_cents,null);assert.equal(result.execution_allowed,false);
 assert.match(result.exclusive_balance_basis,/BEFORE_ADS/);
 assert.ok(result.blockers.includes('M2_RECONCILIATION_NOT_VERIFIED'));
});
test('mixed orders preserve unit ABC and block revenue allocation',()=>{
 const frame=source();frame.product_summary.mixed_orders=1;frame.product_summary.products[0].mixed_orders=1;frame.product_summary.products[0].orders=2;
 const result=buildMlsProductIntelligence(frame);assert.equal(result.products[0].abc_units,'A');
 assert.equal(result.revenue_abc_status,'BLOCKED_INCOMPLETE_OR_MIXED_ORDERS');
 assert.ok(result.products.every(row=>row.abc_revenue===null));
});
test('missing return/payment/source evidence never becomes product net or a revenue ranking',()=>{
 for(const code of ['FINANCIAL_SOURCE_STALE','PAYMENT_INCOMPLETE','STATUS_REVIEW_REQUIRED']){
  const frame=source();frame.result.pending=[code];const result=buildMlsProductIntelligence(frame);
  assert.equal(result.covered_exclusive_balance_cents,0);assert.equal(result.exclusive_balance_covered_products,0);
  assert.ok(result.products.every(row=>row.exclusive_after_costs_cents===null));
  assert.equal(result.revenue_abc_status,'BLOCKED_INCOMPLETE_OR_MIXED_ORDERS');
 }
 const frame=source();frame.product_summary.products[0].pending=['RETURNS_NOT_RECONCILED'];
 const result=buildMlsProductIntelligence(frame);assert.equal(result.exclusive_balance_covered_products,2);
 assert.equal(result.products[0].exclusive_after_costs_cents,null);assert.equal(result.safe_sku_net_profit_cents,null);
});
test('empty source is an observed zero, malformed quantities and overflows are rejected',()=>{
 const empty=source();empty.product_summary.products=[];
 assert.equal(buildMlsProductIntelligence(empty).total_units,0);
 for(const change of [
  f=>{f.status='RUNNING';},f=>{f.product_summary.products[0].variants[0].quantity=1;},
  f=>{f.product_summary.products.push({...f.product_summary.products[0]});},
  f=>{f.product_summary.products[0].quantity=-0;},f=>{delete f.result;},
  f=>{for(const p of f.product_summary.products){p.quantity=Number.MAX_SAFE_INTEGER;p.variants[0].quantity=p.quantity;}},
  f=>{for(const p of f.product_summary.products)p.exclusive_after_costs_cents=Number.MAX_SAFE_INTEGER;}
 ]){const frame=source();change(frame);assert.equal(buildMlsProductIntelligence(frame),null);}
 let reads=0;const frame=source();Object.defineProperty(frame.product_summary.products[0],'quantity',{enumerable:true,get(){reads++;return 80;}});
 assert.equal(buildMlsProductIntelligence(frame),null);assert.equal(reads,0);
});
test('what-if price uses integer ceiling and requires all operator assumptions including explicit zero',()=>{
 const input={unit_cost_cents:1000,extra_cost_cents:200,fee_bps:1000,ads_bps:500,target_margin_bps:2000};
 const price=simulateMlsPricingScenario(input);assert.equal(price.calculated_scenario_price_cents,1847);
 assert.equal(price.not_a_safe_price,true);assert.equal(price.may_publish,false);assert.equal(price.may_modify_ads,false);
 assert.equal(simulateMlsPricingScenario({...input,extra_cost_cents:0,fee_bps:0,ads_bps:0,target_margin_bps:0}).calculated_scenario_price_cents,1000);
 for(const change of [
  i=>{delete i.ads_bps;},i=>{i.unit_cost_cents=0;},i=>{i.extra_cost_cents=null;},i=>{i.ads_bps=-0;},
  i=>{i.fee_bps=1.5;},i=>{i.unit_cost_cents=Number.MAX_SAFE_INTEGER;},
  i=>{i.fee_bps=8000;},i=>{i.extra=true;}
 ]){const value={...input};change(value);assert.equal(simulateMlsPricingScenario(value),null);}
});
test('helpers embed without closures and observer mounts in the existing monthly products section',()=>{
 const context=vm.createContext({serialized:JSON.stringify(source())});
 vm.runInContext(buildMlsProductIntelligence.toString()+'\n'+simulateMlsPricingScenario.toString()+'\nresult=buildMlsProductIntelligence(JSON.parse(serialized));',context);
 assert.equal(context.result.total_units,100);
 for(const id of ['PricingObserver','PricingScope','PricingStats','PricingRows','PricingVariant','PricingExtra','PricingFee','PricingAds','PricingMargin','PricingCalculate','PricingResult'])assert.ok(businessMonthBody().includes('id="businessMonth'+id+'"'));
 assert.doesNotThrow(()=>new vm.Script(BUSINESS_MONTH_CLIENT));
 assert.match(BUSINESS_MONTH_CLIENT,/drawPricingObserver\(\);drawCatalogStatus\(\)/);
 assert.match(BUSINESS_MONTH_CLIENT,/Hipóteses alteradas/);
 assert.match(businessMonthBody(),/DAS-MEI mensal não é uma taxa por venda/);
});
