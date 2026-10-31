import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHEMA} from '../src/admin.mjs';
import {selectBusinessHistoricalReleaseCalendar} from '../src/business-historical-release-calendars.mjs';
import {FINANCIAL_AUDIT_SCHEMA,runBusinessFinancialAudits} from '../src/financial-audit-orchestration.mjs';
import {runBusinessEscrowReleases} from '../src/business-escrow-releases.mjs';
import {projectEscrowReleaseFrame,projectEscrowReleaseCoverageFrame} from '../../finance/src/escrow-release-frame.mjs';
import {D1} from './sqlite-d1.mjs';
import {TrackerD1,publishTrackerMonth,trackerUuid as uuid,trackerTime,trackerMonth as previous,trackerThrough as month} from './m2-release-tracker-fixture.mjs';

const stamp=trackerTime/1000;
function coverage(frames,{at=stamp,available=false}={}){
 const sources=frames.map(frame=>available?{run_id:frame.run_id,source_revision:frame.revision,start_date:frame.start_date,end_date:frame.end_date,status:'AVAILABLE',orders:1,paid_orders:1,finance_oldest_at:frame.source_checked_at.oldest_at,finance_latest_at:frame.source_checked_at.latest_at,expected_repass_cents:8000}:{run_id:frame.run_id,source_revision:frame.revision,start_date:null,end_date:null,status:'MISSING',orders:null,paid_orders:null,finance_oldest_at:null,finance_latest_at:null,expected_repass_cents:null});
 const calendars=[previous,month].map(value=>({month:value,status:'MISSING',scan_id:null,cutoff_at:null,source_oldest_at:null,source_latest_at:null,observations:0,cohort_observations:0,unique_cohort_orders:0,ambiguous_cohort_orders:0}));
 const value={schema:'finance_escrow_release_coverage_v1',cohort_month:previous,through_month:month,checked_at:at,status:'COLLECTING',sources,calendars,coverage:{paid_orders:available?3:null,located_orders:0,not_located_orders:available?3:null,ambiguous_orders:0,single_orders:0,calendars_total:2,calendars_complete:0,identity_complete_at_cutoff:false},pending:[...(available?['ORDER_NOT_LOCATED']:['SOURCE_MISSING']),'CALENDAR_MISSING','BANK_RECEIPT_NOT_VERIFIED','RELEASE_CYCLE_SEMANTICS_UNVERIFIED'],basis:'SAVED_RELEASE_CALENDARS_AGAINST_PAID_ORDER_COHORT_NOT_BANK_RECEIPT'};
 assert.ok(projectEscrowReleaseCoverageFrame(value));return value;
}
function releaseReport(target,frames,{checked=stamp,complete=true,cutoff=null}={}){
 const from=Date.parse(target+'-01T03:00:00Z')/1000,next=new Date(target+'-01T03:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
 const end=cutoff??Math.min(next.getTime()/1000,checked-60),days=Math.ceil((end-from)/86400),windows=Math.ceil(days/7),sources=frames.map(frame=>({run_id:frame.run_id,source_revision:frame.revision,start_date:null,end_date:null,status:'MISSING',orders:null,paid_orders:null,finance_oldest_at:null,finance_latest_at:null,expected_repass_cents:null}));
 const value={schema:'finance_escrow_releases_v1',month:target,checked_at:checked,status:complete?'PARTIAL':'COLLECTING',sources,calendar:{scan_id:uuid(801),status:complete?'COMPLETE':'RUNNING',from_at:from,end_before_at:end,cutoff_at:end,source_oldest_at:complete?checked-5:null,source_latest_at:complete?checked-5:null,observations:0,unique_orders:0,ambiguous_orders:0,verified_orders:0,unverified_orders:0,known_verified_release_cents:0,total_release_cents:complete?0:null},collection:{scan_id:uuid(801),status:complete?'COMPLETE':'RUNNING',cutoff_at:end,windows_total:windows,windows_complete:complete?windows:0,pages_read:complete?windows:0,observations:0,next_attempt_at:0,diagnostic:null},matching:{status:'SOURCE_MISSING',paid_orders:null,located_paid_orders:0,unlocated_paid_orders:null,ambiguous_paid_orders:0,verified_paid_orders:0,known_expected_located_cents:0,expected_located_cents:null,known_verified_release_cents:0,verified_release_cents:null,comparison_difference_cents:null,outside_cohort_orders:null},pending:['SOURCE_MISSING','MATCHING_INCOMPLETE',...(complete?[]:['RELEASES_COLLECTING']),'BANK_RECEIPT_NOT_VERIFIED'],basis:'RELEASE_CALENDAR_AND_ORDER_CREATE_COHORT_NOT_BANK_RECEIPT'};
 assert.ok(projectEscrowReleaseFrame(value));return value;
}
async function fixture(t){
 const db=new TrackerD1(),env={ADMIN_DB:db},clock={time:trackerTime},now=()=>clock.time;t.after(()=>db.db.close());await db.batch(SCHEMA.map(sql=>db.prepare(sql)));const frames=await publishTrackerMonth(env,now);
 db.db.prepare("UPDATE business_sync_state SET enabled=1,month=?,status='COMPLETE',next_run_at=? WHERE id=1").run(month,stamp+3600);
 const f={db,env,clock,now,frames,backgroundLease:{revision:99,token:uuid(900)},auditLease:{revision:10,token:uuid(901)}};
 f.renew=()=>{f.backgroundLease={revision:f.backgroundLease.revision+1,token:uuid(f.backgroundLease.revision+900)};db.db.prepare("UPDATE background_collection_lane_state SET revision=?,lease_token=?,lease_until=? WHERE id=1").run(f.backgroundLease.revision,f.backgroundLease.token,Math.floor(now()/1000)+290);};f.renew();
 f.save=(value=coverage(frames),{at=value.checked_at,status='SUCCESS',code=null,scopeRevision=7,through=month,payloadAt=value.checked_at,attemptAt=at}={})=>{
  db.db.prepare('INSERT OR REPLACE INTO business_escrow_release_coverage VALUES(?,?,?,?,?,?,?)').run(previous,JSON.stringify(value),payloadAt,at,status,code,at+900);
  db.db.prepare('INSERT OR REPLACE INTO business_escrow_release_coverage_attempt_scopes VALUES(?,?,?,?)').run(previous,through,scopeRevision,attemptAt);
 };
 f.direct=()=>{db.db.prepare("INSERT OR REPLACE INTO financial_audit_turns(month,revision,next_work,lease_token,lease_until) VALUES(?,?,'RELEASES',?,?)").run(month,f.auditLease.revision,f.auditLease.token,Math.floor(now()/1000)+90);return {now,canRun:async()=>true,auditLease:f.auditLease,backgroundLease:f.backgroundLease};};
 f.select=()=>selectBusinessHistoricalReleaseCalendar(env,{month},f.direct());
 f.saveCache=(value)=>db.db.prepare('INSERT OR REPLACE INTO business_escrow_release_reports VALUES(?,?,?,?)').run(previous,JSON.stringify(value.sources.map(({run_id,source_revision})=>({run_id,source_revision}))),JSON.stringify(value),value.checked_at);
 f.save();return f;
}
const counts=f=>({reports:f.db.db.prepare('SELECT COUNT(*) AS n FROM business_escrow_release_reports').get().n,attempts:f.db.db.prepare('SELECT COUNT(*) AS n FROM business_escrow_release_attempts').get().n});

test('a validated missing-calendar cue selects only the immediately prior month without provider calls or writes',async t=>{
 const f=await fixture(t),options=f.direct(),before=f.db.writes.length,selection=await selectBusinessHistoricalReleaseCalendar(f.env,{month},options);
 assert.equal(selection.month,previous);assert.equal(selection.calendarGuard.through_month,month);assert.equal(selection.calendarGuard.publication_revision,7);assert.equal(selection.calendarGuard.audit_token,f.auditLease.token);assert.equal(selection.calendarGuard.background_token,f.backgroundLease.token);assert.equal(f.db.writes.length,before);assert.deepEqual(counts(f),{reports:0,attempts:0});
 assert.equal(await selectBusinessHistoricalReleaseCalendar(f.env,{month:'2026-10'},options),null);
});

test('missing, malformed, stale, future and publication-mismatched cues do not select historical work',async t=>{
 const mutations={absent:f=>f.db.db.exec('DELETE FROM business_escrow_release_coverage'),malformed:f=>f.db.db.prepare('UPDATE business_escrow_release_coverage SET payload=?').run('{}'),stale:f=>{f.clock.time+=21601000;f.renew();},future:f=>f.save(coverage(f.frames,{at:stamp+1})),revision:f=>f.save(coverage(f.frames),{scopeRevision:8}),attempt:f=>f.save(coverage(f.frames),{attemptAt:stamp-1}),through:f=>f.save(coverage(f.frames),{through:'2026-10'}),payloadTime:f=>f.save(coverage(f.frames),{payloadAt:stamp-1}),unavailable:f=>f.save(coverage(f.frames),{status:'UNAVAILABLE',code:'FINANCE_ESCROW_RELEASES_UNAVAILABLE'}),source:f=>{const value=coverage(f.frames);value.sources[0].run_id=uuid(999);assert.ok(projectEscrowReleaseCoverageFrame(value));f.save(value);}};
 for(const [name,mutate] of Object.entries(mutations))await t.test(name,async child=>{const f=await fixture(child);mutate(f);assert.equal(await f.select(),null);assert.deepEqual(counts(f),{reports:0,attempts:0});});
});

test('available source metadata must match the exact publication, while explicit missing identities remain unknown',async t=>{
 const f=await fixture(t);f.save(coverage(f.frames,{available:true}));assert.equal((await f.select()).month,previous);
 for(const mutate of [value=>value.sources[0].orders++,value=>value.sources[0].expected_repass_cents++,value=>value.sources[0].finance_oldest_at--,value=>value.sources[0].source_revision++]){const value=coverage(f.frames,{available:true});mutate(value);assert.ok(projectEscrowReleaseCoverageFrame(value));f.save(value);assert.equal(await f.select(),null);}
});

test('a valid CALENDAR_PARTIAL cue remains eligible after the initial MISSING state has progressed',async t=>{
 const f=await fixture(t),value=coverage(f.frames);value.calendars=value.calendars.map((row,index)=>({...row,status:'PARTIAL',scan_id:uuid(810+index),cutoff_at:index?stamp-1:Date.UTC(2026,10,1,3)/1000}));value.pending=value.pending.filter(code=>code!=='CALENDAR_MISSING');value.pending.push('CALENDAR_PARTIAL');assert.ok(projectEscrowReleaseCoverageFrame(value));f.save(value);assert.equal((await f.select()).month,previous);
});

test('a full-month COMPLETE calendar newer than the cue suppresses backfill independently of cohort references',async t=>{
 const f=await fixture(t),frame=releaseReport(previous,[{run_id:uuid(990),revision:1}]);f.saveCache(frame);assert.equal(await f.select(),null);
});

test('a mid-month completion, an older completion or a malformed calendar cannot suppress newer missing-calendar evidence',async t=>{
 for(const mode of ['midmonth','older','malformed'])await t.test(mode,async child=>{const f=await fixture(child),frame=releaseReport(previous,f.frames,{checked:mode==='older'?stamp-1:stamp,cutoff:mode==='midmonth'?Date.UTC(2026,9,15,3)/1000:null});if(mode==='malformed')frame.calendar.unique_orders=1;f.saveCache(frame);assert.equal((await f.select()).month,previous);});
});

test('historical RELEASES alternates with current RELEASES while the legacy audit cursor and one-read budget are retained',async t=>{
 const f=await fixture(t),calls=[];
 const source=async(_,input)=>{calls.push(input);return releaseReport(input.month,input.month===previous?f.frames:[],{checked:Math.floor(f.now()/1000),complete:input.month!==previous});};
 for(let index=0;index<4;index++){
  f.clock.time=trackerTime+index*901000;f.renew();f.db.db.prepare("INSERT OR REPLACE INTO financial_audit_turns(month,revision,next_work) VALUES(?,1,'RELEASES')").run(month);f.db.db.prepare('INSERT OR REPLACE INTO financial_audit_coverage_turns VALUES(?,0)').run(month);
  const work=await runBusinessFinancialAudits(f.env,{getFinanceEscrowReleases:source},{month},{now:f.now,historicalCalendars:true,backgroundLease:f.backgroundLease});assert.equal(work.selected,'RELEASES');assert.equal(work.source_reads,1);assert.equal(f.db.db.prepare('SELECT next_work FROM financial_audit_turns WHERE month=?').get(month).next_work,'RETURNS');
 }
 assert.deepEqual(calls.map(row=>row.month),[previous,month,previous,month]);for(const call of calls)assert.equal(call.operation,'step');assert.deepEqual(calls[0].sources,f.frames.map(frame=>({run_id:frame.run_id,source_revision:frame.revision})));
});

test('a runner throwing after its private read still yields the next RELEASES opportunity to the other calendar',async t=>{
 const f=await fixture(t),calls=[];
 for(const [index,target,next] of [[0,previous,'CURRENT'],[1,month,'HISTORICAL']]){
  f.renew();f.db.db.prepare("INSERT OR REPLACE INTO financial_audit_turns(month,revision,next_work) VALUES(?,1,'RELEASES')").run(month);f.db.db.prepare('INSERT OR REPLACE INTO financial_audit_coverage_turns VALUES(?,0)').run(month);
  const work=await runBusinessFinancialAudits(f.env,{getFinanceEscrowReleases:async(_,input)=>{calls.push(input.month);return releaseReport(input.month,input.month===previous?f.frames:[]);}},{month},{now:f.now,historicalCalendars:true,backgroundLease:f.backgroundLease,runReleases:async(env,source,input,options)=>{assert.equal(input.month,target);if(index===0)assert.equal(options.calendarGuard.publication_revision,7);else assert.equal(options.calendarGuard,undefined);await source(env,{operation:'step',month:input.month,sources:input.month===previous?f.frames.map(frame=>({run_id:frame.run_id,source_revision:frame.revision})):[]});throw Error('SYNTHETIC_POST_READ_FAILURE');}});
  assert.equal(work.status,'ERROR');assert.equal(work.source_reads,1);assert.equal(work.repeat,false);const row=f.db.db.prepare('SELECT next_target,bootstrap_pending FROM financial_audit_release_calendar_turns WHERE month=?').get(month);assert.equal(row.next_target,next);assert.equal(row.bootstrap_pending,0);assert.equal(f.db.db.prepare('SELECT next_work FROM financial_audit_turns WHERE month=?').get(month).next_work,'RETURNS');
 }
 assert.deepEqual(calls,[previous,month]);assert.deepEqual(counts(f),{reports:0,attempts:0});
});

test('a historical runner failing before IO cannot starve current RELEASES across repeated opportunities',async t=>{
 const f=await fixture(t),calls=[];let historicalAttempts=0;
 for(let index=0;index<2;index++){
  f.renew();f.db.db.prepare("INSERT OR REPLACE INTO financial_audit_turns(month,revision,next_work) VALUES(?,1,'RELEASES')").run(month);f.db.db.prepare('INSERT OR REPLACE INTO financial_audit_coverage_turns VALUES(?,0)').run(month);
  const work=await runBusinessFinancialAudits(f.env,{getFinanceEscrowReleases:async(_,input)=>{calls.push(input.month);return releaseReport(input.month,[]);}},{month},{now:f.now,historicalCalendars:true,backgroundLease:f.backgroundLease,runReleases:async(env,source,input,options)=>{if(input.month===previous){historicalAttempts++;assert.equal(options.calendarGuard.publication_revision,7);throw Error('SYNTHETIC_PRE_READ_FAILURE');}assert.equal(input.month,month);await source(env,{operation:'step',month:input.month,sources:[]});return {status:'CHECKED'};}});
  assert.equal(work.status,'CHECKED');assert.equal(work.source_reads,1);const row=f.db.db.prepare('SELECT next_target,bootstrap_pending FROM financial_audit_release_calendar_turns WHERE month=?').get(month);assert.equal(row.next_target,'HISTORICAL');assert.equal(row.bootstrap_pending,0);assert.equal(f.db.db.prepare('SELECT next_work FROM financial_audit_turns WHERE month=?').get(month).next_work,'RETURNS');
 }
 assert.equal(historicalAttempts,2);assert.deepEqual(calls,[month,month]);assert.deepEqual(counts(f),{reports:0,attempts:0});
});

test('a locally waiting or failing current calendar yields the next RELEASES opportunity to pending history',async t=>{
 for(const mode of ['RETRY_WAIT','LEASED','ERROR'])await t.test(mode,async child=>{
  const f=await fixture(child),calls=[];f.db.db.prepare("INSERT OR REPLACE INTO financial_audit_release_calendar_turns(month,next_target,bootstrap_pending) VALUES(?,'CURRENT',0)").run(month);
  const prepare=()=>{f.renew();f.db.db.prepare("INSERT OR REPLACE INTO financial_audit_turns(month,revision,next_work) VALUES(?,1,'RELEASES')").run(month);f.db.db.prepare('INSERT OR REPLACE INTO financial_audit_coverage_turns VALUES(?,0)').run(month);};prepare();
  const services={getFinanceEscrowReleases:async(_,input)=>{calls.push(input.month);assert.equal(input.month,previous);return releaseReport(input.month,f.frames,{complete:false});}};
  const first=await runBusinessFinancialAudits(f.env,services,{month},{now:f.now,historicalCalendars:true,backgroundLease:f.backgroundLease,runReleases:async(_,source,input)=>{assert.equal(input.month,month);if(mode==='ERROR')throw Error('SYNTHETIC_CURRENT_LOCAL_FAILURE');return {status:mode,source_reads:0};}});
  assert.equal(first.releases_status,mode);assert.equal(first.source_reads,0);assert.deepEqual(calls,[]);assert.equal(f.db.db.prepare('SELECT next_target FROM financial_audit_release_calendar_turns WHERE month=?').get(month).next_target,'HISTORICAL');
  prepare();const second=await runBusinessFinancialAudits(f.env,services,{month},{now:f.now,historicalCalendars:true,backgroundLease:f.backgroundLease});assert.equal(second.selected,'RELEASES');assert.equal(second.source_reads,1);assert.deepEqual(calls,[previous]);assert.equal(f.db.db.prepare('SELECT next_target FROM financial_audit_release_calendar_turns WHERE month=?').get(month).next_target,'CURRENT');assert.deepEqual(counts(f),{reports:1,attempts:1});
 });
});

test('a pause or lost enclosing lease during a pre-IO failure prevents fallback to current transport',async t=>{
 for(const mode of ['pause','auditLease','backgroundLease'])await t.test(mode,async child=>{
  const f=await fixture(child);f.db.db.prepare("INSERT OR REPLACE INTO financial_audit_turns(month,revision,next_work) VALUES(?,1,'RELEASES')").run(month);f.db.db.prepare('INSERT OR REPLACE INTO financial_audit_coverage_turns VALUES(?,0)').run(month);let historicalAttempts=0,calls=0;
  const work=await runBusinessFinancialAudits(f.env,{getFinanceEscrowReleases:async()=>{calls++;return {};}},{month},{now:f.now,historicalCalendars:true,backgroundLease:f.backgroundLease,canRun:async()=>true,runReleases:async(env,source,input)=>{if(input.month===previous){historicalAttempts++;if(mode==='pause')f.db.db.exec('UPDATE business_sync_state SET enabled=0');else if(mode==='auditLease')f.db.db.prepare('UPDATE financial_audit_turns SET revision=revision+1 WHERE month=?').run(month);else f.db.db.exec('UPDATE background_collection_lane_state SET revision=revision+1');throw Error('SYNTHETIC_PRE_READ_SCOPE_CHANGE');}await source(env,{operation:'step',month:input.month,sources:[]});return {status:'CHECKED'};}});
  assert.equal(historicalAttempts,1);assert.equal(calls,0);assert.equal(work.source_reads,0);assert.notEqual(work.status,'CHECKED');assert.equal(f.db.db.prepare('SELECT bootstrap_pending FROM financial_audit_release_calendar_turns WHERE month=?').get(month).bootstrap_pending,1);assert.deepEqual(counts(f),{reports:0,attempts:0});
 });
});

test('the audit-local first RELEASES opportunity preserves the queued legacy task and resumes it afterward',async t=>{
 const f=await fixture(t),calls=[];f.db.db.prepare("INSERT OR REPLACE INTO financial_audit_turns(month,revision,next_work) VALUES(?,1,'RETURNS')").run(month);f.db.db.prepare('INSERT OR REPLACE INTO financial_audit_coverage_turns VALUES(?,0)').run(month);
 const services={getFinanceEscrowReleases:async(_,input)=>{calls.push(input.month);return releaseReport(input.month,f.frames);},getFinanceReconciliation:async()=>{calls.push('RETURNS');return {};}};
 const options={now:f.now,historicalCalendars:true,backgroundLease:f.backgroundLease,runReturns:async(_,source)=>{await source();return {status:'CHECKED'};}};
 const first=await runBusinessFinancialAudits(f.env,services,{month},options);assert.equal(first.selected,'RELEASES');assert.equal(first.source_reads,1);assert.equal(f.db.db.prepare('SELECT next_work FROM financial_audit_turns WHERE month=?').get(month).next_work,'RETURNS');assert.equal(f.db.db.prepare('SELECT bootstrap_pending FROM financial_audit_release_calendar_turns WHERE month=?').get(month).bootstrap_pending,0);
 const second=await runBusinessFinancialAudits(f.env,services,{month},options);assert.equal(second.selected,'RETURNS');assert.equal(second.source_reads,1);assert.deepEqual(calls,[previous,'RETURNS']);
});

test('pause and a failed audit CAS preserve the pending first-calendar opportunity',async t=>{
 for(const mode of ['pause','auditCAS'])await t.test(mode,async child=>{
  const f=await fixture(child);f.db.db.prepare("INSERT OR REPLACE INTO financial_audit_turns(month,revision,next_work) VALUES(?,1,'RETURNS')").run(month);f.db.db.prepare('INSERT OR REPLACE INTO financial_audit_coverage_turns VALUES(?,0)').run(month);let calls=0,checks=0;
  if(mode==='auditCAS')f.db.beforeStatement=sql=>{if(sql.startsWith('UPDATE financial_audit_turns SET revision=revision+1,next_work='))f.db.db.prepare('UPDATE financial_audit_turns SET revision=revision+1 WHERE month=?').run(month);};
  await runBusinessFinancialAudits(f.env,{getFinanceEscrowReleases:async(_,input)=>{calls++;return releaseReport(input.month,f.frames);}},{month},{now:f.now,historicalCalendars:true,backgroundLease:f.backgroundLease,canRun:async()=>{if(mode==='pause'&&++checks===2)f.db.db.exec('UPDATE business_sync_state SET enabled=0');return f.db.db.prepare('SELECT enabled FROM business_sync_state').get().enabled===1;}});
  assert.equal(calls,mode==='pause'?0:1);const row=f.db.db.prepare('SELECT bootstrap_pending,next_target FROM financial_audit_release_calendar_turns WHERE month=?').get(month);assert.equal(row.bootstrap_pending,1);assert.equal(row.next_target,'HISTORICAL');
 });
});

test('the bounded private source rechecks the Brasilia month after awaiting canRun',async t=>{
 const f=await fixture(t);f.db.db.prepare("INSERT OR REPLACE INTO financial_audit_turns(month,revision,next_work) VALUES(?,1,'RELEASES')").run(month);f.db.db.prepare('INSERT OR REPLACE INTO financial_audit_coverage_turns VALUES(?,0)').run(month);f.db.db.prepare("INSERT OR REPLACE INTO financial_audit_release_calendar_turns(month,next_target,bootstrap_pending) VALUES(?,'CURRENT',0)").run(month);let sourcePhase=false,calls=0;
 const work=await runBusinessFinancialAudits(f.env,{getFinanceEscrowReleases:async()=>{calls++;return {};}},{month},{now:f.now,historicalCalendars:true,backgroundLease:f.backgroundLease,canRun:async()=>{if(sourcePhase)f.clock.time=Date.UTC(2026,11,1,3);return true;},runReleases:async(_,source)=>{sourcePhase=true;await source();return {status:'CHECKED'};}});assert.equal(calls,0);assert.equal(work.source_reads,0);assert.notEqual(work.status,'CHECKED');
});

test('a guarded historical commit cannot write reports or retry attempts after pause, publication replacement or lease loss',async t=>{
 for(const mode of ['pause','publication','auditLease','backgroundLease'])await t.test(mode,async child=>{
  const f=await fixture(child),selected=await f.select();let intercepted=false;
  f.db.beforeStatement=sql=>{if(intercepted||!sql.startsWith('INSERT INTO business_escrow_release_reports'))return;intercepted=true;if(mode==='pause')f.db.db.exec('UPDATE business_sync_state SET enabled=0');else if(mode==='publication')f.db.db.prepare('UPDATE business_month_publications SET write_token=? WHERE month=?').run(uuid(998),previous);else if(mode==='auditLease')f.db.db.prepare('UPDATE financial_audit_turns SET revision=revision+1 WHERE month=?').run(month);else f.db.db.exec('UPDATE background_collection_lane_state SET revision=revision+1');};
  let calls=0;const work=await runBusinessEscrowReleases(f.env,async()=>{calls++;return releaseReport(previous,f.frames);},{month:previous},{now:f.now,canRun:async()=>true,calendarGuard:selected.calendarGuard});assert.equal(calls,1);assert.equal(intercepted,true);assert.notEqual(work.status,'CHECKED');assert.deepEqual(counts(f),{reports:0,attempts:0});
 });
});

test('guard fences a changed publication before lease acquisition and an expired or rolled-over response before save',async t=>{
 for(const mode of ['claimPause','rollover','expiry'])await t.test(mode,async child=>{
  const f=await fixture(child),selected=await f.select();let calls=0;
  if(mode==='claimPause')f.db.beforeStatement=sql=>{if(sql.startsWith('INSERT INTO business_escrow_release_leases'))f.db.db.exec('UPDATE business_sync_state SET enabled=0');};
  const work=await runBusinessEscrowReleases(f.env,async()=>{calls++;if(mode==='rollover')f.clock.time=Date.UTC(2026,11,1,3);else if(mode==='expiry')f.clock.time+=91000;return releaseReport(previous,f.frames);},{month:previous},{now:f.now,canRun:async()=>true,calendarGuard:selected.calendarGuard});assert.equal(calls,mode==='claimPause'?0:1);assert.notEqual(work.status,'CHECKED');assert.deepEqual(counts(f),{reports:0,attempts:0});
 });
});

test('default legacy audit callers remain usable without publication, coverage or global-lane tables',async t=>{
 const db=new D1();t.after(()=>db.db.close());db.db.exec(FINANCIAL_AUDIT_SCHEMA.join(';'));db.db.prepare("INSERT INTO financial_audit_turns(month,revision,next_work) VALUES(?,1,'RELEASES')").run(month);db.db.prepare('INSERT INTO financial_audit_coverage_turns VALUES(?,0)').run(month);let calls=0;
 const work=await runBusinessFinancialAudits({ADMIN_DB:db},{getFinanceEscrowReleases:async()=>{calls++;return {};}},{month},{now:()=>trackerTime,runReleases:async(_,source)=>{await source();return {status:'CHECKED'};}});assert.equal(work.source_reads,1);assert.equal(calls,1);assert.equal(work.selected,'RELEASES');
});
