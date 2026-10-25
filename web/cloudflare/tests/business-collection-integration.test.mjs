import test from 'node:test';
import assert from 'node:assert/strict';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {runBusinessSync} from '../src/business-sync.mjs';
import {buildMonthlyFinancialSummary} from '../src/business-month-summary.mjs';
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

async function largeMonthFixture(t){
 const f=await fixture({allPaid:true,windowCounts:[160,134],paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 f.state.listHook=({base,offset,size,clock})=>{clock.time+=1000;const total=base===0?160:134,count=Math.min(size,total-offset),start=base===0?0:160,more=offset+count<total;return f.provider({order_list:Array.from({length:count},(_,index)=>({order_sn:f.serial(start+offset+index)})),more,next_cursor:more?String(offset+count):''});};
 f.state.detailHook=({ids,clock})=>{clock.time+=1000;return f.provider({order_list:ids.map(index=>({order_sn:f.serial(index),order_status:index<242?'COMPLETED':'CANCELLED',currency:'BRL',create_time:Date.UTC(2026,9,index<160?10:20,12)/1000,item_list:[{item_id:f.item(index%120),model_id:0,model_quantity_purchased:1}]}))});};
 f.state.paymentHook=({index,clock})=>{clock.time+=200;return f.provider({order_sn:f.serial(index),return_order_sn_list:[],order_income:{order_sn:f.serial(index),original_cost_of_goods_sold:65.25,escrow_amount:47.51,ads_escrow_top_up_fee_or_technical_support_fee:0,items:[{item_id:f.item(index%120),model_id:0,line_item_id:index+1,quantity_purchased:1}]}});};
 return f;
}

test('294 orders and 242 paid orders finish within the real freshness window on minute continuations without exceeding request budgets',async t=>{
 for(const cadence of [300,60]){
  const f=await largeMonthFixture(t);
  const started=f.now(),steps=[];let result;
  for(let tick=0;tick<5;tick++){
   // Fire on the actual cron boundary, not a minute after the previous call
   // finished. Source hooks advance the clock to include upstream latency.
   f.clock.time=started+tick*cadence*1000;f.env.ADMIN_DB.calls=0;const sourceBefore=f.calls.finance.length+f.calls.ads.length;result=await runBusinessSync(f.env,f.services,{now:f.now});steps.push(result.finance_steps);const totalRpc=f.env.ADMIN_DB.calls+f.calls.finance.length+f.calls.ads.length-sourceBefore;assert.ok(totalRpc<=50,'App D1 and private binding budget: '+JSON.stringify({cadence,tick,totalRpc}));assert.ok(result.ads_reads<=1);assert.equal(result.state.failure_count,0);assert.equal(result.state.last_error,null);
   if(result.state.summary.status==='COMPLETE')break;assert.equal(result.status,'RUNNING');assert.equal(result.state.next_run_at,started/1000+tick*cadence+60);
  }
  assert.deepEqual(steps,[4,4,4,4,1]);assert.equal(result.state.summary.progress.pages_read,15);const before={finance:f.calls.finance.length,ads:f.calls.ads.length},frame=await f.invoke('read'),summary=buildMonthlyFinancialSummary(frame),age=frame.checked_at-frame.source_checked_at.finance_oldest_at;t.diagnostic(cadence+'s cadence: oldest financial observation '+age+'s old');
  assert.equal(frame.status,'COMPLETE');assert.equal(frame.coverage.orders,294);assert.equal(frame.coverage.paid,242);assert.equal(frame.coverage.cancelled,52);assert.equal(frame.coverage.payment_covered,242);assert.equal(frame.coverage.payment_missing,0);assert.equal(frame.sales_cents,1579050);assert.equal(frame.expected_repass_cents,1149742);assert.equal(frame.production_cost_cents,384780);assert.equal(frame.invoice_tax_cents,8605);assert.equal(frame.ads.expense_cents,3000);assert.equal(summary.balance_cents,752123);assert.equal(f.calls.finance.length,before.finance);assert.equal(f.calls.ads.length,before.ads);assert.equal(new Set(f.calls.payment).size,242);assert.equal(f.calls.payment.length,242);for(const budget of f.calls.financeBudgets)assert.ok(budget.d1+budget.fetches<=50,JSON.stringify(budget));
  if(cadence===300){assert.ok(age>900);assert.ok(frame.result.pending.includes('FINANCIAL_SOURCE_STALE'));assert.equal(frame.result.net_estimate_cents,null);assert.equal(summary.state,'PROVISIONAL');assert.equal(result.status,'PARTIAL');assert.equal(result.state.last_success_at,null);assert.equal(result.state.next_run_at,Math.max(Math.floor(f.now()/1000),started/1000+4*cadence+60));}
  else{assert.ok(age<=900);assert.deepEqual(frame.result.pending,[]);assert.equal(frame.result.net_estimate_cents,752123);assert.equal(summary.state,'READY');assert.equal(result.status,'COMPLETE');assert.equal(result.state.last_success_at,Math.floor(f.now()/1000));assert.equal(result.state.next_run_at,Math.floor(f.now()/1000)+300);}
 }
});

for(const migration of ['legacy-running','cached-historical'])test('minute collection replaces one stale '+migration+' cohort without renewing its original observation times',async t=>{
 const f=await largeMonthFixture(t),initial=f.now();let oldest;
 if(migration==='legacy-running'){
  // An already running cohort survives deployment. Finishing it must not
  // relabel its first orders with the new scheduler's current timestamp.
  for(const tick of [0,1,2]){f.clock.time=initial+tick*300000;const result=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(result.status,'RUNNING');oldest=result.state.summary.source_checked_at.finance_oldest_at;}
 }else{
  // A closed historical window may legally be reused near its 900s cache
  // limit, while the current window still needs several new source pages.
  let prior=await f.services.getFinanceBusinessPeriod(f.env,{operation:'start',start_date:'2026-10-01',end_date:'2026-10-15'});while(prior.status==='RUNNING')prior=await f.services.getFinanceBusinessPeriod(f.env,{operation:'step',run_id:prior.run_id});assert.equal(prior.pages_read,8);oldest=prior.source_checked_at.oldest_at;
 }
 const origin=initial+(migration==='legacy-running'?1080000:850000);let stale=null,fresh=null;
 for(let tick=0;tick<10;tick++){
  f.clock.time=origin+tick*60000;f.env.ADMIN_DB.calls=0;const sourceBefore=f.calls.finance.length+f.calls.ads.length,result=await runBusinessSync(f.env,f.services,{now:f.now}),summary=result.state.summary;assert.ok(f.env.ADMIN_DB.calls+f.calls.finance.length+f.calls.ads.length-sourceBefore<=50);assert.equal(result.state.failure_count,0);assert.equal(result.state.last_error,null);
  if(summary.status==='COMPLETE'&&summary.pending.includes('FINANCIAL_SOURCE_STALE')){assert.equal(stale,null,'the complete stale cohort is replaced once rather than repeated forever');stale=summary;assert.equal(summary.source_checked_at.finance_oldest_at,oldest);assert.equal(summary.net_estimate_cents,null);assert.equal(result.status,'PARTIAL');assert.equal(result.state.last_success_at,null);assert.equal(summary.coverage.orders,294);assert.equal(summary.coverage.payment_covered,242);assert.equal(result.state.next_run_at,Math.floor(origin/1000)+tick*60+60);const frame=await f.invoke('read');assert.equal(buildMonthlyFinancialSummary(frame).state,'PROVISIONAL');assert.equal(buildMonthlyFinancialSummary(frame).balance_cents,752123);}
  else if(summary.status==='COMPLETE'){fresh=result;break;}
 }
 assert.ok(stale,'the old source timestamps remain observable until a real refresh');assert.ok(fresh,'a later minute tick finishes a genuinely new cohort');assert.equal(fresh.status,'COMPLETE');assert.equal(fresh.state.summary.coverage.orders,294);assert.equal(fresh.state.summary.coverage.paid,242);assert.equal(fresh.state.summary.coverage.cancelled,52);assert.equal(fresh.state.summary.net_estimate_cents,752123);assert.ok(fresh.state.summary.source_checked_at.finance_oldest_at>oldest);assert.ok(fresh.state.summary.checked_at-fresh.state.summary.source_checked_at.finance_oldest_at<=900);assert.equal(f.calls.payment.length,484,'each full cohort is read once without multiplying its quantities');assert.equal(new Set(f.calls.payment).size,242);const frame=await f.invoke('read');assert.equal(frame.production_cost_cents,384780);assert.equal(frame.sales_cents,1579050);assert.equal(frame.result.net_estimate_cents,752123);assert.deepEqual(frame.result.pending,[]);for(const budget of f.calls.financeBudgets)assert.ok(budget.d1+budget.fetches<=50,JSON.stringify(budget));
});

test('an interactive Finance page and cron can race without extending a short lease conflict into five-minute backoff',async t=>{
 const f=await fixture({paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});await f.invoke('start');let enter,release;const entered=new Promise(resolve=>{enter=resolve;}),blocked=new Promise(resolve=>{release=resolve;});f.state.paymentHook=async({index})=>{if(index===2){enter();await blocked;}};
 const interactive=f.invoke('step');await entered;f.env.ADMIN_DB.calls=0;const sourceBefore=f.calls.finance.length+f.calls.ads.length,first=await runBusinessSync(f.env,f.services,{now:f.now});assert.ok(f.env.ADMIN_DB.calls+f.calls.finance.length+f.calls.ads.length-sourceBefore<=50);assert.equal(first.status,'RUNNING');assert.equal(first.finance_steps,1);assert.equal(first.ads_reads,1);assert.equal(first.state.summary.collection.code,'BUSINESS_PERIOD_CONFLICT');assert.equal(first.state.summary.progress.pages_read,0);assert.equal(first.state.failure_count,0);assert.equal(first.state.last_error,null);assert.equal(first.state.next_run_at,Math.floor(f.now()/1000)+60);release();await interactive;
 assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) n FROM finance_business_period_orders').get().n,20);f.clock.time+=60000;const resumed=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(resumed.status,'RUNNING');assert.equal(resumed.finance_steps,4);assert.equal(resumed.state.summary.progress.pages_read,4);assert.equal(resumed.state.summary.coverage.orders,80);assert.equal(resumed.state.summary.collection.state,'READY');assert.equal(new Set(f.calls.payment).size,f.calls.payment.length,'the committed interactive page is not paid/read twice');assert.equal(resumed.state.summary.net_estimate_cents,null);for(const budget of f.calls.financeBudgets)assert.ok(budget.d1+budget.fetches<=50,JSON.stringify(budget));
});

test('a real Finance deadline checkpoint retains paid-page progress and resumes in one minute without duplicate payment reads',async t=>{
 const f=await fixture({allPaid:true,paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});const started=f.now();let advance=true;f.state.paymentHook=({clock})=>{if(advance){advance=false;clock.time+=18000;}};const first=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(first.status,'RUNNING');assert.equal(first.finance_steps,2);assert.equal(first.state.summary.collection.code,'BUSINESS_PERIOD_CHECKPOINT');assert.equal(first.state.summary.progress.pages_read,0);assert.equal(first.state.next_run_at,started/1000+60);assert.equal(first.state.failure_count,0);assert.equal(first.state.last_error,null);assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) n FROM finance_business_period_payment_cache').get().n,4);assert.equal(f.calls.payment.length,4);
 let result;for(const tick of [1,2]){f.clock.time=started+tick*60000;f.env.ADMIN_DB.calls=0;const before=f.calls.finance.length+f.calls.ads.length;result=await runBusinessSync(f.env,f.services,{now:f.now});assert.ok(f.env.ADMIN_DB.calls+f.calls.finance.length+f.calls.ads.length-before<=50);assert.equal(result.state.failure_count,0);}assert.equal(result.status,'COMPLETE');assert.equal(result.state.summary.coverage.orders,120);assert.equal(result.state.summary.coverage.payment_covered,120);assert.equal(f.calls.payment.length,120);assert.equal(new Set(f.calls.payment).size,120);assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) n FROM finance_business_period_orders').get().n,120);assert.equal(f.financeEnv.FINANCE_DB.db.prepare('SELECT COUNT(*) n FROM finance_business_period_payment_cache').get().n,0);assert.ok(result.state.summary.checked_at-result.state.summary.source_checked_at.finance_oldest_at<=900);for(const budget of f.calls.financeBudgets)assert.ok(budget.d1+budget.fetches<=50,JSON.stringify(budget));
});

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
 const result=await scheduledWork(f.env,f.services,f.now),privateReads=f.calls.finance.length+f.calls.ads.length;t.diagnostic('cold migrated Worker App D1 RPC='+meter.calls+', private service reads='+privateReads);assert.ok(meter.calls+privateReads<=50,'the first collection in a new Worker exceeded the combined 50-RPC budget');assert.equal(result.collection,'RUNNING');assert.equal(f.calls.finance.length,4);assert.equal(f.calls.ads.length,1);verifyConfirmedCorrections(f);
});
