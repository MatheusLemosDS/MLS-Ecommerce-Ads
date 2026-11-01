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
import {readPhysicalReturns} from '../src/physical-returns.mjs';
import {readIncurredProduction,mutateIncurredProduction,incurredProductionPeriods,projectIncurredProduction} from '../src/incurred-production.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function browser(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-incurred-production-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'}),cleanup=createChromeProfileCleanup(child,profile);let socket;
 try{
  const port=await waitForChromeDebugPort(child,profile);let page;
  for(let index=0;index<100;index++){try{page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(row=>row.type==='page'&&row.webSocketDebuggerUrl);}catch{}if(page)break;await pause(50);}
  assert.ok(page,'Chromium must initialize a page target');socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('INCURRED_PRODUCTION_CDP_OPEN_TIMEOUT')),10000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('INCURRED_PRODUCTION_CDP_OPEN_ERROR'));},{once:true});});
  let sequence=0;const pending=new Map();socket.addEventListener('message',event=>{const value=JSON.parse(event.data),call=pending.get(value.id);if(!call)return;pending.delete(value.id);clearTimeout(call.timer);value.error?call.reject(Error(value.error.message||'INCURRED_PRODUCTION_CDP_ERROR')):call.resolve(value.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('INCURRED_PRODUCTION_CDP_TIMEOUT:'+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  await send('Page.enable');await send('Runtime.enable');
  return {send,async evaluate(expression){const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value;},close:()=>cleanup(socket)};
 }catch(error){await cleanup(socket);throw error;}
}

async function waitFor(cdp,expression,label,diagnostic=null){
 for(let index=0;index<160;index++){if(await cdp.evaluate(expression))return;await pause(50);}
 assert.fail(label+(diagnostic?' '+JSON.stringify(await diagnostic()):''));
}

async function click(cdp,selector){
 await cdp.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)throw Error('INCURRED_TEST_CLICK_TARGET_MISSING');node.scrollIntoView({block:'center',behavior:'instant'});})()`);
 await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 const position=await cdp.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)}),rect=node.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return {x:rect.x+rect.width/2,y:rect.y+rect.height/2,height:rect.height,visible:node.checkVisibility({checkVisibilityCSS:true}),unobscured:hit===node||node.contains(hit)};})()`);
 assert.equal(position.visible,true,'the action must remain visible');assert.ok(position.height>=44,'incurred-production actions need44px touch targets');assert.equal(position.unobscured,true,'the action must not be covered by navigation');
 await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:position.x,y:position.y});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:position.x,y:position.y});
}

const clock=Date.parse('2026-11-01T18:00:00Z'),stamp=clock/1000,selection={month:'2026-11',week_of:'2026-11-01'};
const sourceKey='a'.repeat(64),sourceHash='b'.repeat(64),orderHash='c'.repeat(64);
const maliciousReference='Lote <img src=x onerror="globalThis.__incurredXss=true">';
const identity={artwork:null,color:null,size:null,garment_type:'UNKNOWN',fit:'UNKNOWN',confirmed:false,item_id:null,model_id:null,sku:null};

async function ledgerFixture(){
 const env={ADMIN_DB:new D1()},now=()=>clock,control={deleteSource:false,referenceRevision:7,regularCost:1590};
 const candidate={key:sourceKey,hash:sourceHash,checked_at:stamp-60,order_hash:orderHash,order_status:'READY_TO_SHIP',selling_quantity:2,item_id:'10001',model_id:'20001',sku:'SYNTHETIC-KIT-P-GG',model_name:'Kit casal P + GG',quantity_basis:'SAVED_SELLING_UNITS_NOT_PRODUCED_PIECES'};
 const references=()=>({status:'AVAILABLE',revision:control.referenceRevision,mode:'all_inclusive',adult_regular_cents:control.regularCost,adult_plus_cents:2140});
 const read=async(selected=selection)=>{
  const ledger=await readIncurredProduction(env,{now});assert.ok(projectIncurredProduction(ledger));const periods=incurredProductionPeriods(ledger,selected);assert.ok(periods);
  const candidates=control.deleteSource?[]:[candidate];return {schema:'incurred_production_workspace_v1',...selected,checked_at:stamp,ledger,periods,source:{status:'AVAILABLE',checked_at:stamp-60,included:candidates.length,has_more:false,reason:null,candidates},references:references()};
 };
 const mutate=async(body,selected=selection)=>{
  const trustedSource=!control.deleteSource&&body.source?.kind==='SAVED_DTF_ORDER_LINE'&&body.source.key===sourceKey&&body.source.hash===sourceHash?{kind:'SAVED_DTF_ORDER_LINE',key:sourceKey,hash:sourceHash,checked_at:candidate.checked_at,order_hash:orderHash,order_status:candidate.order_status,selling_quantity:candidate.selling_quantity}:null;
  const requested=body.cost?.reference,current=references(),referenceAmount=requested?.kind==='ADULT_REGULAR'?current.adult_regular_cents:requested?.kind==='ADULT_PLUS'?current.adult_plus_cents:null;
  const trustedReference=requested&&requested.revision===current.revision&&requested.mode===current.mode&&requested.unit_cost_cents===referenceAmount?requested:null;
  await mutateIncurredProduction(env,body,'synthetic-incurred-owner',{now,trustedSource,trustedReference});return read(selected);
 };
 return {env,control,read,mutate,physical:()=>readPhysicalReturns(env,{now}),close:()=>env.ADMIN_DB.db.close()};
}

async function fill(cdp,form,fields){
 await cdp.evaluate(`(()=>{const form=document.querySelector(${JSON.stringify(form)});if(!form)throw Error('INCURRED_TEST_FORM_MISSING');for(const [name,value]of Object.entries(${JSON.stringify(fields)})){const input=form.querySelector('[name="'+name+'"]');if(!input)throw Error('INCURRED_TEST_FIELD_MISSING:'+name);if(input.type==='checkbox')input.checked=value;else input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
}

for(const minify of [false,true])test(`generated incurred-production ledger preserves explicit facts, costs and corrections at320/1365px (minify=${minify})`,{timeout:150000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 const owner=await compiledOwnerReportPage(minify,{ownerPreview:true,localReadSnapshot:true});assert.equal([...owner.html.matchAll(/<script>/g)].length,15,'the ledger client must reuse the existing cost-period script');
 const local=new Map(owner.localReadSnapshot.responses.map(row=>[row.path,row])),requests=[],posts=[],control={browserClock:clock,conflictZero:false,unconfirmReference:false};let fixture=await ledgerFixture(),serverFailure=null;
 const html=()=>owner.html.replace('<head>','<head><script>const IncurredFixtureDate=Date;globalThis.Date=class extends IncurredFixtureDate{constructor(...args){super(...(args.length?args:['+control.browserClock+']));}static now(){return '+control.browserClock+';}};globalThis.__incurredErrors=[];globalThis.__incurredXss=false;addEventListener("error",e=>__incurredErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>__incurredErrors.push(String(e.reason?.message||e.reason)));</script>');
 const host=http.createServer(async(req,res)=>{
  try{
   if(!req.url.startsWith('/api/')){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html());return;}
   const route=new URL(req.url,'http://synthetic.invalid'),headers={'content-type':'application/json','cache-control':'no-store'};requests.push({method:req.method,path:req.url});let value=null;
   if(route.pathname==='/api/admin/production/incurred'){
    assert.deepEqual([...route.searchParams.keys()].sort(),['month','week_of'],'the ledger must retain exact explicit month/week selection');const selected={month:route.searchParams.get('month'),week_of:route.searchParams.get('week_of')};
    if(req.method==='GET')value=await fixture.read(selected);
    else if(req.method==='POST'){
     assert.ok(req.headers['x-csrf-token']===owner.session.csrf,'owner writes must carry the authenticated session CSRF token');let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);posts.push(body);
     if(control.conflictZero&&body.action==='record'&&body.production_ref==='Lote custo zero'){
      control.conflictZero=false;const current=await fixture.read();await fixture.mutate({revision:current.ledger.revision,request_id:crypto.randomUUID(),action:'record',record_id:crypto.randomUUID(),production_ref:'Lote de outra sessão',replaces_record_id:null,produced_date:'2026-11-01',quantity:1,identity,source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:null,reference:null},evidence:'Confirmação manual sintética de outra sessão',confirmed:true});
     }
     try{value=await fixture.mutate(body,selected);}catch(error){if(Number.isSafeInteger(error.status)){res.writeHead(error.status,headers);res.end(JSON.stringify({error:error.message}));return;}throw error;}
     if(control.unconfirmReference&&body.action==='record'&&body.source.kind==='SAVED_DTF_ORDER_LINE'){
      control.unconfirmReference=false;fixture.control.deleteSource=true;fixture.control.referenceRevision=8;fixture.control.regularCost=2190;
      // The fact committed before its response became unreadable. Replay must
      // survive changed/deleted operational source and current cost settings.
      res.writeHead(200,headers);res.end('{');return;
     }
    }
   }else{const entry=local.get(req.url);if(req.method==='GET'&&entry){value=entry.body;if(entry.contract)headers['x-braza-client-contract']=entry.contract;}}
   res.writeHead(value?200:503,headers);res.end(JSON.stringify(value||{error:'SYNTHETIC_UNMAPPED_SOURCE'}));
  }catch(error){serverFailure=error.message;res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"SYNTHETIC_HANDLER_FAILED"}');}
 });
 await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve));let cdp;
 try{
  cdp=await browser();for(const width of [320,1365]){
   fixture.close();fixture=await ledgerFixture();control.conflictZero=false;control.unconfirmReference=false;const requestsBefore=requests.length,postsBefore=posts.length,physicalBefore=JSON.stringify(await fixture.physical());
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width===320});control.browserClock=Date.parse('2026-11-01T02:30:00Z');await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+host.address().port+'/admin?tab=margins'});
   await waitFor(cdp,"document.readyState==='complete'&&!!globalThis.brazaIncurredProduction",'the generated ledger must initialize in the existing Costs workspace');
   const brt=await cdp.evaluate("(()=>{brazaIncurredProduction.start({api:async()=>{throw Error('CLOSED_LEDGER_MUST_NOT_READ');}});return {month:document.getElementById('incurredProductionMonth').value,week:document.getElementById('incurredProductionWeek').value,open:document.getElementById('incurredProductionDetails').open};})()");assert.deepEqual(brt,{month:'2026-10',week:'2026-10-31',open:false},'UTC November still belongs to October in Brasília before03:00UTC');
   assert.equal(requests.slice(requestsBefore).filter(row=>row.path.startsWith('/api/admin/production/incurred')).length,0);control.browserClock=clock;await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+host.address().port+'/admin?tab=margins'});
   await waitFor(cdp,"document.readyState==='complete'&&!!globalThis.brazaIncurredProduction&&!document.getElementById('incurredProductionReload').disabled",'the owner bootstrap must start the ledger without opening or loading it');
   const initial=await cdp.evaluate("({panel:document.documentElement.dataset.activePanel,open:document.getElementById('incurredProductionDetails').open,month:document.getElementById('incurredProductionMonth').value,week:document.getElementById('incurredProductionWeek').value,width:innerWidth,scroll:document.documentElement.scrollWidth})");assert.equal(initial.panel,'margins');assert.equal(initial.open,false);assert.equal(initial.month,selection.month);assert.equal(initial.week,selection.week_of);assert.ok(initial.scroll<=initial.width+1);assert.equal(posts.length,postsBefore);assert.equal(requests.slice(requestsBefore).filter(row=>row.path.startsWith('/api/admin/production/incurred')).length,0,'the closed ledger must not create a GET or a schema');
   assert.equal(fixture.env.ADMIN_DB.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'incurred_production_%'").get().n,0);
   await click(cdp,'#incurredProductionDetails>summary');await waitFor(cdp,"brazaIncurredProduction.getSnapshot()?.ledger?.revision===0",'opening the ledger must read a valid empty local snapshot');
   const empty=await cdp.evaluate("brazaIncurredProduction.getSnapshot()");assert.equal(empty.ledger.summary.state,'NO_RECORDS');assert.equal(empty.ledger.summary.total_cost_cents,null);assert.equal(empty.ledger.inventory_valuation.state,'UNKNOWN');assert.equal(empty.ledger.inventory_valuation.amount_cents,null);assert.equal(empty.ledger.financial_integration_allowed,false);assert.equal(empty.ledger.external_stock_write_allowed,false);assert.equal(fixture.env.ADMIN_DB.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'incurred_production_%'").get().n,0,'a cold GET cannot create the mutation schema');
   await waitFor(cdp,"Number.isSafeInteger(brazaMonthDashboard.getSnapshot().checked_at)",'the existing financial snapshot must settle independently before testing ledger isolation');const financialBefore=await cdp.evaluate('JSON.stringify(brazaMonthDashboard.getSnapshot())');
   await fill(cdp,'#incurredProductionForm',{production_ref:maliciousReference,produced_date:'2026-11-01',quantity:'2',source_key:'',cost_mode:'UNKNOWN',unit_cost:'',cost_reference:'',reference_confirmed:false,evidence:'Lote manual confirmado para teste sintético',confirmed:true});await click(cdp,'#incurredProductionForm [data-incurred-action=record]');await waitFor(cdp,"brazaIncurredProduction.getSnapshot()?.ledger?.revision===1",'unknown historical cost must remain unknown after an explicit production declaration');
   const unknown=(await fixture.read()).ledger,firstRecord=unknown.records[0];assert.equal(firstRecord.cost.state,'UNKNOWN');assert.equal(firstRecord.cost.unit_cost_cents,null);assert.equal(unknown.summary.produced_quantity,2);assert.equal(unknown.summary.unknown_cost_quantity,2);assert.equal(unknown.summary.total_cost_cents,null);
   control.conflictZero=true;await fill(cdp,'#incurredProductionForm',{production_ref:'Lote custo zero',produced_date:'2026-11-01',quantity:'1',source_key:'',cost_mode:'DECLARED',unit_cost:'0,00',cost_reference:'',reference_confirmed:false,evidence:'Custo zero declarado explicitamente no teste',confirmed:true});await click(cdp,'#incurredProductionForm [data-incurred-action=record]');await waitFor(cdp,"brazaIncurredProduction.getSnapshot()?.ledger?.revision===2",'a concurrent declaration must trigger a fresh saved revision');
   const preserved=await cdp.evaluate("({reference:document.querySelector('#incurredProductionForm [name=production_ref]').value,quantity:document.querySelector('#incurredProductionForm [name=quantity]').value,cost:document.querySelector('#incurredProductionForm [name=unit_cost]').value})");assert.deepEqual(preserved,{reference:'Lote custo zero',quantity:'1',cost:'0,00'},'CAS must preserve the explicit zero draft rather than turn it into unknown or another amount');await click(cdp,'#incurredProductionForm [data-incurred-action=record]');await waitFor(cdp,"brazaIncurredProduction.getSnapshot()?.ledger?.revision===3",'the owner may confirm the preserved draft against the current revision');
   const zero=(await fixture.read()).ledger.records.find(row=>row.production_ref==='Lote custo zero');assert.equal(zero.cost.state,'DECLARED');assert.equal(zero.cost.unit_cost_cents,0);assert.equal(zero.quantity,1);
   await fill(cdp,'#incurredProductionForm',{source_key:sourceKey});const unfilled=await cdp.evaluate("({quantity:document.querySelector('#incurredProductionForm [name=quantity]').value,size:document.querySelector('#incurredProductionForm [name=size]').value,segment:document.querySelector('#incurredProductionForm [name=garment_type]').value,cost:document.querySelector('#incurredProductionForm [name=unit_cost]').value,costMode:document.querySelector('#incurredProductionForm [name=cost_mode]').value})");assert.deepEqual(unfilled,{quantity:'',size:'',segment:'UNKNOWN',cost:'',costMode:'UNKNOWN'},'two saved selling units of a kit cannot become produced-piece quantity, identity or cost');
   await fill(cdp,'#incurredProductionForm',{production_ref:'Lote DTF parcial',produced_date:'2026-11-01',quantity:'3',artwork:'Retrô 80',color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',identity_confirmed:true,cost_reference:'ADULT_REGULAR'});
   const suggestion=await cdp.evaluate("({mode:document.querySelector('#incurredProductionForm [name=cost_mode]').value,cost:document.querySelector('#incurredProductionForm [name=unit_cost]').value,referenceConfirmed:document.querySelector('#incurredProductionForm [name=reference_confirmed]').checked,confirmed:document.querySelector('#incurredProductionForm [name=confirmed]').checked})");assert.equal(suggestion.mode,'DECLARED');assert.equal(Number(suggestion.cost.replace(',','.')),15.9);assert.equal(suggestion.referenceConfirmed,false);assert.equal(suggestion.confirmed,false,'a suggestion must not confirm a historical manufacturing fact');
   await fill(cdp,'#incurredProductionForm',{reference_confirmed:true,evidence:'Três peças realmente produzidas, custo histórico conferido',confirmed:true});control.unconfirmReference=true;await click(cdp,'#incurredProductionForm [data-incurred-action=record]');await waitFor(cdp,"!document.getElementById('incurredProductionRetry').hidden&&!document.getElementById('incurredProductionRetry').disabled",'a committed but unreadable result must preserve the same idempotent attempt');const attempted=posts.at(-1);assert.equal(attempted.quantity,3);assert.equal(attempted.cost.unit_cost_cents,1590);assert.equal(attempted.source.kind,'SAVED_DTF_ORDER_LINE');await click(cdp,'#incurredProductionRetry');await waitFor(cdp,"brazaIncurredProduction.getSnapshot()?.ledger?.revision===4",'replay must survive later source deletion and current-reference changes');assert.deepEqual(posts.slice(-2)[0],posts.slice(-2)[1],'an unknown outcome must retry the exact original body and request_id');
   const saved=(await fixture.read()).ledger,dtf=saved.records.find(row=>row.production_ref==='Lote DTF parcial');assert.equal(dtf.quantity,3);assert.equal(dtf.source.selling_quantity,2);assert.equal(dtf.source.order_status,'READY_TO_SHIP');assert.equal(dtf.cost.reference.revision,7);assert.equal(dtf.cost.unit_cost_cents,1590);assert.equal(saved.summary.known_cost_cents,4770);assert.equal(saved.summary.total_cost_cents,null);assert.equal(saved.summary.unknown_cost_quantity,3);assert.equal(saved.records.length,4);
   await cdp.evaluate(`(()=>{const record=document.getElementById('incurredProductionRecord');record.value=${JSON.stringify(firstRecord.record_id)};record.dispatchEvent(new Event('change',{bubbles:true}));})()`);await fill(cdp,'#incurredProductionVoidForm',{reason:'Correção: custo histórico foi confirmado depois'});await click(cdp,'#incurredProductionVoidForm [data-incurred-action=void]');await waitFor(cdp,"brazaIncurredProduction.getSnapshot()?.ledger?.revision===5",'void must retain the historical fact and exclude it from current recorded totals');
   await fill(cdp,'#incurredProductionForm',{replaces_record_id:firstRecord.record_id});const replacementDraft=await cdp.evaluate("({reference:document.querySelector('#incurredProductionForm [name=production_ref]').value,readonly:document.querySelector('#incurredProductionForm [name=production_ref]').readOnly})");assert.equal(replacementDraft.reference,maliciousReference);assert.equal(replacementDraft.readonly,true);
   await fill(cdp,'#incurredProductionForm',{produced_date:'2026-11-01',quantity:'2',source_key:'',cost_mode:'DECLARED',unit_cost:'15,90',cost_reference:'',reference_confirmed:false,evidence:'Substituição explícita com o custo histórico confirmado',confirmed:true});await click(cdp,'#incurredProductionForm [data-incurred-action=record]');await waitFor(cdp,"brazaIncurredProduction.getSnapshot()?.ledger?.revision===6",'the correction must be a linked replacement, not a rewritten old quantity or cost');
   const corrected=(await fixture.read()).ledger,original=corrected.records.find(row=>row.record_id===firstRecord.record_id),replacement=corrected.records.find(row=>row.replaces_record_id===firstRecord.record_id);assert.equal(original.status,'VOID');assert.equal(original.cost.state,'UNKNOWN');assert.equal(original.quantity,2);assert.ok(replacement);assert.equal(replacement.cost.unit_cost_cents,1590);assert.equal(replacement.quantity,2);assert.equal(corrected.summary.active_records,4);assert.equal(corrected.summary.voided_records,1);assert.equal(corrected.summary.produced_quantity,7);assert.equal(corrected.summary.known_cost_cents,7950);assert.equal(corrected.summary.total_cost_cents,null);
   await cdp.evaluate("(()=>{const month=document.getElementById('incurredProductionMonth');month.value='2026-10';month.dispatchEvent(new Event('change',{bubbles:true}));})()");await waitFor(cdp,"brazaIncurredProduction.getSnapshot()?.month==='2026-10'",'month selection must remain independent of the selected week');const ranges=await cdp.evaluate('brazaIncurredProduction.getSnapshot().periods');assert.equal(ranges.monthly.summary.state,'NO_RECORDS');assert.equal(ranges.monthly.summary.total_cost_cents,null);assert.equal(ranges.weekly.start_date,'2026-10-26');assert.equal(ranges.weekly.end_date,'2026-11-01');assert.equal(ranges.weekly.summary.produced_quantity,7);assert.equal(ranges.weekly.summary.known_cost_cents,7950);
   const final=await cdp.evaluate("({text:document.getElementById('incurredProduction').textContent,ledger:brazaIncurredProduction.getSnapshot().ledger,financial:JSON.stringify(brazaMonthDashboard.getSnapshot()),unsafe:document.querySelectorAll('#incurredProduction img,#incurredProduction script').length,xss:__incurredXss,errors:__incurredErrors,width:innerWidth,scroll:document.documentElement.scrollWidth})");assert.equal(final.financial,financialBefore,'recording incurred production must not change the eligible-sales financial snapshot');assert.equal(JSON.stringify(await fixture.physical()),physicalBefore,'manufacturing declarations must not value or mutate the physical-return ledger');assert.equal(final.ledger.inventory_valuation.state,'UNKNOWN');assert.equal(final.ledger.inventory_valuation.amount_cents,null);assert.equal(final.ledger.financial_integration_allowed,false);assert.equal(final.ledger.external_stock_write_allowed,false);assert.ok(final.text.includes(maliciousReference),'operator text must remain literal');assert.equal(final.unsafe,0);assert.equal(final.xss,false);assert.deepEqual(final.errors,[]);assert.ok(final.scroll<=final.width+1);assert.equal(serverFailure,null);assert.ok(requests.slice(requestsBefore).filter(row=>row.method==='POST').every(row=>row.path.startsWith('/api/admin/production/incurred?')),'all explicit writes must remain in the new local incurred-production ledger');
  }
 }finally{await cdp?.close();host.closeAllConnections?.();await new Promise(resolve=>host.close(resolve));fixture.close();}
});

