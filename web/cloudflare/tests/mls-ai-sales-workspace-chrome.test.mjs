import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startPreviewServer} from '../../../tools/mls_owner_preview_server.mjs';
import {syntheticShirtPng} from '../../../tools/tests/fixtures/mls-ai-sales-media-fixture.mjs';
import {createChromeProfileCleanup} from './chrome-profile-cleanup.mjs';

const executable=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const screenshots=process.env.MLS_AI_SALES_WORKSPACE_SCREENSHOT_DIR?path.resolve(process.env.MLS_AI_SALES_WORKSPACE_SCREENSHOT_DIR):null;
async function browser(viewport,exercise){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-saved-workspace-chrome-'));
 const child=spawn(executable,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'}),cleanup=createChromeProfileCleanup(child,profile);
 let socket,sequence=0;const pending=new Map();
 try{
  let port=0;for(let n=0;n<120&&!port;n++){try{port=Number(readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}if(!port)await pause(50);}
  assert.ok(port,'workspace Chromium debug port unavailable');
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('WORKSPACE_CHROME_OPEN_TIMEOUT')),10000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('WORKSPACE_CHROME_OPEN_FAILED'));},{once:true});});
  socket.addEventListener('message',event=>{const result=JSON.parse(event.data),entry=pending.get(result.id);if(!entry)return;pending.delete(result.id);clearTimeout(entry.timer);result.error?entry.reject(Error(result.error.message)):entry.resolve(result.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('WORKSPACE_CDP_TIMEOUT:'+method));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
  const wait=async(expression,label)=>{for(let n=0;n<180;n++){if(await evaluate(expression))return;await pause(50);}throw Error('WORKSPACE_BROWSER_WAIT:'+label+':'+JSON.stringify(await evaluate("({status:document.getElementById('aiSalesSavedStatus')?.textContent,notice:document.getElementById('aiSalesStatus')?.textContent,errors:globalThis.__workspaceErrors||[],url:location.href})")));};
  await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:viewport.width===390});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"globalThis.__workspaceErrors=[];globalThis.__workspaceReads=[];addEventListener('error',e=>__workspaceErrors.push(String(e.message)));addEventListener('unhandledrejection',e=>__workspaceErrors.push(String(e.reason?.message||e.reason)));const nativeFetch=globalThis.fetch;globalThis.fetch=async(...args)=>{const response=await nativeFetch(...args);__workspaceReads.push({path:new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href).pathname,method:args[1]?.method||'GET',status:response.status});return response;};"});
  const capture=async name=>{if(!screenshots)return;mkdirSync(screenshots,{recursive:true});const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(screenshots,name),Buffer.from(shot.data,'base64'));};
  return await exercise({send,evaluate,wait,capture});
 }finally{for(const entry of pending.values())clearTimeout(entry.timer);await cleanup(socket);}
}

for(const viewport of [{width:1365,height:900},{width:390,height:844}])test('native AI Sales saves and resumes a real Worker/D1 draft at '+viewport.width+'px without restoring files or grants',{timeout:90000},async t=>{
 if(!executable)return t.skip('Chromium unavailable');
 const server=await startPreviewServer({port:0,seed:true});
 try{await browser(viewport,async cdp=>{
  await cdp.send('Page.navigate',{url:server.origin});await cdp.wait("document.readyState==='complete'&&!!document.querySelector('form[action=\"/__preview/login\"]')",'synthetic local login');
  await cdp.evaluate("document.querySelector('form[action=\"/__preview/login\"]').requestSubmit()");
  await cdp.wait("document.readyState==='complete'&&!!globalThis.mlsAiSalesWorkspace&&!document.getElementById('aiSalesSaveSaved').disabled",'authenticated native workspace');
  await cdp.send('Page.navigate',{url:server.origin+'/admin?tab=ai-sales'});
  await cdp.wait("document.readyState==='complete'&&!!globalThis.mlsAiSalesWorkspace&&!document.getElementById('aiSalesSaveSaved').disabled",'AI Sales route');
  assert.equal(await cdp.evaluate("__workspaceReads.filter(r=>r.path==='/api/admin/ai-sales/workspace').length"),0,'opening the workspace must not start a background storage query');
  await cdp.evaluate("document.getElementById('aiSalesCatalogForm').requestSubmit()");await cdp.wait("document.querySelectorAll('#aiSalesCatalog .mls-ai-record').length===3",'real saved catalog');
  await cdp.evaluate("[...document.querySelectorAll('#aiSalesCatalog .mls-ai-record')].find(row=>row.textContent.includes('990001')).querySelector('button').click()");await cdp.wait("document.querySelectorAll('#aiSalesVariants .mls-ai-record').length===4",'real variant detail');
  await cdp.evaluate("[...document.querySelectorAll('#aiSalesVariants .mls-ai-record')].find(row=>{const title=row.querySelector('h4').textContent;return title.includes('Cor: Preto')&&title.includes('Tamanho: P');}).querySelector('button').click()");await cdp.wait("globalThis.mlsAiSalesWorkspace.getSnapshot().products[0]?.variant_ref==='99000102'",'exact native variant');
  const png=syntheticShirtPng().toString('base64');
  await cdp.evaluate(`(()=>{document.querySelector('#aiSalesAssetCoverage [data-component-ref]').value='1';document.getElementById('aiSalesRightsConfirmed').checked=true;document.getElementById('aiSalesRightsReference').value='ORIGINAL_SYNTHETIC_FIXTURE_OWNED_BY_THIS_TEST';const bytes=Uint8Array.from(atob(${JSON.stringify(png)}),v=>v.charCodeAt(0)),files=new DataTransfer();files.items.add(new File([bytes],'saved-draft-original.png',{type:'image/png'}));const input=document.getElementById('aiSalesAssetFiles');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await cdp.wait('globalThis.mlsAiSalesWorkspace.getSnapshot().assets.length===1','attached original hash');
  await cdp.evaluate("document.getElementById('aiSalesPlan').click()");await cdp.wait('globalThis.mlsAiSalesWorkspace.getSnapshot().campaigns.length===1','native campaign plan');
  await cdp.evaluate("document.getElementById('aiSalesTab-affiliates').click();document.getElementById('aiSalesCreatorHandle').value='@synthetic_owned_fixture';document.getElementById('aiSalesCreatorFit').value='Moda, nostalgia';document.getElementById('aiSalesCreatorConsentReference').value='SYNTHETIC_PUBLIC_PROFILE_FIXTURE';document.getElementById('aiSalesCreatorConsent').checked=true;document.getElementById('aiSalesCreatorForm').requestSubmit()");
  await cdp.wait('globalThis.mlsAiSalesWorkspace.getSnapshot().affiliates.creators.length===1','native creator draft');
  const original=await cdp.evaluate('globalThis.mlsAiSalesWorkspace.getSnapshot()');assert.equal(original.products[0].price_cents,null);assert.equal(original.products[0].inventory_units,null);assert.equal(original.jobs[0].state,'PLANNED');
  await cdp.evaluate("document.getElementById('aiSalesSaveSaved').click()");
  await cdp.wait("document.getElementById('aiSalesSavedStatus').textContent.includes('Rascunho salvo no app')",'real owner POST to SQLite');
  assert.deepEqual(await cdp.evaluate("__workspaceReads.filter(r=>r.path==='/api/admin/ai-sales/workspace').map(r=>({method:r.method,status:r.status}))"),[{method:'GET',status:200},{method:'POST',status:200}]);
  const afterSave=await cdp.evaluate("({state:globalThis.mlsAiSalesWorkspace.getSnapshot(),files:Number(document.getElementById('aiSalesAssetCount').textContent),overflow:document.documentElement.scrollWidth>innerWidth+1})");
  assert.equal(afterSave.files,1);assert.equal(afterSave.state.jobs[0].state,'PLANNED');assert.equal(afterSave.state.products[0].variant_ref,original.products[0].variant_ref);assert.equal(afterSave.overflow,false);
  await cdp.evaluate("document.getElementById('aiSalesSavedStatus').scrollIntoView({block:'center',behavior:'instant'})");await cdp.capture('workspace-'+viewport.width+'-saved.png');
  await cdp.send('Page.reload');await cdp.wait("document.readyState==='complete'&&!!globalThis.mlsAiSalesWorkspace&&!document.getElementById('aiSalesLoadSaved').disabled",'page reload keeps authenticated cookie');
  assert.equal(await cdp.evaluate('globalThis.mlsAiSalesWorkspace.getSnapshot().products.length'),0);
  await cdp.evaluate("document.getElementById('aiSalesLoadSaved').click()");await cdp.wait("globalThis.mlsAiSalesWorkspace.getSnapshot().products.length===1&&document.getElementById('aiSalesSavedStatus').textContent.includes('Trabalho salvo carregado')",'native GET restores durable draft');
  const restored=await cdp.evaluate("({state:globalThis.mlsAiSalesWorkspace.getSnapshot(),files:Number(document.getElementById('aiSalesAssetCount').textContent),images:document.querySelectorAll('#aiSalesAssets img').length,overflow:document.documentElement.scrollWidth>innerWidth+1})");
  assert.equal(restored.files,0);assert.equal(restored.images,0);assert.equal(restored.overflow,false);assert.equal(restored.state.assets[0].sha256,original.assets[0].sha256);assert.equal(restored.state.campaigns[0].campaign_id,original.campaigns[0].campaign_id);assert.equal(restored.state.jobs[0].state,'QA_BLOCKED');assert.equal(restored.state.jobs[0].path_local,null);assert.equal(restored.state.jobs[0].output_hash,null);assert.equal(restored.state.affiliates.creators[0].approved_handle,'@synthetic_owned_fixture');assert.equal(restored.state.affiliates.creators[0].seller_creator_access_grant_status,'UNKNOWN');assert.deepEqual(restored.state.products[0].verified_product_attributes,[]);assert.ok(restored.state.products[0].observations.every(row=>row.evidence.status==='DECLARED'));assert.equal(restored.state.commercial_writes,false);
  await cdp.evaluate("document.getElementById('aiSalesTab-campaigns').click();document.getElementById('aiSalesPlan').click()");await cdp.wait("document.getElementById('aiSalesStatus').textContent.includes('AI_SALES_ORIGINAL_BYTES_REQUIRED')",'originals still required after restore');assert.equal(await cdp.evaluate('globalThis.mlsAiSalesWorkspace.getSnapshot().campaigns.length'),1);
  if(viewport.width===1365){
   const other=await cdp.evaluate("(async()=>{const bootstrap=await(await fetch('/api/admin/bootstrap')).json(),saved=await(await fetch('/api/admin/ai-sales/workspace')).json();saved.workspace.products[0].title='Synthetic edit from another authenticated session';const response=await fetch('/api/admin/ai-sales/workspace',{method:'POST',headers:{'content-type':'application/json','X-CSRF-Token':bootstrap.csrf},body:JSON.stringify({revision:saved.revision,workspace:saved.workspace})});return {status:response.status,revision:(await response.json()).revision};})()");
   assert.equal(other.status,200);assert.equal(other.revision,2);
   const reads=await cdp.evaluate('__workspaceReads.length');await cdp.evaluate("document.getElementById('aiSalesSaveSaved').click()");await cdp.wait("document.getElementById('aiSalesSavedStatus').textContent.includes('mudou em outra sessão')",'real revision conflict');
   assert.equal(await cdp.evaluate('document.getElementById(\'aiSalesSaveSaved\').disabled'),true);assert.deepEqual(await cdp.evaluate('__workspaceReads.slice('+reads+').filter(r=>r.path===\'/api/admin/ai-sales/workspace\').map(r=>({method:r.method,status:r.status}))'),[{method:'POST',status:409}]);assert.equal(await cdp.evaluate('globalThis.mlsAiSalesWorkspace.getSnapshot().products[0].title'),restored.state.products[0].title);
   await cdp.evaluate("document.getElementById('aiSalesReplaceLocal').checked=true;document.getElementById('aiSalesLoadSaved').click()");await cdp.wait("globalThis.mlsAiSalesWorkspace.getSnapshot().products[0].title==='Synthetic edit from another authenticated session'",'explicit current-version restore after conflict');assert.equal(await cdp.evaluate("document.getElementById('aiSalesSaveSaved').disabled"),false);
  }
  await cdp.evaluate("document.getElementById('aiSalesSavedStatus').scrollIntoView({block:'center',behavior:'instant'})");await cdp.capture('workspace-'+viewport.width+'-restored.png');
  assert.deepEqual(await cdp.evaluate('__workspaceErrors'),[]);
 });}finally{await server.close();}
});
