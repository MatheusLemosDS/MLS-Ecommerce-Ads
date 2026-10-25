import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {build} from 'esbuild';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {getFinanceProductIndex} from '../../cloudflare/src/app-product-index.mjs';

for(const minify of [false,true])test(`generated Auth and production Finance expose the official read-only index after compilation (minify=${minify})`,async()=>{
 const compile=async path=>{const source=readFileSync(new URL(path,import.meta.url),'utf8'),result=await build({stdin:{contents:source,sourcefile:path},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});return (await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))).default;};
 const [auth,finance]=await Promise.all([compile('../../../docs/finance-connection-delivery/auth-worker.mjs'),compile('../../../docs/finance-connection-delivery/finance-worker.mjs')]);
 const key='fixture-index-compiled-partner-key',access='PRIVATE_COMPILED_INDEX_ACCESS',router='fixture-index-compiled-router-'+'r'.repeat(40),appKey='fixture-index-compiled-app-'+'a'.repeat(40),financeEnv={FINANCE_DB:new D1(),FINANCE_CONNECTION_ENABLED:'true',FINANCE_ROUTER_SECRET:router,FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,23).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:key};
 const store=await createFinanceStore(financeEnv);await store.setup();await store.saveTokens({access_token:access,refresh_token:'PRIVATE_COMPILED_INDEX_REFRESH',expires_at:Math.floor(Date.now()/1000)+14400});
 const previousFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async request=>{
  calls++;const url=new URL(request.url);assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(url.pathname,'/api/v2/product/get_item_list');assert.equal(request.method,'GET');assert.equal(url.searchParams.get('page_size'),'50');assert.equal(url.searchParams.get('item_status'),'SELLER_DELETE');assert.equal(request.headers.get('x-braza-app-key'),null);assert.equal(request.headers.get('x-braza-finance-router'),null);assert.equal(request.headers.get('cookie'),null);
  assert.equal(url.searchParams.get('sign'),createHmac('sha256',key).update('2049333'+url.pathname+url.searchParams.get('timestamp')+access+'1178167501').digest('hex'));
  return Response.json({error:'',response:{item:[{item_id:101,item_status:'SELLER_DELETE',update_time:Math.floor(Date.now()/1000)-10}],total_count:1,has_next_page:false,next_offset:0}});
 };
 try{
  const result=await getFinanceProductIndex({APP_INTERNAL_SECRET:appKey},{offset:0,page_size:50,item_status:'SELLER_DELETE'},{fetchImpl:request=>auth.fetch(request,{APP_INTERNAL_SECRET:appKey,FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:routed=>finance.fetch(routed,financeEnv)}})});
  assert.equal(result.status,'AVAILABLE',JSON.stringify(result));assert.equal(result.has_more,false);assert.equal(result.next_offset,null);assert.equal(result.items[0].item_status,'SELLER_DELETE');assert.equal(result.items[0].item_id,'101');assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(result),/PRIVATE|access_token|refresh_token|sign|buyer|stock/);
 }finally{globalThis.fetch=previousFetch;financeEnv.FINANCE_DB.db.close();}
});
