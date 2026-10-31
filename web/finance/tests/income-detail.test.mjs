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
 const request=f.calls[0],url=new URL(request.url);assert.equal(url.pathname,path);assert.equal(request.method,'GET');assert.equal(request.body,null);assert.equal(request.headers.get('content-type'),null);assert.equal(request.headers.get('accept'),'application/json');assert.deepEqual(Object.fromEntries([...url.searchParams].filter(([name])=>['cursor','date_from','date_to','income_status','page_size'].includes(name))),{cursor:'',date_from:'2026-10-26',date_to:'2026-10-27',income_status:'2',page_size:'100'});assert.deepEqual([...url.searchParams.keys()].sort(),['access_token','cursor','date_from','date_to','income_status','page_size','partner_id','shop_id','sign','timestamp'].sort());assert.equal(url.searchParams.get('partner_id'),String(FINANCE_PROFILE.partner_id));assert.equal(url.searchParams.get('shop_id'),String(FINANCE_PROFILE.shop_id));assert.equal(url.searchParams.get('access_token'),access);
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
  ['INCOME_CONTAINER_MISSING',f=>f.state.body={error:'',response:{unrecognized_container:{list:[]}}}],
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

test('the two documented Pending envelope origins and finite list aliases preserve identical private projections',async t=>{
 let baseline;
 for(const nested of [false,true])for(const arrayBox of [false,true])for(const alias of ['list','income_detail_list_item']){
  const f=await fixture(t),original=f.state.body.income_detail_list,box={[alias]:original.list,next_page:original.next_page},container=arrayBox?[box]:box;
  f.state.body=nested?{error:'',response:{partner_id:FINANCE_PROFILE.partner_id,shop_id:FINANCE_PROFILE.shop_id,income_detail_list:container}}:{error:'',income_detail_list:container};const result=await f.run();
  assert.ok(projectIncomeDetailFrame(result));assert.equal(result.returned_count,1);assert.equal(result.has_more,true);assert.equal(result.rows[0].estimated_escrow_cents,4751);assert.doesNotMatch(JSON.stringify(result),/251027ABC123|PRIVATE_INCOME_DETAIL|income_detail_list_item/);if(!baseline)baseline=result;else assert.deepEqual(result,baseline);assert.equal(f.calls.length,1);
 }
});

test('ambiguous origins, multiple containers and mixed list aliases fail closed without merging rows',async t=>{
 for(const [kind,change] of [
  ['INCOME_CONTAINER_MISSING',body=>body.response={income_detail_list:structuredClone(body.income_detail_list)}],
  ['INCOME_CONTAINER_MISSING',body=>body.response={income_detail_list:null}],
  ['INCOME_CONTAINER_MISSING',body=>body.income_detail_list=[]],
  ['INCOME_CONTAINER_MISSING',body=>body.income_detail_list=[body.income_detail_list,structuredClone(body.income_detail_list)]],
  ['INCOME_CONTAINER_MISSING',body=>body.income_detail_list=[null]],
  ['INCOME_CONTAINER_MISSING',body=>body.income_detail_list=[[]]],
  ['INCOME_LIST_INVALID',body=>body.income_detail_list.income_detail_list_item=structuredClone(body.income_detail_list.list)],
  ['INCOME_LIST_INVALID',body=>body.income_detail_list.income_detail_list_item=null],
  ['INCOME_LIST_INVALID',body=>body.income_detail_list={next_page:{cursor:'',page_size:100}}],
  ['INCOME_LIST_INVALID',body=>body.income_detail_list={income_detail_list_item:{},next_page:{cursor:'',page_size:100}}],
  ['INCOME_LIST_INVALID',body=>body.income_detail_list={income_detail_list_item:Array.from({length:101},()=>({})),next_page:{cursor:'',page_size:100}}],
 ]){const f=await fixture(t);change(f.state.body);await assert.rejects(f.run(),error=>{assert.equal(error.code,'FINANCE_INCOME_DETAIL_INVALID_RESPONSE');assert.equal(incomeDetailFailureDiagnostic(error).response_kind,kind);return true;});assert.equal(f.calls.length,1);}
});

test('nested and selected Pending containers cannot override the fixed shop or partner identity',async t=>{
 for(const identity of ['partner_id','shop_id'])for(const layer of ['root','response','box']){
  const f=await fixture(t),box=f.state.body.income_detail_list;f.state.body={error:'',response:{income_detail_list:[{income_detail_list_item:box.list,next_page:box.next_page}]}};
  const target=layer==='root'?f.state.body:layer==='response'?f.state.body.response:f.state.body.response.income_detail_list[0];target[identity]=FINANCE_PROFILE[identity]+1;
  await assert.rejects(f.run(),error=>incomeDetailFailureDiagnostic(error).response_kind==='IDENTITY_MISMATCH');assert.equal(f.calls.length,1);
 }
});

test('nullable Pending description and payment method remain unknown while nontext values are rejected',async t=>{
 const f=await fixture(t);f.state.body.income_detail_list.list[0].description=null;f.state.body.income_detail_list.list[0].payment_method=null;const result=await f.run();assert.equal(result.rows[0].description,null);assert.equal(result.rows[0].payment_method,null);assert.equal(result.rows[0].estimated_escrow_cents,4751);assert.ok(projectIncomeDetailFrame(result));
 for(const name of ['description','payment_method'])for(const invalid of [0,false,[],{}]){const f=await fixture(t);f.state.body.income_detail_list.list[0][name]=invalid;await assert.rejects(f.run(),error=>incomeDetailFailureDiagnostic(error).response_kind==='ROW_TEXT_INVALID');}
});

test('the private structure probe retains only fixed paths, scalar types and collection counts on failed JSON envelopes',async t=>{
 const f=await fixture(t);f.state.body={error:'',message:'PRIVATE_MESSAGE',request_id:'PRIVATE_REQUEST',PRIVATE_KEY:'PRIVATE_VALUE',response:{data:'PRIVATE_DATA'},data:{income_detail_list:{income_detail_list_item:[{order_sn:'PRIVATE_ORDER',access_token:'PRIVATE_TOKEN'}],next_page:{cursor:'PRIVATE_CURSOR',page_size:100}}},result:null};
 await assert.rejects(f.run(),error=>incomeDetailFailureDiagnostic(error).response_kind==='INCOME_CONTAINER_MISSING');assert.equal(f.calls.length,1);
 const stored=f.db.db.prepare('SELECT checked_at,payload FROM finance_income_detail_structure_probe WHERE id=1').get(),probe=JSON.parse(stored.payload);assert.equal(stored.checked_at,f.now()/1000);assert.ok(Buffer.byteLength(stored.payload)<=16384);assert.equal(probe.request_method,'GET');assert.equal(probe.schema,'finance_income_detail_structure_probe_v2');assert.equal(probe.nodes.root.type,'OBJECT');assert.equal(probe.nodes.root.key_count,7);assert.deepEqual(probe.nodes['root.data.income_detail_list.income_detail_list_item'],{type:'ARRAY',array_count:1,first:{type:'OBJECT',key_count:2}});assert.deepEqual(probe.nodes['root.data.income_detail_list.next_page.cursor'],{type:'STRING'});assert.deepEqual(probe.nodes['root.data.income_detail_list.next_page.page_size'],{type:'NUMBER'});assert.deepEqual(probe.nodes['root.result'],{type:'NULL'});assert.deepEqual(probe.nodes['root.income_detail_list'],{type:'MISSING'});assert.doesNotMatch(stored.payload,/PRIVATE_|access_token/);
 for(const [fixedPath,node] of Object.entries(probe.nodes)){assert.match(fixedPath,/^root(?:\.(?:response|data|result|income_detail_list|income_detail_list_item|list|next_page|cursor|page_size|order_sn|currency|status|estimated_escrow_amount|estimated_payout_time|creation_date|description|payment_method)|\[0\])*$/);assert.ok(['MISSING','NULL','OBJECT','ARRAY','STRING','NUMBER','BOOLEAN'].includes(node.type));assert.ok(Object.keys(node).every(key=>['type','key_count','array_count','first'].includes(key)));}
});

test('a successful Pending read persists a bounded structure probe only when its checked time is newer',async t=>{
 const f=await fixture(t);await f.run();const read=()=>f.db.db.prepare('SELECT checked_at,payload FROM finance_income_detail_structure_probe WHERE id=1').get(),first=read();assert.equal(JSON.parse(first.payload).nodes['root.income_detail_list.list'].array_count,1);
 f.state.body.income_detail_list.list=[];await f.run();assert.deepEqual(read(),first);f.clock.time+=1000;await f.run();const newer=read();assert.equal(JSON.parse(newer.payload).nodes['root.income_detail_list.list'].array_count,0);assert.equal(newer.checked_at,first.checked_at+1);f.clock.time-=2000;f.state.body.income_detail_list.list=[{order_sn:'PRIVATE_ORDER',currency:'BRL',status:'Pending'}];await f.run();assert.deepEqual(read(),newer);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM finance_income_detail_structure_probe').get().n,1);assert.equal(f.calls.length,4);
});

test('structure diagnostic storage failures cannot replace a successful read or the original provider error',async t=>{
 const f=await fixture(t),prepare=f.db.prepare.bind(f.db);f.db.prepare=sql=>{if(sql.includes('finance_income_detail_structure_probe'))throw Error('PRIVATE_DATABASE_ERROR');return prepare(sql);};assert.ok(projectIncomeDetailFrame(await f.run()));f.state.body={error:'error_param',message:'PRIVATE_PROVIDER_ERROR'};await assert.rejects(f.run(),error=>{assert.equal(error.code,'FINANCE_INCOME_DETAIL_UNAVAILABLE');assert.equal(incomeDetailFailureDiagnostic(error).provider_code,'error_param');assert.doesNotMatch(JSON.stringify(error),/PRIVATE_DATABASE_ERROR|PRIVATE_PROVIDER_ERROR/);return true;});assert.equal(f.calls.length,2);
});


test('canonical direct Pending response boxes preserve validated rows and reject mixed origins',async t=>{
 for(const nested of [false,true]){
  const f=await fixture(t),box=structuredClone(f.state.body.income_detail_list);
  f.state.body=nested?{error:'',response:box}:{error:'',...box};
  const result=await f.run();assert.ok(projectIncomeDetailFrame(result));assert.equal(result.returned_count,1);assert.equal(result.rows[0].estimated_escrow_cents,4751);assert.equal(result.has_more,true);assert.equal(f.calls.length,1);
  const stored=f.db.db.prepare('SELECT payload FROM finance_income_detail_structure_probe WHERE id=1').get(),probe=JSON.parse(stored.payload),prefix=nested?'root.response':'root';assert.deepEqual(probe.nodes[prefix+'.list[0].order_sn'],{type:'STRING'});assert.deepEqual(probe.nodes[prefix+'.list[0].estimated_escrow_amount'],{type:'NUMBER'});assert.doesNotMatch(stored.payload,/251027ABC123|PRIVATE_/);
 }
 for(const nested of [false,true]){
  const f=await fixture(t),box=structuredClone(f.state.body.income_detail_list);if(nested)f.state.body.response=box;else Object.assign(f.state.body,box);
  await assert.rejects(f.run(),error=>incomeDetailFailureDiagnostic(error).response_kind==='INCOME_CONTAINER_MISSING');assert.equal(f.calls.length,1);
 }
});
