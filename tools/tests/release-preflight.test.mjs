import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {evaluateReleasePreflight,RELEASE_EXPECTED_SHA,RELEASE_ALLOWED_FILES,RELEASE_MANUAL_GATES,RELEASE_BASE_COMMIT,RELEASE_EXPECTED_LIVE_FLAGS,RELEASE_APPROVED_PROTECTED_FILES,RELEASE_ACCEPTED_OWNER_AUTHORIZATIONS} from '../release_preflight.mjs';

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
 assert.ok(RELEASE_ALLOWED_FILES.filter(x=>x.startsWith('workers/')).every(x=>RELEASE_APPROVED_PROTECTED_FILES.includes(x)));
 assert.equal(RELEASE_ALLOWED_FILES.some(value=>value.startsWith('web/finance/')),false,'the reference-layout release does not reopen the previously reviewed Finance delta');
 assert.ok(RELEASE_ALLOWED_FILES.filter(x=>x.startsWith('web/finance/')).every(x=>RELEASE_APPROVED_PROTECTED_FILES.includes(x)));
 assert.ok(RELEASE_MANUAL_GATES.includes('VERIFY_ACCOUNT_DB_BINDINGS_ADDITIVE_MIGRATIONS_AND_LEGACY_BACKUPS'));
 assert.ok(RELEASE_MANUAL_GATES.includes('VERIFY_APP_AUTH_FINANCE_VERSION_HASHES_AND_PRIVATE_FINANCE_PROFILE'));
 assert.ok(RELEASE_MANUAL_GATES.includes('OWNER_AUTHENTICATED_DESKTOP_MOBILE_QA'));
});

test('V4.1 opens only the exact tenant Finance delta, account sidecars and previously reviewed weekly paths',()=>{
 assert.deepEqual(RELEASE_APPROVED_PROTECTED_FILES,[
  "web/finance/src/auth-router.mjs",
  "web/finance/src/business-period.mjs",
  "web/finance/src/commercial-finance-worker.mjs",
  "web/finance/src/connection-store.mjs",
  "web/finance/src/connection-worker.mjs",
  "web/finance/src/daily-orders-frame.mjs",
  "web/finance/src/daily-orders.mjs",
  "web/finance/src/escrow-release-ledger.mjs",
  "web/finance/src/escrow-releases.mjs",
  "web/finance/src/external-cash-period-frame.mjs",
  "web/finance/src/external-cash-period.mjs",
  "web/finance/src/external-cash-store.mjs",
  "web/finance/src/external-cash-worker.mjs",
  "web/finance/src/financial-order-evidence.mjs",
  "web/finance/src/historical-variant-evidence-frame.mjs",
  "web/finance/src/historical-variant-evidence.mjs",
  "web/finance/src/income-detail.mjs",
  "web/finance/src/income-overview.mjs",
  "web/finance/src/initial-exchange.mjs",
  "web/finance/src/payment-sample.mjs",
  "web/finance/src/pending-income-scan.mjs",
  "web/finance/src/product-index-frame.mjs",
  "web/finance/src/product-index.mjs",
  "web/finance/src/production-orders-frame.mjs",
  "web/finance/src/production-orders.mjs",
  "web/finance/src/production-worker.mjs",
  "web/finance/src/provider-adapter.mjs",
  "web/finance/src/refresh-coordinator.mjs",
  "web/finance/src/refresh-request.mjs",
  "web/finance/src/refresh-response.mjs",
  "web/finance/src/refresh-signature.mjs",
  "web/finance/src/refresh-transport.mjs",
  "web/finance/src/return-item-evidence.mjs",
  "web/finance/src/returns-reconciliation.mjs",
  "web/finance/src/store-period.mjs",
  "web/finance/src/variant-catalog.mjs",
  "web/finance/tests/commercial-compiled-chain.test.mjs",
  "web/finance/tests/external-cash-period-frame.test.mjs",
  "web/finance/tests/external-cash-period-routes.test.mjs",
  "web/finance/tests/external-cash-period.test.mjs",
  "web/finance/tests/tenant-finance-profile.test.mjs",
  "workers/app/browser-assets-published.json",
  "workers/app/commercial-account.json",
  "workers/auth/commercial-account.json",
  "workers/finance/commercial-account.json"
]);
 assert.equal(new Set(RELEASE_APPROVED_PROTECTED_FILES).size,RELEASE_APPROVED_PROTECTED_FILES.length);
 assert.ok(Object.isFrozen(RELEASE_APPROVED_PROTECTED_FILES));
 assert.ok(RELEASE_APPROVED_PROTECTED_FILES.every(x=>!/[?*\\]/.test(x)));

 for(const path of [
  "web/finance/src/auth-json-transport.mjs",
  "web/finance/src/future-tenant-profile.mjs",
  "web/finance/src/commercial/future-worker.mjs",
  "web/finance/src/pending-income-frame.mjs",
  "web/finance/tests/pending-income-scan.test.mjs",
  "web/auth/src/index.mjs",
  "web/cloudflare/original/app-worker.mjs",
  "web/finance/original/finance-worker.mjs",
  "workers/app/wrangler.json",
  "workers/auth/wrangler.json",
  "workers/finance/wrangler.json",
  "workers/app/migration.json",
  "workers/auth/migration.json",
  "workers/finance/migration.json",
  "workers/app/commercial-account-extra.json",
  "workers/auth/automation.json",
  "workers/finance/profile.json"
]){
  const data=good();data.changedPaths.push(path);
  assert.ok(evaluateReleasePreflight(data).failures.includes('RELEASE_PROTECTED_WORKER_PATH'),path);
 }
 for(const path of RELEASE_APPROVED_PROTECTED_FILES.filter(path=>RELEASE_ALLOWED_FILES.includes(path))){
  const data=good();data.changedPaths.push(path);
  assert.equal(evaluateReleasePreflight(data).ok,true,path);
 }
});

test('release guard refuses any exact SHA mismatch, for App, Auth and Finance',()=>{
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
  'web/cloudflare/src/mls-ai-sales-future-store.mjs',
  'tools/mls-ai-sales/future-provider-write.mjs']){
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
  x=>x.adminSource=x.adminSource.replace("ownerSession?.role==='owner'","ownerSession?.role==='OWNER'"),
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
  'node --test --test-reporter=tap; node tools/worker_deploy.mjs deploy app; python3 -m unittest',
  'node --test --test-reporter=tap',
  'python3 -m unittest']){
  const data=good();data.workflowSource=workflow;
  assert.ok(evaluateReleasePreflight(data).failures.includes('RELEASE_CI_NOT_READ_ONLY'));
 }
});

test('malformed or missing diff cannot pass',()=>{
 for(const changedPaths of [[],null,['../workers/app/wrangler.json'],[''],['./web/finance/src/future.mjs'],['web//finance/src/future.mjs'],['web\\finance\\future.mjs'],['web/finance/future.mjs\u0000']]){
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
  value=>value.allowed_files.push('./web/finance/src/future.mjs'),
  value=>value.allowed_files.push('web//finance/src/future.mjs'),
  value=>value.allowed_files.push('web/finance/src/future.mjs\u0000'),
  value=>value.allowed_files.push(value.allowed_files[0]),
  value=>value.commercial_writes_allowed=true,
  value=>value.expected_live_flags.MLS_AI_SALES_OWNER_PREVIEW='true',
  value=>value.base_commit='main',
  value=>value.owner_authorization='OWNER_REQUESTED_V41_LIVE_2026_11_12',
 ]){
  const changed=structuredClone(candidate);mutate(changed);
  fs.writeFileSync(path.join(directory,'release-approved-candidate.json'),JSON.stringify(changed));
  const result=spawnSync(process.execPath,['--input-type=module','-e','await import('+JSON.stringify(pathToFileURL(modulePath).href)+')'],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/RELEASE_CANDIDATE_MANIFEST_INVALID/);
 }
});

test('only the two explicit owner authorization records are recognized, without granting production approval',t=>{
 assert.deepEqual(RELEASE_ACCEPTED_OWNER_AUTHORIZATIONS,[
  'OWNER_REQUESTED_ALL_PREPARED_IMPROVEMENTS_LIVE_2026_10_30',
  'OWNER_REQUESTED_V41_LIVE_2026_11_11',
  'OWNER_REQUESTED_FINANCIAL_AUTOMATION_LIVE_2026_11_13'
 ]);assert.ok(Object.isFrozen(RELEASE_ACCEPTED_OWNER_AUTHORIZATIONS));
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mls-release-owner-scope-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const modulePath=path.join(directory,'release_preflight.mjs');fs.writeFileSync(modulePath,fs.readFileSync(new URL('../release_preflight.mjs',import.meta.url)));
 const candidate=JSON.parse(fs.readFileSync(new URL('../release-approved-candidate.json',import.meta.url),'utf8'));
 for(const authorization of RELEASE_ACCEPTED_OWNER_AUTHORIZATIONS){
  fs.writeFileSync(path.join(directory,'release-approved-candidate.json'),JSON.stringify({...candidate,owner_authorization:authorization}));
  const script='const {evaluateReleasePreflight}=await import('+JSON.stringify(pathToFileURL(modulePath).href)+');console.log(JSON.stringify(evaluateReleasePreflight('+JSON.stringify(good())+')));';
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const observed=JSON.parse(result.stdout);assert.equal(observed.ok,true);assert.equal(observed.remoteCloudflareVerified,false);assert.equal(observed.productionApproved,false);
 }
});

test('a V4.1 manifest can review the finite tenant delta but cannot authorize future protected modules or original profiles',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mls-release-finite-scope-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const modulePath=path.join(directory,'release_preflight.mjs');fs.writeFileSync(modulePath,fs.readFileSync(new URL('../release_preflight.mjs',import.meta.url)));
 const candidate=JSON.parse(fs.readFileSync(new URL('../release-approved-candidate.json',import.meta.url),'utf8'));
 const unapproved=['web/finance/src/future-provider-write.mjs','web/finance/src/commercial/future-profile.mjs','web/auth/src/index.mjs','web/cloudflare/original/app-worker.mjs',
  'web/finance/original/finance-worker.mjs','workers/app/wrangler.json','workers/auth/migration.json','workers/finance/profile.json','workers/app/commercial-account-extra.json'];
 const aiStore='web/cloudflare/src/mls-ai-sales-workspace-store.mjs';
 candidate.owner_authorization='OWNER_REQUESTED_V41_LIVE_2026_11_11';
 candidate.allowed_files=[...new Set([...candidate.allowed_files,...RELEASE_APPROVED_PROTECTED_FILES,aiStore,...unapproved])];
 fs.writeFileSync(path.join(directory,'release-approved-candidate.json'),JSON.stringify(candidate));
 const paths=[...RELEASE_APPROVED_PROTECTED_FILES,aiStore,...unapproved],input=good();
 const script='const {evaluateReleasePreflight}=await import('+JSON.stringify(pathToFileURL(modulePath).href)+');const input='+JSON.stringify(input)+';console.log(JSON.stringify('+JSON.stringify(paths)+'.map(path=>evaluateReleasePreflight({...input,changedPaths:[path]}))));';
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const outcomes=JSON.parse(result.stdout);
 for(let index=0;index<paths.length;index++){
  const observed=outcomes[index],filename=paths[index];
  if(unapproved.includes(filename)){assert.equal(observed.ok,false,filename);assert.ok(observed.failures.includes('RELEASE_PROTECTED_WORKER_PATH'),filename);assert.equal(observed.failures.includes('RELEASE_UNREVIEWED_PATH'),false,'even an explicit manifest entry cannot broaden the protected scope');}
  else {assert.equal(observed.ok,true,filename);assert.equal(observed.productionApproved,false);}
 }
});

test('the current exact candidate never inherits a different base or unlisted future AI storage and provider writes',()=>{
 assert.match(RELEASE_BASE_COMMIT,/^[a-f0-9]{40}$/);
 for(const baseCommit of ['eab85a17d7a6c4f213e67ce0b7dea0cf63932bf2','f451c15ec1b96abaa6315457324ccaa31c8d361c','96e16057dc5190917622510ffc1b2130ced47841','673dc8f4d3c6c36eaa41fcf33ae264130fa9ba18','b09026880f9370358f4539b821d18ef8d5982085','d14df57d0b3305ce673a247f925d5dd0d68d191d','2ab4c9d8baa3c25e5816bcca14b4a0973ea73d5a','8d66525bc3b96914412a9538d3ec84048ac78dbb']){
  const oldBase=good();oldBase.baseCommit=baseCommit;
  assert.ok(evaluateReleasePreflight(oldBase).failures.includes('RELEASE_BASE_MISMATCH'));
 }
 for(const filename of ['web/cloudflare/src/mls-ai-sales-future-workspace-store.mjs','tools/mls-ai-sales/render.mjs']){
  assert.ok(!RELEASE_ALLOWED_FILES.includes(filename),filename);
  const input=good();input.changedPaths.push(filename);
  assert.ok(evaluateReleasePreflight(input).failures.includes('RELEASE_UNREVIEWED_PATH'),filename);
 }
});
