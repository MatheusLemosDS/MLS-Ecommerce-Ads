import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdtempSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {createChromeProfileCleanup} from './chrome-profile-cleanup.mjs';
import {waitForChromeDebugPort} from './chrome-debug-port.mjs';
import {D1} from './sqlite-d1.mjs';
import {readIncurredProduction,mutateIncurredProduction} from '../src/incurred-production.mjs';
import {readIncurredProductionWorkspace} from '../src/incurred-production-workspace.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clock=Date.parse('2026-11-26T18:00:00Z'),now=()=>clock,results=[],qaDir=process.env.MLS_PRODUCTION_RANGE_QA_DIR||null;
const workerHashes=()=>Object.fromEntries(['app','auth','finance'].map(name=>[name,createHash('sha256').update(readFileSync(new URL('../../../dist/'+name+'-worker.mjs',import.meta.url))).digest('hex')]));
let sourceWorkers=null;
async function browser(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-manufacture-range-')),child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'}),cleanup=createChromeProfileCleanup(child,profile);let socket;
 try{
  const port=await waitForChromeDebugPort(child,profile);let page;
  for(let index=0;index<100;index++){try{page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(row=>row.type==='page'&&row.webSocketDebuggerUrl);}catch{}if(page)break;await pause(50);}
  assert.ok(page);socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('MANUFACTURE_RANGE_CDP_OPEN_TIMEOUT')),10000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('MANUFACTURE_RANGE_CDP_OPEN_ERROR'));},{once:true});});
  let serial=0;const pending=new Map();socket.addEventListener('message',event=>{const value=JSON.parse(event.data),call=pending.get(value.id);if(!call)return;pending.delete(value.id);clearTimeout(call.timer);value.error?call.reject(Error(value.error.message||'MANUFACTURE_RANGE_CDP_ERROR')):call.resolve(value.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('MANUFACTURE_RANGE_CDP_TIMEOUT:'+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  await send('Page.enable');await send('Runtime.enable');await send('DOM.enable');
  return {send,async evaluate(expression){const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value;},close:()=>cleanup(socket)};
 }catch(error){await cleanup(socket);throw error;}
}
async function waitFor(cdp,expression,label){for(let index=0;index<160;index++){if(await cdp.evaluate(expression))return;await pause(50);}assert.fail(label);}
async function click(cdp,selector){
 const document=await cdp.send('DOM.getDocument'),target=await cdp.send('DOM.querySelector',{nodeId:document.root.nodeId,selector});assert.ok(target.nodeId,selector+' exists');
 await cdp.send('DOM.scrollIntoViewIfNeeded',{nodeId:target.nodeId});await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
 const info=await cdp.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)}),r=n.getBoundingClientRect();return {height:r.height,visible:n.checkVisibility({checkVisibilityCSS:true}),enabled:!n.disabled};})()`);assert.equal(info.visible,true);assert.equal(info.enabled,true);assert.ok(info.height>=44,selector+' needs a44px touch target');
 const quads=await cdp.send('DOM.getContentQuads',{nodeId:target.nodeId}),quad=quads.quads?.[0];assert.equal(quad?.length,8);const x=(quad[0]+quad[2]+quad[4]+quad[6])/4,y=(quad[1]+quad[3]+quad[5]+quad[7])/4;
 await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x,y,modifiers:0});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x,y,modifiers:0});
}
async function manufacturingFixture(){
 const env={ADMIN_DB:new D1()},identity={artwork:'Arte sintética',color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null};let index=0;
 const source={kind:'SAVED_DTF_ORDER_LINE',key:'a'.repeat(64),hash:'b'.repeat(64),checked_at:clock/1000-60,order_hash:'c'.repeat(64),order_status:'CANCELLED',selling_quantity:1};
 async function record(produced_date,quantity,amount,linked=false){const frame=await readIncurredProduction(env,{now});return mutateIncurredProduction(env,{revision:frame.revision,request_id:crypto.randomUUID(),action:'record',record_id:crypto.randomUUID(),production_ref:'SIMULADO: lote '+(++index),replaces_record_id:null,produced_date,quantity,identity:{...identity},source:linked?{kind:source.kind,key:source.key,hash:source.hash}:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:amount,reference:null},evidence:'SIMULADO: fabricação declarada pelo operador',confirmed:true},'synthetic-owner',{now,trustedSource:linked?source:null});}
 await record('2026-10-15',2,1500);await record('2026-10-25',3,2000);await record('2026-11-10',2,0);await record('2026-11-14',1,9999);await record('2026-11-15',3,1250,true);await record('2026-11-20',1,null);await record('2026-11-25',2,1590);await record('2026-11-26',1,6000);
 return {env,read:selected=>readIncurredProductionWorkspace(env,selected,{now}),snapshot:async()=>JSON.stringify(await readIncurredProduction(env,{now})),close:()=>env.ADMIN_DB.db.close()};
}

for(const minify of [false,true])for(const width of [320,1365])test(`generated manufacturing date range uses cached historical costs (${width}px, minify=${minify})`,{timeout:90000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 const currentWorkers=workerHashes();if(sourceWorkers)assert.deepEqual(currentWorkers,sourceWorkers,'the compiled QA matrix must use one frozen Worker build');else sourceWorkers=currentWorkers;
 const owner=await compiledOwnerReportPage(minify,{ownerPreview:false,localReadSnapshot:true}),cached=new Map(owner.localReadSnapshot.responses.map(row=>[row.path,row])),fixture=await manufacturingFixture(),ledgerBefore=await fixture.snapshot(),requests=[];let serverFailure=null;
 const html=owner.html.replace('<head>','<head><script>const ManufactureRangeDate=Date;globalThis.Date=class extends ManufactureRangeDate{constructor(...args){super(...(args.length?args:['+clock+']));}static now(){return '+clock+';}};globalThis.__rangeErrors=[];globalThis.__rangeTrustedClicks=[];addEventListener("error",e=>__rangeErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>__rangeErrors.push(String(e.reason?.message||e.reason)));addEventListener("click",e=>{if(e.isTrusted)__rangeTrustedClicks.push(e.target.closest("button,summary")?.id||"summary");});</script>');
 const host=http.createServer(async(req,res)=>{
  try{
   if(!req.url.startsWith('/api/')){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);return;}
   requests.push({method:req.method,path:req.url});assert.equal(req.method,'GET','date-range reads must not issue an owner mutation');const route=new URL(req.url,'http://synthetic.invalid'),headers={'content-type':'application/json','cache-control':'no-store'};let value=null;
   if(route.pathname==='/api/admin/production/incurred'){assert.deepEqual([...route.searchParams.keys()].sort(),['month','week_of']);value=await fixture.read({month:route.searchParams.get('month'),week_of:route.searchParams.get('week_of')});}
   else{const row=cached.get(req.url);if(row){value=row.body;if(row.contract)headers['x-braza-client-contract']=row.contract;}}
   res.writeHead(value?200:503,headers);res.end(JSON.stringify(value||{error:'SYNTHETIC_UNMAPPED_READ'}));
  }catch(error){serverFailure=error.message;res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"SYNTHETIC_HANDLER_FAILED"}');}
 });
 await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve));let cdp;
 try{
  cdp=await browser();await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===320});await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+host.address().port+'/admin?tab=agent-production#incurredProductionDetails'});
  await waitFor(cdp,"globalThis.brazaIncurredProduction&&!document.getElementById('incurredProductionReload').disabled",'the generated production workspace must start');
  if(!await cdp.evaluate("document.getElementById('incurredProductionDetails').open"))await click(cdp,'#incurredProductionDetails>summary');
  await waitFor(cdp,"!!brazaIncurredProduction.getRangeSnapshot?.()",'the embedded range helper must load from the signed saved-ledger response');await waitFor(cdp,"!!brazaMonthDashboard.getSnapshot()?.month",'the immutable financial month must settle before comparison');
  const range=()=>cdp.evaluate('brazaIncurredProduction.getRangeSnapshot()'),ledgerReads=()=>requests.filter(row=>row.path.startsWith('/api/admin/production/incurred?')).length;
  const originalRange=await range(),financial=await cdp.evaluate('JSON.stringify(brazaMonthDashboard.getSnapshot())');assert.equal(originalRange.start_date,'2026-11-01');assert.equal(originalRange.end_date,'2026-11-26');assert.equal(ledgerReads(),1);
  await click(cdp,'#agent-production .mission-page-tabs a[href="#incurredProductionRecordsPane"]');
  await cdp.evaluate("(()=>{for(const [name,value]of Object.entries({production_ref:'Rascunho sintético preservado',quantity:'9'})){const input=document.querySelector('#incurredProductionForm [name='+name+']');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}})()");
  await click(cdp,'#agent-production .mission-page-tabs a[href="#incurredProductionCalendarTitle"]');await click(cdp,'#incurredProduction a[href="#incurredProductionRangePane"]');
  const apply=async(start,end)=>{await cdp.evaluate(`(()=>{for(const [id,value]of [['incurredProductionStart',${JSON.stringify(start)}],['incurredProductionEnd',${JSON.stringify(end)}]]){const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}})()`);await click(cdp,'#incurredProductionApplyRange');};
  await apply('2026-11-15','2026-11-25');await waitFor(cdp,"brazaIncurredProduction.getRangeSnapshot().start_date==='2026-11-15'",'both range endpoints must apply');let selected=await range();assert.equal(selected.summary.known_cost_cents,6930);assert.equal(selected.summary.total_cost_cents,null);assert.equal(selected.summary.unknown_cost_quantity,1);assert.equal(selected.summary.produced_quantity,6);assert.equal(selected.days.length,11);
  const partial=await cdp.evaluate("({text:document.getElementById('incurredProductionRange').textContent,records:document.querySelectorAll('#incurredProductionRecords>.incurred-production-record').length,ref:document.querySelector('#incurredProductionForm [name=production_ref]').value,quantity:document.querySelector('#incurredProductionForm [name=quantity]').value})");assert.match(partial.text,/subtotal conhecido não é o gasto total/);assert.equal(partial.records,3);assert.equal(partial.ref,'Rascunho sintético preservado');assert.equal(partial.quantity,'9');
  await apply('2026-10-15','2026-10-25');assert.equal((await range()).summary.total_cost_cents,9000);await apply('2026-10-25','2026-11-15');assert.equal((await range()).summary.total_cost_cents,19749);assert.equal((await range()).summary.produced_quantity,9,'cross-month records appear once, including the explicit-zero lot');
  await apply('2026-11-10','2026-11-10');assert.equal((await range()).summary.total_cost_cents,0);assert.match(await cdp.evaluate("document.getElementById('incurredProductionRange').textContent"),/R\$\s*0,00/);
  await apply('2026-10-01','2026-10-02');assert.equal((await range()).summary.total_cost_cents,null);assert.match(await cdp.evaluate("document.getElementById('incurredProductionRange').textContent"),/ausência de lançamentos não confirma/);assert.doesNotMatch(await cdp.evaluate("document.getElementById('incurredProductionRange').textContent"),/R\$\s*0/);
  for(const pair of [['2026-11-25','2026-11-15'],['2026-11-01','2026-11-27'],['2025-10-01','2026-11-25']]){await apply(...pair);assert.equal((await range()).start_date,'2026-10-01');assert.equal((await range()).end_date,'2026-10-02');}
  await click(cdp,'#incurredProductionThisWeek');assert.equal((await range()).start_date,'2026-11-23');await click(cdp,'#incurredProductionThisMonth');assert.equal((await range()).start_date,'2026-11-01');assert.equal(ledgerReads(),1,'all range switches and shortcuts use the same cached ledger');
  await apply('2026-11-15','2026-11-25');await cdp.evaluate("(()=>{const n=document.getElementById('incurredProductionRange'),header=document.querySelector('.topbar'),top=header?.getBoundingClientRect().bottom||0;window.scrollBy(0,n.getBoundingClientRect().top-top-16);})()");await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
  const final=await cdp.evaluate("({errors:__rangeErrors,width:innerWidth,scroll:document.documentElement.scrollWidth,header:document.querySelector('.topbar')?.getBoundingClientRect().bottom||0,rangeTop:document.getElementById('incurredProductionRange').getBoundingClientRect().top,trusted:__rangeTrustedClicks,financial:JSON.stringify(brazaMonthDashboard.getSnapshot())})");assert.deepEqual(final.errors,[]);assert.ok(final.scroll<=final.width+1);assert.ok(final.rangeTop>=final.header,'range result must remain below the fixed header');assert.ok(final.trusted.includes('incurredProductionApplyRange'),'the primary date action must receive a native browser click');assert.equal(final.financial,financial);assert.equal(await fixture.snapshot(),ledgerBefore);assert.equal(serverFailure,null);assert.ok(requests.every(row=>row.method==='GET'));
  if(qaDir){mkdirSync(qaDir,{recursive:true});const shot=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});writeFileSync(path.join(qaDir,'manufacture-range-'+width+'-'+(minify?'min':'normal')+'.png'),Buffer.from(shot.data,'base64'));}
  results.push({minify,width,pass:true,page_errors:0,horizontal_overflow:false,range_changes_cached_only:true,ledger_gets:1});
 }finally{await cdp?.close();host.closeAllConnections?.();await new Promise(resolve=>host.close(resolve));fixture.close();}
});
after(()=>{if(sourceWorkers)assert.deepEqual(workerHashes(),sourceWorkers,'the source build must remain frozen until all four browser cases finish');if(qaDir){mkdirSync(qaDir,{recursive:true});writeFileSync(path.join(qaDir,'manufacture-range-chrome-qa.json'),JSON.stringify({schema:'mls_manufacture_range_chrome_qa_v1',synthetic:true,real_owner_authenticated:false,workers:sourceWorkers,complete:results.length===4,new_provider_calls:0,owner_mutation_requests:0,remote_writes:0,ledger_unchanged:results.length===4,financial_frame_unchanged:results.length===4,rows:results},null,2)+'\n');}});
