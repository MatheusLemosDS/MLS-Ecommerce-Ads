import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch} from '../src/admin.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {D1} from './sqlite-d1.mjs';

const base='https://app.example.test';
function request(env,cookie,path,{body,csrf='',origin=base,services={}}={}){
 return adminFetch(new Request(base+'/api/admin/'+path,{method:body===undefined?'GET':'POST',headers:{cookie,origin,'content-type':'application/json','x-csrf-token':csrf},body:body===undefined?undefined:JSON.stringify(body)}),env,services);
}
async function login(){
 const env={ADMIN_DB:new D1(),ADMIN_USERNAME:'custom-cost-owner',ADMIN_PASSWORD:'custom-cost-password-123456',ADMIN_SESSION_SECRET:'custom-cost-session-secret-12345678901234567890'};
 const response=await adminFetch(new Request(base+'/login',{method:'POST',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(response.status,303);const cookie=response.headers.get('set-cookie').split(';')[0];
 const state=await (await request(env,cookie,'state')).json();return {env,cookie,csrf:state.csrf};
}
const costs=()=>({...COST_DEFAULTS,components:[],custom_profiles:[{id:'calca',label:'Calça de moletom',unit_cost_cents:3500}],custom_assignments:Array.from({length:1000},(_,index)=>({item_id:String(index+1),model_id:null,profile_id:'calca'}))});

test('the production cost API accepts a full product assignment catalog while preserving owner, origin, CSRF and body limits',async()=>{
 const {env,cookie,csrf}=await login();
 try{
  const body={revision:1,values:costs()};assert.ok(JSON.stringify(body).length>16384);
  for(const [changes,status] of [[{cookie:''},401],[{cookie:'mls_session=restricted'},401],[{csrf:''},403],[{origin:'https://foreign.example'},403]]){
   const response=await request(env,changes.cookie??cookie,'production-costs',{body,csrf,origin:base,...changes});assert.equal(response.status,status);
  }
  assert.equal((await (await request(env,cookie,'production-costs')).json()).revision,1);
  const response=await request(env,cookie,'production-costs',{body,csrf});assert.equal(response.status,200);
  const saved=await response.json();assert.equal(saved.revision,2);assert.equal(saved.values.custom_assignments.length,1000);
  const read=await (await request(env,cookie,'production-costs')).json();assert.deepEqual(read.values,saved.values);
  const oversized={revision:2,values:{...costs(),padding:'x'.repeat(196608)}};
  assert.equal((await request(env,cookie,'production-costs',{body:oversized,csrf})).status,413);
  assert.equal((await (await request(env,cookie,'production-costs')).json()).revision,2);
  assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM production_costs_audit').get().n,2);
 }finally{env.ADMIN_DB.db.close();}
});

test('the order API uses the custom cost and excludes its legacy kit margin without rewriting saved observations',async()=>{
 const {env,cookie,csrf}=await login();
 try{
  const bindings=['1','2'].map(model_id=>({item_id:'101',model_id,male_size:'M',female_size:'G',selling_unit:'ONE_MALE_ONE_FEMALE_KIT',operator_confirmed:true}));
  assert.equal((await request(env,cookie,'variant-bindings',{body:{revision:1,bindings},csrf})).status,200);
  const values={...costs(),custom_assignments:[{item_id:'101',model_id:null,profile_id:'calca'}]};
  assert.equal((await request(env,cookie,'production-costs',{body:{revision:1,values},csrf})).status,200);
  const cutoff=new Date(Date.now()-10800000).toISOString().replace('Z','-03:00');
  const frame={schema:'shop_order_items_v1',shop_id:1178167501,date:cutoff.slice(0,10),timezone:'America/Sao_Paulo',through_at:cutoff,day_partial:true,pagination_complete:true,pages_read:1,orders_in_api_window:2,orders_with_details:2,duplicate_rows:0,catalog_units:3,rows:[{item_id:'101',model_id:'1',order_status:'READY_TO_SHIP',quantity:2,line_count:1},{item_id:'101',model_id:'2',order_status:'UNPAID',quantity:1,line_count:1}],currency_status:'BRL_ALL_CONFIRMED',currency_counts:{BRL:2,OTHER:0,UNKNOWN:0},source:'shopee_get_order_list_and_detail',transport_http:200,api_error:'NO',count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_NO_STATUS_FILTER',order_status_filter:'NONE',dashboard_counter_reconciled:false,order_status_verified:true};
  const services={getOrderItems:async()=>frame};
  const response=await request(env,cookie,'order-items',{services});assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.status,'AVAILABLE');assert.equal(result.production_cost_reference.total_cents,10500);
  assert.ok(result.production_cost_reference.variants.every(row=>row.cost_source==='CUSTOM_PROFILE'&&row.unit_cost_cents===3500));
  assert.equal(result.margin_reference.total_cents,null);assert.equal(result.margin_reference.known_subset_cents,0);assert.equal(result.margin_reference.unmapped_quantity,3);
  const observation=await request(env,cookie,'order-observations',{body:{},csrf,services});assert.equal(observation.status,409);assert.equal((await observation.json()).error,'OBSERVATION_CUSTOM_COST_MARGIN_UNAVAILABLE');
  assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM order_observations').get().n,0);
 }finally{env.ADMIN_DB.db.close();}
});
