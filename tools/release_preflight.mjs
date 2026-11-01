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

// Explicitly frozen release inputs. Adding a path or changing a digest is a
// reviewable candidate update, never a wildcard or a bypass of this verifier.
const approvedCandidate=JSON.parse(fs.readFileSync(new URL('./release-approved-candidate.json',import.meta.url),'utf8'));
const validFlags=approvedCandidate?.expected_live_flags;
if(approvedCandidate?.schema!=='mls_release_candidate_v1'||
 !/^[a-f0-9]{40}$/.test(approvedCandidate.base_commit||'')||
 !/^[a-f0-9]{40}$/.test(approvedCandidate.prepared_source_commit||'')||
 approvedCandidate.commercial_writes_allowed!==false||
 approvedCandidate.owner_authorization!=='OWNER_REQUESTED_ALL_PREPARED_IMPROVEMENTS_LIVE_2026_10_30'||
 !approvedCandidate.expected_hashes||Object.keys(approvedCandidate.expected_hashes).sort().join(',')!=='app,auth,finance'||
 !Object.values(approvedCandidate.expected_hashes).every(value=>/^[a-f0-9]{64}$/.test(value))||
 !validFlags||Object.keys(validFlags).sort().join(',')!=='MLS_AI_SALES_OWNER_PREVIEW,MLS_V36_OWNER_PREVIEW'||
 !Object.values(validFlags).every(value=>value==='ENABLED')||
 !Array.isArray(approvedCandidate.allowed_files)||approvedCandidate.allowed_files.length===0||
 new Set(approvedCandidate.allowed_files).size!==approvedCandidate.allowed_files.length||
 approvedCandidate.allowed_files.some(value=>typeof value!=='string'||!value.trim()||value.startsWith('/')||value.includes('..')||/[?*\\]/.test(value)))
 throw Error('RELEASE_CANDIDATE_MANIFEST_INVALID');
export const RELEASE_BASE_COMMIT=approvedCandidate.base_commit;
export const RELEASE_EXPECTED_SHA=Object.freeze({...approvedCandidate.expected_hashes});
export const RELEASE_EXPECTED_LIVE_FLAGS=Object.freeze({...validFlags});
export const RELEASE_ALLOWED_FILES=Object.freeze([...approvedCandidate.allowed_files]);
// This documentation audit preserves the exact PR96 Worker hashes. Only the
// listed documentation and candidate metadata are authorized; no Worker source,
// protected Finance/Auth code or deployment configuration may change.
export const RELEASE_APPROVED_PROTECTED_FILES=Object.freeze([]);


export const RELEASE_MANUAL_GATES=Object.freeze([
 'CHECK_CLOUDFLARE_LIVE_APP_VERSION_AND_BUILD_TRIGGERS',
 'VERIFY_REMOTE_OWNER_FLAGS_MATCH_APPROVED_VALUES',
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
