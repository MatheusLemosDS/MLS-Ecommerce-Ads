import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {validateIsolation,selectPreviewRole,verifyBuildPreviewIdentity,previewBindings,makePreviewSource,prepareBuildPreview,assertPreviewBaseIsolation} from '../isolated_preview.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const manifest=()=>JSON.parse(readFileSync(path.join(root,'previews/isolated-builds.json')));
const clone=v=>JSON.parse(JSON.stringify(v));
function baseEnv(m,role){const c=previewBindings(m,role),env=Object.fromEntries(Object.keys(c.vars).map(k=>[k,{type:'plain_text',text_matches:true}]));for(const name of ['ACCOUNT_ENCRYPTION_KEY','ADMIN_PASSWORD','ADMIN_SESSION_SECRET','APP_INTERNAL_SECRET','FINANCE_ROUTER_SECRET','FINANCE_TOKEN_ENCRYPTION_KEY','REVIEW_PASSWORD','SESSION_SECRET'])env[name]={type:'secret_text'};for(const r of c.d1_databases)env[r.binding]={type:'d1',database_id:r.database_id};for(const r of c.services||[])env[r.binding]={type:'service',service:r.service};return env;}
test('D1 preview refuses production IDs and aliases, and every target has its own expected bindings',()=>{
 const m=manifest();assert.equal(validateIsolation(m),m);
 for(const role of ['app','auth','finance']){
  const b=previewBindings(m,role);assert.ok(b.d1_databases.every(v=>!m.production_database_ids.includes(v.database_id)));
  assert.ok(b.d1_databases.some(v=>v.binding==='ACCOUNT_DB'));
  assert.equal(b.vars.FINANCE_CONNECTION_ENABLED,'false');assert.equal(b.vars.GATEWAY_URL,undefined);
 }
 assert.equal(previewBindings(m,'auth').services[0].service,'brazacommerce-finance-p00-isolated');
 for(const id of m.production_database_ids){const x=clone(m);x.databases.admin.id=id;assert.throws(()=>validateIsolation(x),/PREVIEW_DATABASE_NOT_ISOLATED/);}
 const x=clone(m);x.databases.account.id=x.databases.admin.id;assert.throws(()=>validateIsolation(x));
 const y=clone(m);y.isolated_workers.auth='brazacommerce-auth';assert.throws(()=>validateIsolation(y));
});
test('Workers Builds targets are selected by exact tag and branch, never a generic app fallback',()=>{
 const m=manifest();assert.equal(selectPreviewRole(m,{}),null);
 for(const role of ['app','auth','finance'])assert.equal(selectPreviewRole(m,{WRANGLER_CI_MATCH_TAG:m.parents[role].tag,WORKERS_CI_BRANCH:m.authorized_branches[0]}),role);
 assert.equal(selectPreviewRole(m,{WRANGLER_CI_MATCH_TAG:m.parents.app.tag,WORKERS_CI_BRANCH:'main'}),null);
 for(const branch of ['HEAD','other-branch',''])assert.throws(()=>selectPreviewRole(m,{WRANGLER_CI_MATCH_TAG:m.parents.app.tag,WORKERS_CI_BRANCH:branch}));
 assert.throws(()=>selectPreviewRole(m,{WRANGLER_CI_MATCH_TAG:'0'.repeat(32),WORKERS_CI_BRANCH:m.authorized_branches[0]}));
 assert.throws(()=>selectPreviewRole(m,{WRANGLER_CI_MATCH_TAG:m.parents.app.tag,WORKERS_CI_BRANCH:m.authorized_branches[0],WRANGLER_CI_OVERRIDE_NAME:'brazacommerce-auth'}));
});
test('native CI override accepts the verified ID of the same Worker and rejects cross-Worker identities',()=>{
 const m=manifest();
 for(const role of ['app','auth','finance']){
  for(const identifier of [m.parents[role].name,m.parents[role].tag]){
   assert.equal(selectPreviewRole(m,{WORKERS_CI_BRANCH:m.authorized_branches[0],WRANGLER_CI_MATCH_TAG:m.parents[role].tag,WRANGLER_CI_OVERRIDE_NAME:identifier}),role);
  }
  for(const other of ['app','auth','finance'].filter(r=>r!==role)){
   for(const identifier of [m.parents[other].name,m.parents[other].tag]){
    assert.throws(()=>selectPreviewRole(m,{WORKERS_CI_BRANCH:m.authorized_branches[0],WRANGLER_CI_MATCH_TAG:m.parents[role].tag,WRANGLER_CI_OVERRIDE_NAME:identifier}),/PREVIEW_CI_TARGET_CONFLICT/);
   }
  }
  for(const identifier of [m.isolated_workers[role],'unknown-worker',m.parents[role].tag.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5')]){
   assert.throws(()=>selectPreviewRole(m,{WORKERS_CI_BRANCH:m.authorized_branches[0],WRANGLER_CI_MATCH_TAG:m.parents[role].tag,WRANGLER_CI_OVERRIDE_NAME:identifier}),/PREVIEW_CI_TARGET_MISMATCH_NAME/);
  }
 }
 assert.throws(()=>selectPreviewRole(m,{WORKERS_CI_BRANCH:m.authorized_branches[0],WRANGLER_CI_MATCH_TAG:'0'.repeat(32),WRANGLER_CI_OVERRIDE_NAME:m.parents.app.name}),/PREVIEW_CI_TARGET_MISMATCH_TAG/);
});
test('native CI target is confirmed by GET identity when its tag metadata is not a known legacy tag',()=>{
 const m=manifest();
 for(const role of ['app','auth','finance']){
  for(const identifier of [m.parents[role].name,m.parents[role].tag]){
   const env={WORKERS_CI_BRANCH:m.authorized_branches[0],WRANGLER_CI_MATCH_TAG:'opaque-preview-metadata',WRANGLER_CI_OVERRIDE_NAME:identifier};let calls=0;
   const identity=verifyBuildPreviewIdentity(root,env,{lookup:(account,name)=>{
    calls++;assert.equal(account,m.account_id);assert.equal(name,m.parents[role].name);
    return {id:m.parents[role].tag,name:m.parents[role].name,preview_base_env:baseEnv(m,role)};
   }});
   assert.equal(calls,1);assert.equal(selectPreviewRole(m,env,{verifiedWorker:identity}),role);
   assert.throws(()=>selectPreviewRole(m,env),/PREVIEW_CI_TARGET_MISMATCH_TAG/);
  }
 }
});
test('API identity verification refuses another account or Worker, and does no lookup for forbidden branches/identities',()=>{
 const m=manifest(),env={WORKERS_CI_BRANCH:m.authorized_branches[0],WRANGLER_CI_MATCH_TAG:'opaque-preview-metadata',WRANGLER_CI_OVERRIDE_NAME:m.parents.app.name};let calls=0;
 const lookup=()=>{calls++;return {id:m.parents.auth.tag,name:m.parents.auth.name};};
 assert.throws(()=>verifyBuildPreviewIdentity(root,env,{lookup}),/PREVIEW_API_IDENTITY_MISMATCH/);assert.equal(calls,1);calls=0;
 for(const patch of [{WORKERS_CI_BRANCH:'other'},{CLOUDFLARE_ACCOUNT_ID:'0'.repeat(32)},{WRANGLER_CI_OVERRIDE_NAME:'unknown-worker'},{WRANGLER_CI_MATCH_TAG:m.parents.auth.tag}])assert.throws(()=>verifyBuildPreviewIdentity(root,{...env,...patch},{lookup}));
 assert.equal(calls,0);
 assert.equal(verifyBuildPreviewIdentity(root,{...env,WORKERS_CI_BRANCH:'main'},{lookup}),null);
 assert.equal(verifyBuildPreviewIdentity(root,{}, {lookup}),null);assert.equal(calls,0);
});
test('target errors never expose opaque CI identifiers or supplied credential values',()=>{
 const m=manifest();
 for(const secret of ['other-resource','secret-looking-resource','SECRET_with_unexpected_characters']){
  assert.throws(()=>selectPreviewRole(m,{WORKERS_CI_BRANCH:m.authorized_branches[0],WRANGLER_CI_MATCH_TAG:m.parents.app.tag,WRANGLER_CI_OVERRIDE_NAME:secret,CLOUDFLARE_API_TOKEN:secret}),error=>!error.message.includes(secret)&&error.message.includes('override_present=true'));
 }
});
test('preview derivative denies production/provider fetch, does not follow redirects and exposes no scheduler',async()=>{
 const m=manifest(),calls=[];
 const original=`export default {async fetch(){const a=await fetch('https://app.brazacommerce.com.br/api');const b=await fetch('https://partner.shopeemobile.com/api');return Response.json({a:a.status,b:b.status});},scheduled(){throw Error('PRODUCTION_CRON_MUST_NOT_RUN');}};`;
 const source=makePreviewSource(original,'app',m);assert.ok(!source.includes('https://app.brazacommerce.com.br/api'));
 const context=vm.createContext({Request,Response,Headers,URL,fetch:async r=>{calls.push(r);return new Response(null,{status:302,headers:{location:'https://app.brazacommerce.com.br/private'}});}});
 const script=source.replace('export default {async fetch','globalThis.testWorker={async fetch');new vm.Script(script).runInContext(context);
 const response=await context.testWorker.fetch(new Request('https://preview.invalid/'),{},{});const result=await response.json();
 assert.equal(result.a,302);assert.equal(result.b,403);assert.equal(calls.length,1);assert.equal(calls[0].redirect,'manual');assert.match(calls[0].url,/brazacommerce-app-p00-isolated/);
 assert.equal(context.testWorker.scheduled,undefined);assert.equal(response.headers.get('x-mls-environment'),'p00-isolated');
 assert.equal((await context.testWorker.fetch(new Request('https://preview.invalid/shopee/finance/connect'),{},{})).status,403);
 assert.equal(calls.length,1);
});
test('HTML gets preview notice, restrictive network/form CSP and browser navigation guard',async()=>{
 const source=makePreviewSource(`export default {fetch(){return new Response('<html><head></head><body><h1>Dados</h1></body></html>',{headers:{'content-type':'text/html'}});}};`,'app',manifest());
 const context=vm.createContext({Request,Response,Headers,URL,fetch:async()=>{throw Error('NETWORK_NOT_EXPECTED');}});
 new vm.Script(source.replace('export default {async fetch','globalThis.testWorker={async fetch')).runInContext(context);
 const r=await context.testWorker.fetch(new Request('https://preview.invalid/'),{},{});const html=await r.text();
 assert.match(html,/SOMENTE DADOS SINTÉTICOS/);assert.match(html,/MutationObserver/);assert.match(r.headers.get('content-security-policy'),/form-action 'self'/);assert.ok(!r.headers.get('content-security-policy').includes('brazacommerce.com.br'));
});
test('the pinned Wrangler resolves the generated config redirect to the correct profile for all three Workers',t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'p00-isolated-config-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 for(const sub of ['previews','dist','workers/app','workers/auth','workers/finance'])mkdirSync(path.join(dir,sub),{recursive:true});
 const m=manifest();writeFileSync(path.join(dir,'previews/isolated-builds.json'),JSON.stringify(m));
 for(const role of ['app','auth','finance']){writeFileSync(path.join(dir,'workers',role,'wrangler.json'),readFileSync(path.join(root,'workers',role,'wrangler.json')));writeFileSync(path.join(dir,'workers',role,'commercial-account.json'),readFileSync(path.join(root,'workers',role,'commercial-account.json')));}
 for(const role of ['app','auth','finance']){
  writeFileSync(path.join(dir,'workers',role,'wrangler.json'),readFileSync(path.join(root,'workers',role,'wrangler.json')));
  writeFileSync(path.join(dir,'workers',role,'commercial-account.json'),readFileSync(path.join(root,'workers',role,'commercial-account.json')));
  writeFileSync(path.join(dir,'dist',role+'-worker.mjs'),role==='finance'?`const commercial_finance_worker_default={fetch(){return new Response('ok')}};export { commercial_finance_worker_default as default, };`:`export default {fetch(){return new Response('ok')}};`);
  const result=prepareBuildPreview(dir,{WRANGLER_CI_MATCH_TAG:m.parents[role].tag,WORKERS_CI_BRANCH:m.authorized_branches[0]});
  const script=`const {experimental_readRawConfig}=require(${JSON.stringify(path.join(root,'node_modules/wrangler'))}); const r=experimental_readRawConfig({}, {useRedirectIfAvailable:true}); console.log(JSON.stringify({path:r.configPath,name:r.rawConfig.name,account:r.rawConfig.account_id,noBundle:r.rawConfig.no_bundle,preview:r.rawConfig.previews}));`;
  const child=spawnSync(process.execPath,['-e',script],{cwd:dir,encoding:'utf8'});assert.equal(child.status,0,child.stderr);const out=JSON.parse(child.stdout.trim());
  assert.equal(out.path,result.configPath);assert.equal(out.name,m.parents[role].name);assert.ok(out.preview.d1_databases.every(v=>!m.production_database_ids.includes(v.database_id)));
  assert.equal(out.noBundle,true);
  assert.equal(out.account,m.account_id);
 }
 const redirect=path.join(dir,'.wrangler/deploy/config.json');
 assert.equal(prepareBuildPreview(dir,{}),null);
 assert.equal(existsSync(redirect),false);
 prepareBuildPreview(dir,{WRANGLER_CI_MATCH_TAG:m.parents.app.tag,WORKERS_CI_BRANCH:m.authorized_branches[0]});
 assert.equal(prepareBuildPreview(dir,{WRANGLER_CI_MATCH_TAG:m.parents.app.tag,WORKERS_CI_BRANCH:'main'}),null);
 assert.equal(existsSync(redirect),false);
 writeFileSync(redirect,JSON.stringify({configPath:'unrelated-framework.json'}));
 prepareBuildPreview(dir,{});assert.equal(existsSync(redirect),true);
});

test('finite branch policy accepts reviewed branches and rejects wildcard, production and ambiguous references',()=>{
 const m=manifest();for(const branch of m.authorized_branches)assert.equal(selectPreviewRole(m,{WORKERS_CI:'1',WORKERS_CI_BRANCH:branch,WRANGLER_CI_MATCH_TAG:m.parents.auth.tag}),'auth');
 for(const value of ['*','fix/*','main','feature/../escape','feature//empty','feature/@{0}','feature/name.lock','feature/.hidden','feature/end.','feature/end/']){const bad=clone(m);bad.authorized_branches=[value];assert.throws(()=>validateIsolation(bad),/PREVIEW_BRANCH_POLICY_INVALID/);}
 for(const extra of [[],Array(51).fill('fix/repeat'),['fix/repeat','fix/repeat']])assert.throws(()=>validateIsolation({...clone(m),authorized_branches:extra}),/PREVIEW_BRANCH_POLICY_INVALID/);
 assert.throws(()=>selectPreviewRole(m,{WORKERS_CI:'1',WORKERS_CI_BRANCH:m.authorized_branches[0]}),/PREVIEW_CI_TARGET_MISSING/);
});

test('preview partial build mismatch and a foreign config redirect fail without overwriting config',t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'preview-refusal-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 mkdirSync(path.join(dir,'previews'),{recursive:true});writeFileSync(path.join(dir,'previews/isolated-builds.json'),JSON.stringify(manifest()));
 for(const role of ['app','auth','finance']){mkdirSync(path.join(dir,'workers',role),{recursive:true});for(const file of ['wrangler.json','commercial-account.json'])writeFileSync(path.join(dir,'workers',role,file),readFileSync(path.join(root,'workers',role,file)));}
 const m=manifest(),env={WORKERS_CI:'1',WORKERS_CI_BRANCH:m.authorized_branches[0],WRANGLER_CI_MATCH_TAG:m.parents.finance.tag};
 assert.throws(()=>prepareBuildPreview(dir,env,{builtTargets:['app']}),/PREVIEW_BUILD_TARGET_MISMATCH/);assert.equal(existsSync(path.join(dir,'dist')),false);
 const redirect=path.join(dir,'.wrangler/deploy/config.json');mkdirSync(path.dirname(redirect),{recursive:true});const original=JSON.stringify({configPath:'unrelated-framework.json'});writeFileSync(redirect,original);
 assert.throws(()=>prepareBuildPreview(dir,env),/PREVIEW_FOREIGN_REDIRECT_PRESENT/);assert.equal(readFileSync(redirect,'utf8'),original);
 const changed=JSON.parse(readFileSync(path.join(dir,'workers/app/wrangler.json')));changed.d1_databases[0].database_id=m.databases.admin.id;writeFileSync(path.join(dir,'workers/app/wrangler.json'),JSON.stringify(changed));
 assert.throws(()=>verifyBuildPreviewIdentity(dir,env,{lookup:()=>assert.fail('identity lookup must not run before local isolation check')}),/PREVIEW_PRODUCTION_RESOURCES_CHANGED/);
});

test('production deploys in Workers CI require the protected branch, exact target and native identity; local flow is unchanged',async()=>{
 const {assertProductionDeploymentContext}=await import('../isolated_preview.mjs'),m=manifest(),base={WORKERS_CI:'1',WORKERS_CI_BRANCH:m.production_branch,WRANGLER_CI_MATCH_TAG:m.parents.app.tag};let calls=0;
 const lookup=(account,name)=>{calls++;assert.equal(account,m.account_id);assert.equal(name,m.parents.app.name);return {id:m.parents.app.tag,name};};
 assert.equal(assertProductionDeploymentContext('app',root,{}, {lookup}),null);assert.equal(calls,0);
 for(const patch of [{WORKERS_CI_BRANCH:m.authorized_branches[0]},{WORKERS_CI_BRANCH:'unreviewed'},{WORKERS_CI_BRANCH:''},{WORKERS_CI:''},{WRANGLER_CI_MATCH_TAG:''},{CLOUDFLARE_ACCOUNT_ID:'0'.repeat(32)}])assert.throws(()=>assertProductionDeploymentContext('app',root,{...base,...patch},{lookup}));
 assert.equal(calls,0);assert.throws(()=>assertProductionDeploymentContext('finance',root,base,{lookup}),/WORKER_CI_DEPLOY_TARGET_MISMATCH/);assert.equal(calls,0);
 assert.equal(assertProductionDeploymentContext('app',root,base,{lookup}).id,m.parents.app.tag);assert.equal(calls,1);
 assert.throws(()=>assertProductionDeploymentContext('app',root,base,{lookup:()=>({id:m.parents.auth.tag,name:m.parents.auth.name})}),/PREVIEW_API_IDENTITY_MISMATCH/);
});

test('project deployment CLI refuses a preview branch before build, upload or credential access',()=>{
 const m=manifest(),child=spawnSync(process.execPath,['tools/worker_deploy.mjs','deploy','app'],{cwd:root,encoding:'utf8',env:{...process.env,WORKERS_CI:'1',WORKERS_CI_BRANCH:m.authorized_branches[0],WRANGLER_CI_MATCH_TAG:m.parents.app.tag,CLOUDFLARE_API_TOKEN:'SYNTHETIC_DO_NOT_USE'}});
 assert.equal(child.status,1);assert.equal(child.stderr.trim(),'WORKER_PREVIEW_PRODUCTION_DEPLOY_REFUSED');assert.equal(child.stdout,'');assert.ok(!child.stderr.includes('SYNTHETIC_DO_NOT_USE'));
});

test('Preview Base inventory must contain only masked QA secrets, known safe vars and isolated bindings',()=>{
 const m=manifest();for(const role of ['app','auth','finance']){
  const env=baseEnv(m,role);assert.equal(assertPreviewBaseIsolation(m,role,env),true);
  for(const mutate of [v=>v.GATEWAY_TOKEN={type:'secret_text'},v=>v.FINANCE_CONNECTION_ENABLED.text_matches=false,v=>v.ADMIN_PASSWORD={type:'plain_text',text_matches:true},v=>delete v.SESSION_SECRET,v=>v.ACCOUNT_DB.database_id=m.production_database_ids[0]]){const bad=clone(env);mutate(bad);assert.throws(()=>assertPreviewBaseIsolation(m,role,bad),/PREVIEW_BASE_CONFIGURATION_UNSAFE/);}
  if(role==='auth'){const bad=clone(env);bad.SHOPEE_FINANCE_SERVICE.service='brazacommerce-finance';assert.throws(()=>assertPreviewBaseIsolation(m,role,bad),/PREVIEW_BASE_CONFIGURATION_UNSAFE/);}
 }
});
