import test from 'node:test';
import assert from 'node:assert/strict';
import http from './browser-assets-http-fixture.mjs';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {createChromeProfileCleanup} from './chrome-profile-cleanup.mjs';
import {waitForChromeDebugPort} from './chrome-debug-port.mjs';
import {workspaceNavigation} from '../src/workspace-navigation.mjs';
import {shellMobileNavigation,SHELL_NAVIGATION_CSS} from '../src/shell-navigation.mjs';
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
async function activateWithKeyboard(cdp,selector){
 await cdp.evaluate(`(()=>{const target=document.querySelector(${JSON.stringify(selector)});if(!target?.checkVisibility({checkVisibilityCSS:true}))throw Error('VISIBLE_NAVIGATION_TARGET_REQUIRED');target.scrollIntoView({block:'nearest',behavior:'instant'});target.focus({preventScroll:true});})()`);
 await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',text:'\r',unmodifiedText:'\r',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,modifiers:0});
 await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,modifiers:0});
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
    return {width:innerWidth,scroll:document.documentElement.scrollWidth,global:visible(document.querySelector(innerWidth<=850?'.workspace-nav-mobile':'.sidebar-navigation>.workspace-nav')),active:[...document.querySelector(innerWidth<=850?'.workspace-nav-mobile':'.sidebar-navigation>.workspace-nav').querySelectorAll('[aria-current=page]')].map(n=>n.dataset.workspaceKey),rails:document.querySelectorAll('.mls-agent-mini-nav,.mls-workspace-quicklinks').length,hrefs:[...contextual.querySelectorAll('a')].map(n=>n.getAttribute('href')),mounts:['overview','agents','agent-production','agent-returns','agent-finance','agent-hermes','production','products','margins','history','roadmap'].map(id=>({id,sibling:document.getElementById(id)?.parentElement.matches('main.workspace')}))};})()`);
   assert.equal(before.width,width);assert.ok(before.scroll<=width+1);assert.equal(before.global,true);assert.deepEqual(before.active,['returns']);assert.equal(before.rails,0);assert.equal(new Set(before.hrefs).size,before.hrefs.length);
   assert.ok(before.mounts.every(row=>row.sibling),'operational panels must be sibling workspaces: '+JSON.stringify(before.mounts));
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
   // Ordinary tab changes focus the visible panel heading, clear stale scroll and keep the month.
   await cdp.evaluate("document.querySelector('[data-workspace-tab=agent-production]').click()");
   await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   const focus=await cdp.evaluate("({panel:document.documentElement.dataset.activePanel,id:document.activeElement.id,y:scrollY,month:new URL(location.href).searchParams.get('month')})");
   assert.equal(focus.panel,'agent-production');assert.equal(focus.id,'mission-production-title');assert.equal(focus.y,0);assert.equal(focus.month,'2026-09');
   await cdp.evaluate("document.querySelector('#agent-production .mission-page-tabs a[href=\"/admin?tab=production\"]').click();document.querySelector('#production .dtf-hero-links a[href=\"#dtfQueueStage\"]').click()");
   const stage=await cdp.evaluate("({panel:document.documentElement.dataset.activePanel,hash:location.hash,visible:document.getElementById('dtfQueueStage').checkVisibility({checkVisibilityCSS:true}),focus:document.activeElement.id,reloads:performance.getEntriesByType('navigation').length})");
   assert.deepEqual(stage,{panel:'production',hash:'#dtfQueueStage',visible:true,focus:'dtfQueueStage',reloads:1});
   // Exercise every local main destination and utility through native keyboard
   // activation. Unknown optional sources must not break navigation or overflow.
   for(const panel of ['overview','agent-production','agent-returns','agent-finance','products','agent-hermes','agents','margins','history','roadmap']){
    const selector=await cdp.evaluate(`(()=>{const links=[...document.querySelectorAll('[data-workspace-tab=${panel}]')],visible=links.find(n=>n.checkVisibility({checkVisibilityCSS:true}));if(visible)return (innerWidth<=850?'.workspace-nav-mobile':'.sidebar-navigation')+' [data-workspace-tab=${panel}]';const menu=[...document.querySelectorAll('.workspace-more')].find(n=>n.querySelector('summary').checkVisibility({checkVisibilityCSS:true})&&n.querySelector('[data-workspace-tab=${panel}]'));if(!menu)throw Error('WORKSPACE_DESTINATION_MISSING');menu.open=true;return (innerWidth<=850?'.workspace-nav-mobile':'.sidebar-navigation')+' .workspace-more [data-workspace-tab=${panel}]';})()`);
    await activateWithKeyboard(cdp,selector);
    await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const route=await cdp.evaluate(`(()=>{const panel=document.getElementById(${JSON.stringify(panel)}),focused=document.activeElement;return {active:document.documentElement.dataset.activePanel,visible:panel.checkVisibility({checkVisibilityCSS:true}),focused:focused.checkVisibility({checkVisibilityCSS:true})&&(panel.contains(focused)||focused.id==='pageTitle'),tab:new URL(location.href).searchParams.get('tab'),month:new URL(location.href).searchParams.get('month'),overflow:document.documentElement.scrollWidth>innerWidth+1,openMenus:[...document.querySelectorAll('.workspace-more')].filter(n=>n.open).length};})()`);
    assert.equal(route.active,panel);assert.equal(route.tab,panel);assert.equal(route.month,'2026-09');assert.equal(route.visible,true);assert.equal(route.focused,true);assert.equal(route.overflow,false);assert.equal(route.openMenus,0);
    const selectedKey=({'agent-production':'production','agent-returns':'returns','agent-finance':'finance','agent-hermes':'hermes',margins:'products'})[panel]||panel;
    assert.equal(await cdp.evaluate(`[...document.querySelectorAll('[data-workspace-key][aria-current=page]')].every(n=>n.dataset.workspaceKey===${JSON.stringify(selectedKey)})`),true,'the live selection must agree with server-rendered canonical navigation');
    if(output&&(width===320||width===1365)){const shot=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});writeFileSync(path.join(output,`workspace-${panel}-${width}-${minify?'min':'normal'}.png`),Buffer.from(shot.data,'base64'));}
   }
   const broken=await cdp.evaluate("[...document.querySelectorAll('a[href]')].map(n=>new URL(n.getAttribute('href'),location.href)).filter(u=>u.origin===location.origin&&u.pathname==='/admin'&&u.hash&&!document.getElementById(u.hash.slice(1))).map(u=>u.hash)");assert.deepEqual(broken,[],'every fragment has a real destination');
   assert.deepEqual(await cdp.evaluate('window.__navigationErrors'),[]);
   if(output){mkdirSync(output,{recursive:true});const shot=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true});writeFileSync(path.join(output,`navigation-${width}-${minify?'min':'normal'}.png`),Buffer.from(shot.data,'base64'));}
   checks.push({width,cross_panel_details:true,history_back_forward:true,menu_escape_outside:true,focus_and_month_preserved:true,page_overflow:false});
  }
  // A historical fabrication bookmark must replace its alias, so Back leaves
  // the bookmark instead of repeatedly pushing the canonical destination.
  const alias='/admin?tab=margins&month=2026-09#incurredProductionDetails';
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+host.address().port+'/admin?tab=overview&month=2026-09'});
  let settled=false;for(let i=0;i<120;i++){if(await cdp.evaluate("document.readyState==='complete'&&document.documentElement.dataset.activePanel==='overview'")){settled=true;break;}await pause(25);}assert.ok(settled,'the prior page must settle before a historical bookmark');
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+host.address().port+alias});
  let canonical=false;for(let i=0;i<120;i++){if(await cdp.evaluate("document.readyState==='complete'&&document.documentElement.dataset.activePanel==='agent-production'&&new URL(location.href).searchParams.get('tab')==='agent-production'&&location.hash==='#incurredProductionDetails'")){canonical=true;break;}await pause(25);}assert.ok(canonical,'the historical bookmark must open the fabrication ledger');
  assert.equal((await cdp.send('Page.getNavigationHistory')).entries.some(row=>row.url==='http://127.0.0.1:'+host.address().port+alias),false,'canonicalization must replace the alias entry');
  await cdp.evaluate('history.back()');
  let escaped=false;for(let i=0;i<120;i++){if(await cdp.evaluate("document.readyState==='complete'&&document.documentElement.dataset.activePanel==='overview'&&new URL(location.href).searchParams.get('tab')==='overview'")){escaped=true;break;}await pause(25);}assert.ok(escaped,'Back must leave the canonicalized historical bookmark');
  await cdp.evaluate('history.forward()');
  let returned=false;for(let i=0;i<120;i++){if(await cdp.evaluate("document.readyState==='complete'&&document.documentElement.dataset.activePanel==='agent-production'&&new URL(location.href).searchParams.get('tab')==='agent-production'")){returned=true;break;}await pause(25);}assert.ok(returned,'Forward must reopen the canonical fabrication ledger');
  assert.equal(requests.filter(item=>item.url.startsWith('/api/')&&item.method!=='GET').length,0,'navigation must never perform business writes');
  if(output)writeFileSync(path.join(output,'navigation-'+(minify?'minified':'normal')+'.json'),JSON.stringify({schema:'mls_navigation_rework_qa_v1',synthetic:true,owner_authenticated:false,provider_requests:0,checks},null,2)+'\n');
 }finally{if(cdp)await cdp.close();host.closeAllConnections?.();await new Promise(resolve=>host.close(resolve));}
});


test('native shell menu keeps six owner cells, reachable utilities and restricted review links without client JavaScript',{timeout:60000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 const host=http.createServer((req,res)=>{
  const route=new URL(req.url,'http://navigation.invalid'),role=route.searchParams.get('role')==='review'?'review':'owner';
  const html='<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--surface:#0e1930;--surface-raised:#172640;--text:#edf3ff;--muted:#a8b5cb;--line:#2a3e58;--accent:#95f849;--accent-soft:#243c24;--shadow:0 8px 32px #0008}*{box-sizing:border-box}body{margin:0;background:var(--surface);color:var(--text);font-family:Arial,sans-serif}.sidebar{width:245px;padding:16px}main{padding:16px}@media(max-width:850px){.sidebar{display:none}}'+SHELL_NAVIGATION_CSS+'</style></head><body>'+shellMobileNavigation(route.pathname,{role})+'<aside class="sidebar">'+workspaceNavigation(route.pathname,{role})+'</aside><main><h1>Operação da loja</h1><p>Dados sintéticos de navegação.</p></main></body></html>';
  assert.doesNotMatch(html,/<script/,'the menu must remain a native control');
  res.writeHead(200,{'content-type':'text/html;charset=utf-8','cache-control':'no-store'});res.end(html);
 });
 await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve));let cdp;
 try{
  cdp=await browser();
  const base='http://127.0.0.1:'+host.address().port;
  for(const role of ['owner','review'])for(const width of [320,390,768,1365]){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=850});
   await cdp.send('Page.navigate',{url:base+'/dashboard?role='+role});
   for(let index=0;index<80;index++){if(await cdp.evaluate("document.readyState==='complete'&&document.querySelector('h1')?.textContent==='Operação da loja'"))break;await pause(25);}
   const proof=await cdp.evaluate(`(()=>{const visible=n=>n.checkVisibility({checkVisibilityCSS:true}),nav=document.querySelector(innerWidth<=850?'.workspace-nav-mobile':'.sidebar>.workspace-nav'),menu=document.querySelector(innerWidth<=850?${JSON.stringify(role==='owner'?'.workspace-mobile-menu':'.workspace-header-menu .workspace-more')}:'.sidebar>.workspace-more');window.__nativeMenu=menu;return {width:innerWidth,scroll:document.documentElement.scrollWidth,cells:nav.children.length,links:[...nav.children].filter(n=>n.tagName==='A').map(n=>n.getAttribute('href')),visible:visible(nav),menus:[...document.querySelectorAll('.workspace-more>summary')].filter(visible).length,summaryHeight:menu.querySelector('summary').getBoundingClientRect().height,open:menu.open,ownerTop:document.querySelector('.shell-mobile-navigation .workspace-header-menu')!==null};})()`);
   assert.equal(proof.width,width);assert.ok(proof.scroll<=width+1);assert.equal(proof.visible,true);assert.equal(proof.menus,1);assert.equal(proof.open,false);assert.ok(proof.summaryHeight>=44);
   assert.equal(proof.cells,role==='review'?3:width<=850?6:8);
   if(role==='owner'&&width<=850){assert.deepEqual(proof.links,['/admin?tab=overview','/admin?tab=order-operations','/admin?tab=agent-production','/admin?tab=agent-finance','/admin?tab=products']);assert.equal(proof.ownerTop,false);}
   if(role==='review')assert.deepEqual(proof.links,['/dashboard','/campaigns','/optimization']);
   await cdp.send('Page.bringToFront');
   await cdp.evaluate('window.__keyproof=[]; for(const type of ["keydown","keyup","click"])document.addEventListener(type,e=>__keyproof.push({type,key:e.key,tag:e.target.tagName,cls:e.target.className,trusted:e.isTrusted})); window.__nativeMenu.querySelector("summary").focus()');
   await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',text:'\r',unmodifiedText:'\r',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,modifiers:0});
   await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,modifiers:0});
   const opened=await cdp.evaluate(`(()=>{const menu=window.__nativeMenu,nav=menu.querySelector('nav'),r=nav.getBoundingClientRect();return {open:menu.open,focused:document.activeElement.outerHTML,keyproof:__keyproof,all:[...menu.querySelectorAll('a')].map(n=>({href:n.getAttribute('href'),height:n.getBoundingClientRect().height})),box:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},overflow:getComputedStyle(nav).overflowY,scroll:document.documentElement.scrollWidth};})()`);
   assert.equal(opened.open,true,'native keyboard activates the actual details summary '+JSON.stringify({role,width,focused:opened.focused,keyproof:opened.keyproof}));assert.ok(opened.keyproof.some(event=>event.type==='click'&&event.tag==='SUMMARY'&&event.trusted),'the browser generates a trusted activation');assert.ok(opened.scroll<=width+1);
   for(const item of opened.all)assert.ok(item.height>=44,JSON.stringify({role,width,...item}));
   if(width<=850){assert.ok(opened.box.left>=0&&opened.box.right<=width+1);assert.ok(opened.box.top>=0&&opened.box.bottom<=900);assert.equal(opened.overflow,'auto');}
   if(role==='owner')for(const href of ['/admin?tab=agents','/admin?tab=margins','/optimization','/integrations','/admin?tab=history','/admin?tab=roadmap','/admin/diagnostics','/logout'])assert.ok(opened.all.some(n=>n.href===href),href);
   if(role==='owner'&&width<=850)for(const href of ['/admin?tab=agent-returns','/dashboard','/admin?tab=agent-hermes'])assert.ok(opened.all.some(n=>n.href===href),href);
   if(role==='review')assert.deepEqual(opened.all.map(n=>n.href),['/integrations','/logout']);
   // Enter follows a real utility href through the browser's native activation.
   await cdp.evaluate(`window.__nativeMenu.querySelector('a[href="/integrations"]').focus()`);
   await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',text:'\r',unmodifiedText:'\r',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,modifiers:0});
   await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,modifiers:0});
   let navigated=false;for(let index=0;index<80;index++){if(await cdp.evaluate("location.pathname==='/integrations'&&document.readyState==='complete'")){navigated=true;break;}await pause(25);}assert.equal(navigated,true,'native menu link opens its real route');
  }
 }finally{if(cdp)await cdp.close();host.closeAllConnections?.();await new Promise(resolve=>host.close(resolve));}
});
