import test from 'node:test';
import assert from 'node:assert/strict';
import {projectDailyOrdersFrame} from '../src/daily-orders-frame.mjs';

const frame = changes => ({schema:'shop_daily_sales_v1',shop_id:1178167501,
  date:'2026-10-21',timezone:'America/Sao_Paulo',through_at:'2026-10-21T13:24:01.123456-03:00',
  day_partial:true,orders_in_api_window:10,orders_with_details:10,sales_orders:5,cancelled_orders:1,
  cancellation_pending_orders:1,unpaid_orders:1,other_orders:1,unknown_status_orders:1,
  pagination_complete:true,pages_read:1,duplicate_rows:2,
  count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_CURRENT_STATUS',source:'shopee_get_order_list_and_detail',...changes});

test('daily order frame conserves all six status groups in a detached aggregate-only result',()=>{
  const input=frame(),result=projectDailyOrdersFrame(input);
  assert.deepEqual(result,input);assert.notEqual(result,input);
  input.sales_orders=99;input.date='2000-01-01';
  assert.equal(result.sales_orders,5);assert.equal(result.date,'2026-10-21');
  assert.equal(result.orders_in_api_window,10);assert.equal(result.cancelled_orders,1);
  for(const key of ['order_sn','orders','items','quantity','buyer','access_token'])assert.equal(Object.hasOwn(result,key),false);
  const nullPrototype=Object.assign(Object.create(null),frame());
  assert.deepEqual(projectDailyOrdersFrame(nullPrototype),frame());
});

test('empty completed traversal means genuine zero while maximum complete cohorts remain bounded',()=>{
  const zero=frame({orders_in_api_window:0,orders_with_details:0,sales_orders:0,cancelled_orders:0,
    cancellation_pending_orders:0,unpaid_orders:0,other_orders:0,unknown_status_orders:0,duplicate_rows:0});
  assert.deepEqual(projectDailyOrdersFrame(zero),zero);
  const maximum=frame({orders_in_api_window:2000,orders_with_details:2000,sales_orders:1995,pages_read:20,duplicate_rows:0});
  assert.deepEqual(projectDailyOrdersFrame(maximum),maximum);
  assert.equal(projectDailyOrdersFrame({...maximum,duplicate_rows:1}),null);
});

test('finite identity, schema and basis prevent using legacy counts or attributed Ads as daily sales',()=>{
  for(const changes of [{schema:'shop_orders_v1'},{shop_id:'1178167501'},{shop_id:1},
    {timezone:'UTC'},{day_partial:false},{day_partial:1},{pagination_complete:false},
    {count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_NO_STATUS_FILTER'},
    {source:'shopee_get_order_list'},{source:'ads'}])assert.equal(projectDailyOrdersFrame(frame(changes)),null);
});

test('counter groups must be exact nonnegative integers with full detail and bounded page evidence',()=>{
  for(const key of ['orders_in_api_window','orders_with_details','sales_orders','cancelled_orders',
    'cancellation_pending_orders','unpaid_orders','other_orders','unknown_status_orders','duplicate_rows','pages_read']){
    for(const value of ['1',true,null,-1,0.1,NaN,Infinity,2001])assert.equal(projectDailyOrdersFrame(frame({[key]:value})),null,key+':'+String(value));
  }
  for(const changes of [{orders_with_details:9},{sales_orders:6},{cancelled_orders:0},
    {unknown_status_orders:11},{pages_read:0},{pages_read:21},{duplicate_rows:91},
    {orders_in_api_window:101,orders_with_details:101,sales_orders:96,duplicate_rows:0}]){
    assert.equal(projectDailyOrdersFrame(frame(changes)),null);
  }
});

test('São Paulo cutoff keeps a real canonical day and explicit offset without requiring a current-day clock',()=>{
  for(const through_at of ['2026-10-21T00:00:00-03:00','2026-10-21T23:59:59.999-03:00']){
    assert.equal(projectDailyOrdersFrame(frame({through_at})).through_at,through_at);
  }
  const leap=frame({date:'2024-02-29',through_at:'2024-02-29T12:00:00-03:00'});
  assert.deepEqual(projectDailyOrdersFrame(leap),leap);
  for(const changes of [{date:'2026-02-29',through_at:'2026-02-29T12:00:00-03:00'},
    {date:'2026-02-31',through_at:'2026-02-31T12:00:00-03:00'},
    {date:'2026-13-01',through_at:'2026-13-01T12:00:00-03:00'},
    {date:'2026-1-1'},{date:null},{through_at:'2026-10-20T13:24:01-03:00'},
    {through_at:'2026-10-21T24:00:00-03:00'},{through_at:'2026-10-21T12:60:00-03:00'},
    {through_at:'2026-10-21T12:00:60-03:00'},{through_at:'2026-10-21T12:00:00Z'},
    {through_at:'2026-10-21T12:00:00-02:00'},{through_at:'2026-10-21T12:00:00.1234567-03:00'}]){
    assert.equal(projectDailyOrdersFrame(frame(changes)),null);
  }
});

test('extra, missing, inherited or accessor fields cannot export private data or execute getters',()=>{
  for(const value of [null,[],{},new Date(),Object.assign(Object.create({private:'PRIVATE'}),frame()),
    {...frame(),access_token:'PRIVATE'},{...frame(),order_list:[{order_sn:'PRIVATE'}]},
    {...frame(),[Symbol('private')]:'PRIVATE'}])assert.equal(projectDailyOrdersFrame(value),null);
  for(const key of Object.keys(frame())){
    const missing=frame();delete missing[key];assert.equal(projectDailyOrdersFrame(missing),null,key);
    let reads=0;const accessor=frame();
    Object.defineProperty(accessor,key,{enumerable:true,get(){reads++;return frame()[key];}});
    assert.equal(projectDailyOrdersFrame(accessor),null,key);assert.equal(reads,0,key);
  }
});
