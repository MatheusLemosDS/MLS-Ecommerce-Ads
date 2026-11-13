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
 return Object.freeze({ok:failures.length===0,failures:Object.freeze([...new Set(failures)]),
  manualGates:RELEASE_MANUAL_GATES,remoteCloudflareVerified:false,productionApproved:false});
}

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function read(filename){return fs.readFileSync(path.join(root,filename),'utf8');}
function hash(filename){return createHash('sha256').update(fs.readFileSync(path.join(root,filename))).digest('hex');}
export function runReleasePreflight({base='origin/main'}={}){
 if(typeof base!=='string'||!/^[a-zA-Z0-9._/\-]+$/.test(base))throw Error('RELEASE_BASE_INVALID');
 const changed=execFileSync('git',['diff','--name-only','--no-ext-diff',base+'...HEAD'],{
  cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().split('\n').filter(Boolean);
 return evaluateReleasePreflight({
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
 });
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
    console.log('RELEASE_LOCAL_PREFLIGHT_OK');
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
