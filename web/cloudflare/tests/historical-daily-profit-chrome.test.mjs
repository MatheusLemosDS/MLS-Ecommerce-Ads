import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import http from './browser-assets-http-fixture.mjs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdtempSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {createChromeProfileCleanup} from './chrome-profile-cleanup.mjs';
import {waitForChromeDebugPort} from './chrome-debug-port.mjs';
import {collectionFixture} from './business-collection-fixture.mjs';
import {SCHEMA} from '../src/admin.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {readBusinessMonthDisplay} from '../src/business-month.mjs';
import {buildBusinessMonthView} from '../src/business-month-view-state.mjs';
import {readHistoricalDailyBusinessSummary} from '../src/business-daily-history.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const reportPath=process.env.MLS_HISTORICAL_PROFIT_QA_FILE||null,screenDir=process.env.MLS_HISTORICAL_PROFIT_SCREENSHOT_DIR||null,results=[];
const workerHashes=()=>Object.fromEntries(['app','auth','finance'].map(name=>[name,createHash('sha256').update(readFileSync(new URL('../../../dist/'+name+'-worker.mjs',import.meta.url))).digest('hex')]));
let frozenWorkers=null;

async function browser(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-historical-profit-')),child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'}),cleanup=createChromeProfileCleanup(child,profile);let socket;
 try{
  const port=await waitForChromeDebugPort(child,profile);let page;for(let n=0;n<100;n++){try{page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(row=>row.type==='page'&&row.webSocketDebuggerUrl);}catch{}if(page)break;await pause(50);}assert.ok(page,'Chrome must expose its real page target');
  socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('HISTORICAL_PROFIT_CDP_OPEN_TIMEOUT')),10000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('HISTORICAL_PROFIT_CDP_OPEN_ERROR'));},{once:true});});
  let serial=0;const pending=new Map();socket.addEventListener('message',event=>{const value=JSON.parse(event.data),call=pending.get(value.id);if(!call)return;pending.delete(value.id);clearTimeout(call.timer);value.error?call.reject(Error(value.error.message||'HISTORICAL_PROFIT_CDP_ERROR')):call.resolve(value.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('HISTORICAL_PROFIT_CDP_TIMEOUT:'+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});await send('Page.enable');await send('Runtime.enable');
  return {send,async evaluate(expression){const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value;},close:()=>cleanup(socket)};
 }catch(error){await cleanup(socket);throw error;}
}

// Every sale/payment/Ads source is collected through the real source pipeline
// into fresh synthetic stores. Only explicit append-only audited prices and
// confirmed bindings are eligible for the historical overview reference.
async function fixture(){
 const f=await collectionFixture({daily:true,allPaid:true,windowCounts:[2,1],paymentDelayMs:0}),db=f.env.ADMIN_DB;
 const close=()=>{db.db.close();f.financeEnv.FINANCE_DB.db.close();};
 try{
  await db.batch(SCHEMA.map(sql=>db.prepare(sql)));let state=await f.invoke('start');for(let n=0;state.status==='RUNNING'&&n<20;n++){f.clock.time+=Math.max(1,state.collection?.retry_after_seconds??0)*1000;state=await f.invoke('step');}assert.equal(state.status,'COMPLETE');await f.invoke('ads');
  const stamp=day=>day+'T12:00:00.000Z',bindings=db.db.prepare('SELECT payload FROM variant_bindings_state WHERE id=1').get().payload,rules=JSON.stringify({rules:[]});
  db.db.exec('DELETE FROM production_costs_audit;DELETE FROM variant_bindings_audit;DELETE FROM production_cost_rules_audit');
  for(const [revision,amount,at]of [[1,1000,stamp('2026-10-01')],[2,1200,stamp('2026-10-14')]])db.db.prepare('INSERT INTO production_costs_audit(revision,payload,actor,created_at) VALUES(?,?,?,?)').run(revision,JSON.stringify({...COST_DEFAULTS,inclusive_regular_cents:amount}),'synthetic-owner',at);
  db.db.prepare('UPDATE production_costs_state SET revision=2,payload=?,updated_at=? WHERE id=1').run(JSON.stringify({...COST_DEFAULTS,inclusive_regular_cents:1200}),stamp('2026-10-14'));
  db.db.prepare('UPDATE variant_bindings_state SET revision=1,updated_at=? WHERE id=1').run(stamp('2026-10-01'));db.db.prepare('INSERT INTO variant_bindings_audit(revision,payload,actor,created_at) VALUES(1,?,?,?)').run(bindings,'synthetic-owner',stamp('2026-10-01'));
  db.db.prepare('UPDATE production_cost_rules_state SET revision=1,payload=?,updated_at=? WHERE id=1').run(rules,stamp('2026-10-01'));db.db.prepare('INSERT INTO production_cost_rules_audit(revision,payload,actor,created_at) VALUES(1,?,?,?)').run(rules,'synthetic-owner',stamp('2026-10-01'));
  const sync={enabled:true,status:'COMPLETE',next_run_at:Math.floor(f.now()/1000)+60,last_attempt_at:Math.floor(f.now()/1000)-5};
  const read=async()=>{const observed=await readBusinessMonthDisplay(f.env,{month:'2026-10'},{now:f.now}),legacy=buildBusinessMonthView(observed,sync,{now:f.now,contract:'business-month-view-v5'}),historicalDailySummary=await readHistoricalDailyBusinessSummary(f.env,observed,legacy.daily_summary,{now:f.now});return buildBusinessMonthView(observed,sync,{now:f.now,contract:'business-month-view-v6',historicalDailySummary});};
  const full=await read();assert.equal(full.historical_daily_summary.days[9].production_cost_cents,2000);assert.equal(full.historical_daily_summary.days[9].estimate_cents,7060);
  // A later supplier-cost reduction must change the explicit current-price
  // reference, while leaving prior audited sale-date costs/profit unchanged.
  const drop=JSON.stringify({...COST_DEFAULTS,inclusive_regular_cents:500}),changedAt=stamp('2026-10-24');db.db.prepare('INSERT INTO production_costs_audit(revision,payload,actor,created_at) VALUES(3,?,?,?)').run(drop,'synthetic-owner',changedAt);db.db.prepare('UPDATE production_costs_state SET revision=3,payload=?,updated_at=? WHERE id=1').run(drop,changedAt);
  const reduced=await read();assert.equal(reduced.historical_daily_summary.days[9].estimate_cents,7060);assert.equal(reduced.daily_summary.days[9].estimate_cents,8060);assert.notEqual(full.daily_summary.days[9].estimate_cents,reduced.daily_summary.days[9].estimate_cents);
  // One identity only becomes confirmed after the sale day. Today’s valid
  // complete catalogue/bindings cannot be substituted into the older date.
  const prior=JSON.stringify(JSON.parse(bindings).filter(row=>row.item_id!=='1000'));db.db.prepare('UPDATE variant_bindings_audit SET payload=? WHERE revision=1').run(prior);db.db.prepare('INSERT INTO variant_bindings_audit(revision,payload,actor,created_at) VALUES(2,?,?,?)').run(bindings,'synthetic-owner',changedAt);db.db.prepare('UPDATE variant_bindings_state SET revision=2,updated_at=? WHERE id=1').run(changedAt);
  const partial=await read();assert.equal(partial.daily_summary.days[9].estimate_cents,8060);assert.equal(partial.historical_daily_summary.days[9].estimate_cents,null);assert.equal(partial.historical_daily_summary.days[9].production_coverage.pending_units,1);assert.equal(partial.historical_daily_summary.days[9].known_estimate_cents,8060);
  db.db.prepare('DELETE FROM production_costs_audit WHERE revision=1').run();const missing=await read();assert.equal(missing.historical_daily_summary.days[9].estimate_cents,null);
  const mismatch=structuredClone(reduced);mismatch.historical_daily_summary.publication_revision++;
  const absent=structuredClone(reduced);absent.historical_daily_summary=null;
  return {views:{full,reduced,partial,missing,mismatch,absent},now:f.now(),providerCalls:()=>JSON.stringify(f.calls),close};
 }catch(error){close();throw error;}
}

async function waitFor(cdp,expression,label){for(let n=0;n<180;n++){if(await cdp.evaluate(expression))return;await pause(50);}assert.fail(label+' '+JSON.stringify(await cdp.evaluate('({errors:globalThis.__historyErrors,snapshot:globalThis.brazaDayDashboard?.getSnapshot?.(),month:globalThis.brazaMonthDashboard?.getSnapshot?.()?.month})')));}

for(const minify of [false,true])for(const width of [320,1365])test(`generated overview uses audited historical daily costs and rejects current-price fallback (${width}px,minify=${minify})`,{timeout:150000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');const hashes=workerHashes();if(frozenWorkers)assert.deepEqual(hashes,frozenWorkers);else frozenWorkers=hashes;
 const data=await fixture(),sourcesBefore=JSON.stringify(data.views),providersBefore=data.providerCalls(),owner=await compiledOwnerReportPage(minify,{ownerPreview:false,localReadSnapshot:true}),cached=new Map(owner.localReadSnapshot.responses.map(row=>[row.path,row])),requests=[];let selectedView='full',failure=null;
 const html=owner.html.replace('<head>','<head><script>const HistoryNativeDate=Date;globalThis.Date=class extends HistoryNativeDate{constructor(...args){super(...(args.length?args:['+data.now+']));}static now(){return '+data.now+';}};globalThis.__historyErrors=[];addEventListener("error",e=>__historyErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>__historyErrors.push(String(e.reason?.message||e.reason)));</script>').replace('<body>','<body><div style="position:fixed;right:3px;bottom:3px;z-index:99999;pointer-events:none;font:9px monospace;background:#fff;color:#000">QA SINTÉTICA · SEM DADOS REAIS</div>');
 const server=http.createServer((req,res)=>{try{
  if(!req.url.startsWith('/api/')){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);return;}
  requests.push({method:req.method,path:req.url});assert.equal(req.method,'GET','viewing historical profit cannot create financial/physical facts');const url=new URL(req.url,'http://synthetic.invalid'),headers={'content-type':'application/json','cache-control':'no-store'};let body=null;
  if(url.pathname==='/api/admin/finance/business-month-view'){assert.equal(req.headers['x-braza-client-contract'],'business-month-view-v6');body=url.searchParams.get('month')==='2026-10'?data.views[selectedView]:null;headers['x-braza-client-contract']='business-month-view-v6';}
  else{const entry=cached.get(req.url);if(entry){body=entry.body;if(entry.contract)headers['x-braza-client-contract']=entry.contract;}}
  res.writeHead(body?200:503,headers);res.end(JSON.stringify(body||{error:'SYNTHETIC_OPTIONAL_SOURCE_UNAVAILABLE'}));
 }catch(error){failure=error.message;res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"SYNTHETIC_QA_FAILURE"}');}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let cdp;
 try{
  cdp=await browser();await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===320});const proofs=[];
  for(const scenario of ['full','reduced','partial','missing','absent','mismatch']){
   selectedView=scenario;await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/admin?tab=overview&month=2026-10&date=2026-10-10&historycase='+scenario});
   await waitFor(cdp,"document.readyState==='complete'&&!!globalThis.brazaDayDashboard&&!!globalThis.mlsAgentRegistry",'generated owner app must initialize');
   if(!['mismatch','absent'].includes(scenario))await waitFor(cdp,"brazaMonthDashboard.getSnapshot()?.month==='2026-10'&&brazaDayDashboard.getSnapshot()?.sales_cents!==null",'compatible saved sources must hydrate');
   else if(scenario==='absent')await waitFor(cdp,"brazaMonthDashboard.getSnapshot()?.month==='2026-10'&&document.getElementById('businessDayStatus').textContent.includes('conferência')",'absent historical contract must remain pending');
   else await waitFor(cdp,"document.getElementById('businessMonthStatus').textContent.includes('Não foi possível conferir')",'mismatched publication identity must fail closed');
   await cdp.evaluate('mlsAgentRegistry.refresh();mlsMissionTrends.refresh();');
   const proof=await cdp.evaluate("(()=>{const row=brazaDayDashboard.getSnapshot(),trend=brazaDayDashboard.getTrend();return {scenario:"+JSON.stringify(scenario)+",net:row?.net_cents,basis:row?.net_basis,presentation:row?.presentation?.state,sales:row?.sales_cents,ads:row?.ads_spend_cents,production:row?.production_coverage,label:document.getElementById('commandCenterNetLabel').textContent,value:document.getElementById('commandCenterNet').textContent,daily:document.getElementById('businessDayNet').textContent,waterfall:document.getElementById('businessDayWaterfall').textContent,points:trend?.points?.map(point=>({date:point.date,net:point.net_cents,basis:point.net_basis}))??[],selected:brazaDayDashboard.getSelection(),agentCount:document.querySelectorAll('#commandCenterAgents>.agent-card').length,errors:__historyErrors,width:innerWidth,scroll:document.documentElement.scrollWidth};})()");
   assert.equal(proof.selected,'2026-10-10');assert.equal(proof.agentCount,6,'the six operational agents remain visible');assert.deepEqual(proof.errors,[]);assert.ok(proof.scroll<=proof.width+1,'historical state keeps V4.1 mobile/desktop bounds');
   if(['full','reduced'].includes(scenario)){assert.equal(proof.net,7060);assert.equal(proof.basis,'ESTIMATE');assert.match(proof.value,/70,60/);assert.match(proof.daily,/70,60/);assert.match(proof.label,/Lucro estimado/);assert.equal(proof.points.find(row=>row.date==='2026-10-10')?.net,7060);assert.equal(proof.sales,13050);assert.equal(proof.ads,125);}
   else{assert.equal(proof.net,null,'missing dated price cannot become today’s full profit');assert.equal(proof.basis,null);assert.equal(proof.daily,'Em apuração');assert.doesNotMatch(proof.value,/80,60|70,60|R\$\s*0/);assert.ok(proof.points.every(row=>row.date!=='2026-10-10'||row.net===null),'unknown historical day is a chart gap, never a partial subtotal');}
   if(scenario==='partial'){assert.equal(proof.production.pending_units,1);assert.equal(proof.sales,13050);assert.equal(proof.ads,125);assert.match(proof.waterfall,/Saldo após custos conhecidos/);assert.doesNotMatch(proof.label,/^Lucro estimado/,'a known-cost subtotal cannot be labelled as profit');}
   if(screenDir&&['full','partial','missing'].includes(scenario)){mkdirSync(screenDir,{recursive:true});await cdp.evaluate("document.querySelector('#commandCenter>.command-center-metrics').scrollIntoView({block:'center',behavior:'instant'})");const shot=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});writeFileSync(path.join(screenDir,(minify?'min':'normal')+'-'+width+'-'+scenario+'.png'),Buffer.from(shot.data,'base64'));}
   proofs.push(proof);
  }
  assert.equal(JSON.stringify(data.views),sourcesBefore,'browser display cannot rewrite financial source DTOs');assert.equal(data.providerCalls(),providersBefore,'display never recollects provider data');assert.ok(requests.length>0&&requests.every(row=>row.method==='GET'));assert.equal(failure,null);results.push({minify,width,pass:true,remote_writes:0,new_provider_calls:0,owner_mutation_requests:0,proofs});
 }finally{await cdp?.close();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));data.close();}
});

after(()=>{if(frozenWorkers)assert.deepEqual(workerHashes(),frozenWorkers,'all browser cases use one frozen generated Worker vector');if(reportPath){mkdirSync(path.dirname(reportPath),{recursive:true});writeFileSync(reportPath,JSON.stringify({schema:'mls_historical_daily_profit_chrome_v1',generated_hashes:frozenWorkers,synthetic:true,real_account_acceptance:false,remote_writes:0,new_provider_calls:0,owner_mutation_requests:0,results},null,2)+'\n');}});
