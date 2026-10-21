import test from 'node:test';
import assert from 'node:assert/strict';
import {forwardFinanceConnection,forwardFinancePaymentSample} from '../src/auth-router.mjs';
import defaultWorker,{createFinanceWorker} from '../src/connection-worker.mjs';
import {getFinanceStorePeriod} from '../../cloudflare/src/app-store-period.mjs';

const origin='https://auth.brazacommerce.com.br';
const path='/internal/shopee/finance/store-period';
const router='fixture-period-router-'+'x'.repeat(40);
const runId='12345678-1234-4123-8123-123456789abc';
const start={operation:'start',start_date:'2026-10-14',end_date:'2026-10-20'};
const frame=()=>({schema:'finance_store_period_v1',run_id:runId,revision:1,status:'RUNNING',
 start_date:start.start_date,end_date:start.end_date,cutoff_at:1792510733,checked_at:1792510733,
 currency:'BRL',monetary_unit:'UNCONFIRMED',order_count:0,pages_read:0,duplicate_orders:0,returns_orders:0,
 escrow_amount_raw:'0',ads_recharge_or_support_raw:'0',items:[],diagnostic:null});
const request=(body=JSON.stringify(start),options={})=>new Request((options.origin||origin)+(options.path||path),{
 method:options.method||'POST',headers:{'content-type':'application/json','X-Braza-Finance-Router':router,...options.headers},
 ...(options.method==='GET'?{}:{body}),
});
const trusted={validateInternalApp:async()=>true};
const response=(body,status=200)=>Response.json(body,{status});

test('store period route is private, authenticated and strict before any capability or database access',async()=>{
 let calls=0;
 const env={FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true',SHOPEE_FINANCE_SERVICE:{fetch(){calls++;}},get FINANCE_DB(){throw Error('must not read DB');}};
 const worker=createFinanceWorker({storePeriod:async()=>{calls++;return frame();},fetchImpl:async()=>{calls++;}});
 const untrusted=request();
 assert.equal((await forwardFinancePaymentSample(untrusted,env,{validateInternalApp:async()=>false})).status,401);
 assert.equal(untrusted.bodyUsed,false);assert.equal((await forwardFinanceConnection(request(),env)).status,404);
 assert.equal((await worker.fetch(request(undefined,{headers:{'X-Braza-Finance-Router':'wrong'}}),env)).status,403);
 const invalid=[{},null,[],{...start,shop_id:1},{...start,access_token:'PRIVATE_TOKEN'},
  {...start,start_date:'2026-02-30'},{...start,start_date:'2026-10-01'},
  {operation:'read',run_id:runId.toUpperCase()},{operation:'read',run_id:'123'},
  {operation:'step',run_id:runId,revision:1},{operation:'delete',run_id:runId}];
 for(const value of invalid){
  const raw=JSON.stringify(value);
  assert.equal((await forwardFinancePaymentSample(request(raw),env,trusted)).status,400,raw);
  assert.equal((await worker.fetch(request(raw),env)).status,400,raw);
 }
 for(const raw of [' '.repeat(257),'{bad JSON']){
  assert.equal((await forwardFinancePaymentSample(request(raw),env,trusted)).status,400);
  assert.equal((await worker.fetch(request(raw),env)).status,400);
 }
 for(const [options,status] of [[{origin:'https://foreign.invalid'},404],[{path:path+'/'},404],
  [{path:'/shopee/finance/store-period'},404],[{path:path+'?shop_id=1'},400],[{method:'GET'},405],
  [{headers:{'content-type':'text/plain'}},400],[{headers:{'content-length':'257'}},400]]){
  assert.equal((await forwardFinancePaymentSample(request(undefined,options),env,trusted)).status,status);
  assert.equal((await worker.fetch(request(undefined,options),env)).status,status);
 }
 assert.equal(calls,0);
});

test('store period capability is explicit and closed by default or when the finance connection flag is disabled',async()=>{
 let calls=0;
 const env={FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true',get FINANCE_DB(){throw Error('must not read DB');}};
 for(const worker of [defaultWorker,createFinanceWorker({fetchImpl:async()=>{calls++;}}),createFinanceWorker({storePeriod:async()=>{calls++;}})]){
  assert.equal((await worker.fetch(request(),env)).status,503);
 }
 const worker=createFinanceWorker({storePeriod:async()=>{calls++;},fetchImpl:async()=>{calls++;}});
 for(const flag of [undefined,'false',true])assert.equal((await worker.fetch(request(),Object.assign(Object.create(env),{FINANCE_CONNECTION_ENABLED:flag}))).status,503);
 assert.equal(calls,0);
});

test('store period accepts exactly 256 request bytes and rejects 257 before forwarding',async()=>{
 const raw=JSON.stringify(start).padEnd(256,' ');assert.equal(Buffer.byteLength(raw),256);
 const env={FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'};
 const worker=createFinanceWorker({storePeriod:async()=>frame(),fetchImpl:async()=>{}});
 assert.equal((await worker.fetch(request(raw),env)).status,200);
 assert.equal((await forwardFinancePaymentSample(request(raw),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>response(frame())}},trusted)).status,200);
 assert.equal((await worker.fetch(request(raw+' '),env)).status,400);
 assert.equal((await forwardFinancePaymentSample(request(raw+' '),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch(){throw Error('must not forward');}}},trusted)).status,400);
});

test('start, step and read cross the three fixed private boundaries with only their projected request and dedicated credentials',async()=>{
 for(const input of [start,{operation:'step',run_id:runId},{operation:'read',run_id:runId}]){
  const now=()=>1792510733000,fetchImpl=async()=>{};
  let appCalls=0,serviceCalls=0,capabilityCalls=0;
  const env={FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'};
  const worker=createFinanceWorker({storePeriod:async(actual,options)=>{
   capabilityCalls++;assert.equal(actual,env);assert.deepEqual(options,{fetchImpl,now,...input});return frame();
  },fetchImpl,now});
  const authEnv={FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async forwarded=>{
   serviceCalls++;assert.equal(forwarded.url,origin+path);assert.equal(forwarded.method,'POST');assert.equal(forwarded.redirect,'manual');
   assert.deepEqual(await forwarded.clone().json(),input);assert.equal(forwarded.headers.get('x-braza-finance-router'),router);
   for(const name of ['cookie','authorization','x-braza-app-key','x-braza-gateway-key'])assert.equal(forwarded.headers.get(name),null);
   return worker.fetch(forwarded,env);
  }}};
  const result=await getFinanceStorePeriod({APP_INTERNAL_SECRET:'fixture-period-app'},input,{fetchImpl:async forwarded=>{
   appCalls++;assert.equal(forwarded.url,origin+path);assert.equal(forwarded.method,'POST');assert.equal(forwarded.redirect,'manual');
   assert.deepEqual(await forwarded.clone().json(),input);assert.equal(forwarded.headers.get('x-braza-app-key'),'fixture-period-app');
   for(const name of ['cookie','authorization','x-braza-finance-router','x-braza-gateway-key'])assert.equal(forwarded.headers.get(name),null);
   return forwardFinancePaymentSample(forwarded,authEnv,{validateInternalApp:async actual=>actual.headers.get('x-braza-app-key')==='fixture-period-app'});
  }});
  assert.deepEqual(result,frame());assert.equal(appCalls,1);assert.equal(serviceCalls,1);assert.equal(capabilityCalls,1);
 }
});

test('each boundary rejects substituted periods, run IDs and private-extra frames without exporting provider content',async()=>{
 const foreignRun={...frame(),run_id:'22345678-1234-4123-8123-123456789abc'};
 const foreignWindow={...frame(),start_date:'2026-10-15'};
 const poisoned={...frame(),access_token:'PRIVATE_TOKEN',order_sn:'PRIVATE_ORDER',message:'PRIVATE_PROVIDER'};
 for(const [input,value] of [[start,foreignWindow],[{operation:'read',run_id:runId},foreignRun],
  [{operation:'step',run_id:runId},foreignRun],[start,poisoned],[start,{...frame(),monetary_unit:'CENTS'}],
  [start,{...frame(),escrow_amount_raw:'0.00'}]]){
  const app=await getFinanceStorePeriod({APP_INTERNAL_SECRET:'fixture'},input,{fetchImpl:async()=>response(value)});
  assert.equal(app.status,'UNAVAILABLE');assert.ok(!JSON.stringify(app).includes('PRIVATE'));
  const auth=await forwardFinancePaymentSample(request(JSON.stringify(input)),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>response(value)}},trusted);
  assert.equal(auth.status,502);assert.ok(!(await auth.text()).includes('PRIVATE'));
  const worker=createFinanceWorker({storePeriod:async()=>value,fetchImpl:async()=>{}});
  const finance=await worker.fetch(request(JSON.stringify(input)),{FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'});
  assert.equal(finance.status,502);assert.ok(!(await finance.text()).includes('PRIVATE'));
 }
});

test('raw period totals remain canonical decimal strings, unknown return coverage remains null, and the bounded item list can exceed 64KiB',async()=>{
 const value={...frame(),status:'COMPLETE',order_count:1,pages_read:1,returns_orders:null,
  escrow_amount_raw:'1234567890.123456789012',ads_recharge_or_support_raw:'-2.345678901234',
  items:Array.from({length:1000},(_,index)=>({item_id:'99999999999999999999',model_id:String(99999999999999999000n+BigInt(index)),quantity:1}))};
 assert.ok(JSON.stringify(value).length>65536);assert.ok(JSON.stringify(value).length<262144);
 const auth=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>response(value)}},trusted);
 assert.equal(auth.status,200);assert.deepEqual(await auth.json(),value);
 assert.deepEqual(await getFinanceStorePeriod({APP_INTERNAL_SECRET:'fixture'},start,{fetchImpl:async()=>response(value)}),value);
 for(const bad of [new Response(' '.repeat(524289),{headers:{'content-type':'application/json'}}),
  new Response('PRIVATE_HTML',{headers:{'content-type':'text/html'}}),new Response(null,{status:302,headers:{location:'https://foreign.invalid'}}),
  response({...value,message:'PRIVATE_ERROR'},403)]){
  const result=await getFinanceStorePeriod({APP_INTERNAL_SECRET:'fixture'},start,{fetchImpl:async()=>bad});
  assert.equal(result.status,'UNAVAILABLE');assert.ok(!JSON.stringify(result).includes('PRIVATE'));
 }
});

test('a maximum product breakdown crosses 256KiB and both private transports enforce the 512KiB boundary',async()=>{
 const ids=Array.from({length:1000},(_,index)=>String(99999999999999999000n+BigInt(index)));
 const value={...frame(),status:'COMPLETE',order_count:1000,pages_read:200,
  escrow_amount_raw:'123456789012123.456789012',items:ids.map(item_id=>({item_id,model_id:'99999999999999999999',quantity:1000000000000})),
  product_breakdown:{schema:'store_product_breakdown_v1',exclusive_order_count:1000,mixed_order_count:0,
   exclusive_payout_raw:'123456789012123.456789012',mixed_payout_raw:'0',
   products:ids.map(item_id=>({item_id,order_count:1,exclusive_order_count:1,mixed_order_count:0,
    exclusive_payout_raw:'123456789012.123456789012',returns_orders:0}))},
  returns_breakdown:{schema:'store_returns_breakdown_v1',with_return:{order_count:0,payout_raw:'0'},
   without_reported_return:{order_count:1000,payout_raw:'123456789012123.456789012'},unknown:{order_count:0,payout_raw:'0'},
   products:ids.map(item_id=>({item_id,order_count:1,with_return_orders:0,without_reported_return_orders:1,unknown_orders:0}))},
  invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',
   rounding:'HALF_UP_PER_ORDER',covered_orders:1000,unavailable_orders:0,known_base_raw:'1000',known_tax_raw:'20'}};
 const raw=JSON.stringify(value);assert.ok(Buffer.byteLength(raw)>262144);
 const padded=raw.padEnd(524288,' '),env={APP_INTERNAL_SECRET:'fixture'};
 const upstream=body=>new Response(body,{headers:{'content-type':'application/json'}});
 assert.deepEqual(await getFinanceStorePeriod(env,start,{fetchImpl:async()=>upstream(padded)}),value);
 const auth=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:router,
  SHOPEE_FINANCE_SERVICE:{fetch:async()=>upstream(padded)}},trusted);
 assert.equal(auth.status,200);assert.deepEqual(await auth.json(),value);
 for(const declared of [false,true]){
  const excessive=()=>new Response(padded+' ',{headers:{'content-type':'application/json',...(declared?{'content-length':'524289'}:{})}});
  assert.equal((await getFinanceStorePeriod(env,start,{fetchImpl:async()=>excessive()})).status,'UNAVAILABLE');
  const rejected=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:router,
   SHOPEE_FINANCE_SERVICE:{fetch:async()=>excessive()}},trusted);
  assert.equal(rejected.status,502);
 }
});

test('missing configuration and invalid requests do not call the period service; timeout aborts and cancels a late body',async()=>{
 let calls=0;
 for(const [env,input] of [[{},start],[{APP_INTERNAL_SECRET:'fixture'},{}],[{APP_INTERNAL_SECRET:'fixture'},{...start,url:'https://foreign.invalid'}]]){
  assert.equal((await getFinanceStorePeriod(env,input,{fetchImpl:async()=>{calls++;}})).status,'UNAVAILABLE');
 }
 assert.equal(calls,0);
 let resolveFetch,signal,cancelled=0;
 const result=await getFinanceStorePeriod({APP_INTERNAL_SECRET:'fixture'},start,{timeoutMs:5,fetchImpl:actual=>{
  signal=actual.signal;return new Promise(resolve=>{resolveFetch=resolve;});
 }});
 assert.equal(result.diagnostic.code,'FINANCE_STORE_UNAVAILABLE');assert.equal(signal.aborted,true);
 resolveFetch(new Response(new ReadableStream({cancel(){cancelled++;}}),{headers:{'content-type':'application/json'}}));
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(cancelled,1);
 const worker=createFinanceWorker({storePeriod:async()=>{throw Error('PRIVATE_DATABASE_ERROR');},fetchImpl:async()=>{}});
 const failed=await worker.fetch(request(),{FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'});
 assert.equal(failed.status,502);assert.equal((await failed.json()).error,'FINANCE_STORE_UNAVAILABLE');
});

test('Auth store deadline cancels a late service body and exports only its finite failure',async()=>{
 const original=setTimeout;let resolveFetch,signal,calls=0,cancelled=0;
 globalThis.setTimeout=(callback,delay,...args)=>original(callback,delay===45000?5:delay,...args);
 try{
  const result=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:actual=>{
   calls++;signal=actual.signal;return new Promise(resolve=>{resolveFetch=resolve;});
  }}},trusted);
  assert.equal(result.status,502);assert.equal(calls,1);assert.equal(signal.aborted,true);
  const body=new ReadableStream({pull(){},cancel(){cancelled++;}});
  resolveFetch(new Response(body,{headers:{'content-type':'application/json'}}));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,1);assert.equal(body.locked,false);
  assert.deepEqual(await result.json(),{error:'FINANCE_STORE_UNAVAILABLE',diagnostic:{code:'FINANCE_STORE_UNAVAILABLE',http:null}});
 }finally{globalThis.setTimeout=original;}
});
