import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {completeWorkspaceFrame,workspaceBrowser,workspaceView,workspaceStamp} from './monthly-workspace-browser-fixture.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {buildMlsAgentRegistry} from '../src/agent-registry.mjs';
import {buildMissionMonthlyReading,buildMissionMonthlyAdsReading,MISSION_CLIENT,missionWorkspacesBody} from '../src/mission-control.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
function expensesPending(){
 const source=completeWorkspaceFrame(),frame={...source,ads_adjustment_cents:0,expenses:{revision:0,external_expenses_cents:null,recharge_treatment:'UNCONFIRMED',updated_at:null},result:{...source.result,pending:[...source.result.pending,'EXTERNAL_EXPENSES_REQUIRED']}};
 assert.ok(projectBusinessMonth(frame));return frame;
}
function adsPending(){
 const source=completeWorkspaceFrame(),adsAt=source.checked_at-1800,frame={...source,ads:{...source.ads,fetched_at:adsAt,day_partial:true},source_checked_at:{...source.source_checked_at,ads_at:adsAt},result:{...source.result,pending:[...source.result.pending,'ADS_UNAVAILABLE']}};
 // day_partial must agree with the Ads source's own date. Keep the separate
 // pending/latest-source condition without forging its historical clock.
 frame.ads.day_partial=source.ads.day_partial;
 assert.ok(projectBusinessMonth(frame));return frame;
}
const expectedSubtotal=frame=>frame.expected_repass_cents-frame.known_production_cost_cents-frame.invoice_tax_cents-frame.ads.expense_cents+(frame.expenses.recharge_treatment==='ADS_RECHARGE'?frame.ads_adjustment_cents:0);
const snapshot=browser=>JSON.parse(browser.run('JSON.stringify(brazaMonthDashboard.getSnapshot())'));
function mission(registry){
 const ids=[...missionWorkspacesBody().matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 const create=(tag='div')=>({tag,textContent:'',children:[],dataset:{},style:{},hidden:false,append(...values){this.children.push(...values);},replaceChildren(...values){this.children=[...values];},addEventListener(){}});
 const nodes=new Map(ids.map(id=>[id,create()])),document={getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[],createElement:create};
 const context=vm.createContext({document,serialized:JSON.stringify(registry)});vm.runInContext('const monthRegistry=JSON.parse(serialized);globalThis.mlsAgentRegistry={getSnapshot:()=>monthRegistry};'+MISSION_CLIENT,context);return {nodes,context};
}

test('monthly card reveals the bounded subtotal before unknown expenses without changing strict net, margin or saved declarations',async()=>{
 const frame=expensesPending(),before=clone(frame),b=workspaceBrowser(workspaceView(frame));await b.run('brazaMonthDashboard.start({api})');
 const observed=snapshot(b),amount=expectedSubtotal(frame);
 assert.match(b.text('Net'),new RegExp(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(amount/100).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.equal(b.text('NetLabel'),'Saldo parcial antes de outras despesas');assert.match(b.text('NetHelp'),/não declaradas/);assert.match(b.text('NetHelp'),/sem assumir valor zero/);assert.match(b.text('NetHelp'),/não é lucro líquido final/);assert.equal(b.text('Margin'),'');
 assert.equal(observed.balance_cents,null);assert.equal(observed.presentation.amount_cents,amount);assert.equal(observed.presentation.expenses_included,false);assert.deepEqual(observed.presentation.monthly_costs_missing,['EXTERNAL_EXPENSES_REQUIRED']);
 assert.match(b.text('Waterfall'),/Outras despesas do mês · não declaradas Pendente/);assert.equal(b.calls().some(call=>call.body!==undefined),false);assert.deepEqual(frame,before);
 b.run('brazaMonthDashboard.stop()');
});

test('the partial monthly card opens expenses for the displayed month without recording zero or starting provider work',async()=>{
 const b=workspaceBrowser(workspaceView(expensesPending()));await b.run('brazaMonthDashboard.start({api})');
 b.run("const expenseOpens=[];globalThis.brazaExpenseLedger={open(selected){expenseOpens.push(selected);return Promise.resolve(true);}};");
 const before=b.calls().length;assert.equal(await b.run("control('NetCard').children.find(item=>item.id==='businessMonthPartialAction').onclick()"),true);
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(expenseOpens)')),['2026-10']);assert.equal(b.calls().length,before);assert.equal(snapshot(b).balance_cents,null);
 b.run('brazaMonthDashboard.stop()');
});

test('saved Ads remain a dated subtotal with unchanged strict warning and the same source expense',async()=>{
 const frame=adsPending(),b=workspaceBrowser(workspaceView(frame));await b.run('brazaMonthDashboard.start({api})');
 const observed=snapshot(b);assert.equal(observed.balance_cents,null);assert.equal(observed.presentation.state,'KNOWN_COSTS');assert.equal(observed.presentation.ads_pending,true);assert.equal(observed.presentation.ads_checked_at,frame.ads.fetched_at);assert.equal(observed.presentation.ads_day_partial,frame.ads.day_partial);
 assert.equal(observed.presentation.amount_cents,expectedSubtotal(frame));assert.ok(observed.pending.includes('ADS_UNAVAILABLE'));assert.equal(b.text('NetLabel'),'Saldo parcial · anúncios em conferência');assert.match(b.text('NetHelp'),/leitura salva.*Brasília/);assert.match(b.text('NetHelp'),/Devoluções/);assert.equal(b.calls().some(call=>call.body!==undefined),false);
 b.run('brazaMonthDashboard.stop()');
});

test('Finance displays the same monthly partial and partial tone while its readiness metric remains strict',async()=>{
 const b=workspaceBrowser(workspaceView(expensesPending()));await b.run('brazaMonthDashboard.start({api})');const month=snapshot(b),registry=buildMlsAgentRegistry({month,now:workspaceStamp});
 const finance=registry.agents.find(agent=>agent.id==='finance');assert.equal(finance.metric,null);assert.notEqual(finance.status,'HEALTHY');assert.equal(registry.month.balance_cents,null);assert.equal(registry.month.presentation.amount_cents,month.presentation.amount_cents);assert.ok(Object.isFrozen(registry.month.presentation.monthly_costs_missing));
 const reading=buildMissionMonthlyReading(registry.month);assert.equal(reading.value,month.presentation.amount_cents);assert.equal(reading.partial,true);assert.equal(reading.expenses_pending,true);
 const mounted=mission(registry);assert.equal(mounted.nodes.get('mission-finance-label-0').textContent,'Saldo parcial antes de outras despesas');assert.match(mounted.nodes.get('mission-finance-hint-0').textContent,/não foram consideradas como zero/);assert.match(mounted.nodes.get('mission-finance-hint-0').textContent,/Devoluções ainda/);assert.match(mounted.nodes.get('mission-finance-hint-0').textContent,/Pedidos em revisão/);assert.ok(Object.isFrozen(registry.month.pending));assert.equal(mounted.nodes.get('mission-finance-metric-0').dataset.resultTone,'partial');
 assert.equal(registry.day.net_cents,null);assert.equal(registry.day.margin_bps,null);b.run('brazaMonthDashboard.stop()');
});

test('monthly snapshot rejects inconsistent presentation flags, extras and injected accessors before Finance fallback',async()=>{
 const b=workspaceBrowser(workspaceView(expensesPending()));await b.run('brazaMonthDashboard.start({api})');const observed=snapshot(b);
 for(const update of [month=>{month.presentation.extra='PRIVATE';},month=>{month.presentation.expenses_included=true;},month=>{month.presentation.ads_pending=true;},month=>{month.presentation.monthly_costs_missing=[];},month=>{month.pending=month.pending.filter(code=>code!=='EXTERNAL_EXPENSES_REQUIRED');},month=>{month.status='RUNNING';},month=>{month.balance_cents=0;}]){
  const month=clone(observed);update(month);const registry=buildMlsAgentRegistry({month});assert.equal(registry.month.presentation,null);assert.equal(buildMissionMonthlyReading(registry.month).partial,false);
 }
 let reads=0;const month=clone(observed);Object.defineProperty(month,'presentation',{get(){reads++;throw Error('PRIVATE');}});assert.equal(buildMlsAgentRegistry({month}).month.presentation,null);assert.equal(reads,0);b.run('brazaMonthDashboard.stop()');
});

test('shared month selection preserves unsaved expenses and clears old financial values before a delayed history read',async()=>{
 const b=workspaceBrowser(workspaceView());await b.run('brazaMonthDashboard.start({api})');b.run("const monthEvents=[];const unsubscribeMonth=brazaMonthDashboard.subscribe(value=>monthEvents.push({month:value.month,balance:value.balance_cents,loading:value.period_loading,blocked:value.period_change_blocked}));control('ExpensesValue').value='17,29';control('ExpensesValue').oninput();");
 const before=b.calls().length;assert.equal(await b.run("brazaMonthDashboard.selectMonth('2026-09')"),false);assert.equal(b.calls().length,before);assert.equal(b.run("control('ExpensesValue').value"),'17,29');assert.equal(snapshot(b).month,'2026-10');assert.equal(snapshot(b).period_change_blocked,true);assert.match(b.text('Status'),/rascunhos foram preservados/);
 b.run("control('ExpensesReload').onclick();customApi=()=>new Promise(resolve=>globalThis.finishHistory=resolve);globalThis.historySelection=brazaMonthDashboard.selectMonth('2026-09');");
 assert.equal(snapshot(b).month,'2026-09');assert.equal(snapshot(b).balance_cents,null);assert.equal(snapshot(b).presentation,null);assert.equal(snapshot(b).period_loading,true);assert.equal(b.text('Net'),'Em apuração');assert.equal(b.run('monthEvents.at(-1).month'),'2026-09');assert.equal(b.run('monthEvents.at(-1).balance'),null);
 b.context.history=JSON.stringify(workspaceView(completeWorkspaceFrame({month:'2026-09'})));b.run('finishHistory(JSON.parse(history));');assert.equal(await b.run('historySelection'),true);assert.equal(snapshot(b).month,'2026-09');assert.equal(snapshot(b).period_loading,false);assert.notEqual(snapshot(b).balance_cents,null);
 b.run('unsubscribeMonth();');const events=b.run('monthEvents.length');b.run('control("ExpensesValue").oninput();');assert.equal(b.run('monthEvents.length'),events);assert.equal(b.calls().some(call=>call.body!==undefined),false);b.run('brazaMonthDashboard.stop()');
});


test('Ads specialist uses selected-month expenditure even when an independent daily snapshot is present',async()=>{
 const frame=expensesPending(),b=workspaceBrowser(workspaceView(frame));await b.run('brazaMonthDashboard.start({api})');const month=snapshot(b),day={schema:'mls_day_snapshot_v1',date:'2026-11-01',net_cents:null,sales_cents:10000,ads_spend_cents:777,paid_orders:1,pending:[]},registry=buildMlsAgentRegistry({month,day});
 assert.equal(registry.day.ads_spend_cents,777);assert.equal(registry.month.ads_spend_cents,frame.ads.expense_cents);assert.equal(registry.month.ads_checked_at,frame.ads.fetched_at);assert.equal(registry.agents.find(agent=>agent.id==='ads').metric,frame.ads.expense_cents);
 const mounted=mission(registry);assert.equal(mounted.nodes.get('mission-ads-label-0').textContent,'Investimento do mês');assert.equal(mounted.nodes.get('mission-ads-metric-0').textContent,new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(frame.ads.expense_cents/100));assert.match(mounted.nodes.get('mission-ads-hint-0').textContent,/10\/2026/);assert.match(mounted.nodes.get('mission-ads-hint-0').textContent,/leitura salva/);assert.doesNotMatch(mounted.nodes.get('mission-ads-hint-0').textContent,/11\/2026/);b.run('brazaMonthDashboard.stop()');
});

test('unknown, wrong-scope or incomplete monthly Ads metadata cannot fall back to a current-day amount',async()=>{
 const b=workspaceBrowser(workspaceView(expensesPending()));await b.run('brazaMonthDashboard.start({api})');const original=snapshot(b),day={schema:'mls_day_snapshot_v1',date:'2026-11-01',ads_spend_cents:777};
 for(const update of [month=>{month.ads_checked_at=null;},month=>{month.status=null;},month=>{month.month='invalid';},month=>{month.ads_pending=true;},month=>{month.ads_spend_cents=null;}]){const month=clone(original);update(month);const registry=buildMlsAgentRegistry({month,day});assert.equal(registry.month.ads_spend_cents,null);assert.equal(registry.agents.find(agent=>agent.id==='ads').metric,null);assert.equal(buildMissionMonthlyAdsReading(registry.month).value,null);assert.equal(registry.day.ads_spend_cents,777);}
 const stale=clone(original);stale.ads_pending=true;stale.pending.push('ADS_UNAVAILABLE');const registry=buildMlsAgentRegistry({month:stale,day}),reading=buildMissionMonthlyAdsReading(registry.month);assert.equal(reading.value,stale.ads_spend_cents);assert.equal(reading.partial,true);assert.match(reading.help,/Calendário em conferência/);b.run('brazaMonthDashboard.stop()');
});
