import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {BUSINESS_MONTH_SCHEMA} from '../src/business-month.mjs';
import {readExpenseLedger,mutateExpenseLedger} from '../src/expense-ledger.mjs';
import {refreshFinancialExpenseObligations} from '../src/financial-obligation-app-source.mjs';
import {FINANCIAL_OBLIGATION_PATH,createFinancialObligationWorker,createFinancialObligationRegistry} from '../../finance/src/financial-obligation-worker.mjs';

const scope={organization_id:'legacy-brazacommerce',store_id:'legacy-shopee',currency:'BRL'},month='2026-11';
async function fixture(t){
  let millis=Date.parse('2026-11-20T12:00:00.000Z');const now=()=>millis;
  const env={ADMIN_DB:new D1(),FINANCE_DB:new D1(),FINANCE_ROUTER_SECRET:'synthetic-retry-router-secret-'.repeat(2)};
  // Real D1 serializes batches. The synchronous SQLite fixture otherwise
  // starts nested BEGINs when two requests interleave at its await points.
  for(const db of [env.ADMIN_DB,env.FINANCE_DB]){const batch=db.batch.bind(db);let pending=Promise.resolve();db.batch=statements=>{const result=pending.then(()=>batch(statements));pending=result.catch(()=>{});return result;};}
  t.after(()=>{env.ADMIN_DB.db.close();env.FINANCE_DB.db.close();});
  await env.ADMIN_DB.batch(BUSINESS_MONTH_SCHEMA.map(sql=>env.ADMIN_DB.prepare(sql)));
  const save=async amount=>{const old=await readExpenseLedger(env,{month},{now});return mutateExpenseLedger(env,{action:'save',month,revision:old.revision,request_id:crypto.randomUUID(),entry:{id:old.items[0]?.id??null,category:'BILL',description:'Synthetic operating expense',amount_cents:amount,competence_month:month,due_date:'2026-11-25',status:'OPEN',paid_date:null},installments:1},'synthetic-owner',{now});};
  await save(1500);
  const worker=createFinancialObligationWorker({now}),commands=[];
  const register=async command=>{commands.push(structuredClone(command));const response=await worker.fetch(new Request('https://auth.brazacommerce.com.br'+FINANCIAL_OBLIGATION_PATH,{method:'POST',headers:{'content-type':'application/json','x-braza-finance-router':env.FINANCE_ROUTER_SECRET},body:JSON.stringify(command)}),env);return {status:response.status,body:await response.json()};};
  const input={scope,month,expected_revision:0,request_id:'synthetic-retry:'+('r'.repeat(128))};
  return {env,now,save,register,commands,input,advance:delta=>{millis+=delta;},refresh:(options={},changes={})=>refreshFinancialExpenseObligations(env,{...input,...changes},{now,register,...options}),registry:createFinancialObligationRegistry(env.FINANCE_DB,{scope,actor_id:'synthetic-owner',authorize:async()=>true,now})};
}

test('App obligation retry after a lost Finance acknowledgement reuses the exact durable command across clock changes',async t=>{
  const f=await fixture(t),before=await readExpenseLedger(f.env,{month},{now:f.now});
  await assert.rejects(()=>f.refresh({register:async command=>{const result=await f.register(command);assert.equal(result.status,200);throw Error('synthetic lost acknowledgement');}}),error=>error.code==='FINANCIAL_OBLIGATION_APP_REGISTRATION_UNAVAILABLE');
  const cold=await import('../src/financial-obligation-app-source.mjs?synthetic-cold-retry');
  f.advance(1);const retry=await cold.refreshFinancialExpenseObligations(f.env,f.input,{now:f.now,register:f.register});assert.equal(retry.status,200);assert.equal(retry.body.replayed,true);assert.equal(retry.body.revision,1);assert.deepEqual(f.commands[1],f.commands[0]);
  assert.equal(f.env.FINANCE_DB.db.prepare('SELECT COUNT(*) n FROM finance_financial_obligation_snapshots').get().n,1);
  assert.equal(f.env.FINANCE_DB.db.prepare('SELECT COUNT(*) n FROM finance_financial_obligation_requests').get().n,1);
  assert.equal(f.env.ADMIN_DB.db.prepare("SELECT COUNT(*) n FROM financial_automation_revisions WHERE kind LIKE 'OBLIGATION_REQUEST_%'").get().n,1);
  assert.deepEqual((await readExpenseLedger(f.env,{month},{now:f.now})).items,before.items);
});

test('App obligation request identity rejects changed source material, month or expected revision before contacting Finance again',async t=>{
  const f=await fixture(t);assert.equal((await f.refresh()).status,200);f.advance(1);
  for(const changes of [{expected_revision:1},{month:'2026-12'}])await assert.rejects(()=>f.refresh({},changes),error=>error.status===409&&error.code==='FINANCIAL_AUTOMATION_REQUEST_CONFLICT');
  await f.save(1200);await assert.rejects(()=>f.refresh(),error=>error.status===409&&error.code==='FINANCIAL_AUTOMATION_REQUEST_CONFLICT');
  assert.equal(f.commands.length,1);assert.equal(f.env.FINANCE_DB.db.prepare('SELECT revision FROM finance_financial_obligation_state').get().revision,1);
});

test('an unregistered retry preserves the original capture deadline and cannot renew expired authority',async t=>{
  const f=await fixture(t);let original;
  await assert.rejects(()=>f.refresh({register:async command=>{original=structuredClone(command);throw Error('synthetic request never reached Finance');}}),error=>error.code==='FINANCIAL_OBLIGATION_APP_REGISTRATION_UNAVAILABLE');
  f.advance(300001);const retry=await f.refresh();assert.equal(retry.status,409);assert.equal(retry.body.error,'FINANCIAL_CASH_OBLIGATION_SOURCE_STALE');assert.deepEqual(f.commands[0],original);
  assert.equal(f.env.FINANCE_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);
  assert.equal(f.env.ADMIN_DB.db.prepare("SELECT COUNT(*) n FROM financial_automation_revisions WHERE kind LIKE 'OBLIGATION_REQUEST_%'").get().n,1);
});

test('a registered replay retains the original receipt expiry and does not make an expired registry fresh',async t=>{
  const f=await fixture(t),first=await f.refresh();assert.equal(first.status,200);f.advance(300001);
  const retry=await f.refresh();assert.equal(retry.status,200);assert.equal(retry.body.replayed,true);assert.equal(retry.body.captured_at,first.body.captured_at);assert.equal(retry.body.fresh_until,first.body.fresh_until);
  const workspace=await f.registry.read({schema:'financial_obligation_source_request_v1',operation:'read',month});assert.equal(workspace.state,'STALE');assert.equal(workspace.fresh_until,first.body.fresh_until);
});

test('concurrent identical App requests converge on one immutable capture and one Finance registration',async t=>{
  const f=await fixture(t);f.advance(1000);let captureClock=0;
  const now=()=>Date.parse('2026-11-20T12:00:00.000Z')+(captureClock++);
  const results=await Promise.all([f.refresh({now}),f.refresh({now})]);
  for(const result of results)assert.equal(result.status,200);
  assert.deepEqual(results.map(result=>result.body.replayed).sort(),[false,true]);
  assert.equal(f.commands.length,2);assert.deepEqual(f.commands[0],f.commands[1]);
  assert.equal(f.env.ADMIN_DB.db.prepare("SELECT COUNT(*) n FROM financial_automation_revisions WHERE kind LIKE 'OBLIGATION_REQUEST_%'").get().n,1);
  f.advance(1);const retry=await f.refresh();assert.equal(retry.status,200);assert.equal(retry.body.revision,1);assert.deepEqual(f.commands[2],f.commands[0]);
  assert.equal(f.env.FINANCE_DB.db.prepare('SELECT COUNT(*) n FROM finance_financial_obligation_snapshots').get().n,1);
});
