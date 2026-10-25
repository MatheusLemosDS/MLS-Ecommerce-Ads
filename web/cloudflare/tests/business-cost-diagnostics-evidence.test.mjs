import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {businessMonth} from '../src/business-month.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {enqueueCatalogClassifications,runCatalogClassifications} from '../src/catalog-classification.mjs';
import {readBusinessCostDiagnostics,readBusinessCostDiagnosticsEvidence,projectBusinessCostDiagnostics,projectBusinessCostDiagnosticsEvidence} from '../src/business-cost-diagnostics.mjs';
import {projectHistoricalCostPairDiagnostics} from '../src/historical-cost-evidence.mjs';
import {projectRecordedBusinessBalance} from '../src/business-recorded-balance.mjs';

const clock=Date.UTC(2026,10,2,12),stamp=clock/1000,now=()=>clock,month='2026-10';
const realPairs=[{item_id:'58218547329',model_id:'238814010783',quantity:1},{item_id:'58219210514',model_id:'219195030703',quantity:3}];
const validators={projectDiagnostic:projectBusinessCostDiagnostics,projectHistory:projectHistoricalCostPairDiagnostics,projectBalance:projectRecordedBusinessBalance};
function financial(selection,index,items){
 const count=items.length;return {schema:'finance_business_period_v1',run_id:'11111111-1111-4111-8111-'+String(index).padStart(12,'0'),revision:1,status:'COMPLETE',start_date:selection.start_date,end_date:selection.end_date,cutoff_at:stamp-1,checked_at:stamp,currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:Math.max(1,Math.ceil(count/20)),page_capacity:20,duplicate_orders:0,coverage:{orders:count,paid:count,completed:count,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:count,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:String(count*100),sales_base_raw:String(count*100),known_expected_repass_raw:String(count*60),expected_repass_raw:String(count*60),known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:count,unavailable_orders:0,known_base_raw:String(count*100),known_tax_raw:String(count*2)},items,diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
}
function calendar(selection){
 const chunks=[];for(let start=1;start<=Number(selection.end_date.slice(8));start+=15){const end=Math.min(start+14,Number(selection.end_date.slice(8))),dates={start_date:month+'-'+String(start).padStart(2,'0'),end_date:month+'-'+String(end).padStart(2,'0')};chunks.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:dates,balance:20,daily:Array.from({length:end-start+1},(_,index)=>({date:month+'-'+String(start+index).padStart(2,'0'),expense:1,broad_gmv:10,broad_order:1,broad_roas:10,direct_gmv:0,direct_order:0,direct_roas:0}))},dates,stamp));}return buildAdsCalendar(chunks,selection,stamp);
}
async function fixture(t,{items=realPairs}={}){
 const db=new D1(),env={ADMIN_DB:db};t.after(()=>db.db.close());db.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)');db.db.prepare('INSERT INTO variant_bindings_state VALUES(1,3,?,?)').run('[]',new Date(clock).toISOString());db.db.prepare('INSERT INTO production_costs_state VALUES(1,7,?,?)').run(JSON.stringify(COST_DEFAULTS),new Date(clock).toISOString());
 const calls={finance:0,ads:0},services={getFinanceBusinessPeriod:async(_,selection)=>financial(selection,++calls.finance,calls.finance===1?items:[]),getAdsCalendar:async(_,selection)=>{calls.ads++;return calendar(selection);}};
 let frame=await businessMonth(env,{operation:'start',month},services,{now});while(frame.status==='RUNNING')frame=await businessMonth(env,{operation:'step',month},services,{now});await businessMonth(env,{operation:'ads',month},services,{now});await businessMonth(env,{operation:'expenses',month,revision:0,external_expenses_cents:0,recharge_treatment:'UNCONFIRMED'},services,{now});
 const batches=[],prepare=db.prepare.bind(db),batch=db.batch.bind(db);let beforeDiagnostic=null;db.prepare=sql=>{const statement=prepare(sql);statement.sql=sql;return statement;};db.batch=async statements=>{if(statements.some(statement=>statement.sql?.includes('SELECT item_id,diagnostic,checked_at,failure_count FROM catalog_classification_source_diagnostics'))){batches.push(statements.length);if(beforeDiagnostic){const hook=beforeDiagnostic;beforeDiagnostic=null;await hook();}}return batch(statements);};
 return {env,db,calls,batches,setHook:hook=>{beforeDiagnostic=hook;},legacy:()=>readBusinessCostDiagnostics(env,{month},{now}),read:()=>readBusinessCostDiagnosticsEvidence(env,{month},{now})};
}

test('the opt-in reader preserves the legacy diagnostic and finite source index while adding exact old-pair history in the same snapshot',async t=>{
 const f=await fixture(t),before={...f.calls};await enqueueCatalogClassifications(f.env,[realPairs[0].item_id],{now,returnState:false});await runCatalogClassifications(f.env,async()=>({schema:'variant_catalog_v1',status:'UNAVAILABLE',diagnostic:{stage:'BASE_INFO',code:'FINANCE_CATALOG_UPSTREAM_HTTP',http:403}}),{now,maxProducts:1,itemIds:[realPairs[0].item_id]});
 const legacy=await f.legacy(),legacyBatch=f.batches.at(-1),value=await f.read();assert.deepEqual(value.diagnostic,legacy);assert.equal(f.batches.at(-1),legacyBatch+2,'only the opt-in snapshot appends the two historical queries');assert.deepEqual(f.calls,before);assert.equal(value.diagnostic.products[0].classification.source_diagnostic.http,403);assert.deepEqual(value.history.pairs.map(pair=>pair.state),['NO_SCAN','NO_SCAN']);assert.equal(value.diagnostic.summary.production_coverage.pending_units,4);assert.equal(value.diagnostic.totals.net_estimate_cents,null);assert.ok(projectBusinessCostDiagnosticsEvidence(value,validators));assert.ok(Buffer.byteLength(JSON.stringify(value))<=196608);assert.doesNotMatch(JSON.stringify(value),/order_sn|order_id|access_token|refresh_token|scope_key|run_id/);
});

test('more than ninety unresolved products retain explicit truncation and only compact-diagnostic pairs in the historical wrapper',async t=>{
 const items=Array.from({length:100},(_,index)=>({item_id:String(1000+index),model_id:'0',quantity:1})),f=await fixture(t,{items}),value=await f.read(),included=new Set(value.diagnostic.products.flatMap(product=>product.variants.map(variant=>product.item_id+':'+variant.model_id)));
 assert.equal(value.diagnostic.truncation.products_total,100);assert.equal(value.diagnostic.truncation.products_included,90);assert.equal(value.history.truncation.pairs_total,100);assert.equal(value.history.truncation.truncated,true);assert.ok(value.history.pairs.every(pair=>included.has(pair.item_id+':'+pair.model_id)));assert.ok(projectBusinessCostDiagnosticsEvidence(value,validators));
 const crossPair=structuredClone(value);crossPair.history.pairs[0].item_id='999999';assert.equal(projectBusinessCostDiagnosticsEvidence(crossPair,validators),null);const crossMonth=structuredClone(value);crossMonth.history.month='2026-09';assert.equal(projectBusinessCostDiagnosticsEvidence(crossMonth,validators),null);
});

test('a concurrent registered-cost edit is exposed as inconsistent and cannot release a recorded amount or strict net',async t=>{
 const f=await fixture(t),baseline=await f.read();assert.equal(baseline.diagnostic.consistent,true);assert.equal(baseline.recorded_balance.status,'AVAILABLE','the complete saved inputs allow only a recorded subtotal before the cost edit');assert.equal(baseline.diagnostic.totals.net_estimate_cents,null);
 f.setHook(()=>{const values=JSON.parse(f.db.db.prepare('SELECT payload FROM production_costs_state WHERE id=1').get().payload);values.inclusive_regular_cents+=100;f.db.db.prepare('UPDATE production_costs_state SET revision=revision+1,payload=? WHERE id=1').run(JSON.stringify(values));});const value=await f.read();assert.equal(value.diagnostic.consistent,false);assert.notEqual(value.diagnostic.versions.monthly.costs,value.diagnostic.versions.current.costs);assert.equal(value.recorded_balance.status,'UNAVAILABLE');assert.equal(value.recorded_balance.amount_cents,null);assert.equal(value.diagnostic.totals.net_estimate_cents,null);assert.ok(projectBusinessCostDiagnosticsEvidence(value,validators));
});

test('the wrapper projector rejects unsafe or altered recorded arithmetic and remains standalone in the browser',async t=>{
 const f=await fixture(t),value=await f.read();assert.equal(value.recorded_balance.status,'AVAILABLE');const changed=structuredClone(value);changed.recorded_balance.amount_cents++;assert.equal(projectBusinessCostDiagnosticsEvidence(changed,validators),null);
 const overflow=structuredClone(value);overflow.diagnostic.totals.expected_repass_cents=Number.MAX_SAFE_INTEGER;overflow.diagnostic.totals.known_expected_repass_cents=Number.MAX_SAFE_INTEGER;overflow.diagnostic.totals.recharge_addback_cents=Number.MAX_SAFE_INTEGER;assert.equal(projectBusinessCostDiagnosticsEvidence(overflow,validators),null);assert.equal(projectBusinessCostDiagnosticsEvidence({...value,access_token:'PRIVATE'},validators),null);
 const context=vm.createContext({TextEncoder,raw:JSON.stringify(value)});new vm.Script([projectBusinessCostDiagnostics,projectHistoricalCostPairDiagnostics,projectRecordedBusinessBalance,projectBusinessCostDiagnosticsEvidence].map(fn=>fn.toString()).join('\n')).runInContext(context);assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(projectBusinessCostDiagnosticsEvidence(JSON.parse(raw),{projectDiagnostic:projectBusinessCostDiagnostics,projectHistory:projectHistoricalCostPairDiagnostics,projectBalance:projectRecordedBusinessBalance}))',context)),value);
});
