import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {historicalDailyFixture} from './business-daily-history-fixture.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {projectHistoricalDailyBusinessSummary,buildHistoricalDailyBusinessSummary,readHistoricalDailyBusinessSummary} from '../src/business-daily-history.mjs';

const clone=value=>structuredClone(value),day=(value,date)=>value.days.find(row=>row.date===date);
const saved=db=>JSON.stringify(db.db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(row=>({name:row.name,sql:row.sql,rows:db.db.prepare('SELECT * FROM "'+row.name.replaceAll('"','""')+'"').all()})));

test('historical daily profit uses each audited price while the existing current-cost reference stays intact',async t=>{
 const f=await historicalDailyFixture(t),{legacy,historical}=await f.read();
 assert.equal(historical.schema,'business_daily_historical_summary_v1');assert.equal(historical.basis,'HISTORICAL_AUDITED_COSTS_PAID_CREATE_DATE');assert.equal(historical.cost_history.state,'AVAILABLE');
 assert.equal(day(legacy,'2026-10-10').production_cost_cents,2400);assert.equal(day(historical,'2026-10-10').production_cost_cents,2000);
 assert.equal(day(historical,'2026-10-10').estimate_cents,day(legacy,'2026-10-10').estimate_cents+400);
 assert.equal(day(historical,'2026-10-20').production_cost_cents,1200);assert.equal(day(historical,'2026-10-20').estimate_cents,day(legacy,'2026-10-20').estimate_cents);
 assert.equal(historical.realized_net_cents,null);assert.equal(historical.remaining_receivable_cents,null);assert.deepEqual(historical.sources,legacy.sources);assert.deepEqual(historical.allocation,legacy.allocation);assert.deepEqual(historical.source_checked_at,legacy.source_checked_at);
 assert.deepEqual(projectHistoricalDailyBusinessSummary(historical,legacy),historical);
 assert.equal(historical.cost_history.day_evidence.find(row=>row.date==='2026-10-10').costs_revision,1);
 assert.equal(historical.cost_history.day_evidence.find(row=>row.date==='2026-10-20').costs_revision,2);
 assert.doesNotMatch(JSON.stringify(historical),/order_sn|buyer|access_token|actor|sku|item_id|model_id/);
});

test('a later shirt-cost reduction changes the current reference but cannot inflate already dated historical days',async t=>{
 const f=await historicalDailyFixture(t),first=await f.read(),db=f.env.ADMIN_DB,payload=JSON.stringify({...COST_DEFAULTS,inclusive_regular_cents:900}),at='2026-10-23T12:00:00.000Z';
 db.db.prepare('INSERT INTO production_costs_audit VALUES(3,?,?)').run(payload,at);db.db.prepare('UPDATE production_costs_state SET revision=3,payload=?,updated_at=?').run(payload,at);
 const second=await f.read();assert.equal(day(second.legacy,'2026-10-10').estimate_cents,day(first.legacy,'2026-10-10').estimate_cents+600);
 for(const date of ['2026-10-10','2026-10-20'])assert.deepEqual(day(second.historical,date),day(first.historical,date));
 assert.equal(second.historical.costs_revision,3);assert.equal(day(second.historical.cost_history,'2026-10-10').production_cost_cents,2000);
});

test('an edit on the sale day remains ambiguous and never becomes a full profit or a guessed historical price',async t=>{
 const f=await historicalDailyFixture(t,{editDay:'2026-10-10'}),{legacy,historical}=await f.read(),row=day(historical,'2026-10-10');
 assert.notEqual(day(legacy,'2026-10-10').estimate_cents,null);assert.equal(row.estimate_cents,null);assert.equal(row.production_cost_cents,null);assert.equal(row.production_coverage.pending_units,2);assert.equal(row.state,'PARTIAL_COSTS');assert.ok(row.pending.includes('PRODUCTION_COST_INCOMPLETE'));
 assert.deepEqual(historical.cost_history.day_evidence.find(row=>row.date==='2026-10-10').pending,['AUDIT_DAY_AMBIGUOUS']);assert.equal(day(historical,'2026-10-20').production_cost_cents,1200);
});

test('the historical reader performs only SELECT statements and preserves all stored history and provider activity',async t=>{
 const f=await historicalDailyFixture(t),{observed,legacy}=await f.read(),before=saved(f.env.ADMIN_DB),calls=clone(f.calls),db=f.env.ADMIN_DB,prepare=db.prepare.bind(db),sql=[];
 db.prepare=text=>{assert.match(text,/^\s*SELECT\b/i);sql.push(text);return prepare(text);};
 const result=await readHistoricalDailyBusinessSummary(f.env,observed,legacy,{now:f.now});db.prepare=prepare;
 assert.equal(result.cost_history.state,'AVAILABLE');assert.equal(saved(db),before);assert.deepEqual(f.calls,calls);assert.ok(sql.length>=7);assert.ok(sql.every(text=>!text.includes('business_month_publications')&&!text.includes('business_month_runs')),'consume exact observed immutable frames, never reread latest publication');
});

test('missing audits or unavailable storage produce UNKNOWN costs and no current-price fallback',async t=>{
 const f=await historicalDailyFixture(t),{observed,legacy}=await f.read();f.env.ADMIN_DB.db.exec('DELETE FROM production_costs_audit WHERE revision=1');
 const missing=await readHistoricalDailyBusinessSummary(f.env,observed,legacy,{now:f.now}),row=day(missing,'2026-10-10');
 assert.equal(missing.cost_history.reason,'AUDIT_INVALID');assert.equal(row.estimate_cents,null);assert.equal(row.known_estimate_cents,null);assert.equal(row.known_production_cost_cents,null);assert.equal(row.production_coverage.known_units,null);assert.equal(row.sales_cents,day(legacy,'2026-10-10').sales_cents);
 const cold=await readHistoricalDailyBusinessSummary({},observed,legacy,{now:f.now});assert.equal(cold.cost_history.reason,'STORAGE_UNAVAILABLE');assert.equal(cold.state,'UNAVAILABLE');
 assert.equal(await readHistoricalDailyBusinessSummary({},observed,null,{now:f.now}),null);
});

test('cost changes or immutable source identity races fail closed without mixing two publication versions',async t=>{
 const f=await historicalDailyFixture(t),{observed,legacy}=await f.read();
 for(const mutate of [value=>value.audit_scope.publication_revision++,value=>value.audit_scope.sources[0].run_id='00000000-0000-4000-8000-000000000999',value=>value.source_frames[0].revision++,value=>value.display.costs_revision++,value=>value.display.source_checked_at.finance_latest_at++,value=>value.display.expenses.revision++,value=>value.display.tax.policy_revision++,value=>value.audit_scope.end_date='2026-10-23']){
  const changed=clone(observed);mutate(changed);const result=await readHistoricalDailyBusinessSummary(f.env,changed,legacy,{now:f.now});assert.equal(result.cost_history.reason,'SOURCE_CHANGED');assert.equal(day(result,'2026-10-10').estimate_cents,null);
 }
 f.env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET revision=3').run();const result=await readHistoricalDailyBusinessSummary(f.env,observed,legacy,{now:f.now});assert.equal(result.cost_history.reason,'SOURCE_CHANGED');
});

test('strict historical projector rejects tampered arithmetic, source, coverage, audits, and hostile object fields',async t=>{
 const f=await historicalDailyFixture(t),{legacy,historical}=await f.read();
 const changes=[v=>v.days[9].estimate_cents++,v=>v.days[9].production_cost_cents++,v=>v.publication_revision++,v=>v.sources[0].source_revision++,v=>v.costs_revision++,v=>v.cost_history.days[9].total_units++,v=>v.cost_history.days[9].known_units++,v=>v.cost_history.days[9].production_cost_cents++,v=>v.cost_history.day_evidence[9].costs_revision=999,v=>v.cost_history.day_evidence[19].costs_revision=1,v=>v.cost_history.day_evidence[9].pending=['IDENTITY_OR_COST_UNPROVEN'],v=>v.cost_history.days.reverse(),v=>v.realized_net_cents=100,v=>v.cost_history.reason='AUDIT_INVALID',v=>v.cost_history.extra=true,v=>v.days[9].pending=[]];
 for(const change of changes){const value=clone(historical);change(value);assert.equal(projectHistoricalDailyBusinessSummary(value,legacy),null);}
 let invoked=0;const getter=clone(historical);Object.defineProperty(getter.cost_history.days[9],'known_units',{enumerable:true,get(){invoked++;return 2;}});assert.equal(projectHistoricalDailyBusinessSummary(getter,legacy),null);assert.equal(invoked,0);
 const polluted=clone(historical);Object.setPrototypeOf(polluted.cost_history,{unsafe:true});assert.equal(projectHistoricalDailyBusinessSummary(polluted,legacy),null);
 const sparse=clone(historical);delete sparse.cost_history.days[9];assert.equal(projectHistoricalDailyBusinessSummary(sparse,legacy),null);
});

test('integer overflow is rejected before historical cents can enter any daily chart',async t=>{
 const f=await historicalDailyFixture(t),{legacy,historical}=await f.read(),changed=clone(historical.cost_history);
 changed.days[9].known_production_cost_cents=9000000000000000;changed.days[9].production_cost_cents=9000000000000000;changed.days[9].known_units=100000000;changed.days[9].total_units=100000000;
 // Valid bounded cents and per-unit limits can still overflow signed sums.
 const baseline=clone(legacy);baseline.days[9].production_coverage.total_units=100000000;baseline.days[9].production_coverage.known_units=100000000;baseline.days[9].payout_cents=-100000000000000;assert.equal(buildHistoricalDailyBusinessSummary(baseline,changed),null);
});

test('the frozen browser projector is self-contained and validates the same historical DTO',async t=>{
 const f=await historicalDailyFixture(t),{legacy,historical}=await f.read(),code='('+projectHistoricalDailyBusinessSummary.toString()+')(JSON.parse(value),JSON.parse(legacy))',result=vm.runInNewContext(code,{value:JSON.stringify(historical),legacy:JSON.stringify(legacy)});
 assert.deepEqual(JSON.parse(JSON.stringify(result)),historical);
});
