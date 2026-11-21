import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {restoreFinanceSourceBeforeNumberedKitAddition} from './historical-profit-reviewed-source-fixture.mjs';
import {evaluateOperatingIncrementMergePreflight,operatingIncrementPriorVerifierMatchesBaseline,financeCompletionPriorVerifierMatchesBaseline,OPERATING_INCREMENT_MERGE_BASE_COMMIT,OPERATING_INCREMENT_MERGE_MANIFEST_PATH,OPERATING_INCREMENT_OWNER_AUTHORIZATION,OPERATING_INCREMENT_ALLOWED_FILES,OPERATING_INCREMENT_FROZEN_FILES,OPERATING_INCREMENT_BASE_PREFLIGHT_SHA256,FINANCE_COMPLETION_MERGE_BASE_COMMIT,FINANCE_COMPLETION_FROZEN_FILES,RELEASE_MANUAL_GATES} from '../release_preflight.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),digest=value=>createHash('sha256').update(value).digest('hex');
function good(){
 const files=[{path:'tools/release_preflight.mjs',sha256:'1'.repeat(64)},{path:'web/cloudflare/src/admin.mjs',sha256:'2'.repeat(64)}],expected_hashes={app:'3'.repeat(64),auth:'4'.repeat(64),finance:'5'.repeat(64)};
 return {baseCommit:OPERATING_INCREMENT_MERGE_BASE_COMMIT,changedPaths:[OPERATING_INCREMENT_MERGE_MANIFEST_PATH,...files.map(row=>row.path)],buildHashes:{...expected_hashes},candidate:{schema:'mls_operating_increment_merge_candidate_v1',scope:'MERGE_ONLY',base_commit:OPERATING_INCREMENT_MERGE_BASE_COMMIT,prepared_source_commit:'a'.repeat(40),owner_authorization:OPERATING_INCREMENT_OWNER_AUTHORIZATION,production_approved:false,live_authorization:false,commercial_writes_allowed:false,expected_hashes,files},currentFileHashes:Object.fromEntries(files.map(row=>[row.path,row.sha256])),preparedFileHashes:Object.fromEntries(files.map(row=>[row.path,row.sha256])),preparedSourceIsAncestor:true,preparedSourceDescendsFromBase:true,frozenCurrentFileHashes:{...OPERATING_INCREMENT_FROZEN_FILES},frozenPreparedFileHashes:{...OPERATING_INCREMENT_FROZEN_FILES},priorVerifierPreserved:true,
 appConfig:{name:'brazacommerce-app',main:'../../dist/app-worker.mjs',keep_vars:true,d1_databases:[{binding:'ADMIN_DB',database_id:'synthetic-fixture'}]},adminSource:"function a(env,ownerSession){return ownerSession?.role==='owner'&&env?.MLS_V36_OWNER_PREVIEW==='ENABLED';} function b(env,ownerSession){return ownerSession?.role==='owner'&&env?.MLS_AI_SALES_OWNER_PREVIEW==='ENABLED';} const preview=markupCompatible&&mlsV36OwnerPreviewEnabled(env,ownerSession);const aiPreview=mlsAiSalesOwnerPreviewEnabled(env,ownerSession);return dashboard(env,current)",buildSource:"ai_sales_view=... listing_factory_view=... approved_design=... '+approved_design+'\\n'+ads_workspace+",workflowSource:'node --test --test-reporter=tap; python3 -m unittest'};
}

test('operating verification admits the exact reviewed Git increment without granting external publication or money movement',()=>{
 const result=evaluateOperatingIncrementMergePreflight(good());assert.equal(result.ok,true);assert.deepEqual(result.failures,[]);assert.equal(result.scope,'MERGE_ONLY');
 for(const key of ['remoteCloudflareVerified','productionApproved','liveAuthorization','commercialWritesAllowed'])assert.equal(result[key],false);
 assert.deepEqual(result.manualGates,RELEASE_MANUAL_GATES);assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.failures));
 assert.deepEqual([...OPERATING_INCREMENT_ALLOWED_FILES].sort(),[...OPERATING_INCREMENT_ALLOWED_FILES]);assert.equal(new Set(OPERATING_INCREMENT_ALLOWED_FILES).size,OPERATING_INCREMENT_ALLOWED_FILES.length);
 for(const file of OPERATING_INCREMENT_ALLOWED_FILES){assert.doesNotMatch(file,/[?*\\]|\.\./);assert.ok(!Object.hasOwn(OPERATING_INCREMENT_FROZEN_FILES,file));}
});

test('operating authority cannot reuse earlier Live/Finance permissions, broaden metadata, or authorize an arbitrary path',()=>{
 for(const mutate of [c=>c.schema='mls_finance_completion_merge_candidate_v1',c=>c.scope='PRODUCTION',c=>c.base_commit=FINANCE_COMPLETION_MERGE_BASE_COMMIT,c=>c.prepared_source_commit='main',c=>c.prepared_source_commit=c.base_commit,c=>c.owner_authorization='OWNER_REQUESTED_FINANCE_COMPLETION_WITHOUT_SITE_PUBLICATION_2026_11_20',c=>c.owner_authorization='OWNER_REQUESTED_FINANCIAL_AUTOMATION_LIVE_2026_11_13',c=>c.production_approved=true,c=>c.live_authorization=true,c=>c.commercial_writes_allowed=true,c=>delete c.expected_hashes.auth,c=>c.expected_hashes.finance='unknown',c=>c.files=[],c=>c.files.reverse(),c=>c.files.push({...c.files[1]}),c=>c.files[0].sha256='unknown',c=>c.files[0].path='../escape',c=>c.files[0].path='web/cloudflare/src/*',c=>c.files[0].path='web/cloudflare/src/unreviewed-next-change.mjs',c=>c.files[0].path=OPERATING_INCREMENT_MERGE_MANIFEST_PATH,c=>c.allowed_files=['*'],c=>c.production_approval={approved:true}]){
  const input=good();mutate(input.candidate);assert.deepEqual(evaluateOperatingIncrementMergePreflight(input).failures,['RELEASE_OPERATING_INCREMENT_MANIFEST_INVALID']);
 }
});

test('all earlier frozen inputs and financial contracts remain frozen, including the existing packaging guards and manifests',()=>{
 for(const [filename,sha256] of Object.entries(FINANCE_COMPLETION_FROZEN_FILES)){
  if(['web/cloudflare/src/cost-rules.mjs','web/cloudflare/src/production-costs.mjs'].includes(filename)){
   // PR133's exact finite recognizer delta is already integrated. Recover and
   // check the original Finance bytes as well as freezing the current bytes.
   const current=fs.readFileSync(path.join(root,filename),'utf8'),original=restoreFinanceSourceBeforeNumberedKitAddition(filename,current);
   assert.equal(typeof original,'string',filename);assert.equal(digest(original),sha256,filename);
  }else assert.equal(OPERATING_INCREMENT_FROZEN_FILES[filename],sha256,filename);
 }
 for(const [filename,sha256] of Object.entries(OPERATING_INCREMENT_FROZEN_FILES)){
  assert.equal(digest(fs.readFileSync(path.join(root,filename))),sha256,filename);
  const input=good();input.candidate.files=[{path:filename,sha256}];assert.deepEqual(evaluateOperatingIncrementMergePreflight(input).failures,['RELEASE_OPERATING_INCREMENT_MANIFEST_INVALID'],filename);
 }
 for(const filename of ['tools/worker_deploy.mjs','tools/verified_worker_deploy.mjs','tools/release-finance-completion-candidate.json','tools/tests/release-finance-completion-preflight.test.mjs','web/cloudflare/src/financial-accounting-projection.mjs','web/cloudflare/src/financial-inventory-bridge.mjs','web/finance/src/financial-bank-connector.mjs','web/finance/src/financial-cash-allocation.mjs'])assert.ok(Object.hasOwn(OPERATING_INCREMENT_FROZEN_FILES,filename),filename);
});

test('exact base, source ancestry and complete unique changed path inventory are required',()=>{
 for(const mutate of [i=>i.baseCommit='b'.repeat(40),i=>i.preparedSourceIsAncestor=false,i=>i.preparedSourceDescendsFromBase=false,i=>delete i.preparedSourceIsAncestor,i=>i.changedPaths=[],i=>i.changedPaths=null,i=>i.changedPaths.pop(),i=>i.changedPaths.push(i.changedPaths[0]),i=>i.changedPaths.push('web/cloudflare/src/arbitrary.mjs'),i=>i.changedPaths.push('workers/auth/wrangler.json'),i=>i.priorVerifierPreserved=false]){const input=good();mutate(input);assert.equal(evaluateOperatingIncrementMergePreflight(input).ok,false);}
});

test('every current/prepared source, original financial contract and all three runtime hashes must match',()=>{
 for(const key of ['currentFileHashes','preparedFileHashes'])for(const mutate of [h=>h['web/cloudflare/src/admin.mjs']='0'.repeat(64),h=>delete h['tools/release_preflight.mjs'],h=>h['unlisted']='0'.repeat(64)]){const input=good();mutate(input[key]);assert.ok(evaluateOperatingIncrementMergePreflight(input).failures.includes('RELEASE_OPERATING_INCREMENT_SOURCE_HASH_MISMATCH'));}
 for(const key of ['frozenCurrentFileHashes','frozenPreparedFileHashes'])for(const filename of Object.keys(OPERATING_INCREMENT_FROZEN_FILES)){const input=good();input[key][filename]='0'.repeat(64);assert.ok(evaluateOperatingIncrementMergePreflight(input).failures.includes('RELEASE_OPERATING_INCREMENT_FROZEN_SOURCE_CHANGED'),key+':'+filename);}
 for(const key of ['frozenCurrentFileHashes','frozenPreparedFileHashes']){const input=good();delete input[key]['.github/workflows/validate.yml'];assert.equal(evaluateOperatingIncrementMergePreflight(input).ok,false);}
 for(const kind of ['app','auth','finance']){const input=good();input.buildHashes[kind]='0'.repeat(64);assert.ok(evaluateOperatingIncrementMergePreflight(input).failures.includes('RELEASE_WORKER_HASH_MISMATCH'));}
 const extra=good();extra.buildHashes.preview='0'.repeat(64);assert.ok(evaluateOperatingIncrementMergePreflight(extra).failures.includes('RELEASE_WORKER_HASH_MISMATCH'));
});

test('prior three verifier implementations remain exact after removing only this separately marked policy',()=>{
 const observed=spawnSync('git',['show',OPERATING_INCREMENT_MERGE_BASE_COMMIT+':tools/release_preflight.mjs'],{cwd:root,encoding:'utf8'});assert.equal(observed.status,0,observed.stderr);const baseline=observed.stdout,current=fs.readFileSync(path.join(root,'tools/release_preflight.mjs'),'utf8');assert.equal(digest(baseline),OPERATING_INCREMENT_BASE_PREFLIGHT_SHA256);assert.equal(operatingIncrementPriorVerifierMatchesBaseline(current,baseline),true);
 for(const changed of [current+'\n',current.replace("export const PR130_MERGE_BASE_COMMIT='346f30f200e5cbd3d9efd26663a483c625d9c6e7'","export const PR130_MERGE_BASE_COMMIT='"+'b'.repeat(40)+"'"),current.replace('if(baseCommit!==RELEASE_BASE_COMMIT)','if(false)'),current.replace('\n // BEGIN OPERATING_INCREMENT_DISPATCH_V1\n','\n // CHANGED OPERATING_INCREMENT_DISPATCH_V1\n')])assert.equal(operatingIncrementPriorVerifierMatchesBaseline(changed,baseline),false);
 assert.equal(operatingIncrementPriorVerifierMatchesBaseline(current,baseline+'\n'),false);
 const older=spawnSync('git',['show',FINANCE_COMPLETION_MERGE_BASE_COMMIT+':tools/release_preflight.mjs'],{cwd:root,encoding:'utf8'});assert.equal(older.status,0,older.stderr);assert.equal(financeCompletionPriorVerifierMatchesBaseline(current,older.stdout),true);
});

test('existing isolated preview metadata permits only the exact new branch while preserving every existing resource and branch',()=>{
 const file='previews/isolated-builds.json',current=JSON.parse(fs.readFileSync(path.join(root,file),'utf8')),observed=spawnSync('git',['show',OPERATING_INCREMENT_MERGE_BASE_COMMIT+':'+file],{cwd:root,encoding:'utf8'});assert.equal(observed.status,0,observed.stderr);const baseline=JSON.parse(observed.stdout),branch='feature/weekly-payments-physical-shirts-20261120';
 assert.equal(current.authorized_branches.filter(value=>value===branch).length,1);assert.deepEqual({...current,authorized_branches:current.authorized_branches.filter(value=>value!==branch)},baseline);
});

test('owner gates, bundle requirements, captured flags and read-only CI cannot be relaxed',()=>{
 for(const [mutate,code] of [[i=>i.appConfig.keep_vars=false,'RELEASE_APP_CONFIG_INVALID'],[i=>i.appConfig.vars={MLS_V36_OWNER_PREVIEW:'ENABLED'},'RELEASE_PREVIEW_CONFIG_MUST_BE_ABSENT'],[i=>i.adminSource=i.adminSource.replace("ownerSession?.role==='owner'",'true'),'RELEASE_OWNER_GATE_CHANGED'],[i=>i.buildSource='','RELEASE_COMBINED_BUNDLE_MISSING'],[i=>i.workflowSource+='; wrangler deploy','RELEASE_CI_NOT_READ_ONLY']]){const input=good();mutate(input);assert.ok(evaluateOperatingIncrementMergePreflight(input).failures.includes(code));}
});

test('new exact CLI base refuses a missing/unfinished/earlier-authority manifest without falling back',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mls-operating-preflight-invalid-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 assert.equal(spawnSync('git',['clone','--shared','--no-checkout',root,directory],{encoding:'utf8'}).status,0);assert.equal(spawnSync('git',['checkout','--detach',OPERATING_INCREMENT_MERGE_BASE_COMMIT],{cwd:directory,encoding:'utf8'}).status,0);
 fs.copyFileSync(path.join(root,'tools/release_preflight.mjs'),path.join(directory,'tools/release_preflight.mjs'));fs.mkdirSync(path.join(directory,'dist'));for(const kind of ['app','auth','finance'])fs.writeFileSync(path.join(directory,'dist',kind+'-worker.mjs'),'SYNTHETIC_PREFLIGHT_'+kind);
 const manifest=path.join(directory,OPERATING_INCREMENT_MERGE_MANIFEST_PATH);for(const invalid of [null,'{}','{invalid json',JSON.stringify({...good().candidate,prepared_source_commit:null}),fs.readFileSync(path.join(root,'tools/release-finance-completion-candidate.json'),'utf8')]){if(invalid===null)fs.rmSync(manifest,{force:true});else fs.writeFileSync(manifest,invalid);const result=spawnSync(process.execPath,['tools/release_preflight.mjs','--base='+OPERATING_INCREMENT_MERGE_BASE_COMMIT],{cwd:directory,encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/^RELEASE_OPERATING_INCREMENT_MANIFEST_INVALID\s*$/);assert.doesNotMatch(result.stdout,/PREFLIGHT_OK/);}
});

test('real CLI verifies exact prepared Git source/artifacts and refuses mutations or aliased source files',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mls-operating-preflight-complete-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const git=(...args)=>{const result=spawnSync('git',args,{cwd:directory,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
 assert.equal(spawnSync('git',['clone','--shared','--no-checkout',root,directory],{encoding:'utf8'}).status,0);git('checkout','--detach',OPERATING_INCREMENT_MERGE_BASE_COMMIT);
 fs.copyFileSync(path.join(root,'tools/release_preflight.mjs'),path.join(directory,'tools/release_preflight.mjs'));fs.appendFileSync(path.join(directory,'web/cloudflare/src/admin.mjs'),'\n// Synthetic local candidate only.\n');git('add','tools/release_preflight.mjs','web/cloudflare/src/admin.mjs');git('-c','user.name=Synthetic review','-c','user.email=review@example.test','commit','-m','synthetic reviewed source');
 const candidate=good().candidate;candidate.prepared_source_commit=git('rev-parse','HEAD');candidate.files=candidate.files.map(row=>({...row,sha256:digest(fs.readFileSync(path.join(directory,row.path)))}));fs.mkdirSync(path.join(directory,'dist'));
 for(const kind of ['app','auth','finance']){const bytes='SYNTHETIC_PREFLIGHT_'+kind;fs.writeFileSync(path.join(directory,'dist',kind+'-worker.mjs'),bytes);candidate.expected_hashes[kind]=digest(bytes);}
 fs.writeFileSync(path.join(directory,OPERATING_INCREMENT_MERGE_MANIFEST_PATH),JSON.stringify(candidate,null,2)+'\n');git('add',OPERATING_INCREMENT_MERGE_MANIFEST_PATH);git('-c','user.name=Synthetic review','-c','user.email=review@example.test','commit','-m','synthetic finite merge candidate');
 const run=()=>spawnSync(process.execPath,['tools/release_preflight.mjs','--base='+OPERATING_INCREMENT_MERGE_BASE_COMMIT],{cwd:directory,encoding:'utf8'});let result=run();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/RELEASE_MERGE_ONLY_LOCAL_PREFLIGHT_OK/);assert.match(result.stdout,/RELEASE_NOT_APPROVED_FOR_PRODUCTION/);
 fs.appendFileSync(path.join(directory,'web/cloudflare/src/admin.mjs'),'\n// Unreviewed mutation.\n');result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/RELEASE_OPERATING_INCREMENT_SOURCE_HASH_MISMATCH/);git('restore','web/cloudflare/src/admin.mjs');
 fs.appendFileSync(path.join(directory,'tools/verified_worker_deploy.mjs'),'\n// Unreviewed deployment mutation.\n');result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/RELEASE_OPERATING_INCREMENT_FROZEN_SOURCE_CHANGED/);git('restore','tools/verified_worker_deploy.mjs');
 const file=path.join(directory,'web/cloudflare/src/admin.mjs');fs.unlinkSync(file);fs.symlinkSync('admin-view.mjs',file);result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/RELEASE_OPERATING_INCREMENT_SOURCE_FILE_INVALID/);
});
