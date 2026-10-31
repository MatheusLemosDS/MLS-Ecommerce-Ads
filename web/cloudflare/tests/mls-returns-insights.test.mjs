import test from 'node:test';
import assert from 'node:assert/strict';
import {createMlsReturnsInsights,projectMlsReturnsInsights} from '../src/mls-returns-insights.mjs';
import {projectBusinessReconciliation,projectBusinessReconciliationEvidence,projectBusinessReconciliationMoney} from '../src/business-reconciliation.mjs';
import {projectReconciliationFrame,projectReconciliationEvidenceFrame,projectReconciliationMoneyFrame} from '../../finance/src/reconciliation-frame.mjs';
import {returnsInsightsFixture} from './m2-returns-insights-fixture.mjs';
import {projectMlsSpecialistChart} from '../src/mission-control.mjs';

const project=fixture=>projectMlsReturnsInsights(fixture.snapshot,{expectedMonth:fixture.month,expectedScope:fixture.scope});
test('source-valid status totals preserve paid/review cohorts and expose no order or case identifiers',()=>{
 const f=returnsInsightsFixture();
 assert.ok(projectBusinessReconciliationMoney(f.envelope,{projectBusiness:projectBusinessReconciliation,projectFrame:projectReconciliationFrame,projectEvidenceFrame:projectReconciliationEvidenceFrame,projectMoneyFrame:projectReconciliationMoneyFrame}),'shared synthetic fixture obeys the actual source contract');
 const result=project(f);
 assert.equal(result.state,'READY');assert.equal(result.coverage.aggregate_complete,true);
 assert.deepEqual(result.cohorts.map(row=>[row.cohort,row.cases,row.known_amount_cents]),[['PAID',2,3000],['REVIEW',1,3000],['OTHER',0,0]]);
 assert.equal(result.states.find(row=>row.status==='ACCEPTED').cases,1);
 assert.equal(result.states.find(row=>row.status==='REFUND_PAID').known_amount_cents,2000);
 assert.equal(result.states.find(row=>row.status==='CANCELLED').known_amount_cents,3000);
 assert.equal(result.coverage.identified_cases,3);assert.equal(result.coverage.amount_known,3);assert.equal(result.coverage.known_amount_cents,6000);
 assert.equal(result.period.publication_revision,7);assert.ok(Object.isFrozen(result.states[0]));
 assert.doesNotMatch(JSON.stringify(result),/order_hash|case_hash|order_sn|customer|bank|net_profit_cents|adjustment_cents/);
});
test('factory is self-contained and cannot operate without matching publication proof',()=>{
 const f=returnsInsightsFixture(),isolated=(0,eval)('('+createMlsReturnsInsights.toString()+')')().projectMlsReturnsInsights;
 assert.deepEqual(isolated(f.snapshot,{expectedMonth:f.month,expectedScope:f.scope}),project(f));
 const reordered=returnsInsightsFixture(),source=reordered.snapshot.report.sources[0];
 reordered.snapshot.report.sources[0]={end_date:source.end_date,start_date:source.start_date,source_revision:source.source_revision,run_id:source.run_id};
 assert.equal(project(reordered).state,'READY','valid source property order is immaterial to publication identity');
 for(const options of [{},{expectedMonth:f.month},{expectedMonth:'2026-11',expectedScope:f.scope},{expectedMonth:f.month,expectedScope:{...f.scope,publication_revision:8}}]){
  assert.equal(isolated(f.snapshot,options).state,'UNAVAILABLE');
 }
 for(const mutate of [f=>{f.snapshot.scope_key=JSON.stringify({...f.scope,publication_revision:8});},f=>{f.snapshot.report.sources[0].source_revision++;},f=>{f.snapshot.money[0].source_revision++;},f=>{f.snapshot.reviews[0].source_revision++;},f=>{f.snapshot.report.reports[0].run_id='22222222-2222-4222-8222-222222222222';}]){
  const changed=returnsInsightsFixture();mutate(changed);assert.equal(project(changed).state,'UNAVAILABLE');
 }
});
test('legacy and unloaded evidence stay unavailable instead of producing zero counts',()=>{
 const f=returnsInsightsFixture();
 for(const snapshot of [null,{...f.snapshot,money:[]},{...f.snapshot,reviews:[],money:[]}]){
  const result=projectMlsReturnsInsights(snapshot,{expectedMonth:f.month,expectedScope:f.scope});
  assert.equal(result.state,'UNAVAILABLE');assert.equal(result.coverage.identified_cases,null);assert.deepEqual(result.states,[]);
 }
});
test('unknown refund amounts remain partial while a known zero remains a reported monetary value',()=>{
 const f=returnsInsightsFixture(),frame=f.snapshot.report.reports[0],details=f.snapshot.money[0].money;
 const accepted=details.groups[0].statuses.find(row=>row.status==='ACCEPTED'),paid=details.groups[0].statuses.find(row=>row.status==='REFUND_PAID');
 accepted.known_amount_cents=0;paid.amount_known=0;paid.known_amount_cents=0;
 frame.returns.known_requested_refund_cents=3000;frame.returns.requested_amount_complete=false;
 const result=project(f);
 assert.equal(result.state,'PARTIAL');assert.equal(result.coverage.aggregate_complete,true);
 assert.equal(result.coverage.amount_known,2);assert.equal(result.coverage.amount_missing,1);
 assert.equal(result.states.find(row=>row.status==='ACCEPTED').amount_known,1);assert.equal(result.states.find(row=>row.status==='ACCEPTED').known_amount_cents,0);
 assert.equal(result.states.find(row=>row.status==='REFUND_PAID').amount_known,0);
});
test('missing references, source intervals and truncated visible lists are explicit',()=>{
 const truncated=returnsInsightsFixture(),frame=truncated.snapshot.report.reports[0],details=truncated.snapshot.money[0].money;
 frame.cases=frame.cases.slice(0,1);frame.truncation={truncated:true,cases_total:3,cases_included:1};
 details.payouts=details.payouts.slice(0,1);details.truncation={truncated:true,payouts_total:3,payouts_included:1};
 const full=project(truncated);assert.equal(full.coverage.identified_cases,3);assert.equal(full.coverage.case_list_truncated,true);assert.equal(full.coverage.payout_list_truncated,true);assert.equal(full.coverage.aggregate_complete,true);
 frame.pending.push('RETURN_REFERENCES_MISSING');frame.status='PARTIAL';
 const missing=project(truncated);assert.equal(missing.state,'PARTIAL');assert.equal(missing.coverage.aggregate_complete,true);assert.equal(missing.coverage.missing_reference_sources,1);
 assert.equal(projectMlsSpecialistChart('returns-status',null,missing).status,'READY','known identified requests remain visible with the missing-reference coverage warning');
 const partial=returnsInsightsFixture(),next={run_id:'22222222-2222-4222-8222-222222222222',source_revision:3,start_date:'2026-10-16',end_date:'2026-10-25'};
 partial.scope.end_date=next.end_date;partial.scope.sources.push(next);partial.snapshot.scope_key=JSON.stringify(partial.scope);partial.snapshot.report.end_date=next.end_date;partial.snapshot.report.sources.push(next);
 const observed=project(partial);assert.equal(observed.state,'PARTIAL');assert.equal(observed.coverage.sources_total,2);assert.equal(observed.coverage.sources_available,1);assert.equal(observed.coverage.aggregate_complete,false);
 assert.equal(projectMlsSpecialistChart('returns-status',null,observed).status,'UNAVAILABLE','a source interval without status totals cannot produce the monthly chart');
});
test('specialist graph uses exclusive identified-case status counts, never the overlapping order counters',()=>{
 const result=project(returnsInsightsFixture()),chart=projectMlsSpecialistChart('returns-status',null,result);
 assert.equal(chart.status,'READY');assert.equal(chart.type,'horizontalBar');assert.equal(chart.total,3);
 assert.deepEqual(chart.segments.map(row=>[row.label,row.value]),[['Solicitação aceita',1],['Solicitação cancelada',1],['Reembolso informado',1]]);
 assert.match(chart.title,/solicitações identificadas/);assert.match(chart.source,/NOT_BANK_MOVEMENT/);
 const corrupted={...result,states:result.states.map((row,index)=>index===0?{...row,cases:1}:row)};
 assert.equal(projectMlsSpecialistChart('returns-status',null,corrupted).status,'UNAVAILABLE');
 assert.equal(projectMlsSpecialistChart('returns-reasons',null,result).status,'UNAVAILABLE','recorded status never implies a commercial reason');
});
test('inconsistent category totals, unsafe sums, accessors and injected category text fail closed',()=>{
 for(const mutate of [f=>{f.snapshot.money[0].money.groups[0].statuses[0].cases++;},f=>{f.snapshot.money[0].money.groups[0].statuses[0].status='<script>bad</script>';},f=>{Object.defineProperty(f.snapshot.money[0].money.groups[0].statuses[0],'cases',{get(){throw Error('accessor must not execute');}});},f=>{f.snapshot.money[0].money.groups[0].statuses[3].known_amount_cents=Number.MAX_SAFE_INTEGER;f.snapshot.money[0].money.groups[0].statuses[6].known_amount_cents=Number.MAX_SAFE_INTEGER;}]){
  const f=returnsInsightsFixture();mutate(f);const result=project(f);assert.equal(result.state,'UNAVAILABLE');assert.deepEqual(result.states,[]);
 }
});
