import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildMlsProductFinancialEvidence} from '../src/mls-product-contribution.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {buildMlsProductIntelligence} from '../src/mls-product-intelligence.mjs';
import {buildMlsProductWorkbench} from '../src/mls-product-workbench.mjs';
import {completeWorkspaceFrame} from './monthly-workspace-browser-fixture.mjs';
import {contributionFrame} from './mls-product-contribution-fixture.mjs';

const clone=value=>structuredClone(value);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const evidence=frame=>buildMlsProductFinancialEvidence(frame,projectBusinessMonth);
const find=(dto,id)=>dto.products.find(product=>product.item_id===id);

// Independent one-product fixture crosses the real canonical month contract.
// Its dates, classifications and amounts are synthetic; no account facts change.
function single({sales=10000,repass=8000,cost=1590,quantity=2,adjustment=1180,returns=false,missingPayment=false,review=false,stale=false,legacy=false,known=true}={}){
 const frame=completeWorkspaceFrame({review:false}),missingCost=cost===null;
 const tax=legacy?Number((BigInt(sales)*200n+5000n)/10000n):0,production=missingCost?null:quantity*cost;
 const pending=[...(missingPayment?['PAYMENT_INCOMPLETE']:[]),...(missingCost?['PRODUCTION_COST_INCOMPLETE']:[]),...(returns||missingPayment?['RETURNS_NOT_RECONCILED']:[]),...(review?['STATUS_REVIEW_REQUIRED']:[]),...(stale?['SOURCE_UNAVAILABLE']:[])];
 const expected=missingPayment||missingCost||returns?null:repass-production-tax,strict=pending.length?null:expected;
 const variant={model_id:'0',quantity,exclusive_quantity:quantity,mixed_quantity:0,unit_cost_cents:cost,production_cost_cents:production,exclusive_production_cost_cents:production,selling_unit:missingCost?null:'SINGLE_GARMENT',size:missingCost?null:'P',male_size:null,female_size:null};
 const row={item_id:'1',quantity,orders:1,exclusive_orders:1,mixed_orders:0,exclusive_payment_covered:missingPayment?0:1,exclusive_payment_missing:missingPayment?1:0,exclusive_returns:returns?1:0,exclusive_returns_unknown:missingPayment?1:0,
  known_exclusive_sales_cents:missingPayment?0:sales,exclusive_sales_cents:missingPayment?null:sales,
  known_exclusive_repass_cents:missingPayment?0:repass,exclusive_repass_cents:missingPayment?null:repass,
  known_exclusive_tax_cents:missingPayment?0:tax,exclusive_tax_cents:missingPayment?null:tax,
  known_exclusive_ads_adjustment_cents:missingPayment?0:adjustment,exclusive_ads_adjustment_cents:missingPayment?null:adjustment,
  known_production_cost_cents:production??0,production_cost_cents:production,known_exclusive_production_cost_cents:production??0,exclusive_production_cost_cents:production,
  exclusive_after_costs_cents:strict,exclusive_margin_bps:strict===null||sales===0?null:Number(BigInt(strict)*10000n/BigInt(sales)),pending,variants:[variant],...(known?{known_exclusive_after_costs_cents:expected}:{})};
 frame.coverage={orders:review?2:1,paid:1,completed:1,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:review?1:0,unknown:0,payment_covered:missingPayment?0:1,payment_missing:missingPayment?1:0,returns:returns?1:0,returns_unknown:missingPayment?1:0};
 frame.sales_cents=missingPayment?null:sales;frame.known_sales_cents=missingPayment?0:sales;
 frame.expected_repass_cents=missingPayment?null:repass;frame.known_expected_repass_cents=missingPayment?0:repass;
 frame.production_cost_cents=production;frame.known_production_cost_cents=production??0;
 frame.ads_adjustment_cents=missingPayment?null:adjustment;
 frame.result.pending=[...(missingPayment?['PAYMENT_INCOMPLETE']:[]),...(returns||missingPayment?['RETURNS_NOT_RECONCILED']:[]),...(missingCost?['PRODUCTION_COST_INCOMPLETE']:[]),...(review?['STATUS_REVIEW_REQUIRED']:[]),...(stale?['FINANCIAL_SOURCE_STALE']:[]),...(missingPayment?['ADJUSTMENT_UNAVAILABLE']:[])];
 if(stale)frame.source_checked_at.finance_oldest_at=frame.checked_at-1000;
 frame.unmapped_variants=missingCost?[{item_id:'1',model_id:'0',quantity}]:[];
 frame.product_summary={schema:'business_month_products_v1',mixed_orders:0,known_mixed_sales_cents:0,known_mixed_repass_cents:0,known_mixed_tax_cents:0,known_mixed_ads_adjustment_cents:0,products:[row],...(!legacy?{tax_treatment:'MONTHLY_DAS_NOT_ALLOCATED'}:{})};
 if(legacy){delete frame.tax;frame.known_invoice_tax_cents=tax;frame.invoice_tax_cents=tax;}
 const net=frame.result.pending.length?null:repass-production-frame.invoice_tax_cents+adjustment-frame.ads.expense_cents;
 frame.result.net_estimate_cents=net;frame.result.net_margin_bps=net===null||sales===0?null:Number(BigInt(net)*10000n/BigInt(sales));
 const canonical=projectBusinessMonth(frame);assert.ok(canonical,'independent source fixture satisfies the actual month validator');return canonical;
}

test('exclusive financial evidence retains source provenance, reference bases and separate recorded/strict components',()=>{
 const source=contributionFrame(),dto=evidence(source),product=find(dto,'401');assert.ok(dto);
 assert.equal(dto.schema,'mls_product_financial_evidence_v1');assert.equal(dto.month,'2026-10');
 assert.deepEqual(dto.source,{start_date:source.start_date,end_date:source.end_date,checked_at:source.checked_at,finance_oldest_at:source.source_checked_at.finance_oldest_at,finance_latest_at:source.source_checked_at.finance_latest_at,bindings_revision:source.bindings_revision,costs_revision:source.costs_revision,cost_rules_revision:source.cost_rules_revision,classification_revision:source.classification_revision});
 assert.deepEqual(dto.coverage,{total_products:8,strict_products:5,recorded_subtotal_products:5,attributed_variants:4});
 assert.deepEqual(product.recorded,{sales_cents:10000,repass_cents:8000,sales_minus_repass_cents:2000,production_cost_cents:3180,tax_cents:0,ads_adjustment_cents:1180,contribution_cents:4820});
 assert.equal(product.strict.state,'AVAILABLE');assert.equal(product.strict.margin_bps,4820);assert.equal(product.attribution.state,'ATTRIBUTED');assert.equal(product.attribution.exclusive_quantity,2);
 assert.equal(dto.mode,'OBSERVER');assert.equal(dto.execution_allowed,false);assert.equal(dto.net_profit_cents,null);assert.equal(dto.safe_price_cents,null);assert.match(dto.cost_basis,/NOT_MANUFACTURING_OR_REUSE_LEDGER/);assert.equal(dto.difference_basis,'SALES_MINUS_REPASS_NOT_OFFICIAL_FEES');
});

test('negative, zero and zero-sales contributions preserve signed cents with an unknown zero-sales percentage',()=>{
 const dto=evidence(contributionFrame());assert.equal(find(dto,'402').strict.contribution_cents,-640);assert.equal(find(dto,'402').attribution.margin_bps,-2133);assert.equal(find(dto,'403').strict.contribution_cents,0);assert.equal(find(dto,'403').attribution.margin_bps,0);
 const zero=evidence(single({sales:0,repass:0,cost:0})).products[0];assert.equal(zero.strict.state,'AVAILABLE');assert.equal(zero.strict.contribution_cents,0);assert.equal(zero.strict.margin_bps,null);assert.equal(zero.attribution.state,'ATTRIBUTED');assert.equal(zero.attribution.margin_bps,null);
});

test('same sold model in exclusive and mixed orders attributes only exclusive quantity, cost and payout',()=>{
 const source=contributionFrame(),dto=evidence(source),product=find(dto,'405');
 assert.deepEqual(product.scope,{quantity:3,exclusive_quantity:2,mixed_quantity:1,orders:3,exclusive_orders:2,mixed_orders:1,payment_covered_orders:2,payment_missing_orders:0,returns_orders:0,returns_unknown_orders:0,sold_variants:1});
 assert.equal(product.strict.production_cost_cents,6360);assert.equal(product.strict.repass_cents,11000);assert.equal(product.attribution.contribution_cents,4640);assert.equal(product.attribution.exclusive_quantity,2);assert.equal(source.product_summary.products.find(p=>p.item_id==='405').production_cost_cents,9540);
 assert.equal(find(dto,'406').attribution.state,'NO_EXCLUSIVE_ORDERS');assert.equal(find(dto,'406').recorded.production_cost_cents,0);assert.equal(find(dto,'406').strict.contribution_cents,null);assert.equal(source.product_summary.known_mixed_repass_cents,7000);
});

test('several sold models retain product contribution and reject all per-model money allocation',()=>{
 const product=find(evidence(contributionFrame()),'404');assert.equal(product.strict.contribution_cents,3770);assert.equal(product.attribution.state,'MULTIPLE_SOLD_VARIANTS');
 assert.equal(product.attribution.model_id,null);assert.equal(product.attribution.exclusive_quantity,null);assert.equal(product.attribution.exclusive_orders,null);assert.equal(product.attribution.contribution_cents,null);assert.equal(product.attribution.margin_bps,null);
 const source=contributionFrame(),legacy=buildMlsProductWorkbench(buildMlsProductIntelligence(source));assert.ok(legacy.products.flatMap(row=>row.variants).every(variant=>variant.margin_bps===null&&variant.net_profit_cents===null));
});

test('returns and missing references retain only recorded components, never a synthesized known subtotal',()=>{
 const dto=evidence(contributionFrame());for(const item of ['407','408']){const product=find(dto,item);assert.equal(product.strict.state,'BLOCKED');assert.equal(product.recorded.contribution_cents,null);assert.equal(product.attribution.contribution_cents,null);}
 assert.equal(find(dto,'407').recorded.production_cost_cents,1250);assert.equal(find(dto,'408').recorded.production_cost_cents,0);
 const old=single({known:false}),product=evidence(old).products[0];assert.equal(product.strict.contribution_cents,4820);assert.equal(product.recorded.contribution_cents,null);assert.equal(evidence(old).coverage.recorded_subtotal_products,0,'legacy omission stays unknown even though strict arithmetic is available');
});

test('canonical status, stale source, payment and cost gates block every strict monetary component',()=>{
 for(const options of [{review:true},{stale:true},{missingPayment:true},{cost:null},{returns:true}]){
  const dto=evidence(single(options)),product=dto.products[0];assert.equal(product.strict.state,'BLOCKED',JSON.stringify(options));
  for(const [key,value] of Object.entries(product.strict))if(key!=='state')assert.equal(value,null,key);
  assert.equal(product.attribution.state,'BLOCKED');assert.equal(product.attribution.contribution_cents,null);assert.ok(product.pending.length);
 }
 const stale=evidence(single({stale:true})).products[0];assert.equal(stale.recorded.contribution_cents,4820);assert.ok(stale.pending.includes('FINANCIAL_SOURCE_STALE'));
 const unpaid=evidence(single({missingPayment:true})).products[0];assert.equal(unpaid.scope.payment_missing_orders,1);assert.equal(unpaid.recorded.contribution_cents,null);assert.equal(unpaid.recorded.sales_cents,0);
});

test('global source gates stay effective even when a supplied canonical callback omits a row reason',()=>{
 const canonical=single({review:true});canonical.product_summary.products[0].pending=[];
 let calls=0;const dto=buildMlsProductFinancialEvidence({},()=>{calls++;return canonical;});assert.equal(calls,1);assert.ok(dto);assert.equal(dto.products[0].strict.state,'BLOCKED');assert.ok(dto.products[0].pending.includes('STATUS_REVIEW_REQUIRED'));assert.equal(dto.products[0].recorded.contribution_cents,4820);
});

test('kits multiply their complete listing reference once and observed Ads adjustments never change contribution',()=>{
 const product=find(evidence(contributionFrame()),'405');assert.equal(product.strict.production_cost_cents,2*3180);assert.equal(product.strict.contribution_cents,11000-2*3180);
 const normal=evidence(single()).products[0],adjusted=evidence(single({adjustment:3333})).products[0];assert.equal(normal.strict.contribution_cents,adjusted.strict.contribution_cents);assert.equal(adjusted.recorded.ads_adjustment_cents,3333);assert.equal(adjusted.strict.ads_adjustment_cents,3333);
});

test('MEI DAS remains monthly and legacy per-order tax stays explicitly a non-official reference',()=>{
 const mei=evidence(single());assert.equal(mei.tax_basis,'MONTHLY_DAS_NOT_ALLOCATED');assert.equal(mei.products[0].strict.tax_cents,0);assert.equal(mei.products[0].strict.contribution_cents,4820);
 const legacy=evidence(single({legacy:true}));assert.equal(legacy.tax_basis,'LEGACY_ORDER_TAX_REFERENCE_NOT_OFFICIAL_TAX');assert.equal(legacy.products[0].strict.tax_cents,200);assert.equal(legacy.products[0].strict.contribution_cents,4620);
});

test('invalid canonical frames, identities, unsafe differences and accessor fields never become evidence',()=>{
 assert.equal(buildMlsProductFinancialEvidence(single()),null);assert.equal(buildMlsProductFinancialEvidence(single(),()=>{throw Error('Unavailable');}),null);assert.equal(evidence(null),null);
 for(const mutate of [f=>{f.status='RUNNING';},f=>{f.product_summary=null;},f=>{f.product_summary.products[0].variants.push(clone(f.product_summary.products[0].variants[0]));},f=>{f.product_summary.products[0].known_exclusive_after_costs_cents++;},f=>{f.product_summary.products[0].variants[0].quantity++;},f=>{f.costs_revision=-0;},f=>{Object.setPrototypeOf(f.product_summary.products[0],{});}]){const value=single();mutate(value);assert.equal(evidence(value),null);}
 const boundary=single({sales:Number.MAX_SAFE_INTEGER,repass:-100,cost:0,adjustment:0});assert.ok(projectBusinessMonth(boundary));assert.equal(evidence(boundary),null,'a known sales-minus-repass difference must also fit safe integer cents');
 let reads=0;for(const select of [f=>[f,'month'],f=>[f.product_summary.products[0],'quantity'],f=>[f.product_summary.products[0].variants[0],'unit_cost_cents']]){const value=single(),[host,key]=select(value);Object.defineProperty(host,key,{enumerable:true,get(){reads++;throw Error('must not execute');}});assert.equal(evidence(value),null);assert.equal(reads,0);}
});

test('empty canonical cohorts stay empty and exact MAX_SAFE cent evidence is preserved without rounding',()=>{
 const empty=single({sales:0,repass:0,cost:0,adjustment:0});empty.coverage.orders=0;empty.coverage.paid=0;empty.coverage.completed=0;empty.coverage.payment_covered=0;empty.product_summary.products=[];
 const dto=evidence(empty);assert.ok(dto);assert.deepEqual(dto.products,[]);assert.deepEqual(dto.coverage,{total_products:0,strict_products:0,recorded_subtotal_products:0,attributed_variants:0});
 const max=Number.MAX_SAFE_INTEGER,large=evidence(single({sales:max,repass:max,cost:0,quantity:1,adjustment:0}));assert.ok(large);assert.equal(large.products[0].strict.contribution_cents,max);assert.equal(large.products[0].recorded.repass_cents,max);assert.equal(large.products[0].strict.sales_minus_repass_cents,0);assert.equal(large.products[0].attribution.margin_bps,10000);
});

test('detached evidence is deeply frozen and no source field, descriptor or legacy contract changes',()=>{
 const source=single(),before=JSON.stringify(source);Object.defineProperty(source.product_summary.products[0],'known_exclusive_after_costs_cents',{enumerable:false});freeze(source);
 const dto=evidence(source);assert.ok(dto);assert.ok(Object.isFrozen(dto)&&Object.isFrozen(dto.source)&&Object.isFrozen(dto.products[0].recorded)&&Object.isFrozen(dto.products[0].scope)&&Object.isFrozen(dto.products[0].pending));assert.throws(()=>{dto.products[0].strict.contribution_cents=1;},TypeError);assert.equal(dto.products[0].recorded.contribution_cents,4820);assert.equal(Object.getOwnPropertyDescriptor(source.product_summary.products[0],'known_exclusive_after_costs_cents').enumerable,false);
 const restored=clone(source);Object.defineProperty(restored.product_summary.products[0],'known_exclusive_after_costs_cents',{value:4820,enumerable:true});assert.equal(JSON.stringify(restored),before);
});

test('the evidence function runs from toString with only its explicit canonical callback dependency',()=>{
 const canonical=single(),context=vm.createContext({serialized:JSON.stringify(canonical)});
 vm.runInContext(buildMlsProductFinancialEvidence.toString()+'\nconst canonical=JSON.parse(serialized);let calls=0;const result=buildMlsProductFinancialEvidence(canonical,input=>{calls++;if(input!==canonical)throw Error();return canonical;});globalThis.output=JSON.stringify({result,calls});',context);
 const value=JSON.parse(context.output);assert.equal(value.calls,1);assert.equal(value.result.products[0].strict.contribution_cents,4820);assert.equal(value.result.products[0].attribution.model_id,'0');assert.equal(value.result.execution_allowed,false);
});
