import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {runBusinessIncomeOverview} from '../src/business-income-overview.mjs';
import {readBusinessIncomeDetail,runBusinessIncomeDetail,projectBusinessIncomeDetail} from '../src/business-income-detail.mjs';
import {projectIncomeDetailFrame} from '../../finance/src/income-detail-frame.mjs';

const at=Date.UTC(2026,9,27,15),stamp=at/1000;
const overview=pending=>({schema:'finance_income_overview_v1',checked_at:stamp,region:'BRAZIL',shop_type:'LOCAL',currency_basis:'FIXED_BRAZIL_SHOP_PROFILE',pending:{status:'PENDING',raw:String(pending/100),cents:pending},released:{status:'RELEASED',raw:'0',cents:0},to_release:{status:'TO_RELEASE_NOT_APPLICABLE_LOCAL',raw:null,cents:null},basis:'CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH'});
const detail=(count=1)=>({schema:'finance_income_detail_v1',checked_at:stamp,region:'BRAZIL',shop_type:'LOCAL',income_status:'PENDING',page_size:100,returned_count:count,has_more:false,next_cursor_present:false,rows:Array.from({length:count},(_,i)=>({entry_hash:(i?'c':'a').repeat(64),order_hash:(i?'d':'b').repeat(64),currency:'BRL',status:'Pendente',description:'Order Income',payment_method:'PIX',estimated_escrow_raw:'47.51',estimated_escrow_cents:4751,estimated_payout_time:stamp+3600,creation_time:stamp-3600})),basis:'CURRENT_PENDING_PROVIDER_INCOME_DETAIL_NOT_MONTH_OR_BANK_RECEIPT'});
async function fixture(t){const db=new D1();t.after(()=>db.db.close());const env={ADMIN_DB:db},clock={time:at},now=()=>clock.time;return {db,env,clock,now};}

test('Pending detail never calls its source before a current overview proves a nonzero Pending amount',async t=>{
 const f=await fixture(t),calls=[];let work=await runBusinessIncomeDetail(f.env,async()=>{calls.push(1);return detail();},{now:f.now});assert.equal(work.status,'NO_OVERVIEW');assert.equal(work.source_reads,0);assert.equal(calls.length,0);
 await runBusinessIncomeOverview(f.env,async()=>overview(0),{now:f.now});work=await runBusinessIncomeDetail(f.env,async()=>{calls.push(1);return detail();},{now:f.now});assert.equal(work.status,'NO_PENDING');assert.equal(work.source_reads,0);assert.equal(calls.length,0);
});

test('scheduled Pending detail stores one bounded snapshot and owner reads remain local',async t=>{
 const f=await fixture(t),calls=[];await runBusinessIncomeOverview(f.env,async()=>overview(123456),{now:f.now});
 const work=await runBusinessIncomeDetail(f.env,async()=>{calls.push(1);return detail();},{now:f.now});assert.equal(work.status,'CHECKED');assert.equal(work.source_reads,1);assert.equal(calls.length,1);
 const row=f.db.db.prepare('SELECT * FROM business_income_detail WHERE id=1').get(),value=await readBusinessIncomeDetail(f.env,{now:f.now});assert.equal(value.status,'AVAILABLE');assert.equal(value.report.returned_count,1);assert.equal(value.report.rows[0].estimated_escrow_cents,4751);assert.ok(projectBusinessIncomeDetail(value,projectIncomeDetailFrame));assert.doesNotMatch(JSON.stringify(value),/order_sn|PRIVATE/);
 await readBusinessIncomeDetail(f.env,{now:f.now});assert.deepEqual(f.db.db.prepare('SELECT * FROM business_income_detail WHERE id=1').get(),row);
 assert.equal((await runBusinessIncomeDetail(f.env,async()=>{throw Error('not due');},{now:f.now})).source_reads,0);
});

test('failed Pending detail refresh preserves last good rows and original checked time',async t=>{
 const f=await fixture(t);await runBusinessIncomeOverview(f.env,async()=>overview(10000),{now:f.now});await runBusinessIncomeDetail(f.env,async()=>detail(),{now:f.now});f.clock.time+=901000;
 const result=await runBusinessIncomeDetail(f.env,async()=>({schema:'finance_income_detail_unavailable_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_INCOME_DETAIL_TIMEOUT',http:null},message:'PRIVATE_PROVIDER_TOKEN'}),{now:f.now});assert.equal(result.status,'UNAVAILABLE');
 const value=await readBusinessIncomeDetail(f.env,{now:f.now});assert.equal(value.status,'PARTIAL_UNAVAILABLE');assert.equal(value.report.checked_at,stamp);assert.equal(value.report.rows.length,1);assert.equal(value.attempt.code,'FINANCE_INCOME_DETAIL_TIMEOUT');assert.doesNotMatch(JSON.stringify(value),/PRIVATE_PROVIDER_TOKEN/);
});

test('sub-cent or paginated Pending detail remains descriptive instead of becoming a complete receivable total',async t=>{
 const f=await fixture(t);await runBusinessIncomeOverview(f.env,async()=>overview(10000),{now:f.now});const source=detail();source.has_more=true;source.next_cursor_present=true;source.rows[0].estimated_escrow_raw='10.123';source.rows[0].estimated_escrow_cents=null;assert.ok(projectIncomeDetailFrame(source));
 await runBusinessIncomeDetail(f.env,async()=>source,{now:f.now});const value=await readBusinessIncomeDetail(f.env,{now:f.now});assert.equal(value.report.has_more,true);assert.equal(value.report.rows[0].estimated_escrow_cents,null);assert.equal(Object.hasOwn(value.report,'remaining_receivable_cents'),false);
});
