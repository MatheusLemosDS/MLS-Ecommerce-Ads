import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {BUSINESS_INCOME_OVERVIEW_SCHEMA,readBusinessIncomeOverview,runBusinessIncomeOverview,projectBusinessIncomeOverview} from '../src/business-income-overview.mjs';
import {projectIncomeOverviewFrame} from '../../finance/src/income-overview-frame.mjs';

const at=Date.UTC(2026,9,27,15),stamp=at/1000;
const frame=(pending=123456)=>({schema:'finance_income_overview_v1',checked_at:stamp,region:'BRAZIL',shop_type:'LOCAL',currency_basis:'FIXED_BRAZIL_SHOP_PROFILE',pending:{status:'PENDING',raw:String(pending/100),cents:pending},released:{status:'RELEASED',raw:'7890.12',cents:789012},to_release:{status:'TO_RELEASE_NOT_APPLICABLE_LOCAL',raw:null,cents:null},basis:'CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH'});
async function fixture(t){const db=new D1();t.after(()=>db.db.close());const env={ADMIN_DB:db},clock={time:at},now=()=>clock.time;await db.batch(BUSINESS_INCOME_OVERVIEW_SCHEMA.map(sql=>db.prepare(sql)));return {db,env,clock,now};}

test('owner read is local and missing cache stays pending without provider work',async t=>{
 const f=await fixture(t),before=f.db.db.prepare('SELECT COUNT(*) AS n FROM business_income_overview').get().n,value=await readBusinessIncomeOverview(f.env,{now:f.now});assert.equal(value.status,'PENDING');assert.equal(value.report,null);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM business_income_overview').get().n,before);
});

test('scheduled source stores one current snapshot and owner reads never rewrite it',async t=>{
 const f=await fixture(t),calls=[];const work=await runBusinessIncomeOverview(f.env,async()=>{calls.push(1);return frame();},{now:f.now});assert.equal(work.status,'CHECKED');assert.equal(work.source_reads,1);assert.equal(calls.length,1);
 const row=f.db.db.prepare('SELECT * FROM business_income_overview WHERE id=1').get(),first=await readBusinessIncomeOverview(f.env,{now:f.now});assert.equal(first.status,'AVAILABLE');assert.equal(first.report.pending.cents,123456);assert.equal(first.attempt.next_attempt_at,stamp+900);assert.ok(projectBusinessIncomeOverview(first,projectIncomeOverviewFrame));
 await readBusinessIncomeOverview(f.env,{now:f.now});assert.deepEqual(f.db.db.prepare('SELECT * FROM business_income_overview WHERE id=1').get(),row);
 assert.equal((await runBusinessIncomeOverview(f.env,async()=>{throw Error('not due');},{now:f.now})).source_reads,0);
});

test('failed refresh preserves last good provider time and retries later without exposing private errors',async t=>{
 const f=await fixture(t);await runBusinessIncomeOverview(f.env,async()=>frame(),{now:f.now});f.clock.time+=901000;const result=await runBusinessIncomeOverview(f.env,async()=>({schema:'finance_income_overview_unavailable_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_INCOME_OVERVIEW_TIMEOUT',http:null},message:'PRIVATE_PROVIDER_TOKEN'}),{now:f.now});assert.equal(result.status,'UNAVAILABLE');
 const value=await readBusinessIncomeOverview(f.env,{now:f.now});assert.equal(value.status,'PARTIAL_UNAVAILABLE');assert.equal(value.report.checked_at,stamp);assert.equal(value.report.pending.cents,123456);assert.equal(value.attempt.code,'FINANCE_INCOME_OVERVIEW_TIMEOUT');assert.doesNotMatch(JSON.stringify(value),/PRIVATE_PROVIDER_TOKEN/);
});

test('lease and pause gates prevent duplicate current-income reads',async t=>{
 const f=await fixture(t),state={enabled:false},canRun=async()=>state.enabled,calls=[];assert.equal((await runBusinessIncomeOverview(f.env,async()=>{calls.push(1);return frame();},{now:f.now,canRun})).status,'PAUSED');assert.equal(calls.length,0);state.enabled=true;
 let release,entered;const wait=new Promise(resolve=>entered=resolve),hold=new Promise(resolve=>release=resolve),pending=runBusinessIncomeOverview(f.env,async()=>{calls.push(1);entered();await hold;return frame();},{now:f.now,canRun});await wait;assert.equal((await runBusinessIncomeOverview(f.env,async()=>frame(),{now:f.now,canRun})).status,'LEASED');release();assert.equal((await pending).status,'CHECKED');assert.equal(calls.length,1);
});
