import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';

for(const minify of [false,true])test(`the deployable App learns sibling costs from one saved correction (minify=${minify})`,async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const origin='https://app.learning.test',env={ADMIN_DB:new D1(),ADMIN_USERNAME:'learning-owner',ADMIN_PASSWORD:'fixture-learning-password-123456',ADMIN_SESSION_SECRET:'fixture-learning-secret-12345678901234567890',APP_INTERNAL_SECRET:'fixture-learning-internal-key'},savedFetch=globalThis.fetch;let reads=0;
 globalThis.fetch=async request=>{
  assert.equal(request.url,'https://auth.brazacommerce.com.br/internal/shopee/finance/variant-catalog');assert.equal(request.headers.get('x-braza-app-key'),env.APP_INTERNAL_SECRET);assert.equal(request.headers.has('cookie'),false);assert.deepEqual(await request.json(),{item_ids:['101'],selling_unit:'AUTO',include_cost_catalog:true});reads++;
  return Response.json({schema:'variant_catalog_v1',checked_at:Math.floor(Date.now()/1000),products:[{item_id:'101',catalog_fingerprint:'f'.repeat(64),bindings:[],unresolved_count:7,cost_catalog:{schema:'product_cost_catalog_v1',product_name:'Produto Verde de lançamento',variants:['4','6','8','10','12','14','16'].map((size,index)=>({model_id:String(index),attributes:[{name:'Tamanho',value:size}]}))}}]});
 };
 try{
  const login=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0],state=await(await worker.fetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();
  const post=(path,body)=>worker.fetch(new Request(origin+'/api/admin/'+path,{method:'POST',headers:{origin,cookie,'content-type':'application/json','x-csrf-token':state.csrf},body:JSON.stringify(body)}),env);
  assert.equal((await post('cost-rules/assignments',{revision:1,assignments:[{item_id:'101',model_id:'0',rule_id:'camiseta-infantil',size:'4'}]})).status,200);
  const response=await post('cost-rules/sync',{item_ids:['101'],force:true});assert.equal(response.status,200);const learned=await response.json();assert.equal(learned.learning[0].status,'LEARNED');assert.equal(learned.learning[0].matched_variants,7);assert.equal(learned.learning[0].evidence_count,1);assert.equal(learned.matched_variants.length,7);
  const rules=await(await worker.fetch(new Request(origin+'/api/admin/cost-rules',{headers:{cookie}}),env)).json();assert.equal(rules.values.assignments.length,1);assert.equal(rules.values.rules[0].unit_cost_cents,1250);assert.equal(reads,1);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM variant_bindings_audit').get().n,1,'the initial binding state is preserved without adding numeric adult links');
 }finally{globalThis.fetch=savedFetch;env.ADMIN_DB.db.close();}
});
