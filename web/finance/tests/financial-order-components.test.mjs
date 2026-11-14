import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore,FINANCE_PROFILE} from '../src/connection-store.mjs';
import {runFinanceBusinessPeriod} from '../src/business-period.mjs';
import {projectBusinessPeriodFrame} from '../src/business-period-frame.mjs';
import {FINANCIAL_ORDER_COMPONENT_FIELDS,FINANCIAL_ORDER_COMPONENTS_SCHEMA,buildFinancialOrderComponents,projectFinancialOrderComponents,readFinancialOrderComponents} from '../src/financial-order-components.mjs';

const stamp=Date.UTC(2026,9,20,15)/1000,now=()=>stamp*1000,run_id='11111111-1111-4111-8111-111111111111',hash=v=>createHash('sha256').update(v).digest('hex');
function input(){
 const order_sn='PRIVATE_COMPONENT_ORDER',record={order_hash:hash(order_sn),bucket:'completed',payment_covered:1,sales_raw:'120',escrow_raw:'100',ads_raw:'0',returns_seen:0,items:'[{"item_id":"100","model_id":"0","quantity":1}]',checked_at:stamp};record.source_hash=hash(JSON.stringify(record));
 const order={order_sn,create_time:stamp-100,update_time:stamp-10,pay_time:stamp-90,complete_time:stamp-20,buyer_username:'PRIVATE_BUYER'};
 const order_income={escrow_amount:100,escrow_amount_after_adjustment:99,total_adjustment_amount:-1,original_cost_of_goods_sold:120,buyer_total_amount:122,commission_fee:10,service_fee:2,seller_transaction_fee:1,actual_shipping_fee:3,ads_escrow_top_up_fee_or_technical_support_fee:0,buyer:'PRIVATE_BUYER',unknown_fee:999};
 return {order_sn,order_status:'COMPLETED',currency:'BRL',record,order,payment:{order_sn,return_order_sn_list:[],order_income}};
}
async function database(t,{schema=true,capture=true}={}){
 const db=new D1();t.after(()=>db.db.close());
 db.db.exec(`CREATE TABLE finance_business_period_runs(run_id TEXT PRIMARY KEY,revision INTEGER,checked_at INTEGER,partner_id INTEGER,shop_id INTEGER);CREATE TABLE finance_business_period_orders(run_id TEXT,order_hash TEXT,source_hash TEXT,checked_at INTEGER);CREATE TABLE finance_business_period_payment_cache(run_id TEXT,order_hash TEXT,source_hash TEXT,checked_at INTEGER);`);
 db.db.prepare('INSERT INTO finance_business_period_runs VALUES(?,?,?,?,?)').run(run_id,2,stamp,FINANCE_PROFILE.partner_id,FINANCE_PROFILE.shop_id);
 const source=input(),r=source.record;db.db.prepare('INSERT INTO finance_business_period_orders VALUES(?,?,?,?)').run(run_id,r.order_hash,r.source_hash,r.checked_at);
 if(schema)await db.batch(FINANCIAL_ORDER_COMPONENTS_SCHEMA.map(sql=>db.prepare(sql)));
 if(schema&&capture){const row=await buildFinancialOrderComponents(source);db.db.prepare('INSERT INTO finance_financial_order_components VALUES(?,?,?,?,?,?)').run(run_id,row.order_hash,row.source_hash,row.checked_at,row.payload,row.payload_hash);}
 return {db,env:{FINANCE_DB:db},source,read:options=>readFinancialOrderComponents({FINANCE_DB:db},{run_id,order_hashes:[r.order_hash]},{now,...options})};
}

test('component capture keeps only finite observed money and source timestamps with exact cents and immutable provenance',async()=>{
 const source=input(),before=structuredClone(source),row=await buildFinancialOrderComponents(source),p=JSON.parse(row.payload);
 assert.equal(p.status,'AVAILABLE');assert.equal(p.amounts.commission_fee_cents,1000);assert.equal(p.amounts.total_adjustment_amount_cents,-100);assert.equal(p.amounts.ads_escrow_top_up_fee_or_technical_support_fee_cents,0);assert.equal(Object.keys(p.amounts).length,FINANCIAL_ORDER_COMPONENT_FIELDS.length);
 assert.equal(p.dates.created_at,new Date((stamp-100)*1000).toISOString());assert.equal(p.dates.completed_at,new Date((stamp-20)*1000).toISOString());assert.equal(p.order_hash,source.record.order_hash);assert.equal(p.source_hash,source.record.source_hash);assert.equal(row.payload_hash,hash(row.payload));assert.deepEqual(projectFinancialOrderComponents(p),p);assert.deepEqual(source,before);
 for(const text of ['PRIVATE_COMPONENT_ORDER','PRIVATE_BUYER','unknown_fee','return_order_sn_list','item_id'])assert.equal(row.payload.includes(text),false,text);
 const inconsistent=input();inconsistent.payment.order_income.escrow_amount_after_adjustment=98;const flagged=JSON.parse((await buildFinancialOrderComponents(inconsistent)).payload);assert.equal(flagged.status,'INVALID');assert.equal(flagged.amounts.escrow_amount_after_adjustment_cents,9800);assert.ok(flagged.invalid_fields.includes('escrow_amount_after_adjustment'));
});

test('missing fields remain null and partial; missing completion is never invented from COMPLETED status',async()=>{
 const source=input();delete source.payment.order_income.commission_fee;delete source.order.complete_time;
 const p=JSON.parse((await buildFinancialOrderComponents(source)).payload);assert.equal(p.status,'PARTIAL');assert.equal(p.amounts.commission_fee_cents,null);assert.equal(p.dates.completed_at,null);assert.ok(p.missing_fields.includes('commission_fee'));assert.ok(p.missing_fields.includes('dates.completed_at'));assert.equal(p.amounts.service_fee_cents,200);
 const oldDate=input();oldDate.order.complete_time=1;const old=JSON.parse((await buildFinancialOrderComponents(oldDate)).payload);assert.equal(old.status,'INVALID');assert.equal(old.dates.completed_at,null);assert.ok(old.invalid_fields.includes('dates.completed_at'));
});

test('subcents, nonnumbers, overflow and accessor values become invalid optional fields without rounding or evaluating getters',async()=>{
 for(const bad of [0.1+0.2,0.001,'12.34',Infinity,NaN,-0,1e15]){const source=input();source.payment.order_income.commission_fee=bad;const p=JSON.parse((await buildFinancialOrderComponents(source)).payload);assert.equal(p.status,'INVALID');assert.equal(p.amounts.commission_fee_cents,null);assert.ok(p.invalid_fields.includes('commission_fee'));assert.equal(p.amounts.escrow_amount_cents,10000);}
 let reads=0;const source=input();Object.defineProperty(source.payment.order_income,'commission_fee',{enumerable:true,get(){reads++;throw Error();}});Object.defineProperty(source.order,'complete_time',{enumerable:true,get(){reads++;throw Error();}});const p=JSON.parse((await buildFinancialOrderComponents(source)).payload);assert.equal(reads,0);assert.equal(p.status,'INVALID');assert.equal(p.dates.completed_at,null);assert.equal(p.amounts.commission_fee_cents,null);
});

test('forged cohort source, another order or provider scope cannot create a component capture',async()=>{
 for(const change of [v=>{v.record.source_hash='0'.repeat(64);},v=>{v.order_sn='ANOTHER_ORDER';},v=>{v.payment.shop_id=FINANCE_PROFILE.shop_id+1;},v=>{v.order.partner_id=FINANCE_PROFILE.partner_id+1;},v=>{v.payment.order_income.escrow_amount=101;},v=>{v.payment.order_income.original_cost_of_goods_sold=121;},v=>{v.payment.order_income.ads_escrow_top_up_fee_or_technical_support_fee=1;},v=>{v.currency='USD';}]){const v=input();change(v);await assert.rejects(buildFinancialOrderComponents(v),/CONTEXT_INVALID/);}
});

test('component reader performs SELECT only and distinguishes a legacy missing capture from observed zeros',async t=>{
 const f=await database(t,{schema:false});let writes=0;const prepare=f.db.prepare.bind(f.db);f.db.prepare=sql=>{if(!/^SELECT\b/.test(sql))writes++;return prepare(sql);};
 const empty=await f.read();assert.equal(empty.status,'NOT_CAPTURED');assert.equal(empty.missing_orders,1);assert.equal(empty.orders[0].components,null);assert.equal(writes,0);
});

test('source-bound captured components survive reads; corrupted capture and foreign run scope remain explicit',async t=>{
 const f=await database(t),read=await f.read();assert.equal(read.status,'AVAILABLE');assert.equal(read.source_revision,2);assert.equal(read.orders[0].components.amounts.ads_escrow_top_up_fee_or_technical_support_fee_cents,0);
 f.db.db.prepare('UPDATE finance_financial_order_components SET source_hash=?').run('0'.repeat(64));const invalid=await f.read();assert.equal(invalid.status,'PARTIAL');assert.equal(invalid.invalid_orders,1);assert.equal(invalid.orders[0].components,null);
 f.db.db.prepare('UPDATE finance_business_period_runs SET shop_id=shop_id+1').run();await assert.rejects(f.read(),e=>e.status===404);
});

test('revocation after a source read withholds the result, and unknown order hashes are not silently dropped',async t=>{
 const f=await database(t);let checks=0;await assert.rejects(f.read({authorize:async()=>++checks===1}),e=>e.status===403);assert.equal(checks,2);
 await assert.rejects(readFinancialOrderComponents(f.env,{run_id,order_hashes:['f'.repeat(64)]},{now}),e=>e.status===404);
 let reads=0;const hashes=[];Object.defineProperty(hashes,'0',{enumerable:true,get(){reads++;return f.source.record.order_hash;}});hashes.length=1;
 await assert.rejects(readFinancialOrderComponents(f.env,{run_id,order_hashes:hashes},{now}),e=>e.status===400);assert.equal(reads,0);
});

test('real collector captures components in its guarded page commit without extra provider calls or changing the old frame',async t=>{
 const db=new D1();t.after(()=>db.db.close());const env={FINANCE_DB:db,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,71).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:'synthetic-component-key'},store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:'SYNTHETIC_COMPONENT_ACCESS',refresh_token:'SYNTHETIC_COMPONENT_REFRESH',expires_at:stamp+10000});
 const s=input(),calls=[];s.order.item_list=[{item_id:100,model_id:0,model_quantity_purchased:1}];s.order.order_status='COMPLETED';s.order.currency='BRL';s.payment.order_income.items=[{item_id:100,model_id:0,quantity_purchased:1}];
 const fetchImpl=async request=>{const path=new URL(request.url).pathname;calls.push(path);assert.equal(request.method,'GET');return Response.json({error:'',response:path==='/api/v2/order/get_order_list'?{order_list:[{order_sn:s.order_sn}],more:false,next_cursor:''}:path==='/api/v2/order/get_order_detail'?{order_list:[s.order]}:s.payment});};
 const start=await runFinanceBusinessPeriod(env,{operation:'start',start_date:'2026-10-14',end_date:'2026-10-20',now,fetchImpl}),frame=await runFinanceBusinessPeriod(env,{operation:'step',run_id:start.run_id,now,fetchImpl});
 assert.equal(frame.status,'COMPLETE');assert.ok(projectBusinessPeriodFrame(frame));assert.equal(frame.expected_repass_raw,'100');assert.equal(frame.sales_base_raw,'120');assert.equal(frame.invoice_tax.known_tax_raw,'2.4');assert.equal(frame.coverage.paid,1);assert.equal(calls.length,3);assert.deepEqual(calls,['/api/v2/order/get_order_list','/api/v2/order/get_order_detail','/api/v2/payment/get_escrow_detail']);
 const row=db.db.prepare('SELECT * FROM finance_financial_order_components').get(),source=db.db.prepare('SELECT * FROM finance_business_period_orders').get();assert.equal(row.source_hash,source.source_hash);assert.equal(row.checked_at,source.checked_at);assert.equal(row.payload_hash,hash(row.payload));assert.equal(JSON.parse(row.payload).amounts.commission_fee_cents,1000);
 const reread=await readFinancialOrderComponents(env,{run_id:start.run_id,order_hashes:[source.order_hash]},{now});assert.equal(reread.status,'AVAILABLE');assert.equal(calls.length,3);assert.equal(JSON.stringify(frame).includes('commission_fee'),false);assert.equal(row.payload.includes(s.order_sn),false);
});

async function retryFixture(t){
 const db=new D1();t.after(()=>db.db.close());const clock={stamp},now=()=>clock.stamp*1000,env={FINANCE_DB:db,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,72).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:'synthetic-component-retry-key'},store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:'SYNTHETIC_RETRY_ACCESS',refresh_token:'SYNTHETIC_RETRY_REFRESH',expires_at:stamp+10000});
 const state={failSecond:true,loseLease:false,paymentReads:0},calls=[],ids=['PRIVATE_COMPONENT_FIRST','PRIVATE_COMPONENT_SECOND'];
 const fetchImpl=async request=>{
  const url=new URL(request.url);calls.push(url.pathname);let response;
  if(url.pathname.endsWith('/get_order_list'))response={order_list:ids.map(order_sn=>({order_sn})),more:false,next_cursor:''};
  else if(url.pathname.endsWith('/get_order_detail'))response={order_list:ids.map(order_sn=>({...input().order,order_sn,order_status:'COMPLETED',currency:'BRL',item_list:[{item_id:100,model_id:0,model_quantity_purchased:1}]}))};
  else{
   state.paymentReads++;const order_sn=url.searchParams.get('order_sn');if(order_sn===ids[1]&&state.failSecond)return Response.json({error:'error_rate_limit'},{status:429});
   if(state.loseLease)db.db.prepare("UPDATE finance_business_period_runs SET lease_owner='another-valid-owner'").run();
   response={...input().payment,order_sn,order_income:{...input().payment.order_income,items:[{item_id:100,model_id:0,quantity_purchased:1}]}};
  }
  return Response.json({error:'',response});
 };
 const run=options=>runFinanceBusinessPeriod(env,{now,fetchImpl,...options});return {db,env,clock,now,state,calls,ids,run};
}
test('failed-page components checkpoint shares the old source hash and is reused without another escrow read',async t=>{
 const f=await retryFixture(t),start=await f.run({operation:'start',start_date:'2026-10-14',end_date:'2026-10-20'}),paused=await f.run({operation:'step',run_id:start.run_id});
 assert.equal(paused.status,'RUNNING');assert.equal(paused.diagnostic,'BUSINESS_PERIOD_RATE_LIMIT');assert.equal(paused.coverage.orders,0);
 const rows=f.db.db.prepare('SELECT * FROM finance_financial_order_components').all(),cache=f.db.db.prepare('SELECT * FROM finance_business_period_payment_cache').all();assert.equal(rows.length,1);assert.equal(cache.length,1);assert.equal(rows[0].source_hash,cache[0].source_hash);assert.equal(rows[0].checked_at,cache[0].checked_at);
 const before=rows[0],reads=f.state.paymentReads;f.state.failSecond=false;f.clock.stamp+=30;
 const complete=await f.run({operation:'step',run_id:start.run_id});assert.equal(complete.status,'COMPLETE');assert.equal(complete.expected_repass_raw,'200');assert.equal(f.state.paymentReads-reads,1);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM finance_financial_order_components').get().n,2);
 assert.deepEqual(f.db.db.prepare('SELECT * FROM finance_financial_order_components WHERE order_hash=?').get(before.order_hash),before);
 const result=await readFinancialOrderComponents(f.env,{run_id:start.run_id,order_hashes:f.ids.map(hash)},{now:f.now});assert.equal(result.status,'AVAILABLE');assert.equal(result.orders.length,2);
});
test('a lost cohort lease cannot write minimized component observations',async t=>{
 const f=await retryFixture(t);f.state.failSecond=false;f.state.loseLease=true;
 const start=await f.run({operation:'start',start_date:'2026-10-14',end_date:'2026-10-20'}),blocked=await f.run({operation:'step',run_id:start.run_id});assert.equal(blocked.diagnostic,'BUSINESS_PERIOD_CONFLICT');assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM finance_financial_order_components').get().n,0);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM finance_business_period_orders').get().n,0);
});
test('expired cohort retention removes optional component captures alongside their source run',async t=>{
 const f=await retryFixture(t);f.state.failSecond=false;const start=await f.run({operation:'start',start_date:'2026-10-14',end_date:'2026-10-20'});await f.run({operation:'step',run_id:start.run_id});assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM finance_financial_order_components').get().n,2);
 f.db.db.prepare('UPDATE finance_business_period_runs SET created_at=? WHERE run_id=?').run(stamp-31*86400,start.run_id);
 await f.run({operation:'start',start_date:'2026-10-01',end_date:'2026-10-07'});assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM finance_financial_order_components').get().n,0);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM finance_business_period_runs WHERE run_id=?').get(start.run_id).n,0);
});
