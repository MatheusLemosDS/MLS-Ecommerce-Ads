import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {getFinanceBusinessPeriod} from '../../cloudflare/src/app-business-period.mjs';
import {collectionFixture} from '../../cloudflare/tests/business-collection-fixture.mjs';
import {forwardFinancePaymentSample} from '../src/auth-router.mjs';
import {createFinanceWorker} from '../src/connection-worker.mjs';
import {FinanceConnectionError} from '../src/connection-store.mjs';
import {runFinanceBusinessPeriod} from '../src/business-period.mjs';
import {BUSINESS_PERIOD_MISSING_RUN_MAXIMUM,projectBusinessPeriodMissingRun} from '../src/business-period-missing-run.mjs';

const origin='https://auth.brazacommerce.com.br',path='/internal/shopee/finance/business-period';
const run_id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const selection={operation:'step',run_id},start={operation:'start',start_date:'2026-10-01',end_date:'2026-10-15'};
const envelope=()=>({schema:'finance_business_period_missing_run_v1',code:'FINANCE_BUSINESS_RUN_NOT_FOUND',run_id});
const failure={schema:'finance_business_period_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_BUSINESS_RUN_NOT_FOUND',http:404}};
const router='synthetic-missing-run-router-'+'r'.repeat(40),appKey='synthetic-missing-run-app-'+'a'.repeat(40);
const request=(input=selection,route=path,headers={})=>new Request(origin+route,{method:'POST',headers:{'content-type':'application/json','x-braza-app-key':appKey,...headers},body:JSON.stringify(input)});
const validateInternalApp=req=>req.headers.get('x-braza-app-key')===appKey;
const authEnv=fetch=>({FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch}});
const financeEnv={FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'};
const sourceModules={getFinanceBusinessPeriod,forwardFinancePaymentSample,createFinanceWorker,FinanceConnectionError};

function chain(modules=sourceModules,capability,environment=financeEnv){
 const calls={app:0,auth:0,finance:0,provider:0};
 const finance=modules.createFinanceWorker({businessPeriod:capability??(async()=>{calls.finance++;throw new modules.FinanceConnectionError('FINANCE_BUSINESS_RUN_NOT_FOUND',404);}),fetchImpl:async()=>{calls.provider++;throw Error('UNEXPECTED_SYNTHETIC_PROVIDER_READ');}});
 const fetch=async req=>{calls.auth++;assert.equal(req.headers.get('cookie'),null);return modules.forwardFinancePaymentSample(req,authEnv(upstream=>{
  assert.equal(upstream.headers.get('x-braza-app-key'),null);assert.equal(upstream.headers.get('cookie'),null);return finance.fetch(upstream,environment);
 }),{validateInternalApp});};
 return {calls,finance,run:async(input=selection)=>{calls.app++;return modules.getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:fetch,includeVariants:true});}};
}

test('the missing-run projector requires a closed typed envelope and the identical canonical read/step selector',()=>{
 for(const operation of ['read','step'])assert.deepEqual(projectBusinessPeriodMissingRun(envelope(),{operation,run_id}),envelope());
 const getter=Object.defineProperty({...envelope()},'run_id',{get(){throw Error('SYNTHETIC_FORBIDDEN_GETTER');},enumerable:true});
 for(const value of [null,[],{}, {...envelope(),run_id:other},{...envelope(),code:'BUSINESS_PERIOD_RUN_NOT_FOUND'},{...envelope(),schema:'finance_business_period_v1'},{...envelope(),extra:true},{...envelope(),[Symbol()]:true},getter,new Proxy(envelope(),{getPrototypeOf(){throw Error('SYNTHETIC_PROXY');}})])assert.equal(projectBusinessPeriodMissingRun(value,selection),null);
 for(const input of [start,{...selection,shop_id:'123'},{...selection,run_id:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'},{...selection,operation:'unknown'}])assert.equal(projectBusinessPeriodMissingRun(envelope(),input),null);
 assert.ok(Buffer.byteLength(JSON.stringify(envelope()))<BUSINESS_PERIOD_MISSING_RUN_MAXIMUM);
});

test('an absent local Finance source crosses all three authenticated boundaries with one bounded call and no provider read',async t=>{
 const f=await collectionFixture({allPaid:true,windowCounts:[0,0]});
 t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 let sourceCalls=0;
 const privateChain=chain(sourceModules,async(_,options)=>{sourceCalls++;return runFinanceBusinessPeriod(f.financeEnv,{...options,fetchImpl:f.fetchImpl,now:f.now});});
 for(const operation of ['read','step'])assert.deepEqual(await privateChain.run({operation,run_id}),failure);
 assert.equal(sourceCalls,2);assert.deepEqual(privateChain.calls,{app:2,auth:2,finance:0,provider:0});
 assert.equal(f.calls.list.length+f.calls.detail.length+f.calls.payment.length,0);
 assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) n FROM finance_business_period_runs').get().n,0);
});

test('Finance emits absence only for the exact exception type, code, status and business read/step route',async()=>{
 for(const error of [new FinanceConnectionError('FINANCE_BUSINESS_RUN_NOT_FOUND',403),new FinanceConnectionError('FINANCE_BUSINESS_AUTH_REQUIRED',404),Object.assign(Error('SYNTHETIC_PRIVATE_TEXT'),{code:'FINANCE_BUSINESS_RUN_NOT_FOUND',status:404}),{code:'FINANCE_BUSINESS_RUN_NOT_FOUND',status:404}]){
  const f=chain(sourceModules,async()=>{throw error;});
  const response=await f.finance.fetch(request(selection,path,{'x-braza-finance-router':router}),financeEnv);assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/RUN_NOT_FOUND|SYNTHETIC_PRIVATE/);
 }
 const missing=async()=>{throw new FinanceConnectionError('FINANCE_BUSINESS_RUN_NOT_FOUND',404);};
 const worker=createFinanceWorker({businessPeriod:missing,storePeriod:missing,fetchImpl:async()=>{throw Error('UNEXPECTED');}});
 for(const [route,input] of [[path,start],['/internal/shopee/finance/store-period',selection]]){
  const response=await worker.fetch(request(input,route,{'x-braza-finance-router':router}),financeEnv);assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/RUN_NOT_FOUND/);
 }
 const returned=chain(sourceModules,async()=>envelope());assert.notDeepEqual(await returned.run(),failure,'returning an error-like value is not the trusted collector exception');
});

test('missing-run handling does not bypass App or router authentication and never starts a source',async()=>{
 const f=chain();
 const auth=await forwardFinancePaymentSample(request(selection,path,{'x-braza-app-key':'wrong'}),authEnv(()=>{assert.fail('unauthenticated App must not forward');}),{validateInternalApp});assert.equal(auth.status,401);
 assert.equal((await f.finance.fetch(request(),financeEnv)).status,403);
 assert.equal((await f.finance.fetch(request(selection,path,{'x-braza-finance-router':router}),{...financeEnv,FINANCE_CONNECTION_ENABLED:'false'})).status,503);
 assert.deepEqual(f.calls,{app:0,auth:0,finance:0,provider:0});
});

test('Auth and App reject generic 404, mismatched scope, extras and wrong status as recovery evidence',async()=>{
 const candidates=[
  [{error:'NOT_FOUND'},404],
  [{...envelope(),run_id:other},404],
  [{...envelope(),access_token:'SYNTHETIC_FORBIDDEN_PAYLOAD'},404],
  [{...envelope(),code:'FINANCE_STORE_UNAVAILABLE'},404],
  ...[200,400,401,403,409,429,500,502,503,504].map(status=>[envelope(),status]),
 ];
 for(const [value,status] of candidates){
  const output=()=>Response.json(value,{status});
  const app=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},selection,{fetchImpl:async()=>output()});assert.notEqual(app.diagnostic?.code,'FINANCE_BUSINESS_RUN_NOT_FOUND');assert.doesNotMatch(JSON.stringify(app),/SYNTHETIC_FORBIDDEN/);
  const auth=await forwardFinancePaymentSample(request(),authEnv(async()=>output()),{validateInternalApp});assert.notEqual(auth.status,404);assert.doesNotMatch(await auth.text(),/RUN_NOT_FOUND|SYNTHETIC_FORBIDDEN/);
 }
 const appStart=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},start,{fetchImpl:async()=>Response.json(envelope(),{status:404})});assert.equal(appStart.diagnostic.code,'FINANCE_BUSINESS_HTTP_ERROR');
 const authStart=await forwardFinancePaymentSample(request(start),authEnv(async()=>Response.json(envelope(),{status:404})),{validateInternalApp});assert.equal(authStart.status,502);
});

test('missing-run bodies have a dedicated 512-byte cap at App and Auth, including streams',async()=>{
 const serialized=JSON.stringify(envelope()),cap=BUSINESS_PERIOD_MISSING_RUN_MAXIMUM;
 const output=(size,declared)=>new Response(serialized+' '.repeat(size-serialized.length),{status:404,headers:{'content-type':'application/json',...(declared?{'content-length':String(size)}:{})}});
 for(const declared of [false,true]){
  const app=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},selection,{fetchImpl:async()=>output(cap,declared)});assert.deepEqual(app,failure);
  const auth=await forwardFinancePaymentSample(request(),authEnv(async()=>output(cap,declared)),{validateInternalApp});assert.equal(auth.status,404);assert.deepEqual(await auth.json(),envelope());
  const appRejected=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},selection,{fetchImpl:async()=>output(cap+1,declared)});assert.equal(appRejected.diagnostic.code,'FINANCE_BUSINESS_BODY_LIMIT');
  const authRejected=await forwardFinancePaymentSample(request(),authEnv(async()=>output(cap+1,declared)),{validateInternalApp});assert.equal(authRejected.status,502);
 }
 for(const output of [()=>new Response('{}',{status:404,headers:{'content-type':'text/html'}}),()=>new Response('{',{status:404,headers:{'content-type':'application/json'}}),()=>Response.redirect('https://synthetic-invalid.example/never',302)]){
  const app=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},selection,{fetchImpl:async()=>output()});assert.notEqual(app.diagnostic.code,'FINANCE_BUSINESS_RUN_NOT_FOUND');
  const auth=await forwardFinancePaymentSample(request(),authEnv(async()=>output()),{validateInternalApp});assert.equal(auth.status,502);
 }
});

test('a stalled missing-run response remains subject to the existing App and Auth deadlines',async t=>{
 const next=()=>new Promise(resolve=>setImmediate(resolve));
 t.mock.timers.enable({apis:['setTimeout']});let appCancelled=0;
 const appPending=getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},selection,{timeoutMs:5,fetchImpl:async()=>new Response(new ReadableStream({pull(){},cancel(){appCancelled++;return new Promise(()=>{});}}),{status:404,headers:{'content-type':'application/json'}})});
 await next();t.mock.timers.tick(5);const app=await appPending;assert.equal(app.diagnostic.code,'FINANCE_BUSINESS_TIMEOUT');assert.equal(appCancelled,1);
 let authCancelled=0,signal;
 const authPending=forwardFinancePaymentSample(request(),authEnv(async req=>{signal=req.signal;return new Response(new ReadableStream({pull(){},cancel(){authCancelled++;return new Promise(()=>{});}}),{status:404,headers:{'content-type':'application/json'}});}),{validateInternalApp});
 await next();t.mock.timers.tick(35000);const auth=await authPending;assert.equal(auth.status,502);assert.equal(authCancelled,1);assert.equal(signal.aborted,true);t.mock.timers.reset();
});

for(const minify of [false,true])test(`bundled App/Auth/Finance boundaries preserve typed absence and exact exception provenance (minify=${minify})`,async()=>{
 const compiled=await build({stdin:{contents:"export {getFinanceBusinessPeriod} from './web/cloudflare/src/app-business-period.mjs';export {forwardFinancePaymentSample} from './web/finance/src/auth-router.mjs';export {createFinanceWorker} from './web/finance/src/connection-worker.mjs';export {FinanceConnectionError} from './web/finance/src/connection-store.mjs';",resolveDir:process.cwd(),sourcefile:'missing-run-private-boundaries.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const modules=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const f=chain(modules);assert.deepEqual(await f.run(),failure);assert.deepEqual(f.calls,{app:1,auth:1,finance:1,provider:0});
 const forged=chain(modules,async()=>{throw Object.assign(Error('SYNTHETIC_FORGED_ERROR'),{code:'FINANCE_BUSINESS_RUN_NOT_FOUND',status:404});});assert.notDeepEqual(await forged.run(),failure);
});

for(const minify of [false,true])test(`generated Auth/Finance Workers preserve the missing-run contract using real SQLite (minify=${minify})`,async t=>{
 const compile=async path=>{
  const source=readFileSync(new URL(path,import.meta.url),'utf8'),result=await build({stdin:{contents:source,sourcefile:path},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
  return (await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))).default;
 };
 const [auth,finance]=await Promise.all([compile('../../../docs/finance-connection-delivery/auth-worker.mjs'),compile('../../../docs/finance-connection-delivery/finance-worker.mjs')]);
 const f=await collectionFixture({allPaid:true,windowCounts:[0,0]});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 const original=globalThis.fetch;let provider=0,bindings=0;
 globalThis.fetch=async()=>{provider++;throw Error('SYNTHETIC_UNEXPECTED_EXTERNAL_READ');};
 try{
  const transport=request=>auth.fetch(request,{APP_INTERNAL_SECRET:appKey,FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:upstream=>{bindings++;return finance.fetch(upstream,{...f.financeEnv,FINANCE_ROUTER_SECRET:router});}}});
  const result=await getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},selection,{fetchImpl:transport,includeVariants:true});assert.deepEqual(result,failure);assert.equal(provider,0);assert.equal(bindings,1);
  assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) n FROM finance_business_period_runs').get().n,0);
 }finally{globalThis.fetch=original;}
});
