import test from 'node:test';
import assert from 'node:assert/strict';
import {getFinanceBusinessPeriod} from '../../cloudflare/src/app-business-period.mjs';
import {forwardFinancePaymentSample} from '../src/auth-router.mjs';
import {createFinanceWorker} from '../src/connection-worker.mjs';
import {projectBusinessPeriodFrame} from '../src/business-period-frame.mjs';

const origin='https://auth.brazacommerce.com.br',path='/internal/shopee/finance/business-period';
const input={operation:'start',start_date:'2026-10-01',end_date:'2026-10-15'};
const router='fixture-router-'+'r'.repeat(40),appKey='fixture-app-'+'a'.repeat(40);
const source=()=>({schema:'finance_business_period_v1',run_id:'11111111-1111-4111-8111-111111111111',revision:2,status:'COMPLETE',start_date:input.start_date,end_date:input.end_date,cutoff_at:1792400000,checked_at:1792400001,currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:3,paid:2,completed:1,ongoing:1,cancelled:1,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1,payment_missing:1,returns:0,returns_unknown:1},known_sales_base_raw:'100',sales_base_raw:null,known_expected_repass_raw:'80',expected_repass_raw:null,known_ads_adjustment_raw:'0',ads_adjustment_raw:null,invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:1,known_base_raw:'100',known_tax_raw:'2'},items:[{item_id:'201',model_id:'0',quantity:2}],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'});
const request=(body=input,options={})=>new Request(origin+path+(options.search||''),{method:options.method||'POST',headers:{'content-type':'application/json','x-braza-app-key':appKey,...options.headers},body:options.method==='GET'?undefined:JSON.stringify(body)});
const validateInternalApp=req=>req.headers.get('x-braza-app-key')===appKey;

test('the same all-paid frame crosses App, Auth and Finance without exposing order identity or reclassifying missing payments',async()=>{
 assert.ok(projectBusinessPeriodFrame(source()));let calls=0,serviceCalls=0,providerCalls=0;
 const finance=createFinanceWorker({businessPeriod:async(env,options)=>{calls++;assert.deepEqual({operation:options.operation,start_date:options.start_date,end_date:options.end_date},input);return source();},fetchImpl:async()=>{providerCalls++;throw Error('UNEXPECTED_PROVIDER');}});
 const result=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async req=>{
  assert.equal(req.url,origin+path);assert.equal(req.redirect,'manual');assert.equal(req.headers.get('cookie'),null);assert.equal(req.headers.get('x-braza-app-key'),appKey);
  return forwardFinancePaymentSample(req,{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async upstream=>{
   serviceCalls++;assert.equal(upstream.headers.get('x-braza-finance-router'),router);assert.equal(upstream.headers.get('x-braza-app-key'),null);assert.equal(upstream.headers.get('cookie'),null);
   return finance.fetch(upstream,{FINANCE_CONNECTION_ENABLED:'true',FINANCE_ROUTER_SECRET:router});
  }}},{validateInternalApp});
 }});
 assert.deepEqual(result,source());assert.equal(result.expected_repass_raw,null);assert.equal(result.coverage.cancelled,1);assert.equal(result.coverage.ongoing,1);assert.equal(calls,1);assert.equal(serviceCalls,1);assert.equal(providerCalls,0);
});

test('Auth rejects unauthenticated requests, queries and noncanonical selectors before invoking the private service',async()=>{
 let calls=0;const env={FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>{calls++;return Response.json(source());}}};
 for(const req of [request(input,{headers:{'x-braza-app-key':'wrong'}}),request(input,{method:'GET'}),request(input,{search:'?shop_id=99'}),request({...input,shop_id:99}),request({...input,end_date:'2026-10-16'})])assert.ok((await forwardFinancePaymentSample(req,env,{validateInternalApp})).status>=400);
 assert.equal(calls,0);
});

test('Finance verifies private router credentials and its explicit capability before any business collection',async()=>{
 let calls=0;const worker=createFinanceWorker({businessPeriod:async()=>{calls++;return source();},fetchImpl:async()=>{throw Error('UNEXPECTED');}}),env={FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'};
 for(const req of [request(),request(input,{headers:{'x-braza-finance-router':'wrong'}}),request(input,{headers:{'x-braza-finance-router':router},search:'?month=2026-10'}),request({...input,order_sn:'PRIVATE_ORDER'},{headers:{'x-braza-finance-router':router}})])assert.ok((await worker.fetch(req,env)).status>=400);
 const disabled=await worker.fetch(request(input,{headers:{'x-braza-finance-router':router}}),{...env,FINANCE_CONNECTION_ENABLED:'false'});assert.equal(disabled.status,503);
 assert.equal((await createFinanceWorker().fetch(request(input,{headers:{'x-braza-finance-router':router}}),env)).status,503);assert.equal(calls,0);
});

test('all three private boundaries reject wrong period or run identity and private aggregate extras',async()=>{
 const read={operation:'read',run_id:source().run_id};
 for(const poison of [v=>v.start_date='2026-09-30',v=>v.run_id='22222222-2222-4222-8222-222222222222',v=>v.access_token='PRIVATE_TOKEN']){
  const value=source();poison(value);const selected=value.start_date!==input.start_date?input:read;
  const app=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},selected,{fetchImpl:async()=>Response.json(value)});assert.equal(app.status,'UNAVAILABLE');assert.ok(!JSON.stringify(app).includes('PRIVATE_TOKEN'));
  const auth=await forwardFinancePaymentSample(request(selected),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>Response.json(value)}},{validateInternalApp});assert.ok(auth.status>=400);assert.ok(!(await auth.text()).includes('PRIVATE_TOKEN'));
  const finance=createFinanceWorker({businessPeriod:async()=>value,fetchImpl:async()=>{throw Error('UNEXPECTED');}});
  const rejected=await finance.fetch(request(selected,{headers:{'x-braza-finance-router':router}}),{FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'});assert.ok(rejected.status>=400);assert.ok(!(await rejected.text()).includes('PRIVATE_TOKEN'));
 }
});

test('bounded App transport rejects failed or oversized source bodies, aborts a late read and never retries',async()=>{
 for(const response of [new Response('PRIVATE',{status:403}),new Response('PRIVATE',{headers:{'content-type':'text/html'}}),new Response('{}',{headers:{'content-type':'application/json','content-length':'524289'}})]){
  const result=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async()=>response});assert.equal(result.status,'UNAVAILABLE');assert.ok(!JSON.stringify(result).includes('PRIVATE'));
 }
 let calls=0,req;const result=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{timeoutMs:5,fetchImpl:async value=>{req=value;calls++;return new Promise(()=>{});}});assert.equal(result.status,'UNAVAILABLE');assert.equal(calls,1);assert.equal(req.signal.aborted,true);
});
