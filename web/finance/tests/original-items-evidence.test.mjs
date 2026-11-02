import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore,FINANCE_PROFILE} from '../src/connection-store.mjs';
import {runFinanceBusinessPeriod} from '../src/business-period.mjs';
import {buildFinancialOrderEvidence,readFinancialOrderEvidence} from '../src/financial-order-evidence.mjs';
import {runFinanceReturnsReconciliation} from '../src/returns-reconciliation.mjs';
import {buildReturnItemEvidence,buildOriginalItemsReport} from '../src/return-item-evidence.mjs';
import {projectOriginalItemsFrame,projectReconciliationOriginalItemsFrame} from '../src/original-items-frame.mjs';
import {projectReconciliationFrame,projectReconciliationEvidenceFrame,projectReconciliationMoneyFrame} from '../src/reconciliation-frame.mjs';
import {originalItemsEnvelopeFixture} from './original-items-fixture.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const project=value=>projectReconciliationOriginalItemsFrame(value,projectReconciliationFrame,projectReconciliationEvidenceFrame,projectReconciliationMoneyFrame,projectOriginalItemsFrame);
const clone=value=>JSON.parse(JSON.stringify(value));
async function fixture(t){
 const db=new D1();t.after(()=>db.db.close());const clock={time:Date.UTC(2026,9,25,15)},now=()=>clock.time;
 const env={FINANCE_DB:db,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,52).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:'synthetic-original-items-key'};
 const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:'SYNTHETIC_ORIGINAL_ACCESS',refresh_token:'SYNTHETIC_ORIGINAL_REFRESH',expires_at:now()/1000+14400});
 const run=await runFinanceBusinessPeriod(env,{operation:'start',start_date:'2026-10-01',end_date:'2026-10-15',now,fetchImpl:async()=>{throw Error('unexpected source');}}),order_sn='SYNTHETIC_ORIGINAL_ORDER',return_sn='SYNTHETIC_ORIGINAL_RETURN',order_hash=hash(order_sn),case_hash=hash(return_sn);
 db.db.prepare('UPDATE finance_business_period_runs SET status=\'COMPLETE\',revision=2,pages_read=1 WHERE run_id=?').run(run.run_id);
 let record={order_hash,bucket:'completed',payment_covered:1,sales_raw:'100',escrow_raw:'80',ads_raw:'0',returns_seen:1,items:JSON.stringify([{item_id:'1000',model_id:'0',quantity:2}]),checked_at:now()/1000};record.source_hash=hash(JSON.stringify(record));
 db.db.prepare('INSERT INTO finance_business_period_orders(run_id,order_hash,bucket,payment_covered,sales_raw,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(run.run_id,record.order_hash,record.bucket,record.payment_covered,record.sales_raw,record.escrow_raw,record.ads_raw,record.returns_seen,record.items,record.source_hash,record.checked_at);
 const evidence=await buildFinancialOrderEvidence({order_sn,order_status:'COMPLETED',currency:'BRL',payment:{order_sn,return_order_sn_list:[return_sn],order_income:{escrow_amount:80,escrow_amount_after_adjustment:80,total_adjustment_amount:0}},record});
 db.db.prepare('INSERT INTO finance_business_order_evidence(run_id,order_hash,source_hash,checked_at,payload,payload_hash) VALUES(?,?,?,?,?,?)').run(run.run_id,evidence.order_hash,evidence.source_hash,evidence.checked_at,evidence.payload,evidence.payload_hash);
 const mode={item:[{item_id:1000,model_id:0,amount:1}],extra:{}},calls=[];
 const fetchImpl=async request=>{const url=new URL(request.url);calls.push({path:url.pathname,method:request.method});assert.equal(url.pathname,'/api/v2/returns/get_return_detail');assert.equal(request.method,'GET');return Response.json({error:'',response:{order_sn,return_sn,status:'ACCEPTED',currency:'BRL',refund_amount:12.5,...(mode.item===undefined?{}:{item:mode.item}),...mode.extra,buyer:{name:'SYNTHETIC_IGNORED_BUYER'}}});};
 const invoke=(operation,{original=true}={})=>runFinanceReturnsReconciliation(env,{operation,run_id:run.run_id,now,fetchImpl,...(original?{includeReview:true,includeMoney:true,includeOriginalItems:true}:{})});
 const legacy=()=>db.db.prepare('SELECT * FROM finance_returns_reconciliation_cases WHERE case_hash=?').get(case_hash),sidecar=()=>db.db.prepare('SELECT * FROM finance_return_item_evidence WHERE case_hash=?').get(case_hash);
 return {env,db,clock,now,run,mode,calls,invoke,legacy,sidecar,order_hash,case_hash,async review(){
  const current={order_hash,bucket:'other',payment_covered:0,sales_raw:null,escrow_raw:null,ads_raw:null,returns_seen:null,items:'[]',checked_at:record.checked_at};current.source_hash=hash(JSON.stringify(current));
  const updated=await buildFinancialOrderEvidence({order_sn,order_status:'TO_RETURN',currency:'BRL',payment:{order_sn,return_order_sn_list:[return_sn],order_income:{}},record:current});
  db.db.prepare('UPDATE finance_business_period_orders SET bucket=?,payment_covered=0,sales_raw=NULL,escrow_raw=NULL,ads_raw=NULL,returns_seen=NULL,items=?,source_hash=? WHERE run_id=? AND order_hash=?').run(current.bucket,current.items,current.source_hash,run.run_id,order_hash);
  db.db.prepare('UPDATE finance_business_order_evidence SET source_hash=?,payload=?,payload_hash=? WHERE run_id=? AND order_hash=?').run(current.source_hash,updated.payload,updated.payload_hash,run.run_id,order_hash);record=current;
 }};
}

test('the count-only v4 is detached and standalone, without changing any legacy financial field',()=>{
 const value=originalItemsEnvelopeFixture(),before=JSON.stringify(value);assert.deepEqual(project(value),value);assert.equal(projectReconciliationMoneyFrame(value,projectReconciliationFrame,projectReconciliationEvidenceFrame),null);
 const context=vm.createContext({TextEncoder,serialized:before});vm.runInContext([projectReconciliationFrame,projectReconciliationEvidenceFrame,projectReconciliationMoneyFrame,projectOriginalItemsFrame,projectReconciliationOriginalItemsFrame].map(fn=>fn.toString()).join('\n')+'\nglobalThis.result=projectReconciliationOriginalItemsFrame(JSON.parse(serialized),projectReconciliationFrame,projectReconciliationEvidenceFrame,projectReconciliationMoneyFrame,projectOriginalItemsFrame);',context);assert.deepEqual(JSON.parse(JSON.stringify(context.result)),value);
 const checked=project(value);checked.original_items.orders[0].items[0].quantity=90;assert.equal(JSON.stringify(value),before);
});

test('provider amount is a positive integer selling-unit count, never money or an inferred variation',async()=>{
 const reference={case_hash:'a'.repeat(64),order_hash:'b'.repeat(64)},base='c'.repeat(64),at=1792500000;
 const build=async item=>JSON.parse((await buildReturnItemEvidence(reference,base,at,{item})).payload);
 const valid=await build([{item_id:100,model_id:0,amount:2,item_price:99,refund_amount:0.01,name:'SYNTHETIC_NAME',variation_sku:'SYNTHETIC_SKU',buyer:{}}]);assert.deepEqual(valid,{schema:'return_item_evidence_v1',state:'AVAILABLE',items:[{item_id:'100',model_id:'0',quantity:2}]});
 for(const item of [[],{},[{item_id:100,model_id:0,amount:0}],[{item_id:100,model_id:0,amount:-0}],[{item_id:100,model_id:0,amount:1.5}],[{item_id:100,model_id:0,amount:'2'}],[{item_id:100,amount:2}],[{item_id:Number.MAX_SAFE_INTEGER+1,model_id:0,amount:1}],[{item_id:100,model_id:0,amount:1},{item_id:100,model_id:0,amount:1}]])assert.equal((await build(item)).state,'INVALID');
 assert.equal((await build(null)).state,'NOT_CAPTURED');assert.equal((await build(undefined)).state,'NOT_CAPTURED');assert.equal((await build(Array.from({length:1001},()=>({item_id:1,model_id:0,amount:1})))).state,'LIMIT_REACHED');
 let reads=0;const response={};Object.defineProperty(response,'item',{get(){reads++;throw Error('SYNTHETIC_GETTER');}});assert.equal(JSON.parse((await buildReturnItemEvidence(reference,base,at,response)).payload).state,'INVALID');assert.equal(reads,0);
});

test('opt-in reads expose already verified paid counts while old Returns remain NOT_CAPTURED, without provider access',async t=>{
 const f=await fixture(t),old=await readFinancialOrderEvidence(f.env,{run_id:f.run.run_id},{now:f.now}),source=await readFinancialOrderEvidence(f.env,{run_id:f.run.run_id},{now:f.now,includeOriginalItems:true});assert.equal(Object.hasOwn(old.orders[0],'items'),false);assert.equal(source.orders[0].items[0].quantity,2);
 const value=await f.invoke('read');assert.ok(project(value));assert.equal(value.original_items.orders[0].state,'AVAILABLE');assert.equal(value.original_items.orders[0].items[0].quantity,2);assert.equal(value.original_items.cases[0].state,'NOT_CAPTURED');assert.equal(value.original_items.cases[0].source_checked_at,null);assert.equal(f.calls.length,0);
});

test('the existing Returns response captures a separate bound sidecar atomically and preserves legacy bytes, cadence and request count',async t=>{
 const f=await fixture(t),result=await f.invoke('step',{original:false}),row=f.legacy(),item=f.sidecar();assert.equal(result.schema,'finance_reconciliation_v1');assert.equal(f.calls.length,1);
 const observation=JSON.parse(row.payload);assert.deepEqual(Object.keys(observation),['status','requested_refund_cents','checked_at','diagnostic']);assert.equal(row.next_attempt_at,observation.checked_at+300);assert.equal(item.legacy_payload_hash,row.payload_hash);assert.equal(item.checked_at,observation.checked_at);
 assert.equal(row.payload_hash,hash(JSON.stringify({partner_id:row.partner_id,shop_id:row.shop_id,case_hash:row.case_hash,order_hash:row.order_hash,order_sn:row.order_sn,return_sn:row.return_sn,payload:observation})));
 const value=await f.invoke('read');assert.ok(project(value));assert.deepEqual(value.report,result);assert.deepEqual(value.original_items.cases[0].items,[{item_id:'1000',model_id:'0',quantity:1}]);assert.equal(value.original_items.cases[0].state,'AVAILABLE');await f.invoke('step');assert.equal(f.calls.length,1);
 for(const secret of ['SYNTHETIC_ORIGINAL_ORDER','SYNTHETIC_ORIGINAL_RETURN','SYNTHETIC_IGNORED_BUYER','SYNTHETIC_ORIGINAL_ACCESS','order_sn','return_sn','item_price'])assert.equal(JSON.stringify(value).includes(secret),false,secret);
});

test('null, missing and invalid later item observations supersede older available evidence without changing requested refunds',async t=>{
 for(const item of [null,undefined,[{item_id:1000,model_id:0,amount:0}]]){
  const f=await fixture(t);await f.invoke('step');const old=f.sidecar();f.clock.time+=301000;f.mode.item=item;const value=await f.invoke('step');assert.ok(project(value));assert.equal(value.original_items.cases[0].state,item===null||item===undefined?'NOT_CAPTURED':'INVALID');assert.deepEqual(value.original_items.cases[0].items,[]);assert.notEqual(f.sidecar().legacy_payload_hash,old.legacy_payload_hash);assert.equal(value.report.returns.known_requested_refund_cents,1250);assert.equal(value.report.adjustments.after_adjustment_repass_cents,8000);assert.equal(f.calls.length,2);
 }
});

test('a legacy checked return, foreign or tampered sidecar and a TO_RETURN empty cohort cannot become a zero-unit original sale',async t=>{
 const f=await fixture(t);await f.invoke('step');f.db.db.prepare('DELETE FROM finance_return_item_evidence').run();let value=await f.invoke('read');assert.equal(value.original_items.cases[0].state,'NOT_CAPTURED');assert.equal(value.original_items.cases[0].source_checked_at,value.report.cases[0].checked_at);
 f.clock.time+=301000;await f.invoke('step');f.db.db.prepare('UPDATE finance_return_item_evidence SET payload_hash=?').run('0'.repeat(64));value=await f.invoke('read');assert.equal(value.original_items.cases[0].state,'INVALID');assert.equal(value.report.returns.known_requested_refund_cents,1250);
 await f.review();value=await f.invoke('read');assert.equal(value.original_items.orders[0].state,'NOT_CAPTURED');assert.deepEqual(value.original_items.orders[0].items,[]);assert.equal(value.report.coverage.paid_orders,0);assert.equal(value.report.coverage.review_orders,1);assert.equal(f.calls.length,2);
});

test('the 64 KiB optional budget drops whole count blocks explicitly and never truncates available item lines',()=>{
 const value=originalItemsEnvelopeFixture(),report=value.report,large=Array.from({length:1000},(_,index)=>({item_id:(10000000000000000000n+BigInt(index)).toString(),model_id:'10000000000000000000',quantity:1000000000000}));
 const source={orders:[{order_hash:report.cases[0].order_hash,checked_at:report.source_checked_at.finance_oldest_at,bucket:'completed',payment_covered:1,items:large}]},saved=new Map([[report.cases[0].case_hash,{state:'AVAILABLE',items:large}]]),result=buildOriginalItemsReport(source,report,saved);
 assert.ok(result);assert.equal(result.orders[0].state,'LIMIT_REACHED');assert.equal(result.cases[0].state,'LIMIT_REACHED');assert.deepEqual(result.orders[0].items,[]);assert.deepEqual(result.cases[0].items,[]);assert.ok(Buffer.byteLength(JSON.stringify(result))<=65536);
 const forged=clone(value);forged.original_items.orders[0].items=large;assert.equal(project(forged),null);
});

test('optional CREATE, INSERT and SELECT failures leave the legacy report usable without retrying the provider or retaining stale counts',async t=>{
 for(const stage of ['CREATE','INSERT','SELECT']){
  const f=await fixture(t),prepare=f.db.prepare.bind(f.db);let injected=0;
  if(stage!=='CREATE'){await f.invoke('step');f.clock.time+=301000;}
  const beforeCalls=f.calls.length;
  f.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith(stage==='CREATE'?'CREATE TABLE IF NOT EXISTS finance_return_item_evidence':stage==='INSERT'?'INSERT INTO finance_return_item_evidence':'SELECT * FROM finance_return_item_evidence'))statement.run=async()=>{injected++;throw Error('SYNTHETIC_OPTIONAL_STORAGE_FAILURE');};return statement;};
  const value=await f.invoke(stage==='SELECT'?'read':'step');assert.ok(project(value));assert.ok(injected>0,stage);assert.equal(value.report.cases[0].status,'ACCEPTED');assert.equal(value.report.cases[0].requested_refund_cents,1250);assert.equal(value.report.adjustments.after_adjustment_repass_cents,8000);assert.equal(f.calls.length,beforeCalls+(stage==='SELECT'?0:1));assert.ok(['NOT_CAPTURED','INVALID'].includes(value.original_items.cases[0].state));
  if(stage!=='SELECT'){const row=f.legacy(),payload=JSON.parse(row.payload);assert.equal(payload.checked_at,f.now()/1000);assert.equal(row.next_attempt_at,payload.checked_at+300);assert.equal(row.diagnostic,null);}
 }
});

test('a failed legacy UPDATE rolls back its optional sidecar and the guarded fallback cannot publish mixed observations',async t=>{
 const f=await fixture(t);await f.invoke('step');const before=f.sidecar(),prepare=f.db.prepare.bind(f.db);f.clock.time+=301000;f.mode.item=[{item_id:1000,model_id:0,amount:2}];let failures=0;
 f.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('UPDATE finance_returns_reconciliation_cases SET payload='))statement.run=async()=>{failures++;throw Error('SYNTHETIC_LEGACY_WRITE_FAILURE');};return statement;};
 const value=await f.invoke('step');assert.ok(project(value));assert.equal(failures,2,'one rolled-back batch and one guarded local fallback, never another provider call');assert.equal(f.calls.length,2);assert.deepEqual(f.sidecar(),before);assert.equal(value.original_items.cases[0].items[0].quantity,1);assert.equal(value.original_items.cases[0].source_checked_at,before.checked_at);assert.equal(value.report.cases[0].checked_at,before.checked_at);
});

test('a lost case lease cannot write either legacy or optional evidence',async t=>{
 const f=await fixture(t),prepare=f.db.prepare.bind(f.db),batch=f.db.batch.bind(f.db),marker=Symbol('item-write'),winner=crypto.randomUUID();let injected=false;
 f.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('INSERT INTO finance_return_item_evidence'))statement[marker]=true;return statement;};
 f.db.batch=statements=>{if(!injected&&statements.some(statement=>statement[marker])){injected=true;f.db.db.prepare('UPDATE finance_returns_reconciliation_cases SET lease_owner=?,lease_until=?').run(winner,f.now()/1000+45);}return batch(statements);};
 const value=await f.invoke('step');assert.equal(injected,true);assert.equal(f.sidecar(),undefined);assert.equal(f.legacy().payload,null);assert.equal(f.legacy().lease_owner,winner);assert.equal(value.original_items.cases[0].state,'NOT_CAPTURED');assert.equal(f.calls.length,1);
});

test('optional preparation or persistence cannot write after its case lease expires',async t=>{
 for(const stage of ['CREATE','INSERT']){
  const f=await fixture(t),prepare=f.db.prepare.bind(f.db),batch=f.db.batch.bind(f.db),marker=Symbol('expiry'),initial=f.now()/1000;let injected=false;
  f.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith(stage==='CREATE'?'CREATE TABLE IF NOT EXISTS finance_return_item_evidence':'INSERT INTO finance_return_item_evidence'))statement[marker]=true;return statement;};
  f.db.batch=statements=>{
   if(!injected&&statements.some(statement=>statement[marker])){injected=true;f.clock.time+=46000;if(stage==='INSERT')return Promise.reject(Error('SYNTHETIC_OPTIONAL_DELAYED_FAILURE'));}
   return batch(statements);
  };
  const value=await f.invoke('step');assert.equal(injected,true);assert.equal(f.calls.length,1);assert.equal(f.legacy().payload,null);assert.equal(f.legacy().payload_hash,null);assert.equal(f.legacy().next_attempt_at,0);assert.equal(f.legacy().lease_until,initial+45);assert.equal(f.sidecar(),undefined);assert.equal(value.original_items.cases[0].state,'NOT_CAPTURED');
 }
});
