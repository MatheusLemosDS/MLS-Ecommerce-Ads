import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore,FINANCE_PROFILE} from '../src/connection-store.mjs';
import {runFinanceBusinessPeriod} from '../src/business-period.mjs';
import {FINANCIAL_ORDER_EVIDENCE_SCHEMA,buildFinancialOrderEvidence} from '../src/financial-order-evidence.mjs';
import {runFinanceReturnsReconciliation} from '../src/returns-reconciliation.mjs';
import {projectReconciliationFrame,projectReconciliationEvidenceFrame} from '../src/reconciliation-frame.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex'),key='returns-fixture-private-key',access='PRIVATE_RETURNS_ACCESS',refresh='PRIVATE_RETURNS_REFRESH';
async function fixture(t,{count=3,status='COMPLETE',legacy=false,adjustment=-10,hasAdjustment=true}={}){
 const db=new D1();t.after(()=>db.db.close());let queue=Promise.resolve();const batch=db.batch.bind(db);db.batch=statements=>{const next=queue.then(()=>batch(statements));queue=next.catch(()=>{});return next;};
 const clock={time:Date.UTC(2026,9,25,15)},now=()=>clock.time,env={FINANCE_DB:db,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,43).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:key};
 const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:access,refresh_token:refresh,expires_at:now()/1000+14400});
 const run=await runFinanceBusinessPeriod(env,{operation:'start',start_date:'2026-10-01',end_date:'2026-10-15',now,fetchImpl:async()=>{throw Error('must not fetch');}});
 db.db.prepare('UPDATE finance_business_period_runs SET status=?,revision=2,pages_read=1 WHERE run_id=?').run(status,run.run_id);
 await db.batch(FINANCIAL_ORDER_EVIDENCE_SCHEMA.map(sql=>db.prepare(sql)));
 const originals=[];
 for(let index=0;index<count;index++){
  const order_sn='PRIVATE_RETURN_ORDER_'+index,return_sn='PRIVATE_RETURN_CASE_'+index,stamp=now()/1000,record={order_hash:digest(order_sn),bucket:'completed',payment_covered:1,sales_raw:'100',escrow_raw:'80',ads_raw:'0',returns_seen:1,items:JSON.stringify([{item_id:'100',model_id:'0',quantity:1}]),checked_at:stamp};record.source_hash=digest(JSON.stringify(record));
  db.db.prepare('INSERT INTO finance_business_period_orders(run_id,order_hash,bucket,payment_covered,sales_raw,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(run.run_id,record.order_hash,record.bucket,1,record.sales_raw,record.escrow_raw,'0',1,record.items,record.source_hash,stamp);
  const payment={order_sn,return_order_sn_list:[return_sn],order_income:{escrow_amount:80,...(hasAdjustment?{escrow_amount_after_adjustment:80+adjustment,total_adjustment_amount:adjustment}:{})}};
  if(!legacy){const evidence=await buildFinancialOrderEvidence({order_sn,order_status:'COMPLETED',currency:'BRL',payment,record});db.db.prepare('INSERT INTO finance_business_order_evidence(run_id,order_hash,source_hash,checked_at,payload,payload_hash) VALUES(?,?,?,?,?,?)').run(run.run_id,evidence.order_hash,evidence.source_hash,evidence.checked_at,evidence.payload,evidence.payload_hash);}
  originals.push({order_sn,return_sn,record,payment});
 }
 const calls=[],mode={status:'CANCELLED',amount:12.5,error:null,currency:'BRL',extra:{},hold:null};
 const fetchImpl=async request=>{
  calls.push(request);const url=new URL(request.url);assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(url.pathname,'/api/v2/returns/get_return_detail');assert.equal(request.method,'GET');assert.equal(request.redirect,'manual');assert.equal(request.headers.has('cookie'),false);assert.equal(await request.clone().text(),'');
  assert.equal(url.searchParams.get('partner_id'),String(FINANCE_PROFILE.partner_id));assert.equal(url.searchParams.get('shop_id'),String(FINANCE_PROFILE.shop_id));assert.equal(url.searchParams.get('access_token'),access);
  const base=String(FINANCE_PROFILE.partner_id)+url.pathname+url.searchParams.get('timestamp')+access+FINANCE_PROFILE.shop_id;assert.equal(url.searchParams.get('sign'),createHmac('sha256',key).update(base).digest('hex'));
  if(mode.hold)await mode.hold;
  if(mode.error)return mode.error();
  const row=originals.find(row=>row.return_sn===url.searchParams.get('return_sn'));assert.ok(row);
  return Response.json({error:'',request_id:'PRIVATE_RETURN_REQUEST',response:{return_sn:row.return_sn,order_sn:row.order_sn,status:mode.status,currency:mode.currency,refund_amount:mode.amount,buyer:{email:'PRIVATE_RETURN_BUYER'},...mode.extra}});
 };
 const invoke=operation=>runFinanceReturnsReconciliation(env,{operation,run_id:run.run_id,now,fetchImpl});
 return {env,db,store,clock,now,run,calls,mode,originals,fetchImpl,invoke};
}
async function makeReview(f,index=0,status='TO_RETURN'){
 const original=f.originals[index],record={order_hash:original.record.order_hash,bucket:status==='IN_CANCEL'?'cancel_pending':'other',payment_covered:0,sales_raw:null,escrow_raw:null,ads_raw:null,returns_seen:null,items:'[]',checked_at:original.record.checked_at};record.source_hash=digest(JSON.stringify(record));
 f.db.db.prepare('UPDATE finance_business_period_orders SET bucket=?,payment_covered=0,sales_raw=NULL,escrow_raw=NULL,ads_raw=NULL,returns_seen=NULL,items=?,source_hash=? WHERE run_id=? AND order_hash=?').run(record.bucket,record.items,record.source_hash,f.run.run_id,record.order_hash);
 const evidence=await buildFinancialOrderEvidence({order_sn:original.order_sn,order_status:status,currency:'BRL',payment:null,record});f.db.db.prepare('UPDATE finance_business_order_evidence SET source_hash=?,payload=?,payload_hash=? WHERE run_id=? AND order_hash=?').run(record.source_hash,evidence.payload,evidence.payload_hash,f.run.run_id,record.order_hash);original.record=record;
 return original;
}
function probeFetch(f,respond=null){
 return async request=>{
  const url=new URL(request.url);if(url.pathname!=='/api/v2/payment/get_escrow_detail')return f.fetchImpl(request);
  f.calls.push(request);assert.equal(request.method,'GET');assert.equal(request.redirect,'manual');assert.equal(request.headers.has('cookie'),false);assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(await request.clone().text(),'');
  const original=f.originals.find(row=>row.order_sn===url.searchParams.get('order_sn'));assert.ok(original);
  assert.equal(url.searchParams.get('sign'),createHmac('sha256',key).update(String(FINANCE_PROFILE.partner_id)+url.pathname+url.searchParams.get('timestamp')+access+FINANCE_PROFILE.shop_id).digest('hex'));
  if(respond)return respond(request,original);
  return Response.json({error:'',response:{order_sn:original.order_sn,return_order_sn_list:[original.return_sn],order_income:{escrow_amount:999999,escrow_amount_after_adjustment:111111}}});
 };
}

test('local reads audit signed order adjustments and missing return details without source traffic or any profit field',async t=>{
 const f=await fixture(t),tokens=await f.store.readTokens(),frame=await f.invoke('read');assert.ok(projectReconciliationFrame(frame));assert.equal(frame.status,'PARTIAL');assert.equal(frame.returns.reference_count,3);assert.equal(frame.returns.pending_count,3);assert.equal(frame.adjustments.known_adjustment_cents,-3000);assert.equal(frame.adjustments.base_repass_cents,24000);assert.equal(frame.adjustments.after_adjustment_repass_cents,21000);assert.equal(frame.returns.requested_amount_complete,false);assert.equal(f.calls.length,0);assert.deepEqual(await f.store.readTokens(),tokens);
 const text=JSON.stringify(frame);for(const secret of [access,refresh,'PRIVATE_RETURN_ORDER','PRIVATE_RETURN_CASE','PRIVATE_RETURN_BUYER','net_profit_cents','net_estimate_cents'])assert.ok(!text.includes(secret));
});

test('each step signs only two exact return lookups, preserves CANCELLED requested values, and reuses validated observations across source runs',async t=>{
 const f=await fixture(t);let frame=await f.invoke('step');assert.equal(f.calls.length,2);assert.equal(frame.returns.checked_count,2);assert.equal(frame.returns.pending_count,1);assert.equal(frame.returns.known_requested_refund_cents,2500);assert.equal(frame.cases.filter(row=>row.status==='CANCELLED').length,2);
 frame=await f.invoke('step');assert.equal(f.calls.length,3);assert.equal(frame.returns.checked_count,3);assert.equal(frame.returns.known_requested_refund_cents,3750);assert.equal(frame.status,'CHECKED');assert.equal(frame.returns.requested_amount_complete,true);assert.deepEqual(frame.pending,['SETTLEMENT_NOT_RECONCILED','RETURN_VALUES_UNVERIFIED']);assert.equal(frame.adjustments.after_adjustment_repass_cents,21000,'requested refunds never deducted from escrow');
 const saved=structuredClone(frame);await f.invoke('step');assert.equal(f.calls.length,3);const reread=await f.invoke('read');assert.deepEqual(reread,saved);
 const next=crypto.randomUUID();f.db.db.prepare('INSERT INTO finance_business_period_runs SELECT ?,partner_id,shop_id,revision,status,start_date,end_date,time_from,time_to,cutoff_at,checked_at,created_at,cursor,pages_read,duplicate_orders,lease_owner,lease_until,last_error FROM finance_business_period_runs WHERE run_id=?').run(next,f.run.run_id);
 f.db.db.prepare('INSERT INTO finance_business_period_orders SELECT ?,order_hash,bucket,payment_covered,sales_raw,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at FROM finance_business_period_orders WHERE run_id=?').run(next,f.run.run_id);f.db.db.prepare('INSERT INTO finance_business_order_evidence SELECT ?,order_hash,source_hash,checked_at,payload,payload_hash FROM finance_business_order_evidence WHERE run_id=?').run(next,f.run.run_id);
 const reused=await runFinanceReturnsReconciliation(f.env,{operation:'step',run_id:next,fetchImpl:f.fetchImpl,now:f.now});assert.equal(reused.returns.checked_count,3);assert.equal(f.calls.length,3,'new cohorts reuse independently dated return observations');
});

test('permission denial is isolated from Finance credentials, yields a safe report and respects an hour of backoff',async t=>{
 const f=await fixture(t,{count:1}),tokens=await f.store.readTokens();f.mode.error=()=>Response.json({error:'error_api_permission',message:'PRIVATE_RETURN_DENIED'},{status:403});
 const frame=await f.invoke('step');assert.equal(frame.status,'BLOCKED');assert.equal(frame.returns.permission,'DENIED');assert.equal(frame.returns.checked_count,0);assert.equal(frame.cases[0].diagnostic,'PERMISSION_DENIED');assert.equal(frame.source_checked_at.returns_latest_at,null);assert.ok(frame.pending.includes('RETURN_PERMISSION_REQUIRED'));assert.deepEqual(await f.store.readTokens(),tokens);await f.invoke('step');assert.equal(f.calls.length,1);assert.ok(!JSON.stringify(frame).includes('PRIVATE_RETURN_DENIED'));
 f.clock.time+=3601000;f.mode.error=null;const recovered=await f.invoke('step');assert.equal(recovered.returns.permission,'AVAILABLE');assert.equal(recovered.returns.checked_count,1);
});

test('rate limits retain a prior valid value and its source clock, then retry after their own deadline',async t=>{
 const f=await fixture(t,{count:1});const first=await f.invoke('step'),at=first.cases[0].checked_at;f.clock.time+=301000;f.mode.error=()=>Response.json({error:'error_rate_limit',message:'PRIVATE_RATE'},{status:429});
 const retained=await f.invoke('step');assert.equal(retained.status,'PARTIAL');assert.equal(retained.cases[0].requested_refund_cents,1250);assert.equal(retained.cases[0].checked_at,at);assert.equal(retained.source_checked_at.returns_latest_at,at);assert.ok(retained.pending.includes('RETURN_DETAILS_PENDING'));assert.equal(f.calls.length,2);await f.invoke('step');assert.equal(f.calls.length,2);
 f.clock.time+=61000;f.mode.error=null;f.mode.amount=11.1;const changed=await f.invoke('step');assert.equal(changed.returns.known_requested_refund_cents,1110);assert.equal(changed.status,'CHECKED');
});

test('unknown statuses remain unknown; identity, currency and sub-cent substitutions cannot become refund evidence',async t=>{
 for(const variant of [{status:'FUTURE_STATUS'},{currency:'USD'},{amount:0.1+0.2},{extra:{order_sn:'PRIVATE_OTHER_ORDER'}},{extra:{return_sn:'PRIVATE_OTHER_RETURN'}},{extra:{shop_id:123}}]){
  const f=await fixture(t,{count:1});Object.assign(f.mode,variant);const result=await f.invoke('step');
  if(variant.status){assert.equal(result.cases[0].status,'UNKNOWN');assert.equal(result.returns.checked_count,1);assert.ok(result.pending.includes('RETURN_STATUS_UNRECOGNIZED'));}
  else{assert.equal(result.returns.checked_count,0);assert.equal(result.cases[0].requested_refund_cents,null);assert.equal(result.cases[0].checked_at,null);assert.equal(result.cases[0].diagnostic,variant.currency?'CURRENCY_MISMATCH':'INVALID_RESPONSE');}
 }
});

test('legacy source gaps, missing optional adjustment fields and a running cohort stay explicit rather than inferred',async t=>{
 const f=await fixture(t,{legacy:true,count:1});let result=await f.invoke('step');assert.equal(f.calls.length,0);assert.equal(result.coverage.missing_evidence_orders,1);assert.equal(result.adjustments.missing_orders,1);assert.equal(result.adjustments.after_adjustment_repass_cents,null);assert.ok(result.pending.includes('RETURN_REFERENCES_MISSING'));
 const g=await fixture(t,{hasAdjustment:false,status:'RUNNING',count:1});result=await g.invoke('read');assert.equal(result.status,'COLLECTING');assert.ok(result.pending.includes('SOURCE_COLLECTING'));assert.equal(result.adjustments.missing_orders,1);assert.equal(result.adjustments.after_adjustment_repass_cents,null);
});

test('concurrent steps share run and case leases and can never duplicate the in-flight return lookup',async t=>{
 const f=await fixture(t,{count:1});let release,entered;const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});f.mode.hold=gate;const fetchImpl=async request=>{entered();return f.fetchImpl(request);};
 const first=runFinanceReturnsReconciliation(f.env,{operation:'step',run_id:f.run.run_id,fetchImpl,now:f.now});await started;const second=await f.invoke('step');assert.equal(second.returns.checked_count,0);assert.equal(f.calls.length,1);release();const done=await first;assert.equal(done.returns.checked_count,1);assert.equal(f.calls.length,1);
});

test('invalid requests, missing runs and wrong profiles are rejected before provider access',async t=>{
 const f=await fixture(t);for(const options of [{operation:'start',run_id:f.run.run_id},{operation:'step',run_id:'bad'},{operation:'read',run_id:f.run.run_id,extra:true}])await assert.rejects(runFinanceReturnsReconciliation(f.env,{...options,now:f.now,fetchImpl:f.fetchImpl}));
 await assert.rejects(runFinanceReturnsReconciliation(f.env,{operation:'read',run_id:crypto.randomUUID(),now:f.now,fetchImpl:f.fetchImpl}));await assert.rejects(runFinanceReturnsReconciliation({...f.env,FINANCE_CONNECTION_ENABLED:'false'},{operation:'step',run_id:f.run.run_id,now:f.now,fetchImpl:f.fetchImpl}));assert.equal(f.calls.length,0);
});

test('many references expose bounded case detail and retain an honest total; an explicit zero refund remains known',async t=>{
 const f=await fixture(t,{count:41}),frame=await f.invoke('read');assert.equal(frame.returns.reference_count,41);assert.equal(frame.returns.pending_count,41);assert.deepEqual(frame.truncation,{truncated:true,cases_total:41,cases_included:40});assert.equal(frame.cases.length,40);assert.equal(f.calls.length,0);
 const g=await fixture(t,{count:1});g.mode.amount=0;g.mode.status='REFUND_PAID';const zero=await g.invoke('step');assert.equal(zero.returns.known_requested_refund_cents,0);assert.equal(zero.returns.requested_amount_complete,true);assert.equal(zero.cases[0].requested_refund_cents,0);assert.ok(zero.pending.includes('SETTLEMENT_NOT_RECONCILED'));assert.equal(zero.adjustments.after_adjustment_repass_cents,7000);
});

test('a refreshed cohort shares the global case lease instead of duplicating another run’s in-flight lookup',async t=>{
 const f=await fixture(t,{count:1}),next=crypto.randomUUID();f.db.db.prepare('INSERT INTO finance_business_period_runs SELECT ?,partner_id,shop_id,revision,status,start_date,end_date,time_from,time_to,cutoff_at,checked_at,created_at,cursor,pages_read,duplicate_orders,lease_owner,lease_until,last_error FROM finance_business_period_runs WHERE run_id=?').run(next,f.run.run_id);
 f.db.db.prepare('INSERT INTO finance_business_period_orders SELECT ?,order_hash,bucket,payment_covered,sales_raw,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at FROM finance_business_period_orders WHERE run_id=?').run(next,f.run.run_id);f.db.db.prepare('INSERT INTO finance_business_order_evidence SELECT ?,order_hash,source_hash,checked_at,payload,payload_hash FROM finance_business_order_evidence WHERE run_id=?').run(next,f.run.run_id);
 let release,entered;f.mode.hold=new Promise(resolve=>{release=resolve;});const started=new Promise(resolve=>{entered=resolve;}),first=runFinanceReturnsReconciliation(f.env,{operation:'step',run_id:f.run.run_id,now:f.now,fetchImpl:request=>{entered();return f.fetchImpl(request);}});await started;
 const observed=await runFinanceReturnsReconciliation(f.env,{operation:'step',run_id:next,now:f.now,fetchImpl:f.fetchImpl});assert.equal(observed.returns.checked_count,0);assert.equal(f.calls.length,1);release();await first;
 const finished=await runFinanceReturnsReconciliation(f.env,{operation:'read',run_id:next,now:f.now});assert.equal(finished.returns.checked_count,1);assert.equal(f.calls.length,1);
});

test('minute lanes that revisit after the cache TTL prioritize unseen cases before refreshing old observations',async t=>{
 const f=await fixture(t,{count:4});const first=await f.invoke('step');assert.equal(first.returns.checked_count,2);const checked=new Set(f.calls.map(request=>new URL(request.url).searchParams.get('return_sn')));
 f.clock.time+=600000;const second=await f.invoke('step');assert.equal(second.returns.checked_count,4);assert.equal(f.calls.length,4);assert.ok(f.calls.slice(2).every(request=>!checked.has(new URL(request.url).searchParams.get('return_sn'))));assert.equal(second.status,'CHECKED');
});

test('a TO_RETURN order resolves its missing references and detail in two separate read-only calls without changing the paid cohort',async t=>{
 const f=await fixture(t,{count:1});await makeReview(f);const before=f.db.db.prepare('SELECT * FROM finance_business_period_orders').all(),evidence=f.db.db.prepare('SELECT * FROM finance_business_order_evidence').all(),fetchImpl=probeFetch(f),invoke=operation=>runFinanceReturnsReconciliation(f.env,{operation,run_id:f.run.run_id,now:f.now,fetchImpl});
 const initial=await invoke('read');assert.equal(f.calls.length,0);assert.equal(initial.coverage.review_orders,1);assert.equal(initial.coverage.paid_orders,0);assert.ok(initial.pending.includes('RETURN_REFERENCES_MISSING'));
 f.clock.time+=17000;const complete=await invoke('step');assert.equal(f.calls.length,2);assert.equal(complete.returns.reference_count,1);assert.equal(complete.returns.checked_count,1);assert.equal(complete.coverage.review_orders,1);assert.equal(complete.coverage.paid_orders,0);assert.equal(complete.adjustments.base_repass_cents,0);assert.equal(complete.adjustments.after_adjustment_repass_cents,0);assert.ok(!complete.pending.includes('RETURN_REFERENCES_MISSING'));assert.equal(complete.source_checked_at.finance_oldest_at,before[0].checked_at);assert.equal(complete.source_checked_at.returns_latest_at,f.now()/1000);
 assert.deepEqual(f.db.db.prepare('SELECT * FROM finance_business_period_orders').all(),before);assert.deepEqual(f.db.db.prepare('SELECT * FROM finance_business_order_evidence').all(),evidence);await invoke('read');await invoke('step');assert.equal(f.calls.length,2);assert.ok(!JSON.stringify(complete).includes('PRIVATE_RETURN_ORDER'));
});

test('review reference probes preserve missing versus empty, reject foreign identity, and cannot revoke Finance or assert Returns permission',async t=>{
 for(const kind of ['missing','null','foreign-order','foreign-shop','foreign-income','duplicate','denied','empty']){
  const f=await fixture(t,{count:1}),original=await makeReview(f),tokens=await f.store.readTokens();
  const fetchImpl=probeFetch(f,()=>{
   if(kind==='denied')return Response.json({error:'error_api_permission',message:'PRIVATE_PROBE_DENIAL'},{status:403});
   const response={order_sn:original.order_sn,...(kind==='missing'?{}:{return_order_sn_list:kind==='null'?null:kind==='empty'?[]:kind==='duplicate'?[original.return_sn,original.return_sn]:[original.return_sn]})};
   if(kind==='foreign-order')response.order_sn='PRIVATE_FOREIGN';if(kind==='foreign-shop')response.shop_id=123;if(kind==='foreign-income')response.order_income={order_sn:'PRIVATE_FOREIGN'};
   return Response.json({error:'',response});
  });
  const invoke=operation=>runFinanceReturnsReconciliation(f.env,{operation,run_id:f.run.run_id,now:f.now,fetchImpl}),result=await invoke('step');assert.equal(f.calls.length,1);assert.equal(result.returns.reference_count,0);assert.equal(result.returns.permission,'UNKNOWN');assert.notEqual(result.status,'BLOCKED');assert.deepEqual(await f.store.readTokens(),tokens);
  assert.equal(result.pending.includes('RETURN_REFERENCES_MISSING'),kind!=='empty');await invoke('read');await invoke('step');assert.equal(f.calls.length,1);
 }
 const g=await fixture(t,{count:1});await makeReview(g,0,'IN_CANCEL');const result=await runFinanceReturnsReconciliation(g.env,{operation:'step',run_id:g.run.run_id,now:g.now,fetchImpl:probeFetch(g)});assert.equal(g.calls.length,0);assert.equal(result.coverage.review_orders,1);
});

test('a normal token refresh consumes the same two-call budget before review reference probing',async t=>{
 const f=await fixture(t,{count:1});await makeReview(f);const tokens=await f.store.readTokens();await f.store.saveTokens({access_token:access,refresh_token:refresh,expires_at:f.now()/1000+30},{expectedRevision:tokens.revision});
 const normal=probeFetch(f),fetchImpl=async request=>{
  if(new URL(request.url).pathname!=='/api/v2/auth/access_token/get')return normal(request);
  f.calls.push(request);assert.equal(request.method,'POST');return Response.json({error:'',message:'',request_id:'PRIVATE_REFRESH',...FINANCE_PROFILE,access_token:access,refresh_token:refresh+'-rotated',expire_in:14400});
 };
 const first=await runFinanceReturnsReconciliation(f.env,{operation:'step',run_id:f.run.run_id,now:f.now,fetchImpl});assert.equal(f.calls.length,2);assert.equal(first.returns.reference_count,1);assert.equal(first.returns.checked_count,0);
 const next=await runFinanceReturnsReconciliation(f.env,{operation:'step',run_id:f.run.run_id,now:f.now,fetchImpl});assert.equal(f.calls.length,3);assert.equal(next.returns.checked_count,1);
});

test('both TO_RETURN orders progress even when the next background visit occurs after the first probe expires',async t=>{
 const f=await fixture(t,{count:2});await makeReview(f,0);await makeReview(f,1);const fetchImpl=probeFetch(f),invoke=()=>runFinanceReturnsReconciliation(f.env,{operation:'step',run_id:f.run.run_id,now:f.now,fetchImpl});
 const first=await invoke();assert.equal(first.returns.checked_count,1);assert.equal(f.calls.length,2);const original=new URL(f.calls[0].url).searchParams.get('order_sn');
 f.clock.time+=600000;const second=await invoke();assert.equal(second.returns.checked_count,2);assert.equal(second.coverage.review_orders,2);assert.equal(second.coverage.paid_orders,0);assert.equal(f.calls.length,4);assert.notEqual(new URL(f.calls[2].url).searchParams.get('order_sn'),original);assert.ok(!second.pending.includes('RETURN_REFERENCES_MISSING'));
});

test('overlapping source runs share a review reference probe lease before any return detail can be fetched',async t=>{
 const f=await fixture(t,{count:1}),original=await makeReview(f),next=crypto.randomUUID();f.db.db.prepare('INSERT INTO finance_business_period_runs SELECT ?,partner_id,shop_id,revision,status,start_date,end_date,time_from,time_to,cutoff_at,checked_at,created_at,cursor,pages_read,duplicate_orders,lease_owner,lease_until,last_error FROM finance_business_period_runs WHERE run_id=?').run(next,f.run.run_id);
 f.db.db.prepare('INSERT INTO finance_business_period_orders SELECT ?,order_hash,bucket,payment_covered,sales_raw,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at FROM finance_business_period_orders WHERE run_id=?').run(next,f.run.run_id);f.db.db.prepare('INSERT INTO finance_business_order_evidence SELECT ?,order_hash,source_hash,checked_at,payload,payload_hash FROM finance_business_order_evidence WHERE run_id=?').run(next,f.run.run_id);
 let release,entered;const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;}),fetchImpl=probeFetch(f,async()=>{entered();await gate;return Response.json({error:'',response:{order_sn:original.order_sn,return_order_sn_list:[original.return_sn]}});});
 const first=runFinanceReturnsReconciliation(f.env,{operation:'step',run_id:f.run.run_id,now:f.now,fetchImpl});await started;const second=await runFinanceReturnsReconciliation(f.env,{operation:'step',run_id:next,now:f.now,fetchImpl});assert.equal(second.returns.checked_count,0);assert.equal(f.calls.length,1);release();const done=await first;assert.equal(done.returns.checked_count,1);assert.equal(f.calls.length,2);
 const reused=await runFinanceReturnsReconciliation(f.env,{operation:'read',run_id:next,now:f.now});assert.equal(reused.returns.checked_count,1);assert.equal(f.calls.length,2);
});

test('negotiated review details separate two TO_RETURN orders from four paid return orders without changing the cohort or read budget',async t=>{
 const f=await fixture(t,{count:6});await makeReview(f,0);await makeReview(f,1);const orders=f.db.db.prepare('SELECT * FROM finance_business_period_orders ORDER BY order_hash').all(),evidence=f.db.db.prepare('SELECT * FROM finance_business_order_evidence ORDER BY order_hash').all(),invoke=operation=>runFinanceReturnsReconciliation(f.env,{operation,run_id:f.run.run_id,now:f.now,fetchImpl:probeFetch(f),includeReview:true});
 const before=await invoke('read');assert.equal(before.schema,'finance_reconciliation_v2');assert.deepEqual(before.report,await f.invoke('read'));assert.deepEqual(before.review.summary,{orders:2,in_cancel:0,to_return:2,other:0,unknown:0});assert.equal(before.report.coverage.paid_orders,4);assert.equal(before.report.coverage.return_orders,4);assert.ok(before.review.orders.every(row=>row.reference_state==='PENDING'&&row.reference_count===null&&row.references_checked_at===null));assert.equal(f.calls.length,0);
 f.clock.time+=17000;let value;for(let step=0;step<6;step++){const count=f.calls.length;value=await invoke('step');assert.ok(f.calls.length-count<=2);if(value.report.returns.checked_count===6)break;}
 assert.ok(projectReconciliationEvidenceFrame(value,projectReconciliationFrame));assert.equal(value.report.returns.reference_count,6);assert.equal(value.report.returns.checked_count,6);assert.equal(value.report.coverage.review_orders,2);assert.equal(value.report.coverage.paid_orders,4);assert.equal(value.report.coverage.return_orders,4);assert.equal(value.report.adjustments.base_repass_cents,32000);assert.equal(value.report.adjustments.after_adjustment_repass_cents,28000);
 for(const row of value.review.orders){assert.equal(row.reference_state,'AVAILABLE');assert.equal(row.reference_count,1);assert.equal(row.checked_cases,1);assert.equal(row.pending_cases,0);assert.equal(row.source_checked_at,orders[0].checked_at);assert.equal(row.references_checked_at,f.now()/1000);assert.equal(value.report.cases.filter(entry=>entry.order_hash===row.order_hash).length,1);}
 const calls=f.calls.length,changes=f.db.db.prepare('SELECT total_changes() AS n').get().n;const read=await invoke('read');assert.deepEqual(read,value);assert.equal(f.calls.length,calls);assert.equal(f.db.db.prepare('SELECT total_changes() AS n').get().n,changes);assert.deepEqual(f.db.db.prepare('SELECT * FROM finance_business_period_orders ORDER BY order_hash').all(),orders);assert.deepEqual(f.db.db.prepare('SELECT * FROM finance_business_order_evidence ORDER BY order_hash').all(),evidence);assert.doesNotMatch(JSON.stringify(value),/PRIVATE_|order_sn|return_sn|access_token|buyer|realized/);
});

test('cancel and unrecognized status reviews do not invent missing return references or perform lookup calls',async t=>{
 const f=await fixture(t,{count:3});await makeReview(f,0,'IN_CANCEL');await makeReview(f,1,'UNSUPPORTED_STATUS');await makeReview(f,2,null);
 const value=await runFinanceReturnsReconciliation(f.env,{operation:'step',run_id:f.run.run_id,now:f.now,fetchImpl:probeFetch(f),includeReview:true});assert.equal(value.schema,'finance_reconciliation_v2');assert.deepEqual(value.review.summary,{orders:3,in_cancel:1,to_return:0,other:1,unknown:1});assert.equal(value.report.coverage.paid_orders,0);assert.equal(value.report.coverage.review_orders,3);assert.equal(value.report.returns.reference_count,0);assert.equal(value.report.pending.includes('RETURN_REFERENCES_MISSING'),false);assert.ok(value.report.pending.includes('ORDER_EVIDENCE_MISSING'));assert.ok(value.review.orders.every(row=>row.reference_state==='NOT_APPLICABLE'&&row.reference_count===null));assert.equal(f.calls.length,0);
});

test('reference retry, explicit empty results and later failed refresh retain honest distinct review states',async t=>{
 const f=await fixture(t,{count:1});await makeReview(f);let mode='failed';const fetchImpl=probeFetch(f,(_,row)=>mode==='failed'?Response.json({error:'error_rate_limit'},{status:429}):Response.json({error:'',response:{order_sn:row.order_sn,return_order_sn_list:[]}})),invoke=operation=>runFinanceReturnsReconciliation(f.env,{operation,run_id:f.run.run_id,now:f.now,fetchImpl,includeReview:true});
 let value=await invoke('step'),row=value.review.orders[0];assert.equal(row.reference_state,'RETRY_WAIT');assert.equal(row.reference_count,null);assert.equal(row.reference_diagnostic,'RATE_LIMIT');assert.equal(row.next_attempt_at,f.now()/1000+60);const count=f.calls.length;await invoke('read');await invoke('step');assert.equal(f.calls.length,count);
 f.clock.time+=61000;mode='empty';value=await invoke('step');row=value.review.orders[0];assert.equal(row.reference_state,'KNOWN_EMPTY');assert.equal(row.reference_count,0);assert.equal(row.checked_cases,0);assert.equal(row.pending_cases,0);assert.equal(row.references_checked_at,f.now()/1000);assert.equal(value.report.pending.includes('RETURN_REFERENCES_MISSING'),false);const observed=row.references_checked_at;
 f.clock.time+=301000;mode='failed';value=await invoke('step');row=value.review.orders[0];assert.equal(row.reference_state,'KNOWN_EMPTY');assert.equal(row.references_checked_at,observed);assert.equal(row.reference_diagnostic,'RATE_LIMIT');assert.ok(row.next_attempt_at>f.now()/1000);assert.equal(value.report.coverage.review_orders,1);
});

test('review detail is bounded while full counts remain available and reads create no follow-up jobs',async t=>{
 const f=await fixture(t,{count:41});for(let index=0;index<41;index++)await makeReview(f,index);
 const changes=f.db.db.prepare('SELECT total_changes() AS n').get().n,value=await runFinanceReturnsReconciliation(f.env,{operation:'read',run_id:f.run.run_id,now:f.now,includeReview:true});assert.equal(value.review.summary.orders,41);assert.equal(value.review.summary.to_return,41);assert.equal(value.review.orders.length,40);assert.deepEqual(value.review.truncation,{truncated:true,orders_total:41,orders_included:40});assert.equal(f.calls.length,0);assert.equal(f.db.db.prepare('SELECT total_changes() AS n').get().n,changes);assert.ok(Buffer.byteLength(JSON.stringify(value))<65536);
});

test('contradictory return ownership keeps the safe partial legacy report instead of guessing per-order associations',async t=>{
 const f=await fixture(t,{count:2});await makeReview(f,0);await makeReview(f,1);const fetchImpl=probeFetch(f,(_,row)=>Response.json({error:'',response:{order_sn:row.order_sn,return_order_sn_list:[f.originals[0].return_sn]}})),invoke=()=>runFinanceReturnsReconciliation(f.env,{operation:'step',run_id:f.run.run_id,now:f.now,fetchImpl,includeReview:true});
 await invoke();f.clock.time+=301000;const before=f.calls.length,value=await invoke();assert.equal(f.calls.length-before,1);assert.equal(value.schema,'finance_reconciliation_v1');assert.equal(value.status,'PARTIAL');assert.ok(value.pending.includes('RETURN_REFERENCES_MISSING'));assert.equal(value.returns.reference_count,1);assert.equal(value.coverage.review_orders,2);assert.ok(projectReconciliationFrame(value));assert.equal(projectReconciliationEvidenceFrame(value,projectReconciliationFrame),null);assert.doesNotMatch(JSON.stringify(value),/PRIVATE_|order_sn|return_sn/);
});
