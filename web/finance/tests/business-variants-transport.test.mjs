import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFinanceWorker} from '../src/connection-worker.mjs';
import {forwardFinancePaymentSample} from '../src/auth-router.mjs';
import {getFinanceBusinessPeriod} from '../../cloudflare/src/app-business-period.mjs';
import {projectBusinessPeriodFrame} from '../src/business-period-frame.mjs';
import {buildBusinessPeriodVariantsFrame,projectBusinessPeriodVariantsFrame} from '../src/business-variant-attribution.mjs';

const origin='https://auth.brazacommerce.com.br',path='/internal/shopee/finance/business-period';
const header='x-braza-business-variants-contract',contract='single-pair-v1',daily='x-braza-daily-contract';
const router='synthetic-variant-router-'+'r'.repeat(40),appKey='synthetic-variant-app-'+'a'.repeat(40);
const input={operation:'start',start_date:'2026-10-01',end_date:'2026-10-15'};
const runId='11111111-1111-4111-8111-111111111111',hash=value=>createHash('sha256').update(value).digest('hex');
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const request=(body=input,{route=path,headers={},method='POST',search=''}={})=>new Request(origin+route+search,{method,headers:{'content-type':'application/json','x-braza-app-key':appKey,'x-braza-finance-router':router,...headers},...(method==='GET'?{}:{body:JSON.stringify(body)})});
const validateInternalApp=req=>req.headers.get('x-braza-app-key')===appKey;
const financeEnv={FINANCE_CONNECTION_ENABLED:'true',FINANCE_ROUTER_SECRET:router};
const appFailure=(code,http=200)=>({schema:'finance_business_period_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_BUSINESS_'+code,http}});

function fixture(){
 const rows=[{model_id:'10',quantity:2,sale:'100',payout:'80',ads:'3',bucket:'completed'},{model_id:'11',quantity:1,sale:'50',payout:'25',ads:'2',bucket:'ongoing'}];
 const report={schema:'finance_business_period_v1',run_id:runId,revision:2,status:'COMPLETE',start_date:input.start_date,end_date:input.end_date,cutoff_at:1792400000,checked_at:1792400002,currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,
  coverage:{orders:2,paid:2,completed:1,ongoing:1,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:2,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'150',sales_base_raw:'150',known_expected_repass_raw:'105',expected_repass_raw:'105',known_ads_adjustment_raw:'5',ads_adjustment_raw:'5',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:2,unavailable_orders:0,known_base_raw:'150',known_tax_raw:'3'},
  items:rows.map(({model_id,quantity})=>({item_id:'201',model_id,quantity})),diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED',
  product_breakdown:{schema:'business_product_breakdown_v1',mixed_orders:0,mixed_payment_covered:0,mixed_payment_missing:0,known_mixed_sales_base_raw:'0',known_mixed_expected_repass_raw:'0',known_mixed_ads_adjustment_raw:'0',known_mixed_invoice_tax_raw:'0',products:[{item_id:'201',quantity:3,orders:2,exclusive_orders:2,mixed_orders:0,exclusive_payment_covered:2,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,
   ...Object.fromEntries(['sales_base','expected_repass','ads_adjustment','invoice_tax'].flatMap((key,index)=>[['known_exclusive_'+key+'_raw',['150','105','5','3'][index]],['exclusive_'+key+'_raw',['150','105','5','3'][index]]])),items:rows.map(({model_id,quantity})=>({model_id,exclusive_quantity:quantity,mixed_quantity:0}))}]} };
 assert.ok(projectBusinessPeriodFrame(report));
 const records=rows.map((row,index)=>({order_hash:hash('SYNTHETIC_VARIANT_'+index),source_hash:hash('SYNTHETIC_SOURCE_'+index),checked_at:1792400001+index,bucket:row.bucket,payment_covered:1,sales_raw:row.sale,escrow_raw:row.payout,ads_raw:row.ads,returns_seen:0,items:JSON.stringify([{item_id:'201',model_id:row.model_id,quantity:row.quantity}])}));
 return {report,records};
}
function withDaily(report){
 const emptyCoverage=Object.fromEntries(Object.keys(report.coverage).map(key=>[key,0]));
 const group=(date,covered=false)=>({date,coverage:covered?{...report.coverage}:{...emptyCoverage},known_sales_base_raw:covered?report.known_sales_base_raw:'0',sales_base_raw:covered?report.sales_base_raw:'0',known_expected_repass_raw:covered?report.known_expected_repass_raw:'0',expected_repass_raw:covered?report.expected_repass_raw:'0',known_ads_adjustment_raw:covered?report.known_ads_adjustment_raw:'0',ads_adjustment_raw:covered?report.ads_adjustment_raw:'0',items:covered?structuredClone(report.items):[],source_checked_at:{oldest_at:covered?report.cutoff_at+1:null,latest_at:covered?report.checked_at:null},adjustments:{covered_orders:0,missing_orders:covered?report.coverage.paid:0,conflict_orders:0,known_base_repass_raw:'0',known_adjustment_raw:'0',known_after_adjustment_repass_raw:'0',adjustment_raw:covered?null:'0',after_adjustment_repass_raw:covered?null:'0'}});
 const result={...report,daily_breakdown:{schema:'finance_business_daily_v1',timezone:'America/Sao_Paulo',days:Array.from({length:15},(_,i)=>group('2026-10-'+String(i+1).padStart(2,'0'))),undated:group(null,true),basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'}};assert.ok(projectBusinessPeriodFrame(result));return result;
}
async function chain(value,{includeVariants=false,legacyAuth=false}={}){
 let capabilities=0,services=0,provider=0;const observed=[];
 const finance=createFinanceWorker({businessPeriod:async(env,options)=>{capabilities++;observed.push(options);return typeof value==='function'?value(options):value;},fetchImpl:async()=>{provider++;throw Error('UNEXPECTED_PROVIDER');}});
 const result=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{includeVariants,fetchImpl:async req=>{
  assert.equal(req.url,origin+path);assert.equal(req.redirect,'manual');assert.equal(req.headers.get('cookie'),null);assert.equal(req.headers.get('x-braza-app-key'),appKey);assert.equal(req.headers.get(daily),'daily-profit-v1');assert.equal(req.headers.get(header),includeVariants?contract:null);
  if(legacyAuth){const headers=new Headers(req.headers);headers.delete(header);req=new Request(req,{headers});}
  return forwardFinancePaymentSample(req,{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async upstream=>{services++;assert.equal(upstream.headers.get('x-braza-finance-router'),router);assert.equal(upstream.headers.get('x-braza-app-key'),null);assert.equal(upstream.headers.get('cookie'),null);return finance.fetch(upstream,financeEnv);}}},{validateInternalApp});
 }});
 return {result,capabilities,services,provider,observed};
}

test('negotiated variant evidence crosses the same one-call private chain without exposing provider credentials or allocating money',async()=>{
 const {report,records}=fixture(),envelope=await buildBusinessPeriodVariantsFrame(report,records);assert.ok(envelope.variant_financials);
 const result=await chain(envelope,{includeVariants:true});assert.deepEqual(result.result,envelope);assert.equal(result.capabilities,1);assert.equal(result.services,1);assert.equal(result.provider,0);assert.equal(result.observed[0].includeVariants,true);assert.equal(result.observed[0].includeDaily,true);
 assert.deepEqual(result.result.variant_financials.variants.map(row=>[row.model_id,row.expected_repass_raw]),[['10','80'],['11','25']]);assert.equal(result.result.variant_financials.unallocated_products.length,0);
 assert.doesNotMatch(JSON.stringify(result.result),/SYNTHETIC_|order_hash|source_hash|order_sn|access_token|refresh_token|buyer|sku/);
});

test('default callers retain the exact legacy JSON and no new options or headers are enabled',async()=>{
 const {report}=fixture();const result=await chain(report);assert.deepEqual(result.result,report);assert.equal(Object.hasOwn(result.observed[0],'includeVariants'),false);
 const worker=createFinanceWorker({businessPeriod:async()=>report,fetchImpl:async()=>{throw Error('NO_PROVIDER');}}),response=await worker.fetch(request(),financeEnv);assert.equal(response.status,200);assert.equal(await response.text(),JSON.stringify(report));
 const auth=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>json(report)}},{validateInternalApp});assert.equal(auth.status,200);assert.equal(await auth.text(),JSON.stringify(report));
});

test('daily negotiation remains independent and its exact report is covered by the aggregate hash',async()=>{
 const {report,records}=fixture(),dailyReport=withDaily(report),envelope=await buildBusinessPeriodVariantsFrame(dailyReport,records);assert.ok(envelope.variant_financials);
 assert.deepEqual((await chain(envelope,{includeVariants:true})).result,envelope);
 const finance=createFinanceWorker({businessPeriod:async(env,options)=>options.includeVariants?buildBusinessPeriodVariantsFrame(options.includeDaily?dailyReport:report,records):dailyReport,fetchImpl:async()=>{throw Error('NO_PROVIDER');}});
 const response=await finance.fetch(request(input,{headers:{[header]:contract}}),financeEnv);assert.equal(response.status,200);const noDaily=await response.json();assert.deepEqual(noDaily.report,report);assert.equal(Object.hasOwn(noDaily.report,'daily_breakdown'),false);assert.ok(await projectBusinessPeriodVariantsFrame(noDaily));
 assert.deepEqual(await (await finance.fetch(request(),financeEnv)).json(),report,'legacy default still strips an unnegotiated daily extension');
 const invalidFinance=createFinanceWorker({businessPeriod:async()=>envelope,fetchImpl:async()=>{throw Error('NO_PROVIDER');}});assert.equal((await invalidFinance.fetch(request(input,{headers:{[header]:contract}}),financeEnv)).status,502,'a hashed report must not be silently rewritten for daily negotiation');
 const auth=await forwardFinancePaymentSample(request(input,{headers:{[header]:contract}}),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>json(envelope)}},{validateInternalApp});assert.equal(auth.status,502);
});

test('malformed or misplaced negotiation is rejected before any capability or service call',async()=>{
 let calls=0;const worker=createFinanceWorker({businessPeriod:async()=>{calls++;throw Error();},fetchImpl:async()=>{calls++;throw Error();}}),env={FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>{calls++;throw Error();}}};
 for(const value of ['',contract+', '+contract,'single-pair-v2','true']){
  const req=request(input,{headers:{[header]:value}});assert.equal((await worker.fetch(req.clone(),financeEnv)).status,400);assert.equal((await forwardFinancePaymentSample(req,env,{validateInternalApp})).status,400);
 }
 for(const route of ['/internal/shopee/finance/store-period','/internal/shopee/finance/reconciliation','/internal/shopee/finance/product-index']){
  const req=request({}, {route,headers:{[header]:contract}});assert.equal((await worker.fetch(req.clone(),financeEnv)).status,400);assert.equal((await forwardFinancePaymentSample(req,env,{validateInternalApp})).status,400);
 }
 for(const body of [{...input,includeVariants:true},{...input,shop_id:123}]){
  const req=request(body,{headers:{[header]:contract}});assert.equal((await worker.fetch(req.clone(),financeEnv)).status,400);assert.equal((await forwardFinancePaymentSample(req,env,{validateInternalApp})).status,400);
 }
 assert.equal(calls,0);
});

test('older Finance or Auth deployments safely fall back to the same legacy report without creating captured evidence',async()=>{
 const {report}=fixture();for(const legacyAuth of [false,true]){const result=await chain(report,{includeVariants:true,legacyAuth});assert.deepEqual(result.result,report);assert.equal(result.services,1);assert.equal(result.capabilities,1);assert.equal(result.provider,0);assert.equal(Object.hasOwn(result.result,'variant_financials'),false);}
 const missing={schema:'finance_business_period_variants_v1',report,variant_financials:null};assert.deepEqual((await chain(missing,{includeVariants:true})).result,missing);
 assert.equal((await chain(missing)).result.status,'UNAVAILABLE','an unnegotiated new envelope is not reinterpreted as legacy');
});

async function rejectAtEveryBoundary(value){
 const app=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{includeVariants:true,fetchImpl:async()=>json(value)});assert.deepEqual(app,appFailure('FRAME_INVALID'));
 const headers={[header]:contract,[daily]:'daily-profit-v1'};
 const auth=await forwardFinancePaymentSample(request(input,{headers}),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>json(value)}},{validateInternalApp});assert.equal(auth.status,502);assert.doesNotMatch(await auth.text(),/PRIVATE/);
 const finance=createFinanceWorker({businessPeriod:async()=>value,fetchImpl:async()=>{throw Error('NO_PROVIDER');}});const result=await finance.fetch(request(input,{headers}),financeEnv);assert.equal(result.status,502);assert.doesNotMatch(await result.text(),/PRIVATE/);
}

test('malformed new envelopes, swapped parent hashes, quantities and unsafe extras never downgrade to valid report data',async()=>{
 const {report,records}=fixture(),value=await buildBusinessPeriodVariantsFrame(report,records);assert.ok(value.variant_financials);
 const mutations=[v=>{v.variant_financials.report_hash='0'.repeat(64);},v=>v.variant_financials.source_revision++,v=>v.variant_financials.variants[0].quantity++,v=>{v.variant_financials.variants[0].known_expected_repass_raw='81';},v=>v.variant_financials.variants.push(structuredClone(v.variant_financials.variants[0])),v=>{v.report.revision++;},v=>{v.private_token='PRIVATE_TOKEN';},v=>{v.variant_financials=null;v.schema='finance_business_period_variants_v2';},v=>{v.variant_financials.variants[0].order_sn='PRIVATE_ORDER';}];
 for(const mutate of mutations){const bad=structuredClone(value);mutate(bad);await rejectAtEveryBoundary(bad);}
});

test('valid envelope scope is checked independently of aggregate integrity at every private boundary',async()=>{
 const {report,records}=fixture();const other={...report,run_id:'22222222-2222-4222-8222-222222222222',start_date:'2026-10-02'},value=await buildBusinessPeriodVariantsFrame(other,records);assert.ok(await projectBusinessPeriodVariantsFrame(value));
 const app=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{includeVariants:true,fetchImpl:async()=>json(value)});assert.deepEqual(app,appFailure('SCOPE_MISMATCH'));
 const headers={[header]:contract,[daily]:'daily-profit-v1'},auth=await forwardFinancePaymentSample(request(input,{headers}),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>json(value)}},{validateInternalApp});assert.equal(auth.status,502);
 const finance=createFinanceWorker({businessPeriod:async()=>value,fetchImpl:async()=>{throw Error();}});assert.equal((await finance.fetch(request(input,{headers}),financeEnv)).status,502);
 const readInput={operation:'read',run_id:report.run_id};assert.deepEqual(await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},readInput,{includeVariants:true,fetchImpl:async()=>json(value)}),appFailure('SCOPE_MISMATCH'));
});

function denseFixture(){
 const base=fixture().report,goods=99999999999999n,payout=-goods,ads=-goods,tax=(goods*200n+5000n)/10000n;
 const raw=value=>{const sign=value<0n?'-':'';if(value<0n)value=-value;const fraction=String(value%100n).padStart(2,'0').replace(/0+$/,'');return sign+String(value/100n)+(fraction?'.'+fraction:'');};
 const rows=Array.from({length:1000},(_,i)=>({item_id:(10000000000000000000n+BigInt(i)).toString(),model_id:'99999999999999999999',quantity:1000000000000}));
 const report={...base,pages_read:200,coverage:{...base.coverage,orders:1000,paid:1000,completed:1000,ongoing:0,payment_covered:1000},items:rows};
 for(const [key,value]of [['sales_base',goods],['expected_repass',payout],['ads_adjustment',ads]])report['known_'+key+'_raw']=report[key+'_raw']=raw(value*1000n);
 report.invoice_tax={...report.invoice_tax,covered_orders:1000,known_base_raw:raw(goods*1000n),known_tax_raw:raw(tax*1000n)};
 report.product_breakdown={...report.product_breakdown,products:rows.map(row=>({item_id:row.item_id,quantity:row.quantity,orders:1,exclusive_orders:1,mixed_orders:0,exclusive_payment_covered:1,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,...Object.fromEntries(['sales_base','expected_repass','ads_adjustment','invoice_tax'].flatMap((key,i)=>[['known_exclusive_'+key+'_raw',raw([goods,payout,ads,tax][i])],['exclusive_'+key+'_raw',raw([goods,payout,ads,tax][i])]])),items:[{model_id:row.model_id,exclusive_quantity:row.quantity,mixed_quantity:0}]}))};
 const records=rows.map((row,i)=>({order_hash:hash('SYNTHETIC_DENSE_'+i),source_hash:hash('SOURCE_DENSE_'+i),checked_at:report.checked_at,bucket:'completed',payment_covered:1,sales_raw:raw(goods),escrow_raw:raw(payout),ads_raw:raw(ads),returns_seen:0,items:JSON.stringify([row])}));assert.ok(projectBusinessPeriodFrame(report));return {report,records};
}

test('the negotiated two-MiB envelope carries a dense legal aggregate while legacy reports retain their one-MiB ceiling',async()=>{
 const {report,records}=denseFixture(),value=await buildBusinessPeriodVariantsFrame(report,records);assert.ok(value.variant_financials);assert.ok(Buffer.byteLength(JSON.stringify(report))<=1048576);assert.ok(Buffer.byteLength(JSON.stringify(value.variant_financials))<=524288);assert.ok(Buffer.byteLength(JSON.stringify(value))>1048576);assert.ok(Buffer.byteLength(JSON.stringify(value))<=2097152);assert.ok(await projectBusinessPeriodVariantsFrame(value));
 assert.deepEqual((await chain(value,{includeVariants:true})).result,value);assert.deepEqual((await chain(report)).result,report);
 const rejected=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async()=>json(value)});assert.deepEqual(rejected,appFailure('BODY_LIMIT'));
});

test('negotiated byte limits remain bounded and body failures, redirects and deadlines do not retry or leak source text',async()=>{
 const {report,records}=fixture(),value=await buildBusinessPeriodVariantsFrame(report,records);
 for(const includeVariants of [false,true]){
  const maximum=includeVariants?2097152:1048576;let calls=0;
  assert.deepEqual(await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{includeVariants,fetchImpl:async()=>{calls++;return new Response('{}',{headers:{'content-type':'application/json','content-length':String(maximum+1)}});}}),appFailure('BODY_LIMIT'));assert.equal(calls,1);
  calls=0;assert.deepEqual(await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{includeVariants,fetchImpl:async()=>{calls++;return new Response(' '.repeat(maximum+1),{headers:{'content-type':'application/json'}});}}),appFailure('BODY_LIMIT'));assert.equal(calls,1);
  assert.deepEqual(await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{includeVariants,fetchImpl:async()=>new Response('PRIVATE',{status:302,headers:{location:'https://private.invalid'}})}),appFailure('REDIRECT_REJECTED',302));
  assert.deepEqual(await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{includeVariants,fetchImpl:async()=>{throw Error('PRIVATE_SECRET');}}),appFailure('NETWORK_ERROR',null));
  let sent;assert.deepEqual(await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{includeVariants,timeoutMs:5,fetchImpl:async req=>{sent=req;return new Promise(()=>{});}}),appFailure('TIMEOUT',null));assert.equal(sent.signal.aborted,true);
  assert.deepEqual(await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{includeVariants,timeoutMs:5,fetchImpl:async()=>new Response(new ReadableStream({start(){}}),{headers:{'content-type':'application/json'}})}),appFailure('TIMEOUT'));
 }
 for(const length of ['2097153','not-an-integer']){const auth=await forwardFinancePaymentSample(request(input,{headers:{[header]:contract}}),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json','content-length':length}})}},{validateInternalApp});assert.equal(auth.status,502);}
});

test('invalid opt-in options are rejected before fetching and getters are not evaluated',async()=>{
 let calls=0,getters=0;const fetchImpl=async()=>{calls++;throw Error('NO_FETCH');};
 for(const includeVariants of [null,0,1,'true',{},[]])assert.deepEqual(await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{includeVariants,fetchImpl}),appFailure('CONFIGURATION',null));
 const options={fetchImpl};Object.defineProperty(options,'includeVariants',{enumerable:true,get(){getters++;return true;}});assert.deepEqual(await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,options),appFailure('CONFIGURATION',null));assert.equal(getters,0);assert.equal(calls,0);
});
