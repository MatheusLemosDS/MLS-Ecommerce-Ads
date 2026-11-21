import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {evaluateMaterialChainMergePreflight,materialChainPriorVerifierMatchesBaseline,financeCompletionPriorVerifierMatchesBaseline,MATERIAL_CHAIN_MERGE_BASE_COMMIT,MATERIAL_CHAIN_MERGE_MANIFEST_PATH,MATERIAL_CHAIN_OWNER_AUTHORIZATION,MATERIAL_CHAIN_ALLOWED_FILES,MATERIAL_CHAIN_FROZEN_FILES,MATERIAL_CHAIN_BASE_PREFLIGHT_SHA256,FINANCE_COMPLETION_MERGE_BASE_COMMIT,FINANCE_COMPLETION_FROZEN_FILES,RELEASE_MANUAL_GATES} from '../release_preflight.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),digest=value=>createHash('sha256').update(value).digest('hex');
function good(){
 const files=[{path:'tools/release_preflight.mjs',sha256:'1'.repeat(64)},{path:'web/cloudflare/src/admin.mjs',sha256:'2'.repeat(64)}],expected_hashes={app:'3'.repeat(64),auth:'4'.repeat(64),finance:'5'.repeat(64)};
 return {baseCommit:MATERIAL_CHAIN_MERGE_BASE_COMMIT,changedPaths:[MATERIAL_CHAIN_MERGE_MANIFEST_PATH,...files.map(row=>row.path)],buildHashes:{...expected_hashes},candidate:{schema:'mls_material_chain_merge_candidate_v1',scope:'MERGE_ONLY',base_commit:MATERIAL_CHAIN_MERGE_BASE_COMMIT,prepared_source_commit:'a'.repeat(40),owner_authorization:MATERIAL_CHAIN_OWNER_AUTHORIZATION,production_approved:false,live_authorization:false,commercial_writes_allowed:false,expected_hashes,files},currentFileHashes:Object.fromEntries(files.map(row=>[row.path,row.sha256])),preparedFileHashes:Object.fromEntries(files.map(row=>[row.path,row.sha256])),preparedSourceIsAncestor:true,preparedSourceDescendsFromBase:true,frozenCurrentFileHashes:{...MATERIAL_CHAIN_FROZEN_FILES},frozenPreparedFileHashes:{...MATERIAL_CHAIN_FROZEN_FILES},priorVerifierPreserved:true,
 appConfig:{name:'brazacommerce-app',main:'../../dist/app-worker.mjs',keep_vars:true,d1_databases:[{binding:'ADMIN_DB',database_id:'synthetic-fixture'}]},adminSource:"function a(env,ownerSession){return ownerSession?.role==='owner'&&env?.MLS_V36_OWNER_PREVIEW==='ENABLED';} function b(env,ownerSession){return ownerSession?.role==='owner'&&env?.MLS_AI_SALES_OWNER_PREVIEW==='ENABLED';} const preview=markupCompatible&&mlsV36OwnerPreviewEnabled(env,ownerSession);const aiPreview=mlsAiSalesOwnerPreviewEnabled(env,ownerSession);return dashboard(env,current)",buildSource:"ai_sales_view=... listing_factory_view=... approved_design=... '+approved_design+'\\n'+ads_workspace+",workflowSource:'node --test --test-reporter=tap; python3 -m unittest'};
}

test('material chain verification admits the exact reviewed Git increment without granting external publication or money movement',()=>{
 const result=evaluateMaterialChainMergePreflight(good());assert.equal(result.ok,true);assert.deepEqual(result.failures,[]);assert.equal(result.scope,'MERGE_ONLY');
 for(const key of ['remoteCloudflareVerified','productionApproved','liveAuthorization','commercialWritesAllowed'])assert.equal(result[key],false);
 assert.deepEqual(result.manualGates,RELEASE_MANUAL_GATES);assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.failures));
 assert.deepEqual([...MATERIAL_CHAIN_ALLOWED_FILES].sort(),[...MATERIAL_CHAIN_ALLOWED_FILES]);assert.equal(new Set(MATERIAL_CHAIN_ALLOWED_FILES).size,MATERIAL_CHAIN_ALLOWED_FILES.length);
 for(const file of MATERIAL_CHAIN_ALLOWED_FILES){assert.doesNotMatch(file,/[?*\\]|\.\./);assert.ok(!Object.hasOwn(MATERIAL_CHAIN_FROZEN_FILES,file));}
});

test('material chain authority cannot reuse earlier Live/Finance permissions, broaden metadata, or authorize an arbitrary path',()=>{
 for(const mutate of [c=>c.schema='mls_finance_completion_merge_candidate_v1',c=>c.schema='mls_historical_profit_merge_candidate_v1',c=>c.schema='mls_operating_increment_merge_candidate_v1',c=>c.scope='PRODUCTION',c=>c.base_commit=FINANCE_COMPLETION_MERGE_BASE_COMMIT,c=>c.prepared_source_commit='main',c=>c.prepared_source_commit=c.base_commit,c=>c.owner_authorization='OWNER_REQUESTED_FINANCE_COMPLETION_WITHOUT_SITE_PUBLICATION_2026_11_20',c=>c.owner_authorization='OWNER_REQUESTED_HISTORICAL_PROFIT_RECOVERY_PR_WITHOUT_LIVE_2026_11_21',c=>c.owner_authorization='OWNER_REQUESTED_WEEKLY_PAYMENTS_AND_PHYSICAL_SHIRTS_WITHOUT_EXTERNAL_PUBLICATION_2026_11_20',c=>c.owner_authorization='OWNER_REQUESTED_FINANCIAL_AUTOMATION_LIVE_2026_11_13',c=>c.production_approved=true,c=>c.live_authorization=true,c=>c.commercial_writes_allowed=true,c=>delete c.expected_hashes.auth,c=>c.expected_hashes.finance='unknown',c=>c.files=[],c=>c.files.reverse(),c=>c.files.push({...c.files[1]}),c=>c.files[0].sha256='unknown',c=>c.files[0].path='../escape',c=>c.files[0].path='web/cloudflare/src/*',c=>c.files[0].path='web/cloudflare/src/unreviewed-next-change.mjs',c=>c.files[0].path=MATERIAL_CHAIN_MERGE_MANIFEST_PATH,c=>c.allowed_files=['*'],c=>c.production_approval={approved:true}]){
  const input=good();mutate(input.candidate);assert.deepEqual(evaluateMaterialChainMergePreflight(input).failures,['RELEASE_MATERIAL_CHAIN_MANIFEST_INVALID']);
 }
});

test('every protected historical/financial input stays immutable outside the exact material presentation delta',()=>{
 for(const [filename,sha256] of Object.entries(MATERIAL_CHAIN_FROZEN_FILES)){
  assert.equal(digest(fs.readFileSync(path.join(root,filename))),sha256,filename);
  const input=good();input.candidate.files=[{path:filename,sha256}];assert.deepEqual(evaluateMaterialChainMergePreflight(input).failures,['RELEASE_MATERIAL_CHAIN_MANIFEST_INVALID'],filename);
 }
 for(const filename of ['tools/isolated_preview.mjs','tools/worker_deploy.mjs','tools/verified_worker_deploy.mjs','tools/release-finance-completion-candidate.json','tools/release-historical-profit-candidate.json','tools/release-operating-increment-candidate.json','web/cloudflare/src/cost-rules.mjs','web/cloudflare/src/production-costs.mjs','web/cloudflare/src/numbered-adult-kit-costs.mjs','web/cloudflare/src/financial-accounting-projection.mjs','web/cloudflare/src/physical-shirt-stock.mjs','web/cloudflare/src/tenant-schema-manifest.mjs','web/finance/src/financial-bank-connector.mjs','web/finance/src/financial-cash-allocation.mjs'])assert.ok(Object.hasOwn(MATERIAL_CHAIN_FROZEN_FILES,filename),filename);
});

test('exact base, source ancestry and complete unique changed path inventory are required',()=>{
 for(const mutate of [i=>i.baseCommit='b'.repeat(40),i=>i.preparedSourceIsAncestor=false,i=>i.preparedSourceDescendsFromBase=false,i=>delete i.preparedSourceIsAncestor,i=>i.changedPaths=[],i=>i.changedPaths=null,i=>i.changedPaths.pop(),i=>i.changedPaths.push(i.changedPaths[0]),i=>i.changedPaths.push('web/cloudflare/src/arbitrary.mjs'),i=>i.changedPaths.push('workers/auth/wrangler.json'),i=>i.priorVerifierPreserved=false]){const input=good();mutate(input);assert.equal(evaluateMaterialChainMergePreflight(input).ok,false);}
});

test('every current/prepared source, original financial contract and all three runtime hashes must match',()=>{
 for(const key of ['currentFileHashes','preparedFileHashes'])for(const mutate of [h=>h['web/cloudflare/src/admin.mjs']='0'.repeat(64),h=>delete h['tools/release_preflight.mjs'],h=>h['unlisted']='0'.repeat(64)]){const input=good();mutate(input[key]);assert.ok(evaluateMaterialChainMergePreflight(input).failures.includes('RELEASE_MATERIAL_CHAIN_SOURCE_HASH_MISMATCH'));}
 for(const key of ['frozenCurrentFileHashes','frozenPreparedFileHashes'])for(const filename of Object.keys(MATERIAL_CHAIN_FROZEN_FILES)){const input=good();input[key][filename]='0'.repeat(64);assert.ok(evaluateMaterialChainMergePreflight(input).failures.includes('RELEASE_MATERIAL_CHAIN_FROZEN_SOURCE_CHANGED'),key+':'+filename);}
 for(const key of ['frozenCurrentFileHashes','frozenPreparedFileHashes']){const input=good();delete input[key]['.github/workflows/validate.yml'];assert.equal(evaluateMaterialChainMergePreflight(input).ok,false);}
 for(const kind of ['app','auth','finance']){const input=good();input.buildHashes[kind]='0'.repeat(64);assert.ok(evaluateMaterialChainMergePreflight(input).failures.includes('RELEASE_WORKER_HASH_MISMATCH'));}
 const extra=good();extra.buildHashes.preview='0'.repeat(64);assert.ok(evaluateMaterialChainMergePreflight(extra).failures.includes('RELEASE_WORKER_HASH_MISMATCH'));
});

test('prior three verifier implementations remain exact after removing only this separately marked policy',()=>{
 const observed=spawnSync('git',['show',MATERIAL_CHAIN_MERGE_BASE_COMMIT+':tools/release_preflight.mjs'],{cwd:root,encoding:'utf8'});assert.equal(observed.status,0,observed.stderr);const baseline=observed.stdout,current=fs.readFileSync(path.join(root,'tools/release_preflight.mjs'),'utf8');assert.equal(digest(baseline),MATERIAL_CHAIN_BASE_PREFLIGHT_SHA256);assert.equal(materialChainPriorVerifierMatchesBaseline(current,baseline),true);
 for(const changed of [current+'\n',current.replace("export const PR130_MERGE_BASE_COMMIT='346f30f200e5cbd3d9efd26663a483c625d9c6e7'","export const PR130_MERGE_BASE_COMMIT='"+'b'.repeat(40)+"'"),current.replace('if(baseCommit!==RELEASE_BASE_COMMIT)','if(false)'),current.replace('\n // BEGIN MATERIAL_CHAIN_DISPATCH_V1\n','\n // CHANGED MATERIAL_CHAIN_DISPATCH_V1\n')])assert.equal(materialChainPriorVerifierMatchesBaseline(changed,baseline),false);
 assert.equal(materialChainPriorVerifierMatchesBaseline(current,baseline+'\n'),false);
 const older=spawnSync('git',['show',FINANCE_COMPLETION_MERGE_BASE_COMMIT+':tools/release_preflight.mjs'],{cwd:root,encoding:'utf8'});assert.equal(older.status,0,older.stderr);assert.equal(financeCompletionPriorVerifierMatchesBaseline(current,older.stdout),true);
});

test('owner gates, bundle requirements, captured flags and read-only CI cannot be relaxed',()=>{
 for(const [mutate,code] of [[i=>i.appConfig.keep_vars=false,'RELEASE_APP_CONFIG_INVALID'],[i=>i.appConfig.vars={MLS_V36_OWNER_PREVIEW:'ENABLED'},'RELEASE_PREVIEW_CONFIG_MUST_BE_ABSENT'],[i=>i.adminSource=i.adminSource.replace("ownerSession?.role==='owner'",'true'),'RELEASE_OWNER_GATE_CHANGED'],[i=>i.buildSource='','RELEASE_COMBINED_BUNDLE_MISSING'],[i=>i.workflowSource+='; wrangler deploy','RELEASE_CI_NOT_READ_ONLY']]){const input=good();mutate(input);assert.ok(evaluateMaterialChainMergePreflight(input).failures.includes(code));}
});

test('new exact CLI base refuses a missing/unfinished/earlier-authority manifest without falling back',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mls-material-chain-preflight-invalid-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 assert.equal(spawnSync('git',['clone','--shared','--no-checkout',root,directory],{encoding:'utf8'}).status,0);assert.equal(spawnSync('git',['checkout','--detach',MATERIAL_CHAIN_MERGE_BASE_COMMIT],{cwd:directory,encoding:'utf8'}).status,0);
 fs.copyFileSync(path.join(root,'tools/release_preflight.mjs'),path.join(directory,'tools/release_preflight.mjs'));fs.mkdirSync(path.join(directory,'dist'));for(const kind of ['app','auth','finance'])fs.writeFileSync(path.join(directory,'dist',kind+'-worker.mjs'),'SYNTHETIC_PREFLIGHT_'+kind);
 const manifest=path.join(directory,MATERIAL_CHAIN_MERGE_MANIFEST_PATH);for(const invalid of [null,'{}','{invalid json',JSON.stringify({...good().candidate,prepared_source_commit:null}),fs.readFileSync(path.join(root,'tools/release-finance-completion-candidate.json'),'utf8')]){if(invalid===null)fs.rmSync(manifest,{force:true});else fs.writeFileSync(manifest,invalid);const result=spawnSync(process.execPath,['tools/release_preflight.mjs','--base='+MATERIAL_CHAIN_MERGE_BASE_COMMIT],{cwd:directory,encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/^RELEASE_MATERIAL_CHAIN_MANIFEST_INVALID\s*$/);assert.doesNotMatch(result.stdout,/PREFLIGHT_OK/);}
});

test('real CLI verifies exact prepared Git source/artifacts and refuses mutations or aliased source files',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mls-material-chain-preflight-complete-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const git=(...args)=>{const result=spawnSync('git',args,{cwd:directory,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
 assert.equal(spawnSync('git',['clone','--shared','--no-checkout',root,directory],{encoding:'utf8'}).status,0);git('checkout','--detach',MATERIAL_CHAIN_MERGE_BASE_COMMIT);
 fs.copyFileSync(path.join(root,'tools/release_preflight.mjs'),path.join(directory,'tools/release_preflight.mjs'));fs.appendFileSync(path.join(directory,'web/cloudflare/src/admin.mjs'),'\n// Synthetic local candidate only.\n');git('add','tools/release_preflight.mjs','web/cloudflare/src/admin.mjs');git('-c','user.name=Synthetic review','-c','user.email=review@example.test','commit','-m','synthetic reviewed source');
 const candidate=good().candidate;candidate.prepared_source_commit=git('rev-parse','HEAD');candidate.files=candidate.files.map(row=>({...row,sha256:digest(fs.readFileSync(path.join(directory,row.path)))}));fs.mkdirSync(path.join(directory,'dist'));
 for(const kind of ['app','auth','finance']){const bytes='SYNTHETIC_PREFLIGHT_'+kind;fs.writeFileSync(path.join(directory,'dist',kind+'-worker.mjs'),bytes);candidate.expected_hashes[kind]=digest(bytes);}
 fs.writeFileSync(path.join(directory,MATERIAL_CHAIN_MERGE_MANIFEST_PATH),JSON.stringify(candidate,null,2)+'\n');git('add',MATERIAL_CHAIN_MERGE_MANIFEST_PATH);git('-c','user.name=Synthetic review','-c','user.email=review@example.test','commit','-m','synthetic finite merge candidate');
 const run=()=>spawnSync(process.execPath,['tools/release_preflight.mjs','--base='+MATERIAL_CHAIN_MERGE_BASE_COMMIT],{cwd:directory,encoding:'utf8'});let result=run();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/RELEASE_MERGE_ONLY_LOCAL_PREFLIGHT_OK/);assert.match(result.stdout,/RELEASE_NOT_APPROVED_FOR_PRODUCTION/);
 // Matching source bytes alone cannot manufacture the reviewed ancestry.
 const originalPrepared=candidate.prepared_source_commit,preparedTree=git('rev-parse',originalPrepared+'^{tree}');
 for(const parents of [['-p',MATERIAL_CHAIN_MERGE_BASE_COMMIT],[]]){
  candidate.prepared_source_commit=git('-c','user.name=Synthetic review','-c','user.email=review@example.test','commit-tree',preparedTree,...parents,'-m','synthetic matching snapshot outside reviewed ancestry');
  fs.writeFileSync(path.join(directory,MATERIAL_CHAIN_MERGE_MANIFEST_PATH),JSON.stringify(candidate,null,2)+'\n');result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/RELEASE_MATERIAL_CHAIN_SOURCE_ANCESTRY_INVALID/);assert.doesNotMatch(result.stdout,/PREFLIGHT_OK/);
 }
 candidate.prepared_source_commit=originalPrepared;fs.writeFileSync(path.join(directory,MATERIAL_CHAIN_MERGE_MANIFEST_PATH),JSON.stringify(candidate,null,2)+'\n');
 fs.appendFileSync(path.join(directory,'web/cloudflare/src/admin.mjs'),'\n// Unreviewed mutation.\n');result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/RELEASE_MATERIAL_CHAIN_SOURCE_HASH_MISMATCH/);git('restore','web/cloudflare/src/admin.mjs');
 fs.appendFileSync(path.join(directory,'tools/verified_worker_deploy.mjs'),'\n// Unreviewed deployment mutation.\n');result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/RELEASE_MATERIAL_CHAIN_FROZEN_SOURCE_CHANGED/);git('restore','tools/verified_worker_deploy.mjs');
 const file=path.join(directory,'web/cloudflare/src/admin.mjs');fs.unlinkSync(file);fs.symlinkSync('admin-view.mjs',file);result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/RELEASE_MATERIAL_CHAIN_SOURCE_FILE_INVALID/);
});
