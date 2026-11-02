import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {projectMonthlyProfitPresentation,projectMonthlyProfitPresentationValue} from '../src/monthly-profit-presentation.mjs';
import {buildMonthlyFinancialSummary} from '../src/business-month-summary.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {projectBusinessMonthProducts} from '../src/business-month-products.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar,projectAdsCalendar} from '../src/ads-calendar.mjs';
import {activeWorkspaceFrame} from './monthly-workspace-browser-fixture.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const at=Date.UTC(2026,10,2,16)/1000;
const checked=value=>{const frame=projectBusinessMonth(value);assert.ok(frame,'the fixture must cross the unchanged canonical monthly contract');return frame;};
const present=frame=>projectMonthlyProfitPresentation(frame,projectBusinessMonth,buildMonthlyFinancialSummary);
function calendar(month,end,stamp,spend,{missingDay=null}={}){
 const children=[];
 for(let begin=1;begin<=end;begin+=15){
  const last=Math.min(begin+14,end),selection={start_date:month+'-'+String(begin).padStart(2,'0'),end_date:month+'-'+String(last).padStart(2,'0')};
  const source={status:'ok',connected:true,shop:{id:1178167501},period:selection,balance:0,daily:Array.from({length:last-begin+1},(_,index)=>({date:month+'-'+String(begin+index).padStart(2,'0'),expense:begin+index===missingDay?null:begin+index===end?(spend/100).toFixed(2):'0',broad_gmv:0,broad_order:0,direct_gmv:0,direct_order:0}))};
  children.push(buildAdsMeasurement(source,selection,stamp));
 }
 return buildAdsCalendar(children,{start_date:month+'-01',end_date:month+'-'+String(end).padStart(2,'0')},stamp);
}
// Deterministic synthetic inputs exercise the missing-declaration and old-Ads
// conditions without copying customer amounts, IDs or source observations.
function monthly({month='2026-11',end=2,stamp=at,adsAt=stamp,sales=140000,payout=100000,production=40000,adsSpend=1500,recharge=0,expenses=0,externalPending=expenses===null,tax=8100,extraPending=[],missingDay=null}={}){
 const pending=[...extraPending];if(tax===null)pending.push('INVOICE_TAX_UNAVAILABLE','TAX_POLICY_REQUIRED');if(externalPending)pending.push('EXTERNAL_EXPENSES_REQUIRED');if(stamp-adsAt>900||missingDay!==null)pending.push('ADS_UNAVAILABLE');
 const sorted=[...new Set(pending)],net=sorted.length?null:payout-production-tax+recharge-adsSpend-expenses;
 const value={schema:'business_month_v1',month,start_date:month+'-01',end_date:month+'-'+String(end).padStart(2,'0'),status:'COMPLETE',checked_at:stamp,progress:{windows_total:Math.ceil(end/15),windows_complete:Math.ceil(end/15),pages_read:Math.ceil(end/15),order_capacity:Math.ceil(end/15)*20},coverage:{orders:1,paid:1,completed:1,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1,payment_missing:0,returns:0,returns_unknown:0},sales_cents:sales,known_sales_cents:sales,expected_repass_cents:payout,known_expected_repass_cents:payout,production_cost_cents:production,known_production_cost_cents:production,invoice_tax_cents:tax,known_invoice_tax_cents:tax,ads_adjustment_cents:recharge,ads:calendar(month,end,adsAt,adsSpend,{missingDay}),expenses:expenses===null?{revision:0,external_expenses_cents:null,recharge_treatment:'UNCONFIRMED',updated_at:null}:{revision:1,external_expenses_cents:expenses,recharge_treatment:recharge?'ADS_RECHARGE':'UNCONFIRMED',updated_at:new Date(stamp*1000).toISOString()},result:{net_estimate_cents:net,net_profit_cents:null,net_margin_bps:net===null||sales===0?null:Number(BigInt(net)*10000n/BigInt(sales)),pending:sorted,basis:'PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE'},unmapped_variants:[],bindings_revision:1,costs_revision:1,tax:{schema:'business_month_tax_v1',regime:'MEI',year:2026,policy_revision:tax===null?0:1,monthly_das_cents:tax,tax_cents:tax,status:tax===null?'PENDING':'DECLARED',source:tax===null?'DAS_REQUIRED':'OPERATOR_DECLARED_DAS',basis:'MONTHLY_COMPETENCE_NO_PRORATION'},source_checked_at:{finance_oldest_at:stamp-20,finance_latest_at:stamp-1,ads_at:adsAt},collection:{schema:'business_month_collection_v1',state:'READY',code:null,retry_after_seconds:0},product_summary:null};
 return checked(value);
}
function pending(frame,codes,changes={}){return checked({...clone(frame),...changes,result:{...frame.result,net_estimate_cents:null,net_margin_bps:null,pending:codes}});}
function verifyValue(value){assert.ok(projectMonthlyProfitPresentationValue(value),'every helper result must cross its exact transport projector');return value;}

test('undeclared expenses expose a separate synthetic R$ 504.00 subtotal while preserving every strict null',()=>{
 const frame=monthly({expenses:null}),before=clone(frame),summary=buildMonthlyFinancialSummary(frame),value=verifyValue(present(frame));
 assert.equal(summary.state,'WAITING');assert.equal(summary.balance_cents,null);assert.equal(value.state,'BEFORE_MONTHLY_COSTS');assert.equal(value.basis,'BEFORE_UNCONFIRMED_EXPENSES');assert.equal(value.amount_cents,50400);assert.equal(value.margin_bps,3600);
 assert.deepEqual(value.monthly_costs_missing,['EXTERNAL_EXPENSES_REQUIRED']);assert.equal(value.das_included,true);assert.equal(value.expenses_included,false);assert.equal(value.ads_pending,false);assert.equal(value.ads_checked_at,at);assert.equal(value.ads_day_partial,true);
 assert.equal(frame.expenses.external_expenses_cents,null);assert.equal(frame.result.net_estimate_cents,null);assert.equal(frame.result.net_margin_bps,null);assert.equal(frame.result.net_profit_cents,null);assert.deepEqual(frame,before);
});

test('a saved full historical calendar keeps its synthetic old timestamp and unfinished last day on a separate subtotal',()=>{
 const adsAt=Date.UTC(2026,10,1,2,45)/1000,frame=monthly({month:'2026-10',end:31,adsAt,sales:700000,payout:500000,production:300000,adsSpend:25000,recharge:200,extraPending:['STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED']});
 const input=pending(frame,frame.result.pending,{coverage:{...frame.coverage,orders:2,other:1,returns:1}}),before=clone(input),value=verifyValue(present(input));
 assert.equal(buildMonthlyFinancialSummary(input).balance_cents,null);assert.equal(value.state,'KNOWN_COSTS');assert.equal(value.amount_cents,167100);assert.equal(value.basis,'AFTER_IDENTIFIED_PRODUCTION_AND_MONTHLY_COSTS');assert.equal(value.ads_pending,true);assert.equal(value.ads_checked_at,adsAt);assert.equal(value.ads_day_partial,true);assert.equal(value.das_included,true);assert.equal(value.expenses_included,true);
 assert.deepEqual(value.monthly_costs_missing,[]);assert.deepEqual(input,before);assert.ok(input.result.pending.includes('ADS_UNAVAILABLE'));assert.equal(input.result.net_estimate_cents,null);
});

test('existing READY, PROVISIONAL and identified-production summaries retain their exact amounts',()=>{
 const complete=monthly(),ready=verifyValue(present(complete));assert.equal(ready.state,'ESTIMATE');assert.equal(ready.basis,'AFTER_PRODUCTION_ADS_AND_MONTHLY_COSTS');assert.equal(ready.amount_cents,complete.result.net_estimate_cents);
 const reviewed=pending(complete,['RETURNS_NOT_RECONCILED'],{coverage:{...complete.coverage,returns:1}}),provisional=verifyValue(present(reviewed));assert.equal(provisional.state,'ESTIMATE');assert.equal(provisional.amount_cents,buildMonthlyFinancialSummary(reviewed).balance_cents);assert.equal(reviewed.result.net_estimate_cents,null);
 const partial=pending(complete,['PRODUCTION_COST_INCOMPLETE'],{production_cost_cents:null,unmapped_variants:[{item_id:'1000',model_id:'0',quantity:1}]}),known=verifyValue(present(partial));assert.equal(known.state,'KNOWN_COSTS');assert.equal(known.amount_cents,buildMonthlyFinancialSummary(partial).balance_cents);assert.equal(known.amount_cents,ready.amount_cents);assert.equal(partial.production_cost_cents,null);
});

test('a numeric expense draft remains excluded until the whole declaration is confirmed',()=>{
 const frame=monthly({expenses:7654,externalPending:true}),value=verifyValue(present(frame));assert.equal(value.state,'BEFORE_MONTHLY_COSTS');assert.equal(value.amount_cents,50400);assert.equal(value.expenses_included,false);assert.equal(frame.expenses.external_expenses_cents,7654);
 const declared=monthly({expenses:7654}),ready=verifyValue(present(declared));assert.equal(ready.amount_cents,42746);assert.equal(ready.expenses_included,true);assert.deepEqual(ready.monthly_costs_missing,[]);
});

test('unknown DAS and combined monthly deductions have distinct explicit bases without a temporary zero-valued frame',()=>{
 for(const [options,basis,amount,missing] of [
  [{tax:null},'BEFORE_UNCONFIRMED_DAS',58500,['TAX_POLICY_REQUIRED']],
  [{tax:null,expenses:null},'BEFORE_UNCONFIRMED_DAS_AND_EXPENSES',58500,['TAX_POLICY_REQUIRED','EXTERNAL_EXPENSES_REQUIRED']],
 ]){
  const frame=monthly(options),before=clone(frame),calls=[],summary=input=>{calls.push(clone(input));return buildMonthlyFinancialSummary(input);},value=verifyValue(projectMonthlyProfitPresentation(frame,projectBusinessMonth,summary));
  assert.equal(value.basis,basis);assert.equal(value.amount_cents,amount);assert.equal(value.das_included,false);assert.equal(value.expenses_included,options.expenses!==null);assert.deepEqual(value.monthly_costs_missing,missing);assert.equal(calls.length,1);assert.deepEqual(calls[0],frame);assert.deepEqual(frame,before);assert.equal(frame.invoice_tax_cents,null);assert.equal(frame.tax.monthly_das_cents,null);
 }
});

test('unknown fixed deductions plus unpriced production never acquire a combined subtotal',()=>{
 const source=monthly({expenses:null}),frame=pending(source,['EXTERNAL_EXPENSES_REQUIRED','PRODUCTION_COST_INCOMPLETE'],{production_cost_cents:null,unmapped_variants:[{item_id:'1000',model_id:'0',quantity:1}]});
 const value=verifyValue(present(frame));assert.equal(value.state,'UNAVAILABLE');assert.equal(value.amount_cents,null);assert.equal(value.margin_bps,null);assert.equal(value.expenses_included,false);assert.equal(value.das_included,false);
});

test('saved Ads may preserve identified-production arithmetic without releasing unpriced production or fresh profit',()=>{
 const source=monthly({adsAt:at-901}),frame=pending(source,['ADS_UNAVAILABLE','PRODUCTION_COST_INCOMPLETE'],{production_cost_cents:null,unmapped_variants:[{item_id:'1000',model_id:'0',quantity:1}]}),value=verifyValue(present(frame));
 assert.equal(value.state,'KNOWN_COSTS');assert.equal(value.ads_pending,true);assert.equal(value.amount_cents,50400);assert.equal(frame.production_cost_cents,null);assert.equal(frame.result.net_estimate_cents,null);
});

test('absent or partial Ads, incomplete collection, payment gaps, unsafe sources and unclassified recharge stay unavailable',()=>{
 const source=monthly(),cases=[
  activeWorkspaceFrame(),
  monthly({missingDay:1}),
  pending(source,['ADS_UNAVAILABLE'],{ads:null,source_checked_at:{...source.source_checked_at,ads_at:null}}),
  pending(source,['SOURCE_UNAVAILABLE']),
  pending(source,['ARITHMETIC_UNSAFE']),
  pending(source,['RECHARGE_TREATMENT_REQUIRED'],{ads_adjustment_cents:1180}),
  pending(source,['PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','ADJUSTMENT_UNAVAILABLE'],{sales_cents:null,expected_repass_cents:null,ads_adjustment_cents:null,coverage:{...source.coverage,payment_covered:0,payment_missing:1,returns_unknown:1}}),
 ];
 for(const frame of cases){const before=clone(frame),value=verifyValue(present(frame));assert.equal(value.state,'UNAVAILABLE',frame.result.pending.join(','));assert.equal(value.amount_cents,null);assert.equal(value.margin_bps,null);assert.deepEqual(frame,before);}
});

test('an available calendar with a pending latest observation remains saved even inside 900 seconds',()=>{
 const frame=monthly({extraPending:['ADS_UNAVAILABLE']}),value=verifyValue(present(frame));assert.equal(value.state,'KNOWN_COSTS');assert.equal(value.ads_pending,true);assert.equal(value.ads_checked_at,at);assert.equal(value.amount_cents,50400);assert.ok(frame.result.pending.includes('ADS_UNAVAILABLE'));
 const both=monthly({extraPending:['ADS_UNAVAILABLE'],expenses:null}),partial=verifyValue(present(both));assert.equal(partial.state,'BEFORE_MONTHLY_COSTS');assert.equal(partial.ads_pending,true);assert.equal(partial.expenses_included,false);assert.equal(partial.amount_cents,50400);
});

test('a confirmed recharge is restored once and support already deducted in payout is never deducted again',()=>{
 const recharge=monthly({expenses:0,recharge:200,extraPending:['ADS_UNAVAILABLE']}),restored=verifyValue(present(recharge));assert.equal(restored.amount_cents,50600);
 const support=checked({...recharge,expenses:{...recharge.expenses,recharge_treatment:'TECH_SUPPORT'}}),retained=verifyValue(present(support));assert.equal(retained.amount_cents,50400);
});

test('zero and signed subtotals remain numeric while zero sales leaves the presentation margin unknown',()=>{
 const zero=verifyValue(present(monthly({payout:49600,expenses:null})));assert.equal(zero.amount_cents,0);assert.equal(zero.margin_bps,0);assert.equal(Object.is(zero.amount_cents,-0),false);
 const loss=verifyValue(present(monthly({payout:-1000,expenses:null})));assert.equal(loss.amount_cents,-50600);assert.equal(loss.margin_bps,-3614);
 const noSales=verifyValue(present(monthly({sales:0,expenses:null})));assert.equal(noSales.amount_cents,50400);assert.equal(noSales.margin_bps,null);
});

test('BigInt arithmetic tolerates unsafe intermediates and blocks unsafe exposed balances or margins',()=>{
 const maximum=Number.MAX_SAFE_INTEGER;
 const intermediate=verifyValue(present(monthly({sales:maximum,payout:maximum,production:1000,adsSpend:500,recharge:maximum,expenses:maximum,extraPending:['ADS_UNAVAILABLE']})));assert.equal(intermediate.amount_cents,Number(BigInt(maximum)-9600n));
 const overflow=verifyValue(present(monthly({sales:maximum,payout:maximum,production:0,adsSpend:0,recharge:maximum,expenses:0,extraPending:['ADS_UNAVAILABLE']})));assert.equal(overflow.state,'UNAVAILABLE');assert.equal(overflow.amount_cents,null);
 const ratio=verifyValue(present(monthly({sales:1,payout:maximum,production:0,adsSpend:0,expenses:null})));assert.equal(ratio.amount_cents,maximum-8100);assert.equal(ratio.margin_bps,null);
});

test('canonical input projection and dependency guards reject malformed values without executing accessors',()=>{
 const frame=monthly({expenses:null});let reads=0;
 for(const key of ['schema','ads','expenses','result']){const input=clone(frame);Object.defineProperty(input,key,{enumerable:true,get(){reads++;throw Error('PRIVATE_ACCESSOR');}});assert.equal(present(input),null);}
 const nested=clone(frame);Object.defineProperty(nested.ads,'expense_cents',{enumerable:true,get(){reads++;return 0;}});assert.equal(present(nested),null);assert.equal(reads,0);
 assert.equal(present({...frame,unknown:0}),null);assert.equal(present(null),null);assert.equal(projectMonthlyProfitPresentation(frame),null);assert.equal(projectMonthlyProfitPresentation(frame,projectBusinessMonth,null),null);
});

test('the transport projector enforces exact fields, canonical arrays, enums and inclusion/source relationships',()=>{
 const complete=present(monthly()),before=present(monthly({expenses:null})),unavailable=present(monthly({missingDay:1}));
 for(const value of [complete,before,unavailable]){assert.deepEqual(projectMonthlyProfitPresentationValue(value),value);const projected=projectMonthlyProfitPresentationValue(value);projected.monthly_costs_missing.push('MODIFIED');assert.notDeepEqual(projected.monthly_costs_missing,value.monthly_costs_missing);}
 const invalid=[{...before,extra:0},{...before,amount_cents:NaN},{...before,amount_cents:-0},{...before,margin_bps:-0},{...before,expenses_included:true},{...before,das_included:false},{...before,monthly_costs_missing:[]},{...before,monthly_costs_missing:['EXTERNAL_EXPENSES_REQUIRED','EXTERNAL_EXPENSES_REQUIRED']},{...before,monthly_costs_missing:['EXTERNAL_EXPENSES_REQUIRED','TAX_POLICY_REQUIRED']},{...before,ads_checked_at:null},{...before,ads_checked_at:0},{...before,ads_day_partial:null},{...complete,ads_pending:true},{...complete,basis:'BEFORE_UNCONFIRMED_EXPENSES'},{...unavailable,amount_cents:0},{...unavailable,das_included:true}];
 for(const value of invalid)assert.equal(projectMonthlyProfitPresentationValue(value),null,JSON.stringify(value));
 for(const key of Object.keys(before)){const value={...before};delete value[key];assert.equal(projectMonthlyProfitPresentationValue(value),null,key);}
 let reads=0;const accessor={...before};Object.defineProperty(accessor,'amount_cents',{enumerable:true,get(){reads++;return 0;}});assert.equal(projectMonthlyProfitPresentationValue(accessor),null);assert.equal(reads,0);
 const sparse={...before,monthly_costs_missing:new Array(1)};assert.equal(projectMonthlyProfitPresentationValue(sparse),null);
});

for(const minify of [false,true])test('both monthly presentation helpers run frozen standalone without mutations (minify='+minify+')',async()=>{
 const input=monthly({expenses:null,adsAt:at-901}),original=clone(input),source=[projectAdsCalendar,projectBusinessMonthProducts,projectBusinessMonth,buildMonthlyFinancialSummary,projectMonthlyProfitPresentation,projectMonthlyProfitPresentationValue].map(fn=>fn.toString()).join('\n')+'\nconst frame=JSON.parse(serialized);globalThis.value=projectMonthlyProfitPresentationValue(projectMonthlyProfitPresentation(frame,projectBusinessMonth,buildMonthlyFinancialSummary));globalThis.after=JSON.stringify(frame);';
 const compiled=await build({stdin:{contents:source,sourcefile:'monthly-presentation-frozen.mjs'},write:false,format:'iife',platform:'browser',target:'es2022',minify}),context=vm.createContext({serialized:JSON.stringify(input)});
 vm.runInContext(compiled.outputFiles[0].text,context);assert.deepEqual(clone(context.value),present(input));assert.deepEqual(JSON.parse(context.after),original);assert.deepEqual(input,original);
});
