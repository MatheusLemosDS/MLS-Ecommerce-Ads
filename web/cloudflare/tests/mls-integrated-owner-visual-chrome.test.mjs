// Owner visual QA: synthetic account only. NEVER read real Shop, buyer, or Finance data.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const qaDir=process.env.MLS_QA_SCREENSHOT_DIR||null;

async function launch(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-owner-visual-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--disable-background-networking','--disable-extensions','--remote-allow-origins=*',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let ws=null;
 try{
  let port=null;
  for(let i=0;i<110;i++){
   try{const parts=readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n');
    port=Number(parts[0]);if(port>0)break;}catch{}
   await sleep(80);
  }
  if(!port)throw Error('Chrome CDP failed to start');
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const address=pages.find(x=>x.type==='page')?.webSocketDebuggerUrl;
  if(!address)throw Error('No Chrome page available');
  ws=new WebSocket(address);
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('CDP connection timed out')),9000);
   ws.addEventListener('open',()=>{clearTimeout(timeout);resolve();},{once:true});
   ws.addEventListener('error',()=>{clearTimeout(timeout);reject(Error('CDP socket error'));},{once:true});
  });
  const pending=new Map();let sequence=0;
  ws.addEventListener('message',event=>{
   let msg;try{msg=JSON.parse(event.data);}catch{return;}
   const p=pending.get(msg.id);if(!p)return;pending.delete(msg.id);
   msg.error?p.reject(Error(String(msg.error.message))):p.resolve(msg.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
  });
  await send('Page.enable');await send('Runtime.enable');
  return {send,async evaluate(expression){
   const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
   if(r?.exceptionDetails)throw Error('Browser JS: '+r.exceptionDetails.text+' '+
    String(r.exceptionDetails.exception?.description||'').slice(0,500));
   return r?.result?.value;
  },async screenshot(filename){
   if(!qaDir)return;
   const res=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
   if(!res?.data||res.data.length>15*1024*1024)throw Error('Screenshot invalid');
   mkdirSync(qaDir,{recursive:true});
   writeFileSync(path.join(qaDir,filename),Buffer.from(res.data,'base64'));
  },close(){try{ws?.close();}catch{}try{child.kill('SIGKILL');}catch{}rmSync(profile,{recursive:true,force:true});}};
 }catch(error){
  try{ws?.close();}catch{}try{child.kill('SIGKILL');}catch{}rmSync(profile,{recursive:true,force:true});throw error;
 }
}

const ready="document.readyState==='complete'&&!!document.getElementById('mlsListingFactory')&&!!globalThis.mlsWorkspaceSearch&&!!globalThis.brazaDtfWorkspace";
const layout="(()=>{\n const root=document.getElementById('mlsListingFactory');\n const inputs=[...root.querySelectorAll('.mls-lf-field input:not([type=checkbox]),.mls-lf-field textarea')].map(node=>({id:node.id,right:node.getBoundingClientRect().right,left:node.getBoundingClientRect().left}));\n const bounds=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:r.width,height:r.height,visible:r.width>0&&r.height>0};};\n root.scrollIntoView({block:'start',behavior:'instant'});\n return {panel:document.documentElement.dataset.activePanel,productsHidden:document.getElementById('products').hidden,\n  viewport:{width:innerWidth,height:innerHeight,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,visualWidth:visualViewport?.width},factory:bounds(root),inputs,\n  file:bounds(document.getElementById('mlsLfBatchFiles')),folder:bounds(document.getElementById('mlsLfBatchFolder')),\n  search:bounds(document.getElementById('missionSearchOpen')),\n  productGrid:getComputedStyle(root.querySelector('.mls-lf-grid')).gridTemplateColumns,\n  bulkGrid:getComputedStyle(root.querySelector('.mls-lf-bulk-grid')).gridTemplateColumns,\n  price:document.getElementById('mlsLfPrice').value,\n  initialDrafts:document.getElementById('mlsLfDrafts').querySelectorAll('article').length,\n  bulkFilesDisabled:document.getElementById('mlsLfBatchFiles').disabled,\n  bulkFolderDisabled:document.getElementById('mlsLfBatchFolder').disabled};\n})()";
const search="(()=>{\n const opener=document.getElementById('missionSearchOpen');opener.click();\n const overlay=document.getElementById('missionGlobalSearch'),input=document.getElementById('missionSearchInput'),\n  buttons=[...overlay.querySelectorAll('[data-mission-scope]')],execute=document.getElementById('missionSearchExecute'),\n  bounds=overlay.querySelector('.mission-search-dialog').getBoundingClientRect();\n const focused=overlay.hidden===false&&document.activeElement===input;\n const products=buttons.find(node=>node.dataset.missionScope==='products');products.click();\n const initial={pressed:products.getAttribute('aria-pressed'),hidden:execute.hidden,disabled:execute.disabled};\n input.value='camiseta';input.dispatchEvent(new Event('input',{bubbles:true}));\n return {open:!overlay.hidden,focused,scopeIds:buttons.map(x=>x.dataset.missionScope),\n  initial,queryEnabled:!execute.disabled,\n  bounds:{left:bounds.left,right:bounds.right,top:bounds.top,bottom:bounds.bottom,width:bounds.width,height:bounds.height},\n  viewport:[innerWidth,innerHeight]};\n})()";
const dtf="(async()=>{\n const overlay=document.getElementById('missionGlobalSearch'),input=document.getElementById('missionSearchInput'),\n  resultBox=document.getElementById('missionSearchResults'),execute=document.getElementById('missionSearchExecute');\n globalThis.brazaDtfWorkspace.searchLines=(query,offset)=>({\n  schema:'mls_saved_dtf_search_v1',offset,limit:8,total:1,more:false,\n  rows:[{order_id:'998877',sku:'MOCK-001',production_state:'PENDING',quantity:2}]\n });\n globalThis.brazaDtfWorkspace.findLine=id=>{document.documentElement.dataset.mlsSyntheticOrder=id;return true;};\n overlay.querySelector('[data-mission-scope=dtf]').click();\n input.value='MOCK-001';input.dispatchEvent(new Event('input',{bubbles:true}));execute.click();\n for(let n=0;n<75&&!resultBox.querySelector('[data-type=dtf]');n++)\n  await new Promise(r=>setTimeout(r,40));\n const link=resultBox.querySelector('[data-type=dtf]');\n const title=link?.querySelector('strong')?.textContent||null;\n link?.click();await new Promise(r=>setTimeout(r,60));\n const data={found:!!link,title,selected:document.documentElement.dataset.mlsSyntheticOrder||null,\n  panel:document.documentElement.dataset.activePanel,closed:overlay.hidden,\n  productionVisible:document.getElementById('production')?.hidden===false,\n  catalogPresent:!!document.getElementById('savedCatalog'),\n  factoryPresent:!!document.getElementById('mlsListingFactory')};\n globalThis.mlsWorkspaceSearch.open();\n document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));\n data.escapeCloses=overlay.hidden;return data;\n})()";

test('synthetic owner visual smoke in desktop and mobile Chrome with zero real-account access',{timeout:90000},async t=>{
 if(!chrome)return t.skip('Chrome is not installed');
 // This fixture uses a signed synthetic session and in-memory SQLite D1; no real credentials.
 const page=await compiledOwnerReportPage(false);
 const marker='<div id="mlsSyntheticQa" style="position:fixed;bottom:7px;right:7px;z-index:99999;pointer-events:none;background:#222;color:#fff;font:10px sans-serif;padding:5px 9px;border-radius:4px">AMBIENTE DE TESTE · DADOS SINTÉTICOS</div>';
 const html=page.html.replace('<body>','<body>'+marker);
 const host=http.createServer((req,res)=>{
  if(req.url?.startsWith('/api/')){
   res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"SYNTHETIC_NO_REMOTE_API"}');return;
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);
 });
 await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve));
 let cdp;const report=[];
 try{
  cdp=await launch();
  const url='http://127.0.0.1:'+host.address().port+'/admin?tab=products';
  for(const item of [{name:'desktop',width:1365,height:900,mobile:false},
   {name:'mobile',width:390,height:844,mobile:true}]){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:item.width,height:item.height,
    deviceScaleFactor:1,mobile:item.mobile});
   await cdp.send('Page.navigate',{url});
   let initialized=false;
   for(let n=0;n<120;n++){
    if(await cdp.evaluate(ready)){initialized=true;break;}await sleep(75);
   }
   assert.equal(initialized,true,item.name+': owner client was not ready');
   const first=await cdp.evaluate(layout);
   assert.equal(first.panel,'products');
   assert.equal(first.productsHidden,false);
   assert.equal(first.price,'','no fabricated price');
   assert.equal(first.initialDrafts,0);
   assert.equal(first.bulkFilesDisabled,true);
   assert.equal(first.bulkFolderDisabled,true);
   assert.equal(first.factory.visible,true);
   assert.ok(first.viewport.width<=item.width+2,
    item.name+': layout viewport expanded unexpectedly '+JSON.stringify(first.viewport));
   assert.ok(first.viewport.scrollWidth<=item.width+2,
    item.name+': document has horizontal overflow: '+JSON.stringify(first.viewport));
   assert.ok(first.viewport.clientWidth<=item.width+2,
    item.name+': documentElement clientWidth exceeds device width: '+JSON.stringify(first.viewport));
   assert.ok(first.viewport.visualWidth<=item.width+2,
    item.name+': visual viewport exceeds device width: '+JSON.stringify(first.viewport));
   assert.ok(first.search.left>=-2&&first.search.right<=item.width+2,
    item.name+': search trigger is clipped: '+JSON.stringify(first.search));
   assert.ok(first.inputs.every(x=>x.left>=-2&&x.right<=item.width+2),
    item.name+': Listing Factory input overflow: '+JSON.stringify(first.inputs.filter(x=>x.right>item.width+2)));
   assert.ok(first.factory.left>=-2&&first.factory.right<=item.width+3,
    item.name+': factory overflows screen: '+JSON.stringify(first.factory));
   assert.ok(first.file.right<=item.width+3&&first.folder.right<=item.width+3);
   assert.ok(first.search.visible,'search button must remain visible');
   const productCols=first.productGrid.trim().split(/\s+/).length,
    bulkCols=first.bulkGrid.trim().split(/\s+/).length;
   assert.equal(productCols,item.mobile?1:2);
   assert.equal(bulkCols,item.mobile?1:2);
   await cdp.screenshot('owner-products-'+item.name+'.png');
   const palette=await cdp.evaluate(search);
   assert.equal(palette.open,true);assert.equal(palette.focused,true);
   assert.deepEqual(palette.scopeIds,['navigation','products','dtf']);
   assert.deepEqual(palette.initial,{pressed:'true',hidden:false,disabled:true});
   assert.equal(palette.queryEnabled,true);
   await cdp.screenshot('owner-search-'+item.name+'.png');
   assert.ok(palette.bounds.left>=0&&palette.bounds.right<=item.width+2,
    item.name+': modal overflows screen: '+JSON.stringify(palette));
   assert.ok(palette.bounds.bottom<=item.height+4,item.name+': modal overflows height: '+JSON.stringify(palette));
   const result=await cdp.evaluate(dtf);
   assert.equal(result.found,true);
   assert.equal(result.title,'Pedido 998877');
   assert.equal(result.selected,'998877');
   assert.equal(result.panel,'production');
   assert.equal(result.closed,true);assert.equal(result.productionVisible,true);
   assert.equal(result.catalogPresent,true);assert.equal(result.factoryPresent,true);
   assert.equal(result.escapeCloses,true);
   report.push({viewport:item.name,width:item.width,height:item.height,synthetic:true,
    factoryFits:true,formColumns:productCols,bulkColumns:bulkCols,
    scopes:palette.scopeIds,dtfSelection:result.selected,escapeCloses:true});
  }
  if(qaDir){
   mkdirSync(qaDir,{recursive:true});
   writeFileSync(path.join(qaDir,'README.txt'),
    'MLS Commerce OS: SYNTHETIC OWNER test only, using isolated fake login and EMPTY local D1.\n'+
    'NO REAL SHOP, no customer data or Shopee API used. NOT approval for production release.\n'+
    'Manual authenticated QA with the operator and Finance M2 reconciliation still required.\n');
   writeFileSync(path.join(qaDir,'results.json'),JSON.stringify({schema:'mls_owner_visual_synthetic_qa_v1',
    owner_real_session_verified:false,production_approved:false,observations:report},null,2)+'\n');
  }
 }finally{try{cdp?.close();}finally{host.closeAllConnections?.();host.close();}}
});
