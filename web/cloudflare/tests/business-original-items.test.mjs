import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {D1} from './sqlite-d1.mjs';
import {BUSINESS_MONTH_PUBLICATION_SCHEMA,saveCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {BUSINESS_RECONCILIATION_SCHEMA,projectBusinessReconciliation,readBusinessReconciliation,readBusinessReconciliationMoney,readBusinessReconciliationOriginalItems,runBusinessReconciliation} from '../src/business-reconciliation.mjs';
import {projectBusinessOriginalItems,projectPhysicalReturnsOriginalItemsWorkspace} from '../src/business-original-items.mjs';
import {readPhysicalReturnsWorkspace,readPhysicalReturnsOriginalItemsWorkspace} from '../src/physical-returns-workspace.mjs';
import {projectPhysicalReturnsWorkspace} from '../src/physical-returns-view.mjs';
import {projectPhysicalReturns} from '../src/physical-returns.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {projectReconciliationFrame,projectReconciliationEvidenceFrame,projectReconciliationMoneyFrame} from '../../finance/src/reconciliation-frame.mjs';
import {projectOriginalItemsFrame,projectReconciliationOriginalItemsFrame} from '../../finance/src/original-items-frame.mjs';
import {originalItemsEnvelopeFixture} from '../../finance/tests/original-items-fixture.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const fixtureSource=originalItemsEnvelopeFixture(),stamp=fixtureSource.report.checked_at,month='2026-10',now=()=>stamp*1000;
const validators=[projectBusinessReconciliation,projectReconciliationFrame,projectOriginalItemsFrame];
const project=value=>projectBusinessOriginalItems(value,...validators);
const workspaceProject=value=>projectPhysicalReturnsOriginalItemsWorkspace(value,projectPhysicalReturnsWorkspace,projectBusinessOriginalItems,...validators);
const legacy=frame=>clone({schema:'finance_reconciliation_v3',report:frame.report,review:frame.review,money:frame.money});
class ObservedD1 extends D1{
 constructor(){super();this.sql=[];this.rpc=0;this.failSidecar=false;this.executors=new WeakMap();}
 prepare(sql){this.sql.push(sql);const statement=super.prepare(sql);statement.sql=sql;this.executors.set(statement,statement.run.bind(statement));for(const method of ['run','all','first']){const original=statement[method].bind(statement);statement[method]=(...args)=>{this.rpc++;return original(...args);};}return statement;}
 async batch(rows){this.rpc++;if(this.failSidecar&&rows.some(row=>row.sql?.startsWith('INSERT INTO business_reconciliation_original_items'))){this.failSidecar=false;throw Error('SYNTHETIC_OPTIONAL_STORE_FAILURE');}return super.batch(rows.map(row=>({run:this.executors.get(row)})));}
}
function period(){
 const source=fixtureSource.report,frame={schema:'finance_business_period_v1',run_id:source.run_id,revision:source.source_revision,status:'COMPLETE',start_date:source.start_date,end_date:source.end_date,cutoff_at:stamp-20,checked_at:stamp,source_checked_at:{oldest_at:stamp-10,latest_at:stamp-10},currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:1,paid:1,completed:1,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1,payment_missing:0,returns:1,returns_unknown:0},known_sales_base_raw:'100',sales_base_raw:'100',known_expected_repass_raw:'80',expected_repass_raw:'80',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:0,known_base_raw:'100',known_tax_raw:'2'},items:[{item_id:'1000',model_id:'0',quantity:2}],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
 assert.ok(projectBusinessPeriodFrame(frame));return frame;
}
async function fixture(t){
 const db=new ObservedD1(),env={ADMIN_DB:db};t.after(()=>db.db.close());
 await db.batch(['CREATE TABLE business_month_runs(month TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)',...BUSINESS_MONTH_PUBLICATION_SCHEMA,...BUSINESS_RECONCILIATION_SCHEMA].map(sql=>db.prepare(sql)));
 const frame=period(),payload={start_date:frame.start_date,end_date:frame.end_date,slots:[{start_date:frame.start_date,end_date:frame.end_date,frame}]},raw=JSON.stringify(payload),row={revision:10,payload:raw,created_at:stamp-60,updated_at:stamp};
 db.db.prepare('INSERT INTO business_month_runs VALUES(?,?,?,?,?)').run(month,10,raw,row.created_at,row.updated_at);assert.ok(await saveCompletedBusinessMonth(env,month,{row,payload,complete:true},{now}));
 db.rpc=0;db.sql=[];return {db,env,frame};
}
async function republish(f,frame=f.frame,revision=11){
 const payload={start_date:frame.start_date,end_date:frame.end_date,slots:[{start_date:frame.start_date,end_date:frame.end_date,frame}]},raw=JSON.stringify(payload),row={revision,payload:raw,created_at:stamp-60,updated_at:stamp};
 f.db.db.prepare('UPDATE business_month_runs SET revision=?,payload=? WHERE month=?').run(revision,raw,month);assert.ok(await saveCompletedBusinessMonth(f.env,month,{row,payload,complete:true},{now}));
}
const financialSnapshot=db=>JSON.stringify(['business_month_runs','business_month_publications','business_month_publication_frames'].map(name=>[name,db.db.prepare('SELECT * FROM '+name).all()]));
async function collect(f,value=fixtureSource){let calls=0;const result=await runBusinessReconciliation(f.env,async(_,input,options)=>{calls++;assert.deepEqual(input,{operation:'step',run_id:fixtureSource.report.run_id});assert.deepEqual(options,{includeOriginalItems:true});return clone(value);},{month},{now});assert.equal(calls,1);return result;}

test('v4 capture splits original evidence from byte-identical v3 legacy storage and never changes the publication',async t=>{
 const f=await fixture(t),before=financialSnapshot(f.db);assert.ok(projectReconciliationOriginalItemsFrame(fixtureSource,projectReconciliationFrame,projectReconciliationEvidenceFrame,projectReconciliationMoneyFrame,projectOriginalItemsFrame));
 assert.equal((await collect(f)).status,'CHECKED');
 const row=f.db.db.prepare('SELECT * FROM business_reconciliation_reports').get(),sidecar=f.db.db.prepare('SELECT * FROM business_reconciliation_original_items').get();assert.equal(row.payload,JSON.stringify(legacy(fixtureSource)));assert.equal(JSON.parse(row.payload).schema,'finance_reconciliation_v3');assert.equal(sidecar.payload,JSON.stringify(fixtureSource.original_items));assert.equal(sidecar.publication_revision,10);assert.equal(sidecar.source_revision,2);assert.equal(sidecar.report_checked_at,stamp);assert.match(sidecar.report_hash,/^[a-f0-9]{64}$/);
 const context=await readBusinessReconciliationOriginalItems(f.env,{month},{now}),v1=await readBusinessReconciliation(f.env,{month},{now,readOnly:true}),v3=await readBusinessReconciliationMoney(f.env,{month},{now});assert.ok(project(context));assert.deepEqual(context.report,v1);assert.deepEqual(context.pending,[]);assert.equal(context.original_items[0].orders[0].items[0].quantity,2);assert.equal(context.original_items[0].cases[0].items[0].quantity,1);assert.deepEqual(v3.money[0].money,fixtureSource.money);assert.equal(financialSnapshot(f.db),before);
});

test('a cold opt-in owner read initializes nothing and an absent item sidecar is NOT_CAPTURED rather than zero',async t=>{
 const cold=new ObservedD1();t.after(()=>cold.db.close());const empty=await readPhysicalReturnsOriginalItemsWorkspace({ADMIN_DB:cold},{month},{now});assert.ok(workspaceProject(empty));assert.equal(empty.original_items,null);assert.equal(empty.report.source.cases_total,null);assert.equal(cold.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);assert.ok(cold.sql.every(sql=>/^SELECT\b/.test(sql)));
 const f=await fixture(t);await collect(f,legacy(fixtureSource));f.db.sql=[];const value=await readBusinessReconciliationOriginalItems(f.env,{month},{now});assert.ok(project(value));assert.deepEqual(value.original_items,[]);assert.deepEqual(value.pending,['ORIGINAL_ITEMS_NOT_CAPTURED']);assert.equal(value.report.reports[0].returns.reference_count,1);assert.ok(f.db.sql.every(sql=>/^SELECT\b/.test(sql)));assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='business_reconciliation_original_items'").get().n,0);
});

test('the optional capture adds statements inside the same cron RPC and makes one source call',async t=>{
 const old=await fixture(t),next=await fixture(t);await collect(old,legacy(fixtureSource));await collect(next);assert.equal(next.db.rpc,old.db.rpc,'one bounded batch captures optional metadata without another database round trip');
});

test('a new App publication reuses exact Finance evidence while retaining its original capture provenance',async t=>{
 const f=await fixture(t);await collect(f);const sidecar=f.db.db.prepare('SELECT * FROM business_reconciliation_original_items').get(),legacyPayload=f.db.db.prepare('SELECT payload FROM business_reconciliation_reports').get().payload;
 await republish(f);f.db.sql=[];const context=await readBusinessReconciliationOriginalItems(f.env,{month},{now});assert.ok(project(context));assert.equal(context.report.source_revision,11);assert.equal(context.original_items.length,1);assert.deepEqual(context.pending,[]);assert.equal(context.original_items[0].source_revision,2);assert.equal(context.original_items[0].checked_at,stamp);assert.deepEqual(f.db.db.prepare('SELECT * FROM business_reconciliation_original_items').get(),sidecar);assert.equal(sidecar.publication_revision,10);assert.equal(f.db.db.prepare('SELECT payload FROM business_reconciliation_reports').get().payload,legacyPayload);
 const workspace=await readPhysicalReturnsOriginalItemsWorkspace(f.env,{month},{now});assert.ok(workspaceProject(workspace));assert.equal(workspace.report.source.cases[0].publication_revision,11);assert.equal(workspace.original_items.report.source_revision,11);assert.equal(workspace.original_items.original_items[0].orders[0].items[0].quantity,2);assert.ok(f.db.sql.every(sql=>/^SELECT\b/.test(sql)));
});

test('a changed Finance identity, report observation or case membership still rejects an older capture',async t=>{
 for(const change of [frame=>({...frame,run_id:'22222222-2222-4222-8222-222222222222'}),frame=>({...frame,revision:3})]){
  const f=await fixture(t);await collect(f);await republish(f,change(f.frame));const value=await readBusinessReconciliationOriginalItems(f.env,{month},{now});assert.ok(project(value));assert.equal(value.report.source_revision,11);assert.deepEqual(value.original_items,[]);assert.deepEqual(value.pending,['ORIGINAL_ITEMS_NOT_CAPTURED']);
 }
 for(const change of [value=>{value.report.checked_at++;},value=>{value.report.cases[0].case_hash='c'.repeat(64);}]){
  const f=await fixture(t);await collect(f);const raw=legacy(fixtureSource);change(raw);assert.ok(projectReconciliationMoneyFrame(raw,projectReconciliationFrame,projectReconciliationEvidenceFrame));f.db.db.prepare('UPDATE business_reconciliation_reports SET payload=?,checked_at=?').run(JSON.stringify(raw),raw.report.checked_at);const value=await readBusinessReconciliationOriginalItems(f.env,{month},{now});assert.equal(value.report.reports.length,1);assert.deepEqual(value.original_items,[]);assert.deepEqual(value.pending,['ORIGINAL_ITEMS_NOT_CAPTURED']);
 }
});

test('unavailable or changed optional storage preserves a successful guarded legacy report without repeating the source',async t=>{
 const f=await fixture(t);f.db.failSidecar=true;assert.equal((await collect(f)).status,'CHECKED');assert.equal(f.db.db.prepare('SELECT payload FROM business_reconciliation_reports').get().payload,JSON.stringify(legacy(fixtureSource)));const context=await readBusinessReconciliationOriginalItems(f.env,{month},{now});assert.deepEqual(context.pending,['ORIGINAL_ITEMS_NOT_CAPTURED']);assert.deepEqual(context.original_items,[]);
});

test('stale revision, publication, timestamp, payload hash or item payload cannot be reused as original proof',async t=>{
 const f=await fixture(t);await collect(f);const original=f.db.db.prepare('SELECT * FROM business_reconciliation_original_items').get();
 const alteredQuantity=clone(fixtureSource.original_items);alteredQuantity.cases[0].items[0].quantity=2;
 const edits=[['source_revision',3],['publication_revision',11],['report_checked_at',stamp-1],['report_hash','0'.repeat(64)],['payload_hash','0'.repeat(64)],['payload','{}'],['payload',JSON.stringify(alteredQuantity)],['payload',JSON.stringify({...fixtureSource.original_items,private_serial:'NEVER_EXPOSE'})]];
 for(const [field,value] of edits){f.db.db.prepare('UPDATE business_reconciliation_original_items SET '+field+'=?').run(value);const result=await readBusinessReconciliationOriginalItems(f.env,{month},{now});assert.deepEqual(result.original_items,[],field);assert.deepEqual(result.pending,['ORIGINAL_ITEMS_NOT_CAPTURED'],field);assert.equal(result.report.reports.length,1);f.db.db.prepare('UPDATE business_reconciliation_original_items SET source_revision=?,publication_revision=?,report_checked_at=?,report_hash=?,payload=?,payload_hash=?').run(original.source_revision,original.publication_revision,original.report_checked_at,original.report_hash,original.payload,original.payload_hash);}
 const payload=JSON.parse(f.db.db.prepare('SELECT payload FROM business_reconciliation_reports').get().payload);payload.report.cases[0].requested_refund_cents=900;payload.report.returns.known_requested_refund_cents=900;payload.money.groups[0].statuses.find(row=>row.status==='ACCEPTED').known_amount_cents=900;f.db.db.prepare('UPDATE business_reconciliation_reports SET payload=?').run(JSON.stringify(payload));const changed=await readBusinessReconciliationOriginalItems(f.env,{month},{now});assert.equal(changed.report.reports[0].returns.known_requested_refund_cents,900);assert.deepEqual(changed.original_items,[],'same source and date with different legacy bytes is a different observation');
});

test('legacy reads remain accepted after a v4 writer and invalid new envelopes cannot poison the saved evidence',async t=>{
 const f=await fixture(t);await collect(f);const before=f.db.db.prepare('SELECT * FROM business_reconciliation_reports').get(),physical=await readPhysicalReturnsWorkspace(f.env,{month},{now});assert.ok(projectPhysicalReturnsWorkspace(physical));
 const invalid=clone(fixtureSource);invalid.original_items.orders[0].items[0].quantity=0;f.db.db.prepare('DELETE FROM business_reconciliation_attempts').run();assert.equal((await collect(f,invalid)).status,'UNAVAILABLE');assert.deepEqual(f.db.db.prepare('SELECT * FROM business_reconciliation_reports').get(),before);assert.equal((await readBusinessReconciliationOriginalItems(f.env,{month},{now})).original_items.length,1);
});

test('opt-in workspace matches source cases and leaves physical quantities, valuations and v1 report unchanged',async t=>{
 const f=await fixture(t);await collect(f);const before=financialSnapshot(f.db),v1=await readPhysicalReturnsWorkspace(f.env,{month},{now});f.db.sql=[];const v2=await readPhysicalReturnsOriginalItemsWorkspace(f.env,{month},{now});assert.ok(workspaceProject(v2));assert.deepEqual(v2.report,v1);assert.equal(v2.report.physical.summary.received_quantity,0);assert.equal(v2.report.physical.valuation.amount_cents,null);assert.equal(v2.report.physical.external_stock_write_allowed,false);assert.equal(v2.original_items.original_items[0].orders[0].items[0].quantity,2);assert.equal(v2.original_items.original_items[0].cases[0].items[0].quantity,1);assert.ok(f.db.sql.every(sql=>/^SELECT\b/.test(sql)));assert.equal(financialSnapshot(f.db),before);
 for(const change of [row=>row.original_items.report.month='2026-09',row=>row.report.source.cases[0].order_hash='c'.repeat(64),row=>row.report.source.cases[0].publication_revision++,row=>row.report.source.cases[0].status='CLOSED',row=>row.original_items.original_items[0].checked_at--]){const value=clone(v2);change(value);assert.equal(workspaceProject(value),null);}
 assert.ok(workspaceProject({...v2,original_items:null}),'optional panel loss must preserve the valid physical workspace');
});

test('strict owner context rejects extra keys, duplicates, wrong source clocks and accessor or sparse arrays',async t=>{
 const f=await fixture(t);await collect(f);const value=await readBusinessReconciliationOriginalItems(f.env,{month},{now});assert.ok(project(value));
 for(const change of [row=>row.private='FORBIDDEN',row=>row.original_items.push(row.original_items[0]),row=>row.pending.push('ORIGINAL_ITEMS_NOT_CAPTURED'),row=>row.original_items[0].orders[0].source_checked_at--,row=>row.original_items[0].cases[0].case_hash='c'.repeat(64),row=>row.original_items[0].source_revision++,row=>row.original_items[0].orders[0].items[0].quantity=0]){const invalid=clone(value);change(invalid);assert.equal(project(invalid),null);}
 let reads=0;const getter={...value};Object.defineProperty(getter,'original_items',{enumerable:true,get(){reads++;throw Error('PRIVATE_GETTER');}});assert.equal(project(getter),null);assert.equal(reads,0);assert.equal(project({...value,original_items:new Array(1)}),null);const detached=project(value);detached.original_items[0].orders[0].items[0].quantity++;assert.equal(value.original_items[0].orders[0].items[0].quantity,2);
});

test('NOT_CAPTURED and INVALID rows retain unknown quantities rather than reported zero or expected physical pieces',async t=>{
 const f=await fixture(t),unknown=clone(fixtureSource);unknown.original_items.orders[0].state='NOT_CAPTURED';unknown.original_items.orders[0].items=[];unknown.original_items.cases[0].state='INVALID';unknown.original_items.cases[0].items=[];await collect(f,unknown);const value=await readBusinessReconciliationOriginalItems(f.env,{month},{now});assert.ok(project(value));assert.deepEqual(value.pending,['ORIGINAL_ITEMS_NOT_CAPTURED']);assert.deepEqual(value.original_items[0].orders[0].items,[]);assert.equal(value.original_items[0].orders[0].state,'NOT_CAPTURED');const workspace=await readPhysicalReturnsOriginalItemsWorkspace(f.env,{month},{now});assert.equal(workspace.report.physical.summary.received_quantity,0);assert.equal(workspace.report.physical.valuation.state,'UNKNOWN');
});

for(const minify of [false,true])test('the exact owner context and physical wrapper project standalone when frozen (minify='+minify+')',async t=>{
 const f=await fixture(t);await collect(f);const value=await readPhysicalReturnsOriginalItemsWorkspace(f.env,{month},{now}),functions=[projectReconciliationFrame,projectBusinessReconciliation,projectOriginalItemsFrame,projectBusinessOriginalItems,projectPhysicalReturns,projectPhysicalReturnsWorkspace,projectPhysicalReturnsOriginalItemsWorkspace];
 const source=functions.map(fn=>fn.toString()).join('\n')+'\nconst input=JSON.parse(serialized);globalThis.result=projectPhysicalReturnsOriginalItemsWorkspace(input,projectPhysicalReturnsWorkspace,projectBusinessOriginalItems,projectBusinessReconciliation,projectReconciliationFrame,projectOriginalItemsFrame);';
 const output=await build({stdin:{contents:source},write:false,format:'iife',platform:'browser',target:'es2022',minify}),context=vm.createContext({serialized:JSON.stringify(value),TextEncoder});vm.runInContext(output.outputFiles[0].text,context);assert.deepEqual(clone(context.result),value);
});
