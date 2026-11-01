import test from 'node:test';
import assert from 'node:assert/strict';
import {AGENT_REGISTRY_CLIENT,commandCenterBody} from '../src/agent-registry-view.mjs';
import {businessDayBody} from '../src/business-day-view.mjs';
import {compiledOwnerReportPage,ownerReportBrowser} from './owner-report-browser-fixture.mjs';
import {collectionFixture} from './business-collection-fixture.mjs';
import {SCHEMA} from '../src/admin.mjs';
import {businessMonth,readBusinessMonthDisplay} from '../src/business-month.mjs';
import {readBusinessSyncState} from '../src/business-sync.mjs';
import {buildBusinessMonthView} from '../src/business-month-view-state.mjs';
import {MISSION_TRENDS_CLIENT,missionWorkspacesBody} from '../src/mission-control.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {projectMissionAdsSnapshot} from '../src/mls-ads-performance.mjs';

function mountRegistry(html,{clock='2026-11-01T03:00:00Z',date='2026-11-01'}={}){
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)],source=scripts.find(match=>match[1].includes('globalThis.mlsAgentRegistry='))?.[1];
 assert.ok(source,'the actual owner registry client must be present');
 const setup=`
  const NativeDailyTestDate=Date;globalThis.Date=class extends NativeDailyTestDate{constructor(...args){super(...(args.length?args:[${Date.parse(clock)}]));}static now(){return ${Date.parse(clock)};}};
  globalThis.testSelectedDay=${JSON.stringify(date)};
  globalThis.brazaDayDashboard={getSelection:()=>testSelectedDay,getSnapshot:()=>({schema:'mls_day_snapshot_v1',date:testSelectedDay,state:'PROVISIONAL',net_cents:0,net_basis:'ESTIMATE',sales_cents:0,ads_spend_cents:0,paid_orders:0,pending:[]}),getTrend:()=>null};
  globalThis.brazaMonthDashboard={getSnapshot:()=>null,getSourceStatus:()=>null};
 `;
 return ownerReportBrowser(html.replace(source,setup+source),{scriptIncludes:'globalThis.mlsAgentRegistry='});
}

function verifyDayLabels(browser){
 const label=id=>browser.nodes.get(id).textContent;
 assert.equal(label('commandCenterNetLabel'),'Lucro estimado hoje');
 assert.equal(label('commandCenterSalesLabel'),'Vendas hoje');
 assert.equal(label('commandCenterAdsLabel'),'Ads hoje');
 browser.run("testSelectedDay='2026-10-31';mlsAgentRegistry.refresh();");
 assert.equal(label('commandCenterNetLabel'),'Lucro estimado ontem');
 assert.equal(label('missionDayComparisonTitle'),'Comparativo financeiro de ontem');
 browser.run("testSelectedDay='2026-10-10';mlsAgentRegistry.refresh();");
 assert.equal(label('commandCenterNetLabel'),'Lucro estimado · 10/10/2026');
 assert.equal(label('commandCenterSalesLabel'),'Vendas · 10/10/2026');
 assert.equal(label('commandCenterAdsLabel'),'Ads · 10/10/2026');
 assert.equal(label('missionDayComparisonTitle'),'Comparativo financeiro de 10/10/2026');
 assert.equal(browser.calls.length,0,'changing the displayed date labels cannot request any API or provider');
 browser.run('mlsAgentRegistry.stop();');
}

test('Today, Yesterday and custom daily KPI labels match the selected Brasília date',()=>{
 verifyDayLabels(mountRegistry(commandCenterBody()+businessDayBody()+'<script>'+AGENT_REGISTRY_CLIENT+'</script>'));
 const beforeRollover=mountRegistry(commandCenterBody()+businessDayBody()+'<script>'+AGENT_REGISTRY_CLIENT+'</script>',{clock:'2026-11-01T02:59:59Z',date:'2026-10-31'});
 assert.equal(beforeRollover.nodes.get('commandCenterNetLabel').textContent,'Lucro estimado hoje','UTC November still belongs to October in Brasília before 03:00 UTC');
 beforeRollover.run('mlsAgentRegistry.stop();');
});

for(const minify of [false,true])test(`generated owner daily labels preserve selected dates and perform no source reads (minify=${minify})`,async()=>{
 const {html}=await compiledOwnerReportPage(minify,{ownerPreview:false});
 verifyDayLabels(mountRegistry(html));
});

const sourceCounts=f=>({finance:f.calls.finance.length,ads:f.calls.ads.length,list:f.calls.list.length,detail:f.calls.detail.length,payment:f.calls.payment.length});
async function collectedWorkspace(t){
 const f=await collectionFixture({daily:true,allPaid:true,windowCounts:[2,1],paymentDelayMs:0});
 t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 await f.env.ADMIN_DB.batch(SCHEMA.map(sql=>f.env.ADMIN_DB.prepare(sql)));
 let frame=await f.invoke('start');for(let n=0;frame.status==='RUNNING'&&n<20;n++)frame=await f.invoke('step');assert.equal(frame.status,'COMPLETE');await f.invoke('ads');
 f.env.ADMIN_DB.db.prepare('DELETE FROM business_month_expenses WHERE month=?').run('2026-10');
 f.env.ADMIN_DB.db.prepare('DELETE FROM business_month_expenses_audit WHERE month=?').run('2026-10');
 const readView=async()=>buildBusinessMonthView(await readBusinessMonthDisplay(f.env,{month:'2026-10'},{now:f.now}),await readBusinessSyncState(f.env),{now:f.now,contract:'business-month-view-v3'});
 return {f,readView};
}
function ownerScript(html,token){const result=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]).find(script=>script.includes(token));assert.ok(result,'actual generated client missing: '+token);return result;}

function firstDayAds(){
 const period={start_date:'2026-11-01',end_date:'2026-11-01'},stamp=Date.parse('2026-11-01T18:00:00Z')/1000;
 const measured=buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period,balance:0,daily:[{date:period.start_date,expense:'31.29',broad_gmv:'734.71',broad_order:1,direct_gmv:0,direct_order:0}]},period,stamp);
 const value=projectMissionAdsSnapshot({schema:'business_month_v1',month:'2026-11',...period,checked_at:stamp,ads:buildAdsCalendar([measured],period,stamp)});assert.ok(value);assert.equal(value.status,'AVAILABLE');return value;
}
function mountFaultedTrends(html){
 const source=ownerScript(html,'globalThis.mlsMissionTrends='),ads=firstDayAds();
 const setup=`globalThis.qaAds=null;globalThis.brazaMonthDashboard={getAdsSnapshot:()=>qaAds};globalThis.brazaDayDashboard={getTrend:()=>null};globalThis.mlsAgentRegistry={getSnapshot:()=>({day:{net_cents:null,margin_bps:null,presentation:{state:'BEFORE_MONTHLY_COSTS',basis:'BEFORE_UNCONFIRMED_EXPENSES',amount_cents:9947,margin_bps:1687}},month:{balance_cents:null}})};document.getElementById('missionTrendValuesOverview').textContent='STALE_VALUES_OLD_MONTH';document.getElementById('missionTrendScopeOverview').textContent='STALE_SCOPE_OLD_MONTH';document.getElementById('missionTrendGraphOverview').replaceChildren=()=>{throw Error('SYNTHETIC_GRAPH_RENDER_FAILURE');};document.getElementById('missionTrendGraphFinance').dataset.chartStatus='NOT_RENDERED';document.getElementById('missionTrendGraphAds').dataset.chartStatus='NOT_RENDERED';`;
 const browser=ownerReportBrowser(html.replace(source,setup+source),{scriptIncludes:'globalThis.mlsMissionTrends='});browser.context.adsInput=JSON.stringify(ads);return browser;
}
function verifyFaultedTrends(browser){
 assert.equal(browser.nodes.get('commandCenterRoas').textContent,'—');
 assert.doesNotThrow(()=>browser.run('qaAds=JSON.parse(adsInput);mlsMissionTrends.refresh();'),'a chart failure must not abort the independent numeric cards');
 assert.equal(browser.nodes.get('commandCenterRoas').textContent,'23,48x','one validated Ads observation has a real period ratio without a curve or comparison');
 assert.equal(browser.nodes.get('missionKpiDeltaRoas').dataset.direction,'UNAVAILABLE');assert.match(browser.nodes.get('missionKpiDeltaRoas').textContent,/Sem dois dias completos/);
 assert.equal(browser.nodes.get('missionTrendGraphOverview').dataset.chartStatus,'ERROR');assert.match(browser.nodes.get('missionTrendGraphOverview').textContent,/Não foi possível atualizar este gráfico/);assert.doesNotMatch(browser.nodes.get('missionTrendGraphOverview').textContent,/SYNTHETIC|stack|token/i);
 assert.equal(browser.nodes.get('missionTrendValuesOverview').textContent,'');assert.equal(browser.nodes.get('missionTrendScopeOverview').textContent,'Histórico indisponível para esta seleção');
 assert.equal(browser.nodes.get('missionTrendGraphFinance').dataset.chartStatus,'UNAVAILABLE');assert.equal(browser.nodes.get('missionTrendGraphAds').dataset.chartStatus,'UNAVAILABLE');
 browser.run('qaAds.attributed_sales_cents++;mlsMissionTrends.refresh();');assert.equal(browser.nodes.get('commandCenterRoas').textContent,'—','invalid Ads evidence must clear the prior card value even if a chart still fails');
 assert.equal(browser.calls.length,0,'redrawing cached cards and charts cannot request the provider or create a polling loop');
}
test('a first-panel render failure cannot suppress a newly available one-day ROAS card or retain invalid Ads evidence',()=>{
 verifyFaultedTrends(mountFaultedTrends(commandCenterBody()+missionWorkspacesBody()+'<script>'+MISSION_TRENDS_CLIENT+'</script>'));
});
for(const minify of [false,true])test(`generated one-day ROAS cards survive chart failures and clear rejected evidence (minify=${minify})`,async()=>{
 const {html}=await compiledOwnerReportPage(minify,{ownerPreview:false});verifyFaultedTrends(mountFaultedTrends(html));
});

for(const minify of [false,true])test(`generated partial daily amount becomes profit immediately after explicit zero-expense confirmation without provider reads (minify=${minify})`,async t=>{
 const {f,readView}=await collectedWorkspace(t);let view=await readView();
 const observed=view.daily_summary.days[19],expected=observed.operating_balance_cents-observed.allocated_das_cents;
 assert.equal(observed.estimate_cents,null);assert.equal(observed.allocated_expenses_cents,null);assert.ok(observed.pending.includes('EXTERNAL_EXPENSES_REQUIRED'));
 const {html}=await compiledOwnerReportPage(minify,{ownerPreview:false}),b=ownerReportBrowser(html,{scriptIncludes:'globalThis.brazaMonthDashboard='});
 const calls=[],before=sourceCounts(f);b.context.clock=f.clock.time;
 b.context.savedRead=async(path,body)=>{
  calls.push({path,body});
  if(path==='finance/business-month-view?month=2026-10')return JSON.stringify(view);
  if(path==='finance/business-month'){
   const submitted=JSON.parse(JSON.stringify(body));assert.deepEqual(submitted,{operation:'expenses',month:'2026-10',revision:0,external_expenses_cents:0,recharge_treatment:'UNCONFIRMED'});
   const result=await businessMonth(f.env,submitted,f.services,{now:f.now,actor:'synthetic-owner-explicit-zero'});view=await readView();return JSON.stringify(result);
  }
  return 'null';
 };
 try{
  b.run(`class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}globalThis.Date=ClockDate;globalThis.location=new URL('https://owner-report.test/admin?tab=overview&date=2026-10-20');const api=async(path,body)=>JSON.parse(await savedRead(path,body));brazaDayDashboard.prepare();brazaMonthDashboard.prepare();brazaDayDashboard.bootstrapState({phase:'READY'});brazaMonthDashboard.bootstrapState({phase:'READY'});`);
  assert.equal(await b.run('brazaMonthDashboard.start({api})'),true);await b.flush();
  b.run(ownerScript(html,'globalThis.mlsAgentRegistry='));
  assert.equal(b.run('brazaDayDashboard.getSnapshot().net_cents'),null);assert.equal(b.run('mlsAgentRegistry.getSnapshot().day.net_cents'),null);
  assert.equal(b.run('mlsAgentRegistry.getSnapshot().day.margin_bps'),null);assert.equal(b.run('mlsAgentRegistry.getSnapshot().day.presentation.amount_cents'),expected);
  const expectedMargin=Number(BigInt(expected)*10000n/BigInt(observed.sales_cents));assert.equal(b.run('mlsAgentRegistry.getSnapshot().day.presentation.margin_bps'),expectedMargin);
  assert.equal(b.nodes.get('commandCenterMarginLabel').textContent,'Margem parcial');assert.equal(b.nodes.get('commandCenterMarginScope').hidden,false);assert.equal(b.nodes.get('commandCenterMarginScope').textContent,'Antes das despesas do mês');assert.equal(b.nodes.get('commandCenterMargin').textContent,new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2}).format(expectedMargin/100)+'%');assert.match(b.nodes.get('commandCenterMarginHelp').textContent,/não representa a margem líquida completa/);
  assert.match(b.nodes.get('businessDayNetLabel').textContent,/Saldo parcial antes das despesas mensais/);
  assert.equal(b.nodes.get('commandCenterNetLabel').textContent,'Saldo parcial · 20/10/2026');assert.match(b.nodes.get('commandCenterNet').textContent,/27,59/);
  assert.equal(b.nodes.get('missionSourceState').hidden,false,'known sales and Ads cannot hide the missing expense reason');
  const action=b.nodes.get('commandCenterNetAction');assert.equal(action.hidden,false);assert.equal(action.href,'/admin?tab=agent-finance&month=2026-10&date=2026-10-20#businessMonthExpensesForm');
  assert.equal(calls.filter(call=>call.path==='finance/business-month').length,0,'viewing the subtotal cannot confirm expenses automatically');
  assert.equal(await b.nodes.get('businessMonthExpensesZero').onclick(),true,b.nodes.get('businessMonthExpenseState').textContent);await b.flush();b.run('mlsAgentRegistry.refresh();');
  assert.equal(b.run('brazaDayDashboard.getSnapshot().net_cents'),expected);assert.equal(b.run('mlsAgentRegistry.getSnapshot().day.net_cents'),expected);
  assert.equal(b.nodes.get('commandCenterNetLabel').textContent,'Lucro estimado · 20/10/2026');assert.match(b.nodes.get('commandCenterNet').textContent,/27,59/);
  assert.equal(b.run('mlsAgentRegistry.getSnapshot().day.margin_bps'),expectedMargin);assert.equal(b.nodes.get('commandCenterMarginLabel').textContent,'Margem estimada');assert.equal(b.nodes.get('commandCenterMarginScope').hidden,true);
  assert.equal(action.hidden,true);assert.equal(b.nodes.get('missionSourceState').hidden,true);
  assert.equal(calls.filter(call=>call.path==='finance/business-month').length,1);assert.equal(calls.filter(call=>call.path==='finance/business-month-view?month=2026-10').length,2,'confirmation must refresh the saved daily view immediately rather than wait for the next timer');
  assert.deepEqual(sourceCounts(f),before,'expense confirmation and refresh reuse the saved collection and cannot reread the provider');
 }finally{b.run('brazaDayDashboard.stop();brazaMonthDashboard.stop();mlsAgentRegistry?.stop();');b.timers.clear();}
});

for(const minify of [false,true])test(`the existing saved-read timer follows Today across Brasília month rollover and preserves explicit dates (minify=${minify})`,async t=>{
 const {f,readView}=await collectedWorkspace(t),view=await readView(),{html}=await compiledOwnerReportPage(minify,{ownerPreview:false}),before=sourceCounts(f);
 for(const [search,dateAfter,monthAfter] of [['?tab=overview&month=2026-10','2026-11-01','2026-11'],['?tab=overview&date=2026-10-20','2026-10-20','2026-10'],['?tab=agent-finance&month=2026-10','2026-10-31','2026-10']]){
  const b=ownerReportBrowser(html,{scriptIncludes:'globalThis.brazaMonthDashboard='}),calls=[];b.context.clock=Date.parse('2026-11-01T02:59:59Z');
  b.context.savedRead=async(path,body)=>{calls.push({path,body});return path==='finance/business-month-view?month=2026-10'?JSON.stringify(view):'null';};
  try{
   b.run(`class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}globalThis.Date=ClockDate;globalThis.location=new URL('https://owner-report.test/admin'+${JSON.stringify(search)});const api=async(path,body)=>JSON.parse(await savedRead(path,body));brazaDayDashboard.prepare();brazaMonthDashboard.prepare();brazaDayDashboard.bootstrapState({phase:'READY'});brazaMonthDashboard.bootstrapState({phase:'READY'});`);
   assert.equal(await b.run('brazaMonthDashboard.start({api})'),true);await b.flush();
   const selectedBefore=b.run('brazaDayDashboard.getSelection()'),poll=[...b.timers.values()].filter(timer=>timer.delay===60000&&timer.callback.toString().includes('getSelection'));
   assert.equal(poll.length,1,'exactly one existing passive month timer must own the relative day refresh');
   b.context.clock=Date.parse('2026-11-01T03:00:00Z');await poll[0].callback();await b.flush();
   assert.equal(b.run('brazaDayDashboard.getSelection()'),dateAfter);assert.equal(b.nodes.get('businessMonthSelect').value,monthAfter);
   const reads=calls.filter(call=>call.path.startsWith('finance/business-month-view?'));
   assert.equal(reads.length,2);assert.equal(reads.at(-1).path,'finance/business-month-view?month='+monthAfter);
   if(monthAfter==='2026-11'){assert.equal(b.run('brazaDayDashboard.getSnapshot().net_cents'),null);assert.equal(b.run('brazaDayDashboard.getTrend()'),null,'October chart evidence cannot be relabelled as November');}
   else assert.equal(dateAfter,selectedBefore,'explicit dates cannot follow a hidden local clock change');
   assert.ok(calls.every(call=>call.body===undefined),'the rollover is a saved GET and must not create a collection or expense mutation');
  }finally{b.run('brazaDayDashboard.stop();brazaMonthDashboard.stop();');b.timers.clear();}
 }
 assert.deepEqual(sourceCounts(f),before,'changing the display date and polling saved state cannot call Finance or Ads providers');
});

for(const minify of [false,true])test(`relative Today rollover preserves an edited expense draft until the owner discards it (minify=${minify})`,async t=>{
 const {f,readView}=await collectedWorkspace(t),view=await readView(),{html}=await compiledOwnerReportPage(minify,{ownerPreview:false}),b=ownerReportBrowser(html,{scriptIncludes:'globalThis.brazaMonthDashboard='}),calls=[];
 b.context.clock=Date.parse('2026-11-01T02:59:59Z');b.context.savedRead=async(path,body)=>{calls.push({path,body});return path==='finance/business-month-view?month=2026-10'?JSON.stringify(view):'null';};
 try{
  b.run(`class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}globalThis.Date=ClockDate;globalThis.location=new URL('https://owner-report.test/admin?tab=overview');const api=async(path,body)=>JSON.parse(await savedRead(path,body));brazaDayDashboard.prepare();brazaMonthDashboard.prepare();brazaDayDashboard.bootstrapState({phase:'READY'});brazaMonthDashboard.bootstrapState({phase:'READY'});`);
  assert.equal(await b.run('brazaMonthDashboard.start({api})'),true);await b.flush();
  b.nodes.get('businessMonthExpensesValue').value='123,45';b.nodes.get('businessMonthExpensesValue').oninput();
  assert.equal(await b.run('brazaMonthDashboard.selectMonth("2026-10")'),true);await b.flush();
  const nextPoll=()=>[...b.timers.values()].filter(timer=>timer.delay===60000&&timer.callback.toString().includes('getSelection')).at(-1);
  const poll=nextPoll();assert.ok(poll);b.context.clock=Date.parse('2026-11-01T03:00:00Z');await poll.callback();await b.flush();
  assert.equal(b.run('brazaDayDashboard.getSelection()'),'2026-11-01');assert.equal(b.run('brazaDayDashboard.getSnapshot().net_cents'),null);
  assert.equal(b.nodes.get('businessMonthSelect').value,'2026-10');assert.equal(b.nodes.get('businessMonthExpensesValue').value,'123,45','the old-month draft cannot be discarded by the relative-day refresh');
  assert.equal(calls.filter(call=>call.path.startsWith('finance/business-month-view?')).at(-1).path,'finance/business-month-view?month=2026-10');
  b.nodes.get('businessMonthExpensesReload').onclick();const afterDiscard=nextPoll();assert.ok(afterDiscard);await afterDiscard.callback();await b.flush();
  assert.equal(b.nodes.get('businessMonthSelect').value,'2026-11');assert.equal(calls.filter(call=>call.path.startsWith('finance/business-month-view?')).at(-1).path,'finance/business-month-view?month=2026-11');
  assert.ok(calls.every(call=>call.body===undefined),'discarding a draft only resumes saved reads and must never confirm zero expenses');
 }finally{b.run('brazaDayDashboard.stop();brazaMonthDashboard.stop();');b.timers.clear();}
});
