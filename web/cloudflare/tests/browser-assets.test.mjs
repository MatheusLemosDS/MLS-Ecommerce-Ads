import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {build} from 'esbuild';
import {MLS_BROWSER_ASSET_MANIFEST as manifest} from '../src/browser-assets-manifest.mjs';
import {browserAssetScript,serveMlsBrowserAsset} from '../src/browser-assets.mjs';
import {BUSINESS_MONTH_CLIENT} from '../src/business-month-client.mjs';
import {createLocalBrowserAssets,verifyBrowserAssets} from '../../../tools/browser_assets.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const bank=manifest.assets.find(row=>row.id==='bank'),month=manifest.assets.find(row=>row.id==='month');
const request=(row=bank,method='GET')=>new Request('https://public.fixture'+row.path,{method,headers:{cookie:'synthetic-cookie-must-not-cross-assets',authorization:'synthetic-not-forwarded'}});

test('the monthly browser asset is byte-identical to the unchanged legacy client after the existing HTML safety escapes',()=>{
 const bytes=readFileSync(path.join(root,'dist','browser-assets',...month.path.slice(1).split('/')));
 const previouslyEmitted=BUSINESS_MONTH_CLIENT.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,character=>'\\u'+character.charCodeAt(0).toString(16).padStart(4,'0'));
 assert.deepEqual(bytes,Buffer.from(previouslyEmitted));assert.equal(createHash('sha256').update(bytes).digest('hex'),month.sha256);
 const inventory=verifyBrowserAssets(root);assert.deepEqual(inventory,manifest);
 for(const row of manifest.assets){const tag=browserAssetScript(row.id);assert.equal(tag,'<script src="'+row.path+'" integrity="'+row.integrity+'" crossorigin="anonymous"></script>');assert.doesNotMatch(tag,/\b(async|defer)\b/);}
 assert.throws(()=>browserAssetScript('private'),/BROWSER_ASSET_MANIFEST_INVALID/);
});

test('public serving verifies bytes, fixes safe immutable headers and strips incoming credentials',async()=>{
 const local=createLocalBrowserAssets(root),calls=[];
 const env={ASSETS:{fetch(input){calls.push(input);return local.fetch(input);}}};
 const get=await serveMlsBrowserAsset(request(),env);assert.equal(get.status,200);assert.equal(get.headers.get('content-type'),'text/javascript; charset=utf-8');assert.equal(get.headers.get('cache-control'),'public, max-age=31536000, immutable');assert.equal(get.headers.get('x-content-type-options'),'nosniff');assert.equal(get.headers.get('set-cookie'),null);assert.equal((await get.arrayBuffer()).byteLength,bank.bytes);
 const head=await serveMlsBrowserAsset(request(bank,'HEAD'),env);assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('content-length'),String(bank.bytes));
 assert.equal(calls.length,2);for(const call of calls){assert.equal(call.method,'GET');assert.equal(call.headers.get('cookie'),null);assert.equal(call.headers.get('authorization'),null);assert.equal(call.headers.get('accept-encoding'),'identity');}
 assert.equal(await serveMlsBrowserAsset(new Request('https://public.fixture/api/admin/state'),env),null);
 for(const input of [new Request('https://public.fixture/assets/mls/unknown.js'),new Request('https://public.fixture'+bank.path+'?file=private')])assert.equal((await serveMlsBrowserAsset(input,env)).status,404);
 assert.equal((await serveMlsBrowserAsset(request(bank,'POST'),env)).status,405);assert.equal(calls.length,2,'rejected requests must never cross ASSETS');
});

test('missing bindings, missing files and changed file bytes cannot offer executable actions',async()=>{
 for(const env of [{},{ASSETS:{fetch:async()=>new Response(null,{status:404})}},{ASSETS:{fetch:async()=>new Response(new Uint8Array(bank.bytes).fill(32))}}]){
  const value=await serveMlsBrowserAsset(request(),env);assert.equal(value.status,503);assert.equal(value.headers.get('cache-control'),'no-store');assert.match(value.headers.get('content-type'),/application\/json/);const text=await value.text();assert.match(text,/BROWSER_ASSET_/);assert.doesNotMatch(text,/brazaBankReconciliation|createBankReconciliationController|<script/);
 }
});

test('fetch and body deadlines abort without awaiting an indefinitely pending cancellation',async()=>{
 let signal,resolveFetch,lateCancelled=false;
 const pending=new Promise(resolve=>{resolveFetch=resolve;}),start=Date.now();
 const absent=await serveMlsBrowserAsset(request(),{ASSETS:{fetch:input=>{signal=input.signal;return pending;}}},{deadlineMs:20});
 assert.equal(absent.status,503);assert.equal((await absent.json()).error,'BROWSER_ASSET_TIMEOUT');assert.equal(signal.aborted,true);assert.ok(Date.now()-start<2000);
 resolveFetch(new Response(new ReadableStream({cancel(){lateCancelled=true;}})));await new Promise(resolve=>setImmediate(resolve));assert.equal(lateCancelled,true);
 let bodyCancelled=false;
 const stream=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){bodyCancelled=true;return new Promise(()=>{});}});
 const hanging=await serveMlsBrowserAsset(request(),{ASSETS:{fetch:async()=>new Response(stream)}},{deadlineMs:20});assert.equal(hanging.status,503);assert.equal((await hanging.json()).error,'BROWSER_ASSET_TIMEOUT');assert.equal(bodyCancelled,true);
});

test('endless empty chunks and oversized bodies are cancelled within their explicit byte limits',async()=>{
 for(const mode of ['empty','oversized']){
  let cancelled=false;const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(mode==='empty'?0:bank.bytes+1));},cancel(){cancelled=true;}});
  const value=await serveMlsBrowserAsset(request(),{ASSETS:{fetch:async()=>new Response(stream)}},{deadlineMs:200});assert.equal(value.status,503);assert.equal((await value.json()).error,'BROWSER_ASSET_BYTES_MISMATCH');assert.equal(cancelled,true);
 }
});

for(const minify of [false,true])test('compiled Worker serves the exact asset inventory before session/database access (minify='+minify+')',{timeout:20000},async()=>{
 const result=await build({entryPoints:[path.join(root,'dist','app-worker.mjs')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify,logLevel:'silent'}),worker=(await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))).default;
 let databaseCalls=0;const local=createLocalBrowserAssets(root),env={ASSETS:local,ADMIN_DB:{prepare(){databaseCalls++;throw Error('ASSET_MUST_NOT_READ_D1');}}};
 const globals=vm.createContext({document:{getElementById(){return null;}},console,URL,URLSearchParams,TextEncoder,TextDecoder,crypto,setTimeout,clearTimeout,AbortController});
 for(const row of manifest.assets){const response=await worker.fetch(request(row),env);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);assert.equal(bytes.length,row.bytes);new vm.Script(bytes.toString('utf8'));if(row.id!=='month')vm.runInContext(bytes.toString('utf8'),globals);}
 assert.equal(vm.runInContext('typeof brazaBankReconciliation.start',globals),'function');assert.equal(vm.runInContext('typeof brazaOrderOperations.start',globals),'function');assert.equal(databaseCalls,0);
 const missing=await worker.fetch(request(),{...env,ASSETS:{fetch:async()=>new Response(null,{status:404})}});assert.equal(missing.status,503);
 const wrong=await worker.fetch(request(),{...env,ASSETS:{fetch:async()=>new Response(new Uint8Array(bank.bytes))}});assert.equal(wrong.status,503);assert.equal(databaseCalls,0);
});
