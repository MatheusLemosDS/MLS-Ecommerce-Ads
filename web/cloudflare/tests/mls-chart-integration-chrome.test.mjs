import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,rmSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
async function dump(url,width,height){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-charts-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--disable-background-networking','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let socket;const pause=()=>new Promise(resolve=>setTimeout(resolve,75));
 try{
  let port=0;
  for(let n=0;n<100;n++){try{port=Number(readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}if(port)break;await pause();}
  assert.ok(port,'Chromium debug port not ready');
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let seq=0;const pending=new Map();
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data),call=pending.get(data.id);if(!call)return;pending.delete(data.id);data.error?call.reject(Error(data.error.message)):call.resolve(data.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{
   const result=await send('Runtime.evaluate',{expression,returnByValue:true});
   if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;
  };
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});
  await send('Page.navigate',{url});
  let complete=false;
  for(let n=0;n<120;n++){if(await evaluate('!!(document.documentElement?.dataset.chartProof||document.documentElement?.dataset.chartError)')){complete=true;break;}await pause();}
  assert.equal(complete,true,'compiled chart fixture did not finish');
  return await evaluate('document.documentElement.outerHTML');
 }finally{try{socket?.close();}catch{}child.kill('SIGKILL');rmSync(profile,{recursive:true,force:true});}
}

const fixture=()=>{
 const points=Array.from({length:14},(_,i)=>({date:'2026-10-'+String(i+15),state:i===5?'UNAVAILABLE':'OPERATIONAL',
  partial:i===13,net_basis:i===5?null:'ESTIMATE',net_cents:i===5?null:(i-8)*100,
  sales_cents:i===5?null:i*200,ads_spend_cents:i===5?null:0,paid_orders:i===5?null:1,comparable:i!==5&&i!==13}));
 return {schema:'mls_mission_daily_trend_v1',month:'2026-10',selected_date:'2026-10-28',
  basis:'PAID_CREATE_DAY_AND_CALENDAR_ADS_OPERATIONAL_ESTIMATE',points};
};
test('compiled normal and minified owner charts filter actual windows and metrics without network',{timeout:120000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 for(const minify of [false,true]){
  let {html}=await compiledOwnerReportPage(minify,{ownerPreview:false});
  const script=`<script>(()=>{try{
   let source=${JSON.stringify(fixture())},queue=null,calls=0;
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
   const ads={metric:graph().dataset.chartMetric,zeros:[...graph().querySelectorAll('circle')].every(p=>p.getAttribute('aria-label').includes('R$ 0.00'))};
   const select=document.querySelector('[data-mission-window="overview"]');select.value='7';select.dispatchEvent(new Event('change'));
   const seven={count:count(),values:document.querySelectorAll('#missionTrendValuesOverview tr').length,
    scope:document.getElementById('missionTrendScopeOverview').textContent};
   document.querySelector('[data-mission-chart="overview"][data-mission-series="sales"]').click();
   const sales={metric:graph().dataset.chartMetric,title:document.getElementById('missionTrendTitleOverview').textContent};
   source.points[0].date='2026-02-30';globalThis.mlsMissionTrends.refresh();
   const invalid={svg:graph().querySelectorAll('svg').length,values:document.querySelectorAll('#missionTrendValuesOverview tr').length,status:graph().dataset.chartStatus};
   document.documentElement.dataset.chartProof=JSON.stringify({initial,absent,dtf,mismatch,cleared,ads,seven,sales,invalid,calls});
  }catch(e){document.documentElement.dataset.chartError=String(e.message||e);}})();</script>`;
  html=html.replace('</body>',script+'</body>');
  const server=http.createServer((req,res)=>{res.writeHead(req.url.startsWith('/api/')?503:200,{'content-type':req.url.startsWith('/api/')?'application/json':'text/html; charset=utf-8'});res.end(req.url.startsWith('/api/')?'{}':html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
   for(const [width,height] of [[1365,900],[390,844]]){
    const output=await dump('http://127.0.0.1:'+server.address().port+'/admin?tab=overview',width,height);
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
   }
  }finally{await new Promise(resolve=>server.close(resolve));}
 }
});
