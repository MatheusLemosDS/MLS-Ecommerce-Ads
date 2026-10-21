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
function withDiagnostic(product,axes=[{name:'Tamanho',options:['M'],option_count:1}],code='OPTION_NOT_RECOGNIZED'){
 const model_count=product.bindings.length+product.unresolved_count;
 return {...product,diagnostic:{axes,model_count,reasons:model_count
  ?product.unresolved_count?[{code,count:product.unresolved_count}]:[]
  :[{code:'NO_MODELS',count:0}]}};
}
const state=env=>({row:env.ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_state').get(),audit:env.ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_audit ORDER BY revision').all()});
const failure=(code,status=400)=>error=>error.message===code&&error.status===status;

test('known operator products and new products synchronize in bounded unit batches without any per-variation confirmation',async()=>{
 const env=await fixture(),calls=[];
 const getCatalog=async(actual,selection)=>{assert.equal(actual,env);calls.push(selection);return catalog(selection.item_ids,selection.selling_unit==='AUTO'?single:selection.selling_unit||kit);};
 const candidates=[candidate('58269212782'),candidate('22199878767'),candidate('999')];
 let result=await syncVariantBindings(env,{revision:1,candidates},'admin',getCatalog);
 assert.deepEqual(calls,[{item_ids:['22199878767'],selling_unit:single}]);assert.equal(result.remaining_known,2);assert.deepEqual(result.pending_type,[]);assert.deepEqual(result.processed,['22199878767']);assert.equal(result.state.revision,2);
 assert.deepEqual(result.state.bindings[0],{item_id:'22199878767',model_id:'0',size:'M',selling_unit:single,operator_confirmed:false,source:'CATALOG_SIZE_AXIS',catalog_fingerprint:fingerprint});
 result=await syncVariantBindings(env,{revision:2,candidates:candidates.filter(row=>row.item_id!=='22199878767')},'admin',getCatalog);
 assert.deepEqual(calls[1],{item_ids:['58269212782']});assert.equal(result.remaining_known,1);assert.deepEqual(result.pending_type,[]);assert.equal(result.state.bindings[1].source,'CATALOG_VARIATION_AXES');assert.equal(result.state.revision,3);
 result=await syncVariantBindings(env,{revision:3,candidates:[candidate('999')]},'admin',getCatalog);
 assert.deepEqual(calls[2],{item_ids:['999'],selling_unit:'AUTO'});assert.equal(result.remaining_known,0);assert.deepEqual(result.pending_type,[]);assert.equal(result.state.bindings[0].source,'CATALOG_SIZE_AXIS');assert.equal(result.state.revision,4);
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

test('empty selection and mixed saved physical compositions do not call catalogue or write state',async()=>{
 const env=await fixture([manual('8','1'),manual('8','2',single)]);let calls=0;const getCatalog=()=>{calls++;throw Error('must not call');};
 const before=state(env);
 assert.deepEqual((await syncVariantBindings(env,{revision:1,candidates:[]},'admin',getCatalog)).processed,[]);
 const result=await syncVariantBindings(env,{revision:1,candidates:[candidate('8','3')]},'admin',getCatalog);
 assert.deepEqual(result.pending_type,['8']);assert.equal(result.remaining_known,0);assert.equal(calls,0);assert.deepEqual(state(env),before);
});

test('AUTO mixed catalogue is saved atomically and ambiguous processed products do not loop or guess costs',async()=>{
 const env=await fixture(),calls=[],candidates=['10','20','30','40'].map(item_id=>candidate(item_id));
 const result=await syncVariantBindings(env,{revision:1,candidates},'admin',async(_,selection)=>{
  calls.push(selection);return {schema:'variant_catalog_v1',checked_at:1792510733,products:[catalog(['10'],single).products[0],catalog(['20'],kit).products[0],{item_id:'30',catalog_fingerprint:fingerprint,bindings:[],unresolved_count:5}]};
 });
 assert.deepEqual(calls,[{item_ids:['10','20','30'],selling_unit:'AUTO'}]);assert.deepEqual(result.processed,['10','20','30']);assert.equal(result.remaining_known,1);assert.deepEqual(result.pending_type,['30']);assert.equal(result.state.revision,2);
 assert.deepEqual(result.state.bindings.map(row=>[row.item_id,row.selling_unit]),[['10',single],['20',kit]]);assert.equal(state(env).audit.length,2);
 const next=await syncVariantBindings(env,{revision:2,candidates:candidates.filter(row=>!result.processed.includes(row.item_id))},'admin',async(_,selection)=>catalog(selection.item_ids,single));
 assert.deepEqual(next.processed,['40']);assert.equal(next.remaining_known,0);assert.deepEqual(next.pending_type,[]);
});

test('only processed products still pending return a projected catalogue review, including missing requested models',async()=>{
 const env=await fixture(),candidates=['10','20','30','40'].map(item_id=>candidate(item_id,'9'));
 const raw={schema:'variant_catalog_v1',checked_at:1792510733,products:[
  withDiagnostic(catalog(['10'],single,['9']).products[0]),
  withDiagnostic({item_id:'20',catalog_fingerprint:fingerprint,bindings:[],unresolved_count:1},[{name:'Modelo',options:['Único'],option_count:1}],'AXES_NOT_RECOGNIZED'),
  withDiagnostic({item_id:'30',catalog_fingerprint:fingerprint,bindings:[],unresolved_count:0},[]),
 ]};
 const expected=structuredClone(raw);expected.products.shift();
 const result=await syncVariantBindings(env,{revision:1,candidates},'admin',async()=>raw);
 assert.deepEqual(result.processed,['10','20','30']);assert.equal(result.remaining_known,1);assert.deepEqual(result.pending_type,['20','30']);
 assert.deepEqual(result.catalog_review,expected);assert.equal(result.state.revision,2);
 assert.deepEqual(result.state.bindings.map(row=>row.item_id),['10']);
 assert.equal(JSON.stringify(state(env)).includes('diagnostic'),false);
 assert.equal(JSON.stringify(state(env)).includes('Único'),false);
 // Projection also separates safe review data from the provider's objects.
 raw.products[1].diagnostic.axes[0].options[0]='changed';
 assert.equal(result.catalog_review.products[0].diagnostic.axes[0].options[0],'Único');
 result.catalog_review.products[0].diagnostic.axes[0].options[0]='local edit';
 assert.deepEqual(await readVariantBindings(env),result.state);
});

test('ambiguous review keeps manual bindings and no-op state unchanged while processed IDs advance the queue',async()=>{
 const env=await fixture([manual('30','0',single)]),before=state(env),candidates=[candidate('30'),candidate('30','1'),candidate('40')],calls=[];
 const product=withDiagnostic({...catalog(['30'],single).products[0],bindings:[{item_id:'30',model_id:'0',size:'G'}],unresolved_count:1},[{name:'Tamanho',options:['G','XL'],option_count:2}]);
 const result=await syncVariantBindings(env,{revision:1,candidates},'admin',async(_,selection)=>{
  calls.push(selection);return {schema:'variant_catalog_v1',checked_at:1792510733,products:[product]};
 });
 assert.deepEqual(result.catalog_review.products,[product]);assert.deepEqual(result.state.bindings,[manual('30','0',single)]);
 assert.equal(result.state.revision,1);assert.deepEqual(state(env),before);assert.deepEqual(result.processed,['30']);assert.deepEqual(result.pending_type,['30']);assert.equal(result.remaining_known,1);
 const remaining=candidates.filter(row=>!result.processed.includes(row.item_id));
 const next=await syncVariantBindings(env,{revision:1,candidates:remaining},'admin',async(_,selection)=>{
  calls.push(selection);return {schema:'variant_catalog_v1',checked_at:1792510733,products:[withDiagnostic(catalog(selection.item_ids,single).products[0])]};
 });
 assert.deepEqual(calls,[{item_ids:['30'],selling_unit:single},{item_ids:['40'],selling_unit:'AUTO'}]);
 assert.deepEqual(next.processed,['40']);assert.equal(next.remaining_known,0);assert.deepEqual(next.pending_type,[]);
 assert.deepEqual(Object.keys(next),['state','remaining_known','pending_type','processed']);
 assert.deepEqual(next.state.bindings.find(row=>row.item_id==='30'),manual('30','0',single));
});

test('review diagnostics reject extra or inconsistent provider data before any otherwise valid binding is saved',async()=>{
 const env=await fixture(),before=state(env),body={revision:1,candidates:[candidate('10'),candidate('20')]};
 const base={schema:'variant_catalog_v1',checked_at:1792510733,products:[
  catalog(['10'],single).products[0],
  withDiagnostic({item_id:'20',catalog_fingerprint:fingerprint,bindings:[],unresolved_count:1}),
 ]};
 const mutations=[
  frame=>{frame.products[1].diagnostic.private_token='PRIVATE_TOKEN';},
  frame=>{frame.products[1].diagnostic.axes[0].buyer='PRIVATE_BUYER';},
  frame=>{frame.products[1].diagnostic.reasons[0].message='PRIVATE_ERROR';},
  frame=>{frame.products[1].diagnostic.axes[0].options.extra='PRIVATE_OPTION';},
  frame=>{frame.products[1].diagnostic.model_count=2;},
  frame=>{frame.products[1].diagnostic.reasons[0].count=2;},
  frame=>{frame.products[1].diagnostic.axes[0].options[0]='M\nPRIVATE';},
 ];
 for(const mutate of mutations){
  const frame=structuredClone(base);mutate(frame);
  await assert.rejects(syncVariantBindings(env,body,'admin',async()=>frame),failure('VARIANT_CATALOG_UNAVAILABLE',503));
  assert.deepEqual(state(env),before);
 }
 let getters=0;const frame=structuredClone(base);
 Object.defineProperty(frame.products[1].diagnostic,'axes',{get(){getters++;return [];},enumerable:true});
 await assert.rejects(syncVariantBindings(env,body,'admin',async()=>frame),failure('VARIANT_CATALOG_UNAVAILABLE',503));
 assert.equal(getters,0);assert.deepEqual(state(env),before);
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
