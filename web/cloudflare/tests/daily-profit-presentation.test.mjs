import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {projectDailyProfitPresentation} from '../src/daily-profit-presentation.mjs';

const base='daily_profit_presentation_v1';
function row({payout=12000,production=4000,knownProduction=production??4000,ads=1500,recharge=200,das=300,expenses=100,paid=1,units=1,knownUnits=production===null?0:units,paymentMissing=0,extraPending=[]}={}){
 const pending=[...extraPending];if(das===null)pending.push('TAX_POLICY_REQUIRED');if(expenses===null)pending.push('EXTERNAL_EXPENSES_REQUIRED');if(ads===null)pending.push('ADS_UNAVAILABLE');if(production===null)pending.push('PRODUCTION_COST_INCOMPLETE');if(paymentMissing)pending.push('PAYMENT_INCOMPLETE');if(recharge===null&&!pending.some(code=>['ADJUSTMENT_UNAVAILABLE','RECHARGE_TREATMENT_REQUIRED'].includes(code)))pending.push('ADJUSTMENT_UNAVAILABLE');
 const hasOperating=payout!==null&&ads!==null&&recharge!==null,operating=hasOperating?payout+recharge-knownProduction-ads:null,known=hasOperating&&das!==null&&expenses!==null?operating-das-expenses:null,estimate=production!==null?known:null;
 return {date:'2026-11-01',state:estimate!==null?'PROVISIONAL':known!==null?'PARTIAL_COSTS':'UNAVAILABLE',reason:null,day_partial:true,source_cutoff_at:1793530800,coverage:{orders:paid,paid,completed:0,ongoing:paid,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:paid-paymentMissing,payment_missing:paymentMissing,returns:0,returns_unknown:paymentMissing},sales_cents:14000,base_repass_cents:payout,adjustment_cents:0,after_adjustment_repass_cents:payout,payout_basis:payout===null?'UNAVAILABLE':'AFTER_ADJUSTMENTS',payout_cents:payout,production_cost_cents:production,known_production_cost_cents:knownProduction,production_coverage:{total_units:units,known_units:knownUnits,pending_units:units-knownUnits},ads_spend_cents:ads,recharge_addback_cents:recharge,allocated_das_cents:das,allocated_expenses_cents:expenses,operating_balance_cents:production!==null?operating:null,estimate_cents:estimate,known_estimate_cents:known,source_checked_at:{finance_oldest_at:1793530801,finance_latest_at:1793530802,ads_at:1793530803},pending};
}
const missing=(value,...codes)=>assert.deepEqual(value.monthly_costs_missing,codes);

test('a fully priced daily estimate retains its exact amount and includes both confirmed monthly shares',()=>{
 const input=row(),before=structuredClone(input),value=projectDailyProfitPresentation(input);assert.deepEqual(value,{schema:base,state:'ESTIMATE',basis:'AFTER_DAILY_AND_ALLOCATED_MONTHLY_COSTS',amount_cents:6300,monthly_costs_missing:[],das_included:true,expenses_included:true});assert.deepEqual(input,before);assert.equal(input.estimate_cents,6300);
});

test('unknown monthly expenses expose a separately named subtotal after known DAS without manufacturing net profit',()=>{
 const input=row({expenses:null}),value=projectDailyProfitPresentation(input);assert.equal(value.state,'BEFORE_MONTHLY_COSTS');assert.equal(value.basis,'BEFORE_UNCONFIRMED_EXPENSES');assert.equal(value.amount_cents,6400);assert.equal(value.das_included,true);assert.equal(value.expenses_included,false);missing(value,'EXTERNAL_EXPENSES_REQUIRED');assert.equal(input.allocated_expenses_cents,null);assert.equal(input.estimate_cents,null);assert.equal(input.known_estimate_cents,null);
});

test('unknown DAS and unknown combined monthly costs have distinct bases and inclusion flags',()=>{
 const tax=projectDailyProfitPresentation(row({das:null}));assert.equal(tax.state,'BEFORE_MONTHLY_COSTS');assert.equal(tax.basis,'BEFORE_UNCONFIRMED_DAS');assert.equal(tax.amount_cents,6600);assert.equal(tax.das_included,false);assert.equal(tax.expenses_included,true);missing(tax,'TAX_POLICY_REQUIRED');
 const both=projectDailyProfitPresentation(row({das:null,expenses:null}));assert.equal(both.basis,'BEFORE_UNCONFIRMED_DAS_AND_EXPENSES');assert.equal(both.amount_cents,6700);assert.equal(both.das_included,false);assert.equal(both.expenses_included,false);missing(both,'TAX_POLICY_REQUIRED','EXTERNAL_EXPENSES_REQUIRED');
});

test('confirmed zero costs stay included and a verified zero estimate remains available',()=>{
 const zeroExpense=projectDailyProfitPresentation(row({expenses:0}));assert.equal(zeroExpense.state,'ESTIMATE');assert.equal(zeroExpense.amount_cents,6400);assert.equal(zeroExpense.expenses_included,true);missing(zeroExpense);
 const zeroTax=projectDailyProfitPresentation(row({das:0}));assert.equal(zeroTax.amount_cents,6600);assert.equal(zeroTax.das_included,true);
 const empty=row({payout:0,production:0,knownProduction:0,ads:0,recharge:0,das:0,expenses:0,paid:0,units:0}),zero=projectDailyProfitPresentation(empty);assert.equal(zero.state,'ESTIMATE');assert.equal(zero.amount_cents,0);assert.equal(Object.is(zero.amount_cents,-0),false);assert.equal(zero.das_included,true);assert.equal(zero.expenses_included,true);
});

test('daily losses remain signed for complete estimates and before-expense subtotals',()=>{
 const complete=projectDailyProfitPresentation(row({payout:-1000}));assert.equal(complete.state,'ESTIMATE');assert.equal(complete.amount_cents,-6700);
 const partial=projectDailyProfitPresentation(row({payout:-1000,expenses:null}));assert.equal(partial.state,'BEFORE_MONTHLY_COSTS');assert.equal(partial.amount_cents,-6600);assert.equal(partial.expenses_included,false);
});

test('unknown production retains the existing known-cost figure only when both fixed costs are confirmed',()=>{
 const input=row({production:null,knownProduction:4000,units:2,knownUnits:1}),value=projectDailyProfitPresentation(input);assert.equal(value.state,'KNOWN_COSTS');assert.equal(value.basis,'AFTER_IDENTIFIED_PRODUCTION_AND_MONTHLY_COSTS');assert.equal(value.amount_cents,6300);assert.equal(input.estimate_cents,null);assert.equal(input.operating_balance_cents,null);assert.equal(value.das_included,true);assert.equal(value.expenses_included,true);
 const both=row({production:null,knownProduction:4000,units:2,knownUnits:1,expenses:null}),blocked=projectDailyProfitPresentation(both);assert.equal(blocked.state,'UNAVAILABLE');assert.equal(blocked.amount_cents,null);assert.equal(blocked.das_included,false);assert.equal(blocked.expenses_included,false);missing(blocked,'EXTERNAL_EXPENSES_REQUIRED');
});

test('missing Ads, missing payout and unclassified recharge do not produce a false daily net or subtotal',()=>{
 for(const input of [row({ads:null}),row({payout:null,recharge:null,paymentMissing:1}),row({recharge:null,extraPending:['RECHARGE_TREATMENT_REQUIRED']}),row({ads:null,expenses:null})]){const value=projectDailyProfitPresentation(input);assert.ok(value);assert.equal(value.state,'UNAVAILABLE');assert.equal(value.amount_cents,null);assert.equal(value.das_included,false);assert.equal(value.expenses_included,false);assert.equal(input.estimate_cents,null);}
});

test('missing date evidence cannot acquire a subtotal from fields left over from another day',()=>{
 for(const reason of ['DAILY_HISTORY_PENDING','CREATION_DATE_INCOMPLETE']){
  const input={...row(),reason,state:'UNAVAILABLE',coverage:null,payout_basis:'UNAVAILABLE',payout_cents:null,production_cost_cents:null,known_production_cost_cents:null,production_coverage:{total_units:null,known_units:null,pending_units:null},recharge_addback_cents:null,operating_balance_cents:null,estimate_cents:null,known_estimate_cents:null,pending:[reason]};
  const value=projectDailyProfitPresentation(input);assert.equal(value.state,'UNAVAILABLE');assert.equal(value.amount_cents,null);input.operating_balance_cents=1;assert.equal(projectDailyProfitPresentation(input),null);
 }
});

test('informational review, stale-source and adjustment flags remain on the day and do not change known arithmetic',()=>{
 const input=row({expenses:null,extraPending:['STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED','FINANCIAL_SOURCE_STALE','ADS_SOURCE_STALE','ADJUSTMENTS_PENDING']}),before=structuredClone(input);input.payout_basis='BASE_REPASS';const value=projectDailyProfitPresentation(input);assert.equal(value.amount_cents,6400);assert.equal(value.state,'BEFORE_MONTHLY_COSTS');assert.deepEqual(input.pending,before.pending);assert.equal(Object.hasOwn(value,'realized_net_cents'),false);assert.equal(Object.hasOwn(value,'net_cents'),false);
});

test('forged arithmetic, inconsistent known-cost counts and missing-required flags fail closed',()=>{
 for(const mutate of [value=>value.estimate_cents++,value=>value.known_estimate_cents++,value=>value.operating_balance_cents++,value=>value.production_cost_cents++,value=>value.production_coverage.pending_units++,value=>value.production_coverage.known_units=0,value=>value.payout_basis='UNAVAILABLE',value=>value.state='PARTIAL_COSTS',value=>value.pending=['EXTERNAL_EXPENSES_REQUIRED'],value=>value.pending=['PRIVATE_PROVIDER_CODE'],value=>value.pending=['ADS_UNAVAILABLE'],value=>value.pending=['ARITHMETIC_UNSAFE'],value=>value.pending=['STATUS_REVIEW_REQUIRED','STATUS_REVIEW_REQUIRED']]){const input=row();mutate(input);assert.equal(projectDailyProfitPresentation(input),null,mutate.toString());}
 const missingFlag=row({expenses:null});missingFlag.pending=[];assert.equal(projectDailyProfitPresentation(missingFlag),null);
});

test('all monetary components reject nonintegers, negative zero and unsafe or nonnumeric values',()=>{
 for(const field of ['payout_cents','production_cost_cents','known_production_cost_cents','ads_spend_cents','recharge_addback_cents','allocated_das_cents','allocated_expenses_cents','operating_balance_cents','estimate_cents','known_estimate_cents'])for(const invalid of [NaN,Infinity,-Infinity,-0,0.1,Number.MAX_SAFE_INTEGER+1,'0',false,undefined]){const input=row();input[field]=invalid;assert.equal(projectDailyProfitPresentation(input),null,field+' '+String(invalid));}
 for(const field of ['production_cost_cents','known_production_cost_cents','ads_spend_cents','recharge_addback_cents','allocated_das_cents','allocated_expenses_cents']){const input=row();input[field]=-1;assert.equal(projectDailyProfitPresentation(input),null,field);}
});

test('BigInt preserves representable boundaries while unsafe operating and subtotal sums stay unavailable',()=>{
 const maximum=Number.MAX_SAFE_INTEGER,input=row({payout:maximum,production:0,knownProduction:0,ads:0,recharge:0,das:0,expenses:0});assert.equal(projectDailyProfitPresentation(input).amount_cents,maximum);
 const overflow=row({payout:maximum,production:0,knownProduction:0,ads:0,recharge:1,das:0,expenses:null});assert.equal(projectDailyProfitPresentation(overflow),null);
 const negative=row({payout:Number.MIN_SAFE_INTEGER,production:0,knownProduction:0,ads:0,recharge:0,das:0,expenses:null});assert.equal(projectDailyProfitPresentation(negative).amount_cents,Number.MIN_SAFE_INTEGER);negative.allocated_das_cents=1;assert.equal(projectDailyProfitPresentation(negative),null);
});

test('private fields and accessors cannot be exposed or invoked, and output data is detached',()=>{
 const input=row({expenses:null}),before=structuredClone(input);input.private_token='PRIVATE_TOKEN';Object.defineProperty(input,'private_message',{get(){throw Error('PRIVATE_MESSAGE');}});const output=projectDailyProfitPresentation(input);assert.doesNotMatch(JSON.stringify(output),/PRIVATE|private_|order_hash|source_checked_at/);output.monthly_costs_missing.push('TAX_POLICY_REQUIRED');assert.deepEqual(projectDailyProfitPresentation(input).monthly_costs_missing,['EXTERNAL_EXPENSES_REQUIRED']);assert.deepEqual(input.pending,before.pending);
 let calls=0;for(const object of [row(),row().production_coverage]){const field=Object.hasOwn(object,'state')?'state':'total_units';Object.defineProperty(object,field,{enumerable:true,get(){calls++;throw Error('PRIVATE_GETTER');}});const value=field==='total_units'?{...row(),production_coverage:object}:object;assert.equal(projectDailyProfitPresentation(value),null);}assert.equal(calls,0);
 const array=row();Object.defineProperty(array.pending,'0',{get(){calls++;throw Error('PRIVATE_ARRAY_GETTER');},enumerable:true});array.pending.length=1;assert.equal(projectDailyProfitPresentation(array),null);assert.equal(calls,0);
});

test('the exact self-contained browser function matches the server for complete, partial, zero and negative rows',()=>{
 const rows=[row(),row({expenses:null}),row({das:null}),row({das:null,expenses:null}),row({production:null,knownProduction:4000,units:2,knownUnits:1}),row({ads:null}),row({payout:0,production:0,knownProduction:0,ads:0,recharge:0,das:0,expenses:0,paid:0,units:0}),row({payout:-1000,expenses:null})];
 const context=vm.createContext({serialized:JSON.stringify(rows)});vm.runInContext(projectDailyProfitPresentation.toString()+'\nglobalThis.output=JSON.parse(serialized).map(projectDailyProfitPresentation);',context);assert.deepEqual(JSON.parse(JSON.stringify(context.output)),rows.map(projectDailyProfitPresentation));
});
