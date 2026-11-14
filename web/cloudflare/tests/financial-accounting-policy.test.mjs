import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFinancialAccountingPolicy,financialAccountingPolicyForPeriod,financialAccountingTaxRecognitions} from '../src/financial-accounting-policy.mjs';
import {financialAccountingPeriod,projectFinancialAccountingPeriod,financialAccountingDuePeriods} from '../src/financial-accounting-schedule.mjs';
import {financialTestPolicy,financialTestScope} from './financial-ledger-fixture.mjs';

test('financial policies require explicit company scope, approval provenance and effective dates',()=>{
 const policy=financialTestPolicy(),period=financialAccountingPeriod({kind:'MONTH',anchor:'2026-10'});
 assert.equal(financialAccountingPolicyForPeriod(policy,period).state,'APPROVED');
 assert.throws(()=>validateFinancialAccountingPolicy(policy,{scope:financialTestScope({organization_id:'synthetic-company-b'})}),/SCOPE_MISMATCH/);
 const draft=financialTestPolicy({approval:{state:'DRAFT',actor_ref:null,at:null,evidence_ref:null}});
 assert.ok(financialAccountingPolicyForPeriod(draft,period).pending.includes('ACCOUNTING_POLICY_APPROVAL_REQUIRED'));
 assert.ok(financialAccountingPolicyForPeriod(financialTestPolicy({effective_from:'2026-10-15'}),period).pending.includes('ACCOUNTING_POLICY_OUTSIDE_EFFECTIVE_PERIOD'));
 assert.throws(()=>validateFinancialAccountingPolicy(financialTestPolicy({approval:{state:'APPROVED',actor_ref:null,at:null,evidence_ref:null}})),/APPROVAL_INVALID/);
 assert.deepEqual(financialAccountingPolicyForPeriod(null,period),{state:'UNCONFIGURED',policy_id:null,revision:null,pending:['ACCOUNTING_POLICY_REQUIRED']});
});

test('legacy creation/reference estimates remain estimates and cannot become final by changing labels',()=>{
 const period=financialAccountingPeriod({kind:'MONTH',anchor:'2026-10'});
 for(const patch of [{recognition:'PAID_ORDER_CREATE_ESTIMATE'},{cost_basis:'REFERENCE_ESTIMATE'}]){
  const result=financialAccountingPolicyForPeriod(financialTestPolicy(patch),period);assert.equal(result.state,'ESTIMATE');assert.ok(result.pending.includes('ESTIMATE_POLICY_NOT_FINAL_RESULT'));
 }
 assert.ok(financialAccountingPolicyForPeriod(financialTestPolicy(),financialAccountingPeriod({kind:'MANUFACTURE_WEEK',anchor:'2026-10-23'})).pending.includes('FINANCIAL_COMPETENCE_PERIOD_REQUIRED'));
});

test('declared fixed monthly tax is recognized once at month end and payment has no second recognition',()=>{
 const policy=financialTestPolicy({tax:{regime:'MEI',mode:'FIXED_MONTHLY',monthly_cents:8605,recognition:'MONTH_END',source_ref:'synthetic-declared-tax',revision:3}});
 const month=financialAccountingPeriod({kind:'MONTH',anchor:'2026-10'}),atEnd=financialAccountingPeriod({kind:'CIVIL_WEEK',anchor:'2026-10-31'}),before=financialAccountingPeriod({kind:'CIVIL_WEEK',anchor:'2026-10-22'});
 const recognized=financialAccountingTaxRecognitions(policy,month);assert.equal(recognized.events.length,1);assert.equal(recognized.events[0].amount_cents,8605);assert.equal(recognized.events[0].competence_date,'2026-10-31');
 assert.equal(financialAccountingTaxRecognitions(policy,atEnd).events.length,1);assert.deepEqual(financialAccountingTaxRecognitions(policy,before).events,[]);
 assert.equal(financialAccountingTaxRecognitions(financialTestPolicy({approval:{state:'DRAFT',actor_ref:null,at:null,evidence_ref:null},tax:policy.tax}),month).state,'PENDING');
 assert.throws(()=>validateFinancialAccountingPolicy(financialTestPolicy({tax:{...policy.tax,monthly_cents:.5}})),/POLICY_.*INVALID/);
});

test('Friday 13h manufacturing boundary is distinct from the financial civil week',()=>{
 const before=financialAccountingPeriod({kind:'MANUFACTURE_WEEK',anchor:'2026-11-13T15:59:59.000Z'}),at=financialAccountingPeriod({kind:'MANUFACTURE_WEEK',anchor:'2026-11-13T16:00:00.000Z'}),civil=financialAccountingPeriod({kind:'CIVIL_WEEK',anchor:'2026-11-13T15:59:59.000Z'});
 assert.equal(before.start_at,'2026-11-06T16:00:00.000Z');assert.equal(before.end_at,at.start_at);assert.equal(at.start_at,'2026-11-13T16:00:00.000Z');
 assert.equal(civil.start_at,'2026-11-13T03:00:00.000Z');assert.equal(civil.basis,'EVENT_COMPETENCE');assert.notEqual(civil.calendar,at.calendar);
 assert.deepEqual(projectFinancialAccountingPeriod(at),at);assert.equal(projectFinancialAccountingPeriod({...at,start_at:civil.start_at}),null);
});

test('month boundaries and completed-period scheduling do not sum overlapping weeks into a month',()=>{
 const week=financialAccountingPeriod({kind:'CIVIL_WEEK',anchor:'2026-11-01'}),month=financialAccountingPeriod({kind:'MONTH',anchor:'2026-11'}),due=financialAccountingDuePeriods('2026-11-01T03:00:00.000Z');
 assert.equal(week.start_date,'2026-10-30');assert.equal(week.end_date,'2026-11-05');assert.equal(month.start_date,'2026-11-01');assert.equal(month.end_date,'2026-11-30');
 assert.equal(due.monthly.id,'MONTH:CIVIL_MONTH:2026-10-01');assert.ok(due.weekly.end_at<='2026-11-01T03:00:00.000Z');assert.equal(due.clock_alone_allows_finalize,false);
 assert.throws(()=>financialAccountingPeriod({kind:'MONTH',anchor:'2026-02-30'}));assert.throws(()=>financialAccountingPeriod({kind:'CIVIL_WEEK',anchor:'2026-10-10',timezone:'UTC'}));
});

test('calendar conversion preserves the actual historical timezone offset',()=>{
 const period=financialAccountingPeriod({kind:'CIVIL_WEEK',anchor:'2018-12-14'});assert.equal(period.start_at,'2018-12-14T02:00:00.000Z');assert.equal(period.end_at,'2018-12-21T02:00:00.000Z');
});
