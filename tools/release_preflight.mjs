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

// BEGIN FINANCE_COMPLETION_MERGE_V1
// Separate owner authority: finish Finance in Git without website publication.
// No historical Live authorization or PR130 exception grants authority here.
export const FINANCE_COMPLETION_MERGE_BASE_COMMIT='4cfdf465b2fda58dd27ae693126b7fe1625f69d6';
export const FINANCE_COMPLETION_MERGE_MANIFEST_PATH='tools/release-finance-completion-candidate.json';
export const FINANCE_COMPLETION_OWNER_AUTHORIZATION='OWNER_REQUESTED_FINANCE_COMPLETION_WITHOUT_SITE_PUBLICATION_2026_11_20';
export const FINANCE_COMPLETION_BASE_PREFLIGHT_SHA256='2abb94faeca1f8a5d6d48fac859d3e35a50405101e1b95fd9b4b4cbdddc1dd72';
// Explicit path review. New paths require editing this literal list and the
// exact candidate manifest; neither file can grant a prefix or wildcard.
export const FINANCE_COMPLETION_ALLOWED_FILES=Object.freeze([
 "NEXT_CHAT_HANDOFF.txt",
 "docs/MLS_CODEX_HANDOFF_2026_10_28.md",
 "docs/MLS_COMMERCE_OS_CHECKPOINT.json",
 "docs/MLS_FINANCE_COMPLETION_2026_11_20.md",
 "docs/ROADMAP_MLS_COMMERCE_OS.md",
 "docs/financial-automation/MATRIZ_EXECUCAO.json",
 "docs/financial-automation/README.md",
 "docs/financial-automation/VALIDATION.md",
 "docs/financial-automation/validation/finance-completion-20261120.json",
 "package-lock.json",
 "package.json",
 "previews/isolated-builds.json",
 "tools/browser_assets.mjs",
 "tools/build_finance_connection_candidate.py",
 "tools/release_preflight.mjs",
 "tools/tests/browser-assets.test.mjs",
 "tools/tests/finance-preview-branch.test.mjs",
 "tools/tests/release-finance-completion-preflight.test.mjs",
 "tools/worker_project.mjs",
 "web/cloudflare/build.py",
 "web/cloudflare/src/admin-client.mjs",
 "web/cloudflare/src/admin-view.mjs",
 "web/cloudflare/src/admin.mjs",
 "web/cloudflare/src/app-business-period.mjs",
 "web/cloudflare/src/app-product-index.mjs",
 "web/cloudflare/src/app-release-view.mjs",
 "web/cloudflare/src/app-release.mjs",
 "web/cloudflare/src/browser-assets-manifest.mjs",
 "web/cloudflare/src/browser-assets.mjs",
 "web/cloudflare/src/business-cost-history-client.mjs",
 "web/cloudflare/src/business-cost-history-report.mjs",
 "web/cloudflare/src/business-cost-history.mjs",
 "web/cloudflare/src/business-history-continuation.mjs",
 "web/cloudflare/src/business-history-sync.mjs",
 "web/cloudflare/src/business-month-cohort-source-recovery.mjs",
 "web/cloudflare/src/business-month-publication.mjs",
 "web/cloudflare/src/business-month-source-recovery.mjs",
 "web/cloudflare/src/business-month.mjs",
 "web/cloudflare/src/business-sync.mjs",
 "web/cloudflare/src/commercial-account-gateway.mjs",
 "web/cloudflare/src/commercial-finance-capability.mjs",
 "web/cloudflare/src/commercial-route-policy.mjs",
 "web/cloudflare/src/cost-rules-view.mjs",
 "web/cloudflare/src/dated-cost-candidates.mjs",
 "web/cloudflare/src/dated-cost-evidence.mjs",
 "web/cloudflare/src/dtf-artwork-backup.mjs",
 "web/cloudflare/src/dtf-lifecycle-client.mjs",
 "web/cloudflare/src/dtf-recipe-client.mjs",
 "web/cloudflare/src/dtf-view.mjs",
 "web/cloudflare/src/financial-accounting-projection.mjs",
 "web/cloudflare/src/financial-automation-client.mjs",
 "web/cloudflare/src/financial-automation-service.mjs",
 "web/cloudflare/src/financial-automation-sources.mjs",
 "web/cloudflare/src/financial-automation-view.mjs",
 "web/cloudflare/src/financial-cash-allocation-store.mjs",
 "web/cloudflare/src/financial-inventory-bridge.mjs",
 "web/cloudflare/src/financial-inventory-client.mjs",
 "web/cloudflare/src/financial-obligation-app-source.mjs",
 "web/cloudflare/src/historical-cost-orchestration.mjs",
 "web/cloudflare/src/incurred-production-workspace.mjs",
 "web/cloudflare/src/order-operations.mjs",
 "web/cloudflare/src/product-registry.mjs",
 "web/cloudflare/src/production-dtf-store.mjs",
 "web/cloudflare/src/saved-catalog-view.mjs",
 "web/cloudflare/src/tenant-schema-manifest.mjs",
 "web/cloudflare/tests/app-release.test.mjs",
 "web/cloudflare/tests/browser-assets.test.mjs",
 "web/cloudflare/tests/business-checkpoint-compiled.test.mjs",
 "web/cloudflare/tests/business-checkpoint-routes.test.mjs",
 "web/cloudflare/tests/business-collection-boundary-compiled.test.mjs",
 "web/cloudflare/tests/business-collection-fixture.mjs",
 "web/cloudflare/tests/business-collection-retention-budget.test.mjs",
 "web/cloudflare/tests/business-cost-diagnostics-evidence-v2.test.mjs",
 "web/cloudflare/tests/business-cost-diagnostics-evidence.test.mjs",
 "web/cloudflare/tests/business-cost-diagnostics.test.mjs",
 "web/cloudflare/tests/business-cost-history-client-chrome.test.mjs",
 "web/cloudflare/tests/business-cost-history-client.test.mjs",
 "web/cloudflare/tests/business-cost-history-report.test.mjs",
 "web/cloudflare/tests/business-cost-history.test.mjs",
 "web/cloudflare/tests/business-cost-recovery-routes.test.mjs",
 "web/cloudflare/tests/business-history-continuation.test.mjs",
 "web/cloudflare/tests/business-history-sync.test.mjs",
 "web/cloudflare/tests/business-month-retention.test.mjs",
 "web/cloudflare/tests/business-month-routes.test.mjs",
 "web/cloudflare/tests/business-month-source-recovery.test.mjs",
 "web/cloudflare/tests/business-month-storage.test.mjs",
 "web/cloudflare/tests/business-month-view-routes.test.mjs",
 "web/cloudflare/tests/business-month.test.mjs",
 "web/cloudflare/tests/business-period-retention-fixture.mjs",
 "web/cloudflare/tests/business-sync-rollover-fixture.mjs",
 "web/cloudflare/tests/business-sync.test.mjs",
 "web/cloudflare/tests/business-variant-attribution.test.mjs",
 "web/cloudflare/tests/commercial-account-gateway-deadline.test.mjs",
 "web/cloudflare/tests/commercial-route-policy.test.mjs",
 "web/cloudflare/tests/commercial-workspace-setup.test.mjs",
 "web/cloudflare/tests/dated-cost-app-integration.test.mjs",
 "web/cloudflare/tests/dated-cost-candidates.test.mjs",
 "web/cloudflare/tests/dated-cost-evidence.test.mjs",
 "web/cloudflare/tests/dtf-artwork-backup-chrome.test.mjs",
 "web/cloudflare/tests/dtf-artwork-backup.test.mjs",
 "web/cloudflare/tests/dtf-auto-layout-chrome.test.mjs",
 "web/cloudflare/tests/dtf-cycle-chrome.test.mjs",
 "web/cloudflare/tests/dtf-cycle-fixture.mjs",
 "web/cloudflare/tests/dtf-cycle.test.mjs",
 "web/cloudflare/tests/dtf-provider-consumers-compiled.test.mjs",
 "web/cloudflare/tests/dtf-provider-consumers.test.mjs",
 "web/cloudflare/tests/dtf-recipe-chrome.test.mjs",
 "web/cloudflare/tests/dtf-recipe-fixture-clock.test.mjs",
 "web/cloudflare/tests/dtf-recipe-fixture.mjs",
 "web/cloudflare/tests/dtf-recipe.test.mjs",
 "web/cloudflare/tests/dtf-ui.test.mjs",
 "web/cloudflare/tests/financial-accounting-projection.test.mjs",
 "web/cloudflare/tests/financial-automation-client-chrome.test.mjs",
 "web/cloudflare/tests/financial-automation-client.test.mjs",
 "web/cloudflare/tests/financial-automation-routes.test.mjs",
 "web/cloudflare/tests/financial-automation-service.test.mjs",
 "web/cloudflare/tests/financial-automation-sources.test.mjs",
 "web/cloudflare/tests/financial-automation-ui-fixture.mjs",
 "web/cloudflare/tests/financial-automation-worker-chrome.test.mjs",
 "web/cloudflare/tests/financial-inventory-bridge.test.mjs",
 "web/cloudflare/tests/financial-inventory-client.test.mjs",
 "web/cloudflare/tests/financial-obligation-retry.test.mjs",
 "web/cloudflare/tests/financial-original-items-page.test.mjs",
 "web/cloudflare/tests/financial-source-continuation.test.mjs",
 "web/cloudflare/tests/historical-child-cost-compiled.test.mjs",
 "web/cloudflare/tests/historical-cost-recovery-compiled.test.mjs",
 "web/cloudflare/tests/mls-agent-learning-compiled.test.mjs",
 "web/cloudflare/tests/mls-production-rework.test.mjs",
 "web/cloudflare/tests/order-operations-recipe-performance.test.mjs",
 "web/cloudflare/tests/owner-dtf-batches-chrome.test.mjs",
 "web/cloudflare/tests/owner-dtf-batches-fixture.mjs",
 "web/cloudflare/tests/owner-dtf-batches.test.mjs",
 "web/cloudflare/tests/product-index-shape-chain.test.mjs",
 "web/cloudflare/tests/product-registry-diagnostics.test.mjs",
 "web/cloudflare/tests/production-cost-periods.test.mjs",
 "web/cloudflare/tests/production-dtf-routes.test.mjs",
 "web/cloudflare/tests/reviewed-business-month-source-adapter.mjs",
 "web/cloudflare/tests/reviewed-business-month-source-adapter.test.mjs",
 "web/cloudflare/tests/reviewed-cost-source-invariants.mjs",
 "web/cloudflare/tests/shirt-cost-editing-chrome.test.mjs",
 "web/cloudflare/tests/tenant-sql-isolation.test.mjs",
 "web/finance/src/auth-router.mjs",
 "web/finance/src/business-period-missing-run.mjs",
 "web/finance/src/business-period-retention-frame.mjs",
 "web/finance/src/business-period-retention-worker.mjs",
 "web/finance/src/business-period-retention.mjs",
 "web/finance/src/business-period.mjs",
 "web/finance/src/connection-worker.mjs",
 "web/finance/src/financial-bank-connector.mjs",
 "web/finance/src/financial-cash-allocation.mjs",
 "web/finance/src/financial-private-protocol.mjs",
 "web/finance/src/financial-source-frame.mjs",
 "web/finance/src/financial-source-worker.mjs",
 "web/finance/src/product-index-frame.mjs",
 "web/finance/src/product-index.mjs",
 "web/finance/src/production-worker.mjs",
 "web/finance/tests/business-period-missing-run.test.mjs",
 "web/finance/tests/business-period-retention-routes.test.mjs",
 "web/finance/tests/business-period-retention.test.mjs",
 "web/finance/tests/financial-bank-connector.test.mjs",
 "web/finance/tests/financial-cash-allocation-alias-capacity.test.mjs",
 "web/finance/tests/product-index.test.mjs",
 "workers/app/browser-assets.json"
]);
// Current and prepared snapshots must retain every frozen deployment/config
// input, both earlier manifests and both earlier release verifier test suites.
export const FINANCE_COMPLETION_FROZEN_FILES=Object.freeze({
 ".github/workflows/validate.yml": "14a2aaa2dafedac93310bb6208831991ceb5437b5f00190360f14a0559bbb7ad",
 ".node-version": "7e8a2fa94951112b894a3dbe3d05efef5e9263741fa49125f0a70f40fedab4cc",
 "tools/capture_worker_config.mjs": "7f2452ce8838350011b1f19338f4d5a2d7e8bd8d3ef393edfa29066ff78d4464",
 "tools/import_worker_config.mjs": "1d73f76f2e60d1ea973eda33c2efec56cf1be87d1bb5d6531ba3a2fd95f8594e",
 "tools/isolated_preview.mjs": "c956da1e0b14d990878ed6c41bd5d132a0a26976a0b840e5eb13f4320622fa46",
 "tools/release-approved-candidate.json": "83557a1a65871786c0eb90a5ce827dd873ae1b2a9aef01e9d5127ae3d679f13b",
 "tools/release-pr130-merge-candidate.json": "c287900d9c598c9603335c14b3dac97ff17a066480c60986aaa6623fbcbbd8c8",
 "tools/tests/release-pr130-preflight.test.mjs": "1c82d7fde835a39ea1cae5449dbf2b4f0657e8adf6b8817f5aaf61643e0dcedb",
 "tools/tests/release-preflight.test.mjs": "be2b27b05a1b6d6ab6f808557e60e1fe0907c6b7dfcd4d8e3b1420579fc75710",
 "tools/worker_deploy.mjs": "3d68df3c8c64d3b3fcd5f4246fc3f760a2880c7ddb3868df0ccddc965ebdfb32",
 "web/cloudflare/original/app-worker.mjs": "f022a27d4b4c8ac327381fd5318ee04d47ec67c4d0950c63e61ea1623b3cdd81",
 "web/cloudflare/original/auth-worker.mjs": "32e1af172a4143c3f91ae927422e0846aee520605c64d0500f06c74c1462f4df",
 "web/cloudflare/src/cost-rules.mjs": "bddd06c0c7f9b97c809240082137297b7d6b43b0a95ed61ddef7fead571643dd",
 "web/cloudflare/src/incurred-production.mjs": "3958d0babcaa370cf6f1bcf8d7201cb00e7fc7a015ceddc4c32c1189ea5d3e4d",
 "web/cloudflare/src/production-costs.mjs": "04d8a0cc79f95fae403ce09f3d4137a4eb5b71489a98aea8161abdc2bb53d7a8",
 "web/cloudflare/src/production-coverage.mjs": "a0896f3d2b3cdafd38659abb9e7a0624d00d807f89ab28076878a475e13df3d0",
 "web/cloudflare/src/production-weekly-close.mjs": "806d27bb9beef6b2779bcbad556914474ded33869912c90f9e9d8770f5bfb572",
 "web/cloudflare/src/production-weekly-store.mjs": "6774503f20b3aa1a7861d8fc92b54220d809625f36228ffe701dd6a9379d1229",
 "web/cloudflare/src/variant-bindings.mjs": "518bc0d4937fdf0b2025f8ab2138ddfbe961bc21dbe605dda323f48fb62ec696",
 "workers/app/automation.json": "892ff68c6dc0fe310ea61751313625f03f0fdc73963ffc8c4a3a5edf4f17fa25",
 "workers/app/browser-assets-published.json": "012317708c02c6340981ce3aa984f2f96790e399a1e3f6a304e9e648467055f1",
 "workers/app/commercial-account.json": "e44e86f9e644f72931fbee0ad0919a87ddcba6f17a7ba160fa8fe9f47eb4690a",
 "workers/app/migration.json": "4f70562d710e193a01a32fb5c703626bb190388911bdd5320dacb0cb27eafa0e",
 "workers/app/wrangler.example.json": "356d49d63aef04e7fe3216b2a8e676b3ae31b32c0817c9195c6e92ba631c0c53",
 "workers/app/wrangler.json": "39ad9b271f0ba4e6e9d1799e0e62a77b57daaeab340727f42c8d0eff5e46ce1a",
 "workers/auth/commercial-account.json": "c672c52cc4cb9d66237db05eb5e913ff125562fda154d8eb88ec77a5acbb21e4",
 "workers/auth/migration.json": "3078c6b2f9e3f6a126bbeca90a801d3d8b4ecf6aa615ccb942b705471d58d4e4",
 "workers/auth/wrangler.example.json": "d3c5704584969b52c22afda3599c8940f96bd0787ccebc07bfa79e3cc5d2f4ea",
 "workers/auth/wrangler.json": "4a4ebe4387dcb8771243c6942370f94e9bfee6d005b3b38cdcb24b90a9637e02",
 "workers/finance/commercial-account.json": "309544690f84e23964974928c64f1aa777cb8a0f559234a455a2f4963cf8f7a6",
 "workers/finance/migration.json": "d260dcdb5ea7f3e38507070f95d46b2318fc6a98a21b15fdc03adf16bcb55d36",
 "workers/finance/wrangler.example.json": "7bfc9d6b046db22cf44b175cc5e1a314d9348bf3bc7d1a71b1dde159e8c681d1",
 "workers/finance/wrangler.json": "62847cc701e5ae88099ea79779cb15f86a5ef43ef542266ddd5541616d2e11be"
});
const completionSectionBegin='// BEGIN FINANCE_COMPLETION_MERGE_V1\n',completionSectionEnd='// END FINANCE_COMPLETION_MERGE_V1\n';
const completionDispatchBegin=' // BEGIN FINANCE_COMPLETION_DISPATCH_V1\n',completionDispatchEnd=' // END FINANCE_COMPLETION_DISPATCH_V1\n';
export function financeCompletionPriorVerifierMatchesBaseline(source,baseline){
 if(typeof source!=='string'||typeof baseline!=='string'||mergeSourceDigest(baseline)!==FINANCE_COMPLETION_BASE_PREFLIGHT_SHA256)return false;
 let normalized=source;
 for(const [begin,end] of [[completionSectionBegin,completionSectionEnd],[completionDispatchBegin,completionDispatchEnd]]){
  const first=normalized.indexOf(begin),last=normalized.indexOf(end);
  if(first<0||last<first||normalized.indexOf(begin,first+begin.length)!==-1||normalized.indexOf(end,last+end.length)!==-1)return false;
  normalized=normalized.slice(0,first)+normalized.slice(last+end.length);
 }
 return normalized===baseline;
}
function validFinanceCompletionCandidate(candidate){
 const keys=['schema','scope','base_commit','prepared_source_commit','owner_authorization','production_approved','live_authorization','commercial_writes_allowed','expected_hashes','files'];
 if(!mergeExact(candidate,keys)||candidate.schema!=='mls_finance_completion_merge_candidate_v1'||candidate.scope!=='MERGE_ONLY'||candidate.base_commit!==FINANCE_COMPLETION_MERGE_BASE_COMMIT||!(/^[a-f0-9]{40}$/).test(candidate.prepared_source_commit)||candidate.prepared_source_commit===candidate.base_commit||candidate.owner_authorization!==FINANCE_COMPLETION_OWNER_AUTHORIZATION||candidate.production_approved!==false||candidate.live_authorization!==false||candidate.commercial_writes_allowed!==false||!mergeExact(candidate.expected_hashes,['app','auth','finance'])||!Object.values(candidate.expected_hashes).every(exactSha)||!Array.isArray(candidate.files)||candidate.files.length<1||candidate.files.length>FINANCE_COMPLETION_ALLOWED_FILES.length)return false;
 let previous='';
 for(const file of candidate.files){
  if(!mergeExact(file,['path','sha256'])||!literalReleasePath(file.path)||!exactSha(file.sha256)||file.path<=previous||!FINANCE_COMPLETION_ALLOWED_FILES.includes(file.path)||Object.hasOwn(FINANCE_COMPLETION_FROZEN_FILES,file.path))return false;
  previous=file.path;
 }
 return true;
}
export function evaluateFinanceCompletionMergePreflight({baseCommit,changedPaths,buildHashes,appConfig,adminSource,buildSource,workflowSource,candidate,currentFileHashes,preparedFileHashes,preparedSourceIsAncestor,preparedSourceDescendsFromBase,frozenCurrentFileHashes,frozenPreparedFileHashes,priorVerifierPreserved}={}){
 const result=failures=>Object.freeze({ok:failures.length===0,failures:Object.freeze([...new Set(failures)]),manualGates:RELEASE_MANUAL_GATES,scope:'MERGE_ONLY',remoteCloudflareVerified:false,productionApproved:false,liveAuthorization:false,commercialWritesAllowed:false});
 if(!validFinanceCompletionCandidate(candidate))return result(['RELEASE_FINANCE_COMPLETION_MANIFEST_INVALID']);
 const failures=[];
 if(baseCommit!==FINANCE_COMPLETION_MERGE_BASE_COMMIT)failures.push('RELEASE_FINANCE_COMPLETION_BASE_MISMATCH');
 if(preparedSourceIsAncestor!==true||preparedSourceDescendsFromBase!==true)failures.push('RELEASE_FINANCE_COMPLETION_SOURCE_ANCESTRY_INVALID');
 if(priorVerifierPreserved!==true)failures.push('RELEASE_PRIOR_VERIFIER_CHANGED');
 const paths=cleanPaths(changedPaths),expected=[FINANCE_COMPLETION_MERGE_MANIFEST_PATH,...candidate.files.map(file=>file.path)].sort();
 if(!paths||paths.length===0||paths.length!==changedPaths.length)failures.push('RELEASE_DIFF_UNAVAILABLE');
 else if(paths.length!==expected.length||paths.some(filename=>!expected.includes(filename)))failures.push('RELEASE_FINANCE_COMPLETION_UNREVIEWED_PATH');
 const fileKeys=candidate.files.map(file=>file.path);
 for(const hashes of [currentFileHashes,preparedFileHashes])if(!mergeExact(hashes,fileKeys)||candidate.files.some(file=>hashes[file.path]!==file.sha256)){failures.push('RELEASE_FINANCE_COMPLETION_SOURCE_HASH_MISMATCH');break;}
 const frozenKeys=Object.keys(FINANCE_COMPLETION_FROZEN_FILES);
 for(const hashes of [frozenCurrentFileHashes,frozenPreparedFileHashes])if(!mergeExact(hashes,frozenKeys)||frozenKeys.some(filename=>hashes[filename]!==FINANCE_COMPLETION_FROZEN_FILES[filename])){failures.push('RELEASE_FINANCE_COMPLETION_FROZEN_SOURCE_CHANGED');break;}
 if(!mergeExact(buildHashes,['app','auth','finance'])||Object.keys(candidate.expected_hashes).some(kind=>buildHashes[kind]!==candidate.expected_hashes[kind]))failures.push('RELEASE_WORKER_HASH_MISMATCH');
 failures.push(...releaseEnvironmentFailures({appConfig,adminSource,buildSource,workflowSource}));return result(failures);
}
function runFinanceCompletionPreflight(input){
 let candidate;try{candidate=JSON.parse(read(FINANCE_COMPLETION_MERGE_MANIFEST_PATH));}catch{throw Error('RELEASE_FINANCE_COMPLETION_MANIFEST_INVALID');}
 if(!validFinanceCompletionCandidate(candidate))throw Error('RELEASE_FINANCE_COMPLETION_MANIFEST_INVALID');
 const currentFileHashes={},preparedFileHashes={},frozenCurrentFileHashes={},frozenPreparedFileHashes={};
 const snapshot=(filename,commit)=>{
  try{return createHash('sha256').update(execFileSync('git',['show',commit+':'+filename],{cwd:root,stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024})).digest('hex');}
  catch{throw Error('RELEASE_FINANCE_COMPLETION_SOURCE_SNAPSHOT_UNAVAILABLE');}
 };
 const current=filename=>{const absolute=path.join(root,filename),real=fs.realpathSync(absolute);if(!real.startsWith(root+path.sep)||!fs.lstatSync(absolute).isFile()||fs.lstatSync(absolute).isSymbolicLink())throw Error('RELEASE_FINANCE_COMPLETION_SOURCE_FILE_INVALID');return hash(filename);};
 for(const file of candidate.files){currentFileHashes[file.path]=current(file.path);preparedFileHashes[file.path]=snapshot(file.path,candidate.prepared_source_commit);}
 for(const filename of Object.keys(FINANCE_COMPLETION_FROZEN_FILES)){frozenCurrentFileHashes[filename]=current(filename);frozenPreparedFileHashes[filename]=snapshot(filename,candidate.prepared_source_commit);}
 let baseline;try{baseline=execFileSync('git',['show',FINANCE_COMPLETION_MERGE_BASE_COMMIT+':tools/release_preflight.mjs'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch{throw Error('RELEASE_FINANCE_COMPLETION_PRIOR_VERIFIER_UNAVAILABLE');}
 const ancestor=(earlier,later)=>{try{execFileSync('git',['merge-base','--is-ancestor',earlier,later],{cwd:root,stdio:['ignore','pipe','pipe']});return true;}catch{return false;}};
 return evaluateFinanceCompletionMergePreflight({...input,candidate,currentFileHashes,preparedFileHashes,frozenCurrentFileHashes,frozenPreparedFileHashes,preparedSourceIsAncestor:ancestor(candidate.prepared_source_commit,'HEAD'),preparedSourceDescendsFromBase:ancestor(FINANCE_COMPLETION_MERGE_BASE_COMMIT,candidate.prepared_source_commit),priorVerifierPreserved:financeCompletionPriorVerifierMatchesBaseline(read('tools/release_preflight.mjs'),baseline)});
}
// END FINANCE_COMPLETION_MERGE_V1
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
 // BEGIN FINANCE_COMPLETION_DISPATCH_V1
 // Exact new base selects only this merge policy; failure cannot fall back.
 if(input.baseCommit===FINANCE_COMPLETION_MERGE_BASE_COMMIT)return runFinanceCompletionPreflight(input);
 // END FINANCE_COMPLETION_DISPATCH_V1
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
