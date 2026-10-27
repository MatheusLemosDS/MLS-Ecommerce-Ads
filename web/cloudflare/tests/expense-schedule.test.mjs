import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExpenseSchedule,projectExpenseSchedule} from '../src/expense-schedule.mjs';

const month='2026-10',today='2026-10-27';
const item=(id,due,amount,status='OPEN',overrides={})=>({id,category:'BILL',description:'Conta '+id.slice(0,4),amount_cents:amount,competence_month:month,due_date:due,status,paid_date:status==='PAID'?'2026-10-20':null,series_id:id,installment_number:1,installments:1,created_at:'2026-10-01T12:00:00.000Z',updated_at:'2026-10-01T12:00:00.000Z',...overrides});
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];

test('schedule separates overdue, today and next seven days without counting paid or cancelled items',()=>{
 const payload=JSON.stringify([
  item(ids[0],'2026-10-25',10000),
  item(ids[1],today,20000),
  item(ids[2],'2026-10-30',30000),
  item(ids[3],'2026-11-10',40000),
  item(ids[4],'2026-10-20',50000,'PAID')
 ]);
 const value=buildExpenseSchedule({month,today,mode:'CONFIRMED',payload});
 assert.ok(projectExpenseSchedule(value));assert.equal(value.open_count,4);assert.equal(value.open_cents,100000);
 assert.equal(value.overdue_count,1);assert.equal(value.overdue_cents,10000);
 assert.equal(value.due_today_count,1);assert.equal(value.due_today_cents,20000);
 assert.equal(value.due_next_7_days_count,1);assert.equal(value.due_next_7_days_cents,30000);
 assert.equal(value.next_due_date,today);assert.equal(value.next_due_count,1);assert.equal(value.next_due_cents,20000);
 assert.deepEqual(value.upcoming.map(row=>row.due_date),['2026-10-27','2026-10-30','2026-11-10']);
 assert.equal(value.basis,'OWNER_DECLARED_DUE_DATES_NOT_BANK_SETTLEMENT');
});

test('a fully itemized month with no open entries has explicit zero schedule while a non-itemized month stays unknown',()=>{
 const empty=buildExpenseSchedule({month,today,mode:'DRAFT',payload:JSON.stringify([item(ids[0],'2026-10-10',10000,'PAID')])});
 assert.equal(empty.status,'AVAILABLE');assert.equal(empty.open_count,0);assert.equal(empty.open_cents,0);assert.equal(empty.next_due_date,null);assert.deepEqual(empty.upcoming,[]);
 const unknown=buildExpenseSchedule({month,today,mode:null,payload:null});assert.equal(unknown.status,'NOT_ITEMIZED');assert.equal(unknown.open_count,null);assert.equal(unknown.overdue_cents,null);assert.equal(unknown.next_due_date,null);
 assert.ok(projectExpenseSchedule(unknown));
});

test('next due aggregates multiple entries on the same day and upcoming list stays bounded and ordered',()=>{
 const items=Array.from({length:7},(_,index)=>item(crypto.randomUUID(),index<3?'2026-10-28':'2026-10-'+String(29+index).padStart(2,'0'),1000+index));
 const value=buildExpenseSchedule({month,today,mode:'CONFIRMED',payload:JSON.stringify(items)});
 assert.equal(value.next_due_date,'2026-10-28');assert.equal(value.next_due_count,3);assert.equal(value.next_due_cents,3003);assert.equal(value.upcoming.length,5);
 for(let index=1;index<value.upcoming.length;index++)assert.ok(value.upcoming[index-1].due_date<=value.upcoming[index].due_date);
});

test('projection rejects fabricated totals, bank semantics, extra fields and malformed rows',()=>{
 const valid=buildExpenseSchedule({month,today,mode:'CONFIRMED',payload:JSON.stringify([item(ids[0],'2026-10-30',10000)])});
 for(const mutate of [
  value=>value.open_cents++,
  value=>value.overdue_count=1,
  value=>value.bank_paid_cents=0,
  value=>value.basis='BANK_SETTLEMENT',
  value=>value.upcoming[0].amount_cents++,
  value=>value.next_due_cents=9999
 ]){const bad=structuredClone(valid);mutate(bad);assert.equal(projectExpenseSchedule(bad),null);}
 for(const payload of ['{}','not-json',JSON.stringify([{status:'OPEN'}])])assert.throws(()=>buildExpenseSchedule({month,today,mode:'CONFIRMED',payload}),/EXPENSE_SCHEDULE_INVALID/);
});
