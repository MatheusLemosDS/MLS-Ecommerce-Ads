import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {runFinanceProductIndex} from '../src/product-index.mjs';
import {PRODUCT_INDEX_STATUSES,projectProductIndexRequest,projectProductIndexFrame,financeProductIndexDiagnostic} from '../src/product-index-frame.mjs';

const clock=Date.UTC(2026,10,2,12),at=clock/1000,key='fixture-product-index-key-ç',access='PRIVATE_PRODUCT_INDEX_ACCESS',refresh='PRIVATE_PRODUCT_INDEX_REFRESH';
const request=(changes={})=>({offset:0,page_size:2,item_status:'NORMAL',...changes});
const frame=(changes={})=>({schema:'product_index_v1',status:'AVAILABLE',shop_id:1178167501,checked_at:at,...request(),total_count:3,has_more:true,next_offset:2,items:[{item_id:'101',item_status:'NORMAL',source_update_time:at-1},{item_id:'102',item_status:'NORMAL',source_update_time:null}],...changes});
async function fixture(){const env={FINANCE_DB:new D1(),FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,13).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:key},now=()=>clock,store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:access,refresh_token:refresh,expires_at:at+14400});return {env,now,store};}

test('index request and response contracts bound every page, retain all documented statuses and reject private extras',()=>{
 for(const item_status of PRODUCT_INDEX_STATUSES){const value=frame({item_status,items:[{item_id:'101',item_status,source_update_time:at}]});assert.ok(projectProductIndexRequest(request({item_status})));assert.deepEqual(projectProductIndexFrame(value),value);}
 for(const input of [{...request(),page_size:51},{...request(),offset:-1},{...request(),offset:1000001},{...request(),item_status:'DELETED'},{...request(),shop_id:123},{...request(),url:'https://evil.test'}])assert.equal(projectProductIndexRequest(input),null);
 for(const patch of [{items:[]},{next_offset:0},{next_offset:3},{shop_id:1},{total_count:0},{items:[{...frame().items[0],token:'PRIVATE'}]},{items:[frame().items[0],frame().items[0]]},{item_status:'UNLIST'},{status:'COMPLETE'}])assert.equal(projectProductIndexFrame(frame(patch)),null);
 const copy=projectProductIndexFrame(frame());copy.items[0].item_id='999';assert.equal(frame().items[0].item_id,'101');
 let calls=0;const input=request();Object.defineProperty(input,'offset',{enumerable:true,get(){calls++;return 0;}});assert.equal(projectProductIndexRequest(input),null);assert.equal(calls,0);
});

test('the official reader signs one GET page and returns only IDs, exact status and source update times',async()=>{
 const f=await fixture(),calls=[];
 const fetchImpl=async req=>{
  calls.push(req);const url=new URL(req.url);assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(url.pathname,'/api/v2/product/get_item_list');assert.equal(req.method,'GET');assert.equal(req.redirect,'manual');assert.equal(await req.clone().text(),'');assert.equal(req.headers.get('accept'),'application/json');assert.equal(req.headers.get('cookie'),null);assert.equal(req.headers.get('authorization'),null);assert.equal(req.headers.get('x-braza-app-key'),null);assert.equal(req.headers.get('x-braza-finance-router'),null);
  assert.deepEqual([...url.searchParams.keys()].sort(),['access_token','item_status','offset','page_size','partner_id','shop_id','sign','timestamp'].sort());assert.equal(url.searchParams.get('shop_id'),'1178167501');assert.equal(url.searchParams.get('partner_id'),'2049333');assert.equal(url.searchParams.get('access_token'),access);assert.equal(url.searchParams.get('sign'),createHmac('sha256',key).update('2049333'+url.pathname+at+access+'1178167501').digest('hex'));
  const status=url.searchParams.get('item_status'),offset=Number(url.searchParams.get('offset'));
  return Response.json({error:'',request_id:'PRIVATE_REQUEST',response:{shop_id:1178167501,item:offset===0?[{item_id:101,item_status:status,update_time:at-1,buyer:'PRIVATE_BUYER'},{item_id:'102',item_status:status,access_token:access}]:[{item_id:103,item_status:status,update_time:at}],total_count:3,has_next_page:offset===0,next_offset:offset===0?2:0}});
 };
 for(const item_status of PRODUCT_INDEX_STATUSES){const first=await runFinanceProductIndex(f.env,{...request({item_status}),fetchImpl,now:f.now});assert.equal(first.items.length,2);assert.equal(first.next_offset,2);assert.equal(first.has_more,true);assert.equal(first.items[1].source_update_time,null);const last=await runFinanceProductIndex(f.env,{...request({item_status,offset:2}),fetchImpl,now:f.now});assert.equal(last.items.length,1);assert.equal(last.next_offset,null);assert.equal(last.has_more,false);for(const secret of [access,refresh,key,'PRIVATE_BUYER','PRIVATE_REQUEST'])assert.ok(!JSON.stringify({first,last}).includes(secret));}
 assert.equal(calls.length,12);assert.equal((await f.store.status()).status,'CONNECTED');
});

test('malformed metadata, scope mismatches and nonprogressing pages never become a complete catalogue',async()=>{
 const f=await fixture(),base={item:[{item_id:101,item_status:'NORMAL',update_time:at}],total_count:2,has_next_page:true,next_offset:1};
 for(const [patch,suffix] of [[{has_next_page:'true'},'RESPONSE_PAGINATION'],[{total_count:-1},'RESPONSE_TOTAL'],[{next_offset:0},'RESPONSE_PAGINATION'],[{next_offset:3},'RESPONSE_PAGINATION'],[{item:[]},'RESPONSE_PAGINATION'],[{shop_id:1},'IDENTITY_MISMATCH'],[{item:[{item_id:0,item_status:'NORMAL'}]},'RESPONSE_ROW_ID'],[{item:[{item_id:101,item_status:'BANNED'}]},'RESPONSE_ROW_STATUS'],[{item:[{item_id:101,item_status:'NORMAL',update_time:at+61}]},'RESPONSE_ROW_TIME'],[{item:[{item_id:101,item_status:'NORMAL'},{item_id:101,item_status:'NORMAL'}]},'RESPONSE_ROW_DUPLICATE']]){
  const fetchImpl=async()=>Response.json({error:'',response:{...base,...patch}});await assert.rejects(runFinanceProductIndex(f.env,{...request(),fetchImpl,now:f.now}),error=>{assert.equal(error.status,502);assert.equal(error.code,'FINANCE_PRODUCT_INDEX_'+suffix);assert.equal(financeProductIndexDiagnostic(error).code,error.code);return true;});
 }
});

test('authorization, rate and transport errors retain finite diagnostics without exposing provider text or changing tokens',async()=>{
 const f=await fixture(),before=await f.store.readTokens();
 for(const response of [()=>Response.json({error:'error_token',message:key}),()=>Response.json({error:'error_rate_limit',message:access}),()=>Response.json({error:'error_api_permission',message:refresh}),()=>Response.json({error:'PRIVATE_PROVIDER_ERROR',message:key},{status:429}),()=>Response.redirect('https://evil.test',302),()=>new Response('PRIVATE_HTML',{headers:{'content-type':'text/html'}})]){
  await assert.rejects(runFinanceProductIndex(f.env,{...request(),fetchImpl:async()=>response(),now:f.now}),error=>{const diagnostic=financeProductIndexDiagnostic(error);assert.match(diagnostic.code,/^FINANCE_PRODUCT_INDEX_[A-Z_]+$/);for(const secret of [key,access,refresh,'PRIVATE_PROVIDER_ERROR','PRIVATE_HTML'])assert.ok(!JSON.stringify(diagnostic).includes(secret));return true;});
 }
 await assert.rejects(runFinanceProductIndex(f.env,{...request(),fetchImpl:async()=>new Promise(()=>{}),now:f.now,timeoutMs:5}),error=>error.code==='FINANCE_PRODUCT_INDEX_TIMEOUT');assert.deepEqual(await f.store.readTokens(),before);
 let reads=0;await assert.rejects(runFinanceProductIndex(f.env,{...request(),shop_id:123,fetchImpl:async()=>{reads++;},now:f.now}));assert.equal(reads,0);
});


test('only omitted first-page items with explicit zero/final metadata are compatible; null or uncertain sources remain 502',async t=>{
 const f=await fixture();t.after(()=>f.env.FINANCE_DB.db.close());let reads=0;
 const run=response=>runFinanceProductIndex(f.env,{...request({item_status:'BANNED'}),fetchImpl:async()=>{reads++;return Response.json({error:'',response});},now:f.now});
 const valid=await run({item:[],total_count:0,has_next_page:false});assert.equal(valid.status,'AVAILABLE');assert.deepEqual(valid.items,[]);assert.equal(valid.total_count,0);assert.equal(valid.has_more,false);
 const omitted=await run({total_count:0,has_next_page:false});assert.deepEqual(omitted,valid);
 for(const [response,suffix] of [[{item:null,total_count:0,has_next_page:false},'RESPONSE_EMPTY_ITEM_NULL'],[{total_count:1,has_next_page:false},'RESPONSE_ITEM_TYPE'],[{item:null,total_count:0,has_next_page:true,next_offset:1},'RESPONSE_ITEM_TYPE'],[{has_next_page:false},'RESPONSE_ITEM_TYPE'],[{item:null,total_count:0},'RESPONSE_ITEM_TYPE']])await assert.rejects(run(response),error=>{assert.equal(error.status,502);assert.equal(error.code,'FINANCE_PRODUCT_INDEX_'+suffix);assert.deepEqual(financeProductIndexDiagnostic(error),{code:error.code,http:null});return true;});
 assert.equal(reads,7);assert.equal((await f.store.status()).status,'CONNECTED');
});
test('finite structural failure categories retain identity precedence, page bounds and exact row contracts',async t=>{
 const f=await fixture();t.after(()=>f.env.FINANCE_DB.db.close());const good={item:[{item_id:101,item_status:'NORMAL',update_time:at}],total_count:1,has_next_page:false};
 const cases=[[null,'RESPONSE_ENVELOPE'],[{error:0,response:good},'RESPONSE_ENVELOPE'],[{error:'',response:[]},'RESPONSE_OBJECT'],[{error:'',response:{...good,item:{}}},'RESPONSE_ITEM_TYPE'],[{error:'',response:{...good,item:[...good.item,...good.item,...good.item]}},'RESPONSE_PAGE_SIZE'],[{error:'',response:{...good,total_count:0}},'RESPONSE_TOTAL'],[{error:'',response:{...good,total_count:'1'}},'RESPONSE_TOTAL'],[{error:'',response:{...good,has_next_page:'false'}},'RESPONSE_PAGINATION'],[{error:'',response:{...good,item:[],has_next_page:true,next_offset:1}},'RESPONSE_PAGINATION'],[{error:'',response:{...good,has_next_page:true,next_offset:0}},'RESPONSE_PAGINATION'],[{error:'',response:{...good,item:[null]}},'RESPONSE_ROW_OBJECT'],[{error:'',response:{...good,item:[{item_id:0,item_status:'NORMAL'}]}},'RESPONSE_ROW_ID'],[{error:'',response:{...good,item:[{item_id:101,item_status:'BANNED'}]}},'RESPONSE_ROW_STATUS'],[{error:'',response:{...good,item:[{item_id:101,item_status:'NORMAL',update_time:at+61}]}},'RESPONSE_ROW_TIME'],[{error:'',response:{...good,item:[{item_id:101,item_status:'NORMAL'},{item_id:'101',item_status:'NORMAL'}],total_count:2}},'RESPONSE_ROW_DUPLICATE'],[{error:'',shop_id:1,response:{item:null,total_count:0,has_next_page:false}},'IDENTITY_MISMATCH']];
 let calls=0;for(const [payload,suffix]of cases)await assert.rejects(runFinanceProductIndex(f.env,{...request(),fetchImpl:async()=>{calls++;return Response.json(payload);},now:f.now}),error=>{assert.equal(error.status,502);assert.equal(error.code,'FINANCE_PRODUCT_INDEX_'+suffix);assert.equal(financeProductIndexDiagnostic(error).code,error.code);assert.doesNotMatch(JSON.stringify(financeProductIndexDiagnostic(error)),/PRIVATE/);return true;});assert.equal(calls,cases.length);
});


test('omitted-list compatibility requires exact initial-page and metadata/cursor primitives, preserves source time, tokens and all six status filters',async t=>{
 const f=await fixture();t.after(()=>f.env.FINANCE_DB.db.close());const before=await f.store.readTokens();let reads=0;
 for(const item_status of PRODUCT_INDEX_STATUSES)for(const next_offset of [undefined,null,0]){
  const body={total_count:0,has_next_page:false,...(next_offset===undefined?{}:{next_offset})};
  const value=await runFinanceProductIndex(f.env,{...request({item_status}),fetchImpl:async req=>{reads++;assert.equal(new URL(req.url).searchParams.get('item_status'),item_status);return Response.json({error:'',request_id:'SYNTHETIC_OMITTED_REQUEST',response:body});},now:f.now});
  assert.deepEqual(value,{schema:'product_index_v1',status:'AVAILABLE',shop_id:1178167501,checked_at:at,...request({item_status}),total_count:0,has_more:false,next_offset:null,items:[]});
 }
 const rejected=[[{total_count:0,has_next_page:false,next_offset:1},0,'RESPONSE_PAGINATION'],[{total_count:0,has_next_page:false,next_offset:'0'},0,'RESPONSE_PAGINATION'],[{total_count:0,has_next_page:false,next_offset:-1},0,'RESPONSE_PAGINATION'],[{total_count:0,has_next_page:false},1,'RESPONSE_EMPTY_ITEM_MISSING'],[{item:null,total_count:0,has_next_page:false},0,'RESPONSE_EMPTY_ITEM_NULL'],[{has_next_page:false},0,'RESPONSE_ITEM_TYPE'],[{total_count:0},0,'RESPONSE_ITEM_TYPE'],[{total_count:'0',has_next_page:false},0,'RESPONSE_ITEM_TYPE'],[{total_count:1,has_next_page:false},0,'RESPONSE_ITEM_TYPE'],[{total_count:0,has_next_page:true,next_offset:1},0,'RESPONSE_ITEM_TYPE']];
 for(const [response,offset,suffix]of rejected)await assert.rejects(runFinanceProductIndex(f.env,{...request({offset,item_status:'BANNED'}),fetchImpl:async()=>{reads++;return Response.json({error:'',response});},now:f.now}),error=>{assert.equal(error.status,502);assert.equal(error.code,'FINANCE_PRODUCT_INDEX_'+suffix);return true;});
 for(const response of ['{"error":"","response":{"total_count":-0,"has_next_page":false}}','{"error":"","response":{"total_count":0,"has_next_page":false,"next_offset":-0}}'])await assert.rejects(runFinanceProductIndex(f.env,{...request({item_status:'BANNED'}),fetchImpl:async()=>{reads++;return new Response(response,{headers:{'content-type':'application/json'}});},now:f.now}),error=>{assert.equal(error.status,502);return true;});
 assert.equal(reads,30);assert.deepEqual(await f.store.readTokens(),before);
});
