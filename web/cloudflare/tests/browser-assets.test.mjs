import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {build} from 'esbuild';
import {MLS_BROWSER_ASSET_MANIFEST as manifest} from '../src/browser-assets-manifest.mjs';
import {browserAssetScript,browserWorkspaceFailureScript,serveMlsBrowserAsset} from '../src/browser-assets.mjs';
import {CLIENT} from '../src/admin-client.mjs';
import {BUSINESS_MONTH_CLIENT} from '../src/business-month-client.mjs';
import {PRODUCTION_COST_PERIODS_CLIENT} from '../src/production-cost-periods-view.mjs';
import {PRODUCTION_CONFIRMATION_PROPOSAL_CLIENT} from '../src/production-confirmation-proposal-view.mjs';
import {INCURRED_PRODUCTION_CLIENT} from '../src/incurred-production-view.mjs';
import {PRODUCTION_DAILY_FINANCE_CLIENT} from '../src/production-daily-finance-view.mjs';
import {PRODUCTION_WEEKLY_CLIENT} from '../src/production-weekly-view.mjs';
import {PRODUCTION_COVERAGE_CLIENT} from '../src/production-coverage-view.mjs';
import {PRODUCTION_WORKSPACE_CLIENT} from '../src/production-workspace-view.mjs';
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

test('the workspace controller joins the closed six-asset public inventory without changing published legacy clients',()=>{
 assert.deepEqual(manifest.assets.map(row=>row.id),['bank','month','orders','production','weekly','workspace']);
 const published=JSON.parse(readFileSync(path.join(root,'workers','app','browser-assets-published.json'),'utf8'));
 const pins={bank:['0d6250f5888258fa29664eac45b2cd821d3872b1c96ac47dda46bd7fd10e6a0c',38035],month:['b2ec847af07b46e9a4c54295a782ccf7d1a67315edcbeb16053e034a021be4e5',687069],orders:['99c6086144a7e099920670eecaf485aba9e4f8c49d91b07f626809c7eb81208d',20935],production:['eaa685867dc256e2a48a01e77bff198aa845c8811fb5a5329c6121fb7f89acd2',163799],weekly:['91beb108a1bbe139adc87ac54db6abdad58e9dd1ecc8b7a0ead0d9188ccbfc9f',53495]};
 for(const [id,[sha256,bytes]]of Object.entries(pins)){
  const previous=[...published.assets,...published.retained].find(row=>row.id===id&&row.sha256===sha256);assert.ok(previous);assert.equal(previous.sha256,sha256);assert.equal(previous.bytes,bytes);
  assert.ok([...manifest.assets,...manifest.retained].some(row=>JSON.stringify(row)===JSON.stringify(previous)),'the exact published predecessor remains addressable for '+id);
  const old=readFileSync(path.join(root,'web','cloudflare','browser-assets-published',sha256+'.js'));assert.equal(old.length,bytes);assert.equal(createHash('sha256').update(old).digest('hex'),sha256);
 }
 const weekly=manifest.assets.find(row=>row.id==='weekly');assert.ok(weekly.bytes>0&&weekly.bytes<=262144);assert.equal(browserAssetScript('weekly'),'<script src="'+weekly.path+'" integrity="'+weekly.integrity+'" crossorigin="anonymous"></script>');
});

test('the complete production asset matches its seven current controllers and retains the frozen published prototype',()=>{
 const row=manifest.assets.find(value=>value.id==='production'),bytes=readFileSync(path.join(root,'dist','browser-assets',...row.path.slice(1).split('/')));
 const previousInline=[PRODUCTION_COST_PERIODS_CLIENT,PRODUCTION_CONFIRMATION_PROPOSAL_CLIENT,INCURRED_PRODUCTION_CLIENT,PRODUCTION_DAILY_FINANCE_CLIENT,PRODUCTION_WEEKLY_CLIENT,PRODUCTION_COVERAGE_CLIENT,PRODUCTION_WORKSPACE_CLIENT].join('\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,character=>'\\u'+character.charCodeAt(0).toString(16).padStart(4,'0'));
 assert.deepEqual(bytes,Buffer.from(previousInline),'extraction cannot change or reorder any legacy production client');
 // Captured from the authenticated synthetic HTML of the pre-extraction
 // Wrangler prototype (4,228,030 bytes, SHA 06078c1f...52eb39), rather than
 // computed solely from the new asset exports.
 const historical=readFileSync(path.join(root,'web','cloudflare','browser-assets-published','eaa685867dc256e2a48a01e77bff198aa845c8811fb5a5329c6121fb7f89acd2.js'));
 assert.equal(historical.length,163799);
 assert.equal(createHash('sha256').update(historical).digest('hex'),'eaa685867dc256e2a48a01e77bff198aa845c8811fb5a5329c6121fb7f89acd2');
 assert.equal(browserAssetScript('production'),'<script src="'+row.path+'" integrity="'+row.integrity+'" crossorigin="anonymous"></script>');
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
 const globals=vm.createContext({document:{getElementById(){return null;},addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}},console,URL,URLSearchParams,TextEncoder,TextDecoder,crypto,setTimeout,clearTimeout,AbortController});
 for(const row of manifest.assets){const response=await worker.fetch(request(row),env);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);assert.equal(bytes.length,row.bytes);new vm.Script(bytes.toString('utf8'));if(!['month','workspace'].includes(row.id))vm.runInContext(bytes.toString('utf8'),globals);}
 assert.equal(vm.runInContext('typeof brazaBankReconciliation.start',globals),'function');assert.equal(vm.runInContext('typeof brazaOrderOperations.start',globals),'function');assert.equal(vm.runInContext('typeof brazaWeeklyOperating.start',globals),'function');
 for(const symbol of ['brazaProductionCostPeriods.start','brazaProductionConfirmationProposal.start','brazaIncurredProduction.start','brazaProductionDailyFinance.refresh','brazaProductionWeeklyClosing.start','brazaProductionCoverage.start','brazaProductionWorkspace.open'])assert.equal(vm.runInContext('typeof '+symbol,globals),'function');
 assert.equal(databaseCalls,0);
 const missing=await worker.fetch(request(),{...env,ASSETS:{fetch:async()=>new Response(null,{status:404})}});assert.equal(missing.status,503);
 const wrong=await worker.fetch(request(),{...env,ASSETS:{fetch:async()=>new Response(new Uint8Array(bank.bytes))}});assert.equal(wrong.status,503);assert.equal(databaseCalls,0);
});


test('the reviewed current six-asset inventory preserves exact controller bytes and parser-blocking order',()=>{
 // Month was reviewed again after TEN-05 cleanup (sourceb91ff45049ab42b3a34182c970e066b336a2aa8cf84a66c79e2da9d4bed8083e).
 // Its previous61f017... hash predates private-cache/DOM teardown; this is a functional security change, not distribution drift.
 const reviewed={bank:'0d6250f5888258fa29664eac45b2cd821d3872b1c96ac47dda46bd7fd10e6a0c',month:'347a294216d16151105c5b5074174af01c01a9bc398e713aaf2c9184a48b1db2',orders:'ec6397070416275d880f293d4abe8d7f531215af369d7e9a275c10f019a8c3c8',production:'549c2b0f6ae183249bed2472af894cf5211d4a6853fc33c0ce6c127aa3ebf034',weekly:'04ae3166780be18f31754212640b0887abe9e20830ac4309a6e31109398e4eeb'};
 for(const [id,sha]of Object.entries(reviewed))assert.equal(manifest.assets.find(row=>row.id===id).sha256,sha,'the reviewed exact '+id+' asset must not drift');
 const row=manifest.assets.find(row=>row.id==='workspace');assert.ok(row);assert.ok(row.bytes>262144&&row.bytes<=1048576);
 const emitted=Buffer.from(CLIENT.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')));const bytes=readFileSync(path.join(root,'dist','browser-assets',...row.path.slice(1).split('/')));assert.deepEqual(bytes,emitted,'workspace distribution preserves every frozen controller byte');
 const tag=browserAssetScript('workspace');assert.equal(tag,'<script src="'+row.path+'" integrity="'+row.integrity+'" crossorigin="anonymous"></script>');assert.doesNotMatch(tag,/\b(async|defer|onerror)\b/);
 const helper=browserWorkspaceFailureScript();assert.ok(helper.includes(JSON.stringify(row.path)));assert.match(helper,/location\.reload\(\)/);assert.doesNotMatch(helper,/fetch\(|\.start\(|localStorage|sessionStorage/);
 new vm.Script(helper);
});

test('workspace public failure remains nonexecutable for missing bindings, bad lengths and changed exact-length bytes',async()=>{
 const row=manifest.assets.find(row=>row.id==='workspace');assert.ok(row);
 for(const env of [{},{ASSETS:{fetch:async()=>new Response(null,{status:404})}},{ASSETS:{fetch:async()=>new Response(new Uint8Array(row.bytes-1))}},{ASSETS:{fetch:async()=>new Response(new Uint8Array(row.bytes).fill(32))}}]){
  const result=await serveMlsBrowserAsset(request(row),env);assert.equal(result.status,503);assert.equal(result.headers.get('cache-control'),'no-store');assert.match(result.headers.get('content-type'),/application\/json/);assert.match((await result.json()).error,/^BROWSER_ASSET_/);
 }
});

test('workspace load-error helper accepts only its exact same-origin resource and offers a reload without API initialization',()=>{
 const row=manifest.assets.find(row=>row.id==='workspace');let listener,reloads=0;
 const status={textContent:'',attributes:{},style:{},setAttribute(name,value){this.attributes[name]=value;}},retry={hidden:true,disabled:true,textContent:'',onclick:null};
 const globals=vm.createContext({URL,location:{origin:'https://asset.fixture',href:'https://asset.fixture/admin?tab=overview',reload(){reloads++;}},document:{addEventListener(type,callback,capture){assert.equal(type,'error');assert.equal(capture,true);listener=callback;},getElementById(id){return id==='message'?status:id==='startupRetry'?retry:null;}}});
 vm.runInContext(browserWorkspaceFailureScript(),globals);assert.equal(typeof listener,'function');
 for(const src of ['https://asset.fixture'+bank.path,'https://untrusted.fixture'+row.path,'https://asset.fixture'+row.path+'?changed=true'])listener({target:{tagName:'SCRIPT',src}});
 listener({target:{tagName:'DIV',src:'https://asset.fixture'+row.path}});assert.equal(status.textContent,'');assert.equal(retry.hidden,true);
 listener({target:{tagName:'SCRIPT',src:'https://asset.fixture'+row.path}});assert.match(status.textContent,/Não foi possível carregar o painel/);assert.equal(status.attributes.role,'alert');assert.equal(status.style.color,'var(--negative,#b42318)');assert.equal(retry.hidden,false);assert.equal(retry.disabled,false);assert.equal(typeof retry.onclick,'function');assert.equal(reloads,0,'fallback never reloads automatically');retry.onclick();assert.equal(reloads,1);
});
