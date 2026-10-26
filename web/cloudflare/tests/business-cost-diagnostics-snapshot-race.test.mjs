import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFixture} from './business-collection-fixture.mjs';
import {BUSINESS_SYNC_SCHEMA} from '../src/business-sync.mjs';
import {BACKGROUND_LANE_SCHEMA} from '../src/historical-cost-orchestration.mjs';
import {readBusinessMonthDisplay} from '../src/business-month.mjs';
import {completedBusinessMonthPublicationStatements,readCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {readBusinessCostDiagnosticsEvidenceV2,readBusinessCostDiagnosticsEvidenceV3} from '../src/business-cost-diagnostics.mjs';

const month='2026-10';
const sourceCalls=f=>Object.fromEntries(['finance','ads','list','detail','payment'].map(key=>[key,f.calls[key].length]));
const evidenceBatch=statements=>statements.some(statement=>statement.sql?.includes('SELECT item_id,diagnostic,checked_at,failure_count FROM catalog_classification_source_diagnostics'));

async function fixture(t){
 const f=await collectionFixture({allPaid:true,windowCounts:[2,0],paymentDelayMs:0});
 t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 let frame=await f.invoke('start');
 for(let index=0;frame.status==='RUNNING'&&index<10;index++)frame=await f.invoke('step');
 assert.equal(frame.status,'COMPLETE');await f.invoke('ads');
 await f.env.ADMIN_DB.batch([...BUSINESS_SYNC_SCHEMA,...BACKGROUND_LANE_SCHEMA].map(sql=>f.env.ADMIN_DB.prepare(sql)));
 f.env.ADMIN_DB.db.prepare("UPDATE variant_bindings_state SET revision=revision+1,payload='[]' WHERE id=1").run();
 const displayed=await readBusinessMonthDisplay(f.env,{month},{now:f.now});
 assert.equal(displayed.display_source,'PUBLISHED');assert.equal(displayed.display.unmapped_variants.length,2);
 // Warm the same existing local readers before measuring or injecting a race.
 const initial=await readBusinessCostDiagnosticsEvidenceV3(f.env,{month},{now:f.now});
 assert.deepEqual(initial.audit_scope,displayed.audit_scope);
 return {...f,displayed,initial};
}

function beforeEvidence(f,callback){
 const db=f.env.ADMIN_DB,batch=db.batch.bind(db);let fired=0;
 db.batch=async statements=>{
  if(fired===0&&evidenceBatch(statements)){fired++;await callback();}
  return batch(statements);
 };
 return {fired:()=>fired,restore:()=>{db.batch=batch;}};
}

// Simulate a scheduler's atomic local publication, with independently named
// source runs but identical dates, counts, money and source clocks. No source
// API is called: the immutable replacement frames are prepared before the read.
async function replacement(f){
 const db=f.env.ADMIN_DB,published=await readCompletedBusinessMonth(f.env,month,{now:f.now});
 const payload=structuredClone(published.payload);
 for(const slot of payload.slots)slot.frame.run_id=crypto.randomUUID();
 const storedPayload={...payload,slots:payload.slots.map(slot=>({...slot,frame:{schema:'business_month_frame_ref_v1',run_id:slot.frame.run_id,revision:slot.frame.revision}}))};
 const row={revision:published.row.revision+1,payload:JSON.stringify(storedPayload),created_at:published.row.created_at,updated_at:published.row.updated_at};
 const observed={row,storedPayload,payload,complete:true};
 const writes=[
  db.prepare('UPDATE business_month_runs SET revision=?,payload=?,created_at=?,updated_at=? WHERE month=? AND revision=?').bind(row.revision,row.payload,row.created_at,row.updated_at,month,published.row.revision),
  ...payload.slots.map((slot,index)=>db.prepare('UPDATE business_month_frames SET run_id=?,revision=?,payload=? WHERE month=? AND slot_index=?').bind(slot.frame.run_id,slot.frame.revision,JSON.stringify(slot.frame),month,index)),
  ...completedBusinessMonthPublicationStatements(db,month,observed,{now:f.now}),
 ];
 return {observed,publish:async()=>{const result=await db.batch(writes);assert.equal(result[0].meta.changes,1);assert.equal(result[1+payload.slots.length].meta.changes,1);}};
}

test('a publication replaced during a diagnostic keeps the captured A scope and amounts while the background honestly reports B',async t=>{
 const f=await fixture(t),next=await replacement(f),before=sourceCalls(f),injection=beforeEvidence(f,next.publish);
 let value;try{value=await readBusinessCostDiagnosticsEvidenceV3(f.env,{month},{now:f.now});}finally{injection.restore();}
 assert.equal(injection.fired(),1);
 assert.equal(value.display_source,'PUBLISHED');assert.deepEqual(value.audit_scope,f.displayed.audit_scope);
 assert.deepEqual(value.diagnostic.totals,f.initial.diagnostic.totals);assert.deepEqual(value.diagnostic.coverage,f.initial.diagnostic.coverage);
 assert.deepEqual(value.diagnostic.products,f.initial.diagnostic.products);assert.equal(value.diagnostic.consistent,true);
 assert.equal(value.background.cohort.revision,next.observed.row.revision);
 assert.notEqual(value.background.cohort.revision,value.audit_scope.publication_revision,'background work is not the identity of the displayed publication');
 const later=await readBusinessMonthDisplay(f.env,{month},{now:f.now});
 assert.equal(later.audit_scope.publication_revision,next.observed.row.revision);
 assert.deepEqual(later.display.coverage,f.displayed.display.coverage);assert.equal(later.display.expected_repass_cents,f.displayed.display.expected_repass_cents);
 assert.notDeepEqual(later.audit_scope.sources,value.audit_scope.sources,'coincident amounts must not make the two runs interchangeable');
 assert.deepEqual(sourceCalls(f),before,'diagnostic, background and publication reads must not recollect Finance, Ads or order APIs');
});

test('a concurrent cost edit is reported against the captured publication without replacing its pricing revision or releasing a mixed balance',async t=>{
 const f=await fixture(t),before=sourceCalls(f),injection=beforeEvidence(f,()=>{
  const db=f.env.ADMIN_DB.db,row=db.prepare('SELECT payload FROM production_costs_state WHERE id=1').get(),costs=JSON.parse(row.payload);
  costs.inclusive_regular_cents+=1;db.prepare('UPDATE production_costs_state SET revision=revision+1,payload=? WHERE id=1').run(JSON.stringify(costs));
 });
 let value;try{value=await readBusinessCostDiagnosticsEvidenceV3(f.env,{month},{now:f.now});}finally{injection.restore();}
 assert.equal(injection.fired(),1);assert.deepEqual(value.audit_scope,f.displayed.audit_scope);
 assert.equal(value.versions.costs,f.displayed.display.costs_revision);
 assert.equal(value.diagnostic.versions.monthly.costs,f.displayed.display.costs_revision);
 assert.equal(value.diagnostic.versions.current.costs,f.displayed.display.costs_revision+1);
 assert.equal(value.diagnostic.consistent,false);assert.equal(value.recorded_balance.status,'UNAVAILABLE');assert.equal(value.recorded_balance.amount_cents,null);
 assert.deepEqual(value.diagnostic.totals,f.initial.diagnostic.totals,'the displayed prices do not silently adopt an edit made after its snapshot');
 assert.ok(value.diagnostic.products.every(product=>product.variants.every(variant=>variant.recoverable===false)));
 assert.deepEqual(sourceCalls(f),before);
});

test('a stable v3 read uses the exact v2 local read budget and leaves sources and publication untouched',async t=>{
 const f=await fixture(t),db=f.env.ADMIN_DB,before=sourceCalls(f),queries=[];
 const batch=db.batch.bind(db);db.batch=async statements=>{queries.push(statements.map(statement=>statement.sql));return batch(statements);};
 let v2,v3,v2Queries,v3Queries,v2Calls,v3Calls;
 try{
  const first=db.calls;v2=await readBusinessCostDiagnosticsEvidenceV2(f.env,{month},{now:f.now});v2Calls=db.calls-first;v2Queries=queries.splice(0);
  const second=db.calls;v3=await readBusinessCostDiagnosticsEvidenceV3(f.env,{month},{now:f.now});v3Calls=db.calls-second;v3Queries=queries.splice(0);
 }finally{db.batch=batch;}
 assert.equal(v3Calls,v2Calls);assert.deepEqual(v3Queries,v2Queries);
 for(const key of ['diagnostic','history','recorded_balance','background'])assert.deepEqual(v3[key],v2[key]);
 assert.deepEqual(v3.audit_scope,f.displayed.audit_scope);assert.deepEqual(sourceCalls(f),before);
 assert.ok(Buffer.byteLength(JSON.stringify(v3))<=262144);assert.doesNotMatch(JSON.stringify(v3),/PRIVATE_|order_sn|access_token|source_hash/);
});
