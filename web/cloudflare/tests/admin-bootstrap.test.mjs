import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {adminFetch} from '../src/admin.mjs';
import {readOwnerSession} from '../src/unified-auth.mjs';
import {D1} from './sqlite-d1.mjs';

const origin='https://admin-bootstrap.test';
const fixture=()=>({ADMIN_USERNAME:'bootstrap-owner',ADMIN_PASSWORD:'bootstrap-fixture-password-only',ADMIN_SESSION_SECRET:'bootstrap-session-fixture-'+'s'.repeat(40),REVIEW_USERNAME:'bootstrap-review',REVIEW_PASSWORD:'bootstrap-review-password-only',SESSION_SECRET:'bootstrap-review-session-'+'r'.repeat(40)});
const request=(cookie,path='/api/admin/bootstrap',method='GET')=>new Request(origin+path,{method,headers:cookie?{cookie}:{}});
async function login(env,role='owner'){
 const response=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:role==='owner'?env.ADMIN_USERNAME:env.REVIEW_USERNAME,password:role==='owner'?env.ADMIN_PASSWORD:env.REVIEW_PASSWORD})}),env);
 assert.equal(response.status,303);return response.headers.getSetCookie().find(value=>value.includes('Max-Age=28800')).split(';')[0];
}
function signed(env,patch={}){
 const data={role:'admin',user:'admin',exp:Math.floor(Date.now()/1000)+60,nonce:'11111111-1111-4111-8111-111111111111',...patch},payload=Buffer.from(JSON.stringify(data)).toString('base64url');
 return 'braza_admin='+payload+'.'+createHmac('sha256',env.ADMIN_SESSION_SECRET).update('admin:'+payload).digest('hex');
}
async function assertBootstrap(response,csrf){
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('content-type'),'application/json; charset=utf-8');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.has('set-cookie'),false);assert.equal(response.headers.has('access-control-allow-origin'),false);
 const value=await response.json();assert.deepEqual(Object.keys(value),['schema','csrf']);assert.equal(value.schema,'admin_bootstrap_v1');assert.match(value.csrf,/^[a-f0-9]{64}$/);if(csrf!==undefined)assert.equal(value.csrf,csrf);return value;
}

test('owner bootstrap confirms only the existing signed session with no database binding or stored configuration',async()=>{
 const env=fixture(),cookie=await login(env),current=await readOwnerSession(request(cookie),env);
 const value=await assertBootstrap(await adminFetch(request(cookie),env),current.csrf);
 const body=JSON.stringify(value);for(const secret of [env.ADMIN_SESSION_SECRET,env.ADMIN_PASSWORD,env.SESSION_SECRET,cookie])assert.ok(!body.includes(secret));
});

test('bootstrap never reads storage or calls provider services when the database would fail or never settle',{timeout:5000},async()=>{
 for(const mode of ['throw','never']){
  const env=fixture(),cookie=await login(env),calls={prepare:0,batch:0,provider:0},never=new Promise(()=>{});
  const unavailable=()=>{if(mode==='throw')throw new Error('PRIVATE_DATABASE_DETAIL');return never;};
  env.ADMIN_DB={prepare(){calls.prepare++;return unavailable();},batch(){calls.batch++;return unavailable();}};
  await assertBootstrap(await adminFetch(request(cookie),env,{getFinanceBusinessPeriod(){calls.provider++;throw new Error('PRIVATE_PROVIDER_DETAIL');},getAdsSummary(){calls.provider++;throw new Error('PRIVATE_PROVIDER_DETAIL');}}));
  assert.deepEqual(calls,{prepare:0,batch:0,provider:0});
 }
 const env=fixture(),cookie=await login(env);let accesses=0;
 Object.defineProperty(env,'ADMIN_DB',{get(){accesses++;throw new Error('PRIVATE_STORAGE_GETTER');}});
 await assertBootstrap(await adminFetch(request(cookie),env));assert.equal(accesses,0);
});

test('bootstrap bypasses a pending legacy setup on the same binding instead of waiting on its cached promise',{timeout:5000},async()=>{
 const env=fixture(),cookie=await login(env);let started;const setupStarted=new Promise(resolve=>{started=resolve;}),never=new Promise(()=>{}),calls={prepare:0,batch:0};
 const statement={bind(){return this;},first(){return never;},all(){return never;},run(){return never;}};
 env.ADMIN_DB={prepare(){calls.prepare++;return statement;},batch(){calls.batch++;started();return never;}};
 const legacy=adminFetch(request(cookie,'/api/admin/state'),env);let legacySettled=false;void legacy.then(()=>{legacySettled=true;});
 await setupStarted;const before={...calls};await assertBootstrap(await adminFetch(request(cookie),env));assert.deepEqual(calls,before);assert.equal(legacySettled,false);
});

test('anonymous, review, expired, duplicate and tampered sessions cannot bootstrap or reach storage',async()=>{
 const env=fixture(),owner=await login(env),review=await login(env,'review');let queries=0;
 env.ADMIN_DB={prepare(){queries++;throw new Error('PRIVATE_DATABASE_DETAIL');},batch(){queries++;throw new Error('PRIVATE_DATABASE_DETAIL');}};
 const changed=owner.slice(0,-1)+(owner.endsWith('0')?'1':'0');
 for(const cookie of [null,review,review.replace('mls_session=','braza_admin='),signed(env,{exp:Math.floor(Date.now()/1000)-1}),owner+'; '+owner,changed,signed(env,{role:'review'}),signed(env,{user:'someone-else'}),'braza_admin=invalid']){
  const response=await adminFetch(request(cookie),env);assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.has('set-cookie'),false);assert.deepEqual(await response.json(),{error:'UNAUTHORIZED'});
 }
 assert.equal(queries,0);
 const missing=await adminFetch(request(owner),{...env,ADMIN_SESSION_SECRET:''});assert.equal(missing.status,503);assert.deepEqual(await missing.json(),{error:'ADMIN_SESSION_SETUP_REQUIRED'});assert.equal(queries,0);
});

test('bootstrap accepts only GET with no query and cannot use a request body to mutate state',async()=>{
 const env=fixture(),cookie=await login(env);let queries=0;env.ADMIN_DB={prepare(){queries++;throw new Error('PRIVATE_DATABASE_DETAIL');},batch(){queries++;throw new Error('PRIVATE_DATABASE_DETAIL');}};
 for(const method of ['POST','PUT','PATCH','DELETE','HEAD','OPTIONS']){
  const response=await adminFetch(request(cookie,'/api/admin/bootstrap',method),env);assert.equal(response.status,405);assert.deepEqual(await response.json(),{error:'METHOD_NOT_ALLOWED'});assert.equal(response.headers.has('set-cookie'),false);
 }
 for(const suffix of ['?month=2026-10','?role=owner','?csrf=x','?x=1&x=2']){
  const response=await adminFetch(request(cookie,'/api/admin/bootstrap'+suffix),env);assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'ADMIN_BOOTSTRAP_REQUEST_INVALID'});
 }
 assert.equal(queries,0);
});

test('bootstrap has no storage side effects and preserves the CSRF and complete legacy state contract',async()=>{
 const env={...fixture(),ADMIN_DB:new D1()},cookie=await login(env);
 try{
  const initialChanges=env.ADMIN_DB.db.prepare('SELECT total_changes() AS n').get().n;
  const boot=await assertBootstrap(await adminFetch(request(cookie),env));assert.equal(env.ADMIN_DB.db.prepare('SELECT total_changes() AS n').get().n,initialChanges);assert.equal(env.ADMIN_DB.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n,0);
  const legacy=await adminFetch(request(cookie,'/api/admin/state'),env);assert.equal(legacy.status,200);const state=await legacy.json();assert.deepEqual(Object.keys(state),['settings','csrf','hermes_connected','hermes_finance_ready','budget','ads_execution']);assert.equal(state.csrf,boot.csrf);assert.equal(state.ads_execution,'LOCKED');assert.ok(state.settings.revision>=1);
  const before=env.ADMIN_DB.db.prepare('SELECT total_changes() AS n').get().n;await assertBootstrap(await adminFetch(request(cookie),env),state.csrf);assert.equal(env.ADMIN_DB.db.prepare('SELECT total_changes() AS n').get().n,before);
 }finally{env.ADMIN_DB.db.close();}
});
