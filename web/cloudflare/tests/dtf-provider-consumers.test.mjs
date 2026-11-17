import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {dtfRecipeFixture} from './dtf-recipe-fixture.mjs';
import {readOrderOperationsWorkspace,mutateOrderOperationsWorkspace} from '../src/order-operations.mjs';
import {readIncurredProductionWorkspace,readSavedProductionSourceCandidate} from '../src/incurred-production-workspace.mjs';
import {readProductionConfirmationProposal} from '../src/production-confirmation-proposal.mjs';
const selection={start_date:'2026-11-16',end_date:'2026-11-16',status:'ALL',page:1},period={month:'2026-11',week_of:'2026-11-16'};
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const read=f=>readOrderOperationsWorkspace(f.env,selection,{now:f.now});
const request=frame=>({request_id:crypto.randomUUID(),revision:frame.revision,identity:frame.orders[0].identity,source_hash:frame.orders[0].source_hash,from_stage:frame.orders[0].operation.stage,to_stage:frame.orders[0].operation.stage===null?'SEPARATION':frame.orders[0].operation.stage==='SEPARATION'?'PRODUCTION':'FINISHING',reason:'Synthetic explicit stage confirmation',confirmed:true});
const stage=(f,body)=>mutateOrderOperationsWorkspace(f.env,body,'synthetic-operator',{now:f.now});
const audit=f=>f.db.prepare('SELECT * FROM order_operations_events ORDER BY revision').all();
const production=f=>readIncurredProductionWorkspace(f.env,period,{now:f.now});
const line=f=>f.db.prepare('SELECT * FROM production_dtf_lines').get();
const patch=(f,change)=>{const r=line(f),payload=JSON.stringify(change(JSON.parse(r.payload)));f.db.prepare('UPDATE production_dtf_lines SET payload=?,source_hash=? WHERE unit_key=?').run(payload,hash(payload),r.unit_key);};

test('real kit recipe confirmations preserve commercial order identity and stage while source mutations still require review',async t=>{
 const f=await dtfRecipeFixture({count:1});t.after(f.close);let view=await read(f);await stage(f,request(view));const original=audit(f);
 await f.act(f.body((await f.read()).lines[0]));view=await read(f);
 assert.equal(view.orders[0].can_update,true);assert.deepEqual(view.orders[0].blocked_reasons,[]);assert.equal(view.orders[0].display_stage,'SEPARATION');assert.equal(view.orders[0].operation.lines_changed,false);assert.equal(view.totals.by_stage.SEPARATION,1);assert.equal(view.totals.by_stage.REVIEW,0);assert.equal(view.orders[0].lines[0].sku,'front-10');assert.equal(view.orders[0].selling_units,3);assert.deepEqual(audit(f),original,'a recipe does not declare an order stage or rewrite its evidence');
 await stage(f,request(view));const afterExplicit=audit(f);assert.equal(afterExplicit.length,2);assert.equal(JSON.parse(JSON.parse(afterExplicit[0].lines_json)[0].payload).source_sku,undefined);assert.equal(JSON.parse(JSON.parse(afterExplicit[1].lines_json)[0].payload).source_sku,'front-10','new audit preserves the complete raw recipe payload');
 await f.act(f.body((await f.read()).lines[0],{recipe_sku:'front-10+back-15'}));view=await read(f);assert.equal(view.orders[0].display_stage,'PRODUCTION');assert.equal(view.orders[0].operation.lines_changed,false);assert.equal(view.orders[0].lines[0].sku,'front-10');assert.deepEqual(audit(f),afterExplicit);
 f.state.orders[0].lines[0].quantity=4;f.state.orders[0].update_time++;await f.sync();const changed=await read(f);assert.equal(changed.orders[0].display_stage,'REVIEW');assert.equal(changed.orders[0].operation.lines_changed,true);assert.equal(changed.totals.by_stage.REVIEW,1);assert.equal(changed.orders[0].selling_units,4);await assert.rejects(stage(f,request(view)),{message:'ORDER_OPERATIONS_SOURCE_CHANGED'});assert.deepEqual(audit(f),afterExplicit);
});

test('recipe-aware manufacturing suggestions retain original SKU even for a valid local recipe longer than the identity contract',async t=>{
 const f=await dtfRecipeFixture({count:1});t.after(f.close);const before=await production(f),previous=before.source.candidates[0];assert.equal(before.source.status,'AVAILABLE');
 for(const recipe of ['a'.repeat(70)+'-10+'+'b'.repeat(70)+'-10','é'.repeat(70)+'-10+'+'ç'.repeat(70)+'-10','e\u0301'.repeat(40)+'-10+'+'c\u0327'.repeat(40)+'-10']){assert.ok(recipe.length>128&&recipe.length<=256);await f.act(f.body((await f.read()).lines[0],{recipe_sku:recipe}));const current=await production(f);assert.equal(current.source.status,'AVAILABLE');assert.equal(current.source.included,1);const candidate=current.source.candidates[0];assert.equal(candidate.sku,'front-10');assert.equal(candidate.selling_quantity,3);assert.notEqual(candidate.hash,previous.hash,'source hashes still fence the full current payload');
 await assert.rejects(readSavedProductionSourceCandidate(f.env,{source_key:previous.key,source_hash:previous.hash},{now:f.now}),{message:'INCURRED_PRODUCTION_SOURCE_CHANGED'});
 const proposal=await readProductionConfirmationProposal(f.env,{source_key:candidate.key,source_hash:candidate.hash},{now:f.now});assert.equal(proposal.state,'AVAILABLE');assert.equal(proposal.source.sku,'front-10');assert.equal(proposal.source.selling_quantity,3);assert.equal(proposal.composition.state,'SUGGESTED');assert.equal(current.ledger.records.length,0,'saved print evidence never manufactures a batch automatically');assert.equal((await read(f)).orders[0].can_update,true);
 }
});

test('malformed or tampered recipe extensions cannot bypass original provider evidence or authorize an order stage',async t=>{
 for(const change of [p=>({...p,recipe_request_id:'invalid'}),p=>{delete p.recipe_request_id;return p;},p=>({...p,source_sku:'another-provider-sku'}),p=>({...p,requires_pair:false}),p=>({...p,extra:'PRIVATE_SYNTHETIC'})]){
  const f=await dtfRecipeFixture({count:1});t.after(f.close);await f.act(f.body((await f.read()).lines[0]));const valid=await read(f);patch(f,change);const invalid=await read(f);assert.equal(invalid.orders[0].can_update,false);assert.ok(invalid.orders[0].blocked_reasons.includes('SOURCE_CONFLICT'));await assert.rejects(stage(f,request(valid)),{message:'ORDER_OPERATIONS_SOURCE_CHANGED'});assert.equal(f.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='order_operations_events'").get().n,0);
 }
});

test('a concurrent raw recipe change invalidates the transactional stage fence even when commercial identity is unchanged',async t=>{
 const f=await dtfRecipeFixture({count:1});t.after(f.close);await f.act(f.body((await f.read()).lines[0]));const frame=await read(f),original=f.env.ADMIN_DB.batch.bind(f.env.ADMIN_DB),prepare=f.env.ADMIN_DB.prepare.bind(f.env.ADMIN_DB);let raced=false;f.env.ADMIN_DB.prepare=sql=>Object.assign(prepare(sql),{auditSql:sql});
 f.env.ADMIN_DB.batch=queries=>{if(!raced&&queries.some(q=>q.auditSql.includes('INSERT OR IGNORE INTO order_operations_state'))){raced=true;patch(f,p=>({...p,sku:'front-10+changed-15',recipe_request_id:crypto.randomUUID()}));}return original(queries);};
 await assert.rejects(stage(f,request(frame)),{message:'ORDER_OPERATIONS_SOURCE_CHANGED'});assert.equal(raced,true);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM order_operations_events').get().n,0);assert.equal((await read(f)).revision,0);
});

test('original Unicode and quoted provider SKU keeps exact source proof and stage across a local recipe',async t=>{
 const f=await dtfRecipeFixture({count:1});t.after(f.close);const sku='Coração "coleção"-10';f.state.orders[0].lines[0].sku=sku;f.state.orders[0].update_time++;await f.sync();await stage(f,request(await read(f)));const original=audit(f);
 await f.act(f.body((await f.read()).lines[0]));const current=await read(f);assert.equal(current.orders[0].lines[0].sku,sku);assert.equal(current.orders[0].display_stage,'SEPARATION');assert.equal(current.orders[0].operation.lines_changed,false);assert.equal(current.totals.by_stage.SEPARATION,1);assert.equal(current.orders[0].can_update,true);assert.deepEqual(audit(f),original);
});
