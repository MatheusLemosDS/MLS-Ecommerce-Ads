import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {D1} from './sqlite-d1.mjs';
import {completeWorkspaceFrame,workspaceClock,workspaceStamp} from './monthly-workspace-browser-fixture.mjs';
import {BUSINESS_MONTH_PUBLICATION_SCHEMA} from '../src/business-month-publication.mjs';
import {learningPublication} from './mls-agent-learning-fixture.mjs';
import {historySourceFrame} from './m2-history-fixture.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {SCHEMA} from '../src/admin.mjs';
import {BUSINESS_SYNC_SCHEMA} from '../src/business-sync.mjs';

const origin='https://learning.compiled.test',month='2026-10',path='/api/admin/agents/learning';
class TrackedD1 extends D1{
 constructor(){super();this.writes=[];}
 prepare(sql){if(!/^\s*SELECT\b/i.test(sql))this.writes.push(sql);return super.prepare(sql);}
}
const tables=db=>db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row=>row.name);
const changes=db=>db.db.prepare('SELECT total_changes() AS n').get().n;

async function compiledApp(minify){
 const source=await readFile(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8'),seam='return {adminFetch,schedule,scheduledWork,workspaceAuthFetch};';
 assert.equal(source.split(seam).length,2,'the in-memory test seam must match the generated Admin namespace exactly');
 // This export exists only in the compiled test, never in the production App.
 const contents=source.replace(seam,'return {adminFetch,schedule,scheduledWork,workspaceAuthFetch,recordMlsAgentLearningObservation,runBusinessSync,readBusinessSyncState,saveBusinessSyncPolicy};')+'\nexport {brazaAdmin as learningSmoke};';
 const result=await build({stdin:{contents,loader:'js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
async function context(t,app){
 const db=new TrackedD1(),clock={time:workspaceClock},now=()=>clock.time,SavedDate=globalThis.Date,savedFetch=globalThis.fetch;
 globalThis.Date=class extends SavedDate{constructor(...args){super(...(args.length?args:[clock.time]));}static now(){return clock.time;}};
 let providerReads=0;globalThis.fetch=async()=>{providerReads++;throw Error('PRIVATE_UNEXPECTED_PROVIDER_CALL');};
 t.after(()=>{globalThis.Date=SavedDate;globalThis.fetch=savedFetch;db.db.close();});
 const env={ADMIN_DB:db,ADMIN_USERNAME:'learning-owner',ADMIN_PASSWORD:'learning-owner-password-123456',ADMIN_SESSION_SECRET:'PRIVATE_LEARNING_OWNER_'+'o'.repeat(40),REVIEW_USERNAME:'learning-review',REVIEW_PASSWORD:'learning-review-password-123456',SESSION_SECRET:'PRIVATE_LEARNING_REVIEW_'+'r'.repeat(40)};
 async function login(role){
  const response=await app.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:role==='owner'?env.ADMIN_USERNAME:env.REVIEW_USERNAME,password:role==='owner'?env.ADMIN_PASSWORD:env.REVIEW_PASSWORD})}),env);
  assert.equal(response.status,303);return response.headers.getSetCookie().find(cookie=>cookie.includes('Max-Age=28800')).split(';')[0];
 }
 const owner=await login('owner'),review=await login('review');
 const invoke=(search='?month='+month,{cookie=owner,method='GET'}={})=>app.fetch(new Request(origin+path+search,{method,headers:{cookie}}),env);
 return {db,env,clock,now,owner,review,invoke,providerReads:()=>providerReads};
}
async function publication(ctx,{revision=10}={}){
 for(const sql of [...BUSINESS_MONTH_PUBLICATION_SCHEMA,...BUSINESS_SYNC_SCHEMA])ctx.db.db.exec(sql);
 const frame=completeWorkspaceFrame();learningPublication(ctx.env,frame,revision);
 return {frame,publication_revision:revision};
}
function collector(ctx,{failFinance=false,pauseBeforeCommit=false,api}={}){
 const db=ctx.db.db;db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)');
 db.exec(SCHEMA.find(sql=>sql.startsWith('CREATE TABLE IF NOT EXISTS hermes_jobs ')));
 db.prepare('INSERT INTO variant_bindings_state VALUES(1,3,?,?)').run('[]',new Date(ctx.now()).toISOString());
 db.prepare('INSERT INTO production_costs_state VALUES(1,7,?,?)').run(JSON.stringify(COST_DEFAULTS),new Date(ctx.now()).toISOString());
 const calls={finance:0,ads:0};
 if(pauseBeforeCommit){
  const prepare=ctx.db.prepare.bind(ctx.db),batch=ctx.db.batch.bind(ctx.db),commits=new WeakSet();let paused=false;
  ctx.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('UPDATE business_sync_state SET status='))commits.add(statement);return statement;};
  ctx.db.batch=async statements=>{if(!paused&&statements.some(statement=>commits.has(statement))){paused=true;const state=await api.readBusinessSyncState(ctx.env);await api.saveBusinessSyncPolicy(ctx.env,{revision:state.revision,enabled:false},'synthetic-learning-owner',{now:ctx.now});}return batch(statements);};
 }
 return {calls,services:{getFinanceBusinessPeriod:async(_,selection)=>{if(failFinance)throw Error('PRIVATE_SOURCE_FAILURE');assert.equal(selection.operation,'start');const frame=historySourceFrame(calls.finance++);assert.equal(frame.start_date,selection.start_date);assert.equal(frame.end_date,selection.end_date);return frame;},getAdsCalendar:async()=>{calls.ads++;return completeWorkspaceFrame().ads;}}};
}

for(const minify of [false,true])test(`generated App keeps agent memory private, descriptive and read-only (minify=${minify})`,async t=>{
 const {default:app,learningSmoke}=await compiledApp(minify);
 await t.test('owner read stays empty without initializing the database; review and anonymous cannot read',async child=>{
  const ctx=await context(child,app);assert.deepEqual(tables(ctx.db),[]);const initial=changes(ctx.db),writes=ctx.db.writes.length;
  for(const cookie of ['',ctx.review,ctx.owner.replace(/.$/,'x')]){
   const response=await ctx.invoke('?month='+month,{cookie});assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'UNAUTHORIZED'});
  }
  for(let attempt=0;attempt<3;attempt++){
   const response=await ctx.invoke();assert.equal(response.status,200,await response.clone().text());assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('access-control-allow-origin'),null);
   const report=await response.json();assert.equal(report.schema,'mls_agent_learning_report_v1');assert.equal(report.status,'EMPTY');assert.equal(report.latest,null);assert.equal(report.evidence.cutoffs_observed,0);assert.deepEqual(report.lessons,[]);assert.equal(report.autonomy.mode,'OBSERVER');assert.equal(report.autonomy.commercial_write_allowed,false);assert.equal(report.autonomy.model_training,false);
  }
  assert.equal(changes(ctx.db),initial);assert.equal(ctx.db.writes.length,writes);assert.deepEqual(tables(ctx.db),[]);assert.equal(ctx.providerReads(),0);
 });
 await t.test('method and exact month-query validation do not initialize or mutate memory',async child=>{
  const ctx=await context(child,app),initial=changes(ctx.db),writes=ctx.db.writes.length;
  for(const method of ['POST','PUT','PATCH','DELETE','HEAD']){
   const response=await ctx.invoke('?month='+month,{method});assert.equal(response.status,405,method);if(method!=='HEAD')assert.deepEqual(await response.json(),{error:'METHOD_NOT_ALLOWED'});
  }
  for(const search of ['', '?month=', '?month=2026-13','?month=2026-11','?month=1999-12','?month=2026-1','?month=2026-10&month=2026-10','?month=2026-10&owner=another','?month=2026-10&refresh=true']){
   const response=await ctx.invoke(search);assert.equal(response.status,400,search||'missing query');assert.match((await response.json()).error,/^MLS_AGENT_LEARNING_/);
  }
  assert.equal(changes(ctx.db),initial);assert.equal(ctx.db.writes.length,writes);assert.deepEqual(tables(ctx.db),[]);assert.equal(ctx.providerReads(),0);
 });
 await t.test('a trusted observation is idempotent and corrections replace the same cumulative cutoff',async child=>{
  const ctx=await context(child,app),input=await publication(ctx);
  const first=await learningSmoke.recordMlsAgentLearningObservation(ctx.env,input,{now:ctx.now});assert.equal(first.status,'RECORDED');assert.equal(first.observations_written,1);
  const repeat=await learningSmoke.recordMlsAgentLearningObservation(ctx.env,input,{now:ctx.now});assert.equal(repeat.observations_written,0);
  ctx.clock.time+=5000;const corrected=structuredClone(input);corrected.frame.costs_revision++;
  assert.equal((await learningSmoke.recordMlsAgentLearningObservation(ctx.env,corrected,{now:ctx.now})).observations_written,1);
  assert.equal(ctx.db.db.prepare('SELECT COUNT(*) AS n FROM mls_agent_learning_observations').get().n,1);
  const row=ctx.db.db.prepare('SELECT correction_count,payload FROM mls_agent_learning_observations').get();assert.equal(row.correction_count,1);assert.equal(JSON.parse(row.payload).revisions.costs,6);
  const initial=changes(ctx.db),writes=ctx.db.writes.length;
  const response=await ctx.invoke();assert.equal(response.status,200);const report=await response.json();assert.equal(report.status,'OBSERVING');assert.equal(report.evidence.cutoffs_observed,1);assert.equal(report.evidence.revisions_observed,1);assert.equal(report.evidence.independent_financial_comparisons,0);assert.equal(report.latest.metrics.actual_profit_cents,null);assert.equal(report.autonomy.commercial_write_allowed,false);assert.ok(report.autonomy.confirmation_required.includes('NEW_ACTION'));assert.ok(report.autonomy.confirmation_required.includes('COMMERCIAL_WRITE'));
  assert.ok(report.lessons.some(lesson=>lesson.code==='RETURNS_REQUIRE_RECONCILIATION'));assert.ok(report.lessons.every(lesson=>lesson.confidence==='OBSERVED'&&lesson.evidence_count===1));
  assert.doesNotMatch(JSON.stringify(report),/PRIVATE_|order_sn|buyer|access_token|refresh_token|cookie|synthetic-publication-token/);
  assert.equal(changes(ctx.db),initial);assert.equal(ctx.db.writes.length,writes);assert.equal(ctx.providerReads(),0);
 });
 await t.test('pause and a superseded publication cannot record or promote evidence',async child=>{
  const ctx=await context(child,app),input=await publication(ctx);
  const before=tables(ctx.db);
  assert.equal((await learningSmoke.recordMlsAgentLearningObservation(ctx.env,input,{now:ctx.now,canRun:async()=>false})).status,'PAUSED');assert.deepEqual(tables(ctx.db),before);
  let checks=0;const paused=await learningSmoke.recordMlsAgentLearningObservation(ctx.env,input,{now:ctx.now,canRun:async()=>++checks===1});assert.equal(paused.status,'PAUSED');assert.equal(ctx.db.db.prepare('SELECT COUNT(*) AS n FROM mls_agent_learning_observations').get().n,0);
  const raced=await learningSmoke.recordMlsAgentLearningObservation(ctx.env,input,{now:ctx.now,canRun:async()=>{ctx.db.db.prepare('UPDATE business_month_publications SET source_revision=11').run();return true;}});
  assert.equal(raced.observations_written,0);assert.equal((await(await ctx.invoke()).json()).status,'EMPTY');assert.equal(ctx.providerReads(),0);
 });
 await t.test('a pause after the last canRun check also wins the atomic memory insert',async child=>{
  const ctx=await context(child,app),input=await publication(ctx),batch=ctx.db.batch.bind(ctx.db);let reads=0,armed=false;
  ctx.db.batch=async statements=>{if(armed)ctx.db.db.prepare('UPDATE business_sync_state SET enabled=0').run();return batch(statements);};
  const result=await learningSmoke.recordMlsAgentLearningObservation(ctx.env,input,{now:ctx.now,canRun:async()=>{if(++reads===2)armed=true;return true;}});
  assert.equal(result.observations_written,0);assert.equal(ctx.db.db.prepare('SELECT COUNT(*) AS n FROM mls_agent_learning_observations').get().n,0);assert.equal((await(await ctx.invoke()).json()).status,'EMPTY');assert.equal(ctx.providerReads(),0);
 });
 await t.test('the real collector emits one final observation only after its state commit and no extra source read',async child=>{
  const ctx=await context(child,app),{calls,services}=collector(ctx),observed=[];
  const result=await learningSmoke.runBusinessSync(ctx.env,services,{now:ctx.now,onCompletedObservation:async observation=>{
   const committed=ctx.db.db.prepare('SELECT status,enabled,lease_token FROM business_sync_state WHERE id=1').get();assert.equal(committed.lease_token,null);assert.equal(committed.enabled,1);assert.notEqual(committed.status,'ERROR');assert.equal(calls.ads,1,'the retained observation must include the final Ads projection');
   observed.push(observation);assert.equal((await learningSmoke.recordMlsAgentLearningObservation(ctx.env,observation,{now:ctx.now})).observations_written,1);
  }});
  assert.ok(['COMPLETE','PARTIAL'].includes(result.status));assert.equal(observed.length,1);assert.equal(calls.finance,2);assert.equal(calls.ads,1);assert.equal(result.finance_steps,2);assert.equal(result.ads_reads,1);assert.equal(ctx.providerReads(),0);
  const saved=ctx.db.db.prepare('SELECT payload,publication_revision FROM mls_agent_learning_observations').get();assert.ok(saved);assert.equal(saved.publication_revision,observed[0].publication_revision);assert.equal(JSON.parse(saved.payload).source_checked_at.ads_at,completeWorkspaceFrame().ads.fetched_at);
  assert.equal((await learningSmoke.runBusinessSync(ctx.env,services,{now:ctx.now,onCompletedObservation:()=>{throw Error('NOT_DUE_MUST_NOT_EMIT');}})).status,'NOT_DUE');assert.equal(calls.finance,2);assert.equal(calls.ads,1);assert.equal(ctx.providerReads(),0);
 });
 await t.test('a genuine source failure or a pause during final commit emits no observation',async child=>{
  for(const scenario of ['source-failure','pause-before-commit'])await child.test(scenario,async inner=>{
   const ctx=await context(inner,app),{services}=collector(ctx,{api:learningSmoke,failFinance:scenario==='source-failure',pauseBeforeCommit:scenario==='pause-before-commit'});let emitted=0;
   const result=await learningSmoke.runBusinessSync(ctx.env,services,{now:ctx.now,onCompletedObservation:()=>{emitted++;}});
   assert.equal(result.status,scenario==='source-failure'?'ERROR':'PAUSED');assert.equal(emitted,0);assert.ok(!tables(ctx.db).includes('mls_agent_learning_observations'),'suppressed capture cannot initialize the learning store');assert.equal(ctx.providerReads(),0);
  });
 });
 await t.test('storage corruption has a bounded public error and cannot leak raw data or call a source',async child=>{
  const ctx=await context(child,app),input=await publication(ctx);await learningSmoke.recordMlsAgentLearningObservation(ctx.env,input,{now:ctx.now});
  const row=ctx.db.db.prepare('SELECT payload FROM mls_agent_learning_observations').get(),bad={...JSON.parse(row.payload),order_sn:'PRIVATE_ORDER_VALUE'};
  ctx.db.db.prepare('UPDATE mls_agent_learning_observations SET payload=?').run(JSON.stringify(bad));const initial=changes(ctx.db),writes=ctx.db.writes.length;
  const response=await ctx.invoke();assert.equal(response.status,503);const body=await response.json();assert.match(body.error,/^MLS_AGENT_LEARNING_/);assert.doesNotMatch(JSON.stringify(body),/PRIVATE_ORDER|SELECT|payload|credential/i);
  assert.equal(changes(ctx.db),initial);assert.equal(ctx.db.writes.length,writes);assert.equal(ctx.providerReads(),0);
 });
});
