import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {productionWeeklyClosingBody,PRODUCTION_WEEKLY_CLIENT,projectProductionWeeklyClosingWorkspace} from '../src/production-weekly-view.mjs';
import {readProductionWeeklyClosingWorkspace,runProductionWeeklyClosing} from '../src/production-weekly-store.mjs';
import {D1} from './sqlite-d1.mjs';
import {ownerReportBrowser} from './owner-report-browser-fixture.mjs';
import {weeklyProductionFixture,weeklyProductionClock} from './production-weekly-browser-fixture.mjs';

const clone=v=>JSON.parse(JSON.stringify(v));
function mount(f,{panel='agent-production',clock=weeklyProductionClock}={}){
 const prelude='globalThis.weeklyReadyHandlers=[];globalThis.weeklyEvents={};document.addEventListener=(name,handler)=>{(weeklyEvents[name]??=[]).push(handler);if(name==="mls-production-analytics-ready")weeklyReadyHandlers.push(handler);};globalThis.addEventListener=(name,handler)=>{(weeklyEvents[name]??=[]).push(handler);};';
 const b=ownerReportBrowser('<section id="missionProductionFabricationPane"></section><section id="missionProductionWeeklyPane"></section><input id="foreignManufacturingDraft">'+productionWeeklyClosingBody()+'<script>'+prelude+PRODUCTION_WEEKLY_CLIENT+'</script>',{scriptIncludes:'globalThis.brazaProductionWeeklyClosing='}),calls=[];
 b.context.crypto=webcrypto;b.context.weeklyClock=clock;b.context.weeklyPanel=panel;
 let transport=async(path,body)=>body?f.mutate(body):f.read(new URL('https://synthetic.test/'+path).searchParams.get('month'));
 b.context.readWeeklySaved=async(path,body)=>{const copied=body===undefined?null:clone(body);calls.push({path,body:copied,frozen:body===undefined?null:Object.isFrozen(body)});return JSON.stringify(await transport(path,copied));};
 b.run('class WeeklyDate extends Date{constructor(...args){super(...(args.length?args:[weeklyClock]));}static now(){return weeklyClock;}}globalThis.Date=WeeklyDate;document.documentElement.dataset.activePanel=weeklyPanel;const weeklyApi=async(path,body)=>JSON.parse(await readWeeklySaved(path,body));brazaProductionWeeklyClosing.start({api:weeklyApi});');
 const snapshot=()=>clone(b.run('brazaProductionWeeklyClosing.getSnapshot()'));
 const field=(id,name)=>b.nodes.get('productionWeeklyClosingRecords').querySelector('[data-weekly-record="'+id+'"]').querySelector('[name="'+name+'"]');
 const fill=(id,values)=>{for(const [name,value]of Object.entries(values)){const input=field(id,name);if(name==='confirmed'){input.checked=value;input.onchange();}else{input.value=value;input.oninput();}}};
 return {b,calls,snapshot,field,fill,setTransport:value=>transport=value,setClock:value=>{b.context.weeklyClock=value;},async event(name){b.context.weeklyEventName=name;await b.run('Promise.all((weeklyEvents[weeklyEventName]||[]).map(fn=>fn()))');await b.flush();},async fireTimer(){const [id,timer]=[...b.timers][0]??[];assert.ok(timer,'a bounded refresh must be armed');b.timers.delete(id);await timer.callback();await b.flush();return timer.delay;},async open(){const value=b.run('brazaProductionWeeklyClosing.open();');await b.flush();return value;},async refresh(){const value=b.run('brazaProductionWeeklyClosing.refresh();');await b.flush();return value;},async month(value){const input=b.nodes.get('productionWeeklyClosingMonth');input.value=value;const result=input.onchange();await b.flush();return result;},week(value){const input=b.nodes.get('productionWeeklyClosingWeek');input.value=value;return input.onchange();},submit:id=>b.nodes.get('productionWeeklyClosingRecords').querySelector('[data-weekly-record="'+id+'"]').onsubmit({preventDefault(){}}),stop(){b.run('brazaProductionWeeklyClosing.stop();');b.timers.clear();}};
}
async function fixture(t,options){const f=await weeklyProductionFixture();t.after(()=>f.close());const ui=mount(f,options);t.after(()=>ui.stop());return {f,ui};}

test('weekly projector accepts canonical stored versions but rejects forged money, sources, quantities and accessors',async t=>{
 const f=await weeklyProductionFixture();t.after(()=>f.close());const value=await f.read('2026-10');assert.ok(projectProductionWeeklyClosingWorkspace(value));
 const copies=[v=>v.weeks[0].current.known_cost_cents=-1,v=>v.weeks[0].current.produced_quantity++,v=>v.weeks[0].current.total_cost_cents=0,v=>v.source.ledger_revision=-1,v=>v.policy.hour=12,v=>v.weeks[0].current.pending.push('UNSAFE_FAKE_FLAG'),v=>v.weeks[0].unreviewed_field=true,v=>v.weeks.find(w=>w.original).delta_cents=3456,v=>v.boundary_records[0].quantity=0];
 for(const mutate of copies){const changed=clone(value);mutate(changed);assert.equal(projectProductionWeeklyClosingWorkspace(changed),null);}
 let getters=0;const unsafe=clone(value);Object.defineProperty(unsafe,'checked_at',{enumerable:true,get(){getters++;return value.checked_at;}});assert.equal(projectProductionWeeklyClosingWorkspace(unsafe),null);assert.equal(getters,0);
 const projected=projectProductionWeeklyClosingWorkspace(value);projected.weeks[0].current.known_cost_cents=0;assert.notEqual(value.weeks[0].current.known_cost_cents,0,'public projection cannot mutate canonical saved money');
});

test('cold weekly history stays unknown and links to the separate sales reference without inventing manufacture',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());const now=()=>weeklyProductionClock,empty={read:month=>readProductionWeeklyClosingWorkspace(env,{month},{now}),mutate:()=>assert.fail('cold discovery must remain read-only')};
 const ui=mount(empty);t.after(()=>ui.stop());assert.equal(ui.calls.length,0);await ui.open();assert.equal(ui.calls.length,1);assert.ok(ui.snapshot());
 for(const id of ['Current','Last','Selected'])assert.doesNotMatch(ui.b.nodes.get('productionWeeklyClosing'+id).textContent,/R\$/);
 assert.equal(ui.b.nodes.get('productionWeeklyClosingEmpty').hidden,false);
 assert.match(productionWeeklyClosingBody(),/não comprovam quando as peças foram fabricadas/);assert.equal((productionWeeklyClosingBody().match(/>Referência das vendas</g)||[]).length,1);assert.match(productionWeeklyClosingBody(),/href="\/admin\?tab=agent-production#costPeriods"/);
 assert.equal(env.ADMIN_DB.db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE name='incurred_production_records'").get().count,0);
});

test('weekly selection is local, month reads preserve split drafts and immutable original closure values',async t=>{
 const {f,ui}=await fixture(t);const physical=await f.snapshot();await ui.open();assert.equal(ui.calls.length,1);assert.ok(ui.snapshot());ui.b.nodes.get('foreignManufacturingDraft').value='Rascunho físico preservado';
 ui.fill(f.pending,{before13_quantity:'1',at_or_after13_quantity:'2',reason:'Conferência sintética que ainda é um rascunho',confirmed:true});
 const prior=clone(ui.snapshot().weeks.find(w=>w.end_date===f.expected.end_date).original);assert.equal(ui.week(f.expected.end_date),true);assert.equal(ui.calls.length,1);assert.match(ui.b.nodes.get('productionWeeklyClosingSelected').textContent,/Original v1/);assert.match(ui.b.nodes.get('productionWeeklyClosingSelected').textContent,/Última versão v2: Em conferência/);assert.equal(ui.snapshot().weeks.find(w=>w.end_date===f.expected.end_date).needs_restatement,false,'the fixture has already saved the pending-cost restatement');
 assert.equal(ui.field(f.pending,'reason').value,'Conferência sintética que ainda é um rascunho');
 await ui.month('2026-09');assert.equal(ui.calls.length,2);assert.ok(ui.snapshot().weeks.every(w=>w.end_date.startsWith('2026-09')));assert.match(ui.b.nodes.get('productionWeeklyClosingSelected').textContent,/reconstituído|histórica/);
 await ui.month('2026-10');assert.equal(ui.calls.length,3);assert.equal(ui.field(f.pending,'before13_quantity').value,'1');assert.equal(ui.field(f.pending,'at_or_after13_quantity').value,'2');assert.equal(ui.field(f.pending,'confirmed').checked,true);assert.equal(ui.b.nodes.get('foreignManufacturingDraft').value,'Rascunho físico preservado');
 assert.deepEqual(ui.snapshot().weeks.find(w=>w.end_date===f.expected.end_date).original,prior);assert.equal(await f.snapshot(),physical);assert.ok(ui.calls.every(c=>c.body===null));
 const detached=ui.snapshot();detached.weeks[0].current.known_cost_cents=-100;assert.notEqual(ui.snapshot().weeks[0].current.known_cost_cents,-100);
});

test('the first visible card prioritizes the latest closed week while explicit history choices survive refresh and readiness',async t=>{
 const {f,ui}=await fixture(t);await ui.open();const body=productionWeeklyClosingBody();assert.ok(body.indexOf('id="productionWeeklyClosingSelected"')<body.indexOf('id="productionWeeklyClosingLast"'));assert.ok(body.indexOf('id="productionWeeklyClosingLast"')<body.indexOf('id="productionWeeklyClosingCurrent"'));
 assert.equal(ui.b.nodes.get('productionWeeklyClosingWeek').value,f.expected.end_date);assert.match(ui.b.nodes.get('productionWeeklyClosingSelected').textContent,/Original v1:.*90,00/);
 const open=ui.snapshot().weeks.find(w=>w.current.status==='OPEN').end_date;assert.equal(ui.week(open),true);await ui.refresh();assert.equal(ui.b.nodes.get('productionWeeklyClosingWeek').value,open);await ui.b.run('Promise.all(weeklyReadyHandlers.map(fn=>fn()))');await ui.b.flush();assert.equal(ui.b.nodes.get('productionWeeklyClosingWeek').value,open,'a ready event cannot override an explicitly selected open week');
 await ui.month('2026-09');assert.equal(ui.b.nodes.get('productionWeeklyClosingWeek').value,'2026-09-25');assert.equal(ui.week('2026-09-18'),true);await ui.refresh();assert.equal(ui.b.nodes.get('productionWeeklyClosingWeek').value,'2026-09-18');
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());const clock=Date.UTC(2026,10,3,15),empty={read:month=>readProductionWeeklyClosingWorkspace(env,{month},{now:()=>clock})};const first=mount(empty,{clock});t.after(()=>first.stop());await first.open();assert.equal(first.snapshot().weeks.length,1);assert.equal(first.snapshot().weeks[0].current.status,'OPEN');assert.equal(first.b.nodes.get('productionWeeklyClosingWeek').value,'2026-11-06','the open week is the fallback when this month has no completed Friday cut');
});

test('Friday split requires explicit conserved quantities and confirmation, then preserves the physical ledger',async t=>{
 const {f,ui}=await fixture(t);await ui.open();ui.week(f.expected.end_date);const physical=await f.snapshot();
 ui.fill(f.pending,{before13_quantity:'1',at_or_after13_quantity:'1',reason:'Conferência sintética',confirmed:true});assert.equal(await ui.submit(f.pending),false);assert.equal(ui.calls.filter(c=>c.body).length,0);assert.match(ui.b.nodes.get('productionWeeklyClosingStatus').textContent,/soma deve ser 3/);
 ui.fill(f.pending,{before13_quantity:'2',at_or_after13_quantity:'1',confirmed:false});assert.equal(await ui.submit(f.pending),false);assert.equal(ui.calls.filter(c=>c.body).length,0);
 ui.fill(f.pending,{confirmed:true});assert.equal(await ui.submit(f.pending),true);assert.equal(ui.calls.filter(c=>c.body).length,1);const sent=ui.calls.find(c=>c.body);assert.equal(sent.path,'production/weekly-closing');assert.equal(sent.frozen,true);assert.equal(sent.body.before13_quantity,2);assert.equal(sent.body.at_or_after13_quantity,1);assert.equal(await f.snapshot(),physical);assert.equal(ui.snapshot().boundary_records.find(r=>r.record_id===f.pending).assignment_status,'CONFIRMED');assert.match(ui.b.nodes.get('productionWeeklyClosingSelected').textContent,/Referência atual dos registros:.*ainda não salva como fechamento/);
 const saved=await f.settle();await ui.refresh();const week=ui.snapshot().weeks.find(w=>w.end_date===f.expected.end_date);assert.equal(week.latest.total_cost_cents,f.expected.resolved_cents);assert.equal(week.delta_cents,f.expected.delta_cents);assert.deepEqual(week.original,saved.weeks.find(w=>w.end_date===f.expected.end_date).original);assert.equal(ui.week(f.expected.end_date),true);assert.match(ui.b.nodes.get('productionWeeklyClosingSelected').textContent,/−/);
});

test('an ambiguously committed split retries the identical command, locks date controls and cannot increment twice',async t=>{
 const {f,ui}=await fixture(t);await ui.open();const initialRevision=ui.snapshot().revision,physical=await f.snapshot();let lost=true;
 ui.setTransport(async(path,body)=>{if(body){const response=await f.mutate(body);if(lost){lost=false;throw Object.assign(Error('SYNTHETIC_POST_RESPONSE_LOST'),{status:503});}return response;}return f.read(new URL('https://local.test/'+path).searchParams.get('month'));});
 ui.fill(f.pending,{before13_quantity:'2',at_or_after13_quantity:'1',reason:'Conferência física sintética explícita',confirmed:true});assert.equal(await ui.submit(f.pending),false);const first=clone(ui.calls.find(c=>c.body).body),calls=ui.calls.length;
 assert.equal(ui.b.nodes.get('productionWeeklyClosingMonth').disabled,true);assert.equal(ui.b.nodes.get('productionWeeklyClosingWeek').disabled,true);assert.equal(ui.b.nodes.get('productionWeeklyClosingRetry').hidden,false);const selectedBefore=ui.b.nodes.get('productionWeeklyClosingWeek').value,redirect=ui.snapshot().weeks.find(w=>w.end_date!==selectedBefore).end_date;assert.equal(ui.week(redirect),false);assert.equal(ui.b.nodes.get('productionWeeklyClosingWeek').value,selectedBefore);assert.equal(ui.calls.length,calls);assert.equal(ui.field(f.pending,'reason').value,'Conferência física sintética explícita');
 assert.equal(await ui.b.nodes.get('productionWeeklyClosingRetry').onclick(),true);assert.deepEqual(ui.calls.filter(c=>c.body).at(-1).body,first);assert.equal(ui.snapshot().revision,initialRevision+1);assert.equal(ui.b.nodes.get('productionWeeklyClosingRetry').hidden,true);assert.equal(await f.snapshot(),physical);
});

test('weekly reads remain lazy outside fabrication and duplicate readiness notifications share one saved-data request',async t=>{
 const {f,ui}=await fixture(t,{panel:'overview'});await ui.open();assert.equal(ui.calls.length,0);ui.b.run('weeklyReadyHandlers.forEach(fn=>fn());');await ui.b.flush();assert.equal(ui.calls.length,0);
 ui.b.run('document.documentElement.dataset.activePanel="agent-production";');await ui.open();assert.equal(ui.calls.length,1);await ui.open();assert.equal(ui.calls.length,1);
 ui.b.nodes.get('missionProductionFabricationPane').hidden=true;ui.b.run('weeklyReadyHandlers.forEach(fn=>fn());');await ui.b.flush();assert.equal(ui.calls.length,1);ui.b.nodes.get('missionProductionFabricationPane').hidden=false;
 const ready=Promise.withResolvers();let release;ui.setTransport(async(path)=>{const value=await f.read(new URL('https://local.test/'+path).searchParams.get('month'));ready.resolve();return new Promise(resolve=>{release=()=>resolve(value);});});const read=ui.open();await ready.promise;ui.b.run('weeklyReadyHandlers.forEach(fn=>fn());weeklyReadyHandlers.forEach(fn=>fn());');assert.equal(ui.calls.length,2);release();await read;await ui.b.flush();assert.ok(ui.snapshot());
});

test('a stale sidecar writer reloads the saved source after 409 and preserves the unaccepted split draft',async t=>{
 const {f,ui}=await fixture(t);await ui.open();ui.fill(f.pending,{before13_quantity:'2',at_or_after13_quantity:'1',reason:'Meu rascunho sintético preservado',confirmed:true});const before=await f.read('2026-10'),row=before.boundary_records.find(r=>r.record_id===f.pending);
 await f.mutate({action:'assign_boundary',month:'2026-10',request_id:crypto.randomUUID(),revision:before.revision,ledger_revision:before.source.ledger_revision,record_id:f.pending,record_hash:row.record_hash,before13_quantity:1,at_or_after13_quantity:2,confirmed:true,reason:'Outra sessão sintética conferiu um corte diferente'});
 assert.equal(await ui.submit(f.pending),false);assert.match(ui.b.nodes.get('productionWeeklyClosingStatus').textContent,/registros mudaram em outra sessão/);assert.equal(ui.b.nodes.get('productionWeeklyClosingRetry').hidden,true);assert.equal(ui.b.nodes.get('productionWeeklyClosingMonth').disabled,false);assert.equal(ui.snapshot().revision,before.revision+1);assert.equal(ui.field(f.pending,'before13_quantity').value,'2');assert.equal(ui.field(f.pending,'at_or_after13_quantity').value,'1');assert.equal(ui.field(f.pending,'reason').value,'Meu rascunho sintético preservado');
});

test('logout clears weekly facts and drafts and ignores deferred committed POST and GET responses',async t=>{
 const {f,ui}=await fixture(t);await ui.open();const ready=Promise.withResolvers();let release;ui.setTransport(async(path,body)=>{const response=body?await f.mutate(body):await f.read(new URL('https://local.test/'+path).searchParams.get('month'));ready.resolve();return new Promise(resolve=>{release=()=>resolve(response);});});
 ui.fill(f.pending,{before13_quantity:'2',at_or_after13_quantity:'1',reason:'Rascunho sintético antes de sair',confirmed:true});const action=ui.submit(f.pending);await ready.promise;ui.stop();release();assert.equal(await action,false);await ui.b.flush();assert.equal(ui.snapshot(),null);assert.equal(ui.b.nodes.get('productionWeeklyClosingRecords').textContent,'');assert.equal(ui.b.nodes.get('productionWeeklyClosingRetry').hidden,true);assert.match(ui.b.nodes.get('productionWeeklyClosingStatus').textContent,/Sessão encerrada/);
 const second=mount(f);t.after(()=>second.stop());const getReady=Promise.withResolvers();let releaseGet;second.setTransport(async(path)=>{const response=await f.read(new URL('https://local.test/'+path).searchParams.get('month'));getReady.resolve();return new Promise(resolve=>{releaseGet=()=>resolve(response);});});const request=second.open();await getReady.promise;second.stop();releaseGet();await request;await second.b.flush();assert.equal(second.snapshot(),null);assert.equal(second.b.nodes.get('productionWeeklyClosingRecords').textContent,'');
});

test('a visible Friday panel rereads the saved closure after13h without creating any manufacturing or POST',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());let at=Date.UTC(2026,9,30,15,50);const now=()=>at;await runProductionWeeklyClosing(env,{now});at=Date.UTC(2026,9,30,15,59,50);
 const f={read:month=>readProductionWeeklyClosingWorkspace(env,{month},{now})},ui=mount(f,{clock:at});t.after(()=>ui.stop());
 await ui.open();const before=ui.snapshot(),closing=before.weeks.find(w=>w.end_date==='2026-10-30');assert.equal(closing.current.status,'OPEN');assert.equal(closing.original,null);assert.equal(ui.calls.length,1);assert.equal(ui.b.timers.size,1);
 const delay=[...ui.b.timers.values()][0].delay;assert.equal(delay,75000,'a one-shot read is scheduled65seconds after the cutoff, not a tight poll');
 at=Date.UTC(2026,9,30,16,0,20);await runProductionWeeklyClosing(env,{now});at=Date.UTC(2026,9,30,16,1,5);ui.setClock(at);await ui.fireTimer();
 assert.equal(ui.calls.length,2);const closed=ui.snapshot().weeks.find(w=>w.end_date==='2026-10-30');assert.equal(closed.original.capture_kind,'SCHEDULED');assert.equal(closed.current.status,'NO_RECORDS');assert.equal(closed.original.total_cost_cents,null);assert.match(ui.b.nodes.get('productionWeeklyClosingStatus').textContent,/Leitura conferida em.*Prévia não é fechamento salvo/);assert.ok(ui.calls.every(row=>row.body===null));assert.equal(env.ADMIN_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='incurred_production_records'").get().n,0);
});

test('a delayed weekly artifact is rechecked only on the bounded ten-minute followup',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());let at=Date.UTC(2026,9,30,15,59,50);const now=()=>at,ui=mount({read:month=>readProductionWeeklyClosingWorkspace(env,{month},{now})},{clock:at});t.after(()=>ui.stop());await ui.open();
 at=Date.UTC(2026,9,30,16,1,5);ui.setClock(at);await ui.fireTimer();assert.equal(ui.snapshot().weeks.find(w=>w.end_date==='2026-10-30').original,null);assert.equal(ui.b.timers.size,1);assert.equal([...ui.b.timers.values()][0].delay,600000);
 at=Date.UTC(2026,9,30,16,10,20);await runProductionWeeklyClosing(env,{now});at=Date.UTC(2026,9,30,16,11,5);ui.setClock(at);await ui.fireTimer();assert.ok(ui.snapshot().weeks.find(w=>w.end_date==='2026-10-30').original);assert.equal(ui.calls.length,3);assert.ok(ui.calls.every(row=>row.body===null));
});

test('reentry and focus revalidate stale saved data once, preserving history choice and split drafts',async t=>{
 const {f,ui}=await fixture(t);await ui.open();ui.week('2026-10-16');ui.fill(f.pending,{before13_quantity:'2',at_or_after13_quantity:'1',reason:'Rascunho antes de retornar',confirmed:true});
 await ui.event('focus');assert.equal(ui.calls.length,1,'fresh focus does not poll');ui.setClock(weeklyProductionClock+601000);ui.b.run('document.documentElement.dataset.activePanel="overview";');await ui.event('focus');assert.equal(ui.calls.length,1);
 ui.b.run('document.documentElement.dataset.activePanel="agent-production";');await ui.open();assert.equal(ui.calls.length,2);assert.equal(ui.b.nodes.get('productionWeeklyClosingWeek').value,'2026-10-16');assert.equal(ui.field(f.pending,'reason').value,'Rascunho antes de retornar');assert.equal(ui.field(f.pending,'confirmed').checked,true);await ui.event('focus');assert.equal(ui.calls.length,2,'duplicate focus is throttled even if the saved source has an older checked_at');
 ui.setClock(weeklyProductionClock+1202000);await ui.event('focus');assert.equal(ui.calls.length,3);assert.ok(ui.calls.every(row=>row.body===null));
});

test('automatic reads respect document visibility, in-flight reads, hidden fabrication and stopped sessions',async t=>{
 const {f,ui}=await fixture(t);await ui.open();const oldTimer=[...ui.b.timers.values()][0].callback;ui.setClock(weeklyProductionClock+601000);ui.b.run('document.hidden=true;');await ui.event('visibilitychange');assert.equal(ui.calls.length,1);assert.equal(ui.b.timers.size,0);
 const ready=Promise.withResolvers();let release;ui.setTransport(async path=>{const response=await f.read(new URL('https://synthetic.test/'+path).searchParams.get('month'));ready.resolve();return new Promise(resolve=>{release=()=>resolve(response);});});
 ui.b.run('document.hidden=false;');const request=ui.event('visibilitychange');await ready.promise;await ui.event('focus');assert.equal(ui.calls.length,2,'focus cannot duplicate a pending GET');release();await request;
 ui.setClock(weeklyProductionClock+1202000);ui.b.nodes.get('missionProductionWeeklyPane').hidden=true;await ui.event('focus');assert.equal(ui.calls.length,2);assert.equal(ui.b.timers.size,0);ui.b.nodes.get('missionProductionWeeklyPane').hidden=false;ui.b.nodes.get('missionProductionFabricationPane').hidden=true;await ui.event('focus');assert.equal(ui.calls.length,2);ui.stop();await oldTimer();await ui.event('focus');assert.equal(ui.calls.length,2);assert.equal(ui.b.timers.size,0);assert.equal(ui.snapshot(),null);
});

test('suspending weekly mode cancels its timer but retains snapshots and drafts for safe reentry',async t=>{
 const {f,ui}=await fixture(t);await ui.open();ui.fill(f.pending,{before13_quantity:'1',at_or_after13_quantity:'2',reason:'Rascunho ao trocar o modo',confirmed:true});const saved=ui.snapshot();assert.equal(ui.b.timers.size,1);
 ui.b.run('brazaProductionWeeklyClosing.suspend();');assert.equal(ui.b.timers.size,0);assert.deepEqual(ui.snapshot(),saved);assert.equal(ui.field(f.pending,'reason').value,'Rascunho ao trocar o modo');await ui.open();assert.equal(ui.calls.length,1);assert.equal(ui.b.timers.size,1);
});

test('weekly chart exposes saved versus preview money, known subtotals and keyboard-native date selection',async t=>{
 const {f,ui}=await fixture(t);await ui.open();const graph=ui.b.nodes.get('productionWeeklyClosingGraph'),buttons=graph.querySelectorAll('button');assert.equal(buttons.length,ui.snapshot().weeks.length);assert.ok(buttons.every(button=>button.type==='button'&&button.getAttribute('aria-label').includes('Corte ')));
 const pending=buttons.find(button=>button.dataset.weeklyChartEnd===f.expected.end_date);assert.equal(pending.dataset.partial,'true');assert.match(pending.getAttribute('aria-label'),/subtotal.*relatório salvo/);assert.equal(pending.querySelectorAll('.production-weekly-bar').length,1);const prior=buttons.find(button=>button.dataset.weeklyChartEnd==='2026-10-16');assert.equal(prior.onclick(),true);assert.equal(ui.b.nodes.get('productionWeeklyClosingWeek').value,'2026-10-16');assert.equal(ui.calls.length,1,'chart selection uses already saved data');assert.equal(graph.querySelector('[data-weekly-chart-end="2026-10-16"]').getAttribute('aria-pressed'),'true');
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());const empty=mount({read:month=>readProductionWeeklyClosingWorkspace(env,{month},{now:()=>weeklyProductionClock})});t.after(()=>empty.stop());await empty.open();assert.equal(empty.b.nodes.get('productionWeeklyClosingGraph').querySelectorAll('.production-weekly-bar').length,0);assert.doesNotMatch(empty.b.nodes.get('productionWeeklyClosingGraph').textContent,/R\$/,'unrecorded days cannot become zero-valued bars');
});

test('automatic refresh cannot overtake an ambiguous split command or discard its retry draft',async t=>{
 const {f,ui}=await fixture(t);await ui.open();let lost=true;ui.setTransport(async(path,body)=>{if(body){const response=await f.mutate(body);if(lost){lost=false;throw Object.assign(Error('SYNTHETIC_RESPONSE_LOST'),{status:503});}return response;}return f.read(new URL('https://synthetic.test/'+path).searchParams.get('month'));});
 ui.fill(f.pending,{before13_quantity:'2',at_or_after13_quantity:'1',reason:'Confirmação pendente de resposta',confirmed:true});assert.equal(await ui.submit(f.pending),false);const first=clone(ui.calls.find(row=>row.body).body),calls=ui.calls.length;ui.setClock(weeklyProductionClock+601000);await ui.event('focus');await ui.event('visibilitychange');assert.equal(ui.calls.length,calls);assert.equal(ui.b.timers.size,0);assert.equal(ui.field(f.pending,'reason').value,'Confirmação pendente de resposta');assert.equal(ui.b.nodes.get('productionWeeklyClosingRetry').hidden,false);
 assert.equal(await ui.b.nodes.get('productionWeeklyClosingRetry').onclick(),true);assert.deepEqual(ui.calls.filter(row=>row.body).at(-1).body,first);assert.equal(ui.b.timers.size,1,'a confirmed retry can resume bounded revalidation');
});

test('explicit weekly context selects only a validated loaded Friday and preserves split drafts across months',async t=>{
 const {f,ui}=await fixture(t);await ui.open();
 ui.fill(f.pending,{before13_quantity:'1',at_or_after13_quantity:'2',reason:'Rascunho físico preservado ao conferir outro mês',confirmed:true});
 assert.equal(await ui.b.run('brazaProductionWeeklyClosing.openContext({month:"2026-09",week_end:"2026-09-25"})'),true);await ui.b.flush();
 assert.equal(ui.b.nodes.get('productionWeeklyClosingMonth').value,'2026-09');assert.equal(ui.b.nodes.get('productionWeeklyClosingWeek').value,'2026-09-25');
 assert.equal(await ui.b.run('brazaProductionWeeklyClosing.openContext({month:"2026-10",week_end:"2026-10-02"})'),true);await ui.b.flush();
 assert.equal(ui.b.nodes.get('productionWeeklyClosingWeek').value,'2026-10-02');assert.equal(ui.field(f.pending,'reason').value,'Rascunho físico preservado ao conferir outro mês');
 const calls=ui.calls.length;assert.equal(ui.b.run('brazaProductionWeeklyClosing.openContext({month:"2026-10",week_end:"2026-09-25"})'),false);assert.equal(ui.b.run('brazaProductionWeeklyClosing.openContext({month:"2026-10",week_end:"2026-10-01"})'),false);assert.equal(ui.calls.length,calls);assert.equal(ui.b.nodes.get('productionWeeklyClosingWeek').value,'2026-10-02');assert.ok(ui.calls.every(call=>call.body===null));
});

test('a deferred older weekly context cannot select its Friday after a newer context or logout',async t=>{
 const {f,ui}=await fixture(t);await ui.open();const pending=new Map();
 ui.setTransport(path=>new Promise(resolve=>pending.set(new URL('https://local.test/'+path).searchParams.get('month'),resolve)));
 const older=ui.b.run('brazaProductionWeeklyClosing.openContext({month:"2026-09",week_end:"2026-09-25"})');
 const newer=ui.b.run('brazaProductionWeeklyClosing.openContext({month:"2026-10",week_end:"2026-10-02"})');
 pending.get('2026-10')(await f.read('2026-10'));assert.equal(await newer,true);pending.get('2026-09')(await f.read('2026-09'));assert.equal(await older,false);await ui.b.flush();
 assert.equal(ui.b.nodes.get('productionWeeklyClosingWeek').value,'2026-10-02');
 const late=ui.b.run('brazaProductionWeeklyClosing.openContext({month:"2026-09",week_end:"2026-09-18"})');ui.stop();pending.get('2026-09')(await f.read('2026-09'));assert.equal(await late,false);assert.equal(ui.snapshot(),null);
});
