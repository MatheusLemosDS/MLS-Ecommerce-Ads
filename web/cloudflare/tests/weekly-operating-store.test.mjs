import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {weeklyOperatingFixture} from './weekly-operating-fixture.mjs';
import {readWeeklyOperatingReport} from '../src/weekly-operating-store.mjs';
import {createWeeklyOperatingReportProtocol} from '../src/weekly-operating-report.mjs';
import {projectExternalCashPeriodSummary} from '../../finance/src/external-cash-period-frame.mjs';
import {readProductionCoverageWorkspace,mutateProductionCoverageWorkspace} from '../src/production-coverage.mjs';
import {createHash} from 'node:crypto';

test('cold weekly GET performs SELECT only, creates no schema and treats all missing sources as unknown',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());const queries=[],original=env.ADMIN_DB.prepare.bind(env.ADMIN_DB);env.ADMIN_DB.prepare=sql=>{queries.push(sql);return original(sql);};
 const report=await readWeeklyOperatingReport(env,{week_end:'2026-11-06'},undefined,{now:()=>Date.parse('2026-11-11T15:00:00Z')});
 assert.equal(report.state,'UNAVAILABLE');assert.equal(report.realized_profit_cents,null);assert.equal(report.manufacturing.total_cost_cents,null);assert.equal(report.manufacturing.recorded_quantity,null);assert.equal(report.sales_estimate.totals.estimate_cents,null);assert.equal(report.sales_estimate.totals.known_estimate_cents,null);assert.equal(report.sales_estimate.days.length,7);assert.ok(report.sales_estimate.days.every(r=>r.state==='NOT_CAPTURED'&&r.sales_cents===null));assert.deepEqual(env.ADMIN_DB.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(),[]);assert.ok(queries.every(q=>/^SELECT\b/.test(q)));
});

test('cross-month week reuses exact daily accounting and independent Friday13manufacturing, without a write/provider or second production deduction',async t=>{
 const f=await weeklyOperatingFixture();t.after(()=>f.close());const before=f.snapshot(),providers=JSON.stringify(f.calls),queries=[];f.env.ADMIN_DB.onRpc=({sql})=>queries.push(...sql.split(' | '));
 const report=await readWeeklyOperatingReport(f.env,{week_end:'2026-10-02'},f.services,{now:f.now});
 assert.deepEqual(report.calendar_period,{start_date:'2026-09-25',end_date:'2026-10-01',end_exclusive_date:'2026-10-02'});assert.equal(report.manufacturing_period.start_at,Date.parse('2026-09-25T16:00:00Z')/1000);assert.equal(report.manufacturing_period.end_at,Date.parse('2026-10-02T16:00:00Z')/1000);
 assert.equal(report.manufacturing.state,'CONFIRMED');assert.equal(report.manufacturing.recorded_quantity,6);assert.equal(report.manufacturing.total_cost_cents,8000);assert.equal(report.manufacturing.days.length,8);assert.equal(report.manufacturing.days[0].recorded_quantity,1);assert.equal(report.manufacturing.days[7].recorded_quantity,2);assert.equal(report.manufacturing.saved_report.original_cost_cents,8000);
 assert.deepEqual(report.sales_estimate.sources.map(s=>s.month),['2026-09','2026-10']);assert.equal(report.sales_estimate.state,'COMPLETE_ESTIMATE');assert.equal(report.sales_estimate.days_available,7);assert.equal(report.sales_estimate.totals.sales_cents,13050);assert.equal(report.sales_estimate.totals.payout_cents,9502);assert.equal(report.sales_estimate.totals.reference_production_cost_cents,3180);
 const d=report.sales_estimate.days.find(d=>d.date==='2026-10-01');assert.equal(d.paid_orders,1);assert.equal(d.reference_production_cost_cents,1590);assert.equal(d.estimate_cents,4751-1590-125-Math.floor(8605/31)-Math.floor(1234/31));
 const total=report.sales_estimate.totals;assert.equal(total.estimate_cents,total.payout_cents-total.reference_production_cost_cents-total.ads_spend_cents-total.allocated_tax_cents-total.allocated_expenses_cents+total.recharge_addback_cents);assert.notEqual(total.estimate_cents,total.payout_cents-total.reference_production_cost_cents-total.ads_spend_cents-total.allocated_tax_cents-total.allocated_expenses_cents+total.recharge_addback_cents-8000);
 assert.equal(report.imported_cash.state,'NO_IMPORTED_RECORDS');assert.equal(report.realized_profit_cents,null);assert.equal(f.snapshot(),before);assert.equal(JSON.stringify(f.calls),providers);assert.ok(queries.every(q=>/^SELECT\b/.test(q)));assert.ok(queries.length<=50,'actual statements: '+queries.length);assert.ok(createWeeklyOperatingReportProtocol({projectCashPeriod:projectExternalCashPeriodSummary}).projectWeeklyOperatingReport(report));assert.doesNotMatch(JSON.stringify(report),/PRIVATE|order_sn|artwork|payload_hash|source_hash|token|buyer/);
});

test('an absent month leaves its six dates null and retains the other day as a labeled partial estimate',async t=>{
 const f=await weeklyOperatingFixture({manufacturing:false});t.after(()=>f.close());f.env.ADMIN_DB.db.prepare('DELETE FROM business_month_publications WHERE month=?').run('2026-09');f.env.ADMIN_DB.db.prepare('DELETE FROM business_month_publication_frames WHERE month=?').run('2026-09');
 const result=await readWeeklyOperatingReport(f.env,{week_end:'2026-10-02'},f.services,{now:f.now});assert.equal(result.sales_estimate.days_available,1);assert.equal(result.sales_estimate.estimate_days,1);assert.equal(result.sales_estimate.state,'PARTIAL');assert.equal(result.sales_estimate.totals.sales_cents,null);assert.equal(result.sales_estimate.totals.estimate_cents,null);assert.equal(result.sales_estimate.totals.known_estimate_cents,result.sales_estimate.days[6].known_estimate_cents);assert.ok(result.sales_estimate.days.slice(0,6).every(d=>d.sales_cents===null&&d.estimate_cents===null));
});

test('weekly input rejects hidden parameters, invalid civil dates, non-Friday and later-than-current cutoff before any query',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());let reads=0;env.ADMIN_DB.prepare=()=>{reads++;throw Error('must not read');};
 for(const value of [null,{week_end:'2026-11-13',page:1},{week_end:'2026-11-12'},{week_end:'2026-02-30'},{week_end:'2026-11-20'},{week_end:'1999-12-31'}])await assert.rejects(readWeeklyOperatingReport(env,value,{}, {now:()=>Date.parse('2026-11-11T15:00:00Z')}),{message:'WEEKLY_OPERATING_REQUEST_INVALID',status:400});assert.equal(reads,0);
});

test('unknown Friday allocation keeps fabrication partial without borrowing a saved report or assigned quantity',async t=>{
 const f=await weeklyOperatingFixture();t.after(()=>f.close());f.env.ADMIN_DB.db.prepare('DELETE FROM production_weekly_assignments WHERE record_id=?').run(f.ids.first);
 const report=await readWeeklyOperatingReport(f.env,{week_end:'2026-10-02'},f.services,{now:f.now});assert.equal(report.manufacturing.state,'PARTIAL');assert.equal(report.manufacturing.boundary_pending_quantity,null);assert.equal(report.manufacturing.total_cost_cents,null);assert.equal(report.manufacturing.recorded_quantity,5);assert.equal(report.manufacturing.known_cost_cents,7000);assert.equal(report.manufacturing.saved_report.original_cost_cents,8000);assert.ok(report.manufacturing.pending.includes('MANUFACTURING_BOUNDARY_REQUIRED'));assert.equal(report.sales_estimate.state,'COMPLETE_ESTIMATE');
});

test('explicitly confirmed absence of manufacture is zero, while unconfirmed empty intervals stay unknown',async t=>{
 const f=await weeklyOperatingFixture();t.after(()=>f.close());const selection={week_end:'2026-10-16'};
 const before=await readWeeklyOperatingReport(f.env,selection,f.services,{now:f.now});assert.equal(before.manufacturing.known_cost_cents,null);assert.equal(before.manufacturing.total_cost_cents,null);assert.equal(before.manufacturing.state,'PARTIAL');
 for(let i=0;i<8;i++){const coverage=await readProductionCoverageWorkspace(f.env,selection,{now:f.now}),row=coverage.intervals[i];await mutateProductionCoverageWorkspace(f.env,{action:'confirm',week_end:selection.week_end,interval_key:row.key,source_hash:row.source_hash,revision:coverage.revision,ledger_revision:coverage.source.ledger_revision,timing_revision:coverage.source.timing_revision,request_id:crypto.randomUUID(),mode:row.recorded.quantity?'ALL_RECORDED':'NO_MANUFACTURING',reason:'Fixture confirmou explicitamente a ausência de fabricação',confirmed:true},'synthetic-owner',{now:f.now});}
 const after=await readWeeklyOperatingReport(f.env,selection,f.services,{now:f.now});assert.equal(after.manufacturing.state,'CONFIRMED');assert.equal(after.manufacturing.total_cost_cents,0);assert.equal(after.manufacturing.recorded_quantity,0);
});

test('a corrupt immutable closing report or monthly publication cannot invalidate unrelated source blocks',async t=>{
 const f=await weeklyOperatingFixture();t.after(()=>f.close());f.env.ADMIN_DB.db.prepare('UPDATE production_weekly_reports SET payload_hash=? WHERE week_end_date=?').run('0'.repeat(64),'2026-10-02');f.env.ADMIN_DB.db.prepare('UPDATE business_month_publication_frames SET payload=? WHERE month=? AND slot_index=0').run('{}','2026-09');
 const report=await readWeeklyOperatingReport(f.env,{week_end:'2026-10-02'},f.services,{now:f.now});assert.equal(report.manufacturing.total_cost_cents,8000);assert.equal(report.manufacturing.saved_report.original_version,null);assert.ok(report.manufacturing.pending.includes('MANUFACTURING_REPORT_INVALID'));assert.equal(report.sales_estimate.days_available,1);assert.ok(report.sales_estimate.pending.includes('MONTH_PUBLICATION_INVALID'));assert.equal(report.imported_cash.state,'NO_IMPORTED_RECORDS');
});

test('a concurrent cost revision fails the final fence instead of combining old and new monthly reference costs',async t=>{
 const f=await weeklyOperatingFixture();t.after(()=>f.close());let changed=false;
 f.env.ADMIN_DB.onRpc=({sql})=>{if(!changed&&sql.startsWith('SELECT CASE WHEN (SELECT revision FROM variant_bindings_state')){changed=true;f.env.ADMIN_DB.db.exec('UPDATE production_costs_state SET revision=revision+1 WHERE id=1');}};
 await assert.rejects(readWeeklyOperatingReport(f.env,{week_end:'2026-10-02'},f.services,{now:f.now}),{message:'WEEKLY_OPERATING_SOURCE_CHANGED',status:409});assert.equal(changed,true);
});

test('cash rejection is isolated and raw service error or extra cash profit never reaches the report',async t=>{
 const f=await weeklyOperatingFixture();t.after(()=>f.close());for(const services of [{cashPeriod:async()=>{throw Error('PRIVATE_TOKEN_DO_NOT_LEAK');}},{cashPeriod:async()=>({schema:'external_cash_period_summary_v1',realized_profit_cents:999})}]){const report=await readWeeklyOperatingReport(f.env,{week_end:'2026-10-02'},services,{now:f.now});assert.equal(report.imported_cash.state,'UNAVAILABLE');assert.equal(report.imported_cash.summary,null);assert.equal(report.sales_estimate.state,'COMPLETE_ESTIMATE');assert.equal(report.manufacturing.total_cost_cents,8000);assert.doesNotMatch(JSON.stringify(report),/PRIVATE|999|TOKEN/);}
});

test('cash keeps only the existing closed finite transport error and never a raw upstream message',async t=>{
 const f=await weeklyOperatingFixture({manufacturing:false});t.after(()=>f.close());const report=await readWeeklyOperatingReport(f.env,{week_end:'2026-10-02'},{cashPeriod:async()=>{throw Error('FINANCE_EXTERNAL_CASH_TIMEOUT');}},{now:f.now});assert.deepEqual(report.imported_cash.pending,['CASH_SOURCE_UNAVAILABLE','FINANCE_EXTERNAL_CASH_TIMEOUT']);assert.equal(report.sales_estimate.state,'COMPLETE_ESTIMATE');
 const unknown=await readWeeklyOperatingReport(f.env,{week_end:'2026-10-02'},{cashPeriod:async()=>{throw Error('FINANCE_EXTERNAL_CASH_PRIVATE_TOKEN');}},{now:f.now});assert.deepEqual(unknown.imported_cash.pending,['CASH_SOURCE_UNAVAILABLE']);assert.doesNotMatch(JSON.stringify(unknown),/PRIVATE_TOKEN/);
});

test('large saved catalogues stop before the50query ceiling and retain independently valid manufacturing',async t=>{
 const f=await weeklyOperatingFixture();t.after(()=>f.close());const db=f.env.ADMIN_DB.db;
 for(const month of ['2026-09','2026-10']){const row=db.prepare('SELECT payload FROM business_month_publication_frames WHERE month=? AND slot_index=0').get(month),frame=JSON.parse(row.payload),extra=Array.from({length:900},(_,i)=>({item_id:String(2000+i),model_id:'0',quantity:1}));frame.items.push(...extra);frame.daily_breakdown.days[0].items.push(...extra);delete frame.product_breakdown;db.prepare('UPDATE business_month_publication_frames SET payload=? WHERE month=? AND slot_index=0').run(JSON.stringify(frame),month);}
 const sql=[];f.env.ADMIN_DB.onRpc=event=>sql.push(...event.sql.split(' | '));const report=await readWeeklyOperatingReport(f.env,{week_end:'2026-10-02'},f.services,{now:f.now});assert.equal(report.manufacturing.total_cost_cents,8000);assert.equal(report.sales_estimate.state,'UNAVAILABLE');assert.ok(report.sales_estimate.pending.includes('QUERY_BUDGET_EXCEEDED'));assert.ok(sql.length<=50,'executedSQL='+sql.length);assert.equal(report.imported_cash.state,'NO_IMPORTED_RECORDS');
});

test('a saved report with a valid payload hash still rejects an unknown capture kind',async t=>{
 const f=await weeklyOperatingFixture();t.after(()=>f.close());const db=f.env.ADMIN_DB.db,row=db.prepare('SELECT payload FROM production_weekly_reports WHERE week_end_date=? AND version=1').get('2026-10-02'),payload=JSON.parse(row.payload);payload.capture_kind='UNKNOWN';const canonical=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):Array.isArray(v)?v.map(canonical):v;const hash=createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex');db.prepare('UPDATE production_weekly_reports SET payload=?,payload_hash=? WHERE week_end_date=? AND version=1').run(JSON.stringify(payload),hash,'2026-10-02');
 const report=await readWeeklyOperatingReport(f.env,{week_end:'2026-10-02'},f.services,{now:f.now});assert.equal(report.manufacturing.total_cost_cents,8000);assert.equal(report.manufacturing.saved_report.original_version,null);assert.ok(report.manufacturing.pending.includes('MANUFACTURING_REPORT_INVALID'));
});
