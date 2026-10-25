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

function productSource(){
 const value=source();
 value.coverage={orders:5,paid:3,completed:2,ongoing:1,cancelled:1,cancel_pending:0,unpaid:1,other:0,unknown:0,payment_covered:2,payment_missing:1,returns:0,returns_unknown:1};
 Object.assign(value,{known_sales_base_raw:'150',known_expected_repass_raw:'105',known_ads_adjustment_raw:'5',invoice_tax:{...value.invoice_tax,covered_orders:2,known_base_raw:'150',known_tax_raw:'3'},items:[{item_id:'201',model_id:'0',quantity:3},{item_id:'202',model_id:'10',quantity:2},{item_id:'202',model_id:'11',quantity:1}]});
 const product=(item_id,covered,items)=>({item_id,quantity:3,orders:2,exclusive_orders:1,mixed_orders:1,exclusive_payment_covered:covered,exclusive_payment_missing:1-covered,exclusive_returns:0,exclusive_returns_unknown:1-covered,...Object.fromEntries(['sales_base','expected_repass','ads_adjustment','invoice_tax'].flatMap((name,index)=>{const raw=covered?['100','80','3','2'][index]:'0';return [['known_exclusive_'+name+'_raw',raw],['exclusive_'+name+'_raw',covered?raw:null]];})),items});
 value.product_breakdown={schema:'business_product_breakdown_v1',mixed_orders:1,mixed_payment_covered:1,mixed_payment_missing:0,known_mixed_sales_base_raw:'50',known_mixed_expected_repass_raw:'25',known_mixed_ads_adjustment_raw:'2',known_mixed_invoice_tax_raw:'1',products:[
  product('201',1,[{model_id:'0',exclusive_quantity:2,mixed_quantity:1}]),
  product('202',0,[{model_id:'10',exclusive_quantity:0,mixed_quantity:2},{model_id:'11',exclusive_quantity:1,mixed_quantity:0}]),
 ]};
 assert.ok(projectBusinessPeriodFrame(value),'the private product fixture must satisfy source conservation');
 return value;
}

async function crossPrivateChain(value){
 let capabilityCalls=0,serviceCalls=0,providerCalls=0;
 const finance=createFinanceWorker({businessPeriod:async()=>{capabilityCalls++;return value;},fetchImpl:async()=>{providerCalls++;throw Error('UNEXPECTED_PROVIDER_READ');}});
 const result=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async req=>forwardFinancePaymentSample(req,{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async upstream=>{
  serviceCalls++;assert.equal(upstream.headers.get('x-braza-finance-router'),router);assert.equal(upstream.headers.get('x-braza-app-key'),null);assert.equal(upstream.headers.get('cookie'),null);
  return finance.fetch(upstream,{FINANCE_CONNECTION_ENABLED:'true',FINANCE_ROUTER_SECRET:router});
 }}},{validateInternalApp})});
 assert.equal(capabilityCalls,1);assert.equal(serviceCalls,1);assert.equal(providerCalls,0);
 return result;
}

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

test('the optional product sidecar crosses all three private boundaries with exclusive and unallocated mixed values intact',async()=>{
 const value=productSource(),result=await crossPrivateChain(value);
 assert.deepEqual(result,value);
 assert.equal(result.product_breakdown.known_mixed_expected_repass_raw,'25');
 assert.equal(result.product_breakdown.products[0].exclusive_expected_repass_raw,'80');
 assert.equal(result.product_breakdown.products[0].items[0].mixed_quantity,1);
 assert.equal(result.product_breakdown.products[1].exclusive_expected_repass_raw,null);
 assert.equal(result.product_breakdown.products[1].items[1].exclusive_quantity,1);
 assert.equal(result.coverage.cancelled,1);assert.equal(result.coverage.unpaid,1);
 assert.doesNotMatch(JSON.stringify(result),/order_sn|access_token|refresh_token|sku|PRIVATE/);
});

test('observation times cross App, Auth and Finance unchanged and forged intervals fail at every boundary',async()=>{
 const value={...productSource(),checked_at:1792401200,source_checked_at:{oldest_at:1792400001,latest_at:1792401200}},result=await crossPrivateChain(value);
 assert.deepEqual(result.source_checked_at,value.source_checked_at);
 for(const source_checked_at of [{oldest_at:1792399999,latest_at:1792401200},{oldest_at:1792401200,latest_at:1792400001},{oldest_at:1792400001,latest_at:1792401201}]){
  const forged={...value,source_checked_at};assert.equal(projectBusinessPeriodFrame(forged),null);
  const app=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async()=>Response.json(forged)});assert.equal(app.status,'UNAVAILABLE');
  const auth=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>Response.json(forged)}},{validateInternalApp});assert.equal(auth.status,502);
  const finance=createFinanceWorker({businessPeriod:async()=>forged,fetchImpl:async()=>{throw Error('UNEXPECTED_PROVIDER_READ');}}),rejected=await finance.fetch(request(input,{headers:{'x-braza-finance-router':router}}),{FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'});assert.equal(rejected.status,502);
 }
});

test('every private boundary rejects forged product conservation, identities, completeness and private extras',async()=>{
 const mutations=[
  value=>value.product_breakdown.known_mixed_expected_repass_raw='26',
  value=>value.product_breakdown.products[0].known_exclusive_sales_base_raw='101',
  value=>value.product_breakdown.products[0].item_id='999',
  value=>value.product_breakdown.products[0].items[0].model_id='999',
  value=>value.product_breakdown.products[0].items[0].exclusive_quantity++,
  value=>value.product_breakdown.products[1].exclusive_expected_repass_raw='0',
  value=>value.product_breakdown.products[0].exclusive_returns_unknown++,
  value=>value.product_breakdown.products.push(structuredClone(value.product_breakdown.products[0])),
  value=>value.product_breakdown.access_token='PRIVATE_TOKEN',
  value=>value.product_breakdown.products[0].order_sn='PRIVATE_ORDER',
  value=>value.product_breakdown.products[0].items[0].sku='PRIVATE_SKU',
 ];
 for(const mutate of mutations){
  const value=productSource();mutate(value);
  assert.equal(projectBusinessPeriodFrame(value),null);
  const app=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async()=>Response.json(value)});
  assert.equal(app.status,'UNAVAILABLE');assert.doesNotMatch(JSON.stringify(app),/PRIVATE/);
  const auth=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>Response.json(value)}},{validateInternalApp});
  assert.equal(auth.status,502);assert.doesNotMatch(await auth.text(),/PRIVATE/);
  const finance=createFinanceWorker({businessPeriod:async()=>value,fetchImpl:async()=>{throw Error('UNEXPECTED_PROVIDER_READ');}});
  const rejected=await finance.fetch(request(input,{headers:{'x-braza-finance-router':router}}),{FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'});
  assert.equal(rejected.status,502);assert.doesNotMatch(await rejected.text(),/PRIVATE/);
 }
});

function maximumProductSource(){
 const value=source(),raw=cents=>{const sign=cents<0n?'-':'';if(cents<0n)cents=-cents;return sign+(cents/100n).toString()+(cents%100n?'.'+(cents%100n).toString().padStart(2,'0').replace(/0$/,''):'');};
 const goods=99999999999999n,payout=-goods,adjustment=-goods,tax=(goods*200n+5000n)/10000n;
 value.pages_read=200;
 value.coverage={orders:1000,paid:1000,completed:1000,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1000,payment_missing:0,returns:0,returns_unknown:0};
 for(const [field,amount] of [['sales_base',goods],['expected_repass',payout],['ads_adjustment',adjustment]]){value['known_'+field+'_raw']=raw(amount*1000n);value[field+'_raw']=raw(amount*1000n);}
 value.invoice_tax={...value.invoice_tax,covered_orders:1000,unavailable_orders:0,known_base_raw:raw(goods*1000n),known_tax_raw:raw(tax*1000n)};
 value.items=Array.from({length:1000},(_,index)=>({item_id:(10000000000000000000n+BigInt(index)).toString(),model_id:'99999999999999999999',quantity:1000000000000}));
 value.product_breakdown={schema:'business_product_breakdown_v1',mixed_orders:0,mixed_payment_covered:0,mixed_payment_missing:0,known_mixed_sales_base_raw:'0',known_mixed_expected_repass_raw:'0',known_mixed_ads_adjustment_raw:'0',known_mixed_invoice_tax_raw:'0',products:value.items.map(item=>({
  item_id:item.item_id,quantity:item.quantity,orders:1,exclusive_orders:1,mixed_orders:0,exclusive_payment_covered:1,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,
  ...Object.fromEntries(['sales_base','expected_repass','ads_adjustment','invoice_tax'].flatMap((name,index)=>{const amount=raw([goods,payout,adjustment,tax][index]);return [['known_exclusive_'+name+'_raw',amount],['exclusive_'+name+'_raw',amount]];})),
  items:[{model_id:item.model_id,exclusive_quantity:item.quantity,mixed_quantity:0}],
 }))};return value;
}

test('one thousand products with long canonical identities and maximal row amounts fit the bounded private transport',async()=>{
 const value=maximumProductSource(),projected=projectBusinessPeriodFrame(value);
 assert.ok(projected,'the maximum fixture must satisfy the strict production frame');
 const bytes=new TextEncoder().encode(JSON.stringify(projected)).byteLength;
 assert.ok(bytes>524288,'this population must exercise the dedicated larger business response');
 assert.ok(bytes<=1048576,'the maximum legal product population must fit the fixed private response cap');
 const result=await crossPrivateChain(projected);
 assert.deepEqual(result,projected);assert.equal(result.product_breakdown.products.length,1000);assert.equal(result.items.length,1000);
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
 for(const fixture of [source,productSource])for(const poison of [v=>v.start_date='2026-10-02',v=>v.run_id='22222222-2222-4222-8222-222222222222',v=>v.access_token='PRIVATE_TOKEN']){
  const value=fixture();poison(value);const selected=value.start_date!==input.start_date?input:read;
  const app=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},selected,{fetchImpl:async()=>Response.json(value)});assert.equal(app.status,'UNAVAILABLE');assert.ok(!JSON.stringify(app).includes('PRIVATE_TOKEN'));
  const auth=await forwardFinancePaymentSample(request(selected),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>Response.json(value)}},{validateInternalApp});assert.ok(auth.status>=400);assert.ok(!(await auth.text()).includes('PRIVATE_TOKEN'));
  const finance=createFinanceWorker({businessPeriod:async()=>value,fetchImpl:async()=>{throw Error('UNEXPECTED');}});
  const rejected=await finance.fetch(request(selected,{headers:{'x-braza-finance-router':router}}),{FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'});assert.ok(rejected.status>=400);assert.ok(!(await rejected.text()).includes('PRIVATE_TOKEN'));
 }
});

test('bounded App transport rejects failed or oversized source bodies, aborts a late read and never retries',async()=>{
 for(const response of [new Response('PRIVATE',{status:403}),new Response('PRIVATE',{headers:{'content-type':'text/html'}}),new Response('{}',{headers:{'content-type':'application/json','content-length':'1048577'}})]){
  const result=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async()=>response});assert.equal(result.status,'UNAVAILABLE');assert.ok(!JSON.stringify(result).includes('PRIVATE'));
 }
 let calls=0,req;const result=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{timeoutMs:5,fetchImpl:async value=>{req=value;calls++;return new Promise(()=>{});}});assert.equal(result.status,'UNAVAILABLE');assert.equal(calls,1);assert.equal(req.signal.aborted,true);
});

test('business response accepts exactly one MiB and rejects the next declared or streamed byte at App and Auth',async()=>{
 const value=productSource(),serialized=JSON.stringify(value),cap=1048576;
 const response=(size,{declared=true,stream=false}={})=>{
  const body=serialized+' '.repeat(size-serialized.length),headers={'content-type':'application/json'};
  if(declared)headers['content-length']=String(size);
  if(!stream)return new Response(body,{headers});
  const bytes=new TextEncoder().encode(body);let offset=0;
  return new Response(new ReadableStream({pull(controller){if(offset===bytes.length){controller.close();return;}const next=Math.min(bytes.length,offset+65536);controller.enqueue(bytes.subarray(offset,next));offset=next;}}),{headers});
 };
 for(const options of [{},{declared:false,stream:true}]){
  const app=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async()=>response(cap,options)});assert.deepEqual(app,value);
  const auth=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>response(cap,options)}},{validateInternalApp});assert.equal(auth.status,200);assert.deepEqual(await auth.json(),value);
  const appRejected=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async()=>response(cap+1,options)});assert.equal(appRejected.status,'UNAVAILABLE');
  const authRejected=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>response(cap+1,options)}},{validateInternalApp});assert.equal(authRejected.status,502);
 }
});
