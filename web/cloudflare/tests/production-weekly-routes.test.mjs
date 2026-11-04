import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch} from '../src/admin.mjs';
import {D1} from './sqlite-d1.mjs';

const origin='https://weekly-production.test';
const month=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7);
class ObservedD1 extends D1{constructor(){super();this.sql=[];}prepare(sql){this.sql.push(sql);return super.prepare(sql);}}
async function fixture(t){
 const db=new ObservedD1(),env={ADMIN_DB:db,ADMIN_SESSION_SECRET:'weekly-production-owner-secret-1234567890',ADMIN_USERNAME:'weekly-owner',ADMIN_PASSWORD:'weekly-fixture-password-123456'};
 t.after(()=>db.db.close());let providerCalls=0;
 const forbidden=async()=>{providerCalls++;throw Error('PRIVATE_PROVIDER_DETAIL');},services={getFinanceBusinessPeriod:forbidden,getFinanceProductionOrders:forbidden,getFinanceVariantCatalog:forbidden,getAdsCalendar:forbidden};
 const login=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env,services);
 assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
 const bootstrap=await adminFetch(new Request(origin+'/api/admin/bootstrap',{headers:{cookie}}),env,services);assert.equal(bootstrap.status,200);const {csrf}=await bootstrap.json();
 const call=(query='',body,changes={})=>adminFetch(new Request(origin+'/api/admin/production/weekly-closing'+query,{method:changes.method||(body===undefined?'GET':'POST'),headers:{cookie:changes.cookie??cookie,origin:changes.origin??origin,'x-csrf-token':changes.csrf??csrf,'content-type':changes.type??'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env,services);
 return {db,env,call,providerCalls:()=>providerCalls};
}

test('weekly close GET is owner-authenticated, cold SELECT-only and cannot collect or invent manufacture',async t=>{
 const f=await fixture(t),query='?month='+month();
 assert.equal((await f.call(query,undefined,{cookie:''})).status,401);
 assert.equal((await f.call(query,undefined,{cookie:'mls_session=forged'})).status,401);
 const response=await f.call(query),value=await response.json();assert.equal(response.status,200,JSON.stringify(value));
 assert.equal(value.schema,'production_weekly_closing_workspace_v1');assert.equal(value.month,month());
 assert.ok(f.db.sql.every(sql=>/^SELECT\b/.test(sql)),'opening the history cannot initialize either financial or manufacturing tables');
 assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);
 assert.equal(f.providerCalls(),0);assert.ok(!JSON.stringify(value).includes('PRIVATE_PROVIDER_DETAIL'));
});

test('weekly routes reject ambiguous scope, wrong methods, cross-origin and CSRF before mutation',async t=>{
 const f=await fixture(t),selected=month();
 for(const query of ['', '?month='+selected+'&month='+selected,'?month='+selected+'&shop_id=1','?month=2099-12','?month=2026-13']){
  assert.equal((await f.call(query)).status,400,query);
 }
 assert.equal((await f.call('?month='+selected,undefined,{method:'PUT'})).status,405);
 for(const changes of [{csrf:''},{csrf:'forged'},{origin:'https://foreign.test'}])assert.equal((await f.call('',{},changes)).status,403);
 assert.equal((await f.call('?month='+selected,{})).status,400,'POST month belongs in its bounded JSON body');
 assert.equal((await f.call('',{action:'assign_boundary',month:selected},{type:'text/plain'})).status,415);
 assert.equal((await f.call('',{action:'assign_boundary',month:selected,confirmed:false})).status,400);
 assert.ok(f.db.sql.every(sql=>/^SELECT\b/.test(sql)),'rejected requests cannot create storage');
 assert.equal(f.providerCalls(),0);
});

test('weekly source failures expose a bounded code rather than private storage errors',async t=>{
 const f=await fixture(t);f.env.ADMIN_DB={prepare(){throw Error('PRIVATE_DATABASE_PATH_AND_ID');},batch(){throw Error('PRIVATE_DATABASE_PATH_AND_ID');}};
 const response=await f.call('?month='+month()),value=await response.json();
 assert.equal(response.status,503);assert.equal(typeof value.error,'string');assert.match(value.error,/^PRODUCTION_WEEKLY_/);
 assert.ok(!JSON.stringify(value).includes('PRIVATE_DATABASE_PATH_AND_ID'));assert.equal(f.providerCalls(),0);
});
