import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFixture} from './business-collection-fixture.mjs';
import {readBusinessMonthDisplay} from '../src/business-month.mjs';
import {mutateExpenseLedger} from '../src/expense-ledger.mjs';
import {buildBusinessMonthView,projectBusinessMonthView,projectBusinessMonthAuditScope} from '../src/business-month-view-state.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {projectDailyBusinessSummary} from '../src/business-daily-summary.mjs';
import {projectExpenseSchedule} from '../src/expense-schedule.mjs';

const selected='2026-10';
const addDay=(day,count)=>new Date(Date.parse(day+'T12:00:00Z')+count*86400000).toISOString().slice(0,10);
const request=(month,revision,entry)=>({action:'save',month,revision,request_id:crypto.randomUUID(),entry,installments:1});

test('published monthly view v4 derives expense deadlines from the ledger row already joined by the monthly read',async t=>{
 const f=await collectionFixture({allPaid:true,windowCounts:[1,0],daily:true,paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 let frame=await f.invoke('start');for(let i=0;frame.status==='RUNNING'&&i<12;i++)frame=await f.invoke('step');assert.equal(frame.status,'COMPLETE');await f.invoke('ads');
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(f.now())),overdue=addDay(today,-1),soon=addDay(today,2);
 let ledger=await mutateExpenseLedger(f.env,request(selected,0,{id:null,category:'BILL',description:'Energia',amount_cents:12000,competence_month:selected,due_date:overdue,status:'OPEN',paid_date:null}),'owner',{now:f.now});
 ledger=await mutateExpenseLedger(f.env,request(selected,ledger.revision,{id:null,category:'RENT',description:'Aluguel',amount_cents:20000,competence_month:selected,due_date:soon,status:'OPEN',paid_date:null}),'owner',{now:f.now});
 const providerBefore={finance:f.calls.finance.length,ads:f.calls.ads.length,list:f.calls.list.length,detail:f.calls.detail.length,payment:f.calls.payment.length};
 const observed=await readBusinessMonthDisplay(f.env,{month:selected},{now:f.now});assert.ok(observed.expense_schedule);assert.equal(observed.expense_schedule.overdue_count,1);assert.equal(observed.expense_schedule.overdue_cents,12000);assert.equal(observed.expense_schedule.due_next_7_days_count,1);assert.equal(observed.expense_schedule.due_next_7_days_cents,20000);assert.equal(observed.expense_schedule.next_due_date,soon);
 const sync={enabled:true,status:'COMPLETE',next_run_at:0,last_attempt_at:Math.floor(f.now()/1000)};
 const view=buildBusinessMonthView(observed,sync,{now:f.now,contract:'business-month-view-v4'});assert.equal(view.schema,'business_month_view_v4');assert.ok(projectBusinessMonthView(view,projectBusinessMonth,projectBusinessMonthAuditScope,projectDailyBusinessSummary,projectExpenseSchedule));assert.deepEqual(view.expense_schedule,observed.expense_schedule);
 assert.deepEqual({finance:f.calls.finance.length,ads:f.calls.ads.length,list:f.calls.list.length,detail:f.calls.detail.length,payment:f.calls.payment.length},providerBefore,'owner view does not recollect Shopee to compute deadlines');
 assert.equal(view.display.result.net_profit_cents,null);assert.doesNotMatch(JSON.stringify(view),/bank_received|bank_paid|payment_proof/i);
});

test('a month without itemized ledger preserves unknown deadline values instead of fabricating zero',async t=>{
 const f=await collectionFixture({allPaid:true,windowCounts:[1,0],daily:true,paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 let frame=await f.invoke('start');for(let i=0;frame.status==='RUNNING'&&i<12;i++)frame=await f.invoke('step');assert.equal(frame.status,'COMPLETE');await f.invoke('ads');
 const observed=await readBusinessMonthDisplay(f.env,{month:selected},{now:f.now});assert.ok(observed.expense_schedule);assert.equal(observed.expense_schedule.status,'NOT_ITEMIZED');assert.equal(observed.expense_schedule.open_cents,null);assert.equal(observed.expense_schedule.overdue_cents,null);
});
