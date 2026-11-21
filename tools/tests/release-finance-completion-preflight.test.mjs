import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {restoreSourceBeforeMaterialChain} from './release-material-chain-review-fixture.mjs';
import {HISTORICAL_PROFIT_REVIEWED_SOURCE_ADDITIONS,restoreFinanceSourceBeforeNumberedKitAddition} from './historical-profit-reviewed-source-fixture.mjs';
import {evaluateFinanceCompletionMergePreflight,financeCompletionPriorVerifierMatchesBaseline,FINANCE_COMPLETION_MERGE_BASE_COMMIT,FINANCE_COMPLETION_MERGE_MANIFEST_PATH,FINANCE_COMPLETION_OWNER_AUTHORIZATION,FINANCE_COMPLETION_ALLOWED_FILES,FINANCE_COMPLETION_FROZEN_FILES,FINANCE_COMPLETION_BASE_PREFLIGHT_SHA256,RELEASE_MANUAL_GATES} from '../release_preflight.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),digest=value=>createHash('sha256').update(value).digest('hex');
function good(){
 const files=[{path:'tools/release_preflight.mjs',sha256:'1'.repeat(64)},{path:'web/cloudflare/src/admin.mjs',sha256:'2'.repeat(64)}],expected_hashes={app:'3'.repeat(64),auth:'4'.repeat(64),finance:'5'.repeat(64)};
 return {baseCommit:FINANCE_COMPLETION_MERGE_BASE_COMMIT,changedPaths:[FINANCE_COMPLETION_MERGE_MANIFEST_PATH,...files.map(row=>row.path)],buildHashes:{...expected_hashes},candidate:{schema:'mls_finance_completion_merge_candidate_v1',scope:'MERGE_ONLY',base_commit:FINANCE_COMPLETION_MERGE_BASE_COMMIT,prepared_source_commit:'a'.repeat(40),owner_authorization:FINANCE_COMPLETION_OWNER_AUTHORIZATION,production_approved:false,live_authorization:false,commercial_writes_allowed:false,expected_hashes,files},currentFileHashes:Object.fromEntries(files.map(row=>[row.path,row.sha256])),preparedFileHashes:Object.fromEntries(files.map(row=>[row.path,row.sha256])),preparedSourceIsAncestor:true,preparedSourceDescendsFromBase:true,frozenCurrentFileHashes:{...FINANCE_COMPLETION_FROZEN_FILES},frozenPreparedFileHashes:{...FINANCE_COMPLETION_FROZEN_FILES},priorVerifierPreserved:true,
 appConfig:{name:'brazacommerce-app',main:'../../dist/app-worker.mjs',keep_vars:true,d1_databases:[{binding:'ADMIN_DB',database_id:'synthetic-fixture'}]},adminSource:"function a(env,ownerSession){return ownerSession?.role==='owner'&&env?.MLS_V36_OWNER_PREVIEW==='ENABLED';} function b(env,ownerSession){return ownerSession?.role==='owner'&&env?.MLS_AI_SALES_OWNER_PREVIEW==='ENABLED';} const preview=markupCompatible&&mlsV36OwnerPreviewEnabled(env,ownerSession);const aiPreview=mlsAiSalesOwnerPreviewEnabled(env,ownerSession);return dashboard(env,current)",buildSource:"ai_sales_view=... listing_factory_view=... approved_design=... '+approved_design+'\\n'+ads_workspace+",workflowSource:'node --test --test-reporter=tap; python3 -m unittest'};
}

test('Finance completion permits exact local merge verification only, with independent owner authority and every manual gate retained',()=>{
 const result=evaluateFinanceCompletionMergePreflight(good());assert.equal(result.ok,true);assert.deepEqual(result.failures,[]);assert.equal(result.scope,'MERGE_ONLY');for(const key of ['remoteCloudflareVerified','productionApproved','liveAuthorization','commercialWritesAllowed'])assert.equal(result[key],false);assert.deepEqual(result.manualGates,RELEASE_MANUAL_GATES);assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.failures));
 assert.ok(FINANCE_COMPLETION_ALLOWED_FILES.length>50);assert.equal(new Set(FINANCE_COMPLETION_ALLOWED_FILES).size,FINANCE_COMPLETION_ALLOWED_FILES.length);assert.deepEqual([...FINANCE_COMPLETION_ALLOWED_FILES].sort(),[...FINANCE_COMPLETION_ALLOWED_FILES]);for(const filename of FINANCE_COMPLETION_ALLOWED_FILES)assert.doesNotMatch(filename,/[?*\\]|\.\./);
});

test('Finance manifest refuses Live/PR130 authority, publication flags, arbitrary paths, malformed snapshots and self-authorizing metadata',()=>{
 for(const mutate of [c=>c.schema='mls_pr130_merge_candidate_v1',c=>c.scope='PRODUCTION',c=>c.base_commit='b'.repeat(40),c=>c.prepared_source_commit='main',c=>c.prepared_source_commit=c.base_commit,c=>c.owner_authorization='OWNER_REQUESTED_PR130_CI_REPAIR_MERGE_WITHOUT_SITE_PUBLICATION_2026_11_20',c=>c.owner_authorization='OWNER_REQUESTED_FINANCIAL_AUTOMATION_LIVE_2026_11_13',c=>c.production_approved=true,c=>c.live_authorization=true,c=>c.commercial_writes_allowed=true,c=>delete c.expected_hashes.finance,c=>c.expected_hashes.auth='unknown',c=>c.files=[],c=>c.files.reverse(),c=>c.files.push({...c.files[1]}),c=>c.files[0].sha256='unknown',c=>c.files[0].path='../escape',c=>c.files[0].path='web/cloudflare/src/*',c=>c.files[0].path='web/cloudflare/src/unreviewed-next-change.mjs',c=>c.files[0].path=FINANCE_COMPLETION_MERGE_MANIFEST_PATH,c=>c.allowed_files=['*'],c=>c.production_approval={approved:true}]){const input=good();mutate(input.candidate);assert.deepEqual(evaluateFinanceCompletionMergePreflight(input).failures,['RELEASE_FINANCE_COMPLETION_MANIFEST_INVALID']);}
});

test('every frozen workflow, configuration, original Worker and deployment input is refused even if a manifest supplies its exact hash',()=>{
 for(const [filename,sha256] of Object.entries(FINANCE_COMPLETION_FROZEN_FILES)){assert.ok(!FINANCE_COMPLETION_ALLOWED_FILES.includes(filename),filename);const input=good();input.candidate.files=[{path:filename,sha256}];assert.deepEqual(evaluateFinanceCompletionMergePreflight(input).failures,['RELEASE_FINANCE_COMPLETION_MANIFEST_INVALID'],filename);}
 assert.equal(FINANCE_COMPLETION_FROZEN_FILES['tools/worker_deploy.mjs'],'3d68df3c8c64d3b3fcd5f4246fc3f760a2880c7ddb3868df0ccddc965ebdfb32');
 assert.equal(FINANCE_COMPLETION_FROZEN_FILES['tools/release-approved-candidate.json'],'83557a1a65871786c0eb90a5ce827dd873ae1b2a9aef01e9d5127ae3d679f13b');
 assert.equal(FINANCE_COMPLETION_FROZEN_FILES['tools/release-pr130-merge-candidate.json'],'c287900d9c598c9603335c14b3dac97ff17a066480c60986aaa6623fbcbbd8c8');
});

test('the complete-module packaging review admits only four literal new tool paths and keeps deployment authority disabled',()=>{
 for(const filename of ['tools/complete_worker_module.mjs','tools/verified_worker_deploy.mjs','tools/tests/complete-worker-module.test.mjs','tools/tests/verified-worker-deploy.test.mjs']){
  assert.ok(FINANCE_COMPLETION_ALLOWED_FILES.includes(filename));const input=good(),file={path:filename,sha256:'6'.repeat(64)};input.candidate.files=[file];input.changedPaths=[FINANCE_COMPLETION_MERGE_MANIFEST_PATH,filename];input.currentFileHashes={[filename]:file.sha256};input.preparedFileHashes={[filename]:file.sha256};
  const result=evaluateFinanceCompletionMergePreflight(input);assert.equal(result.ok,true);assert.equal(result.scope,'MERGE_ONLY');assert.equal(result.productionApproved,false);assert.equal(result.liveAuthorization,false);assert.equal(result.commercialWritesAllowed,false);
  input.preparedFileHashes[filename]='7'.repeat(64);assert.ok(evaluateFinanceCompletionMergePreflight(input).failures.includes('RELEASE_FINANCE_COMPLETION_SOURCE_HASH_MISMATCH'));
 }
 for(const filename of ['tools/unreviewed_cloudflare_uploader.mjs','tools/verified_worker_deploy_next.mjs','tools/worker_deploy.mjs']){const input=good();input.candidate.files=[{path:filename,sha256:'6'.repeat(64)}];assert.deepEqual(evaluateFinanceCompletionMergePreflight(input).failures,['RELEASE_FINANCE_COMPLETION_MANIFEST_INVALID']);}
});

test('new merge verification requires the exact base, both ancestry links and a complete unique finite diff',()=>{
 for(const mutate of [i=>i.baseCommit='b'.repeat(40),i=>i.preparedSourceIsAncestor=false,i=>i.preparedSourceDescendsFromBase=false,i=>delete i.preparedSourceIsAncestor,i=>i.changedPaths=[],i=>i.changedPaths=null,i=>i.changedPaths.pop(),i=>i.changedPaths.push(i.changedPaths[0]),i=>i.changedPaths.push('web/cloudflare/src/arbitrary.mjs'),i=>i.changedPaths.push('workers/auth/wrangler.json'),i=>i.priorVerifierPreserved=false]){const input=good();mutate(input);assert.equal(evaluateFinanceCompletionMergePreflight(input).ok,false);}
});

test('each prepared and current file, all three Workers and every frozen current/prepared input must match exact reviewed bytes',()=>{
 for(const key of ['currentFileHashes','preparedFileHashes'])for(const mutate of [h=>h['web/cloudflare/src/admin.mjs']='0'.repeat(64),h=>delete h['tools/release_preflight.mjs'],h=>h['web/cloudflare/src/unlisted.mjs']='0'.repeat(64)]){const input=good();mutate(input[key]);assert.ok(evaluateFinanceCompletionMergePreflight(input).failures.includes('RELEASE_FINANCE_COMPLETION_SOURCE_HASH_MISMATCH'));}
 for(const key of ['frozenCurrentFileHashes','frozenPreparedFileHashes'])for(const filename of Object.keys(FINANCE_COMPLETION_FROZEN_FILES)){const input=good();input[key][filename]='0'.repeat(64);assert.ok(evaluateFinanceCompletionMergePreflight(input).failures.includes('RELEASE_FINANCE_COMPLETION_FROZEN_SOURCE_CHANGED'),key+':'+filename);}
 for(const key of ['frozenCurrentFileHashes','frozenPreparedFileHashes']){const input=good();delete input[key]['.github/workflows/validate.yml'];assert.equal(evaluateFinanceCompletionMergePreflight(input).ok,false);}
 for(const kind of ['app','auth','finance']){const input=good();input.buildHashes[kind]='0'.repeat(64);assert.ok(evaluateFinanceCompletionMergePreflight(input).failures.includes('RELEASE_WORKER_HASH_MISMATCH'));}
 const extra=good();extra.buildHashes.preview='0'.repeat(64);assert.ok(evaluateFinanceCompletionMergePreflight(extra).failures.includes('RELEASE_WORKER_HASH_MISMATCH'));
});

test('both previous verifier implementations remain byte-identical after removing only the separately marked additions',()=>{
 const observed=spawnSync('git',['show',FINANCE_COMPLETION_MERGE_BASE_COMMIT+':tools/release_preflight.mjs'],{cwd:root,encoding:'utf8'});assert.equal(observed.status,0,observed.stderr);const baseline=observed.stdout,current=fs.readFileSync(path.join(root,'tools/release_preflight.mjs'),'utf8');assert.equal(digest(baseline),FINANCE_COMPLETION_BASE_PREFLIGHT_SHA256);assert.equal(financeCompletionPriorVerifierMatchesBaseline(current,baseline),true);
 for(const changed of [current+'\n',current.replace("export const PR130_MERGE_BASE_COMMIT='346f30f200e5cbd3d9efd26663a483c625d9c6e7'","export const PR130_MERGE_BASE_COMMIT='"+'b'.repeat(40)+"'"),current.replace('if(baseCommit!==RELEASE_BASE_COMMIT)','if(false)'),current.replace('\n // BEGIN FINANCE_COMPLETION_DISPATCH_V1\n','\n // CHANGED FINANCE_COMPLETION_DISPATCH_V1\n')])assert.equal(financeCompletionPriorVerifierMatchesBaseline(changed,baseline),false);
 assert.equal(financeCompletionPriorVerifierMatchesBaseline(current,baseline+'\n'),false);
 // This later local increment has a finite, test-only reviewed source delta.
 // The prior runtime verifier and every pinned baseline hash stay untouched;
 // reverse only the exact additions before checking their original bytes.
 for(const [filename,expected] of Object.entries(FINANCE_COMPLETION_FROZEN_FILES)){
  const source=restoreSourceBeforeMaterialChain(filename,fs.readFileSync(path.join(root,filename),'utf8'));
  const original=Object.hasOwn(HISTORICAL_PROFIT_REVIEWED_SOURCE_ADDITIONS,filename)?restoreFinanceSourceBeforeNumberedKitAddition(filename,source):source;
  assert.equal(typeof original,'string','unreviewed source delta: '+filename);assert.equal(digest(original),expected,filename);
 }
});

test('new merge verification keeps owner-only features, read-only CI and required bundle composition',()=>{
 for(const [mutate,code] of [[i=>i.appConfig.keep_vars=false,'RELEASE_APP_CONFIG_INVALID'],[i=>i.appConfig.vars={MLS_V36_OWNER_PREVIEW:'ENABLED'},'RELEASE_PREVIEW_CONFIG_MUST_BE_ABSENT'],[i=>i.adminSource=i.adminSource.replace("ownerSession?.role==='owner'",'true'),'RELEASE_OWNER_GATE_CHANGED'],[i=>i.buildSource='','RELEASE_COMBINED_BUNDLE_MISSING'],[i=>i.workflowSource+='; wrangler deploy','RELEASE_CI_NOT_READ_ONLY']]){const input=good();mutate(input);assert.ok(evaluateFinanceCompletionMergePreflight(input).failures.includes(code));}
});

test('the exact new CLI base never falls back to either earlier authorization when the new manifest is missing, unfinished or invalid',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mls-finance-preflight-invalid-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 assert.equal(spawnSync('git',['clone','--shared','--no-checkout',root,directory],{encoding:'utf8'}).status,0);assert.equal(spawnSync('git',['checkout','--detach',FINANCE_COMPLETION_MERGE_BASE_COMMIT],{cwd:directory,encoding:'utf8'}).status,0);
 fs.copyFileSync(path.join(root,'tools/release_preflight.mjs'),path.join(directory,'tools/release_preflight.mjs'));fs.mkdirSync(path.join(directory,'dist'));for(const kind of ['app','auth','finance'])fs.writeFileSync(path.join(directory,'dist',kind+'-worker.mjs'),'SYNTHETIC_PREFLIGHT_'+kind);
 const manifest=path.join(directory,FINANCE_COMPLETION_MERGE_MANIFEST_PATH);for(const invalid of [null,'{}','{invalid json',JSON.stringify({...good().candidate,prepared_source_commit:null}),fs.readFileSync(path.join(root,'tools/release-pr130-merge-candidate.json'),'utf8')]){if(invalid===null)fs.rmSync(manifest,{force:true});else fs.writeFileSync(manifest,invalid);const result=spawnSync(process.execPath,['tools/release_preflight.mjs','--base='+FINANCE_COMPLETION_MERGE_BASE_COMMIT],{cwd:directory,encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/^RELEASE_FINANCE_COMPLETION_MANIFEST_INVALID\s*$/);assert.doesNotMatch(result.stdout,/PREFLIGHT_OK/);}
});

test('real CLI verifies prepared Git bytes, ancestry, exact artifacts and unchanged deploy inputs for a synthetic merge-only candidate',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mls-finance-preflight-complete-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const git=(...args)=>{const result=spawnSync('git',args,{cwd:directory,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
 assert.equal(spawnSync('git',['clone','--shared','--no-checkout',root,directory],{encoding:'utf8'}).status,0);git('checkout','--detach',FINANCE_COMPLETION_MERGE_BASE_COMMIT);
 fs.copyFileSync(path.join(root,'tools/release_preflight.mjs'),path.join(directory,'tools/release_preflight.mjs'));fs.appendFileSync(path.join(directory,'web/cloudflare/src/admin.mjs'),'\n// Synthetic local candidate only.\n');git('add','tools/release_preflight.mjs','web/cloudflare/src/admin.mjs');git('-c','user.name=Synthetic review','-c','user.email=review@example.test','commit','-m','synthetic reviewed source');
 const candidate=good().candidate;candidate.prepared_source_commit=git('rev-parse','HEAD');candidate.files=candidate.files.map(row=>({...row,sha256:digest(fs.readFileSync(path.join(directory,row.path)))}));fs.mkdirSync(path.join(directory,'dist'));
 for(const kind of ['app','auth','finance']){const bytes='SYNTHETIC_PREFLIGHT_'+kind;fs.writeFileSync(path.join(directory,'dist',kind+'-worker.mjs'),bytes);candidate.expected_hashes[kind]=digest(bytes);}
 fs.writeFileSync(path.join(directory,FINANCE_COMPLETION_MERGE_MANIFEST_PATH),JSON.stringify(candidate,null,2)+'\n');git('add',FINANCE_COMPLETION_MERGE_MANIFEST_PATH);git('-c','user.name=Synthetic review','-c','user.email=review@example.test','commit','-m','synthetic finite merge candidate');
 const run=()=>spawnSync(process.execPath,['tools/release_preflight.mjs','--base='+FINANCE_COMPLETION_MERGE_BASE_COMMIT],{cwd:directory,encoding:'utf8'});let result=run();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/RELEASE_MERGE_ONLY_LOCAL_PREFLIGHT_OK/);assert.match(result.stdout,/RELEASE_NOT_APPROVED_FOR_PRODUCTION/);
 fs.appendFileSync(path.join(directory,'web/cloudflare/src/admin.mjs'),'\n// Unreviewed mutation.\n');result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/RELEASE_FINANCE_COMPLETION_SOURCE_HASH_MISMATCH/);git('restore','web/cloudflare/src/admin.mjs');
 fs.appendFileSync(path.join(directory,'tools/worker_deploy.mjs'),'\n// Unreviewed deployment mutation.\n');result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/RELEASE_FINANCE_COMPLETION_FROZEN_SOURCE_CHANGED/);git('restore','tools/worker_deploy.mjs');
 const file=path.join(directory,'web/cloudflare/src/admin.mjs');fs.unlinkSync(file);fs.symlinkSync('admin-view.mjs',file);result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/RELEASE_FINANCE_COMPLETION_SOURCE_FILE_INVALID/);
});
