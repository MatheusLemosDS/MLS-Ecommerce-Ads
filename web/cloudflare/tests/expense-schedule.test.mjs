import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {readExpenseSchedule,projectExpenseSchedule,ExpenseScheduleError} from '../src/expense-schedule.mjs';

const clock=Date.UTC(2026,9,27,15),now=()=>clock,today='2026-10-27';
function item(id,due_date,amount_cents,status='OPEN'){return {id,category:'BILL',description:'fixture',amount_cents,competence_month:due_date.slice(0,7),due_date,status,paid_date:status==='PAID'?due_date:null,series_id:id,installment_number:1,installments:1,created_at:'2026-10-01T00:00:00.000Z',updated_at:'2026-10-01T00:00:00.000Z'};}
function fixture(){
 const db=new D1();db.db.exec("CREATE TABLE business_expense_ledger_months(month TEXT PRIMARY KEY NOT NULL,mode TEXT NOT NULL,unallocated_cents INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL)");
 const insert=(month,unallocated,items)=>db.db.prepare("INSERT INTO business_expense_ledger_months VALUES(?, 'DRAFT', ?, ?, '2026-10-27T12:00:00.000Z')").run(month,unallocated,JSON.stringify(items));
 insert('2026-10',2500,[item('a','2026-10-26',1000),item('b','2026-10-27',2000),item('c','2026-10-29',3000),item('d','2026-11-20',4000),item('e','2026-10-20',9000,'PAID'),item('f','2026-10-18',7000,'CANCELLED')]);
 insert('2026-11',0,[item('g','2026-11-02',5000)]);
 return {ADMIN_DB:db};
}

test('schedule summarizes overdue, today and next seven days from current and next competence with one read-only query',async t=>{
 const env=fixture();t.after(()=>env.ADMIN_DB.db.close());const before=env.ADMIN_DB.db.prepare('SELECT total_changes() AS n').get().n,value=await readExpenseSchedule(env,{now});
 assert.ok(projectExpenseSchedule(value));assert.equal(value.today,today);assert.equal(value.current_month,'2026-10');assert.equal(value.next_month,'2026-11');assert.equal(value.scheduled_months,2);assert.equal(value.has_unallocated_due_dates,true);
 assert.deepEqual(value.open,{count:5,cents:15000});assert.deepEqual(value.overdue,{count:1,cents:1000});assert.deepEqual(value.due_today,{count:1,cents:2000});assert.deepEqual(value.due_next_7_days,{count:2,cents:8000});assert.deepEqual(value.next_due,{date:'2026-10-27',count:1,cents:2000});
 for(let i=0;i<3;i++)assert.deepEqual(await readExpenseSchedule(env,{now}),value);assert.equal(env.ADMIN_DB.db.prepare('SELECT total_changes() AS n').get().n,before);
});

test('empty ledger remains an explicit known empty schedule instead of inventing future bills',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());env.ADMIN_DB.db.exec("CREATE TABLE business_expense_ledger_months(month TEXT PRIMARY KEY NOT NULL,mode TEXT NOT NULL,unallocated_cents INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL)");
 const value=await readExpenseSchedule(env,{now});assert.equal(value.scheduled_months,0);assert.deepEqual(value.open,{count:0,cents:0});assert.deepEqual(value.overdue,{count:0,cents:0});assert.equal(value.next_due,null);assert.equal(value.has_unallocated_due_dates,false);
});

test('unallocated expense money is never assigned a fabricated due date',async t=>{
 const env=fixture();t.after(()=>env.ADMIN_DB.db.close());env.ADMIN_DB.db.prepare("UPDATE business_expense_ledger_months SET payload='[]',unallocated_cents=99999 WHERE month='2026-10'").run();
 const value=await readExpenseSchedule(env,{now});assert.equal(value.has_unallocated_due_dates,true);assert.equal(value.open.cents,5000);assert.equal(value.next_due.date,'2026-11-02');assert.notEqual(value.open.cents,104999);
});

test('malformed storage and unsafe totals fail closed',async t=>{
 for(const mutate of [
  db=>db.prepare("UPDATE business_expense_ledger_months SET payload='{}' WHERE month='2026-10'").run(),
  db=>db.prepare("UPDATE business_expense_ledger_months SET payload=? WHERE month='2026-10'").run(JSON.stringify([{due_date:'2026-02-31',amount_cents:1,status:'OPEN'}])),
  db=>db.prepare("UPDATE business_expense_ledger_months SET payload=? WHERE month='2026-10'").run(JSON.stringify([{due_date:'2026-10-27',amount_cents:Number.MAX_SAFE_INTEGER,status:'OPEN'},{due_date:'2026-10-27',amount_cents:1,status:'OPEN'}]))
 ]){
  const env=fixture();t.after(()=>env.ADMIN_DB.db.close());mutate(env.ADMIN_DB.db);await assert.rejects(readExpenseSchedule(env,{now}),error=>error instanceof ExpenseScheduleError);
 }
});

test('projector rejects forged totals, date scopes and private fields and returns detached groups',async t=>{
 const env=fixture();t.after(()=>env.ADMIN_DB.db.close());const value=await readExpenseSchedule(env,{now}),projected=projectExpenseSchedule(value);assert.deepEqual(projected,value);assert.notEqual(projected,value);assert.notEqual(projected.overdue,value.overdue);
 for(const mutate of [v=>v.private_token='PRIVATE',v=>v.overdue.cents++,v=>v.current_month='2026-09',v=>v.next_due.date='2026-02-31',v=>v.due_next_7_days.count=500]){const bad=structuredClone(value);mutate(bad);assert.equal(projectExpenseSchedule(bad),null);}
});
