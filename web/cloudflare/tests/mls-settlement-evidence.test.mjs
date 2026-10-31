import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {projectMlsSettlementEvidence} from '../src/mls-settlement-evidence.mjs';
import {settlementFixture} from './mls-settlement-fixture.mjs';

test('same publication and observation produces compatible evidence, never a bank result',()=>{
 const fixture=settlementFixture(),original=structuredClone(fixture),result=projectMlsSettlementEvidence(fixture);
 assert.equal(result.evidence_state,'OBSERVED_COMPATIBLE');
 assert.equal(result.compared_orders,1);assert.equal(result.compatible_orders,1);assert.equal(result.conflicts,0);
 assert.match(result.basis,/NOT_BANK_RECEIPT/);
 assert.doesNotMatch(JSON.stringify(result),/order_hash|run_id|realized_net_cents|remaining_receivable/);
 assert.deepEqual(fixture,original,'saved evidence is immutable');
 assert.equal(Object.isFrozen(result),true);
});

test('missing, noncanonical or different publications wait without reporting a monetary conflict',()=>{
 for(const mutate of [
  value=>delete value.month.audit_scope,
  value=>value.month.audit_scope.publication_revision++,
  value=>value.reconciliation.scope_key='',
  value=>value.releases.scope_key='scope',
  value=>value.releases.scope_key=' '+value.releases.scope_key,
  value=>value.reconciliation.month='2026-09',
  value=>value.releases.report.cohort.publication_revision++,
  value=>value.reconciliation.report.source_revision++,
  value=>value.reconciliation.report.sources[0].source_revision++,
  value=>value.reconciliation.report.reports[0].run_id='22222222-2222-4222-8222-222222222222',
  value=>value.releases.report.report.sources[0].end_date='2026-10-14',
  value=>value.releases.report.cohort.sources[0].finance_oldest_at--,
  value=>value.reconciliation.report.reports[0].source_checked_at.finance_latest_at++,
  value=>value.releases.orders.rows[0].financial_checked_at--
 ]){
  const fixture=settlementFixture();mutate(fixture);
  fixture.reconciliation.money[0].money.payouts[0].after_adjustment_repass_cents=7900;
  fixture.reconciliation.money[0].money.payouts[0].adjustment_cents=-100;
  const result=projectMlsSettlementEvidence(fixture);
  assert.equal(result.evidence_state,'WAITING_SCOPE',mutate.toString());assert.equal(result.conflicts,0);
 }
});

test('same-cohort signed payout differences remain blocking evidence conflicts',()=>{
 const fixture=settlementFixture();
 Object.assign(fixture.reconciliation.money[0].money.payouts[0],{adjustment_cents:-100,after_adjustment_repass_cents:7900});
 const result=projectMlsSettlementEvidence(fixture);
 assert.equal(result.evidence_state,'CONFLICT');assert.equal(result.conflicts,1);assert.equal(result.reason,'PAYOUT_VALUES_DIFFER');
});

test('contradictory duplicate hashes never overwrite a map; identical duplicates are not double counted',()=>{
 for(const side of ['release','payout']){
  const fixture=settlementFixture(),rows=side==='release'?fixture.releases.orders.rows:fixture.reconciliation.money[0].money.payouts;
  rows.push({...rows[0],adjustment_cents:-100,after_adjustment_repass_cents:7900});
  let result=projectMlsSettlementEvidence(fixture);
  assert.equal(result.evidence_state,'CONFLICT');assert.equal(result.conflicts,1);assert.equal(result.duplicate_conflicts,1);assert.equal(result.compared_orders,0);
  rows[1]={...rows[0]};result=projectMlsSettlementEvidence(fixture);
  assert.equal(result.evidence_state,'OBSERVED_COMPATIBLE');assert.equal(result.compared_orders,1);
 }
 const drift=settlementFixture(),rows=drift.releases.orders.rows;
 rows.push({...rows[0],financial_checked_at:rows[0].financial_checked_at-1,adjustment_cents:-100,after_adjustment_repass_cents:7900});
 const waiting=projectMlsSettlementEvidence(drift);
 assert.equal(waiting.evidence_state,'WAITING_SCOPE');assert.equal(waiting.conflicts,0);assert.equal(waiting.compared_orders,0);
});

test('zero and losses remain numbers while missing or partial money cannot become a full comparison',()=>{
 for(const after of [0,-100]){
  const fixture=settlementFixture();
  for(const row of [fixture.releases.orders.rows[0],fixture.reconciliation.money[0].money.payouts[0]])Object.assign(row,{after_adjustment_repass_cents:after,adjustment_cents:after-8000});
  const result=projectMlsSettlementEvidence(fixture);assert.equal(result.evidence_state,'OBSERVED_COMPATIBLE');assert.equal(result.compatible_orders,1);
 }
 const missing=settlementFixture();missing.releases.orders.rows[0].after_adjustment_repass_cents=null;
 assert.equal(projectMlsSettlementEvidence(missing).evidence_state,'WAITING_EVIDENCE');
 const partial=settlementFixture();partial.releases.orders.truncation.truncated=true;
 assert.equal(projectMlsSettlementEvidence(partial).evidence_state,'PARTIAL');
 const invalid=settlementFixture();invalid.reconciliation.money[0].money.payouts[0].adjustment_cents=1;
 assert.equal(projectMlsSettlementEvidence(invalid).evidence_state,'WAITING_EVIDENCE');
 const review=settlementFixture();Object.assign(review.reconciliation.money[0].money.payouts[0],{cohort:'REVIEW',state:'NOT_IN_PAID_COHORT',after_adjustment_repass_cents:null});
 assert.equal(projectMlsSettlementEvidence(review).compared_orders,0);
});

test('return workflow statuses never rewrite pending conditions or produce another refund debit',()=>{
 for(const status of ['ACCEPTED','CANCELLED','CLOSED','REFUND_PAID']){
  const fixture=settlementFixture();fixture.reconciliation.report.reports[0].pending=['RETURNS_NOT_RECONCILED','SETTLEMENT_NOT_RECONCILED'];
  fixture.reconciliation.report.reports[0].cases=[{status,requested_refund_cents:999999}];
  const result=projectMlsSettlementEvidence(fixture);assert.equal(result.evidence_state,'OBSERVED_COMPATIBLE');
  assert.deepEqual(fixture.reconciliation.report.reports[0].pending,['RETURNS_NOT_RECONCILED','SETTLEMENT_NOT_RECONCILED']);
 }
});

test('the embedded projector is self contained and has no network or storage capability',()=>{
 const embedded=vm.runInNewContext('('+projectMlsSettlementEvidence.toString()+')');
 // JSON crosses the VM realm so both projectors see ordinary own-value DTOs.
 const result=vm.runInNewContext('('+projectMlsSettlementEvidence.toString()+')('+JSON.stringify(settlementFixture())+')');
 assert.equal(result.evidence_state,'OBSERVED_COMPATIBLE');assert.equal(typeof embedded,'function');
 assert.doesNotMatch(projectMlsSettlementEvidence.toString(),/\bfetch\s*\(|XMLHttpRequest|localStorage|\.prepare\s*\(/);
});
