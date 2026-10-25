import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinanceWorker} from '../src/connection-worker.mjs';
import {FinanceConnectionError} from '../src/connection-store.mjs';
import {forwardFinancePaymentSample} from '../src/auth-router.mjs';
import {projectHistoricalVariantEvidenceFrame} from '../src/historical-variant-evidence-frame.mjs';

const origin='https://auth.brazacommerce.com.br',path='/internal/shopee/finance/historical-variant-evidence',catalogPath='/internal/shopee/finance/variant-catalog',appKey='fixture-history-app-'+'a'.repeat(40),router='fixture-history-router-'+'r'.repeat(40),at=Date.UTC(2026,9,25,12)/1000,input={start_date:'2026-10-01',end_date:'2026-10-15',item_ids:['101'],cursor:null};
const frame=()=>({schema:'historical_variant_evidence_v1',shop_id:1178167501,checked_at:at,...input,has_more:false,next_cursor:null,coverage:{orders_seen:1,target_orders:1,target_lines:1,target_units:2},evidence_complete:true,products:[{item_id:'101',variants:[{model_id:'9',line_count:1,quantity:2,item_names:['Camiseta infantil'],model_names:['2'],missing_item_name_lines:0,missing_model_name_lines:0,status_counts:[{status:'COMPLETED',line_count:1,quantity:2}],conflict:false}]}],omitted:{target_lines:0,target_units:0}});
const request=(body=input,{route=path,headers={},method='POST',search=''}={})=>new Request(origin+route+search,{method,headers:{'content-type':'application/json','x-braza-app-key':appKey,...headers},body:method==='GET'?undefined:JSON.stringify(body)});
const validateInternalApp=req=>req.headers.get('x-braza-app-key')===appKey;
const financeEnv={FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'};

test('a historical page crosses both private boundaries without forwarding App keys, cookies or caller authorization',async()=>{
 let calls=0;const finance=createFinanceWorker({historicalVariantEvidence:async(_,options)=>{calls++;assert.deepEqual({start_date:options.start_date,end_date:options.end_date,item_ids:options.item_ids,cursor:options.cursor},input);assert.equal(typeof options.fetchImpl,'function');return frame();},fetchImpl:async()=>{throw Error('No provider call expected');}});
 const response=await forwardFinancePaymentSample(request(input,{headers:{cookie:'PRIVATE_OWNER_COOKIE',authorization:'PRIVATE_OWNER_BEARER'}}),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async routed=>{assert.equal(routed.url,origin+path);assert.equal(routed.method,'POST');assert.equal(routed.headers.get('x-braza-finance-router'),router);for(const key of ['x-braza-app-key','cookie','authorization'])assert.equal(routed.headers.get(key),null);return finance.fetch(routed,financeEnv);}}},{validateInternalApp});
 assert.equal(response.status,200);assert.equal(calls,1);assert.deepEqual(await response.json(),frame());assert.match(response.headers.get('cache-control'),/no-store/);assert.ok(projectHistoricalVariantEvidenceFrame(frame()));
});

test('unauthorized, disabled, oversized and malformed history requests never reach the capability',async()=>{
 let calls=0;const finance=createFinanceWorker({historicalVariantEvidence:async()=>{calls++;return frame();},fetchImpl:async()=>{throw Error();}}),env={FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:routed=>finance.fetch(routed,financeEnv)}};
 assert.equal((await forwardFinancePaymentSample(request(input,{headers:{'x-braza-app-key':'wrong'}}),env,{validateInternalApp})).status,401);assert.equal((await finance.fetch(request(),financeEnv)).status,403);
 for(const value of [{...input,item_ids:['1','2','3','4','5','6']},{...input,end_date:'2026-10-16'},{...input,item_ids:['101','101']},{...input,cursor:'x'.repeat(1025)},{...input,shop_id:123},{...input,url:'https://private.invalid'},{...input,cursor:null,private:'x'.repeat(8192)}])assert.equal((await forwardFinancePaymentSample(request(value),env,{validateInternalApp})).status,400);
 assert.equal((await forwardFinancePaymentSample(request(input,{method:'GET'}),env,{validateInternalApp})).status,405);assert.equal((await forwardFinancePaymentSample(request(input,{search:'?page=1'}),env,{validateInternalApp})).status,400);assert.equal((await finance.fetch(request(input,{headers:{'x-braza-finance-router':router}}),{...financeEnv,FINANCE_CONNECTION_ENABLED:'false'})).status,503);assert.equal(calls,0);
});

test('history response context and finite failures are checked without exposing upstream identities or errors',async()=>{
 for(const mutate of [value=>{value.item_ids=['999'];value.products[0].item_id='999';},value=>{value.cursor='other';},value=>{value.start_date='2026-10-02';},value=>{value.access_token='PRIVATE';},value=>{value.products[0].variants[0].buyer='PRIVATE';}]){
  const value=frame();mutate(value);const finance=createFinanceWorker({historicalVariantEvidence:async()=>value,fetchImpl:async()=>{throw Error();}}),env={FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:routed=>finance.fetch(routed,financeEnv)}};
  const result=await forwardFinancePaymentSample(request(),env,{validateInternalApp});assert.equal(result.status,502);assert.doesNotMatch(await result.text(),/PRIVATE|other|999/);
 }
 const error=new FinanceConnectionError('FINANCE_HISTORICAL_EVIDENCE_DETAIL_UPSTREAM_HTTP',503);error.upstream_status=429;error.message='PRIVATE_PROVIDER_TEXT';const finance=createFinanceWorker({historicalVariantEvidence:async()=>{throw error;},fetchImpl:async()=>{throw Error();}});
 const result=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:routed=>finance.fetch(routed,financeEnv)}},{validateInternalApp});assert.equal(result.status,503);assert.deepEqual(await result.json(),{error:'FINANCE_HISTORICAL_EVIDENCE_UNAVAILABLE',diagnostic:{code:'FINANCE_HISTORICAL_EVIDENCE_DETAIL_UPSTREAM_HTTP',http:429}});
});

test('Auth bounds historical JSON bodies and retains an already normalized busy diagnostic',async()=>{
 for(const value of [new Response('x'.repeat(65537),{headers:{'content-type':'application/json'}}),new Response('PRIVATE_HTML',{headers:{'content-type':'text/html'}}),Response.redirect('https://private.invalid',302)]){const result=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>value}},{validateInternalApp});assert.equal(result.status,502);assert.doesNotMatch(await result.text(),/PRIVATE|private.invalid/);}
 const result=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>Response.json({error:'FINANCE_HISTORICAL_EVIDENCE_UNAVAILABLE',diagnostic:{code:'FINANCE_HISTORICAL_EVIDENCE_BUSY',http:null}},{status:409})}},{validateInternalApp});assert.equal(result.status,409);assert.equal((await result.json()).diagnostic.code,'FINANCE_HISTORICAL_EVIDENCE_BUSY');
});

test('finite catalogue base/model diagnostics survive Finance and Auth while arbitrary error text is discarded',async()=>{
 const selection={item_ids:['101'],selling_unit:'AUTO',include_cost_catalog:true};
 for(const [code,stage,http]of [['FINANCE_CATALOG_BASE_ITEM_ABSENT','BASE_INFO',200],['FINANCE_CATALOG_MODEL_STRUCTURE_INVALID','MODELS',200],['FINANCE_CATALOG_TIMEOUT','BASE_INFO',null]]){
  const error=new FinanceConnectionError(code,502);error.catalog_stage=stage;error.upstream_status=http;error.message='PRIVATE_PROVIDER_ERROR';const finance=createFinanceWorker({variantCatalog:async()=>{throw error;},fetchImpl:async()=>{throw Error();}});
  const result=await forwardFinancePaymentSample(request(selection,{route:catalogPath}),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:routed=>finance.fetch(routed,financeEnv)}},{validateInternalApp});assert.equal(result.status,502);assert.deepEqual(await result.json(),{schema:'variant_catalog_v1',status:'UNAVAILABLE',diagnostic:{stage,code,http}});
 }
 const finance=createFinanceWorker({variantCatalog:async()=>{throw Object.assign(Error('PRIVATE_TOKEN'),{code:'PRIVATE_UPSTREAM_CODE',upstream_status:9999,catalog_stage:'PRIVATE'});},fetchImpl:async()=>{throw Error();}}),result=await forwardFinancePaymentSample(request(selection,{route:catalogPath}),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:routed=>finance.fetch(routed,financeEnv)}},{validateInternalApp});assert.deepEqual(await result.json(),{schema:'variant_catalog_v1',status:'UNAVAILABLE',diagnostic:{stage:'UNKNOWN',code:'FINANCE_CATALOG_UNAVAILABLE',http:null}});
});
