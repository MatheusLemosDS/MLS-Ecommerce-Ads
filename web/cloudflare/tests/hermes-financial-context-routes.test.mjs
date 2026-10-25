import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';

for(const minify of [false,true])test(`compiled App pins and returns the same financial context through heartbeat, queue, claim and finish (minify=${minify})`,async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const origin='https://app.compiled.test',protocol='hermes-finance-v1',env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'compiled-finance-context-session-12345678901234567890',ADMIN_USERNAME:'compiled-context-owner',ADMIN_PASSWORD:'compiled-context-password-123456',HERMES_BRIDGE_SECRET:'compiled-context-bridge-secret-1234567890'},previousFetch=globalThis.fetch;let providerCalls=0;
 globalThis.fetch=async()=>{providerCalls++;throw Error('UNEXPECTED_EXTERNAL_SOURCE_CALL');};
 try{
  const login=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
  const invoke=(path,body,owner=true)=>worker.fetch(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{...(owner?{origin,cookie}:{authorization:'Bearer '+env.HERMES_BRIDGE_SECRET}),'content-type':'application/json',...(owner&&body!==undefined?{'x-csrf-token':csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)}),env);
  let csrf;const state=await(await invoke('/api/admin/state')).json();csrf=state.csrf;assert.equal(state.hermes_finance_ready,false);assert.equal(state.ads_execution,'LOCKED');
  const beat=await invoke('/api/hermes/heartbeat',{protocol},false);assert.equal(beat.status,200);assert.deepEqual(await beat.json(),{ok:true,protocol});assert.equal((await(await invoke('/api/admin/state')).json()).hermes_finance_ready,true);
  const queuedResponse=await invoke('/api/admin/jobs',{});assert.equal(queuedResponse.status,202,await queuedResponse.clone().text());const queued=await queuedResponse.json();assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM hermes_financial_contexts').get().n,1);
  const evidencePath='/api/admin/jobs/'+queued.id+'/financial-context';assert.equal((await worker.fetch(new Request(origin+evidencePath),env)).status,401);
  const evidenceResponse=await invoke(evidencePath);assert.equal(evidenceResponse.status,200,await evidenceResponse.clone().text());const evidence=await evidenceResponse.json();assert.deepEqual(Object.keys(evidence),['job_id','fingerprint','context']);assert.equal(evidence.context.available,true,'a bundled helper must not silently fail into an invalid-frame context');assert.equal(evidence.context.monthly.summary.schema,'monthly_financial_summary_v1');assert.equal(evidence.context.monthly.actual_profit_cents,null);assert.equal(evidence.context.monthly.execution,'READ_ONLY');assert.equal(evidence.context.monthly.status,'RUNNING');assert.equal(evidence.context.monthly.totals.net_estimate_cents,null);
  const oldClaim=await invoke('/api/hermes/claim',{},false);assert.deepEqual(await oldClaim.json(),{job:null,reason:'HERMES_BRIDGE_UPGRADE_REQUIRED'});
  const claimResponse=await invoke('/api/hermes/claim',{protocol},false);assert.equal(claimResponse.status,200,await claimResponse.clone().text());const {job}=await claimResponse.json();assert.equal(job.id,queued.id);assert.equal(job.financial_context,JSON.stringify(evidence.context));assert.equal(job.financial_context_fingerprint,evidence.fingerprint);assert.equal(createHash('sha256').update('{"job_id":'+JSON.stringify(job.id)+',"context":'+job.financial_context+'}').digest('hex'),evidence.fingerprint);assert.equal(JSON.parse(job.task).start_date,evidence.context.analysis_date);
  const draining=await invoke('/api/hermes/heartbeat',{protocol,drain:true},false);assert.deepEqual(await draining.json(),{ok:true,protocol,draining:true,safe_to_restart:false});assert.equal((await(await invoke('/api/hermes/claim',{protocol},false)).json()).job,null);
  const report={id:job.id,lease:job.lease,status:'completed',cost_cents:15,result:'Compiled snapshot-backed read-only review.'};assert.equal((await invoke('/api/hermes/finish',report,false)).status,409);
  const finished=await invoke('/api/hermes/finish',{...report,financial_context_fingerprint:job.financial_context_fingerprint},false);assert.equal(finished.status,200,await finished.clone().text());assert.deepEqual(await finished.json(),{ok:true});assert.equal(env.ADMIN_DB.db.prepare('SELECT status FROM hermes_jobs WHERE id=?').get(job.id).status,'completed');assert.deepEqual(await(await invoke(evidencePath)).json(),evidence);
  assert.equal((await(await invoke('/api/hermes/heartbeat',{protocol,drain:true},false)).json()).safe_to_restart,true);assert.equal(providerCalls,0,'context capture and every lifecycle route use local stored financial data only');
 }finally{globalThis.fetch=previousFetch;env.ADMIN_DB.db.close();}
});
