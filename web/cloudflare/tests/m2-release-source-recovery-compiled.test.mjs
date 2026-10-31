import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {sourceRecoveryMonth,sourceRecoveryFixture,saveSourceRecoveryGap,currentRecoveryRow,readRecoveryPublication} from './m2-release-source-recovery-fixture.mjs';

async function compiledHistory(minify){
 const source=await readFile(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8'),seam='return {adminFetch,schedule,scheduledWork,workspaceAuthFetch};';assert.equal(source.split(seam).length,2);
 const contents=source.replace(seam,'return {adminFetch,schedule,scheduledWork,workspaceAuthFetch,runBusinessHistorySync};')+'\nexport {brazaAdmin as recoverySmoke};';
 const result=await build({stdin:{contents,loader:'js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});return(await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))).recoverySmoke;
}
for(const minify of [false,true])test(`generated history recovers only an exact missing-source cohort with one existing source step (minify=${minify})`,async t=>{
 const compiled=await compiledHistory(minify);
 await t.test('idle maintenance rehydrates saved Finance identities while retaining the old publication until complete',async child=>{
  const f=await sourceRecoveryFixture(child),ads=f.calls.ads.length;saveSourceRecoveryGap(f);let completed=false,steps=0;
  for(let opportunity=0;opportunity<30;opportunity++){
   if(opportunity)f.clock.time+=61000;f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET next_run_at=? WHERE id=1').run(Math.floor(f.now()/1000)+300);
   const before=currentRecoveryRow(f),reads=f.calls.finance.length,work=await compiled.runBusinessHistorySync(f.env,f.services,{now:f.now,currentStatus:'NOT_DUE'});assert.deepEqual(currentRecoveryRow(f),before,'current-month Finance remains authoritative');assert.ok(f.calls.finance.length-reads<=1,'one existing private Finance source per opportunity');assert.ok(work.finance_steps<=1);steps+=work.finance_steps;assert.equal(f.calls.ads.length,ads);
   if(work.status==='COMPLETE'){completed=true;break;}
   assert.equal(work.status,'RUNNING');assert.deepEqual(await readRecoveryPublication(f),f.original,'an incomplete restoration cannot replace the published cohort');
  }
  assert.equal(completed,true);assert.ok(steps>1);const after=await readRecoveryPublication(f);assert.ok(after.publication.source_revision>f.original.publication.source_revision);assert.equal(after.payload.slots.reduce((n,slot)=>n+slot.frame.coverage.paid,0),24);assert.ok(after.payload.slots.every(slot=>!f.original.payload.slots.some(old=>old.frame.run_id===slot.frame.run_id)));
  for(const slot of after.payload.slots)assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) AS n FROM finance_business_period_runs WHERE run_id=?').get(slot.frame.run_id).n,1);
  assert.ok(f.sourceOptions.every(options=>options.timeoutMs===45000));const row=f.env.ADMIN_DB.db.prepare('SELECT failure_count,last_error FROM business_history_sync_state WHERE month=?').get(sourceRecoveryMonth);assert.equal(row.failure_count,0);assert.equal(row.last_error,null);
  f.clock.time+=901000;f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET next_run_at=? WHERE id=1').run(Math.floor(f.now()/1000)+300);const reads=f.calls.finance.length;assert.equal((await compiled.runBusinessHistorySync(f.env,f.services,{now:f.now,currentStatus:'NOT_DUE'})).status,'IDLE');assert.equal(f.calls.finance.length,reads,'the old cue cannot restart the restored publication');
 });
 await t.test('an old cue, current-month due work and pause do not authorize a terminal-month recollection',async child=>{
  const f=await sourceRecoveryFixture(child),reads=f.calls.finance.length;saveSourceRecoveryGap(f,{scopeRevision:f.original.publication.source_revision-1});assert.equal((await compiled.runBusinessHistorySync(f.env,f.services,{now:f.now,currentStatus:'NOT_DUE'})).status,'IDLE');assert.equal(f.calls.finance.length,reads);
  saveSourceRecoveryGap(f);f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET next_run_at=? WHERE id=1').run(Math.floor(f.now()/1000));const due=await compiled.runBusinessHistorySync(f.env,f.services,{now:f.now,currentStatus:'NOT_DUE'});assert.equal(due.finance_steps,0);assert.equal(f.calls.finance.length,reads);
  f.env.ADMIN_DB.db.prepare("UPDATE business_sync_state SET enabled=0,status='PAUSED',next_run_at=? WHERE id=1").run(Math.floor(f.now()/1000)+300);const paused=await compiled.runBusinessHistorySync(f.env,f.services,{now:f.now,currentStatus:'NOT_DUE'});assert.equal(paused.status,'PAUSED');assert.equal(paused.finance_steps,0);assert.equal(f.calls.finance.length,reads);assert.deepEqual(await readRecoveryPublication(f),f.original);
 });
});
