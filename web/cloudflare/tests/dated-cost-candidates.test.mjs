import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFixture} from './business-collection-fixture.mjs';
import {readDatedCostCandidates} from '../src/dated-cost-candidates.mjs';
import {startDatedCostScan,stepDatedCostScan,readDatedCostEvidence,reviewDatedCostEvidence} from '../src/dated-cost-evidence.mjs';

async function fixture(t){const f=await collectionFixture({allPaid:true,daily:true,windowCounts:[2,1],paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});let state=await f.invoke('start');for(let n=0;state.status==='RUNNING'&&n<10;n++)state=await f.invoke('step');assert.equal(state.status,'COMPLETE');return f;}
const source=(request,stamp)=>({schema:'historical_variant_evidence_v1',shop_id:1178167501,checked_at:stamp,...request,has_more:false,next_cursor:null,coverage:{orders_seen:3,target_orders:3,target_lines:3,target_units:3},evidence_complete:true,products:request.item_ids.map(item_id=>({item_id,variants:[{model_id:'0',line_count:1,quantity:1,item_names:['Camiseta adulta'],model_names:['M'],missing_item_name_lines:0,missing_model_name_lines:0,status_counts:[{status:'COMPLETED',line_count:1,quantity:1}],conflict:false}]})),omitted:{target_lines:0,target_units:0}});

test('dated selector includes historical gaps even while every pair has current manual/current reference coverage',async t=>{
 const f=await fixture(t),legacy=await f.invoke('read');assert.equal(legacy.production_cost_cents,4770);const calls=structuredClone(f.calls),prepare=f.env.ADMIN_DB.prepare.bind(f.env.ADMIN_DB),sql=[];
 f.env.ADMIN_DB.prepare=value=>{assert.match(value,/^SELECT /);sql.push(value);return prepare(value);};const selected=await readDatedCostCandidates(f.env,{month:'2026-10'},{now:f.now});f.env.ADMIN_DB.prepare=prepare;
 assert.equal(selected.state,'AVAILABLE');assert.equal(selected.pending_pairs,3);assert.equal(selected.pending_units,3);assert.equal(selected.item_ids.length,3);assert.equal(selected.scan,null);assert.equal(selected.end_date,'2026-10-24');assert.ok(sql.every(value=>!value.includes('catalog_classification')&&!value.includes('production_cost_catalog')));assert.deepEqual(f.calls,calls);
});

test('running scan resumes; complete proposed scan awaits human review instead of repeating indefinitely',async t=>{
 const f=await fixture(t),first=await readDatedCostCandidates(f.env,{month:'2026-10'},{now:f.now});let scan=await startDatedCostScan(f.env,{month:first.month,end_date:first.end_date,item_ids:first.item_ids},{now:f.now});
 let selected=await readDatedCostCandidates(f.env,{month:first.month},{now:f.now});assert.deepEqual(selected.scan,{scan_id:scan.scan_id,revision:scan.revision});
 for(let n=0;scan.status==='RUNNING'&&n<3;n++)scan=await stepDatedCostScan(f.env,{scan_id:scan.scan_id,revision:scan.revision},request=>source(request,Math.floor(f.now()/1000)),{now:f.now});
 selected=await readDatedCostCandidates(f.env,{month:first.month},{now:f.now});assert.equal(selected.pending_pairs,3);assert.equal(selected.reason,'REVIEW_REQUIRED');assert.deepEqual(selected.item_ids,[]);assert.equal(selected.scan,null);
 const proposal=(await readDatedCostEvidence(f.env,{month:first.month,end_date:first.end_date},{now:f.now})).publications[0];await reviewDatedCostEvidence(f.env,{scan_id:proposal.scan_id,revision:proposal.revision,publication_sha256:proposal.publication_sha256,decision:'APPROVE'},'synthetic-owner',{now:f.now});selected=await readDatedCostCandidates(f.env,{month:first.month},{now:f.now});assert.equal(selected.pending_pairs,0);assert.equal(selected.pending_units,0);assert.equal(selected.reason,null);assert.deepEqual(selected.item_ids,[]);
});
