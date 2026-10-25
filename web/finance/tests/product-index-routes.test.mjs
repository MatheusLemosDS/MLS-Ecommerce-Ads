import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinanceWorker} from '../src/connection-worker.mjs';
import {forwardFinancePaymentSample} from '../src/auth-router.mjs';
import {getFinanceProductIndex} from '../../cloudflare/src/app-product-index.mjs';

const origin='https://auth.brazacommerce.com.br',path='/internal/shopee/finance/product-index',appKey='fixture-index-app-'+'a'.repeat(40),router='fixture-index-router-'+'r'.repeat(40),input={offset:0,page_size:50,item_status:'NORMAL'},at=Date.UTC(2026,10,2,12)/1000;
const frame=(changes={})=>({schema:'product_index_v1',status:'AVAILABLE',shop_id:1178167501,checked_at:at,...input,total_count:1,has_more:false,next_offset:null,items:[{item_id:'101',item_status:'NORMAL',source_update_time:at-1}],...changes});
const request=(body=input,changes={})=>new Request(origin+path+(changes.search||''),{method:changes.method||'POST',headers:{'content-type':'application/json','x-braza-app-key':appKey,...changes.headers},body:changes.method==='GET'?undefined:JSON.stringify(body)});
const validateInternalApp=req=>req.headers.get('x-braza-app-key')===appKey;

test('the bounded product index crosses App, Auth and Finance with each private credential confined to its own boundary',async()=>{
 let providerCalls=0,capabilityCalls=0,serviceCalls=0;const finance=createFinanceWorker({productIndex:async(_,options)=>{capabilityCalls++;assert.deepEqual({offset:options.offset,page_size:options.page_size,item_status:options.item_status},input);return frame();},fetchImpl:async()=>{providerCalls++;throw Error('UNEXPECTED_READ');}});
 const result=await getFinanceProductIndex({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async req=>{
  assert.equal(req.url,origin+path);assert.equal(req.headers.get('x-braza-app-key'),appKey);assert.equal(req.headers.get('cookie'),null);assert.equal(req.headers.get('authorization'),null);assert.equal(req.redirect,'manual');
  return forwardFinancePaymentSample(req,{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async routed=>{serviceCalls++;assert.equal(routed.headers.get('x-braza-finance-router'),router);assert.equal(routed.headers.get('x-braza-app-key'),null);assert.equal(routed.headers.get('cookie'),null);return finance.fetch(routed,{FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'});}}},{validateInternalApp});
 }});
 assert.deepEqual(result,frame());assert.equal(capabilityCalls,1);assert.equal(serviceCalls,1);assert.equal(providerCalls,0);
});

test('scope, authentication and malformed requests fail before capabilities or source calls',async()=>{
 let reads=0;const service={fetch:async()=>{reads++;return Response.json(frame());}},authEnv={FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:service};
 assert.equal((await forwardFinancePaymentSample(request(input,{headers:{'x-braza-app-key':'wrong'}}),authEnv,{validateInternalApp})).status,401);
 for(const value of [{...input,page_size:51},{...input,offset:-1},{...input,item_status:'DELETED'},{...input,shop_id:1},{...input,url:'https://evil.test'}])assert.equal((await forwardFinancePaymentSample(request(value),authEnv,{validateInternalApp})).status,400);
 assert.equal((await forwardFinancePaymentSample(request(input,{search:'?offset=0'}),authEnv,{validateInternalApp})).status,400);assert.equal((await forwardFinancePaymentSample(request(input,{method:'GET'}),authEnv,{validateInternalApp})).status,405);assert.equal(reads,0);
 const finance=createFinanceWorker({productIndex:async()=>{reads++;return frame();},fetchImpl:async()=>{throw Error();}});
 assert.equal((await finance.fetch(request(),{FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'})).status,403);
 assert.equal((await finance.fetch(request(input,{headers:{'x-braza-finance-router':router}}),{FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'false'})).status,503);assert.equal(reads,0);
});

test('each boundary rejects poisoned fields and mismatched pages instead of forwarding private provider data',async()=>{
 for(const change of [value=>value.items[0].buyer='PRIVATE_BUYER',value=>value.access_token='PRIVATE_TOKEN',value=>value.offset=1,value=>value.shop_id=7,value=>value.next_offset=0]){
  const value=frame();change(value);
  const app=await getFinanceProductIndex({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async()=>Response.json(value)});assert.equal(app.status,'UNAVAILABLE');assert.doesNotMatch(JSON.stringify(app),/PRIVATE/);
  const auth=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>Response.json(value)}},{validateInternalApp});assert.equal(auth.status,502);assert.doesNotMatch(await auth.text(),/PRIVATE/);
  const finance=createFinanceWorker({productIndex:async()=>value,fetchImpl:async()=>{throw Error();}}),rejected=await finance.fetch(request(input,{headers:{'x-braza-finance-router':router}}),{FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'});assert.equal(rejected.status,502);assert.doesNotMatch(await rejected.text(),/PRIVATE/);
 }
});

test('the App adapter bounds bodies and deadlines and does not retry, follow redirects or expose upstream text',async()=>{
 for(const response of [()=>Response.json({error:'PRIVATE_ERROR'},{status:429}),()=>Response.redirect('https://evil.test',302),()=>new Response('PRIVATE_HTML',{headers:{'content-type':'text/html'}}),()=>new Response('x'.repeat(32769),{headers:{'content-type':'application/json'}})]){
  let calls=0;const result=await getFinanceProductIndex({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async()=>{calls++;return response();}});assert.equal(result.status,'UNAVAILABLE');assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
 }
 let calls=0;const timeout=await getFinanceProductIndex({APP_INTERNAL_SECRET:appKey},input,{timeoutMs:5,fetchImpl:async()=>{calls++;return new Promise(()=>{});}});assert.equal(timeout.diagnostic.code,'FINANCE_PRODUCT_INDEX_APP_TIMEOUT');assert.equal(calls,1);
 const invalid=await getFinanceProductIndex({APP_INTERNAL_SECRET:appKey},{...input,shop_id:5},{fetchImpl:async()=>{calls++;throw Error();}});assert.equal(invalid.diagnostic.code,'FINANCE_PRODUCT_INDEX_APP_CONFIGURATION');assert.equal(calls,1);
});
