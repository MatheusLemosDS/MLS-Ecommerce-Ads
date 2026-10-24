import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch} from '../src/admin.mjs';
import {D1} from './sqlite-d1.mjs';

const base='https://app.example.test';
async function fixture(){
 const env={ADMIN_DB:new D1(),ADMIN_USERNAME:'mei-owner',ADMIN_PASSWORD:'fixture-mei-password-123456',ADMIN_SESSION_SECRET:'fixture-mei-session-secret-12345678901234567890'};
 const login=await adminFetch(new Request(base+'/login',{method:'POST',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
 const state=await (await adminFetch(new Request(base+'/api/admin/state',{headers:{cookie}}),env)).json();return {env,cookie,csrf:state.csrf};
}
function call(env,cookie,csrf,path='tax-policy?year=2026',body,origin=base){return adminFetch(new Request(base+'/api/admin/'+path,{method:body===undefined?'GET':'POST',headers:{cookie,origin,'content-type':'application/json','x-csrf-token':csrf},body:body===undefined?undefined:JSON.stringify(body)}),env);}

test('the owner tax API exposes the confirmed yearly DAS and protects amendments with Origin CSRF CAS and an audit',async()=>{
 const {env,cookie,csrf}=await fixture();try{
  for(const denied of ['', 'mls_session=review'])assert.equal((await call(env,denied,csrf)).status,401);
  const initial=await (await call(env,cookie,csrf)).json();assert.deepEqual(initial.values,{regime:'MEI',year:2026,monthly_das_cents:8605});assert.equal(initial.revision,1);
  const body={revision:1,values:{regime:'MEI',year:2026,monthly_das_cents:9000}};
  assert.equal((await call(env,cookie,'','tax-policy',body)).status,403);
  assert.equal((await call(env,cookie,csrf,'tax-policy',body,'https://foreign.example')).status,403);
  assert.equal((await call(env,cookie,csrf,'tax-policy?year=2026',body)).status,400);
  const saved=await call(env,cookie,csrf,'tax-policy',body);assert.equal(saved.status,200);assert.equal((await saved.json()).revision,2);
  assert.equal((await call(env,cookie,csrf,'tax-policy',body)).status,409);
  const audit=await (await call(env,cookie,csrf,'tax-policy/audit?year=2026')).json();assert.equal(audit.rows.length,2);assert.equal(audit.rows[0].actor,'admin');
  for(const path of ['tax-policy','tax-policy?year=2026&year=2027','tax-policy?year=02026','tax-policy?year=2026&shop_id=1'])assert.equal((await call(env,cookie,csrf,path)).status,400);
  const unknown=await (await call(env,cookie,csrf,'tax-policy?year=2027')).json();assert.equal(unknown.revision,0);assert.equal(unknown.values.monthly_das_cents,null);
  assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM hermes_jobs').get().n,0);
 }finally{env.ADMIN_DB.db.close();}
});
