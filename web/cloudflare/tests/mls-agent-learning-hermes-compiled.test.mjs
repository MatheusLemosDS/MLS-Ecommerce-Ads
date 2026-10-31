import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {collectionFixture} from './business-collection-fixture.mjs';
import {BUSINESS_SYNC_SCHEMA} from '../src/business-sync.mjs';
import {recordMlsAgentLearningObservation} from '../src/mls-agent-learning.mjs';

const origin='https://learning-hermes.compiled.test',protocol='hermes-finance-v1';
const analysisDate='2026-10-23',jobId='11111111-1111-4111-8111-111111111111';
const taskRaw=JSON.stringify({type:'daily_review',shop_id:'1178167501',start_date:analysisDate,end_date:analysisDate,ads_execution:'LOCKED'});
const withoutMemory=context=>{const copy=structuredClone(context);for(const action of copy.monthly.top_actions)action.detail=action.detail.split(' Memória observada:')[0];return copy;};

for(const minify of [false,true])test(`generated Hermes jobs use trusted descriptive memory with the unchanged protocol and exact context fingerprint (minify=${minify})`,async t=>{
 const source=await readFile(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8'),seam='return {adminFetch,schedule,scheduledWork,workspaceAuthFetch};';assert.equal(source.split(seam).length,2);
 const contents=source.replace(seam,'return {adminFetch,schedule,scheduledWork,workspaceAuthFetch,prepareHermesFinancialContext,readHermesFinancialContext};')+'\nexport {brazaAdmin as learningHermesSmoke};';
 const compiled=await build({stdin:{contents,loader:'js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const {default:worker,learningHermesSmoke:api}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const f=await collectionFixture({returns:true,paymentDelayMs:0}),SavedDate=globalThis.Date,savedFetch=globalThis.fetch;let externalReads=0;
 globalThis.Date=class extends SavedDate{constructor(...args){super(...(args.length?args:[f.now()]));}static now(){return f.now();}};
 globalThis.fetch=async()=>{externalReads++;throw Error('PRIVATE_UNEXPECTED_NETWORK');};
 t.after(()=>{globalThis.Date=SavedDate;globalThis.fetch=savedFetch;f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 let frame=await f.invoke('start');while(frame.status==='RUNNING')frame=await f.invoke('step');frame=await f.invoke('ads');
 const env={...f.env,ADMIN_USERNAME:'learning-hermes-owner',ADMIN_PASSWORD:'learning-hermes-password-123456',ADMIN_SESSION_SECRET:'PRIVATE_LEARNING_HERMES_SESSION_'+'s'.repeat(40),HERMES_BRIDGE_SECRET:'PRIVATE_LEARNING_HERMES_BRIDGE_'+'b'.repeat(40)};
 const login=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
 let csrf;const invoke=(path,body,owner=true)=>worker.fetch(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{...(owner?{origin,cookie}:{authorization:'Bearer '+env.HERMES_BRIDGE_SECRET}),'content-type':'application/json',...(owner&&body!==undefined?{'x-csrf-token':csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)}),env);
 const stateResponse=await invoke('/api/admin/state');assert.equal(stateResponse.status,200);csrf=(await stateResponse.json()).csrf;
 const baseline=await api.prepareHermesFinancialContext(env,jobId,analysisDate,{now:f.now,taskRaw});assert.equal(baseline.context.available,true);assert.ok(baseline.context.monthly.pending.includes('RETURNS_NOT_RECONCILED'));assert.doesNotMatch(JSON.stringify(baseline.context),/Memória observada:/);
 for(const sql of BUSINESS_SYNC_SCHEMA)env.ADMIN_DB.db.exec(sql);
 const publication=env.ADMIN_DB.db.prepare('SELECT source_revision FROM business_month_publications WHERE month=?').get('2026-10');assert.ok(publication);
 assert.equal((await recordMlsAgentLearningObservation(env,{frame,publication_revision:publication.source_revision},{now:f.now})).observations_written,1);
 const enriched=await api.prepareHermesFinancialContext(env,jobId,analysisDate,{now:f.now,taskRaw});assert.equal(enriched.context.schema,'hermes_financial_context_v1');assert.equal(enriched.context.monthly.execution,'READ_ONLY');assert.equal(enriched.context.monthly.actual_profit_cents,null);assert.deepEqual(withoutMemory(enriched.context),baseline.context,'only bounded descriptive action details may change');
 const action=enriched.context.monthly.top_actions.find(row=>row.code==='RECONCILE_RETURNS');assert.ok(action);assert.match(action.detail,/Memória observada: esta condição consta em 1 recorte\(s\) salvo\(s\), até 2026-10-24/);assert.match(action.detail,/Recortes cumulativos não são resultados independentes/);assert.notEqual(enriched.fingerprint,baseline.fingerprint);assert.equal(createHash('sha256').update('{"job_id":'+JSON.stringify(jobId)+',"context":'+JSON.stringify(enriched.context)+'}').digest('hex'),enriched.fingerprint);
 const providerCounts=[f.calls.finance.length,f.calls.ads.length,f.calls.list.length,f.calls.detail.length,f.calls.payment.length];
 const beat=await invoke('/api/hermes/heartbeat',{protocol},false);assert.equal(beat.status,200);assert.deepEqual(await beat.json(),{ok:true,protocol});
 const queuedResponse=await invoke('/api/admin/jobs',{});assert.equal(queuedResponse.status,202,await queuedResponse.clone().text());const queued=await queuedResponse.json();
 const evidencePath='/api/admin/jobs/'+queued.id+'/financial-context',evidenceResponse=await invoke(evidencePath);assert.equal(evidenceResponse.status,200);const evidence=await evidenceResponse.json();assert.deepEqual(evidence.context,enriched.context);
 const oldBridge=await invoke('/api/hermes/claim',{},false);assert.deepEqual(await oldBridge.json(),{job:null,reason:'HERMES_BRIDGE_UPGRADE_REQUIRED'});
 const claim=await invoke('/api/hermes/claim',{protocol},false);assert.equal(claim.status,200,await claim.clone().text());const {job}=await claim.json();assert.equal(job.id,queued.id);assert.equal(job.financial_context,JSON.stringify(evidence.context));assert.equal(job.financial_context_fingerprint,evidence.fingerprint);assert.equal(createHash('sha256').update('{"job_id":'+JSON.stringify(job.id)+',"context":'+job.financial_context+'}').digest('hex'),evidence.fingerprint);assert.match(job.financial_context,/Memória observada:/);assert.equal(JSON.parse(job.task).ads_execution,'LOCKED');assert.doesNotMatch(job.financial_context,/PRIVATE_|order_sn|buyer|access_token|refresh_token/);
 assert.deepEqual([f.calls.finance.length,f.calls.ads.length,f.calls.list.length,f.calls.detail.length,f.calls.payment.length],providerCounts,'memory, queue and claim do not refresh any financial or advertising provider');assert.equal(externalReads,0);
 const finished=await invoke('/api/hermes/finish',{id:job.id,lease:job.lease,status:'completed',cost_cents:0,result:'Synthetic evidence-backed descriptive review.',financial_context_fingerprint:job.financial_context_fingerprint},false);assert.equal(finished.status,200,await finished.clone().text());assert.deepEqual(await(await invoke(evidencePath)).json(),evidence,'the analysis retains its original memory and financial fingerprint');
 // A broken optional memory row cannot break an otherwise valid daily report
 // or send untrusted text into the bridge. Financial facts keep their contract.
 const stored=JSON.parse(env.ADMIN_DB.db.prepare('SELECT payload FROM mls_agent_learning_observations').get().payload);stored.private_text='PRIVATE_UNTRUSTED_MODEL_TEXT';env.ADMIN_DB.db.prepare('UPDATE mls_agent_learning_observations SET payload=?').run(JSON.stringify(stored));
 const fallback=await api.prepareHermesFinancialContext(env,jobId,analysisDate,{now:f.now,taskRaw});assert.deepEqual(fallback.context,baseline.context);assert.equal(fallback.fingerprint,baseline.fingerprint);assert.doesNotMatch(JSON.stringify(fallback.context),/PRIVATE_UNTRUSTED_MODEL_TEXT/);assert.equal(externalReads,0);
});
