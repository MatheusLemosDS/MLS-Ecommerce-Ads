import test from 'node:test';
import assert from 'node:assert/strict';
import {orderItems} from '../src/order-items.mjs';
import {gatewayOrderItems,authOrderItems} from '../src/auth-order-items.mjs';
import {getOrderItems} from '../src/app-order-items.mjs';

const now=new Date('2026-10-14T18:10:00.000Z');
const make=()=>({schema:'shop_order_items_v1',shop_id:1178167501,date:'2026-10-14',timezone:'America/Sao_Paulo',through_at:'2026-10-14T15:09:00.123456-03:00',day_partial:true,orders_in_api_window:3,orders_with_details:3,pagination_complete:true,pages_read:1,duplicate_rows:0,catalog_units:5,rows:[{item_id:'18446744073709551616',model_id:'0',order_status:'READY_TO_SHIP',quantity:3,line_count:2},{item_id:'300',model_id:'400',order_status:'COMPLETED',quantity:2,line_count:1}],currency_status:'BRL_ALL_CONFIRMED',currency_counts:{BRL:3,OTHER:0,UNKNOWN:0},order_status_verified:true,count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_NO_STATUS_FILTER',order_status_filter:'NONE',dashboard_counter_reconciled:false,source:'shopee_get_order_list_and_detail',api_error:'NO',transport_http:200});
const current=()=>{const through=new Date(Date.now()-10800000).toISOString().replace('Z','-03:00');return {...make(),date:through.slice(0,10),through_at:through};};
const unavailable=value=>{assert.notEqual(value.status,'AVAILABLE');assert.equal(value.orders_in_api_window,null);assert.equal(value.catalog_units,null);assert.deepEqual(value.rows,[]);};

test('complete catalog aggregates preserve string identifiers and strip all private or financial extras',()=>{
 const input=make();input.order_sn='PRIVATE';input.customer={name:'PRIVATE'};input.access_token='PRIVATE';input.rows[0].item_name='PRIVATE';input.rows[0].sku='PRIVATE';input.rows[0].price=999;input.rows[0].buyer='PRIVATE';
 const value=orderItems(input,now);
 assert.equal(value.status,'AVAILABLE');assert.equal(value.orders_in_api_window,3);assert.equal(value.orders_with_details,3);assert.equal(value.catalog_units,5);assert.equal(value.rows[0].item_id,'18446744073709551616');assert.equal(value.rows[0].model_id,'0');assert.equal(value.snapshot_age_seconds,59);assert.equal(value.dashboard_counter_reconciled,false);assert.equal(Object.keys(value).length,24);assert.equal(Object.keys(value.rows[0]).length,5);assert.ok(!JSON.stringify(value).includes('PRIVATE'));assert.ok(!('total_orders' in value));assert.ok(!('profit' in value));assert.ok(!('price' in value.rows[0]));
});

test('only fully validated empty windows may report zero; unknown and mixed currencies remain explicit',()=>{
 const empty={...make(),orders_in_api_window:0,orders_with_details:0,catalog_units:0,rows:[],currency_status:'MIXED_OR_UNKNOWN',currency_counts:{BRL:0,OTHER:0,UNKNOWN:0}};
 const result=orderItems(empty,now);assert.equal(result.status,'AVAILABLE');assert.equal(result.catalog_units,0);assert.deepEqual(result.rows,[]);assert.equal(result.order_status_verified,true);
 const unknown=make();unknown.rows[0].order_status='UNKNOWN';unknown.order_status_verified=false;unknown.currency_counts={BRL:1,OTHER:1,UNKNOWN:1};unknown.currency_status='MIXED_OR_UNKNOWN';assert.equal(orderItems(unknown,now).status,'AVAILABLE');assert.equal(orderItems(unknown,now).order_status_verified,false);
 for(const input of [null,undefined,[],{},empty&&{...empty,currency_status:'BRL_ALL_CONFIRMED'},{...empty,order_status_verified:false},{...empty,rows:[make().rows[0]],catalog_units:3}])unavailable(orderItems(input,now));
});

test('identity, completeness, page bounds and status claims must match the native aggregate contract',()=>{
 const mutations=[{schema:'shop_orders_v1'},{shop_id:'1178167501'},{shop_id:1},{timezone:'UTC'},{day_partial:false},{pagination_complete:false},{orders_in_api_window:2001},{orders_in_api_window:true},{orders_with_details:2},{orders_with_details:true},{pages_read:0},{pages_read:21},{pages_read:'1'},{duplicate_rows:-1},{duplicate_rows:98},{catalog_units:'5'},{catalog_units:4},{order_status_verified:false},{order_status_verified:'true'},{count_basis:'ALL_ORDERS'},{order_status_filter:'COMPLETED'},{dashboard_counter_reconciled:true},{source:'ads'},{api_error:'ERROR_PRIVATE'},{transport_http:201},{rows:null},{rows:{}}];
 for(const change of mutations){const result=orderItems({...make(),...change},now);assert.equal(result.status,'INVALID_RESPONSE',JSON.stringify(change));unavailable(result);}
});

test('canonical catalog IDs, status enum, line counts and safe quantity sums prevent ambiguous or partial rows',()=>{
 const mutations=[{item_id:18446744073709551616},{item_id:'0'},{item_id:'01'},{item_id:'-1'},{item_id:'100000000000000000000'},{item_id:'1e3'},{model_id:0},{model_id:'00'},{model_id:'-1'},{model_id:'100000000000000000000'},{order_status:'RETURNED_PRIVATE'},{order_status:{}},{quantity:0},{quantity:'3'},{quantity:true},{quantity:Number.MAX_SAFE_INTEGER+1},{quantity:1},{line_count:0},{line_count:'2'},{line_count:10001}];
 for(const change of mutations){const input=make();input.rows[0]={...input.rows[0],...change};unavailable(orderItems(input,now));}
 const duplicate=make();duplicate.rows.push({...duplicate.rows[0]});duplicate.catalog_units+=3;unavailable(orderItems(duplicate,now));
 const short=make();short.rows[0].line_count=1;short.rows[1].line_count=1;unavailable(orderItems(short,now));
 const huge=make();huge.rows[0].quantity=Number.MAX_SAFE_INTEGER;huge.catalog_units=Number.MAX_SAFE_INTEGER;unavailable(orderItems(huge,now));
 const maxId=make();maxId.rows[0].item_id='99999999999999999999';maxId.rows[0].model_id='99999999999999999999';assert.equal(orderItems(maxId,now).status,'AVAILABLE');
 const maxSafe={...make(),orders_in_api_window:1,orders_with_details:1,catalog_units:Number.MAX_SAFE_INTEGER,rows:[{item_id:'1',model_id:'0',order_status:'COMPLETED',quantity:Number.MAX_SAFE_INTEGER,line_count:1}],currency_counts:{BRL:1,OTHER:0,UNKNOWN:0}};assert.equal(orderItems(maxSafe,now).status,'AVAILABLE');
});

test('aggregate row and line caps are enforced without losing valid large inventories',()=>{
 const input=make();input.rows=Array.from({length:1000},(_,index)=>({item_id:String(index+1),model_id:'0',order_status:'COMPLETED',quantity:10,line_count:10}));input.catalog_units=10000;assert.equal(orderItems(input,now).status,'AVAILABLE');
 input.rows.push({item_id:'1001',model_id:'0',order_status:'COMPLETED',quantity:1,line_count:1});input.catalog_units++;unavailable(orderItems(input,now));
 const lines=make();lines.rows=[{item_id:'1',model_id:'0',order_status:'COMPLETED',quantity:10000,line_count:10000},{item_id:'2',model_id:'0',order_status:'COMPLETED',quantity:1,line_count:1}];lines.catalog_units=10001;unavailable(orderItems(lines,now));
});

test('currency counters reconcile all detail orders and never validate BRL from a default or empty window',()=>{
 const cases=[null,[],{BRL:3,OTHER:0},{BRL:3,OTHER:0,UNKNOWN:0,PRIVATE:1},{BRL:'3',OTHER:0,UNKNOWN:0},{BRL:2,OTHER:0,UNKNOWN:0},{BRL:4,OTHER:0,UNKNOWN:0},{BRL:3,OTHER:-1,UNKNOWN:1}];
 for(const counts of cases)unavailable(orderItems({...make(),currency_counts:counts},now));
 unavailable(orderItems({...make(),currency_status:'MIXED_OR_UNKNOWN'},now));unavailable(orderItems({...make(),currency_status:'USD'},now));
 const mixed=make();mixed.currency_counts={BRL:2,OTHER:1,UNKNOWN:0};mixed.currency_status='MIXED_OR_UNKNOWN';assert.equal(orderItems(mixed,now).status,'AVAILABLE');mixed.currency_status='BRL_ALL_CONFIRMED';unavailable(orderItems(mixed,now));
});

test('only current São Paulo snapshots with valid calendar dates and fixed offset cuts are accepted',()=>{
 for(const change of [{date:'2026-02-31',through_at:'2026-02-31T15:09:00-03:00'},{through_at:'2026-10-14T15:09:00Z'},{through_at:'2026-10-14T25:09:00-03:00'},{through_at:'2026-10-13T15:09:00-03:00'},{through_at:'2026-10-14T15:11:01-03:00'},{through_at:'2026-10-14T15:09:00.1234567-03:00'}])unavailable(orderItems({...make(),...change},now));
 const stale=orderItems({...make(),date:'2026-10-13',through_at:'2026-10-13T23:59:00-03:00'},now);assert.equal(stale.status,'STALE_DATE');assert.equal(stale.date,'2026-10-14');assert.equal(stale.snapshot_date,'2026-10-13');unavailable(stale);
 const midnight=new Date('2026-10-15T03:00:00Z');assert.equal(orderItems(make(),midnight).status,'STALE_DATE');
});

test('private Auth items route authenticates and rejects non-GET before touching the gateway',async()=>{
 let reads=0;const services={validateInternalApp:async request=>request.headers.get('x-braza-app-key')==='fixture',gatewayOrderItemsRead:async()=>{reads++;return {ok:true,status:200,body:current()};}};
 const request=(method='GET',key='fixture')=>new Request('https://auth.example/internal/shopee/orders/items?shop_id=22&date=2000-01-01',{method,headers:{'x-braza-app-key':key}});
 assert.equal((await authOrderItems(request('GET','wrong'),{},services)).status,401);assert.equal((await authOrderItems(request('POST'),{},services)).status,405);assert.equal(reads,0);
 const response=await authOrderItems(request(),{},services);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).catalog_units,5);assert.equal(reads,1);
});

test('Auth failures reveal only fixed support diagnostics, never raw responses or thrown details',async()=>{
 const failures=[async()=>({ok:false,status:403,http:403,failure_code:'HTTP_STATUS',body:{error:'PRIVATE'}}),async()=>({ok:false,status:502,http:null,failure_code:'NETWORK_ERROR',upstream_diagnostic:{stage:'PRIVATE',code:'PRIVATE',http:999}}),async()=>({ok:true,status:200,body:{buyer:'PRIVATE'}}),async()=>{throw Error('PRIVATE');}];
 for(const read of failures){const response=await authOrderItems(new Request('https://auth.example/internal/shopee/orders/items'),{},{validateInternalApp:async()=>true,gatewayOrderItemsRead:read});assert.equal(response.status,502);const value=await response.json();assert.equal(value.error,'SHOP_ORDER_ITEMS_UNAVAILABLE');assert.ok(value.diagnostic);assert.ok(!JSON.stringify(value).includes('PRIVATE'));}
 const yesterday=current();const date=new Date(Date.now()-86400000-10800000).toISOString().slice(0,10);yesterday.date=date;yesterday.through_at=date+'T12:00:00-03:00';const response=await authOrderItems(new Request('https://auth.example/internal/shopee/orders/items'),{},{validateInternalApp:async()=>true,gatewayOrderItemsRead:async()=>({ok:true,status:200,body:yesterday})});assert.equal((await response.json()).diagnostic.code,'STALE_DATE');
});

test('new item reads use fixed destinations, current keys, manual redirects and separate byte/time limits',async()=>{
 const originalFetch=globalThis.fetch,originalTimeout=AbortSignal.timeout;const reads=[],timeouts=[];
 AbortSignal.timeout=milliseconds=>{timeouts.push(milliseconds);return originalTimeout(milliseconds);};globalThis.fetch=async(target,options)=>{reads.push({target,options});return Response.json(current());};
 try{const e={GATEWAY_URL:'https://gateway.example.test///',GATEWAY_SHARED_SECRET:'fixture-gateway-private',APP_INTERNAL_SECRET:'fixture-app-private'};assert.equal((await gatewayOrderItems(e,value=>String(value||'').replace(/\/+$/,''))).body.catalog_units,5);assert.equal((await getOrderItems(e)).catalog_units,5);assert.deepEqual(timeouts,[45000,60000]);assert.deepEqual(reads.map(read=>read.target),['https://gateway.example.test/api/shopee/orders/items?shop_id=1178167501','https://auth.brazacommerce.com.br/internal/shopee/orders/items']);for(const {options} of reads){assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.ok(options.signal instanceof AbortSignal);assert.ok(!('body' in options));}assert.equal(reads[0].options.headers['X-Braza-Gateway-Key'],e.GATEWAY_SHARED_SECRET);assert.equal(reads[1].options.headers['X-Braza-App-Key'],e.APP_INTERNAL_SECRET);assert.equal((await gatewayOrderItems({},value=>value)).diagnostic.stage,'AUTH_CONFIG');assert.equal((await getOrderItems({})).diagnostic.stage,'APP_CONFIG');assert.equal(reads.length,2);}finally{globalThis.fetch=originalFetch;AbortSignal.timeout=originalTimeout;}
});

test('item HTTP accepts bounded larger frames but rejects malformed, oversized and redirect bodies',async()=>{
 const originalFetch=globalThis.fetch;
 try{globalThis.fetch=async()=>Response.json({...current(),private_padding:'x'.repeat(17000)});assert.equal((await getOrderItems({APP_INTERNAL_SECRET:'fixture'})).catalog_units,5);
  for(const response of [new Response('PRIVATE'),new Response(' '.repeat(131073)),new Response(null,{status:301,headers:{location:'https://other.example/PRIVATE'}}),new Response(null,{status:302,headers:{location:'https://other.example/PRIVATE'}})]){globalThis.fetch=async()=>response;const result=await getOrderItems({APP_INTERNAL_SECRET:'fixture'});assert.ok(result.diagnostic);assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.ok(!('catalog_units' in result));}
 }finally{globalThis.fetch=originalFetch;}
});

test('fixed upstream diagnostics survive Auth-to-App item failures and reject injected details',async()=>{
 const originalFetch=globalThis.fetch;
 try{globalThis.fetch=async()=>Response.json({error:'SHOP_ORDER_ITEMS_UNAVAILABLE',diagnostic:{stage:'AUTH_TO_GATEWAY',code:'HTTP_STATUS',http:403,raw:'PRIVATE'}},{status:502});const result=await getOrderItems({APP_INTERNAL_SECRET:'fixture'});assert.deepEqual(result.diagnostic,{stage:'AUTH_TO_GATEWAY',code:'HTTP_STATUS',http:403});assert.ok(!JSON.stringify(result).includes('PRIVATE'));}
 finally{globalThis.fetch=originalFetch;}
});
