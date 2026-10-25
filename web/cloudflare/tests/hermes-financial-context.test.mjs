import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {D1} from './sqlite-d1.mjs';
import {collectionFixture} from './business-collection-fixture.mjs';
import {buildHermesFinancialContext,projectHermesFinancialContext,prepareHermesFinancialContext,readHermesFinancialContext,HermesFinancialContextError} from '../src/hermes-financial-context.mjs';

const analysisDate='2026-10-23',jobId='11111111-1111-4111-8111-111111111111',otherId='22222222-2222-4222-8222-222222222222';
const taskRaw=JSON.stringify({type:'daily_review',shop_id:'1178167501',start_date:analysisDate,end_date:analysisDate,ads_execution:'LOCKED'});
const jobs=db=>db.db.exec('CREATE TABLE hermes_jobs(id TEXT PRIMARY KEY,task TEXT NOT NULL,created_at TEXT NOT NULL)');
const insertJob=(db,id=jobId,raw=taskRaw,created='2026-10-24T12:00:00.000Z')=>db.prepare('INSERT INTO hermes_jobs(id,task,created_at) VALUES(?,?,?)').bind(id,raw,created);
const fail=(code,status)=>error=>error instanceof HermesFinancialContextError&&error.message===code&&(status===undefined||error.status===status);
async function fixture(options={}){
 const f=await collectionFixture({paymentDelayMs:0,...options});jobs(f.env.ADMIN_DB);
 let frame=await f.invoke('start');while(frame.status==='RUNNING')frame=await f.invoke('step');frame=await f.invoke('ads');return {...f,frame};
}

test('the daily Hermes job receives the exact monthly checkpoint, explicit scope and at most three read-only actions and products',async()=>{
 const f=await fixture(),capturedAt=Math.floor(f.now()/1000),context=buildHermesFinancialContext(f.frame,{analysisDate,capturedAt});
 assert.ok(context);assert.equal(context.available,true);assert.equal(context.analysis_date,'2026-10-23');assert.equal(context.monthly.start_date,'2026-10-01');assert.equal(context.monthly.end_date,'2026-10-24');assert.equal(context.monthly.checked_at,f.frame.checked_at);
 assert.equal(context.monthly.totals.sales_cents,626400);assert.equal(context.monthly.totals.expected_repass_cents,456096);assert.equal(context.monthly.totals.production_cost_cents,152640);assert.equal(context.monthly.totals.invoice_tax_cents,8605);assert.equal(context.monthly.totals.ads_spend_cents,3000);assert.equal(context.monthly.totals.external_expenses_cents,1234);assert.equal(context.monthly.totals.net_estimate_cents,290617);assert.equal(context.monthly.summary.balance_cents,290617);assert.equal(context.monthly.summary.state,'READY');assert.equal(context.monthly.actual_profit_cents,null);assert.equal(context.monthly.totals.net_profit_cents,null);assert.equal(context.monthly.execution,'READ_ONLY');
 assert.equal(context.monthly.order_coverage.cancelled,12);assert.equal(context.monthly.order_coverage.paid,96);assert.equal(context.monthly.versions.costs,7);assert.equal(context.monthly.versions.expenses,1);
 assert.equal(context.monthly.top_actions[0].code,'CHECK_STOCK_AND_CAMPAIGN');assert.ok(context.monthly.top_actions.every(row=>row.metric_refs.length<=4));assert.equal(context.monthly.product_references.length,3);assert.ok(context.monthly.product_references.every(row=>row.basis==='EXCLUSIVE_BEFORE_ADS_DAS'&&!Object.hasOwn(row,'name')));
 assert.ok(Buffer.byteLength(JSON.stringify(context))<=12288);assert.ok(!JSON.stringify(context).includes('PRIVATE_INTEGRATION'));
 const realm=vm.createContext({Intl});realm.raw=JSON.stringify(context);new vm.Script(projectHermesFinancialContext.toString()).runInContext(realm);assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(projectHermesFinancialContext(JSON.parse(raw)))',realm)),context);
 context.monthly.versions.costs++;assert.equal(f.frame.costs_revision,7);
});

test('returns, missing production and source failures remain explicit instead of becoming realized profit or zero expense',async()=>{
 const f=await fixture({returns:true}),options={analysisDate,capturedAt:Math.floor(f.now()/1000)},context=buildHermesFinancialContext(f.frame,options);
 assert.equal(context.available,true);assert.ok(context.monthly.pending.includes('RETURNS_NOT_RECONCILED'));assert.equal(context.monthly.totals.net_estimate_cents,null);assert.equal(context.monthly.summary.state,'PROVISIONAL');assert.equal(context.monthly.top_actions[0].code,'RECONCILE_RETURNS');assert.ok(context.monthly.product_references.every(row=>row.exclusive_contribution_cents===null||Number.isSafeInteger(row.exclusive_contribution_cents)));
 const unavailable=buildHermesFinancialContext(null,options);assert.deepEqual(unavailable,{schema:'hermes_financial_context_v1',analysis_date:analysisDate,captured_at:options.capturedAt,available:false,unavailable_code:'MONTHLY_SOURCE_UNAVAILABLE',monthly:null});
 const poisoned=buildHermesFinancialContext({...f.frame,access_token:'PRIVATE_TOKEN'},options);assert.equal(poisoned.unavailable_code,'MONTHLY_FRAME_INVALID');assert.equal(poisoned.monthly,null);assert.ok(!JSON.stringify(poisoned).includes('PRIVATE_TOKEN'));
});

test('an unpriced sold unit retains the partial store balance and exact missing-cost coverage without inventing its cost',async()=>{
 const f=await fixture(),stored=f.env.ADMIN_DB.db.prepare('SELECT payload FROM variant_bindings_state').get(),bindings=JSON.parse(stored.payload).filter(row=>row.item_id!=='1002');
 f.env.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET revision=4,payload=?').run(JSON.stringify(bindings));const frame=await f.invoke('read'),context=buildHermesFinancialContext(frame,{analysisDate,capturedAt:Math.floor(f.now()/1000)});
 assert.equal(context.available,true);assert.equal(context.monthly.totals.production_cost_cents,null);assert.equal(context.monthly.totals.known_production_cost_cents,151050);assert.equal(context.monthly.totals.net_estimate_cents,null);assert.equal(context.monthly.summary.state,'PARTIAL_COSTS');assert.equal(context.monthly.summary.balance_cents,292207);
 assert.deepEqual(context.monthly.summary.production_coverage,{total_units:96,known_units:95,pending_units:1,pending_variants:1,pending_products:1});assert.equal(context.monthly.top_actions[0].code,'COMPLETE_PRODUCTION_COSTS');assert.equal(context.monthly.product_references[0].exclusive_production_cents,null);assert.equal(context.monthly.product_references[0].exclusive_contribution_cents,null);
});

test('the strict self-contained projector rejects secrets, altered totals, accessors and invented actual profit',async()=>{
 const f=await fixture(),context=buildHermesFinancialContext(f.frame,{analysisDate,capturedAt:Math.floor(f.now()/1000)});
 for(const change of [value=>value.token='PRIVATE_TOKEN',value=>value.monthly.actual_profit_cents=1,value=>value.monthly.totals.net_profit_cents=1,value=>value.monthly.totals.sales_cents++,value=>value.monthly.totals.ads_calculated_roas_raw='999.000000',value=>value.monthly.summary.known_production_cents++,value=>value.monthly.top_actions[0].metric_refs=['unknown'],value=>value.monthly.product_references[0].name='PRIVATE_NAME',value=>value.monthly.top_actions[0].detail='x'.repeat(13000)]){
  const value=structuredClone(context);change(value);assert.equal(projectHermesFinancialContext(value),null);
 }
 let reads=0;const value=structuredClone(context);Object.defineProperty(value.monthly.totals,'sales_cents',{enumerable:true,get(){reads++;return 1;}});assert.equal(projectHermesFinancialContext(value),null);assert.equal(reads,0);
 const options={capturedAt:Math.floor(f.now()/1000)};Object.defineProperty(options,'analysisDate',{enumerable:true,get(){reads++;return analysisDate;}});assert.equal(buildHermesFinancialContext(f.frame,options),null);assert.equal(reads,0);
});

test('the captured contract derives financial blockers instead of accepting a forged ready balance over returns or missing payments',async()=>{
 const f=await fixture({returns:true}),context=buildHermesFinancialContext(f.frame,{analysisDate,capturedAt:Math.floor(f.now()/1000)});
 const forged=structuredClone(context);forged.monthly.pending=forged.monthly.pending.filter(code=>code!=='RETURNS_NOT_RECONCILED');forged.monthly.summary.pending=[...forged.monthly.pending];forged.monthly.summary.state='READY';forged.monthly.totals.net_estimate_cents=forged.monthly.summary.balance_cents;
 assert.equal(projectHermesFinancialContext(forged),null);assert.ok(projectHermesFinancialContext(context));assert.equal(context.monthly.summary.state,'PROVISIONAL');
 const ready=await fixture(),value=buildHermesFinancialContext(ready.frame,{analysisDate,capturedAt:Math.floor(ready.now()/1000)});
 for(const mutate of [copy=>{copy.monthly.order_coverage.payment_covered--;copy.monthly.order_coverage.payment_missing++;},copy=>copy.monthly.order_coverage.returns_unknown=1,copy=>{copy.monthly.order_coverage.cancelled--;copy.monthly.order_coverage.cancel_pending++;},copy=>{copy.monthly.status='RUNNING';for(const key of ['sales_cents','expected_repass_cents','production_cost_cents','invoice_tax_cents'])copy.monthly.totals[key]=null;}]){
  const copy=structuredClone(value);mutate(copy);assert.equal(projectHermesFinancialContext(copy),null);
 }
 const realm=vm.createContext({Intl,raw:JSON.stringify(forged)});new vm.Script(projectHermesFinancialContext.toString()).runInContext(realm);assert.equal(vm.runInContext('projectHermesFinancialContext(JSON.parse(raw))',realm),null);
});

test('financial and Ads totals retain observation timestamps and a stale source cannot masquerade as a ready capture',async()=>{
 const f=await fixture(),context=buildHermesFinancialContext(f.frame,{analysisDate,capturedAt:Math.floor(f.now()/1000)});
 for(const mutate of [copy=>{copy.monthly.source_checked_at.finance_oldest_at=null;copy.monthly.source_checked_at.finance_latest_at=null;},copy=>copy.monthly.source_checked_at.ads_at=null,copy=>copy.monthly.source_checked_at.finance_oldest_at=copy.monthly.checked_at-901]){
  const copy=structuredClone(context);mutate(copy);assert.equal(projectHermesFinancialContext(copy),null);
 }
 const stale=structuredClone(context);stale.monthly.source_checked_at.finance_oldest_at=stale.monthly.checked_at-901;stale.monthly.pending.push('FINANCIAL_SOURCE_STALE');stale.monthly.summary.pending=[...stale.monthly.pending];stale.monthly.summary.state='PROVISIONAL';stale.monthly.totals.net_estimate_cents=null;assert.ok(projectHermesFinancialContext(stale));
 const legacy={schema:'hermes_financial_context_v1',analysis_date:analysisDate,captured_at:context.captured_at,available:false,unavailable_code:'LEGACY_CONTEXT_MISSING',monthly:null};assert.ok(projectHermesFinancialContext(legacy));
});

test('product references conserve the complete exclusive MEI balance and reject invented or incomplete contributions',async()=>{
 const f=await fixture(),context=buildHermesFinancialContext(f.frame,{analysisDate,capturedAt:Math.floor(f.now()/1000)});assert.ok(context.monthly.product_references.some(row=>row.exclusive_contribution_cents!==null));
 for(const mutate of [copy=>copy.monthly.product_references[0].exclusive_contribution_cents++,copy=>copy.monthly.product_references[0].exclusive_repass_cents=null,copy=>copy.monthly.product_references[0].exclusive_production_cents=null,copy=>copy.monthly.versions.tax_policy=null]){
  const copy=structuredClone(context);mutate(copy);assert.equal(projectHermesFinancialContext(copy),null);
 }
 const missing=structuredClone(context);missing.monthly.product_references[0].exclusive_contribution_cents=null;missing.monthly.product_references[0].exclusive_production_cents=null;assert.ok(projectHermesFinancialContext(missing));
});

test('preparation reads local stored totals only and the context commits atomically with its exact guarded job',async()=>{
 const f=await fixture(),before=structuredClone(f.calls),prepared=await prepareHermesFinancialContext(f.env,jobId,analysisDate,{now:f.now,taskRaw});
 assert.deepEqual(f.calls,before);assert.equal(f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM hermes_financial_contexts').get().n,0);
 assert.equal((await prepared.statement.run()).meta.changes,0,'a snapshot cannot attach before its job exists');
 const result=await f.env.ADMIN_DB.batch([insertJob(f.env.ADMIN_DB),prepared.statement]);assert.equal(result[0].meta.changes,1);assert.equal(result[1].meta.changes,1);
 const read=await readHermesFinancialContext(f.env,jobId);assert.deepEqual(read.context,prepared.context);assert.equal(read.fingerprint,prepared.fingerprint);assert.equal(read.job_id,jobId);assert.equal(read.fingerprint,createHash('sha256').update(JSON.stringify({job_id:jobId,context:prepared.context})).digest('hex'));
 const saved=f.env.ADMIN_DB.db.prepare('SELECT * FROM hermes_financial_contexts').get(),costs=JSON.parse(f.env.ADMIN_DB.db.prepare('SELECT payload FROM production_costs_state').get().payload);costs.inclusive_regular_cents=2000;f.env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET revision=8,payload=?').run(JSON.stringify(costs));f.clock.time+=1000;
 const later=await prepareHermesFinancialContext(f.env,jobId,analysisDate,{now:f.now,taskRaw});assert.notEqual(later.fingerprint,prepared.fingerprint);assert.equal((await later.statement.run()).meta.changes,0);assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT * FROM hermes_financial_contexts').get(),saved);assert.deepEqual(await readHermesFinancialContext(f.env,jobId),read);
});

test('immutable context fingerprints are bound to job identity and reject cross-job swaps and corrupted payloads',async()=>{
 const f=await fixture(),first=await prepareHermesFinancialContext(f.env,jobId,analysisDate,{now:f.now,taskRaw}),second=await prepareHermesFinancialContext(f.env,otherId,analysisDate,{now:f.now,taskRaw});
 await f.env.ADMIN_DB.batch([insertJob(f.env.ADMIN_DB),first.statement,insertJob(f.env.ADMIN_DB,otherId),second.statement]);assert.notEqual(first.fingerprint,second.fingerprint);
 f.env.ADMIN_DB.db.prepare('UPDATE hermes_financial_contexts SET fingerprint=? WHERE job_id=?').run(first.fingerprint,otherId);await assert.rejects(readHermesFinancialContext(f.env,otherId),fail('HERMES_CONTEXT_STORAGE_INVALID'));
 const row=f.env.ADMIN_DB.db.prepare('SELECT payload FROM hermes_financial_contexts WHERE job_id=?').get(jobId),context=JSON.parse(row.payload);context.monthly.totals.sales_cents++;f.env.ADMIN_DB.db.prepare('UPDATE hermes_financial_contexts SET payload=? WHERE job_id=?').run(JSON.stringify(context),jobId);await assert.rejects(readHermesFinancialContext(f.env,jobId),fail('HERMES_CONTEXT_STORAGE_INVALID'));
 f.env.ADMIN_DB.db.prepare('UPDATE hermes_financial_contexts SET payload=? WHERE job_id=?').run(JSON.stringify(first.context,null,2),jobId);await assert.rejects(readHermesFinancialContext(f.env,jobId),fail('HERMES_CONTEXT_STORAGE_INVALID'));
});

test('source failure creates a finite unavailable context and legacy history never acquires new financial values',async()=>{
 const env={ADMIN_DB:new D1()};jobs(env.ADMIN_DB);const captured=Date.UTC(2026,9,24,12),prepared=await prepareHermesFinancialContext(env,jobId,analysisDate,{now:()=>captured,taskRaw});assert.equal(prepared.context.available,false);assert.equal(prepared.context.unavailable_code,'MONTHLY_SOURCE_UNAVAILABLE');assert.equal(prepared.context.monthly,null);
 await env.ADMIN_DB.batch([insertJob(env.ADMIN_DB),prepared.statement]);assert.deepEqual((await readHermesFinancialContext(env,jobId)).context,prepared.context);
 await insertJob(env.ADMIN_DB,otherId).run();const legacy=await readHermesFinancialContext(env,otherId);assert.equal(legacy.context.available,false);assert.equal(legacy.context.unavailable_code,'LEGACY_CONTEXT_MISSING');assert.equal(legacy.context.captured_at,captured/1000);assert.equal(legacy.context.monthly,null);assert.deepEqual(await readHermesFinancialContext(env,otherId),legacy);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM hermes_financial_contexts').get().n,1);
 await assert.rejects(readHermesFinancialContext(env,'33333333-3333-4333-8333-333333333333'),fail('HERMES_CONTEXT_NOT_FOUND',404));
 await assert.rejects(prepareHermesFinancialContext(env,otherId,analysisDate,{now:()=>captured,taskRaw:taskRaw.replace(analysisDate,'2026-10-22')}),fail('HERMES_CONTEXT_REQUEST_INVALID',400));
});
