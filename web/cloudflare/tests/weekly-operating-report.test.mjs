import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeeklyOperatingReportProtocol,weeklyOperatingPeriod} from '../src/weekly-operating-report.mjs';
import {createExternalCashPeriodProtocol} from '../../finance/src/external-cash-period-frame.mjs';
import {productionWeeklyPeriod} from '../src/production-weekly-close.mjs';
import {readWeeklyOperatingReport} from '../src/weekly-operating-store.mjs';
import {weeklyOperatingFixture} from './weekly-operating-fixture.mjs';

const cash=createExternalCashPeriodProtocol(),protocol=createWeeklyOperatingReportProtocol({projectCashPeriod:cash.projectExternalCashPeriodSummary});
test('the cutoff includes the prior Friday13 and excludes this Friday13, with civil sales dates ending Thursday',()=>{
 for(const end of ['2026-10-02','2026-01-02','2018-11-09','2019-02-22']){const source=productionWeeklyPeriod(end),actual=weeklyOperatingPeriod(end,Date.parse('2026-11-11T15:00:00Z')/1000);assert.deepEqual(actual.manufacturing_period,{start_at:source.start_at,end_at:source.end_at});assert.equal(actual.calendar_period.start_date,source.start_date);assert.equal(actual.calendar_period.end_exclusive_date,end);}
 assert.equal(protocol.nextWeekEnd(Date.parse('2026-11-13T15:59:59Z')/1000),'2026-11-13');assert.equal(protocol.nextWeekEnd(Date.parse('2026-11-13T16:00:00Z')/1000),'2026-11-20');
 assert.deepEqual(protocol.projectWeeklyOperatingSelection({week_end:'2026-11-13'},Date.parse('2026-11-11T15:00:00Z')/1000),{week_end:'2026-11-13'});assert.equal(protocol.projectWeeklyOperatingSelection({week_end:'2026-11-20'},Date.parse('2026-11-11T15:00:00Z')/1000),null);
});

test('self-contained browser factory accepts the server DTO and rejects altered periods, arithmetic, real-profit or coverage claims',async t=>{
 const f=await weeklyOperatingFixture();t.after(()=>f.close());const report=await readWeeklyOperatingReport(f.env,{week_end:'2026-10-02'},f.services,{now:f.now}),browserCash=Function('return ('+createExternalCashPeriodProtocol.toString()+')()')(),browser=Function('projectCashPeriod','return ('+createWeeklyOperatingReportProtocol.toString()+')({projectCashPeriod})')(browserCash.projectExternalCashPeriodSummary);
 assert.deepEqual(browser.projectWeeklyOperatingReport(report),report);
 const cases=[v=>v.realized_profit_cents=1,v=>v.manufacturing_period.start_at++,v=>v.calendar_period.end_date='2026-10-02',v=>v.sales_estimate.totals.estimate_cents++,v=>{v.sales_estimate.days[0].estimate_cents++;v.sales_estimate.days[0].known_estimate_cents++;v.sales_estimate.totals.estimate_cents++;v.sales_estimate.totals.known_estimate_cents++;},v=>v.manufacturing.known_cost_cents++,v=>v.manufacturing.saved_report.original_version=null,v=>v.manufacturing.total_cost_cents=-0,v=>v.sales_estimate.ads_timezone='CONFIRMED',v=>v.imported_cash.summary.realized_profit_cents=500,v=>v.sales_estimate.sources[0].source_checked_at.ads_at=v.checked_at+61,v=>v.sales_estimate.days[0].extra=1,v=>delete v.manufacturing.days[0],v=>v.sales_estimate.sources.push(v.sales_estimate.sources[0])];
 for(const mutate of cases){const value=structuredClone(report);mutate(value);assert.equal(browser.projectWeeklyOperatingReport(value),null,String(mutate));}
 let getters=0;const value=structuredClone(report);Object.defineProperty(value.sales_estimate.days[0],'payout_cents',{enumerable:true,get(){getters++;return 100;}});assert.equal(browser.projectWeeklyOperatingReport(value),null);assert.equal(getters,0);
});

test('partial current calendar day cannot become a strict weekly total, while its known estimate remains visible',async t=>{
 const f=await weeklyOperatingFixture({manufacturing:false});t.after(()=>f.close());const report=await readWeeklyOperatingReport(f.env,{week_end:'2026-10-02'},f.services,{now:f.now});
 report.sales_estimate.days[6].day_partial=true;report.sales_estimate.state='PARTIAL';for(const key of Object.keys(report.sales_estimate.totals))if(key!=='known_estimate_cents')report.sales_estimate.totals[key]=null;
 assert.ok(protocol.projectWeeklyOperatingReport(report));assert.equal(report.sales_estimate.totals.estimate_cents,null);assert.notEqual(report.sales_estimate.totals.known_estimate_cents,null);
 const invalid=structuredClone(report);invalid.sales_estimate.totals.estimate_cents=report.sales_estimate.totals.known_estimate_cents;assert.equal(protocol.projectWeeklyOperatingReport(invalid),null);
});

test('individually safe daily amounts cannot overflow a weekly sum and still claim a complete estimate',async t=>{
 const f=await weeklyOperatingFixture({manufacturing:false});t.after(()=>f.close());const report=await readWeeklyOperatingReport(f.env,{week_end:'2026-10-02'},f.services,{now:f.now});
 for(const d of report.sales_estimate.days){d.sales_cents=Number.MAX_SAFE_INTEGER;d.payout_cents=Number.MAX_SAFE_INTEGER;d.reference_production_cost_cents=0;d.known_reference_production_cost_cents=0;d.ads_spend_cents=0;d.recharge_addback_cents=0;d.allocated_tax_cents=0;d.allocated_expenses_cents=0;d.estimate_cents=Number.MAX_SAFE_INTEGER;d.known_estimate_cents=Number.MAX_SAFE_INTEGER;}
 Object.assign(report.sales_estimate.totals,{sales_cents:null,payout_cents:null,reference_production_cost_cents:0,ads_spend_cents:0,recharge_addback_cents:0,allocated_tax_cents:0,allocated_expenses_cents:0,estimate_cents:null,known_estimate_cents:null});report.sales_estimate.state='PARTIAL';report.sales_estimate.pending.push('ARITHMETIC_UNSAFE');assert.ok(protocol.projectWeeklyOperatingReport(report));const invalid=structuredClone(report);invalid.sales_estimate.state='COMPLETE_ESTIMATE';assert.equal(protocol.projectWeeklyOperatingReport(invalid),null);
});
