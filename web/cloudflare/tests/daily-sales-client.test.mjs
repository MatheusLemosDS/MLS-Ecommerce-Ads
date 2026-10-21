import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {CLIENT} from '../src/admin-client.mjs';

const now='2026-10-21T15:00:00.000Z';
const snapshot=changes=>({status:'AVAILABLE',schema:'shop_daily_sales_v1',shop_id:1178167501,date:'2026-10-21',timezone:'America/Sao_Paulo',through_at:'2026-10-21T12:00:00-03:00',fetched_at:now,day_partial:true,pagination_complete:true,pages_read:1,duplicate_rows:0,orders_in_api_window:8,orders_with_details:8,sales_orders:4,cancelled_orders:1,cancellation_pending_orders:1,unpaid_orders:1,other_orders:1,unknown_status_orders:0,count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_CURRENT_STATUS',source:'shopee_get_order_list_and_detail',...changes});
function browser(){
 const context=vm.createContext({});
 const projectBegin=CLIENT.indexOf('function projectDailySalesSnapshot('),projectEnd=CLIENT.indexOf('function safeOrderDiagnostic(',projectBegin);
 const loadBegin=CLIENT.indexOf('async function loadShopOrders('),loadEnd=CLIENT.indexOf('let financeSampleBusy=',loadBegin);
 assert.ok(projectBegin>=0&&projectEnd>projectBegin&&loadBegin>=0&&loadEnd>loadBegin);
 new vm.Script(`
  let clockNow=Date.parse(${JSON.stringify(now)});
  class ClockDate extends Date {constructor(...args){super(...(args.length?args:[clockNow]));}static now(){return clockNow;}}
  globalThis.Date=ClockDate;
  let shopOrdersPromise=null,shopOrdersSnapshot=null,shopOrdersRefreshTimer=null,state={};
  let apiCalls=0,nextTimer=0;
  const timers=new Map(),document={hidden:false};
  const setTimeout=(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,delay});return id;};
  const clearTimeout=id=>timers.delete(id);
  const node=(tag,text,cls)=>({tag,textContent:text??'',className:cls??'',children:[],append(...children){this.children.push(...children);},replaceChildren(...children){this.textContent='';this.children=[...children];}});
  const controls=Object.fromEntries(['shopOrders','shopOrdersCount','shopOrdersCutoff','shopOrdersAge','storeDay'].map(id=>[id,node('div')]));
  const el=id=>controls[id];
  const contents=element=>element.textContent+element.children.map(contents).join(' ');
  let current=${JSON.stringify(snapshot())};
  let api=async path=>{if(path!=='shop-orders')throw Error('UNEXPECTED_API');apiCalls++;return current;};
  const safeOrderDiagnostic=()=>null;
  const orderDiagnosticMessage=()=>{throw Error('UNEXPECTED_DIAGNOSTIC');};
  const orderDiagnosticDetails=()=>{throw Error('UNEXPECTED_DIAGNOSTIC');};
  ${CLIENT.slice(projectBegin,projectEnd)}
  ${CLIENT.slice(loadBegin,loadEnd)}
 `).runInContext(context);
 const run=code=>new vm.Script(code).runInContext(context);
 const load=value=>{context.serialized=JSON.stringify(value);run('current=JSON.parse(serialized);');};
 const plain=value=>JSON.parse(JSON.stringify(value));
 return {run,load,plain};
}

test('classified daily sales require current unique-order coverage and exclude cancellation/payment classes',async()=>{
 const b=browser();const value=b.plain(b.run('projectDailySalesSnapshot(current)'));
 assert.equal(value.sales_orders,4);assert.equal(value.orders_in_api_window,8);assert.equal(value.sales_classified,true);
 await b.run('loadShopOrders()');assert.equal(b.run("el('shopOrdersCount').textContent"),'4');
 const text=b.run("contents(el('shopOrders'))");assert.match(text,/Pedidos criados hoje/);assert.match(text,/Cancelados/);assert.match(text,/Em cancelamento/);assert.match(text,/Aguardando pagamento/);
 b.load(snapshot({sales_orders:3,cancelled_orders:2}));await b.run('loadShopOrders()');
 assert.equal(b.run("el('shopOrdersCount').textContent"),'3');assert.equal(b.run('shopOrdersSnapshot.orders_in_api_window'),8);
});

test('legacy raw counts remain explanatory only and are never displayed as confirmed sales',async()=>{
 const b=browser();b.load({...snapshot(),schema:'shop_orders_v1',count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_NO_STATUS_FILTER',order_status_filter:'NONE',source:'shopee_get_order_list'});
 const value=b.plain(b.run('projectDailySalesSnapshot(current)'));
 assert.equal(value.sales_classified,false);assert.equal(value.sales_orders,null);assert.equal(value.orders_in_api_window,8);
 await b.run('loadShopOrders()');assert.equal(b.run("el('shopOrdersCount').textContent"),'—');assert.match(b.run("contents(el('shopOrders'))"),/incluindo cancelados e não pagos/);
});

test('incomplete, stale, inconsistent or malformed data cannot restore a gross count or fake zero',()=>{
 const b=browser();
 for(const change of [{sales_orders:8},{sales_orders:true},{sales_orders:-1},{unknown_status_orders:1},{orders_with_details:7},{pagination_complete:false},{count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_NO_STATUS_FILTER'},{source:'ads'},{timezone:'UTC'},{shop_id:1},{date:'2026-10-20'},{through_at:'2026-10-20T12:00:00-03:00'},{through_at:'2026-10-21T12:02:00-03:00'},{through_at:'2026-10-21T12:00:00Z'},{fetched_at:'2026-10-21T15:02:00Z'},{pages_read:0},{orders_in_api_window:101},{duplicate_rows:100}]){
  b.load(snapshot(change));assert.equal(b.run('projectDailySalesSnapshot(current)'),null,JSON.stringify(change));
 }
});

test('explicit empty covered days show zero while failed refreshes clear the previous confirmed count',async()=>{
 const b=browser();b.load(snapshot({orders_in_api_window:0,orders_with_details:0,sales_orders:0,cancelled_orders:0,cancellation_pending_orders:0,unpaid_orders:0,other_orders:0}));
 await b.run('loadShopOrders()');assert.equal(b.run("el('shopOrdersCount').textContent"),'0');
 b.load(snapshot());await b.run('loadShopOrders()');assert.equal(b.run("el('shopOrdersCount').textContent"),'4');
 b.run("api=async()=>{throw Error('offline');};");await b.run('loadShopOrders()');
 assert.equal(b.run("el('shopOrdersCount').textContent"),'—');assert.equal(b.run('shopOrdersSnapshot'),null);assert.match(b.run("contents(el('shopOrders'))"),/contagem permanece indisponível/);
});

test('refresh scheduling keeps one sixty-second timer, pauses while hidden and resumes with a fresh read',async()=>{
 const b=browser();b.run('scheduleShopOrdersRefresh();scheduleShopOrdersRefresh();');
 assert.equal(b.run('timers.size'),1);assert.equal(b.run('[...timers.values()][0].delay'),60000);
 b.run('document.hidden=true;scheduleShopOrdersRefresh();');assert.equal(b.run('timers.size'),0);
 b.run('document.hidden=false;scheduleShopOrdersRefresh();');const callback=b.run('[...timers.values()][0].callback');
 b.run('timers.clear();');callback();await b.run('shopOrdersPromise');assert.equal(b.run('apiCalls'),1);assert.equal(b.run('timers.size'),1);
 b.run('document.hidden=true;');callback();assert.equal(b.run('apiCalls'),1);
});

test('overlapping manual and automatic refreshes share the same read and leave one future timer',async()=>{
 const b=browser();b.run('api=()=>{apiCalls++;return new Promise(resolve=>globalThis.resolveRead=resolve);};');
 const a=b.run('loadShopOrders()'),other=b.run('loadShopOrders()');assert.equal(b.run('apiCalls'),1);
 b.run('resolveRead(current);');await Promise.all([a,other]);
 assert.equal(b.run("el('shopOrdersCount').textContent"),'4');assert.equal(b.run('timers.size'),1);
});

test('crossing the São Paulo date clears the old count before a new snapshot is received',async()=>{
 const b=browser();await b.run('loadShopOrders()');
 b.run('clockNow+=86400000;api=()=>{apiCalls++;return new Promise(resolve=>globalThis.resolveRead=resolve);};updateShopSnapshotAge();');
 assert.equal(b.run("el('shopOrdersCount').textContent"),'—');assert.equal(b.run('shopOrdersSnapshot'),null);assert.equal(b.run('apiCalls'),2);
 b.run('updateShopSnapshotAge();');assert.equal(b.run('apiCalls'),2);
 b.run("resolveRead({...current,date:'2026-10-22',through_at:'2026-10-22T12:00:00-03:00',fetched_at:'2026-10-22T15:00:00Z',sales_orders:3,cancelled_orders:2});");await b.run('shopOrdersPromise');
 assert.equal(b.run("el('shopOrdersCount').textContent"),'3');assert.equal(b.run('shopOrdersSnapshot.date'),'2026-10-22');
});


test('unknown statuses keep their pending coverage visible instead of silently claiming a complete sales count',async()=>{
 const b=browser();b.load(snapshot({sales_orders:3,unknown_status_orders:1}));await b.run('loadShopOrders()');
 assert.equal(b.run("el('shopOrdersCount').textContent"),'3');assert.match(b.run("contents(el('shopOrders'))"),/Contagem parcial/);assert.match(b.run("contents(el('shopOrders'))"),/sem situação reconhecida/);
 b.load(snapshot({through_at:'2026-10-21T11:57:59-03:00'}));assert.equal(b.run('projectDailySalesSnapshot(current)'),null);
});
