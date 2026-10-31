import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {saveCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';
import {historyReturnsReport} from './m2-history-fixture.mjs';
import {TrackerD1,trackerThrough,trackerTime,trackerStamp,trackerUuid,trackerSourceFrame,publishTrackerMonth,trackerCoverage} from './m2-release-tracker-fixture.mjs';

async function compiled(minify){
 const source=await readFile(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8'),seam='return {adminFetch,schedule,scheduledWork,workspaceAuthFetch};';assert.equal(source.split(seam).length,2);
 const contents=source.replace(seam,'return {adminFetch,schedule,scheduledWork,workspaceAuthFetch,acquireBackgroundLane,finishBackgroundLane,runBackgroundHistoryWork,readBusinessSyncState};')+'\nexport {brazaAdmin as bootstrapSmoke};';
 const result=await build({stdin:{contents,loader:'js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
async function fixture(t,app,{prior=true}={}){
 const db=new TrackerD1(),clock={time:trackerTime},now=()=>clock.time,SavedDate=globalThis.Date,savedFetch=globalThis.fetch;
 globalThis.Date=class extends SavedDate{constructor(...args){super(...(args.length?args:[clock.time]));}static now(){return clock.time;}};
 const env={ADMIN_DB:db,APP_INTERNAL_SECRET:'PRIVATE_BOOTSTRAP_APP_'+'a'.repeat(40),ADMIN_USERNAME:'bootstrap-owner',ADMIN_PASSWORD:'bootstrap-owner-password-123456',ADMIN_SESSION_SECRET:'PRIVATE_BOOTSTRAP_OWNER_'+'o'.repeat(40)};
 let requests=[];globalThis.fetch=async request=>{requests.push(request);throw Error('SYNTHETIC_UNEXPECTED_SOURCE');};
 const cron=async()=>{const tasks=[];await app.scheduled({cron:'* * * * *',scheduledTime:clock.time},env,{waitUntil:task=>tasks.push(task)});assert.equal(tasks.length,1);return(await Promise.all(tasks))[0];};
 t.after(()=>{globalThis.Date=SavedDate;globalThis.fetch=savedFetch;db.db.close();});assert.equal((await cron()).lane,'MAINTENANCE');
 const frames=prior?await publishTrackerMonth(env,now):[];
 db.db.prepare("UPDATE business_sync_state SET enabled=1,status='IDLE',month=?,summary=NULL,next_run_at=?,lease_token=NULL,lease_expires_at=NULL WHERE id=1").run(trackerThrough,trackerStamp+3600);
 db.db.exec("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=2,lease_token=NULL,lease_until=NULL;UPDATE background_history_fairness_state SET next_history_work='COST',finance_since_audit=0,last_auxiliary_at=NULL,returns_retry_at=0,reserved_returns_streak=0");
 return {db,env,clock,now,cron,frames,requests:()=>requests,respond(callback){globalThis.fetch=async request=>{requests.push(request);return callback(request);};}};
}
async function currentPublication(f,{audited=true}={}){
 const frame={...trackerSourceFrame(0),run_id:trackerUuid(301),start_date:trackerThrough+'-01',end_date:trackerThrough+'-10',cutoff_at:trackerStamp-3,checked_at:trackerStamp,source_checked_at:{oldest_at:trackerStamp-1,latest_at:trackerStamp-1},coverage:{...trackerSourceFrame(0).coverage,returns:1},items:[{item_id:'900',model_id:'0',quantity:1}]};assert.ok(projectBusinessPeriodFrame(frame));
 const payload={start_date:frame.start_date,end_date:frame.end_date,slots:[{start_date:frame.start_date,end_date:frame.end_date,frame}]},row={revision:10,payload:JSON.stringify(payload),created_at:trackerStamp-10,updated_at:trackerStamp};f.db.db.prepare('INSERT INTO business_month_runs(month,revision,payload,created_at,updated_at) VALUES(?,?,?,?,?)').run(trackerThrough,row.revision,row.payload,row.created_at,row.updated_at);assert.ok(await saveCompletedBusinessMonth(f.env,trackerThrough,{row,payload,complete:true},{now:f.now}));
 const report=historyReturnsReport(frame,trackerStamp);Object.assign(report.adjustments,{known_adjustment_cents:0,after_adjustment_repass_cents:8000});assert.ok(projectReconciliationFrame(report));
 if(audited)f.db.db.prepare('INSERT INTO business_reconciliation_reports(run_id,source_revision,start_date,end_date,payload,checked_at) VALUES(?,?,?,?,?,?)').run(frame.run_id,frame.revision,frame.start_date,frame.end_date,JSON.stringify(report),report.checked_at);
 return {frame,report};
}
function importSummary(){
 return {schema:'business_sync_summary_v1',month:trackerThrough,start_date:trackerThrough+'-01',end_date:trackerThrough+'-10',status:'RUNNING',checked_at:trackerStamp,source_checked_at:{finance_oldest_at:trackerStamp-1,finance_latest_at:trackerStamp-1,ads_at:null},progress:{windows_total:1,windows_complete:0,pages_read:1,order_capacity:5},coverage:{orders:1,paid:1,completed:1,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1,payment_missing:0,returns:1,returns_unknown:0},pending:['COLLECTING'],bindings_revision:1,costs_revision:1,expenses_revision:0,tax_policy_revision:null,ads_status:null,ads_covered_days:0,ads_total_days:0,net_estimate_cents:null,net_profit_cents:null,basis:'PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE'};
}
const markerCount=f=>f.db.db.prepare('SELECT COUNT(*) AS n FROM financial_audit_coverage_turns WHERE month=?').get(trackerThrough).n;
for(const minify of [false,true])test(`generated coverage bootstrap is live without waiting for the auxiliary catalogue cursor (minify=${minify})`,async t=>{
 const {default:app,bootstrapSmoke:api}=await compiled(minify);
 await t.test('the real scheduled App reaches saved coverage from auxiliary index 2 without an owner request',async child=>{
  const f=await fixture(child,app);await currentPublication(f);assert.equal(markerCount(f),0);const inputs=[];
  f.respond(async request=>{assert.equal(request.url,'https://auth.brazacommerce.com.br/internal/shopee/finance/escrow-releases');assert.equal(request.headers.get('x-braza-release-contract'),'release-coverage-v1');inputs.push(await request.json());return Response.json(trackerCoverage(f.frames));});
  f.db.rpc=0;const value=await f.cron();assert.equal(value.lane,'HISTORY');assert.equal(value.release_coverage,'COLLECTING');assert.equal(value.history,'DEFERRED');assert.equal(inputs.length,1);assert.equal(inputs[0].operation,'coverage');assert.equal(markerCount(f),1);assert.equal(f.db.db.prepare('SELECT auxiliary_index FROM background_collection_lane_state').get().auxiliary_index,2,'bootstrap must preserve the normal auxiliary cursor');assert.ok(f.db.rpc+inputs.length<=50,'cold bootstrap budget '+JSON.stringify({d1:f.db.rpc,privateReads:inputs.length}));assert.equal(f.db.db.prepare('SELECT pending FROM financial_audit_coverage_turns WHERE month=?').get(trackerThrough).pending,0);
  assert.ok(['RELEASES','RETURNS','INCOME','INCOME_DETAIL'].includes(f.db.db.prepare('SELECT next_work FROM financial_audit_turns WHERE month=?').get(trackerThrough).next_work));
 });
 await t.test('four due Finance opportunities retain priority before one eligible coverage bootstrap',async child=>{
  const f=await fixture(child,app);f.db.db.prepare("UPDATE business_sync_state SET status='RUNNING',next_run_at=?,summary=? WHERE id=1").run(trackerStamp,JSON.stringify(importSummary()));f.db.db.exec("UPDATE background_collection_lane_state SET next_lane='FINANCE'");assert.equal((await api.readBusinessSyncState(f.env)).summary.status,'RUNNING');assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM business_month_publications WHERE month=?').get(trackerThrough).n,0,'a new-month import may not have a current publication yet');
  for(let tick=0;tick<4;tick++){
   const lease=await api.acquireBackgroundLane(f.env,{month:trackerThrough},{now:f.now,bootstrapCoverage:true});assert.equal(lease.lane,'FINANCE');assert.notEqual(lease.coverage_bootstrap,true);assert.equal(markerCount(f),0);assert.equal(await api.finishBackgroundLane(f.env,lease,{now:f.now}),true);f.clock.time+=61000;
  }
  const lease=await api.acquireBackgroundLane(f.env,{month:trackerThrough},{now:f.now,bootstrapCoverage:true});assert.equal(lease.lane,'HISTORY');assert.equal(lease.coverage_bootstrap,true);assert.equal(lease.reserved_returns,false);let reads=0;
  const work=await api.runBackgroundHistoryWork(f.env,{getFinanceEscrowReleaseCoverage:async()=>{reads++;return trackerCoverage(f.frames,{checked:Math.floor(f.now()/1000)});}},{month:trackerThrough,lease},{now:f.now,readCandidates:async()=>{throw Error('BOOTSTRAP_MUST_NOT_ENTER_COST_QUEUE');}});assert.equal(work.release_coverage,'COLLECTING');assert.equal(reads,1);assert.equal(work.audit_source_reads,1);assert.equal(await api.finishBackgroundLane(f.env,lease,{now:f.now,auditSourceReads:work.audit_source_reads,historyNextWork:work.historyNextWork}),true);assert.equal(f.db.db.prepare('SELECT finance_since_audit FROM background_history_fairness_state').get().finance_since_audit,0);assert.equal(f.db.db.prepare('SELECT auxiliary_index FROM background_collection_lane_state').get().auxiliary_index,2);
 });
 await t.test('current Returns reservations precede the first coverage opportunity and ready costs cannot displace it',async child=>{
  const f=await fixture(child,app),current=await currentPublication(f,{audited:false}),operations=[];
  f.respond(async request=>{const input=await request.json();if(request.url.endsWith('/reconciliation')){operations.push('RETURNS');assert.equal(input.run_id,current.frame.run_id);return Response.json({...current.report,checked_at:Math.floor(f.now()/1000)});}assert.equal(request.headers.get('x-braza-release-contract'),'release-coverage-v1');operations.push('COVERAGE');return Response.json(trackerCoverage(f.frames,{checked:Math.floor(f.now()/1000)}));});
  const first=await f.cron();assert.equal(first.lane,'HISTORY');assert.equal(first.reconciliation,'CHECKED');assert.equal(first.release_coverage,'DEFERRED');assert.equal(markerCount(f),0);f.clock.time+=301000;
  const second=await f.cron();assert.equal(second.lane,'HISTORY');assert.equal(second.release_coverage,'COLLECTING');assert.deepEqual(operations,['RETURNS','COVERAGE']);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM historical_cost_evidence_runs').get().n,0);assert.equal(f.db.db.prepare('SELECT auxiliary_index FROM background_collection_lane_state').get().auxiliary_index,2);
 });
 await t.test('absent prior publications, pause and an existing global lease never reserve or collect coverage',async child=>{
  const absent=await fixture(child,app,{prior:false}),value=await api.scheduledWork(absent.env,{},absent.now);assert.equal(value.lane,'REGISTRY');assert.equal(markerCount(absent),0);assert.equal(absent.requests().length,0);
  await publishTrackerMonth(absent.env,absent.now);absent.db.db.exec("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=2;UPDATE business_sync_state SET enabled=0,status='PAUSED'");const paused=await absent.cron();assert.equal(paused.lane,'PAUSED');assert.equal(paused.release_coverage,'PAUSED');assert.equal(markerCount(absent),0);assert.equal(absent.requests().length,0);
  absent.db.db.prepare("UPDATE business_sync_state SET enabled=1,status='IDLE'").run();absent.db.db.prepare('UPDATE background_collection_lane_state SET lease_token=?,lease_until=?').run(trackerUuid(700),trackerStamp+290);const leased=await absent.cron();assert.equal(leased.lane,'LEASED');assert.equal(markerCount(absent),0);assert.equal(absent.requests().length,0);
 });
 await t.test('a source failure initializes the marker and does not repeatedly displace the normal auxiliary queue',async child=>{
  const f=await fixture(child,app);f.respond(async request=>{assert.equal(request.headers.get('x-braza-release-contract'),'release-coverage-v1');return Response.json({error:'PRIVATE_SOURCE_UNAVAILABLE'},{status:503});});
  const failed=await f.cron();assert.equal(failed.lane,'HISTORY');assert.equal(failed.release_coverage,'UNAVAILABLE');assert.equal(markerCount(f),1);assert.equal(f.requests().length,1);
  f.clock.time+=61000;assert.equal((await api.scheduledWork(f.env,{},f.now)).lane,'FINANCE');f.clock.time+=61000;assert.equal((await api.scheduledWork(f.env,{},f.now)).lane,'REGISTRY');assert.equal(f.requests().length,1);assert.equal(f.db.db.prepare('SELECT auxiliary_index FROM background_collection_lane_state').get().auxiliary_index,3);
 });
 await t.test('persistent failure before a marker exists yields by cooldown and a lost global lease cannot finish its reservation',async child=>{
  const f=await fixture(child,app);f.db.beforeStatement=sql=>{if(sql.startsWith('INSERT OR IGNORE INTO financial_audit_turns'))throw Error('PRIVATE_SYNTHETIC_LOCAL_STORAGE_FAILURE');};
  const failed=await api.scheduledWork(f.env,{},f.now);assert.equal(failed.lane,'HISTORY');assert.equal(failed.history,'ERROR');assert.equal(markerCount(f),0);assert.equal(f.requests().length,0);
  f.clock.time+=61000;assert.equal((await api.scheduledWork(f.env,{},f.now)).lane,'FINANCE');f.clock.time+=61000;assert.equal((await api.scheduledWork(f.env,{},f.now)).lane,'REGISTRY');assert.equal(markerCount(f),0);assert.equal(f.db.db.prepare('SELECT auxiliary_index FROM background_collection_lane_state').get().auxiliary_index,3);
  f.clock.time+=301000;const old=await api.acquireBackgroundLane(f.env,{month:trackerThrough},{now:f.now,bootstrapCoverage:true});assert.equal(old.coverage_bootstrap,true);f.db.db.prepare('UPDATE background_collection_lane_state SET revision=revision+1,lease_token=?,lease_until=?').run(trackerUuid(701),Math.floor(f.now()/1000)+290);const before={...f.db.db.prepare('SELECT * FROM background_history_fairness_state').get()};assert.equal(await api.finishBackgroundLane(f.env,old,{now:f.now,auditSourceReads:1}),false);assert.deepEqual({...f.db.db.prepare('SELECT * FROM background_history_fairness_state').get()},before);
 });
});
