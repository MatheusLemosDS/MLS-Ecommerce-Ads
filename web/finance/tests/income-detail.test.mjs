import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore,FINANCE_PROFILE} from '../src/connection-store.mjs';
import {readFinanceIncomeDetail} from '../src/income-detail.mjs';
import {projectIncomeDetailFrame} from '../src/income-detail-frame.mjs';
import {incomeDetailFailureDiagnostic} from '../src/income-detail-diagnostic.mjs';

const key='PRIVATE_INCOME_DETAIL_KEY',access='PRIVATE_INCOME_DETAIL_ACCESS',refresh='PRIVATE_INCOME_DETAIL_REFRESH',path='/api/v2/payment/get_income_detail';
async function fixture(t){
 const db=new D1();t.after(()=>db.db.close());const clock={time:Date.UTC(2026,9,27,15)},now=()=>clock.time;
 const env={FINANCE_DB:db,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,43).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:key};
 const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:access,refresh_token:refresh,expires_at:now()/1000+86400});
 const calls=[],state={body:{error:'',income_detail_list:{list:[{order_sn:'251027ABC123',currency:'BRL',status:'Pendente',description:'Order Income',payment_method:'PIX',estimated_escrow_amount:47.51,estimated_payout_time:Math.floor(now()/1000)+86400,creation_date:Math.floor(now()/1000)-3600}],next_page:{cursor:'next-1',page_size:100}}}};
 const fetchImpl=async request=>{calls.push(request);return Response.json(state.body);};
 return {db,env,clock,now,calls,state,fetchImpl,run:()=>readFinanceIncomeDetail(env,{now,fetchImpl})};
}

test('Brazil local Pending detail hashes private order identity and preserves current estimated payout evidence',async t=>{
 const f=await fixture(t),value=await f.run();assert.ok(projectIncomeDetailFrame(value));assert.equal(value.income_status,'PENDING');assert.equal(value.returned_count,1);assert.equal(value.has_more,true);assert.equal(value.rows[0].currency,'BRL');assert.equal(value.rows[0].estimated_escrow_cents,4751);assert.equal(value.rows[0].order_hash.length,64);assert.equal(value.rows[0].entry_hash.length,64);assert.match(value.basis,/NOT_MONTH_OR_BANK_RECEIPT/);
 const request=f.calls[0],url=new URL(request.url);assert.equal(url.pathname,path);assert.equal(request.method,'POST');const body=JSON.parse(await request.clone().text());assert.deepEqual(body,{cursor:'',date_from:'2026-10-26',date_to:'2026-10-27',income_status:2,page_size:100});assert.equal(url.searchParams.get('partner_id'),String(FINANCE_PROFILE.partner_id));assert.equal(url.searchParams.get('shop_id'),String(FINANCE_PROFILE.shop_id));assert.equal(url.searchParams.get('access_token'),access);
 const base=String(FINANCE_PROFILE.partner_id)+path+url.searchParams.get('timestamp')+access+FINANCE_PROFILE.shop_id;assert.equal(url.searchParams.get('sign'),createHmac('sha256',key).update(base).digest('hex'));assert.doesNotMatch(JSON.stringify(value),/251027ABC123|PRIVATE_INCOME_DETAIL/);
});

test('sub-cent Pending stays raw without invented cents and empty cursor means first page is complete',async t=>{
 const f=await fixture(t);f.state.body={error:'',income_detail_list:{list:[{order_sn:'251027ABC123',currency:'BRL',status:'Pendente',estimated_escrow_amount:10.123}],next_page:{cursor:'',page_size:100}}};const value=await f.run();assert.equal(value.rows[0].estimated_escrow_raw,'10.123');assert.equal(value.rows[0].estimated_escrow_cents,null);assert.equal(value.has_more,false);assert.equal(value.next_cursor_present,false);
});

test('foreign currency, malformed identity and provider failures are rejected without leaking body text',async t=>{
 for(const body of [
  {error:'',income_detail_list:{list:[{order_sn:'X',currency:'USD',status:'Pending',estimated_escrow_amount:1}],next_page:{cursor:'',page_size:100}}},
  {error:'',income_detail_list:{list:[{order_sn:'BAD ORDER',currency:'BRL',status:'Pending',estimated_escrow_amount:1}],next_page:{cursor:'',page_size:100}}},
  {error:'error_api_permission',message:'PRIVATE_PROVIDER_SECRET'}
 ]){const f=await fixture(t);f.state.body=body;await assert.rejects(f.run(),error=>String(error.code||error).startsWith('FINANCE_INCOME_DETAIL_'));}
});

test('expired access refresh and Pending detail share the same two-call budget',async t=>{
 const f=await fixture(t),store=await createFinanceStore(f.env,{now:f.now}),tokens=await store.readTokens();await store.saveTokens({access_token:access,refresh_token:refresh,expires_at:f.now()/1000+1},{expectedRevision:tokens.revision});f.clock.time+=2000;let external=0;
 const fetchImpl=async request=>{external++;const url=new URL(request.url);if(url.pathname==='/api/v2/auth/access_token/get')return Response.json({error:'',message:'',request_id:'x',partner_id:FINANCE_PROFILE.partner_id,shop_id:FINANCE_PROFILE.shop_id,access_token:access+'2',refresh_token:refresh+'2',expire_in:14400});return Response.json({error:'',income_detail_list:{list:[],next_page:{cursor:'',page_size:100}}});};
 const value=await readFinanceIncomeDetail(f.env,{now:f.now,fetchImpl});assert.equal(external,2);assert.equal(value.returned_count,0);
});

test('Pending schema failures identify the rejected structural category without retaining values',async t=>{
 for(const [kind,change] of [
  ['ROOT_INVALID',f=>f.state.body={private:'PRIVATE_RESPONSE'}],
  ['INCOME_CONTAINER_MISSING',f=>f.state.body={error:'',response:{income_detail_list:{list:[]}}}],
  ['INCOME_LIST_INVALID',f=>delete f.state.body.income_detail_list.list],
  ['ROW_CURRENCY_INVALID',f=>f.state.body.income_detail_list.list[0].currency='PRIVATE_CURRENCY'],
  ['ROW_IDENTITY_INVALID',f=>f.state.body.income_detail_list.list[0].order_sn='PRIVATE ORDER'],
  ['ROW_AMOUNT_INVALID',f=>f.state.body.income_detail_list.list[0].estimated_escrow_amount='47.51'],
  ['ROW_STATUS_INVALID',f=>delete f.state.body.income_detail_list.list[0].status],
  ['PAGE_CURSOR_INVALID',f=>f.state.body.income_detail_list.next_page.cursor='x'.repeat(513)],
 ]){const f=await fixture(t);change(f);await assert.rejects(f.run(),error=>{const cause=incomeDetailFailureDiagnostic(error);assert.equal(cause.response_kind,kind);assert.doesNotMatch(JSON.stringify(cause),/PRIVATE_RESPONSE|PRIVATE_CURRENCY|PRIVATE ORDER|251027ABC123/);return true;});}
});

test('provider200 failures retain only allowlisted error tokens and their actual HTTP status',async t=>{
 const f=await fixture(t);f.state.body={error:'error_param',message:'PRIVATE_BODY'};await assert.rejects(f.run(),error=>{const cause=incomeDetailFailureDiagnostic(error);assert.equal(cause.provider_code,'error_param');assert.equal(cause.http,200);assert.equal(cause.response_kind,'PROVIDER_ERROR');assert.doesNotMatch(JSON.stringify(cause),/PRIVATE_BODY/);return true;});
});

test('default Pending deadline accepts a real response after the former five-second cutoff without retrying',async t=>{
 const f=await fixture(t);t.mock.timers.enable({apis:['setTimeout']});let enter,complete,retained,calls=0;const entered=new Promise(resolve=>enter=resolve);
 const pending=readFinanceIncomeDetail(f.env,{now:f.now,fetchImpl:request=>{calls++;retained=request;enter();return new Promise(resolve=>complete=resolve);}});await entered;
 f.clock.time+=6000;t.mock.timers.tick(6000);assert.equal(retained.signal.aborted,false);complete(Response.json(f.state.body));const report=await pending;
 assert.ok(projectIncomeDetailFrame(report));assert.equal(report.returned_count,1);assert.equal(report.checked_at,f.now()/1000);assert.equal(calls,1);
});

test('the ten-second Pending deadline still aborts a stalled provider and never retries it',async t=>{
 const f=await fixture(t);t.mock.timers.enable({apis:['setTimeout']});let enter,retained,calls=0;const entered=new Promise(resolve=>enter=resolve);
 const pending=readFinanceIncomeDetail(f.env,{now:f.now,fetchImpl:request=>{calls++;retained=request;enter();return new Promise(()=>{});}}),rejected=assert.rejects(pending,error=>error.code==='FINANCE_INCOME_DETAIL_TIMEOUT');await entered;
 t.mock.timers.tick(9999);assert.equal(retained.signal.aborted,false);t.mock.timers.tick(1);await rejected;assert.equal(retained.signal.aborted,true);assert.equal(calls,1);
});

test('Pending timeout configuration cannot exceed the existing shared transport cap',async t=>{
 const f=await fixture(t);await assert.rejects(readFinanceIncomeDetail(f.env,{now:f.now,fetchImpl:f.fetchImpl,timeoutMs:10001}),error=>error.code==='FINANCE_INCOME_DETAIL_CONFIGURATION');assert.equal(f.calls.length,0);
});

test('missing or malformed Pending pagination metadata cannot assert complete coverage',async t=>{
 for(const change of [
  box=>delete box.next_page,
  box=>box.next_page=null,
  box=>box.next_page=[],
  box=>box.next_page='PRIVATE_PAGE',
  box=>box.next_page={},
  box=>box.next_page={cursor:null},
  box=>box.next_page={cursor:123},
  box=>box.next_page={cursor:'x'.repeat(513)},
 ]){const f=await fixture(t);change(f.state.body.income_detail_list);await assert.rejects(f.run(),error=>{const diagnostic=incomeDetailFailureDiagnostic(error);assert.equal(error.code,'FINANCE_INCOME_DETAIL_INVALID_RESPONSE');assert.equal(diagnostic.response_kind,'PAGE_CURSOR_INVALID');assert.doesNotMatch(JSON.stringify(diagnostic),/PRIVATE_PAGE/);return true;});assert.equal(f.calls.length,1);}
 const f=await fixture(t);f.state.body.income_detail_list.next_page={cursor:'',page_size:99};await assert.rejects(f.run(),error=>incomeDetailFailureDiagnostic(error).response_kind==='PAGE_SIZE_INVALID');
});
