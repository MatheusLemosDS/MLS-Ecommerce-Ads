import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {projectReconciliationRequest,projectReconciliationFrame,reconciliationRequestMatches} from '../src/reconciliation-frame.mjs';

function frame(){
 return {schema:'finance_reconciliation_v1',run_id:'11111111-1111-4111-8111-111111111111',source_revision:2,start_date:'2026-10-01',end_date:'2026-10-15',checked_at:1792500000,status:'CHECKED',source_checked_at:{finance_oldest_at:1792499900,finance_latest_at:1792499990,returns_oldest_at:1792499995,returns_latest_at:1792499995},coverage:{orders:1,evidence_orders:1,missing_evidence_orders:0,paid_orders:1,review_orders:0,return_orders:1,return_unknown_orders:0},adjustments:{reported_orders:1,missing_orders:0,conflicting_orders:0,known_adjustment_cents:100,base_repass_cents:8000,after_adjustment_repass_cents:8100},returns:{reference_count:1,checked_count:1,pending_count:0,known_requested_refund_cents:1000,requested_amount_complete:true,permission:'AVAILABLE'},cases:[{case_hash:'a'.repeat(64),order_hash:'b'.repeat(64),status:'ACCEPTED',requested_refund_cents:1000,checked_at:1792499995,diagnostic:null}],truncation:{truncated:false,cases_total:1,cases_included:1},pending:['RETURN_VALUES_UNVERIFIED','SETTLEMENT_NOT_RECONCILED'],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};
}

test('a checked source audit preserves signed adjustment direction and requested refunds without representing a realized profit',()=>{
 const value=frame(),projected=projectReconciliationFrame(value);assert.deepEqual(projected,value);assert.notEqual(projected,value);assert.notEqual(projected.cases[0],value.cases[0]);
 assert.equal(projected.adjustments.after_adjustment_repass_cents,8100,'a positive reported adjustment increases the observed payout');assert.equal(projected.returns.known_requested_refund_cents,1000);assert.ok(projected.pending.includes('SETTLEMENT_NOT_RECONCILED'));
 const decreased=frame();decreased.adjustments.known_adjustment_cents=-8100;decreased.adjustments.after_adjustment_repass_cents=-100;assert.ok(projectReconciliationFrame(decreased));
 for(const mutate of [v=>v.net_profit_cents=0,v=>v.net_estimate_cents=8100,v=>v.cases[0].order_sn='PRIVATE_ORDER',v=>v.cases[0].buyer='PRIVATE_BUYER',v=>v.adjustments.access_token='PRIVATE_TOKEN',v=>v.pending=[],v=>v.adjustments.after_adjustment_repass_cents=7900,v=>v.adjustments.after_adjustment_repass_cents=null]){const poisoned=frame();mutate(poisoned);assert.equal(projectReconciliationFrame(poisoned),null);}
});

test('an unavailable case cannot acquire zero refund money or a fabricated source timestamp, while old validated evidence survives a refresh failure',()=>{
 const value=frame();value.status='BLOCKED';value.returns={reference_count:1,checked_count:0,pending_count:1,known_requested_refund_cents:0,requested_amount_complete:false,permission:'DENIED'};value.source_checked_at.returns_oldest_at=null;value.source_checked_at.returns_latest_at=null;value.cases[0]={...value.cases[0],status:'PENDING',requested_refund_cents:null,checked_at:null,diagnostic:'PERMISSION_DENIED'};value.pending.push('RETURN_DETAILS_PENDING','RETURN_PERMISSION_REQUIRED');assert.ok(projectReconciliationFrame(value));
 for(const mutate of [v=>v.cases[0].requested_refund_cents=0,v=>v.cases[0].checked_at=1792499995,v=>v.returns.requested_amount_complete=true,v=>v.source_checked_at.returns_oldest_at=1792499995,v=>v.pending=v.pending.filter(code=>code!=='RETURN_PERMISSION_REQUIRED')]){const poisoned=structuredClone(value);mutate(poisoned);assert.equal(projectReconciliationFrame(poisoned),null);}
 const retained=frame();retained.status='PARTIAL';retained.pending.push('RETURN_DETAILS_PENDING');assert.ok(projectReconciliationFrame(retained),'a failed refresh may retain a previously checked observation without changing its timestamp');
});

test('missing evidence, absent adjustments and unmapped source statuses stay independently explicit',()=>{
 const value=frame();value.status='PARTIAL';value.coverage.evidence_orders=0;value.coverage.missing_evidence_orders=1;value.adjustments={reported_orders:0,missing_orders:1,conflicting_orders:0,known_adjustment_cents:0,base_repass_cents:8000,after_adjustment_repass_cents:null};value.cases[0].status='UNKNOWN';value.cases[0].diagnostic='UNKNOWN_STATUS';value.pending.push('ORDER_EVIDENCE_MISSING','ADJUSTMENT_FIELDS_UNAVAILABLE','RETURN_STATUS_UNRECOGNIZED');assert.ok(projectReconciliationFrame(value));
 for(const mutate of [v=>v.status='CHECKED',v=>v.adjustments.after_adjustment_repass_cents=8000,v=>v.cases[0].status='FUTURE_PROVIDER_STATUS',v=>v.cases[0].diagnostic=null,v=>v.pending=v.pending.filter(code=>code!=='ORDER_EVIDENCE_MISSING'),v=>v.coverage.return_unknown_orders=1]){const poisoned=structuredClone(value);mutate(poisoned);assert.equal(projectReconciliationFrame(poisoned),null);}
 const conflict=frame();conflict.status='PARTIAL';conflict.adjustments.reported_orders=0;conflict.adjustments.conflicting_orders=1;conflict.adjustments.known_adjustment_cents=0;conflict.adjustments.after_adjustment_repass_cents=null;conflict.pending.push('ADJUSTMENT_CONFLICT');assert.ok(projectReconciliationFrame(conflict));
});

test('integer cents reject unsafe arithmetic while a zero-order source does not invent missing return requests',()=>{
 const value=frame();value.coverage={orders:0,evidence_orders:0,missing_evidence_orders:0,paid_orders:0,review_orders:0,return_orders:0,return_unknown_orders:0};value.adjustments={reported_orders:0,missing_orders:0,conflicting_orders:0,known_adjustment_cents:0,base_repass_cents:0,after_adjustment_repass_cents:0};value.returns={reference_count:0,checked_count:0,pending_count:0,known_requested_refund_cents:0,requested_amount_complete:true,permission:'UNKNOWN'};value.cases=[];value.source_checked_at.returns_oldest_at=null;value.source_checked_at.returns_latest_at=null;value.truncation={truncated:false,cases_total:0,cases_included:0};value.pending=['SETTLEMENT_NOT_RECONCILED'];assert.ok(projectReconciliationFrame(value));
 const huge=frame();huge.adjustments.base_repass_cents=Number.MAX_SAFE_INTEGER;huge.adjustments.known_adjustment_cents=1;huge.adjustments.after_adjustment_repass_cents=Number.MAX_SAFE_INTEGER+1;assert.equal(projectReconciliationFrame(huge),null);
 const signed=frame();signed.adjustments.base_repass_cents=Number.MIN_SAFE_INTEGER;signed.adjustments.known_adjustment_cents=Number.MAX_SAFE_INTEGER;signed.adjustments.after_adjustment_repass_cents=0;assert.ok(projectReconciliationFrame(signed));
 for(const mutate of [v=>v.adjustments.known_adjustment_cents=-0,v=>v.returns.requested_amount_complete=false,v=>v.returns.known_requested_refund_cents=1,v=>v.cases.push({...frame().cases[0]}),v=>v.coverage.orders=1]){const poisoned=structuredClone(value);mutate(poisoned);assert.equal(projectReconciliationFrame(poisoned),null);}
});

test('bounded case evidence keeps exact aggregate coverage without accepting duplicate identifiers or false completeness',()=>{
 const value=frame();value.returns.reference_count=100000;value.returns.pending_count=99999;value.returns.requested_amount_complete=false;value.truncation={truncated:true,cases_total:100000,cases_included:1};value.status='PARTIAL';value.pending.push('RETURN_DETAILS_PENDING');assert.ok(projectReconciliationFrame(value));
 for(const mutate of [v=>v.returns.reference_count=100001,v=>v.truncation.truncated=false,v=>v.truncation.cases_total=99999,v=>v.cases.push({...v.cases[0]}),v=>v.returns.requested_amount_complete=true,v=>v.returns.known_requested_refund_cents=999]){const poisoned=structuredClone(value);mutate(poisoned);assert.equal(projectReconciliationFrame(poisoned),null);}
 const full=frame();full.returns.known_requested_refund_cents=0;assert.equal(projectReconciliationFrame(full),null);
});

test('the request and frame are self-contained defensive projectors with detached outputs and exact run matching',()=>{
 const request={operation:'read',run_id:frame().run_id};assert.deepEqual(projectReconciliationRequest(request),request);assert.ok(reconciliationRequestMatches(request,frame()));assert.ok(reconciliationRequestMatches({...request,operation:'step'},frame()));assert.equal(reconciliationRequestMatches({...request,run_id:'22222222-2222-4222-8222-222222222222'},frame()),false);
 for(const value of [{...request,operation:'start'},{...request,order_sn:'PRIVATE_ORDER'},{...request,run_id:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'},null,[]])assert.equal(projectReconciliationRequest(value),null);
 let touched=0;const getter=Object.defineProperty({...request},'operation',{get(){touched++;return 'read';},enumerable:true});assert.equal(projectReconciliationRequest(getter),null);const poisoned=frame();Object.defineProperty(poisoned.adjustments,'known_adjustment_cents',{get(){touched++;return 100;},enumerable:true});assert.equal(projectReconciliationFrame(poisoned),null);assert.equal(touched,0);
 const context=vm.createContext({serialized:JSON.stringify(frame()),selection:JSON.stringify(request)});vm.runInContext(projectReconciliationFrame.toString()+'\n'+projectReconciliationRequest.toString()+'\nglobalThis.result=projectReconciliationFrame(JSON.parse(serialized));globalThis.request=projectReconciliationRequest(JSON.parse(selection));',context);assert.deepEqual(JSON.parse(JSON.stringify(context.result)),frame());assert.deepEqual(JSON.parse(JSON.stringify(context.request)),request);
 const circular=frame();circular.cases.push(circular);assert.equal(projectReconciliationFrame(circular),null);
});
