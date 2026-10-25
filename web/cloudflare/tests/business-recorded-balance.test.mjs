import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildRecordedBusinessBalance,projectRecordedBusinessBalance} from '../src/business-recorded-balance.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {buildMonthlyFinancialSummary} from '../src/business-month-summary.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';

const stamp=Date.UTC(2026,9,25,12)/1000,clone=value=>structuredClone(value);
function calendar(expense=131403){
 const range={start_date:'2026-10-01',end_date:'2026-10-25'},children=[];
 for(const [first,last]of [[1,15],[16,25]]){const selection={start_date:'2026-10-'+String(first).padStart(2,'0'),end_date:'2026-10-'+String(last).padStart(2,'0')};children.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:selection,balance:0,daily:Array.from({length:last-first+1},(_,index)=>({date:'2026-10-'+String(first+index).padStart(2,'0'),expense:first+index===25?(expense/100).toFixed(2):'0',direct_gmv:0,direct_order:0,broad_gmv:0,broad_order:0}))},selection,stamp));}
 return buildAdsCalendar(children,range,stamp);
}
function reportedFrame(){
 const value={schema:'business_month_v1',month:'2026-10',start_date:'2026-10-01',end_date:'2026-10-25',status:'COMPLETE',checked_at:stamp,progress:{windows_total:2,windows_complete:2,pages_read:13,order_capacity:260},coverage:{orders:243,paid:241,completed:241,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:2,unknown:0,payment_covered:241,payment_missing:0,returns:4,returns_unknown:0},sales_cents:1576639,known_sales_cents:1576639,expected_repass_cents:1109313,known_expected_repass_cents:1109313,production_cost_cents:null,known_production_cost_cents:736510,invoice_tax_cents:8605,known_invoice_tax_cents:8605,ads_adjustment_cents:1180,ads:calendar(),expenses:{revision:1,external_expenses_cents:0,recharge_treatment:'ADS_RECHARGE',updated_at:new Date(stamp*1000).toISOString()},result:{net_estimate_cents:null,net_profit_cents:null,net_margin_bps:null,pending:['PRODUCTION_COST_INCOMPLETE','RETURNS_NOT_RECONCILED','STATUS_REVIEW_REQUIRED','FINANCIAL_SOURCE_STALE'],basis:'PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE'},unmapped_variants:[{item_id:'101',model_id:'1',quantity:1},{item_id:'102',model_id:'2',quantity:3}],bindings_revision:3,costs_revision:7,cost_rules_revision:4,classification_revision:15,tax:{schema:'business_month_tax_v1',regime:'MEI',year:2026,policy_revision:1,monthly_das_cents:8605,tax_cents:8605,status:'DECLARED',source:'OPERATOR_DECLARED_DAS',basis:'MONTHLY_COMPETENCE_NO_PRORATION'},source_checked_at:{finance_oldest_at:stamp-1800,finance_latest_at:stamp-1,ads_at:stamp},collection:{schema:'business_month_collection_v1',state:'READY',code:null,retry_after_seconds:0},product_summary:null};
 const frame=projectBusinessMonth(value);assert.ok(frame,'the reported-input fixture must cross the real monthly contract');return frame;
}
const unavailable=(value,label)=>{const result=buildRecordedBusinessBalance(value);assert.equal(result.status,'UNAVAILABLE',label);assert.equal(result.amount_cents,null,label);assert.ok(projectRecordedBusinessBalance(result),label);return result;};

test('recorded amounts give R$2339.75 while four unpriced units, two status reviews, returns and stale readings still block the strict result',()=>{
 const frame=reportedFrame(),before=clone(frame),result=buildRecordedBusinessBalance(frame);
 assert.deepEqual(result,{schema:'recorded_business_balance_v1',status:'AVAILABLE',amount_cents:233975,known_production_cents:736510,pending_production_units:4,review_orders:2,returns_orders:4,source_checked_at:frame.source_checked_at,pending:frame.result.pending,basis:'RECORDED_PAYOUT_MINUS_IDENTIFIED_COSTS_NOT_FINAL_PROFIT'});
 assert.equal(result.amount_cents,1109313-736510-8605-131403+1180);assert.equal(frame.result.net_estimate_cents,null);assert.equal(frame.result.net_profit_cents,null);assert.equal(buildMonthlyFinancialSummary(frame).balance_cents,null);assert.deepEqual(frame,before);assert.ok(projectRecordedBusinessBalance(result));
 result.pending.push('ADS_UNAVAILABLE');result.source_checked_at.ads_at=1;assert.deepEqual(frame,before,'the display result is detached from its source');
});

test('classified support is already in payout and recharge is restored once; unknown adjustments and undeclared costs remain blocked',()=>{
 const frame=reportedFrame(),support=clone(frame);support.expenses.recharge_treatment='TECH_SUPPORT';assert.equal(buildRecordedBusinessBalance(support).amount_cents,232795);
 const zero=clone(frame);zero.ads_adjustment_cents=0;zero.expenses.recharge_treatment='UNCONFIRMED';assert.equal(buildRecordedBusinessBalance(zero).amount_cents,232795);
 for(const [label,change]of [['unclassified recharge',value=>{value.expenses.recharge_treatment='UNCONFIRMED';}],['unknown adjustment',value=>{value.ads_adjustment_cents=null;}],['negative adjustment',value=>{value.ads_adjustment_cents=-1;}],['unknown expenses',value=>{value.expenses.external_expenses_cents=null;}],['undeclared zero expenses',value=>{value.expenses.revision=0;value.expenses.updated_at=null;}],['negative expenses',value=>{value.expenses.external_expenses_cents=-1;}]]){const value=clone(frame);change(value);unavailable(value,label);}
});

test('a complete balanced cohort and every declared monetary input are required independently of pending labels',()=>{
 const frame=reportedFrame();
 for(const [label,change]of [['unfinished month',value=>{value.status='RUNNING';}],['unfinished window',value=>{value.progress.windows_complete=1;}],['wrong capacity',value=>{value.progress.order_capacity=200;}],['unbalanced cohort',value=>{value.coverage.orders++;}],['unbalanced payment coverage',value=>{value.coverage.payment_covered--;}],['payment missing',value=>{value.coverage.payment_covered--;value.coverage.payment_missing=1;value.coverage.returns_unknown=1;}],['unconfirmed sales',value=>{value.sales_cents=null;}],['sales mismatch',value=>{value.known_sales_cents++;}],['unconfirmed payout',value=>{value.expected_repass_cents=null;}],['payout mismatch',value=>{value.known_expected_repass_cents++;}],['missing known production',value=>{delete value.known_production_cost_cents;}],['negative known production',value=>{value.known_production_cost_cents=-1;}],['invented complete production',value=>{value.production_cost_cents=value.known_production_cost_cents;}],['duplicate missing variant',value=>{value.unmapped_variants.push({...value.unmapped_variants[0]});}],['negative missing quantity',value=>{value.unmapped_variants[0].quantity=-1;}],['missing production flag',value=>{value.result.pending=value.result.pending.filter(code=>code!=='PRODUCTION_COST_INCOMPLETE');}],['missing review flag',value=>{value.result.pending=value.result.pending.filter(code=>code!=='STATUS_REVIEW_REQUIRED');}],['missing return flag',value=>{value.result.pending=value.result.pending.filter(code=>code!=='RETURNS_NOT_RECONCILED');}]]){const value=clone(frame);change(value);unavailable(value,label);}
 for(const code of ['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','PAYMENT_INCOMPLETE','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE','TAX_POLICY_REQUIRED']){const value=clone(frame);value.result.pending.push(code);unavailable(value,code);}
 const unknown=clone(frame);unknown.result.pending.push('PRIVATE_PROVIDER_TEXT');assert.deepEqual(unavailable(unknown,'unknown pending code').pending,[]);
});

test('MEI tax must be declared for this month and cached Ads must cover exact dates, cents and timestamps',()=>{
 const frame=reportedFrame();
 for(const [label,change]of [['tax absent',value=>{value.tax=null;}],['tax estimated',value=>{value.tax.status='PENDING';}],['tax source unknown',value=>{value.tax.source='SHOPEE_GUESS';}],['tax wrong year',value=>{value.tax.year=2025;}],['tax unversioned',value=>{value.tax.policy_revision=0;}],['DAS mismatch',value=>{value.tax.monthly_das_cents++;}],['tax amount mismatch',value=>{value.invoice_tax_cents++;}],['tax known mismatch',value=>{value.known_invoice_tax_cents++;}],['missing Ads',value=>{value.ads=null;}],['partial Ads',value=>{value.ads.status='PARTIAL';}],['other Ads period',value=>{value.ads.end_date='2026-10-24';}],['Ads unconfirmed currency',value=>{value.ads.unit_confirmation='UNVERIFIED';}],['Ads unavailable date',value=>{value.ads.days[0].expense_cents=null;}],['Ads daily mismatch',value=>{value.ads.days[0].expense_cents=1;}],['Ads known mismatch',value=>{value.ads.known_expense_cents++;}],['Ads expired',value=>{value.ads.fetched_at=stamp-901;value.source_checked_at.ads_at=stamp-901;}],['source Ads mismatch',value=>{value.source_checked_at.ads_at--;}],['source chronology mismatch',value=>{value.source_checked_at.finance_oldest_at=stamp;value.source_checked_at.finance_latest_at=stamp-1;}],['unproven stale flag',value=>{value.source_checked_at.finance_oldest_at=stamp-1;}],['missing stale flag',value=>{value.result.pending=value.result.pending.filter(code=>code!=='FINANCIAL_SOURCE_STALE');}],['blocked collection',value=>{value.collection.state='BLOCKED';value.collection.code='BUSINESS_PERIOD_INVALID_SOURCE';}]]){const value=clone(frame);change(value);unavailable(value,label);}
});

test('integer cents use BigInt throughout, retain signed balances, and expose arithmetic overflow only as unavailable',()=>{
 const frame=reportedFrame(),ceiling=Number.MAX_SAFE_INTEGER,large=clone(frame);large.expected_repass_cents=large.known_expected_repass_cents=ceiling;const amount=Number(BigInt(ceiling)-736510n-8605n-131403n+1180n);assert.equal(buildRecordedBusinessBalance(large).amount_cents,amount);
 const negative=clone(frame);negative.expected_repass_cents=negative.known_expected_repass_cents=0;const view=buildRecordedBusinessBalance(negative);assert.equal(view.amount_cents,-875338);assert.ok(projectRecordedBusinessBalance(view));
 const overflow=clone(frame);overflow.expected_repass_cents=overflow.known_expected_repass_cents=ceiling;overflow.known_production_cost_cents=0;overflow.ads=calendar(0);overflow.ads_adjustment_cents=ceiling;const result=unavailable(overflow,'overflow');assert.ok(result.pending.includes('ARITHMETIC_UNSAFE'));assert.ok(!overflow.result.pending.includes('ARITHMETIC_UNSAFE'));
 const units=clone(frame);units.unmapped_variants=[{item_id:'1',model_id:'0',quantity:ceiling},{item_id:'2',model_id:'0',quantity:1}];assert.ok(unavailable(units,'unsafe unit count').pending.includes('ARITHMETIC_UNSAFE'));
});

test('defensive reads and DTO projection execute no accessors and never substitute zero for missing values',()=>{
 const frame=reportedFrame();let getters=0;
 for(const [select,key]of [[value=>value,'sales_cents'],[value=>value.ads,'expense_cents'],[value=>value.coverage,'paid'],[value=>value.tax,'monthly_das_cents'],[value=>value.progress,'order_capacity'],[value=>value.unmapped_variants[0],'quantity'],[value=>value.source_checked_at,'finance_oldest_at']]){const value=clone(frame);Object.defineProperty(select(value),key,{enumerable:true,get(){getters++;return 0;}});unavailable(value,key);assert.equal(getters,0,key);}
 const invalid=buildRecordedBusinessBalance(null);assert.equal(invalid.amount_cents,null);assert.equal(invalid.known_production_cents,null);assert.equal(invalid.pending_production_units,null);assert.equal(invalid.review_orders,null);assert.equal(invalid.returns_orders,null);assert.ok(projectRecordedBusinessBalance(invalid));
 const output=buildRecordedBusinessBalance(frame);for(const patch of [{profit_cents:output.amount_cents},{amount_cents:Number.MAX_SAFE_INTEGER+1},{known_production_cents:-1},{pending_production_units:null},{source_checked_at:{...output.source_checked_at,ads_at:null}},{pending:[...output.pending,'ADS_UNAVAILABLE']}])assert.equal(projectRecordedBusinessBalance({...output,...patch}),null);
 assert.equal(projectRecordedBusinessBalance({...invalid,amount_cents:0}),null);const poison=clone(output);Object.defineProperty(poison,'amount_cents',{enumerable:true,get(){getters++;return 0;}});assert.equal(projectRecordedBusinessBalance(poison),null);assert.equal(getters,0);
});

test('builder and DTO projector run standalone in the browser realm and do not mutate their input',()=>{
 const frame=reportedFrame(),context=vm.createContext({raw:JSON.stringify(frame)});vm.runInContext(buildRecordedBusinessBalance.toString()+'\n'+projectRecordedBusinessBalance.toString()+'\nglobalThis.frame=JSON.parse(raw);globalThis.view=projectRecordedBusinessBalance(buildRecordedBusinessBalance(frame));',context);
 assert.deepEqual(JSON.parse(JSON.stringify(context.view)),buildRecordedBusinessBalance(frame));assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(frame)',context)),frame);
 const projected=projectRecordedBusinessBalance(buildRecordedBusinessBalance(frame));projected.pending.pop();projected.source_checked_at.finance_oldest_at=1;assert.equal(frame.result.pending.length,4);assert.equal(frame.source_checked_at.finance_oldest_at,stamp-1800);
});
