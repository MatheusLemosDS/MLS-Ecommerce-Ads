import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';
import {enqueueCatalogClassifications} from '../src/catalog-classification.mjs';

for(const minify of [false,true])test(`deployable automatic classification works without a browser and keeps private cost controls after compilation (minify=${minify})`,async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const origin='https://app.catalog.test',env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'compiled-catalog-session-12345678901234567890',ADMIN_USERNAME:'catalog-fixture-owner',ADMIN_PASSWORD:'catalog-fixture-password-123456',APP_INTERNAL_SECRET:'fixture-private-catalog-secret'},previousFetch=globalThis.fetch,reads=[];
 globalThis.fetch=async request=>{
  const url=new URL(request.url);
  if(url.pathname!=='/internal/shopee/finance/variant-catalog')return Response.json({error:'UNAVAILABLE'},{status:503});
  assert.equal(url.origin,'https://auth.brazacommerce.com.br');assert.equal(request.headers.get('x-braza-app-key'),env.APP_INTERNAL_SECRET);assert.equal(request.headers.has('cookie'),false);
  const input=await request.json();assert.equal(input.item_ids.length,1);assert.equal(input.include_cost_catalog,true);assert.equal(input.selling_unit,'AUTO');const id=input.item_ids[0],child=id==='202';reads.push(id);
  return Response.json({schema:'variant_catalog_v1',checked_at:Math.floor(Date.now()/1000),products:[{item_id:id,catalog_fingerprint:(child?'b':'a').repeat(64),bindings:child?[]:[{item_id:id,model_id:'0',size:'G'}],unresolved_count:child?1:0,...(child?{}:{selling_unit:'SINGLE_GARMENT'}),cost_catalog:{schema:'product_cost_catalog_v1',product_name:child?'Camiseta infantil Estrela':'Camiseta adulta Estrela',variants:[{model_id:'0',attributes:[{name:'Tamanho',value:child?'4':'G'}]}]}}]});
 };
 try{
  await enqueueCatalogClassifications(env,['201','202']);
  // Bootstrap and financial work have separate bounded lanes. The catalogue
  // still advances automatically after the failed financial source backs off.
  for(let tick=0;tick<6&&reads.length<2;tick++){const tasks=[];await worker.scheduled({},env,{waitUntil(task){tasks.push(task);}});await Promise.all(tasks);}
  assert.deepEqual(reads,['201','202'],'the cron advances classification despite an unavailable financial import and no owner session');
  assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM catalog_classification_variants').get().n,2);
  assert.equal((await worker.fetch(new Request(origin+'/api/admin/catalog-classification'),env)).status,401);
  const login=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
  const get=async path=>{const response=await worker.fetch(new Request(origin+'/api/admin/'+path,{headers:{cookie}}),env);assert.equal(response.status,200,await response.clone().text());return response.json();};
  const state=await get('state'),catalog=await get('catalog-classification?item_ids=201,202&limit=20&offset=0');
  assert.equal(catalog.enabled,true);assert.equal(catalog.products.length,2);assert.ok(catalog.products.every(row=>row.status==='MATCHED'&&row.resolved_count===1));
  assert.equal(catalog.products.find(row=>row.item_id==='202').variants[0].model_name,'4');assert.ok(!JSON.stringify(catalog).includes(env.APP_INTERNAL_SECRET));
  const html=await(await worker.fetch(new Request(origin+'/admin',{headers:{cookie}}),env)).text();for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);assert.match(html,/catalog-classification\/sync/);
  const policy=await get('finance/sync-state');
  const post=(path,body)=>worker.fetch(new Request(origin+'/api/admin/'+path,{method:'POST',headers:{origin,cookie,'content-type':'application/json','x-csrf-token':state.csrf},body:JSON.stringify(body)}),env);
  assert.equal((await post('catalog-classification/enqueue',{item_ids:['203']})).status,200);
  assert.equal((await post('finance/sync-policy',{revision:policy.revision,enabled:false})).status,200);
  const paused=await(await post('catalog-classification/sync',{})).json();assert.equal(paused.status,'PAUSED');assert.equal(paused.state.enabled,false);assert.deepEqual(reads,['201','202']);
 }finally{globalThis.fetch=previousFetch;env.ADMIN_DB.db.close();}
});
