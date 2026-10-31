import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {MeteredHistoryD1,base,stamp,month,historyReturnsReport,publishHistoryMonth,fairnessSnapshot} from './m2-history-fixture.mjs';

for(const minify of [false,true])test(`the generated App prioritizes both exact published Returns slots without a second source or owner-read work (minify=${minify})`,async t=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const app=(await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'))).default;
 const db=new MeteredHistoryD1(),clock={time:base},now=()=>clock.time,SavedDate=globalThis.Date,savedFetch=globalThis.fetch,origin='https://m2-history.compiled.test';
 globalThis.Date=class extends SavedDate{constructor(...args){super(...(args.length?args:[clock.time]));}static now(){return clock.time;}};
 const env={ADMIN_DB:db,APP_INTERNAL_SECRET:'PRIVATE_M2_HISTORY_APP_'+'a'.repeat(40),ADMIN_USERNAME:'m2-history-owner',ADMIN_PASSWORD:'m2-history-password-123456',ADMIN_SESSION_SECRET:'PRIVATE_M2_HISTORY_SESSION_'+'s'.repeat(40)},calls=[];
 t.after(()=>{globalThis.Date=SavedDate;globalThis.fetch=savedFetch;db.db.close();});
 const cron=async()=>{const tasks=[];await app.scheduled({cron:'* * * * *',scheduledTime:clock.time},env,{waitUntil:task=>tasks.push(task)});assert.equal(tasks.length,1);return(await Promise.all(tasks))[0];};
 assert.equal((await cron()).lane,'MAINTENANCE');
 const frames=await publishHistoryMonth(env,now),publication=db.db.prepare('SELECT * FROM business_month_publications').get();
 db.db.prepare('UPDATE business_sync_state SET next_run_at=?,summary=?').run(stamp+3600,JSON.stringify({month,status:'COMPLETE'}));
 globalThis.fetch=async request=>{
  assert.ok(request instanceof Request);assert.equal(request.url,'https://auth.brazacommerce.com.br/internal/shopee/finance/reconciliation');assert.equal(request.method,'POST');assert.equal(request.redirect,'manual');assert.equal(request.headers.get('x-braza-app-key'),env.APP_INTERNAL_SECRET);for(const name of ['cookie','authorization','x-braza-finance-router'])assert.equal(request.headers.get(name),null);
  const input=await request.json();calls.push(input);assert.deepEqual(Object.keys(input).sort(),['operation','run_id']);assert.equal(input.operation,'step');const frame=frames.find(row=>row.run_id===input.run_id);assert.ok(frame);return Response.json(historyReturnsReport(frame,Math.floor(now()/1000)));
 };
 const login=await app.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
 const observe=async()=>{const response=await app.fetch(new Request(origin+'/api/admin/finance/reconciliation?month='+month,{headers:{cookie}}),env);assert.equal(response.status,200,await response.clone().text());return response.json();};
 const initial=await observe();assert.equal(initial.reports.length,0);assert.equal(calls.length,0);
 for(let index=0;index<2;index++){
  db.rpc=0;const work=await cron();assert.equal(work.lane,'HISTORY');assert.equal(work.reconciliation,'CHECKED');assert.equal(calls.length,index+1);assert.ok(db.rpc+1<=50,`compiled Returns budget ${db.rpc}+1`);clock.time+=60000;
 }
 const saved=fairnessSnapshot(db),view=await observe();assert.equal(view.reports.length,2);assert.deepEqual(view.sources.map(row=>row.run_id),frames.map(row=>row.run_id));assert.deepEqual(calls.map(row=>row.run_id),frames.map(row=>row.run_id));assert.ok(view.reports.every(row=>row.source_revision===2&&row.pending.includes('SETTLEMENT_NOT_RECONCILED')));
 await observe();await observe();assert.equal(calls.length,2);assert.deepEqual(fairnessSnapshot(db),saved);assert.deepEqual(db.db.prepare('SELECT * FROM business_month_publications').get(),publication);
 assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM historical_cost_evidence_runs').get().n,0,'ready costs cannot displace the two missing reports');
 const exposed=JSON.stringify(view);assert.ok(!exposed.includes(env.APP_INTERNAL_SECRET));assert.ok(!exposed.includes(env.ADMIN_SESSION_SECRET));
});
