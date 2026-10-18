import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch,DEFAULTS} from '../src/admin.mjs';
import {validateVariantBindings,variantMarginReference} from '../src/variant-bindings.mjs';
import {D1} from './sqlite-d1.mjs';

const base='https://app.example.test';
const binding=(item_id='101',model_id='1',male_size='M',female_size='G')=>({item_id,model_id,male_size,female_size,selling_unit:'ONE_MALE_ONE_FEMALE_KIT',operator_confirmed:true});
const nativeFrame=()=>{const cutoff=new Date(Date.now()-10800000).toISOString().replace('Z','-03:00');return {schema:'shop_order_items_v1',shop_id:1178167501,date:cutoff.slice(0,10),timezone:'America/Sao_Paulo',through_at:cutoff,day_partial:true,pagination_complete:true,pages_read:1,orders_in_api_window:2,orders_with_details:2,duplicate_rows:0,catalog_units:3,rows:[{item_id:'101',model_id:'1',order_status:'READY_TO_SHIP',quantity:2,line_count:1},{item_id:'101',model_id:'2',order_status:'UNPAID',quantity:1,line_count:1}],currency_status:'BRL_ALL_CONFIRMED',currency_counts:{BRL:2,OTHER:0,UNKNOWN:0},source:'shopee_get_order_list_and_detail',transport_http:200,api_error:'NO',count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_NO_STATUS_FILTER',order_status_filter:'NONE',dashboard_counter_reconciled:false,order_status_verified:true};};
async function login(){const env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'fixture-admin-session-1234567890123456',ADMIN_USERNAME:'fixture-admin',ADMIN_PASSWORD:'fixture-password-123456'};const response=await adminFetch(new Request(base+'/admin/login',{method:'POST',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);const cookie=response.headers.get('set-cookie').split(';')[0];const state=await(await call(env,cookie,'state')).json();return {env,cookie,csrf:state.csrf};}
function call(env,cookie,path,body,csrf,services={}){return adminFetch(new Request(base+'/api/admin/'+path,{method:body===undefined?'GET':'POST',headers:{cookie,origin:base,'content-type':'application/json','x-csrf-token':csrf||''},body:body===undefined?undefined:JSON.stringify(body)}),env,services);}

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
