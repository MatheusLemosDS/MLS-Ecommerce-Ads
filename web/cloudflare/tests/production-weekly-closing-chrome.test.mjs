import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {receiptChrome,receiptBrowser,receiptClick,receiptPause} from './returns-receipts-chrome-helpers.mjs';
import {weeklyProductionFixture,weeklyProductionClock} from './production-weekly-browser-fixture.mjs';

const results=[],qaFile=process.env.MLS_PRODUCTION_WEEKLY_QA_FILE||null,screens=process.env.MLS_PRODUCTION_WEEKLY_SCREENSHOT_DIR||null;
const workerHashes=()=>Object.fromEntries(['app','auth','finance'].map(name=>[name,createHash('sha256').update(readFileSync(new URL('../../../dist/'+name+'-worker.mjs',import.meta.url))).digest('hex')]));
let frozenWorkers=null;
async function wait(cdp,expression,label){
 for(let turn=0;turn<180;turn++){if(await cdp.evaluate(expression))return;await receiptPause(50);}
 assert.fail(label+' '+JSON.stringify(await cdp.evaluate("({errors:globalThis.__weeklyErrors,status:document.getElementById('productionWeeklyClosingStatus')?.textContent,revision:globalThis.brazaProductionWeeklyClosing?.getSnapshot?.()?.revision,active:document.documentElement.dataset.activePanel})")));
}
async function setField(cdp,selector,next,event='input'){
 await cdp.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)throw Error('WEEKLY_QA_FIELD_MISSING:'+${JSON.stringify(selector)});if(n.type==='checkbox')n.checked=${JSON.stringify(next)};else Object.getOwnPropertyDescriptor(n.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(next)});n.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`);
}
async function visibleBounds(cdp){
 const rows=await cdp.evaluate("(()=>{return [...document.querySelectorAll('#productionWeeklyClosingCurrent,#productionWeeklyClosingLast,#productionWeeklyClosingSelected,#productionWeeklyClosingPending,#productionWeeklyClosingHistory')].filter(n=>n.checkVisibility({checkVisibilityCSS:true})).map(n=>{const r=n.getBoundingClientRect();return {id:n.id,left:r.left,right:r.right,client:n.clientWidth,scroll:n.scrollWidth};});})()");
 assert.ok(rows.length>=3,'weekly costs must have visible responsive cards');const width=await cdp.evaluate('innerWidth');
 for(const row of rows){assert.ok(row.left>=-2&&row.right<=width+2,JSON.stringify(row));assert.ok(row.scroll<=row.client+2,JSON.stringify(row));}
 assert.equal(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'weekly views must not create horizontal page overflow');return rows;
}
async function selectWeek(cdp,end_date){await setField(cdp,'#productionWeeklyClosingWeek',end_date,'change');await wait(cdp,`document.getElementById('productionWeeklyClosingWeek').value===${JSON.stringify(end_date)}`,'week selection must remain local');}

for(const minify of [false,true])for(const width of [320,1365])test(`compiled weekly manufacture close, immutable adjustments and cutoff confirmation (${width}px,minify=${minify})`,{timeout:150000},async t=>{
 if(!receiptChrome)return t.skip('Chromium unavailable');const hashes=workerHashes();if(frozenWorkers)assert.deepEqual(hashes,frozenWorkers);else frozenWorkers=hashes;
 const fixture=await weeklyProductionFixture(),canonicalBefore=await fixture.snapshot(),originalBefore=JSON.stringify(fixture.original),financeBefore=fixture.finance.financialSnapshot,providerBefore=fixture.finance.providerCalls();
 const owner=await compiledOwnerReportPage(minify,{ownerPreview:true,localReadSnapshot:true}),cached=new Map(owner.localReadSnapshot.responses.map(row=>[row.path,row])),requests=[],network=[];
 let serverFailure=null,firstAmbiguous=true;
 const html=owner.html.replace('<head>','<head><script>const WeeklyQaDate=Date;globalThis.Date=class extends WeeklyQaDate{constructor(...args){super(...(args.length?args:['+weeklyProductionClock+']));}static now(){return '+weeklyProductionClock+';}};globalThis.__weeklyErrors=[];addEventListener("error",e=>__weeklyErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>__weeklyErrors.push(String(e.reason?.message||e.reason)));</script>').replace('<body>','<body><div style="position:fixed;right:3px;bottom:3px;z-index:99999;pointer-events:none;font:9px monospace;background:#fff;color:#000">QA SEMANAL SINTÉTICA · SEM DADOS REAIS</div>');
 const server=http.createServer(async(req,res)=>{try{
  if(!req.url.startsWith('/api/')){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);return;}
  const url=new URL(req.url,'http://synthetic.invalid'),request={method:req.method,path:req.url,body:null};requests.push(request);const headers={'content-type':'application/json','cache-control':'no-store'};let response=null;
  if(url.pathname==='/api/admin/production/weekly-closing'){
   if(req.method==='GET'){assert.deepEqual([...url.searchParams.keys()],['month']);response=await fixture.read(url.searchParams.get('month'));}
   else{
    assert.equal(req.method,'POST');assert.equal(url.search,'');assert.equal(req.headers['x-csrf-token'],owner.session.csrf);assert.equal(req.headers.origin,'http://127.0.0.1:'+server.address().port);
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw Error('WEEKLY_QA_BODY_LIMIT');}request.body=JSON.parse(raw);response=await fixture.mutate(request.body);
    if(firstAmbiguous){firstAmbiguous=false;res.writeHead(503,headers);res.end('{"error":"SYNTHETIC_AMBIGUOUS_RESPONSE"}');return;}
   }
  }else{
   assert.equal(req.method,'GET','weekly confirmation must never mutate manufacturing, financial or provider data');
   if(url.pathname==='/api/admin/production/incurred')response=await fixture.readLedger({month:url.searchParams.get('month'),week_of:url.searchParams.get('week_of')});
   else if(url.pathname==='/api/admin/finance/business-month-view'){response=fixture.finance.financialViews.get(url.searchParams.get('month'));headers['x-braza-client-contract']='business-month-view-v5';}
   else{const entry=cached.get(req.url);if(entry){response=entry.body;if(entry.contract)headers['x-braza-client-contract']=entry.contract;}}
  }
  res.writeHead(response?200:503,headers);res.end(JSON.stringify(response||{error:'SYNTHETIC_OPTIONAL_SOURCE_UNAVAILABLE'}));
 }catch(error){serverFailure=error.message;res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"SYNTHETIC_WEEKLY_QA_FAILED"}');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let cdp;
 const weeklyReads=()=>requests.filter(row=>row.method==='GET'&&row.path.startsWith('/api/admin/production/weekly-closing')).length;
 const weeklyPosts=()=>requests.filter(row=>row.method==='POST'&&row.path==='/api/admin/production/weekly-closing');
 try{
  cdp=await receiptBrowser();cdp.on('Network.requestWillBeSent',value=>network.push(value.request.url));await cdp.send('Network.enable');await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===320});
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/admin?tab=overview&month=2026-10&date=2026-10-20'});
  await wait(cdp,"document.readyState==='complete'&&globalThis.brazaProductionWeeklyClosing&&brazaMonthDashboard?.getSnapshot?.()?.month==='2026-10'",'the compiled owner workspace must initialize');
  const overview=await cdp.evaluate("(()=>{const cards=[...document.querySelectorAll('#commandCenterAgents>.agent-card')],kpis=document.querySelector('#commandCenter>.command-center-metrics'),agents=document.getElementById('commandAgents'),charts=document.querySelector('.mls-overview-performance');return {ids:cards.map(n=>n.dataset.missionAccent),visible:cards.every(n=>n.checkVisibility()),after_kpis:!!(kpis.compareDocumentPosition(agents)&Node.DOCUMENT_POSITION_FOLLOWING),before_charts:!!(agents.compareDocumentPosition(charts)&Node.DOCUMENT_POSITION_FOLLOWING),financial:JSON.stringify(brazaMonthDashboard.getSnapshot())};})()");
  assert.deepEqual(overview.ids,['hermes','finance','ads','products','production','returns']);assert.equal(overview.visible,true);assert.equal(overview.after_kpis,true);assert.equal(overview.before_charts,true);assert.equal(weeklyReads(),0,'weekly reports remain lazy outside the manufacturing workspace');
  await receiptClick(cdp,'#commandCenterAgents [data-mission-open="agent-production"]');
  await wait(cdp,"brazaProductionWeeklyClosing.getSnapshot()?.month==='2026-10'&&!!brazaIncurredProduction.getSnapshot()",'manufacturing and weekly reports must settle');
  assert.equal(weeklyReads(),1,'opening manufacturing performs one deduplicated weekly report GET');
  const initial=await cdp.evaluate('brazaProductionWeeklyClosing.getSnapshot()');assert.deepEqual(initial,fixture.initial);assert.equal(initial.financial_integration_allowed,false);
  const original=initial.weeks.find(row=>row.end_date===fixture.expected.end_date);assert.equal(original.current.total_cost_cents,null);assert.equal(original.current.boundary_pending_quantity,3);assert.equal(original.original.total_cost_cents,9000);assert.equal(original.current.period_end_at-original.current.period_start_at,7*86400);
  await setField(cdp,'#incurredProductionForm [name="production_ref"]','Rascunho de fabricação semanal preservado');await setField(cdp,'#incurredProductionForm [name="quantity"]','9');await setField(cdp,'#incurredProductionVoidForm [name="reason"]','Rascunho de correção semanal preservado');
  await selectWeek(cdp,fixture.expected.end_date);await visibleBounds(cdp);
  if(await cdp.evaluate("document.getElementById('productionWeeklyClosingPending').tagName==='DETAILS'&&!document.getElementById('productionWeeklyClosingPending').open"))await receiptClick(cdp,'#productionWeeklyClosingPending>summary');
  const pendingSelector='[data-weekly-record="'+fixture.pending+'"]';
  await setField(cdp,pendingSelector+' [name="before13_quantity"]','2');await setField(cdp,pendingSelector+' [name="at_or_after13_quantity"]','1');await setField(cdp,pendingSelector+' [name="reason"]','Confirmação sintética explícita: duas peças antes e uma a partir de 13h');
  assert.equal(await cdp.evaluate(`document.querySelector(${JSON.stringify(pendingSelector+' [name="confirmed"]')}).checked`),false,'timing confirmation is never preselected');
  assert.equal(weeklyPosts().length,0,'changing fields alone cannot create a timing declaration');
  await setField(cdp,pendingSelector+' [name="confirmed"]',true,'change');await receiptClick(cdp,pendingSelector+' button[type="submit"]');
  await wait(cdp,"!document.getElementById('productionWeeklyClosingRetry').hidden&&!document.getElementById('productionWeeklyClosingRetry').disabled",'an ambiguous result must retain an explicit idempotent retry');
  assert.equal(weeklyPosts().length,1);const readsWhilePending=weeklyReads();await setField(cdp,'#productionWeeklyClosingWeek','2026-10-16','change');assert.equal(await cdp.evaluate("document.getElementById('productionWeeklyClosingWeek').value"),fixture.expected.end_date,'a pending mutation restores the selected week and preserves its retry context');assert.equal(weeklyReads(),readsWhilePending);assert.equal(weeklyPosts().length,1);await receiptClick(cdp,'#productionWeeklyClosingRetry');
  await wait(cdp,`brazaProductionWeeklyClosing.getSnapshot()?.revision===${initial.revision+1}`,'a repeated request must replay the one confirmed assignment');
  assert.equal(weeklyPosts().length,2);assert.deepEqual(weeklyPosts()[1].body,weeklyPosts()[0].body,'retry must preserve the exact request, UUID, source fingerprint and quantities');
  const confirmed=await cdp.evaluate('brazaProductionWeeklyClosing.getSnapshot()'),confirmedWeek=confirmed.weeks.find(row=>row.end_date===fixture.expected.end_date),open=confirmed.weeks.find(row=>row.end_date==='2026-10-30');
  assert.equal(confirmedWeek.current.total_cost_cents,8400);assert.equal(open.current.known_cost_cents,2700);assert.equal(open.current.status,'OPEN');assert.equal(open.current.total_cost_cents,null);assert.equal(JSON.stringify(confirmedWeek.original),originalBefore);
  await fixture.settle();await receiptClick(cdp,'#productionWeeklyClosingRefresh');
  await wait(cdp,"brazaProductionWeeklyClosing.getSnapshot()?.weeks.find(w=>w.end_date==='2026-10-23').latest?.total_cost_cents===8400",'the independent scheduler must expose the adjustment without replacing the original');
  const restated=await cdp.evaluate('brazaProductionWeeklyClosing.getSnapshot()'),revised=restated.weeks.find(row=>row.end_date===fixture.expected.end_date);assert.equal(revised.delta_cents,-600);assert.ok(revised.versions_count>=2);assert.equal(JSON.stringify(revised.original),originalBefore);
  const beforeMonth=weeklyReads();await setField(cdp,'#productionWeeklyClosingMonth','2026-09','change');await wait(cdp,"brazaProductionWeeklyClosing.getSnapshot()?.month==='2026-09'",'saved historical weeks must be selectable');assert.equal(weeklyReads(),beforeMonth+1);
  const beforeLocal=weeklyReads();await selectWeek(cdp,'2026-09-18');const september=await cdp.evaluate('brazaProductionWeeklyClosing.getSnapshot()');assert.equal(september.weeks.find(row=>row.end_date==='2026-09-18').current.total_cost_cents,0,'explicitly declared zero is a real zero');
  await selectWeek(cdp,'2026-09-25');const old=september.weeks.find(row=>row.end_date==='2026-09-25');assert.equal(old.current.total_cost_cents,1111);assert.equal(old.current.capture_kind,'RETROSPECTIVE');assert.equal(old.current.report_version,0);assert.equal(weeklyReads(),beforeLocal,'switching between distinct historical weeks uses the already loaded month');
  await selectWeek(cdp,'2026-09-11');assert.equal(september.weeks.find(row=>row.end_date==='2026-09-11').current.status,'NO_RECORDS');assert.equal(september.weeks.find(row=>row.end_date==='2026-09-11').current.total_cost_cents,null);assert.doesNotMatch(await cdp.evaluate("document.getElementById('productionWeeklyClosingSelected').textContent"),/R\$\s*0,00/,'missing manufacturing history cannot become zero expense');assert.equal(weeklyReads(),beforeLocal,'the unrecorded week also uses the local historical view');
  await setField(cdp,'#productionWeeklyClosingMonth','2026-10','change');await wait(cdp,"brazaProductionWeeklyClosing.getSnapshot()?.month==='2026-10'",'the selected weekly history can return to the corrected month');await selectWeek(cdp,fixture.expected.end_date);assert.match(await cdp.evaluate("document.getElementById('productionWeeklyClosingSelected').textContent"),/84,00/);
  const themes=[];for(const theme of ['light','dark']){
   await cdp.evaluate(`(()=>{const toggle=[...document.querySelectorAll('[data-braza-theme-toggle]')].find(n=>n.checkVisibility());for(let n=0;document.documentElement.dataset.themePreference!==${JSON.stringify(theme)}&&n<3;n++)toggle.click();})()`);assert.equal(await cdp.evaluate('document.documentElement.dataset.theme'),theme);await visibleBounds(cdp);
   if(screens){mkdirSync(screens,{recursive:true});await cdp.evaluate("document.getElementById('productionWeeklyClosingTitle').scrollIntoView({block:'start',behavior:'instant'});window.scrollBy({top:-145,behavior:'instant'})");const shot=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});writeFileSync(path.join(screens,(minify?'min':'normal')+'-'+width+'-'+theme+'.png'),Buffer.from(shot.data,'base64'));}themes.push(theme);
  }
  await cdp.evaluate("(()=>{const s=document.createElement('style');s.textContent='#productionWeeklyClosing :is(p,label,button,summary,td,th,dt,dd){font-size:15px!important}';document.head.append(s);})()");await visibleBounds(cdp);
  const drafts=await cdp.evaluate("({ref:document.querySelector('#incurredProductionForm [name=production_ref]').value,quantity:document.querySelector('#incurredProductionForm [name=quantity]').value,reason:document.querySelector('#incurredProductionVoidForm [name=reason]').value})");assert.deepEqual(drafts,{ref:'Rascunho de fabricação semanal preservado',quantity:'9',reason:'Rascunho de correção semanal preservado'});
  assert.equal(await cdp.evaluate('JSON.stringify(brazaMonthDashboard.getSnapshot())'),overview.financial);assert.equal(await fixture.snapshot(),canonicalBefore);assert.equal(JSON.stringify(fixture.finance.financialView),financeBefore);assert.equal(fixture.finance.providerCalls(),providerBefore);assert.equal(serverFailure,null);assert.deepEqual(await cdp.evaluate('__weeklyErrors'),[]);assert.ok(network.every(url=>url.startsWith('http://127.0.0.1:')||/^(data:|blob:|about:)/.test(url)),'the actual browser may not call an external provider');
  assert.equal(requests.filter(row=>row.method!=='GET').length,2,'only the explicitly confirmed timing assignment and its replay may write to the disposable local store');
  results.push({minify,width,pass:true,page_errors:0,horizontal_overflow:false,themes,large_font_checked:true,legacy_contracts_unchanged:true,overview_agents_preserved:true,manufacturing_basis_preserved:true,weekly_cutoff_preserved:true,historical_reports_not_fabricated:true,month_drafts_preserved:true,synthetic_timing_requests:2,idempotent_retry:true});
 }finally{await cdp?.close();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));fixture.close();}
});

after(()=>{
 if(frozenWorkers)assert.deepEqual(workerHashes(),frozenWorkers,'all four QA profiles must use the same generated source');
 if(qaFile){const complete=results.length===4,guards=['legacy_contracts_unchanged','overview_agents_preserved','manufacturing_basis_preserved','weekly_cutoff_preserved','historical_reports_not_fabricated','month_drafts_preserved'];mkdirSync(path.dirname(qaFile),{recursive:true});writeFileSync(qaFile,JSON.stringify({schema:'mls_production_weekly_closing_qa_v1',generated_hashes:frozenWorkers,...Object.fromEntries(guards.map(key=>[key,complete&&results.every(row=>row[key]===true)])),remote_writes:0,owner_real_mutation_requests:0,new_provider_calls:0,results},null,2)+'\n');}
});
