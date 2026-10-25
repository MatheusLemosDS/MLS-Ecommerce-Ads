import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch} from '../src/admin.mjs';
import {D1} from './sqlite-d1.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';

const origin='https://app.example.test';
const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()),month=day.slice(0,7),stamp=()=>Math.floor(Date.now()/1000);
async function login(){
 const env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'fixture-month-session-'+ 's'.repeat(32),ADMIN_USERNAME:'month-admin',ADMIN_PASSWORD:'fixture-month-password-1234567890'};
 const response=await adminFetch(new Request(origin+'/admin/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(response.status,303);const cookie=response.headers.get('set-cookie').split(';')[0],state=await(await adminFetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();
 return {env,cookie,csrf:state.csrf};
}
const request=(auth,body,options={})=>new Request(origin+'/api/admin/finance/business-month'+(options.search||''),{method:options.method||'POST',headers:{cookie:options.cookie??auth.cookie,origin:options.origin??origin,'x-csrf-token':options.csrf??auth.csrf,'content-type':'application/json'},body:['GET','HEAD'].includes(options.method)?undefined:options.raw??JSON.stringify(body)});
const snapshot=auth=>({expenses:auth.env.ADMIN_DB.db.prepare('SELECT * FROM business_month_expenses').all(),audit:auth.env.ADMIN_DB.db.prepare('SELECT * FROM business_month_expenses_audit').all(),jobs:auth.env.ADMIN_DB.db.prepare('SELECT id FROM hermes_jobs').all()});
const emptyFrame=selection=>({schema:'finance_business_period_v1',run_id:'11111111-1111-4111-8111-'+String(selection.start_date.slice(8)).padStart(12,'0'),revision:2,status:'COMPLETE',...selection,cutoff_at:stamp()-1,checked_at:stamp(),currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:0,paid:0,completed:0,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:0,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'0',sales_base_raw:'0',known_expected_repass_raw:'0',expected_repass_raw:'0',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:0,unavailable_orders:0,known_base_raw:'0',known_tax_raw:'0'},items:[],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'});
function services(){
 const calls={finance:0,ads:0};
 return {calls,getFinanceBusinessPeriod:async(env,selection)=>{calls.finance++;assert.equal(selection.operation,'start');const {start_date,end_date}=selection;return emptyFrame({start_date,end_date});},getAdsCalendar:async(env,selection)=>{
  calls.ads++;const count=Number(selection.end_date.slice(8)),children=[];
  for(let start=1;start<=count;start+=15){const begin=month+'-'+String(start).padStart(2,'0'),end=month+'-'+String(Math.min(start+14,count)).padStart(2,'0'),daily=Array.from({length:Math.min(15,count-start+1)},(_,i)=>({date:month+'-'+String(start+i).padStart(2,'0'),expense:0,broad_gmv:0,direct_gmv:0,broad_order:0,direct_order:0}));children.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:{start_date:begin,end_date:end},balance:50,daily},{start_date:begin,end_date:end},stamp()));}
  return buildAdsCalendar(children,selection,stamp());
 }};
}

test('monthly collection is admin-only, exact-origin and CSRF protected before any source or expense write',async()=>{
 const auth=await login(),source=services(),before=snapshot(auth),body={operation:'start',month};
 for(const [options,status] of [[{cookie:''},401],[{cookie:'mls_session=review'},401],[{origin:'https://other.invalid'},403],[{csrf:''},403],[{method:'GET'},400],[{method:'HEAD'},405]])assert.equal((await adminFetch(request(auth,body,options),auth.env,source)).status,status);
 for(const input of [{...body,shop_id:1178167501},{...body,month:'2026-13'},{...body,operation:'publish'},{}])assert.equal((await adminFetch(request(auth,input),auth.env,source)).status,400);
 assert.equal((await adminFetch(request(auth,body,{search:'?month='+month}),auth.env,source)).status,400);
 assert.equal((await adminFetch(request(auth,body,{raw:' '.repeat(513)+JSON.stringify(body)}),auth.env,source)).status,413);
 assert.deepEqual(source.calls,{finance:0,ads:0});assert.deepEqual(snapshot(auth),before);
});

test('owner GET observes a saved month without replaying source requests or changing expenses',async()=>{
 const auth=await login(),source=services();
 const started=await adminFetch(request(auth,{operation:'start',month}),auth.env,source);assert.equal(started.status,200);const saved=await started.json(),before=snapshot(auth),calls={...source.calls};
 const response=await adminFetch(new Request(origin+'/api/admin/finance/business-month?month='+month,{headers:{cookie:auth.cookie}}),auth.env,source);
 assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),null);assert.ok(/no-store/.test(response.headers.get('cache-control')));
 const observed=await response.json();assert.equal(observed.month,saved.month);assert.deepEqual(observed.progress,saved.progress);assert.deepEqual(observed.coverage,saved.coverage);assert.equal(observed.sales_cents,saved.sales_cents);assert.deepEqual(source.calls,calls);assert.deepEqual(snapshot(auth),before);
 for(const cookie of ['', 'mls_session=review'])assert.equal((await adminFetch(request(auth,undefined,{method:'GET',search:'?month='+month,cookie}),auth.env,source)).status,401);
 for(const search of ['', '?month=', '?month=2026-13', '?month=2026-1', '?month='+month+'&month='+month, '?month='+month+'&operation=step', '?shop_id=1178167501', '?Month='+month]){
  const invalid=await adminFetch(request(auth,undefined,{method:'GET',search}),auth.env,source);assert.equal(invalid.status,400,search);assert.deepEqual(await invalid.json(),{error:'BUSINESS_MONTH_REQUEST_INVALID'});
 }
 assert.equal((await adminFetch(request(auth,undefined,{method:'HEAD',search:'?month='+month}),auth.env,source)).status,405);
 assert.deepEqual(source.calls,calls);assert.deepEqual(snapshot(auth),before);
});

test('owner GET can prepare an uncollected month without calling finance or Ads',async()=>{
 const auth=await login(),source=services(),before=snapshot(auth),response=await adminFetch(request(auth,undefined,{method:'GET',search:'?month='+month,csrf:''}),auth.env,source);
 assert.equal(response.status,200);const observed=await response.json();assert.equal(observed.month,month);assert.equal(observed.status,'RUNNING');assert.equal(observed.coverage.orders,0);assert.deepEqual(source.calls,{finance:0,ads:0});assert.deepEqual(snapshot(auth),before);
});

test('a complete empty MEI month still deducts its one monthly DAS after the zero external expense declaration, without a Hermes job',async()=>{
 const auth=await login(),source=services(),invoke=async body=>{const response=await adminFetch(request(auth,body),auth.env,source);assert.equal(response.status,200);return response.json();};
 let result=await invoke({operation:'start',month});for(let i=0;i<3&&result.status==='RUNNING';i++)result=await invoke({operation:'step',month});
 assert.equal(result.status,'COMPLETE');assert.equal(result.coverage.paid,0);assert.equal(result.result.net_estimate_cents,null);
 result=await invoke({operation:'ads',month});assert.equal(result.ads.expense_cents,0);assert.equal(result.ads.balance_cents,5000);assert.equal(result.result.net_estimate_cents,null);
 result=await invoke({operation:'expenses',month,revision:0,external_expenses_cents:0,recharge_treatment:'UNCONFIRMED'});assert.equal(result.result.net_estimate_cents,-8605);assert.equal(result.invoice_tax_cents,8605);assert.equal(result.tax.regime,'MEI');assert.equal(result.result.net_profit_cents,null);assert.deepEqual(result.result.pending,[]);
 const before=snapshot(auth),calls={...source.calls};assert.equal(before.audit.length,1);assert.equal(before.expenses.length,1);assert.equal(before.audit[0].actor,'admin');
 await invoke({operation:'read',month});assert.deepEqual(source.calls,calls);assert.deepEqual(snapshot(auth),before);
 const conflict=await adminFetch(request(auth,{operation:'expenses',month,revision:0,external_expenses_cents:900,recharge_treatment:'UNCONFIRMED'}),auth.env,source);assert.equal(conflict.status,409);assert.deepEqual(snapshot(auth),before);
});

test('a poisoned monthly source cannot cross the authenticated aggregate boundary or produce a confirmed total',async()=>{
 const auth=await login(),source=services();source.getFinanceBusinessPeriod=async(env,{start_date,end_date})=>({...emptyFrame({start_date,end_date}),access_token:'PRIVATE_PROVIDER_TOKEN'});
 const response=await adminFetch(request(auth,{operation:'start',month}),auth.env,source);assert.equal(response.status,503);const raw=await response.text();assert.ok(!raw.includes('PRIVATE_PROVIDER_TOKEN'));assert.deepEqual(snapshot(auth),{expenses:[],audit:[],jobs:[]});
});
