import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch,scheduledWork} from '../src/admin.mjs';
import {commercialRouteCapabilities} from '../src/commercial-route-policy.mjs';
import {D1} from './sqlite-d1.mjs';

const origin='https://financial-automation.synthetic.test';
async function login(){
 const env={ADMIN_DB:new D1(),ADMIN_USERNAME:'synthetic-finance-owner',ADMIN_PASSWORD:'synthetic-finance-password',ADMIN_SESSION_SECRET:'synthetic-finance-session-'+ 's'.repeat(40),APP_INTERNAL_SECRET:'synthetic-app-'+ 'a'.repeat(40)};
 const response=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(response.status,303);
 const cookie=response.headers.get('set-cookie').split(';')[0],bootstrap=await adminFetch(new Request(origin+'/api/admin/bootstrap',{headers:{cookie}}),env);assert.equal(bootstrap.status,200);return {env,cookie,csrf:(await bootstrap.json()).csrf};
}
test('financial automation owner route reaches the versioned cold read without provider collection or false balances',async()=>{
 const auth=await login(),saved=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=()=>{calls++;throw Error('unexpected provider or private collection');};
  const response=await adminFetch(new Request(origin+'/api/admin/finance/automation?month=2026-10',{headers:{cookie:auth.cookie}}),auth.env);
  assert.equal(response.status,200);const value=await response.json();assert.equal(value.schema,'financial_automation_workspace_v1');assert.equal(value.scope.organization_id,'legacy-brazacommerce');assert.equal(value.projection.result.amount_cents,null);assert.equal(value.projection.positions.bank.amount_cents,null);assert.equal(value.projection.close_readiness.ACCRUAL.ready,false);assert.equal(calls,0);
  const tables=auth.env.ADMIN_DB.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'financial_%'").all();assert.deepEqual(tables,[]);
 }finally{globalThis.fetch=saved;auth.env.ADMIN_DB.db.close();}
});
test('new financial writes reject Origin/CSRF and browser tenant facts before a private call or financial mutation',async()=>{
 const auth=await login(),saved=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=()=>{calls++;throw Error('unexpected private call');};
  for(const suffix of ['automation/policy','automation/sync','automation/close','allocations'])for(const headers of [{origin:'https://foreign.invalid','x-csrf-token':auth.csrf},{origin},{origin,'x-csrf-token':'wrong'}]){
   const request=new Request(origin+'/api/admin/finance/'+suffix,{method:'POST',headers:{cookie:auth.cookie,'content-type':'application/json',...headers},body:'{}'});assert.equal((await adminFetch(request,auth.env)).status,403);assert.equal(request.bodyUsed,false);
  }
  for(const query of ['?month=2026-10&month=2026-10','?month=2026-10&scope=foreign','?month=2026-13'])assert.equal((await adminFetch(new Request(origin+'/api/admin/finance/automation'+query,{headers:{cookie:auth.cookie}}),auth.env)).status,400);
  for(const query of ['?month=2026-10','?limit=101','?limit=50&limit=50','?scope=foreign'])assert.equal((await adminFetch(new Request(origin+'/api/admin/finance/allocations'+query,{headers:{cookie:auth.cookie}}),auth.env)).status,400);
  assert.equal(calls,0);
 }finally{globalThis.fetch=saved;auth.env.ADMIN_DB.db.close();}
});
test('commercial financial automation requires its composite reads and writes; allocation preview is distinct from confirm',async()=>{
 const required=async(path,body)=>commercialRouteCapabilities(new Request(origin+'/api/admin/'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 assert.deepEqual(await required('finance/automation?month=2026-10'),['finance.read','bank.read','costs.read']);
 for(const operation of ['policy','close','sync'])assert.deepEqual(await required('finance/automation/'+operation,{}),['finance.write','finance.read','bank.read','costs.read']);
 assert.deepEqual(await required('finance/allocations'),['bank.read','finance.read']);assert.deepEqual(await required('finance/allocations',{operation:'preview'}),['bank.read','finance.read']);assert.deepEqual(await required('finance/allocations',{operation:'confirm'}),['bank.write','finance.read']);assert.deepEqual(await required('finance/allocations',{operation:'reverse'}),['bank.write','finance.read']);assert.equal(await required('finance/allocations',{operation:'withdraw'}),null);
});
test('financial cron reserves only its explicit legacy minute and one bounded local source page',async()=>{
 for(const minute of ['02','07']){
 const env={ADMIN_DB:new D1()};let reads=0;
 try{
  const output=await scheduledWork(env,{readFinancialAutomationSources:async({scope})=>{reads++;assert.equal(scope.organization_id,'legacy-brazacommerce');return {events:[],coverage:[],balances:[],obligations:[],reserve:null,capabilities:[],pending:['SYNTHETIC_SOURCE_UNAVAILABLE'],cutoff_at:'2026-11-13T16:02:00.000Z',checkpoint:null,has_more:false};}},()=>Date.parse('2026-11-13T16:'+minute+':00Z'));
  assert.equal(output.lane,'FINANCIAL_AUTOMATION');assert.equal(reads,1);assert.equal(output.production,'DEFERRED');assert.equal(output.analysis,'DEFERRED');
 }finally{env.ADMIN_DB.db.close();}
 }
});
test('historical return discovery has a separate bounded local minute and no provider read',async()=>{
 const env={ADMIN_DB:new D1()};let reads=0;
 try{
  const output=await scheduledWork(env,{financialReturnsDiscoveryAdapter:{id:'SYNTHETIC_CACHED_RETURNS',transport:'LOCAL_CACHE',read:async({scope})=>{reads++;return {schema:'financial_return_discovery_page_v1',scope,observations:[],next_cursor:null,complete:false,limited:false};}}},()=>Date.parse('2026-11-13T16:05:00Z'));
  assert.equal(output.lane,'FINANCIAL_RETURNS');assert.equal(reads,1);assert.equal(output.production,'DEFERRED');assert.equal(output.collection,'DEFERRED');
 }finally{env.ADMIN_DB.db.close();}
});
