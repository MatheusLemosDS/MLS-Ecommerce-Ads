import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {createFinanceStore} from '../../finance/src/connection-store.mjs';
import {D1} from './sqlite-d1.mjs';

const endpoint='https://auth.brazacommerce.com.br/internal/shopee/finance/income-detail';
const origin='https://pending-diagnostic.compiled.test';
const base=Date.UTC(2026,9,31,18),stamp=base/1000;
const overview={schema:'finance_income_overview_v1',checked_at:stamp,region:'BRAZIL',shop_type:'LOCAL',currency_basis:'FIXED_BRAZIL_SHOP_PROFILE',pending:{status:'PENDING',raw:'8375.15',cents:837515},released:{status:'RELEASED',raw:'0',cents:0},to_release:{status:'TO_RELEASE_NOT_APPLICABLE_LOCAL',raw:null,cents:null},basis:'CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH'};
const providerRows=()=>Array.from({length:100},(_,index)=>({order_sn:'SYNTHETIC_PENDING_ORDER_'+index,currency:'BRL',status:'Pendente',description:'Order Income',payment_method:'PIX',estimated_escrow_amount:index===99?10.123:47.51,estimated_payout_time:stamp+86400,creation_date:stamp-3600}));
const successfulBody=()=>({error:'',income_detail_list:{list:providerRows(),next_page:{cursor:'synthetic-next-page',page_size:100}}});

async function compiled(minify){
 const source=await readFile(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8'),seam='return {adminFetch,schedule,scheduledWork,workspaceAuthFetch};';
 assert.equal(source.split(seam).length,2);
 const contents=source.replace(seam,'return {adminFetch,schedule,scheduledWork,workspaceAuthFetch,runBusinessIncomeOverview,runBusinessIncomeDetail,readBusinessIncomeDetail,readBusinessIncomeDetailDiagnostic,getFinanceIncomeDetail};')+'\nexport {brazaAdmin as pendingSmoke};';
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
  calls.finance++;assert.equal(request.url,endpoint);assert.equal(request.headers.get('x-braza-finance-router'),routerSecret);
  for(const name of ['x-braza-app-key','cookie','authorization','origin'])assert.equal(request.headers.get(name),null);
  if(state.financeResponse)return state.financeResponse();
  return workers.finance.fetch(request,financeEnv);
 }}};
 globalThis.fetch=async input=>{
  const request=input instanceof Request?input:new Request(input),url=new URL(request.url);
  if(url.origin==='https://partner.shopeemobile.com'){
   calls.provider++;assert.equal(url.pathname,'/api/v2/payment/get_income_detail');assert.equal(request.method,'POST');assert.equal(request.redirect,'manual');
   assert.deepEqual(await request.clone().json(),{cursor:'',date_from:'2026-10-30',date_to:'2026-10-31',income_status:2,page_size:100});
   for(const name of ['x-braza-app-key','x-braza-finance-router','cookie','authorization','origin'])assert.equal(request.headers.get(name),null);
   return Response.json(state.body,{status:state.status});
  }
  calls.app++;assert.equal(request.url,endpoint);assert.equal(request.headers.get('x-braza-app-key'),appSecret);
  for(const name of ['x-braza-finance-router','cookie','authorization','origin'])assert.equal(request.headers.get(name),null);
  return workers.auth.fetch(request,authEnv);
 };
 await workers.api.runBusinessIncomeOverview(env,async()=>overview,{now});
 const login=await workers.app.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
 const get=async suffix=>workers.app.fetch(new Request(origin+'/api/admin/finance/income-detail'+suffix,{headers:{cookie}}),env);
 return {...workers,db,financeDb,env,clock,now,state,calls,cookie,get,run:()=>workers.api.runBusinessIncomeDetail(env,workers.api.getFinanceIncomeDetail,{now})};
}

for(const minify of [false,true])test(`three generated Workers preserve bounded Pending error evidence and exact old DTO (minify=${minify})`,async t=>{
 const workers=await compiled(minify);
 await t.test('403 provider permission token survives all three boundaries without private body text',async child=>{
  const f=await fixture(child,workers);f.state.status=403;f.state.body={error:'error_api_permission',message:'PRIVATE_PROVIDER_TOKEN',request_id:'PRIVATE_REQUEST_IDENTIFIER',order_sn:'PRIVATE_ORDER_SERIAL'};
  assert.equal((await f.run()).status,'UNAVAILABLE');assert.deepEqual(f.calls,{app:1,finance:1,provider:1});
  const response=await f.get('');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const detail=await response.json();
  assert.deepEqual(Object.keys(detail),['schema','checked_at','status','report','attempt']);assert.equal(detail.status,'UNAVAILABLE');assert.equal(detail.attempt.code,'FINANCE_INCOME_DETAIL_HTTP_ERROR');assert.equal(detail.report,null);
  const evidenceResponse=await f.get('?evidence=diagnostic-v1');assert.equal(evidenceResponse.status,200);const evidence=await evidenceResponse.json();
  assert.equal(evidence.schema,'business_income_detail_evidence_v1');assert.deepEqual(evidence.detail,detail);
  assert.equal(evidence.diagnostic.attempt_checked_at,detail.attempt.checked_at);
  assert.deepEqual(evidence.diagnostic.diagnostic,{schema:'finance_income_detail_diagnostic_v1',source:'SHOPEE_FINANCE_INCOME_DETAIL',stage:'PROVIDER_HTTP',code:'FINANCE_INCOME_DETAIL_UPSTREAM_HTTP',http:403,provider_code:null,response_kind:'JSON_PERMISSION_REJECTED'});
  assert.doesNotMatch(JSON.stringify(evidence),/PRIVATE_|order_sn|request_id|message|access_token/);
  assert.deepEqual(f.calls,{app:1,finance:1,provider:1},'owner reads must not retry the provider');
  assert.equal((await f.app.fetch(new Request(origin+'/api/admin/finance/income-detail?evidence=diagnostic-v1'),f.env)).status,401);
  for(const query of ['?evidence=bad','?evidence=diagnostic-v1&evidence=diagnostic-v1','?month=2026-10','?evidence=diagnostic-v1&cursor=unsafe'])assert.equal((await f.get(query)).status,400,query);
 });
 await t.test('valid first page exposes 100 hashed orders and survives a later failed refresh',async child=>{
  const f=await fixture(child,workers);assert.equal((await f.run()).status,'CHECKED');assert.deepEqual(f.calls,{app:1,finance:1,provider:1});
  const old=await(await f.get('')).json();assert.equal(old.status,'AVAILABLE');assert.equal(old.report.returned_count,100);assert.equal(old.report.rows.length,100);assert.equal(new Set(old.report.rows.map(row=>row.order_hash)).size,100);assert.equal(old.report.has_more,true);assert.equal(old.report.next_cursor_present,true);
  assert.ok(old.report.rows.slice(0,99).every(row=>row.estimated_escrow_cents===4751));assert.equal(old.report.rows[99].estimated_escrow_raw,'10.123');assert.equal(old.report.rows[99].estimated_escrow_cents,null);
  assert.doesNotMatch(JSON.stringify(old),/SYNTHETIC_PENDING_ORDER_|PRIVATE_|order_sn/);assert.match(old.report.basis,/CURRENT_PENDING.*NOT_MONTH_OR_BANK/);
  assert.equal((await(await f.get('?evidence=diagnostic-v1')).json()).diagnostic.diagnostic,null);
  f.clock.time+=901000;f.state.status=403;f.state.body={error:'error_sign',message:'PRIVATE_REJECTED_SIGNATURE'};
  assert.equal((await f.run()).status,'UNAVAILABLE');const evidence=await(await f.get('?evidence=diagnostic-v1')).json();assert.equal(evidence.detail.status,'PARTIAL_UNAVAILABLE');assert.deepEqual(evidence.detail.report,old.report);assert.ok(evidence.detail.attempt.checked_at>old.report.checked_at);assert.equal(evidence.diagnostic.diagnostic.response_kind,'JSON_SIGNATURE_REJECTED');
  assert.deepEqual(f.calls,{app:2,finance:2,provider:2});
  f.db.db.prepare('UPDATE business_income_detail_diagnostic SET attempt_checked_at=attempt_checked_at-1').run();
  assert.equal((await(await f.get('?evidence=diagnostic-v1')).json()).diagnostic.diagnostic,null,'an old cause cannot be attached to a newer attempt');
  assert.deepEqual(f.calls,{app:2,finance:2,provider:2});
 });
 await t.test('provider shape failures are rejected and unknown Finance diagnostics never pass through Auth',async child=>{
  const f=await fixture(child,workers);f.state.body=successfulBody();f.state.body.income_detail_list.list[0].currency='USD';
  assert.equal((await f.run()).status,'UNAVAILABLE');let evidence=await(await f.get('?evidence=diagnostic-v1')).json();assert.equal(evidence.detail.report,null);assert.equal(evidence.diagnostic.diagnostic.code,'FINANCE_INCOME_DETAIL_INVALID_RESPONSE');assert.doesNotMatch(JSON.stringify(evidence),/SYNTHETIC_PENDING_ORDER_|PRIVATE_|order_sn/);
  f.clock.time+=301000;f.state.financeResponse=()=>Response.json({error:'FINANCE_INCOME_DETAIL_UNAVAILABLE',diagnostic:{schema:'finance_income_detail_diagnostic_v1',source:'SHOPEE_FINANCE_INCOME_DETAIL',stage:'PROVIDER_HTTP',code:'FINANCE_INCOME_DETAIL_UPSTREAM_HTTP',http:403,provider_code:'PRIVATE_PROVIDER_CODE',response_kind:'PRIVATE_RESPONSE_KIND'},message:'PRIVATE_BODY'},{status:502});
  assert.equal((await f.run()).status,'UNAVAILABLE');evidence=await(await f.get('?evidence=diagnostic-v1')).json();assert.equal(evidence.diagnostic.diagnostic.code,'FINANCE_INCOME_DETAIL_UNAVAILABLE');assert.equal(evidence.diagnostic.diagnostic.provider_code,null);assert.equal(evidence.diagnostic.diagnostic.response_kind,null);assert.doesNotMatch(JSON.stringify(evidence),/PRIVATE_/);
  assert.deepEqual(f.calls,{app:2,finance:2,provider:1});
 });
});
