import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {runFinanceProductionOrders} from '../src/production-orders.mjs';
import {projectProductionOrdersRequest,projectProductionOrdersFrame} from '../src/production-orders-frame.mjs';
import {createFinanceWorker} from '../src/connection-worker.mjs';
import {forwardFinancePaymentSample} from '../src/auth-router.mjs';
import {getFinanceProductionOrders} from '../../cloudflare/src/app-production-orders.mjs';

const clock=Date.UTC(2026,9,24,12),now=()=>clock,stamp=clock/1000;
const input={operation:'scan',start_date:'2026-10-24',end_date:'2026-10-24'},origin='https://auth.brazacommerce.com.br',path='/internal/shopee/finance/production-orders',secret='production-router-'+'x'.repeat(40),key='fixture-partner-key',access='fixture-access-token';
const row=(id='ORDER1',status='READY_TO_SHIP')=>({order_sn:id,order_status:status,create_time:stamp-3600,update_time:stamp-2,item_list:[{item_id:101,model_id:1,model_quantity_purchased:2,model_sku:'estrela-28',model_name:'Verde, P',item_name:'PRIVATE_TITLE',buyer_username:'PRIVATE_BUYER'}],recipient_address:{name:'PRIVATE_BUYER'},buyer_user_id:99});
const validFrame=(changes={})=>({schema:'production_orders_v1',shop_id:1178167501,checked_at:stamp,start_date:'2026-10-24',end_date:'2026-10-24',complete:true,orders:[{order_id:'ORDER1',status:'READY_TO_SHIP',create_time:stamp-3600,update_time:stamp-2,lines:[{line_key:'101:1',item_id:'101',model_id:'1',sku:'estrela-28',quantity:2,model_name:'Verde, P'}]}],...changes});
async function fixture(rows=[row()]){
 const env={FINANCE_DB:new D1(),FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,29).toString('base64'),FINANCE_CONNECTION_ENABLED:'true',SHOPEE_FINANCE_PARTNER_KEY:key};
 const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:access,refresh_token:'fixture-refresh-token',expires_at:stamp+600});
 const calls=[],pages=[rows.map(value=>({order_sn:value.order_sn}))];let mutate=null;
 const fetchImpl=async request=>{calls.push(request);const url=new URL(request.url);let response;
  if(url.pathname.endsWith('/get_order_list')){const index=Number(url.searchParams.get('cursor')||0);response={order_list:pages[index],more:index<pages.length-1,next_cursor:index<pages.length-1?String(index+1):''};}
  else{assert.ok(url.pathname.endsWith('/get_order_detail'));response={order_list:url.searchParams.get('order_sn_list').split(',').map(id=>rows.find(value=>value.order_sn===id))};}
  let envelope={error:'',response,shop_id:1178167501};if(mutate)envelope=mutate(envelope,url)||envelope;return Response.json(envelope);
 };
 return {env,store,rows,calls,pages,fetchImpl,run:(body=input)=>runFinanceProductionOrders(env,{...body,fetchImpl,now}),mutate:value=>{mutate=value;}};
}

test('production contracts are exact detached views and refuse unknown fields, duplicate identities and getters without invoking them',()=>{
 assert.deepEqual(projectProductionOrdersRequest(input),input);assert.deepEqual(projectProductionOrdersFrame(validFrame()),validFrame());
 const verify={operation:'verify',order_ids:['ORDER1']};assert.deepEqual(projectProductionOrdersRequest(verify),verify);
 for(const value of [{...input,shop_id:1},{...input,end_date:'2026-11-08'},{...input,start_date:'2026-02-30'},{...verify,order_ids:[]},{...verify,order_ids:['ORDER1','ORDER1']},{...verify,order_ids:['BAD,ORDER']},{...verify,order_ids:Array.from({length:51},(_,i)=>'ORDER'+i)}])assert.equal(projectProductionOrdersRequest(value),null);
 for(const value of [{...validFrame(),token:'PRIVATE'},{...validFrame(),complete:false},{...validFrame(),shop_id:1},{...validFrame(),orders:[...validFrame().orders,...validFrame().orders]}])assert.equal(projectProductionOrdersFrame(value),null);
 const duplicate=validFrame();duplicate.orders[0].lines.push({...duplicate.orders[0].lines[0]});assert.equal(projectProductionOrdersFrame(duplicate),null);
 let getters=0;const bad={...input};Object.defineProperty(bad,'operation',{get(){getters++;return 'scan';}});assert.equal(projectProductionOrdersRequest(bad),null);assert.equal(getters,0);
 const badFrame=validFrame();Object.defineProperty(badFrame.orders[0],'lines',{get(){getters++;return [];}});assert.equal(projectProductionOrdersFrame(badFrame),null);assert.equal(getters,0);
 const detached=projectProductionOrdersFrame(validFrame());detached.orders[0].lines[0].sku='changed';assert.equal(validFrame().orders[0].lines[0].sku,'estrela-28');
});

test('fresh production collection signs only the two fixed Global reads and retains exact SKU, quantities and stable line identity',async()=>{
 const f=await fixture(),before=await f.store.readTokens(),result=await f.run();assert.deepEqual(result,validFrame());assert.equal(f.calls.length,2);assert.deepEqual(await f.store.readTokens(),before);
 const raw=JSON.stringify(result);for(const value of ['PRIVATE_TITLE','PRIVATE_BUYER',key,access,'fixture-refresh-token'])assert.equal(raw.includes(value),false);
 for(const request of f.calls){const url=new URL(request.url),timestamp=url.searchParams.get('timestamp');assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(request.method,'GET');assert.equal(request.redirect,'manual');assert.equal(url.searchParams.get('shop_id'),'1178167501');assert.equal(url.searchParams.get('partner_id'),'2049333');assert.equal(url.searchParams.get('sign'),createHmac('sha256',key).update('2049333'+url.pathname+timestamp+access+'1178167501').digest('hex'));assert.equal(request.headers.has('cookie'),false);assert.equal(request.headers.has('authorization'),false);}
 const list=new URL(f.calls[0].url),detail=new URL(f.calls[1].url);assert.equal(list.searchParams.get('time_range_field'),'create_time');assert.equal(Number(list.searchParams.get('time_from')),Date.parse('2026-10-24T03:00:00Z')/1000);assert.equal(Number(list.searchParams.get('time_to')),stamp);assert.equal(list.searchParams.get('order_status'),null);assert.equal(detail.searchParams.get('response_optional_fields'),'item_list');
 f.env.FINANCE_DB.db.close();
});

test('verify makes a new detail read and returns current cancellations, including omitted lines, instead of reusing a paid scan',async()=>{
 const f=await fixture();assert.equal((await f.run()).orders[0].status,'READY_TO_SHIP');f.rows[0].order_status='CANCELLED';delete f.rows[0].item_list;
 const result=await f.run({operation:'verify',order_ids:['ORDER1']});assert.equal(result.orders[0].status,'CANCELLED');assert.deepEqual(result.orders[0].lines,[]);assert.equal(result.start_date,null);assert.equal(result.end_date,null);assert.equal(f.calls.length,3);assert.equal(new URL(f.calls[2].url).pathname,'/api/v2/order/get_order_detail');
 f.env.FINANCE_DB.db.close();
});

test('single products alone may use item SKU, missing SKU stays empty and unknown statuses cannot become print eligibility',async()=>{
 const f=await fixture([row('ONE'),row('TWO','FUTURE_STATUS'),row('THREE')]);
 f.rows[0].item_list[0]={item_id:101,model_id:0,model_quantity_purchased:1,item_sku:'estrela-20'};
 f.rows[1].item_list[0].model_sku='';f.rows[1].item_list[0].item_sku='MUST_NOT_BORROW';delete f.rows[2].item_list[0].model_sku;
 const result=await f.run();assert.equal(result.orders[0].lines[0].sku,'estrela-20');assert.equal(result.orders[1].status,'UNKNOWN');assert.equal(result.orders[1].lines[0].sku,'');assert.equal(result.orders[2].lines[0].sku,'');
 f.env.FINANCE_DB.db.close();
});

test('mismatched identities, duplicate tuples, missing orders and malformed quantities never return a partial production frame',async()=>{
 for(const change of [value=>{value.response.order_list=[];},value=>{value.response.order_list[0]={...row(),order_sn:'FOREIGN'};},value=>{value.response.order_list[0]={...row(),shop_id:1};},value=>{value.response.order_list[0]={...row(),item_list:[row().item_list[0],row().item_list[0]]};},value=>{value.response.order_list[0]={...row(),item_list:[{...row().item_list[0],model_quantity_purchased:0}]};},value=>{value.response.order_list[0]={...row(),create_time:stamp-200000};}]){
  const f=await fixture();f.mutate((value,url)=>{if(url.pathname.endsWith('/get_order_detail'))change(value);});await assert.rejects(f.run());f.env.FINANCE_DB.db.close();
 }
});

test('pagination deduplicates order numbers before detail reads, bounded scans fail at the page limit and future scans perform no provider reads',async()=>{
 const f=await fixture([row('ONE'),row('TWO')]);f.pages.splice(0,1,[{order_sn:'ONE'}],[{order_sn:'ONE'},{order_sn:'TWO'}]);const value=await f.run();assert.equal(value.orders.length,2);assert.equal(f.calls.length,3);
 const before=f.calls.length;await assert.rejects(f.run({...input,end_date:'2026-10-25'}));assert.equal(f.calls.length,before);f.env.FINANCE_DB.db.close();
 const full=await fixture();full.pages.splice(0,1,...Array.from({length:11},()=>[{order_sn:'ORDER1'}]));await assert.rejects(full.run(),error=>error.code==='FINANCE_PRODUCTION_PAGE_LIMIT');assert.equal(full.calls.length,10);full.env.FINANCE_DB.db.close();
});

test('a bounded detailed order response larger than the legacy 64 KiB projects line metadata without leaking the extra raw fields',async()=>{
 const f=await fixture();f.rows[0].unused_provider_metadata='PRIVATE'.repeat(15000);
 const frame=await f.run();assert.deepEqual(frame,validFrame());assert.equal(JSON.stringify(frame).includes('PRIVATE'),false);
 f.rows[0].unused_provider_metadata='PRIVATE'.repeat(160000);await assert.rejects(f.run(),error=>error.code==='FINANCE_PRODUCTION_UPSTREAM_BODY_TOO_LARGE');f.env.FINANCE_DB.db.close();
});

test('private App Auth Finance chain independently validates exact request scope and preserves only dedicated credentials',async()=>{
 const frame=validFrame(),worker=createFinanceWorker({productionOrders:async(_,options)=>{assert.equal(options.operation,'scan');assert.equal(options.start_date,input.start_date);return frame;},fetchImpl:async()=>{},now});let serviceCalls=0;
 const env={FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'true',SHOPEE_FINANCE_SERVICE:{fetch:request=>{serviceCalls++;assert.equal(request.headers.get('X-Braza-Finance-Router'),secret);assert.equal(request.headers.has('cookie'),false);assert.equal(request.headers.has('X-Braza-App-Key'),false);return worker.fetch(request,{FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'true'});}}};
 const result=await getFinanceProductionOrders({APP_INTERNAL_SECRET:'private-app'},input,{fetchImpl:request=>{assert.equal(request.headers.get('X-Braza-App-Key'),'private-app');assert.equal(request.url,origin+path);return forwardFinancePaymentSample(request,env,{validateInternalApp:async()=>true});}});assert.deepEqual(result,frame);assert.equal(serviceCalls,1);
 const request=(value=input)=>new Request(origin+path,{method:'POST',headers:{'content-type':'application/json','X-Braza-Finance-Router':secret},body:JSON.stringify(value)});
 assert.equal((await forwardFinancePaymentSample(request(),env,{validateInternalApp:async()=>false})).status,401);
 for(const invalid of [{...input,token:'PRIVATE'},null,{operation:'verify',order_ids:['A','A']}]){assert.equal((await forwardFinancePaymentSample(request(invalid),env,{validateInternalApp:async()=>true})).status,400);assert.equal((await worker.fetch(request(invalid),env)).status,400);}
 const changed=await getFinanceProductionOrders({APP_INTERNAL_SECRET:'private-app'},{operation:'verify',order_ids:['OTHER']},{fetchImpl:async()=>Response.json(validFrame({start_date:null,end_date:null}))});assert.equal(changed.status,'UNAVAILABLE');assert.equal(serviceCalls,1);
});

test('default Finance capability is disabled and source errors, extras, late responses and invalid body types never expose a usable production list',async()=>{
 const req=new Request(origin+path,{method:'POST',headers:{'content-type':'application/json','X-Braza-Finance-Router':secret},body:JSON.stringify(input)}),env={FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'true'};
 assert.equal((await createFinanceWorker().fetch(req,env)).status,503);
 for(const response of [Response.json({...validFrame(),private:'BUYER'}),Response.json(validFrame(),{status:403}),new Response('<html>private</html>',{headers:{'content-type':'text/html'}})])assert.equal((await getFinanceProductionOrders({APP_INTERNAL_SECRET:'private'},input,{fetchImpl:async()=>response})).status,'UNAVAILABLE');
 let canceled=0;const result=await getFinanceProductionOrders({APP_INTERNAL_SECRET:'private'},input,{timeoutMs:5,fetchImpl:async()=>{await new Promise(resolve=>setTimeout(resolve,15));return new Response(new ReadableStream({cancel(){canceled++;}}),{headers:{'content-type':'application/json'}});}});assert.equal(result.status,'UNAVAILABLE');await new Promise(resolve=>setTimeout(resolve,20));assert.equal(canceled,1);
});
