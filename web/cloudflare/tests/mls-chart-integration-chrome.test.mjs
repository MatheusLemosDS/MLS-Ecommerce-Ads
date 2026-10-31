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
const screenshotDirectory=process.env.MLS_CHART_SCREENSHOT_DIR||(process.env.MLS_APPROVED_SCREENSHOT_DIR?path.join(process.env.MLS_APPROVED_SCREENSHOT_DIR,'synthetic-populated-charts'):null);
async function dump(url,width,height,interact){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-charts-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--disable-background-networking','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const cleanup=createChromeProfileCleanup(child,profile);
 let socket;const pause=()=>new Promise(resolve=>setTimeout(resolve,75));
 try{
  const port=await waitForChromeDebugPort(child,profile);
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let seq=0;const pending=new Map();
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data),call=pending.get(data.id);if(!call)return;pending.delete(data.id);data.error?call.reject(Error(data.error.message)):call.resolve(data.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{
   const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
   if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;
  };
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});
  await send('Page.navigate',{url});
  let complete=false;
  for(let n=0;n<120;n++){if(await evaluate('!!(document.documentElement?.dataset.chartProof||document.documentElement?.dataset.chartError)')){complete=true;break;}await pause();}
  assert.equal(complete,true,'compiled chart fixture did not finish');
  const interaction=interact?await interact({send,evaluate,async capture(filename){
   if(!screenshotDirectory)return;
   const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   mkdirSync(screenshotDirectory,{recursive:true});writeFileSync(path.join(screenshotDirectory,filename),Buffer.from(result.data,'base64'));
  }}):null;
  return {html:await evaluate('document.documentElement.outerHTML'),interaction};
 }finally{await cleanup(socket);}
}

const fixture=()=>{
 const points=Array.from({length:14},(_,i)=>({date:'2026-10-'+String(i+15),state:i===5?'UNAVAILABLE':i===11?'PARTIAL_COSTS':'OPERATIONAL',
  partial:i===11||i===13,net_basis:i===5?null:i===11?'KNOWN_COSTS':'ESTIMATE',net_cents:i===5?null:(i-8)*100,
  sales_cents:i===5?null:i*200,ads_spend_cents:i===5?null:0,paid_orders:i===5?null:1,comparable:![5,11,13].includes(i)}));
 return {schema:'mls_mission_daily_trend_v1',month:'2026-10',selected_date:'2026-10-28',
  basis:'PAID_CREATE_DAY_AND_CALENDAR_ADS_OPERATIONAL_ESTIMATE',points};
};
async function inspectInteractions(cdp,{minify,width,height}){
 const checks=[];
 const readout=()=>cdp.evaluate(`(()=>{const h=document.getElementById('missionTrendGraphOverview'),r=h.querySelector('.mls-chart-readout'),m=h.querySelector('[data-mls-chart-selected=true]');return {active:h.dataset.mlsChartInspection==='active',hidden:!r||r.hidden,label:r?.querySelector('.mls-chart-readout-label')?.textContent??'',value:r?.querySelector('.mls-chart-readout-value')?.textContent??'',context:r?.querySelector('.mls-chart-readout-context')?.textContent??'',selected:m?.dataset.mlsChartDate??null,focused:document.activeElement?.dataset.mlsChartDate??null};})()`);
 const key=async value=>{await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:value,code:value});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:value,code:value});};
 for(const theme of ['dark','light']){
  await cdp.evaluate(`(()=>{const toggle=[...document.querySelectorAll('[data-braza-theme-toggle]')].find(n=>n.checkVisibility());for(let n=0;n<3&&document.documentElement.dataset.theme!==${JSON.stringify(theme)};n++)toggle.click();const window=document.querySelector('[data-mission-window=overview]');window.value='14';window.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-mission-chart=overview][data-mission-series=net]').click();document.getElementById('missionTrendGraphOverview').scrollIntoView({block:'center',behavior:'instant'});})()`);
  await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const initial=await cdp.evaluate(`(()=>{const h=document.getElementById('missionTrendGraphOverview'),marks=[...h.querySelectorAll('[data-mls-chart-mark]')];return {calls:__chartSynthetic.getCalls(),marks:marks.length,gap:marks.some(n=>n.dataset.mlsChartDate==='2026-10-20'),negative:marks.find(n=>n.dataset.mlsChartDate==='2026-10-15')?.dataset.mlsChartValue,zero:marks.find(n=>n.dataset.mlsChartDate==='2026-10-23')?.dataset.mlsChartValue,subtotal:marks.find(n=>n.dataset.mlsChartDate==='2026-10-26')?.dataset.mlsChartBasis};})()`);
  assert.deepEqual({...initial,calls:0},{calls:0,marks:13,gap:false,negative:'-R$ 8,00',zero:'R$ 0,00',subtotal:'KNOWN_COSTS'});
  const point=await cdp.evaluate(`(()=>{const n=document.querySelector('#missionTrendGraphOverview [data-mls-chart-date="2026-10-15"]'),r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,visible:r.top>=0&&r.bottom<=innerHeight};})()`);assert.equal(point.visible,true);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
  let selected=await readout();assert.equal(selected.active,true);assert.equal(selected.hidden,false);assert.equal(selected.label,'15/10/2026');assert.equal(selected.value,'-R$ 8,00');assert.match(selected.context,/Resultado estimado/);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:100});assert.equal((await readout()).hidden,true,'leaving an unfocused mark hides the readout');
  const gap=await cdp.evaluate(`(()=>{const a=document.querySelector('#missionTrendGraphOverview [data-mls-chart-date="2026-10-19"]').getBoundingClientRect(),b=document.querySelector('#missionTrendGraphOverview [data-mls-chart-date="2026-10-21"]').getBoundingClientRect();return {x:(a.x+a.width/2+b.x+b.width/2)/2,y:(a.y+a.height/2+b.y+b.height/2)/2};})()`);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:gap.x,y:gap.y});assert.equal((await readout()).hidden,true,'hovering the missing date does not invent a point');
  const column=await cdp.evaluate(`(()=>{const n=document.querySelector('#missionTrendGraphOverview [data-mls-chart-date="2026-10-23"]'),p=n.ownerSVGElement.createSVGPoint();p.x=Number(n.dataset.mlsChartX);p.y=(Number(n.dataset.mlsChartTop)+Number(n.dataset.mlsChartBottom))/2;const r=p.matrixTransform(n.ownerSVGElement.getScreenCTM());return {x:r.x,y:r.y};})()`);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:column.x,y:column.y});selected=await readout();assert.equal(selected.selected,'2026-10-23');assert.equal(selected.value,'R$ 0,00','a wider real-date column is inspectable away from its circle');
  await cdp.evaluate(`document.querySelector('#missionTrendGraphOverview [data-mls-chart-date="2026-10-15"]').focus()`);
  await key('ArrowRight');selected=await readout();assert.equal(selected.focused,'2026-10-16');assert.equal(selected.value,'-R$ 7,00');
  await key('End');selected=await readout();assert.equal(selected.focused,'2026-10-28');assert.equal(selected.value,'R$ 5,00');assert.match(selected.context,/Dia parcial/);
  await key('ArrowLeft');selected=await readout();assert.equal(selected.focused,'2026-10-27');assert.equal(selected.value,'R$ 4,00');
  await key('Home');assert.equal((await readout()).focused,'2026-10-15');
  await cdp.evaluate(`document.querySelector('#missionTrendGraphOverview [data-mls-chart-date="2026-10-19"]').focus()`);await key('ArrowRight');assert.equal((await readout()).focused,'2026-10-21','keyboard skips the absent observation');
  await cdp.evaluate(`document.querySelector('#missionTrendGraphOverview [data-mls-chart-date="2026-10-23"]').focus()`);selected=await readout();assert.equal(selected.value,'R$ 0,00');
  await cdp.evaluate(`document.querySelector('#missionTrendGraphOverview [data-mls-chart-date="2026-10-26"]').focus()`);selected=await readout();assert.equal(selected.value,'R$ 3,00');assert.match(selected.context,/Subtotal com custos conhecidos/);
  const beforeEscape=selected.focused;await key('Escape');selected=await readout();assert.equal(selected.active,false);assert.equal(selected.hidden,true);assert.equal(selected.focused,beforeEscape);
  // A real user moves away from the plot to activate these controls. Leaving
  // the pointer over a date column would legitimately inspect the new SVG.
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:100});
  await cdp.evaluate(`document.querySelector('#missionTrendGraphOverview [data-mls-chart-date="2026-10-26"]').blur();document.querySelector('[data-mission-chart=overview][data-mission-series=ads]').click()`);
  selected=await readout();assert.equal(selected.active,false);assert.equal(selected.hidden,true);
  await cdp.evaluate(`document.querySelector('#missionTrendGraphOverview [data-mls-chart-mark]').focus()`);selected=await readout();assert.equal(selected.value,'R$ 0,00');assert.match(selected.context,/Valor observado/);
  await cdp.evaluate(`(()=>{const select=document.querySelector('[data-mission-window=overview]');select.value='7';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  selected=await readout();assert.equal(selected.active,false);assert.equal(selected.hidden,true);assert.equal(await cdp.evaluate("document.querySelectorAll('#missionTrendGraphOverview [data-mls-chart-mark]').length"),7);
  await cdp.evaluate(`document.querySelector('#missionTrendGraphOverview [data-mls-chart-mark]').focus()`);await key('End');assert.equal((await readout()).selected,'2026-10-28');
  const controls=await cdp.evaluate(`(()=>{const h=document.getElementById('missionTrendsOverview'),controls=[...h.querySelectorAll('button,select')].filter(n=>n.checkVisibility());return controls.map(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height};});})()`);assert.ok(controls.length>=4);assert.ok(controls.every(r=>r.width>=44&&r.height>=44),'chart controls have usable touch targets');
  assert.equal(await cdp.evaluate('__chartSynthetic.getCalls()'),initial.calls,'inspection and controls do not fetch data');
  await cdp.evaluate(`document.querySelector('[data-mission-chart=overview][data-mission-series=net]').click();document.querySelector('#missionTrendGraphOverview [data-mls-chart-date="2026-10-26"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}))`);
  selected=await readout();assert.equal(selected.active,true);assert.equal(selected.value,'R$ 3,00');assert.match(selected.context,/Subtotal com custos conhecidos/);
  checks.push({synthetic:true,minify,width,height,theme,hover:true,keyboard:true,gap:null,zero:0,negative:-800,subtotal:'KNOWN_COSTS',new_fetches:0});
  await cdp.capture('synthetic-populated-'+(minify?'minified':'normal')+'-'+width+'-'+theme+'.png');
 }
 return checks;
}
test('compiled normal and minified owner charts filter actual windows and metrics without network',{timeout:120000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 for(const minify of [false,true]){
  let {html}=await compiledOwnerReportPage(minify,{ownerPreview:false});
  const script=`<script>(()=>{try{
   const fixture=${JSON.stringify(fixture())};let source=JSON.parse(JSON.stringify(fixture)),queue=null,calls=0;
   const original=globalThis.fetch;globalThis.fetch=(...args)=>{calls++;return original(...args);};
   globalThis.brazaDayDashboard={getTrend:()=>source};
   globalThis.brazaDtfWorkspace={getSnapshot:()=>queue};
   const graph=()=>document.getElementById('missionTrendGraphOverview');
   const count=()=>graph().querySelectorAll('circle').length;
   globalThis.mlsMissionTrends.refresh();
   const initial={count:count(),status:graph().dataset.chartStatus,source:graph().dataset.chartSource,
    values:document.querySelectorAll('#missionTrendValuesOverview tr').length,
    loss:!!graph().querySelector('circle[fill="#ff7899"]'),accessible:graph().querySelectorAll('circle[tabindex="0"]').length};
   const specialistHosts=()=>[...document.querySelectorAll('[data-mission-specialist-chart]')];
   const absent={slots:specialistHosts().length,svg:specialistHosts().reduce((sum,h)=>sum+h.querySelectorAll('svg').length,0),
    unavailable:specialistHosts().every(h=>h.dataset.chartStatus==='UNAVAILABLE'&&h.textContent.length>45)};
   queue={schema:'mls_agent_dtf_queue_v1',basis:'SAVED_DTF_LINES_NOT_PAID_ORDERS_OR_UNIT_COUNTS',line_count:10,
    pending_lines:4,reserved_lines:2,produced_lines:3,blocked_lines:1,batch_count:2};globalThis.mlsMissionTrends.refresh();
   const dtfHost=document.getElementById('missionChart-production-states');
   const dtf={svg:dtfHost.querySelectorAll('svg').length,segments:dtfHost.querySelectorAll('circle').length,
    status:dtfHost.dataset.chartStatus,source:dtfHost.dataset.chartSource,title:dtfHost.querySelector('svg title')?.textContent,
    otherSvg:specialistHosts().filter(h=>h!==dtfHost).reduce((sum,h)=>sum+h.querySelectorAll('svg').length,0),
    href:dtfHost.closest('section').querySelector('a')?.getAttribute('href')};
   queue.line_count=11;globalThis.mlsMissionTrends.refresh();
   const mismatch={svg:dtfHost.querySelectorAll('svg').length,status:dtfHost.dataset.chartStatus};
   queue.line_count=10;globalThis.mlsMissionTrends.refresh();queue=null;globalThis.mlsMissionTrends.refresh();
   const cleared={svg:dtfHost.querySelectorAll('svg').length,status:dtfHost.dataset.chartStatus};
   document.querySelector('[data-mission-chart="overview"][data-mission-series="ads"]').click();
   const ads={metric:graph().dataset.chartMetric,zeros:[...graph().querySelectorAll('circle')].every(p=>p.getAttribute('aria-label').includes('R$ 0,00'))};
   const select=document.querySelector('[data-mission-window="overview"]');select.value='7';select.dispatchEvent(new Event('change'));
   const seven={count:count(),values:document.querySelectorAll('#missionTrendValuesOverview tr').length,
    scope:document.getElementById('missionTrendScopeOverview').textContent};
   document.querySelector('[data-mission-chart="overview"][data-mission-series="sales"]').click();
   const sales={metric:graph().dataset.chartMetric,title:document.getElementById('missionTrendTitleOverview').textContent};
   source.points[0].date='2026-02-30';globalThis.mlsMissionTrends.refresh();
   const invalid={svg:graph().querySelectorAll('svg').length,values:document.querySelectorAll('#missionTrendValuesOverview tr').length,status:graph().dataset.chartStatus};
   source=JSON.parse(JSON.stringify(fixture));globalThis.mlsMissionTrends.refresh();globalThis.__chartSynthetic={getCalls:()=>calls};
   document.documentElement.dataset.chartProof=JSON.stringify({initial,absent,dtf,mismatch,cleared,ads,seven,sales,invalid,calls});
  }catch(e){document.documentElement.dataset.chartError=String(e.message||e);}})();</script>`;
  html=html.replace('<body>','<body><div style="position:fixed;right:8px;bottom:8px;z-index:99999;pointer-events:none;background:#0d2341;color:#e8f7ff;padding:6px;font:10px sans-serif">QA SINTÉTICA · GRÁFICOS POPULADOS · SEM DADOS REAIS</div>').replace('</body>',script+'</body>');
  const server=http.createServer((req,res)=>{res.writeHead(req.url.startsWith('/api/')?503:200,{'content-type':req.url.startsWith('/api/')?'application/json':'text/html; charset=utf-8'});res.end(req.url.startsWith('/api/')?'{}':html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
   for(const [width,height] of [[1365,900],[390,844]]){
    const {html:output,interaction}=await dump('http://127.0.0.1:'+server.address().port+'/admin?tab=overview',width,height,cdp=>inspectInteractions(cdp,{minify,width,height}));
    assert.doesNotMatch(output,/data-chart-error=/,'compiled chart script must execute');
    const match=/data-chart-proof="([^"]+)"/.exec(output);assert.ok(match,'chart proof not captured');
    const proof=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'));
    assert.deepEqual(proof.initial,{count:13,status:'PARTIAL',source:'mls_mission_daily_trend_v1',values:14,loss:true,accessible:13});
    assert.deepEqual(proof.absent,{slots:9,svg:0,unavailable:true});
    assert.deepEqual(proof.dtf,{svg:1,segments:4,status:'READY',source:'SAVED_DTF_LINES_NOT_PAID_ORDERS_OR_UNIT_COUNTS',title:'Linhas da fila por estado; 10 registros exclusivos verificados',otherSvg:0,href:'/admin?tab=production'});
    assert.deepEqual(proof.mismatch,{svg:0,status:'UNAVAILABLE'});
    assert.deepEqual(proof.cleared,{svg:0,status:'UNAVAILABLE'});
    assert.deepEqual(proof.ads,{metric:'ads',zeros:true});
    assert.equal(proof.seven.count,7);assert.equal(proof.seven.values,7);assert.match(proof.seven.scope,/22\/10 a 28\/10/);
    assert.equal(proof.sales.metric,'sales');assert.match(proof.sales.title,/Vendas dos pedidos pagos/);
    assert.deepEqual(proof.invalid,{svg:0,values:0,status:'UNAVAILABLE'});
    assert.equal(proof.calls,0,'chart controls only read already-saved observations');
    assert.equal(interaction.length,2);
   }
  }finally{await new Promise(resolve=>server.close(resolve));}
 }
});
