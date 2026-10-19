import {test} from 'node:test';
import assert from 'node:assert/strict';
import {forwardFinanceConnection,forwardFinancePaymentSample} from '../src/auth-router.mjs';
const base='https://auth.brazacommerce.com.br';
const secret='fixture-finance-router-secret-only-12345678';
function configuration(handler){return {FINANCE_ROUTER_SECRET:secret,SHOPEE_FINANCE_SERVICE:{fetch:handler}};}
test('routes and host are confined to the financial prefix',async()=>{
 let calls=0;const env=configuration(()=>{calls++;throw Error('must not reach');});
 for(const path of ['/shopee/connect','/shopee/callback','/shopee/finance/unknown','/internal/shopee/orders/items'])assert.equal((await forwardFinanceConnection(new Request(base+path),env)).status,404);
 assert.equal((await forwardFinanceConnection(new Request('https://other.invalid/shopee/finance/status'),env)).status,404);
 assert.equal((await forwardFinanceConnection(new Request(base+'/shopee/finance/connect',{method:'POST'}),env)).status,405);
 assert.equal(calls,0);
});
test('missing configuration never uses an Ads binding or caller supplied secret',async()=>{
 let calls=0;const req=new Request(base+'/shopee/finance/status',{headers:{'X-Braza-Finance-Router':secret}});
 for(const env of [{},{SHOPEE_FINANCE_SERVICE:{fetch(){calls++;}}},{FINANCE_ROUTER_SECRET:'short',SHOPEE_FINANCE_SERVICE:{fetch(){calls++;}}},{FINANCE_ROUTER_SECRET:secret,GATEWAY_SHARED_SECRET:secret}])assert.equal((await forwardFinanceConnection(req,env)).status,503);
 assert.equal(calls,0);
});
test('service binding receives only its own secret and financial cookie',async()=>{
 const response=await forwardFinanceConnection(new Request(base+'/shopee/finance/callback?code=fixture-code&state=fixture-state&shop_id=1178167501',{headers:{cookie:'mls_session=PRIVATE_ADS; braza_admin=PRIVATE_ADMIN; braza_finance_oauth=fixture-browser','authorization':'Bearer PRIVATE_CALLER','X-Braza-Finance-Router':'attacker'}}),configuration(request=>{
  assert.equal(request.method,'GET');assert.equal(request.headers.get('X-Braza-Finance-Router'),secret);
  assert.equal(request.headers.get('cookie'),'braza_finance_oauth=fixture-browser');assert.equal(request.headers.get('authorization'),null);
  assert.ok(!JSON.stringify([...request.headers]).includes('PRIVATE_'));
  return new Response('connected',{headers:{'content-type':'text/html; charset=utf-8','set-cookie':'braza_finance_oauth=; Path=/shopee/finance; Secure; HttpOnly; Max-Age=0'}});
 }));
 assert.equal(response.status,200);assert.equal(await response.text(),'connected');assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.get('cache-control'),'no-store');
});
test('unavailable service errors do not disclose upstream exception contents',async()=>{
 const response=await forwardFinanceConnection(new Request(base+'/shopee/finance/status'),configuration(()=>{throw Error('PRIVATE_TOKEN_OR_URL');}));
 assert.equal(response.status,502);assert.ok(!(await response.text()).includes('PRIVATE'));
});
test('redirect responses allow official HTTPS destinations and refuse unsafe alternatives',async()=>{
 const run=location=>forwardFinanceConnection(new Request(base+'/shopee/finance/connect'),configuration(()=>new Response(null,{status:302,headers:{location}})));
 for(const target of ['https://open.shopee.com/auth?partner_id=2049333','https://open.shopee.com.br/auth?partner_id=2049333','https://openplatform.shopee.com.br/api/v2/shop/auth_partner?state=fixture',base+'/shopee/finance/status'])assert.equal((await run(target)).status,302);
 for(const target of ['http://open.shopee.com/auth','https://open.shopee.com.attacker.invalid/auth','https://user:password@open.shopee.com/auth','https://open.shopee.com:444/auth','http://open.shopee.com.br/auth','https://open.shopee.com.br.attacker.invalid/auth','https://user:password@open.shopee.com.br/auth','https://open.shopee.com.br:444/auth',base+'/shopee/connect',base+'/shopee/finance/status?token=private','https://open.shopee.com/auth#fragment','https://open.shopee.com.br/auth#fragment'])assert.equal((await run(target)).status,502);
});
test('a backend cannot overwrite other cookies or broaden the cookie domain/path',async()=>{
 for(const cookie of ['mls_session=changed; Path=/shopee/finance','braza_finance_oauth=fixture; Domain=brazacommerce.com.br; Path=/shopee/finance','braza_finance_oauth=fixture; Path=/']){
  const result=await forwardFinanceConnection(new Request(base+'/shopee/finance/status'),configuration(()=>new Response('invalid cookie',{headers:{'set-cookie':cookie}})));
  assert.equal(result.status,502);assert.equal(result.headers.get('set-cookie'),null);
 }
});
test('oversized URL is refused without contacting the service',async()=>{
 let called=false;const result=await forwardFinanceConnection(new Request(base+'/shopee/finance/callback?code='+('x'.repeat(8200))),configuration(()=>{called=true;}));assert.equal(result.status,400);assert.equal(called,false);
});

const samplePath='/internal/shopee/finance/payment-sample';
const previewPath='/internal/shopee/finance/payment-preview';
const previewFrame=(status='AVAILABLE')=>({schema:'finance_payment_preview_v1',status,checked_at:1800000000,token_revision:2,
 currency:'BRL',monetary_unit:'UNCONFIRMED',order_sn:status==='AVAILABLE'?'260101FIXTUREONLY':null,identity_match:status==='AVAILABLE',
 amounts:['escrow_amount','original_cost_of_goods_sold','buyer_total_amount','commission_fee','service_fee','seller_transaction_fee','actual_shipping_fee','ads_escrow_top_up_fee_or_technical_support_fee'].map((name,index)=>({name,value:status==='AVAILABLE'?index+0.25:null})),
 items:status==='AVAILABLE'?[{quantity_purchased:2,original_price:100.5,selling_price:85.25,is_kit:true}]:[],item_count:status==='AVAILABLE'?1:0});
const previewRequest=(body='{}',options={})=>new Request(base+previewPath,{method:'POST',headers:{'content-type':'application/json'},body,...options});
const sampleFrame=()=>({schema_version:1,status:'VALIDATED',checked_at:1800000000,token_revision:2,identity_match:true,fields:[{name:'escrow_amount',type:'number'}],item_fields:[{name:'quantity_purchased',type:'number'}],item_count:1});
const privateRequest=(body='{}',options={})=>new Request(base+samplePath,{method:'POST',headers:{'content-type':'application/json',...options.headers},body,...options});
const authenticated={validateInternalApp:async()=>true};
const jsonReply=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...headers}});

test('Payment action requires the internal App validator before reading input or forwarding',async()=>{
 let calls=0,reads=0;const env=configuration(()=>{calls++;});
 const body=new ReadableStream({pull(){reads++;}});
 const request=new Request(base+samplePath,{method:'POST',headers:{'content-type':'application/json'},body,duplex:'half'});
 // An untrusted body must not be read; its default stream prefetch may run once.
 const response=await forwardFinancePaymentSample(request,env,{validateInternalApp:async()=>false});
 assert.equal(response.status,401);assert.equal(request.bodyUsed,false);assert.equal(calls,0);
 assert.equal((await forwardFinancePaymentSample(privateRequest(),env)).status,401);
 assert.equal((await forwardFinanceConnection(privateRequest(),env)).status,404);
 assert.equal(calls,0);await request.body.cancel();
});

test('Payment route rejects host, path, method, query and invalid empty-body contracts with no service request',async()=>{
 let calls=0;const env=configuration(()=>{calls++;});
 for(const target of ['https://other.invalid'+samplePath,base+samplePath+'/',base+'/shopee/finance/payment-sample']){
  assert.equal((await forwardFinancePaymentSample(new Request(target,{method:'POST',body:'{}',headers:{'content-type':'application/json'}}),env,authenticated)).status,404);
 }
 assert.equal((await forwardFinancePaymentSample(new Request(base+samplePath),env,authenticated)).status,405);
 assert.equal((await forwardFinancePaymentSample(new Request(base+samplePath+'?order_sn=PRIVATE_ORDER',{method:'POST',body:'{}',headers:{'content-type':'application/json'}}),env,authenticated)).status,400);
 for(const body of ['', 'null','[]','{"order_sn":"PRIVATE_ORDER"}','{"shop_id":1178167501}','{',' '.repeat(129)+'{}'])assert.equal((await forwardFinancePaymentSample(privateRequest(body),env,authenticated)).status,400);
 for(const headers of [{'content-type':'text/plain'},{'content-type':'application/json','content-length':'129'},{'content-type':'application/json','content-length':'NaN'}])assert.equal((await forwardFinancePaymentSample(new Request(base+samplePath,{method:'POST',body:'{}',headers}),env,authenticated)).status,400);
 assert.equal(calls,0);
});

test('Payment forwarding injects its own router credential and strips caller credentials and cookies',async()=>{
 const response=await forwardFinancePaymentSample(new Request(base+samplePath,{method:'POST',body:'{}',headers:{'content-type':'application/json','X-Braza-App-Key':'PRIVATE_APP_KEY','X-Braza-Finance-Router':'PRIVATE_ATTACKER',authorization:'Bearer PRIVATE_TOKEN',cookie:'braza_admin=PRIVATE_ADMIN'}}),configuration(async request=>{
  assert.equal(request.url,base+samplePath);assert.equal(request.method,'POST');assert.equal(request.redirect,'manual');assert.equal(await request.text(),'{}');
  assert.equal(request.headers.get('x-braza-finance-router'),secret);
  for(const header of ['cookie','authorization','x-braza-app-key'])assert.equal(request.headers.get(header),null);
  assert.ok(!JSON.stringify([...request.headers]).includes('PRIVATE_'));
  return jsonReply(sampleFrame(),200,{'set-cookie':'session=PRIVATE_COOKIE','location':'https://evil.invalid/PRIVATE_REDIRECT'});
 }),authenticated);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),sampleFrame());
 for(const header of ['set-cookie','location'])assert.equal(response.headers.get(header),null);
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('referrer-policy'),'no-referrer');
});

test('Payment response is independently projected and refuses identifiers, unknown fields and unexpected schemas',async()=>{
 const empty={schema_version:1,status:'EMPTY',checked_at:1800000000,token_revision:1,fields:[],item_fields:[],item_count:0};
 const success=await forwardFinancePaymentSample(privateRequest(),configuration(()=>jsonReply(empty)),authenticated);
 assert.equal(success.status,200);assert.deepEqual(await success.json(),empty);
 const invalid=[
  {...sampleFrame(),order_sn:'PRIVATE_ORDER'}, {...sampleFrame(),fields:[{name:'buyer_user_name',type:'string'}]},
  {...sampleFrame(),fields:[{name:'escrow_amount',type:'PRIVATE_TOKEN'}]}, {...sampleFrame(),fields:[{name:'escrow_amount',type:'number',value:100}]},
  {...sampleFrame(),item_count:1001},{...sampleFrame(),identity_match:false},{...sampleFrame(),token_revision:0},
  {...sampleFrame(),checked_at:'1800000000'},{...sampleFrame(),fields:[{name:'items',type:'array'},{name:'items',type:'array'}]},
  {...empty,identity_match:true},{...empty,item_count:1},
 ];
 for(const value of invalid){const response=await forwardFinancePaymentSample(privateRequest(),configuration(()=>jsonReply(value)),authenticated);assert.equal(response.status,502);assert.ok(!(await response.text()).includes('PRIVATE'));}
});

test('Payment errors expose only finite diagnostics and refuse redirect, HTML, malformed and oversized responses',async()=>{
 const error={error:'FINANCE_SAMPLE_UNAVAILABLE',diagnostic:{code:'FINANCE_SAMPLE_PAYMENT_API_PERMISSION_REJECTED',http:403},message:'PRIVATE_ERROR',access_token:'PRIVATE_ACCESS'};
 const response=await forwardFinancePaymentSample(privateRequest(),configuration(()=>jsonReply(error,502)),authenticated);
 assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:'FINANCE_SAMPLE_UNAVAILABLE',diagnostic:{code:error.diagnostic.code,http:403}});
 const bad=[
  ()=>jsonReply({error:'FINANCE_SAMPLE_UNAVAILABLE',diagnostic:{code:'PRIVATE_ERROR',http:'PRIVATE_ORDER'}},403),
  ()=>new Response(null,{status:302,headers:{location:'https://evil.invalid/PRIVATE_REDIRECT'}}),
  ()=>new Response('PRIVATE_HTML',{headers:{'content-type':'text/html'}}),
  ()=>new Response('{PRIVATE_JSON',{headers:{'content-type':'application/json'}}),
  ()=>new Response('x'.repeat(65537),{headers:{'content-type':'application/json'}}),
  ()=>jsonReply(sampleFrame(),200,{'content-length':'65537'}),
  ()=>{throw Error('PRIVATE_TOKEN_OR_URL');},
 ];
 for(const handler of bad){const result=await forwardFinancePaymentSample(privateRequest(),configuration(handler),authenticated);assert.ok([403,502].includes(result.status));assert.ok(!(await result.text()).includes('PRIVATE'));}
});

test('Payment service timeout aborts its signal without retrying',async()=>{
 const original=setTimeout;let calls=0,signal;
 globalThis.setTimeout=(callback,delay,...args)=>original(callback,delay===45000?5:delay,...args);
 try{
  const response=await forwardFinancePaymentSample(privateRequest(),configuration(request=>{calls++;signal=request.signal;return new Promise(()=>{});}),authenticated);
  assert.equal(response.status,502);assert.equal(calls,1);assert.equal(signal.aborted,true);
 }finally{globalThis.setTimeout=original;}
});

test('Payment service response arriving after the deadline has its stalled body canceled',async()=>{
 const original=setTimeout;let resolveFetch,canceled=0,calls=0,signal;
 globalThis.setTimeout=(callback,delay,...args)=>original(callback,delay===45000?5:delay,...args);
 try{
  const response=await forwardFinancePaymentSample(privateRequest(),configuration(request=>{
   calls++;signal=request.signal;return new Promise(resolve=>{resolveFetch=resolve;});
  }),authenticated);
  assert.equal(response.status,502);assert.equal(signal.aborted,true);assert.equal(calls,1);
  const lateBody=new ReadableStream({pull(){},cancel(){canceled++;}});
  resolveFetch(new Response(lateBody,{headers:{'content-type':'application/json'}}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(canceled,1);assert.equal(lateBody.locked,false);
  assert.deepEqual(await response.json(),{error:'FINANCE_SAMPLE_UNAVAILABLE',diagnostic:{code:'FINANCE_SAMPLE_UNAVAILABLE',http:null}});
 }finally{globalThis.setTimeout=original;}
});

test('private Payment preview requires App authentication and exact empty JSON without opening a public OAuth path',async()=>{
 let calls=0;const env=configuration(()=>{calls++;return jsonReply(previewFrame());});
 const denied=previewRequest();assert.equal((await forwardFinancePaymentSample(denied,env,{validateInternalApp:async()=>false})).status,401);assert.equal(denied.bodyUsed,false);
 assert.equal((await forwardFinanceConnection(previewRequest(),env)).status,404);
 for(const [url,status,options] of [[base+previewPath+'/',404,{}],[base+'/shopee/finance/payment-preview',404,{}],['https://evil.invalid'+previewPath,404,{}],[base+previewPath+'?order_sn=PRIVATE_SERIAL',400,{}],[base+previewPath,405,{method:'GET'}]]){
  const request=new Request(url,{method:'POST',body:'{}',headers:{'content-type':'application/json'},...options,...(options.method==='GET'?{body:undefined}:{})});
  assert.equal((await forwardFinancePaymentSample(request,env,authenticated)).status,status);
 }
 for(const body of ['null','[]','{"order_sn":"PRIVATE_SERIAL"}','{"value":1}',' '.repeat(129)+'{}'])assert.equal((await forwardFinancePaymentSample(previewRequest(body),env,authenticated)).status,400);
 assert.equal(calls,0);
});

test('private Payment preview preserves only validated preview values and serial after stripping caller credentials',async()=>{
 for(const status of ['AVAILABLE','EMPTY']){
  const frame=previewFrame(status);
  const request=previewRequest('{}',{headers:{'content-type':'application/json',cookie:'braza_admin=PRIVATE_ADMIN',authorization:'Bearer PRIVATE_ACCESS','x-braza-app-key':'PRIVATE_APP','x-braza-finance-router':'PRIVATE_CALLER_ROUTER'}});
  const response=await forwardFinancePaymentSample(request,configuration(async forwarded=>{
   assert.equal(forwarded.url,base+previewPath);assert.equal(forwarded.method,'POST');assert.equal(forwarded.redirect,'manual');assert.equal(await forwarded.text(),'{}');
   assert.equal(forwarded.headers.get('x-braza-finance-router'),secret);
   for(const header of ['cookie','authorization','x-braza-app-key'])assert.equal(forwarded.headers.get(header),null);
   return jsonReply(frame,200,{'set-cookie':'session=PRIVATE_COOKIE','location':'https://evil.invalid/PRIVATE_REDIRECT'});
  }),authenticated);
  assert.equal(response.status,200);assert.deepEqual(await response.json(),frame);
  assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('cache-control'),'no-store');
 }
});

test('preview and metadata cannot be confused and malformed private values never reach a response',async()=>{
 const invalid=[sampleFrame(),{...previewFrame(),buyer_user_name:'PRIVATE_BUYER'},{...previewFrame(),access_token:'PRIVATE_TOKEN'},
  {...previewFrame(),amounts:[...previewFrame().amounts,{name:'PRIVATE_FIELD',value:1}]},{...previewFrame(),currency:'USD'},
  {...previewFrame(),items:[{quantity_purchased:2,original_price:1,selling_price:1,is_kit:true,item_id:'PRIVATE_ITEM'}]}];
 for(const value of invalid){const response=await forwardFinancePaymentSample(previewRequest(),configuration(()=>jsonReply(value)),authenticated);assert.equal(response.status,502);const raw=await response.text();assert.ok(!raw.includes('PRIVATE'));assert.ok(!raw.includes('260101FIXTUREONLY'));assert.equal(JSON.parse(raw).diagnostic.code,'FINANCE_SAMPLE_PREVIEW_RESPONSE_INVALID');}
 const metadata=await forwardFinancePaymentSample(privateRequest(),configuration(()=>jsonReply(previewFrame())),authenticated);assert.equal(metadata.status,502);assert.ok(!(await metadata.text()).includes('260101FIXTUREONLY'));
 const operational=await forwardFinancePaymentSample(previewRequest(),configuration(()=>jsonReply({error:'FINANCE_SAMPLE_UNAVAILABLE',diagnostic:{code:'FINANCE_SAMPLE_PREVIEW_RESPONSE_INVALID',http:200},order_sn:'PRIVATE_SERIAL',buyer_user_name:'PRIVATE_BUYER'},502)),authenticated);
 assert.deepEqual(await operational.json(),{error:'FINANCE_SAMPLE_UNAVAILABLE',diagnostic:{code:'FINANCE_SAMPLE_PREVIEW_RESPONSE_INVALID',http:200}});
});

test('late private preview response is canceled after deadline without reading or leaking its values',async()=>{
 const original=setTimeout;let resolveFetch,canceled=0,calls=0;
 globalThis.setTimeout=(callback,delay,...args)=>original(callback,delay===45000?5:delay,...args);
 try{
  const response=await forwardFinancePaymentSample(previewRequest(),configuration(()=>{calls++;return new Promise(resolve=>{resolveFetch=resolve;});}),authenticated);
  assert.equal(response.status,502);
  const body=new ReadableStream({pull(){},cancel(){canceled++;}});resolveFetch(new Response(body,{headers:{'content-type':'application/json'}}));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(canceled,1);assert.equal(body.locked,false);assert.equal(calls,1);
  assert.ok(!(await response.text()).includes('260101FIXTUREONLY'));
 }finally{globalThis.setTimeout=original;}
});
