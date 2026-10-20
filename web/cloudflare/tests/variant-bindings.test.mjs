import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch,DEFAULTS} from '../src/admin.mjs';
import {validateVariantBindings,variantMarginReference,readVariantBindings,saveVariantBindings,saveAutomaticVariantBindings} from '../src/variant-bindings.mjs';
import {COST_DEFAULTS,productionCostReference} from '../src/production-costs.mjs';
import {captureObservation,readObservation} from '../src/order-observations.mjs';
import {D1} from './sqlite-d1.mjs';

const base='https://app.example.test';
const binding=(item_id='101',model_id='1',male_size='M',female_size='G')=>({item_id,model_id,male_size,female_size,selling_unit:'ONE_MALE_ONE_FEMALE_KIT',operator_confirmed:true});
const nativeFrame=()=>{const cutoff=new Date(Date.now()-10800000).toISOString().replace('Z','-03:00');return {schema:'shop_order_items_v1',shop_id:1178167501,date:cutoff.slice(0,10),timezone:'America/Sao_Paulo',through_at:cutoff,day_partial:true,pagination_complete:true,pages_read:1,orders_in_api_window:2,orders_with_details:2,duplicate_rows:0,catalog_units:3,rows:[{item_id:'101',model_id:'1',order_status:'READY_TO_SHIP',quantity:2,line_count:1},{item_id:'101',model_id:'2',order_status:'UNPAID',quantity:1,line_count:1}],currency_status:'BRL_ALL_CONFIRMED',currency_counts:{BRL:2,OTHER:0,UNKNOWN:0},source:'shopee_get_order_list_and_detail',transport_http:200,api_error:'NO',count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_NO_STATUS_FILTER',order_status_filter:'NONE',dashboard_counter_reconciled:false,order_status_verified:true};};
async function login(){const env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'fixture-admin-session-1234567890123456',ADMIN_USERNAME:'fixture-admin',ADMIN_PASSWORD:'fixture-password-123456'};const response=await adminFetch(new Request(base+'/admin/login',{method:'POST',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);const cookie=response.headers.get('set-cookie').split(';')[0];const state=await(await call(env,cookie,'state')).json();return {env,cookie,csrf:state.csrf};}
function call(env,cookie,path,body,csrf,services={}){return adminFetch(new Request(base+'/api/admin/'+path,{method:body===undefined?'GET':'POST',headers:{cookie,origin:base,'content-type':'application/json','x-csrf-token':csrf||''},body:body===undefined?undefined:JSON.stringify(body)}),env,services);}
const automatic=(item_id='101',model_id='2',male_size='GG',female_size='G1',catalog_fingerprint='a'.repeat(64))=>({...binding(item_id,model_id,male_size,female_size),operator_confirmed:false,source:'CATALOG_VARIATION_AXES',catalog_fingerprint});
const catalogProduct=(item_id='101',models=[automatic(item_id)],catalog_fingerprint='a'.repeat(64),unresolved_count=0)=>({item_id,catalog_fingerprint,bindings:models.map(({item_id,model_id,male_size,female_size})=>({item_id,model_id,male_size,female_size})),unresolved_count});
const catalog=(products=[catalogProduct()])=>({schema:'variant_catalog_v1',checked_at:1792405689,products});
const bindingError=(message,status=400)=>error=>error.message===message&&error.status===status;
const singleBinding=(item_id='101',model_id='1',size='M')=>({item_id,model_id,size,selling_unit:'SINGLE_GARMENT',operator_confirmed:true});
const singleAutomatic=(item_id='101',model_id='1',size='M',catalog_fingerprint='a'.repeat(64))=>({...singleBinding(item_id,model_id,size),operator_confirmed:false,source:'CATALOG_SIZE_AXIS',catalog_fingerprint});
const singleProduct=(item_id='101',models=[singleAutomatic(item_id)],catalog_fingerprint='a'.repeat(64),unresolved_count=0)=>({item_id,catalog_fingerprint,bindings:models.map(({item_id,model_id,size})=>({item_id,model_id,size})),unresolved_count,selling_unit:'SINGLE_GARMENT'});

test('AUTO atomically stores mixed kit and garment results with exact provenance and manual precedence',async()=>{
 const {env}=await login();
 let state=await saveVariantBindings(env,{revision:1,bindings:[singleBinding('101','1','G3'),binding('201','1','G1','G2')]},'admin');
 const mixed=catalog([singleProduct('101',[singleAutomatic('101','1','P'),singleAutomatic('101','2','M')]),catalogProduct('201',[automatic('201','1','P','P'),automatic('201','2','M','G')]),catalogProduct('301',[],fingerprintForAutoTest(),4)]);
 state=await saveAutomaticVariantBindings(env,{revision:state.revision,item_ids:['101','201','301'],selling_unit:'AUTO'},mixed,'admin');
 assert.deepEqual(state.bindings,[singleBinding('101','1','G3'),singleAutomatic('101','2','M'),binding('201','1','G1','G2'),automatic('201','2','M','G')]);
 assert.equal(state.revision,3);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n,3);
 assert.deepEqual(await saveAutomaticVariantBindings(env,{revision:3,item_ids:['101','201','301'],selling_unit:'AUTO'},mixed,'admin'),state);
 assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n,3);
 const before=state;
 await assert.rejects(saveAutomaticVariantBindings(env,{revision:3,item_ids:['101'],selling_unit:'AUTO'},catalog([catalogProduct('101')]),'admin'),bindingError('VARIANT_BINDING_COMPOSITION_CONFLICT',409));
 assert.deepEqual(await readVariantBindings(env),before);
 const unavailable=await saveAutomaticVariantBindings(env,{revision:3,item_ids:['101'],selling_unit:'AUTO'},catalog([catalogProduct('101',[],fingerprintForAutoTest(),4)]),'admin');
 assert.deepEqual(unavailable.bindings.filter(row=>row.item_id==='101'),[singleBinding('101','1','G3')]);
 assert.equal(unavailable.bindings.some(row=>row.selling_unit==='AUTO'),false);
});
function fingerprintForAutoTest(){return 'b'.repeat(64);}

test('AUTO mixed save rolls back every product when the audit write collides',async()=>{
 const {env}=await login(),before=await readVariantBindings(env);
 env.ADMIN_DB.db.prepare('INSERT INTO variant_bindings_audit(revision,payload,actor,created_at) VALUES(2,?,?,?)').run('[]','fixture','2026-10-20T00:00:00.000Z');
 await assert.rejects(saveAutomaticVariantBindings(env,{revision:1,item_ids:['101','201'],selling_unit:'AUTO'},catalog([singleProduct(),catalogProduct('201')]),'admin'));
 assert.deepEqual(await readVariantBindings(env),before);
});

test('explicit model composition and confirmation required; model0 is exact, unknown inputs never inferred',()=>{
 assert.deepEqual(validateVariantBindings([binding('101','0','G1','G3')]),[binding('101','0','G1','G3')]);
 for(const change of [{item_id:101},{model_id:'01'},{model_id:true},{male_size:'XS'},{female_size:'G4'},{selling_unit:'ONE_SHIRT'},{operator_confirmed:'true'},{title:'PRIVATE'}])assert.throws(()=>validateVariantBindings([{...binding(),...change}]));
 assert.throws(()=>validateVariantBindings([binding(),binding()]));
});
test('two models of one item use distinct margins and catalog quantities, not orders',()=>{
 const frame={status:'AVAILABLE',rows:nativeFrame().rows},cfg={revision:9,values:DEFAULTS};
 const result=variantMarginReference(frame,{revision:3,bindings:[binding(),binding('101','2','GG','G1')]},cfg);
 assert.equal(result.known_subset_cents,5260);assert.equal(result.total_cents,5260);assert.equal(result.settings_revision,9);assert.equal(result.bindings_revision,3);assert.equal(result.mapped_quantity,3);assert.equal(result.economic_status,'UNKNOWN');assert.equal(result.status_scope,'ALL_RETURNED_STATUSES_REFERENCE_ONLY');
 assert.deepEqual(result.variants.map(row=>row.contribution_cents),[3350,1910]);
 const partial=variantMarginReference(frame,{revision:3,bindings:[binding()]},cfg);assert.equal(partial.total_cents,null);assert.equal(partial.known_subset_cents,3350);assert.equal(partial.unmapped_quantity,1);
 assert.equal(variantMarginReference({status:'UNAVAILABLE'}, {revision:3,bindings:[]},cfg),null);
});
test('bindings are admin-only and write denials preserve revisions and audits',async()=>{
 const {env,cookie,csrf}=await login();let reads=0;const services={getOrderItems:async()=>{reads++;return nativeFrame();}};
 assert.equal((await call(env,'','variant-bindings')).status,401);assert.equal((await call(env,'mls_session=review','order-items',undefined,undefined,services)).status,401);assert.equal(reads,0);
 assert.equal((await call(env,cookie,'variant-bindings',{revision:1,bindings:[binding()]})).status,403);
 assert.equal((await call(env,cookie,'variant-bindings',{revision:1,bindings:[{...binding(),secret:'PRIVATE'}]},csrf)).status,400);
 assert.equal((await(await call(env,cookie,'variant-bindings')).json()).revision,1);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n,1);
});
test('save, stale conflicts, empty replacement and audit remain atomic without margin/job changes',async()=>{
 const {env,cookie,csrf}=await login();
 const saved=await(await call(env,cookie,'variant-bindings',{revision:1,bindings:[binding()]},csrf)).json();assert.equal(saved.revision,2);
 assert.equal((await call(env,cookie,'variant-bindings',{revision:1,bindings:[binding('101','2')]},csrf)).status,409);
 const current=await(await call(env,cookie,'variant-bindings')).json();assert.deepEqual(current.bindings,[binding()]);assert.equal(current.revision,2);
 assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n,2);
 assert.equal((await call(env,cookie,'variant-bindings',{revision:2,bindings:[]},csrf)).status,200);
 assert.equal((await(await call(env,cookie,'variant-bindings')).json()).revision,3);
 assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM hermes_jobs').get().n,0);assert.equal(env.ADMIN_DB.db.prepare('SELECT revision FROM admin_settings').get().revision,1);
});
test('API items are projected once, references snapshot settings and bindings, failure clears totals',async()=>{
 const {env,cookie,csrf}=await login();await call(env,cookie,'variant-bindings',{revision:1,bindings:[binding()]},csrf);
 let reads=0;const services={getOrderItems:async()=>{reads++;return {...nativeFrame(),access_token:'PRIVATE'};}};
 const result=await(await call(env,cookie,'order-items',undefined,undefined,services)).json();assert.equal(result.status,'AVAILABLE');assert.equal(result.orders_with_details,2);assert.equal(result.catalog_units,3);assert.equal(result.margin_reference.total_cents,null);assert.equal(result.margin_reference.known_subset_cents,3350);assert.equal(result.margin_reference.bindings_revision,2);assert.equal(reads,1);assert.ok(!JSON.stringify(result).includes('PRIVATE'));
 const failed=await(await call(env,cookie,'order-items',undefined,undefined,{getOrderItems:async()=>({diagnostic:{stage:'AUTH_TO_GATEWAY',code:'HTTP_STATUS',http:503,raw:'PRIVATE'}})})).json();assert.equal(failed.catalog_units,null);assert.equal(failed.margin_reference,null);assert.ok(!JSON.stringify(failed).includes('PRIVATE'));assert.equal(failed.diagnostic.http,503);
});
test('route accepts 1000 explicit bindings above old16KiB, with all IDs preserved as strings',async()=>{
 const {env,cookie,csrf}=await login();const bindings=Array.from({length:1000},(_,n)=>binding(String(n+1),'0'));
 const body={revision:1,bindings};assert.ok(JSON.stringify(body).length>16384);
 const response=await call(env,cookie,'variant-bindings',body,csrf);assert.equal(response.status,200);assert.equal((await response.json()).bindings.length,1000);
 assert.equal((await call(env,cookie,'variant-bindings',{revision:2,bindings:[...bindings,binding('1001','0')]},csrf)).status,400);
});
test('automatic provenance is distinct from operator confirmation and legacy objects are unchanged',()=>{
 const manual=binding('101','0','G1','G3');
 assert.equal(JSON.stringify(validateVariantBindings([manual])[0]),JSON.stringify(manual));
 assert.deepEqual(validateVariantBindings([automatic()]),[automatic()]);
 for(const change of [{source:'TITLE_GUESS'},{catalog_fingerprint:'A'.repeat(64)},{catalog_fingerprint:'a'.repeat(63)},{operator_confirmed:true},{buyer:'PRIVATE'}])assert.throws(()=>validateVariantBindings([{...automatic(),...change}]));
 assert.throws(()=>validateVariantBindings([{...binding(),operator_confirmed:false}]));
 assert.throws(()=>validateVariantBindings([binding(),automatic('101','1')]));
});
test('trusted catalog refresh preserves manual overrides and replaces only queried automatic products',async()=>{
 const {env,cookie,csrf}=await login();
 await call(env,cookie,'variant-bindings',{revision:1,bindings:[binding(),binding('999','0','G1','G3')]},csrf);
 let state=await saveAutomaticVariantBindings(env,{revision:2,item_ids:['101','201']},catalog([
  catalogProduct('101',[automatic('101','1','G3','G3'),automatic()]),
  catalogProduct('201',[automatic('201','0','P','M')]),
 ]),'admin');
 assert.deepEqual(state.bindings,[binding(),automatic(),automatic('201','0','P','M'),binding('999','0','G1','G3')]);
 state=await saveAutomaticVariantBindings(env,{revision:3,item_ids:['101']},catalog([catalogProduct('101',[automatic('101','3','G2','G3')],'b'.repeat(64),1)]),'admin');
 assert.deepEqual(state.bindings,[binding(),automatic('101','3','G2','G3','b'.repeat(64)),automatic('201','0','P','M'),binding('999','0','G1','G3')]);
 assert.equal(env.ADMIN_DB.db.prepare('SELECT actor FROM variant_bindings_audit WHERE revision=4').get().actor,'catalog-automation:admin');
 const count=env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n;
 state=await saveAutomaticVariantBindings(env,{revision:4,item_ids:['101']},catalog([catalogProduct('101',[],'c'.repeat(64),2)]),'admin');
 assert.equal(state.bindings.some(row=>row.item_id==='101'&&row.operator_confirmed===false),false);
 assert.deepEqual(state.bindings.find(row=>row.item_id==='101'),binding());
 assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n,count+1);
 assert.equal(env.ADMIN_DB.db.prepare('SELECT revision FROM admin_settings').get().revision,1);
 assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM hermes_jobs').get().n,0);
});
test('unresolved catalog with no automatic changes retains revision, timestamp and audit without a write',async()=>{
 const {env,cookie,csrf}=await login();
 await call(env,cookie,'variant-bindings',{revision:1,bindings:[binding(),binding('999','0')]},csrf);
 const previous=await readVariantBindings(env),audits=env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n;
 env.ADMIN_DB.batch=async()=>{throw new Error('unchanged catalog must not write');};
 const state=await saveAutomaticVariantBindings(env,{revision:2,item_ids:['101']},catalog([catalogProduct('101',[],'a'.repeat(64),49)]),'admin');
 assert.deepEqual(state,previous);
 assert.deepEqual(await readVariantBindings(env),previous);
 assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n,audits);
 await assert.rejects(saveAutomaticVariantBindings(env,{revision:1,item_ids:['101']},catalog([catalogProduct('101',[],'a'.repeat(64),49)]),'admin'),bindingError('VARIANT_BINDINGS_CHANGED_RELOAD',409));
});
test('repeated normalized catalog is unchanged while fingerprint, sizes and removals create audited revisions',async()=>{
 const {env}=await login();
 let state=await saveAutomaticVariantBindings(env,{revision:1,item_ids:['101']},catalog([catalogProduct('101',[automatic('101','3','P','M'),automatic()])]),'admin');
 const previous=state,audits=env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n,write=env.ADMIN_DB.batch.bind(env.ADMIN_DB);
 env.ADMIN_DB.batch=async()=>{throw new Error('identical normalized bindings must not write');};
 state=await saveAutomaticVariantBindings(env,{revision:2,item_ids:['101']},{...catalog([catalogProduct('101',[automatic(),automatic('101','3','P','M')])]),checked_at:1792405690},'admin');
 assert.deepEqual(state,previous);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n,audits);
 env.ADMIN_DB.batch=write;
 state=await saveAutomaticVariantBindings(env,{revision:2,item_ids:['101']},catalog([catalogProduct('101',[automatic(),automatic('101','3','P','M')],'b'.repeat(64))]),'admin');
 assert.equal(state.revision,3);assert.ok(state.bindings.every(row=>row.catalog_fingerprint==='b'.repeat(64)));
 state=await saveAutomaticVariantBindings(env,{revision:3,item_ids:['101']},catalog([catalogProduct('101',[automatic(),automatic('101','3','G2','M')],'b'.repeat(64))]),'admin');
 assert.equal(state.revision,4);assert.equal(state.bindings.find(row=>row.model_id==='3').male_size,'G2');
 state=await saveAutomaticVariantBindings(env,{revision:4,item_ids:['101']},catalog([catalogProduct('101',[],'c'.repeat(64),2)]),'admin');
 assert.equal(state.revision,5);assert.deepEqual(state.bindings,[]);
 const rows=env.ADMIN_DB.db.prepare('SELECT revision,actor,payload FROM variant_bindings_audit WHERE revision>2 ORDER BY revision').all();
 assert.deepEqual(rows.map(row=>row.revision),[3,4,5]);assert.ok(rows.every(row=>row.actor==='catalog-automation:admin'));
 assert.deepEqual(JSON.parse(rows[2].payload),[]);
});
test('changed automatic catalog still rejects a concurrent save between its read and write',async()=>{
 const {env}=await login(),write=env.ADMIN_DB.batch.bind(env.ADMIN_DB);
 const winnerCatalog=catalog([catalogProduct('101',[automatic('101','3','P','M')],'b'.repeat(64))]);
 let winner;
 env.ADMIN_DB.batch=async statements=>{
  env.ADMIN_DB.batch=write;
  winner=await saveAutomaticVariantBindings(env,{revision:1,item_ids:['101']},winnerCatalog,'concurrent-admin');
  return write(statements);
 };
 await assert.rejects(saveAutomaticVariantBindings(env,{revision:1,item_ids:['101']},catalog(),'admin'),bindingError('VARIANT_BINDINGS_CHANGED_RELOAD',409));
 assert.deepEqual(await readVariantBindings(env),winner);
 const rows=env.ADMIN_DB.db.prepare('SELECT revision,actor FROM variant_bindings_audit ORDER BY revision').all();
 assert.equal(rows.length,2);assert.equal(rows[1].revision,2);assert.equal(rows[1].actor,'catalog-automation:concurrent-admin');
});
test('manual route retains exact automatic links but cannot create or modify their provenance',async()=>{
 const {env,cookie,csrf}=await login();
 await saveAutomaticVariantBindings(env,{revision:1,item_ids:['101']},catalog(),'admin');
 for(const candidate of [automatic('101','2','P','G1'),automatic('101','2','GG','G1','b'.repeat(64)),automatic('201','2')]){
  const response=await call(env,cookie,'variant-bindings',{revision:2,bindings:[candidate]},csrf);
  assert.equal(response.status,400);assert.equal((await response.json()).error,'VARIANT_BINDING_AUTOMATIC_SOURCE_REQUIRED');
 }
 assert.equal((await readVariantBindings(env)).revision,2);
 let response=await call(env,cookie,'variant-bindings',{revision:2,bindings:[automatic(),binding('999','0')]},csrf);
 assert.equal(response.status,200);assert.deepEqual((await response.json()).bindings,[automatic(),binding('999','0')]);
 response=await call(env,cookie,'variant-bindings',{revision:3,bindings:[binding('101','2','P','M'),binding('999','0')]},csrf);
 assert.equal(response.status,200);assert.deepEqual((await response.json()).bindings,[binding('101','2','P','M'),binding('999','0')]);
});
test('automatic refresh rejects stale versions and malformed or mismatched catalog without writes',async()=>{
 const {env}=await login();await saveAutomaticVariantBindings(env,{revision:1,item_ids:['101']},catalog(),'admin');
 const previous=await readVariantBindings(env),audits=env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n;
 await assert.rejects(saveAutomaticVariantBindings(env,{revision:1,item_ids:['101']},catalog(),'admin'),bindingError('VARIANT_BINDINGS_CHANGED_RELOAD',409));
 for(const body of [{revision:2,item_ids:['101','101']},{revision:2,item_ids:['01']},{revision:2,item_ids:[]},{revision:2,item_ids:['101'],bindings:[]}])await assert.rejects(saveAutomaticVariantBindings(env,body,catalog(),'admin'),bindingError('VARIANT_CATALOG_REQUEST_INVALID'));
 const badCatalogs=[{...catalog(),private:'PRIVATE'},catalog([]),catalog([catalogProduct('201')]),catalog([catalogProduct('101',[automatic('201','2')])]),catalog([catalogProduct('101',[automatic(),automatic()])]),catalog([catalogProduct('101',[automatic('101','2','XS','M')])]),catalog([catalogProduct('101',[],'A'.repeat(64))]),{...catalog(),checked_at:0}];
 for(const bad of badCatalogs)await assert.rejects(saveAutomaticVariantBindings(env,{revision:2,item_ids:['101']},bad,'admin'),bindingError('VARIANT_CATALOG_INVALID',503));
 assert.deepEqual(await readVariantBindings(env),previous);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n,audits);
});
test('automatic aggregate limits and audit collisions preserve previous state atomically',async()=>{
 const {env,cookie,csrf}=await login();
 const manual=Array.from({length:1000},(_,n)=>binding(String(n+1000),'0'));
 await call(env,cookie,'variant-bindings',{revision:1,bindings:manual},csrf);
 const previous=await readVariantBindings(env),audits=env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n;
 await assert.rejects(saveAutomaticVariantBindings(env,{revision:2,item_ids:['101']},catalog(),'admin'),bindingError('VARIANT_BINDINGS_INVALID'));
 assert.deepEqual(await readVariantBindings(env),previous);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n,audits);
 const other=await login(),before=await readVariantBindings(other.env);
 other.env.ADMIN_DB.db.prepare('INSERT INTO variant_bindings_audit(revision,payload,actor,created_at) VALUES(2,?,?,?)').run('[]','fixture','2026-10-19T00:00:00.000Z');
 await assert.rejects(saveAutomaticVariantBindings(other.env,{revision:1,item_ids:['101']},catalog(),'admin'));
 assert.deepEqual(await readVariantBindings(other.env),before);
});
test('automatic sizes use existing margin and production cost arithmetic without manual confirmation',()=>{
 const frame={status:'AVAILABLE',rows:[{item_id:'101',model_id:'2',quantity:2},{item_id:'101',model_id:'3',quantity:1}]},state={revision:5,bindings:[automatic(),automatic('101','3','G2','G3')]};
 const margin=variantMarginReference(frame,state,{revision:1,values:DEFAULTS}),cost=productionCostReference(frame,state,{revision:1,values:COST_DEFAULTS});
 assert.equal(margin.total_cents,2*1910+2070);assert.equal(cost.total_cents,2*3480+3780);
 assert.equal(margin.economic_status,'UNKNOWN');assert.equal(cost.gross_profit_cents,null);
});
test('automatic provenance is snapshotted while existing manual observations remain unchanged',async()=>{
 const {env,cookie,csrf}=await login();
 await call(env,cookie,'variant-bindings',{revision:1,bindings:[binding()]},csrf);
 const first=await captureObservation(env,async()=>nativeFrame(),'admin');
 const retained=env.ADMIN_DB.db.prepare('SELECT payload FROM order_observations WHERE id=?').get(first.observation.id).payload;
 await saveAutomaticVariantBindings(env,{revision:2,item_ids:['101']},catalog(),'admin');
 const second=await captureObservation(env,async()=>nativeFrame(),'admin');
 assert.deepEqual(second.observation.bindings_snapshot.bindings,[binding(),automatic()]);
 assert.equal(second.observation.margin_reference.unmapped_quantity,0);
 assert.deepEqual(await readObservation(env,first.observation.id),first.observation);
 assert.equal(env.ADMIN_DB.db.prepare('SELECT payload FROM order_observations WHERE id=?').get(first.observation.id).payload,retained);
 assert.equal(first.observation.margin_reference.total_cents,null);
});
test('individual garments use an exact separate union and cannot borrow kit fields or provenance',()=>{
 for(const value of [singleBinding(),singleAutomatic('101','0','G3')])assert.deepEqual(validateVariantBindings([value]),[value]);
 assert.equal(JSON.stringify(validateVariantBindings([binding()])[0]),JSON.stringify(binding()));
 for(const change of [{size:'m'},{size:'XS'},{male_size:'M'},{female_size:'G'},{operator_confirmed:'true'},{selling_unit:'ONE_SHIRT'},{source:'CATALOG_SIZE_AXIS'}])assert.throws(()=>validateVariantBindings([{...singleBinding(),...change}]));
 for(const change of [{source:'CATALOG_VARIATION_AXES'},{catalog_fingerprint:'A'.repeat(64)},{operator_confirmed:true},{male_size:'M'}])assert.throws(()=>validateVariantBindings([{...singleAutomatic(),...change}]));
 assert.throws(()=>validateVariantBindings([{...automatic(),source:'CATALOG_SIZE_AXIS'}]));
 assert.throws(()=>validateVariantBindings([binding(),singleAutomatic()]));
 assert.throws(()=>validateVariantBindings(Array.from({length:1001},(_,n)=>singleBinding(String(n+1),'0'))));
});
test('single-garment automation preserves manual choices and replaces or removes only requested automatic links',async()=>{
 const {env}=await login();
 let state=await saveVariantBindings(env,{revision:1,bindings:[singleBinding(),binding('999','0')]},'admin');
 state=await saveAutomaticVariantBindings(env,{revision:state.revision,item_ids:['101'],selling_unit:'SINGLE_GARMENT'},catalog([singleProduct('101',[singleAutomatic('101','1','G3'),singleAutomatic('101','2','P')])]),'admin');
 assert.deepEqual(state.bindings,[singleBinding(),singleAutomatic('101','2','P'),binding('999','0')]);
 const repeated=await saveAutomaticVariantBindings(env,{revision:state.revision,item_ids:['101'],selling_unit:'SINGLE_GARMENT'},catalog([singleProduct('101',[singleAutomatic('101','2','P'),singleAutomatic('101','1','G3')])]),'admin');
 assert.deepEqual(repeated,state);
 state=await saveAutomaticVariantBindings(env,{revision:state.revision,item_ids:['101'],selling_unit:'SINGLE_GARMENT'},catalog([singleProduct('101',[],'b'.repeat(64),2)]),'admin');
 assert.deepEqual(state.bindings,[singleBinding(),binding('999','0')]);
 assert.equal(env.ADMIN_DB.db.prepare('SELECT actor FROM variant_bindings_audit ORDER BY revision DESC LIMIT 1').get().actor,'catalog-automation:admin');
});
test('automatic unit switches replace prior automatic interpretations but reject conflicting manual product composition',async()=>{
 const {env}=await login();
 let state=await saveAutomaticVariantBindings(env,{revision:1,item_ids:['101']},catalog(),'admin');
 state=await saveAutomaticVariantBindings(env,{revision:state.revision,item_ids:['101'],selling_unit:'SINGLE_GARMENT'},catalog([singleProduct()]),'admin');
 assert.deepEqual(state.bindings,[singleAutomatic()]);
 state=await saveAutomaticVariantBindings(env,{revision:state.revision,item_ids:['101'],selling_unit:'ONE_MALE_ONE_FEMALE_KIT'},catalog(),'admin');
 assert.deepEqual(state.bindings,[automatic()]);
 for(const manual of [binding('101','9'),singleBinding('101','9')]){
  state=await saveVariantBindings(env,{revision:state.revision,bindings:[manual]},'admin');
  const previous=state,audits=env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n,isSingle=manual.selling_unit!=='SINGLE_GARMENT';
  await assert.rejects(saveAutomaticVariantBindings(env,{revision:state.revision,item_ids:['101'],selling_unit:isSingle?'SINGLE_GARMENT':'ONE_MALE_ONE_FEMALE_KIT'},isSingle?catalog([singleProduct()]):catalog(),'admin'),bindingError('VARIANT_BINDING_COMPOSITION_CONFLICT',409));
  assert.deepEqual(await readVariantBindings(env),previous);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n,audits);
 }
});
test('manual save retains genuine garment and kit automatic rows but cannot forge either source',async()=>{
 const {env}=await login();
 let state=await saveAutomaticVariantBindings(env,{revision:1,item_ids:['101'],selling_unit:'SINGLE_GARMENT'},catalog([singleProduct()]),'admin');
 state=await saveAutomaticVariantBindings(env,{revision:state.revision,item_ids:['201']},catalog([catalogProduct('201')]),'admin');
 const genuine=state.bindings;
 for(const candidate of [singleAutomatic('101','1','G3'),singleAutomatic('101','1','M','b'.repeat(64)),singleAutomatic('301','1')]){
  await assert.rejects(saveVariantBindings(env,{revision:state.revision,bindings:[...genuine.filter(row=>row.item_id!=='101'),candidate]},'admin'),bindingError('VARIANT_BINDING_AUTOMATIC_SOURCE_REQUIRED'));
 }
 state=await saveVariantBindings(env,{revision:state.revision,bindings:[...genuine,singleBinding('999','0','GG')]},'admin');
 assert.deepEqual(state.bindings,[singleAutomatic(),automatic('201'),singleBinding('999','0','GG')]);
 await assert.rejects(saveVariantBindings(env,{revision:state.revision-1,bindings:genuine},'admin'),bindingError('VARIANT_BINDINGS_CHANGED_RELOAD',409));
});
test('garment catalog unit and shape mismatches fail before writes and aggregate model counts stay bounded',async()=>{
 const {env}=await login(),body={revision:1,item_ids:['101'],selling_unit:'SINGLE_GARMENT'};
 for(const bad of [{...body,selling_unit:'ONE_SHIRT'},{...body,source:'CATALOG_SIZE_AXIS'}])await assert.rejects(saveAutomaticVariantBindings(env,bad,catalog([singleProduct()]),'admin'),bindingError('VARIANT_CATALOG_REQUEST_INVALID'));
 for(const product of [catalogProduct(),{...singleProduct(),selling_unit:undefined},{...singleProduct(),bindings:[{item_id:'101',model_id:'1',size:'m'}]},{...singleProduct(),bindings:[{item_id:'101',model_id:'1',male_size:'M',female_size:'M'}]},singleProduct('101',[singleAutomatic(),singleAutomatic()]),singleProduct('101',[singleAutomatic()],'a'.repeat(64),1000)])await assert.rejects(saveAutomaticVariantBindings(env,body,catalog([product]),'admin'),bindingError('VARIANT_CATALOG_INVALID',503));
 const oversized=catalog([singleProduct('101',[],'a'.repeat(64),600),singleProduct('201',[],'a'.repeat(64),401)]);
 await assert.rejects(saveAutomaticVariantBindings(env,{...body,item_ids:['101','201']},oversized,'admin'),bindingError('VARIANT_CATALOG_INVALID',503));
 assert.equal((await readVariantBindings(env)).revision,1);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n,1);
});
test('single garments remain unpriced by kit margins and legacy-only reference shape is unchanged',()=>{
 const rows=[{item_id:'101',model_id:'1',quantity:2},{item_id:'201',model_id:'1',quantity:3},{item_id:'301',model_id:'0',quantity:1}];
 const state={revision:4,bindings:[singleAutomatic(),binding('201','1')]},cfg={revision:3,values:DEFAULTS};
 const result=variantMarginReference({status:'AVAILABLE',rows},state,cfg);
 assert.equal(result.known_subset_cents,5025);assert.equal(result.total_cents,null);assert.equal(result.mapped_quantity,3);assert.equal(result.unmapped_quantity,3);assert.equal(result.unpriced_quantity,2);
 assert.deepEqual(result.variants[0],{...rows[0],margin_class:null,unit_margin_cents:null,contribution_cents:null});
 const onlySingle=variantMarginReference({status:'AVAILABLE',rows:[rows[0]]},state,cfg);
 assert.equal(onlySingle.known_subset_cents,0);assert.equal(onlySingle.mapped_quantity,0);assert.equal(onlySingle.unmapped_quantity,2);assert.equal(onlySingle.total_cents,null);
 const legacy=variantMarginReference({status:'AVAILABLE',rows:[rows[1]]},state,cfg);
 assert.equal(Object.hasOwn(legacy,'unpriced_quantity'),false);
 assert.deepEqual(legacy,{settings_revision:3,bindings_revision:4,known_subset_cents:5025,total_cents:5025,mapped_quantity:3,unmapped_quantity:0,status_scope:'ALL_RETURNED_STATUSES_REFERENCE_ONLY',currency:'BRL',margin_stage:'AFTER_FEES_AND_PRODUCT_COST_BEFORE_ADS',economic_status:'UNKNOWN',variants:[{...rows[1],margin_class:'REGULAR',unit_margin_cents:1675,contribution_cents:5025}]});
});
