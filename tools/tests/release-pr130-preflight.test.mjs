import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {evaluatePr130MergePreflight,PR130_MERGE_BASE_COMMIT,PR130_MERGE_MANIFEST_PATH,PR130_MERGE_OWNER_AUTHORIZATION,PR130_FROZEN_RELEASE_MANIFEST_SHA256,PR130_GUARDED_DEPLOY_PATH,PR130_GUARDED_DEPLOY_SHA256,PR130_BASE_DEPLOY_SHA256,pr130GuardedDeploymentSourceMatchesBaseline,RELEASE_MANUAL_GATES} from '../release_preflight.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
function good(){
 const files=[
  {path:'web/cloudflare/src/admin.mjs',sha256:'1'.repeat(64)},
  {path:'web/cloudflare/src/business-cost-history-report.mjs',sha256:'2'.repeat(64)}
 ];
 const expected_hashes={app:'3'.repeat(64),auth:'4'.repeat(64),finance:'5'.repeat(64)};
 return {
  baseCommit:PR130_MERGE_BASE_COMMIT,
  changedPaths:[PR130_MERGE_MANIFEST_PATH,...files.map(row=>row.path)],
  buildHashes:{...expected_hashes},
  candidate:{schema:'mls_pr130_merge_candidate_v1',pull_request:130,base_commit:PR130_MERGE_BASE_COMMIT,prepared_source_commit:'a'.repeat(40),
   owner_authorization:PR130_MERGE_OWNER_AUTHORIZATION,production_approved:false,live_authorization:false,commercial_writes_allowed:false,expected_hashes,files},
  currentFileHashes:Object.fromEntries(files.map(row=>[row.path,row.sha256])),
  preparedFileHashes:Object.fromEntries(files.map(row=>[row.path,row.sha256])),
  preparedSourceIsAncestor:true,preparedSourceDescendsFromBase:true,frozenReleaseManifestHash:PR130_FROZEN_RELEASE_MANIFEST_SHA256,
  appConfig:{name:'brazacommerce-app',main:'../../dist/app-worker.mjs',keep_vars:true,d1_databases:[{binding:'ADMIN_DB',database_id:'synthetic-fixture'}]},
  adminSource:"function mlsV36OwnerPreviewEnabled(env,ownerSession){return ownerSession?.role==='owner'&&env?.MLS_V36_OWNER_PREVIEW==='ENABLED';} function mlsAiSalesOwnerPreviewEnabled(env,ownerSession){return ownerSession?.role==='owner'&&env?.MLS_AI_SALES_OWNER_PREVIEW==='ENABLED';} const preview=markupCompatible&&mlsV36OwnerPreviewEnabled(env,ownerSession); const aiPreview=mlsAiSalesOwnerPreviewEnabled(env,ownerSession);return dashboard(env,current)",
  buildSource:"ai_sales_view=... listing_factory_view=... approved_design=... '+approved_design+'\\n'+ads_workspace+",
  workflowSource:"node --test --test-reporter=tap; python3 -m unittest"
 };
}
test('PR130 exact candidate authorizes local merge preparation only and retains every manual production gate',()=>{
 const result=evaluatePr130MergePreflight(good());
 assert.equal(result.ok,true);
 assert.deepEqual(result.failures,[]);
 assert.equal(result.scope,'MERGE_ONLY');
 assert.equal(result.productionApproved,false);
 assert.equal(result.liveAuthorization,false);
 assert.equal(result.commercialWritesAllowed,false);
 assert.equal(result.remoteCloudflareVerified,false);
 assert.deepEqual(result.manualGates,RELEASE_MANUAL_GATES);
 assert.ok(Object.isFrozen(result));
});
test('the frozen November13 manifest remains byte-for-byte preserved independently of PR130',()=>{
 assert.equal(digest(fs.readFileSync(new URL('../release-approved-candidate.json',import.meta.url))),PR130_FROZEN_RELEASE_MANIFEST_SHA256);
 const changed=good();changed.frozenReleaseManifestHash='0'.repeat(64);
 assert.ok(evaluatePr130MergePreflight(changed).failures.includes('RELEASE_FROZEN_MANIFEST_CHANGED'));
});
test('merge manifest rejects unsupported authority, production permissions, malformed hashes and unbounded paths',()=>{
 for(const mutate of [
  value=>value.schema='mls_release_candidate_v1',
  value=>value.pull_request=131,
  value=>value.base_commit='b'.repeat(40),
  value=>value.prepared_source_commit='main',
  value=>value.prepared_source_commit=value.base_commit,
  value=>value.owner_authorization='OWNER_REQUESTED_FINANCIAL_AUTOMATION_LIVE_2026_11_13',
  value=>value.production_approved=true,
  value=>value.live_authorization=true,
  value=>value.commercial_writes_allowed=true,
  value=>delete value.expected_hashes.finance,
  value=>value.expected_hashes.app='arbitrary',
  value=>value.files=[],
  value=>value.files.push({...value.files[0]}),
  value=>value.files.reverse(),
  value=>value.files[0].sha256='arbitrary',
  value=>value.files[0].path='../outside.mjs',
  value=>value.files[0].path='web/cloudflare/src/*',
  value=>value.files[0].path='web//cloudflare/src/future.mjs',
  value=>value.files[0].path=PR130_MERGE_MANIFEST_PATH,
  value=>value.extra_authority=true
 ]){
  const input=good();mutate(input.candidate);
  assert.deepEqual(evaluatePr130MergePreflight(input).failures,['RELEASE_MERGE_MANIFEST_INVALID']);
 }
});
test('a merge manifest cannot authorize configuration, deployment, original Workers, Finance or CI edits',()=>{
 for(const path of ['workers/app/wrangler.json','web/finance/src/future-provider-write.mjs','web/auth/src/index.mjs','web/cloudflare/original/app-worker.mjs','.github/workflows/validate.yml','tools/worker_deploy.mjs','tools/capture_worker_config.mjs','tools/import_worker_config.mjs','tools/release-approved-candidate.json']){
  const input=good();input.candidate.files=[{path,sha256:'1'.repeat(64)}];
  assert.deepEqual(evaluatePr130MergePreflight(input).failures,['RELEASE_MERGE_MANIFEST_INVALID'],path);
 }
});
test('merge preparation requires exact base and base-to-source-to-head ancestry',()=>{
 for(const mutate of [
  input=>input.baseCommit='b'.repeat(40),
  input=>input.preparedSourceIsAncestor=false,
  input=>input.preparedSourceDescendsFromBase=false,
  input=>delete input.preparedSourceIsAncestor
 ]){
  const input=good();mutate(input);
  assert.equal(evaluatePr130MergePreflight(input).ok,false);
 }
});
test('the complete finite diff must match exactly without missing, duplicate or unreviewed paths',()=>{
 for(const mutate of [
  input=>input.changedPaths.pop(),
  input=>input.changedPaths.push('web/cloudflare/src/future-write.mjs'),
  input=>input.changedPaths.push('web/finance/src/future-provider-write.mjs'),
  input=>input.changedPaths.push(input.changedPaths[0]),
  input=>input.changedPaths=[],
  input=>input.changedPaths=null
 ]){
  const input=good();mutate(input);
  assert.equal(evaluatePr130MergePreflight(input).ok,false);
 }
});
test('each reviewed file must match both current bytes and the prepared Git snapshot',()=>{
 for(const map of ['currentFileHashes','preparedFileHashes']){
  for(const mutate of [
   input=>input[map]['web/cloudflare/src/admin.mjs']='0'.repeat(64),
   input=>delete input[map]['web/cloudflare/src/admin.mjs'],
   input=>input[map]['web/cloudflare/src/unlisted.mjs']='0'.repeat(64),
   input=>input[map]=null
  ]){
   const input=good();mutate(input);
   assert.ok(evaluatePr130MergePreflight(input).failures.includes('RELEASE_MERGE_SOURCE_HASH_MISMATCH'));
  }
 }
});
test('any changed generated App, Auth or Finance artifact fails exact merge verification',()=>{
 for(const kind of ['app','auth','finance']){
  const input=good();input.buildHashes[kind]='0'.repeat(64);
  assert.ok(evaluatePr130MergePreflight(input).failures.includes('RELEASE_WORKER_HASH_MISMATCH'),kind);
 }
 const missing=good();delete missing.buildHashes.finance;
 assert.ok(evaluatePr130MergePreflight(missing).failures.includes('RELEASE_WORKER_HASH_MISMATCH'));
});
test('merge preparation preserves owner controls, asset composition and read-only CI checks',()=>{
 for(const [mutate,code] of [
  [input=>input.appConfig.keep_vars=false,'RELEASE_APP_CONFIG_INVALID'],
  [input=>input.appConfig.vars={MLS_V36_OWNER_PREVIEW:'ENABLED'},'RELEASE_PREVIEW_CONFIG_MUST_BE_ABSENT'],
  [input=>input.adminSource=input.adminSource.replace("ownerSession?.role==='owner'","true"),'RELEASE_OWNER_GATE_CHANGED'],
  [input=>input.buildSource='','RELEASE_COMBINED_BUNDLE_MISSING'],
  [input=>input.workflowSource+='; npm run deploy:app','RELEASE_CI_NOT_READ_ONLY'],
  [input=>input.workflowSource='node --test --test-reporter=tap','RELEASE_CI_NOT_READ_ONLY']
 ]){
  const input=good();mutate(input);
  assert.ok(evaluatePr130MergePreflight(input).failures.includes(code),code);
 }
});

test('the actual CLI selects the verified PR130 base and cannot fall back when its manifest is absent or invalid',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mls-pr130-merge-preflight-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const sourceRoot=fileURLToPath(new URL('../../',import.meta.url));
 const clone=spawnSync('git',['clone','--shared','--no-checkout',sourceRoot,directory],{encoding:'utf8'});
 assert.equal(clone.status,0,clone.stderr);
 const checkout=spawnSync('git',['checkout','--detach',PR130_MERGE_BASE_COMMIT],{cwd:directory,encoding:'utf8'});
 assert.equal(checkout.status,0,checkout.stderr);
 fs.writeFileSync(path.join(directory,'tools/release_preflight.mjs'),fs.readFileSync(new URL('../release_preflight.mjs',import.meta.url)));
 fs.mkdirSync(path.join(directory,'dist'),{recursive:true});
 for(const kind of ['app','auth','finance'])fs.writeFileSync(path.join(directory,'dist',kind+'-worker.mjs'),'SYNTHETIC_LOCAL_PREFLIGHT_ARTIFACT');
 const manifest=path.join(directory,PR130_MERGE_MANIFEST_PATH);
 fs.rmSync(manifest,{force:true});
 for(const invalid of [null,'{}','{invalid json']){
  if(invalid!==null)fs.writeFileSync(manifest,invalid);
  const result=spawnSync(process.execPath,[path.join(directory,'tools/release_preflight.mjs'),'--base='+PR130_MERGE_BASE_COMMIT],{cwd:directory,encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/^RELEASE_MERGE_MANIFEST_INVALID\s*$/);
  assert.doesNotMatch(result.stderr,/RELEASE_BASE_MISMATCH|RELEASE_LOCAL_PREFLIGHT_OK/);
 }
});

test('the only deploy-file exception is the exact two-line additive production guard over the unchanged baseline',()=>{
 const sourceRoot=fileURLToPath(new URL('../../',import.meta.url));
 const observed=spawnSync('git',['show',PR130_MERGE_BASE_COMMIT+':'+PR130_GUARDED_DEPLOY_PATH],{cwd:sourceRoot,encoding:'utf8'});
 assert.equal(observed.status,0,observed.stderr);
 const baseline=observed.stdout,source=fs.readFileSync(path.join(sourceRoot,PR130_GUARDED_DEPLOY_PATH),'utf8');
 assert.equal(digest(baseline),PR130_BASE_DEPLOY_SHA256);
 assert.equal(digest(source),PR130_GUARDED_DEPLOY_SHA256);
 assert.equal(pr130GuardedDeploymentSourceMatchesBaseline(source,baseline),true);
 for(const changed of [baseline,source+'\n',source.replace('  assertProductionDeploymentContext(target,root);\n',''),source.replace("import {assertProductionDeploymentContext} from './isolated_preview.mjs';\n",''),source.replace('keep_vars !== true','keep_vars !== false')]){
  assert.equal(pr130GuardedDeploymentSourceMatchesBaseline(changed,baseline),false);
 }
 assert.equal(pr130GuardedDeploymentSourceMatchesBaseline(source,baseline+'\n'),false);
 const input=good(),file={path:PR130_GUARDED_DEPLOY_PATH,sha256:PR130_GUARDED_DEPLOY_SHA256};
 input.candidate.files=[file];input.changedPaths=[PR130_MERGE_MANIFEST_PATH,file.path];
 input.currentFileHashes={[file.path]:file.sha256};input.preparedFileHashes={[file.path]:file.sha256};
 input.guardedDeploymentSourceMatchesBaseline=true;
 assert.equal(evaluatePr130MergePreflight(input).ok,true);
 input.guardedDeploymentSourceMatchesBaseline=false;
 assert.ok(evaluatePr130MergePreflight(input).failures.includes('RELEASE_DEPLOY_GUARD_SOURCE_CHANGED'));
 input.guardedDeploymentSourceMatchesBaseline=true;
 input.candidate.files[0].sha256=PR130_BASE_DEPLOY_SHA256;
 assert.deepEqual(evaluatePr130MergePreflight(input).failures,['RELEASE_MERGE_MANIFEST_INVALID']);
});
