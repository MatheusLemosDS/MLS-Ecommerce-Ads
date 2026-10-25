import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {saveOrderItemsSnapshot,readOrderItemsSnapshot} from '../src/saved-order-items.mjs';
import {adminFetch,DEFAULTS} from '../src/admin.mjs';

const at=Date.parse('2026-10-25T14:00:00Z');
function source(stamp=at){const through=new Date(stamp-10800000).toISOString().replace('Z','-03:00');return {schema:'shop_order_items_v1',shop_id:1178167501,date:through.slice(0,10),timezone:'America/Sao_Paulo',through_at:through,day_partial:true,orders_in_api_window:1,orders_with_details:1,pagination_complete:true,pages_read:1,duplicate_rows:0,catalog_units:3,rows:[{item_id:'201',model_id:'7',order_status:'COMPLETED',quantity:3,line_count:1}],currency_status:'BRL_ALL_CONFIRMED',currency_counts:{BRL:1,OTHER:0,UNKNOWN:0},order_status_verified:true,count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_NO_STATUS_FILTER',order_status_filter:'NONE',dashboard_counter_reconciled:false,source:'shopee_get_order_list_and_detail',api_error:'NO',transport_http:200};}
test('saved quantities remain private, durable and honestly dated across a new day',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());const input=source();input.buyer='PRIVATE';input.rows[0].sku='PRIVATE';
 assert.equal(await saveOrderItemsSnapshot(env,input,{now:()=>at}),true);
 const view=await readOrderItemsSnapshot(env,{now:()=>at+86400000});assert.equal(view.status,'AVAILABLE');assert.equal(view.source_mode,'SAVED');assert.equal(view.previous_day,true);assert.equal(view.date,'2026-10-25');assert.equal(view.snapshot_age_seconds,86400);assert.equal(view.catalog_units,3);assert.ok(!JSON.stringify(view).includes('PRIVATE'));assert.ok(!env.ADMIN_DB.db.prepare('SELECT payload FROM saved_order_items').get().payload.includes('PRIVATE'));
});
test('a missing saved source is unknown; invalid or older imports cannot erase known quantities',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());const missing=await readOrderItemsSnapshot(env,{now:()=>at});assert.equal(missing.catalog_units,null);assert.equal(missing.status,'UNAVAILABLE');
 await saveOrderItemsSnapshot(env,source(),{now:()=>at});assert.equal(await saveOrderItemsSnapshot(env,source(at-1000),{now:()=>at}),false);assert.equal(await saveOrderItemsSnapshot(env,{...source(),pagination_complete:false},{now:()=>at}),false);assert.equal((await readOrderItemsSnapshot(env,{now:()=>at})).through_at,source().through_at);
 env.ADMIN_DB.db.prepare('UPDATE saved_order_items SET payload=?').run('{"PRIVATE":"corrupt"}');await assert.rejects(readOrderItemsSnapshot(env,{now:()=>at}),error=>error.message==='SAVED_ITEMS_STORAGE_INVALID');
});
test('the authenticated saved route reprices quantities using changed adult costs without a provider call',async t=>{
 const origin='https://saved-costs.test',env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'s'.repeat(40),ADMIN_USERNAME:'owner',ADMIN_PASSWORD:'saved-costs-test-password'};t.after(()=>env.ADMIN_DB.db.close());
 const login=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);const cookie=login.headers.get('set-cookie').split(';')[0];
 const read=(path,services={})=>adminFetch(new Request(origin+path,{headers:{cookie}}),env,services);await read('/api/admin/state');
 const stamp=Date.now();let calls=0;const services={getOrderItems:async()=>{calls++;return source(stamp);}};
 const initialCosts=env.ADMIN_DB.db.prepare('SELECT revision,payload FROM production_costs_state WHERE id=1').get(),rulesRevision=env.ADMIN_DB.db.prepare('SELECT revision FROM production_cost_rules_state WHERE id=1').get().revision;
 const costs={...JSON.parse(initialCosts.payload),mode:'all_inclusive',inclusive_regular_cents:1590,inclusive_plus_cents:2140,base_regular_cents:null,base_plus_cents:null,components:[]};
 env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET payload=? WHERE id=1').run(JSON.stringify(costs));env.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET payload=? WHERE id=1').run(JSON.stringify([{item_id:'201',model_id:'7',selling_unit:'SINGLE_GARMENT',size:'G3',operator_confirmed:true}]));
 const first=await read('/api/admin/order-items',services);assert.equal(first.status,200);assert.equal((await first.json()).production_cost_reference.total_cents,6420);assert.equal(calls,1);
 env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET revision=revision+1,payload=? WHERE id=1').run(JSON.stringify({...costs,inclusive_plus_cents:2200}));
 const cached=await read('/api/admin/order-items?source=saved',services);assert.equal(cached.status,200);const result=await cached.json();assert.equal(result.production_cost_reference.total_cents,6600);assert.equal(result.cost_rules_revision,rulesRevision);assert.equal(result.source_mode,'SAVED');assert.equal(result.fetched_at.slice(0,10),new Date().toISOString().slice(0,10));assert.equal(result.through_at,source(stamp).through_at);assert.equal(calls,1);
 assert.equal((await adminFetch(new Request(origin+'/api/admin/order-items?source=saved'),env,services)).status,401);assert.equal((await read('/api/admin/order-items?source=anything',services)).status,400);assert.equal(calls,1);assert.equal(DEFAULTS.hermes_mode,'manual');
 // A cost/binding edit after the atomic read must not create a combination
 // of an old size with a new price that never existed in the database.
 const batch=env.ADMIN_DB.batch.bind(env.ADMIN_DB),prepare=env.ADMIN_DB.prepare.bind(env.ADMIN_DB);let changed=false;env.ADMIN_DB.prepare=sql=>Object.assign(prepare(sql),{sql});
 env.ADMIN_DB.batch=async statements=>{const result=await batch(statements);if(!changed&&statements[0]?.sql==='SELECT revision,payload FROM variant_bindings_state WHERE id=1'){changed=true;env.ADMIN_DB.db.exec('BEGIN');env.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET revision=revision+1,payload=? WHERE id=1').run(JSON.stringify([{item_id:'201',model_id:'7',selling_unit:'SINGLE_GARMENT',size:'P',operator_confirmed:true}]));env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET revision=revision+1,payload=? WHERE id=1').run(JSON.stringify({...costs,inclusive_regular_cents:1990,inclusive_plus_cents:2890}));env.ADMIN_DB.db.exec('COMMIT');}return result;};
 const atomic=await read('/api/admin/order-items?source=saved',services);const snapshot=await atomic.json();assert.equal(atomic.status,200);assert.equal(changed,true);assert.equal(snapshot.production_cost_reference.total_cents,6600);assert.equal(snapshot.production_cost_reference.costs_revision,initialCosts.revision+1);assert.equal(snapshot.production_cost_reference.bindings_revision,1);assert.equal(calls,1);
});
