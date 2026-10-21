import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore,FINANCE_PROFILE} from '../src/connection-store.mjs';
import {runFinanceDailyOrders} from '../src/daily-orders.mjs';

const initial=Date.parse('2026-10-21T12:00:00.000Z');
const key='PRIVATE_DAILY_PARTNER_KEY_ç',access='PRIVATE_DAILY_ACCESS',refresh='PRIVATE_DAILY_REFRESH';
const list='/api/v2/order/get_order_list',detail='/api/v2/order/get_order_detail';
const order=index=>'PRIVATE_DAILY_ORDER_'+index;
const privateMarkers=[key,access,refresh,'PRIVATE_BUYER','PRIVATE_ADDRESS','PRIVATE_SKU',order(0)];
const error=suffix=>value=>value.code==='FINANCE_DAILY_ORDERS_'+suffix;

async function fixture(statuses=['READY_TO_SHIP'],time=initial){
  let milliseconds=time;
  const now=()=>milliseconds;
  const env={FINANCE_DB:new D1(),FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,31).toString('base64'),
    FINANCE_CONNECTION_ENABLED:'true',SHOPEE_FINANCE_PARTNER_KEY:key};
  const store=await createFinanceStore(env,{now});await store.setup();
  await store.saveTokens({access_token:access,refresh_token:refresh,expires_at:Math.floor(time/1000)+600});
  const calls=[],rows=statuses.map((status,index)=>({order_sn:order(index),order_status:status}));
  const pages=[rows.map(row=>({order_sn:row.order_sn}))];
  let mutate=null;
  const fetchImpl=async request=>{
    calls.push(request);
    const url=new URL(request.url),isList=url.pathname===list;
    assert.ok(isList||url.pathname===detail,'only the two reviewed read endpoints');
    let response;
    if(isList){
      const cursor=url.searchParams.get('cursor'),index=cursor===''?0:Number(cursor.slice('PRIVATE_CURSOR_'.length));
      assert.ok(Number.isInteger(index)&&index>=0&&index<pages.length);
      response={order_list:pages[index],more:index<pages.length-1,next_cursor:index<pages.length-1?'PRIVATE_CURSOR_'+(index+1):''};
    }else{
      const selected=url.searchParams.get('order_sn_list').split(',');
      response={order_list:selected.map(id=>({...rows.find(row=>row.order_sn===id),
        buyer_username:'PRIVATE_BUYER',address:'PRIVATE_ADDRESS',
        item_list:[{item_id:101,model_id:1,model_quantity_purchased:9,model_sku:'PRIVATE_SKU'},
          {item_id:102,model_id:2,model_quantity_purchased:8}]}))};
    }
    const envelope={error:'',request_id:'PRIVATE_REQUEST',partner_id:FINANCE_PROFILE.partner_id,shop_id:FINANCE_PROFILE.shop_id,response};
    if(mutate){const replacement=await mutate(url.pathname,envelope,request);if(replacement instanceof Response)return replacement;}
    return Response.json(envelope);
  };
  const run=(overrides={})=>runFinanceDailyOrders(env,{fetchImpl,now,...overrides});
  return {env,store,calls,rows,pages,now,run,fetchImpl,setTime:value=>{milliseconds=value;},setMutator:value=>{mutate=value;}};
}

test('daily sales count each current order status once, independently of items, quantities and Ads',async()=>{
  const f=await fixture(['READY_TO_SHIP','PROCESSED','RETRY_SHIP','SHIPPED','TO_CONFIRM_RECEIVE','COMPLETED','INVOICE_PENDING',
    'CANCELLED','IN_CANCEL','UNPAID','TO_RETURN','PROVIDER_NEW_STATUS',undefined]);
  const before=await f.store.readTokens(),result=await f.run();
  assert.deepEqual(result,{schema:'shop_daily_sales_v1',shop_id:1178167501,date:'2026-10-21',timezone:'America/Sao_Paulo',
    through_at:'2026-10-21T09:00:00.000-03:00',day_partial:true,orders_in_api_window:13,orders_with_details:13,
    sales_orders:7,cancelled_orders:1,cancellation_pending_orders:1,unpaid_orders:1,other_orders:1,unknown_status_orders:2,
    pagination_complete:true,pages_read:1,duplicate_rows:0,count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_CURRENT_STATUS',source:'shopee_get_order_list_and_detail'});
  assert.equal(f.calls.length,2);assert.deepEqual(await f.store.readTokens(),before);
  for(const marker of privateMarkers)assert.equal(JSON.stringify(result).includes(marker),false);
  assert.equal(f.env.FINANCE_DB.db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE name LIKE '%order%'").get().count,0);
});

test('a paid order that later becomes cancelled leaves the daily sales counter on the very next fresh read',async()=>{
  const f=await fixture(['READY_TO_SHIP','UNPAID']);
  const first=await f.run();assert.equal(first.sales_orders,1);assert.equal(first.cancelled_orders,0);assert.equal(first.orders_in_api_window,2);
  f.rows[0].order_status='CANCELLED';f.setTime(initial+1000);
  const second=await f.run();assert.equal(second.sales_orders,0);assert.equal(second.cancelled_orders,1);assert.equal(second.unpaid_orders,1);assert.equal(second.orders_in_api_window,2);
  assert.equal(f.calls.length,4);assert.equal(first.sales_orders,1);
});

test('requests use the fixed Global shop signature and exact current creation-time window without browser credentials',async()=>{
  const f=await fixture(['READY_TO_SHIP']);await f.run();
  for(const request of f.calls){
    const url=new URL(request.url),common=['access_token','partner_id','shop_id','sign','timestamp'];
    assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(request.method,'GET');assert.equal(request.redirect,'manual');assert.equal(await request.clone().text(),'');
    assert.equal(request.headers.get('accept'),'application/json');
    for(const header of ['cookie','authorization','x-braza-app-key','x-braza-finance-router','x-braza-gateway-key'])assert.equal(request.headers.has(header),false);
    assert.equal(url.searchParams.get('partner_id'),'2049333');assert.equal(url.searchParams.get('shop_id'),'1178167501');assert.equal(url.searchParams.get('access_token'),access);
    const timestamp=url.searchParams.get('timestamp');assert.equal(Number(timestamp),initial/1000);
    assert.equal(url.searchParams.get('sign'),createHmac('sha256',key).update('2049333'+url.pathname+timestamp+access+'1178167501').digest('hex'));
    if(url.pathname===list){
      assert.deepEqual([...url.searchParams.keys()].sort(),[...common,'time_range_field','time_from','time_to','page_size','cursor'].sort());
      assert.equal(url.searchParams.get('time_range_field'),'create_time');assert.equal(Number(url.searchParams.get('time_from')),Date.parse('2026-10-21T03:00:00Z')/1000);
      assert.equal(Number(url.searchParams.get('time_to')),initial/1000);assert.equal(url.searchParams.get('page_size'),'100');assert.equal(url.searchParams.get('order_status'),null);
    }else assert.deepEqual([...url.searchParams.keys()].sort(),[...common,'order_sn_list'].sort());
  }
});

test('São Paulo midnight, rather than UTC midnight, determines the date and lower creation-time boundary',async()=>{
  for(const [iso,date,from,through] of [['2026-10-22T02:59:59.321Z','2026-10-21','2026-10-21T03:00:00Z','2026-10-21T23:59:59.321-03:00'],
    ['2026-10-22T03:00:00.321Z','2026-10-22','2026-10-22T03:00:00Z','2026-10-22T00:00:00.321-03:00']]){
    const f=await fixture([],Date.parse(iso)),result=await f.run(),url=new URL(f.calls[0].url);
    assert.equal(result.date,date);assert.equal(result.through_at,through);
    assert.equal(Number(url.searchParams.get('time_from')),Date.parse(from)/1000);assert.equal(result.sales_orders,0);assert.equal(f.calls.length,1);
  }
});

test('paginated duplicates are removed before detail batches and statuses are read only once per unique order',async()=>{
  const f=await fixture(Array.from({length:52},(_,i)=>i%2?'CANCELLED':'SHIPPED'));
  f.pages.splice(0,1,f.rows.slice(0,30).map(row=>({order_sn:row.order_sn})),f.rows.slice(25).map(row=>({order_sn:row.order_sn})));
  const result=await f.run();assert.equal(result.orders_in_api_window,52);assert.equal(result.sales_orders,26);assert.equal(result.cancelled_orders,26);assert.equal(result.duplicate_rows,5);assert.equal(result.pages_read,2);
  const details=f.calls.filter(r=>new URL(r.url).pathname===detail).map(r=>new URL(r.url).searchParams.get('order_sn_list').split(','));
  assert.deepEqual(details.map(rows=>rows.length),[50,2]);assert.equal(new Set(details.flat()).size,52);assert.equal(details.flat().length,52);
});

test('full supported daily capacity uses at most thirty read requests and a larger cohort has no partial result',async()=>{
  const f=await fixture(Array.from({length:1000},()=> 'SHIPPED'));
  f.pages.splice(0,1,...Array.from({length:10},(_,i)=>f.rows.slice(i*100,(i+1)*100).map(row=>({order_sn:row.order_sn}))));
  const result=await f.run();assert.equal(result.orders_in_api_window,1000);assert.equal(result.sales_orders,1000);assert.equal(result.pages_read,10);assert.equal(f.calls.length,30);
  const larger=await fixture(Array.from({length:1001},()=> 'SHIPPED'));
  larger.pages.splice(0,1,...Array.from({length:11},(_,i)=>larger.rows.slice(i*100,(i+1)*100).map(row=>({order_sn:row.order_sn}))));
  await assert.rejects(larger.run(),error('PAGE_LIMIT'));assert.equal(larger.calls.length,10);
});

test('missing, additional, repeated or foreign detail records fail without publishing a plausible count',async()=>{
  const mutations=[response=>{response.order_list.pop();},response=>{response.order_list.push({...response.order_list[0]});},
    response=>{response.order_list[1]={...response.order_list[0]};},response=>{response.order_list[0].order_sn='FOREIGN_ORDER';},
    response=>{response.order_list[0].order_sn=123;},response=>{response.order_list[0].shop_id=22;},
    response=>{response.order_list[0].partner_id=2047569;},response=>{response.order_list[0].create_time=0;}];
  for(const mutate of mutations){
    const f=await fixture(['READY_TO_SHIP','CANCELLED']);f.setMutator((path,envelope)=>{if(path===detail)mutate(envelope.response);});
    await assert.rejects(f.run(),failure=>/^FINANCE_DAILY_ORDERS_(DETAIL_SET_INVALID|IDENTITY_MISMATCH)$/.test(failure.code));
    assert.equal(f.calls.length,2);
  }
});

test('invalid or repeated pagination and unsafe identifiers never produce partial totals or provider-selected URLs',async()=>{
  const mutations=[response=>{response.order_list=null;},response=>{response.more=1;},
    response=>{response.order_list=[{order_sn:''}];},response=>{response.order_list=[{order_sn:'PRIVATE\nORDER'}];},
    response=>{response.order_list=[{order_sn:'PRIVATE,ORDER'}];},response=>{response.order_list=Array(101).fill({order_sn:'X'});},
    response=>{response.order_list=[];response.more=true;response.next_cursor='PRIVATE_NEXT';},
    response=>{response.more=true;response.next_cursor='';},response=>{response.more=true;response.next_cursor='PRIVATE\nCURSOR';}];
  for(const mutate of mutations){const f=await fixture();f.setMutator((path,envelope)=>{if(path===list)mutate(envelope.response);});await assert.rejects(f.run());assert.equal(f.calls.length,1);}
  const f=await fixture();f.pages.push(f.pages[0]);f.setMutator((path,envelope)=>{if(path===list){envelope.response.more=true;envelope.response.next_cursor='PRIVATE_CURSOR_1';}});
  await assert.rejects(f.run(),error('CURSOR_REPEATED'));assert.equal(f.calls.length,2);
});

test('provider errors, malformed scope and untrusted response types never retry or expose provider messages',async()=>{
  const mutations=[(path,envelope)=>{envelope.shop_id=22;},(path,envelope)=>{envelope.response.partner_id=2047569;},
    ()=>Response.json({error:'error_api_permission',message:'PRIVATE_MESSAGE'}),()=>Response.json({error:'PRIVATE_ERROR',response:{}}),
    ()=>Response.json({error:'',response:[]}),()=>new Response('PRIVATE_HTML',{headers:{'content-type':'text/html'}}),
    ()=>new Response(null,{status:302,headers:{location:'https://foreign.example'}}),()=>Response.json({error:'PRIVATE'},{status:403})];
  for(const mutate of mutations){const f=await fixture();f.setMutator(mutate);await assert.rejects(f.run(),failure=>{assert.equal(String(failure).includes('PRIVATE'),false);return /^FINANCE_DAILY_ORDERS_/.test(failure.code);});assert.equal(f.calls.length,1);}
});

test('a request timeout aborts its private read and a depleted overall budget starts no further request',async()=>{
  const f=await fixture();let aborted=false;
  await assert.rejects(f.run({timeoutMs:5,fetchImpl:async request=>{request.signal.addEventListener('abort',()=>{aborted=true;});return new Promise(()=>{});}}),error('TIMEOUT'));
  assert.equal(aborted,true);
  const depleted=await fixture();depleted.setMutator(()=>{depleted.setTime(initial+35000);});
  await assert.rejects(depleted.run(),error('READ_BUDGET'));assert.equal(depleted.calls.length,1);
});

test('unsupported input, configuration, clock or signing keys fail before provider traffic',async()=>{
  for(const options of [{date:'2026-10-20'},{shop_id:22},{order_status:'CANCELLED'},{path:'/foreign'},
    {timeoutMs:0},{timeoutMs:10001},{timeoutMs:5.5},{now:()=>NaN},{now:()=>-1},{now:()=>{throw Error('PRIVATE_CLOCK');}}]){
    const f=await fixture();await assert.rejects(f.run(options));assert.equal(f.calls.length,0);
  }
  for(const mutate of [env=>{env.FINANCE_CONNECTION_ENABLED='false';},env=>{delete env.SHOPEE_FINANCE_PARTNER_KEY;},
    env=>{env.SHOPEE_FINANCE_PARTNER_KEY='PRIVATE\nKEY';}]){const f=await fixture();mutate(f.env);await assert.rejects(f.run());assert.equal(f.calls.length,0);}
  const f=await fixture();let getters=0;
  const options={fetchImpl:f.fetchImpl,get now(){getters++;return f.now;}};
  await assert.rejects(runFinanceDailyOrders(f.env,options),error('REQUEST_INVALID'));assert.equal(getters,0);assert.equal(f.calls.length,0);
});
