import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {runFinanceStorePeriod} from '../src/store-period.mjs';

const key='fixture-store-period-key-ç',access='fixture-store-access',refresh='fixture-store-refresh';
const list='/api/v2/order/get_order_list',detail='/api/v2/order/get_order_detail',payment='/api/v2/payment/get_escrow_detail';
const serial=index=>'FIXTURE_PRIVATE_ORDER_'+index;
const body=value=>Response.json({error:'',request_id:'FIXTURE_PRIVATE_REQUEST',response:value});
const item=index=>({item_id:100,model_id:index%2,model_quantity_purchased:2});
const income=index=>({order_sn:serial(index),escrow_amount:index===0?0.1:index===1?0.2:10.125,ads_escrow_top_up_fee_or_technical_support_fee:0,items:[{item_id:100,model_id:index%2,line_item_id:1000+index,quantity_purchased:2,selling_price:999,buyer:'PRIVATE_BUYER'}]});
async function fixture(count=7,ttl=500){
 const db=new D1(),clock={time:Date.UTC(2026,9,20,15,0)};let chain=Promise.resolve();const batch=db.batch.bind(db);db.batch=statements=>{const next=chain.then(()=>batch(statements));chain=next.catch(()=>{});return next;};
 const now=()=>clock.time;
 const env={FINANCE_DB:db,FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,27).toString('base64'),FINANCE_CONNECTION_ENABLED:'true',SHOPEE_FINANCE_PARTNER_KEY:key};
 const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:access,refresh_token:refresh,expires_at:Math.floor(now()/1000)+ttl});
 const calls=[],state={count,mode:'normal',active:0,maxActive:0,hold:false,release:null,started:null};
 const fetchImpl=async request=>{
  calls.push(request);const url=new URL(request.url);
  if(url.pathname==='/api/v2/auth/access_token/get')return Response.json({error:'',message:'',request_id:'FIXTURE_PRIVATE_REFRESH_REQUEST',partner_id:2049333,shop_id:1178167501,access_token:access+'-new',refresh_token:refresh+'-new',expire_in:14400});
  assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(request.method,'GET');assert.equal(request.redirect,'manual');
  for(const name of ['cookie','authorization','x-braza-app-key','x-braza-finance-router'])assert.equal(request.headers.get(name),null);
  const expected=url.searchParams.get('access_token');assert.ok([access,access+'-new'].includes(expected));
  assert.equal(url.searchParams.get('partner_id'),'2049333');assert.equal(url.searchParams.get('shop_id'),'1178167501');
  assert.equal(url.searchParams.get('sign'),createHmac('sha256',key).update('2049333'+url.pathname+url.searchParams.get('timestamp')+expected+'1178167501').digest('hex'));
  if(state.mode==='http')return Response.json({error:'error_sign',message:key},{status:403});
  if(url.pathname===list){
   if(state.started){state.started();state.started=null;}if(state.hold)await new Promise(resolve=>state.release=resolve);
   assert.equal(url.searchParams.get('page_size'),'5');assert.equal(url.searchParams.get('order_status'),'COMPLETED');assert.equal(url.searchParams.get('time_range_field'),'create_time');
   const cursor=url.searchParams.get('cursor'),offset=cursor===''?0:Number(cursor.slice(7));
   const order_list=Array.from({length:Math.min(5,Math.max(0,state.count-offset))},(_,i)=>({order_sn:serial(offset+i)}));
   if(state.mode==='duplicate'&&offset===5)order_list.unshift({order_sn:serial(0)});
   const more=offset+5<state.count;
   return body({order_list,more,next_cursor:state.mode==='loop'&&more?'bad-loop':more?'cursor-'+(offset+5):''});
  }
  if(url.pathname===detail){const sns=url.searchParams.get('order_sn_list').split(',');return body({order_list:sns.map(sn=>{const index=Number(sn.split('_').at(-1));return {order_sn:sn,order_status:state.mode==='status'?'SHIPPED':'COMPLETED',currency:state.mode==='currency'?'USD':'BRL',item_list:[item(index)],buyer_username:'PRIVATE_BUYER'};})});}
  assert.equal(url.pathname,payment);state.active++;state.maxActive=Math.max(state.maxActive,state.active);await new Promise(resolve=>setTimeout(resolve,2));state.active--;
  const index=Number(url.searchParams.get('order_sn').split('_').at(-1)),order_income=income(index);
  if(state.mode==='quantity')order_income.items[0].quantity_purchased=3;
  if(state.mode==='foreign')order_income.order_sn='FOREIGN_PRIVATE_ORDER';
  if(state.mode==='precision')order_income.escrow_amount=0.0000000000001;
  if(state.mode==='missing')delete order_income.ads_escrow_top_up_fee_or_technical_support_fee;
  const response={order_sn:serial(index),order_income,buyer_user_name:'PRIVATE_BUYER'};
  if(state.mode!=='returns-unknown')response.return_order_sn_list=index===0?['FIXTURE_PRIVATE_RETURN']:[];
  return body(response);
 };
 const run=input=>runFinanceStorePeriod(env,{fetchImpl,now,...input});
 const start=()=>run({operation:'start',start_date:'2026-10-14',end_date:'2026-10-20'});
 return {db,env,clock,now,store,calls,state,fetchImpl,run,start};
}
const rows=f=>({runs:f.db.db.prepare('SELECT * FROM finance_store_period_runs').all(),orders:f.db.db.prepare('SELECT * FROM finance_store_period_orders').all(),cursors:f.db.db.prepare('SELECT * FROM finance_store_period_cursors').all()});

test('start/read create fixed scoped job without provider calls; invalid periods and foreign run IDs fail closed',async()=>{
 const f=await fixture();const tokenBefore=await f.store.readTokens(),started=await f.start();assert.equal(started.status,'RUNNING');assert.equal(started.order_count,0);assert.equal(f.calls.length,0);assert.equal(started.cutoff_at,f.now()/1000);
 assert.deepEqual(await f.run({operation:'read',run_id:started.run_id}),started);assert.equal(f.calls.length,0);assert.deepEqual(await f.store.readTokens(),tokenBefore);
 const runRow=rows(f).runs[0];assert.equal(runRow.time_from,Date.UTC(2026,9,14,3)/1000);assert.equal(runRow.time_to,f.now()/1000);
 for(const input of [{operation:'start',start_date:'2026-10-21',end_date:'2026-10-21'},{operation:'start',start_date:'2026-10-01',end_date:'2026-10-20'},{operation:'step',run_id:'invalid'}])await assert.rejects(f.run(input));
 await assert.rejects(f.run({operation:'read',run_id:'12345678-1234-4123-8123-123456789abc'}));assert.equal(f.calls.length,0);
});

test('two bounded pages collect every completed order exactly once with raw decimal sums, two Payment requests at most in flight and no private exports',async()=>{
 const f=await fixture();const started=await f.start(),tokens=await f.store.readTokens();
 const first=await f.run({operation:'step',run_id:started.run_id});assert.equal(first.status,'RUNNING');assert.equal(first.pages_read,1);assert.equal(first.order_count,5);assert.equal(first.escrow_amount_raw,'30.675');assert.equal(first.returns_orders,1);assert.equal(first.ads_recharge_or_support_raw,'0');
 const second=await f.run({operation:'step',run_id:started.run_id});assert.equal(second.status,'COMPLETE');assert.equal(second.pages_read,2);assert.equal(second.order_count,7);assert.equal(second.escrow_amount_raw,'50.925');assert.deepEqual(second.items,[{item_id:'100',model_id:'0',quantity:8},{item_id:'100',model_id:'1',quantity:6}]);assert.equal(f.state.maxActive,2);
 const calls=f.calls.length;assert.deepEqual(await f.run({operation:'step',run_id:started.run_id}),second);assert.equal(f.calls.length,calls);assert.deepEqual(await f.store.readTokens(),tokens);
 for(const secret of [key,access,refresh,'PRIVATE_ORDER','PRIVATE_RETURN','PRIVATE_BUYER','cursor-','selling_price','999'])assert.ok(!JSON.stringify(second).includes(secret));
 const stored=JSON.stringify(rows(f));for(const secret of [key,access,refresh,'PRIVATE_ORDER','PRIVATE_RETURN','PRIVATE_BUYER','selling_price','999'])assert.ok(!stored.includes(secret));
 assert.equal(rows(f).orders.length,7);assert.equal(rows(f).orders[0].order_hash,createHash('sha256').update(serial(0)).digest('hex'));
});

test('missing linked-return or ad recharge data stays unknown rather than becoming zero',async()=>{
 const f=await fixture(1);let job=await f.start();f.state.mode='returns-unknown';let result=await f.run({operation:'step',run_id:job.run_id});assert.equal(result.status,'COMPLETE');assert.equal(result.returns_orders,null);
 job=await f.start();f.state.mode='missing';result=await f.run({operation:'step',run_id:job.run_id});assert.equal(result.status,'COMPLETE');assert.equal(result.ads_recharge_or_support_raw,null);
});

test('a failed page retains prior imported records/cursor and reports a finite stop diagnostic without invalidating finance connection',async()=>{
 for(const mode of ['http','status','currency','quantity','foreign','precision']){
  const f=await fixture(7),job=await f.start();const first=await f.run({operation:'step',run_id:job.run_id});const before=rows(f),tokens=await f.store.readTokens();f.state.mode=mode;
  const result=await f.run({operation:'step',run_id:job.run_id});assert.equal(result.status,'RUNNING');assert.equal(result.diagnostic,'STORE_PERIOD_UPSTREAM_UNAVAILABLE');assert.equal(result.revision,first.revision);assert.equal(result.pages_read,1);assert.equal(result.order_count,5);assert.deepEqual(rows(f).orders,before.orders);assert.deepEqual(rows(f).cursors,before.cursors);assert.deepEqual(await f.store.readTokens(),tokens);
  for(const secret of [key,access,refresh,'PRIVATE_ORDER','PRIVATE_BUYER'])assert.ok(!JSON.stringify(result).includes(secret));
  f.state.mode='normal';const resumed=await f.run({operation:'step',run_id:job.run_id});assert.equal(resumed.status,'COMPLETE');assert.equal(resumed.order_count,7);
 }
});

test('duplicate orders across pages do not double count amounts or quantities',async()=>{
 const f=await fixture(7),job=await f.start();await f.run({operation:'step',run_id:job.run_id});f.state.mode='duplicate';const result=await f.run({operation:'step',run_id:job.run_id});assert.equal(result.status,'COMPLETE');assert.equal(result.order_count,7);assert.equal(result.duplicate_orders,1);assert.equal(result.escrow_amount_raw,'50.925');
 assert.equal(f.calls.filter(request=>new URL(request.url).pathname===payment&&new URL(request.url).searchParams.get('order_sn')===serial(0)).length,1);
});

test('concurrent steps have one lease owner and one committed page; conflict does not issue provider reads',async()=>{
 const f=await fixture(),job=await f.start();f.state.hold=true;const began=new Promise(resolve=>f.state.started=resolve);const pending=f.run({operation:'step',run_id:job.run_id});await began;const calls=f.calls.length;
 const conflict=await f.run({operation:'step',run_id:job.run_id});assert.equal(conflict.diagnostic,'STORE_PERIOD_CONFLICT');assert.equal(conflict.order_count,0);assert.equal(f.calls.length,calls);f.state.hold=false;f.state.release();const result=await pending;assert.equal(result.pages_read,1);assert.equal(result.order_count,5);assert.equal(rows(f).orders.length,5);
});

test('expired access refreshes one encrypted pair before all page reads, and subsequent steps reuse it',async()=>{
 const f=await fixture(7,1),job=await f.start();const result=await f.run({operation:'step',run_id:job.run_id});assert.equal(result.order_count,5);assert.equal(f.calls.filter(request=>new URL(request.url).pathname==='/api/v2/auth/access_token/get').length,1);assert.equal((await f.store.readTokens()).access_token,access+'-new');await f.run({operation:'step',run_id:job.run_id});assert.equal(f.calls.filter(request=>new URL(request.url).pathname==='/api/v2/auth/access_token/get').length,1);
 assert.ok(!JSON.stringify(rows(f)).includes(access+'-new'));
});

test('persisted financial data is independently hashed and corruption cannot produce a plausible total',async()=>{
 const f=await fixture(1),job=await f.start();await f.run({operation:'step',run_id:job.run_id});f.db.db.prepare('UPDATE finance_store_period_orders SET escrow_raw=? WHERE run_id=?').run('99999',job.run_id);await assert.rejects(f.run({operation:'read',run_id:job.run_id}),error=>error.code==='FINANCE_STORE_STORAGE_INVALID');
});

test('an empty completed cohort is complete with explicit zero and no detail or Payment request',async()=>{
 const f=await fixture(0),job=await f.start(),result=await f.run({operation:'step',run_id:job.run_id});
 assert.equal(result.status,'COMPLETE');assert.equal(result.pages_read,1);assert.equal(result.order_count,0);assert.equal(result.escrow_amount_raw,'0');assert.equal(result.ads_recharge_or_support_raw,'0');assert.equal(result.returns_orders,0);assert.deepEqual(result.items,[]);assert.equal(f.calls.length,1);
});

test('a repeated private cursor stops pagination without changing already imported records',async()=>{
 const f=await fixture(1),job=await f.start();
 const fetchImpl=async request=>new URL(request.url).pathname===list?body({order_list:[{order_sn:serial(0)}],more:true,next_cursor:'fixture-loop-cursor'}):f.fetchImpl(request);
 const first=await f.run({operation:'step',run_id:job.run_id,fetchImpl});assert.equal(first.order_count,1);const before=rows(f);
 const failed=await f.run({operation:'step',run_id:job.run_id,fetchImpl});assert.equal(failed.status,'RUNNING');assert.equal(failed.diagnostic,'STORE_PERIOD_UPSTREAM_UNAVAILABLE');assert.equal(failed.pages_read,1);assert.equal(failed.revision,first.revision);assert.deepEqual(rows(f).orders,before.orders);assert.deepEqual(rows(f).cursors,before.cursors);
});

test('a page exceeding the item-group cap stops as incomplete and preserves the preceding complete page',async()=>{
 const f=await fixture(2),job=await f.start();
 const lines=(index,quantityField)=>Array.from({length:501},(_,offset)=>({item_id:100000+index*1000+offset,model_id:0,[quantityField]:1}));
 const fetchImpl=async request=>{
  const url=new URL(request.url);
  if(url.pathname===list){const index=Number(url.searchParams.get('cursor')==='fixture-page-two');return body({order_list:[{order_sn:serial(index)}],more:index===0,next_cursor:index===0?'fixture-page-two':''});}
  if(url.pathname===detail){const index=Number(url.searchParams.get('order_sn_list').split('_').at(-1));return body({order_list:[{order_sn:serial(index),order_status:'COMPLETED',currency:'BRL',item_list:lines(index,'model_quantity_purchased')}]});}
  assert.equal(url.pathname,payment);const index=Number(url.searchParams.get('order_sn').split('_').at(-1));return body({order_sn:serial(index),return_order_sn_list:[],order_income:{escrow_amount:10,ads_escrow_top_up_fee_or_technical_support_fee:0,items:lines(index,'quantity_purchased')}});
 };
 const first=await f.run({operation:'step',run_id:job.run_id,fetchImpl});assert.equal(first.items.length,501);assert.equal(first.order_count,1);const before=rows(f);
 const capped=await f.run({operation:'step',run_id:job.run_id,fetchImpl});assert.equal(capped.status,'LIMIT_REACHED');assert.equal(capped.diagnostic,null);assert.equal(capped.pages_read,1);assert.equal(capped.order_count,1);assert.equal(capped.items.length,501);assert.equal(capped.escrow_amount_raw,'10');assert.deepEqual(rows(f).orders,before.orders);assert.deepEqual(rows(f).cursors,before.cursors);
});

test('the two-hundred-page cap never declares a still-paginating cohort complete',async()=>{
 const f=await fixture(1),job=await f.start();let page=0;
 const fetchImpl=async request=>new URL(request.url).pathname===list?body({order_list:[{order_sn:serial(0)}],more:true,next_cursor:'fixture-page-'+(++page)}):f.fetchImpl(request);
 let result;for(let i=0;i<200;i++)result=await f.run({operation:'step',run_id:job.run_id,fetchImpl});
 assert.equal(result.status,'LIMIT_REACHED');assert.equal(result.pages_read,200);assert.equal(result.order_count,1);assert.equal(result.duplicate_orders,199);assert.equal(result.escrow_amount_raw,'0.1');assert.equal(f.calls.filter(request=>new URL(request.url).pathname===payment).length,1);
 const priorPage=page;assert.deepEqual(await f.run({operation:'step',run_id:job.run_id,fetchImpl}),result);assert.equal(page,priorPage);
});
