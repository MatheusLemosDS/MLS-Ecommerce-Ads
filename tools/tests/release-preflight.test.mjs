import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateReleasePreflight,RELEASE_EXPECTED_SHA,RELEASE_ALLOWED_FILES,RELEASE_MANUAL_GATES} from '../release_preflight.mjs';

function good(){
 return {
  changedPaths:['web/cloudflare/src/admin.mjs','tools/release_preflight.mjs'],
  buildHashes:{...RELEASE_EXPECTED_SHA},
  appConfig:{
   name:'brazacommerce-app',main:'../../dist/app-worker.mjs',keep_vars:true,
   d1_databases:[{binding:'ADMIN_DB',database_id:'fixture-uuid'}]
  },
  adminSource:"function mlsV36OwnerPreviewEnabled(env,ownerSession){return ownerSession?.role==='owner'&&env?.MLS_V36_OWNER_PREVIEW==='ENABLED';} const preview=markupCompatible&&mlsV36OwnerPreviewEnabled(env,ownerSession);return dashboard(env,current)",
  buildSource:"listing_factory_view=... approved_design=... '+approved_design+'\\n'+ads_workspace+",
  workflowSource:"node --test --test-reporter=tap; python3 -m unittest"
 };
}
test('release preflight passes only an exact reviewed local build and leaves remote status unverified',()=>{
 const r=evaluateReleasePreflight(good());
 assert.equal(r.ok,true);
 assert.deepEqual(r.failures,[]);
 assert.equal(r.remoteCloudflareVerified,false);
 assert.equal(r.productionApproved,false);
 assert.ok(RELEASE_MANUAL_GATES.includes('VERIFY_REMOTE_MLS_V36_OWNER_PREVIEW_NOT_ENABLED'));
 assert.ok(RELEASE_ALLOWED_FILES.includes('web/cloudflare/src/admin.mjs'));
 assert.ok(!RELEASE_ALLOWED_FILES.some(x=>x.startsWith('workers/')||x.startsWith('web/finance/')));
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
  'package.json']){
  const data=good();data.changedPaths.push(path);
  const result=evaluateReleasePreflight(data);
  assert.equal(result.ok,false,path);
  assert.ok(result.failures.includes('RELEASE_UNREVIEWED_PATH'),path);
 }
});

test('release preflight rejects preview enabled in tracked wrangler vars even when keep_vars is true',()=>{
 const data=good();data.appConfig.vars={MLS_V36_OWNER_PREVIEW:'ENABLED'};
 assert.ok(evaluateReleasePreflight(data).failures.includes('RELEASE_PREVIEW_CONFIG_MUST_BE_ABSENT'));
 const deactivated=good();deactivated.appConfig.vars={MLS_V36_OWNER_PREVIEW:'DISABLED'};
 assert.ok(evaluateReleasePreflight(deactivated).failures.includes('RELEASE_PREVIEW_CONFIG_MUST_BE_ABSENT'));
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
  x=>x.buildSource=x.buildSource.replace('listing_factory_view=','')]){
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
