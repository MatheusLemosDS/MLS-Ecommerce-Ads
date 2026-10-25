import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildMonthlyFinancialSummary} from '../src/business-month-summary.mjs';
import {businessMonth,projectBusinessMonth} from '../src/business-month.mjs';
import {collectionFixture} from './business-collection-fixture.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const verified=value=>{const result=projectBusinessMonth(value);assert.ok(result,'test input must pass the real monthly contract');return result;};
const pending=(frame,codes,changes={})=>verified({...clone(frame),...changes,product_summary:null,result:{...frame.result,net_estimate_cents:null,net_margin_bps:null,pending:codes}});
async function month(t,{count=10,missingCosts=false,mixed=false,shot=false}={}){
 const f=await collectionFixture({allPaid:true,windowCounts:[mixed||shot?1:count,0],paymentDelayMs:0});
 t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 if(missingCosts){const rows=JSON.parse(f.immutable.bindings[0].payload).filter(row=>missingCosts==='all'?false:row.item_id!=='1009');f.env.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET revision=revision+1,payload=? WHERE id=1').run(JSON.stringify(rows));}
 if(mixed){
  const items=[1000,1001].map(item_id=>({item_id,model_id:0,model_quantity_purchased:1}));
  f.state.detailHook=()=>f.provider({order_list:[{order_sn:f.serial(0),order_status:'COMPLETED',currency:'BRL',create_time:Date.UTC(2026,9,10,12)/1000,item_list:items}]});
  f.state.paymentHook=()=>f.provider({order_sn:f.serial(0),return_order_sn_list:[],order_income:{order_sn:f.serial(0),original_cost_of_goods_sold:130.5,escrow_amount:95.02,ads_escrow_top_up_fee_or_technical_support_fee:0,items:items.map((row,index)=>({item_id:row.item_id,model_id:0,line_item_id:index+1,quantity_purchased:1}))}});
 }
 if(shot){
  f.state.paymentHook=()=>f.provider({order_sn:f.serial(0),return_order_sn_list:[],order_income:{order_sn:f.serial(0),original_cost_of_goods_sold:15766.39,escrow_amount:11093.13,ads_escrow_top_up_fee_or_technical_support_fee:11.8,items:[{item_id:1000,model_id:0,line_item_id:1,quantity_purchased:1}]}});
  f.services.getAdsCalendar=async(_,selection)=>{
   const end=Number(selection.end_date.slice(8)),children=[];
   for(let start=1;start<=end;start+=15){const last=Math.min(start+14,end),range={start_date:'2026-10-'+String(start).padStart(2,'0'),end_date:'2026-10-'+String(last).padStart(2,'0')};children.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:range,balance:0,daily:Array.from({length:last-start+1},(_,index)=>({date:'2026-10-'+String(start+index).padStart(2,'0'),expense:start+index===end?1308.92:0,broad_gmv:0,broad_order:0,broad_roas:0,direct_gmv:0,direct_order:0,direct_roas:0}))},range,f.now()/1000));}
   return buildAdsCalendar(children,selection,f.now()/1000);
  };
 }
 let frame=await f.invoke('start');for(let step=0;frame.status==='RUNNING'&&step<6;step++)frame=await f.invoke('step');assert.equal(frame.status,'COMPLETE');frame=await f.invoke('ads');
 if(shot)frame=await businessMonth(f.env,{operation:'expenses',month:'2026-10',revision:1,external_expenses_cents:0,recharge_treatment:'ADS_RECHARGE'},f.services,{now:f.now,actor:'summary-test'});
 return verified(frame);
}

test('the store balance uses payout after Shopee deductions and subtracts production, one monthly DAS, Ads and declared expenses',async t=>{
 const frame=await month(t),view=buildMonthlyFinancialSummary(frame);
 assert.equal(frame.sales_cents,65250);assert.equal(frame.expected_repass_cents,47510);assert.equal(frame.production_cost_cents,15900);assert.equal(frame.invoice_tax_cents,8605);
 assert.equal(view.schema,'monthly_financial_summary_v1');assert.equal(view.state,'READY');assert.equal(view.balance_cents,18771);assert.equal(view.balance_cents,frame.result.net_estimate_cents);
 assert.equal(view.before_production_cents,34671);assert.equal(view.costs_after_payout_cents,28739);assert.equal(view.known_production_cents,15900);assert.equal(view.production_complete,true);
 assert.deepEqual(view.production_coverage,{total_units:10,known_units:10,pending_units:0,pending_variants:0,pending_products:0});
 assert.equal(view.basis,'PAID_MONTH_CURRENT_COSTS_AFTER_ADS_TAX_EXPENSES');assert.deepEqual(view.pending,[]);
 assert.notEqual(view.balance_cents,18771-(65250-47510),'the difference between gross sales and payout is already deducted');
 const support=verified({...clone(frame),product_summary:null,ads_adjustment_cents:1180,expenses:{...frame.expenses,recharge_treatment:'TECH_SUPPORT'}});
 assert.equal(buildMonthlyFinancialSummary(support).balance_cents,18771,'support already included in payout is not deducted again');
 const rechargeNet=18771+1180,recharge=verified({...support,expenses:{...support.expenses,recharge_treatment:'ADS_RECHARGE'},result:{...support.result,net_estimate_cents:rechargeNet,net_margin_bps:Number(BigInt(rechargeNet)*10000n/65250n)}});
 assert.equal(buildMonthlyFinancialSummary(recharge).balance_cents,rechargeNet,'a confirmed recharge is restored once before actual Ads consumption');
});

test('an explicitly empty paid cohort has zero production and still deducts its monthly DAS, Ads and external expenses once',async t=>{
 const frame=await month(t,{count:0}),view=buildMonthlyFinancialSummary(frame);
 assert.equal(view.state,'READY');assert.equal(view.balance_cents,-12839);assert.equal(view.known_production_cents,0);assert.equal(view.production_complete,true);assert.equal(view.costs_after_payout_cents,12839);
 assert.deepEqual(view.production_coverage,{total_units:0,known_units:0,pending_units:0,pending_variants:0,pending_products:0});
});

test('mixed-order money enters the store total once and production covers both products without allocating DAS per product',async t=>{
 const frame=await month(t,{mixed:true}),view=buildMonthlyFinancialSummary(frame);
 assert.equal(frame.coverage.paid,1);assert.equal(frame.product_summary.mixed_orders,1);assert.equal(frame.product_summary.known_mixed_repass_cents,9502);
 assert.equal(frame.product_summary.products.reduce((sum,row)=>sum+row.known_exclusive_repass_cents,0),0);
 assert.equal(view.state,'READY');assert.equal(view.balance_cents,-6517);assert.equal(view.before_production_cents,-3337);assert.equal(view.known_production_cents,3180);
 assert.equal(view.production_coverage.total_units,2);assert.equal(view.production_coverage.known_units,2);assert.equal(view.costs_after_payout_cents,16019);
});

test('an unpriced variation gives an explicit balance after known costs without calling it a complete result',async t=>{
 const frame=await month(t,{missingCosts:true}),view=buildMonthlyFinancialSummary(frame);
 assert.equal(frame.production_cost_cents,null);assert.equal(frame.known_production_cost_cents,14310);assert.equal(frame.result.net_estimate_cents,null);
 assert.equal(view.state,'PARTIAL_COSTS');assert.equal(view.balance_cents,20361);assert.equal(view.before_production_cents,34671);assert.equal(view.known_production_cents,14310);assert.equal(view.production_complete,false);
 assert.deepEqual(view.production_coverage,{total_units:10,known_units:9,pending_units:1,pending_variants:1,pending_products:1});assert.ok(view.pending.includes('PRODUCTION_COST_INCOMPLETE'));
});

test('the reported store amounts produce R$ 9709.96 before unpriced production and do not hide missing costs as zero',async t=>{
 const frame=await month(t,{missingCosts:'all',shot:true}),view=buildMonthlyFinancialSummary(frame);
 assert.equal(frame.sales_cents,1576639);assert.equal(frame.expected_repass_cents,1109313);assert.equal(frame.ads.expense_cents,130892);assert.equal(frame.ads_adjustment_cents,1180);
 assert.equal(view.state,'PARTIAL_COSTS');assert.equal(view.balance_cents,970996);assert.equal(view.before_production_cents,970996);assert.equal(view.known_production_cents,0);assert.equal(view.production_complete,false);
 assert.deepEqual(view.production_coverage,{total_units:1,known_units:0,pending_units:1,pending_variants:1,pending_products:1});assert.equal(frame.result.net_estimate_cents,null);
});

test('returns and stale complete readings have a provisional arithmetic balance while the strict monthly result remains blocked',async t=>{
 const frame=await month(t);
 for(const [code,changes] of [
  ['RETURNS_NOT_RECONCILED',{coverage:{...frame.coverage,returns:1}}],
  ['RETURNS_NOT_RECONCILED',{coverage:{...frame.coverage,returns_unknown:1}}],
  ['FINANCIAL_SOURCE_STALE',{source_checked_at:{...frame.source_checked_at,finance_oldest_at:frame.checked_at-901}}],
 ]){
  const value=pending(frame,[code],changes),view=buildMonthlyFinancialSummary(value);assert.equal(view.state,'PROVISIONAL');assert.equal(view.balance_cents,18771);assert.ok(view.pending.includes(code));assert.equal(value.result.net_estimate_cents,null);
 }
 const partial=await month(t,{missingCosts:true}),stale=pending(partial,['PRODUCTION_COST_INCOMPLETE','FINANCIAL_SOURCE_STALE'],{source_checked_at:{...partial.source_checked_at,finance_oldest_at:partial.checked_at-901}}),view=buildMonthlyFinancialSummary(stale);
 assert.equal(view.state,'PARTIAL_COSTS');assert.equal(view.balance_cents,20361);assert.ok(view.pending.includes('FINANCIAL_SOURCE_STALE'));
});

test('missing deductions and incomplete or unreliable cohorts never become a store-wide total through zero defaults',async t=>{
 const frame=await month(t),waiting=(value,label)=>{const view=buildMonthlyFinancialSummary(value);assert.equal(view.state,'WAITING',label);assert.equal(view.balance_cents,null,label);assert.equal(view.before_production_cents,null,label);assert.equal(view.costs_after_payout_cents,null,label);};
 for(const [label,value] of [
  ['Ads missing',pending(frame,['ADS_UNAVAILABLE'],{ads:null,source_checked_at:{...frame.source_checked_at,ads_at:null}})],
  ['expenses undeclared',pending(frame,['EXTERNAL_EXPENSES_REQUIRED'],{expenses:{revision:0,external_expenses_cents:null,recharge_treatment:'UNCONFIRMED',updated_at:null}})],
  ['adjustment unknown',pending(frame,['ADJUSTMENT_UNAVAILABLE'],{ads_adjustment_cents:null})],
  ['negative adjustment',pending(frame,['ADJUSTMENT_UNAVAILABLE'],{ads_adjustment_cents:-1})],
  ['recharge unclassified',pending(frame,['RECHARGE_TREATMENT_REQUIRED'],{ads_adjustment_cents:1180})],
  ['provider unavailable',pending(frame,['SOURCE_UNAVAILABLE'])],
  ['unsafe arithmetic',pending(frame,['ARITHMETIC_UNSAFE'])],
  ['blocked source',pending(frame,['SOURCE_UNAVAILABLE'],{collection:{schema:'business_month_collection_v1',state:'BLOCKED',code:'BUSINESS_PERIOD_INVALID_SOURCE',retry_after_seconds:0}})],
 ])waiting(value,label);
 const tax={...frame.tax,policy_revision:0,monthly_das_cents:null,tax_cents:null,status:'PENDING',source:'DAS_REQUIRED'};
 waiting(pending(frame,['INVOICE_TAX_UNAVAILABLE','TAX_POLICY_REQUIRED'],{tax,invoice_tax_cents:null,known_invoice_tax_cents:null}),'DAS missing');
 for(const state of ['RUNNING','LIMIT_REACHED'])waiting(pending(frame,[state==='RUNNING'?'COLLECTING':'PERIOD_LIMIT_REACHED','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADJUSTMENT_UNAVAILABLE'],{status:state,progress:{...frame.progress,windows_complete:1},sales_cents:null,expected_repass_cents:null,production_cost_cents:null,invoice_tax_cents:null,ads_adjustment_cents:null}),state);
 waiting(pending(frame,['PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','ADJUSTMENT_UNAVAILABLE'],{coverage:{...frame.coverage,payment_covered:9,payment_missing:1,returns_unknown:1},sales_cents:null,known_sales_cents:58725,expected_repass_cents:null,known_expected_repass_cents:42759,ads_adjustment_cents:null}),'payment gap');
});

test('an absent product summary keeps unit coverage unknown while preserving validated monthly arithmetic',async t=>{
 const frame=verified({...await month(t),product_summary:null}),view=buildMonthlyFinancialSummary(frame);
 assert.equal(view.state,'READY');assert.equal(view.balance_cents,18771);assert.deepEqual(view.production_coverage,{total_units:null,known_units:null,pending_units:0,pending_variants:0,pending_products:0});
 const partial=verified({...await month(t,{missingCosts:true}),product_summary:null}),partialView=buildMonthlyFinancialSummary(partial);
 assert.equal(partialView.state,'PARTIAL_COSTS');assert.equal(partialView.balance_cents,20361);assert.deepEqual(partialView.production_coverage,{total_units:null,known_units:null,pending_units:1,pending_variants:1,pending_products:1});
});

test('integer-cent arithmetic survives an unsafe Number intermediate and fails closed when an exposed sum exceeds the safe range',async t=>{
 const frame=await month(t),ceiling=Number.MAX_SAFE_INTEGER,changes={expected_repass_cents:ceiling,known_expected_repass_cents:ceiling,ads_adjustment_cents:100,expenses:{...frame.expenses,recharge_treatment:'ADS_RECHARGE'},coverage:{...frame.coverage,returns:1}};
 const value=pending(frame,['RETURNS_NOT_RECONCILED'],changes),view=buildMonthlyFinancialSummary(value);
 assert.equal(view.state,'PROVISIONAL');assert.equal(view.before_production_cents,Number(BigInt(ceiling)+100n-8605n-3000n-1234n));assert.equal(view.balance_cents,Number(BigInt(ceiling)+100n-15900n-8605n-3000n-1234n));assert.equal(view.costs_after_payout_cents,28739);
 const overflow=pending(frame,['RETURNS_NOT_RECONCILED'],{...changes,ads_adjustment_cents:ceiling,expenses:{...frame.expenses,recharge_treatment:'ADS_RECHARGE',external_expenses_cents:ceiling}}),blocked=buildMonthlyFinancialSummary(overflow);
 assert.equal(blocked.state,'WAITING');assert.equal(blocked.balance_cents,null);assert.equal(blocked.before_production_cents,null);assert.equal(blocked.costs_after_payout_cents,null);assert.ok(blocked.pending.includes('ARITHMETIC_UNSAFE'));assert.equal(overflow.result.pending.includes('ARITHMETIC_UNSAFE'),false);
});

test('defensive reads never execute accessors or turn an unavailable component into zero',async t=>{
 const frame=await month(t);let reads=0;const ads={...frame.ads};Object.defineProperty(ads,'expense_cents',{enumerable:true,get(){reads++;return 0;}});
 const value={...frame,ads},view=buildMonthlyFinancialSummary(value);assert.equal(reads,0);assert.equal(view.state,'WAITING');assert.equal(view.balance_cents,null);
 const missing={...frame};delete missing.known_production_cost_cents;const unknown=buildMonthlyFinancialSummary(missing);assert.equal(unknown.state,'WAITING');assert.equal(unknown.balance_cents,null);assert.equal(unknown.known_production_cents,null);
});

test('the summary function runs standalone in the browser realm without imported closures and without mutating the verified frame',async t=>{
 const frame=await month(t,{missingCosts:true}),original=clone(frame),context=vm.createContext({serialized:JSON.stringify(frame)});
 vm.runInContext(buildMonthlyFinancialSummary.toString()+'\nglobalThis.frame=JSON.parse(serialized);globalThis.view=buildMonthlyFinancialSummary(frame);',context);
 assert.deepEqual(JSON.parse(JSON.stringify(context.view)),buildMonthlyFinancialSummary(frame));assert.deepEqual(frame,original);assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(frame)',context)),frame);
});


test('known paid-order arithmetic remains provisional when excluded statuses and returns still require reconciliation',async t=>{
 const frame=await month(t),before=clone(frame),coverage={...frame.coverage,orders:12,other:2,returns:4},value=pending(frame,['STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED'],{coverage}),view=buildMonthlyFinancialSummary(value);
 assert.equal(view.state,'PROVISIONAL');assert.equal(view.balance_cents,18771);assert.equal(view.costs_after_payout_cents,28739);assert.equal(view.production_complete,true);assert.deepEqual(view.pending,['STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED']);assert.equal(value.result.net_estimate_cents,null);assert.equal(value.result.net_profit_cents,null);assert.deepEqual(frame,before);
 for(const key of ['cancel_pending','other','unknown']){const next=pending(frame,['STATUS_REVIEW_REQUIRED'],{coverage:{...frame.coverage,orders:11,[key]:1}});assert.equal(buildMonthlyFinancialSummary(next).state,'PROVISIONAL');assert.equal(buildMonthlyFinancialSummary(next).balance_cents,18771);}
 const partial=await month(t,{missingCosts:true}),partialValue=pending(partial,['PRODUCTION_COST_INCOMPLETE','STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED'],{coverage:{...partial.coverage,orders:12,other:2,returns:4}}),partialView=buildMonthlyFinancialSummary(partialValue);assert.equal(partialView.state,'PARTIAL_COSTS');assert.equal(partialView.balance_cents,20361);assert.equal(partialView.production_complete,false);
 for(const change of [row=>{row.coverage.payment_covered--;},row=>{row.coverage.orders++;},row=>{row.known_expected_repass_cents--;},row=>{row.known_sales_cents--;},row=>{row.result.pending=row.result.pending.filter(code=>code!=='STATUS_REVIEW_REQUIRED');}]){const next=clone(value);change(next);const blocked=buildMonthlyFinancialSummary(next);assert.equal(blocked.state,'WAITING');assert.equal(blocked.balance_cents,null);}
});
