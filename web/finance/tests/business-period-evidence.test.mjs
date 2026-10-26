import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {runFinanceBusinessPeriod} from '../src/business-period.mjs';
import {projectBusinessPeriodFrame} from '../src/business-period-frame.mjs';

const list='/api/v2/order/get_order_list',detail='/api/v2/order/get_order_detail',payment='/api/v2/payment/get_escrow_detail';
const serial=index=>'PRIVATE_EVIDENCE_ORDER_'+index,hash=value=>createHash('sha256').update(value).digest('hex');
const eligible=status=>['COMPLETED','READY_TO_SHIP','PROCESSED','RETRY_SHIP','SHIPPED','TO_CONFIRM_RECEIVE','INVOICE_PENDING'].includes(status);
async function fixture(t,statuses){
 const db=new D1();t.after(()=>db.db.close());
 const clock={time:Date.UTC(2026,9,20,15)},now=()=>clock.time,env={FINANCE_DB:db,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,47).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:'private-evidence-fixture-signing-key'};
 const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:'PRIVATE_EVIDENCE_ACCESS',refresh_token:'PRIVATE_EVIDENCE_REFRESH',expires_at:now()/1000+14400});
 const calls=[],state={statuses:[...statuses],faults:{},optional:{},returns:{},pageSize:20};
 const source=response=>Response.json({error:'',response});
 const fetchImpl=async request=>{
  const url=new URL(request.url);assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(request.method,'GET');calls.push(url);
  if(url.pathname===list){const cursor=url.searchParams.get('cursor'),offset=cursor?Number(cursor.slice(7)):0,count=Math.min(state.pageSize,statuses.length-offset),more=offset+count<statuses.length;return source({order_list:Array.from({length:count},(_,index)=>({order_sn:serial(offset+index)})),more,next_cursor:more?'cursor-'+(offset+count):''});}
  if(url.pathname===detail)return source({order_list:url.searchParams.get('order_sn_list').split(',').map(order_sn=>{const index=Number(order_sn.slice(serial(0).length-1));return {order_sn,order_status:state.statuses[index],currency:'BRL',create_time:Date.UTC(2026,9,20,12)/1000,item_list:[{item_id:100,model_id:index+1,model_quantity_purchased:1}],buyer_username:'PRIVATE_EVIDENCE_BUYER',recipient_address:{name:'PRIVATE_EVIDENCE_ADDRESS'}};})});
  assert.equal(url.pathname,payment);const index=Number(url.searchParams.get('order_sn').slice(serial(0).length-1));assert.ok(eligible(state.statuses[index]));
  if(state.faults[index])return Response.json({error:'error_rate_limit'},{status:state.faults[index]});
  const order_sn=serial(index),response={order_sn,order_income:{order_sn,original_cost_of_goods_sold:100,escrow_amount:30+index,ads_escrow_top_up_fee_or_technical_support_fee:0,...state.optional[index],items:[{item_id:100,model_id:index+1,quantity_purchased:1}],buyer_username:'PRIVATE_EVIDENCE_BUYER'},buyer_username:'PRIVATE_EVIDENCE_BUYER'};
  if(state.returns[index]!==null)response.return_order_sn_list=state.returns[index]??[];
  return source(response);
 };
 const run=input=>runFinanceBusinessPeriod(env,{fetchImpl,now,...input}),start=()=>run({operation:'start',start_date:'2026-10-14',end_date:'2026-10-20'});
 return {db,env,clock,now,state,calls,run,start,evidence:()=>db.db.prepare('SELECT * FROM finance_business_order_evidence ORDER BY order_hash').all(),orders:()=>db.db.prepare('SELECT * FROM finance_business_period_orders ORDER BY order_hash').all(),cache:()=>db.db.prepare('SELECT * FROM finance_business_period_payment_cache ORDER BY order_hash').all()};
}
const bySerial=f=>new Map(f.evidence().map(row=>[JSON.parse(row.payload).order_sn,{...row,value:JSON.parse(row.payload)}]));

// These tests exercise the real Finance collector, including its commit/checkpoint
// transactions. Optional reconciliation evidence must never change v1 totals.
test('financial collection retains private exact order and return evidence for paid and review statuses without another source request',async t=>{
 const f=await fixture(t,['COMPLETED','TO_RETURN','IN_CANCEL','CANCELLED','UNPAID','READY_TO_SHIP']);
 f.state.returns[0]=['PRIVATE_EVIDENCE_RETURN_A','PRIVATE_EVIDENCE_RETURN_B'];f.state.optional[0]={escrow_amount_after_adjustment:40.1,total_adjustment_amount:10.1};
 const initial=await f.start();assert.equal(f.calls.length,0);const frame=await f.run({operation:'step',run_id:initial.run_id});
 assert.equal(frame.status,'COMPLETE');assert.ok(projectBusinessPeriodFrame(frame));assert.equal(frame.coverage.paid,2);assert.equal(frame.coverage.other,1);assert.equal(frame.coverage.cancel_pending,1);assert.equal(frame.coverage.returns,1);assert.equal(frame.expected_repass_raw,'65');assert.equal(frame.sales_base_raw,'200');
 assert.deepEqual(f.calls.map(url=>url.pathname).sort(),[detail,list,payment,payment].sort());assert.equal(f.evidence().length,6);
 const entries=bySerial(f),paid=entries.get(serial(0)),review=entries.get(serial(1));
 assert.equal(paid.value.schema,'financial_order_evidence_v2');assert.equal(paid.value.create_time,Date.UTC(2026,9,20,12)/1000);assert.deepEqual(paid.value.return_order_sn_list,f.state.returns[0]);assert.equal(paid.value.order_status,'COMPLETED');assert.equal(paid.value.currency,'BRL');
 assert.deepEqual(paid.value.amounts,{escrow_amount_raw:'30',escrow_amount_after_adjustment_raw:'40.1',total_adjustment_amount_raw:'10.1'});
 assert.equal(review.value.order_status,'TO_RETURN');assert.equal(review.value.return_order_sn_list,null);assert.equal(review.value.amounts.escrow_amount_raw,null);
 for(const row of f.evidence()){
  const record=f.orders().find(record=>record.order_hash===row.order_hash);assert.equal(row.run_id,initial.run_id);assert.equal(row.order_hash,hash(JSON.parse(row.payload).order_sn));assert.equal(row.source_hash,record.source_hash);assert.equal(row.checked_at,record.checked_at);assert.equal(row.payload_hash,hash(row.payload));
  for(const privateValue of ['PRIVATE_EVIDENCE_BUYER','PRIVATE_EVIDENCE_ADDRESS','PRIVATE_EVIDENCE_ACCESS'])assert.equal(row.payload.includes(privateValue),false);
 }
 for(const privateValue of ['PRIVATE_EVIDENCE_ORDER','PRIVATE_EVIDENCE_RETURN','PRIVATE_EVIDENCE_BUYER'])assert.equal(JSON.stringify(frame).includes(privateValue),false);
});

test('missing return references and malformed optional income stay distinct without invalidating the legacy financial import',async t=>{
 const f=await fixture(t,['COMPLETED','COMPLETED']);f.state.returns[1]=null;f.state.optional[0]={escrow_amount_after_adjustment:'private-invalid-money',total_adjustment_amount:0.1+0.2};
 const initial=await f.start(),frame=await f.run({operation:'step',run_id:initial.run_id});assert.equal(frame.status,'COMPLETE');assert.equal(frame.expected_repass_raw,'61');assert.equal(frame.coverage.payment_covered,2);assert.equal(frame.coverage.returns_unknown,1);assert.equal(frame.diagnostic,null);
 const entries=bySerial(f);assert.deepEqual(entries.get(serial(0)).value.return_order_sn_list,[]);assert.equal(entries.get(serial(1)).value.return_order_sn_list,null);assert.notEqual(entries.get(serial(0)).value.diagnostic,null);assert.equal(entries.get(serial(0)).value.amounts.escrow_amount_after_adjustment_raw,null);assert.equal(entries.get(serial(0)).value.amounts.total_adjustment_amount_raw,null);
 assert.equal(JSON.stringify(f.evidence()).includes('private-invalid-money'),false);
});

test('a failed page checkpoints paid evidence with its original source hash and reuses it without a second escrow read',async t=>{
 const f=await fixture(t,Array(20).fill('COMPLETED'));f.state.faults[19]=429;f.state.returns[0]=['PRIVATE_EVIDENCE_RETURN_A'];
 const initial=await f.start(),paused=await f.run({operation:'step',run_id:initial.run_id});assert.equal(paused.status,'RUNNING');assert.equal(paused.diagnostic,'BUSINESS_PERIOD_RATE_LIMIT');assert.equal(paused.coverage.orders,0);assert.equal(f.orders().length,0);assert.equal(f.cache().length,19);assert.equal(f.evidence().length,19);
 const before=new Map(f.evidence().map(row=>[row.order_hash,row])),paidBefore=f.calls.filter(url=>url.pathname===payment).length;
 for(const row of f.evidence()){const record=f.cache().find(record=>record.order_hash===row.order_hash);assert.equal(row.source_hash,record.source_hash);assert.equal(row.checked_at,record.checked_at);}
 delete f.state.faults[19];f.clock.time+=30000;const complete=await f.run({operation:'step',run_id:initial.run_id});assert.equal(complete.status,'COMPLETE');assert.equal(complete.coverage.payment_covered,20);assert.equal(f.cache().length,0);assert.equal(f.evidence().length,20);assert.equal(f.calls.filter(url=>url.pathname===payment).length-paidBefore,1);
 for(const row of f.evidence())if(before.has(row.order_hash))assert.deepEqual(row,before.get(row.order_hash));
});

test('a lost page lease cannot persist financial evidence or move the legacy financial cursor',async t=>{
 const f=await fixture(t,['COMPLETED']),initial=await f.start(),batch=f.db.batch.bind(f.db),prepare=f.db.prepare.bind(f.db);let injected=false;
 f.db.prepare=sql=>{const statement=prepare(sql);statement.sql=sql;return statement;};
 f.db.batch=async statements=>{if(!injected&&statements.some(statement=>statement.sql?.startsWith('INSERT INTO finance_business_period_orders'))){injected=true;f.db.db.prepare("UPDATE finance_business_period_runs SET lease_owner=NULL,lease_until=NULL,revision=revision+1 WHERE run_id=?").run(initial.run_id);}return batch(statements);};
 const stale=await f.run({operation:'step',run_id:initial.run_id});assert.equal(injected,true);assert.equal(stale.status,'RUNNING');assert.equal(stale.coverage.orders,0);assert.equal(stale.pages_read,0);assert.equal(f.orders().length,0);assert.equal(f.cache().length,0);assert.equal(f.evidence().length,0);
});

test('a rolled-back page leaves no committed source/evidence pair and retains only the valid retry checkpoint',async t=>{
 const f=await fixture(t,['COMPLETED','COMPLETED']),initial=await f.start(),prepare=f.db.prepare.bind(f.db);let inserts=0,injected=false;
 f.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('INSERT INTO finance_business_order_evidence')){const run=statement.run.bind(statement);statement.run=async()=>{if(!injected&&++inserts===2){injected=true;throw Error('fixture atomic failure');}return run();};}return statement;};
 const paused=await f.run({operation:'step',run_id:initial.run_id});assert.equal(injected,true);assert.equal(paused.status,'RUNNING');assert.equal(paused.coverage.orders,0);assert.equal(paused.pages_read,0);assert.equal(f.orders().length,0);assert.equal(f.cache().length,2);assert.equal(f.evidence().length,2);
 for(const row of f.evidence()){const record=f.cache().find(record=>record.order_hash===row.order_hash);assert.equal(row.source_hash,record.source_hash);assert.equal(row.checked_at,record.checked_at);}
});

test('run retention cleanup also removes private evidence and does not preserve identifiers after its source run is evicted',async t=>{
 const f=await fixture(t,['COMPLETED']),initial=await f.start();await f.run({operation:'step',run_id:initial.run_id});assert.equal(f.evidence().length,1);
 f.clock.time+=31*86400000;await f.start();assert.equal(f.evidence().length,0);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM finance_business_period_runs WHERE run_id=?').get(initial.run_id).n,0);
});


test('a completed legacy run missing private evidence is replaced once on start while its immutable totals remain readable',async t=>{
 const f=await fixture(t,['COMPLETED','TO_RETURN']),initial=await f.start(),old=await f.run({operation:'step',run_id:initial.run_id});assert.equal(old.status,'COMPLETE');
 f.db.db.prepare('DELETE FROM finance_business_order_evidence WHERE run_id=?').run(initial.run_id);const before=f.calls.length;
 assert.deepEqual(await f.run({operation:'read',run_id:initial.run_id}),old);assert.equal(f.calls.length,before);
 const fresh=await f.start();assert.equal(fresh.status,'RUNNING');assert.notEqual(fresh.run_id,old.run_id);assert.equal(f.calls.length,before,'start prepares a replacement without issuing another provider read');
 const finished=await f.run({operation:'step',run_id:fresh.run_id});assert.equal(finished.status,'COMPLETE');assert.equal(finished.expected_repass_raw,old.expected_repass_raw);assert.equal(finished.coverage.other,old.coverage.other);
 assert.equal((await f.start()).run_id,fresh.run_id,'the evidenced replacement is reused rather than forcing an import loop');assert.deepEqual(await f.run({operation:'read',run_id:initial.run_id}),old);
});
