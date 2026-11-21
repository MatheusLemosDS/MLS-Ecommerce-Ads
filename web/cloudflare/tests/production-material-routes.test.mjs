import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch} from '../src/admin.mjs';
import {D1} from './sqlite-d1.mjs';

const origin='https://materials-route.synthetic.test';
const endpoint='production/material-needs';
const query=endpoint+'?planning_date=2026-11-21';
async function owner(t){
 const db=new D1();t.after(()=>db.db.close());
 const env={ADMIN_DB:db,ADMIN_SESSION_SECRET:'synthetic-material-session-'+'x'.repeat(40),ADMIN_USERNAME:'synthetic-material-owner',ADMIN_PASSWORD:'synthetic-material-password-only'};
 const login=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(login.status,303);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const state=await(await adminFetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();
 const call=(path,body,headers={},method=body===undefined?'GET':'POST')=>adminFetch(new Request(origin+'/api/admin/'+path,{method,headers:{cookie,origin,'content-type':'application/json','x-csrf-token':state.csrf,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
 return {env,db,call};
}
const journalTables=f=>f.db.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'operational_%'").get().n;

test('materials endpoint requires owner authentication and an exact planning-date query',async t=>{
 const f=await owner(t);
 assert.equal((await adminFetch(new Request(origin+'/api/admin/'+query),f.env)).status,401);
 const before=journalTables(f);
 for(const path of [endpoint,query+'&extra=1',query+'&planning_date=2026-11-22',endpoint+'?planning_date=not-a-date']){
  assert.equal((await f.call(path)).status,400,path);
 }
 assert.equal(journalTables(f),before);
});

test('material mutations reject missing CSRF, foreign Origin and query parameters before any journal initialization',async t=>{
 const f=await owner(t),before=journalTables(f);
 assert.equal((await f.call(endpoint,{}, {'x-csrf-token':'not-valid'})).status,403);
 assert.equal((await f.call(endpoint,{}, {origin:'https://foreign.synthetic.test'})).status,403);
 assert.equal((await f.call(query,{})).status,400);
 assert.equal((await f.call(endpoint,{}, {},'PUT')).status,405);
 assert.equal(journalTables(f),before);
});

test('material endpoint retains the bounded JSON transport and does not persist rejected commands',async t=>{
 const f=await owner(t),before=journalTables(f);
 assert.equal((await f.call(endpoint,{padding:'x'.repeat(17000)})).status,413);
 assert.equal((await f.call(endpoint,{}, {'content-type':'text/plain'})).status,415);
 assert.equal(journalTables(f),before);
});

test('opening saved material needs is SELECT-only and never grants financial or external operations',async t=>{
 const f=await owner(t),before=journalTables(f);
 let providerCalls=0;
 f.env.FINANCE={fetch(){providerCalls++;throw Error('No provider access belongs to material reads');}};
 const response=await f.call(query);
 assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 const value=await response.json();
 assert.equal(value.schema,'production_material_workspace_v1');
 assert.equal(value.planning_date,'2026-11-21');
 assert.equal(journalTables(f),before);
 assert.equal(providerCalls,0);
 assert.equal(value.effects.external_purchase_allowed,false);
 assert.equal(value.effects.financial_integration_allowed,false);
 assert.equal(value.effects.money_transfer_allowed,false);
});

test('the weekly material route is read-only and keeps operational facts separate from the saved financial closing',async t=>{
 const f=await owner(t),before=journalTables(f);
 const path='production/weekly-materials?week_end=2026-11-20';
 assert.equal((await adminFetch(new Request(origin+'/api/admin/'+path),f.env)).status,401);
 assert.equal((await f.call(path,{})).status,405);
 assert.equal((await f.call(path+'&extra=1')).status,400);
 const response=await f.call(path);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 const value=await response.json();assert.equal(value.schema,'production_material_week_workspace_v1');assert.equal(value.joint_financial_snapshot,false);assert.equal(value.report.financial_close_approved,false);assert.deepEqual(value.report.accounting_effects,{new_expense_cents:0,new_cogs_cents:0,new_bank_movement_cents:0});
 assert.equal(journalTables(f),before);
});
