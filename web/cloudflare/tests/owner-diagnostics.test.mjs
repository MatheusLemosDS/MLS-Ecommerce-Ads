import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {adminFetch} from '../src/admin.mjs';
import {adminBody} from '../src/admin-view.mjs';

const origin='https://owner-diagnostics.fixture.test';
const baseEnv=()=>({
 ADMIN_USERNAME:'owner-test',ADMIN_PASSWORD:'PRIVATE_LOGIN_TEST_123456',
 ADMIN_SESSION_SECRET:'PRIVATE_OWNER_SESSION_'+ 's'.repeat(40),
 REVIEW_USERNAME:'review-test',REVIEW_PASSWORD:'PRIVATE_REVIEW_TEST_123456',
 SESSION_SECRET:'PRIVATE_REVIEW_SESSION_'+ 'r'.repeat(40)
});
const req=(path,cookie,init={})=>new Request(origin+path,{...init,headers:{...(cookie?{cookie}:{}),...init.headers}});
async function login(worker,env,{review=false}={}){
 const response=await worker.fetch(req('/login',null,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({username:review?env.REVIEW_USERNAME:env.ADMIN_USERNAME,password:review?env.REVIEW_PASSWORD:env.ADMIN_PASSWORD})}),env);
 assert.equal(response.status,303);return response.headers.get('set-cookie').split(';')[0];
}
const worker={fetch:adminFetch};

test('owner diagnostics page is authenticated, independent from D1 setup and has an always-visible recovery link',async()=>{
 let reads=0,batches=0;
 const env={...baseEnv(),ADMIN_DB:{prepare(){reads++;throw Error('PRIVATE_D1_FAILURE');},batch(){batches++;throw Error('PRIVATE_D1_FAILURE');}}};
 const cookie=await login(worker,env);
 const anonymous=await worker.fetch(req('/admin/diagnostics'),env);
 assert.equal(anonymous.status,303);assert.equal(new URL(anonymous.headers.get('location'),origin).pathname,'/login');
 const response=await worker.fetch(req('/admin/diagnostics',cookie),env);
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const html=await response.text();
 for(const text of ['Diagnóstico seguro do painel','id="mlsDiagOutput"','id="mlsDiagRetry"','id="mlsDiagCopy"','/api/admin/diagnostics','/api/admin/finance/business-month-view'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes(env.ADMIN_PASSWORD));
 assert.ok(!html.includes(env.ADMIN_SESSION_SECRET));
 assert.equal(reads,0);assert.equal(batches,0);
 assert.match(adminBody(),/id="startupDiagnostics"[^>]*href="\/admin\/diagnostics"/);
 assert.equal((await worker.fetch(req('/admin/diagnostics?debug=1',cookie),env)).status,400);
 assert.equal((await worker.fetch(req('/admin/diagnostics',cookie,{method:'POST'}),env)).status,405);
});

test('read-only diagnostic probe returns only an owner-scoped status and never invokes setup, schema writes or provider calls',async()=>{
 let reads=[],writes=0;
 const env={...baseEnv(),ADMIN_DB:{prepare(sql){reads.push(sql);return {first:async()=>({ok:1})};},async batch(){writes++;throw Error('UNEXPECTED_WRITE');}}};
 const cookie=await login(worker,env);
 const response=await worker.fetch(req('/api/admin/diagnostics',cookie),env);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(response.headers.get('access-control-allow-origin'),null);
 const diagnostic=await response.json();
 assert.deepEqual(Object.keys(diagnostic).sort(),['d1_probe','duration_ms','owner_session','release','schema']);
 assert.equal(diagnostic.schema,'mls_owner_diagnostic_v1');
 assert.equal(diagnostic.owner_session,'VALID');
 assert.equal(diagnostic.d1_probe,'READY');
 assert.ok(Number.isInteger(diagnostic.duration_ms)&&diagnostic.duration_ms>=0);
 assert.deepEqual(reads,['SELECT 1 AS ok']);
 assert.equal(writes,0);
 assert.equal((await worker.fetch(req('/api/admin/diagnostics?raw=1',cookie),env)).status,400);
 assert.equal((await worker.fetch(req('/api/admin/diagnostics',cookie,{method:'POST'}),env)).status,405);
 assert.deepEqual(reads,['SELECT 1 AS ok']);
 assert.equal((await worker.fetch(req('/api/admin/diagnostics'),env)).status,401);
});

test('diagnostics distinguish missing D1 and query failures without leaking private SQL, credentials or balances',async()=>{
 const env=baseEnv(),cookie=await login(worker,env);
 const missing=await(await worker.fetch(req('/api/admin/diagnostics',cookie),env)).json();
 assert.equal(missing.d1_probe,'BINDING_MISSING');
 const invalid={...env,ADMIN_DB:{prepare(){return {first:async()=>({ok:0})};}}};
 assert.equal((await(await worker.fetch(req('/api/admin/diagnostics',cookie),invalid)).json()).d1_probe,'INVALID_RESULT');
 const failed={...env,ADMIN_DB:{prepare(){return {first:async()=>{throw Error('PRIVATE_SQL_SECRET_SHOP_ORDERS');}};}}};
 const response=await worker.fetch(req('/api/admin/diagnostics',cookie),failed),body=await response.text();
 assert.equal(JSON.parse(body).d1_probe,'QUERY_FAILED');
 for(const sensitive of ['PRIVATE_SQL','SHOP_ORDERS',env.ADMIN_PASSWORD,env.ADMIN_SESSION_SECRET])assert.ok(!body.includes(sensitive));
});

test('review access and invalid owner sessions cannot reach diagnostics or D1',async()=>{
 let queries=0;const env={...baseEnv(),ADMIN_DB:{prepare(){queries++;throw Error('DENIED_QUERY');},batch(){queries++;throw Error('DENIED_BATCH');}}};
 const review=await login(worker,env,{review:true});
 assert.equal((await worker.fetch(req('/api/admin/diagnostics',review),env)).status,401);
 assert.equal((await worker.fetch(req('/admin/diagnostics',review),env)).status,303);
 assert.equal((await worker.fetch(req('/api/admin/diagnostics','braza_admin=forged'),env)).status,401);
 assert.equal(queries,0);
});

test('compiled App keeps independent owner diagnostics behind the exact session and exposes no financial values',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],
  bundle:true,write:false,platform:'browser',format:'esm',target:'es2022'});
 const output=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const work=output.default,env={...baseEnv(),ADMIN_DB:{prepare(sql){assert.equal(sql,'SELECT 1 AS ok');return {first:async()=>({ok:1})};},batch(){throw Error('NO_WRITES');}}};
 const cookie=await login(work,env);
 const page=await work.fetch(req('/admin/diagnostics',cookie),env);
 assert.equal(page.status,200);assert.match(await page.text(),/Verificando consulta financeira salva/);
 const result=await(await work.fetch(req('/api/admin/diagnostics',cookie),env)).json();
 assert.equal(result.d1_probe,'READY');
});
