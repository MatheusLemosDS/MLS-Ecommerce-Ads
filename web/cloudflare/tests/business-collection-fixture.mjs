import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {businessMonth,projectBusinessMonth} from '../src/business-month.mjs';
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
 constructor(){super();this.calls=0;this.executors=new WeakMap();this.queue=Promise.resolve();this.onRpc=null;}
 dispatch(work){const pending=this.queue.then(work);this.queue=pending.catch(()=>{});return pending;}
 prepare(sql){
  const statement=super.prepare(sql),meter=this;
  this.executors.set(statement,statement.run.bind(statement));statement.sql=sql;
  for(const method of ['run','first','all']){const execute=statement[method].bind(statement);statement[method]=(...args)=>meter.dispatch(async()=>{meter.calls++;if(meter.onRpc)await meter.onRpc({kind:method,sql});return execute(...args);});}
  return statement;
 }
 batch(statements){
  const execute=async()=>{this.calls++;if(this.onRpc)await this.onRpc({kind:'batch',sql:statements.map(statement=>statement.sql).join(' | ')});return super.batch(statements.map(statement=>({run:this.executors.get(statement)})));};
  return this.dispatch(execute);
 }
}

export async function collectionFixture({returns=false,allPaid=false,daily=false,windowCounts=[60,60],paymentTimeoutMs=5000,paymentDelayMs=1}={}){
 const clock={time:initial},now=()=>clock.time,ADMIN_DB=new MeteredD1(),FINANCE_DB=new MeteredD1(),orderStatus=index=>allPaid?'COMPLETED':status(index);
 ADMIN_DB.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)');
 ADMIN_DB.db.prepare('INSERT INTO variant_bindings_state VALUES(1,3,?,?)').run(JSON.stringify(Array.from({length:120},(_,index)=>({item_id:String(item(index)),model_id:'0',size:'P',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}))),new Date(initial).toISOString());
 ADMIN_DB.db.prepare('INSERT INTO production_costs_state VALUES(1,7,?,?)').run(JSON.stringify(COST_DEFAULTS),new Date(initial).toISOString());
 const env={ADMIN_DB},financeEnv={FINANCE_DB,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,19).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:'PRIVATE_INTEGRATION_KEY'};
 const store=await createFinanceStore(financeEnv,{now});await store.setup();await store.saveTokens({access_token:'PRIVATE_INTEGRATION_ACCESS',refresh_token:'PRIVATE_INTEGRATION_REFRESH',expires_at:initial/1000+14400});
 const calls={finance:[],financeFrames:[],ads:[],list:[],detail:[],payment:[],financeBudgets:[]},state={failIndex:null,failed:false,active:0,maxActive:0,paymentHook:null,listHook:null,detailHook:null};
 const fetchImpl=async request=>{
  const url=new URL(request.url);assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(request.method,'GET');
  if(url.pathname===list){
   const start=Number(url.searchParams.get('time_from')),offset=Number(url.searchParams.get('cursor')||0),size=Number(url.searchParams.get('page_size')),base=start<Date.UTC(2026,9,16,3)/1000?0:60;
   assert.equal(size,20);calls.list.push({base,offset,size});if(state.listHook){const fault=await state.listHook({base,offset,size,clock,request});if(fault instanceof Response)return fault;}const total=windowCounts[base===0?0:1],count=Math.min(size,total-offset),indices=Array.from({length:count},(_,index)=>base+offset+index),more=offset+count<total;
   return provider({order_list:indices.map(index=>({order_sn:serial(index)})),more,next_cursor:more?String(offset+count):''});
  }
  if(url.pathname===detail){
   const ids=url.searchParams.get('order_sn_list').split(',').map(value=>Number(value.slice('PRIVATE_INTEGRATION_ORDER_'.length)));calls.detail.push(ids);assert.ok(ids.length<=20);
   if(state.detailHook){const fault=await state.detailHook({ids,clock,request});if(fault instanceof Response)return fault;}return provider({order_list:ids.map(index=>({order_sn:serial(index),order_status:orderStatus(index),currency:'BRL',create_time:Date.UTC(2026,9,index<60?10:20,12)/1000,item_list:[{item_id:item(index),model_id:0,model_quantity_purchased:1}]}))});
  }
  assert.equal(url.pathname,payment);const index=Number(url.searchParams.get('order_sn').slice('PRIVATE_INTEGRATION_ORDER_'.length));assert.ok(allPaid||paid(index));calls.payment.push(index);
  state.active++;state.maxActive=Math.max(state.maxActive,state.active);if(paymentDelayMs)await new Promise(resolve=>setTimeout(resolve,paymentDelayMs));state.active--;
  if(state.failIndex===index){state.failed=true;return Response.json({error:'upstream_busy'},{status:503});}
  if(state.paymentHook){const fault=await state.paymentHook({index,clock,request});if(fault instanceof Response)return fault;}
  return provider({order_sn:serial(index),return_order_sn_list:returns&&index===2?['PRIVATE_INTEGRATION_RETURN']:[],order_income:{order_sn:serial(index),original_cost_of_goods_sold:65.25,escrow_amount:47.51,ads_escrow_top_up_fee_or_technical_support_fee:0,items:[{item_id:item(index),model_id:0,line_item_id:index+1,quantity_purchased:1}]}});
 };
 const services={
  getFinanceBusinessPeriod:async(_,selection)=>{
   calls.finance.push(selection);const startCalls=FINANCE_DB.calls,startFetches=calls.list.length+calls.detail.length+calls.payment.length;
   const frame=await runFinanceBusinessPeriod(financeEnv,{...selection,fetchImpl,now,timeoutMs:paymentTimeoutMs,includeDaily:daily});calls.financeFrames.push(frame);
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
 return {env,financeEnv,clock,now,calls,state,services,invoke,immutable,fetchImpl,serial,item,orderStatus,provider};
}
