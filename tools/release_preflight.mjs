/**
 * Local-only release preflight for the exact reviewed MLS Commerce OS candidate.
 * No external calls, Cloudflare writes, deployments, secrets or runtime changes.
 * CI success does not approve a production release.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

// Explicitly frozen release inputs. Adding a path or changing a digest is a
// reviewable candidate update, never a wildcard or a bypass of this verifier.
export const RELEASE_ACCEPTED_OWNER_AUTHORIZATIONS=Object.freeze([
 'OWNER_REQUESTED_ALL_PREPARED_IMPROVEMENTS_LIVE_2026_10_30',
 'OWNER_REQUESTED_V41_LIVE_2026_11_11',
 'OWNER_REQUESTED_FINANCIAL_AUTOMATION_LIVE_2026_11_13'
]);
function literalReleasePath(value){
 return typeof value==='string'&&value.length>0&&value===value.trim()&&
  !value.startsWith('/')&&!value.includes('..')&&!/[?*\\:\u0000-\u001f\u007f]/.test(value)&&
  value.split('/').every(part=>part.length>0&&part!=='.');
}
const approvedCandidate=JSON.parse(fs.readFileSync(new URL('./release-approved-candidate.json',import.meta.url),'utf8'));
const validFlags=approvedCandidate?.expected_live_flags;
if(approvedCandidate?.schema!=='mls_release_candidate_v1'||
 !/^[a-f0-9]{40}$/.test(approvedCandidate.base_commit||'')||
 !/^[a-f0-9]{40}$/.test(approvedCandidate.prepared_source_commit||'')||
 approvedCandidate.commercial_writes_allowed!==false||
 !RELEASE_ACCEPTED_OWNER_AUTHORIZATIONS.includes(approvedCandidate.owner_authorization)||
 !approvedCandidate.expected_hashes||Object.keys(approvedCandidate.expected_hashes).sort().join(',')!=='app,auth,finance'||
 !Object.values(approvedCandidate.expected_hashes).every(value=>/^[a-f0-9]{64}$/.test(value))||
 !validFlags||Object.keys(validFlags).sort().join(',')!=='MLS_AI_SALES_OWNER_PREVIEW,MLS_V36_OWNER_PREVIEW'||
 !Object.values(validFlags).every(value=>value==='ENABLED')||
 !Array.isArray(approvedCandidate.allowed_files)||approvedCandidate.allowed_files.length===0||
 new Set(approvedCandidate.allowed_files).size!==approvedCandidate.allowed_files.length||
 approvedCandidate.allowed_files.some(value=>!literalReleasePath(value)))
 throw Error('RELEASE_CANDIDATE_MANIFEST_INVALID');
export const RELEASE_BASE_COMMIT=approvedCandidate.base_commit;
export const RELEASE_EXPECTED_SHA=Object.freeze({...approvedCandidate.expected_hashes});
export const RELEASE_EXPECTED_LIVE_FLAGS=Object.freeze({...validFlags});
export const RELEASE_ALLOWED_FILES=Object.freeze([...approvedCandidate.allowed_files]);
// Explicit reviewed V4.1 tenant isolation and additive account authorization,
// plus the previously reviewed weekly delta. This is a finite source list,
// never authority to alter original Workers, captured configs, future Finance
// modules, provider business actions or any deployment profile.
export const RELEASE_APPROVED_PROTECTED_FILES=Object.freeze([
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
 "workers/finance/commercial-account.json",
 "web/finance/src/financial-allocation-frame.mjs",
 "web/finance/src/financial-allocation-worker.mjs",
 "web/finance/src/financial-bank-connector.mjs",
 "web/finance/src/financial-cash-allocation.mjs",
 "web/finance/src/financial-obligation-frame.mjs",
 "web/finance/src/financial-obligation-worker.mjs",
 "web/finance/src/financial-order-components.mjs",
 "web/finance/src/financial-private-protocol.mjs",
 "web/finance/src/financial-source-capabilities.mjs",
 "web/finance/src/financial-source-collection.mjs",
 "web/finance/src/financial-source-events.mjs",
 "web/finance/src/financial-source-frame.mjs",
 "web/finance/src/financial-source-worker.mjs",
 "web/finance/tests/external-cash-allocation-guard.test.mjs",
 "web/finance/tests/financial-allocation-frame.test.mjs",
 "web/finance/tests/financial-allocation-worker.test.mjs",
 "web/finance/tests/financial-bank-connector.test.mjs",
 "web/finance/tests/financial-cash-allocation-store.test.mjs",
 "web/finance/tests/financial-cash-allocation.test.mjs",
 "web/finance/tests/financial-obligation-allocation.test.mjs",
 "web/finance/tests/financial-obligation-frame.test.mjs",
 "web/finance/tests/financial-obligation-worker.test.mjs",
 "web/finance/tests/financial-order-components.test.mjs",
 "web/finance/tests/financial-private-fixture.mjs",
 "web/finance/tests/financial-private-protocol.test.mjs",
 "web/finance/tests/financial-production-integration.test.mjs",
 "web/finance/tests/financial-source-capabilities.test.mjs",
 "web/finance/tests/financial-source-collection.test.mjs",
 "web/finance/tests/financial-source-events.test.mjs",
 "web/finance/tests/financial-source-original-items-v3.test.mjs",
 "web/finance/tests/financial-source-worker.test.mjs",
]);


export const RELEASE_MANUAL_GATES=Object.freeze([
 'CHECK_CLOUDFLARE_LIVE_APP_VERSION_AND_BUILD_TRIGGERS',
 'VERIFY_REMOTE_OWNER_FLAGS_MATCH_APPROVED_VALUES',
 'VERIFY_ADMIN_DB_BINDING_AND_BACKUP_ROLLBACK_PLAN',
 'VERIFY_ACCOUNT_DB_BINDINGS_ADDITIVE_MIGRATIONS_AND_LEGACY_BACKUPS',
 'VERIFY_APP_AUTH_FINANCE_VERSION_HASHES_AND_PRIVATE_FINANCE_PROFILE',
 'OWNER_AUTHENTICATED_DESKTOP_MOBILE_QA',
 'VERIFY_OWNER_AUTHORIZATION_MATCHES_REVIEWED_RELEASE_SCOPE'
]);

function cleanPaths(files){
 if(!Array.isArray(files)||files.some(p=>!literalReleasePath(p)))return null;
 return [...new Set(files)];
}
function exactSha(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}

// Shared environment checks retain the frozen release's owner/configuration
// and read-only CI gates for the separately authorized merge candidate.
function releaseEnvironmentFailures({appConfig,adminSource,buildSource,workflowSource}={}){
 const failures=[];
 if(!appConfig||appConfig.name!=='brazacommerce-app'||appConfig.main!=='../../dist/app-worker.mjs'||
  appConfig.keep_vars!==true||
  !Array.isArray(appConfig.d1_databases)||
  appConfig.d1_databases.filter(d=>d&&d.binding==='ADMIN_DB').length!==1)
  failures.push('RELEASE_APP_CONFIG_INVALID');
 if(appConfig&&Object.hasOwn(appConfig,'vars')&&
  appConfig.vars&&Object.keys(RELEASE_EXPECTED_LIVE_FLAGS).some(name=>Object.hasOwn(appConfig.vars,name)))
  failures.push('RELEASE_PREVIEW_CONFIG_MUST_BE_ABSENT');
 const ownerGate=typeof adminSource==='string'&&
  /ownerSession\?\.role\s*===\s*'owner'\s*&&\s*env\?\.MLS_V36_OWNER_PREVIEW\s*===\s*'ENABLED'/.test(adminSource)&&
  /ownerSession\?\.role\s*===\s*'owner'\s*&&\s*env\?\.MLS_AI_SALES_OWNER_PREVIEW\s*===\s*'ENABLED'/.test(adminSource)&&
  adminSource.includes('const preview=markupCompatible&&mlsV36OwnerPreviewEnabled(env,ownerSession)')&&
  adminSource.includes('const aiPreview=mlsAiSalesOwnerPreviewEnabled(env,ownerSession)')&&
  adminSource.includes('return dashboard(env,current)');
 if(!ownerGate)failures.push('RELEASE_OWNER_GATE_CHANGED');
 if(typeof buildSource!=='string'||!buildSource.includes('listing_factory_view=')||
   !buildSource.includes('approved_design=')||
   !buildSource.includes('ai_sales_view=')||
   !buildSource.includes("'+approved_design+'\\n'+ads_workspace+"))
  failures.push('RELEASE_COMBINED_BUNDLE_MISSING');
 if(typeof workflowSource!=='string'||!workflowSource.includes('node --test --test-reporter=tap')||
  !workflowSource.includes('python3 -m unittest')||
  /(?:npm run deploy|wrangler deploy|worker_deploy\.mjs deploy)/.test(workflowSource))
  failures.push('RELEASE_CI_NOT_READ_ONLY');
 return failures;
}

/**
 * Pure verifier for the source and metadata of one frozen, reviewed candidate.
 * It never claims that the remote Cloudflare flag or rollback state was checked.
 */
export function evaluateReleasePreflight({baseCommit,changedPaths,buildHashes,appConfig,adminSource,buildSource,workflowSource}={}){
 const failures=[];
 if(baseCommit!==RELEASE_BASE_COMMIT)failures.push('RELEASE_BASE_MISMATCH');
 const paths=cleanPaths(changedPaths);
 if(!paths||paths.length===0)failures.push('RELEASE_DIFF_UNAVAILABLE');
 else{
  const allowed=new Set(RELEASE_ALLOWED_FILES);
  if(paths.some(p=>!allowed.has(p)))failures.push('RELEASE_UNREVIEWED_PATH');
  if(paths.some(p=>/^(workers\/|web\/finance\/|web\/auth\/|web\/cloudflare\/original\/)/.test(p)&&!RELEASE_APPROVED_PROTECTED_FILES.includes(p)))
   failures.push('RELEASE_PROTECTED_WORKER_PATH');
 }
 if(!buildHashes||Object.keys(RELEASE_EXPECTED_SHA).some(kind=>
  !exactSha(buildHashes[kind])||buildHashes[kind]!==RELEASE_EXPECTED_SHA[kind]))
  failures.push('RELEASE_WORKER_HASH_MISMATCH');
 failures.push(...releaseEnvironmentFailures({appConfig,adminSource,buildSource,workflowSource}));
 return Object.freeze({ok:failures.length===0,failures:Object.freeze([...new Set(failures)]),
  manualGates:RELEASE_MANUAL_GATES,remoteCloudflareVerified:false,productionApproved:false});
}


// This separate review authorizes only integration of PR130. The frozen
// November13 Live candidate above remains unchanged and independently testable.
export const PR130_MERGE_BASE_COMMIT='346f30f200e5cbd3d9efd26663a483c625d9c6e7';
export const PR130_MERGE_MANIFEST_PATH='tools/release-pr130-merge-candidate.json';
export const PR130_MERGE_OWNER_AUTHORIZATION='OWNER_REQUESTED_PR130_CI_REPAIR_MERGE_WITHOUT_SITE_PUBLICATION_2026_11_20';
export const PR130_FROZEN_RELEASE_MANIFEST_SHA256='83557a1a65871786c0eb90a5ce827dd873ae1b2a9aef01e9d5127ae3d679f13b';
export const PR130_GUARDED_DEPLOY_PATH='tools/worker_deploy.mjs';
export const PR130_GUARDED_DEPLOY_SHA256='3d68df3c8c64d3b3fcd5f4246fc3f760a2880c7ddb3868df0ccddc965ebdfb32';
export const PR130_BASE_DEPLOY_SHA256='885b4bb719fd3bd601e277f4ae1d000a8d6ef142dc511b317055e04151bfa4ea';
const mergeSourceDigest=source=>createHash('sha256').update(source).digest('hex');
// Only the reviewed two-line preview denial may extend the deploy CLI.
// Removing these exact lines must recover every byte of the original source.
export function pr130GuardedDeploymentSourceMatchesBaseline(source,baseline){
 if(typeof source!=='string'||typeof baseline!=='string'||mergeSourceDigest(source)!==PR130_GUARDED_DEPLOY_SHA256||mergeSourceDigest(baseline)!==PR130_BASE_DEPLOY_SHA256)return false;
 const additions=["import {assertProductionDeploymentContext} from './isolated_preview.mjs';\n","  assertProductionDeploymentContext(target,root);\n"];
 let normalized=source;
 for(const addition of additions){if(normalized.split(addition).length!==2)return false;normalized=normalized.replace(addition,'');}
 return normalized===baseline;
}
const reviewedDeployGuard=file=>file.path===PR130_GUARDED_DEPLOY_PATH&&file.sha256===PR130_GUARDED_DEPLOY_SHA256;
const mergePlain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const mergeExact=(value,keys)=>mergePlain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const mergeProtected=filename=>/^(?:workers\/|web\/finance\/|web\/auth\/|web\/cloudflare\/original\/|\.github\/)/.test(filename)||
 ['tools/release-approved-candidate.json','tools/worker_deploy.mjs','tools/capture_worker_config.mjs','tools/import_worker_config.mjs'].includes(filename);
function validPr130MergeCandidate(candidate){
 const keys=['schema','pull_request','base_commit','prepared_source_commit','owner_authorization','production_approved','live_authorization','commercial_writes_allowed','expected_hashes','files'];
 if(!mergeExact(candidate,keys)||candidate.schema!=='mls_pr130_merge_candidate_v1'||candidate.pull_request!==130||
  candidate.base_commit!==PR130_MERGE_BASE_COMMIT||!(/^[a-f0-9]{40}$/).test(candidate.prepared_source_commit)||candidate.prepared_source_commit===candidate.base_commit||
  candidate.owner_authorization!==PR130_MERGE_OWNER_AUTHORIZATION||candidate.production_approved!==false||candidate.live_authorization!==false||candidate.commercial_writes_allowed!==false||
  !mergeExact(candidate.expected_hashes,['app','auth','finance'])||!Object.values(candidate.expected_hashes).every(exactSha)||
  !Array.isArray(candidate.files)||candidate.files.length<1||candidate.files.length>128)return false;
 let previous='';
 for(const file of candidate.files){
  if(!mergeExact(file,['path','sha256'])||!literalReleasePath(file.path)||!exactSha(file.sha256)||file.path<=previous||
   file.path===PR130_MERGE_MANIFEST_PATH||mergeProtected(file.path)&&!reviewedDeployGuard(file))return false;
  previous=file.path;
 }
 return true;
}

/**
 * A merge-only candidate has an exact base, complete finite diff, source
 * ancestry, exact current/prepared file bytes and exact generated Workers.
 * It carries no website, commercial-write or production authorization.
 */
export function evaluatePr130MergePreflight({baseCommit,changedPaths,buildHashes,appConfig,adminSource,buildSource,workflowSource,
 candidate,currentFileHashes,preparedFileHashes,preparedSourceIsAncestor,preparedSourceDescendsFromBase,frozenReleaseManifestHash,guardedDeploymentSourceMatchesBaseline}={}){
 const failures=[];
 if(!validPr130MergeCandidate(candidate))return Object.freeze({ok:false,failures:Object.freeze(['RELEASE_MERGE_MANIFEST_INVALID']),
  manualGates:RELEASE_MANUAL_GATES,scope:'MERGE_ONLY',remoteCloudflareVerified:false,productionApproved:false,liveAuthorization:false,commercialWritesAllowed:false});
 if(baseCommit!==PR130_MERGE_BASE_COMMIT)failures.push('RELEASE_MERGE_BASE_MISMATCH');
 if(preparedSourceIsAncestor!==true||preparedSourceDescendsFromBase!==true)failures.push('RELEASE_MERGE_SOURCE_ANCESTRY_INVALID');
 if(frozenReleaseManifestHash!==PR130_FROZEN_RELEASE_MANIFEST_SHA256)failures.push('RELEASE_FROZEN_MANIFEST_CHANGED');
 const paths=cleanPaths(changedPaths),expected=[PR130_MERGE_MANIFEST_PATH,...candidate.files.map(file=>file.path)].sort();
 if(!paths||paths.length===0||paths.length!==changedPaths.length)failures.push('RELEASE_DIFF_UNAVAILABLE');
 else{
  if(paths.length!==expected.length||paths.some(filename=>!expected.includes(filename)))failures.push('RELEASE_MERGE_UNREVIEWED_PATH');
  if(paths.some(filename=>mergeProtected(filename)&&!candidate.files.some(file=>file.path===filename&&reviewedDeployGuard(file))))failures.push('RELEASE_PROTECTED_WORKER_PATH');
 }
 if(candidate.files.some(reviewedDeployGuard)&&guardedDeploymentSourceMatchesBaseline!==true)failures.push('RELEASE_DEPLOY_GUARD_SOURCE_CHANGED');
 const fileKeys=candidate.files.map(file=>file.path);
 for(const hashes of [currentFileHashes,preparedFileHashes]){
  if(!mergeExact(hashes,fileKeys)||candidate.files.some(file=>hashes[file.path]!==file.sha256)){
   failures.push('RELEASE_MERGE_SOURCE_HASH_MISMATCH');break;
  }
 }
 if(!mergeExact(buildHashes,['app','auth','finance'])||Object.keys(candidate.expected_hashes).some(kind=>buildHashes[kind]!==candidate.expected_hashes[kind]))
  failures.push('RELEASE_WORKER_HASH_MISMATCH');
 failures.push(...releaseEnvironmentFailures({appConfig,adminSource,buildSource,workflowSource}));
 return Object.freeze({ok:failures.length===0,failures:Object.freeze([...new Set(failures)]),
  manualGates:RELEASE_MANUAL_GATES,scope:'MERGE_ONLY',remoteCloudflareVerified:false,productionApproved:false,liveAuthorization:false,commercialWritesAllowed:false});
}

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function read(filename){return fs.readFileSync(path.join(root,filename),'utf8');}
function hash(filename){return createHash('sha256').update(fs.readFileSync(path.join(root,filename))).digest('hex');}
export function runReleasePreflight({base='origin/main'}={}){
 if(typeof base!=='string'||!/^[a-zA-Z0-9._/\-]+$/.test(base))throw Error('RELEASE_BASE_INVALID');
 const changed=execFileSync('git',['diff','--name-only','--no-ext-diff',base+'...HEAD'],{
  cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().split('\n').filter(Boolean);
 const input={
  baseCommit:execFileSync('git',['rev-parse','--verify',base+'^{commit}'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(),
  changedPaths:changed,
  buildHashes:{
   app:hash('dist/app-worker.mjs'),
   auth:hash('dist/auth-worker.mjs'),
   finance:hash('dist/finance-worker.mjs')
  },
  appConfig:JSON.parse(read('workers/app/wrangler.json')),
  adminSource:read('web/cloudflare/src/admin.mjs'),
  buildSource:read('web/cloudflare/build.py'),
  workflowSource:read('.github/workflows/validate.yml')
 };
 // Selection is by the verified Git base, never by a failed legacy check.
 // A missing or invalid merge manifest cannot fall back to the frozen policy.
 if(input.baseCommit!==PR130_MERGE_BASE_COMMIT)return evaluateReleasePreflight(input);
 let candidate;try{candidate=JSON.parse(read(PR130_MERGE_MANIFEST_PATH));}catch{throw Error('RELEASE_MERGE_MANIFEST_INVALID');}
 if(!validPr130MergeCandidate(candidate))throw Error('RELEASE_MERGE_MANIFEST_INVALID');
 const currentFileHashes={},preparedFileHashes={};
 for(const file of candidate.files){
  const absolute=path.join(root,file.path),real=fs.realpathSync(absolute);
  if(!real.startsWith(root+path.sep)||!fs.lstatSync(absolute).isFile()||fs.lstatSync(absolute).isSymbolicLink())throw Error('RELEASE_MERGE_SOURCE_FILE_INVALID');
  currentFileHashes[file.path]=hash(file.path);
  try{preparedFileHashes[file.path]=createHash('sha256').update(execFileSync('git',['show',candidate.prepared_source_commit+':'+file.path],{cwd:root,stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024})).digest('hex');}
  catch{throw Error('RELEASE_MERGE_SOURCE_SNAPSHOT_UNAVAILABLE');}
 }
 let guardedDeploymentSourceMatchesBaseline;
 if(candidate.files.some(reviewedDeployGuard)){
  let baseline;try{baseline=execFileSync('git',['show',PR130_MERGE_BASE_COMMIT+':'+PR130_GUARDED_DEPLOY_PATH],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});}
  catch{throw Error('RELEASE_DEPLOY_GUARD_BASE_UNAVAILABLE');}
  guardedDeploymentSourceMatchesBaseline=pr130GuardedDeploymentSourceMatchesBaseline(read(PR130_GUARDED_DEPLOY_PATH),baseline);
 }
 const ancestor=(earlier,later)=>{try{execFileSync('git',['merge-base','--is-ancestor',earlier,later],{cwd:root,stdio:['ignore','pipe','pipe']});return true;}catch{return false;}};
 return evaluatePr130MergePreflight({...input,candidate,currentFileHashes,preparedFileHashes,
  preparedSourceIsAncestor:ancestor(candidate.prepared_source_commit,'HEAD'),preparedSourceDescendsFromBase:ancestor(PR130_MERGE_BASE_COMMIT,candidate.prepared_source_commit),
  frozenReleaseManifestHash:hash('tools/release-approved-candidate.json'),guardedDeploymentSourceMatchesBaseline});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.some(a=>a==='--help')){
   console.log('Usage: node tools/release_preflight.mjs [--base=origin/main]');
  }else{
   if(args.length>1||args.some(a=>!a.startsWith('--base=')))throw Error('RELEASE_ARGS_INVALID');
   const result=runReleasePreflight({base:args[0]?.slice('--base='.length)||'origin/main'});
   if(!result.ok){for(const error of result.failures)console.error(error);process.exitCode=1;}
   else{
    console.log(result.scope==='MERGE_ONLY'?'RELEASE_MERGE_ONLY_LOCAL_PREFLIGHT_OK':'RELEASE_LOCAL_PREFLIGHT_OK');
    for(const manualGate of result.manualGates)console.log('PENDING_MANUAL: '+manualGate);
    console.log('RELEASE_NOT_APPROVED_FOR_PRODUCTION');
   }
  }
 }catch(error){
  console.error(error?.code==='ENOENT'?'RELEASE_BUILD_MISSING':error?.message?.startsWith('RELEASE_')?
   error.message:'RELEASE_LOCAL_PREFLIGHT_FAILED');
  process.exitCode=1;
 }
}
