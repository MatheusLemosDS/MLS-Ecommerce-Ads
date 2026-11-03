import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {projectProductionDailyFinance,PRODUCTION_DAILY_FINANCE_CSS,productionDailyFinanceBody,PRODUCTION_DAILY_FINANCE_CLIENT} from '../src/production-daily-finance-view.mjs';
import {buildIncurredProductionAnalytics} from '../src/incurred-production-analytics.mjs';
import {dailyProductionFixture} from './production-daily-browser-fixture.mjs';
import {ownerReportBrowser} from './owner-report-browser-fixture.mjs';

const selection={month:'2026-10',selected_date:'2026-10-10'};
async function fixture(t){const f=await dailyProductionFixture();t.after(()=>f.close());return f;}
function closedZeroCosts(source){
 const value=structuredClone(source);
 // A synthetic declared calendar with explicit zero Ads/DAS/expenses is a
 // separate unit case. Payouts and production references stay exactly intact.
 value.allocation={...value.allocation,monthly_das_cents:0,monthly_expenses_cents:0,allocated_das_cents:0,allocated_expenses_cents:0,remaining_das_cents:0,remaining_expenses_cents:0};
 for(const row of value.days){row.ads_spend_cents=0;row.allocated_das_cents=0;row.allocated_expenses_cents=0;if(row.operating_balance_cents!==null)row.operating_balance_cents=row.payout_cents+row.recharge_addback_cents-row.production_cost_cents;if(row.known_estimate_cents!==null)row.known_estimate_cents=row.payout_cents+row.recharge_addback_cents-row.known_production_cost_cents;if(row.estimate_cents!==null)row.estimate_cents=row.operating_balance_cents;}
 return value;
}

test('the full saved month preserves canonical estimates and sales cost instead of deducting manufacture a second time',async t=>{
 const f=await fixture(t),before=f.financialSnapshot,source=f.financialView.daily_summary,result=projectProductionDailyFinance(source,selection),manufacture=await f.read({month:'2026-10',week_of:'2026-10-10'});
 assert.ok(result);assert.equal(result.days.length,24);assert.equal(result.days.at(-1).date,'2026-10-24','selection must not truncate the monthly graph');
 assert.equal(result.selected_day.estimate_cents,9041);assert.equal(result.selected_day.reference_production_cost_cents,4770);
 const ledger=buildIncurredProductionAnalytics(manufacture.ledger,selection);assert.equal(ledger.selected_day.summary.total_cost_cents,3750);assert.notEqual(result.selected_day.estimate_cents,9041-3750);
 assert.equal(result.manufacturing_cost_subtracted,false);assert.equal(result.actual_profit_cents,null);assert.ok(Object.isFrozen(result.days[0]));assert.equal(JSON.stringify(f.financialView),before);
 for(let index=0;index<source.days.length;index++)assert.equal(result.days[index].estimate_cents,source.days[index].estimate_cents);
});

test('pending, partial, returned, reviewed and unknown-cost days cannot win the month; negative winners stay negative',async t=>{
 const f=await fixture(t),source=f.financialView.daily_summary,base=projectProductionDailyFinance(source,selection);
 assert.equal(base.selected_day.state,'PARTIAL');assert.ok(base.selected_day.pending.includes('ADJUSTMENTS_PENDING'));assert.equal(base.best_day.amount_cents,-441);assert.deepEqual(base.best_day.dates,['2026-10-01']);
 const unknown=structuredClone(source);for(const row of unknown.days){row.day_partial=true;}const none=projectProductionDailyFinance(unknown,selection);assert.ok(none);assert.deepEqual(none.best_day,{state:'NO_COMPARABLE_DAYS',amount_cents:null,dates:[]});
 for(const code of ['RETURNS_NOT_RECONCILED','STATUS_REVIEW_REQUIRED','ADJUSTMENTS_PENDING','ADJUSTMENT_CONFLICT','FINANCIAL_SOURCE_STALE','ADS_SOURCE_STALE','PAYMENT_INCOMPLETE','PRODUCTION_COST_INCOMPLETE','TAX_POLICY_REQUIRED','EXTERNAL_EXPENSES_REQUIRED']){
  const changed=structuredClone(source);changed.days[0].pending=[code];const projected=projectProductionDailyFinance(changed,selection);assert.ok(projected,code);assert.equal(projected.days[0].state,'PARTIAL',code);assert.ok(!projected.best_day.dates.includes('2026-10-01'),code);
 }
});

test('explicit zero estimates retain every tied completed day and source gaps remain null',async t=>{
 const f=await fixture(t),source=closedZeroCosts(f.financialView.daily_summary),zero=projectProductionDailyFinance(source,selection);
 assert.ok(zero);assert.equal(zero.best_day.amount_cents,0);assert.ok(zero.best_day.dates.length>14);assert.ok(zero.best_day.dates.includes('2026-10-23'));
 const after=projectProductionDailyFinance(source,{month:'2026-10',selected_date:'2026-10-25'});assert.ok(after);assert.equal(after.selected_day,null);assert.equal(after.days.length,24);
 assert.equal(projectProductionDailyFinance(source,{month:'2026-09',selected_date:'2026-09-10'}),null);assert.equal(projectProductionDailyFinance(source,{month:'2026-10',selected_date:'2026-10-32'}),null);
 const noValue=structuredClone(source);noValue.days[0].estimate_cents=null;noValue.days[0].state='UNAVAILABLE';const gap=projectProductionDailyFinance(noValue,selection);assert.ok(gap);assert.equal(gap.days[0].estimate_cents,null);assert.equal(gap.days[0].state,'UNAVAILABLE');
});

test('the isolated projector rejects altered arithmetic, wrong scopes, unknown fields, unsafe numbers and getters',async t=>{
 const f=await fixture(t),source=f.financialView.daily_summary;
 for(const mutate of [value=>value.days[9].estimate_cents++,value=>value.days.reverse(),value=>value.days.pop(),value=>value.days[0].extra=true,value=>value.costs_revision=0,value=>value.days[0].estimate_cents=Number.MAX_SAFE_INTEGER+1,value=>value.realized_net_cents=0,value=>value.days[0].pending=['MADE_UP']]){const bad=structuredClone(source);mutate(bad);assert.equal(projectProductionDailyFinance(bad,selection),null);}
 let reads=0;const getter=structuredClone(source);Object.defineProperty(getter.days[0],'estimate_cents',{enumerable:true,get(){reads++;return 0;}});assert.equal(projectProductionDailyFinance(getter,selection),null);assert.equal(reads,0);
 const chosen={month:'2026-10'};Object.defineProperty(chosen,'selected_date',{enumerable:true,get(){reads++;return '2026-10-10';}});assert.equal(projectProductionDailyFinance(source,chosen),null);assert.equal(reads,0);
 const detached=vm.runInNewContext('('+projectProductionDailyFinance.toString()+')(JSON.parse(raw),JSON.parse(selected))',{raw:JSON.stringify(source),selected:JSON.stringify(selection),Intl,Date});assert.deepEqual(JSON.parse(JSON.stringify(detached)),JSON.parse(JSON.stringify(projectProductionDailyFinance(source,selection))));
});

function mount(finance,manufacture){
 const bootstrap='globalThis.qaListeners={};document.addEventListener=(name,callback)=>{qaListeners[name]=callback;};';
 const b=ownerReportBrowser(productionDailyFinanceBody()+'<script>'+bootstrap+PRODUCTION_DAILY_FINANCE_CLIENT+'</script>',{scriptIncludes:'globalThis.brazaProductionDailyFinance='});
 b.context.financialRaw=JSON.stringify(finance);b.context.manufactureRaw=JSON.stringify(manufacture);
 b.run(`globalThis.finance=JSON.parse(financialRaw);globalThis.manufacture=JSON.parse(manufactureRaw);globalThis.financeDate=finance?.selected_date??'';globalThis.financialSelections=[];globalThis.manufactureSelections=[];globalThis.brazaDayDashboard={getMonthAnalytics:()=>finance,getSelection:()=>financeDate,selectDate:async value=>{financialSelections.push(value);financeDate=value;return true;}};globalThis.brazaIncurredProduction={getAnalyticsSnapshot:()=>manufacture,selectAnalyticsDate:value=>{manufactureSelections.push(value);manufacture.selected_day.date=value;manufacture.month=value.slice(0,7);qaListeners['mls-production-analytics-change']({detail:{month:manufacture.month,selected_date:value}});return true;}};brazaProductionDailyFinance.refresh();`);
 return b;
}

test('the companion shows source estimates, full-month day controls and a guarded single selection with no transport',async t=>{
 const f=await fixture(t),financial=projectProductionDailyFinance(f.financialView.daily_summary,selection),b=mount(financial,{schema:'incurred_production_analytics_v1',month:selection.month,selected_day:{date:selection.selected_date}});
 assert.match(b.nodes.get('productionDailyFinanceSelected').textContent,/90,41/);assert.match(b.nodes.get('productionDailyFinanceSelected').textContent,/47,70/);assert.doesNotMatch(b.nodes.get('productionDailyFinanceSelected').textContent,/52,91/);
 assert.match(b.nodes.get('productionDailyFinanceBest').textContent,/-R\$\s*4,41/);assert.equal(b.nodes.get('productionDailyFinanceBest').dataset.negative,'true');assert.match(b.nodes.get('productionDailyFinanceBest').textContent,/entre perdas/);
 const buttons=b.nodes.get('productionDailyFinanceGraph').querySelectorAll('[data-production-finance-date]');assert.equal(buttons.length,24);assert.equal(buttons[19].dataset.productionFinanceDate,'2026-10-20');assert.equal(buttons[19].onclick(),true);await b.flush();
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(manufactureSelections)')),['2026-10-20']);assert.deepEqual(JSON.parse(b.run('JSON.stringify(financialSelections)')),['2026-10-20']);
 assert.equal(b.nodes.get('productionDailyFinanceGraph').children.length,0,'old date cannot survive a pending scope alignment');assert.equal(b.run('brazaProductionDailyFinance.getSnapshot()'),null);assert.equal(b.calls.length,0);assert.equal(b.timers.size,0);
 b.run(`qaListeners['mls-production-analytics-change']({detail:{month:'2026-10',selected_date:'2026-10-20'}});qaListeners['mls-production-analytics-ready']({detail:{month:'2026-10',selected_date:'2026-10-20'}});`);await b.flush();assert.equal(b.run('financialSelections.length'),1,'ready and repeated selected-date events must not request another financial selection');
});

test('month changes, missing daily evidence and malformed projected data clear stale values and links',async t=>{
 const f=await fixture(t),financial=projectProductionDailyFinance(f.financialView.daily_summary,selection),b=mount(financial,{schema:'incurred_production_analytics_v1',month:selection.month,selected_day:{date:selection.selected_date}});
 b.run(`manufacture={schema:'incurred_production_analytics_v1',month:'2026-09',selected_day:{date:'2026-09-20'}};finance=null;brazaProductionDailyFinance.refresh();`);
 assert.equal(b.nodes.get('productionDailyFinanceGraph').children.length,0);assert.doesNotMatch(b.nodes.get('productionDailyFinanceSelected').textContent,/90,41/);assert.equal(b.nodes.get('productionDailyFinanceBest').dataset.negative,'false');assert.match(b.nodes.get('productionDailyFinanceOpen').href,/month=2026-09&date=2026-09-20/);
 b.run(`manufacture={schema:'incurred_production_analytics_v1',month:'2026-10',selected_day:{date:'2026-10-10'}};finance=JSON.parse(financialRaw);finance.best_day.amount_cents=999999;brazaProductionDailyFinance.refresh();`);assert.equal(b.run('brazaProductionDailyFinance.getSnapshot()'),null);
 b.run(`finance=JSON.parse(financialRaw);globalThis.getterReads=0;Object.defineProperty(finance.selected_day,'estimate_cents',{get(){getterReads++;return 0;}});brazaProductionDailyFinance.refresh();`);assert.equal(b.run('getterReads'),0);assert.equal(b.run('brazaProductionDailyFinance.getSnapshot()'),null);
 assert.equal(b.calls.length,0);
});

test('source cutoff remains visible for a manufactured date without daily financial coverage',async t=>{
 const f=await fixture(t),financial=projectProductionDailyFinance(f.financialView.daily_summary,{month:'2026-10',selected_date:'2026-10-25'}),b=mount(financial,{schema:'incurred_production_analytics_v1',month:'2026-10',selected_day:{date:'2026-10-25'}});
 assert.match(b.nodes.get('productionDailyFinanceSelected').textContent,/Pendente/);assert.match(b.nodes.get('productionDailyFinanceSelected').textContent,/24\/10/);assert.equal(b.nodes.get('productionDailyFinanceGraph').querySelectorAll('[data-production-finance-date]').length,24);
 assert.equal(b.run('brazaProductionDailyFinance.getSnapshot().selected_day'),null);assert.equal(b.calls.length,0);
});

test('the view keeps financial and manufacture basis explicit and uses existing read-only controls',()=>{
 const body=productionDailyFinanceBody();assert.match(body,/fabricação registrado acima não é descontado novamente/);assert.match(body,/parcelas diárias/);assert.match(body,/recebimento no banco/);assert.match(body,/agent-finance#businessDay/);assert.match(PRODUCTION_DAILY_FINANCE_CSS,/min-width:44px/);assert.match(PRODUCTION_DAILY_FINANCE_CSS,/overflow-x:auto/);assert.match(PRODUCTION_DAILY_FINANCE_CSS,/max-width:570px/);assert.doesNotMatch(PRODUCTION_DAILY_FINANCE_CLIENT,/\bfetch\s*\(|\bapi\s*\(|setTimeout\s*\(|setInterval\s*\(|innerHTML\s*=/);
});
