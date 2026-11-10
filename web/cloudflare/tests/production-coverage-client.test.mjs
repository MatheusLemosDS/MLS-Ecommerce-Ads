import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {productionCoverageBody,PRODUCTION_COVERAGE_CLIENT,PRODUCTION_COVERAGE_CSS} from '../src/production-coverage-view.mjs';
import {readProductionCoverageWorkspace,mutateProductionCoverageWorkspace} from '../src/production-coverage.mjs';
import {mutateIncurredProduction} from '../src/incurred-production.mjs';
import {D1} from './sqlite-d1.mjs';
import {ownerReportBrowser} from './owner-report-browser-fixture.mjs';

const clone=v=>JSON.parse(JSON.stringify(v)),clock=Date.parse('2026-10-25T15:00:00Z');
function fixture(t){
 const env={ADMIN_DB:new D1()},state={time:clock},now=()=>state.time;t.after(()=>env.ADMIN_DB.db.close());
 const read=week_end=>readProductionCoverageWorkspace(env,{week_end},{now});
 const mutate=body=>mutateProductionCoverageWorkspace(env,body,'synthetic-coverage-owner',{now});
 async function manufacture({date='2026-10-19',quantity=2,cost=1590}={}){const {readIncurredProduction}=await import('../src/incurred-production.mjs'),ledger=await readIncurredProduction(env,{now});return mutateIncurredProduction(env,{revision:ledger.revision,request_id:webcrypto.randomUUID(),action:'record',record_id:webcrypto.randomUUID(),production_ref:'Synthetic coverage lot '+webcrypto.randomUUID(),replaces_record_id:null,produced_date:date,quantity,identity:{artwork:null,color:null,size:null,garment_type:'UNKNOWN',fit:'UNKNOWN',confirmed:false,item_id:null,model_id:null,sku:null},source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:cost,reference:null},evidence:'Synthetic owner-confirmed historical manufacturing cost',confirmed:true},'synthetic-coverage-owner',{now});}
 return {env,state,read,mutate,manufacture};
}
function mount(f,{panel='overview'}={}){
 const prelude='globalThis.coverageEvents={};document.addEventListener=(name,fn)=>{(coverageEvents[name]??=[]).push(fn);};';
 const b=ownerReportBrowser('<section id="missionProductionFabricationPane"></section><input id="foreignCoverageDraft">'+productionCoverageBody()+'<script>'+prelude+PRODUCTION_COVERAGE_CLIENT+'</script>',{scriptIncludes:'globalThis.brazaProductionCoverage='}),calls=[];
 b.context.crypto=webcrypto;b.context.coverageClock=f.state.time;b.context.coveragePanel=panel;
 let transport=(path,body)=>body?f.mutate(body):f.read(new URL('https://synthetic.test/'+path).searchParams.get('week_end'));
 b.context.coverageTransport=async(path,body)=>{const copied=body===undefined?null:clone(body);calls.push({path,body:copied,frozen:body===undefined?null:Object.isFrozen(body)});try{return JSON.stringify(await transport(path,copied));}catch(e){throw Object.assign(Error('SYNTHETIC_COVERAGE_TRANSPORT'),{status:e.status??503,apiCode:e.message});}};
 b.run('class CoverageDate extends Date{constructor(...args){super(...(args.length?args:[coverageClock]));}static now(){return coverageClock;}}globalThis.Date=CoverageDate;document.documentElement.dataset.activePanel=coveragePanel;const coverageApi=async(path,body)=>JSON.parse(await coverageTransport(path,body));brazaProductionCoverage.bootstrapState({phase:"READY"});brazaProductionCoverage.start({api:coverageApi});');
 const field=name=>b.nodes.get('productionCoverageIntervals').querySelector('[name="'+name+'"]');
 const fill=values=>{for(const [name,value]of Object.entries(values)){const n=field(name);assert.ok(n,'actual '+name+' field');if(n.type==='checkbox')n.checked=value;else n.value=value;(n.tagName==='SELECT'?n.onchange:n.oninput)?.();}};
 return {b,calls,field,fill,setTransport:value=>transport=value,snapshot:()=>clone(b.run('brazaProductionCoverage.getSnapshot()')),async open(){b.run('document.documentElement.dataset.activePanel="agent-production";');const p=b.run('brazaProductionCoverage.open()');await p;await b.flush();return p;},async refresh(){const p=b.run('brazaProductionCoverage.refresh()');await p;await b.flush();return p;},async week(value){const n=b.nodes.get('productionCoverageWeek');n.value=value;const p=n.onchange();await p;await b.flush();return p;},interval(key){const n=b.nodes.get('productionCoverageInterval');n.value=key;return n.onchange();},submit:()=>b.nodes.get('productionCoverageIntervals').children[0].onsubmit({preventDefault(){}}),stop(){b.run('brazaProductionCoverage.stop()');b.timers.clear();}};
}
async function uiFixture(t,options){const f=fixture(t),ui=mount(f,options);t.after(()=>ui.stop());return {f,ui};}
function declaration(ui,mode='NO_MANUFACTURING',reason='Synthetic ended interval physically reviewed'){ui.fill({declaration:mode,reason,confirmed:true});}

test('coverage panel is collapsed, lazy and separate from production and finance facts',async t=>{
 const {f,ui}=await uiFixture(t);assert.equal(ui.calls.length,0);assert.equal(ui.b.nodes.get('productionCoverageDetails').open,false);assert.equal(ui.snapshot(),null);await ui.refresh();assert.equal(ui.calls.length,0);
 ui.b.run('for(const handlers of Object.values(coverageEvents))for(const fn of handlers)fn();');await ui.b.flush();assert.equal(ui.calls.length,0);
 await ui.open();assert.equal(ui.calls.length,1);assert.equal(ui.snapshot().summary.total_cost_cents,null);assert.doesNotMatch(ui.b.nodes.get('productionCoverageSummary').textContent,/R\$/);assert.equal(ui.b.nodes.get('productionCoverageIntervals').children.length,1,'only one interval form is visible');
 assert.equal(f.env.ADMIN_DB.db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE name='incurred_production_records'").get().count,0);assert.match(productionCoverageBody(),/class="production-weekly production-coverage"/);assert.match(productionCoverageBody(),/não comprovam fabricação/);
});

test('only an explicit compatible declaration and checkbox can confirm an ended interval',async t=>{
 const {ui}=await uiFixture(t);await ui.open();assert.equal(await ui.submit(),false);declaration(ui,'ALL_RECORDED');assert.equal(await ui.submit(),false);assert.equal(ui.calls.filter(c=>c.body).length,0);
 declaration(ui);ui.fill({confirmed:false});assert.equal(await ui.submit(),false);ui.fill({confirmed:true});assert.equal(await ui.submit(),true);await ui.b.flush();const sent=ui.calls.find(c=>c.body);assert.equal(sent.path,'production/coverage');assert.equal(sent.frozen,true);assert.equal(sent.body.action,'confirm');assert.equal(sent.body.mode,'NO_MANUFACTURING');assert.equal(ui.snapshot().summary.confirmed_intervals,1);assert.equal(ui.snapshot().summary.total_cost_cents,null);assert.doesNotMatch(ui.b.nodes.get('productionCoverageSummary').textContent,/R\$/);
});

test('all eight explicit empty declarations are required before an owner-declared zero appears',async t=>{
 const {ui}=await uiFixture(t);await ui.open();const keys=ui.snapshot().intervals.map(row=>row.key);
 for(const [index,key]of keys.entries()){ui.interval(key);declaration(ui);assert.equal(await ui.submit(),true);await ui.b.flush();assert.equal(ui.snapshot().summary.confirmed_intervals,index+1);if(index<7)assert.equal(ui.snapshot().summary.total_cost_cents,null);}
 assert.equal(ui.calls.filter(c=>c.body).length,8);assert.equal(ui.snapshot().summary.state,'CONFIRMED');assert.equal(ui.snapshot().summary.total_cost_cents,0);assert.match(ui.b.nodes.get('productionCoverageSummary').textContent,/0,00/);
});

test('unknown historical costs remain pending after completeness declarations and future intervals stay disabled',async t=>{
 const {f,ui}=await uiFixture(t);await f.manufacture({cost:null});await ui.open();
 for(const row of ui.snapshot().intervals){ui.interval(row.key);declaration(ui,row.recorded.quantity?'ALL_RECORDED':'NO_MANUFACTURING');assert.equal(await ui.submit(),true);await ui.b.flush();}
 assert.equal(ui.snapshot().summary.state,'PENDING');assert.equal(ui.snapshot().summary.confirmed_intervals,8);assert.equal(ui.snapshot().summary.total_cost_cents,null);assert.match(ui.b.nodes.get('productionCoverageSummary').textContent,/Custos históricos pendentes/);
 await ui.week('2026-10-30');const open=ui.snapshot().intervals.find(row=>row.state==='OPEN');assert.ok(open);ui.interval(open.key);assert.equal(ui.field('confirmed'),null);assert.match(ui.b.nodes.get('productionCoverageIntervals').textContent,/quando este intervalo terminar/);assert.equal(ui.snapshot().summary.state,'OPEN');
});

test('interval and week changes preserve independent reason drafts and unrelated operator input',async t=>{
 const {ui}=await uiFixture(t);await ui.open();const rows=ui.snapshot().intervals;ui.b.nodes.get('foreignCoverageDraft').value='Preserved manufacturing draft';declaration(ui,'NO_MANUFACTURING','My first unsent interval');ui.interval(rows[1].key);declaration(ui,'NO_MANUFACTURING','My second unsent interval');ui.interval(rows[0].key);assert.equal(ui.field('reason').value,'My first unsent interval');assert.equal(ui.field('confirmed').checked,true);
 await ui.week('2026-10-16');await ui.week('2026-10-23');ui.interval(rows[1].key);assert.equal(ui.field('reason').value,'My second unsent interval');assert.equal(ui.field('confirmed').checked,true);assert.equal(ui.b.nodes.get('foreignCoverageDraft').value,'Preserved manufacturing draft');assert.ok(ui.calls.every(c=>c.body===null));
});

test('source changes reset only the affected confirmation while preserving its draft and manual manufacture facts',async t=>{
 const {f,ui}=await uiFixture(t);await ui.open();const day=ui.snapshot().intervals.find(row=>row.date==='2026-10-19');ui.interval(day.key);declaration(ui,'NO_MANUFACTURING','Preserved reason after new lot');await f.manufacture();await ui.refresh();assert.equal(ui.field('reason').value,'Preserved reason after new lot');assert.equal(ui.field('confirmed').checked,false);assert.equal(ui.field('declaration').value,'NO_MANUFACTURING');ui.fill({confirmed:true});assert.equal(await ui.submit(),false,'a previous zero declaration cannot cover new physical pieces');assert.equal(ui.calls.filter(c=>c.body).length,0);assert.equal(ui.snapshot().intervals.find(row=>row.key===day.key).recorded.quantity,2);
 ui.fill({declaration:'ALL_RECORDED',confirmed:true});assert.equal(await ui.submit(),true);await ui.b.flush();assert.equal(ui.snapshot().summary.known_cost_cents,3180);assert.equal(ui.snapshot().summary.total_cost_cents,null);
});

test('ambiguous committed responses retry the identical immutable command and lock selectors',async t=>{
 const {f,ui}=await uiFixture(t);await ui.open();let lost=true;ui.setTransport(async(path,body)=>{const result=body?await f.mutate(body):await f.read(new URL('https://test/'+path).searchParams.get('week_end'));if(body&&lost){lost=false;throw Object.assign(Error('SYNTHETIC_LOST_RESPONSE'),{status:503});}return result;});declaration(ui);assert.equal(await ui.submit(),false);const sent=clone(ui.calls.find(c=>c.body).body),revision=ui.snapshot().revision;assert.equal(ui.b.nodes.get('productionCoverageRetry').hidden,false);assert.equal(ui.b.nodes.get('productionCoverageWeek').disabled,true);assert.equal(ui.b.nodes.get('productionCoverageInterval').disabled,true);assert.equal(await ui.week('2026-10-16'),false);
 assert.equal(await ui.b.nodes.get('productionCoverageRetry').onclick(),true);await ui.b.flush();assert.deepEqual(ui.calls.filter(c=>c.body).map(c=>c.body),[sent,sent]);assert.equal(ui.snapshot().revision,revision+1);assert.equal(ui.snapshot().summary.confirmed_intervals,1);
});

test('a valid unrelated response cannot acknowledge the selected command or clear its pending draft',async t=>{
 const {f,ui}=await uiFixture(t);await ui.open();const source=ui.snapshot(),other=source.intervals[1];ui.setTransport(async(path,body)=>{if(!body)return f.read(new URL('https://test/'+path).searchParams.get('week_end'));return f.mutate({...body,interval_key:other.key,source_hash:other.source_hash,request_id:webcrypto.randomUUID()});});declaration(ui,'NO_MANUFACTURING','My pending declaration');assert.equal(await ui.submit(),false);assert.equal(ui.b.nodes.get('productionCoverageRetry').hidden,false);assert.equal(ui.field('reason').value,'My pending declaration');assert.equal(ui.snapshot().revision,0);assert.equal(ui.snapshot().summary.confirmed_intervals,0);
});

test('409 refreshes the frame and retains the declaration reason without an automatic second command',async t=>{
 const {f,ui}=await uiFixture(t);await ui.open();const chosen=ui.snapshot().intervals[0];declaration(ui,'NO_MANUFACTURING','My unaccepted declaration');const state=await f.read('2026-10-23'),other=state.intervals[1];await f.mutate({action:'confirm',week_end:state.week_end,interval_key:other.key,source_hash:other.source_hash,revision:state.revision,ledger_revision:state.source.ledger_revision,timing_revision:state.source.timing_revision,request_id:webcrypto.randomUUID(),mode:'NO_MANUFACTURING',reason:'Another synthetic session reviewed this interval',confirmed:true});assert.equal(await ui.submit(),false);await ui.b.flush();assert.equal(ui.calls.filter(c=>c.body).length,1);assert.equal(ui.snapshot().revision,1);assert.equal(ui.field('reason').value,'My unaccepted declaration');assert.equal(ui.b.nodes.get('productionCoverageRetry').hidden,true);assert.match(ui.b.nodes.get('productionCoverageStatus').textContent,/registros ou declarações mudaram/);assert.equal(ui.b.nodes.get('productionCoverageInterval').value,chosen.key);
});

test('revocation requires its own explicit choice, reason and confirmation and preserves production records',async t=>{
 const {f,ui}=await uiFixture(t);await f.manufacture();await ui.open();const chosen=ui.snapshot().intervals.find(row=>row.recorded.quantity);ui.interval(chosen.key);declaration(ui,'ALL_RECORDED');assert.equal(await ui.submit(),true);await ui.b.flush();const count=f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) count FROM incurred_production_records').get().count;ui.fill({declaration:'REVOKE',reason:'Correcting an erroneous completeness declaration'});assert.equal(await ui.submit(),false);ui.fill({confirmed:true});assert.equal(await ui.submit(),true);await ui.b.flush();assert.equal(ui.calls.filter(c=>c.body).at(-1).body.action,'revoke');assert.equal(ui.calls.filter(c=>c.body).at(-1).body.mode,null);assert.equal(ui.snapshot().intervals.find(row=>row.key===chosen.key).state,'REVOKED');assert.equal(f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) count FROM incurred_production_records').get().count,count);
});

test('closing coverage prevents readiness reads and logout ignores deferred GET and committed POST responses',async t=>{
 const {f,ui}=await uiFixture(t);await ui.open();ui.b.nodes.get('productionCoverageDetails').open=false;const before=ui.calls.length;ui.b.run('for(const handlers of Object.values(coverageEvents))for(const fn of handlers)fn();');await ui.b.flush();assert.equal(ui.calls.length,before);ui.b.nodes.get('productionCoverageDetails').open=true;
 let release;const ready=Promise.withResolvers();ui.setTransport(async(path,body)=>{const result=body?await f.mutate(body):await f.read(new URL('https://test/'+path).searchParams.get('week_end'));ready.resolve();return new Promise(resolve=>{release=()=>resolve(result);});});declaration(ui);const pending=ui.submit();await ready.promise;ui.stop();release();assert.equal(await pending,false);await ui.b.flush();assert.equal(ui.snapshot(),null);assert.equal(ui.b.nodes.get('productionCoverageIntervals').textContent,'');assert.equal(ui.b.nodes.get('productionCoverageRetry').hidden,true);
 const second=mount(f);t.after(()=>second.stop());const getReady=Promise.withResolvers();let releaseGet;second.setTransport(async(path)=>{const result=await f.read(new URL('https://test/'+path).searchParams.get('week_end'));getReady.resolve();return new Promise(resolve=>{releaseGet=()=>resolve(result);});});const read=second.open();await getReady.promise;second.stop();releaseGet();await read;assert.equal(second.snapshot(),null);
});

test('explicit day navigation selects its full civil day without confirming manufacturing or coverage',async t=>{
 const {f,ui}=await uiFixture(t);await ui.open();const initialRevision=ui.snapshot().revision;
 assert.equal(await ui.b.run('brazaProductionCoverage.openForDate("2026-10-19")'),true);await ui.b.flush();
 assert.equal(ui.snapshot().week_end,'2026-10-23');assert.equal(ui.b.nodes.get('productionCoverageInterval').value,'2026-10-19:DAY');
 assert.match(ui.b.nodes.get('productionCoverageDayMessage').textContent,/Dia completo/);assert.equal(ui.b.nodes.get('productionCoverageBefore').hidden,true);assert.equal(ui.b.nodes.get('productionCoverageAfter').hidden,true);
 assert.equal(ui.snapshot().revision,initialRevision);assert.ok(ui.calls.every(row=>row.body===null));assert.equal(f.env.ADMIN_DB.db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE name='incurred_production_records'").get().count,0);
});

test('Friday day navigation requires explicit halves and preserves each half draft across adjacent weeks',async t=>{
 const {ui}=await uiFixture(t);await ui.open();const initialCalls=ui.calls.length;
 assert.equal(ui.b.run('brazaProductionCoverage.openForDate("2026-10-16")'),true);await ui.b.flush();
 assert.equal(ui.calls.length,initialCalls,'choosing Friday is not a provider/read/mutation command');assert.equal(ui.b.nodes.get('productionCoverageIntervals').children.length,0);assert.equal(ui.b.nodes.get('productionCoverageInterval').disabled,true);assert.match(ui.b.nodes.get('productionCoverageDayMessage').textContent,/uma metade não confirma o dia inteiro/);
 assert.equal(await ui.b.nodes.get('productionCoverageBefore').onclick(),true);await ui.b.flush();assert.equal(ui.snapshot().week_end,'2026-10-16');assert.equal(ui.b.nodes.get('productionCoverageInterval').value,'2026-10-16:BEFORE_13');declaration(ui,'NO_MANUFACTURING','Unsent before-13 draft');
 assert.equal(await ui.b.nodes.get('productionCoverageAfter').onclick(),true);await ui.b.flush();assert.equal(ui.snapshot().week_end,'2026-10-23');assert.equal(ui.b.nodes.get('productionCoverageInterval').value,'2026-10-16:AT_OR_AFTER_13');declaration(ui,'NO_MANUFACTURING','Unsent after-13 draft');
 assert.equal(await ui.b.nodes.get('productionCoverageBefore').onclick(),true);await ui.b.flush();assert.equal(ui.field('reason').value,'Unsent before-13 draft');assert.equal(ui.field('confirmed').checked,true);
 assert.equal(await ui.b.nodes.get('productionCoverageAfter').onclick(),true);await ui.b.flush();assert.equal(ui.field('reason').value,'Unsent after-13 draft');assert.equal(ui.field('confirmed').checked,true);assert.ok(ui.calls.every(row=>row.body===null));
});

test('a current Friday before13 exposes the unopened second half without fetching a future week',async t=>{
 const {f,ui}=await uiFixture(t);f.state.time=Date.parse('2026-10-23T15:00:00Z');ui.b.context.coverageClock=f.state.time;await ui.open();const initialCalls=ui.calls.length;
 assert.equal(ui.b.run('brazaProductionCoverage.openForDate("2026-10-23")'),true);await ui.b.flush();assert.equal(ui.b.nodes.get('productionCoverageAfter').disabled,true);assert.match(ui.b.nodes.get('productionCoverageDayMessage').textContent,/disponível após esse corte/);
 assert.equal(await ui.b.nodes.get('productionCoverageBefore').onclick(),true);await ui.b.flush();assert.equal(ui.snapshot().week_end,'2026-10-23');assert.equal(ui.b.nodes.get('productionCoverageInterval').value,'2026-10-23:BEFORE_13');assert.equal(ui.snapshot().intervals.find(row=>row.key==='2026-10-23:BEFORE_13').state,'OPEN');
 assert.equal(ui.b.run('brazaProductionCoverage.openForDate("2026-10-23",{part:"AT_OR_AFTER_13"})'),false);assert.equal(ui.calls.length,initialCalls);assert.ok(ui.calls.every(row=>row.body===null));assert.ok(ui.calls.every(row=>!row.path.includes('2026-10-30')));
});

test('day navigation rejects invalid dates, future dates and incompatible halves without changing the current form',async t=>{
 const {ui}=await uiFixture(t);await ui.open();const originalWeek=ui.snapshot().week_end,originalInterval=ui.b.nodes.get('productionCoverageInterval').value,initialCalls=ui.calls.length;
 for(const expression of ['brazaProductionCoverage.openForDate("2026-02-30")','brazaProductionCoverage.openForDate("2026-10-26")','brazaProductionCoverage.openForDate("2026-10-19",{part:"BEFORE_13"})','brazaProductionCoverage.openForDate("2026-10-16",{part:"DAY"})','brazaProductionCoverage.openForDate("1999-10-19")'])assert.equal(ui.b.run(expression),false,expression);
 assert.equal(ui.snapshot().week_end,originalWeek);assert.equal(ui.b.nodes.get('productionCoverageInterval').value,originalInterval);assert.equal(ui.calls.length,initialCalls);assert.ok(ui.calls.every(row=>row.body===null));
});

test('day navigation cannot replace an inflight read or ambiguous immutable coverage command',async t=>{
 const {f,ui}=await uiFixture(t);await ui.open();const currentWeek=ui.snapshot().week_end,currentInterval=ui.b.nodes.get('productionCoverageInterval').value;
 let release;const ready=Promise.withResolvers();ui.setTransport(async(path,body)=>{const response=body?await f.mutate(body):await f.read(new URL('https://test/'+path).searchParams.get('week_end'));ready.resolve();return new Promise(resolve=>{release=()=>resolve(response);});});const pending=ui.refresh();await ready.promise;assert.equal(ui.b.run('brazaProductionCoverage.openForDate("2026-10-12")'),false);assert.equal(ui.b.nodes.get('productionCoverageWeek').value,currentWeek);release();await pending;await ui.b.flush();assert.equal(ui.b.nodes.get('productionCoverageInterval').value,currentInterval);
 ui.setTransport(async(path,body)=>{if(body){await f.mutate(body);throw Object.assign(Error('SYNTHETIC_LOST_RESPONSE'),{status:503});}return f.read(new URL('https://test/'+path).searchParams.get('week_end'));});declaration(ui,'NO_MANUFACTURING','Pending immutable declaration');assert.equal(await ui.submit(),false);const sent=clone(ui.calls.find(row=>row.body).body),before=ui.calls.length;
 assert.equal(ui.b.run('brazaProductionCoverage.openForDate("2026-10-12")'),false);assert.equal(ui.b.nodes.get('productionCoverageWeek').value,currentWeek);assert.equal(ui.b.nodes.get('productionCoverageInterval').value,currentInterval);assert.equal(ui.calls.length,before);assert.equal(ui.field('reason').value,'Pending immutable declaration');assert.deepEqual(ui.calls.filter(row=>row.body).map(row=>row.body),[sent]);
});

test('failed day navigation cannot expose the previous week form as the selected new week',async t=>{
 const {ui}=await uiFixture(t);await ui.open();declaration(ui,'NO_MANUFACTURING','Old week draft kept');const initialCalls=ui.calls.length;
 ui.setTransport(async()=>{throw Object.assign(Error('SYNTHETIC_READ_FAILURE'),{status:503});});assert.equal(await ui.b.run('brazaProductionCoverage.openForDate("2026-10-12")'),false);await ui.b.flush();assert.equal(ui.b.nodes.get('productionCoverageWeek').value,'2026-10-16');assert.equal(ui.b.nodes.get('productionCoverageIntervals').children.length,0);assert.equal(ui.b.nodes.get('productionCoverageInterval').disabled,true);assert.equal(ui.calls.length,initialCalls+1);assert.ok(ui.calls.every(row=>row.body===null));
});

test('coverage stays lazy behind the daily pane and resumes the same draft when weekly becomes visible',async t=>{
 const {ui}=await uiFixture(t,{panel:'agent-production'});const weekly={hidden:true};ui.b.nodes.set('missionProductionWeeklyPane',weekly);assert.equal(await ui.open(),false);assert.equal(ui.calls.length,0);
 weekly.hidden=false;await ui.open();assert.equal(ui.calls.length,1);declaration(ui,'NO_MANUFACTURING','Same explicit interval draft while daily is visible');const selected=ui.b.nodes.get('productionCoverageInterval').value;
 weekly.hidden=true;ui.b.run('for(const fn of coverageEvents["mls-production-analytics-ready"]||[])fn();');await ui.b.flush();assert.equal(ui.calls.length,1,'hidden weekly coverage cannot perform saved-data reads after daily analytics refresh');assert.equal(ui.field('reason').value,'Same explicit interval draft while daily is visible');
 weekly.hidden=false;await ui.open();assert.equal(ui.calls.length,2);assert.equal(ui.b.nodes.get('productionCoverageInterval').value,selected);assert.equal(ui.field('reason').value,'Same explicit interval draft while daily is visible');assert.equal(ui.field('confirmed').checked,true);assert.ok(ui.calls.every(c=>c.body===null));
});
