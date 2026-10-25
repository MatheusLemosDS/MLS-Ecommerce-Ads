import test from 'node:test';
import assert from 'node:assert/strict';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {runBusinessSync} from '../src/business-sync.mjs';
import {adminFetch,scheduledWork} from '../src/admin.mjs';
import {collectionFixture as fixture} from './business-collection-fixture.mjs';

async function initializeOwnerState(f){
 const origin='https://cold-production-setup.test';Object.assign(f.env,{ADMIN_SESSION_SECRET:'cold-migration-fixture-session-'+'s'.repeat(32),ADMIN_USERNAME:'migration-owner',ADMIN_PASSWORD:'migration-fixture-password-123456'});
 const login=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:f.env.ADMIN_USERNAME,password:f.env.ADMIN_PASSWORD})}),f.env,{});assert.equal(login.status,303);
 const cookie=login.headers.get('set-cookie').split(';')[0],response=await adminFetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),f.env,{});assert.equal(response.status,200);
}
function verifyConfirmedCorrections(f){
 const records=f.env.ADMIN_DB.db.prepare('SELECT correction_id,status FROM operator_cost_corrections ORDER BY correction_id').all();assert.equal(records.length,3);assert.equal(records.filter(row=>row.status==='APPLIED').length,2);assert.equal(records.filter(row=>row.status==='SKIPPED').length,1);
 const current=f.env.ADMIN_DB.db.prepare('SELECT revision,payload FROM production_costs_state WHERE id=1').get(),values=JSON.parse(current.payload),prior=JSON.parse(f.immutable.costs[0].payload);
 const {composition_recipes,composition_assignments,...unmodified}=values;assert.deepEqual(unmodified,prior,'the confirmed composition does not change adult prices, components or unrelated operator fields');assert.equal(current.revision,f.immutable.costs[0].revision+1);
 assert.deepEqual(composition_recipes,[{id:'adult-triple-pmg-confirmed',label:'Combo de 3 camisetas adultas P/M/G',components:['P','M','G'].map(size=>({kind:'ADULT_GARMENT',size,quantity:1}))}]);assert.deepEqual(composition_assignments,[{item_id:'58271140523',model_id:'149796059126',recipe_id:'adult-triple-pmg-confirmed'}]);
 assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_state').all(),f.immutable.bindings);assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT * FROM business_month_expenses').all(),f.immutable.expenses);
}

function verifyMonth(frame,{returns=false}={}){
 assert.ok(projectBusinessMonth(frame));assert.equal(frame.status,'COMPLETE');assert.equal(frame.progress.pages_read,6);assert.equal(frame.progress.order_capacity,120);
 assert.deepEqual(frame.coverage,{orders:120,paid:96,completed:48,ongoing:48,cancelled:12,cancel_pending:0,unpaid:12,other:0,unknown:0,payment_covered:96,payment_missing:0,returns:returns?1:0,returns_unknown:0});
 assert.equal(frame.sales_cents,626400);assert.equal(frame.expected_repass_cents,456096);assert.equal(frame.production_cost_cents,152640);assert.equal(frame.invoice_tax_cents,8605);assert.equal(frame.expenses.external_expenses_cents,1234);assert.equal(frame.ads.expense_cents,3000);
 assert.equal(frame.ads.totals.broad.calculated_roas_raw,'10.000000');assert.equal(frame.result.net_estimate_cents,returns?null:290617);assert.equal(frame.result.net_profit_cents,null);
 assert.deepEqual(frame.result.pending,returns?['RETURNS_NOT_RECONCILED']:[]);
}

test('120 real collector orders finish across two cron ticks with exact costs, monthly DAS, spend and cancellation exclusions',async()=>{
 const f=await fixture(),first=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(first.status,'RUNNING');assert.equal(first.finance_steps,4);assert.equal(first.state.summary.coverage.orders,60);assert.equal(first.state.summary.coverage.cancelled,6);assert.equal(first.ads_reads,1);assert.equal(first.state.summary.source_checked_at.ads_at,f.clock.time/1000);assert.equal(first.state.failure_count,0);
 assert.equal(f.calls.list.length,3);assert.equal(f.calls.payment.length,48);f.clock.time+=300000;
 const second=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(second.status,'COMPLETE');assert.equal(second.finance_steps,4);assert.equal(second.ads_reads,1);assert.equal(second.state.failure_count,0);
 const frame=await f.invoke('read');verifyMonth(frame);
 assert.equal(f.calls.list.length,6);assert.equal(f.calls.payment.length,96);assert.equal(new Set(f.calls.payment).size,96);assert.ok(f.state.maxActive>=1&&f.state.maxActive<=4);
 const persisted=f.financeEnv.FINANCE_DB.db.prepare('SELECT order_hash FROM finance_business_period_orders').all();assert.equal(persisted.length,120);assert.equal(new Set(persisted.map(row=>row.order_hash)).size,120);
 assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT * FROM business_month_expenses').all(),f.immutable.expenses);assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_state').all(),f.immutable.bindings);assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT * FROM production_costs_state').all(),f.immutable.costs);
 for(const budget of f.calls.financeBudgets)assert.ok(budget.d1+budget.fetches<=50,JSON.stringify(budget));
 assert.ok(!JSON.stringify(frame).includes('PRIVATE_INTEGRATION'));
});

test('a failed 20-order page resumes its cursor atomically without double-counting and a known return still blocks profit',async()=>{
 const f=await fixture({returns:true});f.state.failIndex=22;
 const first=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(first.status,'ERROR');assert.equal(first.state.summary.coverage.orders,20);assert.equal(first.state.summary.coverage.payment_covered,16);assert.equal(first.state.summary.collection.state,'RETRY_WAIT');assert.equal(first.state.summary.collection.code,'BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE');assert.ok(first.state.summary.pending.includes('SOURCE_UNAVAILABLE'));assert.equal(first.state.summary.net_estimate_cents,null);
 assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) AS n FROM finance_business_period_orders').get().n,20);
 f.state.failIndex=null;f.clock.time+=300000;const second=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(second.status,'RUNNING');assert.equal(second.state.failure_count,0);
 f.clock.time+=300000;const third=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(third.status,'COMPLETE');assert.equal(third.ads_reads,1);
 const frame=await f.invoke('read');verifyMonth(frame,{returns:true});assert.equal(frame.coverage.returns,1);assert.equal(frame.known_sales_cents,626400);assert.equal(frame.known_production_cost_cents,152640);
 const offsets=f.calls.list.filter(row=>row.base===0).map(row=>row.offset);assert.equal(offsets[0],0);assert.ok(offsets.slice(1,-1).every(offset=>offset===20));assert.equal(offsets.at(-1),40);assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) AS n FROM finance_business_period_orders').get().n,120);
});

test('scheduled App financial collection stays within 50 D1 RPC per tick for 120 products, excluding separate catalogue and DTF collectors',async t=>{
 const f=await fixture();await initializeOwnerState(f);verifyConfirmedCorrections(f);
 const maintenance=await scheduledWork(f.env,f.services,f.now);assert.equal(maintenance.lane,'MAINTENANCE');assert.equal(maintenance.collection,'MAINTENANCE');assert.equal(f.calls.finance.length,0);assert.equal(f.calls.ads.length,0);
 for(let tick=0;tick<2;tick++){
  f.env.ADMIN_DB.calls=0;const financeBefore=f.calls.finance.length,adsBefore=f.calls.ads.length;
  const result=await scheduledWork(f.env,f.services,f.now),privateReads=f.calls.finance.length-financeBefore+f.calls.ads.length-adsBefore;
  t.diagnostic('tick '+tick+': App D1 RPC='+f.env.ADMIN_DB.calls+', private service reads='+privateReads+', collection='+result.collection);
  assert.equal(result.lane,'FINANCE');assert.ok(f.env.ADMIN_DB.calls+privateReads<=50,'App D1 and private binding RPC limit exceeded: '+JSON.stringify({d1:f.env.ADMIN_DB.calls,privateReads}));
  assert.ok(['RUNNING','COMPLETE'].includes(result.collection));f.clock.time+=300000;
 }
});


test('cold owner initialization and confirmed-cost migration stay bounded and perform no upstream collection',async t=>{
 const f=await fixture();f.env.ADMIN_DB.calls=0;await initializeOwnerState(f);const coldCalls=f.env.ADMIN_DB.calls;t.diagnostic('cold migration App D1 RPC='+coldCalls);assert.ok(coldCalls<=50,'cold local migration exceeded its separate 50-RPC request budget');verifyConfirmedCorrections(f);assert.equal(f.calls.finance.length,0);assert.equal(f.calls.ads.length,0);assert.equal(f.calls.list.length,0);assert.equal(f.calls.payment.length,0);
 const correctionRecords=f.env.ADMIN_DB.db.prepare('SELECT * FROM operator_cost_corrections ORDER BY correction_id').all(),audit=f.env.ADMIN_DB.db.prepare('SELECT * FROM production_costs_audit ORDER BY revision').all();f.env.ADMIN_DB.calls=0;await initializeOwnerState(f);assert.ok(f.env.ADMIN_DB.calls<coldCalls,'a repeated owner read must reuse initialized state');assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT * FROM operator_cost_corrections ORDER BY correction_id').all(),correctionRecords);assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT * FROM production_costs_audit ORDER BY revision').all(),audit);verifyConfirmedCorrections(f);
});

test('a cold Worker over an already migrated production database keeps collection and Ads inside the same request budget',async t=>{
 const f=await fixture();await initializeOwnerState(f);verifyConfirmedCorrections(f);const meter=f.env.ADMIN_DB;
 // New binding identity resets every module's per-isolate setup cache, while
 // retaining the actual durable database and the corrections already applied.
 f.env.ADMIN_DB={db:meter.db,prepare:meter.prepare.bind(meter),batch:meter.batch.bind(meter)};meter.calls=0;
 const result=await scheduledWork(f.env,f.services,f.now);t.diagnostic('cold migrated Worker App D1 RPC='+meter.calls);assert.ok(meter.calls<=50,'the first collection in a new Worker exceeded the 50-RPC budget');assert.equal(result.collection,'RUNNING');assert.equal(f.calls.finance.length,4);assert.equal(f.calls.ads.length,1);verifyConfirmedCorrections(f);
});
