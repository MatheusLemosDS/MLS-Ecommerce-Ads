import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {commandCenterBody} from '../src/agent-registry-view.mjs';
import {MLS_APPROVED_DESIGN_CSS} from '../src/approved-design-system.mjs';
import {MISSION_CSS} from '../src/mission-control.mjs';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {createChromeProfileCleanup} from './chrome-profile-cleanup.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const output=process.env.MLS_OVERVIEW_SCREENSHOT_DIR||null;

test('overview has one set of six KPI IDs, six saved-agent cards and three distinct lower panels',()=>{
 const body=commandCenterBody(),ids=[...body.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(new Set(ids).size,ids.length,'controller IDs must remain unique');
 for(const id of ['commandCenterNet','commandCenterSales','commandCenterAds','commandCenterMargin','commandCenterPaid','commandCenterAlerts','commandCenterAgents','commandCenterPriorities','commandCenterHermesSummary','missionTrendGraphOverview','missionHealthRing'])assert.ok(ids.includes(id),id);
 assert.equal((body.match(/data-agent-placeholder="true"/g)||[]).length,6);
 assert.match(body,/Sem atividade auditada no período/);
 assert.deepEqual([...body.matchAll(/data-mission-accent="([^"]+)" data-agent-placeholder/g)].map(m=>m[1]),['hermes','finance','ads','products','production','returns']);
 assert.equal((body.match(/class="mls-agent-avatar"/g)||[]).length,6);
 assert.match(body,/mls-command-globe/);assert.match(body,/id="mlsOverviewPeriod"/);assert.match(body,/id="mlsOverviewDate"/);
 assert.match(body,/mls-overview-performance/);assert.match(body,/mls-overview-activity/);assert.match(body,/mls-overview-priorities/);
 assert.ok(body.indexOf('id="commandAgents"')<body.indexOf('class="command-center-grid mls-overview-panels"'));
 assert.doesNotMatch(MLS_APPROVED_DESIGN_CSS,/repeat\(4,minmax\(0,1fr\)\).*important/);
 assert.doesNotMatch(MISSION_CSS,/V3 density pass 2|grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
});

async function browser(url,{width,height,theme,minify}){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-overview-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--disable-background-networking','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const cleanup=createChromeProfileCleanup(child,profile);
 let socket;
 try{
  let port=0;for(let n=0;n<120;n++){try{port=Number(readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}if(port)break;await pause(75);}
  assert.ok(port,'Chromium debug port');
  let page=null;for(let n=0;n<120;n++){try{const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();page=pages.find(p=>p.type==='page'&&typeof p.webSocketDebuggerUrl==='string');}catch{}if(page)break;await pause(75);}
  assert.ok(page,'Chromium owner page target must finish initialization');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let next=0;const calls=new Map();
  socket.addEventListener('message',event=>{const value=JSON.parse(event.data),call=calls.get(value.id);if(!call)return;calls.delete(value.id);value.error?call.reject(Error(value.error.message)):call.resolve(value.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;calls.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});
  await send('Page.navigate',{url});
  let ready=false;for(let n=0;n<120;n++){if(await evaluate("document.readyState==='complete'&&!!globalThis.mlsAgentRegistry?.getSnapshot?.()")){ready=true;break;}await pause(75);}
  assert.equal(ready,true,'owner modules initialize');await pause(200);
  const proof=await evaluate(`(()=>{
   const rects=selector=>[...document.querySelectorAll(selector)].map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:r.width,height:r.height};});
   return {theme:document.documentElement.dataset.theme,width:innerWidth,scroll:document.documentElement.scrollWidth,
    kpis:rects('#commandCenter>.command-center-metrics>.command-metric'),agents:rects('#commandCenterAgents>.agent-card'),
    panels:rects('.mls-overview-panels>*'),
    activity:document.querySelector('.mls-overview-activity').textContent,
    detail:!!document.querySelector('.mls-overview-detail>summary'),
    heroGeometry:(()=>{const n=document.querySelector('.mission-command-hero'),c=document.querySelector('.mission-overview-copy'),p=document.querySelector('.mls-overview-period'),s=getComputedStyle(n);return {rect:n.getBoundingClientRect().toJSON(),copy:c.getBoundingClientRect().toJSON(),period:p.getBoundingClientRect().toJSON(),height:s.height,minHeight:s.minHeight,padding:s.padding,gap:s.gap,alignItems:s.alignItems,justifyContent:s.justifyContent,flexDirection:s.flexDirection,copyStyle:{height:getComputedStyle(c).height,minHeight:getComputedStyle(c).minHeight,padding:getComputedStyle(c).padding}};})(),
    kpiGeometry:(()=>{const n=document.querySelector('.command-metric'),s=getComputedStyle(n);return {height:s.height,minHeight:s.minHeight,padding:s.padding,gap:s.gap,children:[...n.children].map(c=>({id:c.id,tag:c.tagName,rect:c.getBoundingClientRect().toJSON(),minHeight:getComputedStyle(c).minHeight,padding:getComputedStyle(c).padding,margin:getComputedStyle(c).margin,lineHeight:getComputedStyle(c).lineHeight}))};})(),
    cardOrder:[...document.querySelectorAll('#commandCenterAgents>.agent-card')].map(n=>n.dataset.missionAccent),
    avatars:document.querySelectorAll('#commandCenterAgents .mls-agent-avatar svg').length,
    globe:document.querySelectorAll('.mls-command-globe svg').length,
    sourceCollapsed:document.querySelector('.mls-overview-source').open===false,
    periodTouchHeight:document.getElementById('mlsOverviewPeriod').getBoundingClientRect().height,
    errors:window.__mlsOverviewErrors||[]};})()`);
  if(output){mkdirSync(output,{recursive:true});writeFileSync(path.join(output,`geometry-${width}-${theme}-${minify?'min':'normal'}.json`),JSON.stringify(proof,null,2)+'\n');}
  assert.equal(proof.theme,theme);assert.equal(proof.width,width);assert.ok(proof.scroll<=width+3,JSON.stringify(proof));
  assert.equal(proof.kpis.length,6);assert.equal(proof.agents.length,6);assert.equal(proof.panels.length,3);
  assert.deepEqual(proof.cardOrder,['hermes','finance','ads','products','production','returns']);assert.equal(proof.avatars,6);assert.equal(proof.globe,1);assert.equal(proof.sourceCollapsed,true);
  assert.match(proof.activity,/Sem atividade auditada no período/);assert.equal(proof.detail,true);assert.deepEqual(proof.errors,[]);
  if(width===1365){
   for(const [kind,rows] of [['kpi',proof.kpis],['agent',proof.agents],['lower panels',proof.panels]])assert.equal(new Set(rows.map(r=>Math.round(r.top))).size,1,kind+' share one row');
   assert.ok(proof.agents[0].top>proof.kpis[0].top);assert.ok(proof.panels[0].top>proof.agents[0].top);
   assert.ok(proof.kpis.every(row=>row.height<=145),'KPI density must match the compact original reference: '+JSON.stringify(proof.kpis));
   assert.ok(proof.agents.every(row=>row.height<=240),'agent cards must retain compact reference density: '+JSON.stringify(proof.agents));
  }
  if(width===390){assert.equal(new Set(proof.agents.map(r=>Math.round(r.top))).size,3,'mobile agents use three two-card rows');assert.ok(proof.periodTouchHeight>=44,'mobile date control has a44px touch target');}
  for(const row of [...proof.kpis,...proof.agents,...proof.panels])assert.ok(row.left>=-2&&row.right<=width+3,JSON.stringify(row));
  if(output){mkdirSync(output,{recursive:true});const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});writeFileSync(path.join(output,`overview-${width}-${theme}-${minify?'min':'normal'}.png`),Buffer.from(shot.data,'base64'));}
  const periodProof=await evaluate(`(()=>{
   const period=document.getElementById('mlsOverviewPeriod'),proxy=document.getElementById('mlsOverviewDate'),original=document.getElementById('businessDayDate');
   const initialBlocked=period.disabled&&original.disabled;
   let monthReads=0;globalThis.brazaMonthDashboard={selectMonth:()=>{monthReads++;return Promise.resolve(true);}};
   globalThis.brazaDayDashboard.bootstrapState({phase:'READY'});globalThis.mlsAgentRegistry.refresh();
   const enabled=!period.disabled&&!original.disabled;
   period.value='yesterday';period.dispatchEvent(new Event('change'));
   const selectedYesterday=globalThis.brazaDayDashboard.getSelection(),originalYesterday=original.value;
   period.value='custom';period.dispatchEvent(new Event('change'));
   proxy.value='2026-10-03';proxy.dispatchEvent(new Event('change'));
   const custom=globalThis.brazaDayDashboard.getSelection(),customVisible=!proxy.hidden;
   proxy.value='2099-01-01';proxy.dispatchEvent(new Event('change'));
   const invalidRejected=globalThis.brazaDayDashboard.getSelection()===custom;
   return {initialBlocked,enabled,selectedYesterday,originalYesterday,custom,customVisible,invalidRejected,monthReads};})()`);
  assert.equal(periodProof.initialBlocked,true);assert.equal(periodProof.enabled,true);
  assert.equal(periodProof.selectedYesterday,periodProof.originalYesterday);
  assert.equal(periodProof.custom,'2026-10-03');assert.equal(periodProof.customVisible,true);assert.equal(periodProof.invalidRejected,true);
  assert.ok(periodProof.monthReads>=0&&periodProof.monthReads<=2,'only the original date controller may select the month');
  return {...proof,periodProxy:periodProof};
 }finally{await cleanup(socket);}
}

test('compiled overview preserves six-by-six desktop composition and mobile access in both themes',{timeout:120000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 const results=[];
 for(const minify of [false,true]){
  const {html:base}=await compiledOwnerReportPage(minify,{ownerPreview:false});let html=base;
  const server=http.createServer((req,res)=>{const api=req.url.startsWith('/api/');res.writeHead(api?503:200,{'content-type':api?'application/json':'text/html; charset=utf-8','cache-control':'no-store'});res.end(api?'{}':html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
   for(const [width,height] of [[390,844],[1365,900]])for(const theme of ['dark','light']){
    html=base.replace('<head>','<head><script>localStorage.setItem("braza-theme",'+JSON.stringify(theme)+');window.__mlsOverviewErrors=[];addEventListener("error",e=>window.__mlsOverviewErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>window.__mlsOverviewErrors.push(String(e.reason?.message||e.reason)));</script>');
    results.push({minify,width,height,theme,...await browser('http://127.0.0.1:'+server.address().port+'/admin?tab=overview',{width,height,theme,minify})});
   }
  }finally{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
 }
 if(output)writeFileSync(path.join(output,'composition.json'),JSON.stringify({schema:'mls_overview_composition_qa_v1',synthetic:true,mockup_parity_verified:false,owner_authenticated_qa:false,checks:results},null,2)+'\n');
});
