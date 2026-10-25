import test from 'node:test';
import assert from 'node:assert/strict';
import {completeWorkspaceFrame,activeWorkspaceFrame,workspaceView,workspaceBrowser} from './monthly-workspace-browser-fixture.mjs';

const onlyLocal=calls=>assert.ok(calls.every(row=>row.body===undefined&&row.path.startsWith('finance/business-month-view?')),'opening and polling cannot import orders or Ads');

test('a fully costed paid cohort shows one provisional net while status reviews and returns keep strict readiness blocked',async()=>{
 const b=workspaceBrowser(workspaceView());assert.equal(await b.run('brazaMonthDashboard.start({api})'),true);assert.equal(b.text('NetLabel'),'Resultado líquido previsto · em conferência');assert.match(b.text('Net'),/2\.250,13/);assert.match(b.text('TotalExpenses'),/8\.853,33/);assert.match(b.text('NetHelp'),/2 pedidos com situação em revisão estão excluídos.*4 devoluções ainda precisam de conciliação/);assert.match(b.text('PendingList'),/situação.*devoluções/);assert.doesNotMatch(b.text('CostOverview'),/Subtotal com custos identificados/);assert.equal(b.run('currentView.display.result.net_estimate_cents'),null);assert.equal(b.run('currentView.display.result.net_profit_cents'),null);assert.match(b.text('ReadinessStatus'),/pendências/);onlyLocal(b.calls());b.run('brazaMonthDashboard.stop()');
});

test('published money remains separate from an active refresh and browser polls never advance its source',async()=>{
 const published=completeWorkspaceFrame(),active=activeWorkspaceFrame(),b=workspaceBrowser(workspaceView(published,{active}));await b.run('brazaMonthDashboard.start({api})');assert.match(b.text('Net'),/2\.250,13/);assert.match(b.text('Sales'),/15\.766,39/);assert.match(b.text('CostOverview'),/7\.450,70/);assert.match(b.text('CollectionState'),/Resumo concluído.*Nova coleta.*233 pedido/);assert.doesNotMatch(b.text('CostOverview'),/7\.349,80/);assert.equal(b.run('control("Progress").value'),50);
 await b.tick();onlyLocal(b.calls());assert.equal(b.calls().length,2);assert.match(b.text('Net'),/2\.250,13/);b.run('brazaMonthDashboard.stop()');
});

test('a fresh empty month waits for the cron instead of representing missing sales as zero',async()=>{
 const active=activeWorkspaceFrame({empty:true}),b=workspaceBrowser(workspaceView(active,{active,published:false}));await b.run('brazaMonthDashboard.start({api})');assert.equal(b.text('Sales'),'Pendente');assert.equal(b.text('Net'),'Em apuração');assert.match(b.text('CollectionState'),/Resumo parcial.*0 pedido/);assert.match(b.text('Badge'),/automática em andamento/);await b.tick();onlyLocal(b.calls());b.run('brazaMonthDashboard.stop()');
});

test('the sales update requests one cron priority and observes without replaying start, step, Ads or expenses',async()=>{
 const b=workspaceBrowser(workspaceView(completeWorkspaceFrame(),{active:activeWorkspaceFrame()}));await b.run('brazaMonthDashboard.start({api})');b.run('control("ExpensesValue").value="37,50";control("ExpensesValue").oninput();');assert.equal(await b.run('control("SourceRefresh").onclick()'),true);const mutations=b.calls().filter(row=>row.body!==undefined);assert.deepEqual(mutations,[{path:'finance/business-month-request',body:{month:'2026-10'}}]);assert.equal(b.run('control("ExpensesValue").value'),'37,50');assert.match(b.text('Net'),/2\.250,13/);assert.match(b.text('Status'),/priorizada/);await b.tick();assert.equal(b.calls().filter(row=>row.body!==undefined).length,1);b.run('brazaMonthDashboard.stop()');
});

test('malformed or failed observations preserve displayed money and cannot launch a provider fallback',async()=>{
 const b=workspaceBrowser();await b.run('brazaMonthDashboard.start({api})');const net=b.text('Net');b.run('customApi=async()=>({...JSON.parse(JSON.stringify(currentView)),month:"2026-09"});');assert.equal(await b.run('brazaMonthDashboard.refreshCosts()'),false);assert.equal(b.text('Net'),net);assert.match(b.text('Status'),/preservados/);onlyLocal(b.calls());b.run('customApi=async()=>{throw Object.assign(Error("PRIVATE"),{status:401});};');assert.equal(await b.run('brazaMonthDashboard.refreshCosts()'),false);assert.equal(b.text('Net'),net);assert.match(b.text('Status'),/Entre novamente/);assert.doesNotMatch(b.text('Status'),/PRIVATE/);b.run('brazaMonthDashboard.stop()');
});

test('hidden pages stop observation and a stopped request cannot replace the selected published frame',async()=>{
 const b=workspaceBrowser();await b.run('brazaMonthDashboard.start({api})');b.run('document.hidden=true;document.handlers.visibilitychange();');assert.equal(b.run('timers.size'),0);assert.equal(b.calls().length,1);b.run('document.hidden=false;customApi=()=>new Promise(resolve=>globalThis.finishView=resolve);globalThis.pendingView=brazaMonthDashboard.refreshCosts();');await Promise.resolve();const old=b.text('Net');b.run('brazaMonthDashboard.stop();finishView(JSON.parse(JSON.stringify(currentView)));');assert.equal(await b.run('pendingView'),false);assert.equal(b.text('Net'),old);assert.equal(b.run('timers.size'),0);
});

test('a policy change during a manual request transfers ownership to the cron after one guarded start',async()=>{
 const display=completeWorkspaceFrame(),b=workspaceBrowser(workspaceView(display,{enabled:false}));b.context.enabledView=JSON.stringify(workspaceView(display,{active:activeWorkspaceFrame()}));await b.run('brazaMonthDashboard.start({api})');b.run('customApi=async(path,body)=>{if(path.startsWith("finance/business-month-view?"))return JSON.parse(enabledView);if(body?.operation==="start")throw Object.assign(Error("guarded"),{status:409,code:"BUSINESS_MONTH_BACKGROUND_OWNED"});throw Error("UNEXPECTED");};');assert.equal(await b.run('control("SourceRefresh").onclick()'),true);assert.deepEqual(b.calls().filter(row=>row.body!==undefined),[{path:'finance/business-month',body:{operation:'start',month:'2026-10'}}]);assert.match(b.text('Net'),/2\.250,13/);assert.match(b.text('CollectionState'),/Nova coleta.*233 pedido/);await b.tick();assert.equal(b.calls().filter(row=>row.body!==undefined).length,1);b.run('brazaMonthDashboard.stop()');
});

test('priority clicks coalesce and an old month cannot leave the newly selected month locked',async()=>{
 const b=workspaceBrowser();await b.run('brazaMonthDashboard.start({api})');b.context.oldView=JSON.stringify(workspaceView(completeWorkspaceFrame({month:'2026-09'})));b.run('customApi=async(path,body)=>path==="finance/business-month-request"?new Promise(resolve=>globalThis.finishPriority=resolve):path.includes("month=2026-09")?JSON.parse(oldView):JSON.parse(JSON.stringify(currentView));globalThis.firstPriority=control("SourceRefresh").onclick();globalThis.secondPriority=control("SourceRefresh").onclick();');assert.equal(b.run('firstPriority===secondPriority'),true);assert.equal(b.calls().filter(row=>row.path==='finance/business-month-request').length,1);b.run('control("Select").value="2026-09";');assert.equal(await b.run('control("Select").onchange()'),true);const text=b.text('CollectionState');b.run('finishPriority({schema:"business_month_refresh_request_v1",month:"2026-10",status:"QUEUED",next_run_at:clock/1000,lease_expires_at:null});');assert.equal(await b.run('firstPriority'),false);assert.equal(b.text('CollectionState'),text);assert.equal(b.run('control("SourceRefresh").disabled'),false);assert.match(b.text('CollectionState'),/Mês histórico/);b.run('brazaMonthDashboard.stop()');
});
