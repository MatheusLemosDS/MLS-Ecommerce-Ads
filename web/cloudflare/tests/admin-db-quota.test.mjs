import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch} from '../src/admin.mjs';
import {D1} from './sqlite-d1.mjs';

const origin='https://admin-quota.test';
const daily=kind=>"Your account has exceeded D1's free tier daily row "+kind+' limit.';
const shortGuidance=' Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.';
const guidance=shortGuidance+' See https://developers.cloudflare.com/d1/platform/limits/ for more details.';
const quota=kind=>new Error('D1_ERROR: '+daily(kind)+guidance);

async function fixture(){
 const env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'quota-fixture-session-'+'s'.repeat(32),ADMIN_USERNAME:'quota-fixture-owner',ADMIN_PASSWORD:'quota-fixture-password-only'};
 const login=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
 return {env,read:()=>adminFetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env),close:()=>env.ADMIN_DB.db.close()};
}
async function assertFailure(response,code='ADMIN_DB_DAILY_LIMIT_EXCEEDED'){
 assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
 const body=await response.text();assert.deepEqual(JSON.parse(body),{error:code});assert.doesNotMatch(body,/D1_ERROR|PRIVATE|SQL|cause|cloudflare\.com/);
}

test('state exposes only a fixed quota code for the canonical D1 daily read and write errors',async()=>{
 for(const kind of ['read','write'])for(const suffix of ['',shortGuidance,guidance]){
  const f=await fixture();
  try{f.env.ADMIN_DB.batch=async()=>{throw new Error('D1_ERROR: '+daily(kind)+suffix);};await assertFailure(await f.read());}
  finally{f.close();}
 }
});

test('state recognizes the legacy D1 cause with no guidance, short guidance or guidance with the help URL',async()=>{
 for(const kind of ['read','write'])for(const suffix of ['',shortGuidance,guidance]){
  const error=new Error('D1_ERROR',{cause:new Error(daily(kind)+suffix)});
  const f=await fixture();
  try{f.env.ADMIN_DB.batch=async()=>{throw error;};await assertFailure(await f.read());}
  finally{f.close();}
 }
});

test('a quota failure during setup does not latch: the same binding accepts a manual retry after recovery',async()=>{
 const f=await fixture(),batch=f.env.ADMIN_DB.batch.bind(f.env.ADMIN_DB);let failures=1;
 f.env.ADMIN_DB.batch=async statements=>{if(failures-->0)throw quota('write');return batch(statements);};
 try{
  await assertFailure(await f.read());const recovered=await f.read();assert.equal(recovered.status,200);const state=await recovered.json();assert.ok(state.csrf);assert.equal(state.ads_execution,'LOCKED');
 }finally{f.close();}
});

test('the maintenance batch preserves a quota cause for the public state boundary',async()=>{
 const f=await fixture(),batch=f.env.ADMIN_DB.batch.bind(f.env.ADMIN_DB);let batches=0;
 f.env.ADMIN_DB.batch=async statements=>{if(++batches===2)throw quota('write');return batch(statements);};
 try{await assertFailure(await f.read());assert.equal(batches,2);assert.equal((await f.read()).status,200);}
 finally{f.close();}
});

test('state also classifies a quota after successful setup when a read fails',async()=>{
 const f=await fixture();
 try{
  assert.equal((await f.read()).status,200);const prepare=f.env.ADMIN_DB.prepare.bind(f.env.ADMIN_DB);
  f.env.ADMIN_DB.prepare=sql=>sql==='SELECT revision,payload,updated_at FROM admin_settings WHERE id=1'?{async first(){throw quota('read');}}:prepare(sql);
  await assertFailure(await f.read());f.env.ADMIN_DB.prepare=prepare;assert.equal((await f.read()).status,200);
 }finally{f.close();}
});

test('unrelated D1 limits, SQL text and generic quota language never become a daily quota diagnosis',async()=>{
 const errors=[
  new Error('D1_ERROR: Exceeded maximum DB size. PRIVATE_SQL'),
  new Error('D1_ERROR: no such table: '+daily('write')),
  new Error('D1_ERROR: '+daily('write')+' PRIVATE_SQL'),
  new Error('D1_ERROR: daily quota exceeded'),
  new Error(daily('write')+guidance),
  new Error('PRIVATE_PROVIDER_ERROR'),
 ];
 for(const error of errors){
  const f=await fixture();
  try{f.env.ADMIN_DB.batch=async()=>{throw error;};await assertFailure(await f.read(),'ADMIN_UNAVAILABLE');}
  finally{f.close();}
 }
});

test('unrelated storage failures retain their existing maintenance code',async()=>{
 const f=await fixture(),batch=f.env.ADMIN_DB.batch.bind(f.env.ADMIN_DB);let batches=0;
 f.env.ADMIN_DB.batch=async statements=>{if(++batches===2)throw new Error('PRIVATE_SQL: malformed database');return batch(statements);};
 try{await assertFailure(await f.read(),'OPERATOR_COST_CORRECTION_STORAGE_UNAVAILABLE');}
 finally{f.close();}
});

test('quota inspection never invokes message or cause getters and bounds cyclic or deep causes',async()=>{
 let getters=0;const accessor={};
 for(const key of ['message','cause'])Object.defineProperty(accessor,key,{get(){getters++;throw Error('PRIVATE_GETTER');}});
 const cycle=new Error('D1_ERROR');cycle.cause=cycle;
 let deep=quota('write');for(let index=0;index<4;index++)deep=new Error('PRIVATE_WRAPPER',{cause:deep});
 for(const error of [accessor,cycle,deep]){
  const f=await fixture();
  try{f.env.ADMIN_DB.batch=async()=>{throw error;};await assertFailure(await f.read(),'ADMIN_UNAVAILABLE');}
  finally{f.close();}
 }
 assert.equal(getters,0);
});
