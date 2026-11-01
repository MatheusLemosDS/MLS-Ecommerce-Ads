import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {evaluateReleasePreflight,RELEASE_EXPECTED_SHA,RELEASE_ALLOWED_FILES,RELEASE_MANUAL_GATES,RELEASE_BASE_COMMIT,RELEASE_EXPECTED_LIVE_FLAGS,RELEASE_APPROVED_PROTECTED_FILES} from '../release_preflight.mjs';

function good(){
 return {
  baseCommit:RELEASE_BASE_COMMIT,
  changedPaths:['tools/release-approved-candidate.json','tools/tests/release-preflight.test.mjs'],
  buildHashes:{...RELEASE_EXPECTED_SHA},
  appConfig:{
   name:'brazacommerce-app',main:'../../dist/app-worker.mjs',keep_vars:true,
   d1_databases:[{binding:'ADMIN_DB',database_id:'fixture-uuid'}]
  },
  adminSource:"function mlsV36OwnerPreviewEnabled(env,ownerSession){return ownerSession?.role==='owner'&&env?.MLS_V36_OWNER_PREVIEW==='ENABLED';} function mlsAiSalesOwnerPreviewEnabled(env,ownerSession){return ownerSession?.role==='owner'&&env?.MLS_AI_SALES_OWNER_PREVIEW==='ENABLED';} const preview=markupCompatible&&mlsV36OwnerPreviewEnabled(env,ownerSession); const aiPreview=mlsAiSalesOwnerPreviewEnabled(env,ownerSession);return dashboard(env,current)",
  buildSource:"ai_sales_view=... listing_factory_view=... approved_design=... '+approved_design+'\\n'+ads_workspace+",
  workflowSource:"node --test --test-reporter=tap; python3 -m unittest"
 };
}
test('release preflight passes only an exact reviewed local build and leaves remote status unverified',()=>{
 const r=evaluateReleasePreflight(good());
 assert.equal(r.ok,true);
 assert.deepEqual(r.failures,[]);
 assert.equal(r.remoteCloudflareVerified,false);
 assert.equal(r.productionApproved,false);
 assert.ok(RELEASE_MANUAL_GATES.includes('VERIFY_REMOTE_OWNER_FLAGS_MATCH_APPROVED_VALUES'));
 assert.ok(RELEASE_ALLOWED_FILES.includes('tools/release-approved-candidate.json'));
 assert.ok(!RELEASE_ALLOWED_FILES.some(x=>x.startsWith('workers/')));
 assert.ok(RELEASE_ALLOWED_FILES.filter(x=>x.startsWith('web/finance/')).every(x=>RELEASE_APPROVED_PROTECTED_FILES.includes(x)));
});

test('current and previous-month Returns never opens protected worker files',()=>{
 assert.equal(RELEASE_APPROVED_PROTECTED_FILES.length,0);
 assert.ok(RELEASE_APPROVED_PROTECTED_FILES.every(x=>x.startsWith('web/finance/')&&!/[?*\\]/.test(x)));
 for(const path of ['web/finance/src/auth-json-transport.mjs','web/finance/src/connection-store.mjs','web/finance/src/income-detail.mjs','web/finance/src/connection-worker.mjs','web/finance/src/auth-router.mjs','web/finance/src/production-worker.mjs','web/finance/src/pending-income-frame.mjs','web/finance/src/pending-income-scan.mjs','web/finance/tests/pending-income-scan.test.mjs','web/auth/src/index.mjs','workers/app/wrangler.json']){
  const data=good();data.changedPaths.push(path);
  assert.ok(evaluateReleasePreflight(data).failures.includes('RELEASE_PROTECTED_WORKER_PATH'),path);
 }
 for(const path of RELEASE_APPROVED_PROTECTED_FILES.filter(path=>RELEASE_ALLOWED_FILES.includes(path))){
  const data=good();data.changedPaths.push(path);
  assert.equal(evaluateReleasePreflight(data).ok,true,path);
 }
});

test('release guard refuses any exact SHA mismatch, including unchanged Auth or Finance',()=>{
 for(const key of ['app','auth','finance']){
  const data=good();data.buildHashes[key]='0'.repeat(64);
  assert.equal(evaluateReleasePreflight(data).ok,false);
  assert.ok(evaluateReleasePreflight(data).failures.includes('RELEASE_WORKER_HASH_MISMATCH'));
 }
});

test('release preflight blocks undocumented file modifications and any protected Worker source/config',()=>{
 for(const path of ['workers/app/wrangler.json','workers/auth/wrangler.json',
  'workers/finance/migration.json','web/finance/src/index.mjs',
  'web/cloudflare/original/app-worker.mjs','web/cloudflare/src/new-shop-write.mjs',
  'web/cloudflare/src/mls-ai-sales-workspace-store.mjs',
  'package-lock.json']){
  const data=good();data.changedPaths.push(path);
  const result=evaluateReleasePreflight(data);
  assert.equal(result.ok,false,path);
  assert.ok(result.failures.includes('RELEASE_UNREVIEWED_PATH'),path);
 }
});

test('release preflight rejects either owner activation flag in tracked wrangler vars',()=>{
 for(const flag of Object.keys(RELEASE_EXPECTED_LIVE_FLAGS))for(const value of ['ENABLED','DISABLED']){
  const data=good();data.appConfig.vars={[flag]:value};
  assert.ok(evaluateReleasePreflight(data).failures.includes('RELEASE_PREVIEW_CONFIG_MUST_BE_ABSENT'),flag+' '+value);
 }
});

test('release preflight rejects missing App binding or a changed keep_vars policy',()=>{
 for(const change of [
  x=>x.appConfig.keep_vars=false,
  x=>x.appConfig.d1_databases=[],
  x=>x.appConfig.d1_databases.push({binding:'ADMIN_DB'}),
  x=>x.appConfig.main='../unexpected.mjs',
  x=>x.appConfig.name='another-worker']){
  const data=good();change(data);
  assert.ok(evaluateReleasePreflight(data).failures.includes('RELEASE_APP_CONFIG_INVALID'));
 }
});

test('owner-only exact flag and bundle inclusion must not be relaxed or accidentally dropped',()=>{
 for(const change of [
  x=>x.adminSource=x.adminSource.replace("ownerSession?.role==='owner'","true"),
  x=>x.adminSource=x.adminSource.replace("==='ENABLED'","==='true'"),
  x=>x.adminSource=x.adminSource.replace('return dashboard(env,current)','return dashboard()'),
  x=>x.buildSource=x.buildSource.replace('approved_design=',''),
  x=>x.buildSource=x.buildSource.replace('listing_factory_view=',''),
  x=>x.adminSource=x.adminSource.replace("env?.MLS_AI_SALES_OWNER_PREVIEW==='ENABLED'","env?.MLS_AI_SALES_OWNER_PREVIEW==='true'"),
  x=>x.adminSource=x.adminSource.replace('const aiPreview=mlsAiSalesOwnerPreviewEnabled(env,ownerSession)','const aiPreview=true'),
  x=>x.buildSource=x.buildSource.replace('ai_sales_view=','')]){
  const data=good();change(data);
  const failures=evaluateReleasePreflight(data).failures;
  assert.ok(failures.includes('RELEASE_OWNER_GATE_CHANGED')||
   failures.includes('RELEASE_COMBINED_BUNDLE_MISSING'),JSON.stringify(failures));
 }
});

test('release CI cannot deploy and may not omit real tests',()=>{
 for(const workflow of [
  'node --test --test-reporter=tap; npm run deploy:app; python3 -m unittest',
  'node --test --test-reporter=tap; wrangler deploy; python3 -m unittest',
  'node --test --test-reporter=tap',
  'python3 -m unittest']){
  const data=good();data.workflowSource=workflow;
  assert.ok(evaluateReleasePreflight(data).failures.includes('RELEASE_CI_NOT_READ_ONLY'));
 }
});

test('malformed or missing diff cannot pass',()=>{
 for(const changedPaths of [[],null,['../workers/app/wrangler.json'],['']]){
  const data=good();data.changedPaths=changedPaths;
  assert.ok(evaluateReleasePreflight(data).failures.includes('RELEASE_DIFF_UNAVAILABLE'));
 }
});

test('release requires the exact reviewed main commit and exact independently controlled owner flags',()=>{
 assert.deepEqual(RELEASE_EXPECTED_LIVE_FLAGS,{MLS_V36_OWNER_PREVIEW:'ENABLED',MLS_AI_SALES_OWNER_PREVIEW:'ENABLED'});
 for(const baseCommit of [null,undefined,'0'.repeat(40),'main']){
  const data=good();data.baseCommit=baseCommit;
  assert.ok(evaluateReleasePreflight(data).failures.includes('RELEASE_BASE_MISMATCH'));
 }
 assert.ok(RELEASE_ALLOWED_FILES.includes('tools/release-approved-candidate.json'));
 assert.equal(new Set(RELEASE_ALLOWED_FILES).size,RELEASE_ALLOWED_FILES.length);
 assert.ok(RELEASE_ALLOWED_FILES.every(value=>!/[?*\\]/.test(value)));
});

test('a malformed candidate cannot weaken exact hashes, literal paths or commercial-write denial',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mls-release-manifest-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const source=fs.readFileSync(new URL('../release_preflight.mjs',import.meta.url),'utf8');
 const candidate=JSON.parse(fs.readFileSync(new URL('../release-approved-candidate.json',import.meta.url),'utf8'));
 const modulePath=path.join(directory,'release_preflight.mjs');fs.writeFileSync(modulePath,source);
 for(const mutate of [
  value=>delete value.expected_hashes.finance,
  value=>value.expected_hashes.app='arbitrary',
  value=>value.allowed_files.push('web/cloudflare/src/*'),
  value=>value.allowed_files.push(value.allowed_files[0]),
  value=>value.commercial_writes_allowed=true,
  value=>value.expected_live_flags.MLS_AI_SALES_OWNER_PREVIEW='true',
  value=>value.base_commit='main',
 ]){
  const changed=structuredClone(candidate);mutate(changed);
  fs.writeFileSync(path.join(directory,'release-approved-candidate.json'),JSON.stringify(changed));
  const result=spawnSync(process.execPath,['--input-type=module','-e','await import('+JSON.stringify(pathToFileURL(modulePath).href)+')'],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/RELEASE_CANDIDATE_MANIFEST_INVALID/);
 }
});

test('the focused release does not inherit unrelated AI-storage or previous-candidate permissions',()=>{
 assert.equal(RELEASE_BASE_COMMIT,'8acf6b921e7368afa98453451ee6b9092c58fd54');
 for(const baseCommit of ['2ab4c9d8baa3c25e5816bcca14b4a0973ea73d5a','8d66525bc3b96914412a9538d3ec84048ac78dbb']){
  const oldBase=good();oldBase.baseCommit=baseCommit;
  assert.ok(evaluateReleasePreflight(oldBase).failures.includes('RELEASE_BASE_MISMATCH'));
 }
 for(const filename of ['web/cloudflare/src/mls-ai-sales-workspace-store.mjs','tools/mls-ai-sales/render.mjs']){
  assert.ok(!RELEASE_ALLOWED_FILES.includes(filename),filename);
  const input=good();input.changedPaths.push(filename);
  assert.ok(evaluateReleasePreflight(input).failures.includes('RELEASE_UNREVIEWED_PATH'),filename);
 }
});
