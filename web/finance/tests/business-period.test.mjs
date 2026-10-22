import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {runFinanceBusinessPeriod} from '../src/business-period.mjs';
import {projectBusinessPeriodFrame} from '../src/business-period-frame.mjs';

const key='fixture-business-partner-key-ç',access='PRIVATE_BUSINESS_ACCESS',refresh='PRIVATE_BUSINESS_REFRESH';
const list='/api/v2/order/get_order_list',detail='/api/v2/order/get_order_detail',payment='/api/v2/payment/get_escrow_detail';
const serial=index=>'PRIVATE_BUSINESS_ORDER_'+index;
const provider=response=>Response.json({error:'',request_id:'PRIVATE_BUSINESS_REQUEST',response});
const defaults=['COMPLETED','READY_TO_SHIP','CANCELLED','UNPAID','IN_CANCEL','SHIPPED','TO_RETURN','FUTURE_STATUS','PROCESSED'];
const eligible=status=>['COMPLETED','READY_TO_SHIP','PROCESSED','RETRY_SHIP','SHIPPED','TO_CONFIRM_RECEIVE','INVOICE_PENDING'].includes(status);
async function fixture(statuses=defaults){
 const db=new D1(),clock={time:Date.UTC(2026,9,20,15)},now=()=>clock.time;
 let queue=Promise.resolve();const batch=db.batch.bind(db);db.batch=statements=>{const next=queue.then(()=>batch(statements));queue=next.catch(()=>{});return next;};
 const env={FINANCE_DB:db,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,31).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:key};
 const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:access,refresh_token:refresh,expires_at:Math.floor(now()/1000)+14400});
 const calls=[],state={statuses:[...statuses],mode:'normal',active:0,maxActive:0,hold:false,started:null,release:null,base:100};
 const fetchImpl=async request=>{
  const url=new URL(request.url);calls.push(request);
  assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(request.method,'GET');assert.equal(request.redirect,'manual');assert.equal(request.headers.get('accept'),'application/json');assert.equal(await request.clone().text(),'');
  for(const name of ['cookie','authorization','x-braza-app-key','x-braza-finance-router','x-braza-gateway-key'])assert.equal(request.headers.get(name),null);
  assert.equal(url.searchParams.get('partner_id'),'2049333');assert.equal(url.searchParams.get('shop_id'),'1178167501');assert.equal(url.searchParams.get('access_token'),access);
  assert.equal(url.searchParams.get('sign'),createHmac('sha256',key).update('2049333'+url.pathname+url.searchParams.get('timestamp')+access+'1178167501').digest('hex'));
  if(url.pathname===list){
   if(state.started){state.started();state.started=null;}if(state.hold)await new Promise(resolve=>state.release=resolve);
   if(state.mode==='list-http')return Response.json({error:'error_sign',message:key},{status:403});
   assert.equal(url.searchParams.has('order_status'),false);assert.equal(url.searchParams.get('time_range_field'),'create_time');assert.equal(url.searchParams.get('page_size'),'5');
   const cursor=url.searchParams.get('cursor'),offset=cursor===''?0:cursor==='cursor-loop'?5:Number(cursor.slice(7)),indices=Array.from({length:Math.min(5,state.statuses.length-offset)},(_,i)=>i+offset);
   if(state.mode==='duplicate'&&offset===5)indices[0]=0;
   const more=offset+5<state.statuses.length;
   return provider({order_list:indices.map(index=>({order_sn:serial(index),order_status:'CANCELLED'})),more,next_cursor:state.mode==='loop'&&more?'cursor-loop':more?'cursor-'+(offset+5):''});
  }
  if(url.pathname===detail){
   const ids=url.searchParams.get('order_sn_list').split(',');
   const rows=ids.map(sn=>{const index=Number(sn.slice(serial(0).length-1));return {order_sn:sn,order_status:state.statuses[index],currency:state.mode==='currency'?'USD':'BRL',create_time:Date.UTC(2026,9,20,12)/1000,item_list:[{item_id:100,model_id:index%2,model_quantity_purchased:2}],buyer_username:'PRIVATE_BUSINESS_BUYER'};});
   if(state.mode==='detail-foreign')rows[0].order_sn='PRIVATE_FOREIGN';
   if(state.mode==='detail-missing')rows.pop();
   if(state.mode==='date-foreign')rows[0].create_time=Date.UTC(2026,9,1)/1000;
   return provider({order_list:rows});
  }
  assert.equal(url.pathname,payment);const index=Number(url.searchParams.get('order_sn').slice(serial(0).length-1));assert.ok(eligible(state.statuses[index]));
  state.active++;state.maxActive=Math.max(state.active,state.maxActive);await new Promise(resolve=>setTimeout(resolve,2));state.active--;
  if(state.mode==='ongoing-unavailable'&&state.statuses[index]!=='COMPLETED')return Response.json({error:'order_not_ready',message:'PRIVATE_BUSINESS_MESSAGE'},{status:503});
  if(state.mode==='ongoing-api-unavailable'&&state.statuses[index]!=='COMPLETED')return Response.json({error:'order_not_found',message:'PRIVATE_BUSINESS_MESSAGE'});
  if(state.mode==='ongoing-auth-rejected'&&state.statuses[index]!=='COMPLETED')return Response.json({error:'error_auth',message:key},{status:403});
  if(state.mode==='ongoing-malformed'&&state.statuses[index]!=='COMPLETED')return new Response('PRIVATE_BAD_JSON',{headers:{'content-type':'application/json'}});
  const order_income={order_sn:serial(index),original_cost_of_goods_sold:state.base,escrow_amount:20+index,ads_escrow_top_up_fee_or_technical_support_fee:0,items:[{item_id:100,model_id:index%2,line_item_id:1000+index,quantity_purchased:2,selling_price:999,buyer:'PRIVATE_BUSINESS_BUYER'}]};
  if(state.mode==='amount-missing')delete order_income.escrow_amount;
  if(state.mode==='amount-null')order_income.original_cost_of_goods_sold=null;
  if(state.mode==='amount-string')order_income.original_cost_of_goods_sold='100';
  if(state.mode==='amount-subcent')order_income.escrow_amount=0.1+0.2;
  if(state.mode==='payment-foreign')order_income.order_sn='PRIVATE_FOREIGN';
  if(state.mode==='payment-items')order_income.items[0].quantity_purchased=3;
  if(state.mode==='payment-scope')order_income.shop_id=123;
  if(state.mode==='signed'){order_income.escrow_amount=-1.25;order_income.ads_escrow_top_up_fee_or_technical_support_fee=-0.5;}
  const response={order_sn:serial(index),order_income};
  if(state.mode!=='returns-unknown')response.return_order_sn_list=state.mode==='with-return'?['PRIVATE_BUSINESS_RETURN']:[];
  return provider(response);
 };
 const run=input=>runFinanceBusinessPeriod(env,{fetchImpl,now,...input}),start=()=>run({operation:'start',start_date:'2026-10-14',end_date:'2026-10-20'});
 return {db,env,clock,now,store,calls,state,fetchImpl,run,start};
}
const snapshot=f=>({runs:f.db.db.prepare('SELECT * FROM finance_business_period_runs ORDER BY run_id').all(),orders:f.db.db.prepare('SELECT * FROM finance_business_period_orders ORDER BY run_id,order_hash').all(),cursors:f.db.db.prepare('SELECT * FROM finance_business_period_cursors ORDER BY run_id,cursor_hash').all()});
async function finish(f){let frame=await f.start();for(let steps=0;frame.status==='RUNNING'&&steps<202;steps++){frame=await f.run({operation:'step',run_id:frame.run_id});if(frame.diagnostic)break;}return frame;}

test('start/read is private, scoped and read-only; invalid periods and bindings fail before provider calls',async()=>{
 const f=await fixture(),before=await f.store.readTokens(),frame=await f.start();assert.ok(projectBusinessPeriodFrame(frame));assert.equal(frame.status,'RUNNING');assert.equal(frame.coverage.orders,0);assert.equal(frame.expected_repass_raw,'0');assert.equal(f.calls.length,0);assert.deepEqual(await f.run({operation:'read',run_id:frame.run_id}),frame);
 const stored=snapshot(f).runs[0];assert.equal(stored.time_from,Date.UTC(2026,9,14,3)/1000);assert.equal(stored.time_to,f.now()/1000);
 for(const input of [{operation:'start',start_date:'2026-10-01',end_date:'2026-10-20'},{operation:'start',start_date:'2026-10-21',end_date:'2026-10-21'},{operation:'read',run_id:'bad'}])await assert.rejects(f.run(input));
 await assert.rejects(f.run({operation:'read',run_id:'11111111-1111-4111-8111-111111111111'}));
 for(const env of [{...f.env,FINANCE_CONNECTION_ENABLED:'false'},{...f.env,ADMIN_DB:f.env.FINANCE_DB},{...f.env,FINANCE_DB:null}])await assert.rejects(runFinanceBusinessPeriod(env,{operation:'read',run_id:frame.run_id}));
 assert.equal(f.calls.length,0);assert.deepEqual(await f.store.readTokens(),before);
});

test('all detail statuses are classified, paid/completed share the cohort, and nonpaid orders never request Payment',async()=>{
 const f=await fixture(),frame=await finish(f);assert.equal(frame.status,'COMPLETE');assert.equal(frame.pages_read,2);assert.deepEqual(frame.coverage,{orders:9,paid:4,completed:1,ongoing:3,cancelled:1,cancel_pending:1,unpaid:1,other:1,unknown:1,payment_covered:4,payment_missing:0,returns:0,returns_unknown:0});
 assert.equal(frame.sales_base_raw,'400');assert.equal(frame.expected_repass_raw,'94');assert.equal(frame.ads_adjustment_raw,'0');assert.equal(frame.invoice_tax.known_tax_raw,'8');assert.deepEqual(frame.items,[{item_id:'100',model_id:'0',quantity:4},{item_id:'100',model_id:'1',quantity:4}]);assert.ok(f.state.maxActive<=2);assert.equal(f.state.maxActive,2);
 const payments=f.calls.filter(request=>new URL(request.url).pathname===payment);assert.equal(payments.length,4);assert.deepEqual(new Set(payments.map(request=>new URL(request.url).searchParams.get('order_sn'))),new Set([0,1,5,8].map(serial)));
 const callCount=f.calls.length;assert.deepEqual(await f.run({operation:'step',run_id:frame.run_id}),frame);assert.deepEqual(await f.run({operation:'read',run_id:frame.run_id}),frame);assert.equal(f.calls.length,callCount);
 for(const secret of [key,access,refresh,'PRIVATE_BUSINESS_ORDER','PRIVATE_BUSINESS_BUYER','PRIVATE_BUSINESS_RETURN','cursor-','selling_price']){assert.ok(!JSON.stringify(frame).includes(secret));assert.ok(!JSON.stringify(snapshot(f)).includes(secret)||secret==='cursor-');}
 assert.equal(snapshot(f).orders[0].order_hash.length,64);assert.ok(snapshot(f).orders.some(row=>row.order_hash===createHash('sha256').update(serial(0)).digest('hex')));
});

test('every supported active status is a paid order and cancellation classes cannot inflate sales',async()=>{
 const statuses=['READY_TO_SHIP','PROCESSED','RETRY_SHIP','SHIPPED','TO_CONFIRM_RECEIVE','COMPLETED','INVOICE_PENDING','CANCELLED','IN_CANCEL','UNPAID','TO_RETURN','UNRECOGNIZED'];
 const f=await fixture(statuses),frame=await finish(f);assert.equal(frame.coverage.paid,7);assert.equal(frame.coverage.completed,1);assert.equal(frame.coverage.ongoing,6);assert.equal(frame.coverage.cancelled,1);assert.equal(frame.coverage.cancel_pending,1);assert.equal(frame.coverage.unpaid,1);assert.equal(frame.coverage.other,1);assert.equal(frame.coverage.unknown,1);assert.equal(frame.sales_base_raw,'700');
});

test('ongoing Payment unavailable keeps its detail quantities and missing coverage, never zero or a fake total',async()=>{
 for(const mode of ['ongoing-unavailable','ongoing-api-unavailable']){
  const f=await fixture(['COMPLETED','SHIPPED']);f.state.mode=mode;const frame=await finish(f);
  assert.equal(frame.status,'COMPLETE');assert.equal(frame.diagnostic,null);assert.equal(frame.coverage.paid,2);assert.equal(frame.coverage.payment_covered,1);assert.equal(frame.coverage.payment_missing,1);assert.equal(frame.coverage.returns_unknown,1);assert.equal(frame.known_expected_repass_raw,'20');assert.equal(frame.expected_repass_raw,null);assert.equal(frame.known_sales_base_raw,'100');assert.equal(frame.sales_base_raw,null);assert.equal(frame.ads_adjustment_raw,null);assert.equal(frame.invoice_tax.covered_orders,1);assert.equal(frame.invoice_tax.unavailable_orders,1);assert.equal(frame.invoice_tax.known_tax_raw,'2');assert.equal(frame.items.reduce((sum,row)=>sum+row.quantity,0),4);assert.ok(projectBusinessPeriodFrame(frame));
 }
});

test('missing legitimate Payment amounts remain an atomic missing payment without dropping paid production quantities',async()=>{
 for(const mode of ['amount-missing','amount-null']){
  const f=await fixture(['COMPLETED','SHIPPED']);f.state.mode=mode;const frame=await finish(f);assert.equal(frame.status,'COMPLETE');assert.equal(frame.coverage.payment_missing,2);assert.equal(frame.known_sales_base_raw,'0');assert.equal(frame.sales_base_raw,null);assert.equal(frame.known_expected_repass_raw,'0');assert.equal(frame.expected_repass_raw,null);assert.equal(frame.invoice_tax.covered_orders,0);assert.equal(frame.invoice_tax.known_tax_raw,'0');assert.equal(frame.items.reduce((sum,row)=>sum+row.quantity,0),4);
 }
});

test('malformed identity, Payment poison, authorization and list/detail failures stop without committing a partial page',async()=>{
 for(const mode of ['list-http','currency','detail-foreign','detail-missing','date-foreign','amount-string','amount-subcent','payment-foreign','payment-items','payment-scope','ongoing-auth-rejected','ongoing-malformed']){
  const f=await fixture(['COMPLETED','SHIPPED']),job=await f.start(),before=snapshot(f),tokens=await f.store.readTokens();f.state.mode=mode;
  const frame=await f.run({operation:'step',run_id:job.run_id});assert.equal(frame.status,'RUNNING',mode);assert.equal(frame.diagnostic,'BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE',mode);assert.equal(frame.pages_read,0);assert.equal(frame.coverage.orders,0);assert.equal(frame.revision,job.revision);assert.deepEqual(snapshot(f).orders,before.orders);assert.deepEqual(snapshot(f).cursors,before.cursors);assert.deepEqual(await f.store.readTokens(),tokens);
  for(const secret of [key,access,'PRIVATE_BUSINESS','PRIVATE_FOREIGN'])assert.ok(!JSON.stringify(frame).includes(secret));
  f.state.mode='normal';const resumed=await f.run({operation:'step',run_id:job.run_id});assert.equal(resumed.status,'COMPLETE',mode);assert.equal(resumed.coverage.orders,2);
 }
});

test('invoice tax is rounded per order and signed payout/adjustment values retain exact cents',async()=>{
 const f=await fixture(['COMPLETED','SHIPPED']);f.state.base=.25;const frame=await finish(f);assert.equal(frame.sales_base_raw,'0.5');assert.equal(frame.invoice_tax.known_tax_raw,'0.02');assert.ok(projectBusinessPeriodFrame(frame));
 const g=await fixture(['COMPLETED','SHIPPED']);g.state.mode='signed';const signed=await finish(g);assert.equal(signed.expected_repass_raw,'-2.5');assert.equal(signed.ads_adjustment_raw,'-1');assert.equal(signed.sales_base_raw,'200');
});

test('returns stay order references only; absent metadata cannot be silently marked as no refund',async()=>{
 for(const [mode,returns,unknown] of [['with-return',2,0],['returns-unknown',0,2]]){
  const f=await fixture(['COMPLETED','SHIPPED']);f.state.mode=mode;const frame=await finish(f);assert.equal(frame.coverage.returns,returns);assert.equal(frame.coverage.returns_unknown,unknown);assert.ok(!JSON.stringify(frame).includes('PRIVATE_BUSINESS_RETURN'));
 }
});

test('explicit covered empty and cancelled-only cohorts have zero paid totals without inventing a sale',async()=>{
 for(const statuses of [[],['CANCELLED','UNPAID','IN_CANCEL']]){
  const f=await fixture(statuses),frame=await finish(f);assert.equal(frame.status,'COMPLETE');assert.equal(frame.coverage.paid,0);assert.equal(frame.sales_base_raw,'0');assert.equal(frame.expected_repass_raw,'0');assert.equal(frame.invoice_tax.known_tax_raw,'0');assert.deepEqual(frame.items,[]);assert.equal(f.calls.filter(request=>new URL(request.url).pathname===payment).length,0);
 }
});

test('cache reuse is idempotent; completed current-day data expires after one minute and closed periods after fifteen',async()=>{
 const f=await fixture(['COMPLETED']),running=await f.start();f.clock.time+=61000;assert.equal((await f.start()).run_id,running.run_id);const complete=await f.run({operation:'step',run_id:running.run_id});assert.equal(complete.status,'COMPLETE');
 // Freshness is relative to the fixed cohort cutoff, so the completed old run
 // is immediately superseded after the minute spent while collecting it.
 const fresh=await f.start();assert.notEqual(fresh.run_id,complete.run_id);assert.equal(f.calls.length,3);assert.equal((await f.start()).run_id,fresh.run_id);
 const g=await fixture([]),start=()=>g.run({operation:'start',start_date:'2026-10-13',end_date:'2026-10-19'}),job=await start();await g.run({operation:'step',run_id:job.run_id});g.clock.time+=61000;assert.equal((await start()).run_id,job.run_id);g.clock.time+=840000;assert.notEqual((await start()).run_id,job.run_id);assert.equal(g.calls.length,1);
});

test('simultaneous starts share one run; a held page lease cannot trigger duplicate provider work',async()=>{
 const f=await fixture(['COMPLETED']),starts=await Promise.all(Array.from({length:5},()=>f.start()));assert.equal(new Set(starts.map(frame=>frame.run_id)).size,1);assert.equal(snapshot(f).runs.length,1);assert.equal(snapshot(f).cursors.length,1);
 f.state.hold=true;const started=new Promise(resolve=>f.state.started=resolve),inflight=f.run({operation:'step',run_id:starts[0].run_id});await started;
 const conflict=await f.run({operation:'step',run_id:starts[0].run_id});assert.equal(conflict.diagnostic,'BUSINESS_PERIOD_CONFLICT');assert.equal(f.calls.length,1);f.state.hold=false;f.state.release();const completed=await inflight;assert.equal(completed.status,'COMPLETE');assert.equal(snapshot(f).orders.length,1);
});

test('repeated provider rows are deduplicated by private hash, while repeated cursors never advance or corrupt a job',async()=>{
 const f=await fixture(Array(7).fill('COMPLETED'));f.state.mode='duplicate';const frame=await finish(f);assert.equal(frame.status,'COMPLETE');assert.equal(frame.coverage.orders,6);assert.equal(frame.duplicate_orders,1);assert.equal(snapshot(f).orders.length,6);
 const g=await fixture(Array(12).fill('COMPLETED'));g.state.mode='loop';const job=await g.start(),first=await g.run({operation:'step',run_id:job.run_id}),before=snapshot(g),failed=await g.run({operation:'step',run_id:job.run_id});assert.equal(failed.diagnostic,'BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE');assert.equal(failed.revision,first.revision);assert.deepEqual(snapshot(g).orders,before.orders);assert.deepEqual(snapshot(g).cursors,before.cursors);
});

test('hash tampering with classifications, amounts, items or run scope is refused before provider reads',async()=>{
 for(const [field,value] of [['bucket','cancelled'],['escrow_raw','999'],['items','[]'],['checked_at',1]]){
  const f=await fixture(['COMPLETED']),frame=await finish(f),count=f.calls.length;f.db.db.prepare('UPDATE finance_business_period_orders SET '+field+'=?').run(value);await assert.rejects(f.run({operation:'read',run_id:frame.run_id}),error=>error.code==='FINANCE_BUSINESS_STORAGE_INVALID');assert.equal(f.calls.length,count);
 }
 const f=await fixture([]),job=await f.start();f.db.db.prepare('UPDATE finance_business_period_runs SET shop_id=999').run();await assert.rejects(f.run({operation:'read',run_id:job.run_id}),error=>error.code==='FINANCE_BUSINESS_RUN_NOT_FOUND');assert.equal(f.calls.length,0);
});

test('expired idle cache entries are bounded at sixty and cleanup never removes a live run lease',async()=>{
 const f=await fixture([]);let first,live;
 for(let i=0;i<60;i++){const end=20-Math.floor(i/15),start=end-i%15,job=await f.run({operation:'start',start_date:'2026-10-'+String(start).padStart(2,'0'),end_date:'2026-10-'+String(end).padStart(2,'0')});first??=job;live=job;}
 f.clock.time+=901000;f.db.db.prepare('UPDATE finance_business_period_runs SET lease_owner=?,lease_until=? WHERE run_id=?').run('PRIVATE_LIVE_LEASE',f.now()/1000+45,live.run_id);
 const job=await f.start();assert.notEqual(job.run_id,first.run_id);assert.equal(snapshot(f).runs.length,60);assert.equal((await f.run({operation:'read',run_id:live.run_id})).run_id,live.run_id);assert.equal(f.calls.length,0);
});

function seedCohort(f,job,{groups=false}={}){
 const stamp=f.now()/1000,insert=f.db.db.prepare('INSERT INTO finance_business_period_orders(run_id,order_hash,bucket,payment_covered,sales_raw,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
 for(let index=0;index<995;index++){
  const items=groups?[{item_id:String(2000+index),model_id:'0',quantity:2},...(index<5?[{item_id:String(4000+index),model_id:'0',quantity:1}]:[])]:[{item_id:'100',model_id:String(index%2),quantity:2}];
  const record={order_hash:createHash('sha256').update(serial(index)).digest('hex'),bucket:'completed',payment_covered:1,sales_raw:'100',escrow_raw:String(20+index),ads_raw:'0',returns_seen:0,items:JSON.stringify(items),checked_at:stamp};
  const sourceHash=createHash('sha256').update(JSON.stringify(record)).digest('hex');
  insert.run(job.run_id,record.order_hash,record.bucket,record.payment_covered,record.sales_raw,record.escrow_raw,record.ads_raw,record.returns_seen,record.items,sourceHash,stamp);
 }
 f.db.db.prepare('UPDATE finance_business_period_runs SET revision=200,pages_read=199,cursor=? WHERE run_id=?').run('cursor-995',job.run_id);
 f.db.db.prepare('INSERT INTO finance_business_period_cursors VALUES(?,?)').run(job.run_id,createHash('sha256').update('cursor-995').digest('hex'));
}

test('a thousand collected orders with another provider page stays LIMIT_REACHED, never a complete monthly total',async()=>{
 const f=await fixture(Array(1005).fill('COMPLETED')),job=await f.start();seedCohort(f,job);
 const frame=await f.run({operation:'step',run_id:job.run_id});assert.equal(frame.status,'LIMIT_REACHED');assert.equal(frame.coverage.orders,1000);assert.equal(frame.pages_read,200);assert.equal(frame.sales_base_raw,'100000');assert.equal(frame.diagnostic,null);assert.ok(projectBusinessPeriodFrame(frame));assert.equal(snapshot(f).orders.length,1000);assert.equal(f.calls.length,7);
 const count=f.calls.length;assert.deepEqual(await f.run({operation:'step',run_id:job.run_id}),frame);assert.equal(f.calls.length,count);
});

test('variant group overflow stops before committing its entire new page and retains the prior safe subset',async()=>{
 const f=await fixture(Array(1005).fill('COMPLETED')),job=await f.start();seedCohort(f,job,{groups:true});
 const before=snapshot(f),frame=await f.run({operation:'step',run_id:job.run_id});assert.equal(frame.status,'LIMIT_REACHED');assert.equal(frame.coverage.orders,995);assert.equal(frame.items.length,1000);assert.equal(frame.pages_read,199);assert.equal(frame.diagnostic,null);assert.deepEqual(snapshot(f).orders,before.orders);assert.deepEqual(snapshot(f).cursors,before.cursors);assert.equal(f.calls.length,7);
});
