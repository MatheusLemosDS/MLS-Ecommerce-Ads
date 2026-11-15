import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {validateIsolation,selectPreviewRole,previewBindings,makePreviewSource,prepareBuildPreview} from '../isolated_preview.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const manifest=()=>JSON.parse(readFileSync(path.join(root,'previews/p00-isolation.json')));
const clone=v=>JSON.parse(JSON.stringify(v));
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
 for(const role of ['app','auth','finance'])assert.equal(selectPreviewRole(m,{WRANGLER_CI_MATCH_TAG:m.parents[role].tag,WORKERS_CI_BRANCH:m.branch}),role);
 assert.equal(selectPreviewRole(m,{WRANGLER_CI_MATCH_TAG:m.parents.app.tag,WORKERS_CI_BRANCH:'main'}),null);
 for(const branch of ['HEAD','other-branch',''])assert.throws(()=>selectPreviewRole(m,{WRANGLER_CI_MATCH_TAG:m.parents.app.tag,WORKERS_CI_BRANCH:branch}));
 assert.throws(()=>selectPreviewRole(m,{WRANGLER_CI_MATCH_TAG:'0'.repeat(32),WORKERS_CI_BRANCH:m.branch}));
 assert.throws(()=>selectPreviewRole(m,{WRANGLER_CI_MATCH_TAG:m.parents.app.tag,WORKERS_CI_BRANCH:m.branch,WRANGLER_CI_OVERRIDE_NAME:'brazacommerce-auth'}));
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
 const m=manifest();writeFileSync(path.join(dir,'previews/p00-isolation.json'),JSON.stringify(m));
 for(const role of ['app','auth','finance']){
  writeFileSync(path.join(dir,'workers',role,'wrangler.json'),JSON.stringify({compatibility_date:'2026-10-06'}));
  writeFileSync(path.join(dir,'dist',role+'-worker.mjs'),role==='finance'?`const commercial_finance_worker_default={fetch(){return new Response('ok')}};export { commercial_finance_worker_default as default, };`:`export default {fetch(){return new Response('ok')}};`);
  const result=prepareBuildPreview(dir,{WRANGLER_CI_MATCH_TAG:m.parents[role].tag,WORKERS_CI_BRANCH:m.branch});
  const script=`const {experimental_readRawConfig}=require(${JSON.stringify(path.join(root,'node_modules/wrangler'))}); const r=experimental_readRawConfig({}, {useRedirectIfAvailable:true}); console.log(JSON.stringify({path:r.configPath,name:r.rawConfig.name,noBundle:r.rawConfig.no_bundle,preview:r.rawConfig.previews}));`;
  const child=spawnSync(process.execPath,['-e',script],{cwd:dir,encoding:'utf8'});assert.equal(child.status,0,child.stderr);const out=JSON.parse(child.stdout.trim());
  assert.equal(out.path,result.configPath);assert.equal(out.name,m.parents[role].name);assert.ok(out.preview.d1_databases.every(v=>!m.production_database_ids.includes(v.database_id)));
  assert.equal(out.noBundle,true);
 }
 const redirect=path.join(dir,'.wrangler/deploy/config.json');
 assert.equal(prepareBuildPreview(dir,{WRANGLER_CI_MATCH_TAG:m.parents.app.tag,WORKERS_CI_BRANCH:'main'}),null);
 assert.equal(existsSync(redirect),false);
 writeFileSync(redirect,JSON.stringify({configPath:'unrelated-framework.json'}));
 prepareBuildPreview(dir,{});assert.equal(existsSync(redirect),true);
});
