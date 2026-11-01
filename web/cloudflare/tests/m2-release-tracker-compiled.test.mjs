import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {projectEscrowReleaseCoverageFrame} from '../../finance/src/escrow-release-frame.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';
import {historyReturnsReport} from './m2-history-fixture.mjs';
import {TrackerD1,trackerMonth,trackerThrough,trackerTime,trackerStamp,publishTrackerMonth,trackerCoverage,forceTrackerHistory,setTrackerAuditTurn} from './m2-release-tracker-fixture.mjs';

const origin='https://release-tracker.compiled.test',endpoint='/api/admin/finance/escrow-release-coverage';
const totalChanges=db=>db.db.prepare('SELECT total_changes() AS n').get().n;
const tables=db=>db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row=>row.name);
async function compiledApp(minify){
 const source=await readFile(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8'),seam='return {adminFetch,schedule,scheduledWork,workspaceAuthFetch};';
 assert.equal(source.split(seam).length,2);
 // Instrument only this in-memory test bundle; production exports no seam.
 const contents=source.replace(seam,'return {adminFetch,schedule,scheduledWork,workspaceAuthFetch,runBusinessFinancialAudits,runBusinessEscrowReleaseCoverage,readBusinessEscrowReleaseCoverage};')+'\nexport {brazaAdmin as trackerSmoke};';
 const result=await build({stdin:{contents,loader:'js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
async function context(t,app){
 const db=new TrackerD1(),clock={time:trackerTime},now=()=>clock.time,SavedDate=globalThis.Date,savedFetch=globalThis.fetch;
 globalThis.Date=class extends SavedDate{constructor(...args){super(...(args.length?args:[clock.time]));}static now(){return clock.time;}};
 const calls=[];globalThis.fetch=async request=>{calls.push(request);throw Error('PRIVATE_UNEXPECTED_SOURCE');};
 const env={ADMIN_DB:db,APP_INTERNAL_SECRET:'PRIVATE_RELEASE_TRACKER_APP_'+'a'.repeat(40),ADMIN_USERNAME:'tracker-owner',ADMIN_PASSWORD:'tracker-owner-password-123456',ADMIN_SESSION_SECRET:'PRIVATE_RELEASE_TRACKER_OWNER_'+'o'.repeat(40),REVIEW_USERNAME:'tracker-review',REVIEW_PASSWORD:'tracker-review-password-123456',SESSION_SECRET:'PRIVATE_RELEASE_TRACKER_REVIEW_'+'r'.repeat(40)};
 t.after(()=>{globalThis.Date=SavedDate;globalThis.fetch=savedFetch;db.db.close();});
 async function login(owner){const response=await app.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:owner?env.ADMIN_USERNAME:env.REVIEW_USERNAME,password:owner?env.ADMIN_PASSWORD:env.REVIEW_PASSWORD})}),env);assert.equal(response.status,303);return response.headers.getSetCookie().find(value=>value.includes('Max-Age=28800')).split(';')[0];}
 const owner=await login(true),review=await login(false);
 const invoke=(query='?month='+trackerMonth,{cookie=owner,method='GET'}={})=>app.fetch(new Request(origin+endpoint+query,{method,headers:{cookie}}),env);
 const cron=async()=>{const tasks=[];await app.scheduled({cron:'* * * * *',scheduledTime:clock.time},env,{waitUntil:work=>tasks.push(work)});assert.equal(tasks.length,1);return(await Promise.all(tasks))[0];};
 return {db,env,clock,now,calls,owner,review,invoke,cron};
}
function saveAuditedPriorReturns(f){
 // This transport test isolates calendar coverage while the production
 // scheduler still has CURRENT/PREVIOUS Returns enabled and eligible by retry.
 for(const frame of f.frames){const report=historyReturnsReport(frame,trackerStamp),c=frame.coverage;Object.assign(report.source_checked_at,{returns_oldest_at:null,returns_latest_at:null});Object.assign(report.coverage,{orders:c.orders,evidence_orders:c.orders,missing_evidence_orders:0,paid_orders:c.paid,review_orders:c.cancel_pending+c.other+c.unknown,return_orders:c.returns,return_unknown_orders:c.returns_unknown});Object.assign(report.adjustments,{known_adjustment_cents:0,after_adjustment_repass_cents:8000});Object.assign(report.returns,{reference_count:0,checked_count:0,pending_count:0,known_requested_refund_cents:0,requested_amount_complete:true,permission:'UNKNOWN'});report.cases=[];report.truncation={truncated:false,cases_total:0,cases_included:0};report.pending=['SETTLEMENT_NOT_RECONCILED'];assert.ok(projectReconciliationFrame(report));assert.equal(report.source_revision,frame.revision);assert.equal(report.start_date,frame.start_date);assert.equal(report.end_date,frame.end_date);assert.equal(report.source_checked_at.finance_oldest_at,frame.source_checked_at.oldest_at);assert.equal(report.source_checked_at.finance_latest_at,frame.source_checked_at.latest_at);assert.equal(report.coverage.orders,c.orders);assert.equal(report.coverage.paid_orders,c.paid);assert.equal(report.coverage.return_orders,c.returns);
  f.db.db.prepare('INSERT INTO business_reconciliation_reports(run_id,source_revision,start_date,end_date,payload,checked_at) VALUES(?,?,?,?,?,?)').run(frame.run_id,frame.revision,frame.start_date,frame.end_date,JSON.stringify(report),report.checked_at);f.db.db.prepare("INSERT INTO business_reconciliation_attempts(run_id,source_revision,checked_at,status,code,next_attempt_at) VALUES(?,?,?,'SUCCESS',NULL,?)").run(frame.run_id,frame.revision,report.checked_at,report.checked_at+900);
 }
}
async function prepared(t,app){const f=await context(t,app);assert.equal((await f.cron()).lane,'MAINTENANCE');const frames=await publishTrackerMonth(f.env,f.now);return {...f,frames,refs:frames.map(frame=>({run_id:frame.run_id,source_revision:frame.revision}))};}

for(const minify of [false,true])test(`generated release tracker follows prior cohorts with bounded reads and immutable scope (minify=${minify})`,async t=>{
 const {default:app,trackerSmoke}=await compiledApp(minify);
 await t.test('owner GET selects only saved coverage; absent storage, auth and invalid requests never initialize work',async child=>{
  const f=await context(child,app);assert.deepEqual(tables(f.db),[]);const before=totalChanges(f.db),writes=f.db.writes.length;
  for(const cookie of ['',f.review,f.owner.replace(/.$/,'x')]){const response=await f.invoke('?month='+trackerMonth,{cookie});assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'UNAUTHORIZED'});}
  for(let index=0;index<2;index++){
   const response=await f.invoke();assert.equal(response.status,200,await response.clone().text());assert.equal(response.headers.get('cache-control'),'no-store');const value=await response.json();assert.equal(value.schema,'business_escrow_release_coverage_v1');assert.equal(value.status,'PENDING');assert.equal(value.report,null);assert.equal(value.attempt,null);
  }
  for(const method of ['POST','PUT','DELETE','PATCH','HEAD'])assert.equal((await f.invoke('?month='+trackerMonth,{method})).status,405,method);
  for(const query of ['', '?month=', '?month=2026-13','?month=2026-12','?month=2026-10&month=2026-09','?month=2026-10&refresh=true'])assert.equal((await f.invoke(query)).status,400,query||'missing query');
  assert.equal(totalChanges(f.db),before);assert.equal(f.db.writes.length,writes);assert.deepEqual(tables(f.db),[]);assert.equal(f.calls.length,0);
 });
 await t.test('a real scheduled HISTORY turn invokes the dedicated saved-calendar transport without opening the owner tab',async child=>{
  const f=await prepared(child,app);saveAuditedPriorReturns(f);forceTrackerHistory(f.db);let sourceReads=0;
  globalThis.fetch=async request=>{
   sourceReads++;assert.ok(request instanceof Request);assert.equal(request.url,'https://auth.brazacommerce.com.br/internal/shopee/finance/escrow-releases');assert.equal(request.method,'POST');assert.equal(request.redirect,'manual');assert.equal(request.headers.get('x-braza-app-key'),f.env.APP_INTERNAL_SECRET);assert.equal(request.headers.get('x-braza-release-contract'),'release-coverage-v1');for(const name of ['cookie','authorization','x-braza-finance-router'])assert.equal(request.headers.get(name),null);
   assert.deepEqual(await request.json(),{operation:'coverage',cohort_month:trackerMonth,through_month:trackerThrough,sources:f.refs});return Response.json(trackerCoverage(f.frames));
  };
  const publication={...f.db.db.prepare('SELECT * FROM business_month_publications WHERE month=?').get(trackerMonth)};f.db.rpc=0;
  const work=await f.cron();assert.equal(work.lane,'HISTORY');assert.equal(work.release_coverage,'COLLECTING');assert.equal(sourceReads,1);assert.equal(work.collection,'DEFERRED');assert.equal(work.reconciliation,'DEFERRED');assert.equal(work.releases,'DEFERRED');assert.equal(work.income,'DEFERRED');assert.equal(work.income_detail,'DEFERRED');assert.ok(f.db.rpc+sourceReads<=50,'HISTORY binding budget: '+JSON.stringify({d1:f.db.rpc,sourceReads}));
  assert.equal(f.db.db.prepare('SELECT next_work FROM financial_audit_turns WHERE month=?').get(trackerThrough).next_work,'RELEASES');
  const stored=f.db.db.prepare('SELECT payload,last_attempt_at,next_attempt_at,status FROM business_escrow_release_coverage WHERE cohort_month=?').get(trackerMonth);assert.equal(stored.status,'SUCCESS');assert.equal(stored.next_attempt_at-stored.last_attempt_at,900);assert.ok(projectEscrowReleaseCoverageFrame(JSON.parse(stored.payload)),'the new writer must remain readable by the existing 66e9 payload parser after rollback');
  assert.deepEqual({...f.db.db.prepare('SELECT * FROM business_month_publications WHERE month=?').get(trackerMonth)},publication);
  const before=totalChanges(f.db),writes=f.db.writes.length,reply=await f.invoke();assert.equal(reply.status,200);const read=await reply.json();assert.equal(read.report.coverage.located_orders,2);assert.equal(read.report.coverage.not_located_orders,1);assert.ok(read.report.pending.includes('BANK_RECEIPT_NOT_VERIFIED'));assert.ok(read.report.pending.includes('RELEASE_CYCLE_SEMANTICS_UNVERIFIED'));assert.equal(Object.hasOwn(read.report,'remaining_receivable_cents'),false);assert.equal(totalChanges(f.db),before);assert.equal(f.db.writes.length,writes);assert.equal(sourceReads,1);assert.doesNotMatch(JSON.stringify(read),/PRIVATE_|order_sn|buyer|access_token|refresh_token|cookie/);
 });
 await t.test('five-way audit rotation and retry skips still spend one actual private read',async child=>{
  const f=await prepared(child,app),calls=[];setTrackerAuditTurn(f.db);const labels=['RELEASES','RETURNS','INCOME','INCOME_DETAIL','COVERAGE'],services={getFinanceEscrowReleases:async()=>calls.push('RELEASES'),getFinanceReconciliation:async()=>calls.push('RETURNS'),getFinanceIncomeOverview:async()=>calls.push('INCOME'),getFinanceIncomeDetail:async()=>calls.push('INCOME_DETAIL'),getFinanceEscrowReleaseCoverage:async()=>calls.push('COVERAGE')};
  const handler=async(_,source)=>{await source();return {status:'CHECKED',source_reads:999,service_reads:999,repeat:false};},options={now:f.now,runReleases:handler,runReturns:handler,runIncome:handler,runIncomeDetail:handler,runCoverage:handler};
  for(const expected of labels){const value=await trackerSmoke.runBusinessFinancialAudits(f.env,services,{month:trackerThrough},options);assert.equal(value.selected,expected);assert.equal(value.source_reads,1);assert.ok(['RELEASES','RETURNS','INCOME','INCOME_DETAIL'].includes(f.db.db.prepare('SELECT next_work FROM financial_audit_turns').get().next_work),'an existing 66e9 worker must still understand the saved cursor after rollback');}
  assert.deepEqual(calls,labels);calls.length=0;setTrackerAuditTurn(f.db,{next:'COVERAGE'});
  const skipped=await trackerSmoke.runBusinessFinancialAudits(f.env,services,{month:trackerThrough},{...options,runCoverage:async()=>({status:'RETRY_WAIT',service_reads:0})});assert.equal(skipped.coverage_status,'RETRY_WAIT');assert.equal(skipped.selected,'RELEASES');assert.equal(skipped.source_reads,1);assert.deepEqual(calls,['RELEASES']);
  calls.length=0;setTrackerAuditTurn(f.db,{next:'COVERAGE'});
  const failed=await trackerSmoke.runBusinessFinancialAudits(f.env,services,{month:trackerThrough},{...options,runCoverage:async(_,source)=>{await source();await assert.rejects(()=>source(),/FINANCIAL_AUDIT_READ_BUDGET/);throw Error('PRIVATE_REPLAY_MUST_STOP');}});assert.equal(failed.coverage_status,'ERROR');assert.equal(failed.source_reads,1);assert.equal(failed.repeat,false);assert.deepEqual(calls,['COVERAGE']);assert.equal(f.db.db.prepare('SELECT next_work FROM financial_audit_turns').get().next_work,'RELEASES');
 });
 await t.test('coverage backoff preserves the report and a failed refresh cannot turn identity into bank proof',async child=>{
  const f=await prepared(child,app);let reads=0;const source=async()=>{reads++;return trackerCoverage(f.frames,{identity:true});};
  const first=await trackerSmoke.runBusinessEscrowReleaseCoverage(f.env,source,{through_month:trackerThrough},{now:f.now});assert.equal(first.status,'IDENTITY_COMPLETE');const initial=f.db.db.prepare('SELECT * FROM business_escrow_release_coverage').get();assert.equal(initial.next_attempt_at-initial.last_attempt_at,21600);
  const waiting=await trackerSmoke.runBusinessEscrowReleaseCoverage(f.env,source,{through_month:trackerThrough},{now:f.now});assert.equal(waiting.status,'RETRY_WAIT');assert.equal(waiting.service_reads,0);assert.equal(reads,1);
  f.db.db.prepare('UPDATE business_escrow_release_coverage SET next_attempt_at=?').run(trackerStamp);
  const failure=await trackerSmoke.runBusinessEscrowReleaseCoverage(f.env,async()=>{reads++;return {status:'UNAVAILABLE',diagnostic:{code:'FINANCE_ESCROW_RELEASES_TIMEOUT'},private:'PRIVATE_IGNORED_RESPONSE'};},{through_month:trackerThrough},{now:f.now});assert.equal(failure.status,'UNAVAILABLE');assert.equal(failure.service_reads,1);
  const stored=f.db.db.prepare('SELECT payload FROM business_escrow_release_coverage').get();assert.equal(stored.payload,initial.payload);const result=await trackerSmoke.readBusinessEscrowReleaseCoverage(f.env,{month:trackerMonth},{now:f.now});assert.equal(result.status,'PARTIAL_UNAVAILABLE');assert.equal(result.report.coverage.identity_complete_at_cutoff,true);assert.ok(result.report.pending.includes('BANK_RECEIPT_NOT_VERIFIED'));assert.ok(result.report.pending.includes('RELEASE_CYCLE_SEMANTICS_UNVERIFIED'));assert.equal(result.attempt.code,'FINANCE_ESCROW_RELEASES_TIMEOUT');assert.doesNotMatch(JSON.stringify(result),/PRIVATE_IGNORED_RESPONSE/);
 });
 await t.test('the required SQL policy fence prevents capture after a pause wins just before commit',async child=>{
  const f=await prepared(child,app);let paused=false,reads=0;
  f.db.beforeStatement=sql=>{if(!paused&&sql.startsWith('INSERT INTO business_escrow_release_coverage(')){paused=true;f.db.db.prepare('UPDATE business_sync_state SET enabled=0').run();}};
  const result=await trackerSmoke.runBusinessEscrowReleaseCoverage(f.env,async()=>{reads++;return trackerCoverage(f.frames);},{through_month:trackerThrough},{now:f.now});
  assert.equal(reads,1);assert.equal(paused,true);assert.notEqual(result.status,'COLLECTING');assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM business_escrow_release_coverage').get().n,0);assert.equal((await trackerSmoke.readBusinessEscrowReleaseCoverage(f.env,{month:trackerMonth},{now:f.now})).report,null);
 });
 await t.test('a new immutable publication fences an in-flight result and never overwrites an older saved frame',async child=>{
  const f=await prepared(child,app);await trackerSmoke.runBusinessEscrowReleaseCoverage(f.env,async()=>trackerCoverage(f.frames),{through_month:trackerThrough},{now:f.now});const initial={...f.db.db.prepare('SELECT * FROM business_escrow_release_coverage').get()};f.db.db.prepare('UPDATE business_escrow_release_coverage SET next_attempt_at=?').run(trackerStamp);const afterDue={...f.db.db.prepare('SELECT * FROM business_escrow_release_coverage').get()};
  const result=await trackerSmoke.runBusinessEscrowReleaseCoverage(f.env,async()=>{await publishTrackerMonth(f.env,f.now,{revision:8,offset:10});return trackerCoverage(f.frames);},{through_month:trackerThrough},{now:f.now});assert.equal(result.service_reads,1);assert.notEqual(result.status,'COLLECTING');assert.deepEqual({...f.db.db.prepare('SELECT * FROM business_escrow_release_coverage').get()},afterDue);assert.equal(initial.payload,afterDue.payload);
 });
 await t.test('a new release-calendar month refreshes a prior identity cutoff without waiting for the old six-hour deadline',async child=>{
  const f=await prepared(child,app);f.clock.time=Date.UTC(2026,11,1,2,59,30);
  const first=await trackerSmoke.runBusinessEscrowReleaseCoverage(f.env,async()=>trackerCoverage(f.frames,{identity:true,checked:Math.floor(f.now()/1000)}),{through_month:trackerThrough},{now:f.now});assert.equal(first.status,'IDENTITY_COMPLETE');
  const old=f.db.db.prepare('SELECT next_attempt_at FROM business_escrow_release_coverage').get();f.clock.time+=60000;assert.ok(old.next_attempt_at>f.now()/1000);
  const inputs=[];const next=await trackerSmoke.runBusinessEscrowReleaseCoverage(f.env,async(_,input)=>{inputs.push(input);return trackerCoverage(f.frames,{identity:true,through:'2026-12',checked:Math.floor(f.now()/1000)});},{through_month:'2026-12'},{now:f.now});assert.equal(next.status,'IDENTITY_COMPLETE');assert.equal(next.service_reads,1);assert.equal(inputs.length,1);assert.equal(inputs[0].through_month,'2026-12');
  const read=await trackerSmoke.readBusinessEscrowReleaseCoverage(f.env,{month:trackerMonth},{now:f.now});assert.equal(read.report.through_month,'2026-12');assert.equal(read.report.calendars.length,3);assert.ok(read.report.pending.includes('BANK_RECEIPT_NOT_VERIFIED'));
 });
 await t.test('an expired cohort lease cannot overwrite a newer worker and a live lease prevents a second source',async child=>{
  const f=await prepared(child,app);let entered,release;const waiting=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);let reads=0;
  const oldReport=trackerCoverage(f.frames),pending=trackerSmoke.runBusinessEscrowReleaseCoverage(f.env,async()=>{reads++;entered();await gate;return oldReport;},{through_month:trackerThrough},{now:f.now});
  await Promise.race([waiting,pending.then(value=>{throw Error('expected an in-flight source, got '+value.status);})]);
  const leased=await trackerSmoke.runBusinessEscrowReleaseCoverage(f.env,async()=>{reads++;throw Error('must not run');},{through_month:trackerThrough},{now:f.now});assert.equal(leased.status,'LEASED');assert.equal(leased.service_reads,0);assert.equal(reads,1);
  f.clock.time+=91000;const winnerReport=trackerCoverage(f.frames,{checked:Math.floor(f.now()/1000),identity:true}),winner=await trackerSmoke.runBusinessEscrowReleaseCoverage(f.env,async()=>{reads++;return winnerReport;},{through_month:trackerThrough},{now:f.now});assert.equal(winner.status,'IDENTITY_COMPLETE');release();
  const stale=await pending;assert.notEqual(stale.status,'COLLECTING');assert.equal(reads,2);assert.deepEqual(JSON.parse(f.db.db.prepare('SELECT payload FROM business_escrow_release_coverage').get().payload),winnerReport);
 });
});
