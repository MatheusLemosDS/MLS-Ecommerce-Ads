import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {receiptChrome,receiptBrowser,receiptClick as nativeClick,receiptPause} from './returns-receipts-chrome-helpers.mjs';
import {proposalBrowserFixture,proposalClock} from './proposal-browser-fixture.mjs';

const results=[],qaFile=process.env.MLS_PRODUCTION_PROPOSAL_QA_FILE||null,screens=process.env.MLS_PRODUCTION_PROPOSAL_SCREENSHOT_DIR||null;
const guards=['legacy_contracts_unchanged','overview_agents_preserved','manufacturing_confirmation_explicit','commercial_cost_not_piece_cost','month_drafts_preserved'];
const workerHashes=()=>Object.fromEntries(['app','auth','finance'].map(name=>[name,createHash('sha256').update(readFileSync(new URL('../../../dist/'+name+'-worker.mjs',import.meta.url))).digest('hex')]));
let frozenWorkers=null;
async function wait(cdp,expression,label){
 for(let turn=0;turn<180;turn++){if(await cdp.evaluate(expression))return;await receiptPause(50);}
 assert.fail(label+' '+JSON.stringify(await cdp.evaluate("({errors:globalThis.__proposalErrors,active:document.documentElement.dataset.activePanel,status:document.getElementById('incurredProductionProposal')?.textContent,snapshot:globalThis.brazaProductionConfirmationProposal?.getSnapshot?.()})")));
}
async function click(cdp,selector){
 try{return await nativeClick(cdp,selector);}catch(cause){throw Error('PROPOSAL_NATIVE_ACTION_FAILED '+JSON.stringify(await cdp.evaluate(`({selector:${JSON.stringify(selector)},exists:!!document.querySelector(${JSON.stringify(selector)}),active:document.documentElement.dataset.activePanel,errors:globalThis.__proposalErrors,status:document.getElementById('incurredProductionProposal')?.textContent})`)),{cause});}
}
async function readyFinancialBaseline(cdp,expected){
 assert.equal(expected.status,'COMPLETE');assert.ok(Number.isSafeInteger(expected.checked_at));assert.ok(Number.isSafeInteger(expected.result.net_estimate_cents));
 let previous=null,last=null;
 for(let turn=0;turn<180;turn++){
  last=await cdp.evaluate('globalThis.brazaMonthDashboard?.getSnapshot?.()??null');
  const ready=last?.month===expected.month&&last.status==='COMPLETE'&&Number.isSafeInteger(last.checked_at)&&last.checked_at===expected.checked_at&&last.period_loading===false&&Number.isSafeInteger(last.balance_cents)&&last.balance_cents===expected.result.net_estimate_cents&&last.presentation?.state==='ESTIMATE'&&last.presentation.amount_cents===expected.result.net_estimate_cents;
  const full=JSON.stringify(last);if(ready&&full===previous)return full;previous=ready?full:null;await receiptPause(50);
 }
 assert.fail('FINANCIAL_BASELINE_NOT_READY '+JSON.stringify({expected:{month:expected.month,status:expected.status,checked_at:expected.checked_at,balance_cents:expected.result.net_estimate_cents,period_loading:false,presentation_state:'ESTIMATE'},actual:last}));
}
async function field(cdp,name,value,selector='#incurredProductionForm'){
 const target=selector+' [name="'+name+'"]';
 await cdp.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(target)});if(!n)throw Error('PROPOSAL_QA_FIELD_MISSING:'+${JSON.stringify(target)});if(n.type==='checkbox')n.checked=${JSON.stringify(value)};else Object.getOwnPropertyDescriptor(n.tagName==='SELECT'?HTMLSelectElement.prototype:n.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(String(value))});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}
const formExpression="Object.fromEntries([...document.querySelectorAll('#incurredProductionForm [name]')].map(n=>[n.name,n.type==='checkbox'?n.checked:n.value]))";
const protectedNames=['production_ref','produced_date','quantity','artwork','cost_mode','unit_cost','cost_reference','evidence'];
const protectedFields=value=>Object.fromEntries(protectedNames.map(key=>[key,value[key]]));
async function bounds(cdp){
 const rows=await cdp.evaluate("[...document.querySelectorAll('#incurredProductionProposal,#incurredProductionProposal :is(button,select)')].filter(n=>n.checkVisibility({checkVisibilityCSS:true})).map(n=>{const r=n.getBoundingClientRect();return {tag:n.tagName,left:r.left,right:r.right,height:r.height,client:n.clientWidth,scroll:n.scrollWidth};})");
 assert.ok(rows.length);const width=await cdp.evaluate('innerWidth');for(const row of rows){assert.ok(row.left>=-2&&row.right<=width+2,JSON.stringify(row));assert.ok(row.scroll<=row.client+2,JSON.stringify(row));if(['SELECT','BUTTON'].includes(row.tag))assert.ok(row.height>=44,JSON.stringify(row));}
 assert.equal(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'the actual manufacturing workspace must fit the viewport');
}
async function contrast(cdp){
 const rows=await cdp.evaluate(`(()=>{
  const rgb=value=>{const parts=value.match(/[\\d.]+/g)?.map(Number);if(!parts||parts.length<3)throw Error('PROPOSAL_QA_COLOR_INVALID:'+value);return {r:parts[0],g:parts[1],b:parts[2],a:parts[3]??1};};
  const composite=(top,bottom)=>({r:top.r*top.a+bottom.r*(1-top.a),g:top.g*top.a+bottom.g*(1-top.a),b:top.b*top.a+bottom.b*(1-top.a),a:1});
  const background=n=>{const ancestors=[];for(let p=n;p;p=p.parentElement)ancestors.push(p);let color={r:255,g:255,b:255,a:1};for(const p of ancestors.reverse())color=composite(rgb(getComputedStyle(p).backgroundColor),color);return color;};
  const luminance=color=>[color.r,color.g,color.b].map(value=>{const v=value/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  return [...document.querySelectorAll('#incurredProductionProposal :is(h4,strong,p,dt,dd,small,summary,label)')].filter(n=>n.textContent.trim()&&n.checkVisibility({checkVisibilityCSS:true})).map(n=>{const bg=background(n),foreground=composite(rgb(getComputedStyle(n).color),bg),a=luminance(foreground),b=luminance(bg);return {tag:n.tagName,text:n.textContent.slice(0,70),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),foreground,bg};});
 })()`);
 assert.ok(rows.length>=6);for(const row of rows)assert.ok(row.ratio>=4.5,'proposal text must remain readable in the active theme: '+JSON.stringify(row));return Math.min(...rows.map(row=>row.ratio));
}

for(const minify of [false,true])for(const width of [320,1365])test(`compiled saved production proposal requires explicit piece confirmation (${width}px,minify=${minify})`,{timeout:150000},async t=>{
 if(!receiptChrome)return t.skip('Chromium unavailable');const hashes=workerHashes();if(frozenWorkers)assert.deepEqual(hashes,frozenWorkers);else frozenWorkers=hashes;
 const fixture=await proposalBrowserFixture(),canonical=fixture.canonical(),physical=await fixture.snapshot(),finance=fixture.finance.financialSnapshot,provider=fixture.finance.providerCalls();
 const owner=await compiledOwnerReportPage(minify,{ownerPreview:true,localReadSnapshot:true}),cached=new Map(owner.localReadSnapshot.responses.map(row=>[row.path,row])),requests=[],network=[];
 let failure=null,mode='normal',releaseHeld=null,held=null;
 const html=owner.html.replace('<head>','<head><script>const ProposalQaDate=Date;globalThis.Date=class extends ProposalQaDate{constructor(...args){super(...(args.length?args:['+proposalClock+']));}static now(){return '+proposalClock+';}};globalThis.__proposalErrors=[];addEventListener("error",e=>__proposalErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>__proposalErrors.push(String(e.reason?.message||e.reason)));</script>');
 const server=http.createServer(async(req,res)=>{try{
  if(!req.url.startsWith('/api/')){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);return;}
  requests.push({method:req.method,path:req.url});assert.equal(req.method,'GET','proposal selection and application never submit a physical manufacturing fact');
  const url=new URL(req.url,'http://synthetic.invalid'),headers={'content-type':'application/json','cache-control':'no-store'};let response=null,status=200;
  if(url.pathname==='/api/admin/production/proposal'){
   assert.deepEqual([...url.searchParams.keys()],['source_key','source_hash']);
   if(mode==='stale'){status=409;response={error:'PRODUCTION_CONFIRMATION_PROPOSAL_SOURCE_CHANGED'};mode='normal';}
   else{response=await fixture.proposal(Object.fromEntries(url.searchParams));if(mode==='hold'){mode='normal';held=new Promise(resolve=>{releaseHeld=resolve;});await held;}}
  }else if(url.pathname==='/api/admin/production/incurred')response=await fixture.read({month:url.searchParams.get('month'),week_of:url.searchParams.get('week_of')});
  else if(url.pathname==='/api/admin/finance/business-month-view'){response=fixture.finance.financialViews.get(url.searchParams.get('month'));headers['x-braza-client-contract']='business-month-view-v5';}
  else{const entry=cached.get(req.url);if(entry){response=entry.body;if(entry.contract)headers['x-braza-client-contract']=entry.contract;}}
  res.writeHead(response?status:503,headers);res.end(JSON.stringify(response||{error:'SYNTHETIC_OPTIONAL_SOURCE_UNAVAILABLE'}));
 }catch(error){failure=error.message;res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"SYNTHETIC_PROPOSAL_QA_FAILED"}');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let cdp;
 const proposalGets=()=>requests.filter(row=>row.path.startsWith('/api/admin/production/proposal?'));
 const source=async name=>{await field(cdp,'source_key',fixture.sources[name]?.key??'');};
 try{
  cdp=await receiptBrowser();cdp.on('Network.requestWillBeSent',event=>network.push(event.request.url));await cdp.send('Network.enable');await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===320});
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/admin?tab=overview&month=2026-10&date=2026-10-20'});
  await wait(cdp,"document.readyState==='complete'&&globalThis.brazaProductionConfirmationProposal&&brazaMonthDashboard?.getSnapshot?.()?.month==='2026-10'",'the compiled proposal controller must initialize');
  const baseline=await readyFinancialBaseline(cdp,fixture.finance.financialView.display);
  const overview=await cdp.evaluate("(()=>{const cards=[...document.querySelectorAll('#commandCenterAgents>.agent-card')],kpis=document.querySelector('#commandCenter>.command-center-metrics'),agents=document.getElementById('commandAgents'),charts=document.querySelector('.mls-overview-performance');return {ids:cards.map(n=>n.dataset.missionAccent),visible:cards.every(n=>n.checkVisibility()),after_kpis:!!(kpis.compareDocumentPosition(agents)&Node.DOCUMENT_POSITION_FOLLOWING),before_charts:!!(agents.compareDocumentPosition(charts)&Node.DOCUMENT_POSITION_FOLLOWING),financial:JSON.stringify(brazaMonthDashboard.getSnapshot())};})()");
  assert.equal(overview.financial,baseline);assert.deepEqual(overview.ids,['hermes','finance','ads','products','production','returns']);assert.equal(overview.visible,true);assert.equal(overview.after_kpis,true);assert.equal(overview.before_charts,true);assert.equal(proposalGets().length,0);
  await click(cdp,'#commandCenterAgents [data-mission-open="agent-production"]');
  await wait(cdp,"brazaIncurredProduction.getSnapshot()?.month==='2026-10'&&!!document.querySelector('#incurredProductionForm [name=source_key]')&&!!document.getElementById('incurredProductionProposal')",'the existing physical manufacturing form and optional suggestion host must be ready');
  assert.equal(proposalGets().length,0,'opening production does not request saved proposal metadata');
  await click(cdp,'#agent-production .mission-page-tabs a[href="#incurredProductionRecordsPane"]');await click(cdp,'#incurredProductionOptionalFields>summary');
  await cdp.evaluate(`(()=>{const n=document.getElementById('incurredProductionRecord');n.value=${JSON.stringify(fixture.active_record_id)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait(cdp,"!!document.querySelector('#incurredProductionVoidForm [name=reason]')",'known ACTIVE record supplies a deterministic correction draft');
  for(const [key,value]of Object.entries({production_ref:'QA rascunho preservado',produced_date:'2026-10-20',quantity:'9',artwork:'Arte fisicamente conferida em QA',evidence:'Evidência sintética mantida pelo operador',cost_reference:'ADULT_REGULAR',identity_confirmed:true,confirmed:true,reference_confirmed:true}))await field(cdp,key,value);
  await field(cdp,'reason','Correção sintética preservada','#incurredProductionVoidForm');
  const untouched=await cdp.evaluate(formExpression);await source('kit');
  await wait(cdp,`brazaProductionConfirmationProposal.getSnapshot()?.source?.key===${JSON.stringify(fixture.sources.kit.key)}`,'one explicitly selected saved kit supplies current cached metadata');
  assert.equal(proposalGets().length,1);assert.deepEqual(await cdp.evaluate(formExpression),{...untouched,source_key:fixture.sources.kit.key,identity_confirmed:false,reference_confirmed:false},'selecting the source preserves facts and clears confirmations tied to the old context');
  assert.equal(await cdp.evaluate("document.querySelector('#incurredProductionProposal [data-proposal-component]').value"),'','kits require an explicit component choice');
  assert.equal(await cdp.evaluate("document.querySelector('#incurredProductionProposal [data-proposal-action=apply]').disabled"),true);
  const text=await cdp.evaluate("document.getElementById('incurredProductionProposal').textContent");assert.match(text,/unidade.*anúncio/);assert.match(text,/31,80/);assert.match(text,/não é o custo histórico de uma peça/);
  await cdp.evaluate("(()=>{const n=document.querySelector('#incurredProductionProposal [data-proposal-component]');n.value='component-2';n.dispatchEvent(new Event('change',{bubbles:true}));})()");
  for(const name of ['identity_confirmed','reference_confirmed','confirmed'])await field(cdp,name,true);
  assert.equal(await cdp.evaluate("document.querySelector('#incurredProductionProposal [data-proposal-component]').value"),'component-2','form edits preserve the explicit component selection');
  assert.deepEqual(await cdp.evaluate("['identity_confirmed','reference_confirmed','confirmed'].map(name=>document.querySelector('#incurredProductionForm [name='+name+']').checked)"),[true,true,true],'all three prior confirmations exist before applying changed identity');
  const keyboardDocument=await cdp.send('DOM.getDocument'),keyboardTarget=await cdp.send('DOM.querySelector',{nodeId:keyboardDocument.root.nodeId,selector:'#incurredProductionProposal [data-proposal-component]'});await cdp.send('DOM.focus',{nodeId:keyboardTarget.nodeId});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await cdp.evaluate("document.activeElement?.matches?.('#incurredProductionProposal [data-proposal-action=apply]')"),true,'native keyboard navigation reaches the explicit apply action');
  await click(cdp,'#incurredProductionProposal [data-proposal-action=apply]');
  await wait(cdp,"document.getElementById('incurredProductionProposal').textContent.includes('Dados salvos aplicados')",'an explicit action fills only safe blank identity fields');
  const applied=await cdp.evaluate(formExpression);assert.equal(applied.size,'GG');assert.equal(applied.garment_type,'ADULT');assert.equal(applied.fit,'FEMALE');assert.deepEqual(protectedFields(applied),protectedFields(untouched));for(const name of ['identity_confirmed','confirmed','reference_confirmed'])assert.equal(applied[name],false);
  assert.equal(applied.quantity,'9','two commercial kit units never become four or two manufactured pieces');assert.equal(applied.unit_cost,untouched.unit_cost,'the R$31.80 commercial kit reference never overwrites historical piece cost');
  await source('single');await wait(cdp,`brazaProductionConfirmationProposal.getSnapshot()?.source?.key===${JSON.stringify(fixture.sources.single.key)}`,'a different source is loaded only after explicit selection');
  const conflict=await cdp.evaluate(formExpression);await click(cdp,'#incurredProductionProposal [data-proposal-action=apply]');await wait(cdp,"document.getElementById('incurredProductionProposal').textContent.includes('Nada foi preenchido')",'conflicting nonempty identity blocks the entire patch');assert.deepEqual(await cdp.evaluate(formExpression),conflict);
  await source('unknown');await wait(cdp,`brazaProductionConfirmationProposal.getSnapshot()?.source?.key===${JSON.stringify(fixture.sources.unknown.key)}`,'missing saved metadata remains an explicit unknown');assert.equal(await cdp.evaluate('brazaProductionConfirmationProposal.getSnapshot().catalog.state'),'UNKNOWN');assert.equal(await cdp.evaluate("!!document.querySelector('#incurredProductionProposal [data-proposal-action=apply]')"),false);assert.deepEqual(protectedFields(await cdp.evaluate(formExpression)),protectedFields(untouched));
  mode='stale';await source('single');await wait(cdp,"document.getElementById('incurredProductionProposal').textContent.includes('contexto salvo mudou')",'409 stale source is explained without discarding the manual draft');assert.equal(await cdp.evaluate('brazaProductionConfirmationProposal.getSnapshot()'),null);
  mode='hold';await source('kit');for(let n=0;!releaseHeld&&n<100;n++)await receiptPause(20);assert.equal(typeof releaseHeld,'function');const beforeManual=proposalGets().length;await source(null);releaseHeld();await receiptPause(150);assert.equal(await cdp.evaluate('brazaProductionConfirmationProposal.getSnapshot()'),null,'a late response cannot repopulate a source that the owner deselected');assert.equal(proposalGets().length,beforeManual,'manual lot does not call the proposal endpoint');
  await source('kit');await wait(cdp,`brazaProductionConfirmationProposal.getSnapshot()?.source?.key===${JSON.stringify(fixture.sources.kit.key)}`,'the saved kit remains available after optional metadata errors');
  const themes=[],contrastMinimum={};for(const theme of ['light','dark']){
   await cdp.evaluate("(()=>{const n=[...document.querySelectorAll('[data-braza-theme-toggle]')].find(n=>n.checkVisibility());n.id='qaProposalThemeToggle';})()");
   for(let changes=0;await cdp.evaluate('document.documentElement.dataset.themePreference')!==theme&&changes<3;changes++)await click(cdp,'#qaProposalThemeToggle');
   assert.equal(await cdp.evaluate('document.documentElement.dataset.theme'),theme);await bounds(cdp);contrastMinimum[theme]=await contrast(cdp);themes.push(theme);
   if(screens){mkdirSync(screens,{recursive:true});await cdp.evaluate("document.getElementById('incurredProductionProposal').scrollIntoView({block:'center',behavior:'instant'})");const shot=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});writeFileSync(path.join(screens,(minify?'min':'normal')+'-'+width+'-'+theme+'.png'),Buffer.from(shot.data,'base64'));}
  }
  await cdp.evaluate("(()=>{const s=document.createElement('style');s.textContent='#incurredProductionProposal :is(p,label,button,summary,dt,dd,small){font-size:20px!important}';document.head.append(s);})()");await bounds(cdp);
  await click(cdp,'#agent-production .mission-page-tabs a[href="#incurredProductionCalendarTitle"]');await click(cdp,'#incurredProduction a[href="#incurredProductionRangePane"]');await click(cdp,'#incurredProductionComparisons>summary');
  await cdp.evaluate("(()=>{const n=document.getElementById('incurredProductionMonth');n.value='2026-09';n.dispatchEvent(new Event('change',{bubbles:true}));})()");await wait(cdp,"brazaIncurredProduction.getSnapshot()?.month==='2026-09'",'manufacturing history can change months');
  await cdp.evaluate("(()=>{const n=document.getElementById('incurredProductionMonth');n.value='2026-10';n.dispatchEvent(new Event('change',{bubbles:true}));})()");await wait(cdp,"brazaIncurredProduction.getSnapshot()?.month==='2026-10'&&!!document.querySelector('#incurredProductionVoidForm [name=reason]')",'the original physical manufacturing month and active correction draft return');
  await click(cdp,'#agent-production .mission-page-tabs a[href="#incurredProductionRecordsPane"]');
  const final=await cdp.evaluate(formExpression);assert.deepEqual(protectedFields(final),protectedFields(untouched));assert.equal(await cdp.evaluate("document.querySelector('#incurredProductionVoidForm [name=reason]').value"),'Correção sintética preservada');
  assert.equal(await cdp.evaluate('JSON.stringify(brazaMonthDashboard.getSnapshot())'),overview.financial,'the fully READY financial snapshot is byte-for-byte unchanged');assert.equal(fixture.canonical(),canonical);assert.equal(await fixture.snapshot(),physical);assert.equal(JSON.stringify(fixture.finance.financialView),finance);assert.equal(fixture.finance.providerCalls(),provider);assert.equal(failure,null);assert.deepEqual(await cdp.evaluate('__proposalErrors'),[]);assert.equal(requests.filter(row=>row.method!=='GET').length,0);assert.ok(network.every(url=>url.startsWith('http://127.0.0.1:')||/^(data:|blob:|about:)/.test(url)));
  results.push({minify,width,pass:true,page_errors:0,horizontal_overflow:false,themes,text_contrast_minimum:contrastMinimum,large_font_checked:true,...Object.fromEntries(guards.map(key=>[key,true])),synthetic_mutation_requests:0,proposal_reads:proposalGets().length,stale_response_rejected:true,late_response_ignored:true});
 }finally{releaseHeld?.();await cdp?.close();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));fixture.close();}
});

after(()=>{
 if(frozenWorkers)assert.deepEqual(workerHashes(),frozenWorkers,'all four profiles must validate the same generated Worker vector');
 if(qaFile){const complete=results.length===4;mkdirSync(path.dirname(qaFile),{recursive:true});writeFileSync(qaFile,JSON.stringify({schema:'mls_production_confirmation_proposal_qa_v1',generated_hashes:frozenWorkers,...Object.fromEntries(guards.map(key=>[key,complete&&results.every(row=>row[key]===true)])),remote_writes:0,owner_real_mutation_requests:0,new_provider_calls:0,results},null,2)+'\n');}
});
