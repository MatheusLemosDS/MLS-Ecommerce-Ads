import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {getFinanceIncomeDetail} from '../../cloudflare/src/app-income-detail.mjs';
import {forwardFinancePaymentSample} from '../src/auth-router.mjs';
import {createFinanceWorker} from '../src/connection-worker.mjs';
import {FinanceConnectionError} from '../src/connection-store.mjs';
import {projectIncomeDetailDiagnostic,incomeDetailFailureDiagnostic} from '../src/income-detail-diagnostic.mjs';

const appKey='SYNTHETIC_PRIVATE_APP_'+'a'.repeat(40),router='SYNTHETIC_PRIVATE_ROUTER_'+'r'.repeat(40),path='/internal/shopee/finance/income-detail';
const modules={getFinanceIncomeDetail,forwardFinancePaymentSample,createFinanceWorker};
const request=()=>new Request('https://auth.brazacommerce.com.br'+path,{method:'POST',headers:{'content-type':'application/json','x-braza-app-key':appKey},body:'{}'});
function chain(source,active=modules){
 const calls={app:0,auth:0,finance:0},finance=active.createFinanceWorker({incomeDetail:async()=>{calls.finance++;return source();},fetchImpl:async()=>{throw Error('unexpected provider');},now:()=>1793458800000});
 const authEnv={FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async input=>{calls.auth++;assert.equal(input.headers.get('x-braza-app-key'),null);return finance.fetch(input,{FINANCE_ROUTER_SECRET:router,FINANCE_CONNECTION_ENABLED:'true'});}}};
 return {calls,run:()=>active.getFinanceIncomeDetail({APP_INTERNAL_SECRET:appKey},{fetchImpl:async input=>{calls.app++;return active.forwardFinancePaymentSample(input,authEnv,{validateInternalApp:req=>req.headers.get('x-braza-app-key')===appKey});}})};
}
const rejected=()=>{const error=new FinanceConnectionError('FINANCE_INCOME_DETAIL_UPSTREAM_HTTP',502);Object.defineProperties(error,{upstream_status:{value:403},upstream_diagnostic:{value:'JSON_PERMISSION_REJECTED'},provider_body:{value:'SYNTHETIC_PRIVATE_ORDER_AND_TOKEN'}});throw error;};

test('Finance→Auth→App retain the provider HTTP cause without exposing body or credentials',async()=>{
 const f=chain(rejected),result=await f.run();assert.equal(result.status,'UNAVAILABLE');assert.equal(result.diagnostic.code,'FINANCE_INCOME_DETAIL_HTTP_ERROR');assert.equal(result.diagnostic.http,502);
 assert.deepEqual(result.diagnostic.cause,{schema:'finance_income_detail_diagnostic_v1',source:'SHOPEE_FINANCE_INCOME_DETAIL',stage:'PROVIDER_HTTP',code:'FINANCE_INCOME_DETAIL_UPSTREAM_HTTP',http:403,provider_code:null,response_kind:'JSON_PERMISSION_REJECTED'});
 assert.deepEqual(f.calls,{app:1,auth:1,finance:1});assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_PRIVATE|order_sn|access_token|request_id/);
});

test('the private Auth diagnostic branch rejects extra fields and preserves no arbitrary error vocabulary',async()=>{
 for(const diagnostic of [{...incomeDetailFailureDiagnostic(null),message:'SYNTHETIC_PRIVATE'},{...incomeDetailFailureDiagnostic(null),code:'SYNTHETIC_PRIVATE'},null]){
  const response=await forwardFinancePaymentSample(request(),{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async()=>Response.json({error:'FINANCE_INCOME_DETAIL_UNAVAILABLE',diagnostic,message:'SYNTHETIC_PRIVATE'},{status:502})}},{validateInternalApp:()=>true});
  const body=await response.json();assert.equal(response.status,502);assert.deepEqual(body.diagnostic,incomeDetailFailureDiagnostic(null));assert.doesNotMatch(JSON.stringify(body),/SYNTHETIC_PRIVATE/);
 }
});

test('typed diagnostics reject provider-controlled fields, fake stages and getters',()=>{
 const valid=incomeDetailFailureDiagnostic({code:'FINANCE_INCOME_DETAIL_INVALID_RESPONSE',upstream_diagnostic:'INCOME_LIST_INVALID'});assert.deepEqual(projectIncomeDetailDiagnostic(valid),valid);
 for(const value of [{...valid,stage:'AUTHORIZATION'},{...valid,http:700},{...valid,provider_code:'PRIVATE_PROVIDER_ORDER'},{...valid,response_kind:'PRIVATE_BODY'},{...valid,body:'PRIVATE'},Object.defineProperty({...valid},'code',{get(){throw Error('PRIVATE_GETTER');}})])assert.equal(projectIncomeDetailDiagnostic(value),null);
 assert.deepEqual(incomeDetailFailureDiagnostic(Object.defineProperty({},'code',{get(){throw Error('PRIVATE_GETTER');}})),incomeDetailFailureDiagnostic(null));
});

test('the App limits non200 diagnostic bodies, rejects foreign envelopes and retains legacy HTTP errors',async()=>{
 for(const response of [Response.json({error:'OTHER',diagnostic:incomeDetailFailureDiagnostic(null)},{status:502}),new Response('x'.repeat(2049),{status:502,headers:{'content-type':'application/json'}}),new Response('<private>',{status:403,headers:{'content-type':'text/html'}})]){
  const result=await getFinanceIncomeDetail({APP_INTERNAL_SECRET:appKey},{fetchImpl:async()=>response});assert.equal(result.diagnostic.code,'FINANCE_INCOME_DETAIL_HTTP_ERROR');assert.equal(Object.hasOwn(result.diagnostic,'cause'),false);assert.doesNotMatch(JSON.stringify(result),/private/);
 }
});

for(const minify of [false,true])test(`three-worker Pending diagnostics survive bundling (minify=${minify})`,async()=>{
 const result=await build({stdin:{contents:"export {getFinanceIncomeDetail} from './web/cloudflare/src/app-income-detail.mjs';export {forwardFinancePaymentSample} from './web/finance/src/auth-router.mjs';export {createFinanceWorker} from './web/finance/src/connection-worker.mjs';export {FinanceConnectionError} from './web/finance/src/connection-store.mjs';",resolveDir:process.cwd(),sourcefile:'pending-private-boundaries.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify}),active=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 const f=chain(()=>{const error=new active.FinanceConnectionError('FINANCE_INCOME_DETAIL_UPSTREAM_HTTP',502);Object.defineProperty(error,'upstream_status',{value:404});throw error;},active),failure=await f.run();assert.equal(failure.diagnostic.cause.http,404);assert.equal(failure.diagnostic.cause.stage,'PROVIDER_HTTP');assert.deepEqual(f.calls,{app:1,auth:1,finance:1});
});
