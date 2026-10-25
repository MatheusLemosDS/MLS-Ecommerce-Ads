import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {BUSINESS_MONTH_PUBLICATION_SCHEMA,saveCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {BUSINESS_ESCROW_RELEASES_SCHEMA,BusinessEscrowReleasesError,projectBusinessEscrowReleases,readBusinessEscrowReleases,runBusinessEscrowReleases} from '../src/business-escrow-releases.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {projectEscrowReleaseFrame} from '../../finance/src/escrow-release-frame.mjs';
const month='2026-10',at=Date.UTC(2026,9,25,15),stamp=at/1000,monthFrom=Date.UTC(2026,9,1,3)/1000,uuid=index=>'11111111-1111-4111-8111-'+String(index).padStart(12,'0');
function sourceFrame(index,offset=0){
 const start_date=month+'-'+String(index*15+1).padStart(2,'0'),end_date=month+'-'+String(Math.min(25,index*15+15)).padStart(2,'0');
 const frame={schema:'finance_business_period_v1',run_id:uuid(index+offset+1),revision:2,status:'COMPLETE',start_date,end_date,cutoff_at:stamp-3,checked_at:stamp,source_checked_at:{oldest_at:stamp-1,latest_at:stamp-1},currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:1,paid:1,completed:1,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'100',sales_base_raw:'100',known_expected_repass_raw:'80',expected_repass_raw:'80',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:0,known_base_raw:'100',known_tax_raw:'2'},items:[{item_id:String(100+index),model_id:'0',quantity:1}],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};assert.ok(projectBusinessPeriodFrame(frame));return frame;
}
function report(frames,checked=stamp){
 const cutoff=stamp-60,windows=Math.ceil((cutoff-monthFrom)/(7*86400)),count=frames.length;
 const value={schema:'finance_escrow_releases_v1',month,checked_at:checked,status:'CHECKED',sources:frames.map(frame=>({run_id:frame.run_id,source_revision:frame.revision,start_date:frame.start_date,end_date:frame.end_date,status:'AVAILABLE',orders:frame.coverage.orders,paid_orders:frame.coverage.paid,finance_oldest_at:frame.source_checked_at.oldest_at,finance_latest_at:frame.source_checked_at.latest_at,expected_repass_cents:8000})),calendar:{scan_id:uuid(80),status:'COMPLETE',from_at:monthFrom,end_before_at:cutoff,cutoff_at:cutoff,source_oldest_at:stamp-10,source_latest_at:stamp-2,observations:count,unique_orders:count,ambiguous_orders:0,verified_orders:count,unverified_orders:0,known_verified_release_cents:count*8100,total_release_cents:count*8100},collection:{scan_id:uuid(80),status:'COMPLETE',cutoff_at:cutoff,windows_total:windows,windows_complete:windows,pages_read:windows,observations:count,next_attempt_at:0,diagnostic:null},matching:{status:'AVAILABLE',paid_orders:count,located_paid_orders:count,unlocated_paid_orders:0,ambiguous_paid_orders:0,verified_paid_orders:count,known_expected_located_cents:count*8000,expected_located_cents:count*8000,known_verified_release_cents:count*8100,verified_release_cents:count*8100,comparison_difference_cents:count*100,outside_cohort_orders:0},pending:['BANK_RECEIPT_NOT_VERIFIED'],basis:'RELEASE_CALENDAR_AND_ORDER_CREATE_COHORT_NOT_BANK_RECEIPT'};
 if(!count){value.status='PARTIAL';value.calendar={...value.calendar,observations:2,unique_orders:2,verified_orders:0,unverified_orders:2,known_verified_release_cents:0,total_release_cents:null};value.collection.observations=2;value.matching={...value.matching,status:'SOURCE_MISSING',paid_orders:null,unlocated_paid_orders:null,expected_located_cents:null,verified_release_cents:null,comparison_difference_cents:null,outside_cohort_orders:null};value.pending=['SOURCE_MISSING','MATCHING_INCOMPLETE','RELEASE_AMOUNT_UNVERIFIED','BANK_RECEIPT_NOT_VERIFIED'];}
 assert.ok(projectEscrowReleaseFrame(value));return value;
}
class ObservedD1 extends D1{
 constructor(){super();this.beforeClaim=null;}
 prepare(sql){const row=super.prepare(sql),run=row.run.bind(row);row.run=async()=>{if(sql.startsWith('INSERT INTO business_escrow_release_leases')&&this.beforeClaim){const action=this.beforeClaim;this.beforeClaim=null;await action();}return run();};return row;}
}
async function fixture(t,{published=true}={}){
 const db=new ObservedD1(),clock={time:at},now=()=>clock.time,env={ADMIN_DB:db};t.after(()=>db.db.close());
 await db.batch(['CREATE TABLE business_month_runs(month TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)',...BUSINESS_MONTH_PUBLICATION_SCHEMA,...BUSINESS_ESCROW_RELEASES_SCHEMA].map(sql=>db.prepare(sql)));
 async function publish(revision=10,offset=0){const frames=[sourceFrame(0,offset),sourceFrame(1,offset)],payload={start_date:month+'-01',end_date:month+'-25',slots:frames.map(frame=>({start_date:frame.start_date,end_date:frame.end_date,frame}))},raw=JSON.stringify(payload),row={revision,payload:raw,created_at:stamp-60,updated_at:stamp};db.db.prepare('INSERT OR REPLACE INTO business_month_runs VALUES(?,?,?,?,?)').run(month,revision,raw,row.created_at,row.updated_at);assert.ok(await saveCompletedBusinessMonth(env,month,{row,payload,complete:true},{now}));return frames;}
 const frames=published?await publish():[];return {env,db,clock,now,frames,publish};
}
const stored=f=>({reports:f.db.db.prepare('SELECT * FROM business_escrow_release_reports ORDER BY month,cohort_key').all(),attempts:f.db.db.prepare('SELECT * FROM business_escrow_release_attempts ORDER BY month,cohort_key').all()});

test('owner reads are local and a missing publication keeps cohort money unknown while calendar collection remains eligible',async t=>{
 const f=await fixture(t,{published:false}),before=stored(f),value=await readBusinessEscrowReleases(f.env,{month},{now:f.now});assert.equal(value.status,'COLLECTING');assert.equal(value.cohort,null);assert.equal(value.report,null);assert.deepEqual(stored(f),before);
 let calls=0;const work=await runBusinessEscrowReleases(f.env,async(_,input)=>{calls++;assert.deepEqual(input,{operation:'step',month,sources:[]});return report([]);},{month},{now:f.now});assert.equal(work.source_reads,1);assert.equal(calls,1);
 const observed=await readBusinessEscrowReleases(f.env,{month},{now:f.now});assert.equal(observed.status,'PARTIAL');assert.equal(observed.cohort,null);assert.equal(observed.report.calendar.total_release_cents,null);assert.equal(observed.report.matching.paid_orders,null);assert.equal(calls,1);
 for(const input of [{month,shop_id:1},{month:'2026-13'},{month:'2026-11'},{}])await assert.rejects(readBusinessEscrowReleases(f.env,input,{now:f.now}),error=>error instanceof BusinessEscrowReleasesError&&error.status===400);
});

test('one scheduler request binds the published source identity, money and original times without changing the publication',async t=>{
 const f=await fixture(t),publication=f.db.db.prepare('SELECT * FROM business_month_publications').get(),calls=[];
 const work=await runBusinessEscrowReleases(f.env,async(_,input)=>{calls.push(input);return report(f.frames);},{month},{now:f.now});assert.equal(work.source_reads,1);assert.equal(work.repeat,false);assert.deepEqual(calls,[{operation:'step',month,sources:f.frames.map(frame=>({run_id:frame.run_id,source_revision:frame.revision}))}]);
 const value=await readBusinessEscrowReleases(f.env,{month},{now:f.now});assert.equal(value.status,'CHECKED');assert.equal(value.cohort.publication_revision,10);assert.equal(value.cohort.end_date,'2026-10-25');assert.equal(value.report.calendar.cutoff_at,stamp-60);assert.equal(value.report.sources[0].finance_oldest_at,stamp-1);assert.equal(value.report.matching.comparison_difference_cents,200);assert.equal(value.attempt.next_attempt_at,stamp+900);assert.deepEqual(f.db.db.prepare('SELECT * FROM business_month_publications').get(),publication);assert.ok(!Object.hasOwn(value.report,'net_profit_cents'));
 assert.equal((await runBusinessEscrowReleases(f.env,async()=>{throw Error('not due');},{month},{now:f.now})).source_reads,0);
});

test('provider failure retains a validated report and its original observation dates without exporting unknown provider errors',async t=>{
 const f=await fixture(t);await runBusinessEscrowReleases(f.env,async()=>report(f.frames),{month},{now:f.now});const before=stored(f).reports;f.clock.time+=901000;
 const work=await runBusinessEscrowReleases(f.env,async()=>({schema:'finance_escrow_releases_unavailable_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_ESCROW_RELEASES_TIMEOUT',http:null},message:'PRIVATE_PROVIDER_TOKEN'}),{month},{now:f.now});assert.equal(work.status,'UNAVAILABLE');assert.equal(work.repeat,false);
 const value=await readBusinessEscrowReleases(f.env,{month},{now:f.now});assert.equal(value.status,'PARTIAL');assert.equal(value.report.checked_at,stamp);assert.equal(value.report.sources[0].finance_oldest_at,stamp-1);assert.equal(value.attempt.code,'FINANCE_ESCROW_RELEASES_TIMEOUT');assert.equal(value.attempt.next_attempt_at,stamp+1201);assert.deepEqual(stored(f).reports,before);assert.doesNotMatch(JSON.stringify(value),/PRIVATE_PROVIDER_TOKEN|order_sn|payout_raw/);
});

test('equivalent source ordering preserves identity and every monetary bind instead of depending on transport row order',async t=>{
 const f=await fixture(t),value=report(f.frames);value.sources.reverse();assert.ok(projectEscrowReleaseFrame(value));
 const result=await runBusinessEscrowReleases(f.env,async()=>value,{month},{now:f.now});assert.equal(result.status,'CHECKED');
 const observed=await readBusinessEscrowReleases(f.env,{month},{now:f.now});assert.equal(observed.status,'CHECKED');assert.equal(observed.cohort.sources[0].run_id,f.frames[0].run_id);assert.equal(observed.report.sources[0].run_id,f.frames[1].run_id);assert.equal(observed.report.matching.comparison_difference_cents,200);
});

test('a refreshed publication cannot inherit a previous cohort report and a mathematically coherent wrong base is rejected',async t=>{
 const f=await fixture(t);await runBusinessEscrowReleases(f.env,async()=>report(f.frames),{month},{now:f.now});const before=stored(f).reports;const frames=await f.publish(11,10),changed=await readBusinessEscrowReleases(f.env,{month},{now:f.now});assert.equal(changed.cohort.publication_revision,11);assert.equal(changed.report,null);assert.equal(changed.attempt,null);
 const poisoned=report(frames);poisoned.sources[0].expected_repass_cents=8100;poisoned.matching.expected_located_cents=16100;poisoned.matching.known_expected_located_cents=16100;poisoned.matching.comparison_difference_cents=100;assert.ok(projectEscrowReleaseFrame(poisoned));
 const work=await runBusinessEscrowReleases(f.env,async()=>poisoned,{month},{now:f.now});assert.equal(work.status,'UNAVAILABLE');assert.deepEqual(stored(f).reports,before);assert.equal((await readBusinessEscrowReleases(f.env,{month},{now:f.now})).attempt.code,'FINANCE_ESCROW_RELEASES_SCOPE_MISMATCH');
});

test('a publication change during the request only stores the old exact cohort and never paints it as the new one',async t=>{
 const f=await fixture(t);let enter,release;const entered=new Promise(resolve=>enter=resolve),held=new Promise(resolve=>release=resolve);
 const pending=runBusinessEscrowReleases(f.env,async()=>{enter();await held;return report(f.frames);},{month},{now:f.now});await entered;await f.publish(11,10);release();assert.equal((await pending).source_reads,1);
 const value=await readBusinessEscrowReleases(f.env,{month},{now:f.now});assert.equal(value.cohort.publication_revision,11);assert.equal(value.report,null);assert.equal(stored(f).reports.length,1);
});

test('pause, overlapping calls and a stale pre-claim observation cannot duplicate a source request',async t=>{
 const f=await fixture(t);let calls=0,enabled=false;const source=async()=>{calls++;return report(f.frames);};assert.equal((await runBusinessEscrowReleases(f.env,source,{month},{now:f.now,canRun:async()=>enabled})).status,'PAUSED');assert.equal(calls,0);
 enabled=true;let enter,release;const entered=new Promise(resolve=>enter=resolve),held=new Promise(resolve=>release=resolve),pending=runBusinessEscrowReleases(f.env,async()=>{calls++;enter();await held;return report(f.frames);},{month},{now:f.now,canRun:async()=>enabled});await entered;assert.equal((await runBusinessEscrowReleases(f.env,source,{month},{now:f.now})).status,'LEASED');enabled=false;release();assert.equal((await pending).status,'PAUSED');assert.deepEqual(stored(f),{reports:[],attempts:[]});
 f.db.beforeClaim=async()=>{await runBusinessEscrowReleases(f.env,source,{month},{now:f.now});};const observed=await runBusinessEscrowReleases(f.env,source,{month},{now:f.now});assert.equal(observed.status,'RETRY_WAIT');assert.equal(observed.source_reads,0);assert.equal(calls,2);
});

test('only normal calendar progress continues soon; rate limits, permissions and completion preserve their deadlines',async t=>{
 for(const [status,diagnostic,after,delay,repeat] of [['RUNNING',null,0,60,true],['RETRY_WAIT','RATE_LIMIT',1800,1800,false],['BLOCKED','PERMISSION_DENIED',3600,21600,false],['COMPLETE',null,0,900,false]]){
  const f=await fixture(t),frame=report(f.frames);if(status!=='COMPLETE'){frame.status=status==='BLOCKED'?'BLOCKED':'PARTIAL';frame.collection={...frame.collection,scan_id:uuid(81),status,cutoff_at:stamp,windows_complete:0,pages_read:0,observations:0,next_attempt_at:after?stamp+after:0,diagnostic};if(diagnostic)frame.pending.push('RELEASE_SOURCE_UNAVAILABLE');assert.ok(projectEscrowReleaseFrame(frame));}
  const work=await runBusinessEscrowReleases(f.env,async()=>frame,{month},{now:f.now});assert.equal(work.repeat,repeat);assert.equal((await readBusinessEscrowReleases(f.env,{month},{now:f.now})).attempt.next_attempt_at,stamp+delay);
 }
});

test('the owner projector is standalone, detached, exact about source-bound amounts and never invokes accessors',async t=>{
 const f=await fixture(t);await runBusinessEscrowReleases(f.env,async()=>report(f.frames),{month},{now:f.now});const value=await readBusinessEscrowReleases(f.env,{month},{now:f.now}),projected=projectBusinessEscrowReleases(value,projectEscrowReleaseFrame);assert.ok(projected);projected.cohort.sources[0].run_id=uuid(99);assert.notEqual(value.cohort.sources[0].run_id,uuid(99));
 const context=vm.createContext({serialized:JSON.stringify(value)});vm.runInContext(projectEscrowReleaseFrame.toString()+'\n'+projectBusinessEscrowReleases.toString()+'\nglobalThis.result=projectBusinessEscrowReleases(JSON.parse(serialized),projectEscrowReleaseFrame);',context);assert.deepEqual(JSON.parse(JSON.stringify(context.result)),value);
 for(const mutate of [row=>row.order_sn='PRIVATE_ORDER',row=>row.cohort.sources[0].paid_orders++,row=>row.report.sources[0].source_revision++,row=>row.report.sources[0].expected_repass_cents=9000,row=>row.attempt.code='PRIVATE_TOKEN']){const wrong=structuredClone(value);mutate(wrong);assert.equal(projectBusinessEscrowReleases(wrong,projectEscrowReleaseFrame),null);}
 let accessed=false;const malicious={...value};Object.defineProperty(malicious,'report',{get(){accessed=true;throw Error();},enumerable:true});assert.equal(projectBusinessEscrowReleases(malicious,projectEscrowReleaseFrame),null);assert.equal(accessed,false);
});

test('cache retention keeps eight signatures per month and protects the current scope even when observation times tie',async t=>{
 const f=await fixture(t,{published:false});let latest;
 for(let index=1;index<=9;index++){latest=await f.publish(10+index,index===9?0:index*10);const work=await runBusinessEscrowReleases(f.env,async()=>report(latest),{month},{now:f.now});assert.equal(work.status,'CHECKED');}
 const rows=stored(f);assert.equal(rows.reports.length,8);assert.equal(rows.attempts.length,8);assert.deepEqual(new Set(rows.reports.map(row=>row.cohort_key)),new Set(rows.attempts.map(row=>row.cohort_key)));
 const current=await readBusinessEscrowReleases(f.env,{month},{now:f.now});assert.equal(current.status,'CHECKED');assert.equal(current.cohort.sources[0].run_id,latest[0].run_id);assert.equal(current.cohort.publication_revision,19);
 await f.publish(20,10);const evicted=await readBusinessEscrowReleases(f.env,{month},{now:f.now});assert.equal(evicted.report,null);assert.equal(evicted.attempt,null);
 // A failed refresh of the retained scope keeps its last validated report.
 await f.publish(21,0);f.clock.time+=901000;const previous=(await readBusinessEscrowReleases(f.env,{month},{now:f.now})).report;
 await runBusinessEscrowReleases(f.env,async()=>{throw Error('fixture source unavailable');},{month},{now:f.now});const failed=await readBusinessEscrowReleases(f.env,{month},{now:f.now});assert.deepEqual(failed.report,previous);assert.equal(failed.attempt.status,'UNAVAILABLE');assert.equal(stored(f).reports.length,8);
});

test('a lease lost before the atomic save cannot insert a ninth signature or run retention over the winner cache',async t=>{
 const f=await fixture(t,{published:false});for(let index=1;index<=8;index++){const frames=await f.publish(10+index,index*10);await runBusinessEscrowReleases(f.env,async()=>report(frames),{month},{now:f.now});}
 const frames=await f.publish(19,0),before=stored(f);let enter,release;const entered=new Promise(resolve=>enter=resolve),held=new Promise(resolve=>release=resolve);
 const pending=runBusinessEscrowReleases(f.env,async()=>{enter();await held;return report(frames);},{month},{now:f.now});await entered;
 const winner=uuid(777);f.db.db.prepare('UPDATE business_escrow_release_leases SET lease_token=?,lease_until=? WHERE month=?').run(winner,stamp+90,month);release();assert.equal((await pending).status,'LEASED');assert.deepEqual(stored(f),before);assert.equal(f.db.db.prepare('SELECT lease_token FROM business_escrow_release_leases WHERE month=?').get(month).lease_token,winner);
});
