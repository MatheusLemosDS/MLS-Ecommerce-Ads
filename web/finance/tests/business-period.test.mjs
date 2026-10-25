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
 const calls=[],state={statuses:[...statuses],mode:'normal',active:0,maxActive:0,hold:false,started:null,release:null,base:100,itemLists:{},moneyByIndex:{},pageSize:20,expectedPageSize:20,detailPadding:0,detailBodyBytes:0,phaseMs:0,beforeListMs:0,paymentReads:0,gateFirstPaymentWave:false,paymentFailures:{}};
 let paymentGate,releasePaymentGate;
 const itemList=index=>state.itemLists[index]||[{item_id:100,model_id:index%2,model_quantity_purchased:2}];
 const fetchImpl=async request=>{
  const url=new URL(request.url);calls.push(request);
  assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(request.method,'GET');assert.equal(request.redirect,'manual');assert.equal(request.headers.get('accept'),'application/json');assert.equal(await request.clone().text(),'');
  for(const name of ['cookie','authorization','x-braza-app-key','x-braza-finance-router','x-braza-gateway-key'])assert.equal(request.headers.get(name),null);
  assert.equal(url.searchParams.get('partner_id'),'2049333');assert.equal(url.searchParams.get('shop_id'),'1178167501');assert.equal(url.searchParams.get('access_token'),access);
  assert.equal(url.searchParams.get('sign'),createHmac('sha256',key).update('2049333'+url.pathname+url.searchParams.get('timestamp')+access+'1178167501').digest('hex'));
  if(url.pathname===list){
   clock.time+=state.beforeListMs+state.phaseMs;state.beforeListMs=0;
   if(state.started){state.started();state.started=null;}if(state.hold)await new Promise(resolve=>state.release=resolve);
   if(state.mode==='list-http')return Response.json({error:'error_sign',message:key},{status:403});
   assert.equal(url.searchParams.has('order_status'),false);assert.equal(url.searchParams.get('time_range_field'),'create_time');assert.equal(url.searchParams.get('page_size'),String(state.expectedPageSize));
   const pageSize=Math.min(state.pageSize,state.expectedPageSize),cursor=url.searchParams.get('cursor'),offset=cursor===''?0:cursor==='cursor-loop'?pageSize:Number(cursor.slice(7)),indices=Array.from({length:Math.min(pageSize,state.statuses.length-offset)},(_,i)=>i+offset);
   if(state.mode==='duplicate'&&offset===pageSize)indices[0]=0;
   const more=offset+pageSize<state.statuses.length;
   if(state.mode==='list-overfull')indices.push(pageSize);
   return provider({order_list:indices.map(index=>({order_sn:serial(index),order_status:'CANCELLED'})),more,next_cursor:state.mode==='loop'&&more?'cursor-loop':more?'cursor-'+(offset+pageSize):''});
  }
  if(url.pathname===detail){
   clock.time+=state.phaseMs;
   const ids=url.searchParams.get('order_sn_list').split(',');
   const rows=ids.map(sn=>{const index=Number(sn.slice(serial(0).length-1));return {order_sn:sn,order_status:state.statuses[index],currency:state.mode==='currency'?'USD':'BRL',create_time:Date.UTC(2026,9,20,12)/1000,item_list:itemList(index),buyer_username:'PRIVATE_BUSINESS_BUYER'};});
   if(state.mode==='detail-foreign')rows[0].order_sn='PRIVATE_FOREIGN';
   if(state.mode==='detail-missing')rows.pop();
   if(state.mode==='date-foreign')rows[0].create_time=Date.UTC(2026,9,1)/1000;
   if(state.detailPadding)for(const row of rows)row.description='x'.repeat(state.detailPadding);
   state.detailBodyBytes=Buffer.byteLength(JSON.stringify({order_list:rows}));
   return provider({order_list:rows});
  }
  assert.equal(url.pathname,payment);const index=Number(url.searchParams.get('order_sn').slice(serial(0).length-1));assert.ok(eligible(state.statuses[index]));
  state.active++;state.maxActive=Math.max(state.active,state.maxActive);
  // The throughput assertion holds the first wave until all four reads have
  // entered, independently of cryptographic scheduling or event-loop speed.
  if(state.gateFirstPaymentWave){
   paymentGate??=new Promise(resolve=>releasePaymentGate=resolve);
   if(state.active===4){state.gateFirstPaymentWave=false;releasePaymentGate();}
   await paymentGate;
  }else await Promise.resolve();
  state.active--;
  if(++state.paymentReads%4===0)clock.time+=state.phaseMs;
  const fault=state.paymentFailures[index];
  if(fault==='timeout')return new Promise(()=>{});
  if(typeof fault==='number')return Response.json({error:'PRIVATE_PROVIDER_ERROR',message:key},{status:fault});
  if(typeof fault==='string')return Response.json({error:fault,message:key});
  if(state.mode==='ongoing-unavailable'&&state.statuses[index]!=='COMPLETED')return Response.json({error:'order_not_ready',message:'PRIVATE_BUSINESS_MESSAGE'},{status:503});
  if(state.mode==='ongoing-api-unavailable'&&state.statuses[index]!=='COMPLETED')return Response.json({error:'order_not_found',message:'PRIVATE_BUSINESS_MESSAGE'});
  if(state.mode==='ongoing-auth-rejected'&&state.statuses[index]!=='COMPLETED')return Response.json({error:'error_auth',message:key},{status:403});
  if(state.mode==='ongoing-malformed'&&state.statuses[index]!=='COMPLETED')return new Response('PRIVATE_BAD_JSON',{headers:{'content-type':'application/json'}});
  const order_income={order_sn:serial(index),original_cost_of_goods_sold:state.base,escrow_amount:20+index,ads_escrow_top_up_fee_or_technical_support_fee:0,...state.moneyByIndex[index],items:itemList(index).map((row,line)=>({item_id:row.item_id,model_id:row.model_id,line_item_id:1000+index*1000+line,quantity_purchased:row.model_quantity_purchased,selling_price:999,buyer:'PRIVATE_BUSINESS_BUYER'}))};
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
const snapshot=f=>({runs:f.db.db.prepare('SELECT * FROM finance_business_period_runs ORDER BY run_id').all(),orders:f.db.db.prepare('SELECT * FROM finance_business_period_orders ORDER BY run_id,order_hash').all(),cursors:f.db.db.prepare('SELECT * FROM finance_business_period_cursors ORDER BY run_id,cursor_hash').all(),cache:f.db.db.prepare('SELECT * FROM finance_business_period_payment_cache ORDER BY run_id,order_hash').all()});
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
 const f=await fixture(),frame=await finish(f);assert.equal(frame.status,'COMPLETE');assert.equal(frame.pages_read,1);assert.equal(frame.page_capacity,20);assert.deepEqual(frame.coverage,{orders:9,paid:4,completed:1,ongoing:3,cancelled:1,cancel_pending:1,unpaid:1,other:1,unknown:1,payment_covered:4,payment_missing:0,returns:0,returns_unknown:0});
 assert.equal(frame.sales_base_raw,'400');assert.equal(frame.expected_repass_raw,'94');assert.equal(frame.ads_adjustment_raw,'0');assert.equal(frame.invoice_tax.known_tax_raw,'8');assert.deepEqual(frame.items,[{item_id:'100',model_id:'0',quantity:4},{item_id:'100',model_id:'1',quantity:4}]);assert.ok(f.state.maxActive>=1&&f.state.maxActive<=4);
 const payments=f.calls.filter(request=>new URL(request.url).pathname===payment);assert.equal(payments.length,4);assert.deepEqual(new Set(payments.map(request=>new URL(request.url).searchParams.get('order_sn'))),new Set([0,1,5,8].map(serial)));
 const callCount=f.calls.length;assert.deepEqual(await f.run({operation:'step',run_id:frame.run_id}),frame);assert.deepEqual(await f.run({operation:'read',run_id:frame.run_id}),frame);assert.equal(f.calls.length,callCount);
 for(const secret of [key,access,refresh,'PRIVATE_BUSINESS_ORDER','PRIVATE_BUSINESS_BUYER','PRIVATE_BUSINESS_RETURN','cursor-','selling_price']){assert.ok(!JSON.stringify(frame).includes(secret));assert.ok(!JSON.stringify(snapshot(f)).includes(secret)||secret==='cursor-');}
 assert.equal(snapshot(f).orders[0].order_hash.length,64);assert.ok(snapshot(f).orders.some(row=>row.order_hash===createHash('sha256').update(serial(0)).digest('hex')));
});

test('every supported active status is a paid order and cancellation classes cannot inflate sales',async()=>{
 const statuses=['READY_TO_SHIP','PROCESSED','RETRY_SHIP','SHIPPED','TO_CONFIRM_RECEIVE','COMPLETED','INVOICE_PENDING','CANCELLED','IN_CANCEL','UNPAID','TO_RETURN','UNRECOGNIZED'];
 const f=await fixture(statuses),frame=await finish(f);assert.equal(frame.coverage.paid,7);assert.equal(frame.coverage.completed,1);assert.equal(frame.coverage.ongoing,6);assert.equal(frame.coverage.cancelled,1);assert.equal(frame.coverage.cancel_pending,1);assert.equal(frame.coverage.unpaid,1);assert.equal(frame.coverage.other,1);assert.equal(frame.coverage.unknown,1);assert.equal(frame.sales_base_raw,'700');
});

test('one hundred paid orders finish in five bounded pages with at most four concurrent Payment reads',async()=>{
 const f=await fixture(Array(100).fill('COMPLETED')),job=await f.start();f.state.gateFirstPaymentWave=true;assert.equal(job.page_capacity,20);
 const frame=await finish(f);assert.equal(frame.status,'COMPLETE');assert.equal(frame.pages_read,5);assert.equal(frame.page_capacity,20);assert.equal(frame.coverage.orders,100);assert.equal(frame.coverage.payment_covered,100);assert.equal(frame.sales_base_raw,'10000');assert.equal(frame.expected_repass_raw,'6950');
 assert.equal(f.calls.filter(request=>new URL(request.url).pathname===list).length,5);assert.equal(f.calls.filter(request=>new URL(request.url).pathname===detail).length,5);assert.equal(f.calls.filter(request=>new URL(request.url).pathname===payment).length,100);assert.equal(f.state.maxActive,4);assert.equal(f.state.gateFirstPaymentWave,false);
 assert.ok(projectBusinessPeriodFrame(frame));assert.equal(snapshot(f).orders.length,100);
});

test('twenty-order detail bodies may exceed 64 KiB while the one-MiB detail bound remains atomic',async()=>{
 const f=await fixture(Array(20).fill('COMPLETED'));f.state.detailPadding=4000;const frame=await finish(f);
 assert.ok(f.state.detailBodyBytes>64*1024);assert.ok(f.state.detailBodyBytes<1024*1024);assert.equal(frame.status,'COMPLETE');assert.equal(frame.coverage.orders,20);assert.equal(frame.coverage.payment_covered,20);assert.ok(projectBusinessPeriodFrame(frame));assert.ok(!JSON.stringify(frame).includes('description'));
 const g=await fixture(Array(20).fill('COMPLETED'));g.state.detailPadding=53000;const job=await g.start(),before=snapshot(g),failed=await g.run({operation:'step',run_id:job.run_id});
 assert.ok(g.state.detailBodyBytes>1024*1024);assert.equal(failed.status,'RUNNING');assert.equal(failed.diagnostic,'BUSINESS_PERIOD_INVALID_SOURCE');assert.equal(failed.pages_read,0);assert.equal(failed.coverage.orders,0);assert.equal(g.calls.length,2);assert.deepEqual(snapshot(g).orders,before.orders);assert.deepEqual(snapshot(g).cursors,before.cursors);
});

test('a slow page yields to its twenty-second budget, preserves verified Payments and resumes without replaying them',async()=>{
 const f=await fixture(Array(20).fill('COMPLETED')),job=await f.start(),started=f.now();f.state.phaseMs=5000;f.state.beforeListMs=5000;
 const yielded=await f.run({operation:'step',run_id:job.run_id});assert.equal(f.now()-started,20000);assert.equal(yielded.status,'RUNNING');assert.equal(yielded.diagnostic,'BUSINESS_PERIOD_CHECKPOINT');assert.equal(yielded.coverage.orders,0);assert.equal(yielded.pages_read,0);assert.ok(snapshot(f).cache.length>0);assert.equal(snapshot(f).orders.length,0);
 const cached=snapshot(f).cache,alreadyRead=f.calls.filter(request=>new URL(request.url).pathname===payment).map(request=>new URL(request.url).searchParams.get('order_sn'));
 f.state.phaseMs=0;const resumed=await f.run({operation:'step',run_id:job.run_id});assert.equal(resumed.status,'COMPLETE');assert.equal(resumed.coverage.orders,20);assert.equal(snapshot(f).orders.length,20);assert.equal(snapshot(f).cache.length,0);
 for(const serial of alreadyRead)assert.equal(f.calls.filter(request=>new URL(request.url).pathname===payment&&new URL(request.url).searchParams.get('order_sn')===serial).length,1);
 for(const record of cached)assert.equal(snapshot(f).orders.find(row=>row.order_hash===record.order_hash).checked_at,record.checked_at);
});

test('a rate failure after nineteen valid Payments checkpoints privately and retries only the missing payment',async()=>{
 const f=await fixture(Array(20).fill('COMPLETED')),job=await f.start();f.state.paymentFailures[19]=429;
 const stopped=await f.run({operation:'step',run_id:job.run_id});assert.equal(stopped.diagnostic,'BUSINESS_PERIOD_RATE_LIMIT');assert.equal(stopped.status,'RUNNING');assert.equal(stopped.coverage.orders,0);assert.equal(stopped.pages_read,0);assert.equal(stopped.revision,job.revision+1);assert.equal(snapshot(f).cache.length,19);assert.equal(snapshot(f).orders.length,0);
 const cached=snapshot(f).cache;for(const secret of ['PRIVATE_BUSINESS_ORDER',key,access,refresh])assert.ok(!JSON.stringify(snapshot(f)).includes(secret));
 f.clock.time+=30000;delete f.state.paymentFailures[19];const completed=await f.run({operation:'step',run_id:job.run_id});assert.equal(completed.status,'COMPLETE');assert.equal(completed.coverage.payment_covered,20);assert.equal(completed.sales_base_raw,'2000');assert.equal(snapshot(f).cache.length,0);assert.equal(f.calls.filter(request=>new URL(request.url).pathname===payment).length,21);
 for(const record of cached)assert.equal(snapshot(f).orders.find(row=>row.order_hash===record.order_hash).checked_at,record.checked_at);assert.equal(completed.source_checked_at.oldest_at,job.checked_at);
});

test('transient failures in ongoing orders retain retry diagnostics while generic authorization errors never request a token reset',async()=>{
 for(const [fault,diagnostic] of [[429,'RATE_LIMIT'],['error_rate_limit','RATE_LIMIT'],['error_limit','RATE_LIMIT'],[503,'UPSTREAM_UNAVAILABLE'],['error_server','UPSTREAM_UNAVAILABLE'],['err_busy','UPSTREAM_UNAVAILABLE'],[504,'TIMEOUT'],['timeout','TIMEOUT'],['unknown_provider_error','INVALID_SOURCE'],[401,'INVALID_SOURCE'],[403,'INVALID_SOURCE'],['error_auth','INVALID_SOURCE'],['error_api_permission','INVALID_SOURCE'],['error_sign','INVALID_SOURCE'],['error_token','AUTH_REQUIRED']]){
  const f=await fixture(['SHIPPED']),job=await f.start(),tokens=await f.store.readTokens();f.state.paymentFailures[0]=fault;
  const stopped=await f.run({operation:'step',run_id:job.run_id,timeoutMs:15});assert.equal(stopped.diagnostic,'BUSINESS_PERIOD_'+diagnostic,String(fault));assert.equal(stopped.status,'RUNNING');assert.equal(stopped.coverage.orders,0);assert.equal(stopped.pages_read,0);assert.equal(snapshot(f).cache.length,0);assert.deepEqual(await f.store.readTokens(),tokens);
 }
});

test('stored rate-limit and timeout gates prevent browser reloads or cron steps from bypassing a bounded retry delay',async()=>{
 for(const [fault,delay] of [[429,30],['error_rate_limit',30],['error_limit',30],[504,5],[503,10]]){
  const f=await fixture(['COMPLETED']),job=await f.start();f.state.paymentFailures[0]=fault;const failed=await f.run({operation:'step',run_id:job.run_id}),calls=f.calls.length;
  delete f.state.paymentFailures[0];assert.deepEqual(await f.run({operation:'step',run_id:job.run_id}),failed);assert.equal(f.calls.length,calls);
  f.clock.time+=(delay-1)*1000;assert.deepEqual(await f.run({operation:'step',run_id:job.run_id}),failed);assert.equal(f.calls.length,calls);
  f.clock.time+=1000;const resumed=await f.run({operation:'step',run_id:job.run_id});assert.equal(resumed.status,'COMPLETE');assert.equal(resumed.coverage.payment_covered,1);assert.equal(f.calls.length,calls+3);
 }
});

test('concurrent upstream failures retain the rate-limit delay instead of downgrading it to a generic busy response',async()=>{
 const f=await fixture(Array(20).fill('COMPLETED')),job=await f.start();f.state.gateFirstPaymentWave=true;f.state.paymentFailures={0:429,1:503,2:504};
 const stopped=await f.run({operation:'step',run_id:job.run_id});assert.equal(stopped.diagnostic,'BUSINESS_PERIOD_RATE_LIMIT');assert.equal(stopped.coverage.orders,0);const calls=f.calls.length;
 f.clock.time+=29000;await f.run({operation:'step',run_id:job.run_id});assert.equal(f.calls.length,calls);
});

test('expired-run cleanup removes its private Payment checkpoint along with the original cohort',async()=>{
 const f=await fixture(Array(20).fill('COMPLETED')),job=await f.start();f.state.paymentFailures[19]=429;await f.run({operation:'step',run_id:job.run_id});assert.equal(snapshot(f).cache.length,19);
 f.clock.time+=31*86400000;await f.start();assert.equal(snapshot(f).cache.length,0);assert.ok(snapshot(f).runs.every(run=>run.run_id!==job.run_id));
});

test('an already claimed token refresh or authorization yields busy without provider calls or losing the private checkpoint',async()=>{
 for(const operation of ['refresh','authorization']){
  const f=await fixture(Array(20).fill('COMPLETED')),job=await f.start();f.state.paymentFailures[19]=429;await f.run({operation:'step',run_id:job.run_id});f.clock.time+=30000;
  const current=await f.store.readTokens(),lease=await (operation==='refresh'?f.store.claimRefresh(current.revision):f.store.claimAuthorization(current.revision)),before=snapshot(f),calls=f.calls.length;
  const stopped=await f.run({operation:'step',run_id:job.run_id});assert.equal(stopped.diagnostic,'BUSINESS_PERIOD_BUSY');assert.equal(stopped.status,'RUNNING');assert.equal(stopped.coverage.orders,0);assert.equal(stopped.pages_read,0);assert.equal(f.calls.length,calls);assert.deepEqual(snapshot(f).cache,before.cache);assert.deepEqual(snapshot(f).orders,before.orders);assert.deepEqual(snapshot(f).cursors,before.cursors);
  assert.equal((await f.store.status()).status,operation==='refresh'?'REFRESHING':'AUTHORIZING');assert.ok(lease.owner);
 }
});

test('one unavailable token SELECT returns a retryable source error and preserves all nineteen verified payments',async()=>{
 const f=await fixture(Array(20).fill('COMPLETED')),job=await f.start();f.state.paymentFailures[19]=429;await f.run({operation:'step',run_id:job.run_id});f.clock.time+=30000;
 const prepare=f.db.prepare.bind(f.db);let injected=false;f.db.prepare=sql=>{
  const statement=prepare(sql);
  if(sql.startsWith('SELECT * FROM finance_connections WHERE')){const first=statement.first.bind(statement);statement.first=async()=>{if(!injected){injected=true;throw new Error('fixture token read unavailable');}return first();};}
  return statement;
 };
 const before=snapshot(f),calls=f.calls.length,stopped=await f.run({operation:'step',run_id:job.run_id});assert.equal(injected,true);assert.equal(stopped.diagnostic,'BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE');assert.equal(stopped.status,'RUNNING');assert.equal(stopped.coverage.orders,0);assert.equal(stopped.pages_read,0);assert.equal(f.calls.length,calls);assert.deepEqual(snapshot(f).cache,before.cache);assert.deepEqual(snapshot(f).orders,before.orders);assert.deepEqual(snapshot(f).cursors,before.cursors);
 delete f.state.paymentFailures[19];f.clock.time+=10000;const resumed=await f.run({operation:'step',run_id:job.run_id});assert.equal(resumed.status,'COMPLETE');assert.equal(resumed.coverage.payment_covered,20);assert.equal(f.calls.length,calls+3);assert.equal(snapshot(f).cache.length,0);
});

test('a refresh-claim compare-and-swap conflict yields busy instead of blocking a healthy connection',async()=>{
 const f=await fixture(['COMPLETED']),job=await f.start(),tokens=await f.store.readTokens();await f.store.saveTokens({access_token:access,refresh_token:refresh,expires_at:f.now()/1000+60},{expectedRevision:tokens.revision});
 const prepare=f.db.prepare.bind(f.db);let injected=false;f.db.prepare=sql=>{
  const statement=prepare(sql);
  if(sql.startsWith("UPDATE finance_connections SET status = 'REFRESHING'")){statement.first=async()=>{injected=true;return null;};}
  return statement;
 };
 const stopped=await f.run({operation:'step',run_id:job.run_id});assert.equal(injected,true);assert.equal(stopped.diagnostic,'BUSINESS_PERIOD_BUSY');assert.equal(stopped.coverage.orders,0);assert.equal(stopped.pages_read,0);assert.equal(f.calls.length,0);assert.equal((await f.store.status()).status,'CONNECTED');
});

test('resumption rechecks detail composition and detects cache tampering before provider calls',async()=>{
 const f=await fixture(Array(20).fill('COMPLETED')),job=await f.start();f.state.paymentFailures[19]=429;await f.run({operation:'step',run_id:job.run_id});
 f.state.itemLists[0]=[{item_id:100,model_id:99,model_quantity_purchased:1}];delete f.state.paymentFailures[19];f.clock.time+=30000;const calls=f.calls.length;
 const completed=await f.run({operation:'step',run_id:job.run_id});assert.equal(completed.status,'COMPLETE');assert.equal(f.calls.length-calls,4);assert.equal(f.calls.filter(request=>new URL(request.url).pathname===payment&&new URL(request.url).searchParams.get('order_sn')===serial(0)).length,2);assert.ok(completed.items.some(row=>row.model_id==='99'));
 const g=await fixture(Array(20).fill('COMPLETED')),pending=await g.start();g.state.paymentFailures[19]=429;await g.run({operation:'step',run_id:pending.run_id});const count=g.calls.length;
 g.db.db.prepare("UPDATE finance_business_period_payment_cache SET escrow_raw='999999'").run();await assert.rejects(g.run({operation:'step',run_id:pending.run_id}),error=>error.code==='FINANCE_BUSINESS_STORAGE_INVALID');assert.equal(g.calls.length,count);
});

test('a resumed paginated import exposes old and new order observation times independently of its completion time',async()=>{
 const f=await fixture(['COMPLETED','READY_TO_SHIP','CANCELLED','UNPAID','IN_CANCEL','SHIPPED']),job=await f.start(),firstStamp=f.now()/1000;
 f.state.pageSize=5;
 assert.deepEqual(job.source_checked_at,{oldest_at:firstStamp,latest_at:firstStamp});
 const first=await f.run({operation:'step',run_id:job.run_id});assert.equal(first.status,'RUNNING');assert.equal(first.coverage.orders,5);
 f.clock.time+=1200000;
 const finished=await f.run({operation:'step',run_id:job.run_id});assert.equal(finished.status,'COMPLETE');assert.equal(finished.checked_at,firstStamp+1200);
 assert.deepEqual(finished.source_checked_at,{oldest_at:firstStamp,latest_at:firstStamp+1200});
 const times=snapshot(f).orders.map(row=>row.checked_at);assert.equal(finished.source_checked_at.oldest_at,Math.min(...times));assert.equal(finished.source_checked_at.latest_at,Math.max(...times));
 f.clock.time+=300000;
 const read=await f.run({operation:'read',run_id:job.run_id});assert.deepEqual(read.source_checked_at,finished.source_checked_at);assert.equal(read.checked_at,finished.checked_at);
});

test('a delayed empty import exposes its conservative collection interval without fabricating orders or money',async()=>{
 const f=await fixture([]),job=await f.start(),cutoff=f.now()/1000;f.clock.time+=1200000;
 const finished=await f.run({operation:'step',run_id:job.run_id});assert.equal(finished.status,'COMPLETE');assert.equal(finished.coverage.orders,0);assert.equal(finished.sales_base_raw,'0');
 assert.deepEqual(finished.source_checked_at,{oldest_at:cutoff,latest_at:cutoff+1200});assert.ok(projectBusinessPeriodFrame(finished));
});

test('ongoing Payment unavailable keeps its detail quantities and missing coverage, never zero or a fake total',async()=>{
 for(const mode of ['ongoing-api-unavailable']){
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
  const frame=await f.run({operation:'step',run_id:job.run_id});assert.equal(frame.status,'RUNNING',mode);assert.equal(frame.diagnostic,'BUSINESS_PERIOD_INVALID_SOURCE',mode);assert.equal(frame.pages_read,0);assert.equal(frame.coverage.orders,0);assert.equal(frame.revision,job.revision+(snapshot(f).cache.length?1:0));assert.deepEqual(snapshot(f).orders,before.orders);assert.deepEqual(snapshot(f).cursors,before.cursors);assert.deepEqual(await f.store.readTokens(),tokens);
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

test('a lease loser returns the completed winner without inventing a terminal conflict or masking invalid stored errors',async()=>{
 for(const invalidTerminalError of [false,true]){
  const f=await fixture(['COMPLETED']),job=await f.start(),prepare=f.db.prepare.bind(f.db);let injected=false,winner;
  f.db.prepare=sql=>{
   const statement=prepare(sql);
   if(sql.startsWith('UPDATE finance_business_period_runs SET lease_owner=?')){
    const execute=statement.run.bind(statement);statement.run=async()=>{
     if(!injected){injected=true;winner=await f.run({operation:'step',run_id:job.run_id});if(invalidTerminalError)f.db.db.prepare('UPDATE finance_business_period_runs SET last_error=? WHERE run_id=?').run('BUSINESS_PERIOD_RATE_LIMIT',job.run_id);}
     return execute();
    };
   }
   return statement;
  };
  const loser=f.run({operation:'step',run_id:job.run_id});
  if(invalidTerminalError)await assert.rejects(loser,error=>error.code==='FINANCE_BUSINESS_STORAGE_INVALID');
  else{const result=await loser;assert.deepEqual(result,winner);assert.equal(result.status,'COMPLETE');assert.equal(result.diagnostic,null);assert.ok(projectBusinessPeriodFrame(result));}
  assert.equal(injected,true);assert.equal(f.calls.length,3,'the loser must not repeat the winner\'s list, detail or Payment reads');assert.equal(snapshot(f).orders.length,1);
 }
});

test('repeated provider rows are deduplicated by private hash, while repeated cursors never advance or corrupt a job',async()=>{
 const f=await fixture(Array(27).fill('COMPLETED'));f.state.mode='duplicate';const frame=await finish(f);assert.equal(frame.status,'COMPLETE');assert.equal(frame.coverage.orders,26);assert.equal(frame.duplicate_orders,1);assert.equal(snapshot(f).orders.length,26);
 const g=await fixture(Array(42).fill('COMPLETED'));g.state.mode='loop';const job=await g.start(),first=await g.run({operation:'step',run_id:job.run_id}),before=snapshot(g),failed=await g.run({operation:'step',run_id:job.run_id});assert.equal(failed.diagnostic,'BUSINESS_PERIOD_INVALID_SOURCE');assert.equal(failed.revision,first.revision);assert.deepEqual(snapshot(g).orders,before.orders);assert.deepEqual(snapshot(g).cursors,before.cursors);
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

function seedCohort(f,job,{groups=false,count=995,pages=199}={}){
 const stamp=f.now()/1000,insert=f.db.db.prepare('INSERT INTO finance_business_period_orders(run_id,order_hash,bucket,payment_covered,sales_raw,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
 for(let index=0;index<count;index++){
  const items=groups?[{item_id:String(2000+index),model_id:'0',quantity:2},...(index<5?[{item_id:String(4000+index),model_id:'0',quantity:1}]:[])]:[{item_id:'100',model_id:String(index%2),quantity:2}];
  const record={order_hash:createHash('sha256').update(serial(index)).digest('hex'),bucket:'completed',payment_covered:1,sales_raw:'100',escrow_raw:String(20+index),ads_raw:'0',returns_seen:0,items:JSON.stringify(items),checked_at:stamp};
  const sourceHash=createHash('sha256').update(JSON.stringify(record)).digest('hex');
  insert.run(job.run_id,record.order_hash,record.bucket,record.payment_covered,record.sales_raw,record.escrow_raw,record.ads_raw,record.returns_seen,record.items,sourceHash,stamp);
 }
 const cursor='cursor-'+count;
 f.db.db.prepare('UPDATE finance_business_period_runs SET revision=?,pages_read=?,cursor=? WHERE run_id=?').run(pages+1,pages,cursor,job.run_id);
 f.db.db.prepare('INSERT INTO finance_business_period_cursors VALUES(?,?)').run(job.run_id,createHash('sha256').update(cursor).digest('hex'));
 f.state.expectedPageSize=Math.min(20,1000-count);
}

test('the final page reserves only remaining capacity and an already full run stops without provider reads',async()=>{
 const f=await fixture(Array(1010).fill('COMPLETED')),job=await f.start();seedCohort(f,job,{count:990,pages:50});
 const frame=await f.run({operation:'step',run_id:job.run_id});assert.equal(frame.status,'LIMIT_REACHED');assert.equal(frame.coverage.orders,1000);assert.equal(frame.pages_read,51);assert.equal(frame.page_capacity,20);assert.equal(snapshot(f).orders.length,1000);assert.equal(new URL(f.calls[0].url).searchParams.get('page_size'),'10');assert.equal(f.calls.length,12);
 const g=await fixture(Array(1010).fill('COMPLETED')),full=await g.start();seedCohort(g,full,{count:1000,pages:50});const before=snapshot(g);
 const limited=await g.run({operation:'step',run_id:full.run_id});assert.equal(limited.status,'LIMIT_REACHED');assert.equal(limited.coverage.orders,1000);assert.equal(limited.pages_read,50);assert.deepEqual(snapshot(g).orders,before.orders);assert.deepEqual(snapshot(g).cursors,before.cursors);assert.equal(g.calls.length,0);
});

test('a provider page larger than the reserved capacity cannot commit rows or advance a cursor',async()=>{
 const f=await fixture(Array(1010).fill('COMPLETED')),job=await f.start();seedCohort(f,job);f.state.mode='list-overfull';const before=snapshot(f);
 const frame=await f.run({operation:'step',run_id:job.run_id});assert.equal(frame.status,'RUNNING');assert.equal(frame.diagnostic,'BUSINESS_PERIOD_INVALID_SOURCE');assert.equal(frame.coverage.orders,995);assert.equal(frame.pages_read,199);assert.deepEqual(snapshot(f).orders,before.orders);assert.deepEqual(snapshot(f).cursors,before.cursors);assert.equal(f.calls.length,1);
});

test('a thousand collected orders with another provider page stays LIMIT_REACHED, never a complete monthly total',async()=>{
 const f=await fixture(Array(1005).fill('COMPLETED')),job=await f.start();seedCohort(f,job);
 const frame=await f.run({operation:'step',run_id:job.run_id});assert.equal(frame.status,'LIMIT_REACHED');assert.equal(frame.coverage.orders,1000);assert.equal(frame.pages_read,200);assert.equal(frame.sales_base_raw,'100000');assert.equal(frame.diagnostic,null);assert.ok(projectBusinessPeriodFrame(frame));assert.equal(snapshot(f).orders.length,1000);assert.equal(f.calls.length,7);
 const count=f.calls.length;assert.deepEqual(await f.run({operation:'step',run_id:job.run_id}),frame);assert.equal(f.calls.length,count);
});

test('variant group overflow stops before committing its entire new page and retains the prior safe subset',async()=>{
 const f=await fixture(Array(1005).fill('COMPLETED')),job=await f.start();seedCohort(f,job,{groups:true});
 const before=snapshot(f),frame=await f.run({operation:'step',run_id:job.run_id});assert.equal(frame.status,'LIMIT_REACHED');assert.equal(frame.coverage.orders,995);assert.equal(frame.items.length,1000);assert.equal(frame.pages_read,199);assert.equal(frame.diagnostic,null);assert.deepEqual(snapshot(f).orders,before.orders);assert.deepEqual(snapshot(f).cursors,before.cursors);assert.equal(f.calls.length,7);
});

test('paid product projection keeps exact exclusive money and model quantities while mixed money stays unallocated once',async()=>{
 const f=await fixture(['COMPLETED','COMPLETED','SHIPPED','CANCELLED','UNPAID']);
 f.state.mode='ongoing-api-unavailable';
 f.state.itemLists={
  0:[{item_id:201,model_id:0,model_quantity_purchased:2}],
  1:[{item_id:201,model_id:0,model_quantity_purchased:1},{item_id:202,model_id:10,model_quantity_purchased:2}],
  2:[{item_id:202,model_id:11,model_quantity_purchased:1}],
  3:[{item_id:999,model_id:0,model_quantity_purchased:999}],
  4:[{item_id:998,model_id:0,model_quantity_purchased:999}],
 };
 f.state.moneyByIndex={0:{original_cost_of_goods_sold:100,escrow_amount:80,ads_escrow_top_up_fee_or_technical_support_fee:3},1:{original_cost_of_goods_sold:50,escrow_amount:25,ads_escrow_top_up_fee_or_technical_support_fee:2}};
 const frame=await finish(f),sidecar=frame.product_breakdown;assert.ok(projectBusinessPeriodFrame(frame));
 assert.equal(sidecar.schema,'business_product_breakdown_v1');assert.equal(sidecar.mixed_orders,1);assert.equal(sidecar.mixed_payment_covered,1);assert.equal(sidecar.mixed_payment_missing,0);
 assert.equal(sidecar.known_mixed_sales_base_raw,'50');assert.equal(sidecar.known_mixed_expected_repass_raw,'25');assert.equal(sidecar.known_mixed_ads_adjustment_raw,'2');assert.equal(sidecar.known_mixed_invoice_tax_raw,'1');
 assert.deepEqual(sidecar.products.map(row=>row.item_id),['201','202']);
 const [first,second]=sidecar.products;
 assert.equal(first.quantity,3);assert.equal(first.orders,2);assert.equal(first.exclusive_orders,1);assert.equal(first.mixed_orders,1);assert.equal(first.exclusive_sales_base_raw,'100');assert.equal(first.exclusive_expected_repass_raw,'80');assert.equal(first.exclusive_ads_adjustment_raw,'3');assert.equal(first.exclusive_invoice_tax_raw,'2');
 assert.deepEqual(first.items,[{model_id:'0',exclusive_quantity:2,mixed_quantity:1}]);
 assert.equal(second.quantity,3);assert.equal(second.exclusive_payment_missing,1);assert.equal(second.exclusive_returns_unknown,1);assert.equal(second.known_exclusive_sales_base_raw,'0');assert.equal(second.exclusive_sales_base_raw,null);assert.equal(second.exclusive_expected_repass_raw,null);assert.equal(second.exclusive_ads_adjustment_raw,null);assert.equal(second.exclusive_invoice_tax_raw,null);
 assert.deepEqual(second.items,[{model_id:'10',exclusive_quantity:0,mixed_quantity:2},{model_id:'11',exclusive_quantity:1,mixed_quantity:0}]);
 assert.equal(frame.known_expected_repass_raw,'105');assert.equal(frame.expected_repass_raw,null);assert.equal(frame.invoice_tax.known_tax_raw,'3');
 const count=f.calls.length;assert.deepEqual(await f.run({operation:'read',run_id:frame.run_id}),frame);assert.equal(f.calls.length,count);
});

test('different variations of one product remain one exclusive order and preserve per-invoice tax rounding',async()=>{
 const f=await fixture(['COMPLETED']);f.state.base=.25;
 f.state.itemLists={0:[{item_id:201,model_id:20,model_quantity_purchased:1},{item_id:201,model_id:21,model_quantity_purchased:2}]};
 const frame=await finish(f),sidecar=frame.product_breakdown,row=sidecar.products[0];
 assert.equal(sidecar.mixed_orders,0);assert.equal(sidecar.known_mixed_expected_repass_raw,'0');assert.equal(row.item_id,'201');assert.equal(row.quantity,3);assert.equal(row.orders,1);assert.equal(row.exclusive_orders,1);assert.equal(row.mixed_orders,0);assert.equal(row.exclusive_invoice_tax_raw,'0.01');assert.equal(row.exclusive_returns_unknown,0);
 assert.deepEqual(row.items,[{model_id:'20',exclusive_quantity:1,mixed_quantity:0},{model_id:'21',exclusive_quantity:2,mixed_quantity:0}]);
 const g=await fixture(['COMPLETED','SHIPPED']);g.state.mode='returns-unknown';const unknown=await finish(g);assert.equal(unknown.product_breakdown.products[0].exclusive_returns_unknown,2);assert.equal(unknown.product_breakdown.products[0].exclusive_returns,0);
});

test('mixed-only products have no allocated payout, tax or exclusive quantities even when their order is fully paid',async()=>{
 const f=await fixture(['COMPLETED']);f.state.itemLists={0:[{item_id:201,model_id:0,model_quantity_purchased:1},{item_id:202,model_id:0,model_quantity_purchased:2}]};
 const frame=await finish(f),sidecar=frame.product_breakdown;assert.equal(sidecar.mixed_orders,1);assert.equal(sidecar.known_mixed_expected_repass_raw,'20');assert.equal(sidecar.known_mixed_invoice_tax_raw,'2');
 for(const row of sidecar.products){assert.equal(row.exclusive_orders,0);assert.equal(row.mixed_orders,1);assert.equal(row.exclusive_expected_repass_raw,'0');assert.equal(row.exclusive_invoice_tax_raw,'0');assert.equal(row.items[0].exclusive_quantity,0);assert.equal(row.items[0].mixed_quantity,row.quantity);}
});
