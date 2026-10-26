import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {collectionFixture} from './business-collection-fixture.mjs';
import {readCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {projectAdsCalendar} from '../src/ads-calendar.mjs';
import {projectBusinessMonthProducts} from '../src/business-month-products.mjs';
import {projectBusinessMonthAuditScope} from '../src/business-month-view-state.mjs';
import {projectBusinessReconciliation} from '../src/business-reconciliation.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';
import {buildMonthlyFinancialSummary} from '../src/business-month-summary.mjs';
import {buildAdjustedBusinessBalance} from '../src/business-adjusted-balance.mjs';

const validators={projectMonthly:projectBusinessMonth,projectReconciliation:projectBusinessReconciliation,projectFrame:projectReconciliationFrame,projectScope:projectBusinessMonthAuditScope,buildSummary:buildMonthlyFinancialSummary};
async function fixture(t){
 const f=await collectionFixture({returns:true,allPaid:true,windowCounts:[3,1],paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 let monthly=await f.invoke('start');while(monthly.status==='RUNNING')monthly=await f.invoke('step');monthly=await f.invoke('ads');assert.equal(monthly.status,'COMPLETE');
 const published=await readCompletedBusinessMonth(f.env,'2026-10',{now:f.now}),stamp=f.now()/1000;
 const sources=published.payload.slots.map(slot=>({run_id:slot.frame.run_id,source_revision:slot.frame.revision,start_date:slot.start_date,end_date:slot.end_date}));
 const reports=published.payload.slots.map((slot,index)=>{
  const c=slot.frame.coverage,base=Math.round(Number(slot.frame.known_expected_repass_raw)*100),delta=index===0?-1000:100;
  const cases=index===0?['ACCEPTED','REFUND_PAID','CANCELLED'].map((status,n)=>({case_hash:String(n+1).repeat(64),order_hash:'a'.repeat(64),status,requested_refund_cents:n===0?1000:500,checked_at:stamp,diagnostic:null})):[];
  const value={schema:'finance_reconciliation_v1',...sources[index],checked_at:stamp,status:'CHECKED',source_checked_at:{finance_oldest_at:slot.frame.source_checked_at.oldest_at,finance_latest_at:slot.frame.source_checked_at.latest_at,returns_oldest_at:cases.length?stamp:null,returns_latest_at:cases.length?stamp:null},coverage:{orders:c.orders,evidence_orders:c.orders,missing_evidence_orders:0,paid_orders:c.paid,review_orders:0,return_orders:c.returns,return_unknown_orders:c.returns_unknown},adjustments:{reported_orders:c.paid,missing_orders:0,conflicting_orders:0,known_adjustment_cents:delta,base_repass_cents:base,after_adjustment_repass_cents:base+delta},returns:{reference_count:cases.length,checked_count:cases.length,pending_count:0,known_requested_refund_cents:index===0?2000:0,requested_amount_complete:true,permission:cases.length?'AVAILABLE':'UNKNOWN'},cases,truncation:{truncated:false,cases_total:cases.length,cases_included:cases.length},pending:[...(cases.length?['RETURN_VALUES_UNVERIFIED']:[]),'SETTLEMENT_NOT_RECONCILED'],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};
  assert.ok(projectReconciliationFrame(value));return value;
 });
 const report={schema:'business_reconciliation_v1',month:'2026-10',start_date:monthly.start_date,end_date:monthly.end_date,checked_at:stamp,status:'CHECKED',source_revision:published.publication.source_revision,sources,reports,attempts:[],pending:[]};
 const scope={publication_revision:report.source_revision,start_date:report.start_date,end_date:report.end_date,sources};
 assert.ok(projectBusinessReconciliation(report,projectReconciliationFrame));assert.ok(projectBusinessMonthAuditScope(scope));assert.ok(projectBusinessMonth(monthly));
 return {...f,monthly,report,scope,calculate:(frame=monthly,evidence=report,selected=scope)=>buildAdjustedBusinessBalance(frame,evidence,selected,validators)};
}

test('the same paid month applies a signed adjustment once, never deducts refund values again and never claims an outstanding receivable',async t=>{
 const f=await fixture(t),before=structuredClone(f.monthly),summary=buildMonthlyFinancialSummary(f.monthly),value=f.calculate();
 assert.equal(value.state,'PROVISIONAL');assert.equal(value.reason,null);assert.equal(value.base_repass_cents,f.monthly.expected_repass_cents);assert.equal(value.reported_adjustment_cents,-900);assert.equal(value.after_adjustment_repass_cents,f.monthly.expected_repass_cents-900);assert.equal(value.balance_cents,summary.balance_cents-900);assert.equal(value.balance_cents,value.after_adjustment_repass_cents-value.costs_after_payout_cents+value.recharge_addback_cents);assert.equal(value.remaining_receivable_cents,null);assert.equal(value.realized_net_cents,null);assert.deepEqual(value.pending,f.monthly.result.pending);assert.deepEqual(f.monthly,before);
 const changed=structuredClone(f.report);changed.reports[0].cases[0].requested_refund_cents=9000;changed.reports[0].returns.known_requested_refund_cents=10000;assert.ok(projectBusinessReconciliation(changed,projectReconciliationFrame));assert.equal(f.calculate(f.monthly,changed).balance_cents,value.balance_cents,'a reported refund is not a second debit against the already adjusted payout');
 const positive=structuredClone(f.report);positive.reports[0].adjustments.known_adjustment_cents=500;positive.reports[0].adjustments.after_adjustment_repass_cents=positive.reports[0].adjustments.base_repass_cents+500;assert.equal(f.calculate(f.monthly,positive).balance_cents,summary.balance_cents+600);
});

test('a report for another publication, scope, coverage or original source time cannot alter the monthly balance',async t=>{
 const f=await fixture(t);
 const wrongScope=structuredClone(f.scope);wrongScope.publication_revision++;assert.equal(f.calculate(f.monthly,f.report,wrongScope).state,'UNAVAILABLE');
 const wrongRevision=structuredClone(f.report);wrongRevision.source_revision++;assert.equal(f.calculate(f.monthly,wrongRevision).state,'UNAVAILABLE');
 const wrongTime=structuredClone(f.report);for(const row of wrongTime.reports){row.source_checked_at.finance_oldest_at--;row.source_checked_at.finance_latest_at--;}assert.ok(projectBusinessReconciliation(wrongTime,projectReconciliationFrame));assert.equal(f.calculate(f.monthly,wrongTime).state,'UNAVAILABLE');
 const wrongMoney=structuredClone(f.report);wrongMoney.reports[0].adjustments.base_repass_cents++;wrongMoney.reports[0].adjustments.after_adjustment_repass_cents++;assert.ok(projectBusinessReconciliation(wrongMoney,projectReconciliationFrame));assert.equal(f.calculate(f.monthly,wrongMoney).state,'UNAVAILABLE');
 const partial=structuredClone(f.report);partial.reports.pop();partial.status='PARTIAL';partial.pending=['RECONCILIATION_PENDING'];assert.equal(f.calculate(f.monthly,partial).reason,'RECONCILIATION_INCOMPLETE');
 const absent=structuredClone(f.report),row=absent.reports[0];row.adjustments.reported_orders--;row.adjustments.missing_orders++;row.adjustments.after_adjustment_repass_cents=null;row.status='PARTIAL';row.pending.push('ADJUSTMENT_FIELDS_UNAVAILABLE');absent.status='PARTIAL';absent.pending=['RECONCILIATION_PENDING'];assert.ok(projectBusinessReconciliation(absent,projectReconciliationFrame));assert.equal(f.calculate(f.monthly,absent).reason,'ADJUSTMENT_VALUES_UNAVAILABLE');
 let invoked=false;const poison={...f.monthly};Object.defineProperty(poison,'expected_repass_cents',{enumerable:true,get(){invoked=true;throw Error('private accessor');}});assert.equal(f.calculate(poison).state,'UNAVAILABLE');assert.equal(invoked,false);
});

test('stale financial data and incomplete production remain visible in an adjusted subtotal without new collection',async t=>{
 const f=await fixture(t),initial=f.calculate();
 // The operator's diagnostic has an old financial observation but fresh Ads.
 // Preparing that source state is separate from the pure presentation below.
 f.clock.time+=901000;const stale=await f.invoke('ads'),calls=structuredClone({finance:f.calls.finance,ads:f.calls.ads}),value=f.calculate(stale);assert.equal(value.state,'PROVISIONAL',JSON.stringify(value));assert.equal(value.balance_cents,initial.balance_cents);assert.ok(value.pending.includes('FINANCIAL_SOURCE_STALE'));assert.equal(value.source_checked_at.finance_oldest_at,initial.source_checked_at.finance_oldest_at);assert.equal(value.source_checked_at.finance_latest_at,initial.source_checked_at.finance_latest_at);assert.equal(value.source_checked_at.ads_at,stale.source_checked_at.ads_at);
 f.env.ADMIN_DB.db.prepare("UPDATE variant_bindings_state SET payload='[]',revision=revision+1").run();const unmapped=await f.invoke('read'),partial=f.calculate(unmapped);assert.equal(partial.state,'PARTIAL_COSTS');assert.equal(partial.production_complete,false);assert.ok(partial.pending.includes('PRODUCTION_COST_INCOMPLETE'));assert.equal(partial.balance_cents,buildMonthlyFinancialSummary(unmapped).balance_cents-900);assert.equal(partial.remaining_receivable_cents,null);assert.equal(partial.realized_net_cents,null);assert.deepEqual({finance:f.calls.finance,ads:f.calls.ads},calls);
});

test('the exact balance function and validators remain usable in the browser without server closures',async t=>{
 const f=await fixture(t),context=vm.createContext({serialized:JSON.stringify({monthly:f.monthly,report:f.report,scope:f.scope})});
 const functions=[projectAdsCalendar,projectBusinessMonthProducts,projectBusinessMonth,projectBusinessMonthAuditScope,projectReconciliationFrame,projectBusinessReconciliation,buildMonthlyFinancialSummary,buildAdjustedBusinessBalance];
 vm.runInContext(functions.map(fn=>fn.toString()).join('\n')+'\nconst input=JSON.parse(serialized);globalThis.output=buildAdjustedBusinessBalance(input.monthly,input.report,input.scope,{projectMonthly:projectBusinessMonth,projectReconciliation:projectBusinessReconciliation,projectFrame:projectReconciliationFrame,projectScope:projectBusinessMonthAuditScope,buildSummary:buildMonthlyFinancialSummary});',context);
 assert.deepEqual(JSON.parse(JSON.stringify(context.output)),f.calculate());
});
