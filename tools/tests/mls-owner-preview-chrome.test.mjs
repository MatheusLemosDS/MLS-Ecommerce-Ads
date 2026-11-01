import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {existsSync,mkdtempSync,readFileSync,mkdirSync,writeFileSync,rmSync,cpSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {exportOwnerPreview} from '../mls_owner_preview_export.mjs';
import os from 'node:os';
import path from 'node:path';
import {startPreviewServer} from '../mls_owner_preview_server.mjs';
import {createChromeProfileCleanup} from '../../web/cloudflare/tests/chrome-profile-cleanup.mjs';
import {waitForChromeDebugPort} from '../../web/cloudflare/tests/chrome-debug-port.mjs';
import {syntheticShirtPng,localFixtureTools} from './fixtures/mls-ai-sales-media-fixture.mjs';
import {validateLocalAiSalesInput,renderLocalAiSales} from '../mls-ai-sales/render.mjs';

const executable=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const screenshotDirectory=process.env.MLS_OWNER_PREVIEW_SCREENSHOT_DIR?path.resolve(process.env.MLS_OWNER_PREVIEW_SCREENSHOT_DIR):null;
const panels=['overview','agents','agent-finance','agent-ads','agent-products','agent-production','agent-returns','agent-auditor','agent-hermes','products','production','margins','hermes','history','roadmap','ai-sales'];

function previewProtocolError(method,details){
 const code=Number.isSafeInteger(details?.code)?details.code:'UNKNOWN',message=typeof details?.message==='string'&&details.message.trim()?details.message.trim().slice(0,320):'EMPTY_PROTOCOL_MESSAGE';
 return Error('PREVIEW_CDP_COMMAND_FAILED:'+method+':'+code+':'+message);
}

test('preview CDP failures retain the real command, protocol code and browser phase',async t=>{
 if(!executable)return t.skip('Chromium unavailable');
 await assert.rejects(browser({width:800,height:600},cdp=>cdp.send('PreviewSynthetic.missingCommand')),error=>{
  assert.match(error.message,/PREVIEW_BROWSER_FAILED:/);assert.match(error.message,/\"phase\":\"run\"/);
  assert.match(error.cause?.message??'',/PREVIEW_CDP_COMMAND_FAILED:PreviewSynthetic\.missingCommand:-32601:/);return true;
 });
 const empty=previewProtocolError('Page.captureScreenshot',{code:-32000,message:''});
 assert.match(empty.message,/Page\.captureScreenshot:-32000:EMPTY_PROTOCOL_MESSAGE/);
});

async function browser(viewport,run){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-preview-http-chrome-'));
 const process=spawn(executable,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const cleanup=createChromeProfileCleanup(process,profile);
 let socket,phase='launch',lastMethod=null;const pending=new Map(),phases=[];
 const mark=value=>{phase=value;phases.push(value);if(phases.length>8)phases.shift();};
 try{
  const port=await waitForChromeDebugPort(process,profile);
  // DevTools may bind its port before the initial page is created.
  const pageDeadline=Date.now()+10000;let page;
  while(Date.now()<pageDeadline){
   if(process.exitCode!==null||process.signalCode!==null)throw Error('PREVIEW_CDP_PROCESS_EXITED');
   const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(2000)})).json();
   page=pages.find(value=>value.type==='page'&&typeof value.webSocketDebuggerUrl==='string');
   if(page)break;await delay(75);
  }
  assert.ok(page,'Preview Chrome did not create a debugger page within 10 seconds');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('PREVIEW_CDP_OPEN_TIMEOUT')),10000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('PREVIEW_CDP_OPEN_FAILED'));},{once:true});});
  let sequence=0;socket.addEventListener('message',event=>{const v=JSON.parse(event.data),p=pending.get(v.id);if(!p)return;pending.delete(v.id);clearTimeout(p.timer);v.error?p.reject(previewProtocolError(p.method,v.error)):p.resolve(v.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{lastMethod=method;const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('PREVIEW_CDP_TIMEOUT:'+method));},20000);pending.set(id,{resolve,reject,timer,method});try{socket.send(JSON.stringify({id,method,params}));}catch(error){pending.delete(id);clearTimeout(timer);reject(Error('PREVIEW_CDP_SEND_FAILED:'+method,{cause:error}));}});
  const evaluate=async expression=>{const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error('PREVIEW_CDP_EVALUATION_FAILED:'+(value.exceptionDetails.exception?.description||value.exceptionDetails.text||value.exceptionDetails.exception?.className||'EMPTY_EXCEPTION_DETAILS'));return value.result.value;};
  const wait=async(expression,label)=>{mark('wait:'+label);for(let i=0;i<180;i++){if(await evaluate(expression))return;await delay(50);}throw Error('PREVIEW_BROWSER_WAIT:'+label+':'+JSON.stringify(await evaluate("({ready:document.readyState,errors:globalThis.__previewErrors||[],status:document.getElementById('costsStatus')?.textContent,message:document.getElementById('message')?.textContent,ai:!!globalThis.mlsAiSalesWorkspace,offline:globalThis.__mlsOfflineReview||null,title:document.title,url:location.href,body:document.body?.textContent?.slice(0,300)})")));};
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`globalThis.__previewErrors=[];globalThis.__previewReads=[];addEventListener('error',event=>__previewErrors.push(String(event.message)));addEventListener('unhandledrejection',event=>__previewErrors.push(String(event.reason?.message||event.reason)));const originalFetch=globalThis.fetch;globalThis.fetch=async(...args)=>{const response=await originalFetch(...args);const pathname=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href).pathname;__previewReads.push({pathname,method:args[1]?.method||'GET',status:response.status});return response;};`});
  await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:viewport.width===390});
  const capture=async name=>{if(!screenshotDirectory)return null;mark('capture:'+name);mkdirSync(screenshotDirectory,{recursive:true});const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}),bytes=Buffer.from(shot.data,'base64');writeFileSync(path.join(screenshotDirectory,name),bytes);return {file:name,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};};
  mark('run');return await run({send,evaluate,wait,capture,mark});
 }catch(error){throw Error('PREVIEW_BROWSER_FAILED:'+JSON.stringify({viewport,phase,lastMethod,phases,reason:typeof error?.message==='string'&&error.message?error.message:typeof error?.name==='string'?error.name:'EMPTY_REJECTION'}),{cause:error});}
 finally{for(const p of pending.values())clearTimeout(p.timer);pending.clear();try{socket?.close();}catch{}try{await cleanup();}catch(error){throw Error('PREVIEW_BROWSER_CLEANUP_FAILED:'+phase,{cause:error});}}
}

async function navigate(cdp,id){
 cdp.mark('navigate:'+id);
 const result=await cdp.evaluate(`(()=>{const id=${JSON.stringify(id)},visible=node=>!!node&&(node.checkVisibility?node.checkVisibility({checkVisibilityCSS:true}):node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden');const candidates=target=>[...document.querySelectorAll('[data-tab],[data-mission-open],[data-open]')].filter(node=>node.dataset.tab===target||node.dataset.missionOpen===target||node.dataset.open===target);const click=target=>{let link=candidates(target).find(visible);if(!link){const menu=candidates(target).map(node=>node.closest('.workspace-more')).find(menu=>menu&&visible(menu.querySelector('summary')));if(menu&&!menu.open)menu.querySelector('summary').click();link=candidates(target).find(visible);}if(!link)return false;link.click();return true;};if(id.startsWith('agent-')&&!click('agents'))return {missing:'agents'};if(!click(id))return {missing:id};document.getElementById(id).scrollIntoView({block:'start',behavior:'instant'});return {active:document.documentElement.dataset.activePanel,visible:!document.getElementById(id).hidden,overflow:document.documentElement.scrollWidth>innerWidth+1};})()`);
 assert.equal(result.missing,undefined,'native navigation destination '+id);assert.equal(result.active,id);assert.equal(result.visible,true);assert.equal(result.overflow,false,'horizontal overflow '+id);
}

for(const viewport of [{width:1365,height:900},{width:390,height:844}])test('real local Worker preview authenticates, persists costs and plans media at '+viewport.width+'px',{timeout:120000},async t=>{
 if(!executable)return t.skip('Chromium unavailable');
 let server;try{server=await startPreviewServer({port:0,seed:true,...(process.env.MLS_OWNER_PREVIEW_MEDIA_DIR?{mediaDirectory:process.env.MLS_OWNER_PREVIEW_MEDIA_DIR}:{})});}catch(error){throw Error('PREVIEW_SERVER_START_FAILED:'+viewport.width,{cause:error});}
 try{
  const proof=await browser(viewport,async cdp=>{
   await cdp.send('Page.navigate',{url:server.origin});
   await cdp.wait("document.readyState==='complete'&&!!document.querySelector('form[action=\"/__preview/login\"]')",'landing');
   const label=await cdp.evaluate('document.body.textContent');assert.match(label,/dados fictícios/i);
   await cdp.evaluate("document.querySelector('form[action=\"/__preview/login\"]').requestSubmit()");
   await cdp.wait("document.readyState==='complete'&&!!document.getElementById('missionSearchOpen')&&!!globalThis.mlsAiSalesWorkspace",'native owner session');
   await cdp.wait("document.getElementById('costsStatus')?.textContent.includes('Custos cadastrados')",'real production cost GET');
   const initial=await cdp.evaluate(`(async()=>{const response=await fetch('/api/admin/bootstrap');const session=await response.json();const list=await(await fetch('/api/admin/product-registry?limit=20&offset=0&item_status=ACTIVE')).json();return {status:response.status,schema:session.schema,csrfShape:typeof session.csrf==='string'&&/^[a-f0-9]{64}$/.test(session.csrf),count:list.products.length,items:list.products.map(p=>p.item_id)};})()`);
   assert.equal(initial.status,200);assert.equal(initial.schema,'admin_bootstrap_v1');assert.equal(initial.csrfShape,true);assert.equal(initial.count,3);assert.deepEqual([...initial.items].sort(),['990001','990002','990003']);
   const captures=[];
   for(const theme of ['dark','light']){
    await cdp.evaluate(`(()=>{const visible=n=>n.checkVisibility?n.checkVisibility({checkVisibilityCSS:true}):n.getClientRects().length>0;for(let i=0;i<3&&document.documentElement.dataset.theme!==${JSON.stringify(theme)};i++)[...document.querySelectorAll('[data-braza-theme-toggle]')].find(visible).click();})()`);
    for(const id of panels){await navigate(cdp,id);if(screenshotDirectory){await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');captures.push(await cdp.capture('preview-'+viewport.width+'-'+theme+'-'+id+'.png'));}}
    for(const name of ['campaigns','studio','affiliates','performance','integrations']){await cdp.evaluate(`document.getElementById('aiSalesTab-'+${JSON.stringify(name)}).click()`);const current=await cdp.evaluate(`({selected:document.getElementById('aiSalesTab-'+${JSON.stringify(name)}).getAttribute('aria-selected'),visible:!document.getElementById('aiSalesPanel-'+${JSON.stringify(name)}).hidden,overflow:document.documentElement.scrollWidth>innerWidth+1})`);assert.equal(current.selected,'true');assert.equal(current.visible,true);assert.equal(current.overflow,false);}
   }
   await navigate(cdp,'margins');
   const old=await cdp.evaluate("Number(document.getElementById('costInclusiveRegular').value.replace(',','.'))");assert.equal(old,15.90);
   await cdp.evaluate(`(()=>{const input=document.getElementById('costInclusiveRegular');input.value='16.90';input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('productionCostsForm').requestSubmit();})()`);
   await cdp.wait("document.getElementById('costsStatus').textContent.includes('Custos cadastrados')&&document.getElementById('saveProductionCosts').disabled&&document.getElementById('costInclusiveRegular').value==='16.90'&&__previewReads.some(r=>r.pathname==='/api/admin/production-costs'&&r.method==='POST'&&r.status===200)",'native authenticated cost POST');
   const priced=await cdp.evaluate(`(async()=>{const cost=await(await fetch('/api/admin/production-costs')).json();const results=[];for(const item of ['990001','990002','990003'])results.push(await(await fetch('/api/admin/product-registry?item_id='+item+'&variant_limit=50&variant_offset=0')).json());return {regular:cost.values.inclusive_regular_cents,adult:results[0].variants.map(v=>({model:v.model_id,cost:v.unit_cost_cents})),child:results[1].variants.map(v=>v.unit_cost_cents),kit:results[2].variants[0].unit_cost_cents};})()`);
   assert.equal(priced.regular,1690);assert.equal(priced.adult.find(v=>v.model==='99000101').cost,1690);assert.equal(priced.adult.find(v=>v.model==='99000103').cost,2140);assert.deepEqual([...new Set(priced.child)],[1250]);assert.equal(priced.kit,3830);
   if(screenshotDirectory){await cdp.evaluate("document.getElementById('costInclusiveRegular').scrollIntoView({block:'center',behavior:'instant'})");captures.push(await cdp.capture('preview-'+viewport.width+'-actual-costs-saved.png'));}
   await navigate(cdp,'ai-sales');await cdp.evaluate("document.getElementById('aiSalesTab-campaigns').click();document.getElementById('aiSalesCatalogForm').requestSubmit()");
   await cdp.wait("document.querySelectorAll('#aiSalesCatalog .mls-ai-record').length===3",'native cached catalogue');
   const nativeSelections=[];
   for(const example of [{item:'990002',models:8,model:'99000200',cost:1250,pieces:null},{item:'990003',models:1,model:'99000300',cost:3830,pieces:2}]){
    await cdp.evaluate(`[...document.querySelectorAll('#aiSalesCatalog .mls-ai-record')].find(row=>row.textContent.includes(${JSON.stringify(example.item)})).querySelector('button').click()`);
    await cdp.wait(`document.querySelectorAll('#aiSalesVariants .mls-ai-record').length===${example.models}`,'native child/kit variants');
    await cdp.evaluate("document.querySelector('#aiSalesVariants .mls-ai-record button').click()");
    await cdp.wait('globalThis.mlsAiSalesWorkspace.getSnapshot().products.length===1','native child/kit selection');
    const product=await cdp.evaluate('globalThis.mlsAiSalesWorkspace.getSnapshot().products[0]');
    assert.equal(product.variant_ref,example.model);assert.equal(product.cost_cents,example.cost);assert.equal(product.piece_count,example.pieces);
    nativeSelections.push({item:product.platform_product_id,variant:product.variant_ref,cost_cents:product.cost_cents,piece_count:product.piece_count});
    if(screenshotDirectory){await cdp.evaluate("document.getElementById('aiSalesSelected').scrollIntoView({block:'center',behavior:'instant'})");captures.push(await cdp.capture('preview-'+viewport.width+'-selected-'+example.item+'.png'));}
    await cdp.evaluate("[...document.querySelectorAll('#aiSalesSelected button')].find(button=>button.textContent.includes('Retirar do planejamento')).click()");
    await cdp.wait('globalThis.mlsAiSalesWorkspace.getSnapshot().products.length===0','remove child/kit local selection');
   }
   await cdp.evaluate("[...document.querySelectorAll('#aiSalesCatalog .mls-ai-record')].find(row=>row.textContent.includes('990001')).querySelector('button').click()");
   await cdp.wait("document.querySelectorAll('#aiSalesVariants .mls-ai-record').length===4",'native exact adult variants');
   await cdp.evaluate("[...document.querySelectorAll('#aiSalesVariants .mls-ai-record')].find(row=>/GG/.test(row.textContent)).querySelector('button').click()");
   await cdp.wait('globalThis.mlsAiSalesWorkspace.getSnapshot().products.length===1','native chosen variant');
   const selection=await cdp.evaluate('globalThis.mlsAiSalesWorkspace.getSnapshot().products[0]');assert.equal(selection.variant_ref,'99000101');assert.equal(selection.cost_cents,1690);assert.equal(selection.inventory_units,null);assert.equal(selection.price_cents,null);
   // The provided original fixture is black. Plan the black P variant after
   // independently checking blue GG, rather than attest a wrong fixture color.
   await cdp.evaluate("[...document.querySelectorAll('#aiSalesSelected button')].find(button=>button.textContent.includes('Retirar do planejamento')).click()");
   await cdp.wait('globalThis.mlsAiSalesWorkspace.getSnapshot().products.length===0','remove blue GG from synthetic media plan');
   await cdp.evaluate("[...document.querySelectorAll('#aiSalesVariants .mls-ai-record')].find(row=>{const title=row.querySelector('h4').textContent;return title.includes('Cor: Preto')&&title.includes('Tamanho: P');}).querySelector('button').click()");
   await cdp.wait("globalThis.mlsAiSalesWorkspace.getSnapshot().products[0]?.variant_ref==='99000102'",'matching black P original');
   const png=syntheticShirtPng().toString('base64');
   await cdp.evaluate(`(()=>{const input=document.querySelector('#aiSalesAssetCoverage [data-component-ref]');input.value='1';input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('aiSalesRightsConfirmed').checked=true;document.getElementById('aiSalesRightsReference').value='ORIGINAL_SYNTHETIC_FIXTURE_OWNED_BY_THIS_TEST';const bytes=Uint8Array.from(atob(${JSON.stringify(png)}),c=>c.charCodeAt(0)),files=new DataTransfer();files.items.add(new File([bytes],'preview-original-shirt.png',{type:'image/png'}));document.getElementById('aiSalesAssetFiles').files=files.files;document.getElementById('aiSalesAssetFiles').dispatchEvent(new Event('change',{bubbles:true}));})()`);
   await cdp.wait('globalThis.mlsAiSalesWorkspace.getSnapshot().assets.length===1','native original file hash');
   await cdp.evaluate("document.getElementById('aiSalesPlan').click()");
   await cdp.wait('globalThis.mlsAiSalesWorkspace.getSnapshot().campaigns.length===1','native plan');
   assert.equal(await cdp.evaluate('globalThis.mlsAiSalesWorkspace.getSnapshot().campaigns[0].status'),'READY_FOR_LOCAL_RENDER');
   await cdp.evaluate(`globalThis.__previewDownloads=[];const originalObjectURL=URL.createObjectURL;URL.createObjectURL=blob=>{if(blob.type==='application/json')blob.text().then(text=>__previewDownloads.push(JSON.parse(text)));return originalObjectURL(blob);};[...document.querySelectorAll('#aiSalesCampaigns button')].find(button=>/exportar entrada/i.test(button.textContent)).click();`);
   await cdp.wait('__previewDownloads.length===1','actual CLI input Blob');
   const exported=await cdp.evaluate('__previewDownloads[0]');const validated=await validateLocalAiSalesInput(exported);assert.equal(validated.campaigns[0].status,'READY_FOR_LOCAL_RENDER');
   let roundtrip=null;
   if(viewport.width===1365){
    const root=mkdtempSync(path.join(os.tmpdir(),'mls-preview-native-roundtrip-')),assets=path.join(root,'assets'),output=path.join(root,'output');mkdirSync(assets);
    try{
     writeFileSync(path.join(assets,exported.assets[0].file_name),Buffer.from(png,'base64'));
     cdp.mark('render:current-native-campaign');const report=await renderLocalAiSales(exported,{assetsDirectory:assets,outputDirectory:output,render:true,tools:localFixtureTools()});
     assert.equal(report.status,'READY_FOR_OWNER');const rendered=report.jobs[0],manifest=readFileSync(path.join(rendered.output_directory,'manifest.json'),'utf8'),movie=readFileSync(path.join(rendered.output_directory,'video.mp4')).toString('base64');
     await cdp.evaluate(`(()=>{const files=new DataTransfer();files.items.add(new File([${JSON.stringify(manifest)}],'manifest.json',{type:'application/json'}));const input=document.getElementById('aiSalesVideoManifest');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('aiSalesTab-studio').click();})()`);
     await cdp.wait('globalThis.mlsAiSalesWorkspace.getSnapshot().video_reviews.length===1','current exact native campaign render manifest');
     await cdp.evaluate(`(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(movie)}),c=>c.charCodeAt(0)),files=new DataTransfer();files.items.add(new File([bytes],'video.mp4',{type:'video/mp4'}));const input=document.querySelector('#aiSalesVideoReviews input[type=file]');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
     await cdp.wait("!!document.querySelector('#aiSalesVideoReviews video')",'current native campaign rendered MP4 reattachment');
     await cdp.evaluate(`(async()=>{const video=document.querySelector('#aiSalesVideoReviews video');video.muted=true;await video.play();video.scrollIntoView({block:'center',behavior:'instant'});})()`);
     await cdp.wait("document.querySelector('#aiSalesVideoReviews video').currentTime>0.2",'current exact native video playback');
     if(screenshotDirectory)captures.push(await cdp.capture('preview-'+viewport.width+'-native-current-campaign-mp4.png'));
     // This is a synthetic UI action, not a merchant's visual/audio approval.
     await cdp.evaluate(`(()=>{const card=document.querySelector('#aiSalesVideoReviews .mls-ai-record');card.querySelector('video').pause();card.querySelector('input[type=checkbox]').checked=true;[...card.querySelectorAll('button')].find(button=>button.textContent.includes('Aprovar este arquivo')).click();})()`);
     await cdp.wait("globalThis.mlsAiSalesWorkspace.getSnapshot().video_reviews[0].decision==='APPROVED'",'current campaign source/hash approval gate accepts exact inputs');
     roundtrip=await cdp.evaluate(`(()=>{const state=globalThis.mlsAiSalesWorkspace.getSnapshot(),r=state.video_reviews[0];return {product_ref:r.manifest.product_key,video_sha256:r.manifest.qa.sha256,qa:r.manifest.qa.status,decision:r.decision,audit_gates:state.audit.at(-1).gate_result,commercial_writes:state.commercial_writes};})()`);
     roundtrip.human_approval='PENDING_NOT_REPLACED_BY_SYNTHETIC_TEST';assert.equal(roundtrip.commercial_writes,false);assert.equal(roundtrip.video_sha256,rendered.qa.sha256);assert.deepEqual(roundtrip.audit_gates,['LOCAL_BYTES_MATCHED','OWNER_VISUAL_REVIEW_DECLARED']);
     if(screenshotDirectory){const destination=path.join(screenshotDirectory,'native-roundtrip');mkdirSync(destination,{recursive:true});cpSync(rendered.output_directory,destination,{recursive:true});writeFileSync(path.join(destination,'input.json'),JSON.stringify(exported,null,2)+'\n');writeFileSync(path.join(destination,'original.png'),Buffer.from(png,'base64'));}
    }finally{rmSync(root,{recursive:true,force:true});}
   }
   let playback=null;
   if(process.env.MLS_OWNER_PREVIEW_MEDIA_DIR&&viewport.width===390){
    await cdp.evaluate(`(async()=>{const index=await(await fetch('/__preview/media')).json();const sample=index.renders[0];globalThis.__previewSample=sample;const text=await(await fetch('/__preview/media/'+sample.manifest_file_id)).text();const files=new DataTransfer();files.items.add(new File([text],'manifest.json',{type:'application/json'}));const input=document.getElementById('aiSalesVideoManifest');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('aiSalesTab-studio').click();})()`);
    await cdp.wait('globalThis.mlsAiSalesWorkspace.getSnapshot().video_reviews.length==='+String(viewport.width===1365?2:1),'actual renderer manifest import');
    await cdp.evaluate(`(async()=>{const response=await fetch('/__preview/media/'+__previewSample.video_file_id),bytes=await response.arrayBuffer(),files=new DataTransfer();files.items.add(new File([bytes],'video.mp4',{type:'video/mp4'}));const input=document.querySelector('#aiSalesVideoReviews input[type=file]');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await cdp.wait("!!document.querySelector('#aiSalesVideoReviews video')",'native MP4 byte hash and metadata check');
    await cdp.evaluate(`(async()=>{const v=document.querySelector('#aiSalesVideoReviews video');v.muted=true;await v.play();v.scrollIntoView({block:'center',behavior:'instant'});})()`);
    await cdp.wait("document.querySelector('#aiSalesVideoReviews video').currentTime>0.2",'actual native MP4 playback');
    playback=await cdp.evaluate(`(()=>{const v=document.querySelector('#aiSalesVideoReviews video'),result={width:v.videoWidth,height:v.videoHeight,duration_ms:Math.round(v.duration*1000),current_time:v.currentTime,approved:globalThis.mlsAiSalesWorkspace.getSnapshot().video_reviews.at(-1).decision};v.pause();return result;})()`);
    assert.equal(playback.width,1080);assert.equal(playback.height,1920);assert.equal(playback.duration_ms,15000);assert.equal(playback.approved,'PENDING');
    if(screenshotDirectory)captures.push(await cdp.capture('preview-'+viewport.width+'-actual-studio-mp4.png'));
   }
   const finish=await cdp.evaluate('({errors:__previewErrors,reads:__previewReads,state:globalThis.mlsAiSalesWorkspace.getSnapshot()})');assert.deepEqual(finish.errors,[]);assert.equal(finish.reads.some(r=>r.pathname==='/api/admin/production-costs'&&r.method==='POST'&&r.status===200),true);
   return {schema:'mls_owner_preview_browser_qa_v1',source:'ACTUAL_WORKER_SQLITE_LOCAL_SYNTHETIC_DATA_NO_HTTP_MOCKS',worker_sha256:server.workerHash,viewport,panels:panels.length,ai_tabs:5,catalog_items:initial.count,production_costs:priced,selected_variant:selection.variant_ref,other_native_selections:nativeSelections,campaign_status:finish.state.campaigns[0].status,local_cli_export_verified:true,exact_native_render_roundtrip:roundtrip,media_playback:playback,javascript_errors:finish.errors.length,read_count:finish.reads.length,captures};
  });
  if(screenshotDirectory)writeFileSync(path.join(screenshotDirectory,'preview-'+viewport.width+'-results.json'),JSON.stringify(proof,null,2)+'\n');
 }finally{try{await server.close();}catch(error){throw Error('PREVIEW_SERVER_CLOSE_FAILED:'+viewport.width,{cause:error});}}
});


test('downloadable HTML runs in an isolated static browser with native navigation and explicit read-only data',{timeout:120000},async t=>{
 if(!executable)return t.skip('Chromium unavailable');
 const folder=mkdtempSync(path.join(os.tmpdir(),'mls-owner-offline-browser-')),filename=path.join(folder,'preview.html');
 try{
  const exported=await exportOwnerPreview({output:filename,...(process.env.MLS_OWNER_PREVIEW_MEDIA_DIR?{mediaDirectory:process.env.MLS_OWNER_PREVIEW_MEDIA_DIR}:{})});
  const staticRequests=[];const staticServer=http.createServer((request,response)=>{staticRequests.push(request.url);if(request.url.startsWith('/api/')){response.writeHead(404);response.end();return;}response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end(readFileSync(filename));});await new Promise(resolve=>staticServer.listen(0,'127.0.0.1',resolve));
  try{for(const viewport of [{width:1365,height:900},{width:390,height:844}]){
   const proof=await browser(viewport,async cdp=>{
    const nav=await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+staticServer.address().port+'/preview.html'});assert.equal(nav.errorText,undefined,JSON.stringify(nav));
    await cdp.wait("document.readyState==='complete'&&!!globalThis.mlsAiSalesWorkspace&&document.getElementById('costsStatus')?.textContent.includes('Custos cadastrados')",'offline actual native bootstrap');
    const context=await cdp.evaluate('({source:globalThis.__mlsOfflineReview,secure:isSecureContext,crypto:!!crypto.subtle})');
    assert.equal(context.secure,true);assert.equal(context.crypto,true);assert.equal(context.source.connected_to_merchant,false);assert.equal(context.source.backend_mode,'READ_ONLY_SNAPSHOT');
    for(const id of panels)await navigate(cdp,id);
    for(const name of ['campaigns','studio','affiliates','performance','integrations']){await cdp.evaluate(`document.getElementById('aiSalesTab-'+${JSON.stringify(name)}).click()`);assert.equal(await cdp.evaluate(`!document.getElementById('aiSalesPanel-'+${JSON.stringify(name)}).hidden`),true);}
    await cdp.evaluate("document.getElementById('aiSalesTab-campaigns').click();document.getElementById('aiSalesCatalogForm').requestSubmit()");
    await cdp.wait("document.querySelectorAll('#aiSalesCatalog .mls-ai-record').length===3",'offline native catalog');
    await cdp.evaluate("[...document.querySelectorAll('#aiSalesCatalog .mls-ai-record')].find(row=>row.textContent.includes('990001')).querySelector('button').click()");
    await cdp.wait("document.querySelectorAll('#aiSalesVariants .mls-ai-record').length===4",'offline native variant catalog');
    await cdp.evaluate("[...document.querySelectorAll('#aiSalesVariants .mls-ai-record')].find(row=>/GG/.test(row.textContent)).querySelector('button').click()");
    await cdp.wait('globalThis.mlsAiSalesWorkspace.getSnapshot().products.length===1','offline native chosen variant');
    const product=await cdp.evaluate('globalThis.mlsAiSalesWorkspace.getSnapshot().products[0]');assert.equal(product.variant_ref,'99000101');assert.equal(product.cost_cents,1590);assert.equal(product.inventory_units,null);
    const refusal=await cdp.evaluate("(async()=>{const response=await fetch('/api/admin/production-costs',{method:'POST',body:'{}'});return {status:response.status,body:await response.json()};})()");
    assert.equal(refusal.status,503);assert.equal(refusal.body.error,'OFFLINE_PREVIEW_READ_ONLY');
    let embeddedVideos=0;
    if(process.env.MLS_OWNER_PREVIEW_MEDIA_DIR){
     await cdp.wait("document.querySelectorAll('#mlsOfflineVideos video').length===3&&[...document.querySelectorAll('#mlsOfflineVideos video')].every(v=>v.videoWidth===1080&&v.videoHeight===1920&&v.duration===15)",'actual embedded MP4 metadata without API backend');
     embeddedVideos=await cdp.evaluate("document.querySelectorAll('#mlsOfflineVideos video').length");
    }
    const image=await cdp.capture('offline-'+viewport.width+'-native-catalog.png'),errors=await cdp.evaluate('__previewErrors');assert.deepEqual(errors,[]);
    return {schema:'mls_owner_offline_browser_qa_v1',source:'ACTUAL_WORKER_HTML_READ_ONLY_SNAPSHOT',transport:'HTTP_STATIC',file_protocol:'BLOCKED_BY_BROWSER_ADMINISTRATOR_POLICY_NOT_VALIDATED',worker_sha256:exported.worker_sha256,viewport,panels:panels.length,ai_tabs:5,crypto_available:true,catalog_items:3,selected_variant:product.variant_ref,mutations:'EXPLICITLY_BLOCKED',embedded_mp4s:embeddedVideos,javascript_errors:0,...(image?{image}:{})};
   });
   if(screenshotDirectory)writeFileSync(path.join(screenshotDirectory,'offline-'+viewport.width+'-results.json'),JSON.stringify(proof,null,2)+'\n');
  }assert.equal(staticRequests.some(route=>route.startsWith('/api/')),false,'offline HTML must not contact an API backend');}finally{staticServer.closeAllConnections();await new Promise(resolve=>staticServer.close(resolve));}
 }finally{rmSync(folder,{recursive:true,force:true});}
});
