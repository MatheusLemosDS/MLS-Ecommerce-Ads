import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch} from '../src/admin.mjs';
import {D1} from './sqlite-d1.mjs';

const origin='https://weekly-report-owner.test',path='/api/admin/reports/weekly';
async function fixture(){
 const env={ADMIN_USERNAME:'synthetic-owner',ADMIN_PASSWORD:'synthetic-owner-password',ADMIN_SESSION_SECRET:'synthetic-weekly-session-'+'s'.repeat(40),ADMIN_DB:new D1()};
 const response=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(response.status,303);return {env,cookie:response.headers.get('set-cookie').split(';')[0]};
}
const schema=db=>db.db.prepare('SELECT name,type,sql FROM sqlite_master ORDER BY name').all();

test('weekly report rejects anonymous requests and unsupported methods before financial storage',async()=>{
 const f=await fixture(),db=f.env.ADMIN_DB;try{
  Object.defineProperty(f.env,'ADMIN_DB',{get(){throw Error('Storage must not be touched');}});
  const anonymous=await adminFetch(new Request(origin+path+'?week_end=2026-11-06'),f.env);assert.equal(anonymous.status,401);
  for(const method of ['POST','PUT','DELETE','HEAD']){
   const response=await adminFetch(new Request(origin+path+'?week_end=2026-11-06',{method,headers:{cookie:f.cookie}}),f.env);assert.equal(response.status,405);
  }
 }finally{db.db.close();}
});

test('weekly selection is closed and rejects duplicate, foreign and non-Friday scope before storage',async()=>{
 const f=await fixture(),db=f.env.ADMIN_DB;try{
  Object.defineProperty(f.env,'ADMIN_DB',{get(){throw Error('Storage must not be touched');}});
  for(const query of ['', '?week_end=2026-11-06&week_end=2026-11-13','?week_end=2026-11-06&shop_id=other','?week_end=2026-11-05','?week_end=2099-11-06','?week_end=2026-02-30']){
   const response=await adminFetch(new Request(origin+path+query,{headers:{cookie:f.cookie}}),f.env);assert.equal(response.status,400,query);assert.deepEqual(await response.json(),{error:'WEEKLY_OPERATING_REQUEST_INVALID'});
  }
 }finally{db.db.close();}
});

test('a cold weekly read preserves schema and missing amounts, without contacting a marketplace',async()=>{
 const f=await fixture(),db=f.env.ADMIN_DB,before=schema(db),saved=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=()=>{calls++;throw Error('No external collection is permitted');};
  const response=await adminFetch(new Request(origin+path+'?week_end=2026-11-06',{headers:{cookie:f.cookie}}),f.env);assert.equal(response.status,200);
  const value=await response.json();assert.equal(value.schema,'weekly_operating_report_v1');assert.equal(value.realized_profit_cents,null);
  assert.equal(value.manufacturing.total_cost_cents,null);assert.equal(value.sales_estimate.totals.estimate_cents,null);assert.equal(value.imported_cash.state,'UNAVAILABLE');
  assert.deepEqual(schema(db),before);assert.equal(calls,0);
 }finally{globalThis.fetch=saved;db.db.close();}
});
