import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch} from '../src/admin.mjs';
import {D1} from './sqlite-d1.mjs';

const origin='https://app.example.test';
async function login(){
 const env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'catalog-owner-session-'+ 's'.repeat(32),ADMIN_USERNAME:'catalog-owner',ADMIN_PASSWORD:'catalog-password-fixture-123456'};
 const response=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(response.status,303);const cookie=response.headers.get('set-cookie').split(';')[0],state=await(await adminFetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();
 return {env,cookie,csrf:state.csrf};
}
function request(auth,path,{body,method=body?'POST':'GET',cookie=auth.cookie,csrf=auth.csrf,requestOrigin=origin}={}){
 return new Request(origin+'/api/admin/'+path,{method,headers:{cookie,origin:requestOrigin,'x-csrf-token':csrf,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
}
function catalog(itemId,child=false){
 const size=child?'4':'G';
 return {schema:'variant_catalog_v1',checked_at:Math.floor(Date.now()/1000),products:[{item_id:itemId,catalog_fingerprint:(child?'b':'a').repeat(64),bindings:child?[]:[{item_id:itemId,model_id:'1',size}],unresolved_count:child?1:0,...(child?{}:{selling_unit:'SINGLE_GARMENT'}),cost_catalog:{schema:'product_cost_catalog_v1',product_name:child?'Camiseta infantil <verde>':'Camiseta unissex estampada',variants:[{model_id:'1',attributes:[{name:'Tamanho',value:size}]}]}}]};
}

test('catalogue work is owner-only, scoped and CSRF protected before any provider read',async t=>{
 const auth=await login();t.after(()=>auth.env.ADMIN_DB.db.close());let reads=0;const services={getFinanceVariantCatalog:async()=>{reads++;throw Error('PRIVATE_PROVIDER_TOKEN');}};
 const invoke=(path,options)=>adminFetch(request(auth,path,options),auth.env,services);
 assert.equal((await invoke('catalog-classification',{cookie:''})).status,401);
 assert.equal((await invoke('catalog-classification',{cookie:'mls_session=review'})).status,401);
 for(const options of [{csrf:''},{requestOrigin:'https://foreign.invalid'}])assert.equal((await invoke('catalog-classification/sync',{body:{},...options})).status,403);
 assert.equal((await invoke('catalog-classification/sync',{method:'GET'})).status,405);
 for(const body of [{shop_id:1178167501},{item_ids:['101']}])assert.equal((await invoke('catalog-classification/sync',{body})).status,400);
 for(const query of ['?limit=101','?limit=01','?offset=-1','?limit=1&limit=2','?shop_id=1','?item_ids=101,101','?item_ids=x','?item_ids='])assert.equal((await invoke('catalog-classification'+query)).status,400,query);
 for(const body of [{item_ids:['bad']},{item_ids:['101'],shop_id:1},{}])assert.equal((await invoke('catalog-classification/enqueue',{body})).status,400);
 assert.equal(reads,0);assert.equal(auth.env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM catalog_classification_jobs').get().n,0);
});

test('queued adult and child products use the same private worker and expose real type and size metadata',async t=>{
 const auth=await login();t.after(()=>auth.env.ADMIN_DB.db.close());const calls=[],services={getFinanceVariantCatalog:async(env,input)=>{calls.push(input);return catalog(input.item_ids[0],input.item_ids[0]==='102');}};
 const invoke=async(path,body)=>{const response=await adminFetch(request(auth,path,{body}),auth.env,services);assert.equal(response.status,200,await response.clone().text());return response.json();};
 const queued=await invoke('catalog-classification/enqueue',{item_ids:['101','102']});assert.equal(queued.counts.queued,2);assert.equal(queued.enabled,true);
 for(let index=0;index<2;index++){const value=await invoke('catalog-classification/sync',{});assert.equal(value.status,'PROGRESSED');assert.equal(value.processed.length,1);}
 const state=await invoke('catalog-classification?item_ids=101,102&limit=20&offset=0');
 assert.equal(state.products.length,2);assert.ok(state.products.every(row=>row.status==='MATCHED'&&row.resolved_count===1&&row.variants[0].reason===null));
 assert.equal(state.products.find(row=>row.item_id==='102').variants[0].model_name,'4');assert.equal(state.products.find(row=>row.item_id==='102').product_name,'Camiseta infantil <verde>');
 assert.deepEqual(calls,[{item_ids:['101'],selling_unit:'AUTO',include_cost_catalog:true},{item_ids:['102'],selling_unit:'AUTO',include_cost_catalog:true}]);
 assert.equal(auth.env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n,1,'automatic catalogue work never rewrites the manual binding document');
 assert.equal(auth.env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM catalog_classification_variants').get().n,2);
 const raw=JSON.stringify(state);for(const field of ['access_token','refresh_token','order_sn','buyer'])assert.ok(!raw.includes(field));
});

test('a failed product does not block the next queued product and a policy pause also stops browser work',async t=>{
 const auth=await login();t.after(()=>auth.env.ADMIN_DB.db.close());const calls=[],services={getFinanceVariantCatalog:async(env,input)=>{const id=input.item_ids[0];calls.push(id);if(id==='101')throw Error('PRIVATE_PROVIDER_TOKEN');return catalog(id);}};
 const invoke=async(path,body)=>{const response=await adminFetch(request(auth,path,{body}),auth.env,services);assert.equal(response.status,200,await response.clone().text());return response.json();};
 await invoke('catalog-classification/enqueue',{item_ids:['101','102','103']});
 const failed=await invoke('catalog-classification/sync',{});assert.deepEqual(failed.failed,['101']);assert.ok(!JSON.stringify(failed).includes('PRIVATE_PROVIDER_TOKEN'));
 const next=await invoke('catalog-classification/sync',{});assert.deepEqual(next.processed,['102']);
 const policy=await invoke('finance/sync-state');await invoke('finance/sync-policy',{revision:policy.revision,enabled:false});
 const paused=await invoke('catalog-classification/sync',{});assert.equal(paused.status,'PAUSED');assert.equal(paused.state.enabled,false);assert.deepEqual(calls,['101','102']);
});
