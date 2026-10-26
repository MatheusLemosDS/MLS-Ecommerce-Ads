import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {BUSINESS_MONTH_SCHEMA,businessMonth,projectBusinessMonth} from '../src/business-month.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {readExpenseLedger,mutateExpenseLedger,projectExpenseLedger,ExpenseLedgerError} from '../src/expense-ledger.mjs';

const clock=Date.UTC(2026,9,26,12),now=()=>clock,month='2026-10',stamp=new Date(clock).toISOString();
class TrackingD1 extends D1{
 constructor(){super();this.beforeMutation=null;this.failMutation=false;this.statements=[];}
 prepare(sql){const statement=super.prepare(sql);statement.sql=sql;this.statements.push(sql);return statement;}
 async batch(statements){
  const mutation=statements[0]?.sql?.startsWith('INSERT OR IGNORE INTO business_expense_ledger_state')||statements[0]?.sql?.startsWith('UPDATE business_expense_ledger_state');
  if(mutation&&this.beforeMutation){const before=this.beforeMutation;this.beforeMutation=null;await before();}
  if(mutation&&this.failMutation){this.failMutation=false;return super.batch([...statements.slice(0,-1),{async run(){throw Error('SIMULATED_AUDIT_FAILURE');}}]);}
  return super.batch(statements);
 }
}
function fixture(){
 const db=new TrackingD1();for(const sql of BUSINESS_MONTH_SCHEMA)db.db.exec(sql);
 db.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)');
 db.db.prepare('INSERT INTO variant_bindings_state VALUES(1,1,?,?)').run('[]',stamp);db.db.prepare('INSERT INTO production_costs_state VALUES(1,1,?,?)').run(JSON.stringify(COST_DEFAULTS),stamp);
 return {ADMIN_DB:db};
}
const read=(env,selected=month)=>readExpenseLedger(env,{month:selected},{now});
const operate=(env,input)=>mutateExpenseLedger(env,input,'owner',{now});
const entry=(overrides={})=>({id:null,category:'RENT',description:'Aluguel do barracão',amount_cents:150000,competence_month:month,due_date:month+'-10',status:'OPEN',paid_date:null,...overrides});
const save=(revision=0,extra={})=>({action:'save',month,revision,request_id:crypto.randomUUID(),entry:entry(),installments:1,...extra});
const confirm=(frame,extra={})=>({action:'confirm',month:frame.month,revision:frame.revision,request_id:crypto.randomUUID(),unallocated_cents:frame.unallocated_cents,expenses_revision:frame.expenses_revision,recharge_treatment:frame.recharge_treatment,...extra});
const records=env=>Object.fromEntries(['business_expense_ledger_state','business_expense_ledger_months','business_expense_ledger_audit','business_month_expenses','business_month_expenses_audit'].map(name=>[name,env.ADMIN_DB.db.prepare('SELECT * FROM '+name).all()]));
const changes=env=>env.ADMIN_DB.db.prepare('SELECT total_changes() AS count').get().count;
const error=code=>value=>value instanceof ExpenseLedgerError&&value.message===code;
async function manual(env,cents=10000){return businessMonth(env,{operation:'expenses',month,revision:0,external_expenses_cents:cents,recharge_treatment:'ADS_RECHARGE'},{},{now,actor:'owner'});}

test('reading current and future months creates no expense declaration, ledger, entries or audit and repeated reads do not write',async()=>{
 const env=fixture(),before=changes(env);
 for(const selection of [month,'2027-12',month]){const frame=await read(env,selection);assert.ok(projectExpenseLedger(frame));assert.equal(frame.mode,'MANUAL');assert.equal(frame.expenses_revision,0);assert.equal(frame.current_external_expenses_cents,null);assert.equal(frame.items.length,0);assert.equal(frame.total_cents,0);}
 assert.equal(changes(env),before);assert.deepEqual(records(env),Object.fromEntries(Object.keys(records(env)).map(key=>[key,[]])));
});

test('itemizing an old declaration preserves its row and audit, blocks the result, and confirms the replacement without double counting',async()=>{
 const env=fixture(),legacy=await manual(env),before=records(env);assert.equal(legacy.expenses.external_expenses_cents,10000);
 let frame=await operate(env,save(0,{entry:entry({category:'BILL',description:'Boleto A',amount_cents:3000})}));
 assert.equal(frame.mode,'DRAFT');assert.equal(frame.unallocated_cents,10000);assert.equal(frame.items_total_cents,3000);assert.equal(frame.current_external_expenses_cents,10000);assert.equal(frame.recharge_treatment,'ADS_RECHARGE');assert.deepEqual(records(env).business_month_expenses,before.business_month_expenses);
 const pending=await businessMonth(env,{operation:'read',month},{},{now});assert.ok(projectBusinessMonth(pending));assert.equal(pending.expenses.revision,1);assert.equal(pending.expenses.external_expenses_cents,10000);assert.ok(pending.result.pending.includes('EXTERNAL_EXPENSES_REQUIRED'));assert.equal(pending.result.net_estimate_cents,null);
 frame=await operate(env,save(frame.revision,{entry:entry({category:'EMPLOYEES',description:'Funcionário',amount_cents:7000})}));
 frame=await operate(env,confirm(frame,{unallocated_cents:0}));assert.equal(frame.mode,'CONFIRMED');assert.equal(frame.total_cents,10000);assert.equal(frame.current_external_expenses_cents,10000);assert.equal(frame.expenses_revision,1,'same confirmed amount does not rewrite the old aggregate');assert.equal(frame.recharge_treatment,'ADS_RECHARGE');
 const final=await businessMonth(env,{operation:'read',month},{},{now});assert.ok(!final.result.pending.includes('EXTERNAL_EXPENSES_REQUIRED'));assert.equal(final.expenses.external_expenses_cents,10000);assert.deepEqual(records(env).business_month_expenses_audit,before.business_month_expenses_audit);
});

test('adding rent to the old unitemized total replaces the aggregate once and preserves recharge treatment',async()=>{
 const env=fixture();await manual(env,10000);let frame=await operate(env,save(0,{entry:entry({amount_cents:5000})}));frame=await operate(env,confirm(frame));
 assert.equal(frame.total_cents,15000);assert.equal(frame.current_external_expenses_cents,15000);assert.equal(frame.expenses_revision,2);assert.equal(frame.recharge_treatment,'ADS_RECHARGE');
 const audit=records(env).business_month_expenses_audit;assert.deepEqual(audit.map(row=>row.external_expenses_cents),[10000,15000]);
});

test('new declarations and explicit zero remain pending until confirmed, including future competence months',async()=>{
 const env=fixture();let frame=await read(env,'2027-01');frame=await operate(env,confirm(frame));assert.equal(frame.mode,'CONFIRMED');assert.equal(frame.current_external_expenses_cents,0);assert.equal(frame.expenses_revision,1);
 frame=await operate(env,save(1));assert.equal(frame.mode,'DRAFT');assert.equal(frame.current_external_expenses_cents,null);assert.equal(frame.expenses_revision,0);assert.equal(frame.total_cents,150000);
 frame=await operate(env,confirm(frame));assert.equal(frame.current_external_expenses_cents,150000);assert.equal(frame.expenses_revision,1);
});

test('installments use the amount per installment, original day anchor and independent confirmation; paid only applies to the first',async()=>{
 const env=fixture(),input=save(0,{month:'2026-01',entry:entry({category:'BILL',competence_month:'2026-01',due_date:'2026-01-31',amount_cents:12345,status:'PAID',paid_date:'2026-01-31'}),installments:3});
 let frame=await operate(env,input);const first=frame.items[0];assert.equal(frame.items_total_cents,12345);assert.equal(frame.paid_cents,12345);assert.equal(frame.open_cents,0);assert.equal(frame.mode,'DRAFT');
 const feb=await read(env,'2026-02'),mar=await read(env,'2026-03');assert.equal(feb.items[0].due_date,'2026-02-28');assert.equal(mar.items[0].due_date,'2026-03-31');
 for(const [index,item] of [first,feb.items[0],mar.items[0]].entries()){assert.equal(item.series_id,first.series_id);assert.equal(item.installment_number,index+1);assert.equal(item.installments,3);assert.equal(item.amount_cents,12345);}
 assert.equal(feb.items[0].status,'OPEN');assert.equal(feb.items[0].paid_date,null);assert.equal(feb.current_external_expenses_cents,null);assert.equal(feb.overdue_cents,12345);
 frame=await operate(env,confirm(frame));assert.equal(frame.current_external_expenses_cents,12345);assert.equal((await read(env,'2026-02')).mode,'DRAFT');assert.equal((await read(env,'2026-03')).current_external_expenses_cents,null);
});

test('120 finite installments are materialized only on the write and repeated reads do not generate rows',async()=>{
 const env=fixture();const frame=await operate(env,save(0,{installments:120}));assert.equal(frame.items[0].installments,120);const last=await read(env,'2036-09');assert.equal(last.items[0].installment_number,120);const before=changes(env);
 for(let i=0;i<4;i++)await read(env,'2036-09');assert.equal(changes(env),before);assert.equal(records(env).business_expense_ledger_months.length,120);
});

test('editing and cancelling an adopted expense updates its month atomically; paid status never deducts twice',async()=>{
 const env=fixture();let frame=await operate(env,save());frame=await operate(env,confirm(frame));const item=frame.items[0],initialRevision=frame.expenses_revision;
 frame=await operate(env,save(frame.revision,{entry:entry({id:item.id,status:'PAID',paid_date:month+'-12'})}));assert.equal(frame.total_cents,150000);assert.equal(frame.expenses_revision,initialRevision);assert.equal(frame.paid_cents,150000);assert.equal(frame.overdue_cents,0);
 frame=await operate(env,save(frame.revision,{entry:entry({id:item.id,amount_cents:170000,status:'PAID',paid_date:month+'-12'})}));assert.equal(frame.current_external_expenses_cents,170000);assert.equal(frame.expenses_revision,initialRevision+1);
 frame=await operate(env,{action:'cancel',month,revision:frame.revision,request_id:crypto.randomUUID(),id:item.id});assert.equal(frame.mode,'CONFIRMED');assert.equal(frame.current_external_expenses_cents,0);assert.equal(frame.items.length,1);assert.equal(frame.items[0].status,'CANCELLED');assert.equal(frame.items[0].paid_date,month+'-12');assert.equal(frame.paid_cents,0);
 assert.deepEqual(records(env).business_month_expenses_audit.map(row=>row.external_expenses_cents),[150000,170000,0]);
});

test('exact retries after a lost response are idempotent even after another revision, while request ID reuse with a different payload conflicts',async()=>{
 const env=fixture(),input=save(0,{installments:3});let frame=await operate(env,input),before=records(env);assert.deepEqual(await operate(env,input),frame);assert.deepEqual(records(env),before);
 await operate(env,confirm(frame));before=records(env);frame=await operate(env,input);assert.equal(frame.items.length,1);assert.equal(frame.mode,'CONFIRMED');assert.deepEqual(records(env),before);
 await assert.rejects(operate(env,{...input,entry:entry({amount_cents:1})}),error('EXPENSE_LEDGER_CONFLICT'));assert.deepEqual(records(env),before);
});

test('simultaneous identical request IDs return the winning series without rewriting its IDs or failing the unique audit',async()=>{
 const env=fixture(),input=save(0,{installments:3});let winner;
 env.ADMIN_DB.beforeMutation=async()=>{winner=await operate(env,input);};
 const result=await operate(env,input);assert.deepEqual(result,winner);assert.equal(records(env).business_expense_ledger_audit.length,1);assert.equal(records(env).business_expense_ledger_months.length,3);assert.equal(records(env).business_expense_ledger_state[0].revision,1);
});

test('identical edit, repeated confirmation and repeated cancellation do not create redundant writes',async()=>{
 const env=fixture();let frame=await operate(env,save());frame=await operate(env,confirm(frame));let before=changes(env);
 frame=await operate(env,save(frame.revision,{entry:entry({id:frame.items[0].id})}));assert.equal(changes(env),before);
 frame=await operate(env,confirm(frame));assert.equal(changes(env),before);
 frame=await operate(env,{action:'cancel',month,revision:frame.revision,request_id:crypto.randomUUID(),id:frame.items[0].id});before=changes(env);
 await operate(env,{action:'cancel',month,revision:frame.revision,request_id:crypto.randomUUID(),id:frame.items[0].id});assert.equal(changes(env),before);
});

test('a stale tab cannot change another expense or confirmation and never partially creates a series',async()=>{
 const env=fixture(),frame=await operate(env,save()),before=records(env);
 await assert.rejects(operate(env,save(0,{installments:12})),error('EXPENSE_LEDGER_CONFLICT'));await assert.rejects(operate(env,confirm({...frame,expenses_revision:2})),error('EXPENSE_LEDGER_CONFLICT'));assert.deepEqual(records(env),before);
});

test('a competing write to another installment month wins atomically and no part of the stale series is saved',async()=>{
 const env=fixture();let winner;
 env.ADMIN_DB.beforeMutation=async()=>{winner=await operate(env,save(0,{month:'2026-11',entry:entry({competence_month:'2026-11'})}));};
 await assert.rejects(operate(env,save(0,{installments:3})),error('EXPENSE_LEDGER_CONFLICT'));assert.equal((await read(env)).items.length,0);assert.equal((await read(env,'2026-11')).items.length,1);assert.equal((await read(env,'2026-12')).items.length,0);assert.equal((await read(env,'2026-11')).items[0].id,winner.items[0].id);
});

test('a manual declaration racing first migration cannot be silently overwritten; old tabs cannot replace draft or confirmed ledgers',async()=>{
 const env=fixture();env.ADMIN_DB.beforeMutation=async()=>{await manual(env,9000);};await assert.rejects(operate(env,save()),error('EXPENSE_LEDGER_CONFLICT'));
 let frame=await read(env);assert.equal(frame.mode,'MANUAL');assert.equal(frame.current_external_expenses_cents,9000);frame=await operate(env,save(frame.revision));
 const manualBody={operation:'expenses',month,revision:1,external_expenses_cents:1,recharge_treatment:'TECH_SUPPORT'};
 for(let i=0;i<2;i++){const before=records(env);await assert.rejects(businessMonth(env,manualBody,{},{now}),e=>e.message==='BUSINESS_MONTH_EXPENSES_MANAGED');assert.deepEqual(records(env),before);if(i===0)frame=await operate(env,confirm(frame));}
});

test('failure at the final audit rolls back series, state, monthly aggregate and history together',async()=>{
 const env=fixture();let frame=await operate(env,save());frame=await operate(env,confirm(frame));const before=records(env);env.ADMIN_DB.failMutation=true;
 await assert.rejects(operate(env,save(frame.revision,{entry:entry({amount_cents:123}),installments:4})),error('EXPENSE_LEDGER_UNAVAILABLE'));assert.deepEqual(records(env),before);
});

test('invalid inputs, excess precision, unsafe totals and stale identities cannot produce partial declarations',async()=>{
 const env=fixture(),invalid=[null,[],{}, {...save(),extra:true},save(0,{revision:-0}),save(0,{request_id:'arbitrary'}),save(0,{entry:entry({amount_cents:12.34})}),save(0,{entry:entry({amount_cents:-1})}),save(0,{entry:entry({amount_cents:Number.MAX_SAFE_INTEGER+1})}),save(0,{entry:entry({description:'  aluguel '})}),save(0,{entry:entry({description:'bad\nvalue'})}),save(0,{entry:entry({due_date:'2026-02-31'})}),save(0,{entry:entry({status:'PAID',paid_date:null})}),save(0,{entry:entry({status:'PAID',paid_date:'2027-01-01'})}),save(0,{entry:entry({status:'OPEN',paid_date:month+'-12'})}),save(0,{installments:121}),save(0,{month:'2099-12',entry:entry({competence_month:'2099-12',due_date:'2099-12-01'}),installments:2})];
 for(const value of invalid){const before=records(env);await assert.rejects(operate(env,value),error('EXPENSE_LEDGER_REQUEST_INVALID'));assert.deepEqual(records(env),before);}
 let frame=await operate(env,save(0,{entry:entry({amount_cents:Number.MAX_SAFE_INTEGER})}));const before=records(env);await assert.rejects(operate(env,save(frame.revision,{entry:entry({amount_cents:1})})),error('EXPENSE_LEDGER_AMOUNT_INVALID'));assert.deepEqual(records(env),before);
 await assert.rejects(operate(env,save(frame.revision,{entry:entry({id:crypto.randomUUID()})})),error('EXPENSE_LEDGER_ITEM_NOT_FOUND'));assert.deepEqual(records(env),before);
});

test('the browser projector rejects leaked fields, wrong amounts, reused identities and altered confirmation',async()=>{
 const env=fixture(),frame=await operate(env,save());assert.deepEqual(projectExpenseLedger(frame),frame);
 for(const change of [v=>v.private_token='PRIVATE',v=>v.items[0].private_token='PRIVATE',v=>v.total_cents++,v=>v.open_cents++,v=>v.items.push({...v.items[0]}),v=>v.mode='CONFIRMED',v=>v.items[0].paid_date=month+'-01',v=>v.items[0].description='bad\nvalue']){const poisoned=structuredClone(frame);change(poisoned);assert.equal(projectExpenseLedger(poisoned),null);}
});

test('per-month and global entry limits reject an entire creation without losing existing entries',async()=>{
 for(const globalLimit of [false,true]){
  const env=fixture();await operate(env,save());const stored=records(env).business_expense_ledger_months[0],original=JSON.parse(stored.payload)[0],months=globalLimit?Array.from({length:10},(_,index)=>'2026-'+String(index+1).padStart(2,'0')):[month];
  for(const selected of months){const items=Array.from({length:200},()=>({...original,id:crypto.randomUUID(),series_id:crypto.randomUUID(),competence_month:selected}));env.ADMIN_DB.db.prepare('INSERT INTO business_expense_ledger_months(month,mode,unallocated_cents,payload,updated_at) VALUES(?,\'DRAFT\',0,?,?) ON CONFLICT(month) DO UPDATE SET payload=excluded.payload').run(selected,JSON.stringify(items),stamp);}
  const selected=globalLimit?'2026-11':month,before=records(env);await assert.rejects(operate(env,save(1,{month:selected,entry:entry({competence_month:selected})})),error('EXPENSE_LEDGER_LIMIT'));assert.deepEqual(records(env),before);
 }
});
