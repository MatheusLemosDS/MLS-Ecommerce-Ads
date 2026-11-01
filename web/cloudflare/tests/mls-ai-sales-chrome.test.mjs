import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const artifactDirectory=process.env.MLS_AI_SALES_SCREENSHOT_DIR?path.resolve(process.env.MLS_AI_SALES_SCREENSHOT_DIR):null;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

// Exercise the compiled owner document, with an isolated local browser and
// synthetic sources only. This never opens a seller account or calls a provider.
async function withAiSalesChrome(url,{width,height},exercise){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-ai-sales-chrome-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--disable-background-networking','--disable-extensions','--remote-allow-origins=*',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const closed=new Promise(resolve=>child.once('close',resolve));
 let socket;
 const pending=new Map();
 try{
  let port=0;
  for(let i=0;i<100&&!port;i++){
   try{port=Number(readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}
   if(!port)await pause(75);
  }
  assert.ok(port,'Chromium debug port unavailable');
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(pages.find(row=>row.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('AI_SALES_CHROME_SOCKET_TIMEOUT')),10000);
   socket.addEventListener('open',()=>{clearTimeout(timeout);resolve();},{once:true});
   socket.addEventListener('error',()=>{clearTimeout(timeout);reject(Error('AI_SALES_CHROME_SOCKET_ERROR'));},{once:true});
  });
  let sequence=0;
  socket.addEventListener('message',event=>{
   const message=JSON.parse(event.data),entry=pending.get(message.id);if(!entry)return;
   pending.delete(message.id);clearTimeout(entry.timeout);
   message.error?entry.reject(Error(message.error.message)):entry.resolve(message.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++sequence,timeout=setTimeout(()=>{pending.delete(id);reject(Error('AI_SALES_CDP_TIMEOUT_'+method));},20000);
   pending.set(id,{resolve,reject,timeout});socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async(expression,awaitPromise=false)=>{
   const result=await send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true});
   if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
   return result.result.value;
  };
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});
  await send('Page.navigate',{url});
  let ready=false;
  for(let i=0;i<100;i++){
   if(await evaluate("document.readyState==='complete' && !!document.getElementById('missionSearchOpen')")){ready=true;break;}
   await pause(75);
  }
  assert.equal(ready,true,'compiled owner document did not finish');
  const capture=async name=>{
   if(!artifactDirectory)return null;
   assert.match(name,/^[a-z0-9-]+\.png$/);
   const result=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
   const bytes=Buffer.from(result.data,'base64');mkdirSync(artifactDirectory,{recursive:true});
   writeFileSync(path.join(artifactDirectory,name),bytes);
   return {file:name,sha256:sha256(bytes),bytes:bytes.length};
  };
  return await exercise(evaluate,capture);
 }finally{
  for(const entry of pending.values())clearTimeout(entry.timeout);
  try{socket?.close();}catch{}try{child.kill('SIGKILL');}catch{}
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('AI_SALES_CHROME_SHUTDOWN_TIMEOUT')),3000);
   closed.then(()=>{clearTimeout(timeout);resolve();});
  });
  rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:50});
 }
}

function instrumentAiSalesPage(html){
 return html.replace('<head>','<head><script>globalThis.__aiSalesErrors=[];addEventListener("error",event=>__aiSalesErrors.push(String(event.message)));addEventListener("unhandledrejection",event=>__aiSalesErrors.push(String(event.reason)));</script>');
}

async function serveAiSalesPage(html,{expired=false}={},exercise){
 const calls=[];
 const server=http.createServer((request,response)=>{
  const url=new URL(request.url,'http://local.test');
  if(url.pathname.startsWith('/api/')){
   calls.push({path:url.pathname+url.search,method:request.method});
   const bootstrap=url.pathname==='/api/admin/bootstrap';
   response.writeHead(expired?401:bootstrap?200:503,{'content-type':'application/json'});
   response.end(JSON.stringify(expired?{error:'UNAUTHORIZED'}:bootstrap?{schema:'admin_bootstrap_v1',csrf:'a'.repeat(64)}:{error:'SYNTHETIC_SOURCE_UNAVAILABLE'}));return;
  }
  response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end(instrumentAiSalesPage(html));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{return await exercise('http://127.0.0.1:'+server.address().port,calls);}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

const aiSalesCatalogFixture=String.raw`
 const stamp=Math.floor(Date.now()/1000)-120;
 const product={item_id:'12345',item_status:'NORMAL',product_name:'Camiseta de teste <img src=x onerror=alert(1)>',
  source_update_time:stamp,last_seen_at:stamp,catalog_checked_at:stamp,catalog_status:'MATCHED',model_count:2,resolved_count:2,metadata_changed:false};
 const variants=[{model_id:'98765',model_name:'Azul / G',attributes:[{name:'Cor',value:'Azul'},{name:'Tamanho',value:'G'}],
  unit_cost_cents:1590,selling_unit:'SINGLE_GARMENT',size:'G',male_size:null,female_size:null,cost_profile_id:null,cost_profile_label:null,reason:null},
 {model_id:'98766',model_name:'Azul / GG',attributes:[{name:'Cor',value:'Azul'},{name:'Tamanho',value:'GG'}],
  unit_cost_cents:1590,selling_unit:'SINGLE_GARMENT',size:'GG',male_size:null,female_size:null,cost_profile_id:null,cost_profile_label:null,reason:null}];
 const list={schema:'product_registry_v1',checked_at:stamp+60,revision:1,counts:{total:1,indexed:1,pending_catalog:0},
  discovery:{status:'IDLE',item_status:'NORMAL',offset:0,pages_read:1,last_attempt_at:stamp,last_success_at:stamp,next_run_at:stamp+3600,last_error:null,complete:true},
  pagination:{limit:20,offset:0,total:1,more:false},products:[product]};
 const detail={schema:'product_registry_detail_v1',checked_at:stamp+60,product,pagination:{limit:50,offset:0,total:2,more:false},
  revisions:{costs:1,bindings:1,cost_rules:1,classifications:1},variants};
 const localCalls=[];
 const localApi=async(route,body)=>{localCalls.push({route,write:body!==undefined});if(route.startsWith('product-registry?item_id='))return structuredClone(detail);if(route.startsWith('product-registry?'))return structuredClone(list);throw Error('UNEXPECTED_AI_SALES_READ');};
`;

// The domain tests cover provider-independent arithmetic. These browser tests
// cover owner navigation, the real form handlers and original local file bytes.
for(const minify of [false,true])test('compiled AI Sales keeps all five native tabs usable on desktop and mobile (minify='+minify+')',{timeout:120000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 const {html}=await compiledOwnerReportPage(minify,{ownerPreview:false,aiSalesPreview:true});
 const proof=[];
 await serveAiSalesPage(html,{},async base=>{
  for(const size of [{width:1365,height:900},{width:390,height:844}]){
   const result=await withAiSalesChrome(base+'/admin?tab=ai-sales',size,async(evaluate,capture)=>{
    await evaluate(`(async()=>{
    const wait=async(check)=>{for(let i=0;i<150;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,30));}throw Error('AI_SALES_UI_WAIT_TIMEOUT');};
    await wait(()=>!!globalThis.mlsAiSalesWorkspace&&document.getElementById('message').dataset.startup!=='true');
    ${aiSalesCatalogFixture}
    globalThis.__aiSalesLocalCalls=localCalls;
    await globalThis.mlsAiSalesWorkspace.start({api:localApi});
    document.querySelector('[data-tab="ai-sales"]').click();
    await wait(()=>!document.getElementById('ai-sales').hidden);
    // Native workspace navigation settles its scroll on the next animation frame.
    // Finish that navigation before testing the inner tab bar's own scrolling.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    })()`,true);
    const tabs=[];
    for(const theme of ['light','dark']){
     const applied=await evaluate(`(()=>{for(let i=0;i<3&&document.documentElement.dataset.theme!==${JSON.stringify(theme)};i++)document.querySelector('[data-braza-theme-toggle]').click();return document.documentElement.dataset.theme;})()`);
     assert.equal(applied,theme,'native theme toggle must apply the requested theme');
     for(const name of ['campaigns','studio','affiliates','performance','integrations']){
      const tab=await evaluate(`(async()=>{
       const name=${JSON.stringify(name)};document.getElementById('aiSalesTab-'+name).click();
       document.querySelector('.mls-ai-tabs').scrollIntoView({block:'start',behavior:'instant'});window.scrollBy({top:-85,behavior:'instant'});
       document.getElementById('aiSalesTab-'+name).scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
       await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
       return {name,theme:document.documentElement.dataset.theme,selected:document.getElementById('aiSalesTab-'+name).getAttribute('aria-selected'),
        visible:[...document.querySelectorAll('#ai-sales [role="tabpanel"]')].filter(panel=>!panel.hidden).map(panel=>panel.id),
        overflow:document.documentElement.scrollWidth>innerWidth+1,
        panelTop:document.getElementById('aiSalesPanel-'+name).getBoundingClientRect().top,
        tabsTop:document.querySelector('.mls-ai-tabs').getBoundingClientRect().top,
        activeTabVisible:(()=>{const button=document.getElementById('aiSalesTab-'+name).getBoundingClientRect(),bar=document.querySelector('.mls-ai-tabs').getBoundingClientRect();return button.left>=bar.left-1&&button.right<=bar.right+1;})()};
      })()`,true);
      const image=await capture((minify?'minified':'normal')+'-'+theme+'-'+size.width+'-'+name+'.png');
      tabs.push({...tab,viewport:size,...(image?{image}:{})});
     }
    }
    const details=await evaluate(`({heading:document.getElementById('pageTitle').textContent,errors:__aiSalesErrors.slice(),
     tabsDirection:getComputedStyle(document.querySelector('.mls-ai-tabs')).flexDirection,
     localCalls:__aiSalesLocalCalls,rootVisible:!document.getElementById('ai-sales').hidden})`);
    return {tabs,...details};
   });
   assert.equal(result.heading,'MLS AI Sales');assert.equal(result.rootVisible,true);
   assert.equal(result.tabsDirection,'row');assert.equal(result.tabs.length,10);
   for(const tab of result.tabs){assert.equal(tab.selected,'true');assert.deepEqual(tab.visible,['aiSalesPanel-'+tab.name]);assert.equal(tab.overflow,false,'page overflow on '+size.width+' '+tab.name);assert.ok(tab.tabsTop>=60&&tab.panelTop<size.height-100,'selected tab and its content must be visible in the captured viewport: '+JSON.stringify(tab));assert.equal(tab.activeTabVisible,true,'selected tab must be visible inside the mobile tab bar');}
   assert.deepEqual(result.errors,[]);assert.equal(result.localCalls.some(row=>row.write),false);
   proof.push(result);
  }
 });
 if(artifactDirectory)writeFileSync(path.join(artifactDirectory,(minify?'minified':'normal')+'-results.json'),JSON.stringify({
  schema:'mls_ai_sales_compiled_visual_qa_v1',source:'SYNTHETIC_LOCAL_OWNER_NO_EXTERNAL_SERVICE',
  real_owner_authenticated:false,owner_visual_approval:'PENDING',minified:minify,
  worker_sha256:sha256(readFileSync(new URL('../../../dist/app-worker.mjs',import.meta.url))),scenarios:proof
 },null,2)+'\n');
});

test('compiled AI Sales stays absent by default and expired startup cannot read its catalog',{timeout:65000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 const off=await compiledOwnerReportPage(false,{ownerPreview:false});
 await serveAiSalesPage(off.html,{},base=>withAiSalesChrome(base+'/admin?tab=ai-sales',{width:390,height:844},async evaluate=>{
  const result=await evaluate(`({panel:!!document.getElementById('ai-sales'),client:typeof globalThis.mlsAiSalesWorkspace,
   navigation:document.querySelectorAll('[data-tab="ai-sales"]').length,active:document.documentElement.dataset.activePanel,errors:__aiSalesErrors.slice()})`);
  assert.equal(result.panel,false);assert.equal(result.client,'undefined');assert.equal(result.navigation,0);assert.equal(result.active,'overview');assert.deepEqual(result.errors,[]);
 }));
 const on=await compiledOwnerReportPage(false,{ownerPreview:false,aiSalesPreview:true});
 await serveAiSalesPage(on.html,{expired:true},async(base,calls)=>{
  const result=await withAiSalesChrome(base+'/admin?tab=ai-sales',{width:390,height:844},evaluate=>evaluate(`(async()=>{
   for(let i=0;i<100&&document.getElementById('startupLogin').hidden;i++)await new Promise(resolve=>setTimeout(resolve,30));
   document.getElementById('aiSalesCatalogLoad').click();await new Promise(resolve=>setTimeout(resolve,100));
   return {loginVisible:!document.getElementById('startupLogin').hidden,products:globalThis.mlsAiSalesWorkspace.getSnapshot().products.length,errors:__aiSalesErrors.slice()};
  })()`,true));
  assert.equal(result.loginVisible,true);assert.equal(result.products,0);assert.deepEqual(result.errors,[]);
  assert.equal(calls.some(row=>row.path.includes('product-registry')),false,'expired startup must not start AI catalog reads');
 });
});

for(const minify of [false,true])test('compiled AI Sales selects the exact saved variant, binds original bytes and exports an executable local draft (minify='+minify+')',{timeout:120000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 const {html}=await compiledOwnerReportPage(minify,{ownerPreview:false,aiSalesPreview:true});
 await serveAiSalesPage(html,{},async base=>{
  const result=await withAiSalesChrome(base+'/admin?tab=ai-sales',{width:390,height:844},evaluate=>evaluate(`(async()=>{
   const by=id=>document.getElementById('aiSales'+id),snapshot=()=>globalThis.mlsAiSalesWorkspace.getSnapshot();
   const wait=async(check)=>{for(let i=0;i<200;i++){if(check()&&!document.getElementById('ai-sales').hasAttribute('aria-busy'))return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('AI_SALES_WORKFLOW_WAIT_TIMEOUT: '+by('Status').textContent);};
   await wait(()=>!!globalThis.mlsAiSalesWorkspace&&document.getElementById('message').dataset.startup!=='true');
   ${aiSalesCatalogFixture}
   await globalThis.mlsAiSalesWorkspace.start({api:localApi});
   document.querySelector('[data-tab="ai-sales"]').click();
   by('CatalogForm').requestSubmit();await wait(()=>by('Catalog').querySelectorAll('article').length===1);
   by('Catalog').querySelector('button').click();await wait(()=>by('Variants').querySelectorAll('article').length===2);
   by('Variants').querySelectorAll('article')[1].querySelector('button').click();await wait(()=>snapshot().products.length===1);
   const chosen=snapshot().products[0],safeTitle=by('Selected').textContent.includes('<img src=x onerror=alert(1)>')&&by('Selected').querySelectorAll('img,script,iframe').length===0;
   const coverage=by('AssetCoverage').querySelector('[data-component-ref]');coverage.value='1';coverage.dispatchEvent(new Event('input'));
   by('RightsReference').value='synthetic-own-test-art';by('RightsConfirmed').checked=true;
   const canvas=document.createElement('canvas');canvas.width=400;canvas.height=600;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#20334a';ctx.fillRect(0,0,400,600);ctx.fillStyle='#ee4a21';ctx.fillRect(40,80,70,120);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),file=new File([blob],'synthetic-asymmetric-original.png',{type:'image/png'});
   const bytes=await file.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes),expectedHash=[...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('');
   const transfer=new DataTransfer();transfer.items.add(file);by('AssetFiles').files=transfer.files;by('AssetFiles').dispatchEvent(new Event('change'));
   await wait(()=>snapshot().assets.length===1);
   for(const checkbox of document.querySelectorAll('[data-ai-sales-template]'))checkbox.checked=checkbox.dataset.aiSalesTemplate==='PRODUCT_DETAILS';
   by('Plan').click();await wait(()=>snapshot().campaigns.length===1);
   const planned=snapshot(),downloads=[],originalUrl=URL.createObjectURL.bind(URL);
   URL.createObjectURL=value=>{if(value.type==='application/json')downloads.push(value);return originalUrl(value);};HTMLAnchorElement.prototype.click=function(){};
   [...by('Campaigns').querySelectorAll('button')].find(button=>button.textContent==='Conferir e exportar entrada CLI').click();await wait(()=>downloads.length===1);
   const exported=JSON.parse(await downloads[0].text());
   by('Tab-affiliates').click();by('CreatorHandle').value='@synthetic_creator';by('CreatorFit').value='Nostalgia, Moda';
   by('CreatorState').value='ELIGIBLE';by('CreatorConsent').checked=true;by('CreatorConsentReference').value='synthetic-profile-permitted';
   by('CreatorForm').requestSubmit();await wait(()=>snapshot().affiliates.creators.length===1);
   by('ProposalRate').value='5';by('ProposalForm').requestSubmit();await wait(()=>snapshot().affiliates.plans.length===1);
   const proposal=snapshot().affiliates.plans[0],approvalDisabled=[...by('Proposals').querySelectorAll('button')].find(button=>button.textContent==='Revalidar e aprovar o rascunho').disabled;
   const firstCreator=snapshot().affiliates.creators[0],otherCreator={...firstCreator,provider:'TIKTOK_SHOP_BR',shop_ref:'primary-tiktok',approved_handle:'@other_market_creator',
    consent_evidence:{...firstCreator.consent_evidence,marketplace:'TIKTOK_SHOP_BR',shop_ref:'primary-tiktok'}};
   const creatorFile=new File([JSON.stringify({schema:'mls_ai_sales_affiliate_creators_v1',creators:[otherCreator]})],'synthetic-other-creator.json',{type:'application/json'}),creatorTransfer=new DataTransfer();creatorTransfer.items.add(creatorFile);by('CreatorImport').files=creatorTransfer.files;by('CreatorImport').dispatchEvent(new Event('change'));
   await wait(()=>snapshot().affiliates.creators.length===2);
   const scopedValues=[...by('ProposalCreator').options].map(option=>option.value),otherOption=[...by('ProposalCreator').options].find(option=>option.textContent.includes('TIKTOK_SHOP_BR'));
   by('ProposalCreator').value=otherOption.value;by('ProposalForm').requestSubmit();await wait(()=>by('Status').dataset.error==='true');
   const wrongScopeMessage=by('Status').textContent,plansAfterWrongScope=snapshot().affiliates.plans.length;
   const otherCard=[...by('Creators').querySelectorAll('article')].find(card=>card.textContent.includes('@other_market_creator'));
   [...otherCard.querySelectorAll('button')].find(button=>button.textContent==='Editar criador').click();await wait(()=>by('CreatorProvider').value==='TIKTOK_SHOP_BR');
   by('CreatorHandle').value='@other_market_edited';by('CreatorForm').requestSubmit();await wait(()=>snapshot().affiliates.creators.some(row=>row.approved_handle==='@other_market_edited'));
   const scopedCreators=snapshot().affiliates.creators;
   by('Tab-performance').click();
   const period={start_date:'2026-10-01',end_date:'2026-10-30'},record={schema:'mls_ai_sales_manual_performance_record_v1',record_id:'synthetic-metric',revision:1,kind:'METRICS',provider:'SHOPEE_BR',shop_ref:'primary-shopee',currency:'BRL',source:'SELLER_REPORT',
    source_evidence:{source:'SELLER_REPORT',reference:'synthetic-import',observed_at:stamp,status:'VERIFIED',marketplace:'SHOPEE_BR',shop_ref:'primary-shopee',currency:'BRL',basis:'PAID_GROSS_AND_REPORTED_COSTS'},
    observed_at:stamp,period,campaign_ref:'campaign-synthetic',creative_ref:'creative-synthetic',product_ref:chosen.product_key,creator_ref:null,coverage_status:'COMPLETE',attribution_status:'SOURCE_REPORTED',order_status:null,
    views:1000,clicks:100,attributed_orders:10,sales_cents:10000,refunds_cents:0,commission_cents:500,cost_cents:4000,fees_cents:1000,tax_cents:0,external_expenses_cents:0,attributable_ad_spend_cents:2000,adjustment_cents:0};
   const performanceFile=new File([JSON.stringify({schema:'mls_ai_sales_performance_import_v1',records:[record,record]})],'synthetic-performance.json',{type:'application/json'}),performanceTransfer=new DataTransfer();performanceTransfer.items.add(performanceFile);by('PerformanceImport').files=performanceTransfer.files;by('PerformanceImport').dispatchEvent(new Event('change'));
   await wait(()=>snapshot().performance.records.length===1);
   by('PerformanceStart').value=period.start_date;by('PerformanceEnd').value=period.end_date;by('PerformanceForm').requestSubmit();await wait(()=>by('PerformanceReport').textContent.includes('DECLARED_COMPLETE'));
   const performanceText=by('PerformanceReport').textContent,final=snapshot();
   globalThis.mlsAiSalesWorkspace.stop();
   return {chosen,safeTitle,expectedHash,planned,exported,proposal,approvalDisabled,performanceText,
    importedEvidence:final.performance.records[0].source_evidence,
    creator:final.affiliates.creators.find(row=>row.provider==='SHOPEE_BR'),scopedValues,wrongScopeMessage,plansAfterWrongScope,scopedCreators,localCalls,errors:__aiSalesErrors.slice(),
    afterStop:snapshot(),overflow:document.documentElement.scrollWidth>innerWidth+1};
  })()`,true));
  assert.equal(result.chosen.variant_ref,'98766');assert.equal(result.chosen.sku,null);assert.equal(result.chosen.price_cents,null);assert.equal(result.chosen.inventory_units,null);
  assert.equal(result.safeTitle,true);assert.equal(result.planned.assets[0].sha256,result.expectedHash);assert.equal(result.planned.assets[0].represented_units,1);
  assert.equal(result.planned.campaigns[0].status,'READY_FOR_LOCAL_RENDER');assert.equal(result.planned.campaigns[0].script_source,'LOCAL_TEMPLATE');assert.equal(result.planned.jobs[0].state,'PLANNED');
  assert.equal(result.exported.schema,'mls_ai_sales_local_input_v1');assert.equal(result.exported.products[0].variant_ref,'98766');assert.equal(result.exported.assets[0].sha256,result.expectedHash);
  assert.equal(result.exported.narration.language,'pt-BR');assert.equal(result.exported.budget.max_provider_cost_cents,0);assert.equal(result.exported.campaign.commercial_writes,false);
  assert.equal(result.proposal.collaboration.status,'BLOCKED');assert.equal(result.proposal.collaboration.commercial_writes,false);assert.equal(result.approvalDisabled,true);
  assert.equal(result.creator.seller_creator_access_grant_status,'UNKNOWN');assert.equal(result.creator.consent_evidence.status,'DECLARED');
  assert.equal(new Set(result.scopedValues).size,2);assert.equal(result.plansAfterWrongScope,1);assert.match(result.wrongScopeMessage,/AI_SALES_CREATOR_PRODUCT_SCOPE_MISMATCH/);
  assert.equal(result.scopedCreators.find(row=>row.provider==='SHOPEE_BR').approved_handle,'@synthetic_creator');assert.equal(result.scopedCreators.find(row=>row.provider==='TIKTOK_SHOP_BR').approved_handle,'@other_market_edited');
  assert.equal(result.scopedCreators[0].internal_creator_id,result.scopedCreators[1].internal_creator_id);
  assert.equal(result.importedEvidence.status,'DECLARED');assert.equal(result.importedEvidence.source,'OPERATOR_IMPORTED');assert.match(result.performanceText,/5,00x/);assert.match(result.performanceText,/Não confirmado/);
  assert.equal(result.localCalls.some(row=>row.write),false);assert.deepEqual(result.localCalls.map(row=>row.route),['product-registry?limit=20&offset=0&search=&item_status=ACTIVE','product-registry?item_id=12345&variant_limit=50&variant_offset=0']);
  assert.deepEqual(result.errors,[]);assert.equal(result.overflow,false);assert.equal(result.afterStop.products.length,0);assert.equal(result.afterStop.assets.length,0);assert.equal(result.afterStop.campaigns.length,0);
 });
});
