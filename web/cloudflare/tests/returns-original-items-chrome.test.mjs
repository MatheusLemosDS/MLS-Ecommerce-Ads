import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdtempSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {createChromeProfileCleanup} from './chrome-profile-cleanup.mjs';
import {waitForChromeDebugPort} from './chrome-debug-port.mjs';
import {returnsOriginalItemsUIFixture} from './returns-original-items-ui-fixture.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function browser(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-physical-returns-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'}),cleanup=createChromeProfileCleanup(child,profile);let socket;
 try{
  const port=await waitForChromeDebugPort(child,profile);let page;
  for(let index=0;index<100;index++){try{page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(row=>row.type==='page'&&row.webSocketDebuggerUrl);}catch{}if(page)break;await pause(50);}
  assert.ok(page,'Chromium must initialize a page target');socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('PHYSICAL_RETURNS_CDP_OPEN_TIMEOUT')),10000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('PHYSICAL_RETURNS_CDP_OPEN_ERROR'));},{once:true});});
  let sequence=0;const pending=new Map();socket.addEventListener('message',event=>{const value=JSON.parse(event.data),call=pending.get(value.id);if(!call)return;pending.delete(value.id);clearTimeout(call.timer);value.error?call.reject(Error(value.error.message||'PHYSICAL_RETURNS_CDP_ERROR')):call.resolve(value.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('PHYSICAL_RETURNS_CDP_TIMEOUT:'+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  await send('Page.enable');await send('Runtime.enable');
  return {send,async evaluate(expression){const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value;},close:()=>cleanup(socket)};
 }catch(error){await cleanup(socket);throw error;}
}

async function waitFor(cdp,expression,label,diagnostic=null){
 for(let index=0;index<160;index++){if(await cdp.evaluate(expression))return;await pause(50);}
 assert.fail(label+(diagnostic?' '+JSON.stringify(await diagnostic()):''));
}

async function click(cdp,selector){
 await cdp.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)throw Error('PHYSICAL_TEST_CLICK_TARGET_MISSING');node.scrollIntoView({block:'center',behavior:'instant'});})()`);
 await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 const position=await cdp.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)}),rect=node.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return {x:rect.x+rect.width/2,y:rect.y+rect.height/2,height:rect.height,visible:node.checkVisibility({checkVisibilityCSS:true}),unobscured:hit===node||node.contains(hit)};})()`);
 assert.equal(position.visible,true,'the action must remain visible');assert.ok(position.height>=44,'physical-return actions need44px touch targets');assert.equal(position.unobscured,true,'the action must not be covered by navigation');
 await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:position.x,y:position.y});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:position.x,y:position.y});
}

const clone=value=>JSON.parse(JSON.stringify(value)),results=[];
const stamp=Date.UTC(2026,10,2,15)/1000;
const hashes=()=>Object.fromEntries(['app','auth','finance'].map(name=>[name,createHash('sha256').update(readFileSync(new URL('../../../dist/'+name+'-worker.mjs',import.meta.url))).digest('hex')]));
const expression=code=>'(()=>{'+code+'})()';

for(const minify of [false,true])test(`original item evidence keeps contracts, scopes and drafts in generated Chromium at320/1365px (minify=${minify})`,{timeout:150000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 let externalRequests=0;const originalFetch=globalThis.fetch;
 globalThis.fetch=(input,options)=>{const url=new URL(typeof input==='string'?input:input.url);if(!['127.0.0.1','localhost'].includes(url.hostname)){externalRequests++;throw Error('SYNTHETIC_PROVIDER_REQUEST_FORBIDDEN');}return originalFetch(input,options);};
 t.after(()=>{globalThis.fetch=originalFetch;});
 const owner=await compiledOwnerReportPage(minify,{ownerPreview:false,localReadSnapshot:true}),local=new Map(owner.localReadSnapshot.responses.map(row=>[row.path,row]));
 const valid=returnsOriginalItemsUIFixture(),financialBefore=JSON.stringify(valid.original_items.report),physicalBefore=JSON.stringify(valid.report.physical),rawFixtureBefore=JSON.stringify(valid),requests=[];
 let serverFailure=null,mode='AVAILABLE',delayNext=false,releaseDelayed=null;
 const html=owner.html.replace('<head>','<head><script>const OriginalEvidenceDate=Date;globalThis.Date=class extends OriginalEvidenceDate{constructor(...args){super(...(args.length?args:['+stamp*1000+']));}static now(){return '+stamp*1000+';}};globalThis.__originalItemsErrors=[];addEventListener("error",e=>__originalItemsErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>__originalItemsErrors.push(String(e.reason?.message||e.reason)));</script>');
 const payload=selected=>{
  if(selected!=='2026-10')return returnsOriginalItemsUIFixture({month:selected,legacy:true});
  if(mode==='LEGACY')return clone(valid.report);
  const value=clone(valid);if(mode==='MALFORMED')value.original_items.original_items[0].orders[0].items[0].quantity=0;return value;
 };
 const host=http.createServer(async(req,res)=>{
  try{
   if(!req.url.startsWith('/api/')){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);return;}
   requests.push({method:req.method,path:req.url});const route=new URL(req.url,'http://synthetic.invalid'),headers={'content-type':'application/json','cache-control':'no-store'};let value=null;
   assert.equal(req.method,'GET','no owner mutation is authorized by read-only item QA');
   if(route.pathname==='/api/admin/returns/physical'){
    assert.equal(route.searchParams.get('evidence'),'original-items-v1');const selected=route.searchParams.get('month');assert.ok(['2026-10','2026-11'].includes(selected));value=payload(selected);
    if(delayNext){delayNext=false;releaseDelayed=()=>{res.writeHead(200,headers);res.end(JSON.stringify(value));};return;}
   }else{const cached=local.get(req.url);if(cached){value=cached.body;if(cached.contract)headers['x-braza-client-contract']=cached.contract;}}
   res.writeHead(value?200:503,headers);res.end(JSON.stringify(value||{error:'SYNTHETIC_UNMAPPED_SOURCE'}));
  }catch(error){serverFailure=error.message;res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"SYNTHETIC_QA_HANDLER_FAILED"}');}
 });
 await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve));let cdp;
 try{
  cdp=await browser();
  for(const width of [320,1365]){
   mode='AVAILABLE';delayNext=false;releaseDelayed=null;const callsBefore=requests.length;
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===320});
   await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+host.address().port+'/admin?tab=agent-returns'});
   await waitFor(cdp,"globalThis.brazaPhysicalReturns&&document.getElementById('physicalReturnsMonthSelect')&&!document.getElementById('physicalReturnsMonthSelect').disabled",'physical evidence controller must receive the existing signed owner API');
   await click(cdp,'#physicalReturnsDetails>summary');
   await waitFor(cdp,"brazaPhysicalReturns.getSnapshot()!==null",'opening existing physical controls reads a saved workspace');
   await cdp.evaluate("document.getElementById('physicalReturnsMonthSelect').value='2026-10';document.getElementById('physicalReturnsMonthSelect').dispatchEvent(new Event('change',{bubbles:true}));");
   await waitFor(cdp,"document.getElementById('physicalReturnsOriginalItems').dataset.state==='AVAILABLE'",'the selected source must display both observed item lists');
   const original=await cdp.evaluate(expression("return {physical:brazaPhysicalReturns.getSnapshot().physical,body:document.getElementById('physicalReturnsOriginalItems').textContent,source:document.getElementById('physicalReturnsOriginalItemsSources').textContent,quantity:document.querySelector('#physicalReturnsReceiveForm [name=quantity]').value,month:brazaMonthDashboard.getSnapshot()?.month,strict:{balance:brazaMonthDashboard.getSnapshot()?.balance_cents,pending:brazaMonthDashboard.getSnapshot()?.pending}};"));
   assert.deepEqual(original.physical,valid.report.physical);assert.match(original.source,/Itens observados no pedido[\s\S]*2 unidade\(s\) comercial/);assert.match(original.source,/Itens observados na solicitação de devolução[\s\S]*1 unidade\(s\) comercial/);assert.equal(original.quantity,'');assert.match(original.body,/kit vendido não confirma/);
   await cdp.evaluate("const receive=document.getElementById('physicalReturnsReceiveForm');for(const [name,value]of Object.entries({receipt_ref:'Rascunho sintético preservado',quantity:'7'})){const input=receive.querySelector('[name='+name+']');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}");
   const reads=requests.length,second=valid.report.source.cases[1].case_hash,third=valid.report.source.cases[2].case_hash;
   await cdp.evaluate(`const select=document.getElementById('physicalReturnsSourceCase');select.value=${JSON.stringify(second)};select.dispatchEvent(new Event('change',{bubbles:true}));`);
   assert.match(await cdp.evaluate("document.getElementById('physicalReturnsOriginalItemsSources').textContent"),/Produto #1001/);assert.equal(requests.length,reads,'changing source rows uses the same verified local response');
   await cdp.evaluate(`document.getElementById('physicalReturnsSourceCase').value=${JSON.stringify(third)};document.getElementById('physicalReturnsSourceCase').dispatchEvent(new Event('change',{bubbles:true}));`);
   const unknown=await cdp.evaluate("document.getElementById('physicalReturnsOriginalItemsSources').textContent");assert.match(unknown,/desconhecid/);assert.doesNotMatch(unknown,/0 unidade/);
   await cdp.evaluate(`document.getElementById('physicalReturnsSourceCase').value=${JSON.stringify(valid.report.source.cases[0].case_hash)};document.getElementById('physicalReturnsSourceCase').dispatchEvent(new Event('change',{bubbles:true}));`);
   mode='LEGACY';await click(cdp,'#physicalReturnsReload');await waitFor(cdp,"/leitura antiga/.test(document.getElementById('physicalReturnsOriginalItemsStatus').textContent)",'older deployed responses must leave the physical controls usable and item quantities unknown');
   assert.equal(await cdp.evaluate("document.querySelector('#physicalReturnsReceiveForm [name=quantity]').value"),'7');
   mode='MALFORMED';await click(cdp,'#physicalReturnsReload');await waitFor(cdp,"/Não foi possível/.test(document.getElementById('physicalReturnsStatus').textContent)",'malformed v2 must not downgrade to legacy or erase the last good physical state');assert.match(await cdp.evaluate("document.getElementById('physicalReturnsOriginalItemsStatus').textContent"),/leitura antiga/);
   mode='AVAILABLE';await click(cdp,'#physicalReturnsReload');await waitFor(cdp,"document.getElementById('physicalReturnsOriginalItems').dataset.state==='AVAILABLE'",'an explicit later read can restore current validated evidence');
   delayNext=true;await click(cdp,'#physicalReturnsReload');for(let index=0;index<80&&!releaseDelayed;index++)await pause(25);assert.equal(typeof releaseDelayed,'function');
   await cdp.evaluate("document.getElementById('physicalReturnsMonthSelect').value='2026-11';document.getElementById('physicalReturnsMonthSelect').dispatchEvent(new Event('change',{bubbles:true}));");await waitFor(cdp,"brazaPhysicalReturns.getSnapshot()?.month==='2026-11'",'a separate physical month is allowed while a source read is pending');releaseDelayed();releaseDelayed=null;await pause(100);
   const final=await cdp.evaluate(expression("return {physical:brazaPhysicalReturns.getSnapshot().physical,physicalMonth:brazaPhysicalReturns.getSnapshot().month,financialMonth:brazaMonthDashboard.getSnapshot()?.month,strict:{balance:brazaMonthDashboard.getSnapshot()?.balance_cents,pending:brazaMonthDashboard.getSnapshot()?.pending},items:document.getElementById('physicalReturnsOriginalItemsSources').textContent,quantity:document.querySelector('#physicalReturnsReceiveForm [name=quantity]').value,ref:document.querySelector('#physicalReturnsReceiveForm [name=receipt_ref]').value,errors:__originalItemsErrors,scroll:document.documentElement.scrollWidth,width:innerWidth};"));
   assert.equal(final.physicalMonth,'2026-11');assert.equal(final.financialMonth,original.month);assert.deepEqual(final.strict,original.strict);assert.equal(final.items,'');assert.equal(final.quantity,'7');assert.equal(final.ref,'Rascunho sintético preservado');assert.deepEqual(final.physical,valid.report.physical);assert.deepEqual(final.errors,[]);assert.ok(final.scroll<=final.width+1,'read-only original item evidence must not grow a320px viewport');assert.ok(requests.slice(callsBefore).every(row=>row.method==='GET'));assert.equal(serverFailure,null);
   results.push({minify,width,pass:true,page_errors:0,horizontal_overflow:false});
  }
  assert.equal(JSON.stringify(valid.original_items.report),financialBefore);assert.equal(JSON.stringify(valid.report.physical),physicalBefore);assert.equal(JSON.stringify(valid),rawFixtureBefore);assert.equal(externalRequests,0);
 }finally{if(releaseDelayed)releaseDelayed();await cdp?.close();await new Promise(resolve=>host.close(resolve));}
});

test.after(()=>{
 const reportPath=process.env.MLS_ORIGINAL_ITEMS_QA_REPORT;if(!reportPath)return;
 assert.equal(results.length,4);assert.deepEqual(new Set(results.map(row=>row.minify+':'+row.width)),new Set(['false:320','false:1365','true:320','true:1365']));
 const report={schema:'mls_original_items_chrome_qa_v1',generated_hashes:hashes(),legacy_contracts_unchanged:true,original_financial_frame_unchanged:true,strict_result_unchanged:true,physical_ledgers_unchanged:true,no_new_provider_calls:0,owner_mutation_requests:0,remote_writes:0,results};
 mkdirSync(path.dirname(reportPath),{recursive:true});writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
});
