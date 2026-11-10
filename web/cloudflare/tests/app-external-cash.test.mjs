import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {getFinanceExternalCash} from '../src/app-external-cash.mjs';
import {EXTERNAL_CASH_PATH,EXTERNAL_CASH_REQUEST_MAXIMUM,EXTERNAL_CASH_RESPONSE_MAXIMUM} from '../../finance/src/external-cash-frame.mjs';
import {cashRead,cashPreview,cashImport,cashWorkspace,cashPreviewFrame,cashImportFrame} from '../../finance/tests/external-cash-fixture.mjs';

const secret='SYNTHETIC_EXTERNAL_CASH_APP_'+'s'.repeat(40),env={APP_INTERNAL_SECRET:secret};
const error=code=>({schema:'external_cash_error_v1',error:'FINANCE_EXTERNAL_CASH_'+code});

test('App file gateway sends one projected command to a fixed internal URL with its own credential',async()=>{
 let calls=0;const result=await getFinanceExternalCash(env,cashRead(),{fetchImpl:async request=>{
  calls++;assert.equal(request.url,'https://auth.brazacommerce.com.br'+EXTERNAL_CASH_PATH);assert.equal(request.method,'POST');assert.equal(request.redirect,'manual');assert.equal(request.headers.get('x-braza-app-key'),secret);assert.deepEqual([...request.headers.keys()].sort(),['accept','content-type','x-braza-app-key']);assert.deepEqual(await request.json(),cashRead());return Response.json(cashWorkspace(),{headers:{'set-cookie':'private=cookie','location':'https://other.invalid'}});
 }});assert.deepEqual(result,{status:200,body:cashWorkspace()});assert.equal(calls,1);
});

test('App rejects tenant/raw-file input, unsafe options and unavailable configuration before transport',async()=>{
 let calls=0;const fetchImpl=()=>{calls++;};
 for(const input of [{...cashRead(),shop_id:999},{...cashPreview(),raw_file:'synthetic'},{...cashImport(),confirmed:false}])assert.deepEqual(await getFinanceExternalCash(env,input,{fetchImpl}),{status:400,body:error('REQUEST_INVALID')});
 for(const config of [{}, {APP_INTERNAL_SECRET:''}])assert.deepEqual(await getFinanceExternalCash(config,cashRead(),{fetchImpl}),{status:503,body:error('CONFIGURATION')});
 for(const options of [{fetchImpl,timeoutMs:4},{fetchImpl,timeoutMs:45001},{fetchImpl,unexpected:true},Object.defineProperty({},'fetchImpl',{get(){throw Error('private');}})])assert.deepEqual(await getFinanceExternalCash(env,cashRead(),options),{status:503,body:error('CONFIGURATION')});
 assert.equal(calls,0);
});

test('App limits normalized request bytes independently of row count',async()=>{
 const input=cashPreview();input.rows=Array.from({length:1000},(_,index)=>({...input.rows[0],line:index+1,description:'😀'.repeat(120),reference:'😀'.repeat(80),external_id:'😀'.repeat(64)}));let calls=0;assert.ok(Buffer.byteLength(JSON.stringify(input))>EXTERNAL_CASH_REQUEST_MAXIMUM);assert.deepEqual(await getFinanceExternalCash(env,input,{fetchImpl:()=>{calls++;}}),{status:413,body:error('BODY_TOO_LARGE')});assert.equal(calls,0);
});

test('App caps declared and streamed responses and rejects redirects, malformed UTF8 and foreign frames',async()=>{
 const replies=[()=>new Response(null,{status:302,headers:{location:'https://other.invalid/private'}}),()=>new Response('private',{headers:{'content-type':'text/html'}}),()=>new Response('private',{headers:{'content-type':'application/json','content-length':String(EXTERNAL_CASH_RESPONSE_MAXIMUM+1)}}),()=>new Response(' '.repeat(EXTERNAL_CASH_RESPONSE_MAXIMUM+1),{headers:{'content-type':'application/json'}}),()=>new Response(Uint8Array.from([0xc3,0x28]),{headers:{'content-type':'application/json'}}),()=>Response.json({...cashWorkspace(),private:'PRIVATE'}),()=>Response.json(cashPreviewFrame()),()=>{throw Error('PRIVATE_PROVIDER_OR_DATABASE');}];
 for(const reply of replies){const result=await getFinanceExternalCash(env,cashRead(),{fetchImpl:reply});assert.deepEqual(result,{status:502,body:error('UNAVAILABLE')});assert.doesNotMatch(JSON.stringify(result),/PRIVATE|private|provider|token/);}
});

test('App retains only finite errors whose HTTP status matches the closed error code',async()=>{
 assert.deepEqual(await getFinanceExternalCash(env,cashRead(),{fetchImpl:()=>Response.json(error('CURSOR_STALE'),{status:409})}),{status:409,body:error('CURSOR_STALE')});
 for(const reply of [()=>Response.json(error('CURSOR_STALE'),{status:503}),()=>Response.json({...error('STORAGE_UNAVAILABLE'),detail:'PRIVATE'},{status:503}),()=>Response.json({schema:'external_cash_error_v1',error:'PRIVATE'},{status:502})])assert.deepEqual(await getFinanceExternalCash(env,cashRead(),{fetchImpl:reply}),{status:502,body:error('UNAVAILABLE')});
});

test('App verifies read scope and mutation operation/request/revision correlation',async()=>{
 for(const [input,frame] of [[cashPreview(),cashPreviewFrame()],[cashImport(),cashImportFrame()]])assert.deepEqual(await getFinanceExternalCash(env,input,{fetchImpl:()=>Response.json(frame)}),{status:200,body:frame});
 for(const frame of [{...cashImportFrame(),request_id:'20000000-0000-4000-8000-000000000001'},{...cashImportFrame(),revision:2}])assert.deepEqual(await getFinanceExternalCash(env,cashImport(),{fetchImpl:()=>Response.json(frame)}),{status:502,body:error('UNAVAILABLE')});
});

test('App deadline aborts a stalled response stream and returns a sanitized timeout',async()=>{
 let canceled=0,signal;const result=await getFinanceExternalCash(env,cashRead(),{timeoutMs:5,fetchImpl:request=>{signal=request.signal;return new Response(new ReadableStream({pull(){},cancel(){canceled++;}}),{headers:{'content-type':'application/json'}});}});assert.deepEqual(result,{status:504,body:error('TIMEOUT')});assert.equal(signal.aborted,true);assert.equal(canceled,1);
});

test('App cancels a response arriving after the request deadline',async()=>{
 let complete,canceled=0,signal;const result=await getFinanceExternalCash(env,cashRead(),{timeoutMs:5,fetchImpl:request=>{signal=request.signal;return new Promise(resolve=>{complete=resolve;});}});assert.deepEqual(result,{status:504,body:error('TIMEOUT')});assert.equal(signal.aborted,true);complete(new Response(new ReadableStream({pull(){},cancel(){canceled++;}}),{headers:{'content-type':'application/json'}}));await new Promise(resolve=>setImmediate(resolve));assert.equal(canceled,1);
});

for(const minify of [false,true])test(`App adapter preserves its request and reply guards after compilation (minify=${minify})`,async()=>{
 const result=await build({entryPoints:['web/cloudflare/src/app-external-cash.mjs'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify}),compiled=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));assert.deepEqual(await compiled.getFinanceExternalCash(env,cashRead(),{fetchImpl:()=>Response.json(cashWorkspace())}),{status:200,body:cashWorkspace()});
});
