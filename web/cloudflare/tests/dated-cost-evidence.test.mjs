import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {DATED_COST_EVIDENCE_SCHEMA,startDatedCostScan,stepDatedCostScan,readDatedCostEvidence,reviewDatedCostEvidence,readApprovedDatedCostIdentitySnapshot,datedCostIdentityForSchedule} from '../src/dated-cost-evidence.mjs';

const month='2026-11',end_date='2026-11-17',at=Date.parse('2026-11-20T18:00:00Z'),now=()=>at;
function frame(request,{more=false,next=null,title='Camiseta adulta',label='Preta M',model='1',checked=Math.floor(at/1000)}={}){return {schema:'historical_variant_evidence_v1',shop_id:1178167501,checked_at:checked,...request,has_more:more,next_cursor:next,coverage:{orders_seen:1,target_orders:1,target_lines:1,target_units:1},evidence_complete:true,products:request.item_ids.map((item_id,index)=>({item_id,variants:index?[]:[{model_id:model,line_count:1,quantity:1,item_names:[title],model_names:[label],missing_item_name_lines:0,missing_model_name_lines:0,status_counts:[{status:'COMPLETED',line_count:1,quantity:1}],conflict:false}]})),omitted:{target_lines:0,target_units:0}};}
async function fixture(t){const db=new D1();t.after(()=>db.db.close());const env={ADMIN_DB:db},input={month,end_date,item_ids:['123']};let scan=await startDatedCostScan(env,input,{now});return {env,db,input,scan,step:async(options={})=>{scan=await stepDatedCostScan(env,{scan_id:scan.scan_id,revision:scan.revision},request=>frame(request,options),{now});return scan;},get current(){return scan;}};}
async function complete(t,options={}){const f=await fixture(t);await f.step(options);await f.step(options);const review=await readDatedCostEvidence(f.env,{month,end_date},{now});return {...f,scan:f.current,review,proposal:review.publications[0]};}
const approval=proposal=>({scan_id:proposal.scan_id,revision:proposal.revision,publication_sha256:proposal.publication_sha256,decision:'APPROVE'});
const identityInput=()=>({month,end_date,items:[{item_id:'123',model_id:'1'}],stamp:Math.floor(at/1000)});

test('new scoped scan retains immutable complete page chain; proposed evidence never autoapproves',async t=>{
 const f=await fixture(t);assert.equal((await startDatedCostScan(f.env,f.input,{now})).scan_id,f.scan.scan_id);
 const first=await f.step();assert.equal(first.status,'RUNNING');assert.equal(first.pages_read,1);assert.equal(first.window_index,1);
 assert.equal((await readDatedCostEvidence(f.env,{month,end_date},{now})).publications.length,0);
 const last=await f.step();assert.equal(last.status,'COMPLETE');assert.equal(last.pages_read,2);
 const dto=await readDatedCostEvidence(f.env,{month,end_date},{now});assert.equal(dto.publications[0].decision,'PROPOSED');assert.equal(dto.publications[0].pairs[0].resolution.kind,'EXACT_COMPOSITION');
 assert.doesNotMatch(JSON.stringify(dto),/cursor|payload|order_sn|buyer|access_token/);
 const snapshot=await readApprovedDatedCostIdentitySnapshot(f.db,identityInput());assert.equal(snapshot.approved_pairs,0);
 for(const table of ['dated_cost_pages','dated_cost_publications']){assert.throws(()=>f.db.db.prepare('UPDATE '+table+' SET payload=payload').run(),/IMMUTABLE/);assert.throws(()=>f.db.db.prepare('DELETE FROM '+table).run(),/IMMUTABLE/);}
 assert.throws(()=>f.db.db.prepare('UPDATE dated_cost_scans SET end_date=?').run('2026-11-18'),/IMMUTABLE/);
});

test('explicit approval binds immutable hash and review CAS; withdrawal preserves old review',async t=>{
 const f=await complete(t),input=approval(f.proposal);await assert.rejects(reviewDatedCostEvidence(f.env,{...input,publication_sha256:'a'.repeat(64)},'synthetic-owner',{now}),/REVISION_CONFLICT/);
 await reviewDatedCostEvidence(f.env,input,'synthetic-owner',{now});await assert.rejects(reviewDatedCostEvidence(f.env,input,'synthetic-owner',{now}),/REVISION_CONFLICT/);
 const snapshot=await readApprovedDatedCostIdentitySnapshot(f.db,identityInput());assert.equal(snapshot.approved_pairs,1);assert.equal(snapshot.publications[0].review_revision,1);
 const scope={...identityInput(),stamp:identityInput().stamp};assert.equal(datedCostIdentityForSchedule(snapshot,scope)[1].results.length,1);assert.equal(datedCostIdentityForSchedule({...snapshot},scope),null);
 assert.equal(datedCostIdentityForSchedule(snapshot,{...scope,end_date:'2026-11-18'}),null);assert.equal(datedCostIdentityForSchedule(snapshot,{...scope,items:[{item_id:'123',model_id:'2'}]}),null);
 await reviewDatedCostEvidence(f.env,{...input,revision:1,decision:'WITHDRAW'},'synthetic-owner',{now});assert.equal((await readApprovedDatedCostIdentitySnapshot(f.db,identityInput())).approved_pairs,0);
 assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM dated_cost_reviews').get().n,2);
 assert.throws(()=>f.db.db.prepare("UPDATE dated_cost_reviews SET decision='APPROVE'").run(),/IMMUTABLE/);
});

test('one source read per step, wrong scope and stale pages cannot advance evidence',async t=>{
 const f=await fixture(t);let calls=0;const request={scan_id:f.scan.scan_id,revision:f.scan.revision};
 await assert.rejects(stepDatedCostScan(f.env,request,input=>{calls++;return frame({...input,end_date:'2026-11-14'});},{now}),/SOURCE_INVALID/);assert.equal(calls,1);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM dated_cost_pages').get().n,0);
 await assert.rejects(stepDatedCostScan(f.env,request,input=>frame(input,{checked:Math.floor(at/1000)-901}),{now}),/SOURCE_INVALID/);
 const cancelled=await stepDatedCostScan(f.env,request,()=>{throw Error('must not call');},{now,canRun:async()=>false});assert.equal(cancelled.pages_read,0);
 const next=await f.step({more:true,next:'opaque-next'});assert.equal(next.window_index,0);
 await assert.rejects(stepDatedCostScan(f.env,{scan_id:next.scan_id,revision:next.revision},input=>frame(input,{more:true,next:'opaque-next'}),{now}),/SOURCE_INVALID/);
 assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM dated_cost_pages').get().n,1);
});

test('incomplete names remain unknown after human approval, and exact month/end/model membership is mandatory',async t=>{
 const f=await complete(t,{label:'Qualquer tamanho'});await reviewDatedCostEvidence(f.env,approval(f.proposal),'synthetic-owner',{now});const value=await readApprovedDatedCostIdentitySnapshot(f.db,identityInput());assert.equal(value.approved_pairs,0);assert.equal(value.conflicting_pairs,1);
 assert.equal((await readApprovedDatedCostIdentitySnapshot(f.db,{...identityInput(),end_date:'2026-11-18'})).approved_pairs,0);
 assert.equal((await readApprovedDatedCostIdentitySnapshot(f.db,{...identityInput(),items:[{item_id:'123',model_id:'99'}]})).approved_pairs,0);
});

test('read paths on cold storage are SELECT only and do not initialize, adopt or approve legacy scans',async t=>{
 const db=new D1();t.after(()=>db.db.close());const prepare=db.prepare.bind(db);db.prepare=sql=>{assert.match(sql,/^SELECT /);return prepare(sql);};
 assert.equal((await readDatedCostEvidence({ADMIN_DB:db},{month,end_date},{now})).state,'UNAVAILABLE');assert.equal((await readApprovedDatedCostIdentitySnapshot(db,identityInput())).state,'UNAVAILABLE');assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table'").get().n,0);
});

test('retained source payload hash mismatch is rejected before a new provider read',async t=>{
 const f=await fixture(t);await f.step();f.db.db.exec('DROP TRIGGER dated_cost_pages_no_update');f.db.db.prepare("UPDATE dated_cost_pages SET payload='{}'").run();let calls=0;
 await assert.rejects(stepDatedCostScan(f.env,{scan_id:f.current.scan_id,revision:f.current.revision},()=>{calls++;},{now}),/STORAGE_INVALID/);assert.equal(calls,0);
});

test('immutable schemas initialize independently and invalid scopes never create tables',async t=>{
 const db=new D1();t.after(()=>db.db.close());await assert.rejects(startDatedCostScan({ADMIN_DB:db},{month,end_date:'2026-11-31',item_ids:['123']},{now}),/REQUEST_INVALID/);assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table'").get().n,0);
 await db.batch(DATED_COST_EVIDENCE_SCHEMA.map(sql=>db.prepare(sql)));assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='trigger'").get().n,8);
});

test('opaque cursor cycle cannot publish or reuse an earlier source page',async t=>{
 const f=await fixture(t);await f.step({more:true,next:'cursor-A'});await f.step({more:true,next:'cursor-B'});let calls=0;
 await assert.rejects(stepDatedCostScan(f.env,{scan_id:f.current.scan_id,revision:f.current.revision},request=>{calls++;return frame(request,{more:true,next:'cursor-A'});},{now}),/CURSOR_LOOP/);assert.equal(calls,1);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM dated_cost_pages').get().n,2);assert.equal((await readDatedCostEvidence(f.env,{month,end_date},{now})).publications.length,0);
});

test('hard page bound blocks further source reads and never truncates a scan into complete evidence',async t=>{
 const f=await fixture(t);let scan=f.scan,calls=0;const read=request=>{calls++;return frame(request,{more:true,next:'cursor-'+calls});};
 for(let index=0;index<128;index++)scan=await stepDatedCostScan(f.env,{scan_id:scan.scan_id,revision:scan.revision},read,{now});
 assert.equal(calls,128);assert.equal(scan.status,'RUNNING');await assert.rejects(stepDatedCostScan(f.env,{scan_id:scan.scan_id,revision:scan.revision},read,{now}),/LIMIT_REACHED/);assert.equal(calls,128);
 const value=await readDatedCostEvidence(f.env,{month,end_date},{now});assert.equal(value.scans[0].status,'LIMIT_REACHED');assert.equal(value.publications.length,0);
});

test('concurrent starters converge on one active scope without overwriting prior completed publications',async t=>{
 const f=await complete(t);const [left,right]=await Promise.all([startDatedCostScan(f.env,f.input,{now}),startDatedCostScan(f.env,f.input,{now})]);assert.equal(left.scan_id,right.scan_id);assert.notEqual(left.scan_id,f.scan.scan_id);assert.equal(f.db.db.prepare("SELECT COUNT(*) AS n FROM dated_cost_scans WHERE status='RUNNING'").get().n,1);assert.equal((await readDatedCostEvidence(f.env,{month,end_date},{now})).publications.length,1);
});

test('pause or authorization loss while source is in flight cannot retain its page or advance the scan',async t=>{
 const f=await fixture(t);let allowed=true,calls=0;const result=await stepDatedCostScan(f.env,{scan_id:f.scan.scan_id,revision:f.scan.revision},request=>{calls++;allowed=false;return frame(request);},{now,canRun:async()=>allowed});assert.equal(calls,1);assert.equal(result.pages_read,0);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM dated_cost_pages').get().n,0);assert.equal(f.db.db.prepare('SELECT lease_token FROM dated_cost_scans').get().lease_token,null);
});

test('the same database cannot lend another shop a scoped scan, approval or dated identity',async t=>{
 const f=await complete(t);await reviewDatedCostEvidence(f.env,approval(f.proposal),'synthetic-owner',{now});const other={ADMIN_DB:f.db,COMMERCIAL_CONTEXT:{profile:{shop_id:999}}};
 assert.equal((await readDatedCostEvidence(other,{month,end_date},{now})).publications.length,0);assert.equal((await readApprovedDatedCostIdentitySnapshot(f.db,{...identityInput(),shop_id:999})).approved_pairs,0);
 await assert.rejects(reviewDatedCostEvidence(other,{...approval(f.proposal),revision:1,decision:'WITHDRAW'},'synthetic-owner',{now}),error=>error.status===403&&error.message==='DATED_COST_SCOPE_MISMATCH');let calls=0;await assert.rejects(stepDatedCostScan(other,{scan_id:f.scan.scan_id,revision:f.scan.revision},()=>{calls++;},{now}),error=>error.status===403);assert.equal(calls,0);
});

test('atomic shared-lease and enabled guards reject a pause or replacement immediately before commit',async t=>{
 for(const lost of [false,true]){
  const f=await fixture(t),token=crypto.randomUUID(),stamp=Math.floor(at/1000);f.db.db.exec('CREATE TABLE background_collection_lane_state(id INTEGER PRIMARY KEY,revision INTEGER,lease_token TEXT,lease_until INTEGER);CREATE TABLE business_sync_state(id INTEGER PRIMARY KEY,enabled INTEGER);INSERT INTO business_sync_state VALUES(1,1)');f.db.db.prepare('INSERT INTO background_collection_lane_state VALUES(1,1,?,?)').run(token,stamp+290);
  const batch=f.db.batch.bind(f.db);let sourceReturned=false,intercepted=false;f.db.batch=async statements=>{if(sourceReturned&&!intercepted){intercepted=true;if(lost)f.db.db.prepare('UPDATE background_collection_lane_state SET revision=2').run();else f.db.db.prepare('UPDATE business_sync_state SET enabled=0').run();}return batch(statements);};
  await assert.rejects(stepDatedCostScan(f.env,{scan_id:f.scan.scan_id,revision:1},request=>{sourceReturned=true;return frame(request);},{now,canRun:async()=>true,backgroundLease:{token,revision:1}}),/REVISION_CONFLICT/);assert.equal(intercepted,true);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM dated_cost_pages').get().n,0);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM dated_cost_publications').get().n,0);assert.equal(f.db.db.prepare('SELECT revision,pages_read FROM dated_cost_scans').get().revision,1);
 }
});
