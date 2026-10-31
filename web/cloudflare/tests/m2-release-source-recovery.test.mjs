import test from 'node:test';
import assert from 'node:assert/strict';
import {saveBusinessSyncPolicy,readBusinessSyncState} from '../src/business-sync.mjs';
import {projectEscrowReleaseCoverageFrame} from '../../finance/src/escrow-release-frame.mjs';
import {sourceRecoveryMonth,sourceRecoveryCurrent,currentRecoveryRow,historyRecoveryRow,runSourceRecovery,readRecoveryPublication,sourceRecoveryGap,saveSourceRecoveryGap,sourceRecoveryFixture,sourceRecoveryOpportunity} from './m2-release-source-recovery-fixture.mjs';

test('a verified missing-source audit rehydrates a terminal 24-order cohort one source step at a time while preserving publication',async t=>{
 const f=await sourceRecoveryFixture(t),before=currentRecoveryRow(f),ads=f.calls.ads.length;
 saveSourceRecoveryGap(f);let value=await sourceRecoveryOpportunity(f,0),steps=0;
 assert.equal(value.status,'RUNNING');assert.equal(value.finance_steps,1);assert.deepEqual(await readRecoveryPublication(f),f.original);
 // A failed later coverage refresh must not strand the already-started import.
 f.env.ADMIN_DB.db.prepare("UPDATE business_escrow_release_coverage SET status='UNAVAILABLE',code='FINANCE_ESCROW_RELEASES_TIMEOUT'").run();
 for(;value.status==='RUNNING'&&steps<30;steps++){
  value=await sourceRecoveryOpportunity(f);
  if(value.status==='RUNNING')assert.deepEqual(await readRecoveryPublication(f),f.original);
 }
 assert.equal(value.status,'COMPLETE');const after=await readRecoveryPublication(f);
 assert.ok(after.publication.source_revision>f.original.publication.source_revision);assert.equal(after.payload.slots.reduce((n,slot)=>n+slot.frame.coverage.paid,0),24);
 assert.ok(after.payload.slots.every(slot=>!f.original.payload.slots.some(old=>old.frame.run_id===slot.frame.run_id)));
 for(const slot of after.payload.slots)assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) AS n FROM finance_business_period_runs WHERE run_id=?').get(slot.frame.run_id).n,1);
 assert.equal(historyRecoveryRow(f).failure_count,0);assert.equal(historyRecoveryRow(f).last_error,null);assert.equal(f.calls.ads.length,ads);assert.ok(f.sourceOptions.every(value=>value.timeoutMs===45000));
 assert.equal(currentRecoveryRow(f).summary,before.summary);
 const count=f.calls.finance.length;assert.equal((await sourceRecoveryOpportunity(f,901)).status,'IDLE');assert.equal(f.calls.finance.length,count,'old audit cannot reset a new complete publication');
});

test('missing coverage tables do not initialize sidecars or recollect a terminal month',async t=>{
 const f=await sourceRecoveryFixture(t),db=f.env.ADMIN_DB.db,calls=f.calls.finance.length;
 db.exec('DROP TABLE business_escrow_release_coverage; DROP TABLE business_escrow_release_coverage_attempt_scopes');
 const sql=[];f.env.ADMIN_DB.onRpc=value=>sql.push(value.sql);
 assert.equal((await runSourceRecovery(f)).status,'IDLE');assert.equal(f.calls.finance.length,calls);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN('business_escrow_release_coverage','business_escrow_release_coverage_attempt_scopes')").get().n,0);
 assert.ok(!sql.some(value=>/CREATE TABLE.*business_escrow_release_coverage/.test(value)));
});

test('a missing or mismatched audit is not permission to re-read an otherwise terminal month',async t=>{
 const f=await sourceRecoveryFixture(t),db=f.env.ADMIN_DB.db,calls=f.calls.finance.length;
 const cases=[
  ['absent',()=>{db.prepare('DELETE FROM business_escrow_release_coverage').run();}],
  ['unavailable',()=>saveSourceRecoveryGap(f,{status:'UNAVAILABLE',code:'FINANCE_ESCROW_RELEASES_TIMEOUT'})],
  ['old publication',()=>saveSourceRecoveryGap(f,{scopeRevision:f.original.publication.source_revision-1})],
  ['old through month',()=>saveSourceRecoveryGap(f,{through:sourceRecoveryMonth})],
  ['future through month',()=>saveSourceRecoveryGap(f,{through:'2026-12'})],
  ['future attempt',()=>saveSourceRecoveryGap(f,{at:Math.floor(f.now()/1000)+1})],
  ['unpaired attempt',()=>saveSourceRecoveryGap(f,{attemptAt:Math.floor(f.now()/1000)-1})],
  ['wrong payload stamp',()=>saveSourceRecoveryGap(f,{payloadAt:Math.floor(f.now()/1000)-1})],
  ['old report',()=>{const frame=sourceRecoveryGap(f);frame.checked_at=f.original.publication.published_at-1;saveSourceRecoveryGap(f,{frame});}],
  ['stale report for same publication',()=>{const frame=sourceRecoveryGap(f);frame.checked_at-=21601;saveSourceRecoveryGap(f,{frame});}],
  ['wrong run reference',()=>{const frame=sourceRecoveryGap(f);frame.sources[0].run_id=crypto.randomUUID();assert.ok(projectEscrowReleaseCoverageFrame(frame));saveSourceRecoveryGap(f,{frame});}],
  ['wrong source revision',()=>{const frame=sourceRecoveryGap(f);frame.sources[0].source_revision++;assert.ok(projectEscrowReleaseCoverageFrame(frame));saveSourceRecoveryGap(f,{frame});}],
  ['malformed stored text',()=>{saveSourceRecoveryGap(f);db.prepare('UPDATE business_escrow_release_coverage SET payload=?').run('{"private":"PRIVATE_SOURCE_RECOVERY_TOKEN"}');}],
 ];
 for(const [label,change] of cases){saveSourceRecoveryGap(f);change();const value=await runSourceRecovery(f);assert.equal(value.status,'IDLE',label);assert.equal(f.calls.finance.length,calls,label);assert.equal(historyRecoveryRow(f),null,label);assert.doesNotMatch(JSON.stringify(value),/PRIVATE/);}
});

test('SOURCE_MISSING text without an actually missing source cannot trigger rehydration',async t=>{
 const f=await sourceRecoveryFixture(t),frame=sourceRecoveryGap(f),calls=f.calls.finance.length;
 frame.sources=f.original.payload.slots.map(({frame:source})=>({run_id:source.run_id,source_revision:source.revision,start_date:source.start_date,end_date:source.end_date,status:'AVAILABLE',orders:source.coverage.orders,paid_orders:source.coverage.paid,finance_oldest_at:source.source_checked_at.oldest_at??source.cutoff_at,finance_latest_at:source.source_checked_at.latest_at??source.checked_at,expected_repass_cents:Math.round(Number(source.expected_repass_raw)*100)}));
 frame.coverage.paid_orders=24;frame.coverage.not_located_orders=24;frame.pending.push('ORDER_NOT_LOCATED');assert.ok(projectEscrowReleaseCoverageFrame(frame));saveSourceRecoveryGap(f,{frame});
 assert.equal((await runSourceRecovery(f)).status,'IDLE');assert.equal(f.calls.finance.length,calls);
});

test('an exact cue can start within six hours and empty available slots do not pretend to contain order timestamps',async t=>{
 const f=await sourceRecoveryFixture(t),frame=sourceRecoveryGap(f),empty=f.original.payload.slots.find(slot=>slot.frame.coverage.orders===0).frame;
 frame.checked_at-=21600;frame.sources[2]={run_id:empty.run_id,source_revision:empty.revision,start_date:empty.start_date,end_date:empty.end_date,status:'AVAILABLE',orders:0,paid_orders:0,finance_oldest_at:frame.checked_at,finance_latest_at:frame.checked_at,expected_repass_cents:0};
 assert.ok(projectEscrowReleaseCoverageFrame(frame));saveSourceRecoveryGap(f,{frame});assert.equal((await sourceRecoveryOpportunity(f,0)).status,'RUNNING');
});

test('current work, policy pause, deadlines and historical retry remain authoritative for source recovery',async t=>{
 const f=await sourceRecoveryFixture(t),db=f.env.ADMIN_DB.db;saveSourceRecoveryGap(f);const calls=f.calls.finance.length;
 const {runBusinessHistorySync}=await import('../src/business-history-sync.mjs');
 assert.equal((await runBusinessHistorySync(f.env,f.services,{now:f.now,currentStatus:'RUNNING'})).status,'DEFERRED');
 const row=currentRecoveryRow(f);db.prepare('UPDATE business_sync_state SET next_run_at=?').run(Math.floor(f.now()/1000)+50);assert.equal((await runSourceRecovery(f)).status,'DEFERRED');db.prepare('UPDATE business_sync_state SET next_run_at=?').run(row.next_run_at);
 const state=await readBusinessSyncState(f.env);await saveBusinessSyncPolicy(f.env,{revision:state.revision,enabled:false},'fixture-owner',{now:f.now});assert.equal((await runSourceRecovery(f)).status,'PAUSED');await saveBusinessSyncPolicy(f.env,{revision:state.revision+1,enabled:true},'fixture-owner',{now:f.now});
 // A resume first belongs to current Finance. Re-establish its completed
 // idle opportunity before testing the independent historical backoff.
 db.prepare('UPDATE business_sync_state SET status=?,next_run_at=?').run(row.status,row.next_run_at);
 const stamp=Math.floor(f.now()/1000);db.prepare('INSERT INTO business_history_sync_state VALUES(?,?,?,?,?,?,?)').run(sourceRecoveryMonth,'ERROR',stamp+300,1,stamp,null,'BUSINESS_HISTORY_COLLECTION_UNAVAILABLE');
 assert.equal((await runSourceRecovery(f)).status,'NOT_DUE');assert.equal(f.calls.finance.length,calls);assert.deepEqual(await readRecoveryPublication(f),f.original);
 assert.equal((await sourceRecoveryOpportunity(f,301)).status,'RUNNING');
});

test('a failed source recovery keeps the immutable month and backs off without modifying the current singleton',async t=>{
 const f=await sourceRecoveryFixture(t),provider=f.services.getFinanceBusinessPeriod;saveSourceRecoveryGap(f);
 f.services.getFinanceBusinessPeriod=async()=>{throw Error('PRIVATE_SOURCE_RECOVERY_FAILURE');};
 const value=await sourceRecoveryOpportunity(f,0);assert.equal(value.status,'ERROR');assert.equal(value.finance_steps,1);assert.equal(historyRecoveryRow(f).failure_count,1);assert.equal(historyRecoveryRow(f).next_run_at,Math.floor(f.now()/1000)+300);assert.deepEqual(await readRecoveryPublication(f),f.original);assert.doesNotMatch(JSON.stringify(historyRecoveryRow(f)),/PRIVATE/);
 f.services.getFinanceBusinessPeriod=provider;assert.equal((await sourceRecoveryOpportunity(f,301)).status,'RUNNING');assert.equal(historyRecoveryRow(f).failure_count,0);
});

test('a pause during a recovered source response cannot publish or commit historical progress',async t=>{
 const f=await sourceRecoveryFixture(t),provider=f.services.getFinanceBusinessPeriod;saveSourceRecoveryGap(f);
 f.services.getFinanceBusinessPeriod=async(...args)=>{const value=await provider(...args);f.env.ADMIN_DB.db.prepare("UPDATE business_sync_state SET enabled=0,status='PAUSED'").run();return value;};
 assert.equal((await runSourceRecovery(f)).status,'PAUSED');assert.equal(historyRecoveryRow(f),null);assert.deepEqual(await readRecoveryPublication(f),f.original);assert.equal(currentRecoveryRow(f).lease_token,null);
});
