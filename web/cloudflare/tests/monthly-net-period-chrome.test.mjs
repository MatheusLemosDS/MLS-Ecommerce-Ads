import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {createChromeProfileCleanup} from './chrome-profile-cleanup.mjs';
import {waitForChromeDebugPort} from './chrome-debug-port.mjs';
import {completeWorkspaceFrame} from './monthly-workspace-browser-fixture.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {buildBusinessMonthView} from '../src/business-month-view-state.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';

// SYNTHETIC: these amounts, counts and publication IDs are deterministic test
// data. No owner payload, customer record or live provider is used by this QA.
const clock=Date.UTC(2026,10,2,15),stamp=clock/1000;
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const output=process.env.MLS_MONTHLY_NET_PERIOD_QA_DIR||null,results=[];
const artifact=new URL('../../../dist/app-worker.mjs',import.meta.url);
const artifactHash=()=>createHash('sha256').update(readFileSync(artifact)).digest('hex');
const generatedHash=artifactHash();
const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100).replace(/\s/g,' ');

function adsCalendar(month,last,at,spend){
 const chunks=[];
 for(let first=1;first<=last;first+=15){
  const end=Math.min(last,first+14),selection={start_date:month+'-'+String(first).padStart(2,'0'),end_date:month+'-'+String(end).padStart(2,'0')};
  const daily=Array.from({length:end-first+1},(_,offset)=>({date:month+'-'+String(first+offset).padStart(2,'0'),expense:first+offset===last?(spend/100).toFixed(2):'0',broad_gmv:first+offset===last?'987.65':'0',broad_order:first+offset===last?7:0,direct_gmv:'0',direct_order:0}));
  chunks.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:selection,balance:0,daily},selection,at));
 }
 return buildAdsCalendar(chunks,{start_date:month+'-01',end_date:month+'-'+String(last).padStart(2,'0')},at);
}

function fixture(){
 const template=completeWorkspaceFrame({month:'2026-10',at:stamp,endDay:31}),views=new Map(),frames=new Map();
 for(const month of ['2026-11','2026-10']){
  const november=month==='2026-11',last=november?2:31,adsAt=november?stamp-30:Date.UTC(2026,9,31,20,12)/1000;
  const coverage=november?{orders:12,paid:10,completed:6,ongoing:4,cancelled:1,cancel_pending:0,unpaid:1,other:0,unknown:0,payment_covered:10,payment_missing:0,returns:0,returns_unknown:0}:{orders:26,paid:20,completed:18,ongoing:2,cancelled:3,cancel_pending:0,unpaid:1,other:2,unknown:0,payment_covered:20,payment_missing:0,returns:4,returns_unknown:0};
  const sales=november?276543:612345,payout=november?201234:432100,production=november?87231:201000,spend=november?24123:54321;
  const source={...structuredClone(template),month,start_date:month+'-01',end_date:month+'-'+String(last).padStart(2,'0'),checked_at:stamp,progress:{windows_total:Math.ceil(last/15),windows_complete:Math.ceil(last/15),pages_read:november?2:6,order_capacity:november?40:120},coverage,sales_cents:sales,known_sales_cents:sales,expected_repass_cents:payout,known_expected_repass_cents:payout,production_cost_cents:production,known_production_cost_cents:production,ads_adjustment_cents:0,ads:adsCalendar(month,last,adsAt,spend),source_checked_at:{finance_oldest_at:stamp-60,finance_latest_at:stamp-1,ads_at:adsAt},expenses:november?{revision:0,external_expenses_cents:null,recharge_treatment:'UNCONFIRMED',updated_at:null}:{revision:2,external_expenses_cents:23456,recharge_treatment:'ADS_RECHARGE',updated_at:new Date((stamp-100)*1000).toISOString()},result:{net_estimate_cents:null,net_profit_cents:null,net_margin_bps:null,pending:november?['EXTERNAL_EXPENSES_REQUIRED']:['STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED','ADS_UNAVAILABLE'],basis:'PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE'}};
  const frame=projectBusinessMonth(source);assert.ok(frame,'synthetic '+month+' must pass the canonical financial projector');
  const audit_scope={publication_revision:november?31:30,start_date:frame.start_date,end_date:frame.end_date,sources:Array.from({length:Math.ceil(last/15)},(_,index)=>({run_id:'abcdef01-0000-4000-8000-'+String(index+1).padStart(12,'0'),source_revision:index+1,start_date:month+'-'+String(index*15+1).padStart(2,'0'),end_date:month+'-'+String(Math.min(last,index*15+15)).padStart(2,'0')}))};
  const view=buildBusinessMonthView({display:frame,active:frame,display_source:'PUBLISHED',audit_scope},{enabled:true,status:'COMPLETE',next_run_at:stamp+60,last_attempt_at:stamp-5},{now:()=>clock,contract:'business-month-view-v4'});
  assert.equal(view.schema,'business_month_view_v4');frames.set(month,frame);views.set(month,view);
 }
 return {views,frames,original:JSON.stringify([...frames]),strict:JSON.stringify([...frames].map(([month,value])=>[month,value.result]))};
}

async function browser(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-monthly-net-period-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'}),cleanup=createChromeProfileCleanup(child,profile);let socket;
 try{
  const port=await waitForChromeDebugPort(child,profile);let page;
  for(let index=0;index<120;index++){try{page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(row=>row.type==='page'&&row.webSocketDebuggerUrl);}catch{}if(page)break;await pause(50);}
  assert.ok(page,'Chromium page must initialize');socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('MONTHLY_PERIOD_CDP_OPEN_TIMEOUT')),10000);socket.addEventListener('open',()=>{clearTimeout(timeout);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timeout);reject(Error('MONTHLY_PERIOD_CDP_OPEN_FAILED'));},{once:true});});
  let sequence=0;const pending=new Map(),providerRequests=[],apiRequests=new Map(),network={version:0,lastActivity:Date.now()};
  socket.addEventListener('message',event=>{
   const value=JSON.parse(event.data),params=value.params;
   if(value.method==='Network.requestWillBeSent'){
    const url=params?.request?.url||'';
    if(/https?:\/\/[^/]*(?:shopee|shopeemobile)\./i.test(url))providerRequests.push(url);
    if(/\/api\/admin\//.test(url)){apiRequests.set(params.requestId,url);network.version++;network.lastActivity=Date.now();}
   }else if(['Network.loadingFinished','Network.loadingFailed'].includes(value.method)&&apiRequests.delete(params?.requestId)){
    network.version++;network.lastActivity=Date.now();
   }
   const call=pending.get(value.id);if(!call)return;pending.delete(value.id);clearTimeout(call.timer);value.error?call.reject(Error(value.error.message)):call.resolve(value.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('MONTHLY_PERIOD_CDP_TIMEOUT:'+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  return {send,providerRequests,apiRequests,network,async evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;},close:()=>cleanup(socket)};
 }catch(error){await cleanup(socket);throw error;}
}

async function waitFor(cdp,expression,message){
 for(let index=0;index<160;index++){if(await cdp.evaluate(expression))return;await pause(50);}
 assert.fail(message+' '+JSON.stringify(await cdp.evaluate("({month:brazaMonthDashboard?.getSnapshot?.(),message:document.getElementById('businessMonthStatus')?.textContent,errors:__monthlyPeriodErrors})")));
}
async function drainSavedReads(cdp,month){
 // Network.loadingFinished covers the response body. The controls additionally
 // prove the real ledger's parsing/finally has settled. A browser task between
 // animation frames drains details/toggle and observer work before counters
 // begin; no module is disabled and no request category is ignored.
 const state=()=>cdp.evaluate(`(()=>{const field=document.getElementById('businessMonthExpenseLedgerMonth'),refresh=document.getElementById('businessMonthExpenseLedgerRefresh'),period=globalThis.brazaMonthDashboard?.getSnapshot?.();return {ledger_month:field?.value,ledger_idle:!!field&&!field.disabled&&!!refresh&&!refresh.disabled&&refresh.textContent==='Consultar despesas',period_month:period?.month,period_idle:period?.period_loading===false};})()`);
 let last;
 for(let index=0;index<160;index++){
  last=await state();
  if(!cdp.apiRequests.size&&last.ledger_month===month&&last.ledger_idle&&last.period_month===month&&last.period_idle&&Date.now()-cdp.network.lastActivity>=100){
   const version=cdp.network.version;
   await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,0))))');
   last=await state();
   if(!cdp.apiRequests.size&&version===cdp.network.version&&last.ledger_month===month&&last.ledger_idle&&last.period_month===month&&last.period_idle)return;
  }
  await pause(25);
 }
 assert.fail('saved reads must finish before measuring a navigation action: '+JSON.stringify({state:last,pending:[...cdp.apiRequests.values()]}));
}
async function click(cdp,id){
 await cdp.evaluate(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({block:'center',behavior:'instant'})`);
 await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 const point=await cdp.evaluate(`(()=>{const n=document.getElementById(${JSON.stringify(id)}),r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {x:r.x+r.width/2,y:r.y+r.height/2,height:r.height,visible:n.checkVisibility({checkVisibilityCSS:true}),enabled:!n.disabled,hit:hit===n||n.contains(hit)};})()`);
 assert.equal(point.visible,true,id+' visible');assert.equal(point.enabled,true,id+' enabled');assert.ok(point.height>=44,id+' touch height');assert.equal(point.hit,true,id+' unobscured');
 await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:point.x,y:point.y});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:point.x,y:point.y});
}

const onlySaved=rows=>rows.filter(row=>row.path.startsWith('/api/admin/finance/business-month-view?'));
for(const minify of [false,true])for(const width of [320,1365])test(`generated monthly subtotal and shared historical period remain coherent (${width}px, minify=${minify})`,{timeout:90000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 const data=fixture(),owner=await compiledOwnerReportPage(minify,{ownerPreview:false}),requests=[];let failure=null;
 const html=owner.html.replace('<head>','<head><script>const SyntheticDate=Date;globalThis.Date=class extends SyntheticDate{constructor(...args){super(...(args.length?args:['+clock+']));}static now(){return '+clock+';}};globalThis.__monthlyPeriodErrors=[];addEventListener("error",e=>__monthlyPeriodErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>__monthlyPeriodErrors.push(String(e.reason?.message||e.reason)));</script>');
 const server=http.createServer(async(req,res)=>{
  if(!req.url.startsWith('/api/')){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);return;}
  requests.push({method:req.method,path:req.url,contract:req.headers['x-braza-client-contract']??null});
  const headers={'content-type':'application/json','cache-control':'no-store'};let value=null;
  try{
   if(req.method!=='GET'){res.writeHead(405,headers);res.end('{"error":"SYNTHETIC_READ_ONLY"}');return;}
   const url=new URL(req.url,'http://synthetic.invalid');
   if(url.pathname==='/api/admin/bootstrap')value={schema:'admin_bootstrap_v1',csrf:owner.session.csrf};
   else if(url.pathname==='/api/admin/state')value=owner.session;
   else if(url.pathname==='/api/admin/finance/business-month-view'){assert.equal(req.headers['x-braza-client-contract'],'business-month-view-v4');value=data.views.get(url.searchParams.get('month'));headers['x-braza-client-contract']='business-month-view-v4';}
   res.writeHead(value?200:503,headers);res.end(JSON.stringify(value||{error:'SYNTHETIC_OPTIONAL_SOURCE_UNAVAILABLE'}));
  }catch(error){failure=error.message;res.writeHead(500,headers);res.end('{"error":"SYNTHETIC_FIXTURE_FAILURE"}');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let cdp;const proofs=[];
 try{
  cdp=await browser();await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width===320});
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/admin?tab=agent-finance&month=2026-11'});
  await waitFor(cdp,"document.readyState==='complete'&&brazaMonthDashboard?.getSnapshot?.().month==='2026-11'&&brazaMonthDashboard.getSnapshot().presentation?.state==='BEFORE_MONTHLY_COSTS'&&!brazaMonthDashboard.getSnapshot().period_loading",'November subtotal must initialize');
  const inspect=()=>cdp.evaluate(`(()=>{const s=brazaMonthDashboard.getSnapshot();return {snapshot:s,label:document.getElementById('businessMonthNetLabel').textContent,value:document.getElementById('businessMonthNet').textContent.replace(/\\s/g,' '),help:document.getElementById('businessMonthNetHelp').textContent,action:document.getElementById('businessMonthPartialAction')?.textContent,month:document.getElementById('mlsAgentPeriodMonth').value,urlMonth:new URL(location.href).searchParams.get('month'),financeLabel:document.getElementById('mission-finance-label-0').textContent,financeValue:document.getElementById('mission-finance-metric-0').textContent.replace(/\\s/g,' '),financeHelp:document.getElementById('mission-finance-hint-0').textContent,financeTone:document.getElementById('mission-finance-metric-0').dataset.resultTone,registryMonth:mlsAgentRegistry.getSnapshot().month,overflow:document.documentElement.scrollWidth>innerWidth+1,errors:__monthlyPeriodErrors};})()`);
  await waitFor(cdp,"document.getElementById('mission-finance-label-0').textContent==='Saldo parcial antes de outras despesas'",'Finance must share the displayed partial month');
  const november=await inspect();assert.equal(november.label,'Saldo parcial antes de outras despesas');assert.equal(november.value,money(81275));assert.match(november.help,/despesas não declaradas/);assert.match(november.help,/sem assumir valor zero/);assert.match(november.help,/não é lucro líquido final/);assert.match(november.action,/despesas/);assert.equal(november.snapshot.balance_cents,null);assert.equal(november.snapshot.presentation.amount_cents,81275);assert.equal(november.snapshot.presentation.expenses_included,false);assert.equal(november.financeValue,november.value);assert.equal(november.financeTone,'partial');assert.equal(november.registryMonth.balance_cents,null);
  const overviewDailyAds=await cdp.evaluate("document.getElementById('commandCenterAds').textContent");
  const assertAdsMonth=async(month,spend,last)=>{
   await waitFor(cdp,"document.getElementById('mission-ads-metric-0').textContent.replace(/\\s/g,' ')==="+JSON.stringify(money(spend)),'the Ads agent must use its selected monthly investment');
   const proof=await cdp.evaluate("({label:document.getElementById('mission-ads-label-0').textContent,value:document.getElementById('mission-ads-metric-0').textContent.replace(/\\s/g,' '),help:document.getElementById('mission-ads-hint-0').textContent,roasLabel:document.getElementById('mission-ads-label-1').textContent,roas:document.getElementById('mission-ads-metric-1').textContent,roasScope:document.getElementById('mission-ads-hint-1').textContent,snapshot:brazaMonthDashboard.getAdsSnapshot(),registry:mlsAgentRegistry.getSnapshot().agents.find(item=>item.id==='ads'),agentCard:document.getElementById('missionHubMetric-ads')?.textContent.replace(/\\s/g,' '),overviewDaily:document.getElementById('commandCenterAds').textContent})");
   assert.equal(proof.label,'Investimento do mês');assert.equal(proof.value,money(spend));assert.doesNotMatch(proof.help,/dados da mesma data do resumo diário/i);assert.equal(proof.snapshot.month,month);assert.equal(proof.snapshot.expense_cents,spend);assert.equal(proof.registry.metric,spend);assert.ok(proof.agentCard.includes(money(spend)),'the saved-agent card must use the same monthly investment');
   assert.match(proof.roasLabel,/ROAS.*mês/);assert.equal(proof.roas,(98765/spend).toFixed(2).replace('.',',')+'x');assert.ok(proof.roasScope.includes('01/'+month.slice(5)));assert.ok(proof.roasScope.includes(String(last).padStart(2,'0')+'/'+month.slice(5)));assert.match(proof.roasScope,/atribuição ampla/);assert.equal(proof.overviewDaily,overviewDailyAds,'the executive daily metric must not acquire the selected monthly expense');
   proofs.push({ads_month:month,...proof});
  };
  // The inline CTA must open the displayed month's expense workbench. This is
  // navigation only; an unavailable optional ledger cannot turn into a save.
  const beforeCta=requests.length;await click(cdp,'businessMonthPartialAction');await waitFor(cdp,"document.getElementById('businessMonthExpensesDetails').open",'partial subtotal CTA opens expense controls');
  assert.ok(requests.slice(beforeCta).every(row=>row.method==='GET'));assert.equal(await cdp.evaluate("document.getElementById('businessMonthExpensesDetails').open"),true);
  await drainSavedReads(cdp,'2026-11');
  // Finish this optional-workbench flow before measuring period navigation.
  // An open expense ledger legitimately reads its own saved month and Chrome
  // can restore that details state on reload; it is not an Ads-panel request.
  await cdp.evaluate("document.getElementById('businessMonthExpensesDetails').open=false;new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");await drainSavedReads(cdp,'2026-11');
  for(const id of ['mlsAgentPeriod','businessMonthNetCard']){
   await cdp.evaluate(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({block:'start',behavior:'instant'})`);await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   const geometry=await cdp.evaluate(`(()=>{const n=document.getElementById(${JSON.stringify(id)}),r=n.getBoundingClientRect(),h=document.querySelector('.topbar').getBoundingClientRect();return {id:n.id,top:r.top,bottom:r.bottom,headerBottom:h.bottom,left:r.left,right:r.right,visible:n.checkVisibility({checkVisibilityCSS:true}),overflow:document.documentElement.scrollWidth>innerWidth+1};})()`);
   assert.equal(geometry.visible,true);assert.ok(geometry.top>=geometry.headerBottom+2,JSON.stringify(geometry));assert.equal(geometry.overflow,false);proofs.push(geometry);
  }
  const initialHistoryLength=await cdp.evaluate('history.length');
  const beforeOctober=requests.length;await click(cdp,'mlsAgentPeriodPrevious');await waitFor(cdp,"brazaMonthDashboard.getSnapshot().month==='2026-10'&&brazaMonthDashboard.getSnapshot().presentation?.ads_pending===true&&!brazaMonthDashboard.getSnapshot().period_loading",'October saved subtotal must render');
  assert.equal(await cdp.evaluate('history.length'),initialHistoryLength+1,'a shared month choice must add one navigable history entry even if the daily controller replaces month/date');
  assert.equal(onlySaved(requests.slice(beforeOctober)).length,1);await waitFor(cdp,"document.getElementById('mission-finance-label-0').textContent==='Saldo parcial · anúncios em conferência'",'Finance must follow the historical saved Ads subtotal');const october=await inspect();assert.equal(october.value,money(144718));assert.equal(october.label,'Saldo parcial · anúncios em conferência');assert.match(october.help,/leitura salva de/);assert.match(october.help,/31\/10\/2026/);assert.match(october.help,/último dia.*parcial/);assert.equal(october.snapshot.presentation.ads_day_partial,true);assert.equal(october.snapshot.presentation.ads_checked_at,data.frames.get('2026-10').ads.fetched_at);assert.ok(october.snapshot.pending.includes('ADS_UNAVAILABLE'));assert.equal(october.snapshot.balance_cents,null);assert.equal(october.month,'2026-10');assert.equal(october.urlMonth,'2026-10');assert.equal(october.financeValue,october.value);assert.equal(october.financeTone,'partial');assert.match(october.financeHelp,/Devoluções/);assert.match(october.financeHelp,/revisão/);assert.ok(october.registryMonth.pending.includes('ADS_UNAVAILABLE'));
  const beforeBack=requests.length;await cdp.evaluate('history.back()');await waitFor(cdp,"new URL(location.href).searchParams.get('month')==='2026-11'&&brazaMonthDashboard.getSnapshot().month==='2026-11'&&brazaMonthDashboard.getSnapshot().presentation?.state==='BEFORE_MONTHLY_COSTS'&&!brazaMonthDashboard.getSnapshot().period_loading",'browser back must restore November, not leave the app');assert.equal(onlySaved(requests.slice(beforeBack)).length,1);
  const beforeForward=requests.length;await cdp.evaluate('history.forward()');await waitFor(cdp,"new URL(location.href).searchParams.get('month')==='2026-10'&&brazaMonthDashboard.getSnapshot().month==='2026-10'&&brazaMonthDashboard.getSnapshot().presentation?.ads_pending===true&&!brazaMonthDashboard.getSnapshot().period_loading",'browser forward must restore October');assert.equal(onlySaved(requests.slice(beforeForward)).length,1);assert.equal(await cdp.evaluate('history.length'),initialHistoryLength+1);
  assert.deepEqual((await inspect()).errors,[]);
  const beforeReload=requests.length;await cdp.send('Page.reload',{ignoreCache:true});await waitFor(cdp,"document.readyState==='complete'&&globalThis.brazaMonthDashboard?.getSnapshot?.().month==='2026-10'&&brazaMonthDashboard.getSnapshot().presentation?.ads_pending===true&&!brazaMonthDashboard.getSnapshot().period_loading",'a hard reload must preserve the historical month and its saved subtotal');assert.equal(onlySaved(requests.slice(beforeReload)).length,1);const reloaded=await inspect();assert.equal(reloaded.month,'2026-10');assert.equal(reloaded.urlMonth,'2026-10');assert.equal(reloaded.value,money(144718));assert.deepEqual(reloaded.errors,[]);
  await drainSavedReads(cdp,'2026-10');const beforePanels=requests.length;
  for(const agent of ['finance','ads','products','production','returns','auditor','hermes']){
   await cdp.evaluate(`openTab('agent-${agent}',{focus:true})`);
   const pane=await cdp.evaluate("({panel:document.documentElement.dataset.activePanel,month:document.getElementById('mlsAgentPeriodMonth').value,urlMonth:new URL(location.href).searchParams.get('month'),visible:!document.getElementById('mlsAgentPeriod').hidden,scope:document.getElementById('mlsAgentPeriodScope').textContent,overflow:document.documentElement.scrollWidth>innerWidth+1})");
   assert.equal(pane.panel,'agent-'+agent);assert.equal(pane.month,'2026-10');assert.equal(pane.urlMonth,'2026-10');assert.equal(pane.visible,true);assert.equal(pane.overflow,false);if(agent==='products')assert.match(pane.scope,/fontes atuais/);if(agent==='production')assert.match(pane.scope,/fila DTF é atual/);if(agent==='ads')await assertAdsMonth('2026-10',54321,31);proofs.push(pane);
  }
  assert.equal(onlySaved(requests.slice(beforePanels)).length,0,'all agents reuse the same saved financial month');
  const beforeNovember=requests.length;await click(cdp,'mlsAgentPeriodNext');await waitFor(cdp,"brazaMonthDashboard.getSnapshot().month==='2026-11'&&brazaMonthDashboard.getSnapshot().presentation?.state==='BEFORE_MONTHLY_COSTS'&&!brazaMonthDashboard.getSnapshot().period_loading",'November must return without a provider refresh');assert.equal(onlySaved(requests.slice(beforeNovember)).length,1);
  await drainSavedReads(cdp,'2026-11');const beforeAdsNovember=requests.length;await cdp.evaluate("openTab('agent-ads',{focus:true})");await assertAdsMonth('2026-11',24123,2);assert.equal(requests.length,beforeAdsNovember,'opening the Ads specialist must reuse the saved monthly expense and ROAS: '+JSON.stringify(requests.slice(beforeAdsNovember)));
  await cdp.evaluate("openTab('agent-finance',{focus:true});const input=document.getElementById('businessMonthExpensesValue');input.value='17,29';input.dispatchEvent(new Event('input',{bubbles:true}));");
  const beforeGuard=requests.length;assert.equal(await cdp.evaluate("mlsAgentPeriod.selectMonth('2026-10')"),false);assert.equal(requests.length,beforeGuard);assert.equal(await cdp.evaluate("document.getElementById('businessMonthExpensesValue').value"),'17,29');assert.equal(await cdp.evaluate("document.getElementById('mlsAgentPeriodMonth').value"),'2026-11');
  for(const invalid of ['2026-12','2026-13','2026-00','2026-1','1999-12'])assert.equal(await cdp.evaluate('mlsAgentPeriod.selectMonth('+JSON.stringify(invalid)+')'),false);
  assert.equal(requests.length,beforeGuard);const final=await inspect();assert.equal(final.value,money(81275));assert.deepEqual(final.errors,[]);assert.equal(final.overflow,false);assert.equal(failure,null);
  assert.equal(cdp.providerRequests.length,0);assert.equal(requests.filter(row=>row.method!=='GET').length,0);assert.equal(requests.filter(row=>/^\/api\/admin\/finance\/(?:business-month|ads-calendar)(?:$|\?)/.test(row.path)).length,0,'period navigation cannot start or advance collection');
  assert.equal(JSON.stringify([...data.frames]),data.original);assert.equal(JSON.stringify([...data.frames].map(([month,value])=>[month,value.result])),data.strict);
  results.push({minify,width,pass:true,page_errors:0,horizontal_overflow:false,original_financial_frame_unchanged:true,strict_result_unchanged:true,no_new_provider_calls:0,owner_mutation_requests:0,remote_writes:0,period_switches_saved_reads_only:true,month_switch_saved_reads:2,browser_back_forward_saved_reads:2,historical_hard_reload_saved_reads:1,november_partial:november.value,october_saved_subtotal:october.value,proofs});
 }finally{await cdp?.close();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
});

after(()=>{
 if(!output||results.length!==4)return;assert.equal(artifactHash(),generatedHash,'QA must stay bound to one final generated artifact');mkdirSync(output,{recursive:true});
 writeFileSync(path.join(output,'monthly-net-period-chrome-qa.json'),JSON.stringify({schema:'mls_monthly_net_period_chrome_qa_v1',generated_app_sha256:generatedHash,synthetic:true,real_owner_authenticated:false,original_financial_frame_unchanged:true,strict_result_unchanged:true,no_new_provider_calls:0,owner_mutation_requests:0,remote_writes:0,period_switches_saved_reads_only:true,results},null,2)+'\n');
});
