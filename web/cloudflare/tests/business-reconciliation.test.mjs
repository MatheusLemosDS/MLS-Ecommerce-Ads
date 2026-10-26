import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {BUSINESS_MONTH_PUBLICATION_SCHEMA,saveCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {BUSINESS_RECONCILIATION_SCHEMA,BusinessReconciliationError,readBusinessReconciliation,readBusinessReconciliationEvidence,runBusinessReconciliation,projectBusinessReconciliation,projectBusinessReconciliationEvidence} from '../src/business-reconciliation.mjs';
import {projectReconciliationFrame,projectReconciliationEvidenceFrame} from '../../finance/src/reconciliation-frame.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
const month='2026-10',at=Date.UTC(2026,9,25,15),stamp=at/1000,uuid=index=>'11111111-1111-4111-8111-'+String(index).padStart(12,'0');
function sourceFrame(index,offset=0,withReview=false){
 const start_date=month+'-'+String(index*15+1).padStart(2,'0'),end_date=month+'-'+String(Math.min(25,index*15+15)).padStart(2,'0');
 const frame={schema:'finance_business_period_v1',run_id:uuid(index+offset+1),revision:2,status:'COMPLETE',start_date,end_date,cutoff_at:stamp-3,checked_at:stamp,source_checked_at:{oldest_at:stamp-1,latest_at:stamp-1},currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:1,paid:1,completed:1,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1,payment_missing:0,returns:1,returns_unknown:0},known_sales_base_raw:'100',sales_base_raw:'100',known_expected_repass_raw:'80',expected_repass_raw:'80',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:0,known_base_raw:'100',known_tax_raw:'2'},items:[{item_id:'100',model_id:'0',quantity:1}],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
 if(withReview)Object.assign(frame.coverage,{orders:3,cancel_pending:1,other:1});
 assert.ok(projectBusinessPeriodFrame(frame));return frame;
}
function report(source,checked=stamp){
 const value={schema:'finance_reconciliation_v1',run_id:source.run_id,source_revision:source.revision,start_date:source.start_date,end_date:source.end_date,checked_at:checked,status:'CHECKED',source_checked_at:{finance_oldest_at:stamp-1,finance_latest_at:stamp-1,returns_oldest_at:checked,returns_latest_at:checked},coverage:{orders:1,evidence_orders:1,missing_evidence_orders:0,paid_orders:1,review_orders:0,return_orders:1,return_unknown_orders:0},adjustments:{reported_orders:1,missing_orders:0,conflicting_orders:0,known_adjustment_cents:100,base_repass_cents:8000,after_adjustment_repass_cents:8100},returns:{reference_count:1,checked_count:1,pending_count:0,known_requested_refund_cents:1000,requested_amount_complete:true,permission:'AVAILABLE'},cases:[{case_hash:'a'.repeat(64),order_hash:'b'.repeat(64),status:'ACCEPTED',requested_refund_cents:1000,checked_at:checked,diagnostic:null}],truncation:{truncated:false,cases_total:1,cases_included:1},pending:['RETURN_VALUES_UNVERIFIED','SETTLEMENT_NOT_RECONCILED'],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};assert.ok(projectReconciliationFrame(value));return value;
}
class ObservedD1 extends D1{
 constructor(){super();this.rpc=0;this.beforeClaim=null;this.sourceCalls=0;this.failSave=false;}
 prepare(sql){const row=super.prepare(sql),run=row.run.bind(row);row.run=async()=>{this.rpc++;if(sql.startsWith('INSERT INTO business_reconciliation_leases')&&this.beforeClaim){const action=this.beforeClaim;this.beforeClaim=null;await action();}return run();};return row;}
 async batch(rows){this.rpc++;if(this.failSave&&rows.length&&this.failSave(rows)){this.failSave=false;throw Error('SIMULATED_BATCH_FAILURE');}return super.batch(rows);}
}
async function fixture(t,{published=true,withReview=false}={}){
 const db=new ObservedD1(),clock={time:at},now=()=>clock.time,env={ADMIN_DB:db};t.after(()=>db.db.close());
 await db.batch(['CREATE TABLE business_month_runs(month TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)',...BUSINESS_MONTH_PUBLICATION_SCHEMA,...BUSINESS_RECONCILIATION_SCHEMA].map(sql=>db.prepare(sql)));
 async function publish(revision=10,offset=0){const frames=[sourceFrame(0,offset,withReview),sourceFrame(1,offset)],payload={start_date:month+'-01',end_date:month+'-25',slots:frames.map(frame=>({start_date:frame.start_date,end_date:frame.end_date,frame}))},raw=JSON.stringify(payload),row={revision,payload:raw,created_at:stamp-60,updated_at:stamp};db.db.prepare('INSERT OR REPLACE INTO business_month_runs VALUES(?,?,?,?,?)').run(month,revision,raw,row.created_at,row.updated_at);assert.ok(await saveCompletedBusinessMonth(env,month,{row,payload,complete:true},{now}));return frames;}
 const frames=published?await publish():[];return {env,db,clock,now,frames,publish};
}
const stored=f=>({reports:f.db.db.prepare('SELECT * FROM business_reconciliation_reports ORDER BY run_id').all(),attempts:f.db.db.prepare('SELECT * FROM business_reconciliation_attempts ORDER BY run_id').all()});
const evidenceValidators={projectBusiness:projectBusinessReconciliation,projectFrame:projectReconciliationFrame,projectEvidenceFrame:projectReconciliationEvidenceFrame};
function reviewEvidence(source){
 const legacy=report(source),count=source.coverage.cancel_pending+source.coverage.other;
 if(count)Object.assign(legacy.coverage,{orders:3,evidence_orders:3,review_orders:2});
 const base={source_checked_at:stamp-1,reference_diagnostic:null,next_attempt_at:null};
 const orders=count?[{...base,order_hash:'c'.repeat(64),status:'IN_CANCEL',reference_state:'NOT_APPLICABLE',reference_count:null,references_checked_at:null,checked_cases:null,pending_cases:null},{...base,order_hash:'d'.repeat(64),status:'TO_RETURN',reference_state:'KNOWN_EMPTY',reference_count:0,references_checked_at:stamp,checked_cases:0,pending_cases:0}]:[];
 const value={schema:'finance_reconciliation_v2',report:legacy,review:{schema:'finance_review_orders_v1',summary:{orders:count,in_cancel:count?1:0,to_return:count?1:0,other:0,unknown:0},orders,truncation:{truncated:false,orders_total:count,orders_included:count},basis:'REVIEW_ORDERS_OUTSIDE_PAID_COHORT'}};
 assert.ok(projectReconciliationEvidenceFrame(value,projectReconciliationFrame));return value;
}

test('local observation requires the exact completed publication and cannot initiate a provider collection',async t=>{
 const f=await fixture(t,{published:false}),before=stored(f),value=await readBusinessReconciliation(f.env,{month},{now:f.now});assert.equal(value.status,'COLLECTING');assert.equal(value.source_revision,null);assert.equal(value.end_date,null);assert.deepEqual(value.pending,['PUBLICATION_REQUIRED']);assert.deepEqual(stored(f),before);
 let calls=0;assert.equal((await runBusinessReconciliation(f.env,async()=>{calls++;},{month},{now:f.now})).status,'NO_PUBLICATION');assert.equal(calls,0);
 for(const input of [{month,shop_id:1},{month:'2026-13'},{month:'2026-11'},{}])await assert.rejects(readBusinessReconciliation(f.env,input,{now:f.now}),error=>error instanceof BusinessReconciliationError&&error.status===400);
});

test('one scheduler step fills one exact source report, then the next fills the other without altering any financial publication',async t=>{
 const f=await fixture(t),publication=f.db.db.prepare('SELECT * FROM business_month_publications').get(),calls=[],source=async(_,input)=>{calls.push(input);assert.equal(input.operation,'step');return report(f.frames.find(frame=>frame.run_id===input.run_id));};
 const initial=await readBusinessReconciliation(f.env,{month},{now:f.now});assert.equal(initial.status,'RUNNING');assert.equal(initial.reports.length,0);
 const first=await runBusinessReconciliation(f.env,source,{month},{now:f.now});assert.equal(first.source_reads,1);assert.equal(first.repeat,true);const partial=await readBusinessReconciliation(f.env,{month},{now:f.now});assert.equal(partial.status,'PARTIAL');assert.equal(partial.reports.length,1);
 const second=await runBusinessReconciliation(f.env,source,{month},{now:f.now});assert.equal(second.source_reads,1);assert.equal(second.repeat,false);const completed=await readBusinessReconciliation(f.env,{month},{now:f.now});assert.equal(completed.status,'CHECKED');assert.equal(completed.reports.length,2);assert.equal(completed.reports[0].adjustments.known_adjustment_cents,100);assert.ok(completed.reports.every(row=>row.pending.includes('SETTLEMENT_NOT_RECONCILED')));assert.deepEqual(calls.map(row=>row.run_id),f.frames.map(row=>row.run_id));assert.deepEqual(f.db.db.prepare('SELECT * FROM business_month_publications').get(),publication);
 assert.equal((await runBusinessReconciliation(f.env,source,{month},{now:f.now})).status,'RETRY_WAIT');assert.equal(calls.length,2);
});

test('a failure preserves the last validated source report, original observation time and a bounded retry deadline',async t=>{
 const f=await fixture(t),good=async(_,input)=>report(f.frames.find(frame=>frame.run_id===input.run_id));await runBusinessReconciliation(f.env,good,{month},{now:f.now});await runBusinessReconciliation(f.env,good,{month},{now:f.now});const before=stored(f);f.clock.time+=901000;
 const failed=await runBusinessReconciliation(f.env,async()=>({schema:'finance_reconciliation_unavailable_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_RECONCILIATION_TIMEOUT',http:504,private_message:'PRIVATE_PROVIDER'}}),{month},{now:f.now});assert.equal(failed.status,'UNAVAILABLE');assert.equal(failed.repeat,false);const value=await readBusinessReconciliation(f.env,{month},{now:f.now});assert.equal(value.status,'CHECKED');assert.deepEqual(stored(f).reports,before.reports);assert.deepEqual(value.reports.map(row=>row.checked_at),[stamp,stamp]);assert.equal(value.attempts[0].code,'FINANCE_RECONCILIATION_TIMEOUT');assert.equal(value.attempts[0].next_attempt_at,stamp+1201);assert.ok(value.pending.includes('SOURCE_UNAVAILABLE'));assert.doesNotMatch(JSON.stringify(value),/PRIVATE_PROVIDER|order_sn|access_token/);
});

test('a new publication does not inherit reports from a different source cohort and poisoned identities or totals cannot enter the cache',async t=>{
 const f=await fixture(t);await runBusinessReconciliation(f.env,async()=>report(f.frames[0]),{month},{now:f.now});const before=stored(f).reports;
 const poison=report(f.frames[1]);poison.adjustments.base_repass_cents=8100;poison.adjustments.after_adjustment_repass_cents=8200;assert.ok(projectReconciliationFrame(poison));const result=await runBusinessReconciliation(f.env,async()=>poison,{month},{now:f.now});assert.equal(result.status,'UNAVAILABLE');assert.deepEqual(stored(f).reports,before);assert.equal(stored(f).attempts.at(-1).code,'FINANCE_RECONCILIATION_SCOPE_MISMATCH');
 await f.publish(11,10);const next=await readBusinessReconciliation(f.env,{month},{now:f.now});assert.equal(next.source_revision,11);assert.equal(next.status,'RUNNING');assert.equal(next.reports.length,0);assert.equal(next.attempts.length,0);assert.deepEqual(stored(f).reports,before);
});

test('pause and concurrent leases never create another private request, including a pause during the source response',async t=>{
 const f=await fixture(t);let calls=0,enabled=false;
 const source=async()=>{calls++;return report(f.frames[0]);};assert.equal((await runBusinessReconciliation(f.env,source,{month},{now:f.now,canRun:async()=>enabled})).status,'PAUSED');assert.equal(calls,0);
 enabled=true;let enter,release;const entered=new Promise(resolve=>enter=resolve),held=new Promise(resolve=>release=resolve),running=runBusinessReconciliation(f.env,async()=>{calls++;enter();await held;return report(f.frames[0]);},{month},{now:f.now,canRun:async()=>enabled});await entered;
 assert.equal((await runBusinessReconciliation(f.env,source,{month},{now:f.now})).status,'LEASED');assert.equal(calls,1);enabled=false;release();assert.equal((await running).status,'PAUSED');assert.deepEqual(stored(f),{reports:[],attempts:[]});assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM business_reconciliation_leases').get().n,0);
});

test('an eligible stale pre-claim observation is rechecked under its lease and cannot replay a completed step',async t=>{
 const f=await fixture(t);let calls=0;const source=async(_,input)=>{calls++;return report(f.frames.find(frame=>frame.run_id===input.run_id));};
 f.db.beforeClaim=async()=>{await runBusinessReconciliation(f.env,source,{month},{now:f.now});await runBusinessReconciliation(f.env,source,{month},{now:f.now});};
 const result=await runBusinessReconciliation(f.env,source,{month},{now:f.now});assert.equal(result.status,'RETRY_WAIT');assert.equal(result.source_reads,0);assert.equal(calls,2);
});

test('the owner projector is self-contained, detached, strict about source scope and never invokes accessors',async t=>{
 const f=await fixture(t);await runBusinessReconciliation(f.env,async()=>report(f.frames[0]),{month},{now:f.now});const value=await readBusinessReconciliation(f.env,{month},{now:f.now}),projected=projectBusinessReconciliation(value,projectReconciliationFrame);assert.ok(projected);projected.sources[0].run_id=uuid(99);assert.equal(value.sources[0].run_id,f.frames[0].run_id);
 const context=vm.createContext({serialized:JSON.stringify(value)});vm.runInContext(projectReconciliationFrame.toString()+'\n'+projectBusinessReconciliation.toString()+'\nglobalThis.output=projectBusinessReconciliation(JSON.parse(serialized),projectReconciliationFrame);',context);assert.deepEqual(JSON.parse(JSON.stringify(context.output)),value);
 for(const mutate of [row=>row.private_serial='PRIVATE',row=>row.sources[0].source_revision++,row=>row.reports[0].start_date='2026-10-02',row=>row.attempts[0].code='PRIVATE_TOKEN',row=>row.reports.push(row.reports[0])]){const wrong=structuredClone(value);mutate(wrong);assert.equal(projectBusinessReconciliation(wrong,projectReconciliationFrame),null);}
 let accessed=false;const malicious={...value};Object.defineProperty(malicious,'reports',{get(){accessed=true;throw Error();},enumerable:true});assert.equal(projectBusinessReconciliation(malicious,projectReconciliationFrame),null);assert.equal(accessed,false);
});

test('only unattempted return details request a near continuation; provider waits and denied permission retain their cooldowns',async t=>{
 for(const [diagnostic,permission,delay,repeat] of [['DETAILS_PENDING','UNKNOWN',60,true],['RATE_LIMIT','UNKNOWN',300,false],['PERMISSION_DENIED','DENIED',21600,false]]){
  const f=await fixture(t),source=async(_,input)=>{const value=report(f.frames.find(row=>row.run_id===input.run_id));value.status=permission==='DENIED'?'BLOCKED':'PARTIAL';value.source_checked_at.returns_oldest_at=null;value.source_checked_at.returns_latest_at=null;value.returns={reference_count:1,checked_count:0,pending_count:1,known_requested_refund_cents:0,requested_amount_complete:false,permission};value.cases=value.cases.map(row=>({...row,status:'PENDING',checked_at:null,requested_refund_cents:null,diagnostic}));value.pending=['RETURN_DETAILS_PENDING',...(permission==='DENIED'?['RETURN_PERMISSION_REQUIRED']:[]),'RETURN_VALUES_UNVERIFIED','SETTLEMENT_NOT_RECONCILED'];assert.ok(projectReconciliationFrame(value));return value;};
  await runBusinessReconciliation(f.env,source,{month},{now:f.now});const result=await runBusinessReconciliation(f.env,source,{month},{now:f.now});assert.equal(result.repeat,repeat);const value=await readBusinessReconciliation(f.env,{month},{now:f.now});assert.equal(value.status,'PARTIAL');assert.ok(value.attempts.every(row=>row.next_attempt_at===stamp+delay));
 }
});

test('a genuinely empty published source does not invent order observations or require a return lookup',async t=>{
 const f=await fixture(t,{published:false}),frames=[sourceFrame(0),sourceFrame(1)];for(const frame of frames){frame.coverage=Object.fromEntries(Object.keys(frame.coverage).map(key=>[key,0]));frame.items=[];frame.source_checked_at={oldest_at:frame.cutoff_at,latest_at:frame.checked_at};for(const key of ['known_sales_base_raw','sales_base_raw','known_expected_repass_raw','expected_repass_raw'])frame[key]='0';frame.invoice_tax={...frame.invoice_tax,covered_orders:0,known_base_raw:'0',known_tax_raw:'0'};assert.ok(projectBusinessPeriodFrame(frame));}
 const payload={start_date:month+'-01',end_date:month+'-25',slots:frames.map(frame=>({start_date:frame.start_date,end_date:frame.end_date,frame}))},row={revision:1,payload:JSON.stringify(payload),created_at:stamp-60,updated_at:stamp};f.db.db.prepare('INSERT INTO business_month_runs VALUES(?,?,?,?,?)').run(month,1,row.payload,row.created_at,row.updated_at);assert.ok(await saveCompletedBusinessMonth(f.env,month,{row,payload,complete:true},{now:f.now}));
 const source=async(_,input)=>{const frame=report(frames.find(row=>row.run_id===input.run_id));frame.coverage=Object.fromEntries(Object.keys(frame.coverage).map(key=>[key,0]));frame.adjustments={reported_orders:0,missing_orders:0,conflicting_orders:0,known_adjustment_cents:0,base_repass_cents:0,after_adjustment_repass_cents:0};frame.returns={reference_count:0,checked_count:0,pending_count:0,known_requested_refund_cents:0,requested_amount_complete:true,permission:'UNKNOWN'};frame.source_checked_at={finance_oldest_at:null,finance_latest_at:null,returns_oldest_at:null,returns_latest_at:null};frame.cases=[];frame.truncation={truncated:false,cases_total:0,cases_included:0};frame.pending=['SETTLEMENT_NOT_RECONCILED'];assert.ok(projectReconciliationFrame(frame));return frame;};
 await runBusinessReconciliation(f.env,source,{month},{now:f.now});await runBusinessReconciliation(f.env,source,{month},{now:f.now});const view=await readBusinessReconciliation(f.env,{month},{now:f.now});assert.equal(view.status,'CHECKED');assert.ok(view.reports.every(frame=>frame.coverage.orders===0&&frame.returns.reference_count===0&&frame.pending.includes('SETTLEMENT_NOT_RECONCILED')));
});

test('saved review sidecars share the published cohort while default observations retain the exact v1 contract',async t=>{
 const f=await fixture(t,{withReview:true}),publication=f.db.db.prepare('SELECT * FROM business_month_publications').get();let calls=0;
 const source=async(_,input)=>{calls++;const selected=f.frames.find(frame=>frame.run_id===input.run_id);return selected===f.frames[0]?reviewEvidence(selected):report(selected);};
 await runBusinessReconciliation(f.env,source,{month},{now:f.now});await runBusinessReconciliation(f.env,source,{month},{now:f.now});assert.equal(calls,2);
 const legacy=await readBusinessReconciliation(f.env,{month},{now:f.now}),before=stored(f),changes=f.db.db.prepare('SELECT total_changes() AS n').get().n;
 const value=await readBusinessReconciliationEvidence(f.env,{month},{now:f.now});assert.ok(projectBusinessReconciliationEvidence(value,evidenceValidators));assert.deepEqual(value.report,legacy);assert.equal(value.reviews.length,1);assert.equal(value.reviews[0].run_id,f.frames[0].run_id);assert.equal(value.reviews[0].source_revision,f.frames[0].revision);assert.equal(value.reviews[0].review.summary.orders,2);assert.equal(value.report.reports[0].coverage.paid_orders,1);assert.equal(value.report.reports[0].coverage.return_orders,1);
 assert.deepEqual(value.reviews[0].review.orders.map(row=>row.status),['IN_CANCEL','TO_RETURN']);assert.ok(value.report.reports.every(row=>row.schema==='finance_reconciliation_v1'));assert.ok(!JSON.stringify(legacy).includes('finance_review_orders_v1'));assert.deepEqual(await readBusinessReconciliation(f.env,{month},{now:f.now}),legacy);
 assert.equal(f.db.db.prepare('SELECT total_changes() AS n').get().n,changes);assert.deepEqual(stored(f),before);assert.equal(calls,2);assert.deepEqual(f.db.db.prepare('SELECT * FROM business_month_publications').get(),publication);
 const context=vm.createContext({serialized:JSON.stringify(value),TextEncoder});vm.runInContext(projectReconciliationFrame.toString()+'\n'+projectReconciliationEvidenceFrame.toString()+'\n'+projectBusinessReconciliation.toString()+'\n'+projectBusinessReconciliationEvidence.toString()+'\nglobalThis.output=projectBusinessReconciliationEvidence(JSON.parse(serialized),{projectBusiness:projectBusinessReconciliation,projectFrame:projectReconciliationFrame,projectEvidenceFrame:projectReconciliationEvidenceFrame});',context);assert.deepEqual(JSON.parse(JSON.stringify(context.output)),value);
 const projected=projectBusinessReconciliationEvidence(value,evidenceValidators);projected.reviews[0].review.orders[0].status='UNKNOWN_STATUS';assert.equal(value.reviews[0].review.orders[0].status,'IN_CANCEL');
});

test('review evidence rejects foreign revisions, unknown fields and stale publication detail without initiating a second read',async t=>{
 const f=await fixture(t,{withReview:true});await runBusinessReconciliation(f.env,async()=>reviewEvidence(f.frames[0]),{month},{now:f.now});const value=await readBusinessReconciliationEvidence(f.env,{month},{now:f.now});
 for(const change of [v=>v.private_token='PRIVATE',v=>v.reviews[0].source_revision++,v=>v.reviews[0].run_id=uuid(99),v=>v.reviews.push(v.reviews[0]),v=>v.reviews[0].review.orders[0].order_sn='PRIVATE',v=>v.reviews[0].review.summary.orders++,v=>v.reviews[0].review.orders[1].pending_cases=1]){const invalid=structuredClone(value);change(invalid);assert.equal(projectBusinessReconciliationEvidence(invalid,evidenceValidators),null);}
 let invoked=false;const malicious={...value};Object.defineProperty(malicious,'reviews',{enumerable:true,get(){invoked=true;throw Error('private accessor');}});assert.equal(projectBusinessReconciliationEvidence(malicious,evidenceValidators),null);assert.equal(invoked,false);
 const before=stored(f).reports;let calls=0;const invalid=reviewEvidence(f.frames[1]);invalid.review.summary.orders=1;const result=await runBusinessReconciliation(f.env,async()=>{calls++;return invalid;},{month},{now:f.now});assert.equal(result.status,'UNAVAILABLE');assert.equal(calls,1);assert.deepEqual(stored(f).reports,before);
 await f.publish(11,10);const replaced=await readBusinessReconciliationEvidence(f.env,{month},{now:f.now});assert.equal(replaced.report.source_revision,11);assert.deepEqual(replaced.report.reports,[]);assert.deepEqual(replaced.reviews,[]);assert.deepEqual(stored(f).reports,before);
});

test('an unavailable review response preserves the last validated details and their original source times',async t=>{
 const f=await fixture(t,{withReview:true});await runBusinessReconciliation(f.env,async()=>reviewEvidence(f.frames[0]),{month},{now:f.now});await runBusinessReconciliation(f.env,async()=>report(f.frames[1]),{month},{now:f.now});const before=await readBusinessReconciliationEvidence(f.env,{month},{now:f.now});f.clock.time+=901000;
 const result=await runBusinessReconciliation(f.env,async()=>({schema:'finance_reconciliation_unavailable_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_RECONCILIATION_TIMEOUT',http:504}}),{month},{now:f.now});assert.equal(result.status,'UNAVAILABLE');const after=await readBusinessReconciliationEvidence(f.env,{month},{now:f.now});assert.deepEqual(after.reviews,before.reviews);assert.deepEqual(after.report.reports,before.report.reports);assert.ok(after.report.pending.includes('SOURCE_UNAVAILABLE'));assert.equal(after.reviews[0].review.orders[0].source_checked_at,stamp-1);
});
