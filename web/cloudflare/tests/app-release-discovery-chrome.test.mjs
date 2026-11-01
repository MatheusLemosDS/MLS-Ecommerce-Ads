import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {after} from 'node:test';
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
import {readPhysicalReturns,mutatePhysicalReturns} from '../src/physical-returns.mjs';
import {readIncurredProduction,mutateIncurredProduction,incurredProductionPeriods} from '../src/incurred-production.mjs';
import {readReturnManufacturingLinks,mutateReturnManufacturingLinks,returnManufacturingLinkHandles,deriveReturnManufacturingLinkContext,assessReturnManufacturingLink} from '../src/return-manufacturing-links.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function browser(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-app-release-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'}),cleanup=createChromeProfileCleanup(child,profile);let socket;
 try{
  const port=await waitForChromeDebugPort(child,profile);let page;
  for(let index=0;index<100;index++){try{page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(row=>row.type==='page'&&row.webSocketDebuggerUrl);}catch{}if(page)break;await pause(50);}
  assert.ok(page,'Chromium must initialize a page target');socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('RETURN_MANUFACTURING_CDP_OPEN_TIMEOUT')),10000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('RETURN_MANUFACTURING_CDP_OPEN_ERROR'));},{once:true});});
  let sequence=0;const pending=new Map();socket.addEventListener('message',event=>{const value=JSON.parse(event.data),call=pending.get(value.id);if(!call)return;pending.delete(value.id);clearTimeout(call.timer);value.error?call.reject(Error(value.error.message||'RETURN_MANUFACTURING_CDP_ERROR')):call.resolve(value.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('RETURN_MANUFACTURING_CDP_TIMEOUT:'+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  await send('Page.enable');await send('Runtime.enable');
  return {send,async evaluate(expression){const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value;},close:()=>cleanup(socket)};
 }catch(error){await cleanup(socket);throw error;}
}

async function waitFor(cdp,expression,label,diagnostic=null){
 for(let index=0;index<160;index++){if(await cdp.evaluate(expression))return;await pause(50);}
 assert.fail(label+(diagnostic?' '+JSON.stringify(await diagnostic()):''));
}

async function click(cdp,selector){
 await cdp.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)throw Error('RETURN_MANUFACTURING_TEST_CLICK_TARGET_MISSING');node.scrollIntoView({block:'center',behavior:'instant'});})()`);
 await cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 const position=await cdp.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)}),rect=node.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return {x:rect.x+rect.width/2,y:rect.y+rect.height/2,height:rect.height,visible:node.checkVisibility({checkVisibilityCSS:true}),unobscured:hit===node||node.contains(hit)};})()`);
 assert.equal(position.visible,true,'the action must remain visible');assert.ok(position.height>=44,'association actions need44px touch targets');assert.equal(position.unobscured,true,'the action must not be covered by navigation');
 await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:position.x,y:position.y});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:position.x,y:position.y});
}

const clock=Date.parse('2026-11-01T18:00:00Z'),receiptClock=Date.parse('2026-11-01T02:30:00Z'),stamp=clock/1000;
const caseHash='a'.repeat(64),otherCaseHash='b'.repeat(64),orderHash='c'.repeat(64),otherOrderHash='d'.repeat(64);
const lineId='11111111-1111-4111-8111-111111111111',unrelatedLineId='22222222-2222-4222-8222-222222222222',otherLineId='33333333-3333-4333-8333-333333333333';
const ids={good:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',unknownOrder:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',fit:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',identity:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',order:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',date:'ffffffff-ffff-4fff-8fff-ffffffffffff',catalog:'77777777-7777-4777-8777-777777777777',large:'88888888-8888-4888-8888-888888888888'};
const identity={artwork:'Retrô 80',color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:'10001',model_id:'20001',sku:'SKU M'};
const maliciousEvidence='Origem declarada <img src=x onerror="globalThis.__linkXss=true">';

async function fixture(){
 const env={ADMIN_DB:new D1()},now=()=>clock,controls={parentsUnavailable:false};
 const physicalMutation=async(body,at=clock,sourceCase=null)=>mutatePhysicalReturns(env,body,'synthetic-link-owner',{now:()=>at,sourceCase});
 let physical=await physicalMutation({revision:0,request_id:crypto.randomUUID(),action:'register',case_hash:caseHash,order_hash:orderHash},receiptClock,{case_hash:caseHash,order_hash:orderHash,status:'ACCEPTED',checked_at:receiptClock/1000-60,month:'2026-10',publication_revision:9});
 for(const [line,quantity]of [[lineId,4],[unrelatedLineId,3]])physical=await physicalMutation({revision:physical.revision,request_id:crypto.randomUUID(),action:'receive',case_hash:caseHash,line_id:line,receipt_ref:'Recebimento '+line.slice(0,8),quantity,identity},receiptClock);
 physical=await physicalMutation({revision:physical.revision,request_id:crypto.randomUUID(),action:'register',case_hash:otherCaseHash,order_hash:otherOrderHash},clock,{case_hash:otherCaseHash,order_hash:otherOrderHash,status:'CLOSED',checked_at:stamp-60,month:'2026-11',publication_revision:10});
 await physicalMutation({revision:physical.revision,request_id:crypto.randomUUID(),action:'receive',case_hash:otherCaseHash,line_id:otherLineId,receipt_ref:'Outro mês - M',quantity:3,identity});
 let production=await readIncurredProduction(env,{now});
 for(const [key,quantity,changes]of [['good',3,{}],['unknownOrder',2,{}],['fit',5,{fit:'FEMALE'}],['identity',5,{confirmed:false}],['order',5,{}],['date',5,{}],['catalog',5,{model_id:'20002'}],['large',5,{}]]){
  const linkedOrder=key==='good'?orderHash:key==='order'?otherOrderHash:null,sourceKey=key==='good'?'1'.repeat(64):'2'.repeat(64),sourceHash=key==='good'?'3'.repeat(64):'4'.repeat(64),source=linkedOrder?{kind:'SAVED_DTF_ORDER_LINE',key:sourceKey,hash:sourceHash}:{kind:'MANUAL_LOT',key:null,hash:null};
  const trustedSource=linkedOrder?{...source,checked_at:stamp-60,order_hash:linkedOrder,order_status:'READY_TO_SHIP',selling_quantity:1}:null;
  production=await mutateIncurredProduction(env,{revision:production.revision,request_id:crypto.randomUUID(),action:'record',record_id:ids[key],production_ref:'Fabricação '+key,replaces_record_id:null,produced_date:key==='date'?'2026-11-01':'2026-10-31',quantity,identity:{...identity,...changes},source,cost:{unit_cost_cents:key==='unknownOrder'?1590:null,reference:null},evidence:'Fabricação sintética confirmada pelo operador',confirmed:true},'synthetic-link-owner',{now,trustedSource});
 }
 const parents=async()=>({physical:await readPhysicalReturns(env,{now}),production:await readIncurredProduction(env,{now})});
 const read=async()=>{
  const ledger=await readReturnManufacturingLinks(env,{now}),p=controls.parentsUnavailable?{physical:null,production:null}:await parents(),handles=await returnManufacturingLinkHandles(p.physical,p.production),context=deriveReturnManufacturingLinkContext(ledger,p.physical,p.production,handles);assert.ok(context);
  return {schema:'return_manufacturing_links_workspace_v1',checked_at:stamp,ledger,...p,handles,context};
 };
 const mutate=async body=>{const p=controls.parentsUnavailable?{physical:null,production:null}:await parents();await mutateReturnManufacturingLinks(env,body,'synthetic-link-owner',{now,...p});return read();};
 const inspect=async(line,identified=identity,partition=null)=>{const current=await readPhysicalReturns(env,{now}),record=current.cases.find(row=>row.case_hash===caseHash),entry=record.lines.find(row=>row.line_id===line);return physicalMutation({revision:current.revision,request_id:crypto.randomUUID(),action:'inspect',case_hash:caseHash,line_id:line,partition:partition??{resellable:0,repair:0,damaged:0,mismatch:0,quarantine:entry.quantity},identity:identified,reason:'Inspeção física sintética confirmada'});};
 const voidPhysical=async line=>{const current=await readPhysicalReturns(env,{now});return physicalMutation({revision:current.revision,request_id:crypto.randomUUID(),action:'void',case_hash:caseHash,line_id:line,reason:'Correção física sintética'});};
 const voidProduction=async record=>{const current=await readIncurredProduction(env,{now});return mutateIncurredProduction(env,{revision:current.revision,request_id:crypto.randomUUID(),action:'void',record_id:record,reason:'Correção de fabricação sintética'},'synthetic-link-owner',{now});};
 const choice=(workspace,physicalLine,productionId,quantity=1,physicalCase=caseHash)=>{const a=workspace.context.physical.find(row=>row.case_hash===physicalCase&&row.line_id===physicalLine),b=workspace.context.production.find(row=>row.record_id===productionId);return {case_hash:physicalCase,physical_line_id:physicalLine,production_record_id:productionId,quantity,physical_fingerprint:a.fingerprint,production_fingerprint:b.fingerprint};};
 return {env,controls,read,parents,mutate,inspect,voidPhysical,voidProduction,choice,close:()=>env.ADMIN_DB.db.close()};
}

async function fill(cdp,form,fields){
 await cdp.evaluate(`(()=>{const form=document.querySelector(${JSON.stringify(form)});if(!form)throw Error('LINK_TEST_FORM_MISSING');for(const [name,value]of Object.entries(${JSON.stringify(fields)})){const input=form.querySelector('[name="'+name+'"]');if(!input)throw Error('LINK_TEST_FIELD_MISSING:'+name);if(input.type==='checkbox')input.checked=value;else input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
}


const targets=[
 {id:'physicalReturnsDetails',panel:'agent-returns',controller:'brazaPhysicalReturns',path:'/api/admin/returns/physical'},
 {id:'incurredProductionDetails',panel:'margins',controller:'brazaIncurredProduction',path:'/api/admin/production/incurred'},
 {id:'returnManufacturingLinksDetails',panel:'agent-returns',controller:'brazaReturnManufacturingLinks',path:'/api/admin/returns/manufacturing-links'}
];
const generatedHash=createHash('sha256').update(readFileSync(new URL('../dist/app-worker.mjs',import.meta.url))).digest('hex');
const qa=[];
const physicalRequest=row=>targets.some(target=>row.path.startsWith(target.path));
const geometry=target=>`(()=>{const target=document.getElementById(${JSON.stringify(target.id)}),summary=target.querySelector('summary'),rect=summary.getBoundingClientRect(),bar=document.querySelector('.topbar').getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return {id:target.id,panel:document.documentElement.dataset.activePanel,hash:location.hash,open:target.open,focused:document.activeElement===target,summary_top:rect.top,summary_bottom:rect.bottom,topbar_bottom:bar.bottom,summary_center_hit:hit===summary||summary.contains(hit),horizontal_overflow:document.documentElement.scrollWidth>innerWidth+1,page_errors:__auditErrors};})()`;

for(const minify of [false,true])for(const width of [320,1365])test(`generated release discovery opens saved controls without financial mutations (${width}px, minify=${minify})`,{timeout:90000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 const owner=await compiledOwnerReportPage(minify,{ownerPreview:true,localReadSnapshot:true});
 assert.equal([...owner.html.matchAll(/<script>/g)].length,15,'release discovery must reuse the fifteen existing scripts');
 const local=new Map(owner.localReadSnapshot.responses.map(row=>[row.path,row])),requests=[],store=await fixture();let serverFailure=null;
 const initial=await store.read();await store.mutate({revision:initial.ledger.revision,request_id:crypto.randomUUID(),action:'link',link_id:crypto.randomUUID(),...store.choice(initial,lineId,ids.good,1),evidence:'Associação sintética para conferir navegação',confirmed:true});
 const ledgerBefore=JSON.stringify(await store.read());
 const html=owner.html.replace('<head>','<head><script>const AuditDate=Date;globalThis.Date=class extends AuditDate{constructor(...args){super(...(args.length?args:['+clock+']));}static now(){return '+clock+';}};globalThis.__auditErrors=[];addEventListener("error",e=>__auditErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>__auditErrors.push(String(e.reason?.message||e.reason)));</script>');
 const host=http.createServer(async(req,res)=>{
  try{
   if(!req.url.startsWith('/api/')){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);return;}
   requests.push({method:req.method,path:req.url});const u=new URL(req.url,'http://synthetic.invalid'),headers={'content-type':'application/json','cache-control':'no-store'};
   if(req.method!=='GET'){res.writeHead(405,headers);res.end('{"error":"SYNTHETIC_READ_ONLY"}');return;}
   let value=null;
   if(u.pathname==='/api/admin/returns/manufacturing-links'){assert.equal(u.search,'');value=await store.read();}
   else if(u.pathname==='/api/admin/returns/physical'){
    const month=u.searchParams.get('month'),physical=await readPhysicalReturns(store.env,{now:()=>clock}),cases=physical.cases.filter(row=>row.source.month===month).map(row=>({case_hash:row.case_hash,order_hash:row.order_hash,status:row.source.status,checked_at:row.source.checked_at,publication_revision:row.source.publication_revision}));
    value={schema:'physical_returns_workspace_v1',month,checked_at:stamp,source:{status:'AVAILABLE',checked_at:stamp,cases_total:cases.length,cases_included:cases.length,truncated:false,reason:null,cases},physical};
   }else if(u.pathname==='/api/admin/production/incurred'){
    const selected={month:u.searchParams.get('month'),week_of:u.searchParams.get('week_of')},ledger=await readIncurredProduction(store.env,{now:()=>clock});
    value={schema:'incurred_production_workspace_v1',...selected,checked_at:stamp,ledger,periods:incurredProductionPeriods(ledger,selected),source:{status:'AVAILABLE',checked_at:stamp,included:0,has_more:false,reason:null,candidates:[]},references:{status:'UNAVAILABLE',revision:null,mode:null,adult_regular_cents:null,adult_plus_cents:null}};
   }else{const entry=local.get(req.url);if(entry){value=entry.body;if(entry.contract)headers['x-braza-client-contract']=entry.contract;}}
   res.writeHead(value?200:503,headers);res.end(JSON.stringify(value||{error:'SYNTHETIC_UNMAPPED_OPTIONAL_SOURCE'}));
  }catch(error){serverFailure=error.message;res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"SYNTHETIC_HANDLER_FAILED"}');}
 });
 await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve));let cdp;const proofs=[];
 try{
  cdp=await browser();await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width===320});
  const base='http://127.0.0.1:'+host.address().port;
  const navigate=async suffix=>{await cdp.send('Page.navigate',{url:base+'/admin'+suffix});await waitFor(cdp,"document.readyState==='complete'&&!!globalThis.brazaPhysicalReturns&&!!globalThis.brazaIncurredProduction&&!!globalThis.brazaReturnManufacturingLinks&&Number.isSafeInteger(brazaMonthDashboard.getSnapshot().checked_at)",'the generated owner page must settle its cached financial snapshot');};
  const assertDestination=async(target,start,mode)=>{
   await waitFor(cdp,`${target.controller}.getSnapshot()!==null&&document.activeElement===document.getElementById(${JSON.stringify(target.id)})`,'a real destination must open its saved control and receive focus');
   await cdp.evaluate('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');
   const result=await cdp.evaluate(geometry(target));assert.equal(result.panel,target.panel);assert.equal(result.hash,'#'+target.id);assert.equal(result.open,true);assert.equal(result.focused,true);assert.ok(result.summary_top>=result.topbar_bottom+4,'the summary must remain below the sticky header: '+JSON.stringify(result));assert.equal(result.summary_center_hit,true);assert.equal(result.horizontal_overflow,false);assert.deepEqual(result.page_errors,[]);
   const reads=requests.slice(start).filter(physicalRequest);assert.equal(reads.length,1,'opening one control must perform exactly one lazy saved-data GET');assert.equal(new URL(reads[0].path,base).pathname,target.path);assert.equal(reads[0].method,'GET');
   if(target.panel==='agent-returns')assert.equal(await cdp.evaluate("(()=>{const panel=document.getElementById('agent-returns'),chart=panel.querySelector('[data-mission-specialist-chart]');return !!chart&&[document.getElementById('physicalReturns'),document.getElementById('returnManufacturingLinks')].every(node=>!!(node.compareDocumentPosition(chart)&Node.DOCUMENT_POSITION_FOLLOWING));})()"),true,'receiving and origin controls must precede specialist graphs');
   proofs.push({...result,mode,lazy_gets:reads.length});return result;
  };
  for(const target of targets){
   let start=requests.length;await navigate('?tab=overview');
   const overview=await cdp.evaluate("({release:document.querySelector('.app-release-overview')?.dataset.appRelease,header:document.querySelector('.app-release-header-link')?.getAttribute('aria-label'),headerHref:document.querySelector('.app-release-header-link')?.getAttribute('href'),links:[...document.querySelectorAll('.app-release-overview .app-release-links a')].map(a=>({href:a.getAttribute('href'),bypass:a.hasAttribute('data-mission-open')})),scope:document.querySelector('.app-release-scope')?.textContent,financial:JSON.stringify(brazaMonthDashboard.getSnapshot()),overflow:document.documentElement.scrollWidth>innerWidth+1})");
   assert.equal(overview.release,'2026-11-01.1');assert.match(overview.header,/2026-11-01\.1/);assert.equal(overview.headerHref,'/admin?tab=roadmap#appReleaseNotes');assert.deepEqual(overview.links.map(row=>row.href),targets.map(row=>'/admin?tab='+row.panel+'#'+row.id));assert.ok(overview.links.every(row=>row.bypass===false),'native links must retain the precise destination hash');assert.match(overview.scope,/impacto financeiro.*ainda não foi apurado/i);assert.equal(overview.overflow,false);assert.equal(requests.slice(start).filter(physicalRequest).length,0,'Overview must not fetch the three physical-control sources');
   if(process.env.MLS_APP_RELEASE_SCREENSHOT_DIR&&target===targets[0]){mkdirSync(process.env.MLS_APP_RELEASE_SCREENSHOT_DIR,{recursive:true});await cdp.evaluate("document.querySelector('.app-release-overview').scrollIntoView({block:'center',behavior:'instant'})");const capture=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(process.env.MLS_APP_RELEASE_SCREENSHOT_DIR,`app-release-${minify?'minified':'normal'}-${width}.png`),Buffer.from(capture.data,'base64'));}
   start=requests.length;await click(cdp,`.app-release-overview .app-release-links a[href="/admin?tab=${target.panel}#${target.id}"]`);await assertDestination(target,start,'overview-link');assert.equal(await cdp.evaluate('JSON.stringify(brazaMonthDashboard.getSnapshot())'),overview.financial,'navigation must not change the cached financial projection');
   start=requests.length;await navigate('?tab='+target.panel+'#'+target.id);await assertDestination(target,start,'initial-deep-link');
  }
  await navigate('?tab=overview');const beforeSearch=requests.length;
  await cdp.evaluate("mlsWorkspaceSearch.open();const input=document.getElementById('missionSearchInput');input.value='Receber e inspecionar devoluções';input.dispatchEvent(new Event('input',{bubbles:true}));");
  await waitFor(cdp,"!!document.querySelector('#missionSearchResults a[data-search-route=physical-receiving]')",'local navigation search must expose the real receiving destination');
  await click(cdp,'#missionSearchResults a[data-search-route=physical-receiving]');await assertDestination(targets[0],beforeSearch,'local-search');
  const final=await cdp.evaluate('({errors:__auditErrors,overflow:document.documentElement.scrollWidth>innerWidth+1})');assert.deepEqual(final.errors,[]);assert.equal(final.overflow,false);assert.equal(serverFailure,null);assert.equal(requests.filter(row=>row.method!=='GET').length,0,'discovery cannot mutate owner data');assert.equal(JSON.stringify(await store.read()),ledgerBefore,'all saved physical, manufacturing and association data must stay unchanged');
  qa.push({minify,width,pass:true,page_errors:0,horizontal_overflow:false,provider_calls:0,remote_writes:0,owner_mutation_requests:0,financial_snapshot_unchanged:true,release_id:'2026-11-01.1',proofs});
 }finally{await cdp?.close();host.closeAllConnections?.();await new Promise(resolve=>host.close(resolve));store.close();}
});

after(()=>{
 if(!process.env.MLS_APP_RELEASE_SCREENSHOT_DIR||qa.length!==4)return;
 mkdirSync(process.env.MLS_APP_RELEASE_SCREENSHOT_DIR,{recursive:true});
 writeFileSync(path.join(process.env.MLS_APP_RELEASE_SCREENSHOT_DIR,'app-release-discovery-chrome-qa.json'),JSON.stringify({schema:'mls_app_release_discovery_chrome_qa_v1',generated_app_sha256:generatedHash,synthetic:true,provider_calls:0,remote_writes:0,owner_mutation_requests:0,financial_snapshot_unchanged:true,results:qa},null,2)+'\n');
});
