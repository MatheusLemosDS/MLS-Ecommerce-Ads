import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {CSS,adminBody} from '../src/admin-view.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const qaDir=process.env.MLS_ROADMAP_SCREENSHOT_DIR||null;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('roadmap explains available physical controls, pending financial proof and future stages without invented business values',()=>{
 const html=adminBody();
 const section=html.slice(html.indexOf('<section id="roadmap"'),html.indexOf('</section>',html.indexOf('id="roadmapFuture"'))+10);
 assert.ok(section.length>2000,'roadmap markup must be present');
 for(const stage of ['m2','m22','m3','m4'])
  assert.match(section,new RegExp('data-roadmap-stage="'+stage+'"'));
 for(const gate of ['ci','owner-qa','rollback','approval'])
  assert.match(section,new RegExp('data-roadmap-gate="'+gate+'"'));
 for(const route of ['/admin?tab=agents','/admin?tab=agent-finance','/admin?tab=agent-returns#physicalReturnsDetails','/admin?tab=margins#incurredProductionDetails','/admin?tab=agent-returns#returnManufacturingLinksDetails'])
  assert.ok(section.includes('href="'+route+'"'),'missing existing owner navigation: '+route);
 assert.match(section,/Controles disponíveis/);
 assert.match(section,/custo histórico/);
 assert.match(section,/Quantidades originais da solicitação e valor recuperado ainda estão indisponíveis/);
 assert.match(section,/Seller Centre e banco/);
 assert.doesNotMatch(section,/PR #68|2\.143 Node|Não publicado|29\/10\/2026|V3\.6/);
 assert.match(section,/M2/);
 assert.match(section,/Ads e PROMO continuam bloqueados/);
 assert.match(section,/Publicado.*diferente.*CI aprovado/s);
 assert.doesNotMatch(section,/Ofertas relâmpago rentáveis|preparar anúncios dos campeões|Automa.{0,8}com metas de lucro/);
 assert.doesNotMatch(section,/\b\d{1,3}%\s*(?:conclu|progresso)/i);
 assert.match(CSS,/\.mls-roadmap \.roadmap-main-grid/);
 assert.match(CSS,/@media\(max-width:640px\)/);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(v=>v[1]);
 assert.equal(new Set(ids).size,ids.length,'no duplicate owner DOM IDs');
});

async function syntheticPage(){
 const output=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],
  bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'))).default;
 const origin='https://mls-roadmap-fixture.test',env={
  ADMIN_USERNAME:'roadmap-fixture-owner',
  ADMIN_PASSWORD:'roadmap-fixture-password-123456',
  ADMIN_SESSION_SECRET:'roadmap-fixture-session-'+'x'.repeat(40)
 };
 const login=await worker.fetch(new Request(origin+'/login',{method:'POST',
  headers:{origin,'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(login.status,303);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const response=await worker.fetch(new Request(origin+'/admin?tab=roadmap',{headers:{cookie}}),env);
 assert.equal(response.status,200);
 const html=await response.text();
 assert.equal(html.includes('id="mlsRoadmapHeading"'),true);
 assert.equal(html.includes('id="roadmapFuture"'),true);
 return html.replace('<head>','<head><script>try{localStorage.setItem("braza-theme","dark")}catch(e){}</script>').replace('<body>','<body><div style="position:fixed;z-index:99999;bottom:8px;right:8px;pointer-events:none;padding:5px 8px;background:#212f46;color:white;border:1px solid #5172a5;border-radius:6px;font:10px sans-serif">QA SINTÉTICA · SEM DADOS DA LOJA</div>');
}
async function startChrome(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-roadmap-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--disable-background-networking','--disable-extensions','--remote-allow-origins=*',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let ws=null;
 try{
  let port=null;
  for(let i=0;i<120;i++){
   try{port=Number(readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);if(port>0)break;}catch{}
   await pause(75);
  }
  if(!port)throw Error('Chrome CDP startup failed');
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const endpoint=tabs.find(x=>x.type==='page')?.webSocketDebuggerUrl;
  if(!endpoint)throw Error('No Chrome page');
  ws=new WebSocket(endpoint);
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('CDP timeout')),9000);
   ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
   ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP socket failure'));},{once:true});
  });
  let sequence=0;const pending=new Map();
  ws.addEventListener('message',event=>{
   let msg;try{msg=JSON.parse(event.data);}catch{return;}
   const item=pending.get(msg.id);if(!item)return;pending.delete(msg.id);
   msg.error?item.reject(Error(String(msg.error.message))):item.resolve(msg.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
  });
  await send('Page.enable');await send('Runtime.enable');
  return {send,async eval(expression){
   const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
   if(r.exceptionDetails)throw Error('Browser eval: '+r.exceptionDetails.text+' '+String(r.exceptionDetails.exception?.description||'').slice(0,400));
   return r.result.value;
  },async capture(filename){
   if(!qaDir)return;
   const capture=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
   if(!capture?.data)throw Error('Missing Chrome screenshot');
   mkdirSync(qaDir,{recursive:true});
   writeFileSync(path.join(qaDir,filename),Buffer.from(capture.data,'base64'));
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

test('real Chrome renders roadmap on desktop and 390px mobile without horizontal clipping',{timeout:85000},async t=>{
 if(!chrome)return t.skip('Chrome is not installed');
 const html=await syntheticPage();
 const host=http.createServer((req,res)=>{
  if(req.url?.startsWith('/api/')){
   res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});
   res.end('{"error":"SYNTHETIC_NO_REMOTE_DATA"}');return;
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);
 });
 await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve));
 let browser;
 const results=[];
 try{
  browser=await startChrome();
  for(const device of [{name:'desktop',width:1365,height:900,mobile:false},{name:'mobile',width:390,height:844,mobile:true}]){
   await browser.send('Emulation.setDeviceMetricsOverride',
    {width:device.width,height:device.height,deviceScaleFactor:1,mobile:device.mobile});
   await browser.send('Page.navigate',{url:'http://127.0.0.1:'+host.address().port+'/admin?tab=roadmap'});
   let ready=false;
   for(let i=0;i<130;i++){
    if(await browser.eval("document.readyState==='complete'&&!!document.getElementById('roadmap')")){
     ready=true;break;
    }
    await pause(65);
   }
   assert.equal(ready,true,'owner roadmap did not load');
   const values=await browser.eval("(()=>{"+
    "const r=document.getElementById('roadmap');r.hidden=false;document.querySelectorAll('main.workspace>section').forEach(s=>{if(s!==r)s.hidden=true;});"+
    "r.scrollIntoView({block:'start',behavior:'instant'});"+
    "const box=n=>{const b=n.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,width:b.width,height:b.height}};"+
    "return {inner:innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,"+
    "roadmap:box(r),hero:box(r.querySelector('.roadmap-hero')),gates:box(r.querySelector('.roadmap-gate-card')),"+
    "summary:[...r.querySelectorAll('.roadmap-summary-card')].map(box),stages:r.querySelectorAll('[data-roadmap-stage]').length,"+
    "hasOverflow:[...r.querySelectorAll('.roadmap-stage,.roadmap-next-card,.roadmap-gate-card')].some(n=>box(n).right>innerWidth+3),"+
    "future:r.querySelector('#roadmapFuture').open};"+
    "})()");
   assert.equal(values.inner,device.width,device.name+': viewport expanded: '+JSON.stringify(values));
   assert.ok(values.scroll<=device.width+2,device.name+': horizontal page overflow '+JSON.stringify(values));
   assert.ok(values.roadmap.left>=-2&&values.roadmap.right<=device.width+3,device.name+': roadmap clipped');
   assert.ok(values.hero.left>=-2&&values.hero.right<=device.width+3,device.name+': roadmap hero clipped');
   assert.ok(values.hero.top>=70,device.name+': roadmap heading is hidden under sticky header: '+JSON.stringify(values.hero));
   assert.ok(values.gates.right<=device.width+3,device.name+': gates clipped');
   assert.ok(values.summary.every(x=>x.left>=-2&&x.right<=device.width+3),device.name+': status cards clipped');
   assert.equal(values.hasOverflow,false,device.name+': roadmap card clipped');
   assert.equal(values.stages,4);
   assert.equal(values.future,false,'future roadmap should start collapsed');
   await browser.capture('roadmap-'+device.name+'.png');
   results.push({viewport:device.name,width:device.width,height:device.height,synthetic:true,noHorizontalOverflow:true,stageCards:values.stages});
  }
  if(qaDir){
   writeFileSync(path.join(qaDir,'results.json'),JSON.stringify({schema:'mls_roadmap_visual_qa_v1',production_approved:false,owner_real_session_verified:false,observations:results},null,2)+'\n');
   writeFileSync(path.join(qaDir,'README.txt'),'MLS Roadmap: synthetic owner fixture. No real shop, D1 or Shopee calls. Not approved for deployment.\n');
  }
 }finally{
  try{browser?.close();}finally{host.closeAllConnections?.();host.close();}
 }
});
