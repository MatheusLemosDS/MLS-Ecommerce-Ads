import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch,DEFAULTS} from '../src/admin.mjs';
import {validateVariantBindings,variantMarginReference,readVariantBindings,saveAutomaticVariantBindings} from '../src/variant-bindings.mjs';
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
