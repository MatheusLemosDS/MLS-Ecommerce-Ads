import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFixture} from './business-collection-fixture.mjs';
import {SCHEMA} from '../src/admin.mjs';
import {businessMonth} from '../src/business-month.mjs';
import {readCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {runBusinessSync,readBusinessSyncState,saveBusinessSyncPolicy} from '../src/business-sync.mjs';
import {runBusinessHistorySync} from '../src/business-history-sync.mjs';
import {createFinanceStore} from '../../finance/src/connection-store.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';

const localMonth=at=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(at)).slice(0,7);
async function tokens(f){const store=await createFinanceStore(f.financeEnv,{now:f.now}),prior=await store.readTokens();await store.saveTokens({access_token:'SYNTHETIC_CUTOFF_ACCESS',refresh_token:'SYNTHETIC_CUTOFF_REFRESH',expires_at:Math.floor(f.now()/1000)+14400},{expectedRevision:prior.revision});}
function ads(selection,stamp){
 const children=[];
 for(let day=selection.start_date;day<=selection.end_date;){const start=Date.parse(day+'T00:00:00Z'),end=Math.min(start+14*86400000,Date.parse(selection.end_date+'T00:00:00Z')),range={start_date:day,end_date:new Date(end).toISOString().slice(0,10)},daily=[];for(let at=start;at<=end;at+=86400000)daily.push({date:new Date(at).toISOString().slice(0,10),expense:0,broad_gmv:0,broad_order:0,broad_roas:0,direct_gmv:0,direct_order:0,direct_roas:0});children.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:range,balance:0,daily},range,stamp));day=new Date(end+86400000).toISOString().slice(0,10);}
 return buildAdsCalendar(children,selection,stamp);
}
async function collect(f,month){let frame=await businessMonth(f.env,{operation:'start',month},f.services,{now:f.now});for(let index=0;frame.status==='RUNNING'&&index<12;index++)frame=await businessMonth(f.env,{operation:'step',month},f.services,{now:f.now});assert.equal(frame.status,'COMPLETE');return frame;}
async function fixture(t,{month='2026-10',observedAt=Date.UTC(2026,9,31,12),currentAt=Date.UTC(2026,10,1,12)}={}){
 const f=await collectionFixture({allPaid:true,windowCounts:[0,0],paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});await f.env.ADMIN_DB.batch(SCHEMA.map(sql=>f.env.ADMIN_DB.prepare(sql)));
 f.services.getAdsCalendar=async(_,selection)=>{f.calls.ads.push(selection);return ads(selection,Math.floor(f.now()/1000));};
 f.clock.time=observedAt;await tokens(f);const original=await collect(f,month);assert.equal(original.coverage.orders,0);assert.equal(original.coverage.ongoing,0);f.clock.time=currentAt;await tokens(f);const current=localMonth(currentAt);await collect(f,current);const sync=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(sync.status,'COMPLETE');assert.equal(sync.state.month,current);
 const published=await readCompletedBusinessMonth(f.env,month,{now:f.now});assert.ok(published);assert.equal(published.payload.end_date.slice(0,7),month);f.priorMonth=month;f.currentMonth=current;f.published=published;
 return f;
}
const singleton=f=>f.env.ADMIN_DB.db.prepare('SELECT * FROM business_sync_state WHERE id=1').get();
const history=f=>f.env.ADMIN_DB.db.prepare('SELECT * FROM business_history_sync_state WHERE month=?').get(f.priorMonth)??null;
const run=f=>runBusinessHistorySync(f.env,f.services,{now:f.now,currentStatus:'NOT_DUE'});
const published=f=>readCompletedBusinessMonth(f.env,f.priorMonth,{now:f.now});

// All sources and status totals are real deterministic Finance/App collections.
// No private identities or aggregate reconstruction is used to request repair.
test('a full-date terminal publication with an early final-day cutoff starts one bounded historical repair',async t=>{
 const f=await fixture(t),before=singleton(f),finance=f.calls.finance.length,adsCalls=f.calls.ads.length;assert.equal(f.published.payload.end_date,'2026-10-31');assert.ok(f.published.payload.slots.at(-1).frame.cutoff_at<Date.UTC(2026,10,1,3)/1000-1);
 const result=await run(f);assert.equal(result.status,'RUNNING');assert.equal(result.month,'2026-10');assert.equal(result.finance_steps,1);assert.equal(f.calls.finance.length,finance+1);assert.equal(f.calls.ads.length,adsCalls);assert.deepEqual(singleton(f),before);assert.equal(history(f).last_error,null);assert.equal(history(f).next_run_at,Math.floor(f.now()/1000)+60);assert.deepEqual((await published(f)).publication,f.published.publication,'the last complete publication stays visible during repair');
});

test('a fully closed terminal publication remains idle and makes no source or Ads call',async t=>{
 const f=await fixture(t,{observedAt:Date.UTC(2026,10,1,11),currentAt:Date.UTC(2026,10,1,12)}),before=singleton(f),finance=f.calls.finance.length,adsCalls=f.calls.ads.length;const result=await run(f);assert.equal(result.status,'IDLE');assert.equal(result.finance_steps,0);assert.equal(f.calls.finance.length,finance);assert.equal(f.calls.ads.length,adsCalls);assert.deepEqual(singleton(f),before);assert.equal(history(f),null);
});

test('Brasília DST and December-to-January rollover use the real inclusive final second, not a fixed GMT-3 boundary',async t=>{
 const observedAt=Date.UTC(2019,0,1,1,59,59),currentAt=Date.UTC(2019,0,1,2,0,0),f=await fixture(t,{month:'2018-12',observedAt,currentAt}),finance=f.calls.finance.length;assert.equal(f.currentMonth,'2019-01');assert.equal(f.published.payload.end_date,'2018-12-31');assert.equal(f.published.payload.slots.at(-1).frame.cutoff_at,observedAt/1000);
 const result=await run(f);assert.equal(result.status,'IDLE');assert.equal(result.month,'2018-12');assert.equal(result.finance_steps,0);assert.equal(f.calls.finance.length,finance,'01:59:59 UTC was the actual last second under Brasília summer time');
});

test('an early Brasília summer-time cutoff requests the previous year only and preserves the current month',async t=>{
 const f=await fixture(t,{month:'2018-12',observedAt:Date.UTC(2018,11,31,12),currentAt:Date.UTC(2019,0,1,2)}),before=singleton(f),finance=f.calls.finance.length,result=await run(f);assert.equal(result.status,'RUNNING');assert.equal(result.month,'2018-12');assert.equal(result.finance_steps,1);assert.equal(f.calls.finance.length,finance+1);assert.equal(f.calls.finance.at(-1).start_date,'2018-12-01');assert.deepEqual(singleton(f),before);
});

test('short-cutoff recovery keeps current priority, its due-time budget, active lease and pause gates',async t=>{
 const f=await fixture(t),original=singleton(f),finance=f.calls.finance.length;
 for(const currentStatus of ['RUNNING','COMPLETE','ERROR'])assert.equal((await runBusinessHistorySync(f.env,f.services,{now:f.now,currentStatus})).status,'DEFERRED');
 f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET next_run_at=? WHERE id=1').run(Math.floor(f.now()/1000)+50);assert.equal((await run(f)).status,'DEFERRED');f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET next_run_at=? WHERE id=1').run(original.next_run_at);
 f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET lease_token=?,lease_expires_at=? WHERE id=1').run(crypto.randomUUID(),Math.floor(f.now()/1000)+120);assert.equal((await run(f)).status,'LEASED');f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET lease_token=NULL,lease_expires_at=NULL WHERE id=1').run();
 const state=await readBusinessSyncState(f.env);await saveBusinessSyncPolicy(f.env,{revision:state.revision,enabled:false},'synthetic-owner',{now:f.now});assert.equal((await run(f)).status,'PAUSED');assert.equal(f.calls.finance.length,finance);assert.equal(history(f),null);
});

for(const interruption of ['pause','lease-expiry','year-rollover'])test(`late short-cutoff recovery is fenced by ${interruption} and retains the completed publication`,async t=>{
 const config=interruption==='year-rollover'?{month:'2018-11',observedAt:Date.UTC(2018,10,30,12),currentAt:Date.UTC(2019,0,1,1,59,50)}:{},f=await fixture(t,config),provider=f.services.getFinanceBusinessPeriod,finance=f.calls.finance.length;
 f.services.getFinanceBusinessPeriod=async(...args)=>{const value=await provider(...args);if(interruption==='pause'){const state=await readBusinessSyncState(f.env);await saveBusinessSyncPolicy(f.env,{revision:state.revision,enabled:false},'synthetic-owner',{now:f.now});}else if(interruption==='lease-expiry')f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET lease_expires_at=? WHERE id=1').run(Math.floor(f.now()/1000)-1);else f.clock.time+=20000;return value;};
 const result=await run(f);assert.equal(result.status,interruption==='pause'?'PAUSED':'DEFERRED');assert.equal(result.finance_steps,1);assert.equal(f.calls.finance.length,finance+1);assert.deepEqual((await published(f)).publication,f.published.publication);assert.equal(history(f),null);assert.equal(singleton(f).lease_token,null);assert.equal(singleton(f).month,f.currentMonth);
});
