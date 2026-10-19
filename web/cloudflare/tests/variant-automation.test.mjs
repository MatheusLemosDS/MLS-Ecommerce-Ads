import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch} from '../src/admin.mjs';
import {captureObservation,readObservation} from '../src/order-observations.mjs';
import {D1} from './sqlite-d1.mjs';

const base='https://app.example.test';
const fingerprint='a'.repeat(64);
const manual=(item_id='101',model_id='1',male_size='M',female_size='G')=>({item_id,model_id,male_size,female_size,selling_unit:'ONE_MALE_ONE_FEMALE_KIT',operator_confirmed:true});
const automatic=(item_id='101',model_id='1',male_size='M',female_size='G',catalog_fingerprint=fingerprint)=>({...manual(item_id,model_id,male_size,female_size),operator_confirmed:false,source:'CATALOG_VARIATION_AXES',catalog_fingerprint});
const resolved=(item_id='101',model_id='1',male_size='M',female_size='G')=>({item_id,model_id,male_size,female_size});
const product=(item_id='101',bindings=[resolved(item_id)],unresolved_count=0,catalog_fingerprint=fingerprint)=>({item_id,catalog_fingerprint,bindings,unresolved_count});
const catalog=(products=[product()])=>({schema:'variant_catalog_v1',checked_at:Math.floor(Date.now()/1000),products});
const snapshot=env=>({
 state:env.ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_state').all(),
 audit:env.ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_audit ORDER BY revision').all(),
 settings:env.ADMIN_DB.db.prepare('SELECT * FROM admin_settings').all(),
 costs:env.ADMIN_DB.db.prepare('SELECT * FROM production_costs_state').all(),
 jobs:env.ADMIN_DB.db.prepare('SELECT * FROM hermes_jobs').all(),
});
function call(fixture,path,body,services={},options={}){
 const method=options.method||(body===undefined?'GET':'POST');
 return adminFetch(new Request(base+'/api/admin/'+path,{method,headers:{cookie:options.cookie??fixture.cookie,origin:options.origin??base,'content-type':'application/json','x-csrf-token':options.csrf??fixture.csrf},body:['GET','HEAD'].includes(method)?undefined:JSON.stringify(body)}),fixture.env,services);
}
async function login(){
 const env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'fixture-admin-session-1234567890123456',ADMIN_USERNAME:'fixture-admin',ADMIN_PASSWORD:'fixture-password-123456'};
 const response=await adminFetch(new Request(base+'/admin/login',{method:'POST',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(response.status,303);const cookie=response.headers.get('set-cookie').split(';')[0];
 const state=await(await adminFetch(new Request(base+'/api/admin/state',{headers:{cookie}}),env)).json();
 return {env,cookie,csrf:state.csrf};
}
function nativeFrame(){
 const cutoff=new Date(Date.now()-10800000).toISOString().replace('Z','-03:00');
 return {schema:'shop_order_items_v1',shop_id:1178167501,date:cutoff.slice(0,10),timezone:'America/Sao_Paulo',through_at:cutoff,day_partial:true,pagination_complete:true,pages_read:1,orders_in_api_window:2,orders_with_details:2,duplicate_rows:0,catalog_units:3,rows:[{item_id:'101',model_id:'1',order_status:'READY_TO_SHIP',quantity:2,line_count:1},{item_id:'101',model_id:'2',order_status:'UNPAID',quantity:1,line_count:1}],currency_status:'BRL_ALL_CONFIRMED',currency_counts:{BRL:2,OTHER:0,UNKNOWN:0},source:'shopee_get_order_list_and_detail',transport_http:200,api_error:'NO',count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_NO_STATUS_FILTER',order_status_filter:'NONE',dashboard_counter_reconciled:false,order_status_verified:true};
}

test('automation requires the signed admin session, matching origin and CSRF before any provider call',async()=>{
 const fixture=await login(),before=snapshot(fixture.env);let reads=0;const services={getFinanceVariantCatalog:async()=>{reads++;return catalog();}};
 for(const [options,status] of [[{cookie:''},401],[{cookie:'mls_session=review'},401],[{origin:'https://other.example.test'},403],[{origin:''},403],[{csrf:''},403],[{csrf:'wrong'},403]]){
  const response=await call(fixture,'variant-bindings/automate',{revision:1,item_ids:['101']},services,options);
  assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');
 }
 assert.equal(reads,0);assert.deepEqual(snapshot(fixture.env),before);
});

test('query, invalid selection, wrong methods and stale revision are rejected before catalog access',async()=>{
 const fixture=await login(),before=snapshot(fixture.env);let reads=0;const services={getFinanceVariantCatalog:async()=>{reads++;return catalog();}};
 const bad=[{},null,[],{revision:1,item_ids:[]},{revision:1,item_ids:['101','102','103','104']},{revision:1,item_ids:['101','101']},{revision:1,item_ids:[101]},{revision:1,item_ids:['0']},{revision:1,item_ids:['01']},{revision:1,item_ids:['101 ']},{revision:1,item_ids:['1'.repeat(21)]},{revision:1,item_ids:['101'],extra:true},{revision:'1',item_ids:['101']},{revision:0,item_ids:['101']},{revision:1.5,item_ids:['101']},{revision:2147483647,item_ids:['101']}];
 for(const body of bad)assert.equal((await call(fixture,'variant-bindings/automate',body,services)).status,400,JSON.stringify(body));
 assert.equal((await call(fixture,'variant-bindings/automate?item_id=101',{revision:1,item_ids:['101']},services)).status,400);
 assert.ok((await call(fixture,'variant-bindings/automate',undefined,services)).status>=400);
 assert.equal((await call(fixture,'variant-bindings/automate',{revision:2,item_ids:['101']},services)).status,409);
 assert.equal(reads,0);assert.deepEqual(snapshot(fixture.env),before);
});

test('trusted catalog associations save exact automatic provenance and return the ordinary versioned state',async()=>{
 const fixture=await login(),before=snapshot(fixture.env);let reads=0;
 const response=await call(fixture,'variant-bindings/automate',{revision:1,item_ids:['101']},{getFinanceVariantCatalog:async(env,selection)=>{assert.equal(env,fixture.env);assert.deepEqual(selection,{item_ids:['101']});reads++;return catalog([product('101',[resolved('101','0','GG','G2'),resolved('101','1')])]);}});
 assert.equal(response.status,200);const saved=await response.json();
 assert.deepEqual(Object.keys(saved).sort(),['revision','bindings','updated_at'].sort());assert.equal(saved.revision,2);
 assert.deepEqual(saved.bindings,[automatic('101','0','GG','G2'),automatic()]);assert.equal(reads,1);
 const after=snapshot(fixture.env);assert.equal(after.audit.length,2);assert.equal(after.audit[1].actor,'catalog-automation:admin');assert.deepEqual(JSON.parse(after.audit[1].payload),saved.bindings);
 for(const key of ['settings','costs','jobs'])assert.deepEqual(after[key],before[key]);
});

test('malformed, mismatched and private-extra catalog responses never persist or expose provider content',async()=>{
 const fixture=await login(),before=snapshot(fixture.env);
 const changes=[null,{},catalog([]),catalog([product('999')]),catalog([product(),product()]),{...catalog(),access_token:'PRIVATE_TOKEN'},catalog([{...product(),buyer:'PRIVATE_BUYER'}]),catalog([product('101',[{...resolved(),secret:'PRIVATE_SECRET'}])]),catalog([product('101',[resolved('999')])]),catalog([product('101',[resolved(),resolved()])]),catalog([product('101',[resolved('101','01')])]),catalog([product('101',[resolved('101','1','XS')])]),catalog([product('101',[resolved()],-1)]),catalog([product('101',[resolved()],0,'A'.repeat(64))])];
 for(const value of changes){const response=await call(fixture,'variant-bindings/automate',{revision:1,item_ids:['101']},{getFinanceVariantCatalog:async()=>value});assert.equal(response.status,503);assert.ok(!JSON.stringify(await response.json()).includes('PRIVATE'));assert.deepEqual(snapshot(fixture.env),before);}
 const thrown=await call(fixture,'variant-bindings/automate',{revision:1,item_ids:['101']},{getFinanceVariantCatalog:async()=>{throw Error('PRIVATE_NETWORK_FAILURE');}});assert.equal(thrown.status,503);assert.ok(!JSON.stringify(await thrown.json()).includes('PRIVATE'));assert.deepEqual(snapshot(fixture.env),before);
 assert.equal((await call(fixture,'variant-bindings/automate',{revision:1,item_ids:['101']})).status,503);assert.deepEqual(snapshot(fixture.env),before);
});

test('manual choices win, unrelated links survive, and refreshed ambiguous models lose stale automatic sizes',async()=>{
 const fixture=await login();
 await call(fixture,'variant-bindings',{revision:1,bindings:[manual('101','1','G1','G3'),manual('999','0','P','GG')]});
 const first=await(await call(fixture,'variant-bindings/automate',{revision:2,item_ids:['101','202']},{getFinanceVariantCatalog:async()=>catalog([product('101',[resolved('101','1'),resolved('101','2','M','G1')]),product('202',[resolved('202','0','GG','GG')])])})).json();
 assert.equal(first.revision,3);assert.deepEqual(first.bindings,[manual('101','1','G1','G3'),automatic('101','2','M','G1'),automatic('202','0','GG','GG'),manual('999','0','P','GG')]);
 const second=await(await call(fixture,'variant-bindings/automate',{revision:3,item_ids:['101']},{getFinanceVariantCatalog:async()=>catalog([product('101',[resolved('101','1','P','P')],1,'b'.repeat(64))])})).json();
 assert.equal(second.revision,4);assert.deepEqual(second.bindings,[manual('101','1','G1','G3'),automatic('202','0','GG','GG'),manual('999','0','P','GG')]);
});

test('a concurrent manual edit after catalog read is protected by the final revision CAS',async()=>{
 const fixture=await login();let reads=0;
 const response=await call(fixture,'variant-bindings/automate',{revision:1,item_ids:['101']},{getFinanceVariantCatalog:async()=>{reads++;const saved=await call(fixture,'variant-bindings',{revision:1,bindings:[manual('101','1','GG','G1')]});assert.equal(saved.status,200);return catalog();}});
 assert.equal(response.status,409);assert.equal(reads,1);
 const current=await(await call(fixture,'variant-bindings')).json();assert.equal(current.revision,2);assert.deepEqual(current.bindings,[manual('101','1','GG','G1')]);assert.equal(snapshot(fixture.env).audit.length,2);
});

test('browser full replacement can retain genuine automatic rows and make manual overrides, but cannot forge provenance',async()=>{
 const fixture=await login();await call(fixture,'variant-bindings/automate',{revision:1,item_ids:['101']},{getFinanceVariantCatalog:async()=>catalog()});
 const before=snapshot(fixture.env);
 for(const bindings of [[automatic('101','1','G1','G2')],[automatic('101','2')],[automatic('101','1','M','G','b'.repeat(64))]])assert.equal((await call(fixture,'variant-bindings',{revision:2,bindings})).status,400);
 assert.deepEqual(snapshot(fixture.env),before);
 assert.equal((await call(fixture,'variant-bindings',{revision:2,bindings:[automatic(),manual('102','0','P','GG')]})).status,200);
 assert.equal((await call(fixture,'variant-bindings',{revision:3,bindings:[manual('101','1','G1','G3')]})).status,200);
 assert.deepEqual((await(await call(fixture,'variant-bindings')).json()).bindings,[manual('101','1','G1','G3')]);
});

test('automatic bindings feed reference arithmetic and immutable observations without changing legacy manual records',async()=>{
 const fixture=await login();await call(fixture,'variant-bindings',{revision:1,bindings:[manual()]});
 const first=(await captureObservation(fixture.env,async()=>nativeFrame(),'admin')).observation;
 assert.deepEqual(first.bindings_snapshot.bindings,[manual()]);assert.equal(first.margin_reference.total_cents,null);
 await call(fixture,'variant-bindings/automate',{revision:2,item_ids:['101']},{getFinanceVariantCatalog:async()=>catalog([product('101',[resolved('101','1','G3','G3'),resolved('101','2','G1','M')])])});
 const references=await(await call(fixture,'order-items',undefined,{getOrderItems:async()=>nativeFrame()})).json();
 assert.equal(references.margin_reference.total_cents,5260);assert.equal(references.production_cost_reference.total_cents,9840);assert.equal(references.production_cost_reference.gross_profit_cents,null);assert.equal(references.margin_reference.economic_status,'UNKNOWN');
 const second=(await captureObservation(fixture.env,async()=>nativeFrame(),'admin')).observation;
 assert.notEqual(second.id,first.id);assert.deepEqual(second.bindings_snapshot.bindings,[manual(),automatic('101','2','G1','M')]);assert.equal(second.margin_reference.total_cents,5260);
 assert.deepEqual(await readObservation(fixture.env,first.id),first);assert.deepEqual(await readObservation(fixture.env,second.id),second);
 assert.equal(fixture.env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM hermes_jobs').get().n,0);assert.equal(fixture.env.ADMIN_DB.db.prepare('SELECT revision FROM production_costs_state').get().revision,1);assert.equal(fixture.env.ADMIN_DB.db.prepare('SELECT revision FROM admin_settings').get().revision,1);
});

test('1000 automatic links with long canonical IDs fit both route persistence and bounded historic snapshots',async()=>{
 const fixture=await login(),item_id='99999999999999999999';
 const bindings=Array.from({length:1000},(_,index)=>resolved(item_id,String(99999999999999999000n+BigInt(index)),'G3','G3'));
 const response=await call(fixture,'variant-bindings/automate',{revision:1,item_ids:[item_id]},{getFinanceVariantCatalog:async()=>catalog([product(item_id,bindings)])});assert.equal(response.status,200);assert.equal((await response.json()).bindings.length,1000);
 const source=nativeFrame();Object.assign(source,{rows:bindings.map(value=>({item_id,model_id:value.model_id,order_status:'INVOICE_PENDING',quantity:1,line_count:1})),catalog_units:1000,orders_in_api_window:1000,orders_with_details:1000,pages_read:10,currency_counts:{BRL:1000,OTHER:0,UNKNOWN:0}});
 const observation=(await captureObservation(fixture.env,async()=>source,'admin')).observation;
 assert.equal(observation.bindings_snapshot.bindings.length,1000);assert.equal(observation.margin_reference.total_cents,2070000);
 const payload=fixture.env.ADMIN_DB.db.prepare('SELECT payload FROM order_observations WHERE id=?').get(observation.id).payload;assert.ok(Buffer.byteLength(payload)>524288);assert.ok(Buffer.byteLength(payload)<=786432);assert.deepEqual(await readObservation(fixture.env,observation.id),observation);
});

test('future conflicting audit prevents any automatic state update or partially recorded revision',async()=>{
 const fixture=await login();const prior=await(await call(fixture,'variant-bindings')).json();fixture.env.ADMIN_DB.db.prepare('INSERT INTO variant_bindings_audit(revision,payload,actor,created_at) VALUES(2,?,?,?)').run('[]','existing-audit',prior.updated_at);
 const before=snapshot(fixture.env);const response=await call(fixture,'variant-bindings/automate',{revision:1,item_ids:['101']},{getFinanceVariantCatalog:async()=>catalog()});assert.ok(response.status>=500);assert.deepEqual(snapshot(fixture.env),before);
});

test('unrecognized catalogue returns bounded administrator review without storing labels or bumping unchanged binding state',async()=>{
 const fixture=await login(),before=snapshot(fixture.env);
 const diagnostic={axes:[{name:'Tamanho do casal',options:['Masc G + Fem M','Masc P + Fem GG'],option_count:2}],model_count:2,reasons:[{code:'AXES_NOT_RECOGNIZED',count:2}]};
 const report=catalog([{...product('101',[],2),diagnostic}]);
 for(let index=0;index<2;index++){
  const response=await call(fixture,'variant-bindings/automate',{revision:1,item_ids:['101']},{getFinanceVariantCatalog:async()=>report});
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.revision,1);assert.deepEqual(result.bindings,[]);
  assert.deepEqual(result.catalog_review,report);assert.deepEqual(snapshot(fixture.env),before);
 }
 for(const table of ['variant_bindings_state','variant_bindings_audit'])assert.ok(!JSON.stringify(fixture.env.ADMIN_DB.db.prepare('SELECT * FROM '+table).all()).includes('Masc G + Fem M'));
});

test('catalogue review with malformed or provider-extra diagnostics cannot bypass projection or persist associations',async()=>{
 const fixture=await login(),before=snapshot(fixture.env);
 const diagnostic={axes:[{name:'Tamanho masculino',options:['M'],option_count:1},{name:'Tamanho feminino',options:['G'],option_count:1}],model_count:1,reasons:[]};
 for(const value of [{...diagnostic,access_token:'PRIVATE_DIAGNOSTIC_TOKEN'}, {...diagnostic,model_count:2}, {...diagnostic,axes:[{name:'Tamanho',options:['M'],option_count:1,buyer:'PRIVATE_BUYER'}]}, {...diagnostic,reasons:[{code:'PRIVATE_PROVIDER_MESSAGE',count:1}]}]){
  const response=await call(fixture,'variant-bindings/automate',{revision:1,item_ids:['101']},{getFinanceVariantCatalog:async()=>catalog([{...product(),diagnostic:value}])});
  assert.equal(response.status,503);assert.ok(!JSON.stringify(await response.json()).includes('PRIVATE'));assert.deepEqual(snapshot(fixture.env),before);
 }
});
