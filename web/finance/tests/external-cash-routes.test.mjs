import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {forwardExternalCash} from '../src/auth-router.mjs';
import {createExternalCashWorker} from '../src/external-cash-worker.mjs';
import {FinanceConnectionError} from '../src/connection-store.mjs';
import {EXTERNAL_CASH_PATH,EXTERNAL_CASH_REQUEST_MAXIMUM,EXTERNAL_CASH_RESPONSE_MAXIMUM} from '../src/external-cash-frame.mjs';
import {cashImportId,cashRead,cashPreview,cashImport,cashWorkspace,cashPreviewFrame,cashImportFrame} from './external-cash-fixture.mjs';

const origin='https://auth.brazacommerce.com.br',appSecret='SYNTHETIC_APP_'+'a'.repeat(40),routerSecret='SYNTHETIC_ROUTER_'+'r'.repeat(40);
const request=(body=cashRead(),headers={})=>new Request(origin+EXTERNAL_CASH_PATH,{method:'POST',headers:{'content-type':'application/json','x-braza-app-key':appSecret,...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const authEnv=handler=>({FINANCE_ROUTER_SECRET:routerSecret,SHOPEE_FINANCE_SERVICE:{fetch:handler}});
const validator={validateInternalApp:input=>input.headers.get('x-braza-app-key')===appSecret};
const directRequest=(body=cashRead(),headers={})=>request(body,{'x-braza-finance-router':routerSecret,...headers});
function chain(active={forwardExternalCash,createExternalCashWorker}){
 const calls={binding:0,read:0,preview:0,mutate:0};
 const worker=active.createExternalCashWorker({readWorkspace:async()=>{calls.read++;return cashWorkspace();},previewImport:async()=>{calls.preview++;return cashPreviewFrame();},mutate:async()=>{calls.mutate++;return cashImportFrame();}});
 const env=authEnv(input=>{calls.binding++;assert.equal(input.url,origin+EXTERNAL_CASH_PATH);assert.equal(input.headers.get('x-braza-finance-router'),routerSecret);for(const name of ['cookie','authorization','x-braza-app-key','x-braza-actor','x-braza-shop-id'])assert.equal(input.headers.get(name),null);return worker.fetch(input,{FINANCE_ROUTER_SECRET:routerSecret,FINANCE_CONNECTION_ENABLED:'false'});});
 return {calls,run:body=>active.forwardExternalCash(request(body,{cookie:'SYNTHETIC_PRIVATE_COOKIE',authorization:'Bearer SYNTHETIC_PRIVATE_TOKEN','x-braza-finance-router':'SYNTHETIC_ATTACKER','x-braza-shop-id':'999','x-braza-actor':'caller'}),env,validator)};
}

test('App→Auth→Finance file evidence works while Shopee is disconnected and strips caller credentials',async()=>{
 const f=chain();for(const [input,expected] of [[cashRead(),cashWorkspace()],[cashPreview(),cashPreviewFrame()],[cashImport(),cashImportFrame()]]){const response=await f.run(input);assert.equal(response.status,200);assert.deepEqual(await response.json(),expected);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('set-cookie'),null);}
 assert.deepEqual(f.calls,{binding:3,read:1,preview:1,mutate:1});
});

test('untrusted App/router requests are refused before their body or any storage capability',async()=>{
 let calls=0;const env=authEnv(()=>{calls++;});const req=request();const result=await forwardExternalCash(req,env,{validateInternalApp:()=>false});assert.equal(result.status,401);assert.equal(req.bodyUsed,false);assert.equal(calls,0);
 const worker=createExternalCashWorker({readWorkspace:()=>{calls++;}}),direct=directRequest(cashRead(),{'x-braza-finance-router':'wrong'});assert.equal((await worker.fetch(direct,{FINANCE_ROUTER_SECRET:routerSecret})).status,403);assert.equal(direct.bodyUsed,false);assert.equal(calls,0);
 assert.equal((await forwardExternalCash(request(),env)).status,401);
});

test('fixed route refuses foreign origins, methods, query, caller tenant and malformed body at both hops',async()=>{
 let calls=0;const env=authEnv(()=>{calls++;return Response.json(cashWorkspace());});
 for(const target of ['https://other.invalid'+EXTERNAL_CASH_PATH,origin+EXTERNAL_CASH_PATH+'/'])assert.equal((await forwardExternalCash(new Request(target,{method:'POST',body:'{}'}),env,validator)).status,404);
 assert.equal((await forwardExternalCash(new Request(origin+EXTERNAL_CASH_PATH),env,validator)).status,405);
 assert.equal((await forwardExternalCash(new Request(origin+EXTERNAL_CASH_PATH+'?shop_id=999',{method:'POST',body:'{}'}),env,validator)).status,400);
 for(const input of [{...cashRead(),shop_id:999},{...cashImport(),actor:'OWNER'},{...cashImport(),confirmed:false},{...cashPreview(),rows:[]},'null','{'])assert.equal((await forwardExternalCash(request(input),env,validator)).status,400);
 assert.equal((await forwardExternalCash(request(cashRead(),{'content-type':'text/plain'}),env,validator)).status,400);assert.equal(calls,0);
 const worker=createExternalCashWorker({readWorkspace:()=>{calls++;}});for(const input of [{...cashRead(),tenant:'caller'},'{'])assert.equal((await worker.fetch(directRequest(input),{FINANCE_ROUTER_SECRET:routerSecret})).status,400);assert.equal(calls,0);
});

test('declared and streamed payload caps apply before forwarding or storage',async()=>{
 let calls=0;const env=authEnv(()=>{calls++;}),worker=createExternalCashWorker({readWorkspace:()=>{calls++;}});
 for(const body of [' '.repeat(EXTERNAL_CASH_REQUEST_MAXIMUM+1),'{}']){
  const headers=body==='{}'?{'content-length':String(EXTERNAL_CASH_REQUEST_MAXIMUM+1)}:{};
  assert.equal((await forwardExternalCash(request(body,headers),env,validator)).status,400);assert.equal((await worker.fetch(directRequest(body,headers),{FINANCE_ROUTER_SECRET:routerSecret})).status,400);
 }
 assert.equal(calls,0);
});

test('Auth rejects redirects, private error fields, oversized replies and mismatched response scopes',async()=>{
 const replies=[()=>new Response(null,{status:302,headers:{location:'https://other.invalid/SYNTHETIC_PRIVATE'}}),()=>new Response('<private>',{headers:{'content-type':'text/html'}}),()=>new Response(' '.repeat(EXTERNAL_CASH_RESPONSE_MAXIMUM+1),{headers:{'content-type':'application/json'}}),()=>Response.json({...cashWorkspace(),private_data:'SYNTHETIC_PRIVATE'}),()=>Response.json(cashPreviewFrame()),()=>Response.json({schema:'external_cash_error_v1',error:'FINANCE_EXTERNAL_CASH_STORAGE_UNAVAILABLE',private:'SYNTHETIC_PRIVATE'},{status:503})];
 for(const reply of replies){const response=await forwardExternalCash(request(),authEnv(reply),validator);assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/PRIVATE|private|location/);}
 const response=await forwardExternalCash(request(),authEnv(()=>Response.json({schema:'external_cash_error_v1',error:'FINANCE_EXTERNAL_CASH_REVISION_CONFLICT'},{status:409,headers:{'set-cookie':'private=cookie'}})),validator);assert.equal(response.status,409);assert.deepEqual(await response.json(),{schema:'external_cash_error_v1',error:'FINANCE_EXTERNAL_CASH_REVISION_CONFLICT'});assert.equal(response.headers.get('set-cookie'),null);
});

test('Finance sanitizes storage exceptions and never echoes arbitrary diagnostics',async()=>{
 for(const [exception,status,code] of [[new FinanceConnectionError('FINANCE_EXTERNAL_CASH_PREVIEW_MISMATCH',409),409,'FINANCE_EXTERNAL_CASH_PREVIEW_MISMATCH'],[new Error('SYNTHETIC_PRIVATE_DATABASE_DETAILS'),502,'FINANCE_EXTERNAL_CASH_UNAVAILABLE']]){
  const worker=createExternalCashWorker({readWorkspace:()=>{throw exception;}}),response=await worker.fetch(directRequest(),{FINANCE_ROUTER_SECRET:routerSecret});assert.equal(response.status,status);assert.deepEqual(await response.json(),{schema:'external_cash_error_v1',error:code});
 }
});

test('Finance caps its serialized response bytes after strict projection',async()=>{
 const frame=cashWorkspace();frame.records=Array.from({length:100},(_,index)=>({record_id:index.toString(16).padStart(64,'0'),source:'NUBANK',date:'2026-11-10',amount_cents:100,currency:'BRL',external_id:'😀'.repeat(64),reference:'😀'.repeat(80),description:'😀'.repeat(120),import_id:cashImportId,review:false}));frame.summary.record_count=100;frame.summary.unmatched_bank_count=100;assert.ok(Buffer.byteLength(JSON.stringify(frame))>EXTERNAL_CASH_RESPONSE_MAXIMUM);
 const worker=createExternalCashWorker({readWorkspace:()=>frame}),response=await worker.fetch(directRequest(),{FINANCE_ROUTER_SECRET:routerSecret});assert.equal(response.status,502);assert.deepEqual(await response.json(),{schema:'external_cash_error_v1',error:'FINANCE_EXTERNAL_CASH_UNAVAILABLE'});
});

test('Auth timeout aborts and cancels a service response arriving after the deadline',async()=>{
 const original=setTimeout;let resolveFetch,canceled=0,signal;globalThis.setTimeout=(callback,delay,...args)=>original(callback,delay===15000?5:delay,...args);
 try{const response=await forwardExternalCash(request(),authEnv(input=>{signal=input.signal;return new Promise(resolve=>{resolveFetch=resolve;});}),validator);assert.equal(response.status,504);assert.equal(signal.aborted,true);resolveFetch(new Response(new ReadableStream({pull(){},cancel(){canceled++;}}),{headers:{'content-type':'application/json'}}));await new Promise(resolve=>setImmediate(resolve));assert.equal(canceled,1);}finally{globalThis.setTimeout=original;}
});

for(const minify of [false,true])test(`private file contract and both guards survive compilation (minify=${minify})`,async()=>{
 const result=await build({stdin:{contents:"export {forwardExternalCash} from './web/finance/src/auth-router.mjs';export {createExternalCashWorker} from './web/finance/src/external-cash-worker.mjs';",resolveDir:process.cwd(),sourcefile:'external-cash-private-guards.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const active=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));const f=chain(active);assert.equal((await f.run(cashRead())).status,200);assert.equal((await f.run(cashPreview())).status,200);assert.equal((await f.run(cashImport())).status,200);assert.deepEqual(f.calls,{binding:3,read:1,preview:1,mutate:1});
});
