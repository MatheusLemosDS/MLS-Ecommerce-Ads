import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireBackgroundLane,finishBackgroundLane} from '../src/historical-cost-orchestration.mjs';
import {runBusinessHistorySync} from '../src/business-history-sync.mjs';
import {businessHistoryContinuationQuery,projectBusinessHistoryContinuation} from '../src/business-history-continuation.mjs';
import {sourceRecoveryFixture,saveSourceRecoveryGap,runSourceRecovery,currentRecoveryRow,historyRecoveryRow,readRecoveryPublication} from './m2-release-source-recovery-fixture.mjs';
import {D1} from './sqlite-d1.mjs';
import {createTenantDatabase,tenantNamespace} from '../src/tenant-storage.mjs';
const month='2026-11',prior='2026-10',stamp=f=>Math.floor(f.now()/1000),db=f=>f.env.ADMIN_DB.db;
const fairness=f=>db(f).prepare('SELECT * FROM business_history_sync_fairness').get();
const monthly=f=>acquireBackgroundLane(f.env,{month},{now:f.now,monthlyContinuation:true});
const run=(f,lease)=>runBusinessHistorySync(f.env,f.services,{now:f.now,monthlyContinuation:true,backgroundLease:{token:lease.token,revision:lease.revision,auxiliary_index:lease.auxiliary_index}});
function ready(f,index=3){db(f).prepare("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=?,lease_token=NULL,lease_until=NULL").run(index);db(f).prepare('UPDATE background_history_fairness_state SET finance_since_audit=4,last_auxiliary_at=?').run(stamp(f)-301);}
async function context(f){const query=businessHistoryContinuationQuery(month);return (await f.env.ADMIN_DB.prepare('SELECT '+query.sql+' AS context').bind(...query.args).first()).context;}
async function fixture(t){
 const f=await sourceRecoveryFixture(t);saveSourceRecoveryGap(f);assert.equal((await runSourceRecovery(f)).status,'RUNNING');
 const current=currentRecoveryRow(f),summary=JSON.parse(current.summary);summary.status='RUNNING';summary.net_estimate_cents=null;db(f).prepare("UPDATE business_sync_state SET status='RUNNING',summary=?,next_run_at=0").run(JSON.stringify(summary));
 f.clock.time+=901000;ready(f);return f;
}

test('a strict finite cue offers only a validated active previous-month cohort and never completed, limited, corrupt, stale-scope or ambiguous metadata',async t=>{
 const f=await fixture(t),raw=await context(f),options={month,stamp:stamp(f),admission:true,backgroundRevision:999999};assert.ok(projectBusinessHistoryContinuation(raw,options));
 const mutations=[v=>v.month='2026-09',v=>v.revision=v.published_revision,v=>v.created_at=v.published_at-1,v=>v.history_status='COMPLETE',v=>v.history_status='LIMIT_REACHED',v=>v.history_next=stamp(f)+1,v=>v.history_attempt=stamp(f)+1,v=>v.frames[0].status='LIMIT_REACHED',v=>v.frames[0].run_id=crypto.randomUUID(),v=>v.frames.push({...v.frames[0]}),v=>v.frames[0].revision++,v=>v.parent='{}',v=>v.next_work='AUXILIARY',v=>v.history_status='ERROR',v=>v.history_failures=1];
 for(const change of mutations){const value=JSON.parse(raw);change(value);assert.equal(projectBusinessHistoryContinuation(JSON.stringify(value),options),null);}
 assert.equal(projectBusinessHistoryContinuation(raw,{...options,stamp:stamp(f)-901}),null);assert.equal(projectBusinessHistoryContinuation('{',options),null);
});

test('one continuation consumes one private source and keeps the ordinary index, protected counters and immutable publication intact',async t=>{
 const f=await fixture(t),before=await readRecoveryPublication(f),current=currentRecoveryRow(f),counters=db(f).prepare('SELECT reserved_returns_streak,returns_retry_at FROM background_history_fairness_state').get(),calls=f.calls.finance.length;f.env.ADMIN_DB.calls=0;const lease=await monthly(f);
 assert.equal(lease.lane,'HISTORY');assert.equal(lease.monthly_history_continuation,true);assert.equal(lease.auxiliary_index,3);assert.equal((await run(f,lease)).finance_steps,1);assert.equal(f.calls.finance.length,calls+1);assert.equal(await finishBackgroundLane(f.env,lease,{now:f.now}),true);assert.equal(db(f).prepare('SELECT auxiliary_index FROM background_collection_lane_state').get().auxiliary_index,3);assert.deepEqual(db(f).prepare('SELECT reserved_returns_streak,returns_retry_at FROM background_history_fairness_state').get(),counters);assert.equal(fairness(f).next_work,'AUXILIARY');assert.deepEqual(await readRecoveryPublication(f),before);assert.deepEqual(currentRecoveryRow(f),current);
 assert.ok(f.env.ADMIN_DB.calls+f.calls.finance.length-calls<=50,'the offered monthly phase retains the unchanged combined D1/binding budget');t.diagnostic('monthly continuation combined RPC: '+(f.env.ADMIN_DB.calls+f.calls.finance.length-calls));
 f.clock.time+=901000;ready(f);const yieldLease=await monthly(f);assert.notEqual(yieldLease.monthly_history_continuation,true);await finishBackgroundLane(f.env,yieldLease,{now:f.now});assert.equal(fairness(f).next_work,'MONTHLY');
});

test('an ordinary HISTORY source step keeps its mandatory yield even after a long clock advance without other auxiliary work',async t=>{
 const f=await fixture(t);db(f).prepare('UPDATE business_history_sync_state SET last_attempt_at=?,next_run_at=? WHERE month=?').run(stamp(f)-100,stamp(f)-1,prior);db(f).prepare('UPDATE background_history_fairness_state SET reserved_returns_streak=2').run();ready(f,0);
 const lease=await monthly(f);assert.equal(lease.lane,'HISTORY');assert.notEqual(lease.monthly_history_continuation,true);const result=await runBusinessHistorySync(f.env,f.services,{now:f.now,backgroundLease:{token:lease.token,revision:lease.revision}});assert.equal(result.finance_steps,1);await finishBackgroundLane(f.env,lease,{now:f.now});assert.equal(fairness(f).next_work,'AUXILIARY');
 f.clock.time+=1801000;ready(f);const yieldLease=await monthly(f);assert.notEqual(yieldLease.monthly_history_continuation,true);await finishBackgroundLane(f.env,yieldLease,{now:f.now});assert.equal(fairness(f).next_work,'MONTHLY');
});

test('a source-zero primary-lease race consumes a yield and scheduling cooldown without inventing a source attempt, and replay is idempotent',async t=>{
 const f=await fixture(t),lease=await monthly(f),before=historyRecoveryRow(f),calls=f.calls.finance.length;assert.equal(lease.monthly_history_continuation,true);
 db(f).prepare('UPDATE business_sync_state SET lease_token=?,lease_expires_at=?').run(crypto.randomUUID(),stamp(f)+300);assert.equal((await run(f,lease)).status,'LEASED');assert.equal(f.calls.finance.length,calls);assert.equal(await finishBackgroundLane(f.env,lease,{now:f.now}),true);
 const after=historyRecoveryRow(f);assert.equal(after.last_attempt_at,before.last_attempt_at);assert.equal(after.failure_count,before.failure_count);assert.equal(after.next_run_at,stamp(f)+900);assert.equal(fairness(f).next_work,'AUXILIARY');assert.equal(await finishBackgroundLane(f.env,lease,{now:f.now}),false);assert.deepEqual(historyRecoveryRow(f),after);
});

for(const interruption of ['pause','expiry','replacement'])test('lost '+interruption+' fences the offered continuation cooldown and yield writes',async t=>{
 const f=await fixture(t),lease=await monthly(f),before=historyRecoveryRow(f),oldFair=fairness(f);assert.equal(lease.monthly_history_continuation,true);
 if(interruption==='pause')db(f).prepare('UPDATE business_sync_state SET enabled=0').run();else if(interruption==='expiry')f.clock.time+=301000;else db(f).prepare('UPDATE background_collection_lane_state SET revision=revision+1,lease_token=?,lease_until=?').run(crypto.randomUUID(),stamp(f)+300);
 assert.ok(['PAUSED','LEASED','DEFERRED'].includes((await run(f,lease)).status));await finishBackgroundLane(f.env,lease,{now:f.now});assert.deepEqual(historyRecoveryRow(f),before);assert.deepEqual(fairness(f),oldFair);
});

test('current failures, active primary leases and future historical backoff cannot admit a continuation reservation',async t=>{
 const f=await fixture(t),initial=currentRecoveryRow(f),history=historyRecoveryRow(f);
 for(const mutation of [()=>db(f).prepare('UPDATE business_sync_state SET failure_count=1').run(),()=>db(f).prepare('UPDATE business_sync_state SET lease_token=?,lease_expires_at=?').run(crypto.randomUUID(),stamp(f)+120),()=>db(f).prepare('UPDATE business_history_sync_state SET next_run_at=?').run(stamp(f)+1)]){
  mutation();ready(f);const lease=await monthly(f);assert.notEqual(lease.monthly_history_continuation,true);await finishBackgroundLane(f.env,lease,{now:f.now});db(f).prepare('UPDATE business_sync_state SET failure_count=?,lease_token=?,lease_expires_at=?').run(initial.failure_count,initial.lease_token,initial.lease_expires_at);db(f).prepare('UPDATE business_history_sync_state SET next_run_at=?').run(history.next_run_at);
 }
});

test('a typed missing run after a source-gap cue aged beyond six hours retains its intent and resumes the same legitimate ERROR cohort after backoff',async t=>{
 const f=await fixture(t),frame=db(f).prepare('SELECT * FROM business_month_frames WHERE month=? AND slot_index=0').get(prior),source=JSON.parse(frame.payload),finance=f.financeEnv.FINANCE_DB.db;
 for(const table of ['finance_business_order_evidence','finance_business_period_orders','finance_business_period_cursors','finance_business_period_payment_cache','finance_business_period_runs'])finance.prepare('DELETE FROM '+table+' WHERE run_id=?').run(source.run_id);
 f.clock.time+=21601000;ready(f);const real=f.services.getFinanceBusinessPeriod;f.services.getFinanceBusinessPeriod=async(...args)=>{try{return await real(...args);}catch(error){if(error.code==='FINANCE_BUSINESS_RUN_NOT_FOUND'&&error.status===404)return {schema:'finance_business_period_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_BUSINESS_RUN_NOT_FOUND',http:404}};throw error;}};
 let lease=await monthly(f);assert.equal(lease.monthly_history_continuation,true);assert.equal((await run(f,lease)).status,'ERROR');await finishBackgroundLane(f.env,lease,{now:f.now});assert.equal(historyRecoveryRow(f).status,'ERROR');assert.equal(db(f).prepare('SELECT COUNT(*) n FROM business_month_source_recoveries WHERE replacement_run_id IS NULL').get().n,1);assert.deepEqual(await readRecoveryPublication(f),f.original);
 f.clock.time+=901000;ready(f);lease=await monthly(f);assert.notEqual(lease.monthly_history_continuation,true);await finishBackgroundLane(f.env,lease,{now:f.now});f.clock.time+=301000;ready(f);lease=await monthly(f);assert.equal(lease.monthly_history_continuation,true);const calls=f.calls.finance.length,result=await run(f,lease);assert.equal(result.status,'RUNNING');assert.equal(result.finance_steps,1);assert.equal(f.calls.finance.length,calls+1);await finishBackgroundLane(f.env,lease,{now:f.now});assert.notEqual(db(f).prepare('SELECT run_id FROM business_month_frames WHERE month=? AND slot_index=0').get(prior).run_id,source.run_id);assert.equal(db(f).prepare('SELECT COUNT(*) n FROM business_month_source_recoveries WHERE replacement_run_id IS NOT NULL').get().n,1);assert.deepEqual(await readRecoveryPublication(f),f.original);
});

test('the actual finite continuation SQL stays inside the selected tenant even with equal month and source identities',async t=>{
 const f=await fixture(t),raw=new D1();t.after(()=>raw.db.close());
 const scoped=async organizationId=>createTenantDatabase(raw,{organizationId,storeId:'synthetic-store',namespace:await tenantNamespace(organizationId,'synthetic-store')},{domain:'app'}),A=await scoped('synthetic-org-a'),B=await scoped('synthetic-org-b');
 for(const table of ['business_month_runs','business_month_frames','business_month_publications','business_history_sync_state','business_history_sync_fairness']){
  const ddl=db(f).prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table).sql;await A.prepare(ddl).run();await B.prepare(ddl).run();
  for(const row of db(f).prepare('SELECT * FROM '+table).all()){const keys=Object.keys(row),sql='INSERT INTO '+table+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')';await A.prepare(sql).bind(...keys.map(key=>row[key])).run();await B.prepare(sql).bind(...keys.map(key=>row[key])).run();}
 }
 const query=businessHistoryContinuationQuery(month),read=async database=>projectBusinessHistoryContinuation((await database.prepare('SELECT '+query.sql+' AS context').bind(...query.args).first()).context,{month,stamp:stamp(f),admission:true,backgroundRevision:999999});assert.ok(await read(A));assert.ok(await read(B));
 await B.prepare("UPDATE business_month_frames SET payload='{}' WHERE month=?").bind(prior).run();assert.equal(await read(B),null);assert.ok(await read(A));
});
