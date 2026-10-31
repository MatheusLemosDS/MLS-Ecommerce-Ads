import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {createChromeProfileCleanup} from './chrome-profile-cleanup.mjs';
import {waitForChromeDebugPort} from './chrome-debug-port.mjs';
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const output=process.env.MLS_NAVIGATION_SCREENSHOT_DIR||null;
async function browser(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-navigation-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const cleanup=createChromeProfileCleanup(child,profile);let socket;
 try{
  const port=await waitForChromeDebugPort(child,profile);let page;
  for(let index=0;index<120;index++){try{page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(item=>item.type==='page'&&item.webSocketDebuggerUrl);}catch{}if(page)break;await pause(75);}
  assert.ok(page,'Chromium target must initialize');socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let next=0;const pending=new Map();socket.addEventListener('message',event=>{const item=JSON.parse(event.data),call=pending.get(item.id);if(!call)return;pending.delete(item.id);item.error?call.reject(Error(item.error.message)):call.resolve(item.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  await send('Page.enable');await send('Runtime.enable');
  return {send,async evaluate(expression){const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value;},async close(){await cleanup(socket);}};
 }catch(error){await cleanup(socket);throw error;}
}
for(const minify of [false,true])test('compiled owner navigation opens cross-panel details, preserves history and remains reachable at 320–1365px (minify='+minify+')',{timeout:120000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 let {html}=await compiledOwnerReportPage(minify,{ownerPreview:false});
 html=html.replace('<head>','<head><script>localStorage.setItem("braza-theme","dark");window.__navigationErrors=[];addEventListener("error",e=>__navigationErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>__navigationErrors.push(String(e.reason?.message||e.reason)));</script>');
 html=html.replace('<body>','<body><div style="position:fixed;right:8px;bottom:92px;z-index:9999;pointer-events:none;background:#0a1931;color:#edf6ff;border:1px solid #5cb8ff;padding:7px;font:10px sans-serif">QA SINTÉTICA · SEM DADOS REAIS</div>');
 const requests=[];const host=http.createServer((req,res)=>{requests.push({method:req.method,url:req.url});const api=req.url.startsWith('/api/');res.writeHead(api?503:200,{'content-type':api?'application/json':'text/html; charset=utf-8','cache-control':'no-store'});res.end(api?'{}':html);});
 await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve));let cdp;const checks=[];
 try{
  cdp=await browser();
  for(const width of [320,390,768,1365]){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=850});
   await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+host.address().port+'/admin?tab=agent-returns&month=2026-09'});
   let ready=false;for(let i=0;i<120;i++){if(await cdp.evaluate("document.readyState==='complete'&&document.documentElement.dataset.activePanel==='agent-returns'")){ready=true;break;}await pause(75);}assert.ok(ready,'owner navigation initialized');
   const before=await cdp.evaluate(`(()=>{
    const visible=n=>n&&n.checkVisibility({checkVisibilityCSS:true});
    const contextual=document.querySelector('#agent-returns .mission-page-tabs');
    return {width:innerWidth,scroll:document.documentElement.scrollWidth,global:visible(document.querySelector(innerWidth<=850?'.workspace-nav-mobile':'.sidebar-navigation>.workspace-nav')),active:[...document.querySelector(innerWidth<=850?'.workspace-nav-mobile':'.sidebar-navigation>.workspace-nav').querySelectorAll('[aria-current=page]')].map(n=>n.dataset.workspaceKey),rails:document.querySelectorAll('.mls-agent-mini-nav,.mls-workspace-quicklinks').length,hrefs:[...contextual.querySelectorAll('a')].map(n=>n.getAttribute('href'))};})()`);
   assert.equal(before.width,width);assert.ok(before.scroll<=width+1);assert.equal(before.global,true);assert.deepEqual(before.active,['agents']);assert.equal(before.rails,0);assert.equal(new Set(before.hrefs).size,before.hrefs.length);
   // A real Returns link targets a collapsed detail in the hidden Finance panel.
   if(output){mkdirSync(output,{recursive:true});const image=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true});writeFileSync(path.join(output,`specialist-${width}-${minify?'min':'normal'}.png`),Buffer.from(image.data,'base64'));}
   const href='/admin?tab=agent-finance#businessReconciliation';
   await cdp.evaluate(`document.querySelector('#agent-returns .mission-page-tabs a[href="${href}"]').click()`);
   const after=await cdp.evaluate(`(()=>{const n=document.getElementById('businessReconciliation');return {panel:document.documentElement.dataset.activePanel,tab:new URL(location.href).searchParams.get('tab'),month:new URL(location.href).searchParams.get('month'),hash:location.hash,visible:n.checkVisibility({checkVisibilityCSS:true}),closed:[...function*(v){while(v){if(v.tagName==='DETAILS')yield v;v=v.parentElement;}}(n)].filter(v=>!v.open).length,focus:document.activeElement.id,reloads:performance.getEntriesByType('navigation').length};})()`);
   assert.equal(after.panel,'agent-finance');assert.equal(after.tab,'agent-finance');assert.equal(after.month,'2026-09');assert.equal(after.hash,'#businessReconciliation');assert.equal(after.visible,true);assert.equal(after.closed,0);assert.equal(after.focus,'businessReconciliation');assert.equal(after.reloads,1);
   await cdp.evaluate('history.back()');
   let restored=false;for(let i=0;i<80;i++){if(await cdp.evaluate("document.documentElement.dataset.activePanel==='agent-returns'&&new URL(location.href).searchParams.get('tab')==='agent-returns'")){restored=true;break;}await pause(25);}assert.ok(restored,'Back restores the prior workspace');
   await cdp.evaluate('history.forward()');
   let forwarded=false;for(let i=0;i<80;i++){if(await cdp.evaluate("document.documentElement.dataset.activePanel==='agent-finance'&&location.hash==='#businessReconciliation'")){forwarded=true;break;}await pause(25);}assert.ok(forwarded,'Forward restores the finance fragment');
   await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   const menu=await cdp.evaluate(`(()=>{const visible=n=>n.checkVisibility({checkVisibilityCSS:true}),m=[...document.querySelectorAll('.workspace-more')].find(n=>visible(n.querySelector('summary')));m.querySelector('summary').click();const open=m.open;document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return {open,closed:!m.open,focused:document.activeElement===m.querySelector('summary')};})()`);
   assert.deepEqual(menu,{open:true,closed:true,focused:true});
   const outside=await cdp.evaluate(`(()=>{const m=[...document.querySelectorAll('.workspace-more')].find(n=>n.querySelector('summary').checkVisibility({checkVisibilityCSS:true}));m.querySelector('summary').click();document.getElementById('pageTitle').click();return !m.open;})()`);assert.equal(outside,true);
   // Ordinary tab changes focus the page title, clear stale scroll and keep the month.
   await cdp.evaluate("document.querySelector('[data-workspace-tab=production]').click()");
   await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   const focus=await cdp.evaluate("({panel:document.documentElement.dataset.activePanel,id:document.activeElement.id,y:scrollY,month:new URL(location.href).searchParams.get('month')})");
   assert.equal(focus.panel,'production');assert.equal(focus.id,'pageTitle');assert.equal(focus.y,0);assert.equal(focus.month,'2026-09');
   await cdp.evaluate("document.querySelector('[data-mission-open=\"agent-production\"]').click();document.querySelector('#agent-production .mission-page-tabs a[href=\"/admin?tab=production#dtfQueueStage\"]').click()");
   const stage=await cdp.evaluate("({panel:document.documentElement.dataset.activePanel,hash:location.hash,visible:document.getElementById('dtfQueueStage').checkVisibility({checkVisibilityCSS:true}),focus:document.activeElement.id,reloads:performance.getEntriesByType('navigation').length})");
   assert.deepEqual(stage,{panel:'production',hash:'#dtfQueueStage',visible:true,focus:'dtfQueueStage',reloads:1});
   const broken=await cdp.evaluate("[...document.querySelectorAll('a[href]')].map(n=>new URL(n.getAttribute('href'),location.href)).filter(u=>u.origin===location.origin&&u.pathname==='/admin'&&u.hash&&!document.getElementById(u.hash.slice(1))).map(u=>u.hash)");assert.deepEqual(broken,[],'every fragment has a real destination');
   assert.deepEqual(await cdp.evaluate('window.__navigationErrors'),[]);
   if(output){mkdirSync(output,{recursive:true});const shot=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true});writeFileSync(path.join(output,`navigation-${width}-${minify?'min':'normal'}.png`),Buffer.from(shot.data,'base64'));}
   checks.push({width,cross_panel_details:true,history_back_forward:true,menu_escape_outside:true,focus_and_month_preserved:true,page_overflow:false});
  }
  assert.equal(requests.filter(item=>item.url.startsWith('/api/')&&item.method!=='GET').length,0,'navigation must never perform business writes');
  if(output)writeFileSync(path.join(output,'navigation-'+(minify?'minified':'normal')+'.json'),JSON.stringify({schema:'mls_navigation_rework_qa_v1',synthetic:true,owner_authenticated:false,provider_requests:0,checks},null,2)+'\n');
 }finally{if(cdp)await cdp.close();host.closeAllConnections?.();await new Promise(resolve=>host.close(resolve));}
});
