import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {createChromeProfileCleanup} from './chrome-profile-cleanup.mjs';
import {waitForChromeDebugPort} from './chrome-debug-port.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const output=process.env.MLS_APPROVED_SCREENSHOT_DIR||null;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function start({captureDirectory=output}={}){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-approved-panels-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-extensions',
  '--disable-background-networking','--remote-allow-origins=*','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const cleanup=createChromeProfileCleanup(child,profile);
 let socket;
 try{
  const port=await waitForChromeDebugPort(child,profile);
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
   if(!captureDirectory)return;
   const data=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
   if(!data?.data)throw Error('PNG capture missing');
   mkdirSync(captureDirectory,{recursive:true});
   writeFileSync(path.join(captureDirectory,file),Buffer.from(data.data,'base64'));
  },async close(){await cleanup(socket);}};
 }catch(e){
  await cleanup(socket);
  throw e;
 }
}

const pages=['overview','agents','agent-finance','agent-ads','agent-products','agent-production',
 'agent-returns','agent-auditor','agent-hermes','products','production','roadmap','hermes','margins','history'];
const screenshotPages=new Set(pages);
async function topbarBounds(cdp){
 return cdp.evaluate(`(()=>{
  const bar=document.querySelector('.mls-shell-topbar'),tools=bar?.querySelector('.mls-shell-tools');
  if(!bar||!tools)return {missing:true};
  const visible=node=>!!node&&node.checkVisibility({checkVisibilityCSS:true}),box=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const pieces=[bar.querySelector('.mls-shell-context'),...tools.children].filter(visible).map(node=>({name:node.id||node.className,rect:box(node)})),overlap=[];
  for(let a=0;a<pieces.length;a++)for(let b=a+1;b<pieces.length;b++){const x=pieces[a],y=pieces[b];if(Math.min(x.rect.right,y.rect.right)-Math.max(x.rect.left,y.rect.left)>1&&Math.min(x.rect.bottom,y.rect.bottom)-Math.max(x.rect.top,y.rect.top)>1)overlap.push([x.name,y.name]);}
  const controls=[...bar.querySelectorAll('button,summary')].filter(visible).map(node=>{const r=box(node),hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);return {name:node.id||node.className,...r,hit:hit===node||node.contains(hit)};});
  return {width:innerWidth,bar:box(bar),pieces,overlap,controls};
 })()`);
}
function assertTopbar(bounds,label,width){
 assert.equal(bounds.missing,undefined,label+': topbar missing');assert.equal(bounds.width,width);
 assert.ok(bounds.bar.left>=-1&&bounds.bar.right<=width+1,label+': topbar clipped');
 assert.deepEqual(bounds.overlap,[],label+': topbar sections overlap '+JSON.stringify(bounds));
 assert.ok(bounds.controls.length>=2,label+': topbar actions missing '+JSON.stringify(bounds));
 assert.ok(bounds.controls.some(control=>control.name==='missionSearchOpen'),label+': search action missing');
 assert.ok(bounds.controls.some(control=>control.name.includes('theme-button')),label+': theme action missing');
 for(const control of bounds.controls){assert.ok(control.width>=43.9&&control.height>=43.9,label+': topbar action below44px '+JSON.stringify(control));assert.ok(control.left>=-1&&control.right<=width+1,label+': topbar action clipped '+JSON.stringify(control));assert.equal(control.hit,true,label+': topbar action covered '+control.name);}
}
async function navigateOwnerPanel(cdp,id){
 return await cdp.evaluate("(()=>{"+
     "const id="+JSON.stringify(id)+";"+
     "const visible=node=>node.checkVisibility?node.checkVisibility({checkVisibilityCSS:true}):node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden';"+
     "const candidates=target=>[...document.querySelectorAll('[data-tab],[data-mission-open],[data-open]')].filter(node=>node.dataset.tab===target||node.dataset.missionOpen===target||node.dataset.open===target);"+
     "const click=target=>{let link=candidates(target).find(visible);"+
     "if(!link){const menu=candidates(target).map(node=>node.closest('.workspace-more')).find(menu=>menu&&visible(menu.querySelector('summary')));"+
     "if(menu&&!menu.open)menu.querySelector('summary').click();link=candidates(target).find(visible);}"+
     "if(!link)return false;link.click();return true;};"+
     "if(id.startsWith('agent-')&&!click('agents'))return {missing:'agents'};"+
     "if(!click(id))return {missing:id};"+
     "return {tab:new URL(location.href).searchParams.get('tab'),active:document.documentElement.dataset.activePanel,visible:!document.getElementById(id)?.hidden};"+
     "})()");
}
for(const minify of [false,true])test('owner design smoke: fifteen real workspaces, real navigation and light/dark themes at desktop and 390px mobile (minify='+minify+')',{timeout:120000},async t=>{
 if(!chrome)return t.skip('Chrome not installed');
 let {html}=await compiledOwnerReportPage(minify,{ownerPreview:false});
 html=html.replace('<head>','<head><script>window.__mlsPanelQaErrors=[];window.addEventListener("error",event=>window.__mlsPanelQaErrors.push(String(event.message||"ERROR").slice(0,250)));window.addEventListener("unhandledrejection",event=>window.__mlsPanelQaErrors.push(String(event.reason?.message||event.reason||"REJECTION").slice(0,250)));</script>');
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
   for(const theme of ['dark','light']){
    const selectedTheme=await cdp.evaluate("(()=>{"+
     "const desired="+JSON.stringify(theme)+";"+
     "const visible=node=>node.checkVisibility?node.checkVisibility({checkVisibilityCSS:true}):node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden';"+
     "const button=[...document.querySelectorAll('[data-braza-theme-toggle]')].find(visible);"+
     "if(!button)return {missing:true};"+
     "let clicks=0;while(document.documentElement.dataset.themePreference!==desired&&clicks<3){button.click();clicks++;}"+
     "return {theme:document.documentElement.dataset.theme,preference:document.documentElement.dataset.themePreference,persisted:localStorage.getItem('braza-theme'),scheme:getComputedStyle(document.documentElement).colorScheme,clicks};"+
     "})()");
    assert.equal(selectedTheme.missing,undefined,viewport.name+': real theme toggle missing');
    assert.equal(selectedTheme.theme,theme,viewport.name+': theme toggle failed');
    assert.equal(selectedTheme.preference,theme,viewport.name+': explicit theme preference not selected');
    assert.equal(selectedTheme.persisted,theme,viewport.name+': theme preference not persisted');
    assert.equal(selectedTheme.scheme,theme,viewport.name+': browser color scheme differs');
    await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assertTopbar(await topbarBounds(cdp),viewport.name+'/'+theme+'/'+(minify?'minified':'normal'),viewport.width);
    for(const id of pages){
    const navigation=await navigateOwnerPanel(cdp,id);
    assert.equal(navigation.missing,undefined,viewport.name+'/'+theme+': destination has no usable navigation '+id);
    assert.equal(navigation.tab,id,viewport.name+'/'+theme+': navigation did not update URL for '+id);
    assert.equal(navigation.active,id,viewport.name+'/'+theme+': active workspace differs from navigation '+id);
    assert.equal(navigation.visible,true,viewport.name+'/'+theme+': navigation left workspace hidden '+id);
    const result=await cdp.evaluate("(()=>{"+
     "const id="+JSON.stringify(id)+",section=document.getElementById(id);"+
     "const workspace=document.querySelector('main.workspace');"+
     "if(!section||!workspace)return {missing:true,id};"+
     "section.scrollIntoView({block:'start',behavior:'instant'});"+
     "const rect=section.getBoundingClientRect(),nav=section.querySelector('.mission-page-tabs');"+
     "const navRect=nav?.getBoundingClientRect();"+
     "let specialist=null;if(section.classList.contains('mls-agent-workspace')){"+
     "const visible=node=>!!node&&(node.checkVisibility?node.checkVisibility({checkVisibilityCSS:true}):node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden');"+
     "const box=node=>{const r=node?.getBoundingClientRect();return r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}:null;};"+
     "const stats=section.querySelector('.mission-stats'),pair=section.querySelector('.mls-workspace-chart-pair'),mini=section.querySelector('.mls-agent-mini-nav');"+
     "const more=[...document.querySelectorAll('.workspace-more > summary')].find(visible),menu=more?.parentElement,wasOpen=!!menu?.open;"+
     "const moreBox=box(more),hit=moreBox?document.elementFromPoint((moreBox.left+moreBox.right)/2,(moreBox.top+moreBox.bottom)/2):null;"+
     "const moreHit=!!more&&(hit===more||more.contains(hit));if(more&&!wasOpen)more.click();"+
     "const moreOpen=!!menu?.open,historyReachable=visible(menu?.querySelector('[data-tab=history]'));if(more&&!wasOpen)more.click();"+
     "const primary=section.querySelector('.mls-workspace-primary'),reason=section.querySelector('#mission-ads-action-note');"+
     "specialist={columns:stats?getComputedStyle(stats).gridTemplateColumns.trim().split(/\\s+/).length:0,kpis:stats?.children.length||0,"+
     "charts:pair?[...pair.querySelectorAll('.mission-module,.mission-trend-panel')].map(box):[],mini:box(mini),miniDirection:mini?getComputedStyle(mini.querySelector('nav')).flexDirection:null,miniLinks:mini?[...mini.querySelectorAll('a')].map(box):[],sidebar:box(document.querySelector('.sidebar')),"+
     "more:{visible:visible(more),hit:moreHit,opens:moreOpen,history:historyReachable},mobileNav:visible(document.querySelector('.workspace-nav-mobile')),"+
     "ads:section.id==='agent-ads'?{disabled:primary?.disabled===true,reason:reason?.textContent||'',reasonVisible:visible(reason)}:null};}"+
     "return {id,inner:innerWidth,scroll:document.documentElement.scrollWidth,"+
     "overflow:[...section.querySelectorAll('*')].map(node=>({node,rect:node.getBoundingClientRect()})).filter(({node,rect})=>rect.width>0&&(rect.left<-2||rect.right>"+(viewport.width+3)+")&&getComputedStyle(node).display!=='none').sort((a,b)=>a.rect.width-b.rect.width).slice(0,10).map(({node,rect})=>({tag:node.tagName,id:node.id,classes:typeof node.className==='string'?node.className:'SVG',left:rect.left,right:rect.right,width:rect.width,text:node.textContent?.slice(0,70)})),"+
     "section:{left:rect.left,right:rect.right,top:rect.top,width:rect.width},nav:navRect?{left:navRect.left,right:navRect.right}:null,"+
     "theme:document.documentElement.dataset.theme,visible:getComputedStyle(section).display!=='none',"+
     "specialist,workspaces:document.querySelectorAll('.mission-workspace').length,errors:window.__mlsPanelQaErrors.slice()};"+
     "})()");
    assert.equal(result.missing,undefined,viewport.name+': missing '+id);
    assert.equal(result.theme,theme,id+': theme not applied');
    if(result.inner!==viewport.width)await cdp.capture('failure-'+theme+'-'+viewport.name+'-'+id+'.png');
    assert.equal(result.inner,viewport.width,id+': device width expanded '+JSON.stringify(result.overflow));
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
    if(result.specialist){
     const layout=result.specialist,label=viewport.name+'/'+theme+'/'+id;
     assert.equal(layout.kpis,4,label+': four observed KPI slots must remain');
     assert.equal(layout.columns,viewport.mobile?2:4,label+': wrong specialist KPI column count');
     assert.equal(layout.charts.length,2,label+': exactly two observed chart panels required');
     const [first,second]=layout.charts;
     if(viewport.mobile){
      assert.ok(second.top>=first.bottom-2,label+': mobile chart panels must stack');
      assert.equal(layout.mobileNav,true,label+': main mobile navigation is hidden');
      assert.equal(layout.miniDirection,'row',label+': mobile specialized navigation must form a horizontal row');
      assert.ok(layout.mini&&layout.mini.height<=60,label+': mobile specialized navigation consumes too much vertical space');
      assert.ok(layout.miniLinks.length>0&&Math.max(...layout.miniLinks.map(link=>link.top))-Math.min(...layout.miniLinks.map(link=>link.top))<=2,label+': mobile specialized navigation links must remain on one row');
     }else{
      assert.ok(Math.abs(first.top-second.top)<=2,label+': desktop chart panels must share a row');
      assert.ok(second.left>=first.right-2,label+': desktop chart panels overlap');
      assert.ok(layout.mini&&layout.sidebar&&layout.mini.left>=0&&layout.mini.right<=layout.sidebar.right+2,label+': specialized rail exceeds the existing sidebar');
     }
     assert.deepEqual(layout.more,{visible:true,hit:true,opens:true,history:true},label+': global More options must remain reachable');
     if(layout.ads){assert.equal(layout.ads.disabled,true,label+': campaign creation must remain blocked');assert.equal(layout.ads.reasonVisible,true,label+': observer block reason must be visible');assert.match(layout.ads.reason,/Bloqueado.*Observador/);}
    }
    assert.deepEqual(result.errors,[],viewport.name+'/'+theme+'/'+id+': browser runtime errors');
    if(screenshotPages.has(id))await cdp.capture('approved-'+theme+'-'+viewport.name+'-'+id+(minify?'-minified':'')+'.png');
    report.push({viewport:viewport.name,width:viewport.width,height:viewport.height,panel:id,theme,
     minify,navigation:'REAL_EXISTING_CONTROL',theme_selection:'REAL_THEME_TOGGLE',synthetic:true,visible:true,overflow:false,topbar:'NON_OVERLAPPING_44PX_CONTROLS'});
    }
   }
  }
  if(output){
   mkdirSync(output,{recursive:true});
   writeFileSync(path.join(output,minify?'results-minified.json':'results.json'),JSON.stringify({
    schema:'mls_approved_design_all_panels_qa_v1',owner_authenticated:false,
    production_approved:false,mockup_parity_approved:false,source:'synthetic owner',checks:report
   },null,2)+'\n');
   writeFileSync(path.join(output,'README.txt'),
    'MLS technical design QA: real navigation controls and real light/dark theme toggle at 1365x900 and 390x844. Synthetic local HTML and stubs only. No Shop, D1, Finance, Ads or Shopee source is fetched. All amounts on the screenshots are UNKNOWN unless clearly marked as fixture. NOT a mockup-parity approval, owner review or production deployment.\n');
  }
 }finally{try{await cdp?.close();}finally{server.closeAllConnections?.();server.close();}}
});

test('fresh local D1 owner bootstrap captures six connected workspaces while financial amounts remain unknown',{timeout:120000},async t=>{
 if(!chrome)return t.skip('Chrome not installed');
 const fixture=await compiledOwnerReportPage(false,{ownerPreview:false,localReadSnapshot:true}),local=fixture.localReadSnapshot;
 assert.equal(local.source,'FRESH_SYNTHETIC_SQLITE_D1');assert.equal(local.external_service_bindings,false);
 const monthResponse=local.responses.find(row=>row.path.startsWith('/api/admin/finance/business-month-view?'));
 assert.equal(monthResponse.contract,'business-month-view-v4');assert.equal(monthResponse.body.schema,'business_month_view_v4');
 for(const field of ['sales_cents','expected_repass_cents','production_cost_cents','invoice_tax_cents'])assert.equal(monthResponse.body.display[field],null,'fresh local source cannot supply '+field);
 assert.equal(monthResponse.body.display.result.net_estimate_cents,null);assert.equal(monthResponse.body.display.result.net_profit_cents,null);
 assert.ok(Object.values(monthResponse.body.display.source_checked_at).every(value=>value===null));
 const captureDirectory=process.env.MLS_NORMAL_SCREENSHOT_DIR||(output?path.join(output,'normal-connected'):null);
 let html=fixture.html.replace('<head>','<head><script>window.__mlsPanelQaErrors=[];window.addEventListener("error",event=>window.__mlsPanelQaErrors.push(String(event.message||"ERROR").slice(0,250)));window.addEventListener("unhandledrejection",event=>window.__mlsPanelQaErrors.push(String(event.reason?.message||event.reason||"REJECTION").slice(0,250)));</script>');
 html=html.replace('<body>','<body><div style="position:fixed;right:8px;bottom:8px;z-index:99999;pointer-events:none;border:1px solid #729bcc;background:#0d2341;color:#e8f7ff;font:10px sans-serif;padding:6px 9px;border-radius:6px">QA · D1 LOCAL VAZIO · FINANCEIRO DESCONHECIDO</div>');
 const mapped=new Map(local.responses.map(row=>[row.path,row])),requests=[],writes=[];
 const server=http.createServer((req,res)=>{
  if(req.url?.startsWith('/api/')){
   requests.push(req.method+' '+req.url);if(req.method!=='GET')writes.push(req.method+' '+req.url);
   const entry=mapped.get(req.url),matches=req.method==='GET'&&entry&&Object.entries(entry.request_headers).every(([key,value])=>req.headers[key.toLowerCase()]===value);
   const headers={'content-type':'application/json','cache-control':'no-store'};
   if(matches&&entry.contract){headers['x-braza-client-contract']=entry.contract;headers.vary='X-Braza-Client-Contract';}
   res.writeHead(matches?entry.status:503,headers);res.end(JSON.stringify(matches?entry.body:{error:'SYNTHETIC_UNMAPPED_SOURCE'}));return;
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let cdp;const checks=[];
 try{
  cdp=await start({captureDirectory});
  for(const viewport of [{name:'desktop',width:1365,height:900,mobile:false},{name:'mobile',width:390,height:844,mobile:true}]){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:viewport.mobile});
   await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/admin?tab=overview'});
   let ready=false;
   for(let i=0;i<130;i++){
    if(await cdp.evaluate("document.readyState==='complete'&&globalThis.brazaMonthDashboard?.getSnapshot?.().checked_at>0&&globalThis.brazaMonthDashboard?.getSourceStatus?.().month==="+JSON.stringify(local.month))){ready=true;break;}
    await delay(75);
   }
   assert.equal(ready,true,viewport.name+': genuine local monthly response was not accepted');
   for(const theme of ['dark','light']){
    const selected=await cdp.evaluate("(()=>{const desired="+JSON.stringify(theme)+",button=[...document.querySelectorAll('[data-braza-theme-toggle]')].find(node=>node.checkVisibility());if(!button)return null;for(let i=0;document.documentElement.dataset.themePreference!==desired&&i<3;i++)button.click();return {theme:document.documentElement.dataset.theme,preference:localStorage.getItem('braza-theme')};})()");
    assert.deepEqual(selected,{theme,preference:theme});
    await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    for(const id of ['overview','agent-finance','agent-ads','agent-products','agent-production','agent-returns']){
     const navigation=await navigateOwnerPanel(cdp,id);assert.deepEqual(navigation,{tab:id,active:id,visible:true});
     const state=await cdp.evaluate("(()=>{const id="+JSON.stringify(id)+",section=document.getElementById(id);section.scrollIntoView({block:'start',behavior:'instant'});const rect=section.getBoundingClientRect(),snapshot=globalThis.brazaMonthDashboard.getSnapshot(),hero=section.querySelector('.mls-workspace-heading'),mini=section.querySelector('.mls-agent-mini-nav'),nav=mini?.querySelector('nav'),ads=section.querySelector('#missionTrendGraphAds');return {width:innerWidth,scroll:document.documentElement.scrollWidth,left:rect.left,right:rect.right,theme:document.documentElement.dataset.theme,message:document.getElementById('message').textContent.trim(),retryHidden:document.getElementById('startupRetry').hidden,balance:snapshot.balance_cents,adsSpend:snapshot.ads_spend_cents,errors:window.__mlsPanelQaErrors.slice(),heroTop:hero?.getBoundingClientRect().top??null,mini:mini?{height:mini.getBoundingClientRect().height,direction:getComputedStyle(nav).flexDirection,tops:[...nav.querySelectorAll('a')].map(link=>link.getBoundingClientRect().top)}:null,ads:ads?{height:ads.getBoundingClientRect().height,status:ads.dataset.chartStatus,svg:ads.querySelectorAll('svg').length,text:ads.textContent,rows:section.querySelectorAll('#missionTrendValuesAds tr').length}:null};})()");
     const label=viewport.name+'/'+theme+'/'+id;
     assert.equal(state.width,viewport.width,label+': viewport expanded');assert.ok(state.scroll<=viewport.width+3,label+': horizontal overflow');assert.ok(state.left>=-2&&state.right<=viewport.width+3,label+': workspace clipped');
     assert.equal(state.theme,theme);assert.equal(state.message,'',label+': successful local bootstrap must not show startup failure');assert.equal(state.retryHidden,true,label+': successful bootstrap must hide retry action');
     assert.equal(state.balance,null,label+': unknown local finance must not become profit zero');assert.equal(state.adsSpend,null,label+': unknown local Ads must not become spend zero');assert.deepEqual(state.errors,[],label+': browser runtime errors');
     if(viewport.mobile&&state.mini){assert.equal(state.mini.direction,'row',label+': mobile module nav is not horizontal');assert.ok(state.mini.height<=60,label+': mobile module nav is too tall');assert.ok(Math.max(...state.mini.tops)-Math.min(...state.mini.tops)<=2,label+': module links wrapped vertically');assert.ok(state.heroTop<=250,label+': connected mobile header pushed too far down');}
     if(state.ads){assert.equal(state.ads.status,'UNAVAILABLE');assert.equal(state.ads.svg,0);assert.equal(state.ads.rows,0);assert.match(state.ads.text,/indispon|observa|histórico/i);if(!viewport.mobile)assert.ok(state.ads.height<=290,label+': empty Ads graph is excessively tall');}
     await cdp.capture('approved-'+theme+'-'+viewport.name+'-'+id+'.png');
     checks.push({viewport:viewport.name,width:viewport.width,height:viewport.height,panel:id,theme,synthetic:true,source:'FRESH_SYNTHETIC_SQLITE_D1',bootstrap:'ACTUAL_WORKER_RESPONSE',monthly_contract:'business-month-view-v4',financial_amounts:'UNKNOWN',visible:true,overflow:false,navigation:'REAL_EXISTING_CONTROL',theme_selection:'REAL_THEME_TOGGLE'});
    }
   }
  }
  assert.deepEqual(writes,[],'visual review must never issue business writes');
  assert.ok(requests.includes('GET /api/admin/bootstrap'));assert.ok(requests.includes('GET '+monthResponse.path));
  if(captureDirectory){
   mkdirSync(captureDirectory,{recursive:true});writeFileSync(path.join(captureDirectory,'results.json'),JSON.stringify({schema:'mls_approved_design_all_panels_qa_v1',owner_authenticated:false,production_approved:false,mockup_parity_approved:false,source:'synthetic owner',scenario:'CONNECTED_FRESH_LOCAL_D1_UNKNOWN_FINANCE',real_shop_verified:false,checks},null,2)+'\n');
   writeFileSync(path.join(captureDirectory,'README.txt'),'Connected visual QA uses real responses from the compiled Worker with fresh synthetic SQLite D1 and no external service bindings. Bootstrap is valid; sales, payout, Ads and profit remain unknown. All unmapped API routes return503. No startup error is hidden by CSS. Native dark/light desktop/mobile captures are for human comparison, not visual approval or Seller Centre evidence.\n');
  }
 }finally{try{await cdp?.close();}finally{server.closeAllConnections?.();server.close();}}
});
