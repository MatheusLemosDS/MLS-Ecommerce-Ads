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
 for(const secret of [key,access,refresh,'PRIVATE_ORDER','PRIVATE_RETURN','PRIVATE_BUYER','cursor-','selling_price'])assert.ok(!JSON.stringify(second).includes(secret),secret);
 // Never scan raw "999" through opaque SHA-256 hashes and random UUIDs:
 // unrelated identities can naturally include those three digits. The exact
 // projection and the selling_price field guard above prove exclusion instead.
 const stored=JSON.stringify(rows(f));for(const secret of [key,access,refresh,'PRIVATE_ORDER','PRIVATE_RETURN','PRIVATE_BUYER','selling_price'])assert.ok(!stored.includes(secret),secret);
 assert.equal(rows(f).orders.length,7);assert.equal(rows(f).orders[0].order_hash,createHash('sha256').update(serial(0)).digest('hex'));
});

test('missing linked-return or ad recharge data stays unknown rather than becoming zero',async()=>{
 const f=await fixture(1);let job=await f.start();f.state.mode='returns-unknown';let result=await f.run({operation:'step',run_id:job.run_id});assert.equal(result.status,'COMPLETE');assert.equal(result.returns_orders,null);
 f.clock.time+=901000;job=await f.start();f.state.mode='missing';result=await f.run({operation:'step',run_id:job.run_id});assert.equal(result.status,'COMPLETE');assert.equal(result.ads_recharge_or_support_raw,null);
});

test('automatic page loads reuse recent running and complete cohorts without provider or data duplication',async()=>{
 const f=await fixture(1),job=await f.start();f.clock.time+=30000;
 assert.deepEqual(await f.start(),job);assert.equal(f.calls.length,0);
 const completed=await f.run({operation:'step',run_id:job.run_id}),count=f.calls.length;
 f.clock.time+=30000;assert.deepEqual(await f.start(),completed);assert.equal(f.calls.length,count);
 assert.equal(rows(f).runs.length,1);assert.equal(rows(f).orders.length,1);assert.equal(rows(f).cursors.length,1);
});

test('simultaneous automatic dashboard openings atomically share one run and initial cursor',async()=>{
 const f=await fixture(1);const runs=await Promise.all(Array.from({length:6},()=>f.start()));
 assert.equal(new Set(runs.map(run=>run.run_id)).size,1);assert.equal(rows(f).runs.length,1);assert.equal(rows(f).cursors.length,1);assert.equal(f.calls.length,0);
});

test('expired cache starts a new fixed cutoff while another selected date range stays isolated',async()=>{
 const f=await fixture(1),first=await f.start();f.clock.time+=901000;
 const fresh=await f.start();assert.notEqual(fresh.run_id,first.run_id);assert.equal(fresh.cutoff_at,first.cutoff_at+901);
 const other=await f.run({operation:'start',start_date:'2026-10-19',end_date:'2026-10-20'});
 assert.notEqual(other.run_id,fresh.run_id);assert.equal(other.start_date,'2026-10-19');assert.equal(rows(f).runs.length,3);
 assert.deepEqual(await f.run({operation:'read',run_id:first.run_id}),first);assert.equal(f.calls.length,0);
});

test('bounded automatic cache evicts stale idle entries at capacity without losing a live lease',async()=>{
 const f=await fixture(0);let first,live;
 for(let i=0;i<60;i++){
  const end=20-Math.floor(i/15),start=end-i%15;
  const run=await f.run({operation:'start',start_date:'2026-10-'+String(start).padStart(2,'0'),end_date:'2026-10-'+String(end).padStart(2,'0')});
  first??=run;live=run;
 }
 assert.equal(rows(f).runs.length,60);f.clock.time+=901000;
 f.db.db.prepare('UPDATE finance_store_period_runs SET lease_owner=?,lease_until=? WHERE run_id=?').run('FIXTURE_ACTIVE',f.clock.time/1000+45,live.run_id);
 const fresh=await f.start();assert.equal(rows(f).runs.length,60);assert.notEqual(fresh.run_id,first.run_id);
 assert.equal((await f.run({operation:'read',run_id:live.run_id})).run_id,live.run_id);
 assert.equal(f.calls.length,0);assert.equal(rows(f).cursors.length,60);
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

async function productFixture(mode='normal',bases=[]){
 const f=await fixture(3),state={mode},providerCalls=[];
 const lines=index=>index===0?[{item_id:100,model_id:0,quantity:2},{item_id:100,model_id:1,quantity:1}]
  :index===1?[{item_id:100,model_id:0,quantity:1},{item_id:200,model_id:0,quantity:3}]
  :[{item_id:300,model_id:0,quantity:1}];
 const fetchImpl=async request=>{
  const url=new URL(request.url);
  providerCalls.push(url.pathname);
  if(url.pathname===detail)return body({order_list:url.searchParams.get('order_sn_list').split(',').map(sn=>{
   const index=Number(sn.split('_').at(-1));return {order_sn:sn,order_status:'COMPLETED',currency:'BRL',
    item_list:lines(index).map(({quantity,...row})=>({...row,model_quantity_purchased:quantity}))};
  })});
  if(url.pathname!==payment)return f.fetchImpl(request);
  const index=Number(url.searchParams.get('order_sn').split('_').at(-1));
  const order_income={escrow_amount:[0.1,0.2,-0.05][index],ads_escrow_top_up_fee_or_technical_support_fee:0,
   items:lines(index).map(({quantity,...row},position)=>({...row,line_item_id:index*10+position,quantity_purchased:quantity,selling_price:99999,buyer:'PRIVATE_BUYER'}))};
  if(bases[index]!==undefined)order_income.original_cost_of_goods_sold=bases[index];
  if(state.mode==='exclusive-money-missing'&&index===0||state.mode==='mixed-money-missing'&&index===1)delete order_income.escrow_amount;
  const response={order_sn:serial(index),order_income,return_order_sn_list:index===1?['FIXTURE_PRIVATE_RETURN']:[]};
  if(state.mode==='exclusive-money-missing'&&index===2)delete response.return_order_sn_list;
  return body(response);
 };
 const job=await f.start(),run=input=>f.run({...input,fetchImpl});
 return {...f,state,job,run,providerCalls};
}

test('product payout uses a single distinct item ID even across models and leaves multi-product money unallocated',async()=>{
 const f=await productFixture(),result=await f.run({operation:'step',run_id:f.job.run_id});
 assert.equal(result.status,'COMPLETE');assert.equal(result.escrow_amount_raw,'0.25');
 assert.deepEqual(result.product_breakdown,{schema:'store_product_breakdown_v1',exclusive_order_count:2,mixed_order_count:1,
  exclusive_payout_raw:'0.05',mixed_payout_raw:'0.2',products:[
   {item_id:'100',order_count:2,exclusive_order_count:1,mixed_order_count:1,exclusive_payout_raw:'0.1',returns_orders:1},
   {item_id:'200',order_count:1,exclusive_order_count:0,mixed_order_count:1,exclusive_payout_raw:'0',returns_orders:1},
   {item_id:'300',order_count:1,exclusive_order_count:1,mixed_order_count:0,exclusive_payout_raw:'-0.05',returns_orders:0},
  ]});
 assert.equal(result.product_breakdown.products.reduce((sum,row)=>sum+row.order_count,0),4);assert.equal(result.order_count,3);
 const before=rows(f),calls=f.calls.length;assert.deepEqual(await f.run({operation:'read',run_id:f.job.run_id}),result);
 assert.equal(f.calls.length,calls);assert.deepEqual(rows(f),before);
 for(const privateValue of ['PRIVATE_ORDER','PRIVATE_RETURN','PRIVATE_BUYER','99999','order_hash','source_hash','selling_price'])assert.ok(!JSON.stringify(result.product_breakdown).includes(privateValue));
});

test('product partition missing amounts and returns retain only justified known exclusive totals',async()=>{
 for(const mode of ['exclusive-money-missing','mixed-money-missing']){
  const f=await productFixture(mode),result=await f.run({operation:'step',run_id:f.job.run_id});
  assert.equal(result.status,'COMPLETE');assert.equal(result.escrow_amount_raw,null);
  const b=result.product_breakdown;
  if(mode==='exclusive-money-missing'){
   assert.equal(b.exclusive_payout_raw,null);assert.equal(b.mixed_payout_raw,'0.2');
   assert.equal(b.products[0].exclusive_payout_raw,null);assert.equal(b.products[0].returns_orders,1);
   assert.equal(b.products[2].exclusive_payout_raw,'-0.05');assert.equal(b.products[2].returns_orders,null);assert.equal(result.returns_orders,null);
  }else{
   assert.equal(b.exclusive_payout_raw,'0.05');assert.equal(b.mixed_payout_raw,null);
   assert.equal(b.products[0].exclusive_payout_raw,'0.1');assert.equal(b.products[1].exclusive_payout_raw,'0');assert.equal(result.returns_orders,1);
  }
 }
});

test('duplicate imported orders preserve per-product payout membership and unknown-return state',async()=>{
 const f=await fixture(7),job=await f.start();await f.run({operation:'step',run_id:job.run_id});
 f.state.mode='duplicate';const result=await f.run({operation:'step',run_id:job.run_id});
 assert.equal(result.duplicate_orders,1);assert.equal(result.product_breakdown.exclusive_order_count,7);assert.equal(result.product_breakdown.mixed_order_count,0);
 assert.equal(result.product_breakdown.exclusive_payout_raw,'50.925');assert.equal(result.product_breakdown.products[0].order_count,7);
 assert.equal(result.product_breakdown.products[0].exclusive_payout_raw,'50.925');
});

test('return coverage partitions whole-order exposure while mixed orders mark each participating product without claiming returned items',async()=>{
 const f=await productFixture(),result=await f.run({operation:'step',run_id:f.job.run_id});
 assert.deepEqual(result.returns_breakdown,{schema:'store_returns_breakdown_v1',
  with_return:{order_count:1,payout_raw:'0.2'},without_reported_return:{order_count:2,payout_raw:'0.05'},unknown:{order_count:0,payout_raw:'0'},
  products:[
   {item_id:'100',order_count:2,with_return_orders:1,without_reported_return_orders:1,unknown_orders:0},
   {item_id:'200',order_count:1,with_return_orders:1,without_reported_return_orders:0,unknown_orders:0},
   {item_id:'300',order_count:1,with_return_orders:0,without_reported_return_orders:1,unknown_orders:0},
  ]});
 assert.equal(result.returns_breakdown.products.reduce((sum,row)=>sum+row.with_return_orders,0),2);
 assert.equal(result.returns_orders,1);
 for(const marker of ['PRIVATE_ORDER','PRIVATE_RETURN','PRIVATE_BUYER','order_hash','source_hash','refund_amount','selling_price'])assert.ok(!JSON.stringify(result.returns_breakdown).includes(marker));
});

test('return coverage retains known occurrences and partition payouts when another order or amount is unknown',async()=>{
 const f=await productFixture('exclusive-money-missing'),result=await f.run({operation:'step',run_id:f.job.run_id}),coverage=result.returns_breakdown;
 assert.equal(result.returns_orders,null);assert.equal(result.escrow_amount_raw,null);
 assert.deepEqual(coverage.with_return,{order_count:1,payout_raw:'0.2'});
 assert.deepEqual(coverage.without_reported_return,{order_count:1,payout_raw:null});
 assert.deepEqual(coverage.unknown,{order_count:1,payout_raw:'-0.05'});
 assert.equal(coverage.products.find(row=>row.item_id==='100').with_return_orders,1);
 assert.equal(coverage.products.find(row=>row.item_id==='300').unknown_orders,1);
 const mixed=await productFixture('mixed-money-missing'),other=await mixed.run({operation:'step',run_id:mixed.job.run_id});
 assert.deepEqual(other.returns_breakdown.with_return,{order_count:1,payout_raw:null});
 assert.deepEqual(other.returns_breakdown.without_reported_return,{order_count:2,payout_raw:'0.05'});
 assert.deepEqual(other.returns_breakdown.unknown,{order_count:0,payout_raw:'0'});
});

test('cached hashed order records derive return coverage without schema changes, new provider reads or duplicate memberships',async()=>{
 const f=await fixture(7),job=await f.start();await f.run({operation:'step',run_id:job.run_id});
 f.state.mode='duplicate';const result=await f.run({operation:'step',run_id:job.run_id}),before=rows(f),calls=f.calls.length;
 assert.deepEqual(result.returns_breakdown.with_return,{order_count:1,payout_raw:'0.1'});
 assert.deepEqual(result.returns_breakdown.without_reported_return,{order_count:6,payout_raw:'50.825'});
 assert.deepEqual(result.returns_breakdown.unknown,{order_count:0,payout_raw:'0'});
 for(const record of before.orders){
  const canonical={order_hash:record.order_hash,escrow_raw:record.escrow_raw,ads_raw:record.ads_raw,returns_seen:record.returns_seen,items:record.items,checked_at:record.checked_at};
  assert.equal(record.source_hash,createHash('sha256').update(JSON.stringify(canonical)).digest('hex'));
  assert.equal(Object.hasOwn(record,'returns_breakdown'),false);
 }
 const cached=await f.run({operation:'read',run_id:job.run_id});assert.deepEqual(cached.returns_breakdown,result.returns_breakdown);
 assert.deepEqual(rows(f),before);assert.equal(f.calls.length,calls);
 const empty=await fixture(0),emptyJob=await empty.start(),noOrders=await empty.run({operation:'step',run_id:emptyJob.run_id});
 assert.deepEqual(noOrders.returns_breakdown,{schema:'store_returns_breakdown_v1',with_return:{order_count:0,payout_raw:'0'},without_reported_return:{order_count:0,payout_raw:'0'},unknown:{order_count:0,payout_raw:'0'},products:[]});
});

const invoiceRows=f=>f.db.db.prepare('SELECT * FROM finance_store_period_invoice_bases ORDER BY run_id,order_hash').all();
async function invoiceFixture(bases){
 const f=await fixture(bases.length),fetchImpl=async request=>{
  const response=await f.fetchImpl(request),url=new URL(request.url);
  if(url.pathname!==payment)return response;
  const value=await response.json(),index=Number(url.searchParams.get('order_sn').split('_').at(-1));
  if(bases[index]!==undefined)value.response.order_income.original_cost_of_goods_sold=bases[index];
  return Response.json(value);
 };
 return {...f,run:input=>f.run({...input,fetchImpl})};
}

test('invoice tax uses goods value and HALF_UP per order from the existing Payment response, never repass or production',async()=>{
 const f=await invoiceFixture([0.25,0.25]),job=await f.start(),result=await f.run({operation:'step',run_id:job.run_id});
 assert.equal(result.status,'COMPLETE');assert.equal(result.escrow_amount_raw,'0.3');
 assert.deepEqual(result.invoice_tax,{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:2,unavailable_orders:0,known_base_raw:'0.5',known_tax_raw:'0.02'});
 assert.equal(f.calls.length,4);assert.equal(f.calls.filter(request=>new URL(request.url).pathname===payment).length,2);
 const before=rows(f),aux=invoiceRows(f),calls=f.calls.length;
 for(const row of aux){
  const parent=before.orders.find(record=>record.order_hash===row.order_hash);assert.equal(row.parent_source_hash,parent.source_hash);
  const canonical={run_id:job.run_id,order_hash:row.order_hash,base_raw:row.base_raw,parent_source_hash:row.parent_source_hash,checked_at:row.checked_at};
  assert.equal(row.source_hash,createHash('sha256').update(JSON.stringify(canonical)).digest('hex'));
 }
 assert.deepEqual(await f.run({operation:'read',run_id:job.run_id}),result);assert.deepEqual(rows(f),before);assert.deepEqual(invoiceRows(f),aux);assert.equal(f.calls.length,calls);
 for(const marker of [key,access,refresh,'PRIVATE_ORDER','PRIVATE_BUYER','original_cost_of_goods_sold','parent_source_hash'])assert.ok(!JSON.stringify(result).includes(marker));
});

test('invalid or absent goods bases stay unavailable without failing financial import, while explicit zero is covered',async()=>{
 const bases=[undefined,null,-1,1.001,'50',1000000000000.01,0,50],f=await invoiceFixture(bases),job=await f.start();
 await f.run({operation:'step',run_id:job.run_id});const result=await f.run({operation:'step',run_id:job.run_id});
 assert.equal(result.status,'COMPLETE');assert.equal(result.order_count,bases.length);
 assert.equal(result.invoice_tax.covered_orders,2);assert.equal(result.invoice_tax.unavailable_orders,6);
 assert.equal(result.invoice_tax.known_base_raw,'50');assert.equal(result.invoice_tax.known_tax_raw,'1');
 assert.equal(invoiceRows(f).length,bases.length);assert.equal(invoiceRows(f).filter(row=>row.base_raw===null).length,6);
 const calls=f.calls.length;assert.deepEqual(await f.start(),result);assert.equal(f.calls.length,calls);
});

test('old nonempty cached cohorts are readable with unknown tax coverage and a normal opening starts a fresh tax-capable cohort once',async()=>{
 const f=await invoiceFixture([50,100]),old=await f.start(),completed=await f.run({operation:'step',run_id:old.run_id}),calls=f.calls.length;
 assert.equal(completed.invoice_tax.covered_orders,2);f.db.db.prepare('DELETE FROM finance_store_period_invoice_bases WHERE run_id=?').run(old.run_id);
 const legacy=await f.run({operation:'read',run_id:old.run_id});assert.equal(legacy.invoice_tax.covered_orders,0);assert.equal(legacy.invoice_tax.unavailable_orders,2);assert.equal(legacy.invoice_tax.known_tax_raw,'0');assert.equal(f.calls.length,calls);
 const fresh=await f.start();assert.notEqual(fresh.run_id,old.run_id);assert.equal(fresh.order_count,0);assert.equal(f.calls.length,calls);
 const result=await f.run({operation:'step',run_id:fresh.run_id});assert.equal(result.invoice_tax.known_tax_raw,'3');
 const currentCalls=f.calls.length;assert.deepEqual(await f.start(),result);assert.equal(f.calls.length,currentCalls);
 const empty=await invoiceFixture([25]),emptyRun=await empty.start();assert.deepEqual(await empty.start(),emptyRun);
 assert.equal((await empty.run({operation:'step',run_id:emptyRun.run_id})).invoice_tax.covered_orders,1);
});

test('independent invoice hashes, original-record linkage, timestamp and precision are checked before cached tax is exposed',async()=>{
 const mutations=[
  row=>({...row,base_raw:'999.99'}),
  row=>({...row,parent_source_hash:'0'.repeat(64),rehash:true}),
  row=>({...row,checked_at:row.checked_at-1,rehash:true}),
  row=>({...row,base_raw:'1.001',rehash:true}),
  row=>({...row,base_raw:'-1',rehash:true}),
  row=>({...row,source_hash:'f'.repeat(64)}),
 ];
 for(const mutate of mutations){
  const f=await invoiceFixture([50]),job=await f.start();await f.run({operation:'step',run_id:job.run_id});
  const row=mutate(invoiceRows(f)[0]);
  if(row.rehash)row.source_hash=createHash('sha256').update(JSON.stringify({run_id:job.run_id,order_hash:row.order_hash,base_raw:row.base_raw,parent_source_hash:row.parent_source_hash,checked_at:row.checked_at})).digest('hex');
  f.db.db.prepare('UPDATE finance_store_period_invoice_bases SET base_raw=?,source_hash=?,parent_source_hash=?,checked_at=? WHERE run_id=? AND order_hash=?').run(row.base_raw,row.source_hash,row.parent_source_hash,row.checked_at,job.run_id,row.order_hash);
  const calls=f.calls.length;await assert.rejects(f.run({operation:'read',run_id:job.run_id}),error=>error.code==='FINANCE_STORE_STORAGE_INVALID');assert.equal(f.calls.length,calls);
 }
});

test('lease expiry and transactional invoice insertion failure cannot leave an order without its new tax evidence',async()=>{
 const f=await invoiceFixture([50]),job=await f.start();f.state.hold=true;
 const began=new Promise(resolve=>f.state.started=resolve),pending=f.run({operation:'step',run_id:job.run_id});await began;
 f.clock.time+=46000;f.state.hold=false;f.state.release();const expired=await pending;
 assert.equal(expired.diagnostic,'STORE_PERIOD_CONFLICT');assert.equal(rows(f).orders.length,0);assert.equal(invoiceRows(f).length,0);
 const resumed=await f.run({operation:'step',run_id:job.run_id});assert.equal(resumed.invoice_tax.known_tax_raw,'1');assert.equal(invoiceRows(f).length,1);
 const broken=await invoiceFixture([25]),brokenRun=await broken.start();
 broken.db.db.exec("CREATE TRIGGER fixture_invoice_failure BEFORE INSERT ON finance_store_period_invoice_bases BEGIN SELECT RAISE(ABORT,'FIXTURE_INVOICE_FAILURE'); END");
 const failed=await broken.run({operation:'step',run_id:brokenRun.run_id});assert.equal(failed.diagnostic,'STORE_PERIOD_UPSTREAM_UNAVAILABLE');assert.equal(rows(broken).orders.length,0);assert.equal(invoiceRows(broken).length,0);
 broken.db.db.exec('DROP TRIGGER fixture_invoice_failure');assert.equal((await broken.run({operation:'step',run_id:brokenRun.run_id})).invoice_tax.known_tax_raw,'0.5');
});

test('invoice evidence expires with its parent cohort under age retention and bounded-cache eviction',async()=>{
 const f=await invoiceFixture([50]),job=await f.start();await f.run({operation:'step',run_id:job.run_id});assert.equal(invoiceRows(f).length,1);
 f.clock.time+=31*86400000;await f.start();assert.equal(invoiceRows(f).length,0);assert.equal(rows(f).orders.length,0);
 await assert.rejects(f.run({operation:'read',run_id:job.run_id}),error=>error.code==='FINANCE_STORE_RUN_NOT_FOUND');
 const bounded=await invoiceFixture([25]),first=await bounded.start();await bounded.run({operation:'step',run_id:first.run_id});
 for(let i=0;i<60;i++){
  const end=20-Math.floor(i/15),start=end-i%15;if(start===14&&end===20)continue;
  bounded.clock.time+=1000;await bounded.run({operation:'start',start_date:'2026-10-'+String(start).padStart(2,'0'),end_date:'2026-10-'+String(end).padStart(2,'0')});
 }
 assert.equal(rows(bounded).runs.length,60);bounded.clock.time+=901000;await bounded.start();assert.equal(rows(bounded).runs.length,60);
 assert.equal(invoiceRows(bounded).length,0);assert.equal(rows(bounded).orders.length,0);
 await assert.rejects(bounded.run({operation:'read',run_id:first.run_id}),error=>error.code==='FINANCE_STORE_RUN_NOT_FOUND');
});

test('whole per-order invoice tax follows an exclusive product across models and leaves mixed-order tax unallocated',async()=>{
 const f=await productFixture('normal',[0.25,0.75,0.25]),result=await f.run({operation:'step',run_id:f.job.run_id});
 assert.equal(result.status,'COMPLETE');assert.equal(result.invoice_tax.known_tax_raw,'0.04');
 assert.deepEqual(result.product_invoice_tax,{schema:'store_product_invoice_tax_v1',exclusive_covered_orders:2,mixed_covered_orders:1,
  known_exclusive_tax_raw:'0.02',known_mixed_tax_raw:'0.02',products:[
   {item_id:'100',exclusive_covered_orders:1,known_exclusive_tax_raw:'0.01'},
   {item_id:'200',exclusive_covered_orders:0,known_exclusive_tax_raw:'0'},
   {item_id:'300',exclusive_covered_orders:1,known_exclusive_tax_raw:'0.01'},
  ]});
 assert.equal(result.product_breakdown.products[0].exclusive_order_count,1);
 assert.equal(result.items.filter(row=>row.item_id==='100').length,2);
 assert.equal(result.product_invoice_tax.products[0].known_exclusive_tax_raw,'0.01');
 assert.equal(f.providerCalls.filter(path=>path===payment).length,3);
 assert.equal(f.providerCalls.length,5);
 assert.equal(invoiceRows(f).length,3);
 for(const marker of ['PRIVATE_ORDER','PRIVATE_BUYER','PRIVATE_RETURN','source_hash','order_hash','original_cost_of_goods_sold'])assert.ok(!JSON.stringify(result.product_invoice_tax).includes(marker));
});

test('per-product tax preserves invoice rounding instead of re-rounding one product aggregate or multiplying by quantity',async()=>{
 const f=await invoiceFixture([0.25,0.25]),job=await f.start(),result=await f.run({operation:'step',run_id:job.run_id});
 assert.equal(result.product_breakdown.products.length,1);assert.equal(result.items.length,2);
 assert.equal(result.items.reduce((total,row)=>total+row.quantity,0),4);
 assert.deepEqual(result.product_invoice_tax,{schema:'store_product_invoice_tax_v1',exclusive_covered_orders:2,mixed_covered_orders:0,
  known_exclusive_tax_raw:'0.02',known_mixed_tax_raw:'0',products:[{item_id:'100',exclusive_covered_orders:2,known_exclusive_tax_raw:'0.02'}]});
 assert.equal(f.calls.filter(request=>new URL(request.url).pathname===payment).length,2);
});

test('missing bases keep only their product tax coverage unavailable while independent covered products retain exact known tax',async()=>{
 const f=await productFixture('normal',[0.25,undefined,null]),result=await f.run({operation:'step',run_id:f.job.run_id});
 assert.equal(result.invoice_tax.covered_orders,1);assert.equal(result.invoice_tax.unavailable_orders,2);
 assert.deepEqual(result.product_invoice_tax,{schema:'store_product_invoice_tax_v1',exclusive_covered_orders:1,mixed_covered_orders:0,
  known_exclusive_tax_raw:'0.01',known_mixed_tax_raw:'0',products:[
   {item_id:'100',exclusive_covered_orders:1,known_exclusive_tax_raw:'0.01'},
   {item_id:'200',exclusive_covered_orders:0,known_exclusive_tax_raw:'0'},
   {item_id:'300',exclusive_covered_orders:0,known_exclusive_tax_raw:'0'},
  ]});
 const before=rows(f),aux=invoiceRows(f),calls=f.calls.length,cached=await f.run({operation:'read',run_id:f.job.run_id});
 assert.deepEqual(cached.product_invoice_tax,result.product_invoice_tax);assert.deepEqual(rows(f),before);assert.deepEqual(invoiceRows(f),aux);assert.equal(f.calls.length,calls);
 f.db.db.prepare('DELETE FROM finance_store_period_invoice_bases WHERE run_id=?').run(f.job.run_id);
 const legacy=await f.run({operation:'read',run_id:f.job.run_id});assert.equal(legacy.product_invoice_tax.exclusive_covered_orders,0);
 assert.equal(legacy.product_invoice_tax.mixed_covered_orders,0);assert.equal(legacy.product_invoice_tax.known_exclusive_tax_raw,'0');
 assert.equal(legacy.invoice_tax.unavailable_orders,3);assert.ok(legacy.product_invoice_tax.products.every(row=>row.exclusive_covered_orders===0));
 assert.equal(f.calls.length,calls);
});

test('explicit zero and empty cohorts have covered zero product tax without creating mixed allocations or new evidence',async()=>{
 const f=await productFixture('normal',[0,0,0]),result=await f.run({operation:'step',run_id:f.job.run_id});
 assert.equal(result.product_invoice_tax.exclusive_covered_orders,2);assert.equal(result.product_invoice_tax.mixed_covered_orders,1);
 assert.equal(result.product_invoice_tax.known_exclusive_tax_raw,'0');assert.equal(result.product_invoice_tax.known_mixed_tax_raw,'0');
 assert.deepEqual(result.product_invoice_tax.products.map(row=>[row.item_id,row.exclusive_covered_orders]),[['100',1],['200',0],['300',1]]);
 const empty=await fixture(0),job=await empty.start(),noOrders=await empty.run({operation:'step',run_id:job.run_id});
 assert.deepEqual(noOrders.product_invoice_tax,{schema:'store_product_invoice_tax_v1',exclusive_covered_orders:0,mixed_covered_orders:0,
  known_exclusive_tax_raw:'0',known_mixed_tax_raw:'0',products:[]});
 assert.equal(invoiceRows(empty).length,0);assert.equal(empty.calls.filter(request=>new URL(request.url).pathname===payment).length,0);
});
