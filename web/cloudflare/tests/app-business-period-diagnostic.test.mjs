import test from 'node:test';
import assert from 'node:assert/strict';
import {getFinanceBusinessPeriod} from '../src/app-business-period.mjs';
import {businessMonth,BusinessMonthError} from '../src/business-month.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {D1} from './sqlite-d1.mjs';

const appKey='fixture-private-business-key',env={APP_INTERNAL_SECRET:appKey};
const input={operation:'start',start_date:'2026-10-01',end_date:'2026-10-15'};
const call=fetchImpl=>getFinanceBusinessPeriod(env,input,{fetchImpl});
const failure=(suffix,http=null)=>({schema:'finance_business_period_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_BUSINESS_'+suffix,http}});
const empty=()=>({schema:'finance_business_period_v1',run_id:'11111111-1111-4111-8111-111111111111',revision:2,status:'COMPLETE',start_date:input.start_date,end_date:input.end_date,cutoff_at:1792400000,checked_at:1792400001,currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:0,paid:0,completed:0,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:0,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'0',sales_base_raw:'0',known_expected_repass_raw:'0',expected_repass_raw:'0',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:0,unavailable_orders:0,known_base_raw:'0',known_tax_raw:'0'},items:[],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'});

test('private transport preserves only the HTTP status and a fixed diagnostic, never source text or credentials',async()=>{
 for(const status of [401,403,409,429,500,502,503,504]){
  let reads=0;const value=await call(async request=>{reads++;assert.equal(request.headers.get('x-braza-app-key'),appKey);return new Response('PRIVATE_TOKEN <html>upstream failure</html>',{status});});
  assert.deepEqual(value,failure('HTTP_ERROR',status));assert.equal(reads,1);assert.ok(!JSON.stringify(value).includes('PRIVATE'));
 }
 assert.deepEqual(await call(async()=>new Response('PRIVATE',{status:302,headers:{location:'https://private.invalid/PRIVATE'}})),failure('REDIRECT_REJECTED',302));
});

test('network failures and deadlines are distinct, abort the request and never retry a private page',async()=>{
 let reads=0;assert.deepEqual(await call(async()=>{reads++;throw Error('PRIVATE_PROVIDER_TOKEN');}),failure('NETWORK_ERROR'));assert.equal(reads,1);
 let request;reads=0;const value=await getFinanceBusinessPeriod(env,input,{timeoutMs:5,fetchImpl:async req=>{request=req;reads++;return new Promise(()=>{});}});
 assert.deepEqual(value,failure('TIMEOUT'));assert.equal(reads,1);assert.equal(request.signal.aborted,true);
 const slow=new Response(new ReadableStream({start(){}}),{headers:{'content-type':'application/json'}});
 assert.deepEqual(await getFinanceBusinessPeriod(env,input,{timeoutMs:5,fetchImpl:async()=>slow}),failure('TIMEOUT',200));
});

test('invalid content, malformed JSON, corrupt frames and wrong scopes receive separate safe codes',async()=>{
 assert.deepEqual(await call(async()=>new Response('PRIVATE',{headers:{'content-type':'text/html'}})),failure('CONTENT_TYPE_INVALID',200));
 assert.deepEqual(await call(async()=>new Response('PRIVATE',{headers:{'content-type':'application/json'}})),failure('JSON_INVALID',200));
 assert.deepEqual(await call(async()=>Response.json({...empty(),access_token:'PRIVATE_TOKEN'})),failure('FRAME_INVALID',200));
 const wrong={...empty(),start_date:'2026-10-02'};assert.ok(projectBusinessPeriodFrame(wrong));
 assert.deepEqual(await call(async()=>Response.json(wrong)),failure('SCOPE_MISMATCH',200));
 assert.deepEqual(await call(async()=>new Response('{}',{headers:{'content-type':'application/json','content-length':'1048577'}})),failure('BODY_LIMIT',200));
 const broken=new Response(new ReadableStream({start(controller){controller.error(Error('PRIVATE_STREAM_FAILURE'));}}),{headers:{'content-type':'application/json'}});
 assert.deepEqual(await call(async()=>broken),failure('BODY_READ_ERROR',200));
 assert.deepEqual(await getFinanceBusinessPeriod({},input,{fetchImpl:async()=>{throw Error('must not fetch');}}),failure('CONFIGURATION'));
 const valid=empty();assert.ok(projectBusinessPeriodFrame(valid));assert.deepEqual(await call(async()=>Response.json(valid)),valid);
});

function database(){
 const ADMIN_DB=new D1();ADMIN_DB.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)');
 ADMIN_DB.db.prepare('INSERT INTO variant_bindings_state VALUES(1,1,?,?)').run('[]','2026-11-02T12:00:00.000Z');
 ADMIN_DB.db.prepare('INSERT INTO production_costs_state VALUES(1,1,?,?)').run(JSON.stringify(COST_DEFAULTS),'2026-11-02T12:00:00.000Z');
 return {ADMIN_DB};
}
const now=()=>Date.UTC(2026,10,2,12);

test('monthly advancement exposes recognized source codes without changing a saved page or disclosing private fields',async t=>{
 const e=database();t.after(()=>e.ADMIN_DB.db.close());await businessMonth(e,{operation:'read',month:'2026-10'},{},{now});
 const before=e.ADMIN_DB.db.prepare('SELECT * FROM business_month_runs').all();
 for(const [source,expected] of [[failure('HTTP_ERROR',503),'HTTP_503'],[failure('HTTP_ERROR',401),'HTTP_401'],[failure('HTTP_ERROR',500),'HTTP_500'],[failure('HTTP_ERROR',418),'HTTP_ERROR'],[failure('TIMEOUT',200),'TIMEOUT'],[failure('BODY_READ_ERROR',200),'BODY_READ_ERROR'],[failure('FRAME_INVALID',200),'FRAME_INVALID'],[failure('SCOPE_MISMATCH',200),'SCOPE_MISMATCH'],[failure('UNKNOWN_PRIVATE_CODE'),'UNAVAILABLE']]){
  await assert.rejects(businessMonth(e,{operation:'start',month:'2026-10'},{getFinanceBusinessPeriod:async()=>source},{now}),error=>{
   assert.ok(error instanceof BusinessMonthError);assert.equal(error.message,'BUSINESS_MONTH_SOURCE_'+expected);assert.equal(error.status,503);assert.ok(!JSON.stringify(error).includes('UNKNOWN_PRIVATE_CODE'));
   if(expected!=='UNAVAILABLE')assert.deepEqual(error.diagnostic,source.diagnostic);
   return true;
  });
  assert.deepEqual(e.ADMIN_DB.db.prepare('SELECT * FROM business_month_runs').all(),before);assert.equal(e.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM business_month_frames').get().n,0);
 }
 let calls=0;const poisoned=failure('HTTP_ERROR',503);Object.defineProperty(poisoned,'diagnostic',{enumerable:true,get(){calls++;return {code:'PRIVATE',http:503};}});
 await assert.rejects(businessMonth(e,{operation:'start',month:'2026-10'},{getFinanceBusinessPeriod:async()=>poisoned},{now}),error=>error instanceof BusinessMonthError&&error.message==='BUSINESS_MONTH_SOURCE_INVALID');assert.equal(calls,0);
});
