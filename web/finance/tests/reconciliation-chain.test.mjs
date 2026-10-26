import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {getFinanceReconciliation} from '../../cloudflare/src/app-reconciliation.mjs';
import {forwardFinancePaymentSample} from '../src/auth-router.mjs';
import {createFinanceWorker} from '../src/connection-worker.mjs';
import {projectReconciliationFrame,projectReconciliationEvidenceFrame,projectReconciliationMoneyFrame} from '../src/reconciliation-frame.mjs';

const origin='https://auth.brazacommerce.com.br',path='/internal/shopee/finance/reconciliation',appKey='PRIVATE_RECON_APP_'+'a'.repeat(40),router='PRIVATE_RECON_ROUTER_'+'r'.repeat(40),run_id='11111111-1111-4111-8111-111111111111',otherRun='22222222-2222-4222-8222-222222222222',at=1792500000;
const input={operation:'read',run_id};
const frame=()=>({schema:'finance_reconciliation_v1',run_id,source_revision:2,start_date:'2026-10-01',end_date:'2026-10-15',checked_at:at,status:'CHECKED',source_checked_at:{finance_oldest_at:at-100,finance_latest_at:at-10,returns_oldest_at:at-5,returns_latest_at:at-5},coverage:{orders:1,evidence_orders:1,missing_evidence_orders:0,paid_orders:1,review_orders:0,return_orders:1,return_unknown_orders:0},adjustments:{reported_orders:1,missing_orders:0,conflicting_orders:0,known_adjustment_cents:100,base_repass_cents:8000,after_adjustment_repass_cents:8100},returns:{reference_count:1,checked_count:1,pending_count:0,known_requested_refund_cents:1000,requested_amount_complete:true,permission:'AVAILABLE'},cases:[{case_hash:'a'.repeat(64),order_hash:'b'.repeat(64),status:'ACCEPTED',requested_refund_cents:1000,checked_at:at-5,diagnostic:null}],truncation:{truncated:false,cases_total:1,cases_included:1},pending:['RETURN_VALUES_UNVERIFIED','SETTLEMENT_NOT_RECONCILED'],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'});
const evidence=()=>{
 const report=frame();Object.assign(report.coverage,{orders:2,evidence_orders:2,review_orders:1});Object.assign(report.returns,{reference_count:2,checked_count:2,known_requested_refund_cents:2000});report.cases.push({...report.cases[0],case_hash:'d'.repeat(64),order_hash:'c'.repeat(64)});Object.assign(report.truncation,{cases_total:2,cases_included:2});
 return {schema:'finance_reconciliation_v2',report,review:{schema:'finance_review_orders_v1',summary:{orders:1,in_cancel:0,to_return:1,other:0,unknown:0},orders:[{order_hash:'c'.repeat(64),status:'TO_RETURN',source_checked_at:at-25,reference_state:'AVAILABLE',reference_count:1,references_checked_at:at-5,reference_diagnostic:null,next_attempt_at:at+295,checked_cases:1,pending_cases:0}],truncation:{truncated:false,orders_total:1,orders_included:1},basis:'REVIEW_ORDERS_OUTSIDE_PAID_COHORT'}};
};
const money=()=>{
 const value=evidence(),statuses=['PENDING','UNKNOWN','REQUESTED','ACCEPTED','CANCELLED','JUDGING','REFUND_PAID','CLOSED','PROCESSING'];
 return {schema:'finance_reconciliation_v3',report:value.report,review:value.review,money:{schema:'finance_reconciliation_money_v1',currency:'BRL',groups:['PAID','REVIEW','OTHER'].map(cohort=>({cohort,statuses:statuses.map(status=>({status,cases:cohort!=='OTHER'&&status==='ACCEPTED'?1:0,amount_known:cohort!=='OTHER'&&status==='ACCEPTED'?1:0,known_amount_cents:cohort!=='OTHER'&&status==='ACCEPTED'?1000:0})),source_checked_at:{oldest_at:cohort==='OTHER'?null:at-5,latest_at:cohort==='OTHER'?null:at-5}})),payouts:[{order_hash:'b'.repeat(64),cohort:'PAID',source_checked_at:at-10,reference_count:1,state:'AVAILABLE',base_repass_cents:8000,adjustment_cents:100,after_adjustment_repass_cents:8100},{order_hash:'c'.repeat(64),cohort:'REVIEW',source_checked_at:at-25,reference_count:1,state:'NOT_IN_PAID_COHORT',base_repass_cents:null,adjustment_cents:null,after_adjustment_repass_cents:null}],truncation:{truncated:false,payouts_total:2,payouts_included:2},basis:'SAVED_RETURN_AMOUNTS_AND_PAID_PAYOUT_AFTER_ADJUSTMENTS'}};
};
const blocked=()=>{const value=frame();value.status='BLOCKED';value.source_checked_at.returns_oldest_at=null;value.source_checked_at.returns_latest_at=null;Object.assign(value.returns,{checked_count:0,pending_count:1,known_requested_refund_cents:0,requested_amount_complete:false,permission:'DENIED'});Object.assign(value.cases[0],{status:'PENDING',requested_refund_cents:null,checked_at:null,diagnostic:'PERMISSION_DENIED'});value.pending=['RETURN_DETAILS_PENDING','RETURN_PERMISSION_REQUIRED','RETURN_VALUES_UNVERIFIED','SETTLEMENT_NOT_RECONCILED'];return value;};
const financeEnv={FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'};
const request=(body=input,{route=path,headers={},method='POST',search='',host=origin}={})=>new Request(host+route+search,{method,headers:{'content-type':'application/json','x-braza-app-key':appKey,...headers},body:method==='GET'?undefined:JSON.stringify(body)});
const validateInternalApp=req=>req.headers.get('x-braza-app-key')===appKey;
const sourceModules={getFinanceReconciliation,forwardFinancePaymentSample,createFinanceWorker};

function chain(modules=sourceModules,report=frame,{dropAuthContract=false,dropRefundContract=false}={}){
 const calls={app:0,auth:0,finance:0,provider:0},selections=[],contracts={app:[],auth:[],includeReview:[]},refunds={app:[],auth:[],includeMoney:[]};
 const finance=modules.createFinanceWorker({reconciliation:async(env,options)=>{calls.finance++;assert.equal(env.APP_INTERNAL_SECRET,undefined);assert.equal(typeof options.fetchImpl,'function');assert.equal(typeof options.now,'function');assert.deepEqual(Object.keys(options).sort(),['fetchImpl','now','operation','run_id',...(options.includeReview===true?['includeReview']:[]),...(options.includeMoney===true?['includeMoney']:[])].sort());contracts.includeReview.push(options.includeReview??null);refunds.includeMoney.push(options.includeMoney??null);selections.push({operation:options.operation,run_id:options.run_id});return report(options.includeReview===true,options.includeMoney===true);},now:()=>at*1000,fetchImpl:async()=>{calls.provider++;throw Error('No provider request expected from an injected capability');}});
 const authEnv={FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async routed=>{calls.auth++;assert.equal(routed.url,origin+path);assert.equal(routed.method,'POST');assert.equal(routed.redirect,'manual');assert.equal(routed.headers.get('x-braza-finance-router'),router);contracts.auth.push(routed.headers.get('x-braza-client-contract'));refunds.auth.push(routed.headers.get('x-braza-refund-contract'));for(const name of ['x-braza-app-key','cookie','authorization','origin','referer'])assert.equal(routed.headers.get(name),null);return finance.fetch(routed,financeEnv);}}};
 const fetchImpl=async req=>{calls.app++;assert.equal(req.url,origin+path);assert.equal(req.method,'POST');assert.equal(req.redirect,'manual');assert.equal(req.headers.get('x-braza-app-key'),appKey);assert.equal(req.headers.get('x-braza-client-contract'),'finance-reconciliation-v2');assert.equal(req.headers.get('x-braza-refund-contract'),'refunds-v1');contracts.app.push(req.headers.get('x-braza-client-contract'));refunds.app.push(req.headers.get('x-braza-refund-contract'));for(const name of ['x-braza-finance-router','cookie','authorization','origin'])assert.equal(req.headers.get(name),null);const forwarded=dropAuthContract||dropRefundContract?new Request(req):req;if(dropAuthContract)forwarded.headers.delete('x-braza-client-contract');if(dropAuthContract||dropRefundContract)forwarded.headers.delete('x-braza-refund-contract');return modules.forwardFinancePaymentSample(forwarded,authEnv,{validateInternalApp});};
 return {calls,selections,contracts,refunds,finance,authEnv,fetchImpl,run:selection=>modules.getFinanceReconciliation({APP_INTERNAL_SECRET:appKey},selection,{fetchImpl})};
}

test('the App, Auth and Finance reconciliation boundaries confine each private credential and forward only exact read/step scope',async()=>{
 const f=chain();assert.ok(projectReconciliationFrame(frame()));
 for(const operation of ['read','step']){const value=await f.run({operation,run_id});assert.deepEqual(value,frame());assert.equal(value.basis,'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT');assert.ok(value.pending.includes('SETTLEMENT_NOT_RECONCILED'));assert.doesNotMatch(JSON.stringify(value),/PRIVATE_|access_token|order_sn|net_profit/);}
 assert.deepEqual(f.selections,[{operation:'read',run_id},{operation:'step',run_id}]);assert.deepEqual(f.calls,{app:2,auth:2,finance:2,provider:0});
 const response=await forwardFinancePaymentSample(request(input,{headers:{cookie:'PRIVATE_OWNER_COOKIE',authorization:'PRIVATE_OWNER_TOKEN',origin:'https://app.brazacommerce.com.br',referer:'https://app.brazacommerce.com.br/admin'}}),f.authEnv,{validateInternalApp});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('set-cookie'),null);assert.deepEqual(await response.json(),frame());
});

test('missing Returns permission crosses all three boundaries as a valid blocked evidence report rather than transport failure or final profit',async()=>{
 const f=chain(sourceModules,blocked),value=await f.run(input);assert.ok(projectReconciliationFrame(blocked()));assert.deepEqual(value,blocked());assert.equal(value.status,'BLOCKED');assert.equal(value.returns.permission,'DENIED');assert.equal(value.cases[0].requested_refund_cents,null);assert.ok(value.pending.includes('RETURN_PERMISSION_REQUIRED'));assert.ok(value.pending.includes('SETTLEMENT_NOT_RECONCILED'));assert.deepEqual(f.calls,{app:1,auth:1,finance:1,provider:0});
});

test('negotiated v2 crosses App, Auth and Finance once while preserving source dates, case associations and paid totals',async()=>{
 const f=chain(sourceModules,evidence),expected=evidence();assert.ok(projectReconciliationEvidenceFrame(expected,projectReconciliationFrame));
 for(const operation of ['read','step']){const value=await f.run({operation,run_id});assert.deepEqual(value,expected);assert.deepEqual(value.report.adjustments,frame().adjustments);assert.equal(value.report.coverage.return_orders,1);assert.equal(value.review.summary.orders,1);assert.equal(value.review.orders[0].source_checked_at,at-25);assert.equal(value.review.orders[0].references_checked_at,at-5);assert.equal(value.report.cases.filter(row=>row.order_hash===value.review.orders[0].order_hash).length,1);assert.doesNotMatch(JSON.stringify(value),/PRIVATE_|order_sn|return_sn|access_token|realized_net/);}
 assert.deepEqual(f.calls,{app:2,auth:2,finance:2,provider:0});assert.deepEqual(f.contracts,{app:['finance-reconciliation-v2','finance-reconciliation-v2'],auth:['finance-reconciliation-v2','finance-reconciliation-v2'],includeReview:[true,true]});assert.deepEqual(f.selections,[{operation:'read',run_id},{operation:'step',run_id}]);
});

test('legacy callers receive exact v1 and mixed deployments use one request without changing the request body',async()=>{
 for(const header of [null,'finance-reconciliation-v1']){
  const headers=header===null?{}:{'x-braza-client-contract':header},f=chain(sourceModules,evidence),response=await forwardFinancePaymentSample(request(input,{headers}),f.authEnv,{validateInternalApp});assert.equal(response.status,200);assert.deepEqual(await response.json(),evidence().report);assert.deepEqual(f.contracts.auth,[header]);assert.deepEqual(f.contracts.includeReview,[null]);assert.deepEqual(f.selections,[input]);assert.deepEqual(f.calls,{app:0,auth:1,finance:1,provider:0});
  let called=0;const oldCaller=await forwardFinancePaymentSample(request(input,{headers}),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>{called++;return Response.json(evidence());}}},{validateInternalApp});assert.equal(oldCaller.status,200);assert.deepEqual(await oldCaller.json(),evidence().report);assert.equal(called,1);
 }
 const oldFinance=chain(sourceModules,frame);assert.deepEqual(await oldFinance.run(input),frame());assert.deepEqual(oldFinance.calls,{app:1,auth:1,finance:1,provider:0});assert.deepEqual(oldFinance.contracts.includeReview,[true]);
 const oldAuth=chain(sourceModules,includeReview=>includeReview?evidence():frame(),{dropAuthContract:true});assert.deepEqual(await oldAuth.run(input),frame());assert.deepEqual(oldAuth.calls,{app:1,auth:1,finance:1,provider:0});assert.deepEqual(oldAuth.contracts.auth,[null]);assert.deepEqual(oldAuth.contracts.includeReview,[null]);
 const conflict=frame();conflict.status='PARTIAL';Object.assign(conflict.coverage,{orders:3,evidence_orders:3,review_orders:2});conflict.pending.push('RETURN_REFERENCES_MISSING');const safe=chain(sourceModules,()=>conflict);assert.deepEqual(await safe.run(input),conflict);assert.deepEqual(safe.calls,{app:1,auth:1,finance:1,provider:0});assert.deepEqual(safe.contracts.includeReview,[true]);
});

test('the optional refund header negotiates v3 without changing v1/v2 callers or retrying mixed deployments',async()=>{
 const f=chain(sourceModules,money),expected=money();assert.ok(projectReconciliationMoneyFrame(expected,projectReconciliationFrame,projectReconciliationEvidenceFrame));assert.deepEqual(await f.run(input),expected);assert.deepEqual(f.calls,{app:1,auth:1,finance:1,provider:0});assert.deepEqual(f.refunds,{app:['refunds-v1'],auth:['refunds-v1'],includeMoney:[true]});assert.deepEqual(f.selections,[input]);
 const oldAuth=chain(sourceModules,(review,moneyRequested)=>moneyRequested?money():review?evidence():frame(),{dropRefundContract:true});assert.deepEqual(await oldAuth.run(input),evidence());assert.deepEqual(oldAuth.calls,{app:1,auth:1,finance:1,provider:0});assert.deepEqual(oldAuth.refunds,{app:['refunds-v1'],auth:[null],includeMoney:[null]});assert.deepEqual(oldAuth.contracts.auth,['finance-reconciliation-v2']);
 for(const oldSource of [frame,evidence]){const oldFinance=chain(sourceModules,oldSource);assert.deepEqual(await oldFinance.run(input),oldSource());assert.deepEqual(oldFinance.calls,{app:1,auth:1,finance:1,provider:0});assert.deepEqual(oldFinance.refunds.includeMoney,[true]);}
 for(const header of [null,'finance-reconciliation-v1','finance-reconciliation-v2']){
  const headers=header===null?{}:{'x-braza-client-contract':header},legacy=chain(sourceModules,money),response=await forwardFinancePaymentSample(request(input,{headers}),legacy.authEnv,{validateInternalApp});assert.equal(response.status,200);assert.deepEqual(await response.json(),header==='finance-reconciliation-v2'?evidence():evidence().report);assert.deepEqual(legacy.refunds.includeMoney,[null]);
  const auth=await forwardFinancePaymentSample(request(input,{headers}),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>Response.json(money())}},{validateInternalApp});assert.equal(auth.status,200);assert.deepEqual(await auth.json(),header==='finance-reconciliation-v2'?evidence():evidence().report);
 }
});

test('unknown negotiation headers fail before Finance capability execution',async()=>{
 const f=chain();for(const header of ['finance-reconciliation-v3','FINANCE-RECONCILIATION-V2','finance-reconciliation-v2, finance-reconciliation-v1','PRIVATE_RAW_SERIAL']){
  const response=await forwardFinancePaymentSample(request(input,{headers:{'x-braza-client-contract':header}}),f.authEnv,{validateInternalApp});assert.equal(response.status,400);assert.doesNotMatch(await response.text(),/PRIVATE_RAW_SERIAL/);
  const leaf=await f.finance.fetch(request(input,{headers:{'x-braza-finance-router':router,'x-braza-client-contract':header}}),financeEnv);assert.equal(leaf.status,400);
 }
 assert.deepEqual(f.calls,{app:0,auth:0,finance:0,provider:0});
});

test('refund extension headers require the known v2 client contract before any capability can execute',async()=>{
 const f=chain();for(const headers of [{'x-braza-refund-contract':'refunds-v1'},{'x-braza-client-contract':'finance-reconciliation-v1','x-braza-refund-contract':'refunds-v1'},{'x-braza-client-contract':'finance-reconciliation-v2','x-braza-refund-contract':'refunds-v2'},{'x-braza-client-contract':'finance-reconciliation-v2','x-braza-refund-contract':'refunds-v1, PRIVATE'}]){
  const auth=await forwardFinancePaymentSample(request(input,{headers}),f.authEnv,{validateInternalApp});assert.equal(auth.status,400);assert.doesNotMatch(await auth.text(),/PRIVATE/);const finance=await f.finance.fetch(request(input,{headers:{...headers,'x-braza-finance-router':router}}),financeEnv);assert.equal(finance.status,400);
 }
 assert.deepEqual(f.calls,{app:0,auth:0,finance:0,provider:0});
});

test('unauthorized and caller-selected identities, provider URLs or serials fail before a reconciliation capability can run',async()=>{
 const f=chain();
 for(const invalid of [{...input,shop_id:1178167501},{...input,order_sn:'PRIVATE_SERIAL'},{...input,access_token:'PRIVATE_TOKEN'},{...input,url:'https://evil.test'},{...input,path:'/api/v2/returns/get_return_detail'},{...input,includeReview:true},{...input,includeMoney:true},{...input,run_id:'invalid'},{operation:'start',run_id}]){
  const before={...f.calls},value=await f.run(invalid);assert.equal(value.status,'UNAVAILABLE');assert.equal(value.diagnostic.code,'FINANCE_RECONCILIATION_CONFIGURATION');assert.deepEqual(f.calls,before);
  const response=await forwardFinancePaymentSample(request(invalid),f.authEnv,{validateInternalApp});assert.equal(response.status,400);assert.deepEqual(f.calls,before);
  const privateResponse=await f.finance.fetch(request(invalid,{headers:{'x-braza-finance-router':router}}),financeEnv);assert.equal(privateResponse.status,400);assert.deepEqual(f.calls,before);
 }
 for(const cookie of ['', 'PRIVATE_OWNER_COOKIE']){const response=await forwardFinancePaymentSample(request(input,{headers:{'x-braza-app-key':'wrong',cookie}}),f.authEnv,{validateInternalApp});assert.equal(response.status,401);}
 assert.equal((await forwardFinancePaymentSample(request(input,{method:'GET'}),f.authEnv,{validateInternalApp})).status,405);assert.equal((await forwardFinancePaymentSample(request(input,{search:'?shop_id=1178167501'}),f.authEnv,{validateInternalApp})).status,400);assert.equal((await forwardFinancePaymentSample(request(input,{host:'https://evil.test'}),f.authEnv,{validateInternalApp})).status,404);
 assert.equal((await f.finance.fetch(request(),financeEnv)).status,403);assert.equal((await f.finance.fetch(request(input,{headers:{'x-braza-finance-router':'wrong'}}),financeEnv)).status,403);
 assert.equal((await f.finance.fetch(request(input,{headers:{'x-braza-finance-router':router}}),{...financeEnv,FINANCE_CONNECTION_ENABLED:'false'})).status,503);assert.equal(f.calls.finance,0);assert.equal(f.calls.provider,0);
});

test('invalid v2 evidence is rejected at each boundary instead of being silently downgraded to its legacy report',async()=>{
 for(const mutate of [value=>{value.report.run_id=otherRun;},value=>{value.review.orders[0].order_sn='PRIVATE_SERIAL';},value=>{value.review.orders[0].order_hash='0'.repeat(64);},value=>{value.review.orders[0].references_checked_at=at+1;},value=>{value.review.summary.to_return=2;},value=>{value.report.adjustments.after_adjustment_repass_cents=7999;}]){
  const bad=evidence();mutate(bad);const f=chain(sourceModules,()=>bad),headers={'x-braza-client-contract':'finance-reconciliation-v2'},leaf=await f.finance.fetch(request(input,{headers:{...headers,'x-braza-finance-router':router}}),financeEnv);assert.equal(leaf.status,502);assert.doesNotMatch(await leaf.text(),/PRIVATE_|22222222|7999/);
  const value=await f.run(input);assert.equal(value.status,'UNAVAILABLE');assert.equal(value.diagnostic.code,'FINANCE_RECONCILIATION_HTTP_ERROR');assert.equal(value.diagnostic.http,502);
  const auth=await forwardFinancePaymentSample(request(input,{headers}),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>Response.json(bad)}},{validateInternalApp});assert.equal(auth.status,502);assert.doesNotMatch(await auth.text(),/PRIVATE_|22222222|7999/);
  let calls=0;const app=await getFinanceReconciliation({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async()=>{calls++;return Response.json(bad);}});assert.equal(app.status,'UNAVAILABLE');assert.equal(app.diagnostic.code,bad.report.run_id===otherRun?'FINANCE_RECONCILIATION_SCOPE_MISMATCH':'FINANCE_RECONCILIATION_FRAME_INVALID');assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(app),/PRIVATE_|22222222|7999/);
 }
});

test('poisoned v3 amounts, cohorts and scope fail at every boundary even when the embedded v1/v2 report is valid',async()=>{
 for(const mutate of [value=>{value.report.run_id=otherRun;},value=>{value.money.order_sn='PRIVATE_SERIAL';},value=>{value.money.groups[0].statuses[3].known_amount_cents=9999;},value=>{value.money.payouts[0].cohort='REVIEW';},value=>{value.money.payouts[1].base_repass_cents=0;},value=>{value.money.payouts[0].after_adjustment_repass_cents=7999;}]){
  const bad=money();mutate(bad);const f=chain(sourceModules,()=>bad),headers={'x-braza-client-contract':'finance-reconciliation-v2','x-braza-refund-contract':'refunds-v1'},leaf=await f.finance.fetch(request(input,{headers:{...headers,'x-braza-finance-router':router}}),financeEnv);assert.equal(leaf.status,502);assert.doesNotMatch(await leaf.text(),/PRIVATE_|22222222|7999|9999/);
  const value=await f.run(input);assert.equal(value.status,'UNAVAILABLE');assert.equal(value.diagnostic.code,'FINANCE_RECONCILIATION_HTTP_ERROR');assert.equal(value.diagnostic.http,502);
  for(const requested of [headers,{'x-braza-client-contract':'finance-reconciliation-v2'},{}]){const auth=await forwardFinancePaymentSample(request(input,{headers:requested}),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>Response.json(bad)}},{validateInternalApp});assert.equal(auth.status,502);assert.doesNotMatch(await auth.text(),/PRIVATE_|22222222|7999|9999/);}
  let calls=0;const app=await getFinanceReconciliation({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async()=>{calls++;return Response.json(bad);}});assert.equal(app.status,'UNAVAILABLE');assert.equal(app.diagnostic.code,bad.report.run_id===otherRun?'FINANCE_RECONCILIATION_SCOPE_MISMATCH':'FINANCE_RECONCILIATION_FRAME_INVALID');assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(app),/PRIVATE_|22222222|7999|9999/);
 }
});

test('every boundary rejects substituted source runs and extra currency, raw serial or altered monetary evidence without leaking provider values',async()=>{
 for(const mutate of [value=>{value.run_id=otherRun;},value=>{value.currency='USD';},value=>{value.order_sn='PRIVATE_ORDER_SERIAL';},value=>{value.access_token='PRIVATE_TOKEN';},value=>{value.cases[0].return_sn='PRIVATE_RETURN_SERIAL';},value=>{value.adjustments.after_adjustment_repass_cents=7999;}]){
  const bad=frame();mutate(bad);
  const f=chain(sourceModules,()=>structuredClone(bad)),leaf=await f.finance.fetch(request(input,{headers:{'x-braza-finance-router':router}}),financeEnv);assert.equal(leaf.status,502);assert.doesNotMatch(await leaf.text(),/PRIVATE_|USD|22222222|7999/);
  const value=await f.run(input);assert.equal(value.status,'UNAVAILABLE');assert.equal(value.diagnostic.code,'FINANCE_RECONCILIATION_HTTP_ERROR');assert.equal(value.diagnostic.http,502);assert.doesNotMatch(JSON.stringify(value),/PRIVATE_|USD|22222222|7999/);
  const auth=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>Response.json(bad)}},{validateInternalApp});assert.equal(auth.status,502);assert.doesNotMatch(await auth.text(),/PRIVATE_|USD|22222222|7999/);
  const app=await getFinanceReconciliation({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async()=>Response.json(bad)});assert.equal(app.status,'UNAVAILABLE');assert.equal(app.diagnostic.code,bad.run_id===otherRun?'FINANCE_RECONCILIATION_SCOPE_MISMATCH':'FINANCE_RECONCILIATION_FRAME_INVALID');assert.doesNotMatch(JSON.stringify(app),/PRIVATE_|USD|22222222|7999/);
 }
});

test('private transport bounds, redirects and exceptions remain finite safe failures without retries or credential disclosure',async()=>{
 for(const response of [()=>Response.redirect('https://evil.test/PRIVATE_TOKEN',302),()=>new Response('PRIVATE_HTML',{headers:{'content-type':'text/html'}}),()=>new Response('x'.repeat(65537),{headers:{'content-type':'application/json'}}),()=>Response.json({error:'PRIVATE_PROVIDER_TOKEN'},{status:429})]){
  let calls=0;const app=await getFinanceReconciliation({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async()=>{calls++;return response();}});assert.equal(app.status,'UNAVAILABLE');assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(app),/PRIVATE_|evil.test/);
  const auth=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>response()}},{validateInternalApp});assert.ok([429,502].includes(auth.status));assert.doesNotMatch(await auth.text(),/PRIVATE_|evil.test/);
 }
 const timeout=await getFinanceReconciliation({APP_INTERNAL_SECRET:appKey},input,{timeoutMs:5,fetchImpl:async()=>new Promise(()=>{})});assert.equal(timeout.diagnostic.code,'FINANCE_RECONCILIATION_TIMEOUT');
 const finance=createFinanceWorker({reconciliation:async()=>{throw Error('PRIVATE_TOKEN_PROVIDER_DETAIL');},fetchImpl:async()=>{throw Error();}}),failure=await finance.fetch(request(input,{headers:{'x-braza-finance-router':router}}),financeEnv);assert.equal(failure.status,502);assert.doesNotMatch(await failure.text(),/PRIVATE_|PROVIDER_DETAIL/);
});

for(const minify of [false,true])test(`the three private reconciliation functions preserve scope and blocked reports after bundling (minify=${minify})`,async()=>{
 const result=await build({stdin:{contents:"export {getFinanceReconciliation} from './web/cloudflare/src/app-reconciliation.mjs';export {forwardFinancePaymentSample} from './web/finance/src/auth-router.mjs';export {createFinanceWorker} from './web/finance/src/connection-worker.mjs';",resolveDir:process.cwd(),sourcefile:'reconciliation-private-boundaries.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const modules=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64')),good=chain(modules),denied=chain(modules,blocked),review=chain(modules,evidence),refunds=chain(modules,money);assert.deepEqual(await good.run(input),frame());assert.deepEqual(await denied.run({operation:'step',run_id}),blocked());assert.deepEqual(await review.run(input),evidence());assert.deepEqual(await refunds.run(input),money());assert.deepEqual(good.calls,{app:1,auth:1,finance:1,provider:0});assert.deepEqual(denied.calls,{app:1,auth:1,finance:1,provider:0});assert.deepEqual(review.calls,{app:1,auth:1,finance:1,provider:0});assert.deepEqual(refunds.calls,{app:1,auth:1,finance:1,provider:0});
});
