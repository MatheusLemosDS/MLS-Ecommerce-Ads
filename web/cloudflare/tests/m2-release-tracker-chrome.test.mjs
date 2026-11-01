import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {createChromeProfileCleanup} from './chrome-profile-cleanup.mjs';
import {waitForChromeDebugPort} from './chrome-debug-port.mjs';
import {projectEscrowReleaseFrame,projectEscrowReleaseCoverageFrame} from '../../finance/src/escrow-release-frame.mjs';
import {projectBusinessEscrowReleases} from '../src/business-escrow-releases.mjs';
import {projectBusinessEscrowReleaseCoverage} from '../src/business-escrow-release-coverage.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync),screenshots=process.env.MLS_RELEASE_TRACKER_SCREENSHOT_DIR||null;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(){
 const clock=Date.UTC(2026,10,10,15),at=clock/1000,month='2026-10',run='44444444-4444-4444-8444-444444444444',scan='55555555-5555-4555-8555-555555555555',from=Date.UTC(2026,9,1,3)/1000,cutoff=Date.UTC(2026,10,1,3)/1000;
 const source={run_id:run,source_revision:2,start_date:month+'-01',end_date:month+'-15',status:'AVAILABLE',orders:2,paid_orders:2,finance_oldest_at:at-1500,finance_latest_at:at-1400,expected_repass_cents:10000};
 const report={schema:'finance_escrow_releases_v1',month,checked_at:at-120,status:'PARTIAL',sources:[source],calendar:{scan_id:scan,status:'COMPLETE',from_at:from,end_before_at:cutoff,cutoff_at:cutoff,source_oldest_at:at-800,source_latest_at:at-790,observations:1,unique_orders:1,ambiguous_orders:0,verified_orders:1,unverified_orders:0,known_verified_release_cents:6000,total_release_cents:6000},collection:{scan_id:scan,status:'COMPLETE',cutoff_at:cutoff,windows_total:5,windows_complete:5,pages_read:5,observations:1,next_attempt_at:0,diagnostic:null},matching:{status:'AVAILABLE',paid_orders:2,located_paid_orders:1,unlocated_paid_orders:1,ambiguous_paid_orders:0,verified_paid_orders:1,known_expected_located_cents:5000,expected_located_cents:5000,known_verified_release_cents:6000,verified_release_cents:6000,comparison_difference_cents:1000,outside_cohort_orders:0},pending:['MATCHING_INCOMPLETE','BANK_RECEIPT_NOT_VERIFIED'],basis:'RELEASE_CALENDAR_AND_ORDER_CREATE_COHORT_NOT_BANK_RECEIPT'};
 const {status,...cohortSource}=source,cohort={publication_revision:7,start_date:month+'-01',end_date:month+'-15',sources:[cohortSource]},main={schema:'business_escrow_releases_v1',month,checked_at:at,status:'PARTIAL',cohort,report,attempt:{checked_at:at-100,status:'SUCCESS',code:null,next_attempt_at:at+900}},scope={publication_revision:7,start_date:cohort.start_date,end_date:cohort.end_date,sources:[{run_id:run,source_revision:2,start_date:source.start_date,end_date:source.end_date}]};
 const coverageReport={schema:'finance_escrow_release_coverage_v1',cohort_month:month,through_month:'2026-11',checked_at:at-60,status:'COLLECTING',sources:[source],calendars:[{month,status:'COMPLETE',scan_id:scan,cutoff_at:cutoff,source_oldest_at:at-800,source_latest_at:at-790,observations:1,cohort_observations:1,unique_cohort_orders:1,ambiguous_cohort_orders:0},{month:'2026-11',status:'MISSING',scan_id:null,cutoff_at:null,source_oldest_at:null,source_latest_at:null,observations:0,cohort_observations:0,unique_cohort_orders:0,ambiguous_cohort_orders:0}],coverage:{paid_orders:2,located_orders:1,not_located_orders:1,ambiguous_orders:0,single_orders:1,calendars_total:2,calendars_complete:1,identity_complete_at_cutoff:false},pending:['CALENDAR_MISSING','ORDER_NOT_LOCATED','BANK_RECEIPT_NOT_VERIFIED','RELEASE_CYCLE_SEMANTICS_UNVERIFIED'],basis:'SAVED_RELEASE_CALENDARS_AGAINST_PAID_ORDER_COHORT_NOT_BANK_RECEIPT'},coverage={schema:'business_escrow_release_coverage_v1',cohort_month:month,checked_at:at,status:'AVAILABLE',report:coverageReport,attempt:{checked_at:at-50,status:'SUCCESS',code:null,next_attempt_at:at+850}};
 assert.ok(projectEscrowReleaseFrame(report));assert.ok(projectBusinessEscrowReleases(main,projectEscrowReleaseFrame));assert.ok(projectEscrowReleaseCoverageFrame(coverageReport));assert.ok(projectBusinessEscrowReleaseCoverage(coverage,projectEscrowReleaseCoverageFrame));return {clock,main,scope,coverage};
}
async function browser(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-release-tracker-')),child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'}),cleanup=createChromeProfileCleanup(child,profile);let socket;
 try{
  const port=await waitForChromeDebugPort(child,profile),targetDeadline=performance.now()+15000;let page;
  // The debug port may precede the first page target on a busy runner. Wait
  // for this process's target without restarting Chrome or retrying the test.
  while(performance.now()<targetDeadline){
   if(child.exitCode!==null||child.signalCode!==null||child.killed)throw Error('CDP_PAGE_PROCESS_EXITED');
   const remaining=Math.max(1,Math.ceil(targetDeadline-performance.now()));
   try{
    const response=await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(remaining)});
    if(response.ok){const pages=await response.json();page=Array.isArray(pages)?pages.find(value=>value?.type==='page'&&typeof value.webSocketDebuggerUrl==='string'&&value.webSocketDebuggerUrl.length>0):null;if(page)break;}
   }catch{}
   const wait=targetDeadline-performance.now();if(wait>0)await pause(Math.min(50,wait));
  }
  if(!page)throw Error('CDP_PAGE_TARGET_TIMEOUT');
  socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP_OPEN_TIMEOUT')),10000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP_OPEN_ERROR'));},{once:true});});
  let sequence=0;const pending=new Map();socket.addEventListener('message',event=>{const value=JSON.parse(event.data),call=pending.get(value.id);if(!call)return;pending.delete(value.id);clearTimeout(call.timer);value.error?call.reject(Error(value.error.message)):call.resolve(value.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT:'+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});await send('Page.enable');await send('Runtime.enable');
  return {send,async evaluate(expression){const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value;},async capture(name){if(!screenshots)return;const value=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});mkdirSync(screenshots,{recursive:true});writeFileSync(path.join(screenshots,name),Buffer.from(value.data,'base64'));},close:()=>cleanup(socket)};
 }catch(error){await cleanup(socket);throw error;}
}
const read=`(()=>{const root=document.getElementById('businessEscrowReleasesCoverage'),snap=brazaEscrowReleases.getSnapshot();return {state:root.dataset.state,text:root.textContent,grid:root.querySelectorAll('.escrow-release-coverage-grid>div').length,calls:__trackerQA.calls(),network:__trackerQA.network(),coverage:snap?.coverage??null,mainMonth:snap?.month,closed:!document.getElementById('businessEscrowReleasesDetails').open,errors:__trackerErrors,overflow:document.documentElement.scrollWidth>innerWidth+2,net:document.getElementById('trackerSyntheticNet').textContent};})()`;
test('compiled release coverage displays calendar follow-up with current scope and no decorative collection',{timeout:150000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');const data=fixture();
 for(const minify of [false,true]){
  let {html}=await compiledOwnerReportPage(minify,{ownerPreview:false});html=html.replace('<head>','<head><script>globalThis.__trackerErrors=[];addEventListener("error",e=>__trackerErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>__trackerErrors.push(String(e.reason)));</script>').replace('<body>','<body><div style="position:fixed;bottom:8px;right:8px;z-index:99999;pointer-events:none;background:#13243d;color:#e8f5ff;padding:5px;font:10px sans-serif">QA SINTÉTICA · REPASSES · SEM DADOS REAIS</div>');
  const server=http.createServer((req,res)=>{const api=req.url.startsWith('/api/');res.writeHead(api?503:200,{'content-type':api?'application/json':'text/html; charset=utf-8','cache-control':'no-store'});res.end(api?'{"error":"SYNTHETIC_NO_REMOTE_API"}':html);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let cdp;
  try{
   cdp=await browser();
   for(const [width,height] of [[1365,900],[390,844]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/admin?tab=agent-finance'});let ready=false;
    for(let attempt=0;attempt<150;attempt++){if(await cdp.evaluate("document.readyState==='complete'&&!!globalThis.brazaEscrowReleases")){ready=true;break;}await pause(70);}assert.equal(ready,true,'compiled owner clients initialized');
    await cdp.evaluate(`(async()=>{
     for(const name of ['brazaMonthDashboard','brazaDayDashboard','brazaEscrowReleases','brazaIncomeOverview','brazaSavedCatalog','brazaProductionCostPeriods','brazaDtfWorkspace','mlsAgentRegistry','mlsAgentLearning'])try{globalThis[name]?.stop?.();}catch{}
     const data=${JSON.stringify(data)},SavedDate=Date;globalThis.Date=class extends SavedDate{constructor(...args){super(...(args.length?args:[data.clock]));}static now(){return data.clock;}};
     let mode='good',network=0;const calls=[];globalThis.fetch=async()=>{network++;throw Error('SYNTHETIC_NO_NETWORK');};
     const api=async path=>{calls.push(path);if(path==='finance/escrow-releases?month=2026-10&evidence=orders-v1')return structuredClone(data.main);if(path!=='finance/escrow-release-coverage?month=2026-10')throw Error('SYNTHETIC_UNEXPECTED_API');if(mode==='error')throw Error('PRIVATE_RESPONSE_MUST_NOT_APPEAR');const value=structuredClone(data.coverage);if(mode==='mismatch')value.report.sources[0].source_revision++;if(mode==='historical'){value.report.through_month='2026-10';value.report.calendars.pop();value.report.coverage.calendars_total=1;value.report.status='PARTIAL';value.report.pending=value.report.pending.filter(code=>code!=='CALENDAR_MISSING');}if(mode==='retry'){value.status='PARTIAL_UNAVAILABLE';value.attempt.status='UNAVAILABLE';value.attempt.code='FINANCE_ESCROW_RELEASES_TIMEOUT';}return value;};
     globalThis.__trackerQA={calls:()=>[...calls],network:()=>network,mode:value=>mode=value,data};const details=document.getElementById('businessEscrowReleasesDetails');details.open=false;brazaEscrowReleases.start({api});await brazaEscrowReleases.observe('2026-10',data.scope);
     const section=document.getElementById('agent-finance');document.querySelectorAll('main.workspace>section').forEach(node=>node.hidden=node!==section);section.hidden=false;const net=document.createElement('p');net.id='trackerSyntheticNet';net.textContent='Resultado demonstrativo preservado';section.append(net);
    })()`);
    let result=await cdp.evaluate(read);assert.equal(result.closed,true);assert.deepEqual(result.calls,['finance/escrow-releases?month=2026-10&evidence=orders-v1']);assert.equal(result.coverage,null);assert.equal(result.network,0);
    for(const theme of ['dark','light']){
     await cdp.evaluate(`(()=>{const toggle=[...document.querySelectorAll('[data-braza-theme-toggle]')].find(node=>node.checkVisibility());for(let n=0;n<3&&document.documentElement.dataset.theme!==${JSON.stringify(theme)};n++)toggle.click();__trackerQA.mode('good');const d=document.getElementById('businessEscrowReleasesDetails');if(!d.open)d.open=true;else void brazaEscrowReleases.refreshCoverage();})()`);await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');result=await cdp.evaluate(read);
     assert.equal(result.state,'CURRENT');assert.equal(result.grid,4);assert.match(result.text,/Acompanhamento automático dos repasses/);assert.match(result.text,/Calendários conferidos1 de 2/);assert.match(result.text,/Pedidos localizados1 de 2/);assert.match(result.text,/Ainda não localizados1/);assert.match(result.text,/11\/2026/);assert.match(result.text,/Última tentativa automática/);assert.match(result.text,/Próxima conferência programada/);assert.match(result.text,/recebimento bancário|lucro realizado/);assert.equal(result.coverage.report.coverage.identity_complete_at_cutoff,false);assert.equal(result.network,0);assert.equal(result.overflow,false);assert.equal(result.net,'Resultado demonstrativo preservado');assert.deepEqual(result.errors,[]);
     const count=result.calls.length;await cdp.evaluate('brazaEscrowReleases.refreshJoin();brazaEscrowReleases.getSnapshot();');assert.equal((await cdp.evaluate(read)).calls.length,count,'render only reuses saved evidence');
     await cdp.evaluate("document.getElementById('businessEscrowReleasesCoverage').scrollIntoView({block:'start',behavior:'instant'});scrollBy(0,-90)");await cdp.capture('release-followup-'+(minify?'minified':'normal')+'-'+width+'-'+theme+'.png');
     await cdp.evaluate("__trackerQA.mode('mismatch');brazaEscrowReleases.refreshCoverage()");await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');result=await cdp.evaluate(read);assert.equal(result.grid,0);assert.equal(result.coverage,null);assert.match(result.text,/publicação.*mudou/);
     await cdp.evaluate("__trackerQA.mode('historical');brazaEscrowReleases.refreshCoverage()");await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');result=await cdp.evaluate(read);assert.equal(result.state,'HISTORICAL');assert.match(result.text,/corte histórico até 10\/2026/);assert.match(result.text,/11\/2026 ainda precisa/);
     await cdp.evaluate("__trackerQA.mode('retry');brazaEscrowReleases.refreshCoverage()");await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');result=await cdp.evaluate(read);assert.equal(result.state,'RETRY_WAIT');assert.match(result.text,/último cruzamento válido/);assert.equal(result.coverage.report.checked_at,data.coverage.report.checked_at);
     await cdp.evaluate("__trackerQA.mode('error');brazaEscrowReleases.refreshCoverage()");await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');result=await cdp.evaluate(read);assert.match(result.text,/Não foi possível conferir/);assert.doesNotMatch(result.text,/PRIVATE_RESPONSE/);assert.equal(result.network,0);assert.deepEqual(result.errors,[]);assert.equal(result.net,'Resultado demonstrativo preservado');
    }
   }
  }finally{await cdp?.close();await new Promise(resolve=>server.close(resolve));}
 }
});
