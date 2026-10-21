import test from 'node:test';
import assert from 'node:assert/strict';
import {shopDailyOrders} from '../src/daily-shop-orders.mjs';

const now=new Date('2026-10-21T15:00:00Z');
const frame=changes=>({schema:'shop_daily_sales_v1',shop_id:1178167501,date:'2026-10-21',timezone:'America/Sao_Paulo',through_at:'2026-10-21T12:00:00-03:00',day_partial:true,orders_in_api_window:6,orders_with_details:6,sales_orders:3,cancelled_orders:2,cancellation_pending_orders:0,unpaid_orders:1,other_orders:0,unknown_status_orders:0,pagination_complete:true,pages_read:1,duplicate_rows:0,count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_CURRENT_STATUS',source:'shopee_get_order_list_and_detail',...changes});

test('App projects the paid daily count independently of gross creations and cancellation categories',()=>{
 const result=shopDailyOrders(frame(),now);assert.equal(result.status,'AVAILABLE');assert.equal(result.sales_orders,3);assert.equal(result.orders_in_api_window,6);assert.equal(result.cancelled_orders,2);assert.equal(result.unpaid_orders,1);assert.equal(result.snapshot_age_seconds,0);assert.equal(result.dashboard_counter_reconciled,false);
 const cancelled=shopDailyOrders(frame({sales_orders:2,cancelled_orders:3}),now);assert.equal(cancelled.sales_orders,2);assert.equal(cancelled.orders_in_api_window,6);
 for(const changes of [{buyer:'PRIVATE'},{sales_orders:4},{orders_with_details:5},{pagination_complete:false},{shop_id:2}]){const rejected=shopDailyOrders(frame(changes),now);assert.equal(rejected.status,'INVALID_RESPONSE');assert.equal(rejected.sales_orders,null);assert.equal(rejected.orders_in_api_window,null);assert.equal(JSON.stringify(rejected).includes('PRIVATE'),false);}
});

test('stale, previous-day and future aggregates cannot keep an obsolete daily sales count',()=>{
 assert.equal(shopDailyOrders(frame({through_at:'2026-10-21T11:57:59-03:00'}),now).sales_orders,null);
 assert.equal(shopDailyOrders(frame({through_at:'2026-10-21T12:01:01-03:00'}),now).status,'INVALID_RESPONSE');
 const previous=shopDailyOrders(frame({date:'2026-10-20',through_at:'2026-10-20T12:00:00-03:00'}),now);assert.equal(previous.status,'STALE_DATE');assert.equal(previous.sales_orders,null);
 assert.equal(shopDailyOrders(null,now).status,'UNAVAILABLE');assert.equal(shopDailyOrders({schema:'shop_orders_v1',orders_in_api_window:6},now).sales_orders,null);
});

test('a complete empty creation-time cohort is an actual zero and not missing evidence',()=>{
 const value=shopDailyOrders(frame({orders_in_api_window:0,orders_with_details:0,sales_orders:0,cancelled_orders:0,unpaid_orders:0}),now);assert.equal(value.status,'AVAILABLE');assert.equal(value.sales_orders,0);assert.equal(value.cancelled_orders,0);
});
