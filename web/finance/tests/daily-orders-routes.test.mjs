import test from 'node:test';
import assert from 'node:assert/strict';
import {forwardFinanceDailyOrders} from '../src/auth-router.mjs';
import defaultFinanceWorker, {createFinanceWorker} from '../src/connection-worker.mjs';

const origin='https://auth.brazacommerce.com.br';
const path='/internal/shopee/finance/daily-orders';
const routerSecret='fixture-daily-router-'+ 'r'.repeat(40);
const authenticated={validateInternalApp:async()=>true};
const stamp=(milliseconds=Date.now())=>new Date(milliseconds-10800000).toISOString().replace('Z','-03:00');
function frame(changes={}){
 const through_at=stamp();
 return {schema:'shop_daily_sales_v1',shop_id:1178167501,date:through_at.slice(0,10),timezone:'America/Sao_Paulo',through_at,day_partial:true,
  orders_in_api_window:6,orders_with_details:6,sales_orders:1,cancelled_orders:1,cancellation_pending_orders:1,unpaid_orders:1,other_orders:1,unknown_status_orders:1,
  pagination_complete:true,pages_read:1,duplicate_rows:0,count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_CURRENT_STATUS',source:'shopee_get_order_list_and_detail',...changes};
}
const request=(options={})=>new Request((options.origin||origin)+(options.path||path),{method:options.method||'GET',headers:options.headers});
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...headers}});
const configuration=fetch=>({FINANCE_ROUTER_SECRET:routerSecret,SHOPEE_FINANCE_SERVICE:{fetch}});
function safe(raw){for(const value of ['PRIVATE_',routerSecret])assert.ok(!raw.includes(value));}
const financeEnv=()=>({FINANCE_ROUTER_SECRET:routerSecret,FINANCE_CONNECTION_ENABLED:'true'});
const financeRequest=(options={})=>request({...options,headers:{'x-braza-finance-router':routerSecret,...options.headers}});

test('daily Auth route confines host, path, method and query before reaching the private service',async()=>{
 let calls=0;const env=configuration(()=>{calls++;throw Error('PRIVATE_UNREACHABLE');});
 for(const [options,status] of [[{origin:'https://other.invalid'},404],[{path:path+'/'},404],[{path:'/shopee/finance/daily-orders'},404],
  [{path:path+'?shop_id=999'},400],[{path:path+'?date=2000-01-01'},400],[{method:'POST'},405],[{method:'HEAD'},405]]){
  assert.equal((await forwardFinanceDailyOrders(request(options),env,authenticated)).status,status);
 }
 assert.equal(calls,0);
});

test('daily Auth route requires internal App authentication and configured financial binding without using caller credentials',async()=>{
 let calls=0;const env=configuration(()=>{calls++;throw Error('PRIVATE_UNREACHABLE');});
 const incoming=request({headers:{cookie:'braza_admin=PRIVATE_ADMIN',authorization:'Bearer PRIVATE_CALLER','x-braza-finance-router':routerSecret}});
 for(const services of [{},{validateInternalApp:async()=>false}])assert.equal((await forwardFinanceDailyOrders(incoming,env,services)).status,401);
 const failed=await forwardFinanceDailyOrders(incoming,env,{validateInternalApp:async()=>{throw Error('PRIVATE_AUTH_FAILURE');}});
 assert.equal(failed.status,502);safe(await failed.text());
 for(const invalid of [{},{FINANCE_ROUTER_SECRET:'short',SHOPEE_FINANCE_SERVICE:env.SHOPEE_FINANCE_SERVICE},{FINANCE_ROUTER_SECRET:routerSecret},{GATEWAY_SHARED_SECRET:routerSecret,SHOPEE_FINANCE_SERVICE:env.SHOPEE_FINANCE_SERVICE}]){
  assert.equal((await forwardFinanceDailyOrders(request(),invalid,authenticated)).status,503);
 }
 assert.equal(calls,0);
});

test('daily Auth read sends only its router secret over the fixed GET binding and returns only aggregate JSON',async()=>{
 const value=frame();let calls=0;
 const response=await forwardFinanceDailyOrders(request({headers:{cookie:'braza_admin=PRIVATE_ADMIN; braza_finance_oauth=PRIVATE_OAUTH',authorization:'Bearer PRIVATE_CALLER','x-braza-app-key':'PRIVATE_APP','x-braza-finance-router':'PRIVATE_ATTACKER','x-csrf-token':'PRIVATE_CSRF'}}),configuration(async forwarded=>{
  calls++;assert.equal(forwarded.url,origin+path);assert.equal(forwarded.method,'GET');assert.equal(forwarded.redirect,'manual');assert.equal(await forwarded.text(),'');
  assert.equal(forwarded.headers.get('x-braza-finance-router'),routerSecret);assert.equal(forwarded.headers.get('accept'),'application/json');assert.ok(forwarded.signal instanceof AbortSignal);
  for(const name of ['cookie','authorization','x-braza-app-key','x-csrf-token'])assert.equal(forwarded.headers.get(name),null);
  return json(value,200,{'set-cookie':'session=PRIVATE_COOKIE',location:'https://evil.invalid/PRIVATE_LOCATION'});
 }),authenticated);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),value);assert.equal(calls,1);
 assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('location'),null);
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
});

test('daily Auth projection refuses private extras, contradictory status counts and incomplete details rather than presenting a sale count',async()=>{
 const mutations=[value=>{value.access_token='PRIVATE_ACCESS';},value=>{value.order_sn='PRIVATE_ORDER';},value=>{value.sales_orders++;},value=>{value.cancelled_orders=-1;},
  value=>{value.orders_with_details--;},value=>{value.pagination_complete=false;},value=>{value.sales_orders=true;},value=>{value.schema='shop_orders_v1';},
  value=>{value.shop_id=999;},value=>{value.source='ads';},value=>{value.count_basis='UNIQUE_ORDER_SN_CREATE_TIME_NO_STATUS_FILTER';}];
 for(const mutate of mutations){const value=frame();mutate(value);const response=await forwardFinanceDailyOrders(request(),configuration(()=>json(value)),authenticated);assert.equal(response.status,502);safe(await response.text());}
});

test('daily Auth freshness rejects a previous date, old snapshots and future snapshots',async()=>{
 for(const age of [86400000,121000,-61000]){
  const through_at=stamp(Date.now()-age),value=frame({date:through_at.slice(0,10),through_at});
  const response=await forwardFinanceDailyOrders(request(),configuration(()=>json(value)),authenticated);
  assert.equal(response.status,502);safe(await response.text());
 }
});

test('daily Auth accepts real zero sales independently of cancelled and unpaid order counts',async()=>{
 for(const value of [frame({sales_orders:0,cancelled_orders:2}),frame({orders_in_api_window:0,orders_with_details:0,sales_orders:0,cancelled_orders:0,cancellation_pending_orders:0,unpaid_orders:0,other_orders:0,unknown_status_orders:0})]){
  const response=await forwardFinanceDailyOrders(request(),configuration(()=>json(value)),authenticated);
  assert.equal(response.status,200);assert.deepEqual(await response.json(),value);
 }
});

test('daily Auth errors, malformed JSON, redirects, non-JSON and oversized bodies never expose private provider data',async()=>{
 const handlers=[()=>json({error:'PRIVATE_ERROR',message:'PRIVATE_MESSAGE'},403),()=>json({error:'PRIVATE_ERROR'},503),
  ()=>new Response(null,{status:302,headers:{location:'https://evil.invalid/PRIVATE_REDIRECT'}}),
  ()=>new Response('PRIVATE_HTML',{headers:{'content-type':'text/html'}}),()=>new Response('{PRIVATE_JSON',{headers:{'content-type':'application/json'}}),
  ()=>new Response('x'.repeat(4097),{headers:{'content-type':'application/json'}}),()=>json(frame(),200,{'content-length':'4097'}),
  ()=>json(frame(),200,{'content-length':'NaN'}),()=>{throw Error('PRIVATE_NETWORK_FAILURE');}];
 for(const handler of handlers){const response=await forwardFinanceDailyOrders(request(),configuration(handler),authenticated);assert.equal(response.status,502);safe(await response.text());}
});

test('daily Auth deadline aborts one binding read and cancels a late body without acquiring it',async()=>{
 const original=setTimeout;let release,calls=0,cancelled=0,signal;
 globalThis.setTimeout=(callback,delay,...args)=>original(callback,delay===45000?5:delay,...args);
 try{
  const response=await forwardFinanceDailyOrders(request(),configuration(forwarded=>{calls++;signal=forwarded.signal;return new Promise(resolve=>{release=resolve;});}),authenticated);
  assert.equal(response.status,502);assert.equal(calls,1);assert.equal(signal.aborted,true);safe(await response.text());
  const body=new ReadableStream({pull(){},cancel(){cancelled++;}});release(new Response(body,{headers:{'content-type':'application/json'}}));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,1);assert.equal(body.locked,false);
 }finally{globalThis.setTimeout=original;}
});

test('daily Auth deadline includes a stalled JSON response body',async()=>{
 const original=setTimeout;let cancelled=0;
 globalThis.setTimeout=(callback,delay,...args)=>original(callback,delay===45000?5:delay,...args);
 try{
  const response=await forwardFinanceDailyOrders(request(),configuration(()=>new Response(new ReadableStream({pull(){},cancel(){cancelled++;}}),{headers:{'content-type':'application/json'}})),authenticated);
  assert.equal(response.status,502);assert.ok(cancelled>=1);safe(await response.text());
 }finally{globalThis.setTimeout=original;}
});

test('daily Finance capability is private, GET-only and rejects caller-selected queries before reads',async()=>{
 let calls=0;const worker=createFinanceWorker({dailyOrders:async()=>{calls++;return frame();},fetchImpl:async()=>{throw Error('PRIVATE_NETWORK');}}),env=financeEnv();
 for(const [options,status] of [[{headers:{'x-braza-finance-router':'PRIVATE_ATTACKER'}},403],[{headers:{'x-braza-finance-router':''}},403],
  [{method:'POST'},405],[{method:'HEAD'},405],[{path:path+'?shop_id=999'},400],[{path:path+'?date=2000-01-01'},400],
  [{origin:'https://other.invalid'},404],[{path:'/shopee/finance/daily-orders'},404],[{path:path+'/'},404]]){
  const response=await worker.fetch(financeRequest(options),env);assert.equal(response.status,status);safe(await response.text());
 }
 assert.equal(calls,0);
});

test('daily Finance capability requires its explicit flag, collector and transport without touching storage',async()=>{
 let calls=0;
 const database={prepare(){throw Error('PRIVATE_DATABASE_SHOULD_NOT_BE_TOUCHED');}};
 for(const kind of ['default','missing-collector','missing-fetch','disabled','boolean-flag']){
  const env={...financeEnv(),FINANCE_DB:database,FINANCE_CONNECTION_ENABLED:kind==='disabled'?'false':kind==='boolean-flag'?true:'true'};
  const worker=kind==='default'?defaultFinanceWorker:createFinanceWorker({dailyOrders:kind==='missing-collector'?undefined:async()=>{calls++;return frame();},fetchImpl:kind==='missing-fetch'?undefined:async()=>{throw Error('PRIVATE_PROVIDER');}});
  const response=await worker.fetch(financeRequest(),env);assert.equal(response.status,503);safe(await response.text());
 }
 assert.equal(calls,0);
});

test('daily Finance passes only its environment and transport clock to the collector and projects the result',async()=>{
 const env=financeEnv(),value=frame(),clock=()=>Date.now(),fetchImpl=async()=>{throw Error('PRIVATE_PROVIDER');};let calls=0;
 const worker=createFinanceWorker({now:clock,fetchImpl,dailyOrders:async(actual,options)=>{
  calls++;assert.equal(actual,env);assert.deepEqual(Object.keys(options).sort(),['fetchImpl','now']);assert.equal(options.now,clock);assert.equal(options.fetchImpl,fetchImpl);return value;
 }});
 const response=await worker.fetch(financeRequest({headers:{cookie:'braza_admin=PRIVATE_ADMIN',authorization:'Bearer PRIVATE_CALLER','x-braza-app-key':'PRIVATE_APP'}}),env);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),value);assert.equal(calls,1);
 assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('set-cookie'),null);
});

test('daily Finance refuses malformed aggregates and sanitizes collector failures',async()=>{
 const env=financeEnv();
 for(const dailyOrders of [async()=>({...frame(),order_sn:'PRIVATE_ORDER'}),async()=>({...frame(),sales_orders:99}),async()=>({...frame(),orders_with_details:1}),async()=>null,async()=>{throw Error('PRIVATE_TOKEN_OR_PROVIDER_URL');}]){
  const worker=createFinanceWorker({dailyOrders,fetchImpl:async()=>{throw Error('PRIVATE_PROVIDER');}});
  const response=await worker.fetch(financeRequest(),env);assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:'SHOP_ORDERS_UNAVAILABLE'});
 }
});
