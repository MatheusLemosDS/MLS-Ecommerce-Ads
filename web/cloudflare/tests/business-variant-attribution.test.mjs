import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {variantOrderFixture} from './mls-variant-order-fixture.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {projectBusinessPeriodVariantsFrame} from '../../finance/src/business-variant-attribution.mjs';
import {businessMonth,projectBusinessMonth} from '../src/business-month.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {BUSINESS_MONTH_VARIANT_ATTRIBUTION_SCHEMA,unwrapBusinessMonthVariantSource,captureBusinessMonthVariantAttribution,buildBusinessMonthVariantContributions,projectBusinessMonthVariantContributions,readBusinessMonthVariantContributions} from '../src/business-variant-attribution.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const pair=(f,id,model='1')=>f.variant_contributions.variants.find(row=>row.item_id===id&&row.model_id===model);
const now=()=>Date.UTC(2026,10,2,12);
function database(){
 const db=new D1();db.db.exec(`CREATE TABLE business_month_runs(month TEXT PRIMARY KEY,revision INTEGER,payload TEXT);CREATE TABLE business_month_frames(month TEXT,slot_index INTEGER,run_id TEXT,revision INTEGER,payload TEXT);CREATE TABLE business_month_publications(month TEXT PRIMARY KEY,source_revision INTEGER,write_token TEXT);CREATE TABLE business_month_publication_frames(month TEXT,run_id TEXT,revision INTEGER,payload TEXT,write_token TEXT)`);return db;
}
async function seed(db,f,{captured='all',captureRevision=8}={}){
 await db.batch(BUSINESS_MONTH_VARIANT_ATTRIBUTION_SCHEMA.map(sql=>db.prepare(sql)));
 for(const [index,entry]of f.captures.entries()){
  if(captured==='partial'&&index===1)continue;
  const payload=JSON.stringify(entry.variant_financials);
  db.db.prepare('INSERT INTO business_month_variant_attribution VALUES(?,?,?,?,?,?,?,?)').run(entry.frame.run_id,f.frame.month,entry.frame.revision,captureRevision,entry.frame.checked_at,digest(JSON.stringify(entry.frame)),payload,digest(payload));
 }
}
const observed=f=>({display:f.frame,audit_scope:f.audit_scope,source_frames:f.source_frames});

test('several models sold in separate orders receive exact single-pair contributions without allocating other orders',async()=>{
 const f=await variantOrderFixture(),before=JSON.stringify(f),a=pair(f,'501'),b=pair(f,'501','2');
 assert.equal(a.total_quantity,4);assert.equal(a.attributed_quantity,2);assert.equal(a.unattributed_quantity,2);assert.equal(a.strict.repass_cents,8000);assert.equal(a.strict.production_cost_cents,3180);assert.equal(a.strict.contribution_cents,4820);
 assert.equal(b.total_quantity,2);assert.equal(b.attributed_quantity,1);assert.equal(b.strict.contribution_cents,1560);
 assert.equal(pair(f,'502').strict.state,'BLOCKED');assert.ok(pair(f,'502').pending.includes('NO_SINGLE_PAIR_ORDERS'));
 assert.equal(pair(f,'503').strict.production_cost_cents,6360,'complete commercial kit reference is multiplied by two orders units once');
 assert.equal(pair(f,'504').strict.contribution_cents,-640);assert.equal(pair(f,'505').strict.contribution_cents,0);
 assert.equal(a.recorded.ads_adjustment_cents,118);assert.equal(a.strict.contribution_cents,8000-3180,'withheld amount is neither added nor deducted again');
 assert.equal(JSON.stringify(f),before);assert.equal(f.variant_contributions.execution_allowed,false);assert.equal(f.variant_contributions.net_profit_cents,null);
});

test('missing windows, payment, returns, costs and stale source preserve bounded known components with strict nulls',async()=>{
 for(const options of [{captured:'partial'},{captured:'none'},{stale:true},{missingPayment:true},{review:true}]){
  const f=await variantOrderFixture(options),report=f.variant_contributions;
  assert.ok(report.variants.every(row=>row.strict.state==='BLOCKED'));
  assert.ok(report.variants.every(row=>row.strict.contribution_cents===null));
  if(options.captured==='none')assert.ok(report.variants.every(row=>Object.values(row.recorded).every(value=>value===null)));
  if(options.captured==='partial')assert.ok(report.variants.every(row=>row.recorded.contribution_cents===null),'different source coverage never forms an invented subtotal');
 }
 const normal=await variantOrderFixture();assert.equal(pair(normal,'506').strict.state,'BLOCKED');assert.equal(pair(normal,'506').recorded.contribution_cents,null);assert.equal(pair(normal,'507').unit_cost_cents,null);assert.equal(pair(normal,'507').strict.production_cost_cents,null);
 const stale=await variantOrderFixture({stale:true});assert.equal(pair(stale,'501').recorded.contribution_cents,4820,'a coherent recorded subtotal remains distinct from strict financial validation');
});

test('current costs reapply without source work and legacy tax rounds per order while monthly DAS remains separate',async()=>{
 const base=await variantOrderFixture(),changed=await variantOrderFixture({costDelta:100,revision:2}),legacy=await variantOrderFixture({mei:false});
 assert.equal(base.provider_calls,changed.provider_calls);assert.equal(pair(changed,'501').strict.production_cost_cents,3380);assert.equal(pair(changed,'501').strict.contribution_cents,4620);
 assert.equal(pair(base,'509').strict.tax_cents,0);assert.equal(pair(legacy,'509').strict.tax_cents,2,'two0.005 per-order estimates each round to0.01');assert.equal(pair(legacy,'509').strict.contribution_cents,38);
 assert.equal(base.variant_contributions.tax_basis,'MONTHLY_DAS_NOT_ALLOCATED');assert.equal(legacy.variant_contributions.tax_basis,'LEGACY_ORDER_TAX_REFERENCE_NOT_OFFICIAL_TAX');
});

test('public projection binds publication, exact quantities, cost revisions and checked time without executing getters',async()=>{
 const f=await variantOrderFixture(),original=JSON.stringify(f.variant_contributions);
 for(const mutate of [v=>v.source.publication_revision++,v=>v.source.costs_revision++,v=>v.checked_at++,v=>v.variants[0].total_quantity++,v=>v.variants[0].unit_cost_cents++,v=>v.variants[0].strict.contribution_cents++,v=>v.variants.reverse(),v=>v.windows[0].capture_revision=10,v=>v.extra=true]){
  const value=structuredClone(f.variant_contributions);mutate(value);assert.equal(projectBusinessMonthVariantContributions(value,f.frame,f.audit_scope),null);
 }
 let getters=0;const bad=structuredClone(f.variant_contributions);Object.defineProperty(bad,'variants',{get(){getters++;throw Error('must not execute');},enumerable:true});assert.equal(projectBusinessMonthVariantContributions(bad,f.frame,f.audit_scope),null);assert.equal(getters,0);
 assert.equal(JSON.stringify(f.variant_contributions),original);assert.equal(Object.isFrozen(f.variant_contributions.variants[0].strict),true);
 const context=vm.createContext({TextEncoder});context.input=JSON.stringify(f);vm.runInContext('const f=JSON.parse(input);const project='+projectBusinessMonthVariantContributions.toString()+';globalThis.result=project(f.variant_contributions,f.frame,f.audit_scope);',context);assert.ok(context.result);assert.equal(JSON.stringify(context.result),original);
});

test('a different canonical monthly cohort cannot reuse source aggregates just because IDs and quantities coincide',async()=>{
 const f=await variantOrderFixture(),changed=structuredClone(f.frame),product=changed.product_summary.products.find(row=>row.item_id==='501');
 changed.sales_cents++;changed.known_sales_cents++;product.known_exclusive_sales_cents++;product.exclusive_sales_cents++;if(product.exclusive_margin_bps!==null)product.exclusive_margin_bps=Number(BigInt(product.exclusive_after_costs_cents)*10000n/BigInt(product.exclusive_sales_cents));assert.ok(projectBusinessMonth(changed));
 assert.equal(buildBusinessMonthVariantContributions(changed,f.audit_scope,f.source_frames,f.captures),null);
 const counts=structuredClone(f.frame);counts.coverage.cancelled--;counts.coverage.unpaid++;assert.ok(projectBusinessMonth(counts));assert.equal(buildBusinessMonthVariantContributions(counts,f.audit_scope,f.source_frames,f.captures),null);
});

test('negotiated envelopes reject hash tampering before capture and legacy frames retain exact serialization',async()=>{
 const f=await variantOrderFixture(),entry=f.captures[0],envelope={schema:'finance_business_period_variants_v1',report:entry.frame,variant_financials:entry.variant_financials};
 const projected=await unwrapBusinessMonthVariantSource(envelope);assert.equal(JSON.stringify(projected.report),JSON.stringify(entry.frame));
 assert.deepEqual(await unwrapBusinessMonthVariantSource(entry.frame),{report:entry.frame,variant_financials:null});
 const bad=structuredClone(envelope);bad.variant_financials.report_hash='0'.repeat(64);assert.equal(await unwrapBusinessMonthVariantSource(bad),null);
 assert.ok(await projectBusinessPeriodVariantsFrame({...envelope,variant_financials:null}));
});

test('optional capture is CAS/source guarded and pruning preserves active plus retained publication evidence',async()=>{
 const f=await variantOrderFixture(),db=database(),entry=f.captures[0],raw=JSON.stringify(entry.frame),payload='{"synthetic":"active"}';
 db.db.prepare('INSERT INTO business_month_runs VALUES(?,?,?)').run(f.frame.month,8,payload);db.db.prepare('INSERT INTO business_month_frames VALUES(?,?,?,?,?)').run(f.frame.month,0,entry.frame.run_id,entry.frame.revision,raw);
 const args={capture_revision:8,parent_payload:payload,slot_index:0};assert.equal(await captureBusinessMonthVariantAttribution(db,f.frame.month,entry.frame,entry.variant_financials,args),true);
 const before=db.db.prepare('SELECT * FROM business_month_variant_attribution').get();assert.equal(await captureBusinessMonthVariantAttribution(db,f.frame.month,entry.frame,entry.variant_financials,{...args,capture_revision:9}),false);assert.deepEqual(db.db.prepare('SELECT * FROM business_month_variant_attribution').get(),before);
 db.db.prepare('INSERT INTO business_month_publications VALUES(?,?,?)').run(f.frame.month,9,'synthetic-retained');db.db.prepare('INSERT INTO business_month_publication_frames VALUES(?,?,?,?,?)').run(f.frame.month,entry.frame.run_id,entry.frame.revision,raw,'synthetic-retained');db.db.exec('DELETE FROM business_month_frames');
 assert.equal(await captureBusinessMonthVariantAttribution(db,f.frame.month,entry.frame,entry.variant_financials,args),true,'an exact retained publication is a valid matching source');assert.equal(db.db.prepare('SELECT COUNT(*) n FROM business_month_variant_attribution').get().n,1);
 const bad=structuredClone(entry.variant_financials);bad.report_hash='f'.repeat(64);assert.equal(await captureBusinessMonthVariantAttribution(db,f.frame.month,entry.frame,bad,args),false);
});

test('reusing the same Finance source retains its earliest capture revision for an older published view',async()=>{
 const f=await variantOrderFixture(),db=database(),entry=f.captures[0],raw=JSON.stringify(entry.frame),first='{"synthetic":"first"}',next='{"synthetic":"next"}';
 db.db.prepare('INSERT INTO business_month_runs VALUES(?,?,?)').run(f.frame.month,8,first);db.db.prepare('INSERT INTO business_month_frames VALUES(?,?,?,?,?)').run(f.frame.month,0,entry.frame.run_id,entry.frame.revision,raw);
 assert.equal(await captureBusinessMonthVariantAttribution(db,f.frame.month,entry.frame,entry.variant_financials,{capture_revision:8,parent_payload:first,slot_index:0}),true);
 db.db.prepare('INSERT INTO business_month_publications VALUES(?,?,?)').run(f.frame.month,9,'retained');db.db.prepare('INSERT INTO business_month_publication_frames VALUES(?,?,?,?,?)').run(f.frame.month,entry.frame.run_id,entry.frame.revision,raw,'retained');db.db.prepare('UPDATE business_month_runs SET revision=10,payload=?').run(next);
 assert.equal(await captureBusinessMonthVariantAttribution(db,f.frame.month,entry.frame,entry.variant_financials,{capture_revision:10,parent_payload:next,slot_index:0}),true);
 assert.equal(db.db.prepare('SELECT capture_revision FROM business_month_variant_attribution').get().capture_revision,8);
 const report=await readBusinessMonthVariantContributions({ADMIN_DB:db},observed(f),{now});assert.equal(report.coverage.windows_captured,1);assert.equal(report.windows[0].state,'CAPTURED');
});

test('read-only missing table, partial captures, invalid hashes and future capture revisions never trigger provider work',async()=>{
 const f=await variantOrderFixture(),db=database(),env={ADMIN_DB:db};const absent=await readBusinessMonthVariantContributions(env,observed(f),{now});assert.equal(absent.state,'NOT_CAPTURED');assert.equal(db.db.prepare("SELECT name FROM sqlite_master WHERE name='business_month_variant_attribution'").get(),undefined);
 await seed(db,f,{captured:'partial'});const partial=await readBusinessMonthVariantContributions(env,observed(f),{now});assert.equal(partial.state,'PARTIAL');assert.equal(partial.coverage.windows_captured,1);
 db.db.exec('DELETE FROM business_month_variant_attribution');await seed(db,f);const complete=await readBusinessMonthVariantContributions(env,observed(f),{now});assert.equal(complete.state,'AVAILABLE');assert.equal(complete.variants.find(row=>row.item_id==='501'&&row.model_id==='1').strict.contribution_cents,4820);
 for(const column of ['report_hash','payload_hash']){
  const before=db.db.prepare('SELECT '+column+' FROM business_month_variant_attribution WHERE run_id=?').get(f.captures[0].frame.run_id)[column];db.db.prepare('UPDATE business_month_variant_attribution SET '+column+'=? WHERE run_id=?').run('0'.repeat(64),f.captures[0].frame.run_id);const invalid=await readBusinessMonthVariantContributions(env,observed(f),{now});assert.equal(invalid.state,'PARTIAL');assert.ok(invalid.pending.includes('VARIANT_CAPTURE_INVALID'));assert.ok(invalid.variants.every(row=>row.strict.state==='BLOCKED'));db.db.prepare('UPDATE business_month_variant_attribution SET '+column+'=? WHERE run_id=?').run(before,f.captures[0].frame.run_id);
 }
 db.db.exec('UPDATE business_month_variant_attribution SET capture_revision=10');assert.equal((await readBusinessMonthVariantContributions(env,observed(f),{now})).state,'NOT_CAPTURED');
 const current=await variantOrderFixture({costDelta:100,revision:2});db.db.exec('UPDATE business_month_variant_attribution SET capture_revision=8');assert.equal((await readBusinessMonthVariantContributions(env,observed(current),{now})).variants.find(row=>row.item_id==='501'&&row.model_id==='1').strict.contribution_cents,4620);
});

class CaptureFaultD1 extends D1{
 prepare(sql){const stmt=super.prepare(sql);stmt.sql=sql;return stmt;}
 async batch(statements){if(this.failCapture&&statements.some(statement=>statement.sql?.includes(this.failCapture==='schema'?'CREATE TABLE IF NOT EXISTS business_month_variant_attribution':'INSERT INTO business_month_variant_attribution'))){this.failCapture=false;throw Error('SYNTHETIC_OPTIONAL_CAPTURE_FAILURE');}return super.batch(statements);}
}
function collectionEnvironment(){
 const db=new CaptureFaultD1();db.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)');db.db.prepare('INSERT INTO variant_bindings_state VALUES(1,1,?,?)').run('[]',new Date(now()).toISOString());db.db.prepare('INSERT INTO production_costs_state VALUES(1,1,?,?)').run(JSON.stringify(COST_DEFAULTS),new Date(now()).toISOString());return {ADMIN_DB:db};
}
test('optional capture failure preserves the exact legacy frame and performs its source request once',async()=>{
 const f=await variantOrderFixture(),env=collectionEnvironment(),entry=f.captures[0],envelope={schema:'finance_business_period_variants_v1',report:entry.frame,variant_financials:entry.variant_financials};let calls=0;env.ADMIN_DB.failCapture=true;
 const result=await businessMonth(env,{operation:'start',month:'2026-10'},{getFinanceBusinessPeriod:async(_,selection,options)=>{calls++;assert.deepEqual(options,{includeVariants:true});assert.equal(selection.start_date,'2026-10-01');return envelope;}},{now});
 assert.equal(calls,1);assert.equal(result.status,'RUNNING');assert.equal(env.ADMIN_DB.db.prepare('SELECT payload FROM business_month_frames WHERE slot_index=0').get().payload,JSON.stringify(entry.frame));assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM business_month_variant_attribution').get().n,0);
});

test('an optional sidecar schema failure cannot discard the legacy financial frame or repeat the source',async()=>{
 const f=await variantOrderFixture(),env=collectionEnvironment(),entry=f.captures[0];let calls=0;env.ADMIN_DB.failCapture='schema';
 const result=await businessMonth(env,{operation:'start',month:'2026-10'},{getFinanceBusinessPeriod:async()=>{calls++;return {schema:'finance_business_period_variants_v1',report:entry.frame,variant_financials:entry.variant_financials};}},{now});
 assert.equal(calls,1);assert.equal(result.status,'RUNNING');assert.equal(env.ADMIN_DB.db.prepare('SELECT payload FROM business_month_frames WHERE slot_index=0').get().payload,JSON.stringify(entry.frame));assert.equal(env.ADMIN_DB.db.prepare("SELECT name FROM sqlite_master WHERE name='business_month_variant_attribution'").get(),undefined);
});

test('a losing optional-source CAS cannot replace the winning capture or repeat either source request',async()=>{
 const f=await variantOrderFixture(),env=collectionEnvironment(),entry=f.captures[0],old={schema:'finance_business_period_variants_v1',report:entry.frame,variant_financials:entry.variant_financials};
 let release,entered,calls=0;const pending=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 const losing=businessMonth(env,{operation:'start',month:'2026-10'},{getFinanceBusinessPeriod:async()=>{calls++;entered();return pending;}},{now});await started;
 const report={...entry.frame,revision:entry.frame.revision+1},financials={...entry.variant_financials,source_revision:report.revision,report_hash:digest(JSON.stringify(projectBusinessPeriodFrame(report)))},winner={schema:old.schema,report,variant_financials:financials};assert.ok(await projectBusinessPeriodVariantsFrame(winner));
 await businessMonth(env,{operation:'start',month:'2026-10'},{getFinanceBusinessPeriod:async()=>{calls++;return winner;}},{now});const before=env.ADMIN_DB.db.prepare('SELECT * FROM business_month_variant_attribution').all();assert.equal(before[0].source_revision,report.revision);release(old);await losing;assert.equal(calls,2);assert.deepEqual(env.ADMIN_DB.db.prepare('SELECT * FROM business_month_variant_attribution').all(),before);
});

test('malformed negotiated evidence never mutates an established legacy frame or initializes sidecar tables',async()=>{
 const f=await variantOrderFixture(),env=collectionEnvironment(),entry=f.captures[0],running=projectBusinessPeriodFrame({...entry.frame,status:'RUNNING'});assert.ok(running);let calls=0;
 await businessMonth(env,{operation:'start',month:'2026-10'},{getFinanceBusinessPeriod:async()=>{calls++;return running;}},{now});const before=env.ADMIN_DB.db.prepare('SELECT * FROM business_month_frames').all();
 const invalid={schema:'finance_business_period_variants_v1',report:entry.frame,variant_financials:{...entry.variant_financials,report_hash:'0'.repeat(64)}};
 await assert.rejects(businessMonth(env,{operation:'step',month:'2026-10'},{getFinanceBusinessPeriod:async()=>{calls++;return invalid;}},{now}),error=>error.message==='BUSINESS_MONTH_SOURCE_INVALID');assert.equal(calls,2);assert.deepEqual(env.ADMIN_DB.db.prepare('SELECT * FROM business_month_frames').all(),before);assert.equal(env.ADMIN_DB.db.prepare("SELECT name FROM sqlite_master WHERE name='business_month_variant_attribution'").get(),undefined);
});
