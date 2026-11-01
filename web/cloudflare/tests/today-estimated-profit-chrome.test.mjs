import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {createChromeProfileCleanup} from './chrome-profile-cleanup.mjs';
import {waitForChromeDebugPort} from './chrome-debug-port.mjs';
import {collectionFixture} from './business-collection-fixture.mjs';
import {SCHEMA} from '../src/admin.mjs';
import {businessMonth,readBusinessMonthDisplay} from '../src/business-month.mjs';
import {readBusinessSyncState} from '../src/business-sync.mjs';
import {buildBusinessMonthView} from '../src/business-month-view-state.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function browser(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-today-profit-')),child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'}),cleanup=createChromeProfileCleanup(child,profile);let socket;
 try{
  const port=await waitForChromeDebugPort(child,profile);let page;
  for(let n=0;n<100;n++){try{page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(row=>row.type==='page'&&row.webSocketDebuggerUrl);}catch{}if(page)break;await pause(50);}
  assert.ok(page,'Chrome must expose a real page target');socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('TODAY_CDP_OPEN_TIMEOUT')),10000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('TODAY_CDP_OPEN_ERROR'));},{once:true});});
  let sequence=0;const pending=new Map();socket.addEventListener('message',event=>{const value=JSON.parse(event.data),call=pending.get(value.id);if(!call)return;pending.delete(value.id);clearTimeout(call.timer);value.error?call.reject(Error(value.error.message||'TODAY_CDP_ERROR')):call.resolve(value.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('TODAY_CDP_TIMEOUT:'+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  await send('Page.enable');await send('Runtime.enable');return {send,async evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;},close:()=>cleanup(socket)};
 }catch(error){await cleanup(socket);throw error;}
}

for(const minify of [false,true])test(`owner daily subtotal opens the existing nested expense form and becomes profit after explicit confirmation at320/1365px (minify=${minify})`,{timeout:120000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 const f=await collectionFixture({daily:true,windowCounts:[3,0],paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});await f.env.ADMIN_DB.batch(SCHEMA.map(sql=>f.env.ADMIN_DB.prepare(sql)));
 let frame=await f.invoke('start');for(let n=0;frame.status==='RUNNING'&&n<20;n++)frame=await f.invoke('step');assert.equal(frame.status,'COMPLETE');await f.invoke('ads');
 assert.deepEqual([frame.coverage.orders,frame.coverage.paid,frame.coverage.cancelled,frame.coverage.unpaid],[3,1,1,1]);
 const readView=async()=>buildBusinessMonthView(await readBusinessMonthDisplay(f.env,{month:'2026-10'},{now:f.now}),await readBusinessSyncState(f.env),{now:f.now,contract:'business-month-view-v4'});
 const resetExpenses=()=>{f.env.ADMIN_DB.db.prepare('DELETE FROM business_month_expenses WHERE month=?').run('2026-10');f.env.ADMIN_DB.db.prepare('DELETE FROM business_month_expenses_audit WHERE month=?').run('2026-10');};resetExpenses();let view=await readView();
 const owner=await compiledOwnerReportPage(minify,{ownerPreview:false,localReadSnapshot:true}),local=new Map(owner.localReadSnapshot.responses.map(row=>[row.path,row])),requests=[],posts=[];let serverFailure=null;
 const html=owner.html.replace('<head>','<head><script>const TodayFixtureDate=Date;globalThis.Date=class extends TodayFixtureDate{constructor(...args){super(...(args.length?args:['+f.clock.time+']));}static now(){return '+f.clock.time+';}};globalThis.__todayErrors=[];addEventListener("error",e=>__todayErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>__todayErrors.push(String(e.reason?.message||e.reason)));</script>');
 const host=http.createServer(async(req,res)=>{
  try{
   if(!req.url.startsWith('/api/')){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);return;}
   const route=new URL(req.url,'http://synthetic.invalid'),headers={'content-type':'application/json','cache-control':'no-store'};requests.push({method:req.method,path:req.url});let value=null;
   if(req.method==='GET'&&route.pathname==='/api/admin/finance/business-month-view'&&route.searchParams.get('month')==='2026-10'){value=view;headers['x-braza-client-contract']='business-month-view-v4';}
   else if(req.method==='POST'&&route.pathname==='/api/admin/finance/business-month'){
    assert.ok(req.headers['x-csrf-token']===owner.session.csrf,'the real owner API client must attach this session’s CSRF token');let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);assert.deepEqual(body,{operation:'expenses',month:'2026-10',revision:0,external_expenses_cents:0,recharge_treatment:'UNCONFIRMED'});posts.push(body);value=await businessMonth(f.env,body,f.services,{now:f.now,actor:'synthetic-owner-confirmed-zero'});view=await readView();
   }else{const entry=local.get(req.url);if(req.method==='GET'&&entry){value=entry.body;if(entry.contract)headers['x-braza-client-contract']=entry.contract;}}
   res.writeHead(value?200:503,headers);res.end(JSON.stringify(value||{error:'SYNTHETIC_UNMAPPED_SOURCE'}));
  }catch(error){serverFailure=error.message;res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"SYNTHETIC_HANDLER_FAILED"}');}
 });
 await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve));let cdp;const before={finance:f.calls.finance.length,ads:f.calls.ads.length,list:f.calls.list.length,detail:f.calls.detail.length,payment:f.calls.payment.length};
 try{
  cdp=await browser();
  for(const width of [320,1365]){
   resetExpenses();view=await readView();const priorPosts=posts.length;
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width===320});await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+host.address().port+'/admin?tab=overview&date=2026-10-10&month=2026-10'});
   let ready=false;for(let n=0;n<160;n++){if(await cdp.evaluate("document.readyState==='complete'&&globalThis.mlsAgentRegistry?.getSnapshot?.()?.day?.presentation?.state==='BEFORE_MONTHLY_COSTS'")){ready=true;break;}await pause(50);}assert.ok(ready,'the generated owner application must load its validated partial daily result');
   const partial=await cdp.evaluate("(()=>{const r=mlsAgentRegistry.getSnapshot();return {label:document.getElementById('commandCenterNetLabel').textContent,value:document.getElementById('commandCenterNet').textContent,state:document.getElementById('missionProfitState').textContent,net:r.day.net_cents,margin:r.day.margin_bps,paid:r.day.paid_orders,sales:r.day.sales_cents,ads:r.day.ads_spend_cents,partial:r.day.presentation.amount_cents,profitPoints:brazaDayDashboard.getTrend().points.map(row=>row.net_cents),errors:__todayErrors,width:innerWidth,scroll:document.documentElement.scrollWidth};})()");
   assert.equal(partial.label,'Saldo parcial · 10/10/2026');assert.match(partial.value,/27,59/);assert.equal(partial.state,'Despesas do mês pendentes');assert.equal(partial.net,null);assert.equal(partial.margin,null);assert.equal(partial.paid,1,'cancelled and unpaid orders cannot inflate the daily paid metrics');assert.equal(partial.sales,6525);assert.equal(partial.ads,125);assert.equal(partial.partial,2759);assert.ok(partial.profitPoints.every(value=>value===null),'a before-expense subtotal cannot be plotted as profit');assert.deepEqual(partial.errors,[]);assert.ok(partial.scroll<=partial.width+1);assert.equal(posts.length,priorPosts,'opening the partial result cannot save zero expenses');
   await cdp.evaluate("document.getElementById('commandCenterNetAction').scrollIntoView({block:'center',behavior:'instant'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
   const target=await cdp.evaluate("(()=>{const n=document.getElementById('commandCenterNetAction'),r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,height:r.height};})()");assert.ok(target.height>=44,'the confirmation link must remain a real touch target');
   await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:target.x,y:target.y});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:target.x,y:target.y});await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   const form=await cdp.evaluate("(()=>{const n=document.getElementById('businessMonthExpensesForm'),details=[];for(let p=n.parentElement;p;p=p.parentElement)if(p.localName==='details')details.push({id:p.id,open:p.open});return {visible:n.checkVisibility({checkVisibilityCSS:true}),details,panel:document.documentElement.dataset.activePanel,hash:location.hash,month:document.getElementById('businessMonthSelect').value};})()");
   assert.equal(form.panel,'agent-finance');assert.equal(form.hash,'#businessMonthExpensesForm');assert.equal(form.month,'2026-10');assert.equal(form.visible,true,'the CTA must reveal the existing expense form '+JSON.stringify(form));assert.ok(form.details.length>=2);assert.ok(form.details.every(row=>row.open),'both existing nested detail disclosures must open');
   await cdp.evaluate("document.getElementById('businessMonthExpensesZero').click()");let complete=false;for(let n=0;n<120;n++){if(await cdp.evaluate("mlsAgentRegistry.getSnapshot()?.day?.net_basis==='ESTIMATE'&&mlsAgentRegistry.getSnapshot()?.day?.net_cents===2759")){complete=true;break;}await pause(50);}assert.ok(complete,'explicit zero-expense confirmation must update the saved daily result immediately');assert.equal(serverFailure,null);assert.equal(posts.length,priorPosts+1);
   const final=await cdp.evaluate("({label:document.getElementById('commandCenterNetLabel').textContent,state:document.getElementById('missionProfitState').textContent,hidden:document.getElementById('commandCenterNetAction').hidden,errors:__todayErrors})");assert.equal(final.label,'Lucro estimado · 10/10/2026');assert.match(final.state,/Resultado estimado positivo/);assert.equal(final.hidden,true);assert.deepEqual(final.errors,[]);
  }
  assert.deepEqual({finance:f.calls.finance.length,ads:f.calls.ads.length,list:f.calls.list.length,detail:f.calls.detail.length,payment:f.calls.payment.length},before,'owner confirmation must use only the saved financial publication and never query Finance or Ads providers');
  assert.equal(requests.filter(row=>row.method==='POST').length,2);
 }finally{await cdp?.close();host.closeAllConnections?.();await new Promise(resolve=>host.close(resolve));}
});
