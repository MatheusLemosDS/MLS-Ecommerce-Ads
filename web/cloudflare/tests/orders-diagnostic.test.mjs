import test from 'node:test';
import assert from 'node:assert/strict';
import {safeOrdersDiagnostic} from '../src/orders-diagnostic.mjs';
import {boundedOrdersRead} from '../src/orders-http.mjs';
import {getShopOrders} from '../src/app-shop-orders.mjs';
import authWorker from '../auth-worker.mjs';
import appWorker from '../app-worker.mjs';
import {D1} from './sqlite-d1.mjs';

const base='https://app.example.test';
const authEnv={APP_INTERNAL_SECRET:'fixture-app-secret',GATEWAY_SHARED_SECRET:'fixture-gateway-secret',GATEWAY_URL:'https://gateway.example.test'};
function currentSummary(){
 const through=new Date(Date.now()-10800000).toISOString().replace('Z','-03:00');
 return {schema:'shop_orders_v1',shop_id:1178167501,date:through.slice(0,10),timezone:'America/Sao_Paulo',through_at:through,day_partial:true,orders_in_api_window:12,pagination_complete:true,pages_read:1,duplicate_rows:0,count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_NO_STATUS_FILTER',order_status_filter:'NONE',dashboard_counter_reconciled:false,source:'shopee_get_order_list',api_error:'NO',transport_http:200};
}
async function adminSession(secret=authEnv.APP_INTERNAL_SECRET){
 const env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'fixture-session-secret-1234567890123456',ADMIN_USERNAME:'fixture-admin',ADMIN_PASSWORD:'fixture-password-123456',APP_INTERNAL_SECRET:secret};
 const response=await appWorker.fetch(new Request(base+'/admin/login',{method:'POST',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(response.status,303);
 return {env,cookie:response.headers.get('set-cookie').split(';')[0]};
}

test('diagnostic allowlist strips private data and rejects invalid identities/types',()=>{
 const safe={stage:'AUTH_TO_GATEWAY',code:'HTTP_STATUS',http:403};
 assert.deepEqual(safeOrdersDiagnostic({...safe,headers:'PRIVATE',buyer:'PRIVATE',stack:'PRIVATE'}),safe);
 for(const value of [null,[],{...safe,stage:'PRIVATE'},{...safe,code:'PRIVATE'},{...safe,http:'403'},{...safe,http:99},{...safe,http:600},{...safe,http:true},{...safe,validation:'PRIVATE'}])assert.equal(safeOrdersDiagnostic(value),null);
});

test('Cloudflare-compatible manual reads refuse every redirect without following or forwarding keys',async()=>{
 const original=globalThis.fetch;
 try{
  for(const status of [301,302,303,307,308]){
   const calls=[];
   globalThis.fetch=async(target,options)=>{calls.push({target,options});assert.equal(options.redirect,'manual');return new Response('PRIVATE_BODY',{status,headers:{location:'https://foreign.invalid/PRIVATE'}});};
   const result=await boundedOrdersRead('https://gateway.example.test/fixed',{'X-Braza-Gateway-Key':'fixture-gateway-secret'},45000);
   assert.equal(result.ok,false);assert.equal(result.failure_code,'HTTP_STATUS');assert.equal(result.http,status);
   assert.equal(calls.length,1);assert.equal(calls[0].target,'https://gateway.example.test/fixed');assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
 }finally{globalThis.fetch=original;}
});

test('HTTP/JSON/body/timeout/runtime failures retain safe codes without raw contents',async()=>{
 const originalFetch=globalThis.fetch,originalTimeout=AbortSignal.timeout;
 try{
  for(const [response,code,http] of [[new Response('<html>PRIVATE</html>',{status:403}),'HTTP_STATUS',403],[new Response('PRIVATE'),'INVALID_JSON',200],[new Response(' '.repeat(16385)),'BODY_LIMIT',200]]){
   globalThis.fetch=async()=>response;
   const result=await getShopOrders({APP_INTERNAL_SECRET:'fixture-app-secret'});
   assert.deepEqual(result,{diagnostic:{stage:'APP_TO_AUTH',code,http}});
  }
  AbortSignal.timeout=()=>{const controller=new AbortController();setTimeout(()=>controller.abort(),5);return controller.signal;};
  globalThis.fetch=async(target,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('PRIVATE')),{once:true}));
  assert.deepEqual(await getShopOrders({APP_INTERNAL_SECRET:'fixture-app-secret'}),{diagnostic:{stage:'APP_TO_AUTH',code:'TIMEOUT',http:null}});
  AbortSignal.timeout=undefined;
  let reads=0;globalThis.fetch=async()=>{reads++;throw Error('must not call');};
  assert.deepEqual(await getShopOrders({APP_INTERNAL_SECRET:'fixture-app-secret'}),{diagnostic:{stage:'APP_TO_AUTH',code:'RUNTIME_UNSUPPORTED',http:null}});
  assert.equal(reads,0);
 }finally{globalThis.fetch=originalFetch;AbortSignal.timeout=originalTimeout;}
});

test('authenticated generated chain reports native failures and validation stages, with null counts and no jobs',async()=>{
 const originalFetch=globalThis.fetch;
 try{
  const stale=currentSummary();stale.date='2020-01-01';stale.through_at='2020-01-01T13:00:00-03:00';
  for(const [makeResponse,expected] of [
   [()=>new Response('PRIVATE',{status:403}),{stage:'AUTH_TO_GATEWAY',code:'HTTP_STATUS',http:403}],
   [()=>Response.json({error:'PRIVATE',buyer:'PRIVATE'}),{stage:'AUTH_VALIDATION',code:'INVALID_RESPONSE',http:200,validation:'INVALID_RESPONSE'}],
   [()=>Response.json(stale),{stage:'AUTH_VALIDATION',code:'STALE_DATE',http:200,validation:'STALE_DATE'}],
  ]){
   const {env,cookie}=await adminSession();let nativeReads=0;
   globalThis.fetch=async(target,options)=>{
    const url=new URL(target);assert.equal(options.redirect,'manual');
    if(url.hostname==='gateway.example.test'){nativeReads++;return makeResponse();}
    if(url.hostname==='auth.brazacommerce.com.br')return authWorker.fetch(new Request(url,options),authEnv);
    throw Error('Unexpected fixture destination');
   };
   const response=await appWorker.fetch(new Request(base+'/api/admin/shop-orders',{headers:{cookie}}),env);
   const result=await response.json();assert.equal(response.status,200);assert.equal(result.orders_in_api_window,null);assert.deepEqual(result.diagnostic,expected);assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.equal(nativeReads,1);
   assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM hermes_jobs').get().n,0);
   assert.equal(env.ADMIN_DB.db.prepare('SELECT revision FROM admin_settings').get().revision,1);
  }
 }finally{globalThis.fetch=originalFetch;}
});

test('App key denial and missing Auth bindings are distinguished without gateway reads or secret output',async()=>{
 const originalFetch=globalThis.fetch;
 try{
  for(const [appSecret,authBindings,expected] of [
   ['fixture-wrong-key',authEnv,{stage:'APP_TO_AUTH',code:'HTTP_STATUS',http:401}],
   [authEnv.APP_INTERNAL_SECRET,{APP_INTERNAL_SECRET:authEnv.APP_INTERNAL_SECRET},{stage:'AUTH_CONFIG',code:'MISSING_BINDING',http:null}],
  ]){
   const {env,cookie}=await adminSession(appSecret);let nativeReads=0;
   globalThis.fetch=async(target,options)=>{
    if(new URL(target).hostname!=='auth.brazacommerce.com.br'){nativeReads++;throw Error('must not reach gateway');}
    return authWorker.fetch(new Request(target,options),authBindings);
   };
   const result=await(await appWorker.fetch(new Request(base+'/api/admin/shop-orders',{headers:{cookie}}),env)).json();
   assert.deepEqual(result.diagnostic,expected);assert.equal(result.orders_in_api_window,null);assert.equal(nativeReads,0);assert.ok(!JSON.stringify(result).includes(appSecret));
  }
 }finally{globalThis.fetch=originalFetch;}
});

test('manual corrected generated chain returns validated API count, independent of Ads and diagnostic data',async()=>{
 const originalFetch=globalThis.fetch,{env,cookie}=await adminSession();let nativeReads=0;
 globalThis.fetch=async(target,options)=>{
  assert.equal(options.redirect,'manual');const url=new URL(target);
  if(url.hostname==='gateway.example.test'){nativeReads++;assert.equal(options.headers['X-Braza-Gateway-Key'],authEnv.GATEWAY_SHARED_SECRET);return Response.json({...currentSummary(),access_token:'PRIVATE'});}
  return authWorker.fetch(new Request(url,options),authEnv);
 };
 try{
  const result=await(await appWorker.fetch(new Request(base+'/api/admin/shop-orders?shop_id=999',{headers:{cookie}}),env)).json();
  assert.equal(result.status,'AVAILABLE');assert.equal(result.orders_in_api_window,12);assert.equal(result.dashboard_counter_reconciled,false);assert.equal(result.diagnostic,undefined);assert.equal(nativeReads,1);assert.ok(!JSON.stringify(result).includes('PRIVATE'));
 }finally{globalThis.fetch=originalFetch;}
});
