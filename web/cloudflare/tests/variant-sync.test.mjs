import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {syncVariantBindings} from '../src/variant-sync.mjs';
import {saveVariantBindings,readVariantBindings} from '../src/variant-bindings.mjs';

const kit='ONE_MALE_ONE_FEMALE_KIT',single='SINGLE_GARMENT',fingerprint='a'.repeat(64);
const manual=(item_id,model_id='0',unit=kit)=>({item_id,model_id,...(unit===single?{size:'M'}:{male_size:'M',female_size:'G'}),selling_unit:unit,operator_confirmed:true});
const candidate=(item_id,model_id='0')=>({item_id,model_id});
async function fixture(bindings=[]){
 const env={ADMIN_DB:new D1()};
 env.ADMIN_DB.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT); CREATE TABLE variant_bindings_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,revision INTEGER UNIQUE,payload TEXT,actor TEXT,created_at TEXT);');
 env.ADMIN_DB.db.prepare('INSERT INTO variant_bindings_state VALUES(1,1,?,?)').run(JSON.stringify(bindings),'2026-10-20T12:00:00.000Z');
 env.ADMIN_DB.db.prepare('INSERT INTO variant_bindings_audit(revision,payload,actor,created_at) VALUES(1,?,?,?)').run(JSON.stringify(bindings),'initial','2026-10-20T12:00:00.000Z');
 return env;
}
function catalog(ids,unit=kit,models=['0']){
 return {schema:'variant_catalog_v1',checked_at:1792510733,products:ids.map(item_id=>({item_id,catalog_fingerprint:fingerprint,bindings:models.map(model_id=>({item_id,model_id,...(unit===single?{size:'M'}:{male_size:'M',female_size:'G'})})),unresolved_count:0,...(unit===single?{selling_unit:unit}:{})}))};
}
const state=env=>({row:env.ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_state').get(),audit:env.ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_audit ORDER BY revision').all()});
const failure=(code,status=400)=>error=>error.message===code&&error.status===status;

test('known operator products synchronize in separate bounded unit batches without any per-variation confirmation',async()=>{
 const env=await fixture(),calls=[];
 const getCatalog=async(actual,selection)=>{assert.equal(actual,env);calls.push(selection);return catalog(selection.item_ids,selection.selling_unit||kit);};
 const candidates=[candidate('58269212782'),candidate('22199878767'),candidate('999')];
 let result=await syncVariantBindings(env,{revision:1,candidates},'admin',getCatalog);
 assert.deepEqual(calls,[{item_ids:['22199878767'],selling_unit:single}]);assert.equal(result.remaining_known,1);assert.deepEqual(result.pending_type,['999']);assert.deepEqual(result.processed,['22199878767']);assert.equal(result.state.revision,2);
 assert.deepEqual(result.state.bindings[0],{item_id:'22199878767',model_id:'0',size:'M',selling_unit:single,operator_confirmed:false,source:'CATALOG_SIZE_AXIS',catalog_fingerprint:fingerprint});
 result=await syncVariantBindings(env,{revision:2,candidates:candidates.filter(row=>!result.processed.includes(row.item_id))},'admin',getCatalog);
 assert.deepEqual(calls[1],{item_ids:['58269212782']});assert.equal(result.remaining_known,0);assert.deepEqual(result.pending_type,['999']);assert.equal(result.state.bindings[1].source,'CATALOG_VARIATION_AXES');assert.equal(result.state.revision,3);
});

test('saved consistent composition takes precedence, skips complete models and batches at most three products of one unit',async()=>{
 const env=await fixture([manual('1'),manual('2'),manual('3'),manual('4'),manual('5','0',single),manual('22199878767','0',kit)]),calls=[];
 const candidates=['4','3','2','1','5','22199878767'].map(item_id=>candidate(item_id,'1'));
 const result=await syncVariantBindings(env,{revision:1,candidates},'admin',async(_,selection)=>{calls.push(selection);return catalog(selection.item_ids,kit,['0','1']);});
 assert.deepEqual(calls,[{item_ids:['1','2','3']}]);assert.deepEqual(result.processed,['1','2','3']);assert.equal(result.remaining_known,3);assert.deepEqual(result.state.bindings.filter(row=>['1','2','3'].includes(row.item_id)&&row.model_id==='0'),[manual('1'),manual('2'),manual('3')]);
 const before=state(env);let reads=0;
 const complete=await syncVariantBindings(env,{revision:2,candidates:[candidate('1'),candidate('1','1')]},'admin',()=>{reads++;});
 assert.equal(reads,0);assert.deepEqual(complete,{state:await readVariantBindings(env),remaining_known:0,pending_type:[],processed:[]});assert.deepEqual(state(env),before);
});

test('empty selection and unknown or mixed physical compositions do not call catalogue or write state',async()=>{
 const env=await fixture([manual('8','1'),manual('8','2',single)]);let calls=0;const getCatalog=()=>{calls++;throw Error('must not call');};
 const before=state(env);
 assert.deepEqual((await syncVariantBindings(env,{revision:1,candidates:[]},'admin',getCatalog)).processed,[]);
 const result=await syncVariantBindings(env,{revision:1,candidates:[candidate('8','3'),candidate('20'),candidate('9')]},'admin',getCatalog);
 assert.deepEqual(result.pending_type,['8','9','20']);assert.equal(result.remaining_known,0);assert.equal(calls,0);assert.deepEqual(state(env),before);
});

test('strict canonical candidate input, stale revision and bounded counts reject before provider or database changes',async()=>{
 const env=await fixture();let calls=0;const getCatalog=()=>{calls++;};const before=state(env);
 for(const body of [null,{},[],{revision:1,candidates:[],extra:true},{revision:0,candidates:[]},{revision:2147483647,candidates:[]},{revision:'1',candidates:[]},{revision:1,candidates:[candidate('0')]},{revision:1,candidates:[candidate('01')]},{revision:1,candidates:[candidate('1','01')]},{revision:1,candidates:[candidate('1'),candidate('1')]},{revision:1,candidates:[{...candidate('1'),quantity:1}]},{revision:1,candidates:Array.from({length:1001},(_,i)=>candidate(String(i+1)))}])await assert.rejects(syncVariantBindings(env,body,'admin',getCatalog),failure('VARIANT_SYNC_REQUEST_INVALID'));
 await assert.rejects(syncVariantBindings(env,{revision:2,candidates:[candidate('22199878767')]},'admin',getCatalog),failure('VARIANT_BINDINGS_CHANGED_RELOAD',409));
 assert.equal(calls,0);assert.deepEqual(state(env),before);
 let getters=0;const exotic={revision:1,get candidates(){getters++;return [];}};
 await assert.rejects(syncVariantBindings(env,exotic,'admin',getCatalog),failure('VARIANT_SYNC_REQUEST_INVALID'));assert.equal(getters,0);
});

test('wrong unit, wrong product or provider extras cannot forge associations or expose private error messages',async()=>{
 const env=await fixture(),before=state(env),body={revision:1,candidates:[candidate('22199878767')]};
 const good=catalog(['22199878767'],single);
 for(const frame of [catalog(['22199878767']),catalog(['999'],single),{...good,secret:'PRIVATE_TOKEN'}, {...good,products:[{...good.products[0],buyer:'PRIVATE_BUYER'}]},null])await assert.rejects(syncVariantBindings(env,body,'admin',async()=>frame),failure('VARIANT_CATALOG_UNAVAILABLE',503));
 await assert.rejects(syncVariantBindings(env,body,'admin',async()=>{throw Error('PRIVATE_PROVIDER_FAILURE');}),failure('VARIANT_CATALOG_UNAVAILABLE',503));
 await assert.rejects(syncVariantBindings(env,body,'admin',null),failure('VARIANT_CATALOG_UNAVAILABLE',503));assert.deepEqual(state(env),before);
});

test('ambiguous processed products make queue progress without a no-op revision or repeated model loop',async()=>{
 const env=await fixture(),before=state(env);
 const candidates=[candidate('22199878767'),candidate('58269212782')];
 const result=await syncVariantBindings(env,{revision:1,candidates},'admin',async()=>({schema:'variant_catalog_v1',checked_at:1792510733,products:[{item_id:'22199878767',catalog_fingerprint:fingerprint,bindings:[],unresolved_count:4,selling_unit:single}]}));
 assert.equal(result.state.revision,1);assert.deepEqual(result.processed,['22199878767']);assert.equal(result.remaining_known,1);assert.deepEqual(state(env),before);
 const second=await syncVariantBindings(env,{revision:1,candidates:candidates.filter(row=>!result.processed.includes(row.item_id))},'admin',async(_,selection)=>catalog(selection.item_ids));
 assert.deepEqual(second.processed,['58269212782']);assert.equal(second.remaining_known,0);
});

test('concurrent manual save wins the final CAS and preserves its state and matching audit',async()=>{
 const env=await fixture();
 await assert.rejects(syncVariantBindings(env,{revision:1,candidates:[candidate('22199878767')]},'admin',async()=>{
  await saveVariantBindings(env,{revision:1,bindings:[manual('22199878767','0',single)]},'admin');
  return catalog(['22199878767'],single);
 }),failure('VARIANT_BINDINGS_CHANGED_RELOAD',409));
 const current=await readVariantBindings(env);assert.equal(current.revision,2);assert.deepEqual(current.bindings,[manual('22199878767','0',single)]);assert.equal(state(env).audit.length,2);
});
