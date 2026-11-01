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
import {D1} from './sqlite-d1.mjs';
import {readPhysicalReturns,mutatePhysicalReturns,projectPhysicalReturns} from '../src/physical-returns.mjs';

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

const caseHash='a'.repeat(64),orderHash='c'.repeat(64),secondCaseHash='b'.repeat(64),secondOrderHash='d'.repeat(64);
const month='2026-11',stamp=Date.parse('2026-11-01T18:00:00Z')/1000;
const maliciousArtwork='<img src=x onerror="globalThis.__physicalXss=true">';

async function physicalFixture(){
 const env={ADMIN_DB:new D1()},now=()=>stamp*1000;
 const candidates=[{case_hash:caseHash,order_hash:orderHash,status:'ACCEPTED',checked_at:stamp-60,publication_revision:9},{case_hash:secondCaseHash,order_hash:secondOrderHash,status:'CLOSED',checked_at:stamp-60,publication_revision:9}];
 const read=async(selected=month)=>{
  const physical=await readPhysicalReturns(env,{now});assert.ok(projectPhysicalReturns(physical));
  const cases=selected===month?candidates:[];
  return {schema:'physical_returns_workspace_v1',month:selected,checked_at:stamp,source:{status:'AVAILABLE',checked_at:stamp-60,cases_total:cases.length,cases_included:cases.length,truncated:false,reason:null,cases},physical};
 };
 const mutate=async body=>{
  const candidate=candidates.find(row=>row.case_hash===body.case_hash),sourceCase=candidate?{...candidate,month}:null;
  await mutatePhysicalReturns(env,body,'synthetic-physical-owner',{now,sourceCase});return read();
 };
 return {env,read,mutate,close:()=>env.ADMIN_DB.db.close()};
}

async function fill(cdp,form,fields){
 await cdp.evaluate(`(()=>{const form=document.querySelector(${JSON.stringify(form)});if(!form)throw Error('PHYSICAL_TEST_FORM_MISSING');for(const [name,value]of Object.entries(${JSON.stringify(fields)})){const input=form.querySelector('[name="'+name+'"]');if(!input)throw Error('PHYSICAL_TEST_FIELD_MISSING:'+name);if(input.type==='checkbox')input.checked=value;else input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
}

for(const minify of [false,true])test(`generated physical-return control remains lazy, preserves retry/drafts and records inspected pieces at320/1365px (minify=${minify})`,{timeout:150000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 const owner=await compiledOwnerReportPage(minify,{ownerPreview:false,localReadSnapshot:true}),local=new Map(owner.localReadSnapshot.responses.map(row=>[row.path,row]));let fixture=await physicalFixture(),serverFailure=null;
 const requests=[],posts=[],control={dropReceive:false,conflictReceive:false};
 const html=owner.html.replace('<head>','<head><script>const PhysicalFixtureDate=Date;globalThis.Date=class extends PhysicalFixtureDate{constructor(...args){super(...(args.length?args:['+stamp*1000+']));}static now(){return '+stamp*1000+';}};globalThis.__physicalErrors=[];globalThis.__physicalXss=false;addEventListener("error",e=>__physicalErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>__physicalErrors.push(String(e.reason?.message||e.reason)));</script>');
 const host=http.createServer(async(req,res)=>{
  try{
   if(!req.url.startsWith('/api/')){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);return;}
   const route=new URL(req.url,'http://synthetic.invalid'),headers={'content-type':'application/json','cache-control':'no-store'};requests.push({method:req.method,path:req.url});let value=null;
   if(route.pathname==='/api/admin/returns/physical'){
    const selected=route.searchParams.get('month');assert.ok([month,'2026-10'].includes(selected),'physical reads must use an explicit allowed calendar');
    if(req.method==='GET')value=await fixture.read(selected);
    else if(req.method==='POST'){
     assert.equal(selected,month,'physical writes must retain the calendar attached to their immutable mutation');
     assert.ok(req.headers['x-csrf-token']===owner.session.csrf,'the generated owner API must attach the current owner CSRF token');let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);posts.push(body);
     if(control.conflictReceive&&body.action==='receive'){
      control.conflictReceive=false;const current=await fixture.read();await fixture.mutate({revision:current.physical.revision,request_id:crypto.randomUUID(),action:'register',case_hash:secondCaseHash,order_hash:secondOrderHash});
     }
     try{value=await fixture.mutate(body);}catch(error){if(Number.isSafeInteger(error.status)){res.writeHead(error.status,headers);res.end(JSON.stringify({error:error.message}));return;}throw error;}
     if(control.dropReceive&&body.action==='receive'){
      // A fully delivered HTTP response with truncated JSON prevents Chromium's
      // transparent stale-socket POST replay while leaving the committed result
      // unconfirmed to the application. The operator must reuse the same body.
      control.dropReceive=false;res.writeHead(200,headers);res.end('{');return;
     }
    }
   }else{const entry=local.get(req.url);if(req.method==='GET'&&entry){value=entry.body;if(entry.contract)headers['x-braza-client-contract']=entry.contract;}}
   res.writeHead(value?200:503,headers);res.end(JSON.stringify(value||{error:'SYNTHETIC_UNMAPPED_SOURCE'}));
  }catch(error){serverFailure=error.message;res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"SYNTHETIC_HANDLER_FAILED"}');}
 });
 await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve));let cdp;
 try{
  cdp=await browser();
  for(const width of [320,1365]){
   fixture.close();fixture=await physicalFixture();control.dropReceive=false;control.conflictReceive=false;const requestsBefore=requests.length,postsBefore=posts.length;
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width===320});await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+host.address().port+'/admin?tab=agent-returns&month='+month});
   await waitFor(cdp,"document.readyState==='complete'&&!!globalThis.brazaPhysicalReturns",'the generated physical-return module must initialize inside the existing Returns workspace');
   const initial=await cdp.evaluate("({panel:document.documentElement.dataset.activePanel,open:document.getElementById('physicalReturnsDetails').open,visible:document.getElementById('physicalReturns').checkVisibility({checkVisibilityCSS:true}),width:innerWidth,scroll:document.documentElement.scrollWidth})");assert.equal(initial.panel,'agent-returns');assert.equal(initial.visible,true);assert.equal(initial.open,false);assert.ok(initial.scroll<=initial.width+1);
   assert.equal(requests.slice(requestsBefore).filter(row=>row.path.startsWith('/api/admin/returns/physical')).length,0,'opening Returns with physical details closed must not read the physical API');assert.equal(posts.length,postsBefore);
   await click(cdp,'#physicalReturnsDetails>summary');await waitFor(cdp,"document.getElementById('physicalReturnsSourceCase').options.length>=2",'opening physical details must load the saved source cases');
   const loaded=await cdp.evaluate("({physical:brazaPhysicalReturns.getSnapshot().physical,source:document.getElementById('physicalReturnsSourceFacts').textContent,notice:document.getElementById('physicalReturns').textContent})");assert.equal(loaded.physical.revision,0);assert.equal(loaded.physical.summary.received_quantity,0);assert.equal(loaded.physical.valuation.state,'UNKNOWN');assert.equal(loaded.physical.valuation.amount_cents,null);assert.equal(loaded.physical.external_stock_write_allowed,false);assert.match(loaded.notice,/Custo e impacto no resultado ainda não apurados/);assert.doesNotMatch(loaded.notice,/R\$\s*0[,.]00/);
   await cdp.evaluate(`(()=>{const source=document.getElementById('physicalReturnsSourceCase');source.value=${JSON.stringify(caseHash)};source.dispatchEvent(new Event('change',{bubbles:true}));})()`);await click(cdp,'#physicalReturns [data-physical-action=register]');await waitFor(cdp,"brazaPhysicalReturns.getSnapshot()?.physical?.revision===1",'registering a saved case must create only an awaiting-receipt record');
   const registered=await cdp.evaluate("({cases:brazaPhysicalReturns.getSnapshot().physical.cases,facts:document.getElementById('physicalReturnsCaseFacts').textContent,source:document.getElementById('physicalReturnsSourceFacts').textContent})");assert.equal(registered.cases.length,1);assert.equal(registered.cases[0].lines.length,0);assert.equal(registered.cases[0].source.status,'ACCEPTED');assert.match(registered.facts,/aguard.*receb|sem.*receb/iu);assert.notEqual(registered.source.trim(),'');
   control.dropReceive=true;await fill(cdp,'#physicalReturnsReceiveForm',{receipt_ref:'Pacote 1 - linha M',quantity:'3',artwork:maliciousArtwork,color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:false});await click(cdp,'#physicalReturnsReceiveForm [data-physical-action=receive]');
   await waitFor(cdp,"!document.getElementById('physicalReturnsRetry').hidden&&!document.getElementById('physicalReturnsRetry').disabled",'an interrupted response must preserve a retriable mutation rather than send another receipt automatically',async()=>({...await cdp.evaluate("({status:document.getElementById('physicalReturnsStatus').textContent,retry:{hidden:document.getElementById('physicalReturnsRetry').hidden,disabled:document.getElementById('physicalReturnsRetry').disabled},revision:brazaPhysicalReturns.getSnapshot()?.physical?.revision,quantity:document.querySelector('#physicalReturnsReceiveForm [name=quantity]')?.value,reference:document.querySelector('#physicalReturnsReceiveForm [name=receipt_ref]')?.value})"),actions:posts.slice(postsBefore).map(row=>({action:row.action,revision:row.revision,quantity:row.quantity,receipt_ref:row.receipt_ref,fit:row.identity?.fit})),serverFailure}));
   const draft=await cdp.evaluate("({quantity:document.querySelector('#physicalReturnsReceiveForm [name=quantity]').value,reference:document.querySelector('#physicalReturnsReceiveForm [name=receipt_ref]').value})");assert.equal(draft.quantity,'3');assert.equal(draft.reference,'Pacote 1 - linha M');
   const firstReceive=posts.filter(row=>row.action==='receive').at(-1);assert.ok(firstReceive);await click(cdp,'#physicalReturnsRetry');await waitFor(cdp,"brazaPhysicalReturns.getSnapshot()?.physical?.revision===2",'retry must recover the committed response');
   const receiveAttempts=posts.filter(row=>row.action==='receive').slice(-2);assert.equal(receiveAttempts.length,2);assert.deepEqual(receiveAttempts[0],receiveAttempts[1],'the retry must reuse the original request_id and entire immutable body');
   const once=(await fixture.read()).physical;assert.equal(once.summary.lines,1);assert.equal(once.summary.received_quantity,3);assert.equal(once.summary.quarantine_quantity,3);assert.equal(once.summary.physically_available_quantity,0);
   control.conflictReceive=true;await fill(cdp,'#physicalReturnsReceiveForm',{receipt_ref:'Pacote 2 - linha GG',quantity:'2',artwork:'Retrô 80',color:'Azul',size:'GG',garment_type:'ADULT',fit:'UNISEX',confirmed:false});const receivePostsBeforeConflict=posts.filter(row=>row.action==='receive').length;await click(cdp,'#physicalReturnsReceiveForm [data-physical-action=receive]');
   await waitFor(cdp,"!document.querySelector('#physicalReturnsReceiveForm [data-physical-action=receive]').disabled",'a CAS conflict must release the form without discarding its draft');assert.equal(posts.filter(row=>row.action==='receive').length,receivePostsBeforeConflict+1);
   const preserved=await cdp.evaluate("({quantity:document.querySelector('#physicalReturnsReceiveForm [name=quantity]').value,reference:document.querySelector('#physicalReturnsReceiveForm [name=receipt_ref]').value,status:document.getElementById('physicalReturnsStatus').textContent})");assert.equal(preserved.quantity,'2');assert.equal(preserved.reference,'Pacote 2 - linha GG');
   await click(cdp,'#physicalReturnsReload');await waitFor(cdp,"brazaPhysicalReturns.getSnapshot()?.physical?.revision===3",'reloading saved records must recover the latest CAS revision');assert.equal(await cdp.evaluate("document.querySelector('#physicalReturnsReceiveForm [name=quantity]').value"),'2');await click(cdp,'#physicalReturnsReceiveForm [data-physical-action=receive]');await waitFor(cdp,"brazaPhysicalReturns.getSnapshot()?.physical?.revision===4",'a separate partial delivery must append its own actual received pieces');
   const received=(await fixture.read()).physical,record=received.cases.find(row=>row.case_hash===caseHash),secondLine=record.lines.find(row=>row.line_id!==firstReceive.line_id);assert.ok(secondLine);assert.equal(record.lines.length,2);assert.equal(received.summary.received_quantity,5);assert.equal(received.summary.quarantine_quantity,5);
   await fill(cdp,'#physicalReturnsReceiveForm',{receipt_ref:'Pacote 2 - linha GG',quantity:'2',artwork:'Retrô 80',color:'Azul',size:'GG',garment_type:'ADULT',fit:'UNISEX',confirmed:false});await click(cdp,'#physicalReturnsReceiveForm [data-physical-action=receive]');await waitFor(cdp,"/identificação.*já|referência.*já/iu.test(document.getElementById('physicalReturnsStatus').textContent)",'a duplicate receipt reference must explain the actual conflict');const duplicate=(await fixture.read()).physical;assert.equal(duplicate.revision,4);assert.equal(duplicate.summary.lines,2);assert.equal(duplicate.summary.received_quantity,5,'a new request_id must not duplicate an already registered delivery reference');
   await cdp.evaluate(`(()=>{const line=document.getElementById('physicalReturnsLine');line.value=${JSON.stringify(firstReceive.line_id)};line.dispatchEvent(new Event('change',{bubbles:true}));})()`);await fill(cdp,'#physicalReturnsInspectForm',{resellable:'1',repair:'1',damaged:'1',mismatch:'0',quarantine:'0',artwork:maliciousArtwork,color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,reason:'Conferência manual das três peças'});await click(cdp,'#physicalReturnsInspectForm [data-physical-action=inspect]');await waitFor(cdp,"brazaPhysicalReturns.getSnapshot()?.physical?.revision===5",'inspection must partition the received quantity with explicit identity confirmation');
   const inspected=(await fixture.read()).physical;assert.equal(inspected.summary.physically_available_quantity,1);assert.equal(inspected.summary.repair_quantity,1);assert.equal(inspected.summary.damaged_quantity,1);assert.equal(inspected.summary.quarantine_quantity,2);
   await cdp.evaluate(`(()=>{const line=document.getElementById('physicalReturnsLine');line.value=${JSON.stringify(secondLine.line_id)};line.dispatchEvent(new Event('change',{bubbles:true}));})()`);await fill(cdp,'#physicalReturnsVoidForm',{reason:'Correção: '+maliciousArtwork});await click(cdp,'#physicalReturnsVoidForm [data-physical-action=void]');await waitFor(cdp,"brazaPhysicalReturns.getSnapshot()?.physical?.revision===6",'correction must retain and void the receipt rather than delete its history');
   const final=await cdp.evaluate("({value:brazaPhysicalReturns.getSnapshot().physical,text:document.getElementById('physicalReturns').textContent,unsafe:document.querySelectorAll('#physicalReturns img,#physicalReturns script').length,xss:__physicalXss,errors:__physicalErrors,width:innerWidth,scroll:document.documentElement.scrollWidth})");assert.equal(final.value.summary.received_quantity,5);assert.equal(final.value.summary.active_quantity,3);assert.equal(final.value.summary.voided_quantity,2);assert.equal(final.value.summary.physically_available_quantity,1);assert.equal(final.value.cases.find(row=>row.case_hash===caseHash).lines.find(row=>row.line_id===secondLine.line_id).status,'VOID');assert.equal(final.value.valuation.amount_cents,null);assert.equal(final.value.external_stock_write_allowed,false);assert.match(final.text,/Custo e impacto no resultado ainda não apurados/);assert.ok(final.text.includes(maliciousArtwork),'manual identity text must remain visible as literal text');assert.equal(final.unsafe,0);assert.equal(final.xss,false);assert.deepEqual(final.errors,[]);assert.ok(final.scroll<=final.width+1,'physical details and forms cannot expand a320px viewport');assert.equal(serverFailure,null);
   const mutationCount=posts.length;await cdp.evaluate("(()=>{const month=document.getElementById('physicalReturnsMonthSelect');month.value='2026-10';month.dispatchEvent(new Event('change',{bubbles:true}));})()");await waitFor(cdp,"brazaPhysicalReturns.getSnapshot()?.month==='2026-10'",'the physical-source month must be independently selectable');
   await cdp.evaluate("brazaPhysicalReturns.observe('2026-11')");const independent=await cdp.evaluate("({physicalMonth:brazaPhysicalReturns.getSnapshot().month,financialMonth:brazaMonthDashboard.getSnapshot().month,received:brazaPhysicalReturns.getSnapshot().physical.summary.received_quantity})");assert.equal(independent.physicalMonth,'2026-10');assert.equal(independent.financialMonth,'2026-11');assert.equal(independent.received,5,'global physical records must remain visible when the saved-source calendar changes');assert.equal(posts.length,mutationCount,'changing physical month must not mutate receipts or the financial month');
   assert.ok(requests.slice(requestsBefore).filter(row=>row.method==='POST').every(row=>row.path.startsWith('/api/admin/returns/physical?month='+month)),'all writes must remain in the explicit local physical ledger endpoint');
  }
 }finally{await cdp?.close();host.closeAllConnections?.();await new Promise(resolve=>host.close(resolve));fixture.close();}
});
