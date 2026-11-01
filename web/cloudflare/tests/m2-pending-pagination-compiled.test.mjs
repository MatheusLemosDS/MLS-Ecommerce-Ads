import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {build} from 'esbuild';
import {createFinanceStore,FINANCE_PROFILE} from '../../finance/src/connection-store.mjs';
import {D1} from './sqlite-d1.mjs';

const endpoint='https://auth.brazacommerce.com.br/internal/shopee/finance/income-detail';
const origin='https://pending-diagnostic.compiled.test';
const base=Date.UTC(2026,9,31,18),stamp=base/1000;
const overview={schema:'finance_income_overview_v1',checked_at:stamp,region:'BRAZIL',shop_type:'LOCAL',currency_basis:'FIXED_BRAZIL_SHOP_PROFILE',pending:{status:'PENDING',raw:'8375.15',cents:837515},released:{status:'RELEASED',raw:'0',cents:0},to_release:{status:'TO_RELEASE_NOT_APPLICABLE_LOCAL',raw:null,cents:null},basis:'CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH'};
const providerRows=(offset=0,length=100)=>Array.from({length},(_,position)=>{const index=offset+position;return ({order_sn:'SYNTHETIC_PENDING_ORDER_'+index,currency:'BRL',status:'Pendente',description:'Order Income',payment_method:'PIX',estimated_escrow_amount:47.51,estimated_payout_time:stamp+86400,creation_date:stamp-3600});});
const successfulBody=()=>({error:'',response:{list:providerRows(),next_page:{cursor:'synthetic-next-page',page_size:100}}});

async function compiled(minify){
 const source=await readFile(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8'),seam='return {adminFetch,schedule,scheduledWork,workspaceAuthFetch};';
 assert.equal(source.split(seam).length,2);
 const contents=source.replace(seam,'return {adminFetch,schedule,scheduledWork,workspaceAuthFetch,runBusinessIncomeOverview,runBusinessPendingIncomeScan,readBusinessPendingIncomeScan,getFinancePendingIncomeScan};')+'\nexport {brazaAdmin as pendingSmoke};';
 const modules=await Promise.all(['app','auth','finance'].map(async name=>{
  const input=name==='app'?contents:await readFile(new URL('../../../dist/'+name+'-worker.mjs',import.meta.url),'utf8');
  const result=await build({stdin:{contents:input,loader:'js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 }));
 return {app:modules[0].default,api:modules[0].pendingSmoke,auth:modules[1].default,finance:modules[2].default};
}

async function fixture(t,workers){
 const db=new D1(),financeDb=new D1(),clock={time:base},now=()=>clock.time,SavedDate=globalThis.Date,savedFetch=globalThis.fetch;
 globalThis.Date=class extends SavedDate{constructor(...args){super(...(args.length?args:[clock.time]));}static now(){return clock.time;}};
 t.after(()=>{globalThis.Date=SavedDate;globalThis.fetch=savedFetch;db.db.close();financeDb.db.close();});
 const appSecret='PRIVATE_PENDING_DIAGNOSTIC_APP_'+'a'.repeat(40),routerSecret='PRIVATE_PENDING_DIAGNOSTIC_ROUTER_'+'r'.repeat(40);
 const env={ADMIN_DB:db,APP_INTERNAL_SECRET:appSecret,ADMIN_USERNAME:'pending-owner',ADMIN_PASSWORD:'pending-owner-password-123456',ADMIN_SESSION_SECRET:'PRIVATE_PENDING_OWNER_'+'s'.repeat(40)};
 const financeEnv={FINANCE_DB:financeDb,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,23).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:'PRIVATE_PENDING_DIAGNOSTIC_PARTNER',FINANCE_ROUTER_SECRET:routerSecret};
 const store=await createFinanceStore(financeEnv,{now});await store.setup();await store.saveTokens({access_token:'PRIVATE_PENDING_DIAGNOSTIC_ACCESS',refresh_token:'PRIVATE_PENDING_DIAGNOSTIC_REFRESH',expires_at:stamp+14400});
 const state={body:successfulBody(),status:200,financeResponse:null},calls={app:0,finance:0,provider:0};
 const authEnv={APP_INTERNAL_SECRET:appSecret,FINANCE_ROUTER_SECRET:routerSecret,SHOPEE_FINANCE_SERVICE:{fetch:async request=>{
  calls.finance++;assert.equal(request.url,endpoint);assert.equal(request.method,'POST');assert.equal(request.headers.get('x-braza-finance-router'),routerSecret);assert.equal(request.headers.get('x-braza-income-contract'),'pending-scan-v1');assert.deepEqual(await request.clone().json(),{operation:'step'});
  for(const name of ['x-braza-app-key','cookie','authorization','origin'])assert.equal(request.headers.get(name),null);
  if(state.financeResponse)return state.financeResponse();
  return workers.finance.fetch(request,financeEnv);
 }}};
 globalThis.fetch=async input=>{
  const request=input instanceof Request?input:new Request(input),url=new URL(request.url);
  if(url.origin==='https://partner.shopeemobile.com'){
   calls.provider++;assert.equal(url.pathname,'/api/v2/payment/get_income_detail');assert.equal(request.method,'GET');assert.equal(request.redirect,'manual');
   assert.equal(request.body,null);assert.equal(await request.clone().text(),'');assert.equal(request.headers.get('content-type'),null);
   const params={cursor:calls.provider===2?'synthetic-next-page':'',date_from:'2026-10-30',date_to:'2026-10-31',income_status:'2',page_size:'100'};
   assert.deepEqual([...url.searchParams.keys()].sort(),[...Object.keys(params),'partner_id','shop_id','timestamp','access_token','sign'].sort());
   for(const [name,value] of Object.entries(params))assert.equal(url.searchParams.get(name),value,name);
   assert.equal(url.searchParams.get('partner_id'),String(FINANCE_PROFILE.partner_id));assert.equal(url.searchParams.get('shop_id'),String(FINANCE_PROFILE.shop_id));assert.equal(url.searchParams.get('timestamp'),String(Math.floor(now()/1000)));assert.equal(url.searchParams.get('access_token'),'PRIVATE_PENDING_DIAGNOSTIC_ACCESS');
   const signedBase=String(FINANCE_PROFILE.partner_id)+url.pathname+url.searchParams.get('timestamp')+url.searchParams.get('access_token')+FINANCE_PROFILE.shop_id;
   assert.equal(url.searchParams.get('sign'),createHmac('sha256',financeEnv.SHOPEE_FINANCE_PARTNER_KEY).update(signedBase).digest('hex'));
   for(const name of ['x-braza-app-key','x-braza-finance-router','cookie','authorization','origin'])assert.equal(request.headers.get(name),null);
   return Response.json(state.body,{status:state.status});
  }
  calls.app++;assert.equal(request.url,endpoint);assert.equal(request.method,'POST');assert.equal(request.headers.get('x-braza-app-key'),appSecret);assert.equal(request.headers.get('x-braza-income-contract'),'pending-scan-v1');assert.deepEqual(await request.clone().json(),{operation:'step'});
  for(const name of ['x-braza-finance-router','cookie','authorization','origin'])assert.equal(request.headers.get(name),null);
  return workers.auth.fetch(request,authEnv);
 };
 await workers.api.runBusinessIncomeOverview(env,async()=>overview,{now});
 const login=await workers.app.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
 const get=async suffix=>workers.app.fetch(new Request(origin+'/api/admin/finance/income-detail'+suffix,{headers:{cookie}}),env);
 return {...workers,db,financeDb,env,clock,now,state,calls,cookie,get,run:()=>workers.api.runBusinessPendingIncomeScan(env,workers.api.getFinancePendingIncomeScan,{now})};
}


for(const minify of [false,true])test(`three generated Workers paginate Pending privately and publish one complete saved list (minify=${minify})`,async t=>{
 const workers=await compiled(minify),f=await fixture(t,workers);
 const first=await f.run();assert.equal(first.status,'RUNNING');assert.equal(first.source_reads,1);assert.deepEqual(f.calls,{app:1,finance:1,provider:1});
 let response=await f.get('?evidence=scan-v1');assert.equal(response.status,200);let snapshot=await response.json();assert.equal(snapshot.schema,'business_pending_income_scan_v1');assert.equal(snapshot.status,'COLLECTING');assert.equal(snapshot.frame.scan.pages_read,1);assert.equal(snapshot.frame.scan.unique_entries,100);assert.equal(snapshot.frame.report,null);
 assert.equal((await f.run()).status,'RETRY_WAIT');assert.deepEqual(f.calls,{app:1,finance:1,provider:1});
 const legacy=await(await f.get('')).json();assert.equal(legacy.schema,'business_income_detail_v1');assert.equal(legacy.report,null,'v1 is not rewritten to invent complete-page semantics');
 f.clock.time+=61000;f.state.body={error:'',response:{list:[providerRows()[0],...providerRows(100,17)],next_page:{cursor:'',page_size:18}}};
 assert.equal((await f.run()).status,'CHECKED');assert.deepEqual(f.calls,{app:2,finance:2,provider:2});
 snapshot=await(await f.get('?evidence=scan-v1')).json();assert.equal(snapshot.status,'AVAILABLE');assert.equal(snapshot.frame.scan.state,'COMPLETE');assert.equal(snapshot.frame.scan.pages_read,2);assert.equal(snapshot.frame.report.rows.length,117);assert.equal(snapshot.frame.report.unique_orders,117);assert.equal(snapshot.frame.report.duplicate_entries,1);assert.equal(snapshot.frame.report.known_amount_cents,117*4751);assert.equal(snapshot.frame.report.amount_complete,true);assert.match(snapshot.frame.basis,/MUTABLE_SOURCE_NOT_MONTH_OR_BANK_RECEIPT/);
 assert.doesNotMatch(JSON.stringify(snapshot),/synthetic-next-page|SYNTHETIC_PENDING_ORDER_|PRIVATE_|order_sn|next_cursor/);
 assert.equal((await f.app.fetch(new Request(origin+'/api/admin/finance/income-detail?evidence=scan-v1'),f.env)).status,401);
 for(const suffix of ['?evidence=scan-v1&cursor=unsafe','?evidence=scan-v1&evidence=scan-v1','?evidence=unknown'])assert.equal((await f.get(suffix)).status,400);
 const completed=structuredClone(snapshot.frame.report);f.clock.time+=901000;f.state.status=403;f.state.body={error:'error_api_permission',message:'PRIVATE_PROVIDER_BODY'};assert.equal((await f.run()).status,'UNAVAILABLE');snapshot=await(await f.get('?evidence=scan-v1')).json();assert.equal(snapshot.status,'PARTIAL_UNAVAILABLE');assert.deepEqual(snapshot.frame.report,completed);assert.equal(snapshot.frame.scan.state,'RETRY_WAIT');assert.equal(snapshot.frame.scan.error,'PERMISSION_DENIED');assert.doesNotMatch(JSON.stringify(snapshot),/PRIVATE_PROVIDER_BODY|SYNTHETIC_PENDING_ORDER_|synthetic-next-page/);
 assert.deepEqual(f.calls,{app:3,finance:3,provider:3},'owner reads, local pagination and validation never collect additional source pages');
});
