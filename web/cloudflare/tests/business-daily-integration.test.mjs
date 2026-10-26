import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {collectionFixture} from './business-collection-fixture.mjs';
import {SCHEMA} from '../src/admin.mjs';
import {projectBusinessMonth,readBusinessMonthDisplay} from '../src/business-month.mjs';
import {readBusinessSyncState} from '../src/business-sync.mjs';
import {buildBusinessMonthView,projectBusinessMonthView,projectBusinessMonthAuditScope} from '../src/business-month-view-state.mjs';
import {projectDailyBusinessSummary} from '../src/business-daily-summary.mjs';
import {buildMonthlyFinancialSummary} from '../src/business-month-summary.mjs';

const month='2026-10',contract='business-month-view-v3';
const portion=(total,day)=>Number(BigInt(total)*BigInt(day)/31n-BigInt(total)*BigInt(day-1)/31n);
const providerCounts=f=>({finance:f.calls.finance.length,ads:f.calls.ads.length,list:f.calls.list.length,detail:f.calls.detail.length,payment:f.calls.payment.length});
async function shop(t,{daily=true}={}){
 const f=await collectionFixture({daily,allPaid:true,windowCounts:[2,1],paymentDelayMs:0});
 t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 await f.env.ADMIN_DB.batch(SCHEMA.map(sql=>f.env.ADMIN_DB.prepare(sql)));
 const row=f.env.ADMIN_DB.db.prepare('SELECT payload FROM production_costs_state WHERE id=1').get(),costs=JSON.parse(row.payload);
 Object.assign(costs,{mode:'all_inclusive',inclusive_regular_cents:1590,inclusive_plus_cents:2140,components:[]});
 f.env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET payload=? WHERE id=1').run(JSON.stringify(costs));
 f.state.paymentHook=({index})=>f.provider({order_sn:f.serial(index),return_order_sn_list:index===0?['PRIVATE_DAILY_INTEGRATION_RETURN']:[],order_income:{order_sn:f.serial(index),original_cost_of_goods_sold:65.25,escrow_amount:47.51,total_adjustment_amount:index===0?-5:0,escrow_amount_after_adjustment:index===0?42.51:47.51,ads_escrow_top_up_fee_or_technical_support_fee:0,items:[{item_id:f.item(index),model_id:0,line_item_id:index+1,quantity_purchased:1}]}});
 return f;
}
async function finish(f){
 let frame=await f.invoke('start');
 for(let attempt=0;frame.status==='RUNNING'&&attempt<20;attempt++){
  f.clock.time+=Math.max(1,frame.collection?.retry_after_seconds??0)*1000;
  frame=await f.invoke('step');
 }
 assert.equal(frame.status,'COMPLETE');await f.invoke('ads');
}
async function view(f,selectedContract=contract){
 const observed=await readBusinessMonthDisplay(f.env,{month},{now:f.now}),sync=await readBusinessSyncState(f.env);
 const result=buildBusinessMonthView(observed,sync,{now:f.now,contract:selectedContract});
 assert.ok(projectBusinessMonthView(result,projectBusinessMonth,projectBusinessMonthAuditScope,projectDailyBusinessSummary));
 return {result,observed,sync};
}

test('real Finance date evidence reaches the same App publication, with day-specific costs and a payout adjustment deducted once',async t=>{
 const f=await shop(t);await finish(f);const before=providerCounts(f),{result,observed}=await view(f),summary=result.daily_summary;
 assert.ok(summary,'the real collection must yield a usable daily summary');
 assert.equal(result.schema,'business_month_view_v3');assert.equal(result.display_source,'PUBLISHED');
 assert.equal(summary.publication_revision,result.audit_scope.publication_revision);
 assert.deepEqual(summary.sources,result.audit_scope.sources);assert.equal(summary.days.length,24);
 assert.equal(result.display.coverage.paid,3);assert.equal(result.display.production_cost_cents,4770);
 assert.ok(observed.source_frames.every(frame=>frame.daily_breakdown));
 const first=summary.days.find(row=>row.date==='2026-10-10'),second=summary.days.find(row=>row.date==='2026-10-20'),empty=summary.days.find(row=>row.date==='2026-10-11');
 assert.equal(first.coverage.paid,2);assert.equal(first.base_repass_cents,9502);assert.equal(first.adjustment_cents,-500);assert.equal(first.after_adjustment_repass_cents,9002);assert.equal(first.payout_basis,'AFTER_ADJUSTMENTS');
 assert.equal(first.production_cost_cents,3180);assert.equal(first.ads_spend_cents,125);assert.equal(first.estimate_cents,9002-3180-125-portion(8605,10)-portion(1234,10));
 assert.equal(second.coverage.paid,1);assert.equal(second.base_repass_cents,4751);assert.equal(second.production_cost_cents,1590);assert.equal(second.estimate_cents,4751-1590-125-portion(8605,20)-portion(1234,20));
 assert.equal(empty.coverage.orders,0);assert.equal(empty.production_cost_cents,0);assert.equal(empty.estimate_cents,-125-portion(8605,11)-portion(1234,11),'a confirmed empty day still bears actual Ads and its declared fixed-cost share');
 assert.equal(first.state,'PROVISIONAL');assert.ok(first.pending.includes('RETURNS_NOT_RECONCILED'));
 const monthly=buildMonthlyFinancialSummary(result.display),allocated=summary.days.reduce((sum,row)=>sum+row.allocated_das_cents+row.allocated_expenses_cents,0);
 assert.equal(summary.days.reduce((sum,row)=>sum+row.estimate_cents,0),monthly.balance_cents-500+8605+1234-allocated,'full-month fixed costs explain the difference from the partial-month daily sum');
 assert.deepEqual(providerCounts(f),before);assert.doesNotMatch(JSON.stringify(result),/PRIVATE|order_sn|create_time|payload_hash|source_hash|source_frames|daily_breakdown/);
});

test('daily views add no SQL calls or provider reads, reprice the saved cohort, and reject an old cost or publication identity',async t=>{
 const f=await shop(t);await finish(f);await view(f);const before=providerCounts(f);
 f.env.ADMIN_DB.calls=0;const legacy=await view(f,'business-month-view-v2'),legacyCalls=f.env.ADMIN_DB.calls;
 f.env.ADMIN_DB.calls=0;const current=await view(f),dailyCalls=f.env.ADMIN_DB.calls;
 assert.equal(dailyCalls,legacyCalls);assert.deepEqual(current.result.display,legacy.result.display);assert.equal(Object.hasOwn(legacy.result,'daily_summary'),false);
 const costs=JSON.parse(f.env.ADMIN_DB.db.prepare('SELECT payload FROM production_costs_state WHERE id=1').get().payload);costs.inclusive_regular_cents+=100;
 f.env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET revision=revision+1,payload=? WHERE id=1').run(JSON.stringify(costs));
 const repriced=await view(f),old=current.result.daily_summary,next=repriced.result.daily_summary;
 assert.ok(next);assert.equal(next.days[9].estimate_cents,old.days[9].estimate_cents-200);assert.equal(next.days[19].estimate_cents,old.days[19].estimate_cents-100);
 assert.deepEqual(next.source_checked_at,old.source_checked_at);assert.deepEqual(next.sources,old.sources);assert.deepEqual(providerCounts(f),before);
 assert.equal(projectDailyBusinessSummary(old,repriced.result.display,repriced.result.audit_scope),null);
 const foreign=structuredClone(repriced.result.audit_scope);foreign.publication_revision++;assert.equal(projectDailyBusinessSummary(next,repriced.result.display,foreign),null);
 const forged=structuredClone(repriced.result);forged.daily_summary.publication_revision++;assert.equal(projectBusinessMonthView(forged,projectBusinessMonth,projectBusinessMonthAuditScope,projectDailyBusinessSummary),null);
 const detached=vm.runInNewContext('('+projectBusinessMonthView.toString()+')(JSON.parse(serialized),value=>value,('+projectBusinessMonthAuditScope.toString()+'),('+projectDailyBusinessSummary.toString()+'))',{serialized:JSON.stringify(repriced.result)});
 assert.deepEqual(JSON.parse(JSON.stringify(detached)),repriced.result,'the shipped view projector must not capture a server closure');
});

test('legacy and incomplete daily evidence preserve the monthly panel without launching a backfill',async t=>{
 const f=await shop(t,{daily:false});await finish(f);const before=providerCounts(f),{result,observed,sync}=await view(f);
 assert.ok(result.daily_summary);assert.ok(result.daily_summary.days.every(row=>row.state==='UNAVAILABLE'&&row.reason==='DAILY_HISTORY_PENDING'&&row.estimate_cents===null));
 const legacy=buildBusinessMonthView(observed,sync,{now:f.now,contract:'business-month-view-v2'});assert.deepEqual(result.display,legacy.display);
 const broken=buildBusinessMonthView({...observed,source_frames:null},sync,{now:f.now,contract});assert.equal(broken.daily_summary,null);assert.deepEqual(broken.display,result.display,'the missing daily calculation must not block the valid monthly result');
 assert.deepEqual(providerCounts(f),before);
});
