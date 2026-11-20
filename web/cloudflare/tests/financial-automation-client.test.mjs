import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {financialAutomationUiFixture} from './financial-automation-ui-fixture.mjs';
import {financialAccountingPeriod} from '../src/financial-accounting-schedule.mjs';
import {projectFinancialAutomationWorkspace,financialAutomationRowsCsv,createFinancialAutomationController,FINANCIAL_AUTOMATION_CLIENT} from '../src/financial-automation-client.mjs';

test('financial browser projection preserves canonical amounts, partial sources and explicit scope',async()=>{
 const input=await financialAutomationUiFixture(),before=JSON.stringify(input),value=projectFinancialAutomationWorkspace(input,{month:input.month,scope:input.scope});
 assert.ok(value);assert.equal(value.projection.result.amount_cents,-2500);assert.equal(value.projection.positions.bank.amount_cents,3000);assert.deepEqual(value.projection.series,input.projection.series);assert.equal(JSON.stringify(input),before);
 assert.equal(projectFinancialAutomationWorkspace(input,{month:'2026-09'}),null);assert.equal(projectFinancialAutomationWorkspace(input,{scope:{...input.scope,organization_id:'foreign-company'}}),null);
 const denied=structuredClone(input);denied.permissions.financial_read=false;assert.equal(projectFinancialAutomationWorkspace(denied),null);
 const mixed=structuredClone(input);mixed.projection.cash_projection.obligations[0].scope.organization_id='other-company';assert.equal(projectFinancialAutomationWorkspace(mixed),null);
 const partial=await financialAutomationUiFixture({partial:true}),p=projectFinancialAutomationWorkspace(partial);assert.ok(p);assert.equal(p.projection.result.amount_cents,null);assert.equal(p.projection.positions.bank.amount_cents,null);
});

test('financial browser projection rejects unsafe money, missing fields and executable property values',async()=>{
 const value=await financialAutomationUiFixture();
 for(const amount of [NaN,Infinity,1.5,-0,Number.MAX_SAFE_INTEGER+1]){const bad=structuredClone(value);bad.projection.series[0].known_result_cents=amount;assert.equal(projectFinancialAutomationWorkspace(bad),null);}
 const bad=structuredClone(value);delete bad.projection.positions.bank;assert.equal(projectFinancialAutomationWorkspace(bad),null);
 let invoked=0;const property=structuredClone(value);Object.defineProperty(property,'extra',{get(){invoked++;return 1;}});assert.equal(projectFinancialAutomationWorkspace(property),null);assert.equal(invoked,0);
 const future=structuredClone(value);future.projection.series[0]={...future.projection.series[0],state:'NOT_OBSERVED',known_result_cents:null,known_bank_delta_cents:null,result_cents:null,bank_delta_cents:null,event_refs:[]};assert.ok(projectFinancialAutomationWorkspace(future));
});

test('CSV keeps the exact canonical rows, integer cents, scope and cutoff without raw payloads',async()=>{
 const value=await financialAutomationUiFixture(),csv=financialAutomationRowsCsv(value);assert.ok(csv.startsWith('\uFEFF'));const lines=csv.trim().split('\r\n');assert.equal(lines.length,value.projection.series.length+1);
 const row=value.projection.series.find(x=>x.date==='2026-10-20');assert.ok(csv.includes('"'+row.date+'";"'+row.state+'";"'+row.result_cents+'";"'+row.known_result_cents+'"'));assert.ok(csv.includes('"BRL";"'+value.projection.checked_at+'"'));assert.ok(!csv.includes('source.payload'));assert.ok(!csv.includes('native_id'));assert.ok(!csv.includes('buyer'));
});

test('read controller coalesces reads, rejects foreign responses and clears data after authorization loss',async()=>{
 const value=await financialAutomationUiFixture();let reads=0,mode='pending',resolve;
 const c=createFinancialAutomationController({});assert.equal(c.start({api:()=>{reads++;if(mode==='pending')return new Promise(r=>{resolve=r;});if(mode==='denied')throw Object.assign(Error(),{status:403,apiCode:'ACCOUNT_FORBIDDEN'});if(mode==='unavailable')throw Object.assign(Error(),{status:503,apiCode:'FINANCIAL_STORAGE_UNAVAILABLE'});return structuredClone({...value,scope:{...value.scope,organization_id:'foreign-company'}});},month:value.month,scope:value.scope}),true);
 c.open();const first=c.refresh(),second=c.refresh();await Promise.resolve();assert.equal(reads,1);resolve(value);assert.equal(await first,true);assert.equal(await second,true);assert.equal(c.getSnapshot().scope.organization_id,value.scope.organization_id);assert.deepEqual(c.getVisualRows('components').map(x=>x.amount_cents),[...value.projection.result.components.map(x=>x.amount_cents),value.projection.result.amount_cents]);assert.deepEqual(c.getVisualRows('positions').map(x=>x.amount_cents),[value.projection.positions.receivables.amount_cents,value.projection.positions.wallet.held.amount_cents,value.projection.positions.wallet.available.amount_cents,value.projection.positions.transit.amount_cents,value.projection.positions.bank.amount_cents]);
 assert.deepEqual(c.getVisualRows('forecast').map(x=>x.amount_cents),[...value.projection.cash_projection.scenarios.map(x=>x.amount_cents),...value.projection.cash_projection.obligations.map(x=>x.amount_cents)]);mode='unavailable';assert.equal(await c.refresh(),false);assert.equal(c.getSnapshot().scope.organization_id,value.scope.organization_id);assert.equal(c.getState().stale,true);mode='foreign';assert.equal(await c.refresh(),false);assert.equal(c.getSnapshot(),null);
 mode='denied';assert.equal(await c.refresh(),false);assert.equal(c.getSnapshot(),null);assert.equal(c.getState().stale,false);c.stop();assert.equal(c.getSnapshot(),null);
});

test('a superseded period cannot publish a late response into the next month',async()=>{
 const value=await financialAutomationUiFixture();let resolve;const c=createFinancialAutomationController({});c.start({month:value.month,scope:value.scope,api:()=>new Promise(r=>{resolve=r;})});c.open();const first=c.refresh();await Promise.resolve();c.hide();c.observe('2026-09');resolve(value);assert.equal(await first,false);assert.equal(c.getSnapshot(),null);assert.equal(c.getState().month,'2026-09');c.stop();
});

for(const minify of [false,true])test('standalone financial browser module boots and validates real projector output '+(minify?'minified':'normal'),async()=>{
 const input=await financialAutomationUiFixture(),compiled=await build({entryPoints:[new URL('../src/financial-automation-client.mjs',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const module=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const context=vm.createContext({crypto:globalThis.crypto});vm.runInContext(module.FINANCIAL_AUTOMATION_CLIENT,context);vm.runInContext('globalThis.fixture=JSON.parse('+JSON.stringify(JSON.stringify(input))+');globalThis.brazaFinancialAutomation.start({month:fixture.month,scope:fixture.scope,api:async()=>fixture});globalThis.brazaFinancialAutomation.open();',context);
 for(let attempt=0;attempt<20;attempt++){if(vm.runInContext('!!brazaFinancialAutomation.getSnapshot()',context))break;await new Promise(r=>setTimeout(r,0));}
 assert.equal(vm.runInContext('brazaFinancialAutomation.getSnapshot()?.projection.result.amount_cents',context),input.projection.result.amount_cents,'the emitted client literal has no dangling renamed helper reference');
 vm.runInContext('brazaFinancialAutomation.stop()',context);
});

// The small DOM contains only the real pending-list destination. It supplies no
// financial facts: amounts and states still come from the canonical fixture.
function pendingListDocument(){
 const make=()=>{let own='';return {children:[],dataset:{},style:{},append(...items){this.children.push(...items);},replaceChildren(...items){own='';this.children=[...items];},setAttribute(){},addEventListener(){},querySelectorAll(){return [];},contains(){return false;},get textContent(){return own+this.children.map(n=>n?.textContent??String(n??'')).join(' ');},set textContent(value){own=String(value);this.children=[];}};};
 const root=make(),pending=make();return {pending,document:{hidden:false,getElementById:id=>id==='financialAutomation'?root:id==='financialAutomationPending'?pending:null,createElement:()=>make()}};
}
for(const minify of [false,true])test('pending payout adjustments have clear actions without inventing profit '+(minify?'minified':'normal'),async()=>{
 const input=await financialAutomationUiFixture({partial:true});input.pending=['ORDER_ADJUSTMENT_CLASSIFICATION_REQUIRED','ORDER_TOPUP_COMPONENT_REQUIRED'];
 const compiled=await build({entryPoints:[new URL('../src/financial-automation-client.mjs',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify}),module=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const view=pendingListDocument(),context=vm.createContext({crypto:globalThis.crypto,document:view.document});vm.runInContext(module.FINANCIAL_AUTOMATION_CLIENT,context);vm.runInContext('globalThis.fixture=JSON.parse('+JSON.stringify(JSON.stringify(input))+');globalThis.reads=0;brazaFinancialAutomation.start({month:fixture.month,scope:fixture.scope,api:async()=>{reads++;return fixture;}});brazaFinancialAutomation.open();',context);
 for(let attempt=0;attempt<20;attempt++){if(vm.runInContext('!!brazaFinancialAutomation.getSnapshot()',context))break;await new Promise(r=>setTimeout(r,0));}
 assert.match(view.pending.textContent,/Classifique os ajustes do repasse antes de reconhecer a receita\./);assert.match(view.pending.textContent,/Confira a recarga ou o suporte técnico abatido no repasse\./);assert.equal(vm.runInContext('brazaFinancialAutomation.getSnapshot().projection.result.amount_cents',context),null);assert.equal(vm.runInContext('brazaFinancialAutomation.getState().stale',context),false);assert.equal(vm.runInContext('reads',context),1);vm.runInContext('brazaFinancialAutomation.stop()',context);
});

// Only real form destinations are present. Financial facts and periods still
// come from the canonical fixture; the mock merely dispatches DOM events.
function financialControlsDocument(){
 const make=()=>{let own='';const listeners=new Map();return {children:[],dataset:{},style:{},value:'',checked:false,disabled:false,hidden:false,append(...items){this.children.push(...items);},replaceChildren(...items){own='';this.children=[...items];},setAttribute(){},addEventListener(event,callback){if(!listeners.has(event))listeners.set(event,[]);listeners.get(event).push(callback);},emit(event){for(const callback of listeners.get(event)??[])callback({target:this,preventDefault(){}});},querySelectorAll(){return [];},contains(){return false;},get textContent(){return own+this.children.map(n=>n?.textContent??String(n??'')).join(' ');},set textContent(value){own=String(value);this.children=[];}};};
 const ids=['','Status','Stale','Refresh','PolicyForm','PolicyReason','PolicyFrom','PolicyCalendar','PolicyReserve','PolicyAutomatic','PolicyConfirmed','CloseActions','CloseForm','CloseSelected','CloseBasis','CloseKind','CloseAnchor','CloseReason','CloseConfirmed','ClosePrepare','CloseFinalize','CloseRectify','Discard'],fields=Object.fromEntries(ids.map(id=>[id,make()]));
 return {fields,document:{hidden:false,getElementById:id=>fields[id.replace(/^financialAutomation/,'')]??null,createElement:()=>make()},emit:(name,event='change')=>fields[name].emit(event)};
}
const passiveFinancialChild=()=>({configure(){},stop(){},setWritable(){},discard(){}});
function financialFormController(view){return createFinancialAutomationController({document:view.document,crypto:globalThis.crypto},{allocations:passiveFinancialChild,inventory:passiveFinancialChild});}

test('reopening resumes an interrupted financial refresh once and preserves unsaved forms',async()=>{
 const initial=await financialAutomationUiFixture(),updated=await financialAutomationUiFixture({checked_at:'2026-11-06T12:00:00.000Z'}),view=financialControlsDocument(),c=financialFormController(view);let reads=0,resolveOld;
 c.start({month:initial.month,scope:initial.scope,api:()=>{reads++;return reads===2?new Promise(resolve=>{resolveOld=resolve;}):structuredClone(reads===1?initial:updated);}});c.open();assert.equal(await c.refresh(),true);
 view.fields.PolicyReason.value='Conferir a política antes de salvar';view.emit('PolicyForm','input');view.fields.CloseReason.value='Conferir os documentos do fechamento';view.emit('CloseForm','input');
 const interrupted=c.refresh();await Promise.resolve();assert.equal(reads,2);c.hide();assert.equal(c.getState().busy,false);assert.equal(await c.refresh(),false);assert.equal(reads,2,'hidden workspace does not request data');
 c.open();await Promise.resolve();assert.equal(reads,3,'opening itself resumes the canceled refresh');const resumed=c.refresh(),coalesced=c.refresh();assert.equal(await resumed,true);assert.equal(await coalesced,true);assert.equal(reads,3,'reopen and explicit refresh share one resumed read');
 resolveOld(initial);assert.equal(await interrupted,false,'late interrupted response remains discarded');assert.equal(c.getSnapshot().projection.checked_at,updated.projection.checked_at);assert.equal(c.hasDraft(),true);assert.equal(view.fields.PolicyReason.value,'Conferir a política antes de salvar');assert.equal(view.fields.CloseReason.value,'Conferir os documentos do fechamento');assert.equal(c.getState().stale,false);
 c.hide();c.open();await Promise.resolve();assert.equal(reads,3,'reopening a current workspace does not poll');c.stop();
});

test('resuming an interrupted financial refresh still clears forms after authorization is revoked',async()=>{
 const input=await financialAutomationUiFixture(),view=financialControlsDocument(),c=financialFormController(view);let reads=0,resolveOld,rejectResumed;
 c.start({month:input.month,scope:input.scope,api:()=>{reads++;if(reads===1)return structuredClone(input);if(reads===2)return new Promise(resolve=>{resolveOld=resolve;});return new Promise((_resolve,reject)=>{rejectResumed=reject;});}});c.open();await c.refresh();view.fields.CloseReason.value='Rascunho autorizado anteriormente';view.emit('CloseForm','input');
 const interrupted=c.refresh();await Promise.resolve();c.hide();c.open();await Promise.resolve();assert.equal(reads,3,'reopen performs authorization revalidation without a manual refresh');const resumed=c.refresh();rejectResumed(Object.assign(Error('denied'),{status:403,apiCode:'ACCOUNT_FORBIDDEN'}));assert.equal(await resumed,false);assert.equal(reads,3);assert.equal(c.getSnapshot(),null);assert.equal(c.hasDraft(),false);assert.equal(view.fields.CloseReason.value,'');resolveOld(input);assert.equal(await interrupted,false);assert.equal(c.getSnapshot(),null);c.stop();
});

for(const [operation,status,button]of [['finalize','PRONTO','CloseFinalize'],['rectify','FECHADO','CloseRectify'],['rectify','RETIFICADO','CloseRectify']])test('closing '+operation+' rejects changed identity before posting and retains drafts from '+status,async()=>{
 const input=await financialAutomationUiFixture();input.closings[0].status=status;const view=financialControlsDocument(),c=financialFormController(view),posts=[];
 c.start({month:input.month,scope:input.scope,api:async(path,body)=>{if(body){posts.push({path,body});return {};}return structuredClone(input);}});c.open();await c.refresh();const select=()=>{view.fields.CloseSelected.value=input.closings[0].close_id+'@1';view.emit('CloseSelected');view.fields.CloseReason.value='Conferência documental preservada';view.fields.CloseConfirmed.checked=true;view.emit('CloseForm');};select();assert.equal(view.fields[button].disabled,false);
 for(const[field,value]of [['CloseBasis','BANK_CASH'],['CloseKind','CIVIL_WEEK'],['CloseAnchor','2026-11-01'],['CloseAnchor','2026-10-32']]){view.fields[field].value=value;view.emit('CloseForm');assert.equal(view.fields[button].disabled,true,field+' mismatch disables '+operation);view.fields[button].disabled=false;assert.equal(await (operation==='finalize'?c.finalizeClose():c.rectifyClose()),false,'direct submission also rejects a changed closing identity');assert.equal(posts.length,0);assert.ok(c.getSnapshot());assert.equal(c.hasDraft(),true);assert.equal(view.fields.CloseReason.value,'Conferência documental preservada');select();}
 view.fields.CloseAnchor.value='2026-10-17';view.emit('CloseForm');assert.equal(view.fields[button].disabled,false,'another valid day in the selected month preserves identity');assert.equal(await (operation==='finalize'?c.finalizeClose():c.rectifyClose()),true);assert.equal(posts.length,1);assert.equal(posts[0].body.close_id,input.closings[0].close_id);assert.equal(posts[0].body.expected_revision,1);assert.equal(posts[0].body.anchor,'2026-10-17');assert.equal(posts[0].body.basis,'ACCRUAL');c.stop();
});

test('weekly closing actions preserve the selected immutable range after a calendar policy refresh',async()=>{
 const input=await financialAutomationUiFixture(),view=financialControlsDocument(),c=financialFormController(view);input.closings[0].period=financialAccountingPeriod({kind:'CIVIL_WEEK',anchor:'2026-10-16',week_starts_on:'FRIDAY'});let current=input,posts=0;
 c.start({month:input.month,scope:input.scope,api:async(_path,body)=>{if(body){posts++;return {};}return structuredClone(current);}});c.open();await c.refresh();view.fields.CloseSelected.value=input.closings[0].close_id+'@1';view.emit('CloseSelected');view.fields.CloseReason.value='Conferir a semana civil';view.fields.CloseConfirmed.checked=true;view.emit('CloseForm');assert.equal(view.fields.CloseFinalize.disabled,false);
 view.fields.CloseAnchor.value='2026-10-22';view.emit('CloseForm');assert.equal(view.fields.CloseFinalize.disabled,false,'Thursday belongs to the selected Friday to Thursday period');view.fields.CloseAnchor.value='2026-10-23';view.emit('CloseForm');assert.equal(view.fields.CloseFinalize.disabled,true);view.fields.CloseAnchor.value='2026-10-16';view.emit('CloseForm');assert.equal(view.fields.CloseFinalize.disabled,false);
 current=structuredClone(input);current.configuration.policy.financial_week='CIVIL_MONDAY_SUNDAY';current.configuration.proposed_policy.financial_week='CIVIL_MONDAY_SUNDAY';current.projection.policy.financial_week='CIVIL_MONDAY_SUNDAY';assert.equal(await c.refresh(),true);assert.equal(view.fields.CloseFinalize.disabled,false,'selected Friday closing keeps its immutable calendar after Monday approval');assert.equal(c.hasDraft(),true);assert.equal(view.fields.CloseReason.value,'Conferir a semana civil');assert.equal(await c.finalizeClose(),true);assert.equal(posts,1);c.stop();
});

test('preparing a new weekly calendar does not reuse the previous calendar closing identity',async()=>{
 const input=await financialAutomationUiFixture();input.closings[0].period=financialAccountingPeriod({kind:'CIVIL_WEEK',anchor:'2026-10-16',week_starts_on:'FRIDAY'});input.configuration.policy.financial_week='CIVIL_MONDAY_SUNDAY';input.configuration.proposed_policy.financial_week='CIVIL_MONDAY_SUNDAY';input.projection.policy.financial_week='CIVIL_MONDAY_SUNDAY';const view=financialControlsDocument(),c=financialFormController(view),posts=[];
 c.start({month:input.month,scope:input.scope,api:async(path,body)=>{if(body){posts.push({path,body});return {};}return structuredClone(input);}});c.open();await c.refresh();view.fields.CloseKind.value='CIVIL_WEEK';view.fields.CloseBasis.value='ACCRUAL';view.fields.CloseAnchor.value='2026-10-16';view.fields.CloseReason.value='Preparar a semana segundo o calendário aprovado';view.fields.CloseConfirmed.checked=true;view.emit('CloseForm');assert.equal(view.fields.ClosePrepare.disabled,false);assert.equal(await c.prepareClose(),true);assert.equal(posts.length,1);assert.equal(posts[0].body.close_id,null);assert.equal(posts[0].body.expected_revision,0);assert.equal(posts[0].body.anchor,'2026-10-16');c.stop();
});
