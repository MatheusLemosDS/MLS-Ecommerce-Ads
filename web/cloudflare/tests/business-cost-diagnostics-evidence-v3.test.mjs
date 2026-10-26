import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {SCHEMA} from '../src/admin.mjs';
import {collectionFixture} from './business-collection-fixture.mjs';
import {readBusinessMonthDisplay,projectBusinessMonth} from '../src/business-month.mjs';
import {projectBusinessMonthAuditScope} from '../src/business-month-view-state.mjs';
import {readBusinessCostDiagnosticsEvidence,readBusinessCostDiagnosticsEvidenceV2,readBusinessCostDiagnosticsEvidenceV3,projectBusinessCostDiagnostics,projectBusinessCostDiagnosticsEvidenceV2,projectBusinessCostDiagnosticsEvidenceV3} from '../src/business-cost-diagnostics.mjs';
import {deriveHistoricalCostComposition,projectHistoricalCostPairDiagnostics,projectHistoricalCostPairDiagnosticsEvidence} from '../src/historical-cost-evidence.mjs';
import {projectRecordedBusinessBalance} from '../src/business-recorded-balance.mjs';
import {projectBackgroundCollectionDiagnostics} from '../src/background-collection-diagnostics.mjs';
import {mutateExpenseLedger} from '../src/expense-ledger.mjs';

const month='2026-10',clone=value=>structuredClone(value);
const v2Validators={projectDiagnostic:projectBusinessCostDiagnostics,projectHistory:value=>projectHistoricalCostPairDiagnosticsEvidence(value,{deriveComposition:deriveHistoricalCostComposition,projectLegacy:projectHistoricalCostPairDiagnostics}),projectBalance:projectRecordedBusinessBalance,projectBackground:projectBackgroundCollectionDiagnostics};
const validators={projectEvidenceV2:value=>projectBusinessCostDiagnosticsEvidenceV2(value,v2Validators),projectScope:projectBusinessMonthAuditScope};
const expected=observed=>({monthly:observed.display,audit_scope:observed.audit_scope});
const project=(value,context=null)=>projectBusinessCostDiagnosticsEvidenceV3(value,validators,context);
async function fixture(t,{complete=true,missing=false}={}){
 const f=await collectionFixture({allPaid:true,daily:true,windowCounts:[3,1],paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});await f.env.ADMIN_DB.batch(SCHEMA.map(sql=>f.env.ADMIN_DB.prepare(sql)));
 if(missing)f.env.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET payload=?').run('[]');
 let monthly=await f.invoke('start');if(complete){for(let i=0;monthly.status==='RUNNING'&&i<12;i++)monthly=await f.invoke('step');assert.equal(monthly.status,'COMPLETE');monthly=await f.invoke('ads');}
 const observe=()=>readBusinessMonthDisplay(f.env,{month},{now:f.now}),read=()=>readBusinessCostDiagnosticsEvidenceV3(f.env,{month},{now:f.now}),v2=()=>readBusinessCostDiagnosticsEvidenceV2(f.env,{month},{now:f.now}),v1=()=>readBusinessCostDiagnosticsEvidence(f.env,{month},{now:f.now});
 return {...f,observe,read,v2,v1};
}

test('v3 pins the existing diagnostic to the displayed publication and six pricing revisions without additional I/O',async t=>{
 const f=await fixture(t,{missing:true}),observed=await f.observe(),v1Before=JSON.stringify(await f.v1()),v2Before=JSON.stringify(await f.v2()),calls=clone(f.calls),financeRpc=f.financeEnv.FINANCE_DB.calls,trace=[];f.env.ADMIN_DB.onRpc=row=>trace.push({kind:row.kind,sql:row.sql});
 await f.v2();const v2Trace=clone(trace);trace.length=0;const value=await f.read();assert.deepEqual(trace,v2Trace,'both contracts use the same database snapshots and queries');f.env.ADMIN_DB.onRpc=null;
 assert.equal(value.schema,'business_cost_diagnostics_evidence_v3');assert.equal(value.display_source,'PUBLISHED');assert.deepEqual(value.audit_scope,observed.audit_scope);assert.deepEqual(value.versions,{bindings:observed.display.bindings_revision,costs:observed.display.costs_revision,cost_rules:observed.display.cost_rules_revision,classifications:observed.display.classification_revision,expenses:observed.display.expenses.revision,tax_policy:observed.display.tax.policy_revision});assert.ok(project(value,expected(observed)));
 const legacy={schema:'business_cost_diagnostics_evidence_v2',diagnostic:value.diagnostic,history:value.history,recorded_balance:value.recorded_balance,background:value.background};assert.equal(JSON.stringify(legacy),v2Before);assert.equal(JSON.stringify(await f.v1()),v1Before);assert.equal(JSON.stringify(await f.v2()),v2Before);assert.deepEqual(f.calls,calls);assert.equal(f.financeEnv.FINANCE_DB.calls,financeRpc);assert.equal(value.diagnostic.totals.realized_net_cents,null);assert.equal(value.recorded_balance.basis,'RECORDED_PAYOUT_MINUS_IDENTIFIED_COSTS_NOT_FINAL_PROFIT');assert.equal(value.background.trigger_observation,'NOT_RECORDED');
 assert.doesNotMatch(JSON.stringify(value),/PRIVATE|access_token|refresh_token|order_sn|order_hash|lease_token|lease_owner|scope_key/);assert.ok(Buffer.byteLength(JSON.stringify(value))<=262144);
});

test('an active incomplete month keeps its scope explicitly unavailable instead of guessing a publication from counters',async t=>{
 const f=await fixture(t,{complete:false}),observed=await f.observe(),value=await f.read();assert.equal(observed.display_source,'ACTIVE');assert.equal(value.display_source,'ACTIVE');assert.equal(value.audit_scope,null);assert.equal(value.diagnostic.status,'RUNNING');assert.ok(project(value,expected(observed)));
 const forged=clone(value);forged.display_source='PUBLISHED';assert.equal(project(forged),null);
 const published=await fixture(t),publishedView=await published.observe(),publishedValue=await published.read();assert.equal(project(publishedValue,expected(observed)),null);assert.equal(project(value,expected(publishedView)),null);
 const mixed=clone(value);mixed.audit_scope=publishedView.audit_scope;assert.equal(project(mixed),null);
});

test('same-date numerical totals cannot substitute for the publication and source identities',async t=>{
 const f=await fixture(t),observed=await f.observe(),value=await f.read();assert.ok(project(value,expected(observed)));
 for(const mutate of [s=>s.publication_revision++,s=>s.sources[0].source_revision++,s=>{s.sources[0].run_id='11111111-1111-4111-8111-111111111111';},s=>s.sources.reverse(),s=>{s.sources[0].end_date='2026-10-14';}]){
  const scope=clone(observed.audit_scope);mutate(scope);assert.equal(project(value,{monthly:observed.display,audit_scope:scope}),null);
 }
 for(const mutate of [v=>{v.audit_scope.end_date='2026-10-23';},v=>{v.display_source='ACTIVE';},v=>{v.audit_scope=null;},v=>{v.versions.bindings++;},v=>{v.versions.cost_rules++;},v=>{v.versions.expenses=-0;},v=>{v.versions.tax_policy='1';},v=>{v.audit_scope.sources[0].access_token='PRIVATE';}]){const bad=clone(value);mutate(bad);assert.equal(project(bad),null);}
 const detached=project(value);detached.audit_scope.sources[0].source_revision++;detached.versions.expenses++;detached.diagnostic.coverage.paid++;assert.deepEqual(value,await f.read());
});

test('repricing, tax and expense edits invalidate older diagnostic evidence even within one publication',async t=>{
 const f=await fixture(t),observed=await f.observe(),value=await f.read();
 for(const key of ['bindings_revision','costs_revision','cost_rules_revision','classification_revision']){const monthly=clone(observed.display);monthly[key]++;assert.ok(projectBusinessMonth(monthly));assert.equal(project(value,{monthly,audit_scope:observed.audit_scope}),null);}
 const expense=clone(observed.display);expense.expenses.revision++;assert.ok(projectBusinessMonth(expense));assert.equal(project(value,{monthly:expense,audit_scope:observed.audit_scope}),null);
 const tax=clone(observed.display);tax.tax.policy_revision++;assert.ok(projectBusinessMonth(tax));assert.equal(project(value,{monthly:tax,audit_scope:observed.audit_scope}),null);
 const costs=JSON.parse(f.env.ADMIN_DB.db.prepare('SELECT payload FROM production_costs_state WHERE id=1').get().payload);costs.inclusive_regular_cents+=110;f.env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET revision=revision+1,payload=? WHERE id=1').run(JSON.stringify(costs));const repriced=await f.observe(),current=await f.read();assert.deepEqual(repriced.audit_scope,observed.audit_scope);assert.equal(project(value,expected(repriced)),null);assert.equal(project(current,expected(observed)),null);assert.ok(project(current,expected(repriced)));assert.equal(current.diagnostic.totals.production_cost_cents,value.diagnostic.totals.production_cost_cents+440);
});

test('creating an expense draft invalidates a previously confirmed diagnosis without changing the retained amount or expense revision',async t=>{
 const f=await fixture(t),before=await f.observe(),value=await f.read();assert.ok(project(value,expected(before)));
 const ledger=await mutateExpenseLedger(f.env,{action:'save',month,revision:0,request_id:crypto.randomUUID(),installments:1,entry:{id:null,category:'RENT',description:'Aluguel local de teste',amount_cents:10000,competence_month:month,due_date:'2026-10-25',status:'OPEN',paid_date:null}},'fixture-owner',{now:f.now});assert.equal(ledger.mode,'DRAFT');
 const after=await f.observe(),draft=await f.read();assert.deepEqual(before.audit_scope,after.audit_scope);assert.deepEqual(before.display.expenses,after.display.expenses);assert.deepEqual(value.versions,draft.versions);assert.ok(after.display.result.pending.includes('EXTERNAL_EXPENSES_REQUIRED'));assert.equal(project(value,expected(after)),null);assert.equal(project(draft,expected(before)),null);assert.ok(project(draft,expected(after)));assert.equal(draft.recorded_balance.status,'UNAVAILABLE');assert.equal(draft.recorded_balance.amount_cents,null);assert.equal(draft.diagnostic.summary.balance_cents,null);assert.equal(draft.diagnostic.totals.realized_net_cents,null);
});

test('only financial age can change across an otherwise identical display; missing Ads remains a substantive mismatch',async t=>{
 const f=await fixture(t);f.clock.time+=899000;await f.invoke('ads');const before=await f.observe(),value=await f.read();assert.equal(before.display.result.pending.includes('FINANCIAL_SOURCE_STALE'),false);
 f.clock.time+=2000;const after=await f.observe(),current=await f.read();assert.ok(after.display.result.pending.includes('FINANCIAL_SOURCE_STALE'));assert.equal(after.display.result.pending.includes('ADS_UNAVAILABLE'),false);assert.deepEqual(before.display.source_checked_at,after.display.source_checked_at);assert.ok(project(value,expected(after)));assert.ok(project(current,expected(before)));assert.equal(value.diagnostic.pending.includes('FINANCIAL_SOURCE_STALE'),false,'matching does not rewrite the old diagnostic');
 f.clock.time+=900000;const adsStale=await f.observe();assert.ok(adsStale.display.result.pending.includes('ADS_UNAVAILABLE'));assert.equal(project(value,expected(adsStale)),null);
});

test('v3 verifies the exposed subtotal arithmetic even when its duplicated summary fields agree with each other',async t=>{
 for(const missing of [false,true]){
  const f=await fixture(t,{missing}),observed=await f.observe(),value=await f.read();assert.notEqual(value.diagnostic.summary.balance_cents,null);assert.ok(project(value,expected(observed)));
  const duplicate=clone(value);duplicate.diagnostic.summary.balance_cents++;duplicate.diagnostic.totals.summary_balance_cents++;
  assert.ok(validators.projectEvidenceV2({schema:'business_cost_diagnostics_evidence_v2',diagnostic:duplicate.diagnostic,history:duplicate.history,recorded_balance:duplicate.recorded_balance,background:duplicate.background}),'the opt-in guard does not change the legacy projector');assert.equal(project(duplicate),null);assert.equal(project(duplicate,expected(observed)),null);
  for(const mutate of [v=>{v.diagnostic.summary.before_production_cents++;},v=>{v.diagnostic.summary.costs_after_payout_cents++;},v=>{v.diagnostic.summary.known_production_cents++;},v=>{v.diagnostic.summary.state='WAITING';},v=>{v.diagnostic.summary.before_production_cents=null;},v=>{v.diagnostic.totals.net_estimate_cents=(v.diagnostic.summary.balance_cents??0)+1;}]){const bad=clone(value);mutate(bad);assert.equal(project(bad),null);}
 }
});

test('the diagnostic variant subset must belong to the displayed unpriced units even when aggregate quantities coincide',async t=>{
 const f=await fixture(t,{missing:true}),observed=await f.observe(),value=await f.read();assert.equal(value.diagnostic.products.length,4);assert.ok(project(value,expected(observed)));
 const swapped=clone(value),first=swapped.diagnostic.products[0];first.item_id='9999';for(const pair of swapped.history.pairs)if(pair.item_id==='1000')pair.item_id='9999';assert.ok(project(swapped),'a standalone diagnostic has no displayed item list');assert.equal(project(swapped,expected(observed)),null);
 const quantity=clone(value);quantity.diagnostic.products[0].variants[0].quantity++;assert.ok(project(quantity));assert.equal(project(quantity,expected(observed)),null);
 const truncated=clone(value);truncated.diagnostic.products.pop();truncated.diagnostic.truncation.products_included--;truncated.diagnostic.truncation.variants_included--;truncated.diagnostic.truncation.truncated=true;truncated.diagnostic.truncation.reason='BYTE_LIMIT';const included=new Set(truncated.diagnostic.products.flatMap(product=>product.variants.map(variant=>product.item_id+':'+variant.model_id)));truncated.history.pairs=truncated.history.pairs.filter(pair=>included.has(pair.item_id+':'+pair.model_id));truncated.history.truncation.pairs_included=truncated.history.pairs.length;truncated.history.truncation.truncated=true;assert.ok(project(truncated,expected(observed)),'bounded partial detail retains exact total counts and valid included pairs');
});

test('v3 rejects accessors and unknown metadata and its exact projector works in a browser realm with explicit dependencies',async t=>{
 const f=await fixture(t,{missing:true}),observed=await f.observe(),value=await f.read();let getters=0;
 for(const location of [v=>v,v=>v.versions,v=>v.audit_scope,v=>v.audit_scope.sources[0]]){const bad=clone(value),target=location(bad),key=Object.keys(target)[0];Object.defineProperty(target,key,{enumerable:true,get(){getters++;throw Error('PRIVATE');}});assert.equal(project(bad),null);}assert.equal(getters,0);
 const poisoned={monthly:clone(observed.display),audit_scope:observed.audit_scope};Object.defineProperty(poisoned.monthly.expenses,'revision',{enumerable:true,get(){getters++;throw Error('PRIVATE');}});assert.equal(project(value,poisoned),null);assert.equal(getters,0);
 for(const mutate of [v=>{v.versions.secret='PRIVATE';},v=>{v.actual_profit_cents=0;},v=>{v.schema='business_cost_diagnostics_evidence_v2';},v=>{v.history.month='2026-09';},v=>{v.background.month='2026-09';}]){const bad=clone(value);mutate(bad);assert.equal(project(bad),null);}
 assert.equal(projectBusinessCostDiagnosticsEvidenceV3(value,{}),null);assert.equal(projectBusinessCostDiagnosticsEvidenceV2(value,v2Validators),null);
 const functions=[projectBusinessCostDiagnostics,projectHistoricalCostPairDiagnostics,deriveHistoricalCostComposition,projectHistoricalCostPairDiagnosticsEvidence,projectRecordedBusinessBalance,projectBackgroundCollectionDiagnostics,projectBusinessMonthAuditScope,projectBusinessCostDiagnosticsEvidenceV2,projectBusinessCostDiagnosticsEvidenceV3],context=vm.createContext({serialized:JSON.stringify({value,expected:expected(observed)}),TextEncoder});
 vm.runInContext(functions.map(fn=>fn.toString()).join('\n')+String.raw`\nconst input=JSON.parse(serialized);const projectV2=value=>projectBusinessCostDiagnosticsEvidenceV2(value,{projectDiagnostic:projectBusinessCostDiagnostics,projectHistory:value=>projectHistoricalCostPairDiagnosticsEvidence(value,{deriveComposition:deriveHistoricalCostComposition,projectLegacy:projectHistoricalCostPairDiagnostics}),projectBalance:projectRecordedBusinessBalance,projectBackground:projectBackgroundCollectionDiagnostics});globalThis.output=projectBusinessCostDiagnosticsEvidenceV3(input.value,{projectEvidenceV2:projectV2,projectScope:projectBusinessMonthAuditScope},input.expected);`.replace('\\n','\n'),context);assert.deepEqual(JSON.parse(JSON.stringify(context.output)),value);
});
