import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch} from '../src/admin.mjs';
import {cashRead,cashPreview,cashWorkspace,cashPreviewFrame} from '../../finance/tests/external-cash-fixture.mjs';

const origin='https://external-cash-owner.test',path='/api/admin/finance/external-cash';
const fixture=()=>({ADMIN_USERNAME:'synthetic-owner',ADMIN_PASSWORD:'synthetic-owner-password',ADMIN_SESSION_SECRET:'synthetic-owner-session-'+'s'.repeat(40),APP_INTERNAL_SECRET:'synthetic-app-secret-'+'a'.repeat(40)});
async function session(env){
 const login=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0],bootstrap=await adminFetch(new Request(origin+'/api/admin/bootstrap',{headers:{cookie}}),env);assert.equal(bootstrap.status,200);return {cookie,csrf:(await bootstrap.json()).csrf};
}

test('owner bootstrap and cash route bypass legacy setup and provider collection',async()=>{
 const env=fixture();let storage=0,fetches=0;Object.defineProperty(env,'ADMIN_DB',{get(){storage++;throw Error('private legacy DB');}});const saved=globalThis.fetch;
 try{
  globalThis.fetch=async request=>{fetches++;assert.equal(request.url,'https://auth.brazacommerce.com.br/internal/finance/external-cash-v1');assert.deepEqual(await request.json(),cashRead());return Response.json(cashWorkspace());};
  const {cookie}=await session(env);assert.equal(fetches,0);assert.equal(storage,0);const response=await adminFetch(new Request(origin+path+'?month=2026-11',{headers:{cookie}}),env,{getFinanceBusinessPeriod(){throw Error('unexpected pipeline');}});assert.equal(response.status,200);assert.deepEqual(await response.json(),cashWorkspace());assert.equal(fetches,1);assert.equal(storage,0);
 }finally{globalThis.fetch=saved;}
});

test('anonymous/review and wrong Origin/CSRF cannot read the cash mutation body or contact Auth',async()=>{
 const env=fixture(),{cookie,csrf}=await session(env),saved=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=()=>{calls++;throw Error('unexpected Auth');};
  for(const supplied of ['', 'mls_session=synthetic-review'])assert.equal((await adminFetch(new Request(origin+path+'?month=2026-11',{headers:{cookie:supplied}}),env)).status,401);
  for(const headers of [{origin:'https://other.invalid','x-csrf-token':csrf},{origin},{origin,'x-csrf-token':'invalid'}]){
   const request=new Request(origin+path,{method:'POST',headers:{cookie,'content-type':'application/json',...headers},body:JSON.stringify(cashPreview())});assert.equal((await adminFetch(request,env)).status,403);assert.equal(request.bodyUsed,false);
  }
  assert.equal(calls,0);
 }finally{globalThis.fetch=saved;}
});

test('owner route requires a closed GET selection and explicitly mutating POST operation',async()=>{
 const env=fixture(),{cookie,csrf}=await session(env),saved=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async request=>{calls++;assert.deepEqual(await request.json(),cashPreview());return Response.json(cashPreviewFrame());};
  for(const query of ['', '?month=2026-11&shop_id=99','?month=2026-11&month=2026-11','?month=2026-11&limit=101','?month=2026-11&limit=0','?month=2026-13'])assert.equal((await adminFetch(new Request(origin+path+query,{headers:{cookie}}),env)).status,400);
  const post=(body,query='')=>adminFetch(new Request(origin+path+query,{method:'POST',headers:{cookie,origin,'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)}),env);
  for(const body of [cashRead(),{...cashPreview(),actor:'OWNER'},{...cashPreview(),shop_id:99}])assert.equal((await post(body)).status,400);
  assert.equal((await post(cashPreview(),'?month=2026-11')).status,400);assert.equal(calls,0);
  const accepted=await post(cashPreview());assert.equal(accepted.status,200);assert.deepEqual(await accepted.json(),cashPreviewFrame());assert.equal(calls,1);
 }finally{globalThis.fetch=saved;}
});
