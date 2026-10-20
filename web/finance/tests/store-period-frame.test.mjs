import test from 'node:test';
import assert from 'node:assert/strict';
import {projectStorePeriodRequest,projectStorePeriodFrame,normalizeStoreDecimal,addStoreDecimals} from '../src/store-period-frame.mjs';

const run='12345678-1234-4123-8123-123456789abc';
const frame=()=>({schema:'finance_store_period_v1',run_id:run,revision:1,status:'RUNNING',start_date:'2026-10-14',end_date:'2026-10-20',cutoff_at:1792510733,checked_at:1792510733,currency:'BRL',monetary_unit:'UNCONFIRMED',order_count:0,pages_read:0,duplicate_orders:0,returns_orders:0,escrow_amount_raw:'0',ads_recharge_or_support_raw:'0',items:[],diagnostic:null});

test('store request union is exact, calendar-valid and bounded to fifteen inclusive days',()=>{
 assert.deepEqual(projectStorePeriodRequest({operation:'start',start_date:'2026-10-06',end_date:'2026-10-20'}),{operation:'start',start_date:'2026-10-06',end_date:'2026-10-20'});
 for(const operation of ['step','read'])assert.deepEqual(projectStorePeriodRequest({operation,run_id:run}),{operation,run_id:run});
 for(const value of [{operation:'start',start_date:'2026-10-05',end_date:'2026-10-20'},{operation:'start',start_date:'2026-02-30',end_date:'2026-03-01'},{operation:'start',start_date:'2026-10-21',end_date:'2026-10-20'},{operation:'step',run_id:run.toUpperCase()},{operation:'read',run_id:run,order_sn:'PRIVATE_ORDER'},{operation:'step',run_id:run,cursor:'PRIVATE_CURSOR'},null,[]])assert.equal(projectStorePeriodRequest(value),null);
 let getters=0;assert.equal(projectStorePeriodRequest({get operation(){getters++;return 'start';},start_date:'2026-10-20',end_date:'2026-10-20'}),null);assert.equal(getters,0);
});

test('raw decimal normalization and summing use exact integer arithmetic without rounding or binary addition',()=>{
 for(const [input,output] of [[0,'0'],[-0,'0'],[-12.34,'-12.34'],[1e-7,'0.0000001'],[1e12,'1000000000000'],['001.2300','1.23'],['12e2','1200'],['-0.0000','0']])assert.equal(normalizeStoreDecimal(input),output);
 assert.equal(addStoreDecimals(['0.1','0.2','-0.05']),'0.25');assert.equal(addStoreDecimals(['999999999999.999999999999','0.000000000001']),'1000000000000');
 assert.equal(addStoreDecimals([]),'0');
 for(const input of [Infinity,NaN,1e-13,'1.0000000000001',' 1','1 ','1,23','+1','1e999','0x10',{},null])assert.equal(normalizeStoreDecimal(input),null);
 assert.equal(normalizeStoreDecimal(1000000000001,'1000000000000'),null);assert.equal(addStoreDecimals(['1000000000000000','0.1']),null);
});

test('store frame projects independent bounded aggregates while preserving unknown amounts and returns coverage',()=>{
 const empty=frame();assert.deepEqual(projectStorePeriodFrame(empty),empty);
 const value={...frame(),revision:2,status:'COMPLETE',pages_read:1,order_count:2,returns_orders:null,escrow_amount_raw:'123.456',ads_recharge_or_support_raw:null,items:[{item_id:'20',model_id:'0',quantity:3},{item_id:'1',model_id:'1',quantity:2}]};
 const result=projectStorePeriodFrame(value);assert.deepEqual(result.items,[value.items[1],value.items[0]]);assert.equal(result.returns_orders,null);assert.equal(result.ads_recharge_or_support_raw,null);assert.equal(result.escrow_amount_raw,'123.456');
 value.items[0].quantity=50;assert.equal(result.items[1].quantity,3);assert.equal(Object.hasOwn(result,'net_profit_cents'),false);
});

test('store frame refuses extra fields, noncanonical values, unbounded groups and inconsistent coverage',()=>{
 const populated={...frame(),revision:2,pages_read:1,order_count:1,items:[{item_id:'1',model_id:'0',quantity:1}],escrow_amount_raw:null,returns_orders:null};
 for(const value of [{...populated,order_sn:'PRIVATE_ORDER'},{...populated,status:'COMPLETE',diagnostic:'STORE_PERIOD_UPSTREAM_UNAVAILABLE'},{...populated,monetary_unit:'BRL'},{...populated,currency:'USD'},{...populated,returns_orders:2},{...populated,escrow_amount_raw:'1.00'},{...populated,escrow_amount_raw:'1e2'},{...populated,escrow_amount_raw:100},{...populated,items:[...populated.items,...populated.items]},{...populated,items:[{...populated.items[0],buyer:'PRIVATE_BUYER'}]},{...populated,diagnostic:'PRIVATE_ERROR'},{...populated,pages_read:201},{...populated,order_count:1001},{...frame(),status:'COMPLETE'}])assert.equal(projectStorePeriodFrame(value),null,JSON.stringify(value));
 let getters=0;assert.equal(projectStorePeriodFrame({...frame(),get items(){getters++;return [];}}),null);assert.equal(getters,0);
 const sparse=Array(1);assert.equal(projectStorePeriodFrame({...populated,items:sparse}),null);
});
