import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {BUSINESS_MONTH_PUBLICATION_SCHEMA,saveCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {BUSINESS_ESCROW_RELEASE_COVERAGE_SCHEMA,projectBusinessEscrowReleaseCoverage,readBusinessEscrowReleaseCoverage,runBusinessEscrowReleaseCoverage} from '../src/business-escrow-release-coverage.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {projectEscrowReleaseCoverageFrame} from '../../finance/src/escrow-release-frame.mjs';
import {BUSINESS_SYNC_SCHEMA} from '../src/business-sync.mjs';

const nowMs=Date.UTC(2026,10,10,15),stamp=nowMs/1000,month='2026-10',through='2026-11';
const uuid=index=>'11111111-1111-4111-8111-'+String(index).padStart(12,'0');
function businessFrame(index,start,end){
 const value={schema:'finance_business_period_v1',run_id:uuid(index+1),revision:2,status:'COMPLETE',start_date:start,end_date:end,cutoff_at:stamp-1000,checked_at:stamp-900,source_checked_at:{oldest_at:stamp-950,latest_at:stamp-950},currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:1,paid:1,completed:1,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'100',sales_base_raw:'100',known_expected_repass_raw:'80',expected_repass_raw:'80',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:0,known_base_raw:'100',known_tax_raw:'2'},items:[{item_id:String(index+1),model_id:'0',quantity:1}],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
 assert.ok(projectBusinessPeriodFrame(value));return value;
}
function coverage(refs,{identity=false}={}){
 const located=identity?3:2,notLocated=3-located;
 const value={schema:'finance_escrow_release_coverage_v1',cohort_month:month,through_month:through,checked_at:stamp,status:identity?'IDENTITY_COMPLETE':'COLLECTING',sources:refs.map((ref,index)=>({run_id:ref.run_id,source_revision:ref.source_revision,start_date:[month+'-01',month+'-16',month+'-31'][index],end_date:[month+'-15',month+'-30',month+'-31'][index],status:'AVAILABLE',orders:1,paid_orders:1,finance_oldest_at:stamp-950,finance_latest_at:stamp-950,expected_repass_cents:8000})),calendars:[{month,status:'COMPLETE',scan_id:uuid(80),cutoff_at:Date.UTC(2026,10,1,3)/1000,source_oldest_at:stamp-800,source_latest_at:stamp-790,observations:2,cohort_observations:2,unique_cohort_orders:2,ambiguous_cohort_orders:0},{month:through,status:identity?'COMPLETE':'MISSING',scan_id:identity?uuid(81):null,cutoff_at:identity?stamp-100:null,source_oldest_at:identity?stamp-700:null,source_latest_at:identity?stamp-690:null,observations:identity?1:0,cohort_observations:identity?1:0,unique_cohort_orders:identity?1:0,ambiguous_cohort_orders:0}],coverage:{paid_orders:3,located_orders:located,not_located_orders:notLocated,ambiguous_orders:0,single_orders:located,calendars_total:2,calendars_complete:identity?2:1,identity_complete_at_cutoff:identity},pending:[...(identity?[]:['CALENDAR_MISSING','ORDER_NOT_LOCATED']),'BANK_RECEIPT_NOT_VERIFIED','RELEASE_CYCLE_SEMANTICS_UNVERIFIED'],basis:'SAVED_RELEASE_CALENDARS_AGAINST_PAID_ORDER_COHORT_NOT_BANK_RECEIPT'};
 assert.ok(projectEscrowReleaseCoverageFrame(value));return value;
}
async function fixture(t){
 const db=new D1(),env={ADMIN_DB:db},now=()=>nowMs;t.after(()=>db.db.close());
 await db.batch(['CREATE TABLE business_month_runs(month TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)',...BUSINESS_MONTH_PUBLICATION_SCHEMA,...BUSINESS_ESCROW_RELEASE_COVERAGE_SCHEMA,...BUSINESS_SYNC_SCHEMA].map(sql=>db.prepare(sql)));
 const frames=[businessFrame(0,month+'-01',month+'-15'),businessFrame(1,month+'-16',month+'-30'),businessFrame(2,month+'-31',month+'-31')],payload={start_date:month+'-01',end_date:month+'-31',slots:frames.map(frame=>({start_date:frame.start_date,end_date:frame.end_date,frame}))},raw=JSON.stringify(payload),row={revision:7,payload:raw,created_at:stamp-1200,updated_at:stamp-900};
 db.db.prepare('INSERT INTO business_month_runs VALUES(?,?,?,?,?)').run(month,row.revision,row.payload,row.created_at,row.updated_at);assert.ok(await saveCompletedBusinessMonth(env,month,{row,payload,complete:true},{now}));
 return {db,env,now,frames,refs:frames.map(frame=>({run_id:frame.run_id,source_revision:frame.revision}))};
}

test('coverage cron selects one prior cohort, persists it once and then respects its retry deadline',async t=>{
 const f=await fixture(t),calls=[];const source=async(_,input)=>{calls.push(input);return coverage(f.refs);};
 const work=await runBusinessEscrowReleaseCoverage(f.env,source,{through_month:through},{now:f.now});assert.equal(work.cohort_month,month);assert.equal(work.status,'COLLECTING');assert.equal(work.service_reads,1);assert.deepEqual(calls,[{operation:'coverage',cohort_month:month,through_month:through,sources:f.refs}]);
 const saved=await readBusinessEscrowReleaseCoverage(f.env,{month},{now:f.now});assert.equal(saved.status,'AVAILABLE');assert.ok(projectBusinessEscrowReleaseCoverage(saved,projectEscrowReleaseCoverageFrame));assert.equal(saved.report.coverage.not_located_orders,1);assert.ok(saved.report.pending.includes('RELEASE_CYCLE_SEMANTICS_UNVERIFIED'));
 const again=await runBusinessEscrowReleaseCoverage(f.env,async()=>{throw Error('must not run');},{through_month:through},{now:f.now});assert.equal(again.status,'RETRY_WAIT');assert.equal(again.service_reads,0);
});

test('identity-complete cutoff slows refresh and still never becomes settlement or receivable proof',async t=>{
 const f=await fixture(t);const work=await runBusinessEscrowReleaseCoverage(f.env,async()=>coverage(f.refs,{identity:true}),{through_month:through},{now:f.now});assert.equal(work.status,'IDENTITY_COMPLETE');
 const saved=await readBusinessEscrowReleaseCoverage(f.env,{month},{now:f.now});assert.equal(saved.report.coverage.identity_complete_at_cutoff,true);assert.ok(saved.report.pending.includes('RELEASE_CYCLE_SEMANTICS_UNVERIFIED'));assert.ok(saved.report.pending.includes('BANK_RECEIPT_NOT_VERIFIED'));assert.equal(Object.hasOwn(saved.report,'remaining_receivable_cents'),false);
 const row=f.db.db.prepare('SELECT next_attempt_at,last_attempt_at FROM business_escrow_release_coverage WHERE cohort_month=?').get(month);assert.equal(row.next_attempt_at-row.last_attempt_at,21600);
});

test('failed refresh preserves the last valid coverage report and exposes only a finite diagnostic',async t=>{
 const f=await fixture(t);await runBusinessEscrowReleaseCoverage(f.env,async()=>coverage(f.refs),{through_month:through},{now:f.now});f.db.db.prepare('UPDATE business_escrow_release_coverage SET next_attempt_at=? WHERE cohort_month=?').run(stamp,month);
 const work=await runBusinessEscrowReleaseCoverage(f.env,async()=>({status:'UNAVAILABLE',diagnostic:{code:'FINANCE_ESCROW_RELEASES_TIMEOUT',http:null},private:'PRIVATE_TOKEN'}),{through_month:through},{now:f.now});assert.equal(work.status,'UNAVAILABLE');
 const saved=await readBusinessEscrowReleaseCoverage(f.env,{month},{now:f.now});assert.equal(saved.status,'PARTIAL_UNAVAILABLE');assert.equal(saved.report.coverage.not_located_orders,1);assert.equal(saved.attempt.code,'FINANCE_ESCROW_RELEASES_TIMEOUT');assert.doesNotMatch(JSON.stringify(saved),/PRIVATE_TOKEN/);
});


test('owner coverage GET is read-only even before any tracker schema exists',async t=>{
 const db=new D1();t.after(()=>db.db.close());const before=db.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n;
 const result=await readBusinessEscrowReleaseCoverage({ADMIN_DB:db},{month},{now:()=>nowMs});assert.equal(result.status,'PENDING');assert.equal(result.report,null);assert.equal(result.attempt,null);
 assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n,before);
});

test('source identities bind dates, amounts, counts and financial watermarks to the exact published copies',async t=>{
 for(const mutate of [v=>{v.sources[0].start_date=month+'-02';},v=>{v.sources[0].expected_repass_cents++;},v=>{v.sources[0].finance_oldest_at--;},v=>{v.sources[0].finance_latest_at++;}]){
  const f=await fixture(t),value=coverage(f.refs);mutate(value);assert.ok(projectEscrowReleaseCoverageFrame(value));
  const result=await runBusinessEscrowReleaseCoverage(f.env,async()=>value,{through_month:through},{now:f.now});assert.equal(result.status,'UNAVAILABLE');assert.equal((await readBusinessEscrowReleaseCoverage(f.env,{month},{now:f.now})).report,null);
 }
});

test('a missing Finance source is preserved as explicit incomplete evidence with unknown paid coverage',async t=>{
 const f=await fixture(t),value=coverage(f.refs);Object.assign(value.sources[0],{status:'MISSING',start_date:null,end_date:null,orders:null,paid_orders:null,finance_oldest_at:null,finance_latest_at:null,expected_repass_cents:null});
 value.coverage.paid_orders=null;value.coverage.not_located_orders=null;value.pending.unshift('SOURCE_MISSING');assert.ok(projectEscrowReleaseCoverageFrame(value));
 const result=await runBusinessEscrowReleaseCoverage(f.env,async()=>value,{through_month:through},{now:f.now});assert.equal(result.status,'COLLECTING');
 const saved=await readBusinessEscrowReleaseCoverage(f.env,{month},{now:f.now});assert.equal(saved.report.coverage.paid_orders,null);assert.ok(saved.report.pending.includes('SOURCE_MISSING'));
});

test('pause committed after the final canRun read prevents capture atomically',async t=>{
 const f=await fixture(t);let calls=0;
 const work=await runBusinessEscrowReleaseCoverage(f.env,async()=>coverage(f.refs),{through_month:through},{now:f.now,canRun:async()=>{calls++;if(calls===3)f.db.db.prepare('UPDATE business_sync_state SET enabled=0 WHERE id=1').run();return true;}});
 assert.equal(work.service_reads,1);assert.equal(work.status,'SUPERSEDED');assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM business_escrow_release_coverage').get().n,0);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM business_escrow_release_coverage_attempt_scopes').get().n,0);
});

test('publication replacement during the source call cannot commit an obsolete response',async t=>{
 const f=await fixture(t),work=await runBusinessEscrowReleaseCoverage(f.env,async()=>{f.db.db.prepare('UPDATE business_month_publications SET source_revision=source_revision+1 WHERE month=?').run(month);return coverage(f.refs);},{through_month:through},{now:f.now});
 assert.equal(work.status,'SUPERSEDED');assert.equal(work.service_reads,1);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM business_escrow_release_coverage').get().n,0);
});

test('a new publication bypasses the old backoff once; failure of that scope then respects its retry',async t=>{
 const f=await fixture(t);await runBusinessEscrowReleaseCoverage(f.env,async()=>coverage(f.refs,{identity:true}),{through_month:through},{now:f.now});
 f.db.db.prepare('UPDATE business_month_publications SET source_revision=source_revision+1 WHERE month=?').run(month);let reads=0;
 const unavailable=async()=>{reads++;return {status:'UNAVAILABLE',diagnostic:{code:'FINANCE_ESCROW_RELEASES_TIMEOUT'}};};
 assert.equal((await runBusinessEscrowReleaseCoverage(f.env,unavailable,{through_month:through},{now:f.now})).status,'UNAVAILABLE');
 const retry=await runBusinessEscrowReleaseCoverage(f.env,unavailable,{through_month:through},{now:f.now});assert.equal(retry.status,'RETRY_WAIT');assert.equal(retry.service_reads,0);assert.equal(reads,1);
 const saved=await readBusinessEscrowReleaseCoverage(f.env,{month},{now:f.now});assert.equal(saved.status,'PARTIAL_UNAVAILABLE');assert.equal(saved.report.status,'IDENTITY_COMPLETE');
 const raw=JSON.parse(f.db.db.prepare('SELECT payload FROM business_escrow_release_coverage').get().payload);assert.equal(raw.schema,'finance_escrow_release_coverage_v1');assert.ok(projectEscrowReleaseCoverageFrame(raw),'rollback App still recognizes raw Finance report');
});

test('a month rollover during the source call yields without saving the old horizon',async t=>{
 const f=await fixture(t),clock={value:Date.UTC(2026,10,30,23,59,59)+3*3600000};
 const result=await runBusinessEscrowReleaseCoverage(f.env,async()=>{clock.value+=2000;return coverage(f.refs);},{through_month:through},{now:()=>clock.value});assert.equal(result.status,'SUPERSEDED');assert.equal(result.service_reads,1);
 assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM business_escrow_release_coverage').get().n,0);
});

test('an expired lease cannot persist its source response or clear a newer lease token',async t=>{
 const f=await fixture(t),clock={value:nowMs},newToken=uuid(99);
 const result=await runBusinessEscrowReleaseCoverage(f.env,async()=>{clock.value+=91000;f.db.db.prepare('UPDATE business_escrow_release_coverage_leases SET lease_token=?,lease_until=?').run(newToken,clock.value/1000+90);return coverage(f.refs);},{through_month:through},{now:()=>clock.value});assert.equal(result.status,'SUPERSEDED');assert.equal(result.service_reads,1);
 assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM business_escrow_release_coverage').get().n,0);assert.equal(f.db.db.prepare('SELECT lease_token FROM business_escrow_release_coverage_leases').get().lease_token,newToken);
});

test('the first new calendar horizon bypasses six-hour retry but a failed attempt does not loop',async t=>{
 const f=await fixture(t),endOfNovember=Date.UTC(2026,10,30,23,59,59)+3*3600000;
 await runBusinessEscrowReleaseCoverage(f.env,async()=>coverage(f.refs,{identity:true}),{through_month:through},{now:()=>endOfNovember});
 assert.ok(f.db.db.prepare('SELECT next_attempt_at FROM business_escrow_release_coverage').get().next_attempt_at>(endOfNovember+2000)/1000);
 let count=0;const source=async(_,input)=>{count++;assert.equal(input.through_month,'2026-12');return {status:'UNAVAILABLE',diagnostic:{code:'FINANCE_ESCROW_RELEASES_TIMEOUT'}};};
 const first=await runBusinessEscrowReleaseCoverage(f.env,source,{through_month:'2026-12'},{now:()=>endOfNovember+2000});assert.equal(first.status,'UNAVAILABLE');assert.equal(first.service_reads,1);
 const retry=await runBusinessEscrowReleaseCoverage(f.env,source,{through_month:'2026-12'},{now:()=>endOfNovember+2000});assert.equal(retry.status,'RETRY_WAIT');assert.equal(retry.service_reads,0);assert.equal(count,1);
 const retained=await readBusinessEscrowReleaseCoverage(f.env,{month},{now:()=>endOfNovember+2000});assert.equal(retained.status,'PARTIAL_UNAVAILABLE');assert.equal(retained.report.through_month,'2026-11');assert.ok(retained.report.pending.includes('BANK_RECEIPT_NOT_VERIFIED'));
});

test('a legacy raw stored report remains readable and gets one bounded attempt-scope upgrade',async t=>{
 const f=await fixture(t),raw=coverage(f.refs,{identity:true});f.db.db.prepare('INSERT INTO business_escrow_release_coverage VALUES(?,?,?,?,?,?,?)').run(month,JSON.stringify(raw),stamp,stamp,'SUCCESS',null,stamp+21600);
 const before=f.db.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n;
 const read=await readBusinessEscrowReleaseCoverage(f.env,{month},{now:f.now});assert.equal(read.status,'AVAILABLE');assert.equal(read.report.status,'IDENTITY_COMPLETE');assert.equal(f.db.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n,before);
 let calls=0;await runBusinessEscrowReleaseCoverage(f.env,async()=>{calls++;return raw;},{through_month:through},{now:f.now});assert.equal(calls,1);
 assert.equal((await runBusinessEscrowReleaseCoverage(f.env,async()=>{calls++;return raw;},{through_month:through},{now:f.now})).status,'RETRY_WAIT');assert.equal(calls,1);
 assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM business_escrow_release_coverage_attempt_scopes').get().n,1);
});

test('owner GET cannot label a report current after its published source revision changes',async t=>{
 const f=await fixture(t);await runBusinessEscrowReleaseCoverage(f.env,async()=>coverage(f.refs),{through_month:through},{now:f.now});
 const frames=structuredClone(f.frames);frames[0].revision++;
 const payload={start_date:month+'-01',end_date:month+'-31',slots:frames.map(frame=>({start_date:frame.start_date,end_date:frame.end_date,frame}))},row={revision:8,payload:JSON.stringify(payload),created_at:stamp-1200,updated_at:stamp};
 f.db.db.prepare('UPDATE business_month_runs SET revision=?,payload=?,updated_at=? WHERE month=?').run(row.revision,row.payload,row.updated_at,month);assert.ok(await saveCompletedBusinessMonth(f.env,month,{row,payload,complete:true},{now:f.now}));
 const stale=await readBusinessEscrowReleaseCoverage(f.env,{month},{now:f.now});assert.equal(stale.status,'PENDING');assert.equal(stale.report,null);assert.equal(stale.attempt,null);
 const old=JSON.parse(f.db.db.prepare('SELECT payload FROM business_escrow_release_coverage').get().payload);assert.equal(old.sources[0].source_revision,2,'historical valid raw evidence is not deleted by a GET');
 const refs=frames.map(frame=>({run_id:frame.run_id,source_revision:frame.revision}));assert.equal((await runBusinessEscrowReleaseCoverage(f.env,async()=>coverage(refs),{through_month:through},{now:f.now})).status,'COLLECTING');
 assert.equal((await readBusinessEscrowReleaseCoverage(f.env,{month},{now:f.now})).report.sources[0].source_revision,3);
});

test('a serialized owner projector retains its validators without server-module closures',async t=>{
 const f=await fixture(t);await runBusinessEscrowReleaseCoverage(f.env,async()=>coverage(f.refs),{through_month:through},{now:f.now});const value=await readBusinessEscrowReleaseCoverage(f.env,{month},{now:f.now});
 const isolated=(0,eval)('('+projectBusinessEscrowReleaseCoverage.toString()+')');assert.deepEqual(isolated(value,projectEscrowReleaseCoverageFrame),value);assert.equal(isolated({...value,attempt:{checked_at:stamp,status:'UNAVAILABLE',code:'SECRET_STACK',next_attempt_at:stamp}},projectEscrowReleaseCoverageFrame),null);
});

test('a source cannot replace a newer retained financial observation with older evidence',async t=>{
 const f=await fixture(t),newer=coverage(f.refs);newer.checked_at=stamp+30;
 await runBusinessEscrowReleaseCoverage(f.env,async()=>newer,{through_month:through},{now:f.now});f.db.db.prepare('UPDATE business_escrow_release_coverage SET next_attempt_at=?').run(stamp);
 const result=await runBusinessEscrowReleaseCoverage(f.env,async()=>coverage(f.refs),{through_month:through},{now:f.now});assert.equal(result.status,'UNAVAILABLE');
 assert.equal((await readBusinessEscrowReleaseCoverage(f.env,{month},{now:f.now})).report.checked_at,stamp+30);
});

test('a paused tracker performs no source call or schema initialization',async t=>{
 const db=new D1();t.after(()=>db.db.close());let calls=0;
 const result=await runBusinessEscrowReleaseCoverage({ADMIN_DB:db},async()=>{calls++;},{through_month:through},{now:()=>nowMs,canRun:async()=>false});assert.equal(result.status,'PAUSED');assert.equal(calls,0);assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n,0);
});

test('time consumed by a canRun check cannot start a private read after the cohort lease expires',async t=>{
 const f=await fixture(t),clock={value:nowMs};let checks=0,reads=0;
 const result=await runBusinessEscrowReleaseCoverage(f.env,async()=>{reads++;return coverage(f.refs);},{through_month:through},{now:()=>clock.value,canRun:async()=>{if(++checks===2)clock.value+=91000;return true;}});
 assert.equal(result.status,'SUPERSEDED');assert.equal(result.service_reads,0);assert.equal(reads,0);
});

test('time consumed by the final canRun check cannot commit through an expired lease',async t=>{
 const f=await fixture(t),clock={value:nowMs};let checks=0;
 const result=await runBusinessEscrowReleaseCoverage(f.env,async()=>coverage(f.refs),{through_month:through},{now:()=>clock.value,canRun:async()=>{if(++checks===3)clock.value+=91000;return true;}});
 assert.equal(result.status,'SUPERSEDED');assert.equal(result.service_reads,1);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM business_escrow_release_coverage').get().n,0);
});
