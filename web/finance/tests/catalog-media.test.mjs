import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {runFinanceVariantCatalog} from '../src/variant-catalog.mjs';
import {projectVariantCatalog} from '../src/variant-catalog-frame.mjs';
import {deriveCatalogMediaImage,projectCatalogMediaFrame} from '../src/catalog-media-frame.mjs';
import {createFinanceWorker} from '../src/connection-worker.mjs';
import {forwardFinancePaymentSample} from '../src/auth-router.mjs';
import {getFinanceVariantCatalog} from '../../cloudflare/src/app-finance-sample.mjs';
import {CATALOG_MEDIA_FIXTURE_TIME as stamp,CATALOG_MEDIA_FIXTURE_PHOTO as photo,catalogMediaFixture,catalogMediaLegacyFixture} from './catalog-media-fixture.mjs';

test('photo projection permits only returned current product photos and never guesses a URL',()=>{
 assert.deepEqual(deriveCatalogMediaImage({item_id:101}),{state:'NOT_CAPTURED',image_url:null});
 for(const image of [null,{}, {image_url_list:[]},{image_url_list:null}])assert.equal(deriveCatalogMediaImage({image}).state,'NOT_CAPTURED');
 assert.deepEqual(deriveCatalogMediaImage({image:{image_url_list:[photo]}}),{state:'AVAILABLE',image_url:photo});
 for(const url of ['http://down-br.img.susercontent.com/file/a','https://attacker.invalid/file/a','https://down-br.img.susercontent.com.attacker.invalid/file/a','https://u:p@down-br.img.susercontent.com/file/a','https://down-br.img.susercontent.com:444/file/a','https://down-br.img.susercontent.com/file/a?token=PRIVATE','https://down-br.img.susercontent.com/file/a#fragment','data:image/png,abc','javascript:alert(1)','//down-br.img.susercontent.com/file/a',photo+'\n','https://down-br.img.susercontent.com/not-a-file/a'])assert.equal(deriveCatalogMediaImage({image:{image_url_list:[url]}}).state,'INVALID',url);
 const getter={};Object.defineProperty(getter,'image',{enumerable:true,get(){throw Error('MUST_NOT_EXECUTE');}});assert.equal(deriveCatalogMediaImage(getter).state,'INVALID');
 assert.equal(projectCatalogMediaFrame(catalogMediaFixture(),projectVariantCatalog)?.media[0].image_url,photo);
});

test('media envelope keeps exact catalogue identity, coverage and closed fields',()=>{
 const value=catalogMediaFixture();assert.deepEqual(projectCatalogMediaFrame(value,projectVariantCatalog),value);
 for(const mutate of [v=>v.media[0].item_id='102',v=>v.media[0].catalog_fingerprint='b'.repeat(64),v=>v.media[0].checked_at++,v=>v.media.push({...v.media[0]}),v=>v.media[0].buyer='PRIVATE',v=>v.media[0].state='OTHER',v=>v.media[0].image_url='https://attacker.invalid/file/a',v=>v.media[0].basis='PRINT_ARTWORK',v=>v.extra=true,v=>delete v.catalog.products[0].cost_catalog]){
  const sample=structuredClone(value);mutate(sample);assert.equal(projectCatalogMediaFrame(sample,projectVariantCatalog),null);
 }
 for(const state of ['NOT_CAPTURED','INVALID']){const sample=catalogMediaFixture({state});assert.ok(projectCatalogMediaFrame(sample,projectVariantCatalog));sample.media[0].image_url=photo;assert.equal(projectCatalogMediaFrame(sample,projectVariantCatalog),null);}
});

test('existing catalogue reads capture a photo without adding provider calls or changing the legacy fingerprint',async t=>{
 const db=new D1();t.after(()=>db.db.close());const now=()=>stamp*1000,env={FINANCE_DB:db,FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64'),FINANCE_CONNECTION_ENABLED:'true',SHOPEE_FINANCE_PARTNER_KEY:'SYNTHETIC-KEY'};
 const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:'SYNTHETIC-ACCESS',refresh_token:'SYNTHETIC-REFRESH',expires_at:stamp+500});const before=await store.readTokens();
 async function run(includeMedia,image){const calls=[],result=await runFinanceVariantCatalog(env,{now,item_ids:['101'],selling_unit:'AUTO',include_cost_catalog:true,...(includeMedia===undefined?{}:{includeMedia}),fetchImpl:async request=>{const url=new URL(request.url);calls.push({method:request.method,origin:url.origin,path:url.pathname});return url.pathname==='/api/v2/product/get_item_base_info'?Response.json({error:'',response:{item_list:[{item_id:101,item_name:'Produto sintético',...(image===undefined?{}:{image}),description:'PRIVATE_DO_NOT_EXPORT'}]}}):Response.json({error:'',response:{tier_variation:[{name:'Cor',option_list:[{option:'Azul'}]},{name:'Tamanho',option_list:[{option:'M'}]}],model:[{model_id:1,tier_index:[0,0]}]}});}});return {calls,result};}
 const legacy=await run(undefined,{image_url_list:[photo]}),present=await run(true,{image_url_list:[photo]}),missing=await run(true,undefined),invalid=await run(true,{image_url_list:['https://attacker.invalid/file/a']});
 for(const row of [present,missing,invalid]){assert.deepEqual(row.calls,legacy.calls);assert.equal(row.calls.length,2);assert.deepEqual(row.result.catalog,legacy.result);}
 assert.equal(present.result.media[0].image_url,photo);assert.equal(missing.result.media[0].state,'NOT_CAPTURED');assert.equal(invalid.result.media[0].state,'INVALID');assert.ok(!JSON.stringify(present.result).includes('PRIVATE'));assert.deepEqual(await store.readTokens(),before);
 await assert.rejects(runFinanceVariantCatalog(env,{now,item_ids:['101'],includeMedia:true,fetchImpl:async()=>{throw Error('MUST_NOT_CALL');}}),e=>e.code==='FINANCE_CATALOG_REQUEST_INVALID');
});

test('media negotiation crosses App Auth and Finance with unchanged body and mixed-version downgrade',async()=>{
 const secret='SYNTHETIC-router-'+'x'.repeat(40),selection={item_ids:['101'],selling_unit:'AUTO',include_cost_catalog:true},legacy=catalogMediaLegacyFixture(),wrapped=catalogMediaFixture();
 for(const oldWorker of [false,true]){
  let calls=0;const worker=createFinanceWorker({variantCatalog:async(_,options)=>{calls++;assert.equal(options.includeMedia,true);assert.equal(options.include_cost_catalog,true);return oldWorker?legacy:wrapped;},fetchImpl:async()=>{},now:()=>stamp*1000});
  const env={FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'true',SHOPEE_FINANCE_SERVICE:{fetch:request=>worker.fetch(request,{FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'true'})}};
  const result=await getFinanceVariantCatalog({APP_INTERNAL_SECRET:'SYNTHETIC'},selection,{includeMedia:true,fetchImpl:async request=>{assert.equal(request.headers.get('x-braza-catalog-media-contract'),'catalog-media-v1');assert.deepEqual(await request.clone().json(),selection);return forwardFinancePaymentSample(request,env,{validateInternalApp:async()=>true});}});
  assert.deepEqual(result,oldWorker?legacy:wrapped);assert.equal(calls,1);
 }
});

test('media opt-in rejects invalid scope and unauthenticated callers before capability reads',async()=>{
 const path='/internal/shopee/finance/variant-catalog',secret='SYNTHETIC-router-'+'x'.repeat(40);let calls=0;
 const worker=createFinanceWorker({variantCatalog:async()=>{calls++;return catalogMediaFixture();},fetchImpl:async()=>{},now:()=>stamp*1000}),env={FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'true',SHOPEE_FINANCE_SERVICE:{fetch:request=>worker.fetch(request,{FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'true'})}};
 const call=(selection,contract='catalog-media-v1',authenticated=true)=>forwardFinancePaymentSample(new Request('https://auth.brazacommerce.com.br'+path,{method:'POST',headers:{'content-type':'application/json','X-Braza-Catalog-Media-Contract':contract},body:JSON.stringify(selection)}),env,{validateInternalApp:async()=>authenticated});
 assert.equal((await call({item_ids:['101']},undefined,false)).status,401);assert.equal((await call({item_ids:['101']})).status,400);assert.equal((await call({item_ids:['101'],include_cost_catalog:true},'unknown')).status,400);assert.equal(calls,0);
 for(const mutate of [v=>v.media[0].item_id='999',v=>v.media[0].image_url='https://attacker.invalid/file/a',v=>v.media[0].checked_at++]){const value=catalogMediaFixture();mutate(value);const result=await getFinanceVariantCatalog({APP_INTERNAL_SECRET:'SYNTHETIC'},{item_ids:['101'],selling_unit:'AUTO',include_cost_catalog:true},{includeMedia:true,fetchImpl:async()=>Response.json(value)});assert.equal(result.status,'UNAVAILABLE');}
});
