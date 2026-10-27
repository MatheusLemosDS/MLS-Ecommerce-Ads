import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore,FINANCE_PROFILE} from '../src/connection-store.mjs';
import {readFinanceIncomeOverview} from '../src/income-overview.mjs';
import {projectIncomeOverviewFrame} from '../src/income-overview-frame.mjs';

const key='PRIVATE_INCOME_KEY',access='PRIVATE_INCOME_ACCESS',refresh='PRIVATE_INCOME_REFRESH',path='/api/v2/payment/get_income_overview';
async function fixture(t){
 const db=new D1();t.after(()=>db.db.close());const clock={time:Date.UTC(2026,9,27,15)},now=()=>clock.time;
 const env={FINANCE_DB:db,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,41).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:key};
 const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:access,refresh_token:refresh,expires_at:now()/1000+86400});
 const calls=[],state={body:{error:'',response:{total_income:{pending_amount:1234.56,released_amount:7890.12}}}};
 const fetchImpl=async request=>{calls.push(request);return Response.json(state.body);};
 return {db,env,clock,now,calls,state,fetchImpl,run:()=>readFinanceIncomeOverview(env,{now,fetchImpl})};
}

test('Brazil local income overview exposes provider Pending separately from Released and never calls it bank receipt',async t=>{
 const f=await fixture(t),value=await f.run();assert.ok(projectIncomeOverviewFrame(value));assert.equal(value.pending.cents,123456);assert.equal(value.released.cents,789012);assert.equal(value.to_release.cents,null);assert.equal(value.shop_type,'LOCAL');assert.equal(value.currency_basis,'FIXED_BRAZIL_SHOP_PROFILE');assert.match(value.basis,/NOT_BANK_RECEIPT/);
 assert.equal(f.calls.length,1);const request=f.calls[0],url=new URL(request.url);assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(url.pathname,path);assert.equal(request.method,'GET');assert.equal(url.searchParams.has('income_status'),false);assert.equal(url.searchParams.get('partner_id'),String(FINANCE_PROFILE.partner_id));assert.equal(url.searchParams.get('shop_id'),String(FINANCE_PROFILE.shop_id));assert.equal(url.searchParams.get('access_token'),access);
 const base=String(FINANCE_PROFILE.partner_id)+path+url.searchParams.get('timestamp')+access+FINANCE_PROFILE.shop_id;assert.equal(url.searchParams.get('sign'),createHmac('sha256',key).update(base).digest('hex'));assert.equal(request.headers.get('cookie'),null);assert.equal(request.headers.get('authorization'),null);
 const raw=JSON.stringify(value);for(const secret of [key,access,refresh])assert.ok(!raw.includes(secret));
});

test('missing amount is distinct from explicit zero and unsafe sub-cent money remains raw without invented cents',async t=>{
 const f=await fixture(t);f.state.body={error:'',response:{total_income:{pending_amount:0,released_amount:10.123}}};const value=await f.run();assert.equal(value.pending.raw,'0');assert.equal(value.pending.cents,0);assert.equal(value.released.raw,'10.123');assert.equal(value.released.cents,null);
 f.state.body={error:'',response:{total_income:{released_amount:10}}};const missing=await f.run();assert.equal(missing.pending.raw,null);assert.equal(missing.pending.cents,null);
});

test('permission, foreign identity and malformed money fail closed without leaking provider text',async t=>{
 for(const body of [
  {error:'error_api_permission',message:'PRIVATE_PROVIDER_SECRET'},
  {error:'',shop_id:1,response:{total_income:{pending_amount:1,released_amount:2}}},
  {error:'',response:{total_income:{pending_amount:'1.00',released_amount:2}}},
  {error:'',response:{}}
 ]){
  const f=await fixture(t);f.state.body=body;await assert.rejects(f.run(),error=>String(error.code||error).startsWith('FINANCE_INCOME_OVERVIEW_'));
 }
});

test('expired access refresh and overview share the same two-call budget',async t=>{
 const f=await fixture(t),tokens=await (await createFinanceStore(f.env,{now:f.now})).readTokens();const store=await createFinanceStore(f.env,{now:f.now});await store.saveTokens({access_token:access,refresh_token:refresh,expires_at:f.now()/1000+1},{expectedRevision:tokens.revision});f.clock.time+=2000;let external=0;
 const fetchImpl=async request=>{external++;const url=new URL(request.url);if(url.pathname==='/api/v2/auth/access_token/get')return Response.json({error:'',request_id:'x',partner_id:FINANCE_PROFILE.partner_id,shop_id:FINANCE_PROFILE.shop_id,access_token:access+'2',refresh_token:refresh+'2',expire_in:14400});return Response.json({error:'',response:{total_income:{pending_amount:1,released_amount:2}}});};
 const value=await readFinanceIncomeOverview(f.env,{now:f.now,fetchImpl});assert.equal(external,2);assert.equal(value.pending.cents,100);
});
