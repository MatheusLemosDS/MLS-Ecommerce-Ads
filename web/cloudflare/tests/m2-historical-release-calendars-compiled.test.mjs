import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {createFinanceStore} from '../../finance/src/connection-store.mjs';
import {projectEscrowReleaseFrame,projectEscrowReleaseEvidenceFrame,projectEscrowReleaseCoverageFrame} from '../../finance/src/escrow-release-frame.mjs';
import {TrackerD1,trackerMonth,trackerThrough,trackerTime,publishTrackerMonth,forceTrackerHistory,trackerUuid} from './m2-release-tracker-fixture.mjs';

const endpoint='https://auth.brazacommerce.com.br/internal/shopee/finance/escrow-releases';
const legacyKinds=['RELEASES','RETURNS','INCOME','INCOME_DETAIL'];
const legacyFrame=raw=>projectEscrowReleaseEvidenceFrame(raw,projectEscrowReleaseFrame)?.report??projectEscrowReleaseFrame(raw);
const countReports=f=>f.db.db.prepare('SELECT COUNT(*) AS n FROM business_escrow_release_reports WHERE month=?').get(trackerMonth).n;
const countAttempts=f=>f.db.db.prepare('SELECT COUNT(*) AS n FROM business_escrow_release_attempts WHERE month=?').get(trackerMonth).n;
const calendarTurn=f=>f.db.db.prepare('SELECT next_target FROM financial_audit_release_calendar_turns WHERE month=?').get(trackerThrough)?.next_target;

async function compiled(minify){
 const source=await readFile(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8'),seam='return {adminFetch,schedule,scheduledWork,workspaceAuthFetch};';assert.equal(source.split(seam).length,2);
 const contents=source.replace(seam,'return {adminFetch,schedule,scheduledWork,workspaceAuthFetch,runBusinessFinancialAudits,runBusinessEscrowReleases,runBusinessEscrowReleaseCoverage,readBusinessEscrowReleases,getFinanceEscrowReleases,getFinanceEscrowReleaseCoverage,acquireBackgroundLane,finishBackgroundLane};')+'\nexport {brazaAdmin as calendarSmoke};';
 const modules=await Promise.all(['app','auth','finance'].map(async name=>{
  const input=name==='app'?contents:await readFile(new URL('../../../dist/'+name+'-worker.mjs',import.meta.url),'utf8');
  const result=await build({stdin:{contents:input,loader:'js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 }));
 return {app:modules[0].default,api:modules[0].calendarSmoke,auth:modules[1].default,finance:modules[2].default};
}

async function fixture(t,workers){
 const db=new TrackerD1(),financeDb=new TrackerD1(),clock={time:trackerTime},now=()=>clock.time,SavedDate=globalThis.Date,savedFetch=globalThis.fetch;
 globalThis.Date=class extends SavedDate{constructor(...args){super(...(args.length?args:[clock.time]));}static now(){return clock.time;}};
 t.after(()=>{globalThis.Date=SavedDate;globalThis.fetch=savedFetch;db.db.close();financeDb.db.close();});
 const appSecret='PRIVATE_HISTORICAL_CALENDAR_APP_'+'a'.repeat(40),routerSecret='PRIVATE_HISTORICAL_CALENDAR_ROUTER_'+'r'.repeat(40);
 const env={ADMIN_DB:db,APP_INTERNAL_SECRET:appSecret},financeEnv={FINANCE_DB:financeDb,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,19).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:'PRIVATE_HISTORICAL_CALENDAR_PARTNER',FINANCE_ROUTER_SECRET:routerSecret};
 const store=await createFinanceStore(financeEnv,{now});await store.setup();await store.saveTokens({access_token:'PRIVATE_HISTORICAL_CALENDAR_ACCESS',refresh_token:'PRIVATE_HISTORICAL_CALENDAR_REFRESH',expires_at:Math.floor(now()/1000)+14400});
 const calls={auth:[],finance:0,provider:[]},hooks={afterSource:null,provider:null};
 const authEnv={APP_INTERNAL_SECRET:appSecret,FINANCE_ROUTER_SECRET:routerSecret,SHOPEE_FINANCE_SERVICE:{fetch:async request=>{
  calls.finance++;assert.equal(request.url,endpoint);assert.equal(request.headers.get('x-braza-finance-router'),routerSecret);
  for(const name of ['x-braza-app-key','cookie','authorization','origin'])assert.equal(request.headers.get(name),null);
  return workers.finance.fetch(request,financeEnv);
 }}};
 globalThis.fetch=async input=>{
  const request=input instanceof Request?input:new Request(input),url=new URL(request.url);
  if(url.origin==='https://partner.shopeemobile.com'){
   assert.equal(url.pathname,'/api/v2/payment/get_escrow_list');assert.equal(request.method,'GET');assert.equal(request.redirect,'manual');assert.equal(url.searchParams.get('page_no'),'1');
   for(const name of ['x-braza-app-key','x-braza-finance-router','cookie','authorization','origin'])assert.equal(request.headers.get(name),null);
   const from=Number(url.searchParams.get('release_time_from')),to=Number(url.searchParams.get('release_time_to'));calls.provider.push({from,to});
   if(hooks.provider){const value=await hooks.provider({from,to});if(value)return value;}
   const at=SavedDate.UTC(2026,9,12,15)/1000;
   return Response.json({error:'',response:{escrow_list:at>=from&&at<=to?[{order_sn:'PRIVATE_HISTORICAL_CALENDAR_ORDER',payout_amount:47.51,escrow_release_time:at}]:[],more:false}});
  }
  assert.equal(request.url,endpoint);assert.equal(request.headers.get('x-braza-app-key'),appSecret);
  for(const name of ['x-braza-finance-router','cookie','authorization','origin'])assert.equal(request.headers.get(name),null);
  const body=await request.clone().json();calls.auth.push(body);const response=await workers.auth.fetch(request,authEnv);if(hooks.afterSource)await hooks.afterSource(body);return response;
 };
 assert.equal((await workers.api.scheduledWork(env,{},now)).collection,'MAINTENANCE');
 const frames=await publishTrackerMonth(env,now),refs=frames.map(frame=>({run_id:frame.run_id,source_revision:frame.revision}));
 db.db.prepare("UPDATE business_sync_state SET enabled=1,status='IDLE',month=?,summary=NULL,next_run_at=? WHERE id=1").run(trackerThrough,Math.floor(now()/1000)+3600);
 const services={getFinanceEscrowReleases:workers.api.getFinanceEscrowReleases,getFinanceEscrowReleaseCoverage:workers.api.getFinanceEscrowReleaseCoverage};
 const f={...workers,db,financeDb,env,financeEnv,clock,now,frames,refs,calls,hooks,services};
 f.cue=async()=>{
  db.db.prepare('UPDATE business_escrow_release_coverage SET next_attempt_at=last_attempt_at').run();
  const value=await workers.api.runBusinessEscrowReleaseCoverage(env,services.getFinanceEscrowReleaseCoverage,{through_month:trackerThrough},{now});assert.equal(value.service_reads,1);
  const raw=JSON.parse(db.db.prepare('SELECT payload FROM business_escrow_release_coverage WHERE cohort_month=?').get(trackerMonth).payload);assert.ok(projectEscrowReleaseCoverageFrame(raw));return raw;
 };
 f.privateRelease=async(operation='step',sources=refs)=>{const raw=await workers.api.getFinanceEscrowReleases(env,{operation,month:trackerMonth,sources});assert.ok(legacyFrame(raw));return raw;};
 f.audit=async({next='RELEASES',...options}={})=>{
  forceTrackerHistory(db,{next});const lease=await workers.api.acquireBackgroundLane(env,{month:trackerThrough},{now});assert.equal(lease.lane,'HISTORY');
  const targets=[],before={auth:calls.auth.length,finance:calls.finance,provider:calls.provider.length};db.rpc=0;
  const value=await workers.api.runBusinessFinancialAudits(env,services,{month:trackerThrough},{now,historicalCalendars:true,backgroundLease:{token:lease.token,revision:lease.revision},runReleases:async(...args)=>{targets.push(args[2].month);return workers.api.runBusinessEscrowReleases(...args);},...options});
  assert.ok(value.source_reads<=1);assert.ok(calls.auth.length-before.auth<=1);assert.equal(calls.finance-before.finance,calls.auth.length-before.auth);assert.ok(calls.provider.length-before.provider<=1);assert.ok(db.rpc+value.source_reads<=50,'App D1/private budget '+JSON.stringify({rpc:db.rpc,source:value.source_reads}));
  assert.ok(legacyKinds.includes(db.db.prepare('SELECT next_work FROM financial_audit_turns WHERE month=?').get(trackerThrough).next_work),'rollback cursor remains four-valued');
  await workers.api.finishBackgroundLane(env,lease,{now,auditSourceReads:value.source_reads});return {value,targets,before};
 };
 await f.cue();return f;
}

for(const minify of [false,true])test(`three generated Workers recover the previous release calendar without guessing the missing cohort (minify=${minify})`,async t=>{
 const workers=await compiled(minify);
 await t.test('alternating RELEASES collect the prior calendar and resume a partial-only coverage signal',async child=>{
  const f=await fixture(child,workers),publication={...f.db.db.prepare('SELECT * FROM business_month_publications WHERE month=?').get(trackerMonth)},targets=[],progress=[];let completed=false,partialOnly=false;
  for(let index=0;index<12;index++){
   if(index)f.clock.time+=61000;
   if(index===4){const cue=await f.cue();assert.ok(cue.pending.includes('CALENDAR_PARTIAL'));assert.ok(!cue.pending.includes('CALENDAR_MISSING'));partialOnly=true;}
   const {targets:chosen,value}=await f.audit();targets.push(...chosen);
   const stored=f.db.db.prepare('SELECT payload FROM business_escrow_release_reports WHERE month=? ORDER BY checked_at DESC LIMIT 1').get(trackerMonth),frame=stored?legacyFrame(JSON.parse(stored.payload)):null;
   progress.push({index,targets:chosen,status:value.status,release:value.releases_status,calendar:frame?.calendar.status,collection:frame?.collection.status,pages:frame?.collection.pages_read});
   if(frame?.calendar.status==='COMPLETE'){
    completed=true;assert.equal(frame.calendar.cutoff_at,Date.UTC(2026,10,1,3)/1000);assert.equal(frame.calendar.observations,1);assert.equal(frame.matching.status,'SOURCE_MISSING');assert.equal(frame.matching.paid_orders,null);assert.equal(frame.matching.unlocated_paid_orders,null);assert.equal(frame.calendar.total_release_cents,null);assert.ok(frame.pending.includes('BANK_RECEIPT_NOT_VERIFIED'));assert.equal(Object.hasOwn(frame,'net_profit_cents'),false);assert.ok(!JSON.stringify(frame).includes('PRIVATE_'));break;
   }
  }
  assert.equal(completed,true,JSON.stringify(progress));assert.equal(partialOnly,true);assert.deepEqual(targets.slice(0,9),Array.from({length:9},(_,index)=>index%2?trackerThrough:trackerMonth));
  assert.deepEqual({...f.db.db.prepare('SELECT * FROM business_month_publications WHERE month=?').get(trackerMonth)},publication,'calendar repair must preserve the order-creation publication');
  const staleCue=JSON.parse(f.db.db.prepare('SELECT payload FROM business_escrow_release_coverage WHERE cohort_month=?').get(trackerMonth).payload);assert.equal(staleCue.calendars[0].status,'PARTIAL');
  const before=f.calls.auth.filter(row=>row.operation==='step'&&row.month===trackerMonth).length;f.clock.time+=61000;await f.audit();f.clock.time+=61000;await f.audit();assert.equal(f.calls.auth.filter(row=>row.operation==='step'&&row.month===trackerMonth).length,before,'a complete saved calendar must suppress an old PARTIAL cue');
  const after=await f.cue();assert.equal(after.calendars[0].status,'COMPLETE');assert.ok(after.pending.includes('SOURCE_MISSING'));assert.equal(after.coverage.paid_orders,null);assert.equal(after.coverage.identity_complete_at_cutoff,false);
 });
 await t.test('the shipped scheduledWork opts into historical selection with the global lease and reads only one private source',async child=>{
  const f=await fixture(child,workers),before=f.calls.auth.length;forceTrackerHistory(f.db,{next:'RELEASES'});f.db.rpc=0;
  const value=await workers.api.scheduledWork(f.env,{getFinanceEscrowReleases:workers.api.getFinanceEscrowReleases},f.now);
  assert.ok(f.db.rpc+f.calls.auth.length-before<=50,'cold scheduled HISTORY D1/private budget '+JSON.stringify({d1:f.db.rpc,privateReads:f.calls.auth.length-before}));child.diagnostic('cold scheduled HISTORY budget '+JSON.stringify({d1:f.db.rpc,privateReads:f.calls.auth.length-before}));
  assert.equal(value.lane,'HISTORY');assert.equal(f.calls.auth.length,before+1);assert.equal(f.calls.auth.at(-1).operation,'step');assert.equal(f.calls.auth.at(-1).month,trackerMonth);assert.deepEqual(f.calls.auth.at(-1).sources,f.refs);assert.equal(countReports(f),1);
 });
 await t.test('the first historical RELEASES opportunity temporarily precedes RETURNS and then restores its saved cursor',async child=>{
  const f=await fixture(child,workers),first=await f.audit({next:'RETURNS'});assert.equal(first.value.selected,'RELEASES');assert.deepEqual(first.targets,[trackerMonth]);
  assert.equal(f.db.db.prepare('SELECT next_work FROM financial_audit_turns WHERE month=?').get(trackerThrough).next_work,'RETURNS');assert.equal(f.db.db.prepare('SELECT bootstrap_pending FROM financial_audit_release_calendar_turns WHERE month=?').get(trackerThrough).bootstrap_pending,0);
  let returns=0;f.services.getFinanceReconciliation=async()=>{returns++;};f.clock.time+=61000;
  const second=await f.audit({next:'RETURNS',runReturns:async(_,source)=>{await source();return {status:'CHECKED'};}});assert.equal(second.value.selected,'RETURNS');assert.equal(second.value.source_reads,1);assert.equal(returns,1);assert.deepEqual(second.targets,[]);assert.equal(calendarTurn(f),'CURRENT');
 });
 await t.test('a real historical permission backoff preserves unknown values and yields source opportunities to the current calendar',async child=>{
  const f=await fixture(child,workers);f.hooks.provider=async({from})=>from<Date.UTC(2026,10,1,3)/1000?Response.json({error:'error_api_permission',message:'PRIVATE_HISTORICAL_PERMISSION_DETAIL'},{status:403}):null;
  const first=await f.audit();assert.deepEqual(first.targets,[trackerMonth]);assert.equal(first.value.source_reads,1);
  const row=f.db.db.prepare('SELECT payload FROM business_escrow_release_reports WHERE month=?').get(trackerMonth),frame=legacyFrame(JSON.parse(row.payload));assert.equal(frame.collection.status,'BLOCKED');assert.equal(frame.collection.diagnostic,'PERMISSION_DENIED');assert.equal(frame.matching.paid_orders,null);assert.equal(frame.calendar.total_release_cents,null);assert.ok(!row.payload.includes('PRIVATE_'));
  const attempt=f.db.db.prepare('SELECT checked_at,next_attempt_at FROM business_escrow_release_attempts WHERE month=?').get(trackerMonth);assert.ok(attempt.next_attempt_at-attempt.checked_at>=3600);
  f.clock.time+=61000;const current=await f.audit();assert.deepEqual(current.targets,[trackerThrough]);
  f.clock.time+=61000;forceTrackerHistory(f.db,{next:'RELEASES'});const before=f.calls.auth.length;f.db.rpc=0;
  const work=await workers.api.scheduledWork(f.env,{getFinanceEscrowReleases:workers.api.getFinanceEscrowReleases},f.now);assert.equal(work.lane,'HISTORY');assert.ok(f.db.rpc+f.calls.auth.length-before<=50,'historical backoff fallback D1/private budget '+JSON.stringify({d1:f.db.rpc,privateReads:f.calls.auth.length-before}));child.diagnostic('backoff HISTORY budget '+JSON.stringify({d1:f.db.rpc,privateReads:f.calls.auth.length-before}));
  f.clock.time+=61000;const later=await f.audit();assert.ok(later.targets.includes(trackerThrough),'a historical retry cannot consume the current calendar opportunity');
  assert.equal(f.calls.auth.filter(value=>value.operation==='step'&&value.month===trackerMonth).length,1,'the blocked historical source must not be re-read before its existing deadline');assert.ok(f.calls.auth.some(value=>value.operation==='step'&&value.month===trackerThrough),'the current source receives its own attempt while historical permission remains blocked');
 });
 await t.test('a complete closed-month calendar cached under another cohort key prevents duplicate history reads',async child=>{
  const f=await fixture(child,workers);let raw;
  for(let index=0;index<6;index++){raw=await f.privateRelease('step',[]);if(legacyFrame(raw).calendar.status==='COMPLETE')break;f.clock.time+=61000;}
  const frame=legacyFrame(raw);assert.equal(frame.calendar.status,'COMPLETE');assert.equal(frame.calendar.cutoff_at,Date.UTC(2026,10,1,3)/1000);
  f.db.db.prepare('INSERT INTO business_escrow_release_reports(month,cohort_key,payload,checked_at) VALUES(?,?,?,?)').run(trackerMonth,'[]',JSON.stringify(raw),frame.checked_at);
  assert.equal(JSON.parse(f.db.db.prepare('SELECT payload FROM business_escrow_release_coverage').get().payload).calendars[0].status,'MISSING');
  const before=f.calls.auth.length,{targets}=await f.audit();assert.deepEqual(targets,[trackerThrough]);assert.equal(f.calls.auth.length,before+1);assert.equal(f.calls.auth.at(-1).month,trackerThrough);
 });
 await t.test('an earlier in-month COMPLETE snapshot does not suppress the still-missing closed calendar',async child=>{
  const f=await fixture(child,workers),saved=f.clock.time;f.clock.time=Date.UTC(2026,9,10,15);let raw;
  for(let index=0;index<3;index++){raw=await f.privateRelease('step',[]);if(legacyFrame(raw).calendar.status==='COMPLETE')break;f.clock.time+=61000;}
  const frame=legacyFrame(raw);assert.equal(frame.calendar.status,'COMPLETE');assert.ok(frame.calendar.cutoff_at<Date.UTC(2026,10,1,3)/1000);f.clock.time=saved;
  f.db.db.prepare('INSERT INTO business_escrow_release_reports(month,cohort_key,payload,checked_at) VALUES(?,?,?,?)').run(trackerMonth,'[]',JSON.stringify(raw),frame.checked_at);
  const {targets}=await f.audit();assert.deepEqual(targets,[trackerMonth]);assert.equal(f.calls.auth.at(-1).month,trackerMonth);assert.equal(legacyFrame(JSON.parse(f.db.db.prepare('SELECT payload FROM business_escrow_release_reports WHERE month=? AND cohort_key<>?').get(trackerMonth,'[]').payload)).collection.cutoff_at,Date.UTC(2026,10,1,3)/1000);
 });
 for(const interruption of ['pause','publication','audit-lease','global-lease','rollover','expiry','atomic-pause','atomic-publication'])await t.test(`historical ${interruption} fences the completed response before any App acknowledgement`,async child=>{
  const f=await fixture(child,workers);let fired=false;
  const interrupt=async()=>{
   if(fired)return;fired=true;
   if(interruption.includes('pause'))f.db.db.prepare('UPDATE business_sync_state SET enabled=0').run();
   else if(interruption==='publication')await publishTrackerMonth(f.env,f.now,{revision:8,offset:10});
   else if(interruption==='atomic-publication')f.db.db.prepare('UPDATE business_month_publications SET source_revision=source_revision+1 WHERE month=?').run(trackerMonth);
   else if(interruption==='audit-lease')f.db.db.prepare('UPDATE financial_audit_turns SET revision=revision+1,lease_token=? WHERE month=?').run(trackerUuid(991),trackerThrough);
   else if(interruption==='global-lease')f.db.db.prepare('UPDATE background_collection_lane_state SET revision=revision+1,lease_token=? WHERE id=1').run(trackerUuid(992));
   else if(interruption==='rollover')f.clock.time=Date.UTC(2026,11,1,3);
   else if(interruption==='expiry')f.clock.time+=91000;
  };
  if(interruption.startsWith('atomic-'))f.db.beforeStatement=sql=>{if(sql.startsWith('INSERT INTO business_escrow_release_reports('))void interrupt();};
  else f.hooks.afterSource=async body=>{if(body.operation==='step'&&body.month===trackerMonth)await interrupt();};
  const {value}=await f.audit();assert.equal(fired,true);assert.equal(value.source_reads,1);assert.equal(countReports(f),0);assert.equal(countAttempts(f),0);assert.equal(calendarTurn(f),'HISTORICAL','an unacknowledged repair cannot advance its target');assert.equal(f.db.db.prepare('SELECT bootstrap_pending FROM financial_audit_release_calendar_turns WHERE month=?').get(trackerThrough).bootstrap_pending,1);
 });
 await t.test('a clock advancing after an awaited policy check cannot reach the provider or acknowledge history',async child=>{
  const f=await fixture(child,workers),before=f.calls.auth.length;let advanced=false;
  const canRun=async()=>{const held=f.db.db.prepare('SELECT COUNT(*) AS n FROM business_escrow_release_leases WHERE month=?').get(trackerMonth).n;if(held&&!advanced){advanced=true;f.clock.time+=91000;}return true;};
  const {value}=await f.audit({canRun});assert.equal(advanced,true);assert.equal(value.source_reads,0);assert.equal(f.calls.auth.length,before);assert.equal(countReports(f),0);assert.equal(countAttempts(f),0);assert.equal(calendarTurn(f),'HISTORICAL');
 });
 await t.test('month rollover inside the awaited bounded-source policy check cannot call the old calendar provider',async child=>{
  const f=await fixture(child,workers),before=f.calls.auth.length;let insideSource=false,advanced=false;
  const canRun=async()=>{if(insideSource&&!advanced){advanced=true;f.clock.time=Date.UTC(2026,11,1,3);}return true;};
  const runReleases=(env,source,input,options)=>workers.api.runBusinessEscrowReleases(env,async(...args)=>{insideSource=true;return source(...args);},input,options);
  const {value}=await f.audit({canRun,runReleases});assert.equal(advanced,true);assert.equal(value.source_reads,0);assert.equal(f.calls.auth.length,before);assert.equal(countReports(f),0);assert.equal(countAttempts(f),0);assert.equal(calendarTurn(f),'HISTORICAL');
 });
});
