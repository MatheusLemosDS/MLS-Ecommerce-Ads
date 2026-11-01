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
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {projectMissionAdsSnapshot} from '../src/mls-ads-performance.mjs';
import {completeWorkspaceFrame,workspaceView} from './monthly-workspace-browser-fixture.mjs';
import {learningEnv,learningFrame,learningPublication} from './mls-agent-learning-fixture.mjs';
import {recordMlsAgentLearningObservation,readMlsAgentLearning} from '../src/mls-agent-learning.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const screenshotDirectory=process.env.MLS_ROAS_SCREENSHOT_DIR||null;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(){
 const month='2026-10',at=Date.UTC(2026,9,25,15)/1000,children=[];
 for(const [first,last] of [[1,15],[16,25]]){
  const period={start_date:month+'-'+String(first).padStart(2,'0'),end_date:month+'-'+last};
  children.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period,balance:0,daily:Array.from({length:last-first+1},(_,i)=>{const day=first+i;return {date:month+'-'+String(day).padStart(2,'0'),expense:day===20?'0':'10',broad_gmv:day===20||day===21?'0':day===23?'30':day===24?'60':day===25?'1000':'20',broad_order:1,direct_gmv:0,direct_order:0};})},period,at));
 }
 const selection={start_date:month+'-01',end_date:month+'-25'},calendar=buildAdsCalendar(children,selection,at),ads=projectMissionAdsSnapshot({schema:'business_month_v1',month,...selection,checked_at:at,ads:calendar});assert.ok(ads);
 const frame=completeWorkspaceFrame({at});frame.ads=calendar;const view=workspaceView(frame);
 const trend={schema:'mls_mission_daily_trend_v1',month,selected_date:month+'-25',basis:'PAID_CREATE_DAY_AND_CALENDAR_ADS_OPERATIONAL_ESTIMATE',points:Array.from({length:14},(_,i)=>({date:month+'-'+String(i+12),state:'OPERATIONAL',partial:i===13,net_basis:'ESTIMATE',net_cents:-1000+i*50,sales_cents:10000+i*100,ads_spend_cents:1000,paid_orders:1,comparable:i!==13}))};
 const day={schema:'mls_day_snapshot_v1',date:month+'-25',state:'READY',net_cents:-350,net_basis:'ESTIMATE',sales_cents:11300,ads_spend_cents:1000,paid_orders:1,pending:[]};
 return {ads,trend,day,view};
}
async function browser(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-roas-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const cleanup=createChromeProfileCleanup(child,profile);let socket;
 try{
  const port=await waitForChromeDebugPort(child,profile),pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP_OPEN_TIMEOUT')),10000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP_OPEN_ERROR'));},{once:true});});
  let sequence=0;const pending=new Map();
  socket.addEventListener('message',event=>{const value=JSON.parse(event.data),call=pending.get(value.id);if(!call)return;pending.delete(value.id);clearTimeout(call.timer);value.error?call.reject(Error(value.error.message)):call.resolve(value.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT:'+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  await send('Page.enable');await send('Runtime.enable');
  return {send,async evaluate(expression){const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value;},async capture(name){if(!screenshotDirectory)return;const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});mkdirSync(screenshotDirectory,{recursive:true});writeFileSync(path.join(screenshotDirectory,name),Buffer.from(result.data,'base64'));},close:()=>cleanup(socket)};
 }catch(error){await cleanup(socket);throw error;}
}
const read=`(()=>{const g=document.getElementById('missionTrendGraphOverview'),delta=document.getElementById('missionKpiDeltaRoas'),profit=document.getElementById('missionProfitState');return {cards:document.querySelectorAll('#commandCenter>.command-center-metrics>.command-metric').length,roas:document.getElementById('commandCenterRoas').textContent,scope:document.getElementById('missionRoasScope').textContent,help:document.getElementById('missionRoasValueHelp').textContent,delta:{direction:delta.dataset.direction,text:delta.textContent},profit:{tone:profit.dataset.tone,text:profit.textContent,delta:document.getElementById('missionKpiDeltaNet').dataset.direction},graph:{status:g.dataset.chartStatus,metric:g.dataset.chartMetric,source:g.dataset.chartSource,svg:g.querySelectorAll('svg').length,text:g.textContent,dates:[...g.querySelectorAll('[data-mls-chart-mark]')].map(n=>n.dataset.mlsChartDate),values:[...g.querySelectorAll('[data-mls-chart-mark]')].map(n=>n.dataset.mlsChartValue)},note:document.getElementById('missionTrendNoteOverview').textContent,window:document.getElementById('missionTrendScopeOverview').textContent,calls:__roasQA.calls(),errors:__roasErrors,viewport:{inner:innerWidth,scroll:document.documentElement.scrollWidth}};})()`;

test('compiled ROAS and financial arrows preserve the six-card design, attribution and unknown gaps without source requests',{timeout:150000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');const f=fixture();
 for(const minify of [false,true]){
  let {html}=await compiledOwnerReportPage(minify,{ownerPreview:false});
  html=html.replace('<head>','<head><script>const RoasFixtureDate=Date;globalThis.Date=class extends RoasFixtureDate{constructor(...args){super(...(args.length?args:['+JSON.stringify(f.ads.checked_at*1000)+']));}static now(){return '+JSON.stringify(f.ads.checked_at*1000)+';}};globalThis.__roasErrors=[];addEventListener("error",e=>__roasErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>__roasErrors.push(String(e.reason)));</script>').replace('<body>','<body><div style="position:fixed;bottom:8px;right:8px;pointer-events:none;z-index:99999;background:#13243d;color:#e8f5ff;padding:5px;font:10px sans-serif">QA SINTÉTICA · ROAS E RESULTADO · SEM DADOS REAIS</div>');
  const server=http.createServer((req,res)=>{const api=req.url.startsWith('/api/');res.writeHead(api?503:200,{'content-type':api?'application/json':'text/html; charset=utf-8','cache-control':'no-store'});res.end(api?'{"error":"SYNTHETIC_NO_REMOTE_API"}':html);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let cdp;
  try{
   cdp=await browser();
   for(const [width,height] of [[1365,900],[390,844]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/admin?tab=overview'});
    let ready=false;for(let n=0;n<150;n++){if(await cdp.evaluate("document.readyState==='complete'&&!!globalThis.mlsAgentRegistry&&!!globalThis.mlsMissionTrends")){ready=true;break;}await pause(70);}assert.equal(ready,true,'compiled owner clients initialized');
    await cdp.evaluate(`(async()=>{
     const value=${JSON.stringify(f)};let ads=structuredClone(value.ads),calls=0;
     for(const name of ['brazaMonthDashboard','brazaDayDashboard','brazaEscrowReleases','brazaIncomeOverview','brazaSavedCatalog','brazaProductionCostPeriods','brazaDtfWorkspace'])try{globalThis[name]?.stop?.();}catch{}mlsAgentRegistry.stop();
     const actualMonth=globalThis.brazaMonthDashboard,localCalls=[];
     await actualMonth.start({api:async path=>{localCalls.push(path);if(path.startsWith('finance/business-month-view?month=2026-10'))return structuredClone(value.view);if(path.startsWith('finance/business-month-view?month=2026-09'))return new Promise(()=>{});throw Error('SYNTHETIC_UNOPENED_SOURCE');}});
     const projected=actualMonth.getAdsSnapshot();if(!projected||projected.calculated_roas_raw!==value.ads.calculated_roas_raw||!Object.isFrozen(projected)||!Object.isFrozen(projected.days))throw Error('COMPILED_ADS_ACCESSOR_INVALID');
     actualMonth.selectMonth('2026-09');if(actualMonth.getAdsSnapshot()!==null)throw Error('COMPILED_ADS_ACCESSOR_RETAINS_OTHER_MONTH');actualMonth.stop();
     globalThis.brazaMonthDashboard={...globalThis.brazaMonthDashboard,getAdsSnapshot:()=>ads,getSnapshot:()=>null};globalThis.brazaDayDashboard={...globalThis.brazaDayDashboard,getTrend:()=>value.trend,getSnapshot:()=>value.day};
     const originalFetch=globalThis.fetch;globalThis.fetch=(...args)=>{calls++;return originalFetch(...args);};
     globalThis.__roasQA={calls:()=>calls,load(name){ads=name==='missing'?null:structuredClone(value.ads);if(name==='mismatch')ads.days[23].attributed_sales_cents++;if(name==='zero'){ads.status='AVAILABLE';ads.expense_cents=0;ads.attributed_sales_cents=0;ads.calculated_roas_raw=null;for(const d of ads.days){d.expense_cents=0;d.attributed_sales_cents=0;d.calculated_roas_raw=null;}}mlsAgentRegistry.refresh();mlsMissionTrends.refresh();}};__roasQA.load('normal');
     const overview=document.getElementById('overview');document.querySelectorAll('main.workspace>section').forEach(node=>node.hidden=node!==overview);overview.hidden=false;
    })()`);
    for(const theme of ['dark','light']){
     await cdp.evaluate(`(()=>{const toggle=[...document.querySelectorAll('[data-braza-theme-toggle]')].find(n=>n.checkVisibility());for(let n=0;n<3&&document.documentElement.dataset.theme!==${JSON.stringify(theme)};n++)toggle.click();__roasQA.load('normal');const w=document.querySelector('[data-mission-window=overview]');w.value='14';w.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-mission-chart=overview][data-mission-series=roas]').click();})()`);
     await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');let result=await cdp.evaluate(read);
     assert.equal(result.cards,6);assert.match(result.roas,/\d+,\d{2}x/);assert.match(result.scope,/01\/10 a 25\/10.*parcial/);assert.match(result.help,/atribuídas.*não comprova lucro/);assert.equal(result.delta.direction,'UP');assert.match(result.delta.text,/\+3,00x.*24\/10 vs 23\/10/,'partial Oct25 is excluded from complete-day comparison');assert.equal(result.profit.tone,'loss');assert.match(result.profit.text,/Prejuízo estimado/);assert.equal(result.profit.delta,'UP','a smaller loss is still negative even with an up arrow');
     assert.equal(result.graph.metric,'roas');assert.equal(result.graph.source,'mls_month_ads_snapshot_v1');assert.equal(result.graph.status,'PARTIAL');assert.equal(result.graph.svg,1);assert.ok(!result.graph.dates.includes('2026-10-20'),'zero expenditure creates a ratio gap');assert.ok(result.graph.values.includes('0,00x'),'known zero attributed sales with positive expense remains zero ROAS');assert.ok(result.graph.values.every(value=>value.endsWith('x')));assert.doesNotMatch(result.graph.text,/R\$/);assert.match(result.note,/atribuição ampla.*Fuso da fonte não confirmado/);assert.equal(result.viewport.inner,width);assert.ok(result.viewport.scroll<=width+2,'no horizontal page overflow');
     const calls=result.calls;
     await cdp.evaluate("document.getElementById('commandCenter').scrollIntoView({block:'start',behavior:'instant'})");await cdp.capture('roas-overview-'+(minify?'minified':'normal')+'-'+width+'-'+theme+'.png');
     await cdp.evaluate("document.getElementById('missionTrendGraphOverview').scrollIntoView({block:'center',behavior:'instant'})");
     await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
     const mark=await cdp.evaluate(`(()=>{const n=document.querySelector('#missionTrendGraphOverview [data-mls-chart-date=\"2026-10-24\"]'),r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:mark.x,y:mark.y});
     const inspection=await cdp.evaluate(`(()=>{const h=document.getElementById('missionTrendGraphOverview'),r=h.querySelector('.mls-chart-readout');return {visible:!r.hidden,label:r.querySelector('.mls-chart-readout-label').textContent,value:r.querySelector('.mls-chart-readout-value').textContent,context:r.querySelector('.mls-chart-readout-context').textContent};})()`);assert.equal(inspection.visible,true,JSON.stringify(inspection));assert.equal(inspection.label,'24/10/2026');assert.equal(inspection.value,'6,00x');assert.match(inspection.context,/ROAS|atribui/i);await cdp.capture('roas-chart-'+(minify?'minified':'normal')+'-'+width+'-'+theme+'.png');
     await cdp.evaluate("(()=>{const w=document.querySelector('[data-mission-window=overview]');w.value='7';w.dispatchEvent(new Event('change',{bubbles:true}));})()");result=await cdp.evaluate(read);assert.match(result.window,/19\/10 a 25\/10/);assert.equal(result.graph.dates.length,6);assert.equal(result.calls,calls);
     await cdp.evaluate("__roasQA.load('mismatch')");result=await cdp.evaluate(read);assert.equal(result.graph.svg,0);assert.equal(result.graph.status,'UNAVAILABLE');assert.equal(result.delta.direction,'UNAVAILABLE');
     await cdp.evaluate("__roasQA.load('zero')");result=await cdp.evaluate(read);assert.equal(result.graph.svg,0);assert.equal(result.graph.status,'UNAVAILABLE');assert.ok(['Sem gasto','—'].includes(result.roas));assert.equal(result.delta.direction,'UNAVAILABLE');
     await cdp.evaluate("__roasQA.load('missing')");result=await cdp.evaluate(read);assert.equal(result.roas,'—');assert.equal(result.graph.svg,0);assert.equal(result.delta.direction,'UNAVAILABLE');assert.equal(result.calls,calls);assert.deepEqual(result.errors,[]);
    }
   }
  }finally{await cdp?.close();await new Promise(resolve=>server.close(resolve));}
 }
});

test('compiled Hermes memory reads on opening, labels old evidence and invalidates month, pending responses and logout',{timeout:150000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 const env=await learningEnv(t),at=Date.UTC(2026,9,25,15),readClock=Date.UTC(2026,9,31,12),frame=learningFrame({end_date:'2026-10-25',at:at/1000});learningPublication(env,frame,1);
 assert.equal((await recordMlsAgentLearningObservation(env,{frame,publication_revision:1},{now:()=>at})).status,'RECORDED');
 const report=await readMlsAgentLearning(env,{month:'2026-10'},{now:()=>readClock});assert.equal(report.status,'STALE');assert.equal(report.evidence.independent_financial_comparisons,0);
 for(const minify of [false,true]){
  let {html}=await compiledOwnerReportPage(minify,{ownerPreview:false});html=html.replace('<head>','<head><script>globalThis.__learningErrors=[];addEventListener("error",e=>__learningErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>__learningErrors.push(String(e.reason)));</script>').replace('<body>','<body><div style="position:fixed;bottom:8px;right:8px;pointer-events:none;z-index:99999;background:#13243d;color:#e8f5ff;padding:5px;font:10px sans-serif">QA SINTÉTICA · MEMÓRIA · SEM DADOS REAIS</div>');
  const server=http.createServer((req,res)=>{const api=req.url.startsWith('/api/');res.writeHead(api?503:200,{'content-type':api?'application/json':'text/html; charset=utf-8','cache-control':'no-store'});res.end(api?'{"error":"SYNTHETIC_NO_REMOTE_API"}':html);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let cdp;
  try{
   cdp=await browser();
   for(const [width,height] of [[1365,900],[390,844]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/admin?tab=agent-hermes'});
    let ready=false;for(let n=0;n<150;n++){if(await cdp.evaluate("document.readyState==='complete'&&!!globalThis.mlsAgentLearning")){ready=true;break;}await pause(70);}assert.equal(ready,true,'compiled learning client initialized');
    await cdp.evaluate(`(()=>{
     const report=${JSON.stringify(report)};let context={month:'2026-10',checked_at:${readClock/1000}},mode='good',calls=[],network=0,resolvePending=null;
     for(const name of ['brazaMonthDashboard','brazaDayDashboard','brazaEscrowReleases','brazaIncomeOverview','brazaSavedCatalog','brazaProductionCostPeriods','brazaDtfWorkspace'])try{globalThis[name]?.stop?.();}catch{}mlsAgentRegistry.stop();mlsAgentLearning.stop();
     const root=document.getElementById('mlsAgentLearning');root.open=false;globalThis.brazaMonthDashboard={...globalThis.brazaMonthDashboard,getSnapshot:()=>context};
     const original=globalThis.fetch;globalThis.fetch=(...args)=>{network++;return original(...args);};
     const api=async path=>{calls.push(path);if(mode==='unauthorized')throw Object.assign(Error('PRIVATE_AUTH_DETAIL'),{status:401});if(mode==='deferred')return new Promise(resolve=>resolvePending=resolve);return structuredClone(report);};
     globalThis.__learningQA={calls:()=>[...calls],network:()=>network,setMode:value=>mode=value,context(month){context={month,checked_at:context.checked_at+1};mlsAgentLearning.refreshContext();},resolve(){resolvePending?.(structuredClone(report));},report,root,restart(){mlsAgentLearning.start({api});}};
     mlsAgentLearning.start({api});const tab=document.getElementById('agent-hermes');document.querySelectorAll('main.workspace>section').forEach(node=>node.hidden=node!==tab);tab.hidden=false;
    })()`);
    const view=`(()=>{const r=document.getElementById('mlsAgentLearning');return {calls:__learningQA.calls(),network:__learningQA.network(),snapshot:mlsAgentLearning.getSnapshot(),status:document.getElementById('mlsLearningStatus').textContent,state:document.getElementById('mlsLearningStatus').dataset.state,metrics:document.getElementById('mlsLearningMetrics').children.length,lessons:document.getElementById('mlsLearningLessons').children.length,text:r.textContent,login:!document.getElementById('mlsLearningLogin').hidden,overflow:document.documentElement.scrollWidth>innerWidth+2,errors:__learningErrors};})()`;
    let result=await cdp.evaluate(view);assert.deepEqual(result.calls,[]);assert.equal(result.network,0);assert.equal(result.snapshot,null);
    for(const theme of ['dark','light']){
     await cdp.evaluate(`(()=>{const toggle=[...document.querySelectorAll('[data-braza-theme-toggle]')].find(n=>n.checkVisibility());for(let n=0;n<3&&document.documentElement.dataset.theme!==${JSON.stringify(theme)};n++)toggle.click();__learningQA.setMode('good');__learningQA.context('2026-10');if(!__learningQA.root.open)__learningQA.root.open=true;else document.getElementById('mlsLearningReload').click();})()`);await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');result=await cdp.evaluate(view);
     assert.ok(result.calls.every(path=>path==='agents/learning?month=2026-10'));assert.equal(result.network,0);assert.equal(result.snapshot.status,'STALE');assert.equal(result.state,'stale');assert.match(result.status,/evidência antiga/);assert.equal(result.metrics,4);assert.ok(result.lessons>=1);assert.match(result.text,/Sem avaliador de resultados de ações/);assert.equal(result.snapshot.autonomy.model_training,false);assert.equal(result.snapshot.autonomy.commercial_write_allowed,false);assert.equal(result.overflow,false);
     await cdp.evaluate("document.getElementById('mlsAgentLearning').scrollIntoView({block:'start',behavior:'instant'})");await cdp.capture('hermes-memory-'+(minify?'minified':'normal')+'-'+width+'-'+theme+'.png');
     const before=result.calls.length;await cdp.evaluate("mlsAgentLearning.refreshContext();mlsMissionTrends.refresh();mlsAgentRegistry.refresh()");result=await cdp.evaluate(view);assert.equal(result.calls.length,before,'render and stable context do not poll');
     await cdp.evaluate("__learningQA.setMode('deferred');document.getElementById('mlsLearningReload').click()");await cdp.evaluate("__learningQA.context('2026-09');__learningQA.resolve()");await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');result=await cdp.evaluate(view);assert.equal(result.snapshot,null);assert.equal(result.metrics,0);assert.match(result.status,/09\/2026/,'late October response cannot enter September');
     await cdp.evaluate("__learningQA.context('2026-10');__learningQA.setMode('unauthorized');document.getElementById('mlsLearningReload').click()");await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');result=await cdp.evaluate(view);assert.equal(result.login,true,JSON.stringify({status:result.status,calls:result.calls,state:result.state}));assert.equal(result.snapshot,null);assert.doesNotMatch(result.text,/PRIVATE_AUTH_DETAIL/);
     await cdp.evaluate("__learningQA.setMode('deferred');document.getElementById('mlsLearningReload').click();mlsAgentLearning.stop();__learningQA.resolve()");await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');result=await cdp.evaluate(view);assert.equal(result.snapshot,null);assert.equal(result.metrics,0);assert.equal(result.lessons,0);assert.match(result.status,/Entre novamente/);assert.equal(result.network,0);assert.deepEqual(result.errors,[]);
     await cdp.evaluate("__learningQA.root.open=false;__learningQA.restart()");await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');
    }
   }
  }finally{await cdp?.close();await new Promise(resolve=>server.close(resolve));}
 }
});
