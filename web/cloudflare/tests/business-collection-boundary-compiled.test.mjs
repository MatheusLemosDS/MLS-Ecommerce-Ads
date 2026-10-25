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
 const f=await collectionFixture({allPaid:true,windowCounts:[40,0]}),savedFetch=globalThis.fetch,SavedDate=globalThis.Date,routerSecret='PRIVATE_COMPILED_ROUTER_'+'r'.repeat(40),appSecret='PRIVATE_COMPILED_APP_'+'a'.repeat(40),origin='https://app.compiled.collection.test',calls={auth:0,finance:0,ads:0};
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
  assert.equal(url.origin,'https://auth.brazacommerce.com.br');assert.equal(request.headers.get('X-Braza-App-Key'),appSecret);assert.equal(request.headers.get('cookie'),null);
  if(url.pathname==='/internal/shopee/ads/summary'){
   calls.ads++;assert.equal(request.method,'GET');const iso=value=>value.split('-').reverse().join('-'),period={start_date:iso(url.searchParams.get('start_date')),end_date:iso(url.searchParams.get('end_date'))},count=(SavedDate.parse(period.end_date+'T00:00:00Z')-SavedDate.parse(period.start_date+'T00:00:00Z'))/86400000+1;
   return Response.json({status:'ok',connected:true,shop:{id:1178167501},period,balance:0,daily:Array.from({length:count},(_,index)=>({date:new SavedDate(SavedDate.parse(period.start_date+'T00:00:00Z')+index*86400000).toISOString().slice(0,10),expense:0,broad_gmv:0,broad_order:0,broad_roas:0,direct_gmv:0,direct_order:0,direct_roas:0}))});
  }
  assert.equal(url.pathname,'/internal/shopee/finance/business-period');calls.auth++;
  return auth.fetch(request,authEnv);
 };
 try{
  const login=await app.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
  assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0],state=await(await app.fetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();
  const owner=async(path,body)=>{
   const response=await app.fetch(new Request(origin+'/api/admin/'+path,{method:body===undefined?'GET':'POST',headers:{origin,cookie,'content-type':'application/json','X-CSRF-Token':state.csrf},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
   const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));
   const text=JSON.stringify(value);for(const secret of [routerSecret,appSecret,'PRIVATE_INTEGRATION_ACCESS','PRIVATE_INTEGRATION_ORDER','PRIVATE_INTEGRATION_KEY'])assert.ok(!text.includes(secret));return value;
  };
  const observe=()=>owner('finance/business-month-view?month=2026-10'),queue=()=>owner('finance/business-month-request',{month:'2026-10'}),cron=async()=>{const work=[];await app.scheduled({cron:'* * * * *',scheduledTime:f.clock.time},env,{waitUntil:task=>work.push(task)});assert.equal(work.length,1);return (await Promise.all(work))[0];};
  const untouched={...calls},initial=await observe();assert.equal(initial.display.coverage.orders,0);assert.equal((await queue()).status,'QUEUED');assert.deepEqual(calls,untouched,'mounting and requesting refresh do not import a financial page');
  f.state.listHook=({base,offset})=>base===0&&offset===20?f.provider({order_list:[20,21,...Array.from({length:17},(_,index)=>23+index),22].map(index=>({order_sn:f.serial(index)})),more:false,next_cursor:''}):undefined;
  let rateLimited=false;f.state.paymentHook=({index})=>{if(index===22&&!rateLimited){rateLimited=true;return Response.json({error:'upstream_busy'},{status:429});}};
  // The first scheduled invocation may consume the one-time local migration.
  // Only the compiled App cron advances the real Auth -> Finance collectors.
  let tick=await cron();if(tick.collection==='MAINTENANCE')tick=await cron();assert.equal(tick.lane,'FINANCE');assert.equal(tick.collection,'ERROR');const partial=(await observe()).display;assert.equal(partial.coverage.orders,20);assert.equal(partial.known_sales_cents,130500);assert.equal(partial.result.net_estimate_cents,null);assert.equal(partial.result.net_profit_cents,null);
  assert.equal(partial.collection.state,'RETRY_WAIT');assert.equal(partial.collection.code,'BUSINESS_PERIOD_RATE_LIMIT');
  assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) AS n FROM finance_business_period_payment_cache').get().n,19);
  const before=f.calls.payment.length,oldest=partial.source_checked_at.finance_oldest_at,sourceCalls={...calls},queued=await queue();assert.equal(queued.status,'RETRY_WAIT');assert.ok(queued.next_run_at>f.clock.time/1000);await observe();assert.deepEqual(calls,sourceCalls,'an owner refresh respects the saved source backoff');f.clock.time=queued.next_run_at*1000;
  const resumedTick=await cron();assert.equal(resumedTick.lane,'FINANCE');assert.equal(resumedTick.collection,'COMPLETE');const resumed=(await observe()).display;assert.equal(resumed.coverage.orders,40);assert.equal(resumed.known_sales_cents,261000);assert.equal(resumed.source_checked_at.finance_oldest_at,oldest);assert.deepEqual(f.calls.payment.slice(before),[22]);
  assert.equal(resumed.collection.state,'READY');assert.equal(resumed.collection.code,null);
  assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) AS n FROM finance_business_period_orders').get().n,40);assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) AS n FROM finance_business_period_payment_cache').get().n,0);
  const providerCalls={...calls},payments=f.calls.payment.length,observed=await observe();assert.equal(observed.display_source,'PUBLISHED');assert.equal(observed.display.coverage.orders,40);assert.equal(observed.display.known_sales_cents,261000);assert.equal(f.calls.payment.length,payments);assert.deepEqual(calls,providerCalls);assert.equal(calls.auth,calls.finance);assert.ok(calls.auth>=4);assert.ok(calls.ads>0);
 }finally{globalThis.fetch=savedFetch;globalThis.Date=SavedDate;f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();}
});
