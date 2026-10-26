import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {projectReconciliationFrame,projectReconciliationEvidenceFrame} from '../src/reconciliation-frame.mjs';

const at=1792929600,hash=letter=>letter.repeat(64);
function fixture(){
 const report={schema:'finance_reconciliation_v1',run_id:'11111111-1111-4111-8111-111111111111',source_revision:2,start_date:'2026-10-01',end_date:'2026-10-15',checked_at:at,status:'CHECKED',source_checked_at:{finance_oldest_at:at-100,finance_latest_at:at-20,returns_oldest_at:at-10,returns_latest_at:at-10},coverage:{orders:6,evidence_orders:6,missing_evidence_orders:0,paid_orders:4,review_orders:2,return_orders:4,return_unknown_orders:0},adjustments:{reported_orders:4,missing_orders:0,conflicting_orders:0,known_adjustment_cents:-400,base_repass_cents:32000,after_adjustment_repass_cents:31600},returns:{reference_count:5,checked_count:5,pending_count:0,known_requested_refund_cents:5000,requested_amount_complete:true,permission:'AVAILABLE'},cases:['a','b','c','d','e'].map((letter,index)=>({case_hash:hash(String(index+1)),order_hash:hash(letter),status:'ACCEPTED',requested_refund_cents:1000,checked_at:at-10,diagnostic:null})),truncation:{truncated:false,cases_total:5,cases_included:5},pending:['RETURN_VALUES_UNVERIFIED','SETTLEMENT_NOT_RECONCILED'],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};
 const review={schema:'finance_review_orders_v1',summary:{orders:2,in_cancel:1,to_return:1,other:0,unknown:0},orders:[{order_hash:hash('e'),status:'TO_RETURN',source_checked_at:at-60,reference_state:'AVAILABLE',reference_count:1,references_checked_at:at-15,reference_diagnostic:null,next_attempt_at:at+285,checked_cases:1,pending_cases:0},{order_hash:hash('f'),status:'IN_CANCEL',source_checked_at:at-30,reference_state:'NOT_APPLICABLE',reference_count:null,references_checked_at:null,reference_diagnostic:null,next_attempt_at:null,checked_cases:null,pending_cases:null}],truncation:{truncated:false,orders_total:2,orders_included:2},basis:'REVIEW_ORDERS_OUTSIDE_PAID_COHORT'};
 return {schema:'finance_reconciliation_v2',report,review};
}
const project=value=>projectReconciliationEvidenceFrame(value,projectReconciliationFrame);

test('review evidence is a detached negotiated envelope with exact counts and separate source/reference observation times',()=>{
 const value=fixture(),saved=JSON.stringify(value),checked=project(value);assert.deepEqual(checked,value);assert.ok(projectReconciliationFrame(value.report));assert.equal(projectReconciliationFrame(value),null);assert.equal(project(value.report),null);assert.equal(projectReconciliationEvidenceFrame(value),null);
 checked.review.orders[0].reference_count=99;checked.review.summary.orders=99;checked.report.coverage.review_orders=99;assert.equal(JSON.stringify(value),saved);
 const context=vm.createContext({serialized:saved});vm.runInContext(projectReconciliationFrame.toString()+'\n'+projectReconciliationEvidenceFrame.toString()+'\nglobalThis.output=projectReconciliationEvidenceFrame(JSON.parse(serialized),projectReconciliationFrame);',context);assert.deepEqual(JSON.parse(JSON.stringify(context.output)),value);
});

test('review envelope rejects poisoned ownership, dates, classifications, counts, private fields and accessors',()=>{
 const changes=[v=>{v.private_order='SECRET';},v=>{v.review.orders[0].order_sn='SECRET';},v=>{v.review.orders[0].order_hash=hash('0');},v=>{v.review.orders[1].order_hash=hash('e');},v=>{v.review.orders[0].status='PRIVATE_STATUS';},v=>{v.review.orders[0].source_checked_at=at-19;},v=>{v.review.orders[0].references_checked_at=at+1;},v=>{v.review.summary.to_return++;},v=>{v.review.summary.in_cancel--;},v=>{v.review.truncation.orders_included--;},v=>{v.review.orders[0].checked_cases=0;v.review.orders[0].pending_cases=1;},v=>{v.review.orders[0].reference_count=2;v.review.orders[0].pending_cases=1;},v=>{v.review.orders[1].reference_state='KNOWN_EMPTY';},v=>{v.review.orders[1].reference_diagnostic='PRIVATE_PROVIDER';},v=>{v.review.orders[1].status='TO_RETURN';v.review.summary.in_cancel=0;v.review.summary.to_return=2;}];
 for(const mutate of changes){const value=fixture();mutate(value);assert.equal(project(value),null);}
 for(const key of ['review','report']){const value=fixture();let invoked=false;Object.defineProperty(value,key,{get(){invoked=true;throw Error('accessor');},enumerable:true});assert.equal(project(value),null);assert.equal(invoked,false);}
 const array=fixture();Object.defineProperty(array.review.orders,'0',{get(){throw Error('row getter');},enumerable:true});assert.equal(project(array),null);
});

test('unknown references, explicit empty lists and retries remain distinct from checked return cases',()=>{
 const value=fixture(),row=value.review.orders[0];value.report.cases=value.report.cases.slice(0,4);Object.assign(value.report.truncation,{cases_total:4,cases_included:4});Object.assign(value.report.returns,{reference_count:4,checked_count:4,known_requested_refund_cents:4000});value.report.status='PARTIAL';value.report.pending.push('RETURN_REFERENCES_MISSING');
 Object.assign(row,{reference_state:'PENDING',reference_count:null,references_checked_at:null,reference_diagnostic:null,next_attempt_at:null,checked_cases:null,pending_cases:null});assert.ok(project(value));
 Object.assign(row,{reference_state:'RETRY_WAIT',reference_diagnostic:'RATE_LIMIT',next_attempt_at:at+60});assert.ok(project(value));row.next_attempt_at=at;assert.equal(project(value),null);row.next_attempt_at=at+60;row.reference_diagnostic=null;assert.equal(project(value),null);
 Object.assign(row,{reference_state:'KNOWN_EMPTY',reference_count:0,references_checked_at:at-10,reference_diagnostic:'TIMEOUT',next_attempt_at:at+300,checked_cases:0,pending_cases:0});assert.ok(project(value),'saved empty evidence survives a later failed refresh');
 row.reference_state='AVAILABLE';assert.equal(project(value),null);row.reference_state='KNOWN_EMPTY';row.pending_cases=1;assert.equal(project(value),null);
});
