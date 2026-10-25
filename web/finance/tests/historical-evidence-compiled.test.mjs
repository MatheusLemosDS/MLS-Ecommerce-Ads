import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {build} from 'esbuild';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {getFinanceHistoricalVariantEvidence} from '../../cloudflare/src/app-historical-variant-evidence.mjs';
import {getFinanceVariantCatalog} from '../../cloudflare/src/app-finance-sample.mjs';

for(const minify of [false,true])test('generated Auth and Finance '+(minify?'minified':'normal')+' expose historical evidence and preserve finite catalogue diagnostics',async t=>{
 const compile=async path=>{const source=readFileSync(new URL(path,import.meta.url),'utf8'),result=await build({stdin:{contents:source,sourcefile:path},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});return (await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))).default;};
 const [auth,finance]=await Promise.all([compile('../../../docs/finance-connection-delivery/auth-worker.mjs'),compile('../../../docs/finance-connection-delivery/finance-worker.mjs')]);
 const key='fixture-history-compiled-partner',access='PRIVATE_COMPILED_HISTORY_ACCESS',router='fixture-history-compiled-router-'+'r'.repeat(40),appKey='fixture-history-compiled-app-'+'a'.repeat(40),env={FINANCE_DB:new D1(),FINANCE_CONNECTION_ENABLED:'true',FINANCE_ROUTER_SECRET:router,FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,37).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:key};t.after(()=>env.FINANCE_DB.db.close());
 const store=await createFinanceStore(env);await store.setup();await store.saveTokens({access_token:access,refresh_token:'PRIVATE_COMPILED_HISTORY_REFRESH',expires_at:Math.floor(Date.now()/1000)+14400});const before=await store.readTokens();
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()),end=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10),start=new Date(Date.parse(end+'T00:00:00Z')-14*86400000).toISOString().slice(0,10),input={start_date:start,end_date:end,item_ids:['101'],cursor:null},paths=[],serial='PRIVATE_COMPILED_HISTORY_ORDER',originalFetch=globalThis.fetch;
 globalThis.fetch=async request=>{
  const url=new URL(request.url);paths.push(url.pathname);assert.equal(request.method,'GET');assert.equal(url.origin,'https://partner.shopeemobile.com');for(const header of ['cookie','authorization','x-braza-app-key','x-braza-finance-router'])assert.equal(request.headers.get(header),null);assert.equal(url.searchParams.get('sign'),createHmac('sha256',key).update('2049333'+url.pathname+url.searchParams.get('timestamp')+access+'1178167501').digest('hex'));
  if(url.pathname==='/api/v2/order/get_order_list'){assert.equal(url.searchParams.get('page_size'),'50');return Response.json({error:'',response:{order_list:[{order_sn:serial}],more:false,next_cursor:''}});}
  if(url.pathname==='/api/v2/order/get_order_detail')return Response.json({error:'',response:{order_list:[{order_sn:serial,order_status:'COMPLETED',create_time:Date.parse(start+'T12:00:00-03:00')/1000,item_list:[{item_id:101,model_id:9,model_quantity_purchased:3,item_name:'Camiseta infantil',model_name:'2',model_sku:'PRIVATE_SKU',buyer_username:'PRIVATE_BUYER'}]}]}});
  assert.equal(url.pathname,'/api/v2/product/get_item_base_info');return Response.json({error:'',response:{item_list:[]}});
 };
 const appEnv={APP_INTERNAL_SECRET:appKey},transport=request=>auth.fetch(request,{APP_INTERNAL_SECRET:appKey,FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:routed=>finance.fetch(routed,env)}});
 try{
  const evidence=await getFinanceHistoricalVariantEvidence(appEnv,input,{fetchImpl:transport});assert.equal(evidence.schema,'historical_variant_evidence_v1');assert.equal(evidence.evidence_complete,true,JSON.stringify(evidence));assert.equal(evidence.has_more,false);assert.deepEqual(evidence.products[0].variants[0].item_names,['Camiseta infantil']);assert.deepEqual(evidence.products[0].variants[0].model_names,['2']);assert.equal(evidence.products[0].variants[0].quantity,3);assert.deepEqual(paths,['/api/v2/order/get_order_list','/api/v2/order/get_order_detail']);assert.doesNotMatch(JSON.stringify(evidence),/PRIVATE_|order_sn|access_token|refresh_token|recipient|price|escrow/);
  const catalogue=await getFinanceVariantCatalog(appEnv,{item_ids:['101'],selling_unit:'AUTO',include_cost_catalog:true},{fetchImpl:transport});assert.equal(catalogue.status,'UNAVAILABLE');assert.equal(catalogue.diagnostic.stage,'BASE_INFO');assert.equal(catalogue.diagnostic.code,'FINANCE_CATALOG_BASE_ITEM_ABSENT');assert.equal(paths.length,3);assert.equal(paths[2],'/api/v2/product/get_item_base_info');assert.doesNotMatch(JSON.stringify(catalogue),/PRIVATE_|message|sign|access_token/);assert.deepEqual(await store.readTokens(),before);
 }finally{globalThis.fetch=originalFetch;}
});
