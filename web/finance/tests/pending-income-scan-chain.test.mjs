import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {forwardFinancePaymentSample} from '../src/auth-router.mjs';
import {createFinanceWorker} from '../src/connection-worker.mjs';
import {projectPendingIncomeScanFrame} from '../src/pending-income-frame.mjs';
import {FinanceConnectionError} from '../src/connection-store.mjs';

const origin='https://auth.brazacommerce.com.br',path='/internal/shopee/finance/income-detail',stamp=1793458800,appKey='SYNTHETIC_SCAN_APP_'+'a'.repeat(40),routerKey='SYNTHETIC_SCAN_ROUTER_'+'r'.repeat(40),scanId='00000000-0000-4000-8000-000000000001',basis='CURRENT_PENDING_PAGINATED_MUTABLE_SOURCE_NOT_MONTH_OR_BANK_RECEIPT';
const hash=value=>createHash('sha256').update(value).digest('hex');
const rows=(count=100,large=false)=>Array.from({length:count},(_,index)=>({entry_hash:hash('synthetic-entry-'+index),order_hash:hash('synthetic-order-'+index),currency:'BRL',status:large?'P'.repeat(160):'Pendente',description:large?'D'.repeat(160):'Order Income',payment_method:large?'M'.repeat(160):'PIX',estimated_escrow_raw:'1',estimated_escrow_cents:100,estimated_payout_time:null,creation_time:null}));
const legacy=()=>({schema:'finance_income_detail_v1',checked_at:stamp,region:'BRAZIL',shop_type:'LOCAL',income_status:'PENDING',page_size:100,returned_count:100,has_more:true,next_cursor_present:true,rows:rows(),basis:'CURRENT_PENDING_PROVIDER_INCOME_DETAIL_NOT_MONTH_OR_BANK_RECEIPT'});
const completed=(count=100,large=false)=>({schema:'finance_pending_income_scan_v1',checked_at:stamp,scan:{scan_id:scanId,state:'COMPLETE',started_at:stamp-60,updated_at:stamp,completed_at:stamp,date_from:'2026-10-30',date_to:'2026-10-31',pages_read:Math.max(1,Math.ceil(count/100)),unique_entries:count,unique_orders:count,duplicate_entries:0,conflicting_orders:0,next_attempt_at:stamp+900,error:null},report:{scan_id:scanId,started_at:stamp-60,completed_at:stamp,source_oldest_at:stamp-59,source_latest_at:stamp,pages_read:Math.max(1,Math.ceil(count/100)),rows:rows(count,large),unique_orders:count,duplicate_entries:0,conflicting_orders:0,known_amount_cents:count*100,unknown_amount_count:0,amount_complete:true,basis},basis});
const modules={forwardFinancePaymentSample,createFinanceWorker};
function request({body={operation:'step'},contract='pending-scan-v1',headers={},url=origin+path,method='POST'}={}){
 return new Request(url,{method,headers:{'content-type':'application/json','x-braza-app-key':appKey,...(contract===null?{}:{'x-braza-income-contract':contract}),...headers},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
}
function chain(active=modules,{frame=completed(),legacyFrame=legacy(),financeOverrides={},authResponse=null}={}){
 const calls={auth:0,scan:0,legacy:0,provider:0},seen=[],finance=active.createFinanceWorker({incomeDetail:async()=>{calls.legacy++;return legacyFrame;},pendingIncomeScan:async (_env,input,options)=>{calls.scan++;seen.push(input);assert.equal(options.now(),stamp*1000);assert.equal(typeof options.fetchImpl,'function');return frame;},fetchImpl:async()=>{calls.provider++;throw Error('SYNTHETIC_UNEXPECTED_PROVIDER_READ');},now:()=>stamp*1000,...financeOverrides});
 const financeEnv={FINANCE_ROUTER_SECRET:routerKey,FINANCE_CONNECTION_ENABLED:'true'},authEnv={FINANCE_ROUTER_SECRET:routerKey,SHOPEE_FINANCE_SERVICE:{fetch:async input=>{
  calls.auth++;assert.equal(input.url,origin+path);assert.equal(input.method,'POST');assert.equal(input.redirect,'manual');assert.equal(input.headers.get('x-braza-finance-router'),routerKey);
  for(const name of ['x-braza-app-key','cookie','authorization','origin','x-private-debug'])assert.equal(input.headers.get(name),null);
  assert.ok(input.signal instanceof AbortSignal);
  if(authResponse)return authResponse(input);
  return finance.fetch(input,financeEnv);
 }}};
 return {calls,seen,finance,financeEnv,run:input=>active.forwardFinancePaymentSample(input??request(),authEnv,{validateInternalApp:req=>req.headers.get('x-braza-app-key')===appKey})};
}

test('negotiated Pending scan crosses Auth and Finance with exact operations and no cursor or caller credentials',async()=>{
 const f=chain(),response=await f.run(request({headers:{cookie:'SYNTHETIC_COOKIE',authorization:'SYNTHETIC_AUTH',origin:'https://private.invalid','x-private-debug':'SYNTHETIC_DEBUG'}}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),completed());assert.deepEqual(f.calls,{auth:1,scan:1,legacy:0,provider:0});assert.deepEqual(f.seen,[{operation:'step'}]);
 const read=await f.run(request({body:{operation:'read'}}));assert.equal(read.status,200);assert.ok(projectPendingIncomeScanFrame(await read.json()));assert.deepEqual(f.seen,[{operation:'step'},{operation:'read'}]);assert.equal(f.calls.provider,0);
});

test('absence of negotiation preserves the exact first-page DTO and legacy source',async()=>{
 const f=chain(),response=await f.run(request({contract:null,body:{}}));assert.equal(response.status,200);assert.equal(await response.text(),JSON.stringify(legacy()));assert.deepEqual(f.calls,{auth:1,scan:0,legacy:1,provider:0});
 const mismatched=chain(modules,{authResponse:async()=>Response.json(legacy())});assert.equal((await mismatched.run()).status,502,'negotiated clients never accept a legacy frame as a full scan');
});

test('scan negotiation rejects unknown headers, malformed bodies, queries and identities before the Finance source',async()=>{
 for(const input of [
  {contract:'pending-scan-v2'},{contract:'pending-scan-v1, pending-scan-v1'},{contract:''},{body:{}},{body:{operation:'reset'}},{body:{operation:'step',cursor:'SYNTHETIC_PRIVATE_CURSOR'}},{body:{operation:'step',shop_id:123}},{body:[]},{body:null},{body:'{"operation":"step"'.padEnd(129,'x')},{url:origin+path+'?cursor=SYNTHETIC_PRIVATE_CURSOR'},{method:'GET'},
 ]){const f=chain(),response=await f.run(request(input));assert.equal(response.status,input.method==='GET'?405:400,JSON.stringify(input));assert.equal(f.calls.auth,0);assert.equal(f.calls.scan,0);assert.equal(f.calls.legacy,0);}
 const f=chain();assert.equal((await f.run(request({headers:{'x-braza-app-key':'invalid'}}))).status,401);assert.equal(f.calls.auth,0);
});

test('Finance independently validates scan negotiation, router trust and bounded JSON bodies',async()=>{
 const f=chain(),direct=options=>{const r=request(options);return new Request(r,{headers:{...Object.fromEntries(r.headers),'x-braza-finance-router':routerKey}});};
 for(const options of [{contract:'bad'},{body:{operation:'read',cursor:'SYNTHETIC_PRIVATE_CURSOR'}},{contract:null,body:{operation:'read'}},{body:'x'.repeat(129)},{headers:{'content-type':'text/plain'}},{url:origin+path+'?operation=read'}])assert.equal((await f.finance.fetch(direct(options),f.financeEnv)).status,400);
 assert.equal((await f.finance.fetch(request(),f.financeEnv)).status,403);assert.equal(f.calls.scan,0);assert.equal(f.calls.legacy,0);
});

test('the larger Pending response allowance is negotiated while old first-page responses retain 256KiB',async()=>{
 const frame=completed(1000,true),body=JSON.stringify(frame);assert.ok(Buffer.byteLength(body)>262144);assert.ok(Buffer.byteLength(body)<1048576);assert.ok(projectPendingIncomeScanFrame(frame));
 const f=chain(modules,{frame}),response=await f.run();assert.equal(response.status,200);assert.deepEqual(await response.json(),frame);
 const v1=chain(modules,{authResponse:async()=>new Response(body,{headers:{'content-type':'application/json','content-length':String(Buffer.byteLength(body))}})});assert.equal((await v1.run(request({contract:null,body:{}}))).status,502);
 for(const declared of [false,true]){
  let canceled=false;const oversized=new Uint8Array(1048577).fill(32),large=chain(modules,{authResponse:async()=>new Response(new ReadableStream({start(controller){controller.enqueue(oversized);},cancel(){canceled=true;}}),{headers:{'content-type':'application/json',...(declared?{'content-length':String(oversized.length)}:{})}})});
  const failure=await large.run();assert.equal(failure.status,502);assert.equal(canceled,true);assert.doesNotMatch(await failure.text(),/SYNTHETIC_|cursor|order_sn|access_token/);
 }
});

test('Pending scan failures and redirects preserve only the bounded legacy diagnostic vocabulary',async()=>{
 const f=chain(modules,{financeOverrides:{pendingIncomeScan:async()=>{const error=new FinanceConnectionError('FINANCE_INCOME_DETAIL_UPSTREAM_HTTP',502);Object.defineProperties(error,{upstream_status:{value:403},upstream_diagnostic:{value:'JSON_PERMISSION_REJECTED'},provider_body:{value:'SYNTHETIC_PRIVATE_CURSOR_TOKEN_ORDER'}});throw error;}}}),failure=await f.run(),body=await failure.json();assert.equal(failure.status,502);assert.equal(body.diagnostic.http,403);assert.equal(body.diagnostic.response_kind,'JSON_PERMISSION_REJECTED');assert.doesNotMatch(JSON.stringify(body),/SYNTHETIC_|cursor|order_sn|access_token/);
 const redirected=chain(modules,{authResponse:async()=>new Response(null,{status:302,headers:{location:'https://private.invalid/SYNTHETIC_PRIVATE'}})});const response=await redirected.run();assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/SYNTHETIC_|location/);
});

test('a stalled scan relay is aborted at the existing 45-second outer deadline without retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let entered,retained;const started=new Promise(resolve=>entered=resolve),f=chain(modules,{authResponse:input=>{retained=input;entered();return new Promise(()=>{});}}),pending=f.run();await started;
 t.mock.timers.tick(44999);assert.equal(retained.signal.aborted,false);t.mock.timers.tick(1);const response=await pending;assert.equal(response.status,502);assert.equal(retained.signal.aborted,true);assert.equal(f.calls.auth,1);
});

for(const minify of [false,true])test(`negotiated Pending scan survives private-handler bundling without changing legacy defaults (minify=${minify})`,async()=>{
 const result=await build({stdin:{contents:"export {forwardFinancePaymentSample} from './web/finance/src/auth-router.mjs';export {createFinanceWorker} from './web/finance/src/connection-worker.mjs';",resolveDir:process.cwd(),sourcefile:'pending-scan-private-boundaries.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify}),active=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 const f=chain(active);assert.deepEqual(await(await f.run()).json(),completed());assert.equal(await(await f.run(request({contract:null,body:{}}))).text(),JSON.stringify(legacy()));assert.deepEqual(f.calls,{auth:2,scan:1,legacy:1,provider:0});
});
