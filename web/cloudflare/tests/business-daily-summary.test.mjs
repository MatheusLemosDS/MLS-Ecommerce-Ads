import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {collectionFixture} from './business-collection-fixture.mjs';
import {businessMonth,projectBusinessMonth,readBusinessMonthDisplay} from '../src/business-month.mjs';
import {readCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {projectBusinessMonthAuditScope} from '../src/business-month-view-state.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {buildMonthlyFinancialSummary} from '../src/business-month-summary.mjs';
import {buildDailyBusinessSummary,projectDailyBusinessSummary} from '../src/business-daily-summary.mjs';
import {projectAdsCalendar,buildAdsCalendar} from '../src/ads-calendar.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {projectBusinessMonthProducts} from '../src/business-month-products.mjs';
import {readCostRules,saveCostRules} from '../src/cost-rules.mjs';

const validators={projectMonthly:projectBusinessMonth,projectFrame:projectBusinessPeriodFrame,projectScope:projectBusinessMonthAuditScope};
const clone=value=>structuredClone(value);
const day=(value,date)=>value.days.find(row=>row.date===date);
const verify=value=>{assert.ok(projectBusinessMonth(value),'test monthly input must satisfy its real projector');return value;};
async function fixture(t,{counts=[3,1],returns=false,setup=()=>{}}={}){
 const f=await collectionFixture({allPaid:true,returns,daily:true,windowCounts:counts,paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 await setup(f);
 let monthly=await f.invoke('start');for(let n=0;monthly.status==='RUNNING'&&n<12;n++)monthly=await f.invoke('step');assert.equal(monthly.status,'COMPLETE');monthly=await f.invoke('ads');
 const publication=await readCompletedBusinessMonth(f.env,'2026-10',{now:f.now}),frames=publication.payload.slots.map(row=>row.frame),scope={publication_revision:publication.publication.source_revision,start_date:monthly.start_date,end_date:monthly.end_date,sources:frames.map(frame=>({run_id:frame.run_id,source_revision:frame.revision,start_date:frame.start_date,end_date:frame.end_date}))};
 assert.ok(frames.every(frame=>projectBusinessPeriodFrame(frame)&&frame.daily_breakdown));assert.ok(projectBusinessMonthAuditScope(scope));verify(monthly);
 return {...f,monthly,frames,scope,calculate:(m=monthly,p=frames,s=scope)=>buildDailyBusinessSummary(m,p,s,validators)};
}
const payment=(f,index,{sales=65.25,payout=47.51,recharge=0,adjustment,after,returns=[]}={})=>f.provider({order_sn:f.serial(index),return_order_sn_list:returns,order_income:{order_sn:f.serial(index),original_cost_of_goods_sold:sales,escrow_amount:payout,ads_escrow_top_up_fee_or_technical_support_fee:recharge,...(adjustment===undefined?{}:{total_adjustment_amount:adjustment}),...(after===undefined?{}:{escrow_amount_after_adjustment:after}),items:[{item_id:f.item(index),model_id:0,line_item_id:index+1,quantity_purchased:1}]}});

test('daily profit uses that date’s actual paid orders, current unit costs and Ads; only fixed costs are allocated',async t=>{
 const f=await fixture(t),before=clone({monthly:f.monthly,frames:f.frames,scope:f.scope}),calls=clone(f.calls),db=[f.env.ADMIN_DB.calls,f.financeEnv.FINANCE_DB.calls],value=f.calculate();
 assert.ok(value);assert.equal(value.state,'AVAILABLE');assert.ok(projectDailyBusinessSummary(value,f.monthly,f.scope));
 const ten=day(value,'2026-10-10'),twenty=day(value,'2026-10-20'),zero=day(value,'2026-10-01');
 assert.equal(ten.coverage.paid,3);assert.equal(ten.sales_cents,19575);assert.equal(ten.base_repass_cents,14253);assert.equal(ten.production_cost_cents,4770);assert.equal(ten.ads_spend_cents,125);assert.equal(ten.allocated_das_cents,277);assert.equal(ten.allocated_expenses_cents,40);assert.equal(ten.estimate_cents,9041);
 assert.equal(twenty.coverage.paid,1);assert.equal(twenty.base_repass_cents,4751);assert.equal(twenty.production_cost_cents,1590);assert.equal(twenty.estimate_cents,2719);
 assert.equal(ten.payout_basis,'BASE_REPASS');assert.equal(ten.adjustment_cents,null);assert.equal(ten.after_adjustment_repass_cents,null);assert.ok(ten.pending.includes('ADJUSTMENTS_PENDING'));assert.equal(ten.state,'PROVISIONAL');
 assert.equal(zero.coverage.orders,0);assert.equal(zero.sales_cents,0);assert.equal(zero.production_cost_cents,0);assert.equal(zero.payout_basis,'AFTER_ADJUSTMENTS');assert.equal(zero.adjustment_cents,0);assert.equal(zero.estimate_cents,-441);assert.equal(zero.state,'PROVISIONAL');
 assert.equal(value.remaining_receivable_cents,null);assert.equal(value.realized_net_cents,null);assert.equal(value.ads_timezone,'UNCONFIRMED');assert.equal(value.ads_basis,'CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION');
 const monthly=buildMonthlyFinancialSummary(f.monthly),sum=value.days.reduce((total,row)=>total+row.estimate_cents,0);
 assert.equal(sum,monthly.balance_cents+value.allocation.remaining_das_cents+value.allocation.remaining_expenses_cents);assert.notEqual(ten.estimate_cents,monthly.balance_cents/value.days.length);
 assert.deepEqual({monthly:f.monthly,frames:f.frames,scope:f.scope},before);assert.deepEqual(f.calls,calls);assert.deepEqual([f.env.ADMIN_DB.calls,f.financeEnv.FINANCE_DB.calls],db);assert.doesNotMatch(JSON.stringify(value),/PRIVATE|order_sn|create_time|payload_hash|buyer|sku/);
});

test('compatible positive and negative payout adjustments are applied once while return evidence remains a warning',async t=>{
 const f=await fixture(t,{setup:f=>{f.state.paymentHook=({index})=>payment(f,index,{adjustment:index===0?-5:index===1?2:0,after:index===0?42.51:index===1?49.51:47.51,returns:index===0?['PRIVATE_RETURN']:[]});}}),value=f.calculate();assert.ok(value);
 const ten=day(value,'2026-10-10');assert.equal(ten.adjustment_cents,-300);assert.equal(ten.after_adjustment_repass_cents,13953);assert.equal(ten.payout_basis,'AFTER_ADJUSTMENTS');assert.equal(ten.payout_cents,13953);assert.equal(ten.estimate_cents,8741);assert.ok(ten.pending.includes('RETURNS_NOT_RECONCILED'));assert.equal(ten.coverage.returns,1);assert.equal(ten.state,'PROVISIONAL');
 assert.equal(value.days.reduce((sum,row)=>sum+row.estimate_cents,0),buildMonthlyFinancialSummary(f.monthly).balance_cents+value.allocation.remaining_das_cents+value.allocation.remaining_expenses_cents-300);
 assert.equal(value.remaining_receivable_cents,null);assert.equal(value.realized_net_cents,null);assert.equal(Object.hasOwn(ten,'refund_cents'),false);
});

test('legacy or undated evidence blocks only its window and never creates apparently empty sales days',async t=>{
 const f=await fixture(t),legacy=clone(f.frames);delete legacy[0].daily_breakdown;assert.ok(projectBusinessPeriodFrame(legacy[0]));const value=f.calculate(f.monthly,legacy);assert.ok(value);assert.equal(value.state,'PARTIAL');
 for(const row of value.days.slice(0,15)){assert.equal(row.reason,'DAILY_HISTORY_PENDING');assert.equal(row.coverage,null);assert.equal(row.estimate_cents,null);assert.equal(row.known_production_cost_cents,null);assert.equal(row.state,'UNAVAILABLE');}
 assert.equal(day(value,'2026-10-20').estimate_cents,2719);
 const undated=clone(f.frames),frame=undated[0],observed=frame.daily_breakdown.days[9],empty=clone(frame.daily_breakdown.undated);frame.daily_breakdown.undated={...observed,date:null};frame.daily_breakdown.days[9]={...empty,date:'2026-10-10'};assert.ok(projectBusinessPeriodFrame(frame));const missing=f.calculate(f.monthly,undated);assert.ok(missing);assert.equal(missing.state,'PARTIAL');assert.ok(missing.days.slice(0,15).every(row=>row.reason==='CREATION_DATE_INCOMPLETE'&&row.estimate_cents===null));assert.equal(day(missing,'2026-10-20').estimate_cents,2719);
});

function calendar(month,span,stamp,expense=()=>0){
 const children=[];
 for(let first=1;first<=span;first+=15){
  const last=Math.min(first+14,span),range={start_date:month+'-'+String(first).padStart(2,'0'),end_date:month+'-'+String(last).padStart(2,'0')},daily=[];
  for(let n=first;n<=last;n++){const amount=expense(n);if(amount===null)continue;daily.push({date:month+'-'+String(n).padStart(2,'0'),expense:amount/100,broad_gmv:0,broad_order:0,broad_roas:0,direct_gmv:0,direct_order:0,direct_roas:0});}
  children.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:range,balance:0,daily},range,stamp));
 }
 const value=buildAdsCalendar(children,{start_date:month+'-01',end_date:month+'-'+String(span).padStart(2,'0')},stamp);assert.ok(projectAdsCalendar(value));return value;
}
function emptyCalendar(template,month,span,{das=8605,expenses=101}={}){
 const date=month+'-'+String(span).padStart(2,'0'),stamp=Date.parse(date+'T12:00:00Z')/1000,monthly=clone(template.monthly),frames=[];
 for(let first=1;first<=span;first+=15){
  const index=frames.length,frame=clone(template.frames[0]),last=Math.min(first+14,span);frame.run_id='00000000-0000-4000-8000-'+String(index+1).padStart(12,'0');frame.start_date=month+'-'+String(first).padStart(2,'0');frame.end_date=month+'-'+String(last).padStart(2,'0');frame.cutoff_at=stamp;frame.checked_at=stamp;frame.source_checked_at={oldest_at:stamp,latest_at:stamp};frame.daily_breakdown.days=Array.from({length:last-first+1},(_,n)=>({...clone(frame.daily_breakdown.undated),date:month+'-'+String(first+n).padStart(2,'0')}));assert.ok(projectBusinessPeriodFrame(frame));frames.push(frame);
 }
 Object.assign(monthly,{month,start_date:month+'-01',end_date:date,checked_at:stamp,progress:{windows_total:frames.length,windows_complete:frames.length,pages_read:frames.length,order_capacity:frames.length*20},invoice_tax_cents:das,known_invoice_tax_cents:das,source_checked_at:{finance_oldest_at:stamp,finance_latest_at:stamp,ads_at:stamp}});
 monthly.tax={...monthly.tax,year:Number(month.slice(0,4)),monthly_das_cents:das,tax_cents:das};monthly.expenses={...monthly.expenses,external_expenses_cents:expenses,updated_at:new Date(stamp*1000).toISOString()};monthly.ads=calendar(month,span,stamp);monthly.result={...monthly.result,pending:[],net_estimate_cents:-das-expenses,net_margin_bps:null};verify(monthly);
 const scope={publication_revision:1,start_date:monthly.start_date,end_date:monthly.end_date,sources:frames.map(frame=>({run_id:frame.run_id,source_revision:frame.revision,start_date:frame.start_date,end_date:frame.end_date}))};assert.ok(projectBusinessMonthAuditScope(scope));return {monthly,frames,scope,value:buildDailyBusinessSummary(monthly,frames,scope,validators)};
}

test('monthly DAS and confirmed expenses allocate exactly across 28, 29, 30 and 31 days with stable integer-cent prefixes',async t=>{
 const f=await fixture(t,{counts:[0,0]});
 for(const [month,span] of [['2027-02',28],['2028-02',29],['2026-09',30],['2026-10',31]]){
  const {monthly,value}=emptyCalendar(f,month,span);assert.ok(value,month);assert.equal(value.allocation.days_in_month,span);assert.equal(value.days.reduce((sum,row)=>sum+row.allocated_das_cents,0),8605);assert.equal(value.days.reduce((sum,row)=>sum+row.allocated_expenses_cents,0),101);assert.equal(value.days.reduce((sum,row)=>sum+row.estimate_cents,0),monthly.result.net_estimate_cents);assert.equal(value.allocation.remaining_das_cents,0);assert.equal(value.allocation.remaining_expenses_cents,0);
  const partial=emptyCalendar(f,month,13).value;assert.ok(partial);for(let n=0;n<13;n++){assert.equal(partial.days[n].allocated_das_cents,value.days[n].allocated_das_cents);assert.equal(partial.days[n].allocated_expenses_cents,value.days[n].allocated_expenses_cents);}
  assert.equal(partial.allocation.allocated_das_cents,Number(8605n*13n/BigInt(span)));assert.equal(partial.allocation.remaining_das_cents+partial.allocation.allocated_das_cents,8605);assert.equal(partial.allocation.remaining_expenses_cents+partial.allocation.allocated_expenses_cents,101);
  assert.equal(monthly.tax.basis,'MONTHLY_COMPETENCE_NO_PRORATION','the presentation allocation does not alter the monthly tax liability');
 }
});

test('missing payment and conflicting adjustments remain scoped to their day; missing optional adjustments do not disable base estimates',async t=>{
 const missing=await fixture(t,{setup:f=>{
  f.state.detailHook=({ids})=>f.provider({order_list:ids.map(index=>({order_sn:f.serial(index),order_status:index===0?'READY_TO_SHIP':'COMPLETED',currency:'BRL',create_time:Date.UTC(2026,9,index<60?10:20,12)/1000,item_list:[{item_id:f.item(index),model_id:0,model_quantity_purchased:1}]}))});
  f.state.paymentHook=({index})=>index===0?Response.json({error:'order_not_ready'}):payment(f,index);
 }}),unknown=missing.calculate();assert.ok(unknown);
 const unpaid=day(unknown,'2026-10-10');assert.equal(unpaid.coverage.payment_missing,1);assert.equal(unpaid.sales_cents,null);assert.equal(unpaid.base_repass_cents,null);assert.equal(unpaid.estimate_cents,null);assert.equal(unpaid.known_estimate_cents,null);assert.ok(unpaid.pending.includes('PAYMENT_INCOMPLETE'));assert.ok(unpaid.pending.includes('ADJUSTMENTS_PENDING'));assert.equal(day(unknown,'2026-10-20').estimate_cents,2719);
 const conflict=await fixture(t,{setup:f=>{f.state.paymentHook=({index})=>payment(f,index,index===0?{adjustment:-5,after:44.51}:{});}}),value=conflict.calculate();assert.ok(value);const row=day(value,'2026-10-10');assert.equal(row.payout_basis,'BASE_REPASS');assert.equal(row.adjustment_cents,null);assert.equal(row.after_adjustment_repass_cents,null);assert.equal(row.estimate_cents,9041);assert.ok(row.pending.includes('ADJUSTMENT_CONFLICT'));assert.ok(row.pending.includes('ADJUSTMENTS_PENDING'));
});

test('confirmed Ads recharge is restored once and technical support is already included in payout',async t=>{
 const f=await fixture(t,{setup:f=>{f.state.paymentHook=({index})=>payment(f,index,{recharge:index===0?2:0});}}),unconfirmed=f.calculate();assert.ok(unconfirmed);assert.equal(day(unconfirmed,'2026-10-10').estimate_cents,null);assert.ok(day(unconfirmed,'2026-10-10').pending.includes('RECHARGE_TREATMENT_REQUIRED'));assert.equal(day(unconfirmed,'2026-10-20').estimate_cents,2719);
 const expenses=async(revision,treatment)=>businessMonth(f.env,{operation:'expenses',month:'2026-10',revision,external_expenses_cents:1234,recharge_treatment:treatment},f.services,{now:f.now,actor:'daily-local-test'});
 const confirmed=await expenses(1,'ADS_RECHARGE'),recharge=f.calculate(confirmed);assert.ok(recharge);assert.equal(day(recharge,'2026-10-10').recharge_addback_cents,200);assert.equal(day(recharge,'2026-10-10').estimate_cents,9241);assert.notEqual(recharge.expenses_revision,unconfirmed.expenses_revision);
 const support=f.calculate(await expenses(2,'TECH_SUPPORT'));assert.ok(support);assert.equal(day(support,'2026-10-10').recharge_addback_cents,0);assert.equal(day(support,'2026-10-10').estimate_cents,9041);
});

test('missing Ads, unconfirmed fixed costs and a pending tax declaration are never replaced with zero',async t=>{
 const f=await fixture(t),withPending=(changes,pending)=>verify({...clone(f.monthly),...changes,result:{...f.monthly.result,net_estimate_cents:null,net_margin_bps:null,pending}});
 const partialAds=calendar('2026-10',24,f.monthly.checked_at,n=>n===10?null:125),ads=f.calculate(withPending({ads:partialAds},['ADS_UNAVAILABLE']));assert.ok(ads);assert.equal(day(ads,'2026-10-10').ads_spend_cents,null);assert.equal(day(ads,'2026-10-10').estimate_cents,null);assert.equal(day(ads,'2026-10-20').estimate_cents,2719);
 const explicitZero=calendar('2026-10',24,f.monthly.checked_at,n=>n===10?0:125),m=clone(f.monthly);m.ads=explicitZero;m.result.net_estimate_cents+=125;m.result.net_margin_bps=Number(BigInt(m.result.net_estimate_cents)*10000n/BigInt(m.sales_cents));verify(m);const zero=f.calculate(m);assert.ok(zero);assert.equal(day(zero,'2026-10-10').ads_spend_cents,0);assert.equal(day(zero,'2026-10-10').estimate_cents,9166);
 for(const frame of [withPending({expenses:{revision:0,external_expenses_cents:null,recharge_treatment:'UNCONFIRMED',updated_at:null}},['EXTERNAL_EXPENSES_REQUIRED']),withPending({},['EXTERNAL_EXPENSES_REQUIRED'])]){
  const value=f.calculate(frame);assert.ok(value);assert.equal(value.allocation.monthly_expenses_cents,null);assert.ok(value.days.every(row=>row.estimate_cents===null&&row.known_estimate_cents===null&&row.allocated_expenses_cents===null));assert.notEqual(day(value,'2026-10-10').operating_balance_cents,null);
 }
 const tax={...f.monthly.tax,policy_revision:0,monthly_das_cents:null,tax_cents:null,status:'PENDING',source:'DAS_REQUIRED'},unknownTax=f.calculate(withPending({tax,invoice_tax_cents:null,known_invoice_tax_cents:null},['INVOICE_TAX_UNAVAILABLE','TAX_POLICY_REQUIRED']));assert.ok(unknownTax);assert.equal(unknownTax.allocation.monthly_das_cents,null);assert.equal(day(unknownTax,'2026-10-10').estimate_cents,null);assert.ok(day(unknownTax,'2026-10-10').pending.includes('TAX_POLICY_REQUIRED'));
});

test('Brasília creation days and the original intraday cutoff survive a later display read without refreshing source times',async t=>{
 const f=await fixture(t,{counts:[0,3],setup:f=>{f.state.detailHook=({ids})=>f.provider({order_list:ids.map((index,n)=>({order_sn:f.serial(index),order_status:'COMPLETED',currency:'BRL',create_time:Date.parse(n===0?'2026-10-24T02:59:59Z':'2026-10-24T03:00:00Z')/1000,item_list:[{item_id:f.item(index),model_id:0,model_quantity_purchased:1}]}))});}}),before=f.calculate();assert.ok(before);assert.equal(day(before,'2026-10-23').coverage.paid,1);assert.equal(day(before,'2026-10-24').coverage.paid,2);assert.equal(day(before,'2026-10-23').day_partial,false);assert.equal(day(before,'2026-10-24').day_partial,true);
 f.clock.time+=86400000;const observed=await readBusinessMonthDisplay(f.env,{month:'2026-10'},{now:f.now}),calls=clone(f.calls),after=f.calculate(observed.display,observed.source_frames,observed.audit_scope);assert.ok(after);const row=day(after,'2026-10-24');assert.equal(row.day_partial,true,'an old intraday publication does not become a complete day at midnight');assert.equal(row.source_cutoff_at,day(before,'2026-10-24').source_cutoff_at);assert.deepEqual(row.source_checked_at,day(before,'2026-10-24').source_checked_at);assert.equal(row.estimate_cents,day(before,'2026-10-24').estimate_cents);assert.ok(row.pending.includes('FINANCIAL_SOURCE_STALE'));assert.ok(row.pending.includes('ADS_SOURCE_STALE'));assert.deepEqual(f.calls,calls);
});

test('unknown production is an explicit known-cost subtotal and reprices on the same immutable publication',async t=>{
 const f=await fixture(t),initial=f.calculate(),rows=JSON.parse(f.immutable.bindings[0].payload).filter(row=>row.item_id!=='1000');
 f.env.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET revision=revision+1,payload=? WHERE id=1').run(JSON.stringify(rows));const monthly=await f.invoke('read'),calls=clone(f.calls),value=f.calculate(monthly);assert.ok(value);
 const ten=day(value,'2026-10-10');assert.equal(ten.state,'PARTIAL_COSTS');assert.equal(ten.estimate_cents,null);assert.equal(ten.known_estimate_cents,10631);assert.equal(ten.known_production_cost_cents,3180);assert.equal(ten.production_cost_cents,null);assert.deepEqual(ten.production_coverage,{total_units:3,known_units:2,pending_units:1});assert.ok(ten.pending.includes('PRODUCTION_COST_INCOMPLETE'));assert.equal(day(value,'2026-10-20').estimate_cents,day(initial,'2026-10-20').estimate_cents);assert.equal(value.publication_revision,initial.publication_revision);assert.notEqual(value.bindings_revision,initial.bindings_revision);assert.deepEqual(f.calls,calls);
 assert.equal(projectDailyBusinessSummary(initial,monthly,f.scope),null,'the old cost revision cannot accompany the new monthly view');
 const noProducts=verify({...clone(f.monthly),product_summary:null}),unknown=f.calculate(noProducts);assert.ok(unknown);assert.equal(day(unknown,'2026-10-10').estimate_cents,null);assert.equal(day(unknown,'2026-10-10').known_production_cost_cents,0);assert.equal(day(unknown,'2026-10-10').production_coverage.pending_units,3);assert.equal(day(unknown,'2026-10-01').production_cost_cents,0);
});

test('a mixed order uses the existing kit and approved historical child-size-16 references once and follows later rule prices',async t=>{
 const f=await fixture(t,{counts:[1,0],setup:async f=>{
  const bindings=JSON.parse(f.immutable.bindings[0].payload).filter(row=>row.item_id!=='1001').map(row=>row.item_id==='1000'?{item_id:'1000',model_id:'0',selling_unit:'ONE_MALE_ONE_FEMALE_KIT',male_size:'P',female_size:'G1',operator_confirmed:true}:row);f.env.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET payload=?,revision=revision+1').run(JSON.stringify(bindings));
  const stamp=f.now()/1000,proof={item_names:['Camiseta Infantil Anos 80'],model_names:['16'],missing_item_name:false,missing_model_name:false,conflict:false,overflow:false};
  await f.env.ADMIN_DB.batch([f.env.ADMIN_DB.prepare('INSERT INTO historical_cost_evidence_names VALUES(?,?,?,1,?,?)').bind('1001','0',JSON.stringify(proof),stamp,stamp),f.env.ADMIN_DB.prepare('UPDATE historical_cost_evidence_state SET revision=revision+1 WHERE id=1'),f.env.ADMIN_DB.prepare('UPDATE catalog_classification_state SET revision=revision+1 WHERE id=1')]);
  const items=[1000,1001].map(item_id=>({item_id,model_id:0,model_quantity_purchased:1}));f.state.detailHook=({ids})=>f.provider({order_list:ids.map(index=>({order_sn:f.serial(index),order_status:'COMPLETED',currency:'BRL',create_time:Date.UTC(2026,9,10,12)/1000,item_list:items}))});
  f.state.paymentHook=({index})=>f.provider({order_sn:f.serial(index),return_order_sn_list:[],order_income:{order_sn:f.serial(index),original_cost_of_goods_sold:130.5,escrow_amount:95.02,ads_escrow_top_up_fee_or_technical_support_fee:0,items:items.map((row,n)=>({item_id:row.item_id,model_id:0,line_item_id:n+1,quantity_purchased:1}))}});
 }}),value=f.calculate();assert.ok(value);assert.equal(f.monthly.product_summary.mixed_orders,1);assert.deepEqual(f.monthly.product_summary.products.map(row=>row.variants[0].unit_cost_cents),[3480,1250]);
 const ten=day(value,'2026-10-10');assert.equal(ten.coverage.paid,1);assert.equal(ten.base_repass_cents,9502);assert.equal(ten.production_cost_cents,4730);assert.deepEqual(ten.production_coverage,{total_units:2,known_units:2,pending_units:0});assert.equal(ten.estimate_cents,4330);
 const rules=await readCostRules(f.env),values=clone(rules.values);values.rules.find(row=>row.id==='camiseta-infantil').unit_cost_cents=1300;await saveCostRules(f.env,{revision:rules.revision,values},'daily-local-test');const monthly=await f.invoke('read'),calls=clone(f.calls),repriced=f.calculate(monthly);assert.ok(repriced);assert.equal(day(repriced,'2026-10-10').production_cost_cents,4780);assert.equal(day(repriced,'2026-10-10').estimate_cents,4280);assert.equal(repriced.publication_revision,value.publication_revision);assert.equal(repriced.cost_rules_revision,value.cost_rules_revision+1);assert.deepEqual(f.calls,calls);
});

test('source, cost and publication identities are checked together even when numerical totals coincide',async t=>{
 const f=await fixture(t),value=f.calculate();assert.ok(value);
 for(const mutate of [s=>s.sources[0].source_revision++,s=>{s.sources[0].run_id='11111111-1111-4111-8111-111111111111';},s=>s.sources.reverse()]){const scope=clone(f.scope);mutate(scope);assert.equal(f.calculate(f.monthly,f.frames,scope),null);assert.equal(projectDailyBusinessSummary(value,f.monthly,scope),null);}
 const otherPublication=clone(f.scope);otherPublication.publication_revision++;assert.equal(projectDailyBusinessSummary(value,f.monthly,otherPublication),null);
 for(const key of ['bindings_revision','costs_revision','cost_rules_revision','classification_revision']){const changed=clone(f.monthly);changed[key]++;verify(changed);assert.equal(projectDailyBusinessSummary(value,changed,f.scope),null);}
 const expenses=clone(f.monthly);expenses.expenses.revision++;verify(expenses);assert.equal(projectDailyBusinessSummary(value,expenses,f.scope),null);
 const tax=clone(f.monthly);tax.tax.policy_revision++;verify(tax);assert.equal(projectDailyBusinessSummary(value,tax,f.scope),null);
 const wrongSource=clone(f.monthly);wrongSource.source_checked_at.finance_oldest_at--;verify(wrongSource);assert.equal(f.calculate(wrongSource),null);assert.equal(projectDailyBusinessSummary(value,wrongSource,f.scope),null);
 const changed=clone(f.frames);changed[0].revision++;assert.ok(projectBusinessPeriodFrame(changed[0]));assert.equal(f.calculate(f.monthly,changed),null);
 assert.equal(buildDailyBusinessSummary(f.monthly,f.frames,f.scope,{}),null);assert.equal(f.calculate(f.monthly,[]),null);assert.equal(f.calculate(f.monthly,[...f.frames,f.frames[0]]),null);
});

test('the daily projector rejects forged arithmetic, missing dates, extra fields and accessors, and returns detached data',async t=>{
 const f=await fixture(t),value=f.calculate();assert.ok(value);
 const mutations=[v=>v.days.pop(),v=>v.days.reverse(),v=>{v.days[0].date='2026-10-02';},v=>{v.days[0].estimate_cents=0;},v=>{v.days[0].known_estimate_cents=0;},v=>v.days[9].production_cost_cents++,v=>v.days[9].production_coverage.pending_units++,v=>{v.days[9].adjustment_cents=0;},v=>{v.days[9].after_adjustment_repass_cents=v.days[9].base_repass_cents;},v=>{v.days[9].payout_basis='AFTER_ADJUSTMENTS';},v=>{v.days[9].pending=[];},v=>{v.days[9].coverage.returns=1;},v=>{v.days[9].source_checked_at.finance_oldest_at=1;},v=>{v.days[23].day_partial=false;},v=>v.allocation.remaining_das_cents++,v=>{v.allocation.days_in_month=24;},v=>{v.days[0].allocated_das_cents=-0;},v=>{v.days[0].allocated_expenses_cents=NaN;},v=>{v.days[0].sales_cents=Number.MAX_SAFE_INTEGER+1;},v=>{v.ads_timezone='America/Sao_Paulo';},v=>{v.days[0].order_sn='PRIVATE';},v=>{v.realized_net_cents=100;},v=>{v.remaining_receivable_cents=100;},v=>v.sources[0].source_revision++,v=>v.cost_rules_revision++,v=>{v.days[0].state='READY';}];
 for(const mutate of mutations){const bad=clone(value);mutate(bad);assert.equal(projectDailyBusinessSummary(bad,f.monthly,f.scope),null,mutate.toString());}
 let reads=0;for(const location of [v=>v,v=>v.days[9],v=>v.days[9].production_coverage,v=>v.days[9].source_checked_at,v=>v.allocation]){
  const bad=clone(value),object=location(bad),key=Object.keys(object)[0];Object.defineProperty(object,key,{enumerable:true,get(){reads++;throw Error('private getter');}});assert.equal(projectDailyBusinessSummary(bad,f.monthly,f.scope),null);
 }assert.equal(reads,0);
 const poison=clone(f.frames);Object.defineProperty(poison[0].daily_breakdown.days[9],'items',{enumerable:true,get(){reads++;throw Error('private getter');}});assert.equal(f.calculate(f.monthly,poison),null);assert.equal(reads,0);
 const projected=projectDailyBusinessSummary(value,f.monthly,f.scope);projected.days[9].pending.push('ARITHMETIC_UNSAFE');projected.days[9].production_coverage.pending_units++;projected.sources[0].source_revision++;projected.allocation.monthly_das_cents++;assert.deepEqual(value,f.calculate());assert.ok(JSON.stringify(value).length<131072);
});

test('large confirmed amounts use integer arithmetic without unsafe multiplication and unsafe daily components fail closed',async t=>{
 const empty=await fixture(t,{counts:[0,0]}),amount=Number.MAX_SAFE_INTEGER-10000,{value}=emptyCalendar(empty,'2026-10',31,{expenses:amount});assert.ok(value);assert.equal(value.days.reduce((sum,row)=>sum+BigInt(row.allocated_expenses_cents),0n),BigInt(amount));assert.equal(value.days[15].allocated_expenses_cents,Number(BigInt(amount)*16n/31n-BigInt(amount)*15n/31n));
 const f=await fixture(t,{counts:[3,0]}),m=clone(f.monthly),frames=clone(f.frames),raw='90071992547409.91';for(const frame of frames)delete frame.product_breakdown;
 const frame=frames[0],group=frame.daily_breakdown.days[9];for(const coverage of [frame.coverage,group.coverage,m.coverage])for(const key of ['orders','paid','completed','payment_covered'])coverage[key]=100;
 frame.pages_read=5;frame.invoice_tax.covered_orders=100;frame.items=[{item_id:'1000',model_id:'0',quantity:100}];group.items=clone(frame.items);group.adjustments.missing_orders=100;m.progress.pages_read=6;m.progress.order_capacity=120;
 frame.known_expected_repass_raw=frame.expected_repass_raw=group.known_expected_repass_raw=group.expected_repass_raw=raw;frame.known_ads_adjustment_raw=frame.ads_adjustment_raw=group.known_ads_adjustment_raw=group.ads_adjustment_raw='2';assert.ok(projectBusinessPeriodFrame(frame));
 m.product_summary=null;m.expected_repass_cents=m.known_expected_repass_cents=Number.MAX_SAFE_INTEGER;m.ads_adjustment_cents=200;m.expenses.recharge_treatment='ADS_RECHARGE';m.result.net_estimate_cents=Number(BigInt(Number.MAX_SAFE_INTEGER)+200n-BigInt(m.production_cost_cents)-BigInt(m.invoice_tax_cents)-BigInt(m.ads.expense_cents)-BigInt(m.expenses.external_expenses_cents));m.result.net_margin_bps=Number(BigInt(m.result.net_estimate_cents)*10000n/BigInt(m.sales_cents));
 // The monthly total remains representable after all costs, but the daily
 // operating component itself would exceed MAX_SAFE_INTEGER.
 verify(m);assert.equal(f.calculate(m,frames),null);
});

test('the exact daily calculator and projector run in another realm with explicit validators and no browser imports',async t=>{
 const f=await fixture(t),value=f.calculate(),context=vm.createContext({serialized:JSON.stringify({monthly:f.monthly,frames:f.frames,scope:f.scope,value})});
 const functions=[projectAdsCalendar,projectBusinessMonthProducts,projectBusinessMonth,projectBusinessMonthAuditScope,projectBusinessPeriodFrame,buildDailyBusinessSummary,projectDailyBusinessSummary];
 vm.runInContext(functions.map(fn=>fn.toString()).join('\n')+'\nconst input=JSON.parse(serialized);globalThis.calculated=buildDailyBusinessSummary(input.monthly,input.frames,input.scope,{projectMonthly:projectBusinessMonth,projectFrame:projectBusinessPeriodFrame,projectScope:projectBusinessMonthAuditScope});globalThis.projected=projectDailyBusinessSummary(input.value,input.monthly,input.scope);',context);
 assert.deepEqual(JSON.parse(JSON.stringify(context.calculated)),value);assert.deepEqual(JSON.parse(JSON.stringify(context.projected)),value);
 const standalone=vm.createContext({serialized:JSON.stringify({monthly:f.monthly,scope:f.scope,value})});vm.runInContext(projectDailyBusinessSummary.toString()+'\nconst input=JSON.parse(serialized);globalThis.output=projectDailyBusinessSummary(input.value,input.monthly,input.scope);',standalone);assert.deepEqual(JSON.parse(JSON.stringify(standalone.output)),value);
});
