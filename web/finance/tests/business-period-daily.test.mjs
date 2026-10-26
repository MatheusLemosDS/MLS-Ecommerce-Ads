import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {runFinanceBusinessPeriod} from '../src/business-period.mjs';
import {projectBusinessPeriodFrame} from '../src/business-period-frame.mjs';
import {getFinanceBusinessPeriod} from '../../cloudflare/src/app-business-period.mjs';
import {forwardFinancePaymentSample} from '../src/auth-router.mjs';
import {createFinanceWorker} from '../src/connection-worker.mjs';

const origin='https://auth.brazacommerce.com.br',path='/internal/shopee/finance/business-period',header='x-braza-daily-contract',contract='daily-profit-v1';
const router='daily-fixture-router-'+'r'.repeat(40),appKey='daily-fixture-app-'+'a'.repeat(40),hash=value=>createHash('sha256').update(value).digest('hex');
const serial=index=>'PRIVATE_DAILY_ORDER_'+index,list='/api/v2/order/get_order_list',detail='/api/v2/order/get_order_detail',payment='/api/v2/payment/get_escrow_detail';
const input={operation:'start',start_date:'2026-10-23',end_date:'2026-10-26'};
async function fixture(t){
 const db=new D1();t.after(()=>db.db.close());const clock={time:Date.UTC(2026,9,26,18)},now=()=>clock.time;
 const env={FINANCE_DB:db,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,53).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:'private-daily-fixture-key'};
 const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:'PRIVATE_DAILY_ACCESS',refresh_token:'PRIVATE_DAILY_REFRESH',expires_at:now()/1000+14400});
 const epoch=value=>Date.parse(value)/1000,orders=[
  {status:'COMPLETED',created:epoch('2026-10-25T02:59:59Z'),sale:100,payout:80,ads:2,adjustment:-10,after:70},
  {status:'SHIPPED',created:epoch('2026-10-25T03:00:00Z'),sale:50,payout:35,ads:1,adjustment:5,after:40},
  {status:'TO_RETURN',created:epoch('2026-10-26T03:00:00Z')},
  {status:'UNPAID',created:epoch('2026-10-25T12:00:00Z')},
  {status:'COMPLETED',sale:20,payout:10,ads:0,adjustment:0,after:10},
  {status:'CANCELLED',created:epoch('2026-10-24T12:00:00Z')},
  {status:'READY_TO_SHIP',created:epoch('2026-10-26T12:00:00Z'),missing:true},
  {status:'COMPLETED',created:epoch('2026-10-26T13:00:00Z'),sale:30,payout:20,ads:0},
  {status:'COMPLETED',created:epoch('2026-10-25T16:00:00Z'),sale:60,payout:40,ads:0,adjustment:-10,after:31},
 ];
 const calls=[],state={fault:null},provider=response=>Response.json({error:'',response});
 const fetchImpl=async request=>{
  const url=new URL(request.url);calls.push(url);assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(request.method,'GET');for(const name of [header,'cookie','x-braza-app-key','x-braza-finance-router'])assert.equal(request.headers.get(name),null);
  if(url.pathname===list)return provider({order_list:orders.map((_,index)=>({order_sn:serial(index)})),more:false,next_cursor:''});
  if(url.pathname===detail)return provider({order_list:url.searchParams.get('order_sn_list').split(',').map(order_sn=>{const index=Number(order_sn.slice(serial(0).length-1)),order=orders[index];return {order_sn,order_status:order.status,currency:'BRL',...(order.created===undefined?{}:{create_time:order.created}),item_list:[{item_id:100,model_id:index%2,model_quantity_purchased:2}]};})});
  assert.equal(url.pathname,payment);const index=Number(url.searchParams.get('order_sn').slice(serial(0).length-1)),order=orders[index];if(state.fault===index)return Response.json({error:'error_rate_limit'},{status:429});if(order.missing)return Response.json({error:'order_not_ready'});
  return provider({order_sn:serial(index),return_order_sn_list:index===0?['PRIVATE_DAILY_RETURN']:[],order_income:{order_sn:serial(index),original_cost_of_goods_sold:order.sale,escrow_amount:order.payout,ads_escrow_top_up_fee_or_technical_support_fee:order.ads,...(order.adjustment===undefined?{}:{total_adjustment_amount:order.adjustment}),...(order.after===undefined?{}:{escrow_amount_after_adjustment:order.after}),items:[{item_id:100,model_id:index%2,quantity_purchased:2}]}});
 };
 const run=selection=>runFinanceBusinessPeriod(env,{fetchImpl,now,...selection}),start=()=>run(input);
 return {db,env,clock,now,orders,state,calls,run,start};
}
const withoutDaily=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='daily_breakdown'));
const request=(body,headers={})=>new Request(origin+path,{method:'POST',headers:{'content-type':'application/json','x-braza-app-key':appKey,...headers},body:JSON.stringify(body)});
const validateInternalApp=request=>request.headers.get('x-braza-app-key')===appKey;

test('the existing collector captures dates privately and the opt-in read conserves every paid, unpaid and undated row in Brasília days',async t=>{
 const f=await fixture(t),initial=await f.start(),base=await f.run({operation:'step',run_id:initial.run_id});assert.equal(base.status,'COMPLETE');assert.equal(Object.hasOwn(base,'daily_breakdown'),false);
 const calls=f.calls.length,statements=[];const prepare=f.db.prepare.bind(f.db);f.db.prepare=sql=>{statements.push(sql);return prepare(sql);};
 const daily=await f.run({operation:'read',run_id:base.run_id,includeDaily:true}),dailyReads=statements.length;statements.length=0;assert.deepEqual(await f.run({operation:'read',run_id:base.run_id}),base);assert.equal(statements.length,dailyReads);assert.equal(f.calls.length,calls);assert.deepEqual(withoutDaily(daily),base);assert.ok(projectBusinessPeriodFrame(daily));
 const breakdown=daily.daily_breakdown;assert.deepEqual(breakdown.days.map(row=>row.date),['2026-10-23','2026-10-24','2026-10-25','2026-10-26']);
 const [empty,first,second,last]=breakdown.days;assert.equal(empty.coverage.orders,0);assert.deepEqual(empty.items,[]);assert.deepEqual(empty.source_checked_at,{oldest_at:null,latest_at:null});assert.equal(empty.expected_repass_raw,'0');
 assert.equal(first.coverage.orders,2);assert.equal(first.coverage.cancelled,1);assert.equal(first.expected_repass_raw,'80');assert.equal(first.adjustments.after_adjustment_repass_raw,'70');assert.equal(first.adjustments.adjustment_raw,'-10');
 assert.equal(second.coverage.orders,3);assert.equal(second.coverage.unpaid,1);assert.equal(second.expected_repass_raw,'75');assert.equal(second.adjustments.conflict_orders,1);assert.equal(second.adjustments.known_adjustment_raw,'5');assert.equal(second.adjustments.known_after_adjustment_repass_raw,'40');assert.equal(second.adjustments.after_adjustment_repass_raw,null);
 assert.equal(last.coverage.other,1);assert.equal(last.coverage.payment_missing,1);assert.equal(last.known_expected_repass_raw,'20');assert.equal(last.expected_repass_raw,null);assert.equal(last.adjustments.missing_orders,2);
 assert.equal(breakdown.undated.date,null);assert.equal(breakdown.undated.coverage.orders,1);assert.equal(breakdown.undated.expected_repass_raw,'10');assert.equal(breakdown.undated.adjustments.after_adjustment_repass_raw,'10');
 for(const row of [...breakdown.days,breakdown.undated])assert.equal(Object.hasOwn(row,'invoice_tax'),false);
 assert.doesNotMatch(JSON.stringify(daily),/order_sn|PRIVATE|create_time|payload_hash|source_hash|buyer|sku/);
 const saved=f.db.db.prepare('SELECT payload FROM finance_business_order_evidence').all().map(row=>JSON.parse(row.payload));assert.ok(saved.every(row=>row.schema==='financial_order_evidence_v2'));assert.equal(saved.find(row=>row.order_sn===serial(0)).create_time,f.orders[0].created);assert.equal(saved.find(row=>row.order_sn===serial(4)).create_time,null);
});

test('missing, old, altered and foreign private date evidence remains undated without changing monthly money or starting another collection',async t=>{
 const f=await fixture(t),start=await f.start(),base=await f.run({operation:'step',run_id:start.run_id});const before=f.calls.length;
 const saved=f.db.db.prepare('SELECT * FROM finance_business_order_evidence WHERE order_hash=?').get(hash(serial(0))),old=JSON.parse(saved.payload);old.schema='financial_order_evidence_v1';delete old.create_time;let payload=JSON.stringify(old);
 f.db.db.prepare('UPDATE finance_business_order_evidence SET payload=?,payload_hash=? WHERE order_hash=?').run(payload,hash(payload),saved.order_hash);
 const legacy=await f.run({operation:'read',run_id:base.run_id,includeDaily:true});assert.equal(legacy.daily_breakdown.undated.coverage.orders,2);assert.equal(legacy.daily_breakdown.undated.adjustments.covered_orders,2);assert.deepEqual(withoutDaily(legacy),base);
 f.db.db.prepare('UPDATE finance_business_order_evidence SET payload=?,payload_hash=? WHERE order_hash=?').run(saved.payload,'0'.repeat(64),saved.order_hash);
 const altered=await f.run({operation:'read',run_id:base.run_id,includeDaily:true});assert.equal(altered.daily_breakdown.undated.coverage.orders,2);assert.equal(altered.daily_breakdown.undated.adjustments.missing_orders,1);
 const future=JSON.parse(saved.payload);future.create_time=f.now()/1000+86400;payload=JSON.stringify(future);f.db.db.prepare('UPDATE finance_business_order_evidence SET payload=?,payload_hash=? WHERE order_hash=?').run(payload,hash(payload),saved.order_hash);
 const outside=await f.run({operation:'read',run_id:base.run_id,includeDaily:true});assert.equal(outside.daily_breakdown.undated.coverage.orders,2);assert.deepEqual(withoutDaily(outside),base);
 f.db.db.prepare('DELETE FROM finance_business_order_evidence').run();const missing=await f.run({operation:'read',run_id:base.run_id,includeDaily:true});assert.equal(missing.daily_breakdown.undated.coverage.orders,base.coverage.orders);assert.ok(missing.daily_breakdown.days.every(row=>row.coverage.orders===0));assert.deepEqual(withoutDaily(missing),base);assert.equal(f.calls.length,before);
});

test('a failed paid page retains date evidence and resumes without rereading cached payouts or refreshing their observation times',async t=>{
 const f=await fixture(t);f.state.fault=8;const start=await f.start(),paused=await f.run({operation:'step',run_id:start.run_id,includeDaily:true});assert.equal(paused.status,'RUNNING');assert.equal(paused.coverage.orders,0);assert.ok(paused.daily_breakdown.days.every(row=>row.coverage.orders===0));
 const before=f.db.db.prepare('SELECT * FROM finance_business_order_evidence ORDER BY order_hash').all(),paidReads=f.calls.filter(url=>url.pathname===payment).length;assert.ok(before.length>0);
 f.clock.time+=30000;f.state.fault=null;const complete=await f.run({operation:'step',run_id:start.run_id,includeDaily:true});assert.equal(complete.status,'COMPLETE');assert.equal(complete.daily_breakdown.days[1].expected_repass_raw,'80');assert.equal(f.calls.filter(url=>url.pathname===payment).length-paidReads,2,'only the not-ready and failed Payments need another read');
 const saved=f.db.db.prepare('SELECT * FROM finance_business_order_evidence ORDER BY order_hash').all();for(const row of before)assert.deepEqual(saved.find(value=>value.order_hash===row.order_hash),row);assert.equal(complete.daily_breakdown.days[1].source_checked_at.oldest_at,start.checked_at);
});

test('daily dates, cohorts, money, quantities, adjustment coverage and source times are checked together without executing getters',async t=>{
 const f=await fixture(t),start=await f.start(),value=await f.run({operation:'step',run_id:start.run_id,includeDaily:true});assert.ok(projectBusinessPeriodFrame(value));
 const mutations=[v=>v.daily_breakdown.days.reverse(),v=>v.daily_breakdown.days.pop(),v=>{v.daily_breakdown.days[0].date='2026-10-27';},v=>{v.daily_breakdown.timezone='UTC';},v=>v.daily_breakdown.days[1].coverage.orders++,v=>{v.daily_breakdown.days[1].known_expected_repass_raw='81';},v=>{v.daily_breakdown.undated.expected_repass_raw=null;},v=>v.daily_breakdown.days[1].items[0].quantity++,v=>v.daily_breakdown.days[1].items.push({...v.daily_breakdown.days[1].items[0]}),v=>v.daily_breakdown.days[1].adjustments.covered_orders++,v=>{v.daily_breakdown.days[1].adjustments.known_after_adjustment_repass_raw='69';},v=>{v.daily_breakdown.days[2].adjustments.after_adjustment_repass_raw='40';},v=>{v.daily_breakdown.days[1].source_checked_at.oldest_at=v.cutoff_at-1;},v=>{v.daily_breakdown.undated.source_checked_at.latest_at=v.checked_at+1;},v=>{v.daily_breakdown.days[0].order_sn='PRIVATE';}];
 for(const mutate of mutations){const bad=structuredClone(value);mutate(bad);assert.equal(projectBusinessPeriodFrame(bad),null);}
 let reads=0;const bad=structuredClone(value);Object.defineProperty(bad.daily_breakdown.days[1],'coverage',{enumerable:true,get(){reads++;throw Error();}});assert.equal(projectBusinessPeriodFrame(bad),null);assert.equal(reads,0);
 const context=vm.createContext({serialized:JSON.stringify(value)});const detached=vm.runInContext('('+projectBusinessPeriodFrame.toString()+')(JSON.parse(serialized))',context);assert.deepEqual(JSON.parse(JSON.stringify(detached)),value);
 const projected=projectBusinessPeriodFrame(value);projected.daily_breakdown.days[1].items[0].quantity++;assert.notEqual(projected.daily_breakdown.days[1].items[0].quantity,value.daily_breakdown.days[1].items[0].quantity);
});

test('a dense calendar respects both byte ceilings and falls back to the exact complete legacy frame without truncation or provider reads',async t=>{
 const f=await fixture(t),items=Array.from({length:1000},(_,index)=>({item_id:String(10000000000000000000n+BigInt(index)),model_id:'99999999999999999999',quantity:1})),serialized=JSON.stringify(items),dayStamp=Date.parse('2026-10-26T00:00:00Z');
 const outputs=[];
 for(const count of [1,5,15]){
  const start_date=new Date(dayStamp-(count-1)*86400000).toISOString().slice(0,10),start=await f.run({operation:'start',start_date,end_date:'2026-10-26'}),dates=[];
  for(let index=0;index<count;index++){
   const date=new Date(Date.parse(start_date+'T00:00:00Z')+index*86400000).toISOString().slice(0,10);dates.push(date);
   const order_sn='PRIVATE_DENSE_'+count+'_'+index,record={order_hash:hash(order_sn),bucket:'completed',payment_covered:1,sales_raw:'100',escrow_raw:'80',ads_raw:'0',returns_seen:0,items:serialized,checked_at:f.now()/1000},source_hash=hash(JSON.stringify(record));
   f.db.db.prepare('INSERT INTO finance_business_period_orders(run_id,order_hash,bucket,payment_covered,sales_raw,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(start.run_id,record.order_hash,record.bucket,record.payment_covered,record.sales_raw,record.escrow_raw,record.ads_raw,record.returns_seen,record.items,source_hash,record.checked_at);
   const payload=JSON.stringify({schema:'financial_order_evidence_v2',order_sn,order_status:'COMPLETED',currency:'BRL',return_order_sn_list:[],amounts:{escrow_amount_raw:'80',escrow_amount_after_adjustment_raw:'80',total_adjustment_amount_raw:'0'},diagnostic:null,create_time:Date.parse(date+'T12:00:00Z')/1000});
   f.db.db.prepare('INSERT INTO finance_business_order_evidence(run_id,order_hash,source_hash,checked_at,payload,payload_hash) VALUES(?,?,?,?,?,?)').run(start.run_id,record.order_hash,source_hash,record.checked_at,payload,hash(payload));
  }
  f.db.db.prepare("UPDATE finance_business_period_runs SET revision=2,status='COMPLETE',pages_read=1 WHERE run_id=?").run(start.run_id);
  const base=await f.run({operation:'read',run_id:start.run_id}),daily=await f.run({operation:'read',run_id:start.run_id,includeDaily:true});assert.equal(base.items.length,1000);assert.equal(base.product_breakdown.products.length,1000);assert.equal(base.coverage.orders,count);assert.equal(base.status,'COMPLETE');assert.ok(Buffer.byteLength(JSON.stringify(base))<1048576);assert.deepEqual(withoutDaily(daily),base);
  outputs.push({base,daily,dates});
 }
 const [one,combined,dense]=outputs;assert.ok(one.daily.daily_breakdown);assert.equal(one.daily.daily_breakdown.days[0].items.length,1000);
 // Repeated variants across separate dates increase only the optional daily
 // detail. The same canonical group lets us independently verify the rejected
 // candidate's equations and the precise byte boundary that caused fallback.
 for(const {base,daily,dates} of [combined,dense]){
  const group=one.daily.daily_breakdown.days[0],candidate={...base,daily_breakdown:{...one.daily.daily_breakdown,days:dates.map(date=>({...structuredClone(group),date}))}};
  assert.equal(Object.hasOwn(daily,'daily_breakdown'),false);assert.deepEqual(daily,base);assert.equal(projectBusinessPeriodFrame(candidate),null);
  const extraBytes=Buffer.byteLength(JSON.stringify(candidate.daily_breakdown)),fullBytes=Buffer.byteLength(JSON.stringify(candidate));
  if(dates.length===5){assert.ok(extraBytes<524288);assert.ok(fullBytes>1048576);}else assert.ok(extraBytes>524288);
 }
 assert.equal(f.calls.length,0);
});

test('daily negotiation crosses the same private call and mixed versions safely return the exact legacy frame',async t=>{
 const f=await fixture(t),start=await f.start(),value=await f.run({operation:'step',run_id:start.run_id,includeDaily:true}),body={operation:'read',run_id:value.run_id},base=withoutDaily(value);
 for(const mode of ['daily','old-auth','old-finance']){
  let appCalls=0,serviceCalls=0,capabilityCalls=0;const finance=createFinanceWorker({businessPeriod:async(env,options)=>{capabilityCalls++;assert.equal(options.includeDaily,mode==='old-auth'?undefined:true);return mode==='old-finance'?base:value;},fetchImpl:async()=>{throw Error('UNEXPECTED_PROVIDER_READ');}});
  const received=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},body,{fetchImpl:async req=>{appCalls++;assert.equal(req.headers.get(header),contract);if(mode==='old-auth'){const headers=new Headers(req.headers);headers.delete(header);req=new Request(req,{headers});}return forwardFinancePaymentSample(req,{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async upstream=>{serviceCalls++;assert.equal(upstream.headers.get(header),mode==='old-auth'?null:contract);assert.equal(upstream.headers.get('x-braza-app-key'),null);return finance.fetch(upstream,{FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'});}}},{validateInternalApp});}});
  assert.deepEqual(received,mode==='daily'?value:base);assert.deepEqual([appCalls,serviceCalls,capabilityCalls],[1,1,1]);
 }
 const finance=createFinanceWorker({businessPeriod:async()=>value,fetchImpl:async()=>{throw Error('UNEXPECTED_PROVIDER_READ');}}),legacy=await finance.fetch(request(body,{'x-braza-finance-router':router}),{FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'});assert.deepEqual(await legacy.json(),base);
 const auth=await forwardFinancePaymentSample(request(body),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>Response.json(value)}},{validateInternalApp});assert.deepEqual(await auth.json(),base);
 const bad=structuredClone(value);bad.daily_breakdown.days[1].known_expected_repass_raw='81';
 const appRejected=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},body,{fetchImpl:async()=>Response.json(bad)});assert.equal(appRejected.status,'UNAVAILABLE');
 const authRejected=await forwardFinancePaymentSample(request(body),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>Response.json(bad)}},{validateInternalApp});assert.equal(authRejected.status,502);
 const invalid=createFinanceWorker({businessPeriod:async()=>bad,fetchImpl:async()=>{throw Error('UNEXPECTED_PROVIDER_READ');}});assert.equal((await invalid.fetch(request(body,{'x-braza-finance-router':router}),{FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'})).status,502);
 let calls=0;const unavailable={FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>{calls++;return Response.json(value);}}};assert.equal((await forwardFinancePaymentSample(request(body,{[header]:'unknown'}),unavailable,{validateInternalApp})).status,400);assert.equal(calls,0);assert.equal((await finance.fetch(request(body,{[header]:'unknown','x-braza-finance-router':router}),{FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'})).status,400);
});
