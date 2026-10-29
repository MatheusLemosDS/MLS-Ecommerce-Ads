import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const qaDir=process.env.MLS_PRODUCTS_SCREENSHOT_DIR||null;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connectChrome(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-products-rework-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--disable-background-networking','--disable-extensions','--remote-allow-origins=*',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let ws;
 try{
  let port=0;
  for(let i=0;i<120;i++){
   try{port=Number(readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);if(port>0)break;}catch{}
   await sleep(75);
  }
  if(!port)throw Error('Chrome CDP startup failed');
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const url=targets.find(x=>x.type==='page')?.webSocketDebuggerUrl;
  if(!url)throw Error('Chrome page target not found');
  ws=new WebSocket(url);
  await new Promise((resolve,reject)=>{
   const clock=setTimeout(()=>reject(Error('CDP socket timeout')),9000);
   ws.addEventListener('open',()=>{clearTimeout(clock);resolve();},{once:true});
   ws.addEventListener('error',()=>{clearTimeout(clock);reject(Error('CDP socket error'));},{once:true});
  });
  let sequence=0;const requests=new Map();
  ws.addEventListener('message',event=>{
   let r;try{r=JSON.parse(event.data);}catch{return;}
   const p=requests.get(r.id);if(!p)return;requests.delete(r.id);
   r.error?p.reject(Error(String(r.error.message))):p.resolve(r.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++sequence;requests.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
  });
  await send('Page.enable');await send('Runtime.enable');
  return {send,async evaluate(expression){
   const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
   if(r.exceptionDetails)throw Error('Browser JS: '+String(r.exceptionDetails.exception?.description||r.exceptionDetails.text).slice(0,350));
   return r.result.value;
  },async screenshot(name){
   if(!qaDir)return;
   const r=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
   if(!r?.data)throw Error('Screenshot missing');
   mkdirSync(qaDir,{recursive:true});
   writeFileSync(path.join(qaDir,name),Buffer.from(r.data,'base64'));
  },close(){
   try{ws?.close();}catch{}try{child.kill('SIGKILL');}catch{}
   try{rmSync(profile,{recursive:true,force:true});}catch{}
  }};
 }catch(error){
  try{ws?.close();}catch{}try{child.kill('SIGKILL');}catch{}
  try{rmSync(profile,{recursive:true,force:true});}catch{}
  throw error;
 }
}

test('real Chrome renders read-only Products hub and legacy controls without horizontal overflow',{timeout:90000},async t=>{
 if(!chrome)return t.skip('Chrome unavailable');
 let {html}=await compiledOwnerReportPage(false);
 // Synthetic only: theme and marker use local test context; no real shop endpoints.
 html=html.replace('<head>','<head><script>try{localStorage.setItem("braza-theme","dark")}catch(e){}</script>');
 html=html.replace('<body>','<body><div style="position:fixed;z-index:99999;right:8px;bottom:8px;pointer-events:none;background:#13243d;color:#edf6ff;border:1px solid #6485b9;padding:5px 8px;border-radius:6px;font:10px sans-serif">QA SINTÉTICA · SEM DADOS REAIS</div>');
 const host=http.createServer((req,res)=>{
  if(req.url?.startsWith('/api/')){
   res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});
   res.end('{"error":"SYNTHETIC_NO_PROVIDER_ACCESS"}');return;
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);
 });
 await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve));
 let browser;const reports=[];
 try{
  browser=await connectChrome();
  for(const device of [{name:'desktop',width:1365,height:900,mobile:false},
   {name:'mobile',width:390,height:844,mobile:true}]){
   await browser.send('Emulation.setDeviceMetricsOverride',{width:device.width,height:device.height,deviceScaleFactor:1,mobile:device.mobile});
   await browser.send('Page.navigate',{url:'http://127.0.0.1:'+host.address().port+'/admin?tab=products'});
   let loaded=false;
   for(let n=0;n<130;n++){
    if(await browser.evaluate("document.readyState==='complete'&&!!document.getElementById('productsHub')&&!!document.getElementById('savedCatalog')")){
     loaded=true;break;
    }
    await sleep(70);
   }
   assert.equal(loaded,true,device.name+': Products did not load');
   const result=await browser.evaluate("(()=>{"+
    "const products=document.getElementById('products');products.hidden=false;"+
    "const startup=document.querySelector('.startup-recovery');if(startup)startup.hidden=true;"+
    "document.querySelectorAll('main.workspace>section').forEach(s=>{if(s!==products)s.hidden=true});"+
    "const intro=document.getElementById('productsHub'),catalog=document.getElementById('savedCatalog'),editor=document.getElementById('legacyProductEditor');"+
    "intro.scrollIntoView({block:'start',behavior:'instant'});"+
    "const box=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:r.width}};"+
    "const grid=intro.querySelector('.products-hub-grid'),cards=[...intro.querySelectorAll('.products-hub-card')];"+
    "return {inner:innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,"+
    "intro:box(intro),hero:box(intro.querySelector('.products-hub-hero')),grid:box(grid),"+
    "cols:getComputedStyle(grid).gridTemplateColumns.trim().split(/\\s+/).length,"+
    "cards:cards.map(box),available:cards.filter(c=>c.dataset.stage==='available').length,"+
    "review:cards.filter(c=>c.dataset.stage==='review').length,catalog:!!catalog,editor:!!editor,"+
    "catalogAfter:intro.compareDocumentPosition(catalog)&Node.DOCUMENT_POSITION_FOLLOWING,"+
    "factory:!!document.getElementById('mlsListingFactory'),"+
    "overflow:[...cards,intro.querySelector('.products-hub-state'),intro.querySelector('.products-hub-caution')].some(n=>box(n).right>innerWidth+2)};})()");
   assert.equal(result.inner,device.width,device.name+': expanded viewport');
   assert.ok(result.scroll<=device.width+2,device.name+': page overflow '+JSON.stringify(result));
   assert.ok(result.intro.left>=-2&&result.intro.right<=device.width+3,device.name+': workspace clipped');
   assert.ok(result.hero.left>=-2&&result.hero.right<=device.width+3,device.name+': hero clipped');
   assert.ok(result.hero.top>=65,device.name+': header may be under sticky navigation');
   assert.ok(result.catalogAfter,device.name+': catalog should follow the hub');
   assert.equal(result.cols,device.mobile?1:4);
   assert.equal(result.cards.length,4);
   assert.equal(result.available,2);
   assert.equal(result.review,2);
   assert.equal(result.catalog,true);
   assert.equal(result.editor,true);
   assert.equal(result.factory,false,'draft Listing Factory cannot appear in main');
   assert.equal(result.overflow,false,device.name+': overview cards are clipped');
   await browser.screenshot('products-'+device.name+'.png');
   await browser.evaluate("document.querySelector('#productsHub .products-hub-grid').scrollIntoView({block:'start',behavior:'instant'})");
   await browser.screenshot('products-'+device.name+'-modules.png');
   await browser.evaluate("document.getElementById('savedCatalog').scrollIntoView({block:'start',behavior:'instant'})");
   await browser.screenshot('products-'+device.name+'-catalog.png');
   reports.push({viewport:device.name,width:device.width,height:device.height,synthetic:true,visibleCards:4,noHorizontalOverflow:true});
  }
  if(qaDir){
   mkdirSync(qaDir,{recursive:true});
   writeFileSync(path.join(qaDir,'results.json'),JSON.stringify({
    schema:'mls_products_visual_qa_v1',owner_real_session_verified:false,production_approved:false,observations:reports
   },null,2)+'\n');
   writeFileSync(path.join(qaDir,'README.txt'),'MLS Products QA: synthetic only. No real user data, D1, Shopee calls or publication. Release not authorized.\n');
  }
 }finally{try{browser?.close();}finally{host.closeAllConnections?.();host.close();}}
});
