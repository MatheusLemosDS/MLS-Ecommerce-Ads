import test from 'node:test';
import assert from 'node:assert/strict';
import {businessDayBody,BUSINESS_DAY_CLIENT,projectMissionDailyTrend} from '../src/business-day-view.mjs';
import {buildHistoricalDailyBusinessSummary} from '../src/business-daily-history.mjs';
import {buildBusinessMonthView} from '../src/business-month-view-state.mjs';
import {readBusinessMonthDisplay} from '../src/business-month.mjs';
import {collectionFixture} from './business-collection-fixture.mjs';
import {ownerReportBrowser} from './owner-report-browser-fixture.mjs';
import {projectMlsMissionChart} from '../src/mls-chart-adapters.mjs';
import {businessMonthBody} from '../src/business-month-view.mjs';
import {BUSINESS_MONTH_CLIENT} from '../src/business-month-client.mjs';

async function fixture(t){
 const f=await collectionFixture({daily:true,allPaid:true,windowCounts:[2,1],paymentDelayMs:0});
 t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 let frame=await f.invoke('start');for(let i=0;frame.status==='RUNNING'&&i<20;i++){f.clock.time+=Math.max(1,frame.collection?.retry_after_seconds??0)*1000;frame=await f.invoke('step');}assert.equal(frame.status,'COMPLETE');await f.invoke('ads');
 const read=async()=>{const observed=await readBusinessMonthDisplay(f.env,{month:'2026-10'},{now:f.now});return buildBusinessMonthView(observed,{enabled:true,status:'COMPLETE',next_run_at:Math.floor(f.now()/1000)+60,last_attempt_at:Math.floor(f.now()/1000)},{now:f.now,contract:'business-month-view-v3'});};
 return {f,read,view:await read()};
}
function historical(legacy,{partial=false,unavailable=false}={}){
 if(unavailable)return buildHistoricalDailyBusinessSummary(legacy,{state:'UNAVAILABLE',reason:'AUDIT_UNAVAILABLE',days:[],day_evidence:[]});
 const days=legacy.days.map(row=>{const total=row.production_coverage.total_units,missing=partial&&row.date==='2026-10-10'?1:0,known=total-missing;return {date:row.date,total_units:total,known_units:known,pending_units:missing,known_production_cost_cents:known*1000,production_cost_cents:missing?null:known*1000};});
 return buildHistoricalDailyBusinessSummary(legacy,{state:'AVAILABLE',reason:null,days,day_evidence:days.map(row=>({date:row.date,costs_revision:1,cost_rules_revision:1,bindings_revision:1,pending:row.pending_units?['IDENTITY_OR_COST_UNPROVEN']:[]}))});
}
function browser(t,view,hist){
 const b=ownerReportBrowser('<html><body>'+businessDayBody()+'<script>'+BUSINESS_DAY_CLIENT+'</script></body></html>',{scriptIncludes:'globalThis.brazaDayDashboard='});
 b.context.serialized=JSON.stringify({view,hist});
 b.run("globalThis.location=new URL('https://owner-report.test/admin?tab=overview&date=2026-10-10');brazaDayDashboard.prepare();brazaDayDashboard.bootstrapState({phase:'READY'});");
 const apply=()=>b.run("(()=>{const {view,hist}=JSON.parse(serialized);return brazaDayDashboard.setContext(view.daily_summary,{month:view.month,monthly:view.display,scope:view.audit_scope,requireHistorical:true,historicalDailySummary:hist});})()");
 assert.equal(apply(),true);t.after(()=>{b.run('brazaDayDashboard.stop()');b.timers.clear();});return {b,apply};
}

test('normal historical daily KPI and chart retain the audited cost after a current shirt-price change',async t=>{
 const {f,view,read}=await fixture(t),hist=historical(view.daily_summary);assert.ok(hist);
 const {b,apply}=browser(t,view,hist),initial=JSON.parse(b.run('JSON.stringify(brazaDayDashboard.getSnapshot())'));
 const expected=hist.days[9].estimate_cents;assert.equal(initial.net_cents,expected);assert.notEqual(expected,view.daily_summary.days[9].estimate_cents);
 assert.match(b.nodes.get('businessDayHelp').textContent,/revisão auditada anterior ao dia/);assert.match(b.nodes.get('businessDaySources').textContent,/Custos históricos: revisão 1/);
 const costs=JSON.parse(f.env.ADMIN_DB.db.prepare('SELECT payload FROM production_costs_state').get().payload);costs.inclusive_regular_cents=2000;f.env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET revision=revision+1,payload=?').run(JSON.stringify(costs));
 const changed=await read(),sameHistory=historical(changed.daily_summary);assert.ok(sameHistory);assert.notEqual(changed.daily_summary.days[9].estimate_cents,view.daily_summary.days[9].estimate_cents,'legacy current-cost estimate remains distinct');
 b.context.serialized=JSON.stringify({view:changed,hist:sameHistory});assert.equal(apply(),true);assert.equal(b.run('brazaDayDashboard.getSnapshot().net_cents'),expected);
 assert.equal(b.run("brazaDayDashboard.getTrend().points.find(row=>row.date==='2026-10-10').net_cents"),expected);assert.equal(b.calls.length,0,'local day projection neither recollects nor writes');
});

test('partly identified historical cost cannot become a numeric profit KPI or profit chart point',async t=>{
 const {view}=await fixture(t),hist=historical(view.daily_summary,{partial:true});assert.ok(hist);assert.equal(hist.days[9].estimate_cents,null);assert.ok(Number.isSafeInteger(hist.days[9].known_estimate_cents));
 const {b}=browser(t,view,hist);assert.equal(b.nodes.get('businessDayNet').textContent,'Em apuração');assert.match(b.nodes.get('businessDayNetLabel').textContent,/custos históricos pendentes/);assert.match(b.nodes.get('businessDayWaterfall').textContent,/Saldo após custos conhecidos/);assert.equal(b.run('brazaDayDashboard.getSnapshot().net_cents'),null);
 const trend=projectMissionDailyTrend(hist,'2026-10-10'),point=trend.points.at(-1);assert.equal(point.net_cents,null);assert.equal(point.comparable,false);assert.equal(point.sales_cents,hist.days[9].sales_cents);assert.equal(projectMlsMissionChart(trend,'net').points.at(-1).value,null);
});

test('missing or forged historical context clears the prior daily profit without falling back to current costs',async t=>{
 const {view}=await fixture(t),hist=historical(view.daily_summary),{b,apply}=browser(t,view,hist);assert.ok(Number.isSafeInteger(b.run('brazaDayDashboard.getSnapshot().net_cents')));
 for(const missing of [null,{...hist,publication_revision:hist.publication_revision+1}]){b.context.serialized=JSON.stringify({view,hist:missing});assert.equal(apply(),false);assert.equal(b.run('brazaDayDashboard.getSnapshot().net_cents'),null);assert.equal(b.nodes.get('businessDayNet').textContent,'Em apuração');assert.equal(b.run('brazaDayDashboard.getTrend()'),null);}
 const unavailable=historical(view.daily_summary,{unavailable:true});b.context.serialized=JSON.stringify({view,hist:unavailable});assert.equal(apply(),true);assert.equal(b.run('brazaDayDashboard.getSnapshot().net_cents'),null);assert.match(b.nodes.get('businessDayHelp').textContent,/custos históricos.*evidência suficiente/);assert.notEqual(b.nodes.get('businessDaySales').textContent,'Não informado');assert.equal(b.run('brazaDayDashboard.getTrend().points.at(-1).net_cents'),null);
});


test('normal monthly transport keeps the monthly result but withholds daily profit when an older server rejects v6',async t=>{
 const {f,view}=await fixture(t),b=ownerReportBrowser('<html><body>'+businessDayBody()+businessMonthBody()+'<script>'+BUSINESS_MONTH_CLIENT+'</script></body></html>',{scriptIncludes:'globalThis.brazaMonthDashboard='});
 t.after(()=>{b.run('brazaDayDashboard.stop();brazaMonthDashboard.stop();');b.timers.clear();});b.context.clock=f.now();b.context.saved=JSON.stringify(view);
 b.run(`
  class FixtureDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}globalThis.Date=FixtureDate;globalThis.location=new URL('https://owner-report.test/admin?tab=overview&date=2026-10-10');globalThis.viewRequests=[];
  const legacyApi=async(path,body,options)=>{if(path==='finance/business-month-view?month=2026-10'){viewRequests.push(options?.monthlyViewContract??null);if(options?.monthlyViewContract==='business-month-view-v6'){const error=Error('BUSINESS_MONTH_VIEW_CONTRACT_UNSUPPORTED');error.status=409;error.apiCode='BUSINESS_MONTH_VIEW_CONTRACT_UNSUPPORTED';throw error;}return JSON.parse(saved);}return null;};
  brazaDayDashboard.prepare();brazaMonthDashboard.prepare();brazaDayDashboard.bootstrapState({phase:'READY'});brazaMonthDashboard.bootstrapState({phase:'READY'});globalThis.legacyApi=legacyApi;
 `);
 assert.equal(await b.run('brazaMonthDashboard.start({api:legacyApi})'),true);await b.flush();assert.deepEqual(JSON.parse(b.run('JSON.stringify(viewRequests)')),['business-month-view-v6',null]);
 assert.equal(b.run('brazaMonthDashboard.getSnapshot().month'),'2026-10');assert.ok(Number.isSafeInteger(b.run('brazaMonthDashboard.getSnapshot().balance_cents')),'older monthly reference remains available');assert.equal(b.run('brazaDayDashboard.getSnapshot().net_cents'),null);assert.equal(b.nodes.get('businessDayNet').textContent,'Em apuração');assert.equal(b.run('brazaDayDashboard.getTrend()'),null);
});
