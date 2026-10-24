import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildAccountDiagnosis} from '../src/account-diagnosis.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {buildBusinessMonthProducts,projectBusinessMonthProducts} from '../src/business-month-products.mjs';
import {projectAdsCalendar} from '../src/ads-calendar.mjs';

const stamp=Math.floor(Date.UTC(2026,10,2,12)/1000);
const basis='PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE';
const copy=value=>structuredClone(value);
const safe=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
function metric(gmv,expense){
 let ratio=null;
 if(expense>0){let value=BigInt(gmv)*1000000n/BigInt(expense);if(BigInt(gmv)*1000000n%BigInt(expense)*2n>=BigInt(expense))value++;ratio=(value/1000000n)+'.'+String(value%1000000n).padStart(6,'0');}
 return {gmv_cents:gmv,orders:gmv?1:0,reported_roas_raw:null,calculated_roas_raw:ratio};
}
function calendar(expense=10000,gmv=120000,end='2026-10-31',at=stamp){
 const dates=Array.from({length:Number(end.slice(8))},(_,index)=>'2026-10-'+String(index+1).padStart(2,'0'));
 const value={schema:'ads_calendar_v1',status:'AVAILABLE',start_date:'2026-10-01',end_date:end,fetched_at:at,covered_days:dates.length,total_days:dates.length,missing_dates:[],expense_cents:expense,known_expense_cents:expense,balance_cents:0,days:dates.map((date,index)=>({date,expense_cents:index?0:expense,direct:metric(index?0:gmv,index?0:expense),broad:metric(index?0:gmv,index?0:expense)})),day_partial:end===new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(at*1000)),unit_confirmation:'OPERATOR_CONFIRMED_BRL_2026_10_20',source_timezone:'UNCONFIRMED',basis:'CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION',diagnostic:null,totals:{direct:metric(gmv,expense),broad:metric(gmv,expense)}};
 assert.ok(projectAdsCalendar(value),'Ads fixture must satisfy the source contract');
 return value;
}
function fixture({sales=120000,payout=100000,production=75000,tax=7000,adsSpend=10000,adsGmv=120000,adjustment=0,treatment='UNCONFIRMED',external=0,end='2026-10-31',at=stamp}={}){
 const windows=Math.ceil(Number(end.slice(8))/15),addback=treatment==='ADS_RECHARGE'?adjustment:0;
 const net=safe(BigInt(payout)-BigInt(production)-BigInt(tax)+BigInt(addback)-BigInt(adsSpend)-BigInt(external));
 const value={schema:'business_month_v1',month:'2026-10',start_date:'2026-10-01',end_date:end,status:'COMPLETE',checked_at:at,progress:{windows_total:windows,windows_complete:windows,pages_read:windows},coverage:{orders:3,paid:3,completed:2,ongoing:1,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:3,payment_missing:0,returns:0,returns_unknown:0},sales_cents:sales,known_sales_cents:sales,expected_repass_cents:payout,known_expected_repass_cents:payout,production_cost_cents:production,known_production_cost_cents:production,invoice_tax_cents:tax,known_invoice_tax_cents:tax,ads_adjustment_cents:adjustment,ads:calendar(adsSpend,adsGmv,end,at),expenses:{revision:1,external_expenses_cents:external,recharge_treatment:treatment,updated_at:new Date(at*1000).toISOString()},result:{net_estimate_cents:net,net_profit_cents:null,net_margin_bps:sales>0?safe(BigInt(net)*10000n/BigInt(sales)):null,pending:[],basis},unmapped_variants:[],bindings_revision:1,costs_revision:1,tax:{schema:'business_month_tax_v1',regime:'MEI',year:2026,policy_revision:1,monthly_das_cents:tax,tax_cents:tax,status:'DECLARED',source:'OPERATOR_DECLARED_DAS',basis:'MONTHLY_COMPETENCE_NO_PRORATION'},source_checked_at:{finance_oldest_at:at,finance_latest_at:at,ads_at:at}};
 assert.ok(projectBusinessMonth(value),'month fixture must satisfy the source contract');
 return value;
}
function pending(value,codes){value.result={...value.result,net_estimate_cents:null,net_margin_bps:null,pending:[...codes]};return value;}
function diagnose(value){assert.ok(projectBusinessMonth(value),'modified fixture must remain valid');const result=buildAccountDiagnosis(value);assert.ok(result);return result;}

test('15% available margin with Ads ROAS 12 remains a positive estimate and never claims actual profit or authorizes scale',()=>{
 const month=fixture(),value=diagnose(month);
 assert.equal(month.ads.totals.broad.calculated_roas_raw,'12.000000');
 assert.equal(value.metrics.available_before_ads_cents,18000);
 assert.equal(value.metrics.net_estimate_cents,8000);
 assert.equal(value.metrics.net_margin_bps,666);
 assert.equal(value.metrics.tacos_bps,833);
 assert.equal(value.status,'READY_FOR_REVIEW');
 assert.equal(value.actual_profit_cents,null);
 assert.equal(value.execution,'READ_ONLY');
 assert.ok(value.tasks.some(task=>task.code==='CHECK_STOCK_AND_CAMPAIGN'));
 assert.ok(!value.tasks.some(task=>task.code==='REVIEW_SCALE'));
 assert.deepEqual(value.conditions,[]);
 assert.equal(value.schema,'account_diagnosis_v1');
 assert.equal(value.month,'2026-10');
 assert.equal(value.basis,basis);
});

test('TACOS divides actual period Ads spend by paid store sales rather than attributed Ads GMV or daily ROAS',()=>{
 const value=diagnose(fixture({sales:200000,adsSpend:10000,adsGmv:600000}));
 assert.equal(value.metrics.paid_store_sales_cents,200000);
 assert.equal(value.metrics.ads_spend_cents,10000);
 assert.equal(value.metrics.tacos_bps,500);
 assert.notEqual(value.metrics.tacos_bps,166);
 assert.ok(Object.values(value.metrics).every(amount=>amount===null||Number.isSafeInteger(amount)));
});

test('missing costs, actual Ads and expenses stay unavailable rather than becoming zero',()=>{
 const month=fixture();month.production_cost_cents=null;month.ads=null;month.source_checked_at.ads_at=null;
 month.expenses={revision:0,external_expenses_cents:null,recharge_treatment:'UNCONFIRMED',updated_at:null};
 pending(month,['PRODUCTION_COST_INCOMPLETE','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED']);
 const value=diagnose(month);
 for(const key of ['ads_spend_cents','tacos_bps','available_before_ads_cents','net_estimate_cents','net_margin_bps','costed_quantity','total_quantity','cost_coverage_bps'])assert.equal(value.metrics[key],null,key);
 assert.equal(value.status,'BLOCKED');
 assert.deepEqual(value.conditions,month.result.pending);
});

test('a verified zero Ads expense remains zero while zero sales never creates a TACOS ratio',()=>{
 const value=diagnose(fixture({sales:0,payout:0,production:0,adsSpend:0,adsGmv:0}));
 assert.equal(value.metrics.paid_store_sales_cents,0);
 assert.equal(value.metrics.ads_spend_cents,0);
 assert.equal(value.metrics.tacos_bps,null);
 assert.equal(value.metrics.net_estimate_cents,-7000);
 assert.equal(value.metrics.net_margin_bps,null);
 assert.equal(value.status,'READY_FOR_REVIEW');
});

test('confirmed Ads recharge is added back exactly once; support stays in the payout deduction',()=>{
 const recharge=diagnose(fixture({adjustment:5000,treatment:'ADS_RECHARGE',external:1000}));
 assert.equal(recharge.metrics.recharge_addback_cents,5000);
 assert.equal(recharge.metrics.available_before_ads_cents,22000);
 assert.equal(recharge.metrics.net_estimate_cents,12000);
 const support=diagnose(fixture({adjustment:5000,treatment:'TECH_SUPPORT',external:1000}));
 assert.equal(support.metrics.recharge_addback_cents,0);
 assert.equal(support.metrics.available_before_ads_cents,17000);
 assert.equal(support.metrics.net_estimate_cents,7000);
 const month=fixture();month.ads_adjustment_cents=5000;pending(month,['RECHARGE_TREATMENT_REQUIRED']);
 const unconfirmed=diagnose(month);assert.equal(unconfirmed.metrics.available_before_ads_cents,null);assert.equal(unconfirmed.metrics.net_estimate_cents,null);assert.equal(unconfirmed.status,'BLOCKED');
});

test('payment, returns, stale finance and DAS blockers survive diagnosis without releasing estimated profit',()=>{
 const months=[];
 const payment=fixture();payment.coverage.payment_covered=2;payment.coverage.payment_missing=1;payment.coverage.returns_unknown=1;payment.sales_cents=null;payment.expected_repass_cents=null;payment.ads_adjustment_cents=null;months.push(pending(payment,['PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','ADJUSTMENT_UNAVAILABLE']));
 const returns=fixture();returns.coverage.returns=1;months.push(pending(returns,['RETURNS_NOT_RECONCILED']));
 const das=fixture();das.invoice_tax_cents=null;das.known_invoice_tax_cents=null;das.tax={...das.tax,policy_revision:0,monthly_das_cents:null,tax_cents:null,status:'PENDING',source:'DAS_REQUIRED'};months.push(pending(das,['TAX_POLICY_REQUIRED','INVOICE_TAX_UNAVAILABLE']));
 const at=Math.floor(Date.UTC(2026,9,24,12)/1000),stale=fixture({end:'2026-10-24',at});stale.source_checked_at.finance_oldest_at=at-901;months.push(pending(stale,['FINANCIAL_SOURCE_STALE']));
 for(const month of months){const value=diagnose(month);assert.equal(value.status,'BLOCKED');assert.equal(value.metrics.net_estimate_cents,null);assert.equal(value.metrics.available_before_ads_cents,null);assert.deepEqual(value.conditions,month.result.pending);assert.ok(value.tasks.length<=15);assert.equal(value.execution,'READ_ONLY');}
});

test('available balance before Ads can be reviewed with unavailable actual spend, but net estimate remains blocked',()=>{
 const month=fixture();month.ads=null;month.source_checked_at.ads_at=null;pending(month,['ADS_UNAVAILABLE']);
 const value=diagnose(month);assert.equal(value.metrics.available_before_ads_cents,18000);assert.equal(value.metrics.ads_spend_cents,null);assert.equal(value.metrics.net_estimate_cents,null);assert.equal(value.status,'BLOCKED');
});

test('the task list stays bounded with every supported monthly blocker and retains their exact conditions',()=>{
 const codes=['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE','TAX_POLICY_REQUIRED','FINANCIAL_SOURCE_STALE'];
 const at=Math.floor(Date.UTC(2026,9,24,12)/1000),month=fixture({end:'2026-10-24',at});
 month.status='RUNNING';month.progress.windows_complete=1;month.source_checked_at.finance_oldest_at=at-901;
 for(const key of ['sales_cents','expected_repass_cents','production_cost_cents','invoice_tax_cents','ads_adjustment_cents','known_invoice_tax_cents'])month[key]=null;
 month.tax={...month.tax,policy_revision:0,monthly_das_cents:null,tax_cents:null,status:'PENDING',source:'DAS_REQUIRED'};
 pending(month,codes);
 const value=diagnose(month);assert.deepEqual(value.conditions,codes);assert.ok(value.tasks.length<=15);assert.ok(value.tasks.some(task=>task.code==='CHECK_STOCK_AND_CAMPAIGN'));assert.equal(new Set(value.tasks.map(task=>task.code)).size,value.tasks.length);assert.equal(value.metrics.net_estimate_cents,null);
});

test('unsafe intermediate money and ratios are blocked using exact integers instead of rounded floating point',()=>{
 const max=Number.MAX_SAFE_INTEGER;
 const before=diagnose(fixture({sales:max,payout:max,production:0,tax:1,adjustment:max,treatment:'ADS_RECHARGE',adsSpend:max,adsGmv:max}));
 assert.equal(before.metrics.available_before_ads_cents,null);assert.equal(before.metrics.net_estimate_cents,null);assert.equal(before.status,'BLOCKED');assert.ok(before.conditions.includes('ARITHMETIC_UNSAFE'));
 const ratio=diagnose(fixture({sales:1,payout:max,production:0,tax:1,adsSpend:max,adsGmv:max}));
 assert.equal(ratio.metrics.tacos_bps,null);assert.equal(ratio.metrics.net_estimate_cents,null);assert.equal(ratio.status,'BLOCKED');assert.ok(ratio.conditions.includes('ARITHMETIC_UNSAFE'));
});

test('product cost coverage counts sold quantities with different cost mapping without inventing SKU Ads attribution',()=>{
 const month=fixture({sales:30000,payout:24000,production:2000,adsSpend:1000,end:'2026-10-15'});
 month.production_cost_cents=null;month.unmapped_variants=[{item_id:'201',model_id:'11',quantity:1}];pending(month,['PRODUCTION_COST_INCOMPLETE']);
 const source={status:'COMPLETE',product_breakdown:{schema:'business_product_breakdown_v1',mixed_orders:0,known_mixed_sales_base_raw:'0',known_mixed_expected_repass_raw:'0',known_mixed_invoice_tax_raw:'0',known_mixed_ads_adjustment_raw:'0',products:[{item_id:'201',quantity:3,orders:3,exclusive_orders:3,mixed_orders:0,exclusive_payment_covered:3,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,known_exclusive_sales_base_raw:'300',exclusive_sales_base_raw:'300',known_exclusive_expected_repass_raw:'240',exclusive_expected_repass_raw:'240',known_exclusive_invoice_tax_raw:'0',exclusive_invoice_tax_raw:'0',known_exclusive_ads_adjustment_raw:'0',exclusive_ads_adjustment_raw:'0',items:[{model_id:'10',exclusive_quantity:2,mixed_quantity:0},{model_id:'11',exclusive_quantity:1,mixed_quantity:0}]}]}};
 month.product_summary=buildBusinessMonthProducts([source],month,[{item_id:'201',model_id:'10',quantity:2,unit_cost_cents:1000,production_cost_cents:2000},{item_id:'201',model_id:'11',quantity:1,unit_cost_cents:null,production_cost_cents:null}],{revision:1,bindings:[{item_id:'201',model_id:'10',selling_unit:'SINGLE_GARMENT',size:'P'}]});
 assert.ok(month.product_summary);
 const value=diagnose(month);assert.equal(value.metrics.total_quantity,3);assert.equal(value.metrics.costed_quantity,2);assert.equal(value.metrics.cost_coverage_bps,6666);assert.equal(value.metrics.net_estimate_cents,null);
 assert.equal(Object.hasOwn(value,'products'),false);assert.equal(Object.hasOwn(value.metrics,'sku_roas'),false);
});

test('forged month totals, actual profit, foreign fields and accessors are rejected before diagnosis',()=>{
 const month=fixture();
 for(const mutate of [v=>v.result.net_estimate_cents++,v=>v.result.net_margin_bps++,v=>v.result.net_profit_cents=1,v=>v.sales_cents++,v=>v.ads.days[0].expense_cents++,v=>v.coverage.paid++,v=>v.private_token='PRIVATE']){const altered=copy(month);mutate(altered);assert.equal(buildAccountDiagnosis(altered),null);}
 assert.equal(buildAccountDiagnosis(null),null);assert.equal(buildAccountDiagnosis({}),null);
 let reads=0;
 for(const field of ['sales_cents','result','tax']){const altered=copy(month);Object.defineProperty(altered,field,{enumerable:true,get(){reads++;return month[field];}});assert.equal(buildAccountDiagnosis(altered),null);}
 assert.equal(reads,0);
});

test('legacy missing DAS or source timestamps remains blocked even when the parent accepts its old estimate',()=>{
 for(const field of ['tax','source_checked_at']){const month=fixture();delete month[field];const value=diagnose(month);assert.equal(value.status,'BLOCKED');assert.equal(value.metrics.net_estimate_cents,null);assert.equal(value.metrics.available_before_ads_cents,null);assert.ok(value.conditions.length>0);}
});

test('browser embedding is closure-free and output is detached from its parent frame',()=>{
 const month=fixture(),expected=diagnose(month),context=vm.createContext({Intl});context.serialized=JSON.stringify(month);
 new vm.Script(projectAdsCalendar.toString()+'\n'+projectBusinessMonthProducts.toString()+'\n'+projectBusinessMonth.toString()+'\n'+buildAccountDiagnosis.toString()+'\nglobalThis.actual=buildAccountDiagnosis(JSON.parse(serialized));').runInContext(context);
 assert.deepEqual(JSON.parse(JSON.stringify(context.actual)),expected);
 expected.metrics.net_estimate_cents=999;expected.conditions.push('PRIVATE');expected.tasks[0].label='PRIVATE';
 assert.equal(month.result.net_estimate_cents,8000);assert.deepEqual(month.result.pending,[]);assert.equal(buildAccountDiagnosis(month).metrics.net_estimate_cents,8000);
});
