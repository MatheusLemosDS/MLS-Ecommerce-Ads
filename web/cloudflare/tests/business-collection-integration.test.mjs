import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {businessMonth,projectBusinessMonth} from '../src/business-month.mjs';
import {runBusinessSync} from '../src/business-sync.mjs';
import {scheduledWork} from '../src/admin.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {createFinanceStore} from '../../finance/src/connection-store.mjs';
import {runFinanceBusinessPeriod} from '../../finance/src/business-period.mjs';

// These tests exercise the real private Finance collector and the real App
// orchestrator. Only Shopee's three read APIs and Ads' upstream data are fake.
const initial=Date.UTC(2026,9,24,12),month='2026-10';
const list='/api/v2/order/get_order_list',detail='/api/v2/order/get_order_detail',payment='/api/v2/payment/get_escrow_detail';
const serial=index=>'PRIVATE_INTEGRATION_ORDER_'+index;
const status=index=>index%10===0?'CANCELLED':index%10===1?'UNPAID':index%2===0?'COMPLETED':'SHIPPED';
const paid=index=>!['CANCELLED','UNPAID'].includes(status(index));
const item=index=>1000+index;
const provider=response=>Response.json({error:'',response});

class MeteredD1 extends D1 {
 constructor(){super();this.calls=0;this.executors=new WeakMap();this.queue=Promise.resolve();}
 prepare(sql){
  const statement=super.prepare(sql),meter=this;
  this.executors.set(statement,statement.run.bind(statement));
  for(const method of ['run','first','all']){const execute=statement[method].bind(statement);statement[method]=async(...args)=>{meter.calls++;return execute(...args);};}
  return statement;
 }
 batch(statements){
  const execute=async()=>{this.calls++;return super.batch(statements.map(statement=>({run:this.executors.get(statement)})));};
  const pending=this.queue.then(execute);this.queue=pending.catch(()=>{});return pending;
 }
}

async function fixture({returns=false}={}){
 const clock={time:initial},now=()=>clock.time,ADMIN_DB=new MeteredD1(),FINANCE_DB=new MeteredD1();
 ADMIN_DB.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)');
 ADMIN_DB.db.prepare('INSERT INTO variant_bindings_state VALUES(1,3,?,?)').run(JSON.stringify(Array.from({length:120},(_,index)=>({item_id:String(item(index)),model_id:'0',size:'P',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}))),new Date(initial).toISOString());
 ADMIN_DB.db.prepare('INSERT INTO production_costs_state VALUES(1,7,?,?)').run(JSON.stringify(COST_DEFAULTS),new Date(initial).toISOString());
 const env={ADMIN_DB},financeEnv={FINANCE_DB,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,19).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:'PRIVATE_INTEGRATION_KEY'};
 const store=await createFinanceStore(financeEnv,{now});await store.setup();await store.saveTokens({access_token:'PRIVATE_INTEGRATION_ACCESS',refresh_token:'PRIVATE_INTEGRATION_REFRESH',expires_at:initial/1000+14400});
 const calls={finance:[],ads:[],list:[],detail:[],payment:[],financeBudgets:[]},state={failIndex:null,failed:false,active:0,maxActive:0};
 const fetchImpl=async request=>{
  const url=new URL(request.url);assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(request.method,'GET');
  if(url.pathname===list){
   const start=Number(url.searchParams.get('time_from')),offset=Number(url.searchParams.get('cursor')||0),size=Number(url.searchParams.get('page_size')),base=start<Date.UTC(2026,9,16,3)/1000?0:60;
   assert.equal(size,20);calls.list.push({base,offset,size});const count=Math.min(size,60-offset),indices=Array.from({length:count},(_,index)=>base+offset+index),more=offset+count<60;
   return provider({order_list:indices.map(index=>({order_sn:serial(index)})),more,next_cursor:more?String(offset+count):''});
  }
  if(url.pathname===detail){
   const ids=url.searchParams.get('order_sn_list').split(',').map(value=>Number(value.slice('PRIVATE_INTEGRATION_ORDER_'.length)));calls.detail.push(ids);assert.ok(ids.length<=20);
   return provider({order_list:ids.map(index=>({order_sn:serial(index),order_status:status(index),currency:'BRL',create_time:Date.UTC(2026,9,index<60?10:20,12)/1000,item_list:[{item_id:item(index),model_id:0,model_quantity_purchased:1}]}))});
  }
  assert.equal(url.pathname,payment);const index=Number(url.searchParams.get('order_sn').slice('PRIVATE_INTEGRATION_ORDER_'.length));assert.ok(paid(index));calls.payment.push(index);
  state.active++;state.maxActive=Math.max(state.maxActive,state.active);await new Promise(resolve=>setTimeout(resolve,1));state.active--;
  if(state.failIndex===index){state.failed=true;return Response.json({error:'upstream_busy'},{status:503});}
  return provider({order_sn:serial(index),return_order_sn_list:returns&&index===2?['PRIVATE_INTEGRATION_RETURN']:[],order_income:{order_sn:serial(index),original_cost_of_goods_sold:65.25,escrow_amount:47.51,ads_escrow_top_up_fee_or_technical_support_fee:0,items:[{item_id:item(index),model_id:0,line_item_id:index+1,quantity_purchased:1}]}});
 };
 const services={
  getFinanceBusinessPeriod:async(_,selection)=>{
   calls.finance.push(selection);const startCalls=FINANCE_DB.calls,startFetches=calls.list.length+calls.detail.length+calls.payment.length;
   const frame=await runFinanceBusinessPeriod(financeEnv,{...selection,fetchImpl,now});
   calls.financeBudgets.push({operation:selection.operation,d1:FINANCE_DB.calls-startCalls,fetches:calls.list.length+calls.detail.length+calls.payment.length-startFetches});return frame;
  },
  getAdsCalendar:async(_,selection)=>{
   calls.ads.push(selection);const children=[],end=Number(selection.end_date.slice(8));
   for(let begin=1;begin<=end;begin+=15){const last=Math.min(begin+14,end),range={start_date:month+'-'+String(begin).padStart(2,'0'),end_date:month+'-'+String(last).padStart(2,'0')};
    children.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:range,balance:30,daily:Array.from({length:last-begin+1},(_,index)=>({date:month+'-'+String(begin+index).padStart(2,'0'),expense:1.25,broad_gmv:12.5,broad_order:1,broad_roas:10,direct_gmv:0,direct_order:0,direct_roas:0}))},range,Math.floor(now()/1000)));
   }
   return buildAdsCalendar(children,selection,Math.floor(now()/1000));
  },
 };
 const invoke=operation=>businessMonth(env,{operation,month},services,{now});
 await businessMonth(env,{operation:'expenses',month,revision:0,external_expenses_cents:1234,recharge_treatment:'UNCONFIRMED'},services,{now,actor:'integration-owner'});
 const immutable={expenses:ADMIN_DB.db.prepare('SELECT * FROM business_month_expenses').all(),bindings:ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_state').all(),costs:ADMIN_DB.db.prepare('SELECT * FROM production_costs_state').all()};
 ADMIN_DB.calls=0;FINANCE_DB.calls=0;
 return {env,financeEnv,clock,now,calls,state,services,invoke,immutable};
}

function verifyMonth(frame,{returns=false}={}){
 assert.ok(projectBusinessMonth(frame));assert.equal(frame.status,'COMPLETE');assert.equal(frame.progress.pages_read,6);assert.equal(frame.progress.order_capacity,120);
 assert.deepEqual(frame.coverage,{orders:120,paid:96,completed:48,ongoing:48,cancelled:12,cancel_pending:0,unpaid:12,other:0,unknown:0,payment_covered:96,payment_missing:0,returns:returns?1:0,returns_unknown:0});
 assert.equal(frame.sales_cents,626400);assert.equal(frame.expected_repass_cents,456096);assert.equal(frame.production_cost_cents,152640);assert.equal(frame.invoice_tax_cents,8605);assert.equal(frame.expenses.external_expenses_cents,1234);assert.equal(frame.ads.expense_cents,3000);
 assert.equal(frame.ads.totals.broad.calculated_roas_raw,'10.000000');assert.equal(frame.result.net_estimate_cents,returns?null:290617);assert.equal(frame.result.net_profit_cents,null);
 assert.deepEqual(frame.result.pending,returns?['RETURNS_NOT_RECONCILED']:[]);
}

test('120 real collector orders finish across two cron ticks with exact costs, monthly DAS, spend and cancellation exclusions',async()=>{
 const f=await fixture(),first=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(first.status,'RUNNING');assert.equal(first.finance_steps,4);assert.equal(first.state.summary.coverage.orders,60);assert.equal(first.state.summary.coverage.cancelled,6);assert.equal(first.ads_reads,0);assert.equal(first.state.failure_count,0);
 assert.equal(f.calls.list.length,3);assert.equal(f.calls.payment.length,48);f.clock.time+=300000;
 const second=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(second.status,'COMPLETE');assert.equal(second.finance_steps,4);assert.equal(second.ads_reads,1);assert.equal(second.state.failure_count,0);
 const frame=await f.invoke('read');verifyMonth(frame);
 assert.equal(f.calls.list.length,6);assert.equal(f.calls.payment.length,96);assert.equal(new Set(f.calls.payment).size,96);assert.equal(f.state.maxActive,4);
 const persisted=f.financeEnv.FINANCE_DB.db.prepare('SELECT order_hash FROM finance_business_period_orders').all();assert.equal(persisted.length,120);assert.equal(new Set(persisted.map(row=>row.order_hash)).size,120);
 assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT * FROM business_month_expenses').all(),f.immutable.expenses);assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_state').all(),f.immutable.bindings);assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT * FROM production_costs_state').all(),f.immutable.costs);
 for(const budget of f.calls.financeBudgets)assert.ok(budget.d1+budget.fetches<=50,JSON.stringify(budget));
 assert.ok(!JSON.stringify(frame).includes('PRIVATE_INTEGRATION'));
});

test('a failed 20-order page resumes its cursor atomically without double-counting and a known return still blocks profit',async()=>{
 const f=await fixture({returns:true});f.state.failIndex=22;
 const first=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(first.status,'ERROR');assert.equal(first.state.summary.coverage.orders,20);assert.equal(first.state.summary.coverage.payment_covered,16);assert.ok(first.state.summary.pending.includes('SOURCE_UNAVAILABLE'));assert.equal(first.state.summary.net_estimate_cents,null);
 assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) AS n FROM finance_business_period_orders').get().n,20);
 f.state.failIndex=null;f.clock.time+=300000;const second=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(second.status,'RUNNING');assert.equal(second.state.failure_count,0);
 f.clock.time+=300000;const third=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(third.status,'COMPLETE');assert.equal(third.ads_reads,1);
 const frame=await f.invoke('read');verifyMonth(frame,{returns:true});assert.equal(frame.coverage.returns,1);assert.equal(frame.known_sales_cents,626400);assert.equal(frame.known_production_cost_cents,152640);
 const offsets=f.calls.list.filter(row=>row.base===0).map(row=>row.offset);assert.equal(offsets[0],0);assert.ok(offsets.slice(1,-1).every(offset=>offset===20));assert.equal(offsets.at(-1),40);assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) AS n FROM finance_business_period_orders').get().n,120);
});

test('scheduled App financial collection stays within 50 D1 RPC per tick for 120 products, excluding separate catalogue and DTF collectors',async t=>{
 const f=await fixture();
 for(let tick=0;tick<2;tick++){
  f.env.ADMIN_DB.calls=0;const financeBefore=f.calls.finance.length,adsBefore=f.calls.ads.length;
  const result=await scheduledWork(f.env,f.services,f.now),privateReads=f.calls.finance.length-financeBefore+f.calls.ads.length-adsBefore;
  t.diagnostic('tick '+tick+': App D1 RPC='+f.env.ADMIN_DB.calls+', private service reads='+privateReads+', collection='+result.collection);
  assert.ok(f.env.ADMIN_DB.calls<=50,'App D1 RPC limit exceeded: '+f.env.ADMIN_DB.calls);
  assert.ok(['RUNNING','COMPLETE'].includes(result.collection));f.clock.time+=300000;
 }
});
