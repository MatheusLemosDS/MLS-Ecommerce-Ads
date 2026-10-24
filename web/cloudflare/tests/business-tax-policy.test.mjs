import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {TAX_POLICY_DEFAULTS,TAX_POLICY_SCHEMA,BusinessTaxPolicyError,validateBusinessTaxPolicy,readBusinessTaxPolicy,saveBusinessTaxPolicy,readBusinessTaxPolicyAudit,businessMonthTax} from '../src/business-tax-policy.mjs';

const values=changes=>({...TAX_POLICY_DEFAULTS,...changes});
const error=(code,status=400)=>value=>value instanceof BusinessTaxPolicyError&&value.message===code&&value.status===status;
async function fixture(){const env={ADMIN_DB:new D1()};await env.ADMIN_DB.batch(TAX_POLICY_SCHEMA.map(sql=>env.ADMIN_DB.prepare(sql)));return env;}
const count=env=>env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM business_tax_policy_audit').get().n;

test('the confirmed 2026 MEI declaration is seeded once with its own audit and never overwrites later edits',async()=>{
 const env=await fixture();try{
  const state=await readBusinessTaxPolicy(env);assert.equal(state.revision,1);assert.deepEqual(state.values,{regime:'MEI',year:2026,monthly_das_cents:8605});assert.equal(count(env),1);
  assert.equal((await readBusinessTaxPolicyAudit(env)).rows[0].actor,'operator_declared_2026_10_24');
  const saved=await saveBusinessTaxPolicy(env,{revision:1,values:values({monthly_das_cents:9000})},'owner');
  await env.ADMIN_DB.batch(TAX_POLICY_SCHEMA.map(sql=>env.ADMIN_DB.prepare(sql)));assert.deepEqual(await readBusinessTaxPolicy(env),saved);assert.equal(count(env),2);
 }finally{env.ADMIN_DB.db.close();}
});

test('unknown years stay pending and are never assigned the current year amount or a zero tax',async()=>{
 const env=await fixture();try{
  for(const year of [2025,2027]){
   const state=await readBusinessTaxPolicy(env,year);assert.deepEqual(state,{revision:0,values:{regime:'MEI',year,monthly_das_cents:null},updated_at:null});
   assert.deepEqual(businessMonthTax(state,year+'-10'),{schema:'business_month_tax_v1',regime:'MEI',year,policy_revision:0,monthly_das_cents:null,tax_cents:null,status:'PENDING',source:'DAS_REQUIRED',basis:'MONTHLY_COMPETENCE_NO_PRORATION'});
  }
  const mismatched=businessMonthTax(await readBusinessTaxPolicy(env),'2027-01');assert.equal(mismatched.tax_cents,null);assert.equal(mismatched.policy_revision,0);assert.equal(mismatched.source,'DAS_REQUIRED');assert.equal(count(env),1);
 }finally{env.ADMIN_DB.db.close();}
});

test('MEI is one full competence-month expense regardless of the number or value of orders, including an empty month',async()=>{
 const env=await fixture();try{
  const state=await readBusinessTaxPolicy(env);
  for(const month of ['2026-01','2026-10','2026-12']){
   const result=businessMonthTax(state,month);assert.equal(result.tax_cents,8605);assert.equal(result.monthly_das_cents,8605);assert.equal(result.basis,'MONTHLY_COMPETENCE_NO_PRORATION');assert.equal(result.status,'DECLARED');
   for(const orders of [[],[10000],Array(1000).fill(10000)])assert.equal(result.tax_cents,8605,'the monthly expense does not multiply by '+orders.length+' orders');
  }
 }finally{env.ADMIN_DB.db.close();}
});

test('strict values reject percentages, zero or unsafe DAS amounts and return independent copies without invoking getters',()=>{
 const valid=values(),copy=validateBusinessTaxPolicy(valid);copy.monthly_das_cents=9000;assert.equal(valid.monthly_das_cents,8605);
 for(const bad of [null,[],{},values({regime:'SIMPLES'}),values({rate_bps:200}),values({year:'2026'}),values({year:1999}),values({year:10000}),...[-1,0,-0,0.5,1000001,NaN,Infinity,'8605'].map(monthly_das_cents=>values({monthly_das_cents}))])assert.throws(()=>validateBusinessTaxPolicy(bad),error('BUSINESS_TAX_POLICY_INVALID'));
 let calls=0;const poisoned=values();Object.defineProperty(poisoned,'monthly_das_cents',{enumerable:true,get(){calls++;return 8605;}});assert.throws(()=>validateBusinessTaxPolicy(poisoned),BusinessTaxPolicyError);assert.equal(calls,0);
 assert.equal(validateBusinessTaxPolicy(values({monthly_das_cents:null})).monthly_das_cents,null);
});

test('month calculation validates the complete policy envelope and calendar month before exposing a tax',async()=>{
 const env=await fixture();try{
  const state=await readBusinessTaxPolicy(env);
  for(const month of ['',null,'2026-00','2026-13','2026-1','1999-12','2026-10-01'])assert.throws(()=>businessMonthTax(state,month),error('BUSINESS_TAX_POLICY_MONTH_INVALID'));
  for(const bad of [{...state,extra:1},{...state,revision:0},{...state,updated_at:null},{...state,values:values({monthly_das_cents:0})}])assert.throws(()=>businessMonthTax(bad,'2026-10'),error('BUSINESS_TAX_POLICY_STATE_INVALID',503));
 }finally{env.ADMIN_DB.db.close();}
});

test('declaring another year preserves 2026 and its history while versioned edits can revoke a year to pending',async()=>{
 const env=await fixture();try{
  const prior=await readBusinessTaxPolicy(env),saved=await saveBusinessTaxPolicy(env,{revision:0,values:values({year:2027,monthly_das_cents:9100})},'owner');
  assert.equal(saved.revision,1);assert.equal(businessMonthTax(saved,'2027-01').tax_cents,9100);assert.deepEqual(await readBusinessTaxPolicy(env),prior);
  const revoked=await saveBusinessTaxPolicy(env,{revision:1,values:values({year:2027,monthly_das_cents:null})},'owner');assert.equal(revoked.revision,2);assert.equal(businessMonthTax(revoked,'2027-12').tax_cents,null);
  const audit=await readBusinessTaxPolicyAudit(env,2027);assert.equal(audit.rows.length,2);assert.equal(JSON.parse(audit.rows[1].payload).monthly_das_cents,9100);
 }finally{env.ADMIN_DB.db.close();}
});

test('stale writes, malformed revisions and actor errors never mutate tax state or audit',async()=>{
 const env=await fixture();try{
  const before=await readBusinessTaxPolicy(env);
  await assert.rejects(saveBusinessTaxPolicy(env,{revision:0,values:values()},'owner'),error('BUSINESS_TAX_POLICY_CHANGED_RELOAD',409));
  for(const revision of [-0,-1,1.5,'1',2147483647])await assert.rejects(saveBusinessTaxPolicy(env,{revision,values:values()},'owner'),error('BUSINESS_TAX_POLICY_REVISION_REQUIRED'));
  for(const actor of ['',null,'x\ny'])await assert.rejects(saveBusinessTaxPolicy(env,{revision:1,values:values()},actor),error('BUSINESS_TAX_POLICY_ACTOR_INVALID'));
  assert.deepEqual(await readBusinessTaxPolicy(env),before);assert.equal(count(env),1);
 }finally{env.ADMIN_DB.db.close();}
});

test('payload CAS rejects state changes at the same revision instead of overwriting a competing declaration',async()=>{
 const env=await fixture();try{
  const original=env.ADMIN_DB.batch.bind(env.ADMIN_DB),competing=JSON.stringify(values({monthly_das_cents:9900}));
  env.ADMIN_DB.batch=async statements=>{env.ADMIN_DB.db.prepare('UPDATE business_tax_policy_state SET payload=? WHERE year=2026').run(competing);return original(statements);};
  await assert.rejects(saveBusinessTaxPolicy(env,{revision:1,values:values({monthly_das_cents:9000})},'owner'),error('BUSINESS_TAX_POLICY_CHANGED_RELOAD',409));
  assert.equal((await readBusinessTaxPolicy(env)).values.monthly_das_cents,9900);assert.equal(count(env),1);
 }finally{env.ADMIN_DB.db.close();}
});

test('audit collisions roll back the complete policy write and concurrent writers have only one audited winner',async()=>{
 const env=await fixture();try{
  const before=await readBusinessTaxPolicy(env);env.ADMIN_DB.db.prepare('INSERT INTO business_tax_policy_audit VALUES(2026,2,?,?,?)').run(JSON.stringify(values({monthly_das_cents:9500})),'previous',before.updated_at);
  await assert.rejects(saveBusinessTaxPolicy(env,{revision:1,values:values({monthly_das_cents:9000})},'owner'),error('BUSINESS_TAX_POLICY_SAVE_UNAVAILABLE',503));assert.deepEqual(await readBusinessTaxPolicy(env),before);
  env.ADMIN_DB.db.prepare('DELETE FROM business_tax_policy_audit WHERE revision=2').run();
  let pending=Promise.resolve();const actual=env.ADMIN_DB.batch.bind(env.ADMIN_DB);env.ADMIN_DB.batch=statements=>{const task=pending.then(()=>actual(statements));pending=task.catch(()=>{});return task;};
  const outcomes=await Promise.allSettled([saveBusinessTaxPolicy(env,{revision:1,values:values({monthly_das_cents:9000})},'one'),saveBusinessTaxPolicy(env,{revision:1,values:values({monthly_das_cents:9100})},'two')]);
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);assert.equal(outcomes.find(result=>result.status==='rejected').reason.status,409);assert.equal(count(env),2);
  assert.deepEqual(JSON.parse((await readBusinessTaxPolicyAudit(env)).rows[0].payload),(await readBusinessTaxPolicy(env)).values);
 }finally{env.ADMIN_DB.db.close();}
});

test('corrupt, mismatched or deleted policy storage never silently falls back to a fabricated tax',async()=>{
 const env=await fixture();try{
  const original=env.ADMIN_DB.db.prepare('SELECT * FROM business_tax_policy_state WHERE year=2026').get();
  for(const payload of ['broken',JSON.stringify(values({year:2027})),JSON.stringify(values({monthly_das_cents:0}))]){
   env.ADMIN_DB.db.prepare('UPDATE business_tax_policy_state SET payload=? WHERE year=2026').run(payload);await assert.rejects(readBusinessTaxPolicy(env),error('BUSINESS_TAX_POLICY_STATE_INVALID',503));
  }
  env.ADMIN_DB.db.prepare('UPDATE business_tax_policy_state SET payload=? WHERE year=2026').run(original.payload);
  env.ADMIN_DB.db.prepare('DELETE FROM business_tax_policy_state WHERE year=2026').run();await assert.rejects(readBusinessTaxPolicy(env),error('BUSINESS_TAX_POLICY_STATE_INVALID',503));
  await env.ADMIN_DB.batch(TAX_POLICY_SCHEMA.map(sql=>env.ADMIN_DB.prepare(sql)));await assert.rejects(readBusinessTaxPolicy(env),error('BUSINESS_TAX_POLICY_STATE_INVALID',503));assert.equal(count(env),1);
 }finally{env.ADMIN_DB.db.close();}
});
