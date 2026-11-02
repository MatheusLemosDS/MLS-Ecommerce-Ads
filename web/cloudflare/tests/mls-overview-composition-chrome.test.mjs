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
import {createHash} from 'node:crypto';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const output=process.env.MLS_OVERVIEW_SCREENSHOT_DIR||null;
const overviewAgents=['hermes','finance','ads','products','production','returns'];
const generatedHashes=Object.fromEntries(['app','auth','finance'].map(name=>[name,createHash('sha256').update(readFileSync(new URL('../../../dist/'+name+'-worker.mjs',import.meta.url))).digest('hex')]));

test('overview keeps six KPI bindings, the original six-agent team, one release strip and focused work panels',()=>{
 const body=commandCenterBody(),ids=[...body.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(new Set(ids).size,ids.length,'controller IDs must remain unique');
 for(const id of ['commandCenterNet','commandCenterSales','commandCenterAds','commandCenterMargin','commandCenterPaid','commandCenterAlerts','commandCenterPriorities','commandCenterHermesSummary','missionTrendGraphOverview','missionHealthRing'])assert.ok(ids.includes(id),id);
 assert.equal((body.match(/data-agent-placeholder="true"/g)||[]).length,6,'the approved agents exist before client hydration');
 assert.deepEqual([...body.matchAll(/class="agent-card"[^>]*data-mission-open="agent-([^"]+)"/g)].map(row=>row[1]),overviewAgents);
 assert.ok(body.indexOf('id="commandAgents"')>body.indexOf('class="command-center-metrics"'));
 assert.ok(body.indexOf('id="commandAgents"')<body.indexOf('id="appReleaseOverviewTitle"'));
 assert.match(body,/id="appReleaseOverviewTitle"/);assert.equal((body.match(/class="app-release-more"/g)||[]).length,1);
 assert.doesNotMatch(body,/class="app-release-links"/);
 assert.match(body,/mls-command-globe/);assert.match(body,/id="mlsOverviewPeriod"/);assert.match(body,/id="mlsOverviewDate"/);
 assert.match(body,/mls-overview-performance/);assert.match(body,/mls-overview-activity/);assert.match(body,/mls-overview-priorities/);
 assert.ok(body.indexOf('id="appReleaseOverviewTitle"')<body.indexOf('class="command-center-grid mls-overview-panels"'));
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
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=390});
  await send('Emulation.setScriptExecutionDisabled',{value:true});
  await send('Page.navigate',{url});
  let staticReady=false;for(let n=0;n<120;n++){if(await evaluate("document.readyState==='complete'&&document.querySelectorAll('#commandCenterAgents>.agent-card').length===6")){staticReady=true;break;}await pause(75);}
  assert.equal(staticReady,true,'the overview team must render before browser scripts can run');
  const staticProof=await evaluate(`(()=>{const cards=[...document.querySelectorAll('#commandCenterAgents>.agent-card')];return {count:cards.length,visible:cards.every(n=>n.checkVisibility({checkVisibilityCSS:true})),ids:cards.map(n=>n.dataset.missionAccent),placeholders:cards.filter(n=>n.dataset.agentPlaceholder==='true').length,avatars:cards.filter(n=>n.querySelector('.mls-agent-avatar>svg')).length,registry:typeof globalThis.mlsAgentRegistry};})()`);
  assert.deepEqual(staticProof,{count:6,visible:true,ids:overviewAgents,placeholders:6,avatars:6,registry:'undefined'});
  await send('Emulation.setScriptExecutionDisabled',{value:false});await send('Page.reload',{ignoreCache:true});
  let ready=false;for(let n=0;n<120;n++){if(await evaluate("document.readyState==='complete'&&!!globalThis.mlsAgentRegistry?.getSnapshot?.()")){ready=true;break;}await pause(75);}
  assert.equal(ready,true,'owner modules initialize');await pause(200);
  const proof=await evaluate(`(()=>{
   const rects=selector=>[...document.querySelectorAll(selector)].map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:r.width,height:r.height};});
   return {theme:document.documentElement.dataset.theme,width:innerWidth,scroll:document.documentElement.scrollWidth,
    kpis:rects('#commandCenter>.command-center-metrics>.command-metric'),overviewAgents:document.querySelectorAll('#overview .agent-card,#overview .mission-hub-card').length,fleetCards:document.querySelectorAll('#missionHubGrid>.mission-hub-card').length,
    overviewAgentRects:rects('#commandCenterAgents>.agent-card'),overviewOrder:[...document.querySelectorAll('#commandCenterAgents>.agent-card')].map(n=>n.dataset.missionAccent),overviewAvatars:document.querySelectorAll('#commandCenterAgents .mls-agent-avatar svg').length,overviewVisible:[...document.querySelectorAll('#commandCenterAgents>.agent-card')].every(n=>n.checkVisibility({checkVisibilityCSS:true})),panels:rects('.mls-overview-panels>*'),
    activity:document.querySelector('.mls-overview-activity').textContent,
    detail:!!document.querySelector('.mls-overview-detail>summary'),
    heroGeometry:(()=>{const n=document.querySelector('.mission-command-hero'),c=document.querySelector('.mission-overview-copy'),p=document.querySelector('.mls-overview-period'),s=getComputedStyle(n);return {rect:n.getBoundingClientRect().toJSON(),copy:c.getBoundingClientRect().toJSON(),period:p.getBoundingClientRect().toJSON(),height:s.height,minHeight:s.minHeight,padding:s.padding,gap:s.gap,alignItems:s.alignItems,justifyContent:s.justifyContent,flexDirection:s.flexDirection,copyStyle:{height:getComputedStyle(c).height,minHeight:getComputedStyle(c).minHeight,padding:getComputedStyle(c).padding}};})(),
    kpiGeometry:(()=>{const n=document.querySelector('.command-metric'),s=getComputedStyle(n);return {height:s.height,minHeight:s.minHeight,padding:s.padding,gap:s.gap,children:[...n.children].map(c=>({id:c.id,tag:c.tagName,rect:c.getBoundingClientRect().toJSON(),minHeight:getComputedStyle(c).minHeight,padding:getComputedStyle(c).padding,margin:getComputedStyle(c).margin,lineHeight:getComputedStyle(c).lineHeight}))};})(),
    cardOrder:[...document.querySelectorAll('#missionHubGrid>.mission-hub-card')].map(n=>n.dataset.missionAgent),
    avatars:document.querySelectorAll('#missionHubGrid .mls-agent-avatar svg').length,releaseGeometry:document.querySelector('.mls-release-strip').getBoundingClientRect().toJSON(),releaseLinks:document.querySelectorAll('.mls-release-strip a').length,
    globe:document.querySelectorAll('.mls-command-globe svg').length,
    sourceCollapsed:document.querySelector('.mls-overview-source').open===false,
    periodTouchHeight:document.getElementById('mlsOverviewPeriod').getBoundingClientRect().height,
    errors:window.__mlsOverviewErrors||[]};})()`);
  if(output){mkdirSync(output,{recursive:true});writeFileSync(path.join(output,`geometry-${width}-${theme}-${minify?'min':'normal'}.json`),JSON.stringify(proof,null,2)+'\n');}
  assert.equal(proof.theme,theme);assert.equal(proof.width,width);assert.ok(proof.scroll<=width+3,JSON.stringify(proof));
  assert.equal(proof.kpis.length,6);assert.equal(proof.overviewAgents,6);assert.equal(proof.overviewAvatars,6);assert.equal(proof.overviewVisible,true);assert.deepEqual(proof.overviewOrder,overviewAgents);assert.equal(proof.fleetCards,7);assert.equal(proof.panels.length,2);assert.equal(proof.releaseLinks,1);assert.ok(proof.releaseGeometry.height<=125,'release notice stays compact');
  assert.deepEqual(proof.cardOrder,['finance','ads','products','production','returns','auditor','hermes']);assert.equal(proof.avatars,7);assert.equal(proof.globe,1);assert.equal(proof.sourceCollapsed,true);
  assert.match(proof.activity,/Versão/);assert.match(proof.activity,/Novidades/);assert.equal(proof.detail,true);assert.deepEqual(proof.errors,[]);
  if(width===1365){
   for(const [kind,rows] of [['kpi',proof.kpis],['overview agents',proof.overviewAgentRects],['lower panels',proof.panels]])assert.equal(new Set(rows.map(r=>Math.round(r.top))).size,1,kind+' share one row');
   assert.ok(proof.releaseGeometry.top>proof.kpis[0].top);assert.ok(proof.panels[0].top>proof.releaseGeometry.top);
   assert.ok(proof.overviewAgentRects[0].top>proof.kpis[0].top);assert.ok(proof.releaseGeometry.top>proof.overviewAgentRects[0].top);
   assert.ok(proof.kpis.every(row=>row.height<=145),'KPI density must match the compact original reference: '+JSON.stringify(proof.kpis));
  }
  if(width<=390){assert.equal(new Set(proof.panels.map(r=>Math.round(r.top))).size,2,'mobile work panels stack in reading order');assert.ok(proof.periodTouchHeight>=44,'mobile date control has a44px touch target');assert.equal(new Set(proof.overviewAgentRects.map(r=>Math.round(r.top))).size,3,'the approved six agent cards form three compact mobile rows');for(const top of new Set(proof.overviewAgentRects.map(r=>Math.round(r.top))))assert.equal(proof.overviewAgentRects.filter(r=>Math.round(r.top)===top).length,2,'mobile rows keep two readable cards');}
  for(const row of [...proof.kpis,...proof.overviewAgentRects,...proof.panels,proof.releaseGeometry])assert.ok(row.left>=-2&&row.right<=width+3,JSON.stringify(row));
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
  // Hydrate the actual registry from deterministic saved views, then exercise
  // native card activation and the existing full directory without mutations.
  const hydrated=await evaluate(`(()=>{
   const day={schema:'mls_day_snapshot_v1',date:'2026-10-27',state:'READY',net_cents:25000,net_basis:'ESTIMATE',sales_cents:100000,ads_spend_cents:10000,paid_orders:20,pending:[]};
   const month={schema:'mls_month_snapshot_v1',month:'2026-10',status:'COMPLETE',checked_at:1793070000,balance_cents:240000,pending:[],coverage:{orders:300,paid:250,completed:110,ongoing:140,cancelled:45,cancel_pending:0,unpaid:5,other:0,unknown:0,returns:0,returns_unknown:0},production_coverage:{total_units:270,known_units:270,pending_units:0},ads_spend_cents:135000,ads_checked_at:1793070000,ads_pending:false,product_count:24};
   globalThis.__restoredAgentDay=day;globalThis.__restoredAgentMonth=month;globalThis.brazaDayDashboard={...globalThis.brazaDayDashboard,getSnapshot:()=>day};globalThis.brazaMonthDashboard={...globalThis.brazaMonthDashboard,getSnapshot:()=>month};
   globalThis.mlsAgentRegistry.refresh();const registry=globalThis.mlsAgentRegistry.getSnapshot(),byId=Object.fromEntries([registry.hermes,...registry.agents].map(n=>[n.id,n]));
   const cards=[...document.querySelectorAll('#commandCenterAgents>.agent-card')];globalThis.__restoredAgentFinancialBefore=JSON.stringify({day,month});globalThis.__restoredAgentSearch=document.getElementById('missionAgentSearch');
   return {schema:registry.schema,ids:cards.map(n=>n.dataset.missionAccent),rows:cards.map(n=>({id:n.dataset.missionAccent,status:n.dataset.status,expectedStatus:byId[n.dataset.missionAccent].status,name:n.querySelector('h4').textContent,expectedName:byId[n.dataset.missionAccent].name,avatar:!!n.querySelector('.mls-agent-avatar>svg'),href:n.getAttribute('href'),metric:n.querySelector('.agent-card-metric')?.textContent||null})),fallbacks:cards.filter(n=>n.dataset.agentPlaceholder==='true').length,finance:document.getElementById('missionHubMetric-finance').textContent,ads:document.getElementById('missionHubMetric-ads').textContent};})()`);
  assert.equal(hydrated.schema,'mls_agent_registry_v1');assert.deepEqual(hydrated.ids,overviewAgents);assert.equal(hydrated.fallbacks,0);
  for(const row of hydrated.rows){assert.equal(row.status,row.expectedStatus);assert.equal(row.name,row.expectedName);assert.equal(row.avatar,true);assert.equal(row.href,'/admin?tab=agent-'+row.id);}
  assert.equal(hydrated.rows.find(n=>n.id==='finance').metric,hydrated.finance);assert.equal(hydrated.rows.find(n=>n.id==='ads').metric,hydrated.ads);
  await evaluate('scrollTo(0,0)');
  if(output){const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});writeFileSync(path.join(output,`overview-agents-hydrated-${width}-${theme}-${minify?'min':'normal'}.png`),Buffer.from(shot.data,'base64'));}
  const nativeClick=async selector=>{const box=await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n?.checkVisibility({checkVisibilityCSS:true}))throw Error('VISIBLE_CARD_CONTROL_MISSING');n.scrollIntoView({block:'center',behavior:'instant'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box});};
  const waitFor=async expression=>{for(let n=0;n<120;n++){if(await evaluate(expression))return;await pause(25);}assert.fail('navigation did not reach '+expression);};
  const selectedMonth=await evaluate("new URL(location.href).searchParams.get('month')");assert.equal(selectedMonth,'2026-10');
  for(const id of overviewAgents){
   await nativeClick('#commandCenterAgents>.agent-card[data-mission-accent="'+id+'"]');await waitFor("document.documentElement.dataset.activePanel==='agent-"+id+"'");
   const destination=await evaluate(`({tab:new URL(location.href).searchParams.get('tab'),month:new URL(location.href).searchParams.get('month'),visible:document.getElementById('agent-${id}').checkVisibility({checkVisibilityCSS:true}),overflow:document.documentElement.scrollWidth>innerWidth+1})`);assert.deepEqual(destination,{tab:'agent-'+id,month:selectedMonth,visible:true,overflow:false});
   await evaluate('history.back()');await waitFor("document.documentElement.dataset.activePanel==='overview'");
  }
  await nativeClick('#commandAgents .mission-fleet-link');await waitFor("document.documentElement.dataset.activePanel==='agents'");
  const hub=await evaluate(`(()=>{const search=document.getElementById('missionAgentSearch');search.value='finance';search.dispatchEvent(new Event('input',{bubbles:true}));globalThis.mlsAgentRegistry.refresh();return {sameSearch:search===globalThis.__restoredAgentSearch,value:search.value,count:document.querySelectorAll('#missionHubGrid>.mission-hub-card').length,visible:[...document.querySelectorAll('#missionHubGrid>.mission-hub-card')].filter(n=>n.checkVisibility({checkVisibilityCSS:true})).map(n=>n.dataset.missionAgent),month:new URL(location.href).searchParams.get('month'),financialUnchanged:globalThis.__restoredAgentFinancialBefore===JSON.stringify({day:globalThis.__restoredAgentDay,month:globalThis.__restoredAgentMonth})};})()`);
  assert.deepEqual(hub,{sameSearch:true,value:'finance',count:7,visible:['finance'],month:selectedMonth,financialUnchanged:true});
  await evaluate('history.back()');await waitFor("document.documentElement.dataset.activePanel==='overview'");assert.deepEqual(await evaluate('window.__mlsOverviewErrors'),[]);
  return {...proof,staticFallback:staticProof,periodProxy:periodProof,hydrated,hub,navigation_history_tested:true,financial_frame_unchanged:true};
 }finally{await cleanup(socket);}
}

test('compiled overview restores original agent cards, native routes and directory filters in both themes',{timeout:120000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 const results=[];
 for(const minify of [false,true]){
  const {html:base}=await compiledOwnerReportPage(minify,{ownerPreview:false});let html=base;
  const server=http.createServer((req,res)=>{const api=req.url.startsWith('/api/');res.writeHead(api?503:200,{'content-type':api?'application/json':'text/html; charset=utf-8','cache-control':'no-store'});res.end(api?'{}':html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
   for(const [width,height] of [[320,844],[1365,900]])for(const theme of ['dark','light']){
    html=base.replace('<head>','<head><script>localStorage.setItem("braza-theme",'+JSON.stringify(theme)+');window.__mlsOverviewErrors=[];addEventListener("error",e=>window.__mlsOverviewErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>window.__mlsOverviewErrors.push(String(e.reason?.message||e.reason)));</script>');
    results.push({minify,width,height,theme,...await browser('http://127.0.0.1:'+server.address().port+'/admin?tab=overview&month=2026-10',{width,height,theme,minify})});
   }
  }finally{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
 }
 if(output){
  writeFileSync(path.join(output,'composition.json'),JSON.stringify({schema:'mls_overview_composition_qa_v1',synthetic:true,mockup_parity_verified:false,owner_authenticated_qa:false,generated_hashes:generatedHashes,checks:results},null,2)+'\n');
  const rows=[];for(const minify of [false,true])for(const width of [320,1365]){const checks=results.filter(n=>n.minify===minify&&n.width===width);assert.equal(checks.length,2);rows.push({minify,width,pass:true,page_errors:0,horizontal_overflow:false,themes:checks.map(n=>n.theme),static_fallback_visible:checks.every(n=>n.staticFallback.visible),native_card_routes:6,navigation_history_tested:true,directory_search_preserved:true,financial_frame_unchanged:true});}
  writeFileSync(path.join(output,'overview-agents-restore-qa.json'),JSON.stringify({schema:'mls_overview_agents_restore_qa_v1',generated_hashes:generatedHashes,source:'LOCAL_SYNTHETIC_OWNER_WORKER_AND_BROWSER',overview_agents_visible:true,navigation_history_tested:true,financial_frame_unchanged:true,legacy_controls_preserved:true,remote_writes:0,owner_real_mutation_requests:0,new_provider_calls:0,results:rows},null,2)+'\n');
 }
});
