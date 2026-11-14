import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {financialAccountingPeriod} from '../../cloudflare/src/financial-accounting-schedule.mjs';
import {readFinancialAutomationCashPage} from '../../cloudflare/src/financial-automation-cash-sources.mjs';
import {projectFinancialObligationSnapshot,financialObligationSnapshotHash,FINANCIAL_OBLIGATION_PATH} from '../src/financial-obligation-frame.mjs';
import {createFinancialObligationWorker,resolveFinancialObligationRecords} from '../src/financial-obligation-worker.mjs';
import {createFinancialAllocationWorker,FINANCIAL_ALLOCATION_PATH} from '../src/financial-allocation-worker.mjs';
import {EXTERNAL_CASH_SCHEMA,readExternalCashStorageContext,readExternalCashWorkspace,previewExternalCashImport,mutateExternalCash} from '../src/external-cash-store.mjs';
import {EXTERNAL_CASH_PATH} from '../src/external-cash-frame.mjs';
import {createExternalCashWorker} from '../src/external-cash-worker.mjs';
import {createFinancialCashAllocationStore} from '../../cloudflare/src/financial-cash-allocation-store.mjs';

const scope={organization_id:'legacy-brazacommerce',store_id:'legacy-shopee',currency:'BRL'},book={...scope,account_id:'operating-book'},secret='synthetic-router-secret-'.repeat(3);
const ids={expense:'11111111-1111-4111-8111-111111111111',otherExpense:'22222222-2222-4222-8222-222222222222',bank:'b'.repeat(64),otherBank:'c'.repeat(64)};
const selected=(record_id,amount_cents)=>({record_id,amount_cents});
const request=(path,value)=>new Request('https://auth.brazacommerce.com.br'+path,{method:'POST',headers:{'content-type':'application/json','x-braza-finance-router':secret},body:JSON.stringify(value)});
class ObservedD1 extends D1{prepare(sql){const s=super.prepare(sql);s.testSql=sql;return s;}async batch(statements){if(this.beforeBatch)await this.beforeBatch(statements);return super.batch(statements);}}
async function fixture(){
  let millis=Date.parse('2026-11-13T18:00:00Z'),registryRevision=0;const now=()=>millis;
  const env={FINANCE_ROUTER_SECRET:secret,APP_INTERNAL_SECRET:'synthetic-app-secret',FINANCE_DB:new ObservedD1(),ADMIN_DB:new D1()},registry=createFinancialObligationWorker({now}),allocation=createFinancialAllocationWorker({now});
  await env.FINANCE_DB.batch(EXTERNAL_CASH_SCHEMA.map(sql=>env.FINANCE_DB.prepare(sql)));const storage=await readExternalCashStorageContext(env);
  await env.FINANCE_DB.prepare('INSERT INTO finance_external_cash_state(tenant,revision) VALUES(?,0)').bind(storage.tenant).run();
  for(const recordId of [ids.bank,ids.otherBank])await env.FINANCE_DB.prepare("INSERT INTO finance_external_cash_records(tenant,record_id,source,date,amount_cents,currency,external_id,reference,description,reported_status,status,import_id,review_hint,created_at) VALUES(?,?,'NUBANK','2026-11-10',-10000,'BRL',?,NULL,'SYNTHETIC_PRIVATE_DESCRIPTION',NULL,'POSTED','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',0,1)").bind(storage.tenant,recordId,'SYNTHETIC_PRIVATE_ID_'+recordId).run();
  const snapshot=async({status='OPEN',amount_cents=10000,ledger_revision=1}={})=>{
    const value={schema:'app_expense_observation_v1',scope,month:'2026-11',ledger_revision,mode:'CONFIRMED',captured_at:new Date(millis).toISOString(),source_hash:'0'.repeat(64),items:[ids.expense,ids.otherExpense].map(expense_id=>({expense_id,amount_cents,status,competence_month:'2026-11',due_date:'2026-11-20',paid_date:status==='PAID'?'2026-11-10':null,updated_at:'2026-11-13T17:00:00.000Z'}))};
    value.source_hash=await financialObligationSnapshotHash(value);assert.ok(projectFinancialObligationSnapshot(value));return value;
  };
  const register=async changes=>{const response=await registry.fetch(request(FINANCIAL_OBLIGATION_PATH,{schema:'financial_obligation_source_request_v1',operation:'register',request_id:crypto.randomUUID(),expected_revision:registryRevision,snapshot:await snapshot(changes)}),env);const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));registryRevision=body.revision;return body;};
  await register();
  const cash=createExternalCashWorker({readWorkspace:readExternalCashWorkspace,previewImport:previewExternalCashImport,mutate:mutateExternalCash});
  env.COMMERCIAL_FETCH=async incoming=>{const path=new URL(incoming.url).pathname,target=new Request(incoming.url,{method:'POST',headers:{'content-type':'application/json','x-braza-finance-router':secret},body:await incoming.text()});if(path===FINANCIAL_ALLOCATION_PATH)return allocation.fetch(target,env);if(path===FINANCIAL_OBLIGATION_PATH)return registry.fetch(target,env);if(path===EXTERNAL_CASH_PATH)return cash.fetch(target,env);throw Error('Unexpected synthetic route');};
  return {env,storage,allocation,registry,now,register,advance(n){millis+=n;},close(){env.FINANCE_DB.db.close();env.ADMIN_DB.db.close();}};
}
const command=(operation='preview',{expense=ids.expense,bank=ids.bank,amount=4000,revision=0,request_id=crypto.randomUUID()}={})=>({schema:'financial_cash_allocation_request_v1',operation,relation:'OBLIGATION_PAYMENT',left:[selected('obligation:'+expense,amount)],right:[selected(bank,amount)],adjustments:[],...(operation==='confirm'?{request_id,expected_revision:revision,confirmation:{confirmed:true,reason_code:'OPERATOR_VERIFIED'}}:{})});
async function run(f,value){const response=await f.allocation.fetch(request(FINANCIAL_ALLOCATION_PATH,value),f.env);return {status:response.status,body:await response.json()};}
const groupCount=f=>f.env.FINANCE_DB.db.prepare("SELECT COUNT(*) n FROM finance_financial_cash_groups").get().n;

test('real default resolver links App-origin obligation snapshots to negative bank rows and preserves original evidence through partial payments',async()=>{
  const f=await fixture();try{
    const preview=await run(f,command());assert.equal(preview.status,200);assert.equal(preview.body.group.left[0].record_id,'obligation:'+ids.expense);assert.equal(preview.body.group.right[0].amount_cents,4000);
    const firstCommand=command('confirm'),first=await run(f,firstCommand);assert.equal(first.status,200);assert.equal(first.body.group.relation,'OBLIGATION_PAYMENT');assert.equal(first.body.group.accounting_effect,'SETTLEMENT_ONLY_NO_NEW_REVENUE');assert.match(first.body.group.left[0].evidence_id,/^expense-evidence:[a-f0-9]{64}$/);
    const receipt=await run(f,firstCommand);assert.equal(receipt.status,200);assert.equal(receipt.body.replayed,true);assert.equal(receipt.body.group_id,first.body.group_id);
    const rest=await run(f,command('confirm',{amount:6000,revision:1}));assert.equal(rest.status,200);assert.equal(groupCount(f),2);
    const repeated=await run(f,command('confirm',{expense:ids.otherExpense,amount:1,revision:2}));assert.equal(repeated.status,409,'same bank debit cannot settle another obligation after full allocation');
    const otherDebit=await run(f,command('confirm',{bank:ids.otherBank,amount:1,revision:2}));assert.equal(otherDebit.status,409,'same obligation cannot spend a second debit after full payment');
    const raw=f.env.FINANCE_DB.db.prepare('SELECT payload_json FROM finance_financial_cash_groups WHERE group_id=?').get(first.body.group_id).payload_json;assert.doesNotMatch(raw,/SYNTHETIC_PRIVATE|description|paid_date/);
  }finally{f.close();}
});

test('cancelled, expired, unknown or client-supplied obligations cannot create a bank association',async()=>{
  const f=await fixture();try{
    f.advance(301000);let reply=await run(f,command());assert.equal(reply.status,409);assert.equal(reply.body.error,'FINANCIAL_CASH_OBLIGATION_SOURCE_STALE');
    await f.register({status:'CANCELLED',ledger_revision:2});reply=await run(f,command('confirm'));assert.equal(reply.status,409);
    const forged={...command(),records:[{record_id:'obligation:'+ids.expense,amount_cents:1,status:'PAID'}]};assert.equal((await run(f,forged)).status,400);
    assert.equal((await run(f,command('confirm',{expense:'33333333-3333-4333-8333-333333333333'}))).status,404);
  }finally{f.close();}
});

test('a cancellation between source read and allocation transaction trips the atomic source head/hash fence',async()=>{
  const f=await fixture();try{
    let raced=false;f.env.FINANCE_DB.beforeBatch=async statements=>{if(!statements.some(s=>/^UPDATE finance_financial_cash_state SET/.test(s.testSql)))return;f.env.FINANCE_DB.beforeBatch=null;raced=true;f.advance(1000);await f.register({status:'CANCELLED',ledger_revision:2});};
    const reply=await run(f,command('confirm'));assert.equal(reply.status,409);assert.equal(reply.body.error,'FINANCIAL_CASH_ALLOCATION_CONFLICT');assert.equal(raced,true);assert.equal(groupCount(f),0);
    assert.equal(f.env.FINANCE_DB.db.prepare('SELECT revision FROM finance_financial_cash_state').get().revision,0);assert.equal(f.env.FINANCE_DB.db.prepare('SELECT COUNT(*) n FROM finance_financial_cash_requests').get().n,0);
    assert.equal(f.env.FINANCE_DB.db.prepare('SELECT COUNT(*) n FROM finance_financial_obligation_snapshots').get().n,2,'both immutable as-of snapshots survive; financial allocation is rolled back');
  }finally{f.close();}
});

test('reversal releases both capacities while refreshing sources never rewrites original group proof',async()=>{
  const f=await fixture();try{
    const first=await run(f,command('confirm',{amount:10000}));assert.equal(first.status,200);const original=f.env.FINANCE_DB.db.prepare('SELECT payload_json FROM finance_financial_cash_groups WHERE group_id=?').get(first.body.group_id).payload_json;
    f.advance(1000);await f.register({amount_cents:12000,ledger_revision:2});assert.equal(f.env.FINANCE_DB.db.prepare('SELECT payload_json FROM finance_financial_cash_groups WHERE group_id=?').get(first.body.group_id).payload_json,original);
    const reversed=await run(f,{schema:'financial_cash_allocation_request_v1',operation:'reverse',request_id:crypto.randomUUID(),expected_revision:1,group_id:first.body.group_id,reason_code:'OPERATOR_VERIFIED'});assert.equal(reversed.status,200);
    const current=await run(f,command('confirm',{amount:10000,revision:2}));assert.equal(current.status,200);assert.notEqual(current.body.group.left[0].evidence_id,first.body.group.left[0].evidence_id);
  }finally{f.close();}
});

test('a negative bank source remains one shared capacity pool even through another explicitly authorized book namespace',async()=>{
  const f=await fixture();try{
    assert.equal((await run(f,command('confirm',{amount:7000}))).status,200);
    const alternate={organization_id:'synthetic-other-authorized-book',store_id:'synthetic-store',currency:'BRL'};
    const rows=[{...alternate,record_id:'synthetic-other-obligation',revision:1,account_id:'synthetic-expenses',kind:'OBLIGATION',amount_cents:10000,status:'OPEN',date:'2026-11-20',evidence_id:'synthetic-source',legacy_record_id:null},{...alternate,record_id:ids.bank,revision:1,account_id:'legacy-nubank-imports',kind:'BANK_TRANSACTION',amount_cents:-10000,status:'POSTED',date:'2026-11-10',evidence_id:'cash-evidence:'+ids.bank,legacy_record_id:ids.bank}];
    const store=createFinancialCashAllocationStore(f.env.FINANCE_DB,{scope:alternate,actor_id:'synthetic-other-authorized-owner',authorize:async()=>true,resolveRecords:async wanted=>rows.filter(row=>wanted.includes(row.record_id)),legacy_cash_tenant:f.storage.tenant,now:f.now});
    await assert.rejects(()=>store.confirm({request_id:crypto.randomUUID(),expected_revision:0,relation:'OBLIGATION_PAYMENT',left:[selected('synthetic-other-obligation',4000)],right:[selected(ids.bank,4000)],confirmation:{confirmed:true,reason_code:'OPERATOR_VERIFIED'}}),e=>e.code==='FINANCIAL_CASH_ALLOCATION_EXCEEDS_AVAILABLE'&&e.status===409);
  }finally{f.close();}
});

test('cash source journal includes the durable expense-payment cause in REVIEW without recognizing a second expense or confirmed balance',async()=>{
  const f=await fixture();try{
    assert.equal((await run(f,command('confirm'))).status,200);
    const page=await readFinancialAutomationCashPage(f.env,{scope:book,period:financialAccountingPeriod({kind:'MONTH',anchor:'2026-11'}),month:'2026-11',source:'NUBANK',now:f.now});
    const linked=page.events.find(event=>event.evidence.some(row=>row.kind==='OPERATOR_CASH_ALLOCATION'));assert.ok(linked);assert.equal(linked.quality,'REVIEW');assert.equal(linked.source.identity,'CONSERVATIVE');assert.deepEqual(linked.postings.map(row=>[row.account,row.amount_cents]),[['ACCOUNTS_PAYABLE',4000],['BANK',-4000]]);assert.equal(linked.postings.some(row=>row.account==='OPERATING_EXPENSE'||row.account==='REVENUE'),false);assert.deepEqual(page.balances,[]);assert.notEqual(page.coverage[0].state,'COMPLETE');
  }finally{f.close();}
});
