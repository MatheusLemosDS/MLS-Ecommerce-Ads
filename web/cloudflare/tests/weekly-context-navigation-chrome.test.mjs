import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import http from './browser-assets-http-fixture.mjs';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {receiptChrome,receiptBrowser,receiptClick,receiptPause} from './returns-receipts-chrome-helpers.mjs';
import {weeklyOperatingFixture} from './weekly-operating-fixture.mjs';
import {readWeeklyOperatingReport} from '../src/weekly-operating-store.mjs';
import {readProductionWeeklyClosingWorkspace} from '../src/production-weekly-store.mjs';
import {readIncurredProductionWorkspace} from '../src/incurred-production-workspace.mjs';
import {readProductionCoverageWorkspace} from '../src/production-coverage.mjs';
import {readBusinessMonthDisplay} from '../src/business-month.mjs';
import {buildBusinessMonthView} from '../src/business-month-view-state.mjs';

async function wait(cdp,expression,label){for(let n=0;n<180;n++){if(await cdp.evaluate(expression))return;await receiptPause(50);}assert.fail(label+' '+JSON.stringify(await cdp.evaluate('({url:location.href,panel:document.documentElement.dataset.activePanel,day:globalThis.brazaDayDashboard?.getSelection?.(),weekly:globalThis.brazaProductionWeeklyClosing?.getSelection?.(),report:globalThis.brazaWeeklyOperating?.getSnapshot?.()?.week_end,status:document.getElementById("productionWeeklyClosingStatus")?.textContent,errors:globalThis.__contextErrors})')));}
async function field(cdp,selector,value){await cdp.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
async function backToReport(cdp){for(let n=0;n<4;n++){if(await cdp.evaluate('document.documentElement.dataset.activePanel==="weekly-report"'))return;await cdp.evaluate('history.back()');await receiptPause(180);}await wait(cdp,'document.documentElement.dataset.activePanel==="weekly-report"','Back must restore report');}

for(const minify of [false,true])for(const width of [320,1365])test(`weekly source navigation applies exact day/month/cut and preserves drafts (${width}px,minify=${minify})`,{timeout:120000},async t=>{
 if(!receiptChrome)return t.skip('Chromium unavailable');
 const f=await weeklyOperatingFixture(),owner=await compiledOwnerReportPage(minify,{ownerPreview:true,localReadSnapshot:true}),cached=new Map(owner.localReadSnapshot.responses.map(row=>[row.path,row])),monthly=new Map(),requests=[],screens=process.env.MLS_V4_CONTEXT_SCREENSHOT_DIR||null;
 let serverError=null;
 for(const month of ['2026-09','2026-10'])monthly.set(month,buildBusinessMonthView(await readBusinessMonthDisplay(f.env,{month},{now:f.now}),{enabled:true,status:'COMPLETE',next_run_at:f.now()/1000+60,last_attempt_at:f.now()/1000-5},{now:f.now,contract:'business-month-view-v5'}));
 const html=owner.html.replace('<head>','<head><script>const ContextRealDate=Date;globalThis.Date=class extends ContextRealDate{constructor(...args){super(...(args.length?args:['+f.now()+']));}static now(){return '+f.now()+';}};globalThis.__contextErrors=[];addEventListener("error",e=>__contextErrors.push(e.message));addEventListener("unhandledrejection",e=>__contextErrors.push(String(e.reason?.message||e.reason)));</script>');
 const before=f.snapshot(),sourceCalls=JSON.stringify(f.calls);
 const server=http.createServer(async(req,res)=>{try{
  if(!req.url.startsWith('/api/')){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);return;}
  requests.push(req.method+' '+req.url);assert.equal(req.method,'GET','source navigation is read-only');const url=new URL(req.url,'http://synthetic.test'),headers={'content-type':'application/json','cache-control':'no-store'};let data=null;
  if(url.pathname==='/api/admin/reports/weekly')data=await readWeeklyOperatingReport(f.env,{week_end:url.searchParams.get('week_end')},f.services,{now:f.now});
  else if(url.pathname==='/api/admin/production/weekly-closing')data=await readProductionWeeklyClosingWorkspace(f.env,{month:url.searchParams.get('month')},{now:f.now});
  else if(url.pathname==='/api/admin/production/incurred')data=await readIncurredProductionWorkspace(f.env,{month:url.searchParams.get('month'),week_of:url.searchParams.get('week_of')},{now:f.now});
  else if(url.pathname==='/api/admin/production/coverage')data=await readProductionCoverageWorkspace(f.env,{week_end:url.searchParams.get('week_end')},{now:f.now});
  else if(url.pathname==='/api/admin/finance/business-month-view'){data=monthly.get(url.searchParams.get('month'));headers['x-braza-client-contract']='business-month-view-v5';}
  else{const prior=cached.get(req.url);if(prior){data=prior.body;if(prior.contract)headers['x-braza-client-contract']=prior.contract;}}
  res.writeHead(data?200:503,headers);res.end(JSON.stringify(data||{error:'SYNTHETIC_OPTIONAL_SOURCE_UNAVAILABLE'}));
 }catch(error){serverError=error.message;res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"SYNTHETIC_CONTEXT_SOURCE_ERROR"}');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let cdp;
 try{
  cdp=await receiptBrowser();await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===320});await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/admin?tab=weekly-report&month=2026-10'});
  await wait(cdp,'globalThis.brazaWeeklyOperating?.getSnapshot?.()&&globalThis.brazaDayDashboard','compiled report initializes');
  await field(cdp,'#weeklyOperatingWeekEnd','2026-10-02');await receiptClick(cdp,'#weeklyOperatingApply');await wait(cdp,'brazaWeeklyOperating.getSnapshot()?.week_end==="2026-10-02"','cross-month report applies');
  await receiptClick(cdp,'#weeklyOperatingSalesChart button[data-weekly-index="0"]');
  await receiptClick(cdp,'#weeklyOperatingSalesLinks a:first-child');
  await wait(cdp,'document.documentElement.dataset.activePanel==="agent-finance"&&brazaDayDashboard.getSelection()==="2026-09-25"&&brazaMonthDashboard.getSnapshot()?.month==="2026-09"','sales navigation must apply September25 in September');
  const day=await cdp.evaluate('({date:brazaDayDashboard.getSelection(),month:new URL(location.href).searchParams.get("month"),urlDate:new URL(location.href).searchParams.get("date")})');assert.deepEqual(day,{date:'2026-09-25',month:'2026-09',urlDate:'2026-09-25'});
  await backToReport(cdp);assert.equal(await cdp.evaluate('brazaWeeklyOperating.getSnapshot()?.week_end'),'2026-10-02');
  await receiptClick(cdp,'#weeklyOperatingManufacturingLinks a:nth-child(2)');
  await wait(cdp,'document.documentElement.dataset.activePanel==="agent-production"&&brazaProductionWeeklyClosing.getSelection()?.month==="2026-10"&&brazaProductionWeeklyClosing.getSelection()?.week_end==="2026-10-02"','manufacturing navigation must select October02 cutoff');
  await receiptClick(cdp,'#agent-production .mission-page-tabs a[href="#incurredProductionRecordsPane"]');await wait(cdp,'!!document.querySelector("#incurredProductionForm [name=production_ref]")&&!document.querySelector("#incurredProductionForm [name=production_ref]").disabled','physical draft editor loads');
  await field(cdp,'#incurredProductionForm [name=production_ref]','Rascunho sintético preservado pelo relatório');await backToReport(cdp);await receiptClick(cdp,'#weeklyOperatingManufacturingLinks a:nth-child(2)');
  await wait(cdp,'brazaProductionWeeklyClosing.getSelection()?.week_end==="2026-10-02"','return navigation keeps selected cutoff');assert.equal(await cdp.evaluate('document.querySelector("#incurredProductionForm [name=production_ref]").value'),'Rascunho sintético preservado pelo relatório');
  for(const theme of ['light','dark']){await cdp.evaluate(`(()=>{const n=[...document.querySelectorAll('[data-braza-theme-toggle]')].find(n=>n.checkVisibility());for(let i=0;i<3&&document.documentElement.dataset.theme!==${JSON.stringify(theme)};i++)n.click();})()`);assert.equal(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);if(screens){mkdirSync(screens,{recursive:true});const image=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});writeFileSync(path.join(screens,(minify?'min':'normal')+'-'+width+'-'+theme+'-weekly-context.png'),Buffer.from(image.data,'base64'));}}
  assert.equal(serverError,null);assert.deepEqual(await cdp.evaluate('__contextErrors'),[]);assert.equal(f.snapshot(),before);assert.equal(JSON.stringify(f.calls),sourceCalls);assert.ok(requests.some(value=>value.includes('production/weekly-closing?month=2026-10')));
 }finally{await cdp?.close();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));f.close();}
});
