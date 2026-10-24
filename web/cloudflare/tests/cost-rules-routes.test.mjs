import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {adminFetch} from '../src/admin.mjs';
import {D1} from './sqlite-d1.mjs';
const base='https://app.example.test';
async function fixture(){
 const env={ADMIN_DB:new D1(),ADMIN_USERNAME:'rules-owner',ADMIN_PASSWORD:'fixture-rules-password-123456',ADMIN_SESSION_SECRET:'fixture-rules-secret-12345678901234567890'};
 const login=await adminFetch(new Request(base+'/login',{method:'POST',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
 const read=await (await adminFetch(new Request(base+'/api/admin/state',{headers:{cookie}}),env)).json();return {env,cookie,csrf:read.csrf};
}
const call=(auth,path='cost-rules',body,services={},changes={})=>adminFetch(new Request(base+'/api/admin/'+path,{method:body===undefined?'GET':'POST',headers:{cookie:changes.cookie??auth.cookie,origin:changes.origin??base,'content-type':'application/json','x-csrf-token':changes.csrf??auth.csrf},body:body===undefined?undefined:JSON.stringify(body)}),auth.env,services);
function items(){const cutoff=new Date(Date.now()-10800000).toISOString().replace('Z','-03:00');return {schema:'shop_order_items_v1',shop_id:1178167501,date:cutoff.slice(0,10),timezone:'America/Sao_Paulo',through_at:cutoff,day_partial:true,pagination_complete:true,pages_read:1,orders_in_api_window:1,orders_with_details:1,duplicate_rows:0,catalog_units:2,rows:[{item_id:'101',model_id:'0',order_status:'READY_TO_SHIP',quantity:2,line_count:1}],currency_status:'BRL_ALL_CONFIRMED',currency_counts:{BRL:1,OTHER:0,UNKNOWN:0},source:'shopee_get_order_list_and_detail',transport_http:200,api_error:'NO',count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_NO_STATUS_FILTER',order_status_filter:'NONE',dashboard_counter_reconciled:false,order_status_verified:true};}

test('owner rules and catalogue actions enforce Origin CSRF method and exact scope before reading any product metadata',async()=>{
 const auth=await fixture();try{let reads=0;const services={getFinanceVariantCatalog:async()=>{reads++;}};
 for(const cookie of ['', 'mls_session=review'])assert.equal((await call(auth,'cost-rules',undefined,services,{cookie})).status,401);
 const state=await (await call(auth)).json();assert.equal(state.values.rules[0].unit_cost_cents,1250);const body={revision:state.revision,values:state.values};
 assert.equal((await call(auth,'cost-rules',body,services,{csrf:''})).status,403);assert.equal((await call(auth,'cost-rules',body,services,{origin:'https://other.invalid'})).status,403);
 assert.equal((await call(auth,'cost-rules/sync')).status,405);assert.equal((await call(auth,'cost-rules/sync',{item_ids:['101'],force:false,shop_id:1},services)).status,400);assert.equal((await call(auth,'cost-rules/sync?x=1',{item_ids:['101'],force:false},services)).status,400);assert.equal(reads,0);
 const assignment={revision:state.revision,assignments:[{item_id:'101',model_id:'0',rule_id:'camiseta-infantil',size:'4'}]};
 assert.equal((await call(auth,'cost-rules/assignments')).status,405);assert.equal((await call(auth,'cost-rules/assignments',assignment,services,{cookie:''})).status,401);assert.equal((await call(auth,'cost-rules/assignments',assignment,services,{csrf:''})).status,403);assert.equal((await call(auth,'cost-rules/assignments',assignment,services,{origin:'https://other.invalid'})).status,403);assert.equal((await call(auth,'cost-rules/assignments?x=1',assignment,services)).status,400);assert.equal(reads,0);
 const html=await (await adminFetch(new Request(base+'/admin?tab=margins',{headers:{cookie:auth.cookie}}),auth.env)).text();assert.match(html,/id="costRulesForm"/);assert.match(html,/Custo por tipo de produto e tamanho/);for(const [,script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new vm.Script(script));
 }finally{auth.env.ADMIN_DB.db.close();}
});

test('a child size can be saved directly without catalogue access or an adult binding and follows the current rule price',async()=>{
 const auth=await fixture();try{
 let catalogReads=0;const services={getOrderItems:async()=>items(),getFinanceVariantCatalog:async()=>{catalogReads++;throw Error('unavailable');}};
 let state=await(await call(auth)).json(),response=await call(auth,'cost-rules/assignments',{revision:state.revision,assignments:[{item_id:'101',model_id:'0',rule_id:'camiseta-infantil',size:'8'}]},services);assert.equal(response.status,200);state=await response.json();assert.equal(state.revision,2);
 let result=await(await call(auth,'order-items',undefined,services)).json();assert.equal(result.production_cost_reference.total_cents,2500);assert.match(result.production_cost_reference.variants[0].cost_profile_label,/infantil · 8/);assert.equal(catalogReads,0);
 assert.equal((await(await call(auth,'variant-bindings')).json()).bindings.length,0);assert.equal((await call(auth,'cost-rules/assignments',{revision:1,assignments:[{item_id:'101',model_id:'0',rule_id:'camiseta-infantil',size:'6'}]},services)).status,409);
 state.values.rules[0].unit_cost_cents=1400;assert.equal((await call(auth,'cost-rules',{revision:state.revision,values:state.values})).status,200);result=await(await call(auth,'order-items',undefined,services)).json();assert.equal(result.production_cost_reference.total_cents,2800);assert.equal(result.cost_rules_revision,3);assert.equal(catalogReads,0);
 }finally{auth.env.ADMIN_DB.db.close();}
});

test('an automatic rule links child variations and rule edits recalculate the server reference without modifying manual bindings',async()=>{
 const auth=await fixture();try{
 const services={getOrderItems:async()=>items(),getFinanceVariantCatalog:async(_,selection)=>{assert.deepEqual(selection,{item_ids:['101'],selling_unit:'AUTO',include_cost_catalog:true});return {schema:'variant_catalog_v1',checked_at:Math.floor(Date.now()/1000),products:[{item_id:'101',catalog_fingerprint:'c'.repeat(64),bindings:[],unresolved_count:1,cost_catalog:{schema:'product_cost_catalog_v1',product_name:'Camiseta Infantil',variants:[{model_id:'0',attributes:[{name:'Tamanho',value:'4'}]}]}}]};}};
 assert.equal((await call(auth,'cost-rules/sync',{item_ids:['101'],force:false},services)).status,200);
 let result=await (await call(auth,'order-items',undefined,services)).json();assert.equal(result.production_cost_reference.total_cents,2500);assert.equal(result.production_cost_reference.variants[0].unit_cost_cents,1250);assert.match(result.production_cost_reference.variants[0].cost_profile_label,/infantil · 4/);assert.equal(result.margin_reference.total_cents,null);
 const state=await (await call(auth)).json();state.values.rules[0].unit_cost_cents=1400;assert.equal((await call(auth,'cost-rules',{revision:state.revision,values:state.values})).status,200);
 result=await (await call(auth,'order-items',undefined,services)).json();assert.equal(result.production_cost_reference.total_cents,2800);assert.equal(result.cost_rules_revision,2);
 assert.equal((await (await call(auth,'variant-bindings')).json()).revision,1);assert.equal(auth.env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM hermes_jobs').get().n,0);
 }finally{auth.env.ADMIN_DB.db.close();}
});
