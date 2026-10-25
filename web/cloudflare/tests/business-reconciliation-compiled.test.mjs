import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHmac} from 'node:crypto';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {collectionFixture} from './business-collection-fixture.mjs';
import {createFinanceStore} from '../../finance/src/connection-store.mjs';
import {readCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {projectBusinessReconciliation} from '../src/business-reconciliation.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';

async function compiledWorker(name,minify){
 const result=await build({entryPoints:[fileURLToPath(new URL('../../../dist/'+name+'-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 return (await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))).default;
}

for(const minify of [false,true])for(const secondWindow of [5,0])test(`three generated Workers audit the exact published financial cohort and one return without changing profit (minify=${minify}, second-window=${secondWindow})`,async t=>{
 const [app,auth,finance]=await Promise.all(['app','auth','finance'].map(name=>compiledWorker(name,minify)));
 const f=await collectionFixture({windowCounts:[5,secondWindow],allPaid:true,returns:true,paymentDelayMs:0});
 t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 // The compiled worker uses its real clock, so an older synthetic token must
 // not turn this source-evidence test into an unrelated authorization refresh.
 const SavedDate=globalThis.Date,actualNow=Date.now(),actualDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new SavedDate(actualNow));
 // Use today's clock in the deployment case. Keep this October fixture
 // reproducible when the regression suite runs in a later calendar month.
 f.clock.time=actualDay>='2026-10-21'&&actualDay<='2026-10-30'?actualNow:SavedDate.UTC(2026,9,25,15);
 if(f.clock.time!==actualNow){globalThis.Date=class extends SavedDate{constructor(...args){super(...(args.length?args:[f.clock.time]));}static now(){return f.clock.time;}};t.after(()=>{globalThis.Date=SavedDate;});}
 const tokenStore=await createFinanceStore(f.financeEnv,{now:f.now}),old=await tokenStore.readTokens(),access='PRIVATE_COMPILED_RECON_ACCESS';
 await tokenStore.saveTokens({access_token:access,refresh_token:'PRIVATE_COMPILED_RECON_REFRESH',expires_at:Math.floor(f.now()/1000)+14400},{expectedRevision:old.revision});
 let monthly=await f.invoke('start');for(let step=0;monthly.status==='RUNNING'&&step<8;step++)monthly=await f.invoke('step');assert.equal(monthly.status,'COMPLETE');monthly=await f.invoke('ads');assert.equal(monthly.coverage.paid,5+secondWindow);assert.equal(monthly.coverage.returns,1);assert.equal(monthly.result.net_estimate_cents,null);assert.equal(monthly.result.net_profit_cents,null);
 const published=await readCompletedBusinessMonth(f.env,'2026-10',{now:f.now});assert.ok(published);assert.equal(published.payload.slots.length,2);
 const sources=published.payload.slots.map(slot=>({run_id:slot.frame.run_id,source_revision:slot.frame.revision,start_date:slot.start_date,end_date:slot.end_date}));
 assert.equal(new Set(sources.map(source=>source.run_id)).size,2);assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) AS n FROM finance_business_order_evidence').get().n,5+secondWindow);
 const beforeLedger=f.financeEnv.FINANCE_DB.db.prepare('SELECT run_id,order_hash,source_hash,checked_at,escrow_raw,ads_raw FROM finance_business_period_orders ORDER BY run_id,order_hash').all(),beforeCalls={payments:f.calls.payment.length,lists:f.calls.list.length,details:f.calls.detail.length,ads:f.calls.ads.length};
 const savedFetch=globalThis.fetch,routerSecret='PRIVATE_COMPILED_RECON_ROUTER_'+'r'.repeat(40),appSecret='PRIVATE_COMPILED_RECON_APP_'+'a'.repeat(40),origin='https://app.compiled.reconciliation.test',calls={auth:0,finance:0,returns:0};
 const env={...f.env,APP_INTERNAL_SECRET:appSecret,ADMIN_USERNAME:'compiled-reconciliation-owner',ADMIN_PASSWORD:'compiled-reconciliation-password-123456',ADMIN_SESSION_SECRET:'PRIVATE_COMPILED_RECON_SESSION_'+'s'.repeat(40)},financeEnv={...f.financeEnv,FINANCE_ROUTER_SECRET:routerSecret};
 const authEnv={APP_INTERNAL_SECRET:appSecret,FINANCE_ROUTER_SECRET:routerSecret,SHOPEE_FINANCE_SERVICE:{fetch:async request=>{calls.finance++;assert.equal(request.url,'https://auth.brazacommerce.com.br/internal/shopee/finance/reconciliation');assert.equal(request.headers.get('x-braza-finance-router'),routerSecret);for(const name of ['x-braza-app-key','cookie','authorization'])assert.equal(request.headers.get(name),null);return finance.fetch(request,financeEnv);}}};
 globalThis.fetch=async input=>{
  const request=input instanceof Request?input:new Request(input),url=new URL(request.url);
  if(url.origin==='https://partner.shopeemobile.com'){
   assert.equal(url.pathname,'/api/v2/returns/get_return_detail');assert.equal(request.method,'GET');assert.equal(request.redirect,'manual');assert.equal(url.searchParams.get('return_sn'),'PRIVATE_INTEGRATION_RETURN');assert.equal(url.searchParams.get('partner_id'),'2049333');assert.equal(url.searchParams.get('shop_id'),'1178167501');assert.equal(url.searchParams.get('access_token'),access);for(const name of ['x-braza-app-key','x-braza-finance-router','cookie','authorization'])assert.equal(request.headers.get(name),null);
   const signature=createHmac('sha256',financeEnv.SHOPEE_FINANCE_PARTNER_KEY).update('2049333'+url.pathname+url.searchParams.get('timestamp')+access+'1178167501').digest('hex');assert.equal(url.searchParams.get('sign'),signature);calls.returns++;
   return f.provider({return_sn:'PRIVATE_INTEGRATION_RETURN',order_sn:f.serial(2),currency:'BRL',status:'ACCEPTED',refund_amount:10});
  }
  assert.equal(url.origin,'https://auth.brazacommerce.com.br');assert.equal(url.pathname,'/internal/shopee/finance/reconciliation');assert.equal(request.headers.get('x-braza-app-key'),appSecret);assert.equal(request.headers.get('cookie'),null);calls.auth++;return auth.fetch(request,authEnv);
 };
 try{
  const login=await app.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
  const endpoint=origin+'/api/admin/finance/reconciliation?month=2026-10',observe=async()=>{const response=await app.fetch(new Request(endpoint,{headers:{cookie}}),env);assert.equal(response.status,200,await response.clone().text());const report=await response.json();assert.ok(projectBusinessReconciliation(report,projectReconciliationFrame));return report;};
  assert.equal((await app.fetch(new Request(endpoint),env)).status,401);
  const passive=await observe();assert.deepEqual(passive.sources,sources);assert.equal(passive.reports.length,0);assert.deepEqual(calls,{auth:0,finance:0,returns:0});
  const cron=async()=>{env.ADMIN_DB.db.prepare("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=0,lease_token=NULL,lease_until=NULL WHERE id=1").run();const work=[];await app.scheduled({cron:'* * * * *',scheduledTime:Date.now()},env,{waitUntil:task=>work.push(task)});assert.equal(work.length,1);return (await Promise.all(work))[0];};
  let report=passive;for(let tick=0;tick<6&&report.reports.length<2;tick++){const result=await cron();assert.ok(result.collection==='MAINTENANCE'||result.lane==='HISTORY',JSON.stringify(result));report=await observe();}
  assert.equal(report.reports.length,2,JSON.stringify(report.attempts));assert.deepEqual(report.sources,sources);assert.equal(report.source_revision,published.publication.source_revision);assert.equal(calls.returns,1);assert.equal(calls.auth,2);assert.equal(calls.finance,2);
  for(const source of sources){const found=report.reports.find(item=>item.run_id===source.run_id),original=published.payload.slots.find(slot=>slot.frame.run_id===source.run_id).frame;assert.equal(found.source_revision,source.source_revision);assert.equal(found.start_date,source.start_date);assert.equal(found.end_date,source.end_date);assert.equal(found.coverage.orders,original.coverage.orders);if(original.coverage.orders){assert.equal(found.source_checked_at.finance_oldest_at,original.source_checked_at.oldest_at);assert.equal(found.source_checked_at.finance_latest_at,original.source_checked_at.latest_at);}assert.ok(found.pending.includes('SETTLEMENT_NOT_RECONCILED'));}
  assert.equal(report.reports.reduce((sum,item)=>sum+item.returns.checked_count,0),1);assert.equal(report.reports.reduce((sum,item)=>sum+item.returns.known_requested_refund_cents,0),1000);const item=report.reports.flatMap(item=>item.cases)[0];assert.equal(item.status,'ACCEPTED');assert.equal(item.requested_refund_cents,1000);assert.equal(Object.hasOwn(item,'order_sn'),false);assert.equal(Object.hasOwn(item,'return_sn'),false);
  const completedCalls={...calls};await observe();await observe();assert.deepEqual(calls,completedCalls,'owner observation never advances a Return source');assert.deepEqual({payments:f.calls.payment.length,lists:f.calls.list.length,details:f.calls.detail.length,ads:f.calls.ads.length},beforeCalls);assert.deepEqual(f.financeEnv.FINANCE_DB.db.prepare('SELECT run_id,order_hash,source_hash,checked_at,escrow_raw,ads_raw FROM finance_business_period_orders ORDER BY run_id,order_hash').all(),beforeLedger);
  const monthResponse=await app.fetch(new Request(origin+'/api/admin/finance/business-month-view?month=2026-10',{headers:{cookie}}),env);assert.equal(monthResponse.status,200);const after=(await monthResponse.json()).display;assert.equal(after.expected_repass_cents,monthly.expected_repass_cents);assert.equal(after.result.net_estimate_cents,null);assert.equal(after.result.net_profit_cents,null);assert.ok(after.result.pending.includes('RETURNS_NOT_RECONCILED'));
  const html=await(await app.fetch(new Request(origin+'/admin',{headers:{cookie}}),env)).text();assert.match(html,/Conferência de repasses e devoluções/);assert.match(html,/id="businessReconciliationRuns"/);const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]).find(value=>value.includes('globalThis.brazaReconciliation='));assert.ok(script);const end=script.indexOf(" const el=name=>document.getElementById('businessReconciliation'+name);"),start=script.lastIndexOf('(()=>{',end);assert.ok(end>start&&start>=0);const prefix=script.slice(start+6,end),context=vm.createContext({serialized:JSON.stringify(report)});vm.runInContext(prefix+'\nglobalThis.result=projectBusinessReconciliation(JSON.parse(serialized),projectReconciliationFrame);',context);assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(result)',context)),report);
  const exposed=JSON.stringify(report)+html;for(const secret of [routerSecret,appSecret,access,'PRIVATE_INTEGRATION_ORDER_','PRIVATE_INTEGRATION_RETURN','PRIVATE_INTEGRATION_KEY'])assert.ok(!exposed.includes(secret));
 }finally{globalThis.fetch=savedFetch;}
});
