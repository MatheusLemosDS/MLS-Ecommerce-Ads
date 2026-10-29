import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const qaDir=process.env.MLS_PRODUCTION_SCREENSHOT_DIR||null;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function launch(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-production-visual-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--disable-background-networking','--disable-extensions','--remote-allow-origins=*',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let ws;
 try{
  let port=0;
  for(let n=0;n<120;n++){
   try{port=Number(readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);if(port>0)break;}catch{}
   await sleep(75);
  }
  if(!port)throw Error('Chrome CDP startup failed');
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const endpoint=targets.find(x=>x.type==='page')?.webSocketDebuggerUrl;
  if(!endpoint)throw Error('Chrome page target not found');
  ws=new WebSocket(endpoint);
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('CDP connection timeout')),9000);
   ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
   ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP connection error'));},{once:true});
  });
  let seq=0;const pending=new Map();
  ws.addEventListener('message',event=>{
   let msg;try{msg=JSON.parse(event.data);}catch{return;}
   const request=pending.get(msg.id);if(!request)return;
   pending.delete(msg.id);msg.error?request.reject(Error(String(msg.error.message))):request.resolve(msg.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
  });
  await send('Page.enable');await send('Runtime.enable');
  return {send,async evaluate(expression){
   const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
   if(r.exceptionDetails)throw Error('Browser JS: '+String(r.exceptionDetails.exception?.description||r.exceptionDetails.text).slice(0,550));
   return r.result.value;
  },async capture(filename){
   if(!qaDir)return;
   const r=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
   if(!r?.data)throw Error('Chrome screenshot missing');
   mkdirSync(qaDir,{recursive:true});writeFileSync(path.join(qaDir,filename),Buffer.from(r.data,'base64'));
  },close(){
   try{ws?.close();}catch{}try{child.kill('SIGKILL');}catch{}
   try{rmSync(profile,{recursive:true,force:true});}catch{}
  }};
 }catch(e){
  try{ws?.close();}catch{}try{child.kill('SIGKILL');}catch{}
  try{rmSync(profile,{recursive:true,force:true});}catch{}
  throw e;
 }
}

test('Chrome synthetic DTF rework renders five workflow steps without clipping on desktop/mobile',{timeout:90000},async t=>{
 if(!chrome)return t.skip('Chrome not installed');
 let {html}=await compiledOwnerReportPage(false);
 // Only local screenshots. The API is stubbed and NO real shop/network endpoints exist.
 html=html.replace('<head>','<head><script>try{localStorage.setItem("braza-theme","dark")}catch(e){}</script>');
 html=html.replace('<body>','<body><div style="position:fixed;bottom:8px;right:8px;z-index:99999;pointer-events:none;background:#15233a;color:#e4f6ff;border:1px solid #5c79a5;border-radius:6px;padding:5px 8px;font:10px sans-serif">QA SINTÉTICA · SEM DADOS REAIS</div>');
 const server=http.createServer((req,res)=>{
  if(req.url?.startsWith('/api/')){
   res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});
   res.end('{"error":"SYNTHETIC_NO_PROVIDER_ACCESS"}');return;
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;const reports=[];
 try{
  browser=await launch();
  for(const device of [{name:'desktop',width:1365,height:900,mobile:false},
   {name:'mobile',width:390,height:844,mobile:true}]){
   await browser.send('Emulation.setDeviceMetricsOverride',{
    width:device.width,height:device.height,deviceScaleFactor:1,mobile:device.mobile
   });
   await browser.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/admin?tab=production'});
   let loaded=false;
   for(let n=0;n<130;n++){
    if(await browser.evaluate("document.readyState==='complete'&&!!document.getElementById('production')&&!!document.getElementById('dtfHeroTitle')")){
     loaded=true;break;
    }
    await sleep(70);
   }
   assert.equal(loaded,true,device.name+': DTF production page not loaded');
   const result=await browser.evaluate("(()=>{"+
    "const stage=document.getElementById('production');stage.hidden=false;"+
    "const startup=document.querySelector('.startup-recovery');if(startup)startup.hidden=true;"+
    "document.querySelectorAll('main.workspace>section').forEach(el=>{if(el!==stage)el.hidden=true});"+
    "stage.scrollIntoView({block:'start',behavior:'instant'});"+
    "const box=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:r.width,height:r.height}};"+
    "const hero=stage.querySelector('.dtf-hero'),flow=stage.querySelector('.dtf-flow');"+
    "const links=[...flow.querySelectorAll('a.dtf-flow-step')];"+
    "return {inner:innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,"+
    "stage:box(stage),hero:box(hero),flow:box(flow),cols:getComputedStyle(flow).gridTemplateColumns.trim().split(/\\s+/).length,"+
    "links:links.map(n=>({href:n.getAttribute('href'),rect:box(n)})),"+
    "sections:['dtfQueueStage','dtfArtworkStage','dtfFilmStage','dtfPreviewStage','dtfBatchStage'].map(id=>!!document.getElementById(id)),"+
    "oldControls:['dtfSearch','dtfArtFiles','dtfFilmWidth','dtfPreviewButton','dtfPrepare','dtfBatches'].every(id=>!!document.getElementById(id)),"+
    "clipped:[...links,hero,...stage.querySelectorAll('.dtf-summary article')].some(el=>box(el).right>innerWidth+3)};"+
    "})()");
   assert.equal(result.inner,device.width,device.name+': viewport has expanded');
   assert.ok(result.scroll<=device.width+2,device.name+': horizontal overflow '+JSON.stringify(result));
   assert.ok(result.stage.left>=-2&&result.stage.right<=device.width+3,device.name+': production area clipped');
   assert.ok(result.hero.left>=-2&&result.hero.right<=device.width+3,device.name+': hero clipped');
   assert.ok(result.hero.top>=68,device.name+': hero header is under sticky topbar');
   assert.equal(result.clipped,false,device.name+': stage cards extend beyond viewport');
   assert.equal(result.cols,device.mobile?1:5,device.name+': wrong workflow grid columns');
   assert.equal(result.links.length,5);
   assert.ok(result.links.every((link,index)=>link.href==='#'+['dtfQueueStage','dtfArtworkStage','dtfFilmStage','dtfPreviewStage','dtfBatchStage'][index]));
   assert.ok(result.sections.every(Boolean),device.name+': missing stage');
   assert.equal(result.oldControls,true,device.name+': legacy controls missing');
   await browser.capture('dtf-'+device.name+'-hero.png');
   await browser.evaluate("document.querySelector('#production .dtf-flow').scrollIntoView({block:'start',behavior:'instant'})");
   await browser.capture('dtf-'+device.name+'-steps.png');
   await browser.evaluate("document.getElementById('dtfQueueStage').scrollIntoView({block:'start',behavior:'instant'})");
   await browser.capture('dtf-'+device.name+'-queue.png');
   await browser.evaluate("document.getElementById('dtfArtworkStage').scrollIntoView({block:'start',behavior:'instant'})");
   await browser.capture('dtf-'+device.name+'-artworks.png');
   reports.push({name:device.name,width:device.width,height:device.height,stages:5,
    synthetic:true,noHorizontalOverflow:true,real_owner_session:false});
  }
  if(qaDir){
   mkdirSync(qaDir,{recursive:true});
   writeFileSync(path.join(qaDir,'results.json'),JSON.stringify({
    schema:'mls_dtf_visual_qa_v1',owner_authenticated:false,production_approved:false,results:reports
   },null,2)+'\n');
   writeFileSync(path.join(qaDir,'README.txt'),'MLS Production DTF rework: synthetic browser ONLY, API stubs, no private shop, no uploads or commercial actions. Do not deploy without approval.\n');
  }
 }finally{try{browser?.close();}finally{server.closeAllConnections?.();server.close();}}
});
