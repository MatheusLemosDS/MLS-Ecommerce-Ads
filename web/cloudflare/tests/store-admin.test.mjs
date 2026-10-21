import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {adminFetch} from '../src/admin.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {StoreSummaryError} from '../src/store-summary.mjs';
import {STORE_ADJUSTMENTS_SCHEMA,validateStoreAdjustmentBody,saveStoreAdjustments,storePeriodBundle} from '../src/store-admin.mjs';

const origin='https://app.example.test';
const run='11111111-1111-4111-8111-111111111111';
const otherRun='22222222-2222-4222-8222-222222222222';
const values=changes=>({ads_spend_cents:100,external_expenses_cents:200,recharge_treatment:'UNCONFIRMED',...changes});
const body=(revision=0,changes={})=>({run_id:run,revision,values:values(),...changes});
const garment=(size='P')=>({item_id:'201',model_id:'0',size,selling_unit:'SINGLE_GARMENT',operator_confirmed:true});
const frame=changes=>({schema:'finance_store_period_v1',run_id:run,revision:3,status:'COMPLETE',start_date:'2026-10-13',end_date:'2026-10-20',cutoff_at:1792510000,checked_at:1792510100,currency:'BRL',monetary_unit:'UNCONFIRMED',order_count:1,pages_read:1,duplicate_orders:0,returns_orders:0,escrow_amount_raw:'50',ads_recharge_or_support_raw:'0',items:[{item_id:'201',model_id:'0',quantity:2}],diagnostic:null,...changes});
const fail=(code,status)=>error=>error instanceof StoreSummaryError&&error.message===code&&(status===undefined||error.status===status);
const snapshot=env=>({state:env.ADMIN_DB.db.prepare('SELECT * FROM store_period_adjustments ORDER BY run_id').all(),audit:env.ADMIN_DB.db.prepare('SELECT * FROM store_period_adjustments_audit ORDER BY run_id,revision').all()});
async function database(){
 const env={ADMIN_DB:new D1()};await env.ADMIN_DB.batch(STORE_ADJUSTMENTS_SCHEMA.map(sql=>env.ADMIN_DB.prepare(sql)));
 env.ADMIN_DB.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT); CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT); CREATE TABLE hermes_jobs(id TEXT); CREATE TABLE admin_settings(revision INTEGER); INSERT INTO admin_settings VALUES(12)');
 const time='2026-10-20T12:00:00.000Z';
 env.ADMIN_DB.db.prepare('INSERT INTO variant_bindings_state VALUES(1,5,?,?)').run(JSON.stringify([garment()]),time);
 env.ADMIN_DB.db.prepare('INSERT INTO production_costs_state VALUES(1,7,?,?)').run(JSON.stringify({...COST_DEFAULTS,components:[]}),time);
 return env;
}
async function login(){
 const env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'fixture-store-session-secret-1234567890',ADMIN_USERNAME:'fixture-store-admin',ADMIN_PASSWORD:'fixture-store-admin-password-1234567890'};
 const response=await adminFetch(new Request(origin+'/admin/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(response.status,303);
 const cookie=response.headers.get('set-cookie').split(';')[0],state=await(await adminFetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();
 await adminFetch(new Request(origin+'/api/admin/variant-bindings',{method:'POST',headers:{origin,cookie,'content-type':'application/json','x-csrf-token':state.csrf},body:JSON.stringify({revision:1,bindings:[garment()]})}),env);
 return {env,cookie,csrf:state.csrf};
}
function request(auth,path,bodyValue,options={}){
 const method=options.method||'POST';return new Request(origin+path,{method,headers:{cookie:options.cookie??auth.cookie,origin:options.origin??origin,'x-csrf-token':options.csrf??auth.csrf,'content-type':'application/json'},body:['GET','HEAD'].includes(method)?undefined:options.raw??JSON.stringify(bodyValue)});
}

test('adjustments have strict run identity, revision zero initialization and declared cent values',()=>{
 const actual=validateStoreAdjustmentBody(body());assert.deepEqual(actual,body());actual.values.ads_spend_cents=999;assert.equal(body().values.ads_spend_cents,100);
 for(const bad of [null,[],{},body(-1),body(0.5),body('0'),body(2147483647),body(0,{run_id:'wrong'}),body(0,{run_id:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'}),{...body(),extra:true},body(0,{values:{}}),body(0,{values:values({external_expenses_cents:-1})})])assert.throws(()=>validateStoreAdjustmentBody(bad),fail('STORE_ADJUSTMENTS_INVALID',400));
});

test('initial insert and subsequent CAS writes create exactly matching audits scoped to their run',async()=>{
 const env=await database(),beforeBindings=env.ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_state').all(),beforeCosts=env.ADMIN_DB.db.prepare('SELECT * FROM production_costs_state').all();
 await saveStoreAdjustments(env,body(),'admin');let state=snapshot(env);assert.equal(state.state.length,1);assert.equal(state.state[0].revision,1);assert.equal(state.audit.length,1);assert.deepEqual(JSON.parse(state.audit[0].payload),values());assert.equal(state.audit[0].actor,'admin');
 await saveStoreAdjustments(env,body(1,{values:values({ads_spend_cents:0})}),'admin');
 await saveStoreAdjustments(env,body(0,{run_id:otherRun,values:values({external_expenses_cents:0})}),'admin');
 state=snapshot(env);assert.deepEqual(state.state.map(row=>[row.run_id,row.revision]),[[run,2],[otherRun,1]]);assert.equal(state.audit.length,3);for(const row of state.state){const audit=state.audit.find(entry=>entry.run_id===row.run_id&&entry.revision===row.revision);assert.equal(audit.payload,row.payload);assert.equal(audit.created_at,row.updated_at);}
 assert.deepEqual(env.ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_state').all(),beforeBindings);assert.deepEqual(env.ADMIN_DB.db.prepare('SELECT * FROM production_costs_state').all(),beforeCosts);assert.equal(env.ADMIN_DB.db.prepare('SELECT revision FROM admin_settings').get().revision,12);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM hermes_jobs').get().n,0);
});

test('duplicate initialization, stale update and invalid bodies never overwrite or append an audit',async()=>{
 const env=await database();await saveStoreAdjustments(env,body(),'admin');const before=snapshot(env);
 await assert.rejects(saveStoreAdjustments(env,body(),'admin'),fail('STORE_ADJUSTMENTS_CHANGED_RELOAD',409));
 await assert.rejects(saveStoreAdjustments(env,body(3),'admin'),fail('STORE_ADJUSTMENTS_CHANGED_RELOAD',409));
 await assert.rejects(saveStoreAdjustments(env,body(1,{values:values({ads_spend_cents:1.5})}),'admin'),fail('STORE_ADJUSTMENTS_INVALID',400));assert.deepEqual(snapshot(env),before);
});

test('conflicting first or future audit rolls back both adjustment state and audit changes',async()=>{
 for(const initial of [false,true]){
  const env=await database();if(initial)await saveStoreAdjustments(env,body(),'admin');
  const target=initial?2:1;env.ADMIN_DB.db.prepare('INSERT INTO store_period_adjustments_audit VALUES(?,?,?,?,?)').run(run,target,JSON.stringify(values()),'existing-audit','2026-10-20T12:00:00.000Z');const before=snapshot(env);
  await assert.rejects(saveStoreAdjustments(env,body(initial?1:0),'admin'));assert.deepEqual(snapshot(env),before);
 }
});

test('concurrent declarations at one expected revision have one winner and one matching audit',async()=>{
 const env=await database();await saveStoreAdjustments(env,body(),'admin');let pending=Promise.resolve();const batch=env.ADMIN_DB.batch.bind(env.ADMIN_DB);env.ADMIN_DB.batch=statements=>{const next=pending.then(()=>batch(statements));pending=next.catch(()=>{});return next;};
 const result=await Promise.allSettled([saveStoreAdjustments(env,body(1,{values:values({ads_spend_cents:111})}),'first'),saveStoreAdjustments(env,body(1,{values:values({ads_spend_cents:222})}),'second')]);assert.equal(result.filter(value=>value.status==='fulfilled').length,1);assert.equal(result.find(value=>value.status==='rejected').reason.status,409);
 const saved=snapshot(env);assert.equal(saved.state[0].revision,2);assert.equal(saved.audit.length,2);assert.equal(saved.audit[1].payload,saved.state[0].payload);
});

test('bundle reads all saved revisions in one batch and absent expense declaration stays explicitly unknown',async()=>{
 const env=await database(),calls=[],actual=env.ADMIN_DB.batch.bind(env.ADMIN_DB);env.ADMIN_DB.batch=statements=>{calls.push(statements.length);return actual(statements);};
 const actualFrame=frame(),before=structuredClone(actualFrame),bundle=await storePeriodBundle(env,actualFrame);assert.deepEqual(calls,[4]);assert.deepEqual(bundle.finance,actualFrame);assert.deepEqual(actualFrame,before);
 assert.deepEqual(bundle.adjustments,{revision:0,values:null,updated_at:null});assert.equal(bundle.result.bindings_revision,5);assert.equal(bundle.result.costs_revision,7);assert.equal(bundle.result.expected_repass_cents,5000);assert.equal(bundle.result.production_cost_cents,3180);assert.equal(bundle.result.net_estimate_cents,null);assert.ok(bundle.result.pending.includes('ADJUSTMENTS_REQUIRED'));
 await saveStoreAdjustments(env,body(0,{values:values({ads_spend_cents:0,external_expenses_cents:0})}),'admin');const declared=await storePeriodBundle(env,actualFrame);assert.equal(declared.adjustments.revision,1);assert.equal(declared.result.net_estimate_cents,1820);assert.equal(declared.result.net_profit_cents,null);
 assert.equal(bundle.returns_result,null);assert.equal(declared.returns_result,null);
});

test('return coverage keeps known occurrences visible beside unknown orders without permitting a net or refund claim',async()=>{
 const env=await database(),calls=[],batch=env.ADMIN_DB.batch.bind(env.ADMIN_DB);
 await saveStoreAdjustments(env,body(0,{values:values({ads_spend_cents:0,external_expenses_cents:0})}),'admin');
 env.ADMIN_DB.batch=statements=>{calls.push(statements.length);return batch(statements);};
 const value=frame({order_count:3,returns_orders:null,escrow_amount_raw:'150',items:[{item_id:'201',model_id:'0',quantity:3}],
  returns_breakdown:{schema:'store_returns_breakdown_v1',with_return:{order_count:1,payout_raw:'50'},
   without_reported_return:{order_count:1,payout_raw:'60'},unknown:{order_count:1,payout_raw:'40'},
   products:[{item_id:'201',order_count:3,with_return_orders:1,without_reported_return_orders:1,unknown_orders:1}]}});
 const before=snapshot(env),bundle=await storePeriodBundle(env,value);
 assert.deepEqual(calls,[4]);assert.equal(bundle.finance.returns_orders,null);
 assert.equal(bundle.returns_result.with_return.order_count,1);assert.equal(bundle.returns_result.unknown.order_count,1);
 assert.equal(bundle.returns_result.with_return.expected_repass_cents,5000);
 assert.equal(bundle.returns_result.without_reported_return.expected_repass_cents,6000);
 assert.equal(bundle.returns_result.unknown.expected_repass_cents,4000);
 assert.equal(bundle.returns_result.refund_amount_cents,null);assert.equal(bundle.returns_result.net_profit_cents,null);
 assert.equal(bundle.result.net_estimate_cents,null);assert.ok(bundle.result.pending.includes('RETURNS_NOT_RECONCILED'));
 assert.deepEqual(snapshot(env),before);
});

test('invalid return coverage cannot pass the bundle or write adjustment state',async()=>{
 const env=await database(),before=snapshot(env);
 const bad=frame({returns_breakdown:{schema:'store_returns_breakdown_v1',with_return:{order_count:1,payout_raw:'50'},
  without_reported_return:{order_count:0,payout_raw:'0'},unknown:{order_count:0,payout_raw:'0'},
  products:[{item_id:'201',order_count:1,with_return_orders:1,without_reported_return_orders:0,unknown_orders:0}]}});
 await assert.rejects(storePeriodBundle(env,bad),fail('STORE_PERIOD_UNAVAILABLE',503));
 assert.deepEqual(snapshot(env),before);
});

test('product tax and after-tax balances use the same saved revisions without changing the global result or declarations',async()=>{
 const env=await database(),calls=[],batch=env.ADMIN_DB.batch.bind(env.ADMIN_DB),before=snapshot(env);
 env.ADMIN_DB.batch=statements=>{calls.push(statements.length);return batch(statements);};
 const value=frame({product_breakdown:{schema:'store_product_breakdown_v1',exclusive_order_count:1,mixed_order_count:0,
  exclusive_payout_raw:'50',mixed_payout_raw:'0',products:[{item_id:'201',order_count:1,exclusive_order_count:1,mixed_order_count:0,exclusive_payout_raw:'50',returns_orders:0}]},
  invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:0,known_base_raw:'100',known_tax_raw:'2'},
  product_invoice_tax:{schema:'store_product_invoice_tax_v1',exclusive_covered_orders:1,mixed_covered_orders:0,known_exclusive_tax_raw:'2',known_mixed_tax_raw:'0',products:[{item_id:'201',exclusive_covered_orders:1,known_exclusive_tax_raw:'2'}]}});
 const bundle=await storePeriodBundle(env,value),product=bundle.product_result.products[0];
 assert.deepEqual(calls,[4]);assert.equal(product.invoice_tax_cents,200);
 assert.equal(product.expected_after_production_and_tax_cents,1620);
 assert.equal(bundle.result.invoice_tax.tax_cents,200);assert.equal(bundle.result.expected_after_tax_cents,1620);
 assert.equal(bundle.result.net_estimate_cents,null);assert.equal(product.net_profit_cents,null);
 assert.equal(bundle.product_result.bindings_revision,5);assert.equal(bundle.product_result.costs_revision,7);
 assert.deepEqual(snapshot(env),before);
});

test('a product with full tax coverage stays usable when another product keeps the global tax pending',async()=>{
 const env=await database(),before=snapshot(env);
 const value=frame({order_count:2,escrow_amount_raw:'100',items:[{item_id:'201',model_id:'0',quantity:2},{item_id:'202',model_id:'0',quantity:1}],
  product_breakdown:{schema:'store_product_breakdown_v1',exclusive_order_count:2,mixed_order_count:0,exclusive_payout_raw:'100',mixed_payout_raw:'0',
   products:['201','202'].map(item_id=>({item_id,order_count:1,exclusive_order_count:1,mixed_order_count:0,exclusive_payout_raw:'50',returns_orders:0}))},
  invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:1,known_base_raw:'100',known_tax_raw:'2'},
  product_invoice_tax:{schema:'store_product_invoice_tax_v1',exclusive_covered_orders:1,mixed_covered_orders:0,known_exclusive_tax_raw:'2',known_mixed_tax_raw:'0',
   products:[{item_id:'201',exclusive_covered_orders:1,known_exclusive_tax_raw:'2'},{item_id:'202',exclusive_covered_orders:0,known_exclusive_tax_raw:'0'}]}});
 const bundle=await storePeriodBundle(env,value),[complete,pending]=bundle.product_result.products;
 assert.equal(complete.invoice_tax_cents,200);assert.equal(complete.expected_after_production_and_tax_cents,1620);
 assert.equal(pending.invoice_tax_cents,null);assert.equal(pending.expected_after_production_and_tax_cents,null);
 assert.equal(bundle.result.invoice_tax.tax_cents,null);assert.equal(bundle.result.net_estimate_cents,null);
 assert.deepEqual(snapshot(env),before);
});

test('coherent bundle keeps captured configuration even if saved data changes just after the context batch',async()=>{
 const env=await database();await saveStoreAdjustments(env,body(),'admin');const original=env.ADMIN_DB.batch.bind(env.ADMIN_DB);let changed=false;
 env.ADMIN_DB.batch=async statements=>{const result=await original(statements);if(statements.length===4&&!changed){changed=true;env.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET revision=6,payload=?').run(JSON.stringify([garment('G1')]));env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET revision=8,payload=?').run(JSON.stringify({...COST_DEFAULTS,inclusive_regular_cents:2000,components:[]}));env.ADMIN_DB.db.prepare('UPDATE store_period_adjustments SET revision=2,payload=?').run(JSON.stringify(values({ads_spend_cents:1000})));}return result;};
 const captured=await storePeriodBundle(env,frame());assert.equal(captured.result.bindings_revision,5);assert.equal(captured.result.costs_revision,7);assert.equal(captured.adjustments.revision,1);assert.equal(captured.result.production_cost_cents,3180);assert.equal(captured.result.net_estimate_cents,1520);
 assert.equal(env.ADMIN_DB.db.prepare('SELECT revision FROM variant_bindings_state').get().revision,6);assert.equal(env.ADMIN_DB.db.prepare('SELECT revision FROM production_costs_state').get().revision,8);
});

test('missing or corrupt binding, production-cost and adjustment state is rejected rather than reset to defaults',async()=>{
 for(const [table,sql,args] of [
  ['bindings','DELETE FROM variant_bindings_state',[]],['costs','DELETE FROM production_costs_state',[]],
  ['bindings','UPDATE variant_bindings_state SET payload=?',['PRIVATE_INVALID_JSON']],['bindings','UPDATE variant_bindings_state SET revision=0',[]],['bindings','UPDATE variant_bindings_state SET revision=2147483648',[]],
  ['costs','UPDATE production_costs_state SET payload=?',[JSON.stringify({...COST_DEFAULTS,inclusive_regular_cents:-1})]],['costs','UPDATE production_costs_state SET revision=0',[]],['costs','UPDATE production_costs_state SET revision=2147483648',[]],
  ['adjustments','UPDATE store_period_adjustments SET payload=?',['PRIVATE_INVALID_JSON']],['adjustments','UPDATE store_period_adjustments SET revision=0',[]],['adjustments','UPDATE store_period_adjustments SET revision=2147483648',[]],['adjustments','UPDATE store_period_adjustments SET updated_at=?',['PRIVATE_BAD_DATE']],
 ]){
  const env=await database();await saveStoreAdjustments(env,body(),'admin');env.ADMIN_DB.db.prepare(sql).run(...args);const before=snapshot(env);await assert.rejects(storePeriodBundle(env,frame()),fail('STORE_SUMMARY_COST_INVALID',503),table);assert.deepEqual(snapshot(env),before);
 }
});

test('corrupt saved binding or production-cost timestamp cannot produce a financial summary',async()=>{
 for(const table of ['variant_bindings_state','production_costs_state']){
  const env=await database();env.ADMIN_DB.db.prepare('UPDATE '+table+' SET updated_at=?').run('PRIVATE_BAD_DATE');await assert.rejects(storePeriodBundle(env,frame()),fail('STORE_SUMMARY_COST_INVALID',503));
 }
});

test('store routes require admin, Origin, CSRF, POST, bounded valid selection and no query before Finance calls',async()=>{
 const auth=await login();let reads=0;const services={getFinanceStorePeriod:async()=>{reads++;return frame();}},selection={operation:'read',run_id:run};
 for(const [options,status] of [[{cookie:''},401],[{cookie:'mls_session=review'},401],[{origin:'https://other.invalid'},403],[{csrf:''},403],[{method:'GET'},405]])assert.equal((await adminFetch(request(auth,'/api/admin/finance/store-period',selection,options),auth.env,services)).status,status);
 for(const bad of [{},null,[],{operation:'read',run_id:'wrong'},{operation:'read',run_id:run,extra:1},{operation:'start',start_date:'2026-10-20',end_date:'2026-10-13'},{operation:'start',start_date:'2026-10-01',end_date:'2026-10-20'}])assert.equal((await adminFetch(request(auth,'/api/admin/finance/store-period',bad),auth.env,services)).status,400);
 assert.equal((await adminFetch(request(auth,'/api/admin/finance/store-period?run_id='+run,selection),auth.env,services)).status,400);assert.equal(reads,0);
 const good=await adminFetch(request(auth,'/api/admin/finance/store-period',selection),auth.env,services);assert.equal(good.status,200);assert.equal((await good.json()).result.expected_repass_cents,5000);assert.equal(reads,1);
});

test('foreign run/date frames and malformed provider payloads are rejected before adjustment writes or private error exposure',async()=>{
 const auth=await login(),before=snapshot(auth.env);
 for(const response of [frame({run_id:otherRun}),{...frame(),access_token:'PRIVATE_PROVIDER_TOKEN'},null]){
  const result=await adminFetch(request(auth,'/api/admin/finance/store-adjustments',body()),auth.env,{getFinanceStorePeriod:async()=>response});assert.equal(result.status,503);assert.ok(!(await result.text()).includes('PRIVATE'));assert.deepEqual(snapshot(auth.env),before);
 }
 const wrongDate=await adminFetch(request(auth,'/api/admin/finance/store-period',{operation:'start',start_date:'2026-10-12',end_date:'2026-10-20'}),auth.env,{getFinanceStorePeriod:async()=>frame()});assert.equal(wrongDate.status,503);
 const failed=await adminFetch(request(auth,'/api/admin/finance/store-period',{operation:'read',run_id:run}),auth.env,{getFinanceStorePeriod:async()=>{throw Error('PRIVATE_PROVIDER_TOKEN');}});assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('PRIVATE'));assert.deepEqual(snapshot(auth.env),before);
});

test('route saves expense revisions for the verified run and stale attempts retain coherent state and audit',async()=>{
 const auth=await login();let calls=0;const services={getFinanceStorePeriod:async(env,selection)=>{calls++;assert.equal(env,auth.env);assert.deepEqual(selection,{operation:'read',run_id:run});return frame();}};
 const first=await adminFetch(request(auth,'/api/admin/finance/store-adjustments',body()),auth.env,services);assert.equal(first.status,200);const bundle=await first.json();assert.equal(bundle.adjustments.revision,1);assert.deepEqual(bundle.adjustments.values,values());assert.equal(bundle.result.net_estimate_cents,1520);assert.equal(bundle.result.net_profit_cents,null);
 const before=snapshot(auth.env),stale=await adminFetch(request(auth,'/api/admin/finance/store-adjustments',body()),auth.env,services);assert.equal(stale.status,409);assert.equal((await stale.json()).error,'STORE_ADJUSTMENTS_CHANGED_RELOAD');assert.deepEqual(snapshot(auth.env),before);assert.equal(calls,2);
 assert.equal(auth.env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM hermes_jobs').get().n,0);assert.equal(auth.env.ADMIN_DB.db.prepare('SELECT revision FROM production_costs_state').get().revision,1);
});
