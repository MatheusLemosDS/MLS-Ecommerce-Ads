import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const output=process.env.MLS_APPROVED_SCREENSHOT_DIR||null;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function start(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-approved-panels-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-extensions',
  '--disable-background-networking','--remote-allow-origins=*','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let socket;
 try{
  let port=0;
  for(let i=0;i<120;i++){
   try{port=Number(readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);if(port>0)break;}catch{}
   await delay(75);
  }
  if(!port)throw Error('Chrome CDP startup failed');
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const url=pages.find(x=>x.type==='page')?.webSocketDebuggerUrl;
  if(!url)throw Error('Chrome page not found');
  socket=new WebSocket(url);
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('CDP connect timeout')),9000);
   socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
   socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP socket error'));},{once:true});
  });
  let seq=0;const pending=new Map();
  socket.addEventListener('message',event=>{
   let data;try{data=JSON.parse(event.data);}catch{return;}
   const p=pending.get(data.id);if(!p)return;
   pending.delete(data.id);
   data.error?p.reject(Error(String(data.error.message))):p.resolve(data.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));
  });
  await send('Page.enable');await send('Runtime.enable');
  return {send,async evaluate(expression){
   const data=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
   if(data.exceptionDetails)throw Error('Browser JS: '+String(data.exceptionDetails.exception?.description||data.exceptionDetails.text).slice(0,440));
   return data.result.value;
  },async capture(file){
   if(!output)return;
   const data=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
   if(!data?.data)throw Error('PNG capture missing');
   mkdirSync(output,{recursive:true});
   writeFileSync(path.join(output,file),Buffer.from(data.data,'base64'));
  },close(){
   try{socket?.close();}catch{}try{child.kill('SIGKILL');}catch{}
   try{rmSync(profile,{recursive:true,force:true});}catch{}
  }};
 }catch(e){
  try{socket?.close();}catch{}try{child.kill('SIGKILL');}catch{}
  try{rmSync(profile,{recursive:true,force:true});}catch{}
  throw e;
 }
}

const pages=['overview','agents','agent-finance','agent-ads','agent-products','agent-production',
 'agent-returns','agent-auditor','agent-hermes','products','production','roadmap','hermes','margins','history'];
const screenshotPages=new Set(['overview','agents','agent-finance','agent-ads','agent-products','agent-production',
 'agent-returns','agent-auditor','agent-hermes','products','production','roadmap','hermes']);
test('approved design smoke: fifteen real owner workspaces at desktop and 390px mobile, no fabricated shop data',{timeout:120000},async t=>{
 if(!chrome)return t.skip('Chrome not installed');
 let {html}=await compiledOwnerReportPage(false,{ownerPreview:false});
 html=html.replace('<head>','<head><script>try{localStorage.setItem("braza-theme","dark")}catch(e){}</script>');
 html=html.replace('<body>','<body><div style="position:fixed;right:8px;bottom:8px;z-index:99999;pointer-events:none;border:1px solid #729bcc;background:#0d2341;color:#e8f7ff;font:10px sans-serif;padding:6px 9px;border-radius:6px">QA SINTÉTICA · SEM DADOS REAIS</div>');
 const server=http.createServer((req,res)=>{
  if(req.url?.startsWith('/api/')){
   res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});
   res.end('{"error":"SYNTHETIC_NO_PROVIDER_DATA"}');return;
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(html);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let cdp;const report=[];
 try{
  cdp=await start();
  for(const viewport of [{name:'desktop',width:1365,height:900,mobile:false},
   {name:'mobile',width:390,height:844,mobile:true}]){
   await cdp.send('Emulation.setDeviceMetricsOverride',
    {width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:viewport.mobile});
   await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/admin?tab=overview'});
   let loaded=false;
   for(let i=0;i<130;i++){
    if(await cdp.evaluate("document.readyState==='complete'&&!!document.getElementById('agent-auditor')&&!!document.getElementById('mlsRoadmapHeading')")){
     loaded=true;break;
    }
    await delay(75);
   }
   assert.equal(loaded,true,viewport.name+': compiled owner shell failed to initialize');
   for(const id of pages){
    const result=await cdp.evaluate("(()=>{"+
     "const id="+JSON.stringify(id)+",section=document.getElementById(id);"+
     "const workspace=document.querySelector('main.workspace');"+
     "if(!section||!workspace)return {missing:true,id};"+
     "document.documentElement.dataset.activePanel=id;"+
     "for(const child of workspace.children){if(child.tagName==='SECTION')child.hidden=child!==section;}"+
     "section.hidden=false;"+
     "const startup=document.querySelector('.startup-recovery');if(startup)startup.hidden=true;"+
     "const message=document.getElementById('message');if(message)message.hidden=true;"+
     "section.scrollIntoView({block:'start',behavior:'instant'});"+
     "const rect=section.getBoundingClientRect(),nav=section.querySelector('.mission-page-tabs');"+
     "const navRect=nav?.getBoundingClientRect();"+
     "return {id,inner:innerWidth,scroll:document.documentElement.scrollWidth,"+
     "section:{left:rect.left,right:rect.right,top:rect.top,width:rect.width},nav:navRect?{left:navRect.left,right:navRect.right}:null,"+
     "theme:document.documentElement.dataset.theme,visible:getComputedStyle(section).display!=='none',"+
     "workspaces:document.querySelectorAll('.mission-workspace').length};"+
     "})()");
    assert.equal(result.missing,undefined,viewport.name+': missing '+id);
    assert.equal(result.theme,'dark',id+': theme not applied');
    assert.equal(result.inner,viewport.width,id+': device width expanded');
    assert.equal(result.visible,true,id+': section hidden');
    assert.ok(result.section.top>=70,viewport.name+'/'+id+': panel header hidden behind sticky topbar '+JSON.stringify(result));
    assert.ok(result.section.left>=-2&&result.section.right<=viewport.width+3,
     viewport.name+'/'+id+': panel clipped '+JSON.stringify(result));
    assert.ok(result.scroll<=viewport.width+3,
     viewport.name+'/'+id+': horizontal page overflow '+JSON.stringify(result));
    if(id.startsWith('agent-')&&result.nav){
     assert.ok(result.nav.left>=-2&&result.nav.right<=viewport.width+3,
      viewport.name+'/'+id+': internal nav clipped');
    }
    if(screenshotPages.has(id))await cdp.capture('approved-'+viewport.name+'-'+id+'.png');
    report.push({viewport:viewport.name,width:viewport.width,height:viewport.height,panel:id,
     synthetic:true,visible:true,overflow:false});
   }
  }
  if(output){
   mkdirSync(output,{recursive:true});
   writeFileSync(path.join(output,'results.json'),JSON.stringify({
    schema:'mls_approved_design_all_panels_qa_v1',owner_authenticated:false,
    production_approved:false,source:'synthetic owner',checks:report
   },null,2)+'\n');
   writeFileSync(path.join(output,'README.txt'),
    'Approved MLS design QA. Synthetic local HTML and stubs only. No Shop, D1, Finance, Ads or Shopee source is fetched. All amounts on the screenshots are UNKNOWN unless clearly marked as fixture. NOT an owner review or production deployment.\n');
  }
 }finally{try{cdp?.close();}finally{server.closeAllConnections?.();server.close();}}
});
