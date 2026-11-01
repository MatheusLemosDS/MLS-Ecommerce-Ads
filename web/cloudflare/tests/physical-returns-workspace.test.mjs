import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {BUSINESS_MONTH_PUBLICATION_SCHEMA,saveCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {BUSINESS_RECONCILIATION_SCHEMA,readBusinessReconciliation} from '../src/business-reconciliation.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';
import {readPhysicalReturnsWorkspace,mutatePhysicalReturnsWorkspace,buildPhysicalReturnCandidates} from '../src/physical-returns-workspace.mjs';
import {projectPhysicalReturnsWorkspace} from '../src/physical-returns-view.mjs';
import {adminFetch,SCHEMA} from '../src/admin.mjs';
const month='2026-10',at=Date.UTC(2026,9,25,15),stamp=at/1000;
const uuid=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const hash=n=>String(n).repeat(64);
const identity={artwork:'Arte sintética original',color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:'100',model_id:'0',sku:'FIXTURE-M'};
class ReadObservedD1 extends D1{
 constructor(){super();this.sql=[];}
 prepare(sql){this.sql.push(sql);return super.prepare(sql);}
}
function sourceFrame(index){
 const start_date=month+'-'+String(index*15+1).padStart(2,'0'),end_date=month+'-'+(index===0?'15':'25');
 const frame={schema:'finance_business_period_v1',run_id:uuid(index+1),revision:2,status:'COMPLETE',start_date,end_date,cutoff_at:stamp-3,checked_at:stamp,source_checked_at:{oldest_at:stamp-1,latest_at:stamp-1},currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:1,paid:1,completed:1,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1,payment_missing:0,returns:1,returns_unknown:0},known_sales_base_raw:'100',sales_base_raw:'100',known_expected_repass_raw:'80',expected_repass_raw:'80',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:0,known_base_raw:'100',known_tax_raw:'2'},items:[{item_id:'100',model_id:'0',quantity:1}],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
 assert.ok(projectBusinessPeriodFrame(frame));return frame;
}
function report(frame,index){
 const result={schema:'finance_reconciliation_v1',run_id:frame.run_id,source_revision:frame.revision,start_date:frame.start_date,end_date:frame.end_date,checked_at:stamp,status:'CHECKED',source_checked_at:{finance_oldest_at:stamp-1,finance_latest_at:stamp-1,returns_oldest_at:stamp,returns_latest_at:stamp},coverage:{orders:1,evidence_orders:1,missing_evidence_orders:0,paid_orders:1,review_orders:0,return_orders:1,return_unknown_orders:0},adjustments:{reported_orders:1,missing_orders:0,conflicting_orders:0,known_adjustment_cents:100,base_repass_cents:8000,after_adjustment_repass_cents:8100},returns:{reference_count:1,checked_count:1,pending_count:0,known_requested_refund_cents:1000,requested_amount_complete:true,permission:'AVAILABLE'},cases:[{case_hash:hash(index+1),order_hash:hash(index+3),status:'REFUND_PAID',requested_refund_cents:1000,checked_at:stamp,diagnostic:null}],truncation:{truncated:false,cases_total:1,cases_included:1},pending:['RETURN_VALUES_UNVERIFIED','SETTLEMENT_NOT_RECONCILED'],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};
 assert.ok(projectReconciliationFrame(result));return result;
}
async function fixture(t){
 const db=new ReadObservedD1(),env={ADMIN_DB:db},clock={time:at},now=()=>clock.time;t.after(()=>db.db.close());
 await db.batch(['CREATE TABLE business_month_runs(month TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)',...BUSINESS_MONTH_PUBLICATION_SCHEMA,...BUSINESS_RECONCILIATION_SCHEMA].map(sql=>db.prepare(sql)));
 const frames=[sourceFrame(0),sourceFrame(1)],payload={start_date:month+'-01',end_date:month+'-25',slots:frames.map(frame=>({start_date:frame.start_date,end_date:frame.end_date,frame}))},raw=JSON.stringify(payload),row={revision:10,payload:raw,created_at:stamp-60,updated_at:stamp};db.db.prepare('INSERT INTO business_month_runs VALUES(?,?,?,?,?)').run(month,10,raw,row.created_at,row.updated_at);assert.ok(await saveCompletedBusinessMonth(env,month,{row,payload,complete:true},{now}));
 for(const [index,frame] of frames.entries()){const value=report(frame,index);db.db.prepare('INSERT INTO business_reconciliation_reports VALUES(?,?,?,?,?,?)').run(frame.run_id,frame.revision,frame.start_date,frame.end_date,JSON.stringify(value),stamp);}
 db.sql=[];return {db,env,clock,now,frames};
}
const finances=db=>JSON.stringify(['business_month_runs','business_month_publications','business_month_publication_frames','business_reconciliation_reports'].map(name=>[name,db.db.prepare('SELECT * FROM '+name).all()]));

test('cold physical workspace GET is read-only with unknown source and a genuinely empty ledger',async t=>{
 const db=new ReadObservedD1();t.after(()=>db.db.close());const value=await readPhysicalReturnsWorkspace({ADMIN_DB:db},{month},{now:()=>at});assert.ok(projectPhysicalReturnsWorkspace(value));assert.equal(value.source.status,'UNAVAILABLE');assert.equal(value.source.cases_total,null);assert.equal(value.physical.revision,0);assert.equal(value.physical.summary.received_quantity,0);assert.equal(value.physical.valuation.amount_cents,null);assert.equal(db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);assert.ok(db.sql.every(sql=>/^SELECT\b/.test(sql)));
});

test('saved candidates match the immutable publication and refund status alone creates no physical quantity',async t=>{
 const f=await fixture(t),before=finances(f.db);const report=await readBusinessReconciliation(f.env,{month},{now:f.now,readOnly:true});assert.equal(report.status,'CHECKED');assert.ok(f.db.sql.every(sql=>/^SELECT\b/.test(sql)));
 const value=await readPhysicalReturnsWorkspace(f.env,{month},{now:f.now});assert.ok(projectPhysicalReturnsWorkspace(value));assert.equal(value.source.status,'AVAILABLE');assert.equal(value.source.cases_total,2);assert.equal(value.source.cases.length,2);assert.ok(value.source.cases.every(row=>row.status==='REFUND_PAID'));assert.equal(value.physical.summary.active_quantity,0);assert.equal(finances(f.db),before);assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'physical_returns_%'").get().n,0);
});

test('case registration and kit-partial receipt stay global, unknown-valued and independent of finance',async t=>{
 const f=await fixture(t),before=finances(f.db),request={action:'register',revision:0,request_id:uuid(20),case_hash:hash(1),order_hash:hash(3)};
 let value=await mutatePhysicalReturnsWorkspace(f.env,{month},request,'synthetic-owner',{now:f.now});assert.equal(value.physical.revision,1);assert.equal(value.physical.summary.received_quantity,0);
 value=await mutatePhysicalReturnsWorkspace(f.env,{month},{action:'receive',revision:1,request_id:uuid(21),case_hash:hash(1),line_id:uuid(30),receipt_ref:'PACOTE-1-PECA-M',quantity:1,identity},'synthetic-owner',{now:f.now});assert.equal(value.physical.summary.quarantine_quantity,1);assert.equal(value.physical.summary.physically_available_quantity,0);
 value=await mutatePhysicalReturnsWorkspace(f.env,{month},{action:'inspect',revision:2,request_id:uuid(22),case_hash:hash(1),line_id:uuid(30),identity,partition:{resellable:1,repair:0,damaged:0,mismatch:0,quarantine:0},reason:'Conferência física simulada'},'synthetic-owner',{now:f.now});assert.equal(value.physical.summary.physically_available_quantity,1);assert.equal(value.physical.valuation.amount_cents,null);assert.equal(value.physical.external_stock_write_allowed,false);
 f.clock.time=Date.UTC(2026,10,1,12);const next=await readPhysicalReturnsWorkspace(f.env,{month:'2026-11'},{now:f.now});assert.equal(next.source.status,'UNAVAILABLE');assert.equal(next.physical.summary.active_quantity,1);assert.ok(projectPhysicalReturnsWorkspace(next));assert.equal(finances(f.db),before);
});

test('registration replay survives source deletion, while a new unknown source cannot fabricate a case',async t=>{
 const f=await fixture(t),request={action:'register',revision:0,request_id:uuid(40),case_hash:hash(1),order_hash:hash(3)};const first=await mutatePhysicalReturnsWorkspace(f.env,{month},request,'synthetic-owner',{now:f.now});f.db.db.exec('DELETE FROM business_reconciliation_reports');const replay=await mutatePhysicalReturnsWorkspace(f.env,{month},request,'synthetic-owner',{now:f.now});assert.deepEqual(replay.physical,first.physical);assert.equal(replay.source.status,'PARTIAL');await assert.rejects(mutatePhysicalReturnsWorkspace(f.env,{month},{...request,revision:1,request_id:uuid(41),case_hash:hash(2),order_hash:hash(4)},'synthetic-owner',{now:f.now}),e=>e.status===409&&e.message==='PHYSICAL_RETURNS_SOURCE_REQUIRED');assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM physical_returns_cases').get().n,1);
});

test('conflicting saved identities block registration but not the existing physical ledger',async t=>{
 const f=await fixture(t);await mutatePhysicalReturnsWorkspace(f.env,{month},{action:'register',revision:0,request_id:uuid(50),case_hash:hash(1),order_hash:hash(3)},'synthetic-owner',{now:f.now});const raw=await readBusinessReconciliation(f.env,{month},{now:f.now,readOnly:true});raw.reports[1].cases[0].case_hash=hash(1);const candidate=buildPhysicalReturnCandidates(raw,{now:f.now});assert.equal(candidate.status,'UNAVAILABLE');assert.equal(candidate.reason,'SAVED_RETURNS_CONFLICT');const ledger=await readPhysicalReturnsWorkspace(f.env,{month},{now:f.now});assert.ok(projectPhysicalReturnsWorkspace({...ledger,source:candidate}));assert.equal(ledger.physical.cases.length,1);
});

test('physical API authenticates before storage and rejects invalid methods, query and CSRF without initialization',async t=>{
 const db=new ReadObservedD1();t.after(()=>db.db.close());const env={ADMIN_DB:db,ADMIN_USERNAME:'synthetic-owner',ADMIN_PASSWORD:'synthetic-secret-safe-password',ADMIN_SESSION_SECRET:'s'.repeat(64)},origin='https://physical.test';
 const login=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.ok([302,303].includes(login.status));const cookie=login.headers.get('set-cookie').split(';')[0];
 const forbiddenServices=new Proxy({},{get(){throw Error('PROVIDER_MUST_NOT_BE_READ');}});const call=(query='',options={})=>adminFetch(new Request(origin+'/api/admin/returns/physical'+query,{...options,headers:{cookie,...options.headers}}),env,forbiddenServices);
 assert.equal((await adminFetch(new Request(origin+'/api/admin/returns/physical?month=2026-10'),env,forbiddenServices)).status,401);
 assert.equal((await call('?month=2026-10')).status,200);assert.equal((await call('?month=2026-10&month=2026-10')).status,400);assert.equal((await call('?month=2026-10&extra=1')).status,400);assert.equal((await call('?month=2026-10',{method:'HEAD'})).status,405);assert.equal((await call('?month=2026-10',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'})).status,403);assert.equal((await call('?month=2026-10',{method:'POST',headers:{origin:'https://elsewhere.invalid','content-type':'application/json'},body:'{}'})).status,403);
 assert.equal(db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);assert.ok(db.sql.every(sql=>/^SELECT\b/.test(sql)));
 assert.ok(!SCHEMA.some(sql=>sql.includes('physical_returns_')),'the ordinary collector cold schema budget must remain unchanged');
});
