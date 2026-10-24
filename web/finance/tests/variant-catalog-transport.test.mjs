import test from 'node:test';
import assert from 'node:assert/strict';
import {forwardFinanceConnection,forwardFinancePaymentSample} from '../src/auth-router.mjs';
import defaultWorker,{createFinanceWorker} from '../src/connection-worker.mjs';
import {getFinanceVariantCatalog} from '../../cloudflare/src/app-finance-sample.mjs';

const origin='https://auth.brazacommerce.com.br';
const path='/internal/shopee/finance/variant-catalog';
const secret='fixture-catalog-router-'+'x'.repeat(40);
const input={item_ids:['123']};
const frame=(count=1)=>({schema:'variant_catalog_v1',checked_at:1800000000,products:[{
 item_id:'123',catalog_fingerprint:'a'.repeat(64),unresolved_count:0,
 bindings:Array.from({length:count},(_,index)=>({item_id:'123',model_id:String(index+1),male_size:'M',female_size:'G'})),
}]});
const singleFrame=()=>({schema:'variant_catalog_v1',checked_at:1800000000,products:[{
 item_id:'123',selling_unit:'SINGLE_GARMENT',catalog_fingerprint:'b'.repeat(64),unresolved_count:0,
 bindings:[{item_id:'123',model_id:'1',size:'P'}],
}]});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const request=(body=JSON.stringify(input),options={})=>new Request((options.origin||origin)+(options.path||path),{
 method:options.method||'POST',headers:{'content-type':'application/json','X-Braza-Finance-Router':secret,...options.headers},
 ...(options.method==='GET'?{}:{body}),
});
const authenticated={validateInternalApp:async()=>true};

test('opt-in child cost metadata crosses App Auth and Finance only when requested and cannot appear on a legacy request',async()=>{
 const body={item_ids:['123'],selling_unit:'AUTO',include_cost_catalog:true},value={schema:'variant_catalog_v1',checked_at:1800000000,products:[{item_id:'123',selling_unit:'SINGLE_GARMENT',catalog_fingerprint:'c'.repeat(64),bindings:[],unresolved_count:2,cost_catalog:{schema:'product_cost_catalog_v1',product_name:'Camiseta Infantil',variants:[{model_id:'4',attributes:[{name:'Tamanho',value:'4'}]},{model_id:'6',attributes:[{name:'Tamanho',value:'6'}]}]}}]};
 const worker=createFinanceWorker({variantCatalog:async(_,options)=>{assert.equal(options.include_cost_catalog,true);return value;},fetchImpl:async()=>{},now:()=>1800000000000});
 const env={FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'true',SHOPEE_FINANCE_SERVICE:{fetch:request=>worker.fetch(request,{FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'true'})}};
 const result=await getFinanceVariantCatalog({APP_INTERNAL_SECRET:'fixture'},body,{fetchImpl:request=>forwardFinancePaymentSample(request,env,authenticated)});assert.deepEqual(result,value);
 const refused=await getFinanceVariantCatalog({APP_INTERNAL_SECRET:'fixture'},input,{fetchImpl:async()=>json(value)});assert.equal(refused.status,'UNAVAILABLE');
});

test('catalogue private routes deny untrusted callers and invalid input before any capability',async()=>{
 let calls=0;
 const env={FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'true',SHOPEE_FINANCE_SERVICE:{fetch(){calls++;}},get FINANCE_DB(){throw Error('must not read DB');}};
 const worker=createFinanceWorker({variantCatalog:async()=>{calls++;return frame();},fetchImpl:async()=>{},now:()=>1800000000000});
 const untrusted=request();
 assert.equal((await forwardFinancePaymentSample(untrusted,env,{validateInternalApp:async()=>false})).status,401);
 assert.equal(untrusted.bodyUsed,false);
 assert.equal((await forwardFinanceConnection(request(),env)).status,404);
 assert.equal((await worker.fetch(request(undefined,{headers:{'X-Braza-Finance-Router':'bad'}}),env)).status,403);
 for(const body of ['{}','null','[]','{"item_ids":[]}','{"item_ids":[123]}','{"item_ids":["01"]}','{"item_ids":["1","1"]}','{"item_ids":["1","2","3","4"]}','{"item_ids":["123"],"shop_id":1}','{"item_ids":["123"],"selling_unit":"OTHER"}','{"item_ids":["123"],"selling_unit":null}',' '.repeat(129)]){
  assert.equal((await forwardFinancePaymentSample(request(body),env,authenticated)).status,400);
  assert.equal((await worker.fetch(request(body),env)).status,400);
 }
 for(const [options,status] of [[{origin:'https://evil.invalid'},404],[{path:path+'/'},404],[{path:'/shopee/finance/variant-catalog'},404],[{path:path+'?shop_id=1'},400],[{method:'GET'},405]]){
  assert.equal((await forwardFinancePaymentSample(request(undefined,options),env,authenticated)).status,status);
  assert.equal((await worker.fetch(request(undefined,options),env)).status,status);
 }
 assert.equal(calls,0);
 for(const selling_unit of ['OTHER',null,true]){
  assert.equal((await getFinanceVariantCatalog({APP_INTERNAL_SECRET:'fixture'},{item_ids:['123'],selling_unit},{fetchImpl:async()=>{calls++;}})).status,'UNAVAILABLE');
 }
 assert.equal(calls,0);
});

test('catalogue capability is explicit and flag-gated in the default and offline worker',async()=>{
 let calls=0;
 const env={FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'true',get FINANCE_DB(){throw Error('must not read DB');}};
 for(const worker of [defaultWorker,createFinanceWorker({fetchImpl:async()=>{calls++;}}),createFinanceWorker({variantCatalog:async()=>{calls++;}})])assert.equal((await worker.fetch(request(),env)).status,503);
 const worker=createFinanceWorker({variantCatalog:async()=>{calls++;},fetchImpl:async()=>{calls++;}});
 for(const flag of [undefined,'false',true])assert.equal((await worker.fetch(request(),{FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:flag,get FINANCE_DB(){throw Error('must not read DB');}})).status,503);
 assert.equal(calls,0);
});

test('catalogue chain forwards only its fixed path, requested IDs and dedicated credentials',async()=>{
 const now=()=>1800000000000,fetchImpl=async()=>{};
 let calls=0;
 const env={FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'true'};
 const worker=createFinanceWorker({variantCatalog:async(actual,options)=>{
  calls++;assert.equal(actual,env);assert.deepEqual(options,{fetchImpl,now,item_ids:['123']});return frame();
 },fetchImpl,now});
 const authEnv={FINANCE_ROUTER_SECRET:secret,SHOPEE_FINANCE_SERVICE:{fetch:forwarded=>{
  assert.equal(forwarded.url,origin+path);assert.equal(forwarded.method,'POST');
  assert.equal(forwarded.headers.get('X-Braza-Finance-Router'),secret);
  assert.equal(forwarded.headers.get('cookie'),null);assert.equal(forwarded.headers.get('authorization'),null);
  assert.equal(forwarded.headers.get('X-Braza-App-Key'),null);
  return worker.fetch(forwarded,env);
 }}};
 const result=await getFinanceVariantCatalog({APP_INTERNAL_SECRET:'fixture-catalog-app'},input,{fetchImpl:forwarded=>{
  assert.equal(forwarded.url,origin+path);assert.equal(forwarded.headers.get('X-Braza-App-Key'),'fixture-catalog-app');
  return forwardFinancePaymentSample(forwarded,authEnv,{validateInternalApp:async actual=>actual.headers.get('X-Braza-App-Key')==='fixture-catalog-app'});
 }});
 assert.deepEqual(result,frame());assert.equal(calls,1);
});

test('catalogue optional selling unit crosses all three private boundaries without changing legacy input',async()=>{
 for(const selling_unit of [undefined,'SINGLE_GARMENT','ONE_MALE_ONE_FEMALE_KIT','AUTO']){
  const body={item_ids:['123'],...(selling_unit?{selling_unit}:{})};
  const resultFrame=selling_unit==='SINGLE_GARMENT'?singleFrame():frame();
  const now=()=>1800000000000,fetchImpl=async()=>{};
  let capabilityCalls=0,authCalls=0,financeCalls=0;
  const env={FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'true'};
  const worker=createFinanceWorker({variantCatalog:async(actual,options)=>{
   capabilityCalls++;assert.equal(actual,env);assert.deepEqual(options,{fetchImpl,now,...body});
   assert.equal(Object.hasOwn(options,'selling_unit'),selling_unit!==undefined);
   return resultFrame;
  },fetchImpl,now});
  const authEnv={FINANCE_ROUTER_SECRET:secret,SHOPEE_FINANCE_SERVICE:{fetch:async forwarded=>{
   financeCalls++;assert.deepEqual(await forwarded.clone().json(),body);return worker.fetch(forwarded,env);
  }}};
  const result=await getFinanceVariantCatalog({APP_INTERNAL_SECRET:'fixture'},body,{fetchImpl:async forwarded=>{
   authCalls++;assert.deepEqual(await forwarded.clone().json(),body);
   return forwardFinancePaymentSample(forwarded,authEnv,authenticated);
  }});
  assert.deepEqual(result,resultFrame);assert.equal(authCalls,1);assert.equal(financeCalls,1);assert.equal(capabilityCalls,1);
 }
});

test('AUTO mixed resolved and ambiguous catalogue crosses the entire private chain without losing identity or leaking credentials',async()=>{
 const body={item_ids:['123','456','789'],selling_unit:'AUTO'},value={schema:'variant_catalog_v1',checked_at:1800000000,products:[singleFrame().products[0],
  {...frame().products[0],item_id:'456',bindings:[{item_id:'456',model_id:'0',male_size:'G1',female_size:'M'}]},
  {item_id:'789',catalog_fingerprint:'c'.repeat(64),bindings:[],unresolved_count:4}]};
 const now=()=>1800000000000,fetchImpl=async()=>{};let capabilityCalls=0,routerCalls=0,appCalls=0;
 const env={FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'true',get FINANCE_DB(){throw Error('transport must not touch token database');}};
 const worker=createFinanceWorker({variantCatalog:async(actual,options)=>{
  capabilityCalls++;assert.equal(actual,env);assert.deepEqual(options,{fetchImpl,now,...body});return value;
 },fetchImpl,now});
 const authEnv={FINANCE_ROUTER_SECRET:secret,SHOPEE_FINANCE_SERVICE:{fetch:async forwarded=>{
  routerCalls++;assert.equal(forwarded.url,origin+path);assert.deepEqual(await forwarded.clone().json(),body);
  assert.equal(forwarded.headers.get('X-Braza-Finance-Router'),secret);assert.equal(forwarded.headers.get('cookie'),null);assert.equal(forwarded.headers.get('authorization'),null);assert.equal(forwarded.headers.get('X-Braza-App-Key'),null);
  return worker.fetch(forwarded,env);
 }}};
 const result=await getFinanceVariantCatalog({APP_INTERNAL_SECRET:'fixture-auto-app'},body,{fetchImpl:async forwarded=>{
  appCalls++;assert.deepEqual(await forwarded.clone().json(),body);assert.equal(forwarded.headers.get('X-Braza-App-Key'),'fixture-auto-app');
  return forwardFinancePaymentSample(forwarded,authEnv,authenticated);
 }});
 assert.deepEqual(result,value);assert.deepEqual([appCalls,routerCalls,capabilityCalls],[1,1,1]);assert.equal(JSON.stringify(result).includes('AUTO'),false);assert.equal(JSON.stringify(result).includes(secret),false);
});

test('AUTO still rejects missing, substituted, duplicate and poisoned products at every private boundary',async()=>{
 const body={item_ids:['123'],selling_unit:'AUTO'},substituted=singleFrame();substituted.products[0].item_id='456';substituted.products[0].bindings[0].item_id='456';
 for(const value of [substituted,{...singleFrame(),products:[]},{...singleFrame(),products:[singleFrame().products[0],singleFrame().products[0]]},{...singleFrame(),products:[{...singleFrame().products[0],selling_unit:'AUTO'}]},{...singleFrame(),private_payload:'PRIVATE_BUYER_TOKEN'}]){
  const noWrites={get ADMIN_DB(){throw Error('must not touch App database');},get FINANCE_DB(){throw Error('must not touch Finance database');}};
  const app=await getFinanceVariantCatalog(Object.assign(Object.create(noWrites),{APP_INTERNAL_SECRET:'fixture'}),body,{fetchImpl:async()=>json(value)});
  assert.equal(app.status,'UNAVAILABLE');assert.ok(!JSON.stringify(app).includes('PRIVATE'));
  const auth=await forwardFinancePaymentSample(request(JSON.stringify(body)),Object.assign(Object.create(noWrites),{FINANCE_ROUTER_SECRET:secret,SHOPEE_FINANCE_SERVICE:{fetch:async()=>json(value)}}),authenticated);
  assert.equal(auth.status,502);assert.ok(!(await auth.text()).includes('PRIVATE'));
  const worker=createFinanceWorker({variantCatalog:async()=>value,fetchImpl:async()=>{}});
  const finance=await worker.fetch(request(JSON.stringify(body)),Object.assign(Object.create(noWrites),{FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'true'}));
  assert.equal(finance.status,502);assert.ok(!(await finance.text()).includes('PRIVATE'));
 }
});

test('catalogue unit substitutions are rejected at App, Auth and Finance boundaries before any writes',async()=>{
 for(const [body,value] of [[{item_ids:['123'],selling_unit:'SINGLE_GARMENT'},frame()],
  [{item_ids:['123']},singleFrame()],
  [{item_ids:['123'],selling_unit:'ONE_MALE_ONE_FEMALE_KIT'},singleFrame()]]){
  const noWrites={get ADMIN_DB(){throw Error('must not access App database');},get FINANCE_DB(){throw Error('must not access Finance database');}};
  const app=await getFinanceVariantCatalog(Object.assign(Object.create(noWrites),{APP_INTERNAL_SECRET:'fixture'}),body,{fetchImpl:async()=>json(value)});
  assert.equal(app.status,'UNAVAILABLE');assert.equal(app.diagnostic.code,'FINANCE_CATALOG_APP_RESPONSE_INVALID');
  const auth=await forwardFinancePaymentSample(request(JSON.stringify(body)),Object.assign(Object.create(noWrites),{FINANCE_ROUTER_SECRET:secret,SHOPEE_FINANCE_SERVICE:{fetch:async()=>json(value)}}),authenticated);
  assert.equal(auth.status,502);
  const worker=createFinanceWorker({variantCatalog:async()=>value,fetchImpl:async()=>{}});
  const finance=await worker.fetch(request(JSON.stringify(body)),Object.assign(Object.create(noWrites),{FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'true'}));
  assert.equal(finance.status,502);
 }
});

test('catalogue frame identity cannot be substituted or enlarged by any private boundary',async()=>{
 const mismatched=frame();mismatched.products[0].item_id='456';mismatched.products[0].bindings[0].item_id='456';
 const poisoned={...frame(),buyer_user_name:'PRIVATE_BUYER'};
 for(const value of [mismatched,poisoned]){
  const app=await getFinanceVariantCatalog({APP_INTERNAL_SECRET:'fixture'},input,{fetchImpl:async()=>json(value)});
  assert.equal(app.status,'UNAVAILABLE');assert.ok(!JSON.stringify(app).includes('PRIVATE'));
  const auth=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:secret,SHOPEE_FINANCE_SERVICE:{fetch:async()=>json(value)}},authenticated);
  assert.equal(auth.status,502);assert.ok(!(await auth.text()).includes('PRIVATE'));
  const worker=createFinanceWorker({variantCatalog:async()=>value,fetchImpl:async()=>{}});
  const finance=await worker.fetch(request(),{FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'true'});
  assert.equal(finance.status,502);assert.ok(!(await finance.text()).includes('PRIVATE'));
 }
});

test('catalogue accepts the dedicated bounded response limit beyond the payment frame limit',async()=>{
 const value=frame(1000);assert.ok(JSON.stringify(value).length>65536);assert.ok(JSON.stringify(value).length<262144);
 const auth=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:secret,SHOPEE_FINANCE_SERVICE:{fetch:async()=>json(value)}},authenticated);
 assert.equal(auth.status,200);assert.deepEqual(await auth.json(),value);
 assert.deepEqual(await getFinanceVariantCatalog({APP_INTERNAL_SECRET:'fixture'},input,{fetchImpl:async()=>json(value)}),value);
 for(const response of [new Response(' '.repeat(262145),{headers:{'content-type':'application/json'}}),new Response('',{status:302,headers:{location:'https://other.invalid'}}),new Response('PRIVATE',{headers:{'content-type':'text/html'}})]){
  const result=await getFinanceVariantCatalog({APP_INTERNAL_SECRET:'fixture'},input,{fetchImpl:async()=>response});
  assert.equal(result.status,'UNAVAILABLE');assert.ok(!JSON.stringify(result).includes('PRIVATE'));
 }
});

test('catalogue timeout aborts and cancels a late response without reading its body',async()=>{
 let resolveFetch,signal,cancelled=0;
 const result=await getFinanceVariantCatalog({APP_INTERNAL_SECRET:'fixture'},input,{timeoutMs:5,fetchImpl:request=>{signal=request.signal;return new Promise(resolve=>{resolveFetch=resolve;});}});
 assert.equal(result.diagnostic.code,'FINANCE_CATALOG_APP_TIMEOUT');assert.equal(signal.aborted,true);
 resolveFetch(new Response(new ReadableStream({cancel(){cancelled++;}}),{headers:{'content-type':'application/json'}}));
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(cancelled,1);
 let calls=0;
 assert.equal((await getFinanceVariantCatalog({APP_INTERNAL_SECRET:'fixture'},{item_ids:['123','123']},{fetchImpl:async()=>{calls++;}})).status,'UNAVAILABLE');
 assert.equal(calls,0);
});
