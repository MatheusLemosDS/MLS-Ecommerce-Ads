import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {getFinanceReconciliation} from '../../cloudflare/src/app-reconciliation.mjs';
import {forwardFinancePaymentSample} from '../src/auth-router.mjs';
import {createFinanceWorker} from '../src/connection-worker.mjs';
import {projectReconciliationFrame,projectReconciliationEvidenceFrame,projectReconciliationMoneyFrame} from '../src/reconciliation-frame.mjs';
import {projectOriginalItemsFrame,projectReconciliationOriginalItemsFrame} from '../src/original-items-frame.mjs';

const origin='https://auth.brazacommerce.com.br',path='/internal/shopee/finance/reconciliation';
const run_id='11111111-1111-4111-8111-111111111111',at=1792500000,input={operation:'read',run_id};
const appKey='synthetic-original-app-'+'a'.repeat(40),router='synthetic-original-router-'+'r'.repeat(40);
const headers={'x-braza-client-contract':'finance-reconciliation-v2','x-braza-refund-contract':'refunds-v1','x-braza-original-items-contract':'original-items-v1'};
const env={FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'};
const validateInternalApp=request=>request.headers.get('x-braza-app-key')===appKey;
const request=(body=input,extra={},route=path)=>new Request(origin+route,{method:'POST',headers:{'content-type':'application/json','x-braza-app-key':appKey,...extra},body:JSON.stringify(body)});
const modules={getFinanceReconciliation,forwardFinancePaymentSample,createFinanceWorker};

// Deterministic synthetic source; no live order, return serial or customer data.
function legacy(){
 return {schema:'finance_reconciliation_v1',run_id,source_revision:2,start_date:'2026-10-01',end_date:'2026-10-15',checked_at:at,status:'CHECKED',source_checked_at:{finance_oldest_at:at-100,finance_latest_at:at-10,returns_oldest_at:at-5,returns_latest_at:at-5},coverage:{orders:1,evidence_orders:1,missing_evidence_orders:0,paid_orders:1,review_orders:0,return_orders:1,return_unknown_orders:0},adjustments:{reported_orders:1,missing_orders:0,conflicting_orders:0,known_adjustment_cents:100,base_repass_cents:8000,after_adjustment_repass_cents:8100},returns:{reference_count:1,checked_count:1,pending_count:0,known_requested_refund_cents:1000,requested_amount_complete:true,permission:'AVAILABLE'},cases:[{case_hash:'a'.repeat(64),order_hash:'b'.repeat(64),status:'ACCEPTED',requested_refund_cents:1000,checked_at:at-5,diagnostic:null}],truncation:{truncated:false,cases_total:1,cases_included:1},pending:['RETURN_VALUES_UNVERIFIED','SETTLEMENT_NOT_RECONCILED'],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};
}
function review(){
 return {schema:'finance_reconciliation_v2',report:legacy(),review:{schema:'finance_review_orders_v1',summary:{orders:0,in_cancel:0,to_return:0,other:0,unknown:0},orders:[],truncation:{truncated:false,orders_total:0,orders_included:0},basis:'REVIEW_ORDERS_OUTSIDE_PAID_COHORT'}};
}
function money(){
 const value=review(),statuses=['PENDING','UNKNOWN','REQUESTED','ACCEPTED','CANCELLED','JUDGING','REFUND_PAID','CLOSED','PROCESSING'];
 return {schema:'finance_reconciliation_v3',report:value.report,review:value.review,money:{schema:'finance_reconciliation_money_v1',currency:'BRL',groups:['PAID','REVIEW','OTHER'].map(cohort=>({cohort,statuses:statuses.map(status=>({status,cases:cohort==='PAID'&&status==='ACCEPTED'?1:0,amount_known:cohort==='PAID'&&status==='ACCEPTED'?1:0,known_amount_cents:cohort==='PAID'&&status==='ACCEPTED'?1000:0})),source_checked_at:{oldest_at:cohort==='PAID'?at-5:null,latest_at:cohort==='PAID'?at-5:null}})),payouts:[{order_hash:'b'.repeat(64),cohort:'PAID',source_checked_at:at-10,reference_count:1,state:'AVAILABLE',base_repass_cents:8000,adjustment_cents:100,after_adjustment_repass_cents:8100}],truncation:{truncated:false,payouts_total:1,payouts_included:1},basis:'SAVED_RETURN_AMOUNTS_AND_PAID_PAYOUT_AFTER_ADJUSTMENTS'}};
}
function original(){
 const value=money();return {...value,schema:'finance_reconciliation_v4',original_items:{schema:'finance_original_items_v1',run_id,source_revision:2,start_date:'2026-10-01',end_date:'2026-10-15',checked_at:at,orders:[{order_hash:'b'.repeat(64),source_checked_at:at-10,state:'AVAILABLE',items:[{item_id:'1000',model_id:'0',quantity:2}]}],cases:[{case_hash:'a'.repeat(64),order_hash:'b'.repeat(64),source_checked_at:at-5,state:'AVAILABLE',items:[{item_id:'1000',model_id:'0',quantity:1}]}],truncation:{orders_total:1,orders_included:1,cases_total:1,cases_included:1,truncated:false},basis:'SAVED_PROVIDER_SELLING_UNIT_COUNTS_NOT_PHYSICAL_PIECES'}};
}
function chain(source=modules,result=money,{dropOriginalHeader=false}={}){
 const calls={app:0,auth:0,finance:0,provider:0},options=[],forwarded=[];
 const finance=source.createFinanceWorker({now:()=>at*1000,fetchImpl:async()=>{calls.provider++;throw Error('UNEXPECTED_SYNTHETIC_PROVIDER_REQUEST');},reconciliation:async(financeEnv,value)=>{calls.finance++;assert.equal(financeEnv.APP_INTERNAL_SECRET,undefined);options.push(value);return result();}});
 const authEnv={FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async req=>{calls.auth++;forwarded.push(req);return finance.fetch(req,env);}}};
 const fetchImpl=async req=>{calls.app++;const forwarded=dropOriginalHeader?new Request(req):req;if(dropOriginalHeader)forwarded.headers.delete('x-braza-original-items-contract');return source.forwardFinancePaymentSample(forwarded,authEnv,{validateInternalApp});};
 return {calls,options,forwarded,finance,authEnv,fetchImpl,run:(includeOriginalItems=false)=>source.getFinanceReconciliation({APP_INTERNAL_SECRET:appKey},input,{fetchImpl,includeOriginalItems})};
}

test('original-item negotiation keeps the old App default byte-compatible and enables only the exact private option',async()=>{
 assert.ok(projectReconciliationFrame(legacy()));assert.ok(projectReconciliationEvidenceFrame(review(),projectReconciliationFrame));assert.ok(projectReconciliationMoneyFrame(money(),projectReconciliationFrame,projectReconciliationEvidenceFrame));
 const old=chain();assert.deepEqual(await old.run(),money());assert.equal(old.forwarded[0].headers.get('x-braza-original-items-contract'),null);assert.equal(Object.hasOwn(old.options[0],'includeOriginalItems'),false);
 const opted=chain();assert.deepEqual(await opted.run(true),money(),'an older Finance may return the exact legacy v3 in one request');
 assert.equal(opted.forwarded[0].headers.get('x-braza-original-items-contract'),'original-items-v1');assert.equal(opted.forwarded[0].headers.get('x-braza-client-contract'),'finance-reconciliation-v2');assert.equal(opted.forwarded[0].headers.get('x-braza-refund-contract'),'refunds-v1');
 assert.deepEqual(Object.keys(opted.options[0]).sort(),['operation','run_id','fetchImpl','now','includeReview','includeMoney','includeOriginalItems'].sort());assert.equal(opted.options[0].includeOriginalItems,true);assert.equal(opted.options[0].includeReview,true);assert.equal(opted.options[0].includeMoney,true);
 assert.deepEqual(opted.calls,{app:1,auth:1,finance:1,provider:0});
 for(const name of ['cookie','authorization','origin','referer','x-braza-app-key'])assert.equal(opted.forwarded[0].headers.get(name),null);
});

test('mixed Auth deployments omit original items without adding a second request or inventing availability',async()=>{
 for(const result of [legacy,review,money]){
  const f=chain(modules,result,{dropOriginalHeader:true}),value=await f.run(true);assert.deepEqual(value,result());assert.equal(Object.hasOwn(value,'original_items'),false);assert.equal(Object.hasOwn(f.options[0],'includeOriginalItems'),false);assert.deepEqual(f.calls,{app:1,auth:1,finance:1,provider:0});
 }
});

test('valid original-item v4 crosses each opted-in boundary once and leaves the strict financial report unchanged',async()=>{
 const expected=original(),before=JSON.stringify(expected);assert.ok(projectOriginalItemsFrame(expected.original_items,expected.report));assert.ok(projectReconciliationOriginalItemsFrame(expected,projectReconciliationFrame,projectReconciliationEvidenceFrame,projectReconciliationMoneyFrame,projectOriginalItemsFrame));
 const f=chain(modules,original),value=await f.run(true);assert.deepEqual(value,expected);assert.deepEqual(value.report,legacy());assert.equal(value.original_items.orders[0].items[0].quantity,2);assert.equal(value.original_items.cases[0].items[0].quantity,1);assert.equal(JSON.stringify(expected),before);assert.deepEqual(f.calls,{app:1,auth:1,finance:1,provider:0});assert.doesNotMatch(JSON.stringify(value),/order_sn|return_sn|access_token|buyer|customer|PRIVATE_/);
 const defaults=chain(modules,original);assert.deepEqual(await defaults.run(false),money(),'legacy callers never receive an unsolicited sidecar');assert.equal(defaults.forwarded[0].headers.get('x-braza-original-items-contract'),null);assert.equal(Object.hasOwn(defaults.options[0],'includeOriginalItems'),false);
 const auth=await forwardFinancePaymentSample(request(input,{'x-braza-client-contract':'finance-reconciliation-v2','x-braza-refund-contract':'refunds-v1'}),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>Response.json(original())}},{validateInternalApp});assert.equal(auth.status,200);assert.deepEqual(await auth.json(),money());
 const app=await getFinanceReconciliation({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async()=>Response.json(original())});assert.deepEqual(app,money());
});

test('the original-item header requires both known contracts and is rejected on other private routes before any source call',async()=>{
 const f=chain();
 for(const candidate of [{'x-braza-original-items-contract':'original-items-v1'},{...headers,'x-braza-client-contract':'finance-reconciliation-v1'},{...headers,'x-braza-refund-contract':'refunds-v2'},{...headers,'x-braza-original-items-contract':'original-items-v2'},{...headers,'x-braza-original-items-contract':'original-items-v1, PRIVATE_VALUE'}]){
  const auth=await forwardFinancePaymentSample(request(input,candidate),f.authEnv,{validateInternalApp});assert.equal(auth.status,400);assert.doesNotMatch(await auth.text(),/PRIVATE_VALUE/);
  const leaf=await f.finance.fetch(request(input,{...candidate,'x-braza-finance-router':router}),env);assert.equal(leaf.status,400);
 }
 for(const route of ['/internal/shopee/finance/business-period','/internal/shopee/finance/escrow-releases']){
  const auth=await forwardFinancePaymentSample(request(input,headers,route),f.authEnv,{validateInternalApp});assert.equal(auth.status,400);
  const leaf=await f.finance.fetch(request(input,{...headers,'x-braza-finance-router':router},route),env);assert.equal(leaf.status,400);
 }
 assert.deepEqual(f.calls,{app:0,auth:0,finance:0,provider:0});
});

test('the original-items opt-in remains outside the untrusted request body and App options reject accessors without invoking them',async()=>{
 let calls=0,reads=0;const fetchImpl=async()=>{calls++;return Response.json(money());};
 for(const options of [null,[],{includeOriginalItems:1},{includeOriginalItems:'true'},{includeOriginalItems:true,url:'https://private.invalid'},Object.create({includeOriginalItems:true}),Object.defineProperty({fetchImpl},'includeOriginalItems',{enumerable:true,get(){reads++;throw Error('PRIVATE_GETTER');}}),Object.defineProperty({},'fetchImpl',{enumerable:true,get(){reads++;throw Error('PRIVATE_GETTER');}})]){
  const value=await getFinanceReconciliation({APP_INTERNAL_SECRET:appKey},input,options);assert.equal(value.diagnostic.code,'FINANCE_RECONCILIATION_CONFIGURATION');assert.doesNotMatch(JSON.stringify(value),/PRIVATE_|private.invalid/);
 }
 for(const body of [{...input,includeOriginalItems:true},{...input,original_items:{}},{...input,order_sn:'PRIVATE_SERIAL'}]){
  const value=await getFinanceReconciliation({APP_INTERNAL_SECRET:appKey},body,{fetchImpl,includeOriginalItems:true});assert.equal(value.diagnostic.code,'FINANCE_RECONCILIATION_CONFIGURATION');
 }
 assert.equal(calls,0);assert.equal(reads,0);
});

test('malformed v4 evidence fails at all three boundaries instead of downgrading to its valid v3 monetary report',async()=>{
 for(const mutate of [value=>{value.original_items=null;},value=>{delete value.original_items;},value=>{value.original_items={order_sn:'PRIVATE_SERIAL'};},value=>{value.extra='PRIVATE_EXTRA';}]){
  const bad={...money(),schema:'finance_reconciliation_v4',original_items:null};mutate(bad);const f=chain(modules,()=>bad);
  const leaf=await f.finance.fetch(request(input,{...headers,'x-braza-finance-router':router}),env);assert.equal(leaf.status,502);assert.doesNotMatch(await leaf.text(),/PRIVATE_/);
  const auth=await forwardFinancePaymentSample(request(input,headers),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>Response.json(bad)}},{validateInternalApp});assert.equal(auth.status,502);assert.doesNotMatch(await auth.text(),/PRIVATE_/);
  let attempts=0;const value=await getFinanceReconciliation({APP_INTERNAL_SECRET:appKey},input,{includeOriginalItems:true,fetchImpl:async()=>{attempts++;return Response.json(bad);}});assert.equal(value.diagnostic.code,'FINANCE_RECONCILIATION_FRAME_INVALID');assert.equal(attempts,1);assert.doesNotMatch(JSON.stringify(value),/PRIVATE_/);
 }
});

test('forged v4 scope, item identities, counts, association and private extras are rejected without a downgrade or data reflection',async()=>{
 for(const mutate of [value=>{value.original_items.source_revision++;},value=>{value.original_items.orders[0].order_hash='c'.repeat(64);},value=>{value.original_items.cases[0].case_hash='c'.repeat(64);},value=>{value.original_items.cases[0].order_hash='c'.repeat(64);},value=>{value.original_items.orders[0].source_checked_at--;},value=>{value.original_items.cases[0].source_checked_at--;},value=>{value.original_items.orders[0].items[0].quantity=1.5;},value=>{value.original_items.cases[0].items[0].quantity=0;},value=>{value.original_items.orders[0].items.push({...value.original_items.orders[0].items[0]});},value=>{value.original_items.cases[0].order_sn='PRIVATE_SERIAL';}]){
  const bad=original();mutate(bad);const f=chain(modules,()=>bad);const leaf=await f.finance.fetch(request(input,{...headers,'x-braza-finance-router':router}),env);assert.equal(leaf.status,502);assert.doesNotMatch(await leaf.text(),/PRIVATE_SERIAL/);
  const auth=await forwardFinancePaymentSample(request(input,headers),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>Response.json(bad)}},{validateInternalApp});assert.equal(auth.status,502);
  let attempts=0;const app=await getFinanceReconciliation({APP_INTERNAL_SECRET:appKey},input,{includeOriginalItems:true,fetchImpl:async()=>{attempts++;return Response.json(bad);}});assert.equal(app.diagnostic.code,'FINANCE_RECONCILIATION_FRAME_INVALID');assert.equal(attempts,1);assert.doesNotMatch(JSON.stringify(app),/PRIVATE_SERIAL/);
 }
 let reads=0;const poisoned=original();Object.defineProperty(poisoned,'original_items',{enumerable:true,get(){reads++;throw Error('PRIVATE_GETTER');}});const f=chain(modules,()=>poisoned),leaf=await f.finance.fetch(request(input,{...headers,'x-braza-finance-router':router}),env);assert.equal(leaf.status,502);assert.equal(reads,0);
});

test('only the negotiated original-items transport accepts 256 KiB, with exact legacy 64 KiB bounds unchanged',async()=>{
 const canonical=JSON.stringify(money());
 for(const declared of [false,true])for(const includeOriginalItems of [false,true]){
  const maximum=includeOriginalItems?262144:65536;
  for(const extra of [0,1]){
   const padded=canonical+' '.repeat(maximum+extra-Buffer.byteLength(canonical)),responseHeaders={'content-type':'application/json',...(declared?{'content-length':String(Buffer.byteLength(padded))}:{})};let attempts=0;
   const value=await getFinanceReconciliation({APP_INTERNAL_SECRET:appKey},input,{includeOriginalItems,fetchImpl:async()=>{attempts++;return new Response(padded,{headers:responseHeaders});}});
   assert.equal(attempts,1);if(extra)assert.equal(value.diagnostic.code,'FINANCE_RECONCILIATION_BODY_LIMIT');else assert.deepEqual(value,money());
   const auth=await forwardFinancePaymentSample(request(input,includeOriginalItems?headers:{'x-braza-client-contract':'finance-reconciliation-v2','x-braza-refund-contract':'refunds-v1'}),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>new Response(padded,{headers:responseHeaders})}},{validateInternalApp});
   assert.equal(auth.status,extra?502:200);if(!extra)assert.deepEqual(await auth.json(),money());
  }
 }
});

for(const minify of [false,true])test(`original-items private negotiation survives bundling without an extra source request (minify=${minify})`,async()=>{
 const output=await build({stdin:{contents:"export {getFinanceReconciliation} from './web/cloudflare/src/app-reconciliation.mjs';export {forwardFinancePaymentSample} from './web/finance/src/auth-router.mjs';export {createFinanceWorker} from './web/finance/src/connection-worker.mjs';",resolveDir:process.cwd(),sourcefile:'original-items-private-boundaries.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const source=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64')),f=chain(source),v4=chain(source,original);assert.deepEqual(await f.run(true),money());assert.deepEqual(await v4.run(true),original());assert.equal(f.options[0].includeOriginalItems,true);assert.deepEqual(f.calls,{app:1,auth:1,finance:1,provider:0});assert.deepEqual(v4.calls,{app:1,auth:1,finance:1,provider:0});
});
