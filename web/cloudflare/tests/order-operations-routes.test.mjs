import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch} from '../src/admin.mjs';
import {D1} from './sqlite-d1.mjs';

const origin='https://order-operations-owner.test',path='/api/admin/order-operations';
const selected='?start_date=2026-11-01&end_date=2026-11-11&status=ALL&page=1';
async function fixture(){
 const env={ADMIN_USERNAME:'synthetic-owner',ADMIN_PASSWORD:'synthetic-owner-password',ADMIN_SESSION_SECRET:'synthetic-owner-session-'+'s'.repeat(40),ADMIN_DB:new D1()};
 const login=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
 const bootstrap=await adminFetch(new Request(origin+'/api/admin/bootstrap',{headers:{cookie}}),env);assert.equal(bootstrap.status,200);
 return {env,cookie,csrf:(await bootstrap.json()).csrf};
}
const schema=db=>db.db.prepare("SELECT name,sql FROM sqlite_master ORDER BY type,name").all();

test('order operation reads preserve a cold database and do not contact a provider',async()=>{
 const auth=await fixture(),before=schema(auth.env.ADMIN_DB),saved=globalThis.fetch;
 try{
  globalThis.fetch=()=>{throw Error('Unexpected provider request');};
  const response=await adminFetch(new Request(origin+path+selected,{headers:{cookie:auth.cookie}}),auth.env);
  assert.equal(response.status,200);const value=await response.json();
  assert.equal(value.schema,'order_operations_workspace_v1');assert.equal(value.coverage.state,'NOT_CAPTURED');
  assert.equal(value.coverage.period_complete,false);assert.deepEqual(value.orders,[]);assert.deepEqual(schema(auth.env.ADMIN_DB),before);
 }finally{globalThis.fetch=saved;auth.env.ADMIN_DB.db.close();}
});

test('operation mutations require owner session, Origin and CSRF before reading the body',async()=>{
 const auth=await fixture(),before=schema(auth.env.ADMIN_DB);
 try{
  for(const cookie of ['', 'mls_session=synthetic-review']){
   const request=new Request(origin+path,{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:'{"private":"unread"}'});
   assert.equal((await adminFetch(request,auth.env)).status,401);assert.equal(request.bodyUsed,false);
  }
  for(const headers of [{origin:'https://other.invalid','x-csrf-token':auth.csrf},{origin},{origin,'x-csrf-token':'invalid'}]){
   const request=new Request(origin+path,{method:'POST',headers:{cookie:auth.cookie,'content-type':'application/json',...headers},body:'{"private":"unread"}'});
   assert.equal((await adminFetch(request,auth.env)).status,403);assert.equal(request.bodyUsed,false);
  }
  assert.deepEqual(schema(auth.env.ADMIN_DB),before);
 }finally{auth.env.ADMIN_DB.db.close();}
});

test('operation selection rejects repeated, missing and foreign scope before a database read',async()=>{
 const auth=await fixture(),db=auth.env.ADMIN_DB;
 try{
  Object.defineProperty(auth.env,'ADMIN_DB',{get(){throw Error('Storage must remain untouched');}});
  for(const query of ['',selected+'&shop_id=99',selected+'&page=2',selected.replace('&status=ALL','')]){
   const response=await adminFetch(new Request(origin+path+query,{headers:{cookie:auth.cookie}}),auth.env);
   assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'ORDER_OPERATIONS_REQUEST_INVALID'});
  }
  const response=await adminFetch(new Request(origin+path+selected,{method:'POST',headers:{cookie:auth.cookie,origin,'x-csrf-token':auth.csrf,'content-type':'application/json'},body:'{}'}),auth.env);
  assert.equal(response.status,400);
  assert.equal((await adminFetch(new Request(origin+path,{method:'PUT',headers:{cookie:auth.cookie}}),auth.env)).status,405);
 }finally{db.db.close();}
});

test('owner markup exposes the operation route alongside the preserved six agents',async()=>{
 const auth=await fixture();
 try{
  const response=await adminFetch(new Request(origin+'/admin?tab=order-operations',{headers:{cookie:auth.cookie}}),auth.env);
  assert.equal(response.status,200);const html=await response.text();
  assert.match(html,/data-tab="order-operations"/);assert.match(html,/id="order-operations"/);
  const agents=[...html.matchAll(/class="agent-card"[^>]*data-mission-open="agent-([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(agents,['hermes','finance','ads','products','production','returns']);
 }finally{auth.env.ADMIN_DB.db.close();}
});
