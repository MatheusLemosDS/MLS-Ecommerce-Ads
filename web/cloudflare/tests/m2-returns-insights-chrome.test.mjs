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
import {returnsInsightsFixture} from './m2-returns-insights-fixture.mjs';
import {projectMlsReturnsInsights} from '../src/mls-returns-insights.mjs';
import {projectMlsSettlementEvidence} from '../src/mls-settlement-evidence.mjs';
import {buildBusinessMonthView} from '../src/business-month-view-state.mjs';
import {completeWorkspaceFrame,workspaceBrowser,workspaceClock,workspaceStamp} from './monthly-workspace-browser-fixture.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const screenshotDirectory=process.env.MLS_RETURNS_SCREENSHOT_DIR||null;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function scenario(f=returnsInsightsFixture()){
 const frame=f.snapshot.report.reports[0],source={...f.scope.sources[0],
  finance_oldest_at:frame.source_checked_at.finance_oldest_at,finance_latest_at:frame.source_checked_at.finance_latest_at,
  orders:frame.coverage.orders,paid_orders:frame.coverage.paid_orders,expected_repass_cents:frame.adjustments.base_repass_cents};
 const payouts=f.snapshot.money[0].money.payouts.filter(row=>row.cohort==='PAID');
 return {month:{schema:'mls_month_snapshot_v1',month:f.month,audit_scope:f.scope,status:'COMPLETE',checked_at:f.snapshot.report.checked_at,
   balance_cents:null,pending:['STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED'],
   coverage:{orders:frame.coverage.orders,paid:frame.coverage.paid_orders,completed:frame.coverage.paid_orders,ongoing:0,
    cancelled:0,cancel_pending:0,unpaid:0,other:frame.coverage.review_orders,unknown:0,returns:frame.coverage.return_orders,returns_unknown:0},
   production_coverage:{total_units:2,known_units:2,pending_units:0}},
  reconciliation:f.snapshot,releases:{schema:'mls_escrow_releases_snapshot_v1',month:f.month,scope_key:JSON.stringify(f.scope),
   report:{month:f.month,cohort:{publication_revision:f.scope.publication_revision,start_date:f.scope.start_date,end_date:f.scope.end_date,sources:[source]},
    report:{month:f.month,sources:[{...source,status:'AVAILABLE'}],pending:['BANK_RECEIPT_NOT_VERIFIED']}},
   orders:{summary:{known_paid_orders:2,verified_orders:2,not_located_orders:0,unverified_orders:0,ambiguous_orders:0},
    rows:payouts.map(row=>({order_hash:row.order_hash,state:'VERIFIED',base_repass_cents:row.base_repass_cents,
     adjustment_cents:row.adjustment_cents,after_adjustment_repass_cents:row.after_adjustment_repass_cents,financial_checked_at:row.source_checked_at})),
    truncation:{truncated:false,orders_total:payouts.length,orders_included:payouts.length}}}};
}
function scenarios(){
 const complete=scenario(),conflict=structuredClone(complete);
 conflict.releases.orders.rows[0].adjustment_cents++;
 conflict.releases.orders.rows[0].after_adjustment_repass_cents++;
 const differentScope=structuredClone(conflict),otherScope={...differentScope.month.audit_scope,publication_revision:8};
 differentScope.reconciliation.scope_key=JSON.stringify(otherScope);differentScope.reconciliation.report.source_revision=8;
 const partialFixture=returnsInsightsFixture(),frame=partialFixture.snapshot.report.reports[0],money=partialFixture.snapshot.money[0].money;
 const accepted=money.groups[0].statuses.find(row=>row.status==='ACCEPTED'),refunded=money.groups[0].statuses.find(row=>row.status==='REFUND_PAID');
 accepted.known_amount_cents=0;refunded.amount_known=0;refunded.known_amount_cents=0;
 frame.returns.known_requested_refund_cents=3000;frame.returns.requested_amount_complete=false;
 frame.cases=frame.cases.slice(0,1);frame.truncation={truncated:true,cases_total:3,cases_included:1};
 money.payouts=money.payouts.slice(0,1);money.truncation={truncated:true,payouts_total:3,payouts_included:1};
 frame.status='PARTIAL';frame.pending.push('RETURN_REFERENCES_MISSING');
 const partial=scenario(partialFixture);
 const missingInterval=structuredClone(complete),next={run_id:'22222222-2222-4222-8222-222222222222',source_revision:3,start_date:'2026-10-16',end_date:'2026-10-25'};
 missingInterval.month.audit_scope.end_date=next.end_date;missingInterval.month.audit_scope.sources.push(next);
 missingInterval.reconciliation.scope_key=JSON.stringify(missingInterval.month.audit_scope);
 missingInterval.reconciliation.report.end_date=next.end_date;missingInterval.reconciliation.report.sources.push(next);
 const unloaded=structuredClone(complete);unloaded.reconciliation=null;unloaded.releases=null;
 const zeroFixture=returnsInsightsFixture(),zeroFrame=zeroFixture.snapshot.report.reports[0],zeroMoney=zeroFixture.snapshot.money[0].money;
 zeroFrame.coverage={...zeroFrame.coverage,orders:2,evidence_orders:2,review_orders:0,return_orders:0};
 zeroFrame.cases=[];zeroFrame.truncation={truncated:false,cases_total:0,cases_included:0};
 zeroFrame.returns={...zeroFrame.returns,reference_count:0,checked_count:0,pending_count:0,known_requested_refund_cents:0};
 zeroFrame.source_checked_at.returns_oldest_at=null;zeroFrame.source_checked_at.returns_latest_at=null;
 for(const group of zeroMoney.groups){group.source_checked_at={oldest_at:null,latest_at:null};for(const row of group.statuses)Object.assign(row,{cases:0,amount_known:0,known_amount_cents:0});}
 zeroMoney.payouts=zeroMoney.payouts.filter(row=>row.cohort==='PAID').map(row=>({...row,reference_count:0}));
 zeroMoney.truncation={truncated:false,payouts_total:2,payouts_included:2};
 const review=zeroFixture.snapshot.reviews[0].review;
 review.summary={orders:0,in_cancel:0,to_return:0,other:0,unknown:0};review.orders=[];review.truncation={truncated:false,orders_total:0,orders_included:0};
 const zero=scenario(zeroFixture);
 for(const [name,value] of Object.entries({complete,partial,missingInterval,zero})){
  const result=projectMlsReturnsInsights(value.reconciliation,{expectedMonth:value.month.month,expectedScope:value.month.audit_scope});
  assert.equal(result.state,name==='complete'||name==='zero'?'READY':'PARTIAL',name+' fixture crosses the real insights projector');
 }
 assert.equal(projectMlsSettlementEvidence(complete).evidence_state,'OBSERVED_COMPATIBLE');
 assert.equal(projectMlsSettlementEvidence(conflict).evidence_state,'CONFLICT');
 assert.equal(projectMlsSettlementEvidence(differentScope).evidence_state,'WAITING_SCOPE');
 return {complete,conflict,differentScope,partial,missingInterval,unloaded,zero};
}

function scopeView({published=true,enabled=true}={}){
 const display=completeWorkspaceFrame({endDay:15}),scope=returnsInsightsFixture().scope;
 return buildBusinessMonthView({display,active:display,display_source:published?'PUBLISHED':'ACTIVE',audit_scope:published?scope:null,expense_schedule:null},
  {enabled,status:'COMPLETE',next_run_at:workspaceStamp+600,last_attempt_at:workspaceStamp-5},
  {now:()=>workspaceClock,contract:'business-month-view-v4'});
}
test('monthly client exposes a deeply frozen decoded publication identity and clears it for ACTIVE and manual reads',async()=>{
 const b=workspaceBrowser(scopeView());
 try{
  assert.equal(await b.run('brazaMonthDashboard.start({api})'),true);
  assert.deepEqual(JSON.parse(b.run('JSON.stringify(brazaMonthDashboard.getSnapshot().audit_scope)')),returnsInsightsFixture().scope);
  assert.equal(b.run('Object.isFrozen(brazaMonthDashboard.getSnapshot().audit_scope)&&Object.isFrozen(brazaMonthDashboard.getSnapshot().audit_scope.sources)&&Object.isFrozen(brazaMonthDashboard.getSnapshot().audit_scope.sources[0])'),true);
  b.load(scopeView({published:false}));assert.equal(await b.run('brazaMonthDashboard.refreshCosts()'),true);
  assert.equal(b.run('brazaMonthDashboard.getSnapshot().audit_scope'),null,'ACTIVE evidence has no published identity');
  b.load(scopeView({enabled:false}));assert.equal(await b.run('brazaMonthDashboard.refreshCosts()'),true);
  b.context.manualFrame=JSON.stringify(completeWorkspaceFrame({endDay:15}));
  b.run('customApi=async(path,body)=>{if(path==="finance/business-month"&&["start","ads"].includes(body?.operation))return JSON.parse(manualFrame);if(path.startsWith("finance/business-month-view?"))return currentView;throw Error("UNEXPECTED_MANUAL_API:"+path);};');
  assert.equal(await b.run('control("SourceRefresh").onclick()'),true);
  assert.equal(b.run('brazaMonthDashboard.getSnapshot().audit_scope'),null,'manual collection cannot inherit the prior published identity');
  assert.deepEqual(b.calls().filter(row=>row.body!==undefined),['start','ads'].map(operation=>({path:'finance/business-month',body:{operation,month:'2026-10'}})));
 }finally{b.run('brazaMonthDashboard.stop()');}
});

async function browser(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-m2-returns-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking',
  '--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const cleanup=createChromeProfileCleanup(child,profile);let socket;
 try{
  const port=await waitForChromeDebugPort(child,profile),pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP_OPEN_TIMEOUT')),10000);
   socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP_OPEN_ERROR'));},{once:true});});
  let sequence=0;const pending=new Map();
  socket.addEventListener('message',event=>{const value=JSON.parse(event.data),call=pending.get(value.id);if(!call)return;pending.delete(value.id);clearTimeout(call.timer);value.error?call.reject(Error(value.error.message)):call.resolve(value.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT:'+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  await send('Page.enable');await send('Runtime.enable');
  return {send,async evaluate(expression){const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
   if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value;},
   async capture(name){if(!screenshotDirectory)return;const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});mkdirSync(screenshotDirectory,{recursive:true});writeFileSync(path.join(screenshotDirectory,name),Buffer.from(result.data,'base64'));},
   close:()=>cleanup(socket)};
 }catch(error){await cleanup(socket);throw error;}
}

const read=`(()=>{const r=mlsAgentRegistry.getSnapshot(),h=document.getElementById('mission-returns-evidence'),g=document.getElementById('missionChart-returns-status');return {
 frozen:Object.isFrozen(mlsAgentRegistry)&&Object.isFrozen(r.sources.returns_insights),insight:r.sources.returns_insights,settlement:r.settlement,
 hermes:r.hermes.status,auditor:r.agents.find(a=>a.id==='auditor').status,priorities:r.priorities.map(p=>p.code),
 source:h.dataset.evidenceSource,text:h.textContent.replace(/\\u00a0/g,' '),
 cohorts:[...h.querySelectorAll('[data-cohort]')].map(n=>({cohort:n.dataset.cohort,text:n.textContent.replace(/\\u00a0/g,' ')})),
 rows:[...h.querySelectorAll('[data-return-status]')].map(n=>({status:n.dataset.returnStatus,text:n.textContent.replace(/\\u00a0/g,' ')})),
 graph:{status:g.dataset.chartStatus,source:g.dataset.chartSource,svg:g.querySelectorAll('svg').length,text:g.textContent},
 calls:__returnsQA.calls(),errors:__returnsErrors,
 viewport:{inner:innerWidth,scroll:document.documentElement.scrollWidth}};})()`;

test('compiled normal and minified M2 Returns read saved publication evidence in desktop/mobile dark/light without new requests',{timeout:150000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 const values=scenarios();
 for(const minify of [false,true]){
  let {html}=await compiledOwnerReportPage(minify,{ownerPreview:false});
  html=html.replace('<head>','<head><script>globalThis.__returnsErrors=[];addEventListener("error",e=>__returnsErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>__returnsErrors.push(String(e.reason)));</script>')
   .replace('<body>','<body><div style="position:fixed;bottom:8px;right:8px;pointer-events:none;z-index:99999;background:#13243d;color:#e8f5ff;padding:5px;font:10px sans-serif">QA SINTÉTICA · DEVOLUÇÕES · SEM DADOS REAIS</div>');
  const server=http.createServer((req,res)=>{const api=req.url.startsWith('/api/');res.writeHead(api?503:200,{'content-type':api?'application/json':'text/html; charset=utf-8','cache-control':'no-store'});res.end(api?'{"error":"SYNTHETIC_NO_REMOTE_API"}':html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let cdp;
  try{
   cdp=await browser();
   for(const [width,height] of [[1365,900],[390,844]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});
    await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/admin?tab=agent-returns'});
    let ready=false;
    for(let n=0;n<150;n++){if(await cdp.evaluate("document.readyState==='complete'&&!!globalThis.mlsAgentRegistry&&!!globalThis.mlsMissionTrends&&!!globalThis.brazaReconciliation")){ready=true;break;}await pause(70);}
    assert.equal(ready,true,'compiled owner clients initialized');
    // Freeze only synthetic source caches. The embedded Registry, projectors,
    // Returns renderer, graph controller and route/source handlers stay real.
    await cdp.evaluate(`(()=>{
     const values=${JSON.stringify(values)};let current=structuredClone(values.complete),calls=0;
     for(const name of ['brazaMonthDashboard','brazaDayDashboard','brazaEscrowReleases','brazaIncomeOverview','brazaSavedCatalog','brazaProductionCostPeriods','brazaDtfWorkspace'])try{globalThis[name]?.stop?.();}catch{}
     mlsAgentRegistry.stop();
     const noRead=async()=>{throw Error('UNEXPECTED_SOURCE_REQUEST');};brazaReconciliation.start({api:noRead});
     const originalFetch=globalThis.fetch;globalThis.fetch=(...args)=>{calls++;return originalFetch(...args);};
     const source=(name,key)=>globalThis[name]={...globalThis[name],getSnapshot:()=>current[key]};
     source('brazaMonthDashboard','month');source('brazaReconciliation','reconciliation');source('brazaEscrowReleases','releases');
     globalThis.__returnsQA={calls:()=>calls,load(name){current=structuredClone(values[name]);mlsAgentRegistry.refresh();},publication(){current.month.audit_scope.publication_revision++;mlsAgentRegistry.refresh();}};
     mlsAgentRegistry.refresh();
     const tab=document.getElementById('agent-returns');document.querySelectorAll('main.workspace>section').forEach(node=>node.hidden=node!==tab);tab.hidden=false;
     tab.scrollIntoView({block:'start',behavior:'instant'});
    })()`);
    for(const theme of ['dark','light']){
     await cdp.evaluate(`(()=>{const toggle=[...document.querySelectorAll('[data-braza-theme-toggle]')].find(n=>n.checkVisibility());for(let n=0;n<3&&document.documentElement.dataset.theme!==${JSON.stringify(theme)};n++)toggle.click();__returnsQA.load('complete');})()`);
     await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
     let result=await cdp.evaluate(read);assert.equal(result.frozen,true);assert.equal(result.source,'RETURNS_INSIGHTS');
     assert.equal(result.insight.state,'READY');assert.equal(result.insight.coverage.identified_cases,3);
     assert.equal(result.graph.status,'READY');assert.equal(result.graph.svg,1);assert.match(result.graph.source,/NOT_BANK_MOVEMENT/);
     assert.match(result.graph.text,/Solicitação aceita/);assert.match(result.graph.text,/Solicitação cancelada/);assert.match(result.graph.text,/Reembolso informado/);
     assert.deepEqual(result.cohorts.map(row=>row.cohort),['PAID','REVIEW','OTHER']);
     assert.match(result.cohorts[0].text,/pedidos pagos.*2 solicitação.*R\$ 30,00/);assert.match(result.cohorts[1].text,/pedidos em revisão.*1 solicitação.*R\$ 30,00/);
     assert.match(result.rows.find(row=>row.status==='ACCEPTED').text,/Solicitação aceita.*R\$ 10,00/);
     assert.match(result.rows.find(row=>row.status==='CANCELLED').text,/Solicitação cancelada.*R\$ 30,00/);
     assert.match(result.rows.find(row=>row.status==='REFUND_PAID').text,/Reembolso informado pela Shopee.*R\$ 20,00/);
     assert.match(result.text,/não são despesas confirmadas.*não comprova movimentação bancária/);
     assert.equal(result.settlement.evidence_state,'OBSERVED_COMPATIBLE');assert.equal(result.settlement.evidence_conflicts,0);
     assert.equal(result.viewport.inner,width);assert.ok(result.viewport.scroll<=width+2,'Returns layout has no horizontal page overflow');
     const before=result.calls;
     await cdp.evaluate(`(()=>{mlsAgentRegistry.refresh();mlsMissionTrends.refresh();const s=document.getElementById('missionAgentSearch');s.value='devoluções';s.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-mission-hub-filter=ATTENTION]').click();})()`);
     assert.equal((await cdp.evaluate(read)).calls,before,'rendering and local filtering never fetch');
     await cdp.evaluate("document.getElementById('missionChart-returns-status').scrollIntoView({block:'center',behavior:'instant'})");
     await cdp.capture('returns-status-'+(minify?'minified':'normal')+'-'+width+'-'+theme+'.png');
     await cdp.evaluate("document.getElementById('mission-returns-evidence').scrollIntoView({block:'center',behavior:'instant'})");
     await cdp.capture('returns-'+(minify?'minified':'normal')+'-'+width+'-'+theme+'.png');
     await cdp.evaluate("__returnsQA.load('partial')");result=await cdp.evaluate(read);
     assert.equal(result.insight.state,'PARTIAL');assert.equal(result.insight.coverage.aggregate_complete,true);assert.equal(result.graph.status,'READY');
     assert.match(result.rows.find(row=>row.status==='ACCEPTED').text,/R\$ 0,00/,'known zero remains explicit');
     assert.match(result.rows.find(row=>row.status==='REFUND_PAID').text,/Não informado/,'unknown amount does not become zero');
     assert.match(result.text,/referências ainda ausentes.*sem valor informado.*listas individuais.*limitadas/);
     assert.equal(result.insight.coverage.identified_cases,3,'truncated case rows do not erase complete aggregates');
     await cdp.evaluate("__returnsQA.load('missingInterval')");result=await cdp.evaluate(read);
     assert.equal(result.insight.coverage.aggregate_complete,false);assert.equal(result.graph.status,'UNAVAILABLE');assert.equal(result.graph.svg,0);assert.match(result.text,/Cobertura parcial: faltam intervalos/);
     await cdp.evaluate("__returnsQA.load('zero')");result=await cdp.evaluate(read);
     assert.equal(result.insight.state,'READY');assert.equal(result.insight.coverage.identified_cases,0);assert.match(result.text,/Nenhuma solicitação foi identificada/);assert.equal(result.rows.length,0);
     await cdp.evaluate("__returnsQA.load('unloaded')");result=await cdp.evaluate(read);
     assert.equal(result.insight.state,'UNAVAILABLE');assert.equal(result.insight.coverage.identified_cases,null);assert.equal(result.graph.svg,0);assert.equal(result.rows.length,0);assert.doesNotMatch(result.text,/0 solicitação/);
     await cdp.evaluate("__returnsQA.load('differentScope')");result=await cdp.evaluate(read);
     assert.equal(result.settlement.evidence_state,'WAITING_SCOPE');assert.equal(result.settlement.evidence_conflicts,0);assert.notEqual(result.hermes,'BLOCKED');assert.notEqual(result.auditor,'BLOCKED');
     assert.ok(result.priorities.includes('SETTLEMENT_PUBLICATION_WAITING'));assert.equal(result.graph.status,'UNAVAILABLE');assert.equal(result.graph.svg,0);assert.equal(result.rows.length,0);
     await cdp.evaluate("__returnsQA.load('conflict')");result=await cdp.evaluate(read);
     assert.equal(result.settlement.evidence_state,'CONFLICT');assert.equal(result.settlement.evidence_conflicts,1);assert.equal(result.hermes,'BLOCKED');assert.equal(result.auditor,'BLOCKED');
     assert.ok(result.priorities.includes('SETTLEMENT_EVIDENCE_CONFLICT'));
     await cdp.evaluate('__returnsQA.publication()');result=await cdp.evaluate(read);
     assert.equal(result.settlement.evidence_state,'WAITING_SCOPE');assert.equal(result.settlement.evidence_conflicts,0);assert.notEqual(result.hermes,'BLOCKED');assert.equal(result.graph.svg,0);assert.equal(result.rows.length,0,'a new publication immediately invalidates old graph and table');
     assert.equal(result.calls,before,'all evidence projections and filters use saved caches');assert.deepEqual(result.errors,[]);
     await cdp.evaluate("__returnsQA.load('complete');document.getElementById('missionReturnsSourceLink').click()");
     await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
     const link=await cdp.evaluate(`(()=>{const d=document.getElementById('businessReconciliationDetails'),f=document.getElementById('agent-finance');return {open:d.open,visible:d.checkVisibility(),financeVisible:f.checkVisibility(),tab:new URL(location.href).searchParams.get('tab'),calls:__returnsQA.calls(),errors:__returnsErrors};})()`);
     assert.equal(link.open,true,'the real reconciliation source handler opens details');assert.equal(link.visible,true);assert.equal(link.financeVisible,true);assert.equal(link.tab,'agent-finance');assert.equal(link.calls,before);assert.deepEqual(link.errors,[]);
     await cdp.evaluate("document.querySelector('[data-mission-open=\"agent-returns\"]').click()");
    }
   }
  }finally{await cdp?.close();await new Promise(resolve=>server.close(resolve));}
 }
});
