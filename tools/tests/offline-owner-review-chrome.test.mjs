import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {writeOfflineOwnerReview} from '../build_offline_owner_review.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
 '/usr/bin/chromium','/usr/bin/chromium-browser'].find(fs.existsSync);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function openBrowser(){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mls-offline-browser-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage',
  '--disable-gpu','--disable-background-networking','--disable-extensions',
  '--remote-allow-origins=*','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let socket;
 try{
  let port=0;
  for(let i=0;i<130;i++){
   try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);if(port>0)break;}catch{}
   await pause(65);
  }
  if(!port)throw Error('Offline Chrome could not start');
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const ws=tabs.find(x=>x.type==='page')?.webSocketDebuggerUrl;
  if(!ws)throw Error('Chrome tab not available');
  socket=new WebSocket(ws);
  await new Promise((resolve,reject)=>{
   const tm=setTimeout(()=>reject(Error('Chrome websocket timeout')),9000);
   socket.addEventListener('open',()=>{clearTimeout(tm);resolve();},{once:true});
   socket.addEventListener('error',()=>{clearTimeout(tm);reject(Error('WebSocket failed'));},{once:true});
  });
  let count=0;const requests=new Map();
  socket.addEventListener('message',e=>{
   let m;try{m=JSON.parse(e.data);}catch{return;}
   const r=requests.get(m.id);if(!r)return;requests.delete(m.id);
   m.error?r.reject(Error(String(m.error.message))):r.resolve(m.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++count;requests.set(id,{resolve,reject});
   socket.send(JSON.stringify({id,method,params}));
  });
  await send('Page.enable');await send('Runtime.enable');
  return {send,async eval(expression){
   const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
   if(r.exceptionDetails)throw Error('Chrome evaluation: '+String(r.exceptionDetails.exception?.description||r.exceptionDetails.text).slice(0,340));
   return r.result.value;
  },async screenshot(filename){
   const result=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
   if(!result?.data)throw Error('Chrome screenshot missing');
   fs.writeFileSync(filename,Buffer.from(result.data,'base64'));
  },close(){
   try{socket?.close();}catch{}try{child.kill('SIGKILL');}catch{}
   try{fs.rmSync(profile,{recursive:true,force:true});}catch{}
  }};
 }catch(e){
  try{socket?.close();}catch{}try{child.kill('SIGKILL');}catch{}
  try{fs.rmSync(profile,{recursive:true,force:true});}catch{}
  throw e;
 }
}

test('offline artifact CSS-only navigation works on 1365px desktop and 390px mobile without scripts or external APIs',{timeout:90000},async t=>{
 if(!chrome)return t.skip('Chromium is unavailable');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mls-offline-review-fixture-'));
 let browser;
 const visualDir=process.env.MLS_OFFLINE_SCREENSHOT_DIR||null;
 try{
  await writeOfflineOwnerReview(directory);
  browser=await openBrowser();
  for(const viewport of [{name:'desktop',width:1365,height:900,mobile:false},
   {name:'mobile',width:390,height:844,mobile:true}]){
   await browser.send('Emulation.setDeviceMetricsOverride',{
    width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:viewport.mobile
   });
   const url=pathToFileURL(path.join(directory,'preview-off.html')).href;
   await browser.send('Page.navigate',{url});
   let ready=false;
   for(let i=0;i<130;i++){
    if(await browser.eval("document.readyState==='complete'&&!!document.getElementById('agent-finance')")){ready=true;break;}
    await pause(65);
   }
   assert.equal(ready,true,'offline local document failed to load');
   const initial=await browser.eval("(()=>({protocol:location.protocol,scriptCount:document.scripts.length,"+
    "mode:document.body.dataset.qaPreview,section:getComputedStyle(document.getElementById('overview')).display,"+
    "width:innerWidth,scroll:document.documentElement.scrollWidth}))()");
   assert.equal(initial.protocol,'file:');
   assert.equal(initial.scriptCount,0);
   assert.equal(initial.mode,'off');
   assert.notEqual(initial.section,'none');
   assert.ok(initial.scroll<=viewport.width+3,viewport.name+': unexpected overflow of overview');
   const financeUrl=url+'#agent-finance';
   await browser.send('Page.navigate',{url:financeUrl});
   await pause(100);
   const finance=await browser.eval("(()=>({hash:location.hash,"+
    "finance:getComputedStyle(document.getElementById('agent-finance')).display,"+
    "overview:getComputedStyle(document.getElementById('overview')).display,"+
    "width:innerWidth,scroll:document.documentElement.scrollWidth,"+
    "name:document.querySelector('#agent-finance .mission-hero h2')?.textContent||''}))()");
   assert.equal(finance.hash,'#agent-finance');
   assert.equal(finance.finance,viewport.mobile?'block':'grid',viewport.name+': agent mini-sidebar layout lost');
   assert.equal(finance.overview,'none',viewport.name+': previous panel still visible');
   assert.ok(finance.scroll<=viewport.width+3,viewport.name+': horizontal finance overflow');
   if(visualDir){
    fs.mkdirSync(visualDir,{recursive:true});
    await browser.screenshot(path.join(visualDir,'offline-off-'+viewport.name+'-finance.png'));
   }
   await browser.send('Page.navigate',{url:url+'#products'});
   await pause(100);
   const products=await browser.eval("(()=>({shown:getComputedStyle(document.getElementById('products')).display,"+
    "catalog:!!document.getElementById('productsHub'),scriptCount:document.scripts.length}))()");
   assert.notEqual(products.shown,'none');
   assert.equal(products.catalog,true);
   assert.equal(products.scriptCount,0);
  }
 }finally{
  try{browser?.close();}finally{fs.rmSync(directory,{recursive:true,force:true});}
 }
});
