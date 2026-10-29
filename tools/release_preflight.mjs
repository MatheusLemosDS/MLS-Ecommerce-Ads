/**
 * Local-only release preflight for MLS Commerce OS v3.6 + approved visual.
 * No external calls, Cloudflare writes, deployments, secrets or runtime changes.
 * CI success does not approve a production release.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export const RELEASE_EXPECTED_SHA=Object.freeze({
 app:'d1618ca222afa4604cb6e1c5c938735c6415a0fc475b3901f5b04b3d9f0eb2f1',
 auth:'1fef431c8573e05563c7938d95be0976a160bc603340084aa747ee0b73e7ec64',
 finance:'b2483fc6107ecb4782e746becfe1b69ee6e3b9d3f0a6109351390b11b9303ca3'
});
export const RELEASE_ALLOWED_FILES=Object.freeze([
  ".github/workflows/validate.yml",
  "NEXT_CHAT_HANDOFF.txt",
  "docs/MISSION_CONTROL_V36_RECORD_SEARCH.md",
  "docs/MLS_APPROVED_DESIGN_SYSTEM_2026_10_29.md",
  "docs/MLS_CODEX_HANDOFF_2026_10_28.md",
  "docs/MLS_COMMERCE_OS_CHECKPOINT.json",
  "docs/MLS_INTEGRATED_OWNER_RELEASE_2026_10_29.md",
  "docs/MLS_OFFLINE_OWNER_REVIEW_2026_10_29.md",
  "docs/MLS_V36_OWNER_PREVIEW_RELEASE.md",
  "docs/ROADMAP_MLS_COMMERCE_OS.md",
  "tools/build_offline_owner_review.mjs",
  "tools/mls_listing_factory_cli.mjs",
  "tools/release_preflight.mjs",
  "tools/tests/offline-owner-review.test.mjs",
  "tools/tests/release-preflight.test.mjs",
  "tools/worker_project.mjs",
  "web/cloudflare/build.py",
  "web/cloudflare/src/admin-client.mjs",
  "web/cloudflare/src/admin-view.mjs",
  "web/cloudflare/src/admin.mjs",
  "web/cloudflare/src/ads-workspace-view.mjs",
  "web/cloudflare/src/approved-design-system.mjs",
  "web/cloudflare/src/dtf-view.mjs",
  "web/cloudflare/src/mission-control.mjs",
  "web/cloudflare/src/mls-listing-factory-planner.mjs",
  "web/cloudflare/src/mls-listing-factory-view.mjs",
  "web/cloudflare/src/mls-lost-push-recovery.mjs",
  "web/cloudflare/src/mls-shopee-capability-audit.mjs",
  "web/cloudflare/src/saved-catalog-view.mjs",
  "web/cloudflare/src/workspace-navigation.mjs",
  "web/cloudflare/tests/admin-bootstrap-compiled.test.mjs",
  "web/cloudflare/tests/admin-startup-compiled.test.mjs",
  "web/cloudflare/tests/browser-owner-chrome.test.mjs",
  "web/cloudflare/tests/mission-agents-hub-chrome.test.mjs",
  "web/cloudflare/tests/mission-agents-hub-rework.test.mjs",
  "web/cloudflare/tests/mls-approved-all-panels-chrome.test.mjs",
  "web/cloudflare/tests/mls-approved-design-system.test.mjs",
  "web/cloudflare/tests/mls-integrated-owner-visual-chrome.test.mjs",
  "web/cloudflare/tests/mls-listing-factory-batch-media.test.mjs",
  "web/cloudflare/tests/mls-listing-factory-chrome.test.mjs",
  "web/cloudflare/tests/mls-listing-factory-foundations.test.mjs",
  "web/cloudflare/tests/mls-listing-factory-owner-ui.test.mjs",
  "web/cloudflare/tests/mls-production-rework-chrome.test.mjs",
  "web/cloudflare/tests/mls-production-rework.test.mjs",
  "web/cloudflare/tests/mls-products-workspace-chrome.test.mjs",
  "web/cloudflare/tests/mls-products-workspace-rework.test.mjs",
  "web/cloudflare/tests/mls-roadmap-ui.test.mjs",
  "web/cloudflare/tests/mls-v36-approved-integration-gates.test.mjs",
  "web/cloudflare/tests/mls-v36-listing-factory-integration.test.mjs",
  "web/cloudflare/tests/mls-v36-release-gate.test.mjs",
  "web/cloudflare/tests/owner-report-browser-fixture.mjs",
  "web/cloudflare/tests/workspace-navigation.test.mjs"
]);
export const RELEASE_MANUAL_GATES=Object.freeze([
 'CHECK_CLOUDFLARE_LIVE_APP_VERSION_AND_BUILD_TRIGGERS',
 'VERIFY_REMOTE_MLS_V36_OWNER_PREVIEW_NOT_ENABLED',
 'VERIFY_ADMIN_DB_BINDING_AND_BACKUP_ROLLBACK_PLAN',
 'OWNER_AUTHENTICATED_DESKTOP_MOBILE_QA',
 'EXPLICIT_APPROVAL_BEFORE_MERGE_AND_DEPLOY'
]);

function cleanPaths(files){
 if(!Array.isArray(files)||files.some(p=>typeof p!=='string'||p.startsWith('/')||p.includes('..')||!p.trim()))return null;
 return [...new Set(files)];
}
function exactSha(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}

/**
 * Pure verifier for the source and metadata of one frozen, reviewed candidate.
 * It never claims that the remote Cloudflare flag or rollback state was checked.
 */
export function evaluateReleasePreflight({changedPaths,buildHashes,appConfig,adminSource,buildSource,workflowSource}={}){
 const failures=[];
 const paths=cleanPaths(changedPaths);
 if(!paths||paths.length===0)failures.push('RELEASE_DIFF_UNAVAILABLE');
 else{
  const allowed=new Set(RELEASE_ALLOWED_FILES);
  if(paths.some(p=>!allowed.has(p)))failures.push('RELEASE_UNREVIEWED_PATH');
  if(paths.some(p=>/^(workers\/|web\/finance\/|web\/auth\/|web\/cloudflare\/original\/)/.test(p)))
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
  appConfig.vars&&Object.hasOwn(appConfig.vars,'MLS_V36_OWNER_PREVIEW'))
  failures.push('RELEASE_PREVIEW_CONFIG_MUST_BE_ABSENT');
 const ownerGate=typeof adminSource==='string'&&
  /ownerSession\?\.role\s*===\s*'owner'\s*&&\s*env\?\.MLS_V36_OWNER_PREVIEW\s*===\s*'ENABLED'/.test(adminSource)&&
  adminSource.includes('const preview=markupCompatible&&mlsV36OwnerPreviewEnabled(env,ownerSession)')&&
  adminSource.includes('return dashboard(env,current)');
 if(!ownerGate)failures.push('RELEASE_OWNER_GATE_CHANGED');
 if(typeof buildSource!=='string'||!buildSource.includes('listing_factory_view=')||
   !buildSource.includes('approved_design=')||
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
