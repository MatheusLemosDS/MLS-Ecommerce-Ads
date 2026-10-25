import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {FINANCE_PROFILE} from '../src/connection-store.mjs';
import {FINANCIAL_ORDER_EVIDENCE_SCHEMA,buildFinancialOrderEvidence,projectFinancialOrderEvidence,readFinancialOrderEvidence} from '../src/financial-order-evidence.mjs';

const stamp=Math.floor(Date.UTC(2026,9,25,15)/1000),now=()=>stamp*1000,run_id='11111111-1111-4111-8111-111111111111';
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(index=1,{bucket='completed',returns=0,covered=1}={}){
 const order_sn='PRIVATE_FINANCIAL_ORDER_'+index,record={order_hash:hash(order_sn),bucket,payment_covered:covered,sales_raw:covered?'120':null,escrow_raw:covered?'100':null,ads_raw:covered?'0':null,returns_seen:covered?returns:null,items:covered?'[{"item_id":"100","model_id":"0","quantity":1}]':'[]',checked_at:stamp};record.source_hash=hash(JSON.stringify(record));
 return {order_sn,order_status:bucket==='other'?'TO_RETURN':bucket==='ongoing'?'SHIPPED':'COMPLETED',currency:'BRL',payment:covered?{order_sn,return_order_sn_list:returns===null?undefined:returns?['PRIVATE_RETURN_'+index]:[],order_income:{escrow_amount:100,escrow_amount_after_adjustment:110.1,total_adjustment_amount:10.1}}:undefined,record};
}
async function database(t){
 const db=new D1();t.after(()=>db.db.close());
 db.db.exec(`CREATE TABLE finance_business_period_runs(run_id TEXT PRIMARY KEY,revision INTEGER,status TEXT,start_date TEXT,end_date TEXT,cutoff_at INTEGER,checked_at INTEGER,partner_id INTEGER,shop_id INTEGER);
 CREATE TABLE finance_business_period_orders(run_id TEXT,order_hash TEXT,bucket TEXT,payment_covered INTEGER,sales_raw TEXT,escrow_raw TEXT,ads_raw TEXT,returns_seen INTEGER,items TEXT,source_hash TEXT,checked_at INTEGER,PRIMARY KEY(run_id,order_hash));
 CREATE TABLE finance_business_period_payment_cache(run_id TEXT,order_hash TEXT,bucket TEXT,payment_covered INTEGER,sales_raw TEXT,escrow_raw TEXT,ads_raw TEXT,returns_seen INTEGER,items TEXT,source_hash TEXT,checked_at INTEGER,PRIMARY KEY(run_id,order_hash));`);
 db.db.prepare('INSERT INTO finance_business_period_runs VALUES(?,?,?,?,?,?,?,?,?)').run(run_id,2,'RUNNING','2026-10-16','2026-10-25',stamp-5,stamp,FINANCE_PROFILE.partner_id,FINANCE_PROFILE.shop_id);
 let calls=0;const batch=db.batch.bind(db);db.batch=async values=>{calls++;return batch(values);};return {db,env:{FINANCE_DB:db},calls:()=>calls};
}
function insert(db,input,{cache=false,evidence=null}={}){
 const r=input.record,table=cache?'finance_business_period_payment_cache':'finance_business_period_orders';
 db.db.prepare('INSERT INTO '+table+' VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(run_id,r.order_hash,r.bucket,r.payment_covered,r.sales_raw,r.escrow_raw,r.ads_raw,r.returns_seen,r.items,r.source_hash,r.checked_at);
 if(evidence)db.db.prepare('INSERT INTO finance_business_order_evidence VALUES(?,?,?,?,?,?)').run(run_id,evidence.order_hash,evidence.source_hash,evidence.checked_at,evidence.payload,evidence.payload_hash);
}

test('private evidence conserves exact source identities and positive, zero and negative adjustment relations without choosing another payout',async()=>{
 const input=fixture(),before=structuredClone(input),value=await buildFinancialOrderEvidence(input),payload=JSON.parse(value.payload);
 assert.equal(value.order_hash,input.record.order_hash);assert.equal(value.source_hash,input.record.source_hash);assert.equal(value.checked_at,stamp);assert.equal(value.payload_hash,hash(value.payload));assert.deepEqual(payload.amounts,{escrow_amount_raw:'100',escrow_amount_after_adjustment_raw:'110.1',total_adjustment_amount_raw:'10.1'});assert.equal(payload.diagnostic,null);assert.deepEqual(payload.return_order_sn_list,[]);assert.deepEqual(input,before);
 for(const [delta,after] of [[0,100],[-10.1,89.9],[0.01,100.01]]){input.payment.order_income.total_adjustment_amount=delta;input.payment.order_income.escrow_amount_after_adjustment=after;const saved=JSON.parse((await buildFinancialOrderEvidence(input)).payload);assert.equal(saved.diagnostic,null);assert.equal(saved.amounts.escrow_amount_raw,'100');}
 input.payment.order_income.escrow_amount_after_adjustment=99;assert.equal(JSON.parse((await buildFinancialOrderEvidence(input)).payload).diagnostic,'ADJUSTMENT_MISMATCH');assert.equal(input.record.escrow_raw,'100');
});

test('missing returns and optional money remain unknown while valid empty references and zero amounts retain their meaning',async()=>{
 const input=fixture();delete input.payment.return_order_sn_list;delete input.payment.order_income.escrow_amount_after_adjustment;delete input.payment.order_income.total_adjustment_amount;
 const missing=JSON.parse((await buildFinancialOrderEvidence(input)).payload);assert.equal(missing.return_order_sn_list,null);assert.deepEqual(missing.amounts,{escrow_amount_raw:'100',escrow_amount_after_adjustment_raw:null,total_adjustment_amount_raw:null});assert.equal(missing.diagnostic,null);
 input.payment.return_order_sn_list=[];Object.assign(input.payment.order_income,{escrow_amount_after_adjustment:100,total_adjustment_amount:0});const empty=JSON.parse((await buildFinancialOrderEvidence(input)).payload);assert.deepEqual(empty.return_order_sn_list,[]);assert.equal(empty.amounts.total_adjustment_amount_raw,'0');
 const review=JSON.parse((await buildFinancialOrderEvidence(fixture(2,{bucket:'other',covered:0}))).payload);assert.equal(review.order_status,'TO_RETURN');assert.equal(review.diagnostic,'PAYMENT_NOT_OBSERVED');assert.equal(review.return_order_sn_list,null);assert.deepEqual(Object.values(review.amounts),[null,null,null]);
});

test('malformed optional observations are sanitized as invalid without executing accessors, exporting buyer fields or rounding sub-cents',async()=>{
 for(const bad of ['10.10',0.001,0.1+0.2,NaN,Infinity,-0]){const input=fixture();input.payment.order_income.total_adjustment_amount=bad;input.payment.buyer_name='PRIVATE_BUYER';input.payment.order_income.shipping_address='PRIVATE_ADDRESS';const value=await buildFinancialOrderEvidence(input),payload=JSON.parse(value.payload);assert.equal(payload.diagnostic,'INVALID');assert.equal(payload.amounts.total_adjustment_amount_raw,null);assert.equal(payload.amounts.escrow_amount_raw,'100');assert.ok(!value.payload.includes('PRIVATE_BUYER'));assert.ok(!value.payload.includes('PRIVATE_ADDRESS'));}
 let executed=0;const input=fixture();Object.defineProperty(input.payment,'return_order_sn_list',{enumerable:true,get(){executed++;throw Error();}});const saved=JSON.parse((await buildFinancialOrderEvidence(input)).payload);assert.equal(executed,0);assert.equal(saved.diagnostic,'INVALID');assert.equal(saved.return_order_sn_list,null);
 const contexts=[{...fixture(),order_sn:'DIFFERENT'}, {...fixture(),record:{...fixture().record,source_hash:'0'.repeat(64)}}];for(const context of contexts)await assert.rejects(buildFinancialOrderEvidence(context),/CONTEXT_INVALID/);
 const getter=fixture();Object.defineProperty(getter,'record',{enumerable:true,get(){executed++;throw Error();}});await assert.rejects(buildFinancialOrderEvidence(getter),/CONTEXT_INVALID/);assert.equal(executed,0);
});

test('the detached private projector rejects forged adjustment consistency, return substitutions and extra sensitive fields',async()=>{
 const original=JSON.parse((await buildFinancialOrderEvidence(fixture(1,{returns:1}))).payload),value=projectFinancialOrderEvidence(original);assert.ok(value);value.return_order_sn_list.push('OTHER');assert.equal(original.return_order_sn_list.length,1);
 for(const change of [v=>{v.extra='PRIVATE';},v=>{v.return_order_sn_list=['DUP','DUP'];},v=>{v.amounts.total_adjustment_amount_raw='10.100';},v=>{v.amounts.escrow_amount_after_adjustment_raw='99';},v=>{v.diagnostic='READY';},v=>{v.diagnostic='PAYMENT_NOT_OBSERVED';}]){const invalid=structuredClone(original);change(invalid);assert.equal(projectFinancialOrderEvidence(invalid),null);}
});

test('one local snapshot distinguishes committed, cached, legacy missing and invalid source evidence without reading providers',async t=>{
 const f=await database(t),first=fixture(1,{returns:1}),second=fixture(2),third=fixture(3),fourth=fixture(4);await f.db.batch(FINANCIAL_ORDER_EVIDENCE_SCHEMA.map(sql=>f.db.prepare(sql)));
 insert(f.db,first,{evidence:await buildFinancialOrderEvidence(first)});insert(f.db,second);const bad=await buildFinancialOrderEvidence(third);bad.payload_hash='0'.repeat(64);insert(f.db,third,{evidence:bad});insert(f.db,fourth,{cache:true,evidence:await buildFinancialOrderEvidence(fourth)});
 const before=f.calls(),result=await readFinancialOrderEvidence(f.env,{run_id},{now});assert.equal(f.calls()-before,1);assert.equal(result.orders.length,3);assert.equal(result.cached_orders.length,1);assert.equal(result.missing_orders,1);assert.equal(result.invalid_orders,1);assert.deepEqual(result.run.source_checked_at,{oldest_at:stamp,latest_at:stamp});const found=result.orders.find(row=>row.order_hash===first.record.order_hash);assert.equal(found.evidence.order_sn,first.order_sn);assert.equal(found.escrow_raw,'100');assert.equal(found.returns_seen,1);assert.deepEqual(found.evidence.return_order_sn_list,['PRIVATE_RETURN_1']);assert.equal(result.orders.filter(row=>row.evidence===null).length,2);
});

test('sidecar-to-ledger joins are bound to exact source hash and observation time, while source corruption or foreign scope fails closed',async t=>{
 const f=await database(t);await f.db.batch(FINANCIAL_ORDER_EVIDENCE_SCHEMA.map(sql=>f.db.prepare(sql)));const input=fixture(),saved=await buildFinancialOrderEvidence(input);insert(f.db,input,{evidence:saved});
 f.db.db.prepare('UPDATE finance_business_order_evidence SET checked_at=checked_at+1').run();const mismatch=await readFinancialOrderEvidence(f.env,{run_id},{now});assert.equal(mismatch.invalid_orders,1);assert.equal(mismatch.orders[0].evidence,null);
 f.db.db.prepare('UPDATE finance_business_order_evidence SET checked_at=?,source_hash=?').run(stamp,'0'.repeat(64));const changed=await readFinancialOrderEvidence(f.env,{run_id},{now});assert.equal(changed.invalid_orders,1);assert.equal(changed.orders[0].evidence,null);
 f.db.db.prepare("UPDATE finance_business_period_orders SET escrow_raw='1'").run();await assert.rejects(readFinancialOrderEvidence(f.env,{run_id},{now}),/STORAGE_INVALID/);
 f.db.db.prepare('UPDATE finance_business_period_runs SET shop_id=shop_id+1').run();await assert.rejects(readFinancialOrderEvidence(f.env,{run_id},{now}),error=>error.status===404);
 await assert.rejects(readFinancialOrderEvidence(f.env,{run_id,order_sn:'PRIVATE'},{now}),error=>error.status===400);
});
