import test from 'node:test';
import assert from 'node:assert/strict';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {projectBusinessMonthView,projectBusinessMonthAuditScope,buildBusinessMonthView} from '../src/business-month-view-state.mjs';
import {projectDailyBusinessSummary} from '../src/business-daily-summary.mjs';
import {projectExpenseSchedule} from '../src/expense-schedule.mjs';
import {projectBusinessMonthVariantContributions} from '../src/business-variant-attribution.mjs';
import {variantOrderFixture,variantOrderView} from './mls-variant-order-fixture.mjs';

const project=value=>projectBusinessMonthView(value,projectBusinessMonth,projectBusinessMonthAuditScope,projectDailyBusinessSummary,projectExpenseSchedule,projectBusinessMonthVariantContributions);

test('opting into order attribution preserves the entire existing monthly, daily and expense view',async()=>{
 const fixture=await variantOrderFixture(),current=variantOrderView(fixture),previous=variantOrderView(fixture,{contract:'business-month-view-v4'});
 const {variant_contributions,schema,...unchanged}=current;
 assert.equal(schema,'business_month_view_v5');assert.equal(variant_contributions.state,'AVAILABLE');
 const {schema:previousSchema,...previousFields}=previous;assert.equal(previousSchema,'business_month_view_v4');assert.deepEqual(unchanged,previousFields);
 assert.equal(Object.hasOwn(previous,'variant_contributions'),false);assert.deepEqual(project(current),current);
 // A rolling deployment may legitimately return no captured proof. It must
 // preserve the financial view without treating absence as a zero value.
 const unavailable={...current,variant_contributions:null};assert.deepEqual(project(unavailable),unavailable);
 let reads=0;const oldObserved={active:fixture.frame,display:fixture.frame,display_source:'PUBLISHED',audit_scope:fixture.audit_scope,source_frames:fixture.source_frames,expense_schedule:null};
 Object.defineProperty(oldObserved,'variant_contributions',{get(){reads++;throw Error('legacy must not request attribution');}});
 for(const contract of ['business-month-view-v1','business-month-view-v2','business-month-view-v3','business-month-view-v4']){
  const old=buildBusinessMonthView(oldObserved,{enabled:true,status:'COMPLETE',next_run_at:fixture.frame.checked_at+60,last_attempt_at:fixture.frame.checked_at-5},{now:()=>fixture.frame.checked_at*1000,contract});
  assert.equal(Object.hasOwn(old,'variant_contributions'),false);assert.deepEqual(old.display,current.display);
 }
 assert.equal(reads,0);
});

test('the negotiated view rejects attribution from another publication, cost revision, month or quantity',async()=>{
 const valid=variantOrderView(await variantOrderFixture());
 for(const mutate of [
  value=>value.variant_contributions.source.publication_revision++,
  value=>value.variant_contributions.source.costs_revision++,
  value=>value.variant_contributions.month='2026-09',
  value=>value.variant_contributions.checked_at--,
  value=>value.variant_contributions.variants[0].total_quantity++,
  value=>value.variant_contributions.variants[0].strict.contribution_cents++,
  value=>value.variant_contributions.windows[0].run_id='99999999-9999-4999-8999-999999999999',
 ]){const wrong=structuredClone(valid);mutate(wrong);assert.equal(project(wrong),null);}
 let reads=0;const accessor=structuredClone(valid);Object.defineProperty(accessor,'variant_contributions',{enumerable:true,get(){reads++;return valid.variant_contributions;}});
 assert.equal(project(accessor),null);assert.equal(reads,0);
 const leaked=structuredClone(valid);leaked.variant_contributions.order_sn='must-not-cross-public-boundary';assert.equal(project(leaked),null);
});

test('an active view cannot carry published variant evidence, and a legacy publication stays explicitly uncaptured',async()=>{
 const fixture=await variantOrderFixture({captured:'none'}),published=variantOrderView(fixture);
 assert.equal(published.variant_contributions.state,'NOT_CAPTURED');assert.equal(published.variant_contributions.coverage.strict_variants,0);
 assert.ok(published.variant_contributions.variants.every(row=>row.strict.contribution_cents===null));
 const options={contract:'business-month-view-v5',now:()=>fixture.frame.checked_at*1000},policy={enabled:true,status:'RUNNING',next_run_at:fixture.frame.checked_at,last_attempt_at:null};
 const observed={active:fixture.frame,display:fixture.frame,display_source:'ACTIVE',audit_scope:null,source_frames:null,expense_schedule:null,variant_contributions:null};
 const active=buildBusinessMonthView(observed,policy,options);assert.equal(active.variant_contributions,null);assert.ok(project(active));
 assert.throws(()=>buildBusinessMonthView({...observed,variant_contributions:fixture.variant_contributions},policy,options),{message:'BUSINESS_MONTH_VIEW_INVALID'});
});
