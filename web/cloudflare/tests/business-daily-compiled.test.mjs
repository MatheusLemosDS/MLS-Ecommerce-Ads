import test from 'node:test';
import assert from 'node:assert/strict';
import {compiledOwnerReportPage,ownerReportBrowser} from './owner-report-browser-fixture.mjs';
import {collectionFixture} from './business-collection-fixture.mjs';
import {SCHEMA} from '../src/admin.mjs';
import {readBusinessMonthDisplay,projectBusinessMonth} from '../src/business-month.mjs';
import {readBusinessSyncState} from '../src/business-sync.mjs';
import {buildBusinessMonthView,projectBusinessMonthView,projectBusinessMonthAuditScope} from '../src/business-month-view-state.mjs';
import {projectDailyBusinessSummary} from '../src/business-daily-summary.mjs';

const providerCounts=f=>({finance:f.calls.finance.length,ads:f.calls.ads.length,list:f.calls.list.length,detail:f.calls.detail.length,payment:f.calls.payment.length});

for(const minify of [false,true])test(`the deployed monthly script renders the exact v3 daily estimate and keeps local date selection passive (minify=${minify})`,async t=>{
 const f=await collectionFixture({daily:true,allPaid:true,windowCounts:[2,1],paymentDelayMs:0});
 t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 await f.env.ADMIN_DB.batch(SCHEMA.map(sql=>f.env.ADMIN_DB.prepare(sql)));
 let frame=await f.invoke('start');
 for(let attempt=0;frame.status==='RUNNING'&&attempt<20;attempt++){
  f.clock.time+=Math.max(1,frame.collection?.retry_after_seconds??0)*1000;
  frame=await f.invoke('step');
 }
 assert.equal(frame.status,'COMPLETE');await f.invoke('ads');
 const display=await readBusinessMonthDisplay(f.env,{month:'2026-10'},{now:f.now}),sync=await readBusinessSyncState(f.env);
 const view=buildBusinessMonthView(display,sync,{now:f.now,contract:'business-month-view-v3'});
 assert.ok(projectBusinessMonthView(view,projectBusinessMonth,projectBusinessMonthAuditScope,projectDailyBusinessSummary));
 assert.equal(view.schema,'business_month_view_v3');assert.equal(view.display_source,'PUBLISHED');assert.ok(view.daily_summary);
 const selected=view.daily_summary.days.find(row=>row.date==='2026-10-20');
 assert.deepEqual([selected.payout_cents,selected.production_cost_cents,selected.ads_spend_cents,selected.allocated_das_cents,selected.allocated_expenses_cents],[4751,1590,125,277,40]);
 assert.equal(selected.estimate_cents,2719);assert.equal(selected.coverage.paid,1);

 // This helper bundles dist/app-worker.mjs with the requested ESBuild mode,
 // authenticates only against an in-memory fixture and extracts its real HTML.
 // Execute the entire emitted monthly script, including day, expense and audit
 // clients. No source module supplies browser functions to this VM.
 const {html}=await compiledOwnerReportPage(minify),b=ownerReportBrowser(html,{scriptIncludes:'globalThis.brazaMonthDashboard='});
 const calls=[],before=providerCounts(f),allowedReads=new Set(['finance/business-month-view?month=2026-10','finance/reconciliation?month=2026-10&evidence=refunds-v1','finance/escrow-releases?month=2026-10','finance/expense-ledger?month=2026-10']);
 b.context.clock=f.clock.time;
 b.context.readSaved=async(path,body)=>{
  calls.push({path,body});
  if(path==='finance/business-month-view?month=2026-10')return JSON.stringify(view);
  // Auxiliary panels are deliberately unavailable in this thin browser
  // fixture. Their optional responses must not gate the valid daily result.
  return 'null';
 };
 try{
  b.run(`
   class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}globalThis.Date=ClockDate;
   globalThis.location=new URL('https://owner-report.test/admin?tab=overview&date=2026-10-20');
   const api=async(path,body)=>JSON.parse(await readSaved(path,body));
   brazaDayDashboard.prepare();brazaMonthDashboard.prepare();brazaDayDashboard.bootstrapState({phase:'READY'});brazaMonthDashboard.bootstrapState({phase:'READY'});
  `);
  assert.equal(await b.run('brazaMonthDashboard.start({api})'),true);await b.flush();
  assert.equal(b.run('brazaDayDashboard.getSelection()'),'2026-10-20');assert.equal(b.nodes.get('businessMonthSelect').value,'2026-10');
  assert.equal(b.nodes.get('businessDayNet').textContent,'R$\u00a027,19');assert.equal(b.nodes.get('businessDayPaid').textContent,'1');
  assert.match(b.nodes.get('businessDayNetLabel').textContent,/repasse base informado/);assert.match(b.nodes.get('businessDayWaterfall').textContent,/Parcela diária do DAS/);
  assert.match(b.nodes.get('businessDayAllocation').textContent,/31 dias.*conta mensal desconta o valor completo/);
  assert.match(b.nodes.get('businessDayPending').textContent,/data informada pela Shopee.*fuso ainda não foi confirmado/);
  assert.equal(calls.filter(call=>call.path==='finance/business-month-view?month=2026-10').length,1);
  const initialCalls=calls.length,originalSources=b.nodes.get('businessDaySources').textContent;
  for(const [action,date] of [[()=>b.nodes.get('businessDayToday').onclick(),'2026-10-24'],[()=>b.nodes.get('businessDayYesterday').onclick(),'2026-10-23'],[()=>{b.nodes.get('businessDayDate').value='2026-10-10';return b.nodes.get('businessDayDate').onchange();},'2026-10-10']]){
   assert.equal(await action(),true);await b.flush();assert.equal(b.run('brazaDayDashboard.getSelection()'),date);
   const expected=view.daily_summary.days.find(row=>row.date===date);assert.ok(expected);
   assert.equal(b.nodes.get('businessDayNet').textContent,new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(expected.estimate_cents/100));
   assert.equal(calls.length,initialCalls,'Today, Yesterday and Date cannot issue another monthly or provider read');
  }
  b.nodes.get('businessDayDate').value='2026-10-20';await b.nodes.get('businessDayDate').onchange();assert.equal(b.nodes.get('businessDayNet').textContent,'R$\u00a027,19');assert.equal(b.nodes.get('businessDaySources').textContent,originalSources);

  for(const [button,target] of [['OpenCalculation','businessMonthCalculationDetails'],['OpenProducts','businessMonthProductsDetails'],['OpenRefunds','businessReconciliationDetails'],['OpenReleases','businessEscrowReleasesDetails'],['OpenExpenses','businessMonthExpensesDetails']]){
   assert.equal(b.nodes.get(target).open,false);assert.equal(typeof b.nodes.get('businessMonth'+button).onclick,'function');
   await b.nodes.get('businessMonth'+button).onclick();assert.equal(b.nodes.get(target).open,true,button+' must reveal its independent section');
  }
  await b.flush();assert.equal(calls.filter(call=>call.path==='finance/business-month-view?month=2026-10').length,1);assert.deepEqual(providerCounts(f),before);
  assert.deepEqual(new Set(calls.map(call=>call.path)),allowedReads,'each real auxiliary client remains connected to its existing passive endpoint');
  for(const call of calls){assert.ok(allowedReads.has(call.path),call.path);assert.equal(call.body,undefined,'opening the panels cannot request a source collection or mutation');}
  assert.equal(b.nodes.get('businessDayNet').textContent,'R$\u00a027,19','opening secondary details cannot replace the selected daily estimate');
 }finally{b.run('brazaDayDashboard.stop();brazaMonthDashboard.stop();');b.timers.clear();}
});
