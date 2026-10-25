import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch} from '../src/admin.mjs';
import {D1} from './sqlite-d1.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';

const origin='https://app.example.test';
const stamp=()=>Math.floor(Date.now()/1000);
const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()),month=day.slice(0,7);
async function login(){
 const env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'checkpoint-session-'+ 's'.repeat(32),ADMIN_USERNAME:'checkpoint-owner',ADMIN_PASSWORD:'checkpoint-fixture-password-12345'};
 const response=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(response.status,303);
 const cookie=response.headers.get('set-cookie').split(';')[0];
 const state=await(await adminFetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();
 return {env,cookie,csrf:state.csrf};
}
const read=(auth,query='?month='+month,options={})=>adminFetch(new Request(origin+'/api/admin/finance/checkpoints'+query,{method:options.method||'GET',headers:{cookie:options.cookie??auth.cookie}}),auth.env);
function source(){
 const calls={finance:0,ads:0};
 return {calls,getFinanceBusinessPeriod:async(env,{start_date,end_date})=>{
  calls.finance++;
  return {schema:'finance_business_period_v1',run_id:'11111111-1111-4111-8111-'+String(start_date.slice(8)).padStart(12,'0'),revision:2,status:'COMPLETE',start_date,end_date,cutoff_at:stamp()-1,checked_at:stamp(),currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:0,paid:0,completed:0,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:0,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'0',sales_base_raw:'0',known_expected_repass_raw:'0',expected_repass_raw:'0',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:0,unavailable_orders:0,known_base_raw:'0',known_tax_raw:'0'},items:[],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
 },getAdsCalendar:async(env,selection)=>{
  calls.ads++;
  const children=[];
  for(let start=1;start<=Number(selection.end_date.slice(8));start+=15){
   const start_date=month+'-'+String(start).padStart(2,'0'),end_date=month+'-'+String(Math.min(start+14,Number(selection.end_date.slice(8)))).padStart(2,'0');
   const daily=Array.from({length:Number(end_date.slice(8))-start+1},(_,i)=>({date:month+'-'+String(start+i).padStart(2,'0'),expense:0,broad_gmv:0,direct_gmv:0,broad_order:0,direct_order:0}));
   children.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:{start_date,end_date},balance:999,daily},{start_date,end_date},stamp()));
  }
  return buildAdsCalendar(children,selection,stamp());
 }};
}

test('checkpoint history is owner-only and refuses mutations, duplicate or extraneous scope',async t=>{
 const auth=await login();t.after(()=>auth.env.ADMIN_DB.db.close());
 assert.equal((await read(auth,'?month='+month,{cookie:''})).status,401);
 assert.equal((await read(auth,'?month='+month,{cookie:'mls_session=review'})).status,401);
 assert.equal((await read(auth,'?month='+month,{method:'POST'})).status,405);
 for(const query of ['', '?month='+month+'&month='+month,'?month='+month+'&shop_id=1178167501','?month='+month+'&limit=01','?month='+month+'&limit=21','?month=2099-01','?month=2026-13'])assert.equal((await read(auth,query)).status,400,query);
 const response=await read(auth);assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');
 const body=await response.json();assert.equal(body.schema,'business_checkpoint_history_v1');assert.deepEqual(body.checkpoints,[]);
 assert.equal(auth.env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM hermes_jobs').get().n,0);
});

test('completed monthly reads automatically preserve changed calculations and history never calls the sources',async t=>{
 const auth=await login(),services=source();t.after(()=>auth.env.ADMIN_DB.db.close());
 const invoke=async body=>{const response=await adminFetch(new Request(origin+'/api/admin/finance/business-month',{method:'POST',headers:{cookie:auth.cookie,origin,'x-csrf-token':auth.csrf,'content-type':'application/json'},body:JSON.stringify(body)}),auth.env,services);assert.equal(response.status,200,await response.clone().text());return response.json();};
 let frame=await invoke({operation:'start',month});
 while(frame.status==='RUNNING')frame=await invoke({operation:'step',month});
 let history=await(await read(auth)).json();assert.equal(history.checkpoints.length,1);assert.equal(history.checkpoints[0].checkpoint.result.expected_net_cents,null);
 frame=await invoke({operation:'ads',month});
 frame=await invoke({operation:'expenses',month,revision:0,external_expenses_cents:0,recharge_treatment:'UNCONFIRMED'});
 history=await(await read(auth)).json();
 const current=history.checkpoints[0];
 assert.equal(current.checkpoint.result.expected_net_cents,frame.result.net_estimate_cents);
 assert.equal(current.checkpoint.result.realized_net_cents,null);assert.equal(current.checkpoint.result.realization,'UNVERIFIED');
 assert.equal(current.checkpoint.versions.expenses,1);
 assert.equal(current.checkpoint.lines.find(row=>row.code==='TAX').amount_cents,frame.invoice_tax_cents);
 const count=history.checkpoints.length,calls={...services.calls};
 await invoke({operation:'read',month});
 const reread=await(await read(auth)).json();
 assert.equal(reread.checkpoints.length,count,'the same financial calculation does not create another version');
 assert.deepEqual(services.calls,calls,'history browsing and rereading use stored financial observations');
 const raw=JSON.stringify(reread);for(const forbidden of ['access_token','refresh_token','order_sn','shop_id','buyer','ADMIN_PASSWORD'])assert.ok(!raw.includes(forbidden));
});
