import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {collectionFixture} from './business-collection-fixture.mjs';

async function compiledWorker(name,minify){
 const result=await build({entryPoints:[fileURLToPath(new URL('../../../dist/'+name+'-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 return (await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))).default;
}

for(const minify of [false,true])test(`the three deployed Workers preserve a rate-limited page and resume only its failed payment (minify=${minify})`,async()=>{
 const [app,auth,finance]=await Promise.all(['app','auth','finance'].map(name=>compiledWorker(name,minify)));
 const f=await collectionFixture({allPaid:true,windowCounts:[40,0]}),savedFetch=globalThis.fetch,SavedDate=globalThis.Date,routerSecret='PRIVATE_COMPILED_ROUTER_'+'r'.repeat(40),appSecret='PRIVATE_COMPILED_APP_'+'a'.repeat(40),origin='https://app.compiled.collection.test',calls={auth:0,finance:0};
 const env={...f.env,APP_INTERNAL_SECRET:appSecret,ADMIN_USERNAME:'compiled-collection-owner',ADMIN_PASSWORD:'compiled-collection-password-123456',ADMIN_SESSION_SECRET:'PRIVATE_COMPILED_SESSION_'+'s'.repeat(40)};
 const financeEnv={...f.financeEnv,FINANCE_ROUTER_SECRET:routerSecret};
 const authEnv={APP_INTERNAL_SECRET:appSecret,FINANCE_ROUTER_SECRET:routerSecret,SHOPEE_FINANCE_SERVICE:{fetch:async request=>{
  calls.finance++;assert.equal(request.headers.get('X-Braza-Finance-Router'),routerSecret);assert.equal(request.headers.get('X-Braza-App-Key'),null);assert.equal(request.headers.get('cookie'),null);
  return finance.fetch(request,financeEnv);
 }}};
 globalThis.Date=class extends SavedDate{constructor(...args){super(...(args.length?args:[f.clock.time]));}static now(){return f.clock.time;}};
 globalThis.fetch=async input=>{
  const request=input instanceof Request?input:new Request(input),url=new URL(request.url);
  if(url.origin==='https://partner.shopeemobile.com')return f.fetchImpl(request);
  assert.equal(url.origin,'https://auth.brazacommerce.com.br');assert.equal(url.pathname,'/internal/shopee/finance/business-period');assert.equal(request.headers.get('X-Braza-App-Key'),appSecret);assert.equal(request.headers.get('cookie'),null);calls.auth++;
  return auth.fetch(request,authEnv);
 };
 try{
  const login=await app.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
  assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0],state=await(await app.fetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();
  const invoke=async operation=>{
   const response=await app.fetch(new Request(origin+'/api/admin/finance/business-month',{method:'POST',headers:{origin,cookie,'content-type':'application/json','X-CSRF-Token':state.csrf,'X-Braza-Client-Contract':'business-month-v2'},body:JSON.stringify({operation,month:'2026-10'})}),env);
   const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));
   const text=JSON.stringify(value);for(const secret of [routerSecret,appSecret,'PRIVATE_INTEGRATION_ACCESS','PRIVATE_INTEGRATION_ORDER','PRIVATE_INTEGRATION_KEY'])assert.ok(!text.includes(secret));return value;
  };
  await invoke('start');const first=await invoke('step');assert.equal(first.coverage.orders,20);assert.equal(first.known_sales_cents,130500);
  f.state.listHook=({base,offset})=>base===0&&offset===20?f.provider({order_list:[20,21,...Array.from({length:17},(_,index)=>23+index),22].map(index=>({order_sn:f.serial(index)})),more:false,next_cursor:''}):undefined;
  let rateLimited=false;f.state.paymentHook=({index})=>{if(index===22&&!rateLimited){rateLimited=true;return Response.json({error:'upstream_busy'},{status:429});}};
  const partial=await invoke('step');assert.equal(partial.coverage.orders,20);assert.equal(partial.known_sales_cents,130500);assert.equal(partial.result.net_estimate_cents,null);assert.equal(partial.result.net_profit_cents,null);
  assert.equal(partial.collection.state,'RETRY_WAIT');assert.equal(partial.collection.code,'BUSINESS_PERIOD_RATE_LIMIT');
  assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) AS n FROM finance_business_period_payment_cache').get().n,19);
  const before=f.calls.payment.length,oldest=first.source_checked_at.finance_oldest_at;f.clock.time+=120000;
  const resumed=await invoke('step');assert.equal(resumed.coverage.orders,40);assert.equal(resumed.known_sales_cents,261000);assert.equal(resumed.source_checked_at.finance_oldest_at,oldest);assert.deepEqual(f.calls.payment.slice(before),[22]);
  assert.equal(resumed.collection.state,'READY');assert.equal(resumed.collection.code,null);
  assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) AS n FROM finance_business_period_orders').get().n,40);assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) AS n FROM finance_business_period_payment_cache').get().n,0);
  const providerCalls=f.calls.payment.length;const observed=await invoke('read');assert.equal(observed.coverage.orders,40);assert.equal(f.calls.payment.length,providerCalls);assert.equal(calls.auth,calls.finance);assert.ok(calls.auth>=4);
 }finally{globalThis.fetch=savedFetch;globalThis.Date=SavedDate;f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();}
});
