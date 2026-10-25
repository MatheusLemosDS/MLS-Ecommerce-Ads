import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {businessMonth,projectBusinessMonth} from '../src/business-month.mjs';
import {projectAdsCalendar} from '../src/ads-calendar.mjs';
import {runBusinessSync,readBusinessSyncState} from '../src/business-sync.mjs';
import {collectionFixture as fixture} from './business-collection-fixture.mjs';

async function diagnosticFixture(code,t){
 const f=await fixture();t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 const read=f.services.getFinanceBusinessPeriod;
 f.services.getFinanceBusinessPeriod=async(...args)=>({...await read(...args),diagnostic:code});
 return f;
}

test('busy leases and bounded checkpoints are resumable progress, not unavailable financial sources',async t=>{
 for(const [code,delay] of [['BUSINESS_PERIOD_CONFLICT',2],['BUSINESS_PERIOD_BUSY',2],['BUSINESS_PERIOD_CHECKPOINT',1]])await t.test(code,async t=>{
  const f=await diagnosticFixture(code,t),frame=await businessMonth(f.env,{operation:'start',month:'2026-10'},f.services,{now:f.now});
  assert.deepEqual(frame.collection,{schema:'business_month_collection_v1',state:'RETRY_WAIT',code,retry_after_seconds:delay});
  assert.ok(!frame.result.pending.includes('SOURCE_UNAVAILABLE'));assert.equal(frame.result.net_estimate_cents,null);assert.ok(projectBusinessMonth(frame));
  const count=f.calls.finance.length,read=await f.invoke('read');assert.deepEqual(read.collection,frame.collection);assert.equal(f.calls.finance.length,count);
  const result=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(result.status,'RUNNING');assert.equal(result.finance_steps,1);assert.equal(result.state.failure_count,0);assert.equal(result.state.last_error,null);
  assert.deepEqual(result.state.summary.collection,frame.collection);assert.deepEqual((await readBusinessSyncState(f.env)).summary.collection,frame.collection);
 });
});

test('temporary failures retain their precise safe retry code and permanent source failures block automatic advancement',async t=>{
 const cases=[['RATE_LIMIT','RETRY_WAIT',30,'RATE_LIMIT'],['TIMEOUT','RETRY_WAIT',5,'TIMEOUT'],['UPSTREAM_UNAVAILABLE','RETRY_WAIT',10,null],['AUTH_REQUIRED','BLOCKED',0,'AUTH_REQUIRED'],['INVALID_SOURCE','BLOCKED',0,'INVALID']];
 for(const [suffix,state,delay,errorSuffix] of cases)await t.test(suffix,async t=>{
  const code='BUSINESS_PERIOD_'+suffix,f=await diagnosticFixture(code,t),result=await runBusinessSync(f.env,f.services,{now:f.now}),frame=await f.invoke('read');
  assert.deepEqual(frame.collection,{schema:'business_month_collection_v1',state,code,retry_after_seconds:delay});assert.ok(frame.result.pending.includes('SOURCE_UNAVAILABLE'));
  assert.equal(result.status,'ERROR');assert.equal(result.finance_steps,1);assert.equal(result.state.last_error,errorSuffix?'BUSINESS_SYNC_SOURCE_'+errorSuffix:'BUSINESS_SYNC_COLLECTION_UNAVAILABLE');assert.equal(result.state.summary.net_estimate_cents,null);
  assert.deepEqual((await readBusinessSyncState(f.env)).summary.collection,frame.collection);
 });
});

test('the browser projector accepts legacy frames and rejects forged collection states without invoking getters',async t=>{
 const f=await diagnosticFixture('BUSINESS_PERIOD_CONFLICT',t),frame=await f.invoke('start'),legacy=structuredClone(frame);delete legacy.collection;assert.ok(projectBusinessMonth(legacy));
 for(const changes of [{state:'READY'},{state:'BLOCKED'},{code:'PRIVATE_TOKEN'},{retry_after_seconds:0},{retry_after_seconds:1801},{retry_after_seconds:'2'},{extra:true}])assert.equal(projectBusinessMonth({...frame,collection:{...frame.collection,...changes}}),null);
 let calls=0;const collection={...frame.collection};Object.defineProperty(collection,'code',{enumerable:true,get(){calls++;return frame.collection.code;}});assert.equal(projectBusinessMonth({...frame,collection}),null);assert.equal(calls,0);
 const context=vm.createContext({Intl,serialized:JSON.stringify(frame)});new vm.Script(projectAdsCalendar.toString()+'\n'+projectBusinessMonth.toString()+'\nglobalThis.result=projectBusinessMonth(JSON.parse(serialized));').runInContext(context);
 assert.deepEqual(JSON.parse(JSON.stringify(context.result)),frame);
});
